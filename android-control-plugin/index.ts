import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const DAEMON_BASE = process.env.OCD_BASE_URL || "http://127.0.0.1:18790";
const TOKEN = process.env.OCD_TOKEN || "";

type Action =
  | "device"
  | "systeminfo"
  | "apps"
  | "launch"
  | "stop"
  | "install"
  | "uninstall"
  | "ls"
  | "read"
  | "write"
  | "copy"
  | "usb"
  | "screenshot"
  | "input"
  | "sms"
  | "call"
  | "notifications"
  | "shell"
  | "location"
  | "battery"
  | "network"
  | "wifi"
  | "bluetooth"
  | "clipboard"
  | "volume"
  | "brightness"
  | "airplane"
  | "gps"
  | "contacts"
  | "calendar"
  | "alarms"
  | "alarm"
  | "media"
  | "camera"
  | "screenrecord"
  | "mic"
  | "notification"
   | "ring"
   | "power"
   | "shortcut"
   | "launcher"
   | "setup_developer"
   | "setup_adb_usb"
   | "setup_wireless_debug"
   | "debug_dump"
   | "debug_imei"
   | "debug_logcat"
   | "debug_processes"
   | "debug_lsof"
   | "debug_netstat"
   | "ui_tap"
   | "ui_open";

const AndroidToolSchema = Type.Object(
  {
    action: Type.Union([
      Type.Literal("device"),
      Type.Literal("systeminfo"),
      Type.Literal("apps"),
      Type.Literal("launch"),
      Type.Literal("stop"),
      Type.Literal("install"),
      Type.Literal("uninstall"),
      Type.Literal("ls"),
      Type.Literal("read"),
      Type.Literal("write"),
      Type.Literal("copy"),
      Type.Literal("usb"),
      Type.Literal("screenshot"),
      Type.Literal("input"),
      Type.Literal("sms"),
      Type.Literal("call"),
      Type.Literal("notifications"),
      Type.Literal("shell"),
      Type.Literal("location"),
      Type.Literal("battery"),
      Type.Literal("network"),
      Type.Literal("wifi"),
      Type.Literal("bluetooth"),
      Type.Literal("clipboard"),
      Type.Literal("volume"),
      Type.Literal("brightness"),
      Type.Literal("airplane"),
      Type.Literal("gps"),
      Type.Literal("contacts"),
      Type.Literal("calendar"),
      Type.Literal("alarms"),
      Type.Literal("alarm"),
      Type.Literal("media"),
      Type.Literal("camera"),
      Type.Literal("screenrecord"),
      Type.Literal("mic"),
      Type.Literal("notification"),
      Type.Literal("ring"),
      Type.Literal("power"),
    ]),
    filter: Type.Optional(Type.String()),
    pkg: Type.Optional(Type.String({ description: "Android package id, e.g. com.android.settings" })),
    activity: Type.Optional(Type.String()),
    apk: Type.Optional(Type.String({ description: "Absolute path to APK on the phone" })),
    path: Type.Optional(Type.String()),
    maxBytes: Type.Optional(Type.Number()),
    content: Type.Optional(Type.String()),
    mode: Type.Optional(Type.Union([Type.Literal("write"), Type.Literal("append")])),
    src: Type.Optional(Type.String()),
    dst: Type.Optional(Type.String()),
    kind: Type.Optional(Type.Union([Type.Literal("tap"), Type.Literal("swipe"), Type.Literal("text"), Type.Literal("key")])),
    x: Type.Optional(Type.Number()),
    y: Type.Optional(Type.Number()),
    x1: Type.Optional(Type.Number()),
    y1: Type.Optional(Type.Number()),
    x2: Type.Optional(Type.Number()),
    y2: Type.Optional(Type.Number()),
    duration: Type.Optional(Type.Number()),
    text: Type.Optional(Type.String()),
    key: Type.Optional(Type.String()),
    to: Type.Optional(Type.String()),
    body: Type.Optional(Type.String()),
    number: Type.Optional(Type.String()),
    cmd: Type.Optional(Type.String()),
    args: Type.Optional(Type.Array(Type.String())),
    // New fields
    action_name: Type.Optional(Type.String()), // For wifi/bluetooth actions
    ssid: Type.Optional(Type.String()),
    password: Type.Optional(Type.String()),
    device: Type.Optional(Type.String()), // BT device address
    name: Type.Optional(Type.String()),
    stream: Type.Optional(Type.String()),
    level: Type.Optional(Type.Number()),
    auto: Type.Optional(Type.Boolean()),
    enabled: Type.Optional(Type.Boolean()),
    hour: Type.Optional(Type.Number()),
    minute: Type.Optional(Type.Number()),
    message: Type.Optional(Type.String()),
    vibrate: Type.Optional(Type.Boolean()),
    url: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    id: Type.Optional(Type.Number()),
    priority: Type.Optional(Type.String()),
    sound: Type.Optional(Type.Boolean()),
    camera_id: Type.Optional(Type.Number()),
    flash: Type.Optional(Type.Boolean()),
    seconds: Type.Optional(Type.Number({ description: "Mic clip length in seconds (1-120)" })),
    encoder: Type.Optional(Type.String({ description: "Mic encoder: aac, amr_wb, amr_nb, opus" })),
recPath: Type.Optional(Type.String()),
     limit: Type.Optional(Type.Number()),
     name: Type.Optional(Type.String()),
     url: Type.Optional(Type.String()),
     screen: Type.Optional(Type.String()),
     repeat: Type.Optional(Type.Number()),
     delay: Type.Optional(Type.Number()),
     contains: Type.Optional(Type.Boolean()),
   },
   { additionalProperties: false },
);

