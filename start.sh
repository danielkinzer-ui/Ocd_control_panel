#!/bin/bash
# Start the OpenClaw Device (OCD) control daemon in REAL Termux.
# Run this from your real Termux shell (NOT inside proot-distro).
#
# Usage:
#   bash ~/ocd-control/start.sh            # random token, printed to terminal
#   OCD_PORT=18790 OCD_TOKEN=mysecret bash ~/ocd-control/start.sh
#
# For full input/screenshot ("as admin") also enable Wireless Debugging:
#   Settings > Developer options > Wireless debugging  -> note IP:PORT
#   adb pair ip:port   (enter pairing code)
#   adb connect ip:port
#   then:  OCD_ADB=127.0.0.1:5555 bash ~/ocd-control/start.sh
#
# The OpenClaw plugin (running in proot) calls http://127.0.0.1:$OCD_PORT

export OCD_PORT="${OCD_PORT:-18790}"
export OCD_TOKEN="${OCD_TOKEN:-}"
export OCD_ROOT="${OCD_ROOT:-}"
export OCD_ADB="${OCD_ADB:-}"

# Ensure storage + Termux:API paths are available
command -v termux-setup-storage >/dev/null 2>&1 && termux-setup-storage >/dev/null 2>&1 || true

cd "$(dirname "$0")"
exec node daemon.mjs
