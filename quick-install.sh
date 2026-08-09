#!/bin/bash
# OpenClaw Device (OCD) Control Panel - One-liner installer
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/ocd-control/main/quick-install.sh)
# Or:    wget -qO- https://raw.githubusercontent.com/YOUR_USERNAME/ocd-control/main/quick-install.sh | bash

set -euo pipefail

REPO="${OCD_REPO:-YOUR_USERNAME/ocd-control}"
BRANCH="${OCD_BRANCH:-main}"
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
echo "✅ Done. Run the daemon:"
echo "   bash $DIR/start.sh"
echo ""
echo "Then in another Termux session:"
echo "   bash $DIR/serve-panel.sh 8080"
echo ""
echo "Open: http://127.0.0.1:8080/panel.html"
echo "Enter: Host=127.0.0.1  Port=18790  Token=<from daemon>"