function routeFor(action: Action, p: Record<string, any>): { route: string; method: "GET" | "POST"; query?: Record<string, string>; body?: any } {
  switch (action) {
    case "device":
      return { route: "/device", method: "GET" };
    case "systeminfo":
      return { route: "/systeminfo", method: "GET" };
    case "apps":
      return { route: "/apps", method: "GET", query: p.filter ? { filter: p.filter } : undefined };
    case "launch":
      return { route: "/app/launch", method: "POST", body: { pkg: p.pkg, activity: p.activity } };
    case "stop":
      return { route: "/app/stop", method: "POST", body: { pkg: p.pkg } };
    case "install":
      return { route: "/app/install", method: "POST", body: { apk: p.apk } };
    case "uninstall":
      return { route: "/app/uninstall", method: "POST", body: { pkg: p.pkg } };
    case "ls":
      return { route: "/fs/list", method: "GET", query: { path: p.path || "." } };
    case "read":
      return { route: "/fs/read", method: "GET", query: { path: p.path, maxBytes: p.maxBytes ? String(p.maxBytes) : "200000" } };
    case "write":
      return { route: "/fs/write", method: "POST", body: { path: p.path, content: p.content, mode: p.mode } };
    case "copy":
      return { route: "/fs/copy", method: "POST", body: { src: p.src, dst: p.dst } };
    case "usb":
      return { route: "/usb", method: "GET" };
    case "screenshot":
      return { route: "/screenshot", method: "POST", body: { path: p.path } };
    case "input": {
      const sub = p.kind || "tap";
      const body: any = {};
      if (sub === "tap") Object.assign(body, { x: p.x, y: p.y });
      else if (sub === "swipe") Object.assign(body, { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, duration: p.duration });
      else if (sub === "text") Object.assign(body, { text: p.text });
      else if (sub === "key") Object.assign(body, { key: p.key });
      return { route: `/input/${sub}`, method: "POST", body };
    }
    case "sms":
      return { route: "/sms", method: "POST", body: { to: p.to, body: p.body } };
    case "call":
      return { route: "/call", method: "POST", body: { number: p.number } };
    case "notifications":
      return { route: "/notifications", method: "GET" };
    case "shell":
      return { route: "/shell", method: "POST", body: { cmd: p.cmd, args: p.args || [] } };
    // New actions
    case "location":
      return { route: "/location", method: "GET" };
    case "battery":
      return { route: "/battery", method: "GET" };
    case "network":
      return { route: "/network", method: "GET" };
    case "wifi":
      return { route: "/wifi", method: "POST", body: { action: p.action_name, ssid: p.ssid, password: p.password } };
    case "bluetooth":
      return { route: "/bluetooth", method: "POST", body: { action: p.action_name, device: p.device, name: p.name } };
    case "clipboard":
      return { route: "/clipboard", method: p.text !== undefined ? "POST" : "GET", body: p.text !== undefined ? { text: p.text } : undefined };
    case "volume":
      return { route: "/volume", method: p.action_name ? "POST" : "GET", body: p.action_name ? { stream: p.stream, action: p.action_name, level: p.level } : undefined };
    case "brightness":
      return { route: "/brightness", method: p.level !== undefined ? "POST" : "GET", body: { level: p.level, auto: p.auto } };
    case "airplane":
      return { route: "/airplane", method: "POST", body: { enabled: p.enabled } };
    case "gps":
      return { route: "/gps", method: "POST", body: { enabled: p.enabled } };
    case "contacts":
      return { route: "/contacts", method: "GET", query: { limit: String(p.limit || 50) } };
    case "calendar":
      return { route: "/calendar", method: "GET", query: { limit: String(p.limit || 20) } };
    case "alarms":
      return { route: "/alarms", method: "GET" };
    case "alarm":
      return { route: "/alarm", method: "POST", body: { hour: p.hour, minute: p.minute, message: p.message, vibrate: p.vibrate } };
    case "media":
      return { route: "/media", method: "POST", body: { action: p.action_name, url: p.url } };
    case "camera":
      return { route: "/camera", method: "POST", body: { action: p.action_name, camera_id: p.camera_id, flash: p.flash } };
    case "screenrecord":
      return { route: "/screenrecord", method: "POST", body: { action: p.action_name, duration: p.duration, path: p.recPath } };
    case "mic":
      return { route: "/mic", method: "POST", body: { action: p.action_name, seconds: p.seconds, encoder: p.encoder } };
    case "notification":
      return { route: "/notification", method: "POST", body: { title: p.title, content: p.content, id: p.id, priority: p.priority, sound: p.sound, vibrate: p.vibrate } };
    case "ring":
      return { route: "/ring", method: "POST", body: { duration: p.duration } };
    case "power":
      return { route: "/power", method: "POST", body: { action: p.action_name } };
    case "shortcut":
      return { route: "/shortcut", method: "POST", body: { name: p.name, url: p.url } };
    case "launcher":
      return { route: "/launcher", method: "GET" };
    case "setup_developer":
      return { route: "/setup/developer", method: "POST" };
    case "setup_adb_usb":
      return { route: "/setup/adb-usb", method: "POST" };
    case "setup_wireless_debug":
      return { route: "/setup/wireless-debug", method: "POST" };
    case "debug_dump":
      return { route: "/debug/dump", method: "GET" };
    case "debug_imei":
      return { route: "/debug/imei", method: "GET" };
    case "debug_logcat":
      return { route: "/debug/logcat", method: "GET", query: { lines: String(p.limit || 200), filter: p.cmd } };
    case "debug_processes":
      return { route: "/debug/processes", method: "GET" };
    case "debug_lsof":
      return { route: "/debug/lsof", method: "GET" };
    case "debug_netstat":
      return { route: "/debug/netstat", method: "GET" };
    case "ui_tap":
      return { route: "/ui/tap", method: "POST", body: { text: p.cmd, repeat: p.repeat, delay: p.delay, contains: p.contains } };
    case "ui_open":
      return { route: "/ui/open", method: "POST", body: { screen: p.screen } };
  }
}

