# OCD Control Panel — Beginner's Guide

## What is this?
A **web-based control panel** for your Android phone. Run it in any browser (phone, laptop, desktop) to:
- View device info, installed apps, files
- Take screenshots
- Tap/swipe/type on screen remotely
- Send SMS, make calls
- **Full device dump** (debug info, IMEI, logs, processes, network)
- Run shell commands

---

## Quick Start (1 command)

### Install & run everything:
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/danielkinzer-ui/Ocd_control_panel/master/quick-install.sh)
```

Or if you already have the code:
```bash
cd ~/ocd-control
bash start-all.sh
```

**That's it!** The script will:
1. Start the OCD daemon (Node.js server on your phone)
2. Start the panel HTTP server
3. Print a URL with your token embedded

### Just copy the URL and paste it in your browser. The panel auto-connects — no manual login needed.

---

## What you'll see

```
  ╔══════════════════════════════════════════╗
  ║   ✅ OCD Control Panel is ready!         ║
  ╠══════════════════════════════════════════╣
  ║                                          ║
  ║   Open this URL in your browser:         ║
  ║   http://192.168.1.50:8080/panel.html?api=http://192.168.1.50:18790&token=aBcDeFgHiJkLmNoPqR
  ║                                          ║
  ╠══════════════════════════════════════════╣
  ║   Token: aBcDeFgHiJkLmNoPqR
  ║   Daemon: http://192.168.1.50:18790
  ║   Panel:  http://192.168.1.50:8080
  ╚══════════════════════════════════════════╝
```

---

## Prerequisites (One-time setup on your Android phone)

### 1. Install Termux
- **F-Droid (recommended)**: Search "Termux" in F-Droid app
- **GitHub**: https://github.com/termux/termux-app/releases
- ⚠️ **NOT Google Play Store** (outdated)

### 2. Install Termux:API (for SMS, calls, notifications)
- F-Droid: Search "Termux:API"
- Or in Termux: `pkg install termux-api`

### 3. Grant Termux storage access
```bash
termux-setup-storage
```
Allow the permission popup.

---

## Panel Features

| Section | What You Can Do |
|---------|----------------|
| **Dashboard** | Live status: battery %, network, location, storage — auto-refreshes every 15s |
| **Quick Controls** | Toggle WiFi/BT/Airplane/GPS, adjust volume/brightness, power controls |
| **Input Control** | Tap (x,y), Swipe (x1,y1→x2,y2), Text (type remotely), Key (HOME=3, BACK=4) |
| **Device Setup** | Enable developer mode, USB debugging, wireless debugging — all by remote tap |
| **Screen / Camera** | Live screen mirroring (needs ADB), live camera feed with snap/record |
| **Microphone** | Record audio clips, playback, download |
| **Apps** | List/filter apps, Launch, Force Stop, Uninstall |
| **Files** | Browse folders, navigate directories |
| **Communications** | Send SMS, make calls, view notifications, load contacts |
| **Shell** | Run any Termux command: `pm list packages`, `getprop`, `dumpsys battery`, etc. |
| **Debug & Dump** | Full device dump, IMEI, logcat, processes, netstat, open files |

---

## Enable Full Input + Screenshot + IMEI (Wireless Debugging)

**Without this**: Screenshots may fail, tap/swipe/key won't work, IMEI returns empty.

### On your Android phone:
1. **Settings → About phone → Build number** → Tap 7 times → "Developer mode enabled"
2. **Settings → System → Developer options → Wireless debugging** → ON
3. **Wireless debugging → Pair with pairing code** → Note the `IP:PORT` and 6-digit code

### In Termux:
```bash
# Pair (enter the 6-digit code when prompted)
adb pair 192.168.x.x:PORT

# Connect
adb connect 192.168.x.x:PORT

# Verify
adb devices
# Should show: 192.168.x.x:PORT  device
```

### Restart daemon WITH self-ADB:
```bash
OCD_ADB=127.0.0.1:5555 bash ~/ocd-control/start-all.sh
```

---

## Using from Another Device (Laptop/Desktop)

The `start-all.sh` script binds to all network interfaces by default. Just open the printed URL from any device on the same network.

For internet access, use a VPN (Tailscale, WireGuard) or SSH tunnel. Don't expose port 18790 publicly.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Dashboard |
| `2` | Quick Controls |
| `3` | Input Control |
| `4` | Live Screen |
| `5` | Apps |
| `6` | Debug & Dump |
| `R` | Refresh Dashboard |
| `Esc` | Close modal |

---

## Chat Control (OpenClaw plugin)

```bash
openclaw plugins install --link ~/ocd-control/android-control-plugin
openclawx restart
```

The plugin proxies to the daemon at `127.0.0.1:18790`.

---

## Security Notes

- **Token = password**: Anyone with token + IP:port controls your phone
- **Local network only**: Default binds to all interfaces (0.0.0.0)
- **Use VPN/Tailscale** for remote access — never port-forward 18790 to internet
- Token is saved in `~/.ocd-token` with 0600 permissions

---

## 🛠 Troubleshooting

| Problem | Fix |
|---------|-----|
| "Connect failed" | Check IP, port 18790, token. Try `curl http://IP:18790/health` in Termux |
| Screenshot fails | Enable Wireless Debugging + `OCD_ADB=127.0.0.1:5555` |
| Tap/swipe/key does nothing | Same as above — needs self-ADB |
| IMEI empty | Needs self-ADB (or root). Modern Android blocks `service call` without it |
| Panel won't load | Check `python3 -m http.server 8080` is running |

---

## 📁 File Locations

```
~/ocd-control/
├── daemon.mjs          # Backend (Node.js) — runs on phone
├── panel.html          # Frontend — open in browser
├── start.sh            # Starts daemon only
├── start-all.sh        # Starts everything (daemon + panel server)
├── quick-install.sh    # Install + launch in one command
└── serve-panel.sh      # Serves panel.html via HTTP
```
