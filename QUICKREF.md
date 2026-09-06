# OCD Control Panel — Quick Reference Card

## One-Command Start
```bash
bash ~/ocd-control/start-all.sh
```
Prints a ready-to-open URL with your token embedded. Just copy-paste into browser.

---

## Install + Launch (first time)
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/danielkinzer-ui/Ocd_control_panel/master/quick-install.sh)
```

---

## Panel Sections

| Section | What It Does |
|---------|-------------|
| **Dashboard** | Live battery %, network, location, storage — auto-refreshes |
| **Quick Controls** | Toggle WiFi/BT/Airplane/GPS, volume/brightness sliders, power |
| **Input** | Tap, Swipe, Text, Key (HOME=3, BACK=4, ENTER=66) |
| **Device Setup** | Remote developer mode, USB/wireless debugging setup |
| **Screen** | Live screen mirroring (needs ADB) |
| **Camera** | Live camera feed, snap photos |
| **Mic** | Record audio clips |
| **Apps** | List, Launch, Stop, Uninstall |
| **Files** | Browse directories |
| **Comms** | SMS, Call, Notifications, Contacts |
| **Shell** | Run any Termux command |
| **Debug** | Full dump, IMEI, logcat, processes, netstat, lsof |

---

## Enable Full Features (Wireless Debugging)

**Needed for**: Screenshots, Tap/Swipe/Keys, IMEI

1. Settings → About → Build number ×7 → Developer mode
2. Settings → Developer options → Wireless debugging → ON
3. Pair with pairing code → note IP:PORT + 6-digit code
```bash
adb pair 192.168.x.x:PORT   # enter 6-digit code
adb connect 192.168.x.x:PORT
OCD_ADB=127.0.0.1:5555 bash ~/ocd-control/start-all.sh
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Dashboard |
| `2` | Quick Controls |
| `3` | Input Control |
| `4` | Live Screen |
| `5` | Apps |
| `6` | Debug |
| `R` | Refresh |
| `Esc` | Close modal |

---

## Quick Fixes

| Issue | Fix |
|-------|-----|
| "Connect failed" | Check token, IP, port 18790. Test: `curl http://IP:18790/health` |
| Screenshot/input fails | Enable Wireless Debugging + `OCD_ADB=127.0.0.1:5555` |
| Panel won't load | Check `python3 -m http.server 8080` is running |

---

## Security
- Token = full phone control — keep secret
- Never port-forward 18790 to internet — use VPN/Tailscale
