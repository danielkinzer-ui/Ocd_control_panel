#!/usr/bin/env node
/**
 * OpenClaw Device (OCD) Control Daemon
 *
 * Runs in the REAL Termux shell on the Android phone (NOT inside proot).
 * Exposes a localhost HTTP API that wraps Android/Termux commands so the
 * OpenClaw agent (running in proot) can control the phone as an executive
 * assistant: apps, files, USB drive, screenshot, input, SMS, calls, notifications.
 *
 * No external dependencies. Uses only Node built-ins + Android/Termux CLI tools.
 *
 * Env:
 *   OCD_PORT    listen port (default 18790)
 *   OCD_TOKEN   required bearer token (default: random per-start, printed to stderr)
 *   OCD_ROOT    storage root override (default auto: /storage/emulated/0 | /sdcard)
 *   OCD_ADB     optional "host:port" for self-adb shell (wireless debugging) to
 *               enable input/screenshot when Termux lacks INJECT_EVENTS permission.
 */

import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.OCD_PORT || 18790);
const TOKEN = process.env.OCD_TOKEN || crypto.randomBytes(18).toString("base64url");
const ADB_TARGET = process.env.OCD_ADB || "";

function resolveRoot() {
  if (process.env.OCD_ROOT) return process.env.OCD_ROOT;
  for (const c of ["/storage/emulated/0", "/sdcard", "/mnt/sdcard"]) {
    if (fs.existsSync(c)) return c;
  }
  return process.env.HOME || "/data/data/com.termux/files/home";
}

const ROOT = resolveRoot();

/** Run a command, return {ok, code, stdout, stderr}. */
function run(cmd, args = [], { input, timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    if (input) child.stdin.write(input);
    child.stdin.end();
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout: out, stderr: err });
    });
    child.on("error", (e) => resolve({ ok: false, code: -1, stdout: out, stderr: String(e) }));
  });
}

/** Run an Android command either directly or via self-adb when configured. */
async function android(cmd, args, opts = {}) {
  if (ADB_TARGET) {
    const r = await run("adb", ["-s", ADB_TARGET, "shell", cmd, ...args], opts);
    return r;
  }
  return run(cmd, args, opts);
}

function safePath(p) {
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
  return path.resolve(abs);
}

