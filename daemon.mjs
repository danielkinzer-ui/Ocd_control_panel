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
 *   OCD_HOST    listen interface (default 127.0.0.1; use 0.0.0.0 behind a tunnel)
 *   OCD_CORS_ORIGIN  allowed browser origin for the web panel (default "*").
 *               Set to your GitHub Pages URL, e.g. https://user.github.io
 *   OCD_TOKEN_QUERY  if "1", also accept the token via ?token=... (needed for
 *               <img>/<video> tags that cannot send an X-OCD-Token header).
 */

import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.OCD_PORT || 18790);
const TOKEN = process.env.OCD_TOKEN || crypto.randomBytes(18).toString("base64url");
const ADB_TARGET = process.env.OCD_ADB || "";
const HOST = process.env.OCD_HOST || "127.0.0.1";
const ALLOW_SHELL = process.env.OCD_ALLOW_SHELL !== "0";
const SHELL_ALLOWLIST = (process.env.OCD_SHELL_ALLOWLIST || "pm,am,getprop,dumpsys,ls,cat,ps,netstat,lsof,logcat,service,sqlite3,run-as,df,mount,uname,sm,screencap,input,cmd").split(",").map(s=>s.trim()).filter(Boolean);
const MAX_BODY_BYTES = 1048576;
const MAX_RUN_BUFFER = 5242880;
const CORS_ORIGIN = process.env.OCD_CORS_ORIGIN || "*";
const ALLOW_TOKEN_QUERY = process.env.OCD_TOKEN_QUERY === "1";

function corsHeaders() {
  return {
    "access-control-allow-origin": CORS_ORIGIN,
    "access-control-allow-headers": "X-OCD-Token, Authorization, Content-Type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-expose-headers": "X-OCD-Token",
  };
}

// Root (su/Magisk) capability, detected lazily once and cached.
let ROOT_AVAILABLE = false;
let _rootCheck = null;
function hasRoot() {
  if (_rootCheck) return _rootCheck;
  _rootCheck = run("su", ["-c", "id -u"]).then((r) => {
    ROOT_AVAILABLE = r.ok && r.stdout.trim() === "0";
    return ROOT_AVAILABLE;
  });
  return _rootCheck;
}

function resolveRoot() {
  if (process.env.OCD_ROOT) return process.env.OCD_ROOT;
  for (const c of ["/storage/emulated/0", "/sdcard", "/mnt/sdcard"]) {
    if (fs.existsSync(c)) return c;
  }
  return process.env.HOME || "/data/data/com.termux/files/home";
}

const ROOT = resolveRoot();
const ALLOWED_FS_ROOTS = [ROOT, "/data/data", "/storage", "/sdcard"].map(pp=>path.resolve(pp));

