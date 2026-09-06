#!/usr/bin/env node
/**
 * ocd-mcp.mjs — MCP (stdio) server exposing the OpenClaw Device (OCD) control
 * daemon's endpoints to the OpenClaw agent as comprehensive tools.
 * 
 * Full capability: apps, files, USB, screenshot, input, SMS, calls, notifications,
 * location, battery, network, WiFi, Bluetooth, clipboard, volume, brightness,
 * contacts, calendar, alarms, media, camera, screen recording, power control.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const OCD_URL = process.env.OCD_URL || "http://127.0.0.1:18790";
const OCD_TOKEN = process.env.OCD_TOKEN || "";

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
  // ======== DEVICE ========
  {
    name: "ocd_device",
    description: "Get device identity: model, brand, Android version/SDK, serial, installed app count.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_systeminfo",
    description: "Get comprehensive system info: device, battery, storage, memory, uptime, IP.",
    inputSchema: { type: "object", properties: {} },
  },

  // ======== APPS ========
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
    name: "ocd_stop_app",
    description: "Force stop an app by package name.",
    inputSchema: {
      type: "object",
      required: ["pkg"],
      properties: { pkg: { type: "string" } },
    },
  },
  {
    name: "ocd_install_app",
    description: "Install an APK from device storage.",
    inputSchema: {
      type: "object",
      required: ["apk"],
      properties: { apk: { type: "string", description: "Path to APK on device" } },
    },
  },
  {
    name: "ocd_uninstall_app",
    description: "Uninstall an app by package name.",
    inputSchema: {
      type: "object",
      required: ["pkg"],
      properties: { pkg: { type: "string" } },
    },
  },

  // ======== FILE SYSTEM ========
  {
    name: "ocd_fs_list",
    description: "List a directory on the device.",
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
    name: "ocd_fs_write",
    description: "Write content to a file on the device.",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        mode: { type: "string", enum: ["write", "append"], description: "Write mode (default: overwrite)" },
      },
    },
  },
  {
    name: "ocd_fs_copy",
    description: "Copy a file on the device.",
    inputSchema: {
      type: "object",
      required: ["src", "dst"],
      properties: { src: { type: "string" }, dst: { type: "string" } },
    },
  },
  {
    name: "ocd_usb",
    description: "List mounted USB drives and storage volumes.",
    inputSchema: { type: "object", properties: {} },
  },

  // ======== SCREENSHOT / CAMERA ========
  {
    name: "ocd_screenshot",
    description: "Capture a screenshot (needs Wireless Debugging or root).",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Optional output path" } },
    },
  },
  {
    name: "ocd_camera_photo",
    description: "Take a photo with the camera.",
    inputSchema: {
      type: "object",
      properties: {
        camera_id: { type: "number", description: "Camera ID (0=rear, 1=front)" },
        path: { type: "string", description: "Optional output path" },
      },
    },
  },
  {
    name: "ocd_camera_info",
    description: "Get camera information.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_screenrecord",
    description: "Start/stop screen recording.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["start", "stop"] },
        duration: { type: "number", description: "Duration in seconds (max 180)" },
        path: { type: "string", description: "Output path" },
      },
    },
  },
  {
    name: "ocd_mic_record",
    description: "Record a microphone clip (push-to-talk). Requires Termux:API + Microphone permission.",
    inputSchema: {
      type: "object",
      properties: {
        seconds: { type: "number", description: "Clip length in seconds (1-120, default 10)" },
        encoder: { type: "string", enum: ["aac", "amr_wb", "amr_nb", "opus"] },
      },
    },
  },

  // ======== INPUT ========
  {
    name: "ocd_input_tap",
    description: "Tap at screen coordinates.",
    inputSchema: {
      type: "object",
      required: ["x", "y"],
      properties: { x: { type: "number" }, y: { type: "number" } },
    },
  },
  {
    name: "ocd_input_swipe",
    description: "Swipe from one point to another.",
    inputSchema: {
      type: "object",
      required: ["x1", "y1", "x2", "y2"],
      properties: {
        x1: { type: "number" }, y1: { type: "number" },
        x2: { type: "number" }, y2: { type: "number" },
        duration: { type: "number", description: "Swipe duration in ms (default 300)" },
      },
    },
  },
  {
    name: "ocd_input_text",
    description: "Type text on the device.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" } },
    },
  },
  {
    name: "ocd_input_key",
    description: "Send a key event (HOME=3, BACK=4, VOL_UP=24, VOL_DOWN=25, ENTER=66, POWER=26).",
    inputSchema: {
      type: "object",
      required: ["key"],
      properties: { key: { type: "string", description: "Key code or name" } },
    },
  },

  // ======== COMMUNICATIONS ========
  {
    name: "ocd_send_sms",
    description: "Send an SMS via Termux:API.",
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
    description: "Place a phone call.",
    inputSchema: {
      type: "object",
      required: ["number"],
      properties: { number: { type: "string", description: "Number to call" } },
    },
  },
  {
    name: "ocd_notifications",
    description: "List current notifications.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_send_notification",
    description: "Send a notification to the device.",
    inputSchema: {
      type: "object",
      required: ["title", "content"],
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        id: { type: "number" },
        priority: { type: "string", enum: ["default", "low", "high", "max"] },
        sound: { type: "boolean" },
        vibrate: { type: "boolean" },
      },
    },
  },

  // ======== LOCATION ========
  {
    name: "ocd_location",
    description: "Get device location (GPS and/or network).",
    inputSchema: { type: "object", properties: {} },
  },

  // ======== BATTERY ========
  {
    name: "ocd_battery",
    description: "Get battery status: level, status, temperature, voltage.",
    inputSchema: { type: "object", properties: {} },
  },

  // ======== NETWORK ========
  {
    name: "ocd_network",
    description: "Get network status: WiFi, mobile data, IP, airplane mode.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_wifi",
    description: "Control WiFi: enable/disable/scan/connect/disconnect.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["enable", "disable", "scan", "connect", "disconnect"] },
        ssid: { type: "string", description: "WiFi network name (for connect)" },
        password: { type: "string", description: "WiFi password (for connect)" },
      },
    },
  },

  // ======== BLUETOOTH ========
  {
    name: "ocd_bluetooth",
    description: "Control Bluetooth: enable/disable/scan/pair/connect/disconnect/status.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["enable", "disable", "scan", "pair", "connect", "disconnect", "status"] },
        device: { type: "string", description: "Bluetooth device address" },
        name: { type: "string", description: "Device name" },
      },
    },
  },

  // ======== CLIPBOARD ========
  {
    name: "ocd_clipboard_get",
    description: "Get clipboard content.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_clipboard_set",
    description: "Set clipboard content.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" } },
    },
  },

  // ======== VOLUME ========
  {
    name: "ocd_volume_get",
    description: "Get volume levels for all streams.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_volume_set",
    description: "Adjust volume: up/down/mute or set level.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["up", "down", "mute", "set"] },
        stream: { type: "string", enum: ["music", "ring", "alarm", "notification", "voice_call", "system"], description: "Audio stream (default: music)" },
        level: { type: "number", description: "Volume level (for set action)" },
      },
    },
  },

  // ======== BRIGHTNESS ========
  {
    name: "ocd_brightness_get",
    description: "Get screen brightness level.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_brightness_set",
    description: "Set screen brightness (0-255) or toggle auto mode.",
    inputSchema: {
      type: "object",
      properties: {
        level: { type: "number", description: "Brightness level 0-255" },
        auto: { type: "boolean", description: "Enable/disable auto brightness" },
      },
    },
  },

  // ======== SYSTEM TOGGLES ========
  {
    name: "ocd_airplane",
    description: "Toggle airplane mode on/off.",
    inputSchema: {
      type: "object",
      required: ["enabled"],
      properties: { enabled: { type: "boolean" } },
    },
  },
  {
    name: "ocd_gps",
    description: "Toggle GPS/location services on/off.",
    inputSchema: {
      type: "object",
      required: ["enabled"],
      properties: { enabled: { type: "boolean" } },
    },
  },
  {
    name: "ocd_power",
    description: "Power control: reboot/shutdown/screenoff/screenon.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["reboot", "shutdown", "screenoff", "screenon"] },
      },
    },
  },

  // ======== PIM ========
  {
    name: "ocd_contacts",
    description: "List contacts on the device.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max contacts to return (default 50)" } },
    },
  },
  {
    name: "ocd_calendar",
    description: "List calendar events.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max events (default 20)" } },
    },
  },
  {
    name: "ocd_alarms",
    description: "List active alarms.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_set_alarm",
    description: "Set an alarm.",
    inputSchema: {
      type: "object",
      required: ["hour", "minute"],
      properties: {
        hour: { type: "number", description: "Hour (0-23)" },
        minute: { type: "number", description: "Minute (0-59)" },
        message: { type: "string", description: "Alarm label" },
        vibrate: { type: "boolean" },
      },
    },
  },

  // ======== MEDIA ========
  {
    name: "ocd_media",
    description: "Control media playback: play/pause/next/previous/stop.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["play", "pause", "next", "previous", "stop"] },
        url: { type: "string", description: "Media URL (for play action)" },
      },
    },
  },

  // ======== MISC ========
  {
    name: "ocd_ring",
    description: "Ring the phone (find my phone).",
    inputSchema: { type: "object", properties: {} },
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
    name: "ocd_shell",
    description: "Run a raw shell command in the Termux environment.",
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
    name: "ocd_logcat",
    description: "Get recent logcat entries.",
    inputSchema: {
      type: "object",
      properties: {
        lines: { type: "number", description: "Number of lines (default 200)" },
        filter: { type: "string", description: "Log filter, e.g. *:E for errors only" },
      },
    },
  },

  // ======== LAUNCHER ========
  {
    name: "ocd_launcher",
    description: "List home screen apps and shortcuts.",
    inputSchema: { type: "object", properties: {} },
  },

  // ======== SETUP ========
  {
    name: "ocd_setup_developer",
    description: "Enable developer options (tap Build number x7).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_setup_adb_usb",
    description: "Enable ADB over USB.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_setup_wireless_debug",
    description: "Enable wireless debugging and report IP.",
    inputSchema: { type: "object", properties: {} },
  },

  // ======== DEBUG ========
  {
    name: "ocd_debug_imei",
    description: "Get device IMEI.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_debug_lsof",
    description: "List open files.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ocd_debug_netstat",
    description: "List network connections.",
    inputSchema: { type: "object", properties: {} },
  },

  // ======== UI ========
  {
    name: "ocd_ui_tap",
    description: "Tap on a UI element by text.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "Text to tap" },
        repeat: { type: "number", description: "Number of repeats (default 1)" },
        delay: { type: "number", description: "Delay between repeats in ms (default 250)" },
        contains: { type: "boolean", description: "Search for text containing match" },
      },
    },
  },
  {
    name: "ocd_ui_open",
    description: "Open a system settings screen by name.",
    inputSchema: {
      type: "object",
      required: ["screen"],
      properties: {
        screen: { type: "string", enum: ["about", "developer", "wifi", "display", "bluetooth"], description: "Settings screen to open" },
      },
    },
  },
];

const server = new Server(
  { name: "ocd-control", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: a = {} } = request.params;
  try {
    let r;
    switch (name) {
      // Device
      case "ocd_device": r = await ocd("GET", "/device"); break;
      case "ocd_systeminfo": r = await ocd("GET", "/systeminfo"); break;
      // Apps
      case "ocd_list_apps": {
        const q = a.filter ? "?filter=" + encodeURIComponent(a.filter) : "";
        r = await ocd("GET", "/apps" + q); break;
      }
      case "ocd_launch_app": r = await ocd("POST", "/app/launch", { pkg: a.pkg, activity: a.activity || "" }); break;
      case "ocd_stop_app": r = await ocd("POST", "/app/stop", { pkg: a.pkg }); break;
      case "ocd_install_app": r = await ocd("POST", "/app/install", { apk: a.apk }); break;
      case "ocd_uninstall_app": r = await ocd("POST", "/app/uninstall", { pkg: a.pkg }); break;
      // Files
      case "ocd_fs_list": r = await ocd("GET", "/fs/list?path=" + encodeURIComponent(a.path)); break;
      case "ocd_fs_read": {
        const q = "/fs/read?path=" + encodeURIComponent(a.path) + (a.maxBytes ? "&maxBytes=" + a.maxBytes : "");
        r = await ocd("GET", q); break;
      }
      case "ocd_fs_write": r = await ocd("POST", "/fs/write", { path: a.path, content: a.content, mode: a.mode }); break;
      case "ocd_fs_copy": r = await ocd("POST", "/fs/copy", { src: a.src, dst: a.dst }); break;
      case "ocd_usb": r = await ocd("GET", "/usb"); break;
      // Screenshot / Camera
      case "ocd_screenshot": r = await ocd("POST", "/screenshot", { path: a.path || "" }); break;
      case "ocd_camera_photo": r = await ocd("POST", "/camera", { action: "photo", camera_id: a.camera_id || 0 }); break;
      case "ocd_camera_info": r = await ocd("POST", "/camera", { action: "info" }); break;
      case "ocd_screenrecord": r = await ocd("POST", "/screenrecord", { action: a.action, duration: a.duration, path: a.path }); break;
      case "ocd_mic_record": r = await ocd("POST", "/mic", { action: "record", seconds: a.seconds || 10, encoder: a.encoder || "aac" }); break;
      // Input
      case "ocd_input_tap": r = await ocd("POST", "/input/tap", { x: a.x, y: a.y }); break;
      case "ocd_input_swipe": r = await ocd("POST", "/input/swipe", { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, duration: a.duration || 300 }); break;
      case "ocd_input_text": r = await ocd("POST", "/input/text", { text: a.text }); break;
      case "ocd_input_key": r = await ocd("POST", "/input/key", { key: a.key }); break;
      // Communications
      case "ocd_send_sms": r = await ocd("POST", "/sms", { to: a.to, body: a.body }); break;
      case "ocd_call": r = await ocd("POST", "/call", { number: a.number }); break;
      case "ocd_notifications": r = await ocd("GET", "/notifications"); break;
      case "ocd_send_notification": r = await ocd("POST", "/notification", a); break;
      // Location
      case "ocd_location": r = await ocd("GET", "/location"); break;
      // Battery
      case "ocd_battery": r = await ocd("GET", "/battery"); break;
      // Network
      case "ocd_network": r = await ocd("GET", "/network"); break;
      case "ocd_wifi": r = await ocd("POST", "/wifi", { action: a.action, ssid: a.ssid, password: a.password }); break;
      // Bluetooth
      case "ocd_bluetooth": r = await ocd("POST", "/bluetooth", { action: a.action, device: a.device, name: a.name }); break;
      // Clipboard
      case "ocd_clipboard_get": r = await ocd("GET", "/clipboard"); break;
      case "ocd_clipboard_set": r = await ocd("POST", "/clipboard", { text: a.text }); break;
      // Volume
      case "ocd_volume_get": r = await ocd("GET", "/volume"); break;
      case "ocd_volume_set": r = await ocd("POST", "/volume", { stream: a.stream, action: a.action, level: a.level }); break;
      // Brightness
      case "ocd_brightness_get": r = await ocd("GET", "/brightness"); break;
      case "ocd_brightness_set": r = await ocd("POST", "/brightness", { level: a.level, auto: a.auto }); break;
      // System toggles
      case "ocd_airplane": r = await ocd("POST", "/airplane", { enabled: a.enabled }); break;
      case "ocd_gps": r = await ocd("POST", "/gps", { enabled: a.enabled }); break;
      case "ocd_power": r = await ocd("POST", "/power", { action: a.action }); break;
      // PIM
      case "ocd_contacts": r = await ocd("GET", "/contacts?limit=" + (a.limit || 50)); break;
      case "ocd_calendar": r = await ocd("GET", "/calendar?limit=" + (a.limit || 20)); break;
      case "ocd_alarms": r = await ocd("GET", "/alarms"); break;
      case "ocd_set_alarm": r = await ocd("POST", "/alarm", { hour: a.hour, minute: a.minute, message: a.message, vibrate: a.vibrate }); break;
      // Media
      case "ocd_media": r = await ocd("POST", "/media", { action: a.action, url: a.url }); break;
      // Misc
      case "ocd_ring": r = await ocd("POST", "/ring", {}); break;
      case "ocd_create_shortcut": r = await ocd("POST", "/shortcut", { name: a.name, url: a.url }); break;
      case "ocd_shell": r = await ocd("POST", "/shell", { cmd: a.cmd, args: a.args || [] }); break;
      case "ocd_dump": r = await ocd("GET", "/debug/dump"); break;
      case "ocd_processes": r = await ocd("GET", "/debug/processes"); break;
      case "ocd_logcat": {
        const q = "/debug/logcat?lines=" + (a.lines || 200) + (a.filter ? "&filter=" + encodeURIComponent(a.filter) : "");
        r = await ocd("GET", q); break;
      }
      // Launcher
      case "ocd_launcher": r = await ocd("GET", "/launcher"); break;
      // Setup
      case "ocd_setup_developer": r = await ocd("POST", "/setup/developer"); break;
      case "ocd_setup_adb_usb": r = await ocd("POST", "/setup/adb-usb"); break;
      case "ocd_setup_wireless_debug": r = await ocd("POST", "/setup/wireless-debug"); break;
      // Debug
      case "ocd_debug_imei": r = await ocd("GET", "/debug/imei"); break;
      case "ocd_debug_lsof": r = await ocd("GET", "/debug/lsof"); break;
      case "ocd_debug_netstat": r = await ocd("GET", "/debug/netstat"); break;
      // UI
      case "ocd_ui_tap": r = await ocd("POST", "/ui/tap", { text: a.text, repeat: a.repeat, delay: a.delay, contains: a.contains }); break;
      case "ocd_ui_open": r = await ocd("POST", "/ui/open", { screen: a.screen }); break;
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
