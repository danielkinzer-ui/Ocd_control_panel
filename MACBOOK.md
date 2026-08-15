# Controlling the Phone from a MacBook

This documents how to drive the on-device **OCD Control** stack (the `android`
OpenClaw tool + the OCD daemon) from a MacBook instead of the phone's own
terminal/panel.

## What is running on the phone

| Service            | Process            | Port            | Notes                                  |
|--------------------|--------------------|-----------------|----------------------------------------|
| OCD daemon         | `daemon.mjs` (Termux) | `127.0.0.1:18790` | REST API for phone control (SMS, call, screenshot, input, shell, fs, apps) |
| OpenClaw gateway   | `openclaw` (proot) | `192.0.0.4:18789` (LAN) | Chat gateway; exposes the `android` tool. Currently `bind: "lan"` |
| Phone control panel | `serve-panel.sh` (Termux) | `127.0.0.1:8080` | Web UI (`/panel.html`) |

- **OCD daemon token** (X-OCD-Token): set via the `OCD_TOKEN` env var when the
daemon starts. Keep this secret; do not commit it.
- **OpenClaw gateway token** (used by any client to talk to the gateway): set in
  `gateway.auth.token` in `openclaw.json`. Keep this secret; do not commit it.

The OpenClaw plugin **`android-control`** is installed (linked from
`~/ocd-control/openclaw-plugin/`) and registers an `android` tool. That tool
proxies to the OCD daemon over `http://127.0.0.1:18790`. So "chat control of
the phone" = your chat client → OpenClaw gateway → `android` tool → OCD daemon.

## Step 0 — Make the gateway reachable from the MacBook

The gateway currently binds **LAN** (`bind: "lan"` → `192.0.0.4:18789`),
so any device on the same WiFi can reach it directly at
`http://192.0.0.4:18789` (find the phone's current WiFi IP with
`ip -4 addr show wlan0`). For access over the internet (or off-WiFi), open a
tunnel instead. Pick one:

### Option A — Tailscale (recommended, works over the internet)

1. Install Tailscale on the phone and on the MacBook; sign in to the same
   tailnet.
2. On the phone, edit the gateway config and enable Tailscale serve:

   ```jsonc
   // in /root/.openclaw/openclaw.json  (proot)
   "gateway": {
     "mode": "local",
     "bind": "tailscale",          // was "loopback"
     "tailscale": { "mode": "serve" },
     "port": 18789,
     "auth": { "mode": "token", "token": "2350d190…" }
   }
   ```
3. Restart the gateway: `openclawx restart` (or `pkill -f "openclaw gateway"
   && openclawx gateway --verbose &`).
4. The gateway is now published at `http://<phone-tailscale-host>:18789`
   (find the host with `tailscale ip -1` on the phone).

### Option B — `adb forward` (USB or Wireless Debugging, LAN only)

With the phone connected via USB (or Wireless Debugging paired):

```bash
# On the MacBook (has adb + the phone's adb authorized)
adb forward tcp:18789 tcp:18789
```

Then the MacBook reaches the gateway at `http://127.0.0.1:18789`.

> The OCD daemon (`:18790`) also needs to be reachable if you use the MCP path
> below. Forward it too: `adb forward tcp:18790 tcp:18790`.

## Step 1 — Connect a MacBook client

### Path 1 — OpenClaw client/agent (chat → `android` tool)

Point any OpenClaw client at the phone gateway:

```
OpenClaw gateway URL:  http://<phone-host>:18789
Gateway token:         <GATEWAY_AUTH_TOKEN>   (from gateway.auth.token in openclaw.json)
```

Once connected, just chat: *"text mom that I'm on my way"*,
*"screenshot the phone"*, *"open the calculator app"*, etc. The agent calls the
`android` tool, which hits the OCD daemon.

Available `android` tool actions:
`device`, `apps`, `launch`, `stop`, `install`, `uninstall`, `ls`, `read`,
`write`, `copy`, `usb`, `screenshot`, `input` (tap/swipe/text/key), `sms`,
`call`, `notifications`, `shell`.

### Path 2 — Any MCP client (Claude Desktop, etc.)

`ocd-mcp/server.mjs` is a standard **MCP stdio server** that wraps the OCD
daemon. OpenClaw itself cannot host MCP servers (no MCP-client in 2026.8.1), but
external MCP clients can use it.

1. Copy `ocd-mcp/` to the MacBook (or run it from this repo over the tunnel).
2. Configure the MCP client to launch it, pointing at the phone's OCD daemon:

   ```jsonc
   // Claude Desktop / MCP client config
   {
     "mcpServers": {
       "ocd-phone": {
         "command": "node",
         "args": ["/path/to/ocd-mcp/server.mjs"],
         "env": {
           "OCD_DAEMON_URL": "http://<phone-host>:18790",
           "OCD_TOKEN": "<OCD_DAEMON_TOKEN>"
         }
       }
     }
   }
   ```

   Replace `<phone-host>` with the Tailscale host or `127.0.0.1` (if using
   `adb forward`). The server exposes tools like `ocd_device`, `ocd_sms`,
   `ocd_screenshot`, `ocd_shell`, etc.

## Troubleshooting

- **Gateway not reachable from MacBook** → confirm tunnel (Tailscale `serve`
  vs `loopback`, or `adb forward` is active) and that the gateway is up
  (`curl http://<host>:18789/health`).
- **`android` tool errors with 401** → OCD daemon token changed; update the
  `android-control` plugin config (`daemonUrl`/`token`) in
  `/root/.openclaw/openclaw.json` and restart the gateway.
- **`android` tool missing** → ensure `android-control` is enabled in the
  `plugins.entries` of `openclaw.json` and the gateway was restarted after
  install (`openclaw plugins list`).
- **`ocd-mcp` tools fail** → check `OCD_DAEMON_URL`/`OCD_TOKEN` and that
  `:18790` is forwarded/reachable from the MacBook.

## Restart cheat-sheet (phone)

```bash
# OCD daemon (Termux)
OCD_TOKEN=<OCD_DAEMON_TOKEN> node ~/ocd-control/daemon.mjs &

# OpenClaw gateway (proot)
openclawx restart

# Phone panel UI (Termux)
bash ~/ocd-control/serve-panel.sh &
```