export default definePluginEntry({
  id: "android-control",
  name: "Android Control",
  description: "Full executive assistant to control Android phone: apps, files, USB, screenshot, input, SMS, calls, notifications, location, battery, network, WiFi, Bluetooth, clipboard, volume, brightness, contacts, calendar, alarms, media, camera, screen recording, mic clips, power control, shortcuts, launcher, setup, debug, and UI automation.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      daemonUrl: { type: "string" },
      token: { type: "string" },
    },
  },
  register(api) {
    const cfg = (api.pluginConfig ?? {}) as { daemonUrl?: string; token?: string };
    const base = cfg.daemonUrl || DAEMON_BASE;
    const tok = cfg.token || TOKEN;
    api.registerTool({
      name: "android",
      description:
        `Control Android phone as executive assistant. Actions:
- device/systeminfo: Get device info
- apps/launch/stop/install/uninstall: App management
- ls/read/write/copy: File operations
- screenshot/camera/screenrecord/mic: Visual capture + mic clips
- input (tap/swipe/text/key): Remote control
- sms/call/notifications/notification: Communications
- location/battery/network/wifi/bluetooth: Hardware status
- clipboard/volume/brightness: System control
- airplane/gps/power: Toggle features
- contacts/calendar/alarms/alarm: PIM data
- media: Play/pause/next/previous
- shell: Raw command execution
- ring: Find phone (ring+notify)
- shortcut: Create home-screen shortcut
- launcher: List home screen apps
- setup: Developer options, ADB, wireless debugging
- debug: Device dump, IMEI, logcat, processes, lsof, netstat
- ui: Tap by text, open system settings
Requires OCD daemon running in Termux.`,
      parameters: AndroidToolSchema,
      async execute(_id, params: Record<string, any>) {
        const action = params.action as Action;
        if (!action) return { content: [{ type: "text", text: "action required" }] };
        const { route, method, query, body } = routeFor(action, params);
        let url = `${base}${route}`;
        if (query) {
          const q = new URLSearchParams(query).toString();
          if (q) url += `?${q}`;
        }
        const res = await fetch(url, {
          method,
          headers: { "content-type": "application/json", "x-ocd-token": tok },
          body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        });
        const text = await res.text();
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { raw: text };
        }
        return {
          content: [
            {
              type: "text",
              text: typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2),
            },
          ],
        };
      },
    });
  },
});
