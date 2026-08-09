#!/bin/bash
# One-command starter: runs OCD daemon + panel server together
# Usage: bash ~/ocd-control/start-all.sh

set -e

cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     OCD Control Panel — Full Startup                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check Termux:API
if ! command -v termux-sms-send >/dev/null 2>&1; then
  echo "⚠️  Termux:API not found. Install for SMS/calls/notifications:"
  echo "    pkg install termux-api"
  echo "    (Also install Termux:API app from F-Droid)"
  echo ""
fi

# Check storage permission
if [ ! -d "/storage/emulated/0" ] && [ ! -d "/sdcard" ]; then
  echo "⚠️  Storage access not granted. Run:"
  echo "    termux-setup-storage"
  echo ""
fi

# Start daemon in background
echo "🚀 Starting OCD daemon..."
bash start.sh > /tmp/ocd-daemon.log 2>&1 &
DAEMON_PID=$!
sleep 2

# Extract token from log
TOKEN=$(grep -o 'token: [^ ]*' /tmp/ocd-daemon.log | cut -d' ' -f2)
if [ -z "$TOKEN" ]; then
  TOKEN=$(grep -o '\[OCD\] token: [^ ]*' /tmp/ocd-daemon.log | cut -d' ' -f3)
fi

# Get phone IP
PHONE_IP=$(ip addr show wlan0 2>/dev/null | grep 'inet ' | head -1 | awk '{print $2}' | cut -d'/' -f1)
if [ -z "$PHONE_IP" ]; then
  PHONE_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+')
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     ✅ DAEMON RUNNING                                    ║"
echo "╠══════════════════════════════════════════════════════════╣"
if [ -n "$TOKEN" ]; then
  echo "║  Token: $TOKEN"
else
  echo "║  Token: (check /tmp/ocd-daemon.log)"
fi
echo "║  Daemon: http://127.0.0.1:18790"
if [ -n "$PHONE_IP" ]; then
  echo "║  LAN IP: $PHONE_IP"
fi
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Start panel server
echo "🌐 Starting panel server on port 8080..."
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     OPEN IN BROWSER:                                     ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  On this phone:  http://127.0.0.1:8080/panel.html        ║"
if [ -n "$PHONE_IP" ]; then
  echo "║  From laptop:    http://$PHONE_IP:8080/panel.html"
fi
echo "║                                                          ║"
echo "║  Enter in panel:                                         ║"
echo "║    Host: 127.0.0.1  (or $PHONE_IP from laptop)"
echo "║    Port: 18790"
if [ -n "$TOKEN" ]; then
  echo "║    Token: $TOKEN"
fi
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Cleanup on exit
trap 'kill $DAEMON_PID 2>/dev/null; pkill -f "http.server 8080" 2>/dev/null; echo ""; echo "Stopped."' EXIT INT TERM

# Run panel server (blocks)
python3 -m http.server 8080