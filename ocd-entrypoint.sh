#!/bin/bash
# Entrypoint for the OCD daemon container.
# Waits for the Android emulator's adb port to be reachable, connects to it,
# then starts the real control daemon (no mocks -- every call hits the emulator).
set -euo pipefail

ADB_TARGET="${OCD_ADB:-emulator:5555}"
MAX_WAIT="${EMULATOR_WAIT:-180}"

echo "[OCD] waiting for emulator adb at $ADB_TARGET (up to ${MAX_WAIT}s)..."
elapsed=0
until adb -s "$ADB_TARGET" get-state 2>/dev/null | grep -q device; do
  # First attempt also performs the connect (emulator adb is pre-authorized).
  adb connect "$ADB_TARGET" >/dev/null 2>&1 || true
  sleep 3
  elapsed=$((elapsed + 3))
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    echo "[OCD] WARNING: emulator not ready after ${MAX_WAIT}s; starting daemon anyway." >&2
    break
  fi
done

# Try one real command so we fail fast with a clear message if adb is broken.
if adb -s "$ADB_TARGET" shell getprop ro.build.version.release >/dev/null 2>&1; then
  echo "[OCD] emulator reachable: Android $(adb -s "$ADB_TARGET" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r')"
else
  echo "[OCD] WARNING: adb shell failed -- check KVM/DEVICE on the host." >&2
fi

exec node /app/daemon.mjs