/** Run a command, return {ok, code, stdout, stderr}. */
function run(cmd, args = [], { input, timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    let truncated = false;
    const append = (target, chunk) => {
      const s = chunk.toString();
      if ((out.length + err.length + s.length) > MAX_RUN_BUFFER) {
        truncated = true;
        const remaining = MAX_RUN_BUFFER - (out.length + err.length);
        return s.slice(0, Math.max(0, remaining));
      }
      return s;
    };
    if (input) { try { child.stdin.write(input); } catch {} }
    try { child.stdin.end(); } catch {}
    child.stdin?.on("error", () => {});
    child.stdout.on("data", (d) => { out += append(out, d); });
    child.stderr.on("data", (d) => { err += append(err, d); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    let settled = false;
    const done = (val) => { if (!settled) { settled=true; clearTimeout(timer); resolve(val); }};
    child.on("close", (code) => done({ ok: code === 0, code, stdout: out, stderr: err + (truncated ? "\n[truncated]" : "") }));
    child.on("error", (e) => done({ ok: false, code: -1, stdout: out, stderr: String(e) }));
  });
}

function shellEscape(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
/** Run an Android command: self-adb (if OCD_ADB) → root su (if available) → direct shell. */
async function android(cmd, args, opts = {}) {
  if (ADB_TARGET) {
    return run("adb", ["-s", ADB_TARGET, "shell", cmd, ...args], opts);
  }
  if (await hasRoot()) {
    const escaped = [cmd, ...args].map(shellEscape).join(" ");
    return run("su", ["-c", escaped], opts);
  }
  return run(cmd, args, opts);
}
function safePath(p) {
  if (!p) return null;
  const resolved = path.resolve(path.isAbsolute(p) ? p : path.join(ROOT, p));
  const ok = ALLOWED_FS_ROOTS.some(root => resolved === root || resolved.startsWith(root + path.sep));
  if (!ok) return null;
  return resolved;
}
function isValidPkg(s) { return /^[a-zA-Z0-9._]+$/.test(s); }
function timingSafeEqual(a,b){ const ba=Buffer.from(String(a)); const bb=Buffer.from(String(b)); if(ba.length!==bb.length) return false; return crypto.timingSafeEqual(ba,bb); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Locate a UI element by its visible text (or content-desc) using uiautomator,
 * then press it with `input tap`. Repeats N times (e.g. Build number x7).
 * This is how the web UI drives Settings without a physical finger.
 */
async function uiTap(target, { repeat = 1, delay = 250, contains = false, desc = false } = {}) {
  const dump = safePath("Pictures/ocd-ui.xml");
  fs.mkdirSync(path.dirname(dump), { recursive: true });
  const d = await android("uiautomator", ["dump", dump]);
  if (!d.ok) return { ok: false, error: "uiautomator dump failed", detail: d.stderr || d.stdout };
  const r = await android("cat", [dump]);
  const xml = r.stdout;
  if (!xml) return { ok: false, error: "could not read UI dump" };

  const nodes = xml.split("<node").slice(1);
  let hit = null;
  for (const n of nodes) {
    const b = n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    const t = (n.match(/text="([^"]*)"/) || [])[1] || "";
    const c = (n.match(/content-desc="([^"]*)"/) || [])[1] || "";
    if (!b) continue;
    const label = desc ? c : t;
    if (!label) continue;
    const match = contains ? label.includes(target) : label === target;
    if (match) { hit = b; break; }
  }
  if (!hit) return { ok: false, error: `element not found on screen: ${target}`, hint: "open the right Settings screen first, or scroll it into view" };

  const x = Math.round((Number(hit[1]) + Number(hit[3])) / 2);
  const y = Math.round((Number(hit[2]) + Number(hit[4])) / 2);
  const taps = [];
  for (let i = 0; i < repeat; i++) {
    const t = await android("input", ["tap", String(x), String(y)]);
    taps.push(t.ok);
    if (i < repeat - 1) await sleep(delay);
  }
  return { ok: true, element: target, at: { x, y }, taps: taps.length, allOk: taps.every(Boolean) };
}

function send(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  res.end(body);
}

async function handle(req, res) {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`); } catch { return send(res, 400, { ok:false, error:"bad request url"}); }
  const method = req.method.toUpperCase();
  const pathname = url.pathname;

  // CORS preflight — no auth required.
  if (method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  const rawAuth = req.headers["x-ocd-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const auth = ALLOW_TOKEN_QUERY ? (rawAuth || url.searchParams.get("token") || "") : rawAuth;
  if (!timingSafeEqual(auth, TOKEN)) return send(res, 401, { ok: false, error: "unauthorized" });

  const readBody = () =>
    new Promise((resolve, reject) => {
      let b = "";
      let size = 0;
      let rejected = false;
      req.on("data", (d) => {
        size += d.length;
        if (size > MAX_BODY_BYTES) {
          if (!rejected) { rejected=true; res.writeHead(413, {"content-type":"application/json"}); res.end(JSON.stringify({ok:false,error:"payload too large"})); req.destroy(); reject(new Error("payload too large")); }
          return;
        }
        b += d;
      });
      req.on("end", () => { if (rejected) return; try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
      req.on("error", (e)=>{ if(!rejected) reject(e); });
    });

  try {
    // ---- health / meta ----
    if (pathname === "/health" && method === "GET") {
      return send(res, 200, { ok: true, root: ROOT, adb: ADB_TARGET || null, rootAccess: ROOT_AVAILABLE, android: await getprop("ro.build.version.release") });
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
        rootAccess: ROOT_AVAILABLE,
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
          ? "force-stop needs root, or Wireless Debugging self-adb (set OCD_ADB=127.0.0.1:<port>)"
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
      const { path: rel, b64 } = await readBody();
      const wantB64 = b64 || url.searchParams.get("b64") === "1";
      const out = safePath(rel || `Pictures/ocd-shot-${Date.now()}.png`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      let r = await android("/system/bin/screencap", ["-p", out]);
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
        const size = fs.statSync(out).size;
        // Base64 inlined so the browser can render it without a second
        // authenticated request (cross-origin / GitHub Pages safe).
        const imageBase64 = wantB64 ? fs.readFileSync(out).toString("base64") : undefined;
        return send(res, 200, { ok: true, path: out, size, imageBase64 });
      }
      return send(res, 500, {
        ok: false,
        error: "screenshot failed (no screencap or camera access)",
        detail: r.stderr || r.stdout,
        hint: "Enable Wireless Debugging (OCD_ADB=127.0.0.1:5555) or root the device",
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

    // ---- UI automation: tap a screen element by its visible text ----
    // Drives the real Settings app the same way a finger would (uiautomator
    // locates the element, input tap presses it), repeatable (e.g. Build number x7).
    if (pathname === "/ui/tap" && method === "POST") {
      const { text, repeat = 1, delay = 250, contains = false, desc = false } = await readBody();
      if (!text) return send(res, 400, { ok: false, error: "text required" });
      const out = await uiTap(text, { repeat: Number(repeat) || 1, delay: Number(delay) || 250, contains, desc });
      return send(res, out.ok ? 200 : 500, out);
    }

    if (pathname === "/ui/open" && method === "POST") {
      const { screen } = await readBody();
      const map = {
        about: "android.settings.DEVICE_INFO_SETTINGS",
        developer: "android.settings.APPLICATION_DEVELOPMENT_SETTINGS",
        wifi: "android.settings.WIFI_SETTINGS",
        display: "android.settings.DISPLAY_SETTINGS",
        bluetooth: "android.settings.BLUETOOTH_SETTINGS",
      };
      const act = map[screen] || screen;
      const r = await android("am", ["start", "-a", act]);
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stderr || r.stdout });
    }

    // ---- Device Setup shortcuts (real provisioning, no physical phone) ----
    if (pathname === "/setup/developer" && method === "POST") {
      await android("am", ["start", "-a", "android.settings.DEVICE_INFO_SETTINGS"]);
      await sleep(600);
      // Equivalent to tapping "Build number" 7 times.
      const out = await uiTap("Build number", { repeat: 7, delay: 250, contains: true });
      // Belt-and-suspenders: the documented setting also enables dev options.
      await android("settings", ["put", "global", "development_settings_enabled", "1"]).catch(() => {});
      return send(res, 200, { ok: true, tapped: out, devOptionsEnabled: true });
    }

    if (pathname === "/setup/adb-usb" && method === "POST") {
      const r = await android("settings", ["put", "global", "adb_enabled", "1"]);
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stderr || r.stdout, hint: r.ok ? null : "root/adb required" });
    }

    if (pathname === "/setup/wireless-debug" && method === "POST") {
      // Enable ADB over Wi-Fi on the emulator and report the address to pair with.
      const r1 = await android("settings", ["put", "global", "adb_wifi_enabled", "1"]).catch(() => ({ ok: false, stderr: "" }));
      const r2 = await android("tcpip", ["5555"]).catch(() => ({ ok: false, stderr: "" }));
      const ip = (await android("ip", ["addr", "show", "wlan0"]).catch(() => ({ stdout: "" }))).stdout;
      return send(res, 200, {
        ok: true,
        adbWifiEnabled: r1.ok,
        tcpip: r2.ok,
        ipRaw: ip.split("\n").filter(Boolean).slice(0, 3),
        hint: "On the phone: Settings > Developer options > Wireless debugging > pair; use the IP above with port 5555",
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
      if (!ALLOW_SHELL) return send(res, 403, { ok: false, error: "shell disabled (OCD_ALLOW_SHELL=0)" });
      const { cmd, args = [] } = await readBody();
      if (!cmd) return send(res, 400, { ok: false, error: "cmd required" });
      const cmdBase = cmd.split("/").pop().split("\\").pop();
      if (!SHELL_ALLOWLIST.includes(cmdBase)) return send(res, 403, { ok: false, error: "cmd not allowed: "+cmd, allowed: SHELL_ALLOWLIST });
      if (!Array.isArray(args) || args.some(a=>typeof a!=="string")) return send(res,400,{ok:false,error:"args must be string array"});
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

    // ======== NEW CAPABILITIES ========

    // ---- location ----
    if (pathname === "/location" && method === "GET") {
      const location = {};
      // Try Termux:API first
      const gps = await run("termux-location", ["-p", "gps", "-r", "once"]);
      if (gps.ok) {
        try { location.gps = JSON.parse(gps.stdout); } catch {}
      }
      const network = await run("termux-location", ["-p", "network", "-r", "once"]);
      if (network.ok) {
        try { location.network = JSON.parse(network.stdout); } catch {}
      }
      // Fallback: dumpsys location
      if (!location.gps && !location.network) {
        const dump = await run("dumpsys", ["location"]);
        location.raw = dump.stdout.slice(0, 3000);
        location.hint = "Install Termux:API for structured location data";
      }
      return send(res, 200, { ok: true, location });
    }

    // ---- battery ----
    if (pathname === "/battery" && method === "GET") {
      const battery = {};
      // Termux:API
      const termuxBat = await run("termux-battery-status");
      if (termuxBat.ok) {
        try { battery.termux = JSON.parse(termuxBat.stdout); } catch {}
      }
      // Fallback: dumpsys battery
      const dump = await run("dumpsys", ["battery"]);
      const lines = dump.stdout.split("\n").filter(Boolean);
      battery.properties = {};
      for (const line of lines) {
        const m = line.match(/\s*(.*?):\s*(.*)/);
        if (m) battery.properties[m[1].trim()] = m[2].trim();
      }
      // /proc battery
      const procBat = await run("cat", ["/sys/class/power_supply/battery/capacity"]);
      if (procBat.ok) battery.capacity_percent = procBat.stdout.trim();
      const status = await run("cat", ["/sys/class/power_supply/battery/status"]);
      if (status.ok) battery.status = status.stdout.trim();
      return send(res, 200, { ok: true, battery });
    }

    // ---- network status ----
    if (pathname === "/network" && method === "GET") {
      const network = {};
      // WiFi state
      const wifi = await run("dumpsys", ["wifi"]);
      const wifiLines = wifi.stdout.split("\n");
      network.wifiEnabled = wifiLines.some(l => /Wi-Fi is (enabled|disabled)/i.test(l));
      const wifiMatch = wifiLines.find(l => /Wi-Fi is (enabled|disabled)/i.test(l));
      if (wifiMatch) network.wifiStatus = wifiMatch.trim();
      // SSID
      const ssidMatch = wifiLines.find(l => /SSID:/i.test(l));
      if (ssidMatch) network.ssid = ssidMatch.split(":")[1]?.trim();
      // IP
      const ip = await run("ip", ["addr", "show", "wlan0"]);
      const ipMatch = ip.stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) network.ipAddress = ipMatch[1];
      // Mobile data
      const mobile = await run("dumpsys", ["telephony.registry"]);
      const mobileLines = mobile.stdout.split("\n");
      network.mobileData = mobileLines.some(l => /mDataConnectionState.*CONNECTED/i.test(l));
      // Airplane mode
      const airplane = await run("settings", ["get", "global", "airplane_mode_on"]);
      network.airplaneMode = airplane.stdout.trim() === "1";
      return send(res, 200, { ok: true, network });
    }

    // ---- wifi control ----
    if (pathname === "/wifi" && method === "POST") {
      const { action, ssid, password } = await readBody();
      let r;
      if (action === "enable") {
        r = await run("svc", ["wifi", "enable"]);
      } else if (action === "disable") {
        r = await run("svc", ["wifi", "disable"]);
      } else if (action === "scan") {
        r = await run("cmd", ["wifi", "list-scan-results"]);
      } else if (action === "connect" && ssid) {
        // Create WPA config and connect
        const wpaConf = `ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=US
network={
    ssid="${ssid}"
    psk="${password || ""}"
    key_mgmt=WPA-PSK
}`;
        await run("sh", ["-c", `echo '${wpaConf}' > /tmp/wpa.conf && wpa_supplicant -i wlan0 -c /tmp/wpa.conf -B && dhcpcd wlan0`]);
        r = { ok: true, stdout: "Connecting to " + ssid };
      } else if (action === "disconnect") {
        r = await run("cmd", ["wifi", "disconnect"]);
      } else {
        return send(res, 400, { ok: false, error: "action required: enable/disable/scan/connect/disconnect" });
      }
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stdout || r.stderr });
    }

    // ---- bluetooth control ----
    if (pathname === "/bluetooth" && method === "POST") {
      const { action, device, name } = await readBody();
      let r;
      if (action === "enable") {
        r = await run("svc", ["bluetooth", "enable"]);
      } else if (action === "disable") {
        r = await run("svc", ["bluetooth", "disable"]);
      } else if (action === "scan") {
        r = await run("cmd", ["bluetooth_manager", "discover"]);
      } else if (action === "pair" && device) {
        r = await run("cmd", ["bluetooth_manager", "pair", device]);
      } else if (action === "connect" && device) {
        r = await run("cmd", ["bluetooth_manager", "connect", device]);
      } else if (action === "disconnect") {
        r = await run("cmd", ["bluetooth_manager", "disconnect"]);
      } else if (action === "status") {
        const bt = await run("dumpsys", ["bluetooth_manager"]);
        const lines = bt.stdout.split("\n").slice(0, 30);
        return send(res, 200, { ok: true, bluetooth: lines.join("\n") });
      } else {
        return send(res, 400, { ok: false, error: "action required: enable/disable/scan/pair/connect/disconnect/status" });
      }
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stdout || r.stderr });
    }

    // ---- clipboard ----
    if (pathname === "/clipboard" && method === "GET") {
      const r = await run("termux-clipboard-get");
      if (r.ok) return send(res, 200, { ok: true, clipboard: r.stdout });
      // Fallback
      const dump = await run("service", ["call", "clipboard", "1"]);
      return send(res, 200, { ok: true, raw: dump.stdout, hint: "Install Termux:API for clipboard access" });
    }
    if (pathname === "/clipboard" && method === "POST") {
      const { text } = await readBody();
      if (text === undefined) return send(res, 400, { ok: false, error: "text required" });
      const r = await run("termux-clipboard-set", [text]);
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stdout || r.stderr });
    }

    // ---- volume/sound control ----
    if (pathname === "/volume" && method === "GET") {
      const vol = {};
      const dump = await run("dumpsys", ["audio"]);
      const lines = dump.stdout.split("\n");
      vol.streams = {};
      for (const line of lines) {
        const m = line.match(/STREAM_(\w+):\s*Mute count=(\d+)\s+max=(\d+)\s+headroom=(\d+)\s+last=(\d+)/);
        if (m) vol.streams[m[1]] = { muteCount: +m[2], max: +m[3], headroom: +m[4], last: +m[5] };
      }
      // Current volume via settings
      for (const stream of ["music", "ring", "alarm", "notification", "voice_call", "system"]) {
        const v = await run("settings", ["get", "system", `volume_${stream}`]);
        if (v.ok && v.stdout.trim() !== "null") vol[`current_${stream}`] = v.stdout.trim();
      }
      return send(res, 200, { ok: true, volume: vol });
    }
    if (pathname === "/volume" && method === "POST") {
      const { stream, level, action } = await readBody();
      const s = stream || "music";
      let r;
      if (action === "up") {
        r = await run("media", ["volume", "--stream", s, "--adj", "raise"]);
      } else if (action === "down") {
        r = await run("media", ["volume", "--stream", s, "--adj", "lower"]);
      } else if (action === "mute") {
        r = await run("media", ["volume", "--stream", s, "--adj", "mute"]);
      } else if (level !== undefined) {
        r = await run("media", ["volume", "--stream", s, "--set", String(level)]);
      } else {
        return send(res, 400, { ok: false, error: "action (up/down/mute) or level required" });
      }
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stdout || r.stderr });
    }

    // ---- screen brightness ----
    if (pathname === "/brightness" && method === "GET") {
      const current = await run("settings", ["get", "system", "screen_brightness"]);
      const mode = await run("settings", ["get", "system", "screen_brightness_mode"]);
      return send(res, 200, {
        ok: true,
        brightness: current.stdout.trim(),
        autoMode: mode.stdout.trim() === "1",
      });
    }
    if (pathname === "/brightness" && method === "POST") {
      const { level, auto } = await readBody();
      if (level !== undefined) {
        await run("settings", ["put", "system", "screen_brightness", String(Math.min(255, Math.max(0, level)))]);
      }
      if (auto !== undefined) {
        await run("settings", ["put", "system", "screen_brightness_mode", auto ? "1" : "0"]);
      }
      return send(res, 200, { ok: true });
    }

    // ---- airplane mode ----
    if (pathname === "/airplane" && method === "POST") {
      const { enabled } = await readBody();
      const val = enabled ? "1" : "0";
      await run("settings", ["put", "global", "airplane_mode_on", val]);
      await run("am", ["broadcast", "-a", "android.intent.action.AIRPLANE_MODE", "--ez", "state", val]);
      return send(res, 200, { ok: true, airplaneMode: enabled });
    }

    // ---- GPS/Location toggle ----
    if (pathname === "/gps" && method === "POST") {
      const { enabled } = await readBody();
      const val = enabled ? "3" : "0"; // 3=high accuracy, 0=off
      await run("settings", ["put", "secure", "location_mode", val]);
      return send(res, 200, { ok: true, gps: enabled });
    }

    // ---- contacts ----
    if (pathname === "/contacts" && method === "GET") {
      const limit = url.searchParams.get("limit") || "50";
      const r = await run("termux-contact-list");
      if (r.ok) {
        let contacts = [];
        try { contacts = JSON.parse(r.stdout); } catch {}
        return send(res, 200, { ok: true, count: contacts.length, contacts: contacts.slice(0, +limit) });
      }
      // Fallback: content provider query
      const dump = await run("content", ["query", "--uri", "content://com.android.contacts/contacts", "--projection", "display_name", "--sort", "display_name", "--limit", limit]);
      return send(res, 200, { ok: true, raw: dump.stdout.slice(0, 5000), hint: "Install Termux:API for structured contacts" });
    }

    // ---- calendar ----
    if (pathname === "/calendar" && method === "GET") {
      const limit = url.searchParams.get("limit") || "20";
      const r = await run("content", ["query", "--uri", "content://com.android.calendar/events", "--projection", "title,dtstart,dtend,eventLocation,description", "--sort", "dtstart DESC", "--limit", limit]);
      return send(res, 200, { ok: true, events: r.stdout.slice(0, 10000) });
    }

    // ---- alarms ----
    if (pathname === "/alarms" && method === "GET") {
      const r = await run("dumpsys", ["alarm"]);
      const lines = r.stdout.split("\n");
      const alarms = lines.filter(l => /alarm|pending/i.test(l)).slice(0, 50);
      return send(res, 200, { ok: true, alarms: alarms.join("\n") });
    }
    if (pathname === "/alarm" && method === "POST") {
      const { hour, minute, message, vibrate } = await readBody();
      if (hour === undefined || minute === undefined) return send(res, 400, { ok: false, error: "hour and minute required" });
      // Use termux-api or am broadcast
      const intent = `am start -a android.intent.action.SET_ALARM --ei android.intent.extra.alarm.HOUR ${hour} --ei android.intent.extra.alarm.MINUTES ${minute} --es android.intent.extra.alarm.MESSAGE "${message || "OCD Alarm"}" --ez android.intent.extra.alarm.SKIP_UI true`;
      const r = await run("sh", ["-c", intent]);
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stdout || r.stderr });
    }

    // ---- media playback ----
    if (pathname === "/media" && method === "POST") {
      const { action, url: mediaUrl } = await readBody();
      let r;
      if (action === "play" && mediaUrl) {
        r = await run("am", ["start", "-a", "android.intent.action.VIEW", "-d", mediaUrl]);
      } else if (action === "pause") {
        r = await run("input", ["keyevent", "85"]); // KEYCODE_MEDIA_PLAY_PAUSE
      } else if (action === "next") {
        r = await run("input", ["keyevent", "87"]); // KEYCODE_MEDIA_NEXT
      } else if (action === "previous") {
        r = await run("input", ["keyevent", "88"]); // KEYCODE_MEDIA_PREVIOUS
      } else if (action === "stop") {
        r = await run("input", ["keyevent", "86"]); // KEYCODE_MEDIA_STOP
      } else {
        return send(res, 400, { ok: false, error: "action required: play/pause/next/previous/stop" });
      }
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stdout || r.stderr });
    }

    // ---- camera ----
    if (pathname === "/camera" && method === "POST") {
      const { action, camera_id, flash, b64 } = await readBody();
      let r;
      if (action === "photo") {
        const out = safePath(`Pictures/ocd-camera-${Date.now()}.jpg`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        r = await run("termux-camera-photo", ["-c", String(camera_id || "0"), out]);
        if (r.ok && fs.existsSync(out) && fs.statSync(out).size > 0) {
          const size = fs.statSync(out).size;
          const imageBase64 = b64 ? fs.readFileSync(out).toString("base64") : undefined;
          return send(res, 200, { ok: true, path: out, size, imageBase64 });
        }
      } else if (action === "info") {
        r = await run("dumpsys", ["camera"]);
        return send(res, 200, { ok: true, cameras: r.stdout.slice(0, 5000) });
      } else {
        return send(res, 400, { ok: false, error: "action required: photo/info" });
      }
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stdout || r.stderr, hint: "Install Termux:API for camera access" });
    }

    // ---- screen recording ----
    if (pathname === "/screenrecord" && method === "POST") {
      const { action, duration, path: recPath } = await readBody();
      const out = recPath || safePath(`Movies/ocd-record-${Date.now()}.mp4`);
      if (action === "start") {
        const dur = Math.min(duration || 30, 180); // Max 3 minutes
        const r = await run("screenrecord", ["--time-limit", String(dur), out], { timeout: (dur + 5) * 1000 });
        return send(res, r.ok ? 200 : 500, { ok: r.ok, path: out, detail: r.stdout || r.stderr });
      } else if (action === "stop") {
        await run("pkill", ["-f", "screenrecord"]);
        return send(res, 200, { ok: true });
      }
      return send(res, 400, { ok: false, error: "action required: start/stop" });
    }

    // ---- microphone (push-to-talk clips via Termux:API) ----
    if (pathname === "/mic" && method === "POST") {
      const { action, seconds, encoder, b64 } = await readBody();
      if (action === "record") {
        const sec = Math.min(Math.max(Number(seconds) || 10, 1), 120); // 1s..2min
        const enc = ["aac", "amr_wb", "amr_nb", "opus"].includes(encoder) ? encoder : "aac";
        const out = safePath(`Music/ocd-mic-${Date.now()}.m4a`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const r = await run("termux-microphone-record", ["-f", out, "-l", String(sec), "-e", enc], { timeout: (sec + 15) * 1000 });
        if (r.ok && fs.existsSync(out) && fs.statSync(out).size > 0) {
          const size = fs.statSync(out).size;
          const audioBase64 = (b64 === undefined || b64) ? fs.readFileSync(out).toString("base64") : undefined;
          return send(res, 200, { ok: true, path: out, size, seconds: sec, encoder: enc, audioBase64 });
        }
        return send(res, 500, { ok: false, error: "mic record failed", detail: r.stdout || r.stderr, hint: "Install Termux:API + grant Microphone permission" });
      } else if (action === "stop") {
        const r = await run("termux-microphone-record", ["-q"]);
        return send(res, 200, { ok: r.ok });
      }
      return send(res, 400, { ok: false, error: "action required: record/stop" });
    }

    // ---- notifications (send) ----
    if (pathname === "/notification" && method === "POST") {
      const { title, content, id, priority, sound, vibrate } = await readBody();
      if (!title || !content) return send(res, 400, { ok: false, error: "title and content required" });
      const args = ["notification", "-t", title, "-c", content];
      if (id) args.push("-i", String(id));
      if (priority) args.push("--priority", priority);
      if (sound) args.push("--sound");
      if (vibrate) args.push("--vibrate", String(vibrate));
      const r = await run("termux-notification", args);
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stdout || r.stderr });
    }

    // ---- ring/vibrate ----
    if (pathname === "/ring" && method === "POST") {
      const { duration, volume } = await readBody();
      // Play ringtone
      const r = await run("termux-notification", ["-t", "PHONE LOCATOR", "-c", "📱 Your phone is ringing!", "--sound", "--vibrate", "2000"]);
      return send(res, 200, { ok: true, ringing: true });
    }

    // ---- power menu ----
    if (pathname === "/power" && method === "POST") {
      const { action } = await readBody();
      let r;
      if (action === "reboot") {
        r = await run("su", ["-c", "reboot"]);
      } else if (action === "shutdown") {
        r = await run("su", ["-c", "shutdown -h now"]);
      } else if (action === "screenoff") {
        r = await run("input", ["keyevent", "26"]); // POWER button
      } else if (action === "screenon") {
        r = await run("input", ["keyevent", "224"]); // WAKEUP
      } else {
        return send(res, 400, { ok: false, error: "action required: reboot/shutdown/screenoff/screenon" });
      }
      return send(res, r.ok ? 200 : 500, { ok: r.ok, detail: r.stdout || r.stderr });
    }

    // ---- system info (combined) ----
    if (pathname === "/systeminfo" && method === "GET") {
      const info = {};
      // Device
      info.model = await getprop("ro.product.model");
      info.brand = await getprop("ro.product.brand");
      info.android = await getprop("ro.build.version.release");
      info.sdk = await getprop("ro.build.version.sdk");
      // Battery
      const bat = await run("cat", ["/sys/class/power_supply/battery/capacity"]);
      info.battery = bat.ok ? bat.stdout.trim() + "%" : "unknown";
      // Storage
      const df = await run("df", ["/data"]);
      const dfLine = df.stdout.split("\n")[1];
      if (dfLine) {
        const parts = dfLine.split(/\s+/);
        info.storage = { total: parts[1], used: parts[2], available: parts[3], percent: parts[4] };
      }
      // Memory
      const mem = await run("cat", ["/proc/meminfo"]);
      const memTotal = mem.stdout.match(/MemTotal:\s+(\d+)/);
      const memAvail = mem.stdout.match(/MemAvailable:\s+(\d+)/);
      if (memTotal) info.memory = { total: Math.round(+memTotal[1] / 1024) + "MB" };
      if (memAvail) info.memory.available = Math.round(+memAvail[1] / 1024) + "MB";
      // Uptime
      const uptime = await run("cat", ["/proc/uptime"]);
      if (uptime.ok) info.uptime = uptime.stdout.split(" ")[0] + " seconds";
      // IP
      const ip = await run("ip", ["addr", "show", "wlan0"]);
      const ipMatch = ip.stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) info.ipAddress = ipMatch[1];
      return send(res, 200, { ok: true, info });
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

const server = http.createServer((req, res) => handle(req, res).catch((e) => { try{ send(res, 500, { ok: false, error: String(e) }); }catch{} }));
server.on("error", (e)=>{ if(e.code==="EADDRINUSE"){ process.stderr.write(`[OCD] port ${PORT} in use — daemon already running?\n`); process.exit(1);} process.stderr.write(`[OCD] server error: ${e.message}\n`); process.exit(1); });
process.on("uncaughtException", (e)=>{ process.stderr.write(`[OCD] uncaught: ${e.stack||e}\n`); });
server.listen(PORT, HOST, () => {
  process.stderr.write(`\n[OCD] control daemon listening on ${HOST}:${PORT}\n`);
  const tokenFile = path.join(process.env.HOME || "/tmp", ".ocd-token");
  try { fs.mkdirSync(path.dirname(tokenFile),{recursive:true}); fs.writeFileSync(tokenFile, TOKEN+"\n",{mode:0o600}); fs.chmodSync(tokenFile,0o600); process.stderr.write(`[OCD] token written to ${tokenFile} (0600)\n`);}catch{}
  process.stderr.write(`[OCD] token: ${TOKEN}\n`);
  process.stderr.write(`[OCD] storage root: ${ROOT}\n`);
  process.stderr.write(`[OCD] self-adb: ${ADB_TARGET || "(none - set OCD_ADB for input/screenshot)"}\n\n`);
});
