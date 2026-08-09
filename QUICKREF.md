# OCD Control Panel — Quick Reference Card

## 🚀 One-Command Start
```bash
bash ~/ocd-control/start-all.sh
```
Shows token, IP, and browser URLs automatically.

---

## 📋 Manual Steps (if needed)

### 1. Start Daemon (phone Termux)
```bash
bash ~/ocd-control/start.sh
# COPY THE TOKEN printed (e.g. aBcDeFgHiJkLmNoPqR)
```

### 2. Start Panel Server
```bash
bash ~/ocd-control/serve-panel.sh 8080
```

### 3. Open in Browser
| From | URL |
|------|-----|
| Same phone | `http://127.0.0.1:8080/panel.html` |
| Laptop (LAN) | `http://PHONE_IP:8080/panel.html` |

Find phone IP: `ip addr show wlan0` → `192.168.x.x`

### 4. Connect Panel
- **Host**: `127.0.0.1` (or phone IP from laptop)
- **Port**: `18790`
- **Token**: Paste from step 1
- Click **Connect**

---

## 🔧 Debug Features (New Tab: "🔧 Debug & Full Dump")

| Button | Output |
|--------|--------|
| 📦 **Generate Full Device Dump** | Complete JSON: getprop, build, hardware, network, SIM, radio, security, storage, memory, CPU, partitions, mounts, kernel, uptime |
| ⬇️ **Download JSON** | Saves `device-dump-<timestamp>.json` |
| 🔍 **Get IMEI/MEID** | Tries service calls, getprops, dumpsys. Highlights valid 15-digit IMEIs |
| 📋 **Fetch Logcat** | Recent logs (set lines, filter like `*:E` for errors) |
| 📋 **List Processes** | `ps -A` |
| 🌐 **Network Connections** | `netstat -tunap` |
| 📂 **Open Files** | `lsof` |

---

## ⌨️ Input Keycodes (Input Control → Key tab)

| Key | Code | Key | Code |
|-----|------|-----|------|
| HOME | 3 | BACK | 4 |
| MENU | 82 | ENTER | 66 |
| DEL | 67 | VOL UP | 24 |
| VOL DOWN | 25 | POWER | 26 |
| CAMERA | 27 | SEARCH | 84 |
| RECENTS | 187 | NOTIFICATION | 83 |
| QUICK SETTINGS | 221 | | |

---

## 🛡️ Enable Full Features (Wireless Debugging)

**Needed for**: Screenshots, Tap/Swipe/Keys, IMEI extraction

1. **Settings → About → Build number** ×7 → Developer mode
2. **Settings → Developer options → Wireless debugging** → ON
3. **Pair with pairing code** → note IP:PORT + 6-digit code
4. In Termux:
```bash
adb pair 192.168.x.x:PORT   # enter 6-digit code
adb connect 192.168.x.x:PORT
OCD_ADB=127.0.0.1:5555 bash ~/ocd-control/start.sh
```

---

## 📁 Files

```
~/ocd-control/
├── daemon.mjs        # Backend (edit for custom endpoints)
├── panel.html        # Frontend (open in browser)
├── start.sh          # Start daemon only
├── serve-panel.sh    # Serve panel only
├── start-all.sh      # 🎯 Start both + show info
└── README.md         # Full guide
```

---

## 🆘 Quick Fixes

| Issue | Fix |
|-------|-----|
| "Connect failed" | Check token exact, host IP, port 18790. Test: `curl http://IP:18790/health` |
| Screenshot/input/IMEI fails | Enable Wireless Debugging + `OCD_ADB=127.0.0.1:5555` |
| "Permission denied" | Some shell cmds need root. Try `su -c "cmd"` if rooted |
| Panel won't load | Check `serve-panel.sh` running. Try `http://127.0.0.1:8080/panel.html` on phone |

---

## 🔐 Security
- **Token = full phone control** — keep secret
- Default binds to localhost only (127.0.0.1)
- For LAN: edit `daemon.mjs` line 385 → `"0.0.0.0"`
- **Never port-forward 18790 to internet** — use Tailscale/VPN/SSH tunnel

---

**Save this card** — run `cat ~/ocd-control/QUICKREF.md` anytime!