function send(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const auth = req.headers["x-ocd-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (auth !== TOKEN) return send(res, 401, { ok: false, error: "unauthorized" });

  const method = req.method.toUpperCase();
  const pathname = url.pathname;

  const readBody = () =>
    new Promise((resolve) => {
      let b = "";
      req.on("data", (d) => (b += d));
      req.on("end", () => {
        try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); }
      });
    });

  try {
    // ---- health / meta ----
    if (pathname === "/health" && method === "GET") {
      return send(res, 200, { ok: true, root: ROOT, adb: ADB_TARGET || null, android: await getprop("ro.build.version.release") });
    }

    if (pathname === "/device" && method === "GET") {
      const info = {
        model: await getprop("ro.product.model"),
        brand: await getprop("ro.product.brand"),
        android: await getprop("ro.build.version.release"),
        sdk: await getprop("ro.build.version.sdk"),
        serial: await getprop("ro.serialno"),
        root: ROOT,
        adb: ADB_TARGET || null,
      };
      const pkgs = await android("pm", ["list", "packages"]);
      info.installedApps = pkgs.stdout.split("\n").filter(Boolean).length;
      return send(res, 200, { ok: true, device: info });
    }

    // ---- apps ----
    if (pathname === "/apps" && method === "GET") {
      const filter = url.searchParams.get("filter") || "";
      const args = filter ? ["list", "packages", filter] : ["list", "packages"];
      const r = await android("pm", args);
      const lines = r.stdout.split("\n").map((l) => l.replace(/^package:/, "").trim()).filter(Boolean);
      return send(res, 200, { ok: true, count: lines.length, packages: lines });
    }

    if (pathname === "/app/launch" && method === "POST") {
      const { pkg, activity } = await readBody();
      if (!pkg) return send(res, 400, { ok: false, error: "pkg required" });
      const args = activity
        ? ["start", "--user", "0", "-n", `${pkg}/${activity}`]
        : ["start", "--user", "0", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-p", pkg];
      const r = await android("am", args);
      return send(res, r.ok ? 200 : 500, { ok: r.ok, stdout: r.stdout, stderr: r.stderr });
    }

    if (pathname === "/app/stop" && method === "POST") {
      const { pkg } = await readBody();
      if (!pkg) return send(res, 400, { ok: false, error: "pkg required" });
      const r = await android("cmd", ["activity", "force-stop", pkg]);
      if (r.ok) return send(res, 200, { ok: true });
      const needsElevated = /FORCE_STOP_PACKAGES|SecurityException/i.test(r.stderr);
      return send(res, 500, {
        ok: false,
        stderr: r.stderr,
        hint: needsElevated
          ? "force-stop needs root or Wireless Debugging self-adb (set OCD_ADB=127.0.0.1:<port>)"
          : "force-stop failed",
      });
    }

    if (pathname === "/app/install" && method === "POST") {
      const { apk } = await readBody();
      if (!apk) return send(res, 400, { ok: false, error: "apk path required" });
      const r = await android("pm", ["install", "-r", safePath(apk)]);
      return send(res, r.ok ? 200 : 500, { ok: r.ok, stdout: r.stdout, stderr: r.stderr });
    }

    if (pathname === "/app/uninstall" && method === "POST") {
      const { pkg } = await readBody();
      if (!pkg) return send(res, 400, { ok: false, error: "pkg required" });
      const r = await android("pm", ["uninstall", pkg]);
      return send(res, r.ok ? 200 : 500, { ok: r.ok, stdout: r.stdout, stderr: r.stderr });
    }

    // ---- filesystem ----
    if (pathname === "/fs/list" && method === "GET") {
      const p = safePath(url.searchParams.get("path") || ".");
      const r = await run("ls", ["-la", p]);
      return send(res, r.ok ? 200 : 500, { ok: r.ok, path: p, listing: r.stdout, stderr: r.stderr });
    }

    if (pathname === "/fs/read" && method === "GET") {
      const p = safePath(url.searchParams.get("path"));
      const max = Number(url.searchParams.get("maxBytes") || 200000);
      if (!fs.existsSync(p)) return send(res, 404, { ok: false, error: "not found", path: p });
      const stat = fs.statSync(p);
      if (stat.isDirectory()) return send(res, 400, { ok: false, error: "is directory", path: p });
      const buf = fs.readFileSync(p);
      const isText = !buf.slice(0, 8000).includes(0);
      return send(res, 200, {
        ok: true,
        path: p,
        size: stat.size,
        truncated: buf.length > max,
        content: isText ? buf.slice(0, max).toString("utf8") : `<binary ${stat.size} bytes>`,
      });
    }

    if (pathname === "/fs/write" && method === "POST") {
      const { path: rel, content, mode } = await readBody();
      const p = safePath(rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (mode === "append") fs.appendFileSync(p, content || "");
      else fs.writeFileSync(p, content || "");
      return send(res, 200, { ok: true, path: p, size: fs.statSync(p).size });
    }

    if (pathname === "/fs/copy" && method === "POST") {
      const { src, dst } = await readBody();
      const s = safePath(src);
      const d = safePath(dst);
      if (!fs.existsSync(s)) return send(res, 404, { ok: false, error: "src not found" });
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      return send(res, 200, { ok: true, src: s, dst: d });
    }

    // ---- usb drive ----
    if (pathname === "/usb" && method === "GET") {
      const storage = fs.existsSync("/storage") ? fs.readdirSync("/storage") : [];
      const vols = (await run("sm", ["list-volumes"])).stdout;
      return send(res, 200, {
        ok: true,
        storageRoots: storage,
        volumes: vols.split("\n").filter(Boolean),
        mounts: (await run("mount")).stdout.split("\n").filter((l) => /\/storage\/|vold|usb/i.test(l)),
      });
    }

    // ---- screenshot ----
    if (pathname === "/screenshot" && method === "POST") {
      const { path: rel } = await readBody();
      const out = safePath(rel || `Pictures/ocd-shot-${Date.now()}.png`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      let r = await android("screencap", ["-p", out]);
      if (!r.ok || !fs.existsSync(out) || fs.statSync(out).size === 0) {
        // Fallback: use termux-camera-photo (Termux:API required)
        const tmp = safePath(`Pictures/ocd-tmp-${Date.now()}.jpg`);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        const cr = await run("termux-camera-photo", [tmp]);
        if (cr.ok && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
          try { fs.copyFileSync(tmp, out); fs.unlinkSync(tmp); } catch {}
          r = { ok: true, stdout: "termux-camera-photo fallback", stderr: "" };
        }
      }
      if (r.ok && fs.existsSync(out) && fs.statSync(out).size > 0) {
        return send(res, 200, { ok: true, path: out, size: fs.statSync(out).size });
      }
      return send(res, 500, {
        ok: false,
        error: "screenshot failed (no screencap or camera access)",
        detail: r.stderr || r.stdout,
        hint: "Enable Wireless Debugging (OCD_ADB=127.0.0.1:5555) or install Termux:API app",
      });
    }

    // ---- launcher homescreen query ----
    if (pathname === "/launcher" && method === "GET") {
      const homescreen = { apps: [], shortcut_count: 0, workspace: [] };
      // Try to read launcher database directly via sqlite3 (Termux)
      const launcherPaths = [
        "/data/data/com.android.launcher3/databases/launcher.db",
        "/data/data/com.motorola.launcher3/databases/launcher.db",
        "/data/data/com.google.android.apps.nexuslauncher/databases/launcher.db",
      ];
      for (const lp of launcherPaths) {
        if (fs.existsSync(lp)) {
          try {
            const rd = await run("sqlite3", ["-json", lp,
              "SELECT title, intent, container, screen, cellX, cellY FROM favorites WHERE container=-100 OR container=-101 OR container=0 LIMIT 50"]);
            if (rd.ok && rd.stdout.trim()) {
              try {
                const rows = JSON.parse(rd.stdout);
                homescreen.apps = rows.map(r => ({
                  title: r.title || "unknown",
                  intent: r.intent || "",
                  screen: r.screen || 0,
                  cellX: r.cellX || 0,
                  cellY: r.cellY || 0,
                }));
                homescreen.shortcut_count = homescreen.apps.length;
              } catch {}
            }
          } catch {}
          break;
        }
      }
      // Fallback: list launcher-related packages
      if (homescreen.apps.length === 0) {
        const pkgs = await android("pm", ["list", "packages", "-f",
          "com.android.launcher", "com.motorola.launcher",
          "com.google.android.apps.nexuslauncher", "com.launcher"]);
        homescreen.workspace = pkgs.stdout.split("\n").filter(Boolean);
        homescreen.hint = "Direct launcher DB read requires root; listed launcher packages above";
      }
      return send(res, 200, { ok: true, homescreen });
    }

    // ---- create homescreen shortcut ----
    if (pathname === "/shortcut" && method === "POST") {
      const { name, url, icon } = await readBody();
      if (!name || !url) return send(res, 400, { ok: false, error: "name and url required" });
      const intent = `android.intent.action.VIEW`;
      const data = url.startsWith("http") ? url : `http://${url}`;
      const shortcutIntent = `android.intent.shortcut.INTENT;#Intent;action=${intent};data=${data};end`;
      const broadcast = `android.intent.action.CREATE_SHORTCUT`;
      const r = await android("am", ["broadcast", "-a", broadcast,
        "--es", "android.intent.extra.shortcut.NAME", name,
        "--es", "android.intent.extra.shortcut.INTENT", shortcutIntent]);
      return send(res, r.ok ? 200 : 500, {
        ok: r.ok,
        name, url: data,
        detail: r.stdout || r.stderr,
        hint: r.ok ? "Shortcut created on homescreen" : "Shortcut creation failed (may need launcher permission)",
      });
    }

    // ---- input ----
    if (pathname.startsWith("/input/") && method === "POST") {
      const sub = pathname.slice("/input/".length);
      const body = await readBody();
      let args = [];
      if (sub === "tap") args = ["tap", String(body.x), String(body.y)];
      else if (sub === "swipe") args = ["swipe", String(body.x1), String(body.y1), String(body.x2), String(body.y2), String(body.duration || 300)];
      else if (sub === "text") args = ["text", String(body.text || "")];
      else if (sub === "key") args = ["keyevent", String(body.key)];
      else return send(res, 400, { ok: false, error: "unknown input: " + sub });
      const r = await android("input", args);
      return send(res, r.ok ? 200 : 500, {
        ok: r.ok,
        detail: r.stderr || r.stdout,
        hint: r.ok ? null : "input injection needs shell permission (wireless-debugging self-adb) or root",
      });
    }

    // ---- communications (Termux:API) ----
    if (pathname === "/sms" && method === "POST") {
      const { to, body } = await readBody();
      if (!to || !body) return send(res, 400, { ok: false, error: "to and body required" });
      const r = await run("termux-sms-send", ["-n", to], { input: body });
      return send(res, r.ok ? 200 : 500, {
        ok: r.ok,
        detail: r.stderr || r.stdout,
        hint: r.ok ? null : "install Termux:API app + `pkg install termux-api`",
      });
    }

    if (pathname === "/call" && method === "POST") {
      const { number } = await readBody();
      if (!number) return send(res, 400, { ok: false, error: "number required" });
      const r = await run("termux-telephony-call", [number]);
      return send(res, r.ok ? 200 : 500, {
        ok: r.ok,
        detail: r.stderr || r.stdout,
        hint: r.ok ? null : "install Termux:API app + `pkg install termux-api`",
      });
    }

    if (pathname === "/notifications" && method === "GET") {
      const r = await run("termux-notification-list");
      if (r.ok) {
        let parsed = [];
        try { parsed = JSON.parse(r.stdout); } catch {}
        return send(res, 200, { ok: true, notifications: parsed });
      }
      const dumped = await run("dumpsys", ["notification", "--noredact"]);
      return send(res, 200, {
        ok: true,
        source: "dumpsys (limited; install Termux:API for full list)",
        raw: dumped.stdout.split("\n").slice(0, 60).join("\n"),
      });
    }

    // ---- raw shell pass-through (am/pm/getprop/etc.) ----
    if (pathname === "/shell" && method === "POST") {
      const { cmd, args = [] } = await readBody();
      if (!cmd) return send(res, 400, { ok: false, error: "cmd required" });
      const r = await android(cmd, args);
      return send(res, 200, { ok: r.ok, code: r.code, stdout: r.stdout, stderr: r.stderr });
    }

    // ---- debug: full device dump ----
    if (pathname === "/debug/dump" && method === "GET") {
      const dump = {};
      // All getprops
      const allProps = await run("getprop");
      dump.getprop = allProps.stdout.split("\n").filter(Boolean).map(l => {
        const m = l.match(/^\[(.*?)\]\:\s*\[(.*?)\]\s*$/);
        return m ? { key: m[1], value: m[2] } : { raw: l };
      });
      // Build info
      dump.build = {
        fingerprint: await getprop("ro.build.fingerprint"),
        id: await getprop("ro.build.id"),
        version: await getprop("ro.build.version.release"),
        sdk: await getprop("ro.build.version.sdk"),
        date: await getprop("ro.build.date"),
        type: await getprop("ro.build.type"),
        tags: await getprop("ro.build.tags"),
        user: await getprop("ro.build.user"),
        host: await getprop("ro.build.host"),
      };
      // Hardware
      dump.hardware = {
        model: await getprop("ro.product.model"),
        brand: await getprop("ro.product.brand"),
        device: await getprop("ro.product.device"),
        name: await getprop("ro.product.name"),
        board: await getprop("ro.product.board"),
        cpu_abi: await getprop("ro.product.cpu.abi"),
        cpu_abi2: await getprop("ro.product.cpu.abi2"),
        hardware: await getprop("ro.hardware"),
        arch: await getprop("ro.arch"),
      };
      // Network / SIM
      dump.network = {
        operator_numeric: await getprop("gsm.operator.numeric"),
        operator_alpha: await getprop("gsm.operator.alpha"),
        sim_state: await getprop("gsm.sim.state"),
        sim_operator: await getprop("gsm.sim.operator.numeric"),
        imsi: await getprop("gsm.sim.imsi"),
      };
      // Radio / Baseband
      dump.radio = {
        baseband: await getprop("ro.baseband"),
        version: await getprop("gsm.version.baseband"),
        ril_version: await getprop("rild.libversion"),
      };
      // Security
      dump.security = {
        selinux: await getprop("ro.build.selinux"),
        verity: await getprop("ro.boot.verifiedbootstate"),
        debuggable: await getprop("ro.debuggable"),
        secure: await getprop("ro.secure"),
        adb_enabled: await getprop("persist.sys.usb.config"),
      };
      // Storage
      dump.storage = {
        internal: (await run("df", ["/data"])).stdout,
        external: (await run("df", ["/sdcard"])).stdout,
      };
      // Memory
      dump.memory = (await run("cat", ["/proc/meminfo"])).stdout;
      // CPU
      dump.cpu = (await run("cat", ["/proc/cpuinfo"])).stdout;
      // Partitions
      dump.partitions = (await run("cat", ["/proc/partitions"])).stdout;
      // Mounts
      dump.mounts = (await run("mount")).stdout;
      // Kernel
      dump.kernel = (await run("uname", ["-a"])).stdout;
      // Uptime
      dump.uptime = (await run("cat", ["/proc/uptime"])).stdout;
      return send(res, 200, { ok: true, dump });
    }

    // ---- debug: IMEI/MEID ----
    if (pathname === "/debug/imei" && method === "GET") {
      const imei = {};
      // Method 1: service call iphonesubinfo (requires privileged)
      const svc1 = await android("service", ["call", "iphonesubinfo", "1"]);
      const svc2 = await android("service", ["call", "iphonesubinfo", "3"]);
      const svc3 = await android("service", ["call", "iphonesubinfo", "9"]); // MEID
      // Parse service call output (hex dump)
      function parseServiceCall(out) {
        const lines = out.stdout.split("\n");
        let hex = "";
        for (const line of lines) {
          const m = line.match(/0x[0-9a-f]+\s+(.+)/);
          if (m) hex += m[1].replace(/\s+/g, "");
        }
        // Convert hex pairs to chars
        let str = "";
        for (let i = 0; i < hex.length; i += 4) {
          const chunk = hex.substr(i, 4);
          if (chunk.length === 4) {
            const c1 = parseInt(chunk.substr(0, 2), 16);
            const c2 = parseInt(chunk.substr(2, 2), 16);
            if (c1) str += String.fromCharCode(c1);
            if (c2) str += String.fromCharCode(c2);
          }
        }
        return str.replace(/[^\d]/g, "");
      }
      imei.service_call_1 = parseServiceCall(svc1);
      imei.service_call_3 = parseServiceCall(svc2);
      imei.meid_service_call_9 = parseServiceCall(svc3);
      // Method 2: getprop (often empty on modern Android)
      imei.getprop_imei = await getprop("ro.ril.imei");
      imei.getprop_meid = await getprop("ro.ril.meid");
      imei.gsm_imei = await getprop("persist.radio.imei");
      // Method 3: dumpsys iphonesubinfo
      const dumpsys = await run("dumpsys", ["iphonesubinfo"]);
      imei.dumpsys_raw = dumpsys.stdout.slice(0, 2000);
      return send(res, 200, { ok: true, imei });
    }

    // ---- debug: logcat (recent) ----
    if (pathname === "/debug/logcat" && method === "GET") {
      const lines = url.searchParams.get("lines") || "200";
      const filter = url.searchParams.get("filter") || "";
      const args = ["-d", "-t", lines];
      if (filter) args.push("-s", filter);
      const r = await android("logcat", args);
      return send(res, 200, { ok: r.ok, logcat: r.stdout, stderr: r.stderr });
    }

    // ---- debug: running processes ----
    if (pathname === "/debug/processes" && method === "GET") {
      const r = await run("ps", ["-A"]);
      return send(res, 200, { ok: r.ok, processes: r.stdout });
    }

    // ---- debug: open files / lsof ----
    if (pathname === "/debug/lsof" && method === "GET") {
      const r = await run("lsof");
      return send(res, 200, { ok: r.ok, lsof: r.stdout });
    }

    // ---- debug: network connections ----
    if (pathname === "/debug/netstat" && method === "GET") {
      const r = await run("netstat", ["-tunap"]);
      return send(res, 200, { ok: r.ok, netstat: r.stdout });
    }

    return send(res, 404, { ok: false, error: "no route: " + method + " " + pathname });
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e && e.stack || e) });
  }
}

async function getprop(key) {
  const r = await run("getprop", [key]);
  return r.stdout.trim();
}

const server = http.createServer((req, res) => handle(req, res).catch((e) => send(res, 500, { ok: false, error: String(e) })));
server.listen(PORT, "127.0.0.1", () => {
  process.stderr.write(`\n[OCD] control daemon listening on 127.0.0.1:${PORT}\n`);
  process.stderr.write(`[OCD] token: ${TOKEN}\n`);
  process.stderr.write(`[OCD] storage root: ${ROOT}\n`);
  process.stderr.write(`[OCD] self-adb: ${ADB_TARGET || "(none - set OCD_ADB for input/screenshot)"}\n\n`);
});
