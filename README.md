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

## Quick Start (3 commands)

### Step 1: Get the code
```bash
cd ~
git clone https://github.com/YOUR_REPO/ocd-control.git
# OR if you already have it:
cd ~/ocd-control
```

### Step 2: Start the daemon (run on your PHONE in Termux)
```bash
bash ~/ocd-control/start.sh
```

**You'll see output like:**
```
[OCD] control daemon listening on 127.0.0.1:18790
[OCD] token: aBcDeFgHiJkLmNoPqR
[OCD] storage root: /storage/emulated/0
[OCD] self-adb: (none - set OCD_ADB for input/screenshot)
```

**⚠️ COPY THE TOKEN** (the random string after `token:`) — you need it to connect.

### Step 3: Open the panel in your browser

**Option A: Serve from phone (same device)**
```bash
bash ~/ocd-control/serve-panel.sh 8080
```
Then open: `http://127.0.0.1:8080/panel.html`

**Option B: Serve from phone, access from laptop**
```bash
bash ~/ocd-control/serve-panel.sh 8080
```
Find your phone's IP: `ip addr show wlan0` → look for `192.168.x.x`
Open on laptop: `http://192.168.x.x:8080/panel.html`

**Option C: GitHub Pages (no phone server needed)**
1. Push `panel.html` to a GitHub repo
2. Enable GitHub Pages (Settings → Pages → Deploy from branch)
3. Open: `https://yourusername.github.io/repo/panel.html`

---

## Connecting the Panel

1. Open the panel URL in your browser
2. Fill in:
   - **Host**: `127.0.0.1` (if panel on same device) or your phone's IP (`192.168.x.x`)
   - **Port**: `18790`
   - **Token**: Paste the token from Step 2
3. Click **Connect**
4. You should see: `Connected • Android 14 • /storage/emulated/0`

---

## Panel Tabs — What Each Does

| Tab | What You Can Do |
|-----|-----------------|
| **Device Info** | See model, Android version, serial, app count |
| **Applications** | List apps, filter by name, **Launch**, **Force Stop**, **Uninstall** |
| **File System** | Browse folders (`/sdcard`, `/storage/emulated/0`), click folders to navigate |
| **Screenshot** | Click **📸 Capture** — saves to `Pictures/ocd-panel-*.png` |
| **Input Control** | **Tap** (x,y), **Swipe** (x1,y1→x2,y2), **Text** (type remotely), **Key** (HOME=3, BACK=4, VOL=24/25, ENTER=66) |
| **Communications** | **SMS** (send), **Call** (dial), **Notifications** (list) |
| **USB/Storage** | See mounted USB drives, SD cards |
| **Launcher** | View homescreen layout, create web shortcuts on home screen |
| **Raw Shell** | Run any Termux command: `pm list packages`, `getprop`, `dumpsys battery`, etc. |
| **🔧 Debug & Full Dump** | **See below** |

---

## 🔧 Debug & Full Dump Tab (New!)

| Sub-tab | Button | What It Returns |
|---------|--------|-----------------|
| **Full Dump** | 📦 Generate Full Device Dump | **Everything**: all `getprop`, build info, hardware, network, SIM, radio, security, storage, memory, CPU, partitions, mounts, kernel, uptime (~50KB JSON) |
| | ⬇️ Download JSON | Saves dump as `device-dump-<timestamp>.json` |
| **IMEI/MEID** | 🔍 Get IMEI/MEID | Tries multiple methods: `service call iphonesubinfo`, `getprop`, `dumpsys`. Highlights valid 15-digit IMEIs. |
| **Logcat** | 📋 Fetch Logcat | Recent system logs. Set lines (default 200), filter (e.g., `*:E` for errors only). |
| **Processes** | 📋 List Processes | `ps -A` output |
| **Netstat** | 🌐 Network Connections | `netstat -tunap` — active TCP/UDP connections |
| **Open Files** | 📂 Open Files (lsof) | `lsof` — all open file descriptors |

---

## 🎯 Pro: Enable Full Input + Screenshot + IMEI (Wireless Debugging)

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
OCD_ADB=127.0.0.1:5555 bash ~/ocd-control/start.sh
```
*(Note: Use `127.0.0.1:5555` even if adb shows different port — Termux forwards internally)*

Now you'll see:
```
[OCD] self-adb: 127.0.0.1:5555
```
✅ Screenshots work, ✅ Input works, ✅ IMEI extraction works.

---

## 📱 Using from Another Device (Laptop/Desktop)

### Option 1: Phone serves panel (recommended)
```bash
# On phone Termux:
bash ~/ocd-control/serve-panel.sh 8080
```
On laptop browser: `http://PHONE_IP:8080/panel.html`

### Option 2: GitHub Pages (panel hosted online, connects to your phone)
1. Fork/upload `panel.html` to your GitHub repo
2. Enable Pages: Settings → Pages → Source: Deploy from branch → main → /(root)
3. Visit: `https://yourname.github.io/repo/panel.html`
4. Enter your phone's **public IP** (or use Tailscale/VPN) + port 18790 + token

⚠️ **Security**: If exposing over internet, use a VPN (Tailscale, WireGuard) or SSH tunnel. Don't expose port 18790 publicly.

---

## 🔐 Security Notes

- **Token = password**: Anyone with token + IP:port controls your phone
- **Local network only**: Default binds to `127.0.0.1` (localhost only)
- **To allow LAN access**: Edit `daemon.mjs` line 385: change `"127.0.0.1"` to `"0.0.0.0"`
- **Use VPN/Tailscale** for remote access — never port-forward 18790 to internet

---

## 🛠 Troubleshooting

| Problem | Fix |
|---------|-----|
| "Connect failed" | Check host IP, port 18790, token exact match. Try `curl http://IP:18790/health` in Termux |
| Screenshot fails | Enable Wireless Debugging + `OCD_ADB=127.0.0.1:5555` |
| Tap/swipe/key does nothing | Same as above — needs self-ADB |
| IMEI empty | Needs self-ADB (or root). Modern Android blocks `service call` without it |
| "Permission denied" on shell | Some commands need root. Try `su -c "cmd"` if rooted |
| Panel won't load | Check `serve-panel.sh` is running. Try `http://127.0.0.1:8080/panel.html` on phone browser |

---

## 📁 File Locations

```
~/ocd-control/
├── daemon.mjs          # Backend (Node.js) — runs on phone
├── panel.html          # Frontend — open in browser
├── start.sh            # Starts daemon
├── serve-panel.sh      # Serves panel.html via HTTP
└── start-panel.sh      # (optional) starts both together
```

---

## 🚀 One-Command Start (Everything)

Create `~/ocd-control/start-all.sh`:
```bash
#!/bin/bash
cd ~/ocd-control
echo "Starting OCD daemon..."
bash start.sh &
sleep 2
echo "Starting panel server on port 8080..."
bash serve-panel.sh 8080
```
```bash
chmod +x ~/ocd-control/start-all.sh
~/ocd-control/start-all.sh
```

---

## 📞 Need Help?

- Check daemon logs in Termux (where you ran `start.sh`)
- Browser DevTools (F12) → Console for panel errors
- Common issues: wrong IP, wrong token, firewall blocking port 18790/8080

**That's it!** You now have a full Android control panel in your browser. 🎉