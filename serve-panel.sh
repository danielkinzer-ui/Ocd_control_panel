#!/bin/bash
# Serve the OCD Control Panel HTML file via HTTP
# Run this on your computer/phone to access the panel in a browser

PORT="${1:-8080}"
DIR="$(dirname "$0")"

echo "Starting OCD Control Panel server on http://0.0.0.0:$PORT"
echo "Panel: http://YOUR_IP:$PORT/panel.html"
echo ""
echo "On Android Termux, find your IP with: ip addr show wlan0"
echo "Then open http://<that-ip>:$PORT/panel.html in your browser"
echo ""
echo "Press Ctrl+C to stop"

cd "$DIR"
python3 -m http.server "$PORT"