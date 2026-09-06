import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const DAEMON_BASE = process.env.OCD_BASE_URL || "http://127.0.0.1:18790";
const TOKEN = process.env.OCD_TOKEN || "";

const ACTIONS = [
  "device", "apps", "launch", "stop", "install", "uninstall",
  "ls", "read", "write", "copy", "usb", "screenshot",
  "input", "sms", "call", "notifications", "shell",
];

const AndroidToolSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ACTIONS },
    filter: { type: "string" },
    pkg: { type: "string", description: "Android package id, e.g. com.android.settings" },
    activity: { type: "string" },
    apk: { type: "string", description: "Absolute path to APK on the phone" },
    path: { type: "string" },
    maxBytes: { type: "number" },
    content: { type: "string" },
    mode: { type: "string", enum: ["write", "append"] },
    src: { type: "string" },
    dst: { type: "string" },
    kind: { type: "string", enum: ["tap", "swipe", "text", "key"] },
    x: { type: "number" }, y: { type: "number" },
    x1: { type: "number" }, y1: { type: "number" },
    x2: { type: "number" }, y2: { type: "number" },
    duration: { type: "number" },
    text: { type: "string" },
    key: { type: "string" },
    to: { type: "string" },
    body: { type: "string" },
    number: { type: "string" },
    cmd: { type: "string" },
    args: { type: "array", items: { type: "string" } },
  },
  required: ["action"],
  additionalProperties: false,
};

function routeFor(action, p) {
  switch (action) {
    case "device": return { route: "/device", method: "GET" };
    case "apps": return { route: "/apps", method: "GET", query: p.filter ? { filter: p.filter } : undefined };
    case "launch": return { route: "/app/launch", method: "POST", body: { pkg: p.pkg, activity: p.activity } };
    case "stop": return { route: "/app/stop", method: "POST", body: { pkg: p.pkg } };
    case "install": return { route: "/app/install", method: "POST", body: { apk: p.apk } };
    case "uninstall": return { route: "/app/uninstall", method: "POST", body: { pkg: p.pkg } };
    case "ls": return { route: "/fs/list", method: "GET", query: { path: p.path || "." } };
    case "read": return { route: "/fs/read", method: "GET", query: { path: p.path, maxBytes: p.maxBytes ? String(p.maxBytes) : "200000" } };
    case "write": return { route: "/fs/write", method: "POST", body: { path: p.path, content: p.content, mode: p.mode } };
    case "copy": return { route: "/fs/copy", method: "POST", body: { src: p.src, dst: p.dst } };
    case "usb": return { route: "/usb", method: "GET" };
    case "screenshot": return { route: "/screenshot", method: "POST", body: { path: p.path } };
    case "input": {
      const sub = p.kind || "tap";
      const body = {};
      if (sub === "tap") Object.assign(body, { x: p.x, y: p.y });
      else if (sub === "swipe") Object.assign(body, { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, duration: p.duration });
      else if (sub === "text") Object.assign(body, { text: p.text });
      else if (sub === "key") Object.assign(body, { key: p.key });
      return { route: `/input/${sub}`, method: "POST", body };
    }
    case "sms": return { route: "/sms", method: "POST", body: { to: p.to, body: p.body } };
    case "call": return { route: "/call", method: "POST", body: { number: p.number } };
    case "notifications": return { route: "/notifications", method: "GET" };
    case "shell": return { route: "/shell", method: "POST", body: { cmd: p.cmd, args: p.args || [] } };
  }
}

export default definePluginEntry({
  id: "android-control",
  name: "Android Control",
  description: "Executive assistant tools to control the connected Android phone (apps, files, USB, screenshot, SMS, calls, notifications) via the on-device OCD control daemon.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      daemonUrl: { type: "string" },
      token: { type: "string" },
    },
  },
  register(api) {
    const cfg = (api.pluginConfig ?? {}) || {};
    const base = cfg.daemonUrl || DAEMON_BASE;
    const tok = cfg.token || TOKEN;
    api.registerTool({
      name: "android",
      description:
        "Control the Android phone as an executive assistant. Actions: device, apps, launch/stop/install/uninstall, ls/read/write/copy files (incl. USB), usb, screenshot, input (tap/swipe/text/key), sms, call, notifications, shell. Requires the OCD control daemon running in Termux.",
      parameters: AndroidToolSchema,
      async execute(_id, params) {
        const action = params.action;
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
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
        return {
          content: [{ type: "text", text: typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2) }],
        };
      },
    });
  },
});
