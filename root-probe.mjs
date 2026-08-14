#!/data/data/com.termux/files/usr/bin/env node
/**
 * root-probe.mjs — privileged device probe for ocd-control.
 *
 * Requires a ROOTED device (su / Magisk present). On a rooted phone this:
 *   1. Pulls IMEI / MEID / phone number / SIM serial via `service call iphonesubinfo`
 *      run as root (the privileged binder call Termux alone cannot make).
 *   2. (mode=adb) Enables adbd over TCP on 127.0.0.1:5555 and injects our existing
 *      ~/.android/adbkey.pub into /data/misc/adb/adb_keys so the connection is
 *      PRE-AUTHORIZED — this removes the need for the 6-digit Wireless-Debugging
 *      pairing code entirely.
 *
 * Usage:
 *   node root-probe.mjs            # imei + adb setup (best effort)
 *   node root-probe.mjs imei       # imei/meid/sim only
 *   node root-probe.mjs adb        # tcp adb + key injection only
 *   node root-probe.mjs check      # just report whether root is available
 *
 * Output: JSON to stdout. Non-digit chars are stripped for IMEI/MEID/SIM;
 * phone number keeps a leading '+'.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const exec = promisify(execFile);
const HOME = process.env.HOME || "/data/data/com.termux/files/home";
const ADB_PUB = path.join(HOME, ".android", "adbkey.pub");
const ADB_KEYS = "/data/misc/adb/adb_keys";
const TCP_PORT = 5555;

// ---- service-call hex-dump parser (matches ocd /debug/imei logic) ----
function parseServiceCall(out) {
  const lines = String(out).split("\n");
  let hex = "";
  for (const line of lines) {
    const m = line.match(/0x[0-9a-f]+\s+(.+)/);
    if (m) hex += m[1].replace(/\s+/g, "");
  }
  let str = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    const chunk = hex.substr(i, 4);
    const c1 = parseInt(chunk.substr(0, 2), 16);
    const c2 = parseInt(chunk.substr(2, 2), 16);
    if (c1) str += String.fromCharCode(c1);
    if (c2) str += String.fromCharCode(c2);
  }
  return str;
}
const digits = (s) => (s || "").replace(/[^\d]/g, "");
const phone = (s) => (s || "").replace(/[^\d+]/g, "");

// ---- run a command as root via su ----
async function suRun(cmd, args = []) {
  const full = [cmd, ...args].join(" ");
  try {
    const { stdout, stderr } = await exec("su", ["-c", full], { encoding: "utf8", timeout: 20000 });
    return { ok: true, code: 0, stdout: stdout || "", stderr: stderr || "" };
  } catch (e) {
    return { ok: false, code: e.code ?? -1, stdout: (e.stdout || "").toString(), stderr: (e.stderr || "").toString() };
  }
}

async function haveRoot() {
  const r = await suRun("id", ["-u"]);
  return r.ok && r.stdout.trim() === "0";
}

// iphonesubinfo transaction codes (best-effort across Android versions)
// 1=DeviceId(slot0/IMEI), 3=DeviceId(alt/MEID-ish), 9=MEID, 5=Line1Number, 7=SimSerial
const TX = { imei1: "1", imei2: "3", meid: "9", phone: "5", sim: "7" };

async function probeImei() {
  const out = { method: "service call iphonesubinfo (root)" };
  for (const [name, code] of Object.entries(TX)) {
    const r = await suRun("service", ["call", "iphonesubinfo", code]);
    if (r.ok && r.stdout) {
      const raw = parseServiceCall(r.stdout);
      out[name] = name === "phone" ? phone(raw) : digits(raw);
    } else {
      out[name] = null;
      out[name + "_error"] = (r.stderr || r.stdout || "").slice(0, 160);
    }
  }
  // Fallback: dumpsys iphonesubinfo (root-only DUMP perm)
  const d = await suRun("dumpsys", ["iphonesubinfo"]);
  out.dumpsys = d.ok ? d.stdout.slice(0, 1500) : (d.stderr || "").slice(0, 200);
  return out;
}

async function setupTcpAdb() {
  const res = { tcpPort: TCP_PORT };
  // inject our public key so the connection is pre-authorized (no 6-digit code)
  if (fs.existsSync(ADB_PUB)) {
    const inject = await suRun("sh", ["-c", `cat ${ADB_PUB} >> ${ADB_KEYS}`]);
    res.keyInjected = inject.ok;
    if (!inject.ok) res.keyError = inject.stderr.slice(0, 160);
  } else {
    res.keyInjected = false;
    res.keyError = "no ~/.android/adbkey.pub found";
  }
  // enable adbd over TCP and restart it
  const cfg = await suRun("sh", [
    "-c",
    `setprop service.adb.tcp.port ${TCP_PORT}; setprop persist.adb.tcp.port ${TCP_PORT}; stop adbd; start adbd`,
  ]);
  res.adbdRestarted = cfg.ok;
  if (!cfg.ok) res.adbdError = cfg.stderr.slice(0, 160);
  // give adbd a moment to come back up, then connect from localhost
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const { stdout } = await exec("adb", ["connect", `127.0.0.1:${TCP_PORT}`], { encoding: "utf8", timeout: 10000 });
    res.connect = stdout.trim();
  } catch (e) {
    res.connect = (e.stderr || e.message || "").toString().slice(0, 160);
  }
  try {
    const { stdout } = await exec("adb", ["devices", "-l"], { encoding: "utf8", timeout: 10000 });
    res.devices = stdout.trim();
  } catch (e) {
    res.devices = (e.stderr || e.message || "").toString().slice(0, 160);
  }
  return res;
}

async function main() {
  const mode = process.argv[2] || "all";
  const root = await haveRoot();
  if (mode === "check") {
    console.log(JSON.stringify({ rooted: root }, null, 2));
    process.exit(root ? 0 : 1);
  }
  if (!root) {
    console.log(JSON.stringify({
      rooted: false,
      error: "su/Magisk not available. Root the device first (unlock bootloader + flash Magisk), then re-run.",
    }, null, 2));
    process.exit(2);
  }
  const result = { rooted: true, ts: new Date().toISOString() };
  if (mode === "imei" || mode === "all") result.imei = await probeImei();
  if (mode === "adb" || mode === "all") result.adb = await setupTcpAdb();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: String(e && e.stack || e) }, null, 2));
  process.exit(3);
});
