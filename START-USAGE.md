# Start & Usage Commands — Control the Phone from Any Device

How to **start** the on-device OCD control stack on the Android phone, and how to
**connect and use** it from a MacBook, a Windows PC, another Android device, or an
iPhone. The phone is the *host* that runs the stack; the other three are *clients*
that drive it.

```
 client (MacBook / Win / Android / iPhone)
          │  LAN · adb forward · Tailscale
          ▼
   OpenClaw gateway   :18789   (proot)   ──plugin: android-control──┐
   OCD daemon         :18790   (Termux)  ◄──────────────────────────┘  REST API
   Phone web panel    :8080   (Termux)  ◄── browser UI (/panel.html)
          │
          ▼
   Android phone  (SMS, call, tap, swipe, shell, fs, apps, screenshot…)
```

> **Secrets (never commit, keep redacted):**
> - **OCD daemon token** = the `OCD_TOKEN` env var set when `daemon.mjs` started.
> - **Gateway token** = `gateway.auth.token` in `/root/.openclaw/openclaw.json`.
> Print the gateway token on the phone with:
> ```bash
> proot-distro login ubuntu -- sh -c 'cat /root/.openclaw/openclaw.json | python3 -c "import json,sys;print(json.load(sys.stdin)[\"gateway\"][\"auth\"][\"token\"])"'
> ```

---

## API keys & credentials (what you need)

Two kinds of secrets are involved: **external API keys** (from a provider, needed
for the AI chat to work) and **local tokens** (generated on the phone, used for auth
between the pieces). The web panel needs **no** external key.

| Secret | Type | Where it lives | Needed for | How to set / get |
|--------|------|---------------|-----------|------------------|
| `OPENROUTER_API_KEY` | External API key | proot `/root/.openclaw/.env` | Chat/agent that drives the `android` tool (model = `openrouter/anthropic/claude-sonnet-4`) | Create at openrouter.ai; add `OPENROUTER_API_KEY=sk-or-...` to `.env`; restart gateway. (Swap for `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` if you reconfigure the provider.) |
| `OCD_TOKEN` (OCD daemon token) | Local token | Termux env when launching `daemon.mjs` | Auth to the daemon REST API (`:18790`) | Any string you choose; launch with `OCD_TOKEN=... node daemon.mjs &`. Also used by the MCP path as `OCD_TOKEN`. |
| `gateway.auth.token` (gateway token) | Local token | `/root/.openclaw/openclaw.json` | Auth for any client talking to the gateway (`:18789`) | Already set on the phone; print with the command in the note above. |
| Tailscale auth (optional) | External | `tailscale up` | Over-internet access instead of LAN | `tailscale up --authkey <key>` or interactive login. Optional. |

**Minimum to get started:**
- **Web panel only** → just the two local tokens (already configured on the phone). No external signup.
- **Chat / `android` tool / MCP** → also need **`OPENROUTER_API_KEY`** (or your chosen provider key).

> Never commit real keys/tokens. The repo uses `<OCD_DAEMON_TOKEN>` / `<GATEWAY_AUTH_TOKEN>` placeholders.

---

## 0. Start the stack on the phone (Android host)

Run these on the phone (Termux + proot):

```bash
# 1) OCD daemon — REST API on 127.0.0.1:18790 (Termux)
OCD_TOKEN=<OCD_DAEMON_TOKEN> node ~/ocd-control/daemon.mjs &

# 2) OpenClaw gateway — chat gateway on :18789, currently bind:"lan" (proot)
openclawx restart

# 3) Phone web panel — browser UI on 127.0.0.1:8080 (Termux)
bash ~/ocd-control/serve-panel.sh &
```

Health checks:

```bash
proot-distro login ubuntu -- sh -c 'curl -s -m5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18790/health'   # daemon → 200
curl -s -m5 -o /dev/null -w "%{http_code}\n" http://<phone-ip>:18789/health                                      # gateway → 200
```

Find the phone's reachable IP (DHCP — can change):

```bash
proot-distro login ubuntu -- sh -c 'ip -4 addr show'
# ap0       = hotspot / WiFi AP   → use if the client joins the phone's hotspot
# wlan0     = home WiFi client    → use if both devices are on the same home WiFi
# v4-ccmni* = cellular interface  → NOT reachable from a client, skip these
```

If the gateway is not reachable, confirm `gateway.bind` is `"lan"` (all interfaces)
or use `adb forward` / Tailscale from the client (see each section).

---

## 1. MacBook (client)

**A. Web panel (no install, fastest):**
```bash
# Same WiFi / hotspot as phone — open directly:
open http://<phone-ip>:8080/panel.html
# Or tunnel over USB (Wireless Debugging also works):
adb forward tcp:8080 tcp:8080 && open http://127.0.0.1:8080/panel.html
```

**B. Chat control (Path 1 — OpenClaw client → `android` tool):**
Point any OpenClaw client at the gateway:
```
Gateway URL:  http://<phone-ip>:18789
Gateway token: <GATEWAY_AUTH_TOKEN>
```
With `adb forward tcp:18789 tcp:18789` you can instead use `http://127.0.0.1:18789`.

