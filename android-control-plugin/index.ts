import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const DAEMON_BASE = process.env.OCD_BASE_URL || "http://127.0.0.1:18790";
const TOKEN = process.env.OCD_TOKEN || "";

type Action =
  | "device"
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
  | "shell";

const AndroidToolSchema = Type.Object(
  {
    action: Type.Union([
      Type.Literal("device"),
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
  },
  { additionalProperties: false },
);

async function callDaemon(route: string, method: "GET" | "POST", query?: Record<string, string>, body?: unknown) {
  let url = `${DAEMON_BASE}${route}`;
  if (query) {
    const q = new URLSearchParams(query).toString();
    if (q) url += `?${q}`;
  }
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", "x-ocd-token": TOKEN },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: res.ok, raw: text };
  }
}

function routeFor(action: Action, p: Record<string, any>): { route: string; method: "GET" | "POST"; query?: Record<string, string>; body?: any } {
  switch (action) {
    case "device":
      return { route: "/device", method: "GET" };
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
    const cfg = (api.pluginConfig ?? {}) as { daemonUrl?: string; token?: string };
    const base = cfg.daemonUrl || DAEMON_BASE;
    const tok = cfg.token || TOKEN;
    api.registerTool({
      name: "android",
      description:
        "Control the Android phone as an executive assistant. Actions: device (info), apps (list), launch/stop/install/uninstall apps, ls/read/write/copy files (incl. USB drive), usb (mounted volumes), screenshot, input (tap/swipe/text/key), sms, call, notifications, shell (raw am/pm/getprop). Requires the OCD control daemon running in Termux.",
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
