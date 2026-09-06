#!/bin/bash
# OCD Control Panel — one-command start
# Usage: bash start-all.sh
#   or:  OCD_TOKEN=mysecret bash start-all.sh
#
# Starts the daemon + panel server, prints a ready-to-open URL.

set -e
cd "$(dirname "$0")"

export OCD_HOST="${OCD_HOST:-0.0.0.0}"
export OCD_PORT="${OCD_PORT:-18790}"
PANEL_PORT="${PANEL_PORT:-8080}"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   OCD Control Panel — Starting...        ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Kill any previous instances
pkill -f "node daemon.mjs" 2>/dev/null || true
pkill -f "http.server $PANEL_PORT" 2>/dev/null || true
sleep 0.5

# Start daemon in background, capture output
DAEMON_LOG=$(mktemp /tmp/ocd-daemon-XXXX.log)
bash start.sh > "$DAEMON_LOG" 2>&1 &
DAEMON_PID=$!

# Wait for daemon to start and write token
sleep 2

TOKEN=$(grep -oP '(?:token: |token=)\K[^\s]+' "$DAEMON_LOG" | head -1)
if [ -z "$TOKEN" ]; then
  TOKEN=$(cat ~/.ocd-token 2>/dev/null | tr -d '[:space:]')
fi

# Get phone IP
PHONE_IP=$(ip addr show wlan0 2>/dev/null | grep 'inet ' | head -1 | awk '{print $2}' | cut -d'/' -f1)
if [ -z "$PHONE_IP" ]; then
  PHONE_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+')
fi
if [ -z "$PHONE_IP" ]; then
  PHONE_IP="127.0.0.1"
fi

# Start panel HTTP server
python3 -m http.server "$PANEL_PORT" --directory "$PWD" > /tmp/ocd-panel-server.log 2>&1 &
PANEL_PID=$!

# Build the auto-connect URL
PANEL_URL="http://${PHONE_IP}:${PANEL_PORT}/panel.html?api=http://${PHONE_IP}:${OCD_PORT}&token=${TOKEN}"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   ✅ OCD Control Panel is ready!         ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║                                          ║"
echo "  ║   Open this URL in your browser:         ║"
echo "  ║                                          ║"

# Print URL - wrapped for readability
echo "  ║   $PANEL_URL"

echo "  ║                                          ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║   Token: $TOKEN"
echo "  ║   Daemon: http://$PHONE_IP:$OCD_PORT"
echo "  ║   Panel:  http://$PHONE_IP:$PANEL_PORT"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Copy the URL above and paste it in your browser."
echo "  The panel will auto-connect — no manual entry needed."
echo ""
echo "  Press Ctrl+C to stop all services."

# Cleanup on exit
cleanup() {
  echo ""
  echo "  Stopping services..."
  kill "$DAEMON_PID" 2>/dev/null
  kill "$PANEL_PID" 2>/dev/null
  pkill -f "node daemon.mjs" 2>/dev/null || true
  pkill -f "http.server $PANEL_PORT" 2>/dev/null || true
  echo "  Done."
}
trap cleanup EXIT INT TERM

# Wait for either process to exit
wait "$DAEMON_PID" "$PANEL_PID" 2>/dev/null