**C. MCP client (Path 2 — Claude Desktop, etc.):** copy `ocd-mcp/` to the MacBook:
```jsonc
// MCP client config
{ "mcpServers": { "ocd-phone": {
  "command": "node",
  "args": ["/path/to/ocd-mcp/server.mjs"],
  "env": { "OCD_DAEMON_URL": "http://<phone-ip>:18790",
           "OCD_TOKEN": "<OCD_DAEMON_TOKEN>" } } } }
```

---

## 2. Windows / Microsoft (client)

Prereqs: install **Android SDK platform-tools** (for `adb`) and **Node.js** (for MCP).
Use PowerShell.

**A. Web panel:**
```powershell
# Same WiFi / hotspot as phone:
start http://<phone-ip>:8080/panel.html
# Or over USB (Wireless Debugging also works):
adb forward tcp:8080 tcp:8080; start http://127.0.0.1:8080/panel.html
```

**B. Chat control (Path 1):** install the OpenClaw Windows client and point it at:
```
Gateway URL:  http://<phone-ip>:18789
Gateway token: <GATEWAY_AUTH_TOKEN>
```
(or `http://127.0.0.1:18789` after `adb forward tcp:18789 tcp:18789`).

**C. MCP client (Path 2):** copy `ocd-mcp/` to the PC, configure the MCP client:
```jsonc
{ "mcpServers": { "ocd-phone": {
  "command": "node",
  "args": ["C:\\path\\to\\ocd-mcp\\server.mjs"],
  "env": { "OCD_DAEMON_URL": "http://<phone-ip>:18790",
           "OCD_TOKEN": "<OCD_DAEMON_TOKEN>" } } } }
```

Verify reachability from PowerShell:
```powershell
(Invoke-WebRequest -Uri http://<phone-ip>:18789/health -TimeoutSec 5).StatusCode   # 200
```

---

## 3. Android (another device, as client)

The host phone already runs the stack. To drive it from a **second** Android device:

**A. Web panel (zero install):** open a browser on the client and go to
`http://<phone-ip>:8080/panel.html` (same WiFi/hotspot), or tunnel with Termux:
```bash
pkg install android-tools curl
adb forward tcp:8080 tcp:8080   # then open http://127.0.0.1:8080/panel.html
```

**B. Full chat / MCP (Termux on the client):**
```bash
pkg install nodejs android-tools
# Forward the gateway and point an OpenClaw client at http://127.0.0.1:18789
adb forward tcp:18789 tcp:18789
adb forward tcp:18790 tcp:18790   # needed for the MCP path
# MCP: node ~/ocd-control/ocd-mcp/server.mjs with OCD_DAEMON_URL/OCD_TOKEN
```

---

## 4. iPhone (client)

The iPhone has no `adb`/shell and no OpenClaw app, so it uses the **web panel** in
Safari. Chat/`android`-tool control requires a desktop OpenClaw client (use MacBook
or Windows for that).

**A. Web panel (same WiFi / phone hotspot):**
Open Safari → `http://<phone-ip>:8080/panel.html`
(`<phone-ip>` is the phone's `ap0` IP if the iPhone joins the hotspot, or its `wlan0`
IP if both are on the same home WiFi).

**B. Off-WiFi / cellular:** install **Tailscale** on the iPhone and on the phone, join
the same tailnet, then open `http://<phone-tailscale-host>:8080/panel.html`
(find the host with `tailscale ip -1` on the phone). The gateway can also be published
over Tailscale with `gateway.bind: "tailscale"` + `tailscale.mode: "serve"`.

---

## Common usage (any client)

**Web panel (`/panel.html`)** — tap-driven UI: send SMS, place calls, screenshot,
run actions, browse device files, launch/stop apps.

**Chat (MacBook / Windows client → `android` tool)** — just talk naturally:
- "Text Mom I'm on my way"
- "Screenshot the phone and tell me what's on screen"
- "Open the calculator app"
- "Run `getprop` in a shell and summarize"
- "List installed apps" / "Launch Maps" / "Stop Spotify"

**`android` tool actions** (also exposed by the MCP server as `ocd_*` tools):
`device`, `apps`, `launch`, `stop`, `install`, `uninstall`, `ls`, `read`, `write`,
`copy`, `usb`, `screenshot`, `input` (tap/swipe/text/key), `sms`, `call`,
`notifications`, `shell`.

---

## Troubleshooting

- **Client can't reach `:18789`/`:8080`** → wrong `<phone-ip>` (use the shared-subnet
  one, not `v4-ccmni*`), or the phone's IP changed (re-run `ip -4 addr show`); or the
  gateway/daemon/panel isn't running (re-run Section 0).
- **`android` tool 401** → daemon token changed; update `android-control` plugin
  `token` in `openclaw.json` and `openclawx restart`.
- **`android` tool missing** → ensure `android-control` is enabled in
  `plugins.entries` and the gateway restarted after install (`openclaw plugins list`).
- **Public WiFi** → avoid `bind:"lan"`; use `adb forward` (USB) or Tailscale instead.
