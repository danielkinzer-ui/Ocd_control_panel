#!/bin/bash
# OCD Control Panel — one-liner install + launch
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/danielkinzer-ui/Ocd_control_panel/master/quick-install.sh)
# Or:    wget -qO- https://raw.githubusercontent.com/danielkinzer-ui/Ocd_control_panel/master/quick-install.sh | bash

set -euo pipefail

REPO="${OCD_REPO:-danielkinzer-ui/Ocd_control_panel}"
BRANCH="${OCD_BRANCH:-master}"
DIR="${OCD_DIR:-$HOME/ocd-control}"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   OCD Control Panel — Installer          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Install dependencies
echo "  Installing dependencies..."
pkg update -y && pkg install -y git nodejs python termux-api >/dev/null 2>&1 || true

# Clone or update
if [ -d "$DIR/.git" ]; then
  echo "  Updating existing installation..."
  git -C "$DIR" fetch origin
  git -C "$DIR" checkout "$BRANCH"
  git -C "$DIR" pull origin "$BRANCH" --ff-only 2>/dev/null || true
else
  echo "  Cloning repository..."
  git clone --branch "$BRANCH" --depth 1 "https://github.com/$REPO" "$DIR"
fi
chmod +x "$DIR"/*.sh "$DIR"/*.mjs 2>/dev/null || true

# Storage permission
termux-setup-storage >/dev/null 2>&1 || true

echo ""
echo "  ✅ Installation complete!"
echo ""
echo "  Starting OCD Control Panel..."
echo ""

# Launch everything
exec bash "$DIR/start-all.sh"
