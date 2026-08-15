#!/bin/bash
# OpenClaw Device (OCD) Control Panel - One-liner installer
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/danielkinzer-ui/Ocd_control_panel/master/quick-install.sh)
# Or:    wget -qO- https://raw.githubusercontent.com/danielkinzer-ui/Ocd_control_panel/master/quick-install.sh | bash

set -euo pipefail

REPO="${OCD_REPO:-danielkinzer-ui/Ocd_control_panel}"
BRANCH="${OCD_BRANCH:-master}"
DIR="${OCD_DIR:-$HOME/ocd-control}"
RAW="https://raw.githubusercontent.com/$REPO/$BRANCH"

echo "[OCD] Quick-install from github.com/$REPO@$BRANCH"

# Install dependencies
pkg update -y && pkg install -y git nodejs termux-api >/dev/null 2>&1

# Clone
rm -rf "$DIR"
git clone --branch "$BRANCH" --depth 1 "https://github.com/$REPO" "$DIR"
chmod +x "$DIR"/*.sh "$DIR"/*.mjs

# Storage permission
termux-setup-storage >/dev/null 2>&1 || true

echo ""
echo "✅ Done. Start everything:"
echo "   bash $DIR/start-all.sh"
echo ""
echo "Then open: http://127.0.0.1:8080/panel.html"
echo "Panel login: Host=127.0.0.1  Port=18790  Token=<from start-all.sh>"
echo ""
echo "Chat control (optional): openclaw plugins install --link $DIR/android-control-plugin && openclawx restart"
