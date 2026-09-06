# Virtual Phone — live, real-time, no physical device

This makes the OCD Control Panel run against a **real Android emulator in the
cloud** (a genuine AOSP system — real `getprop`, real installed apps, real
`screencap`/`input`), reachable from the GitHub Pages panel over HTTPS. No
mocking, no fake data. When your physical phone is lost/off, the panel still
shows a live, interactive Android device.

## Architecture

```
GitHub Pages  https://<you>.github.io/Ocd_control_panel/panel.html?api=<tunnel>
      │  fetch https://<tunnel>/health   (X-OCD-Token, CORS)
      ▼
Cloudflare Tunnel  (TLS, no open ports, no domain required)
      │
OCD daemon container  (node daemon.mjs, port 18790)
      │  adb -s emulator:5555 shell ...
      ▼
Android emulator container  (budtmo/docker-android, real AOSP, port 5555)
```

Every panel button hits the same API the physical-phone daemon uses, so the
emulator produces the live data. Screenshot returns a real `screencap` PNG
(inlined as base64 for the browser).

## Prerequisites (one-time, on a KVM-capable host)

- Linux host with **KVM**: `ls -l /dev/kvm` must exist. (Cloud VPS: GCP
  `n2-standard` + nested virt, or any bare-metal/CI runner with virt.)
- Docker + docker compose v2.
- A GitHub repo with Pages enabled, containing `panel.html` (already here).

## Run it

```bash
cd phone-controller-unified

# 1) Pick a stable token (write this down — you need it in the panel)
export OCD_TOKEN=$(openssl rand -hex 18)
export OCD_CORS_ORIGIN="https://<you>.github.io"   # or "*" to allow any origin

# 2) Start emulator + daemon (+ ephemeral HTTPS tunnel)
docker compose up -d

# 3) Get your public HTTPS URL
docker compose logs tunnel | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com'
```

Open in a browser:

```
https://<you>.github.io/Ocd_control_panel/panel.html?api=<TUNNEL_URL>
```

Enter the **same `OCD_TOKEN`** in the panel. You now have a live Android you can
tap, screenshot, install apps on, and shell into — with no physical phone.

### Stable tunnel (Cloudflare account, no ephemeral URL)

```bash
CLOUDFLARED_TOKEN=<from cloudflare dashboard> \
  docker compose --profile cloudflared-stable up -d
```

## What is real vs. not

- **Real:** device info, installed apps, file system, shell, full dump,
  screenshot, tap/swipe/text/key input, app launch/install/uninstall,
  brightness/volume (emulator state).
- **Emulator-limited (still real, just no hardware):** SMS/call need a real
  SIM or `telnyx`/Twilio bridge; camera returns a placeholder; GPS returns a
  fixed coordinate; IMEI is synthetic. These already return `{ok:true, hint:...}`
  so the panel degrades gracefully.

## Local testing without KVM

You can still validate the panel/daemon wiring locally:

```bash
OCD_TOKEN=abc OCD_HOST=127.0.0.1 node daemon.mjs
# panel.html?api=http://127.0.0.1:18790  (CORS + base64 screenshot path)
```

Screenshot/input will report "needs Wireless Debugging/root" because there is
no emulator; everything else (health, device, fs, shell, dump) works against
the local host.

## One-click from the tablet browser

1. After `docker compose up -d`, copy the tunnel URL into `virtual-phone.json`
   (`api` field). Commit + push so GitHub Pages redeploys.
2. On the tablet, open the repo site root:
   `https://<you>.github.io/Ocd_control_panel/` — this is `index.html`.
3. Tap **▶ Launch Virtual Phone**. It navigates to
   `panel.html?api=<tunnel>&token=<token>` and auto-connects.
   - If you left `token` empty in `virtual-phone.json`, the panel opens with the
     endpoint pre-filled and you paste the token once (saved in `localStorage`).
   - For a **true one-tap** experience, put the token in `virtual-phone.json`
     too — but note: a public repo exposes that token, so use a **private repo**
     for Pages, or accept the risk.

### Browser-driven device setup (no finger needed)

The panel's **🛠 Device Setup** card performs the exact taps a person would:
open Settings → About phone, **tap "Build number" ×7** to enable Developer
options, then toggle USB / Wireless debugging — all via `uiautomator` + `input
tap` through the daemon. There's also a generic **Tap UI text** box that presses
any on-screen element by its label (repeatable). So the emulator is fully
provisioned from the tablet browser before you ever use the other tabs.

## Files added/changed

- `daemon.mjs` — CORS + `OPTIONS` preflight + `?token=` fallback + base64
  screenshot (`OCD_CORS_ORIGIN`, `OCD_HOST`, `OCD_TOKEN_QUERY`).
- `panel.html` — single **Endpoint URL** field (supports `https://`), CORS
  fetch, base64 screenshot rendering, `?api=` override for Pages.
- `find_phone.sh` — fixed port `8443 → 18790` + token header.
- `Dockerfile`, `ocd-entrypoint.sh`, `docker-compose.yml` — real emulator stack.
- `.github/workflows/pages.yml`, `.nojekyll` — publish the panel to Pages.
