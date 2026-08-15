#!/bin/bash
# OpenClaw Device (OCD) Control Panel - One-line installer
# Run from GitHub: bash <(curl -fsSL https://raw.githubusercontent.com/danielkinzer-ui/Ocd_control_panel/master/install.sh)

set -euo pipefail

REPO_URL="${OCD_REPO:-https://github.com/danielkinzer-ui/Ocd_control_panel}"
BRANCH="${OCD_BRANCH:-master}"
INSTALL_DIR="${OCD_DIR:-$HOME/ocd-control}"

echo "[OCD] Installing from $REPO_URL (branch: $BRANCH) to $INSTALL_DIR"

# Clone or update
if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "[OCD] Updating existing installation..."
  git -C "$INSTALL_DIR" fetch origin
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull origin "$BRANCH"
else
  echo "[OCD] Cloning..."
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

# Make scripts executable
chmod +x "$INSTALL_DIR"/*.sh "$INSTALL_DIR"/*.mjs 2>/dev/null || true

# Install Node.js if needed
if ! command -v node >/dev/null 2>&1; then
  echo "[OCD] Installing Node.js..."
  pkg install -y nodejs
fi

# Install Termux:API if needed (for SMS, calls, notifications)
if ! command -v termux-sms-send >/dev/null 2>&1; then
  echo "[OCD] Installing Termux:API..."
  pkg install -y termux-api
fi

# Grant storage access
echo "[OCD] Requesting storage permission..."
termux-setup-storage >/dev/null 2>&1 || true

echo ""
echo "[OCD] Installation complete!"
echo ""
echo "=========================================="
echo "  NEXT STEPS"
echo "=========================================="
echo ""
echo "1. Start everything (daemon + gateway + panel):"
echo "   bash $INSTALL_DIR/start-all.sh"
echo "   → Copy the TOKEN it prints"
echo ""
echo "2. Open in browser:"
echo "   http://127.0.0.1:8080/panel.html"
echo ""
echo "3. Panel login:  Host=127.0.0.1  Port=18790  Token=<your-token>"
echo ""
echo "=========================================="
echo "  OPTIONAL: Chat control (OpenClaw plugin)"
echo "=========================================="
echo ""
echo "  openclaw plugins install --link $INSTALL_DIR/android-control-plugin"
echo "  openclawx restart"
echo "  Then point any OpenClaw client at http://<phone-ip>:18789 + gateway token."
echo ""
echo "=========================================="
echo "  OPTIONAL: Full features (input/screenshot/IMEI)"
echo "=========================================="
echo ""
echo "Enable Wireless Debugging on Android, then:"
echo "  adb pair <ip:port>      # enter 6-digit code"
echo "  adb connect <ip:port>"
echo "  OCD_ADB=127.0.0.1:5555 bash $INSTALL_DIR/start.sh"
echo ""
echo "=========================================="
echo "  ACCESS FROM LAPTOP / ANOTHER PHONE"
echo "=========================================="
echo ""
echo "Phone IP: \$(ip addr show wlan0 | grep 'inet ' | awk '{print \$2}' | cut -d/ -f1)"
echo "On laptop/phone browser: http://<phone-ip>:8080/panel.html"
echo "(Or send this onboarding page: http://<phone-ip>:8080/setup.html)"
echo ""
echo "=========================================="
