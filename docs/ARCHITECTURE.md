# OCD Control Panel — End-to-End Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│  ┌──────────────────────┐     ┌───────────────────────────┐     ┌─────────────────┐ │
│  │  GitHub Pages        │     │  Cloudflare Tunnel        │     │  Android Phone  │ │
│  │  (panel.html)        │────▶│  (wss://trycloudflare.com)│────▶│  Termux + adb   │ │
│  │                      │     │                           │     │  daemon.mjs     │ │
│  │  Browser:            │     │  TLS, no open ports       │     │  port 18790     │ │
│  │  panel.html?api=     │     │                           │     │                 │ │
│  │  127.0.0.1:18790    │     │  Public HTTPS URL         │     │                 │ │
│  └──────────────────────┘     └───────────────────────────┘     └────────┬────────┘ │
│                                                                           │          │
│                                                                           │          │
│  ┌──────────────────────────────────────────────────────────────────────▼──────────┐ │
│  │                          DAEMON (daemon.mjs)                                    │ │
│  │  port 18790 | token auth | CORS | adb/spawn                                   │ │
│  │                                                                               │ │
│  │  ┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐     │ │
│  │  │ /device     │ │ /apps    │ │ /fs/*    │ │ /shell   │ │ /systeminfo  │     │ │
│  │  │ /health     │ │ /sms     │ │ /usb     │ │ /debug/* │ │ /location    │     │ │
│  │  │ /camera     │ │ /call    │ │ /screenshot│ /input/* │ │ /battery    │     │ │
│  │  │ /shortcut   │ │ /notif   │ │ /ui/*    │ │ /setup/* │ │ /network    │     │ │
│  │  │ /wifi       │ │ /bt      │ │ /volume  │ │ /bright  │ │ /contacts   │     │ │
│  │  │ /calendar   │ │ /alarms  │ │ /media   │ │ /ring    │ │ /power      │     │ │
│  │  │ /gps        │ │ /clipbrd │ │ /screenrecord│ /airplane│ /logcat     │     │ │
│  │  └─────────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘     │ │
│  │                                                                               │ │
│  │  Shell allowlist: pm,am,getprop,dumpsys,ls,cat,ps,netstat,lsof,logcat,...   │ │
│  │  Buffer limits: MAX_BODY=1MB, MAX_RUN=5MB                                     │ │
│  │  FS roots: /storage,/data/data,/sdcard                                        │ │
│  └───────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                     │
│         │                        │                        │                          │
│         │  HTTP (X-OCD-Token)      │  HTTP (X-OCD-Token)     │  HTTP (X-OCD-Token)    │
│         ▼                        ▼                        ▼                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐             │
│  │  Plugin           │  │  MCP Server       │  │  Phone Client       │             │
│  │  (OpenClaw)       │  │  (ocd-mcp)        │  │  (Python stdlib)    │             │
│  │                   │  │                   │  │                      │             │
│  │  35+ actions:     │  │  54+ tools        │  │  40+ methods:        │             │
│  │  device,systeminfo│  │  ocd_device       │  │  get_status          │             │
│  │  apps,launch,stop │  │  ocd_systeminfo   │  │  get_device_info     │             │
│  │  ls,read,write    │  │  ocd_list_apps    │  │  get_systeminfo      │             │
│  │  copy,usb         │  │  ocd_launch_app   │  │  get_apps            │             │
│  │  screenshot,cam   │  │  ocd_fs_read      │  │  list_files          │             │
│  │  input(tap/swipe/ │  │  ocd_fs_write     │  │  read_file           │             │
│  │   text/key)       │  │  ocd_fs_copy      │  │  execute_command     │             │
│  │  sms,call         │  │  ocd_screenshot   │  │  take_screenshot     │             │
│  │  notifications    │  │  ocd_camera_photo │  │  launch_app          │             │
│  │  location,battery │  │  ocd_input_tap    │  │  stop_app            │             │
│  │  network,wifi     │  │  ocd_input_swipe  │  │  find_phone          │             │
│  │  bluetooth,clip   │  │  ocd_input_text   │  │  remote_shell        │             │
│  │  volume,bright    │  │  ocd_send_sms     │  │  monitor             │             │
│  │  airplane,gps     │  │  ocd_location     │  │  create_shortcut     │             │
│  │  contacts,calendar│  │  ocd_battery      │  │  debug_dump          │             │
│  │  alarms,alarm     │  │  ocd_network      │  │  debug_logcat        │             │
│  │  media,ring       │  │  ocd_wifi         │  │  launcher            │             │
│  │  power            │  │  ocd_bluetooth    │  │  setup_developer     │             │
│  │  launcher,setup,  │  │  ocd_clipboard_*  │  │  setup_adb_usb       │             │
│  │  debug,ui         │  │  ocd_volume_*     │  │  setup_wireless_debug│             │
│  │                   │  │  ocd_brightness_* │  │  imei,lsof,netstat   │             │
│  │                   │  │  ocd_airplane     │  │  ui_tap,ui_open      │             │
│  │                   │  │  ocd_gps          │  │                      │             │
│  │                   │  │  ocd_power        │  │                      │             │
│  │                   │  │  ocd_contacts     │  │                      │             │
│  │                   │  │  ocd_calendar     │  │                      │             │
│  │                   │  │  ocd_alarms       │  │                      │             │
│  │                   │  │  ocd_media        │  │                      │             │
│  │                   │  │  ocd_ring         │  │                      │             │
│  │                   │  │  ocd_shell        │  │                      │             │
│  │                   │  │  ocd_dump         │  │                      │             │
│  │                   │  │  ocd_processes    │  │                      │             │
│  │                   │  │  ocd_logcat       │  │                      │             │
│  │                   │  │  ocd_usb          │  │                      │             │
│  │                   │  │  ocd_create_short │  │                      │             │
│  │                   │  │  od_launcher      │  │                      │             │
│  │                   │  │  ocd_setup_*      │  │                      │             │
│  │                   │  │  ocd_debug_*      │  │                      │             │
│  │                   │  │  ocd_ui_tap       │  │                      │             │
│  │                   │  │  ocd_ui_open      │  │                      │             │
│  │                   │  │                   │  │                      │             │
│  │  Plugin config:   │  │  MCP v2.0.0       │  │  Args: --ip --port   │             │
│  │  daemonUrl, token │  │  stdio transport  │  │  --token            │             │
│  │  via openclaw.json│  │  ListToolsRequest │  │  --command --status  │             │
│  │                   │  │  CallToolRequest  │  │  --device --apps     │             │
│  │                   │  │                   │  │  --tap --sms --find  │             │
│  │                   │  │                   │  │  --monitor --shell   │             │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘             │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
Browser ──fetch──▶ GitHub Pages (panel.html)
  │                   │
  │  CORS + HTTPS     │  fetch
  │                   ▼
  │            Cloudflare Tunnel
  │                   │
  │  TLS + token      │  HTTP + X-OCD-Token
  │                   ▼
  │            daemon.mjs :18790
  │                   │
  │  spawn/adb        │  shell commands
  │                   ▼
  │            Android Device
  │
  ├──▶ Plugin (OpenClaw agent) ──▶ daemon.mjs
  │         │                        │
  │         │  fetch + token         │  spawn/adb
  │         ▼                        ▼
  │      android tool          Android Device
  │
  ├──▶ MCP Server (OpenClaw agent) ──▶ daemon.mjs
  │         │                          │
  │         │  fetch + token           │  spawn/adb
  │         ▼                          ▼
  │      ocd_* tool              Android Device
  │
  └──▶ Phone Client (python3) ──▶ daemon.mjs
             │                      │
             │  HTTP + token        │  spawn/adb
             ▼                      ▼
        PhoneController         Android Device
        --ip --port --token
```

## Component Matrix

| Component         | File                          | Transport | Auth        | Purpose                          |
|-------------------|-------------------------------|-----------|-------------|----------------------------------|
| Daemon            | `daemon.mjs`                  | HTTP      | X-OCD-Token | Core server, adb/spawn bridge    |
| Plugin            | `android-control-plugin/index.ts` | OpenClaw | daemonUrl+token | OpenClaw `android` tool         |
| MCP Server        | `ocd-mcp/server.mjs`          | stdio     | X-OCD-Token | 54+ `ocd_*` MCP tools            |
| Client            | `client/phone_client.py`      | HTTP      | X-OCD-Token | Python CLI client                |
| Panel             | `panel.html`                  | HTTPS     | localStorage | Browser UI                       |
| Virtual Phone     | `virtual-phone.json`          | Cloudflare| token       | Cloud Android emulator           |
| Docker Stack      | `docker-compose.yml`          | Docker    | env         | Emulator + daemon + tunnel       |
| GitHub Pages      | `.github/workflows/pages.yml` | HTTPS     | Pages       | Host panel.html                  |

## Plugin Action → Daemon Route Mapping

```
Plugin action          Daemon route           Method
─────────────────────────────────────────────────────────
device                 /device                 GET
systeminfo             /systeminfo             GET
apps                   /apps                   GET
launch                 /app/launch             POST
stop                   /app/stop               POST
install                /app/install            POST
uninstall              /app/uninstall          POST
ls                     /fs/list                GET
read                   /fs/read                GET
write                  /fs/write               POST
copy                   /fs/copy                POST
usb                    /usb                    GET
screenshot             /screenshot             POST
input/tap              /input/tap              POST
input/swipe            /input/swipe            POST
input/text             /input/text             POST
input/key              /input/key              POST
sms                    /sms                    POST
call                   /call                   POST
notifications          /notifications          GET
notification           /notification           POST
shell                  /shell                  POST
location               /location               GET
battery                /battery                GET
network                /network                GET
wifi                   /wifi                   POST
bluetooth              /bluetooth              POST
clipboard (get)        /clipboard              GET
clipboard (set)        /clipboard              POST
volume (get)           /volume                 GET
volume (set)           /volume                 POST
brightness (get)       /brightness             GET
brightness (set)       /brightness             POST
airplane               /airplane               POST
gps                    /gps                    POST
contacts               /contacts               GET
calendar               /calendar               GET
alarms                 /alarms                 GET
alarm                  /alarm                  POST
media                  /media                  POST
camera                 /camera                 POST
screenrecord           /screenrecord           POST
mic                    /mic                    POST
ring                   /ring                   POST
power                  /power                  POST
shortcut               /shortcut               POST
launcher               /launcher               GET
setup_developer        /setup/developer        POST
setup_adb_usb          /setup/adb-usb          POST
setup_wireless_debug   /setup/wireless-debug   POST
debug_dump             /debug/dump             GET
debug_imei             /debug/imei             GET
debug_logcat           /debug/logcat           GET
debug_processes        /debug/processes        GET
debug_lsof             /debug/lsof             GET
debug_netstat          /debug/netstat          GET
ui_tap                 /ui/tap                 POST
ui_open                /ui/open                POST
```

## MCP Tool → Daemon Route Mapping

```
MCP Tool               Daemon route           Method
─────────────────────────────────────────────────────────
ocd_device             /device                 GET
ocd_systeminfo         /systeminfo             GET
ocd_list_apps          /apps                   GET
ocd_launch_app         /app/launch             POST
ocd_stop_app           /app/stop               POST
ocd_install_app        /app/install            POST
ocd_uninstall_app      /app/uninstall          POST
ocd_fs_list            /fs/list                GET
ocd_fs_read            /fs/read                GET
ocd_fs_write           /fs/write               POST
ocd_fs_copy            /fs/copy                POST
ocd_usb                /usb                    GET
ocd_screenshot         /screenshot             POST
ocd_camera_photo       /camera                 POST
ocd_camera_info        /camera                 POST
ocd_screenrecord       /screenrecord           POST
ocd_mic_record         /mic                    POST
ocd_input_tap          /input/tap              POST
ocd_input_swipe        /input/swipe            POST
ocd_input_text         /input/text             POST
ocd_input_key          /input/key              POST
ocd_send_sms           /sms                    POST
ocd_call               /call                   POST
ocd_notifications      /notifications          GET
ocd_send_notification  /notification           POST
ocd_location           /location               GET
ocd_battery            /battery                GET
ocd_network            /network                GET
ocd_wifi               /wifi                   POST
ocd_bluetooth          /bluetooth              POST
ocd_clipboard_get      /clipboard              GET
ocd_clipboard_set      /clipboard              POST
ocd_volume_get         /volume                 GET
ocd_volume_set         /volume                 POST
ocd_brightness_get     /brightness             GET
ocd_brightness_set     /brightness             POST
ocd_airplane           /airplane               POST
ocd_gps                /gps                    POST
ocd_contacts           /contacts               GET
ocd_calendar           /calendar               GET
ocd_alarms             /alarms                 GET
ocd_set_alarm          /alarm                  POST
ocd_media              /media                  POST
ocd_ring               /ring                   POST
ocd_create_shortcut    /shortcut               POST
ocd_shell              /shell                  POST
ocd_dump               /debug/dump             GET
ocd_processes          /debug/processes        GET
ocd_logcat             /debug/logcat           GET
ocd_imei               /debug/imei             GET
ocd_lsof               /debug/lsof             GET
ocd_netstat            /debug/netstat          GET
ocd_launcher           /launcher               GET
ocd_setup_developer    /setup/developer        POST
ocd_setup_adb_usb      /setup/adb-usb          POST
ocd_setup_wireless_debug /setup/wireless-debug POST
ocd_ui_tap             /ui/tap                 POST
ocd_ui_open            /ui/open                POST
```

## Security Layers

```
┌─────────────────────────────────────────────┐
│  Layer 1: Transport Security                  │
│  • HTTPS via Cloudflare Tunnel                │
│  • TLS encryption end-to-end                  │
│  • No open ports on device                    │
├─────────────────────────────────────────────┤
│  Layer 2: Authentication                      │
│  • X-OCD-Token header (18-byte random)        │
│  • ?token= query param fallback               │
│  • Token stored in ~/.ocd-token (0600)       │
├─────────────────────────────────────────────┤
│  Layer 3: Shell Command Allowlist             │
│  • Only allowlisted commands via spawn        │
│  • pm, am, getprop, dumpsys, ls, cat, ps,   │
│    netstat, lsof, logcat, service, sqlite3,  │
│    run-as, df, mount, uname, sm, screencap,  │
│    input, cmd                               │
│  • Unlisted commands rejected                 │
├─────────────────────────────────────────────┤
│  Layer 4: Filesystem Sandbox                  │
│  • ALLOWED_FS_ROOTS: /storage, /data/data,   │
│    /sdcard, / (storage root)                  │
│  • safePath() resolves within allowed roots   │
│  • Cannot access /etc, /bin, /usr, etc.       │
├─────────────────────────────────────────────┤
│  Layer 5: Buffer Limits                       │
│  • MAX_BODY_BYTES = 1MB                       │
│  • MAX_RUN_BUFFER = 5MB                       │
│  • Prevents memory exhaustion                 │
└─────────────────────────────────────────────┘
```
