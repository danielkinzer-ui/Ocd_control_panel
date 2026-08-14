#!/usr/bin/env node
/**
 * ocd-mcp.mjs — MCP (stdio) server exposing the OpenClaw Device (OCD) control
 * daemon's endpoints to the OpenClaw agent as tools. Wired so the agent can
 * control the phone via natural language for everything that works UNROOTED:
 * app launch, SMS, calls, notifications, file ops, device/debug queries, and
 * shell pass-through. (Touch UI automation + real screencap need Wireless
 * Debugging or root, which this device lacks.)
 *
 * Imports the MCP SDK from the OpenClaw bundle via a symlinked node_modules.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const OCD_URL = process.env.OCD_URL || "http://127.0.0.1:18790";
const OCD_TOKEN = process.env.OCD_TOKEN || ""; // set OCD_TOKEN to the OCD daemon token (passed via mcpServers.env)

async function ocd(method, path, body) {
  const headers = { "x-ocd-token": OCD_TOKEN, "content-type": "application/json" };
  const res = await fetch(OCD_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const TOOLS = [
  {
    name: "ocd_device",
    description: "Get device identity: model, brand, Android version/SDK, serial, installed app count.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_list_apps",
    description: "List installed packages, optionally filtered by substring.",
    inputSchema: {
      type: "object",
      properties: { filter: { type: "string", description: "Optional package-name substring filter" } },
    },
  },
  {
    name: "ocd_launch_app",
    description: "Launch an app by package name (optionally a specific activity).",
    inputSchema: {
      type: "object",
      required: ["pkg"],
      properties: {
        pkg: { type: "string", description: "Android package name, e.g. com.android.chrome" },
        activity: { type: "string", description: "Optional activity to start" },
      },
    },
  },
  {
    name: "ocd_create_shortcut",
    description: "Create a home-screen shortcut to a URL.",
    inputSchema: {
      type: "object",
      required: ["name", "url"],
      properties: {
        name: { type: "string", description: "Shortcut label" },
        url: { type: "string", description: "Target URL" },
      },
    },
  },
  {
    name: "ocd_send_sms",
    description: "Send an SMS via Termux:API. Requires the Termux:API app with SMS permission.",
    inputSchema: {
      type: "object",
      required: ["to", "body"],
      properties: {
        to: { type: "string", description: "Destination phone number" },
        body: { type: "string", description: "Message text" },
      },
    },
  },
  {
    name: "ocd_call",
    description: "Place a phone call via Termux:API. Requires the Termux:API app with phone permission.",
    inputSchema: {
      type: "object",
      required: ["number"],
      properties: { number: { type: "string", description: "Number to call" } },
    },
  },
  {
    name: "ocd_notifications",
    description: "List current notifications via Termux:API (active notifications).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_fs_list",
    description: "List a directory on the device (Termux home or shared storage).",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string", description: "Directory path, e.g. /sdcard or ." } },
    },
  },
  {
    name: "ocd_fs_read",
    description: "Read a text file from the device.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "File path" },
        maxBytes: { type: "number", description: "Max bytes to return (default 200000)" },
      },
    },
  },
  {
    name: "ocd_shell",
    description: "Run a raw shell command in the Termux environment (unprivileged shell).",
    inputSchema: {
      type: "object",
      required: ["cmd"],
      properties: {
        cmd: { type: "string", description: "Command, e.g. getprop" },
        args: { type: "array", items: { type: "string" }, description: "Arguments" },
      },
    },
  },
  {
    name: "ocd_dump",
    description: "Full device dump: all getprops, build, hardware, network, radio, security, storage, cpu, mounts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_processes",
    description: "List running processes (ps -A).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_screenshot_camera",
    description: "Capture a photo with the camera via Termux:API (fallback when screen capture is unavailable unrooted).",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Optional output path" } },
    },
  },
];

const server = new Server(
  { name: "ocd-control", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: a = {} } = request.params;
  try {
    let r;
    switch (name) {
      case "ocd_device": r = await ocd("GET", "/device"); break;
      case "ocd_list_apps": {
        const q = a.filter ? "?filter=" + encodeURIComponent(a.filter) : "";
        r = await ocd("GET", "/apps" + q); break;
      }
      case "ocd_launch_app": r = await ocd("POST", "/app/launch", { pkg: a.pkg, activity: a.activity || "" }); break;
      case "ocd_create_shortcut": r = await ocd("POST", "/shortcut", { name: a.name, url: a.url }); break;
      case "ocd_send_sms": r = await ocd("POST", "/sms", { to: a.to, body: a.body }); break;
      case "ocd_call": r = await ocd("POST", "/call", { number: a.number }); break;
      case "ocd_notifications": r = await ocd("GET", "/notifications"); break;
      case "ocd_fs_list": r = await ocd("GET", "/fs/list?path=" + encodeURIComponent(a.path)); break;
      case "ocd_fs_read": {
        const q = "/fs/read?path=" + encodeURIComponent(a.path) + (a.maxBytes ? "&maxBytes=" + a.maxBytes : "");
        r = await ocd("GET", q); break;
      }
      case "ocd_shell": r = await ocd("POST", "/shell", { cmd: a.cmd, args: a.args || [] }); break;
      case "ocd_dump": r = await ocd("GET", "/debug/dump"); break;
      case "ocd_processes": r = await ocd("GET", "/debug/processes"); break;
      case "ocd_screenshot_camera": r = await ocd("POST", "/screenshot", { path: a.path || "" }); break;
      default: return { content: [{ type: "text", text: "Unknown tool: " + name }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(r.json, null, 2) }],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: "Error calling " + name + ": " + (e && e.message || e) }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
