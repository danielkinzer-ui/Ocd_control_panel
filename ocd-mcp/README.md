# ocd-mcp

MCP (stdio) server that wraps the **OpenClaw Device (OCD) control daemon**
(`~/ocd-control/daemon.mjs`) and exposes its endpoints to the OpenClaw agent
as tools, so the agent can control the phone by natural language.

## What it exposes (works UNROOTED)
`ocd_device`, `ocd_list_apps`, `ocd_launch_app`, `ocd_create_shortcut`,
`ocd_send_sms`, `ocd_call`, `ocd_notifications`, `ocd_fs_list`, `ocd_fs_read`,
`ocd_shell`, `ocd_dump`, `ocd_processes`, `ocd_screenshot_camera`.

(Touch UI automation + real `screencap` need Wireless Debugging or root.)

## Deploy on the phone (OpenClaw runs inside proot)
```bash
# from Termux, inside proot's view of the repo:
DEST=/root/.openclaw/ocd-mcp
mkdir -p "$DEST"
cp ocd-control/ocd-mcp/server.mjs "$DEST/server.mjs"
# SDK is already bundled with OpenClaw; symlink its node_modules:
ln -sfn /usr/lib/node_modules/openclaw/node_modules "$DEST/node_modules"
```
Then add to `openclaw.json` (top-level `mcpServers`):
```json
"mcpServers": {
  "ocd-control": {
    "transport": "stdio",
    "command": "node",
    "args": ["/root/.openclaw/ocd-mcp/server.mjs"],
    "env": { "OCD_URL": "http://127.0.0.1:18790", "OCD_TOKEN": "<ocd-token>" },
    "timeout": 60
  }
}
```
Restart the OpenClaw gateway afterwards.

## From a MacBook
The OCD daemon and this MCP server run **on the phone** (Termux/proot). From a
MacBook you do NOT run the daemon locally — you run the OpenClaw *client/agent*
and connect it to the gateway on the phone over the network (Tailscale, or
`adb forward tcp:18789 tcp:18789` when USB-connected). Point `OCD_URL` at
whatever host:port reaches the phone's `:18790`.
