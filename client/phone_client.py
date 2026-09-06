#!/usr/bin/env python3
"""
Phone Controller Client - Runs on Laptop
Connects to and controls Android phone via network
Uses only Python standard library (no external dependencies)
"""

import urllib.request
import urllib.error
import json
import sys
import os
import time
from datetime import datetime
from typing import Optional, Dict, Any

class PhoneController:
    def __init__(self, phone_ip: str, phone_port: int = 18790, auth_token: str = None):
        """
        Initialize phone controller
        
        Args:
            phone_ip: IP address of the phone
            phone_port: Port number (default: 18790)
            auth_token: Authentication token
        """
        self.phone_ip = phone_ip
        self.phone_port = phone_port
        self.base_url = f"http://{phone_ip}:{phone_port}"
        self.auth_token = auth_token
        
    def _request(self, method: str, path: str, data: Dict = None) -> Dict[str, Any]:
        """Make HTTP request to phone"""
        url = f"{self.base_url}{path}"
        headers = {
            'Content-Type': 'application/json',
            'X-OCD-Token': self.auth_token or ''
        }
        
        try:
            if data:
                body = json.dumps(data).encode('utf-8')
            else:
                body = None
                
            req = urllib.request.Request(url, data=body, headers=headers, method=method)
            
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode('utf-8'))
                
        except urllib.error.HTTPError as e:
            return {'error': f'HTTP {e.code}: {e.reason}'}
        except urllib.error.URLError as e:
            return {'error': str(e.reason)}
        except Exception as e:
            return {'error': str(e)}
    
    # ======== CORE ========
    def get_status(self) -> Dict[str, Any]:
        """Get phone status information"""
        return self._request('GET', '/health')
    
    def get_device_info(self) -> Dict[str, Any]:
        """Get detailed device info"""
        return self._request('GET', '/device')
    
    def get_systeminfo(self) -> Dict[str, Any]:
        """Get comprehensive system info"""
        return self._request('GET', '/systeminfo')
    
    # ======== APPS ========
    def get_apps(self) -> Dict[str, Any]:
        """Get list of installed apps"""
        return self._request('GET', '/apps')
    
    def launch_app(self, pkg: str, activity: str = None) -> Dict[str, Any]:
        """Launch an app"""
        data = {'pkg': pkg}
        if activity: data['activity'] = activity
        return self._request('POST', '/app/launch', data)
    
    def stop_app(self, pkg: str) -> Dict[str, Any]:
        """Force stop an app"""
        return self._request('POST', '/app/stop', {'pkg': pkg})
    
    def install_app(self, apk: str) -> Dict[str, Any]:
        """Install an APK"""
        return self._request('POST', '/app/install', {'apk': apk})
    
    def uninstall_app(self, pkg: str) -> Dict[str, Any]:
        """Uninstall an app"""
        return self._request('POST', '/app/uninstall', {'pkg': pkg})
    
    def get_launcher(self) -> Dict[str, Any]:
        """Get launcher apps"""
        return self._request('GET', '/launcher')
    
    # ======== FILE SYSTEM ========
    def list_files(self, path: str = "/") -> Dict[str, Any]:
        """List files in directory"""
        return self._request('GET', f'/fs/list?path={path}')
    
    def read_file(self, path: str, max_bytes: int = 200000) -> Dict[str, Any]:
        """Read file contents"""
        return self._request('GET', f'/fs/read?path={path}&maxBytes={max_bytes}')
    
    def write_file(self, path: str, content: str, mode: str = 'write') -> Dict[str, Any]:
        """Write content to file"""
        return self._request('POST', '/fs/write', {'path': path, 'content': content, 'mode': mode})
    
    def copy_file(self, src: str, dst: str) -> Dict[str, Any]:
        """Copy a file"""
        return self._request('POST', '/fs/copy', {'src': src, 'dst': dst})
    
    def get_usb(self) -> Dict[str, Any]:
        """List mounted USB drives"""
        return self._request('GET', '/usb')
    
    # ======== SCREENSHOT / CAMERA ========
    def take_screenshot(self, path: str = None) -> Dict[str, Any]:
        """Take a screenshot"""
        data = {}
        if path: data['path'] = path
        return self._request('POST', '/screenshot', data)
    
    def camera_photo(self, camera_id: int = 0, path: str = None) -> Dict[str, Any]:
        """Take a photo"""
        data = {'camera_id': camera_id}
        if path: data['path'] = path
        return self._request('POST', '/camera', data)
    
    def camera_info(self) -> Dict[str, Any]:
        """Get camera information"""
        return self._request('POST', '/camera', {'action': 'info'})
    
    def screenrecord(self, action: str, duration: int = 30, path: str = None) -> Dict[str, Any]:
        """Start/stop screen recording"""
        data = {'action': action, 'duration': duration}
        if path: data['path'] = path
        return self._request('POST', '/screenrecord', data)

    def mic_record(self, seconds: int = 10, encoder: str = 'aac', save: str = None) -> Dict[str, Any]:
        """Record a microphone clip (needs Termux:API + Mic permission)"""
        data = self._request('POST', '/mic', {'action': 'record', 'seconds': seconds, 'encoder': encoder})
        if save and data.get('audioBase64'):
            import base64
            with open(save, 'wb') as f:
                f.write(base64.b64decode(data['audioBase64']))
            data['saved_to'] = save
        return data
    
    # ======== INPUT ========
    def input_tap(self, x: int, y: int) -> Dict[str, Any]:
        """Tap at screen coordinates"""
        return self._request('POST', '/input/tap', {'x': x, 'y': y})
    
    def input_swipe(self, x1: int, y1: int, x2: int, y2: int, duration: int = 300) -> Dict[str, Any]:
        """Swipe from one point to another"""
        return self._request('POST', '/input/swipe', {'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'duration': duration})
    
    def input_text(self, text: str) -> Dict[str, Any]:
        """Type text on the device"""
        return self._request('POST', '/input/text', {'text': text})
    
    def input_key(self, key: str) -> Dict[str, Any]:
        """Send a key event"""
        return self._request('POST', '/input/key', {'key': key})
    
    # ======== SMS / CALL / NOTIFICATIONS ========
    def send_sms(self, to: str, body: str) -> Dict[str, Any]:
        """Send an SMS"""
        return self._request('POST', '/sms', {'to': to, 'body': body})
    
    def make_call(self, number: str) -> Dict[str, Any]:
        """Place a phone call"""
        return self._request('POST', '/call', {'number': number})
    
    def get_notifications(self) -> Dict[str, Any]:
        """List current notifications"""
        return self._request('GET', '/notifications')
    
    def send_notification(self, title: str, content: str, id: int = None, priority: str = None, sound: bool = False, vibrate: bool = False) -> Dict[str, Any]:
        """Send a notification to the device"""
        data = {'title': title, 'content': content}
        if id is not None: data['id'] = id
        if priority is not None: data['priority'] = priority
        data['sound'] = sound
        data['vibrate'] = vibrate
        return self._request('POST', '/notification', data)
    
    # ======== LOCATION ========
    def get_location(self) -> Dict[str, Any]:
        """Get device location"""
        return self._request('GET', '/location')
    
    # ======== BATTERY ========
    def get_battery(self) -> Dict[str, Any]:
        """Get battery status"""
        return self._request('GET', '/battery')
    
    # ======== NETWORK ========
    def get_network(self) -> Dict[str, Any]:
        """Get network status"""
        return self._request('GET', '/network')
    
    def wifi(self, action: str, ssid: str = None, password: str = None) -> Dict[str, Any]:
        """Control WiFi"""
        return self._request('POST', '/wifi', {'action': action, 'ssid': ssid, 'password': password})
    
    # ======== BLUETOOTH ========
    def bluetooth(self, action: str, device: str = None, name: str = None) -> Dict[str, Any]:
        """Control Bluetooth"""
        return self._request('POST', '/bluetooth', {'action': action, 'device': device, 'name': name})
    
    # ======== CLIPBOARD ========
    def get_clipboard(self) -> Dict[str, Any]:
        """Get clipboard content"""
        return self._request('GET', '/clipboard')
    
    def set_clipboard(self, text: str) -> Dict[str, Any]:
        """Set clipboard content"""
        return self._request('POST', '/clipboard', {'text': text})
    
    # ======== VOLUME ========
    def get_volume(self) -> Dict[str, Any]:
        """Get volume levels"""
        return self._request('GET', '/volume')
    
    def set_volume(self, stream: str, action: str, level: int = None) -> Dict[str, Any]:
        """Set volume"""
        data = {'stream': stream, 'action': action}
        if level is not None: data['level'] = level
        return self._request('POST', '/volume', data)
    
    # ======== BRIGHTNESS ========
    def get_brightness(self) -> Dict[str, Any]:
        """Get screen brightness"""
        return self._request('GET', '/brightness')
    
    def set_brightness(self, level: int = None, auto: bool = None) -> Dict[str, Any]:
        """Set screen brightness"""
        data = {}
        if level is not None: data['level'] = level
        if auto is not None: data['auto'] = auto
        return self._request('POST', '/brightness', data)
    
    # ======== SYSTEM TOGGLES ========
    def airplane(self, enabled: bool) -> Dict[str, Any]:
        """Toggle airplane mode"""
        return self._request('POST', '/airplane', {'enabled': enabled})
    
    def gps(self, enabled: bool) -> Dict[str, Any]:
        """Toggle GPS/location"""
        return self._request('POST', '/gps', {'enabled': enabled})
    
    # ======== PIM ========
    def get_contacts(self, limit: int = 50) -> Dict[str, Any]:
        """List contacts"""
        return self._request('GET', f'/contacts?limit={limit}')
    
    def get_calendar(self, limit: int = 20) -> Dict[str, Any]:
        """List calendar events"""
        return self._request('GET', f'/calendar?limit={limit}')
    
    def get_alarms(self) -> Dict[str, Any]:
        """List active alarms"""
        return self._request('GET', '/alarms')
    
    def set_alarm(self, hour: int, minute: int, message: str = None, vibrate: bool = False) -> Dict[str, Any]:
        """Set an alarm"""
        data = {'hour': hour, 'minute': minute, 'vibrate': vibrate}
        if message: data['message'] = message
        return self._request('POST', '/alarm', data)
    
    # ======== MEDIA ========
    def control_media(self, action: str, url: str = None) -> Dict[str, Any]:
        """Control media playback"""
        data = {'action': action}
        if url: data['url'] = url
        return self._request('POST', '/media', data)
    
    # ======== RING ========
    def ring(self) -> Dict[str, Any]:
        """Ring the phone"""
        return self._request('POST', '/ring')
    
    # ======== POWER ========
    def power(self, action: str) -> Dict[str, Any]:
        """Power control"""
        return self._request('POST', '/power', {'action': action})
    
    # ======== SHORTCUT ========
    def create_shortcut(self, name: str, url: str) -> Dict[str, Any]:
        """Create a home-screen shortcut"""
        return self._request('POST', '/shortcut', {'name': name, 'url': url})
    
    # ======== DEBUG ========
    def debug_dump(self) -> Dict[str, Any]:
        """Full device dump"""
        return self._request('GET', '/debug/dump')
    
    def debug_imei(self) -> Dict[str, Any]:
        """Get IMEI"""
        return self._request('GET', '/debug/imei')
    
    def debug_logcat(self, lines: int = 200, filter_str: str = None) -> Dict[str, Any]:
        """Get logcat entries"""
        path = f'/debug/logcat?lines={lines}'
        if filter_str: path += f'&filter={filter_str}'
        return self._request('GET', path)
    
    def debug_processes(self) -> Dict[str, Any]:
        """List running processes"""
        return self._request('GET', '/debug/processes')
    
    def debug_lsof(self) -> Dict[str, Any]:
        """List open files"""
        return self._request('GET', '/debug/lsof')
    
    def debug_netstat(self) -> Dict[str, Any]:
        """Get network connections"""
        return self._request('GET', '/debug/netstat')
    
    # ======== SETUP ========
    def setup_developer(self) -> Dict[str, Any]:
        """Enable developer options"""
        return self._request('POST', '/setup/developer')
    
    def setup_adb_usb(self) -> Dict[str, Any]:
        """Setup ADB over USB"""
        return self._request('POST', '/setup/adb-usb')
    
    def setup_wireless_debug(self) -> Dict[str, Any]:
        """Setup wireless debugging"""
        return self._request('POST', '/setup/wireless-debug')
    
    # ======== UI ========
    def ui_tap(self, text: str, repeat: int = 1, delay: int = 250, contains: bool = False) -> Dict[str, Any]:
        """Tap on UI element by text"""
        return self._request('POST', '/ui/tap', {'text': text, 'repeat': repeat, 'delay': delay, 'contains': contains})
    
    def ui_open(self, screen: str) -> Dict[str, Any]:
        """Open a system settings screen"""
        return self._request('POST', '/ui/open', {'screen': screen})
    
    # ======== CONVENIENCE ========
    def find_phone(self) -> Dict[str, Any]:
        """Find phone by getting info and location"""
        device = self.get_device_info()
        location = self.get_location()
        battery = self.get_battery()
        return {'device': device, 'location': location, 'battery': battery}
    
    def remote_shell(self) -> None:
        """Interactive remote shell"""
        print("🖥️  Remote Shell (type 'exit' to quit)")
        print("-" * 50)
        
        while True:
            try:
                cmd = input("phone> ").strip()
                if cmd.lower() in ['exit', 'quit', 'q']:
                    break
                if not cmd:
                    continue
                    
                result = self.execute_command(cmd)
                if 'error' in result:
                    print(f"❌ Error: {result['error']}")
                else:
                    if result.get('stdout'):
                        print(result['stdout'])
                    if result.get('stderr'):
                        print(f"STDERR: {result['stderr']}")
            except KeyboardInterrupt:
                print("\nExiting...")
                break
            except EOFError:
                break
    
    def execute_command(self, command: str) -> Dict[str, Any]:
        """Execute shell command on phone"""
        return self._request('POST', '/shell', {'cmd': command})
    
    def monitor(self, interval: int = 60) -> None:
        """Monitor phone status periodically"""
        print(f"📊 Monitoring phone every {interval} seconds (Ctrl+C to stop)")
        print("-" * 50)
        
        try:
            while True:
                status = self.get_status()
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                print(f"\n[{timestamp}] Status:")
                print(json.dumps(status, indent=2))
                time.sleep(interval)
        except KeyboardInterrupt:
            print("\nMonitoring stopped.")


def interactive_menu(controller: PhoneController):
    """Interactive command menu"""
    menu = """
 ╔══════════════════════════════════════════════════╗
 ║           📱 Phone Controller Menu               ║
 ╠══════════════════════════════════════════════════╣
 ║  1. Get Status                                   ║
 ║  2. Get Device Info                              ║
 ║  3. Get System Info                              ║
 ║  4. List Apps                                    ║
 ║  5. List Files                                   ║
 ║  6. Read File                                    ║
 ║  7. Write File                                   ║
 ║  8. Execute Command                              ║
 ║  9. Take Screenshot                              ║
 ║  10. Camera Photo                                ║
 ║  11. Screen Record                               ║
 ║  12. Remote Shell                                ║
 ║  13. Launch App                                  ║
 ║  14. Stop App                                    ║
 ║  15. Send SMS                                    ║
 ║  16. Make Call                                   ║
 ║  17. Notifications                               ║
 ║  18. Location                                    ║
 ║  19. Battery                                     ║
 ║  20. Network                                     ║
 ║  21. WiFi                                        ║
 ║  22. Bluetooth                                   ║
 ║  23. Clipboard                                   ║
 ║  24. Volume                                      ║
 ║  25. Brightness                                  ║
 ║  26. Airplane Mode                               ║
 ║  27. GPS                                        ║
 ║  28. Contacts                                    ║
 ║  29. Calendar                                    ║
 ║  30. Alarms                                      ║
 ║  31. Media                                       ║
 ║  32. Ring                                        ║
 ║  33. Power                                       ║
 ║  34. Shortcut                                    ║
 ║  35. Debug Dump                                  ║
 ║  36. Debug Logcat                                ║
 ║  37. Find Phone                                  ║
 ║  38. Monitor Status                              ║
 ║  0. Exit                                         ║
 ╚══════════════════════════════════════════════════╝
"""
    
    while True:
        print(menu)
        choice = input("Select option (0-38): ").strip()
        
        if choice == '1':
            print(json.dumps(controller.get_status(), indent=2))
        elif choice == '2':
            print(json.dumps(controller.get_device_info(), indent=2))
        elif choice == '3':
            print(json.dumps(controller.get_systeminfo(), indent=2))
        elif choice == '4':
            apps = controller.get_apps()
            print(json.dumps(apps, indent=2))
        elif choice == '5':
            path = input("Path (default: /): ").strip() or "/"
            print(json.dumps(controller.list_files(path), indent=2))
        elif choice == '6':
            path = input("File path: ").strip()
            print(json.dumps(controller.read_file(path), indent=2))
        elif choice == '7':
            path = input("File path: ").strip()
            content = input("Content: ")
            mode = input("Mode (write/append, default: write): ").strip() or 'write'
            print(json.dumps(controller.write_file(path, content, mode), indent=2))
        elif choice == '8':
            cmd = input("Command: ").strip()
            if cmd:
                print(json.dumps(controller.execute_command(cmd), indent=2))
        elif choice == '9':
            print(json.dumps(controller.take_screenshot(), indent=2))
        elif choice == '10':
            cam = input("Camera ID (0=rear, 1=front, default 0): ").strip() or '0'
            print(json.dumps(controller.camera_photo(int(cam)), indent=2))
        elif choice == '11':
            action = input("Action (start/stop, default: start): ").strip() or 'start'
            dur = input("Duration (seconds, default 30): ").strip() or '30'
            path = input("Output path (optional): ").strip()
            print(json.dumps(controller.screenrecord(action, int(dur), path or None), indent=2))
        elif choice == '12':
            controller.remote_shell()
        elif choice == '13':
            pkg = input("Package name: ").strip()
            if pkg:
                act = input("Activity (optional): ").strip()
                print(json.dumps(controller.launch_app(pkg, act or None), indent=2))
        elif choice == '14':
            pkg = input("Package name: ").strip()
            if pkg:
                print(json.dumps(controller.stop_app(pkg), indent=2))
        elif choice == '15':
            to = input("To: ").strip()
            body = input("Body: ").strip()
            if to and body:
                print(json.dumps(controller.send_sms(to, body), indent=2))
        elif choice == '16':
            num = input("Number: ").strip()
            if num:
                print(json.dumps(controller.make_call(num), indent=2))
        elif choice == '17':
            print(json.dumps(controller.get_notifications(), indent=2))
        elif choice == '18':
            print(json.dumps(controller.get_location(), indent=2))
        elif choice == '19':
            print(json.dumps(controller.get_battery(), indent=2))
        elif choice == '20':
            print(json.dumps(controller.get_network(), indent=2))
        elif choice == '21':
            action = input("WiFi action (enable/disable/scan/connect/disconnect): ").strip()
            ssid = input("SSID (for connect): ").strip() or None
            pwd = input("Password (for connect): ").strip() or None
            print(json.dumps(controller.wifi(action, ssid, pwd), indent=2))
        elif choice == '22':
            action = input("BT action (enable/disable/scan/pair/connect/disconnect/status): ").strip()
            device = input("Device address: ").strip() or None
            name = input("Device name: ").strip() or None
            print(json.dumps(controller.bluetooth(action, device, name), indent=2))
        elif choice == '23':
            print("Clipboard:", json.dumps(controller.get_clipboard(), indent=2))
            text = input("Set clipboard text (or press Enter to skip): ").strip()
            if text:
                print(json.dumps(controller.set_clipboard(text), indent=2))
        elif choice == '24':
            print(json.dumps(controller.get_volume(), indent=2))
            stream = input("Stream (music/ring/alarm/notification/voice_call/system): ").strip() or 'music'
            action = input("Action (up/down/mute/set): ").strip() or 'up'
            level = input("Level (for set, optional): ").strip() or None
            print(json.dumps(controller.set_volume(stream, action, int(level) if level else None), indent=2))
        elif choice == '25':
            print(json.dumps(controller.get_brightness(), indent=2))
            level = input("Brightness 0-255 (or Enter for auto toggle): ").strip()
            if level:
                print(json.dumps(controller.set_brightness(int(level)), indent=2))
            else:
                auto = input("Toggle auto? (y/n): ").strip().lower() == 'y'
                print(json.dumps(controller.set_brightness(auto=auto), indent=2))
        elif choice == '26':
            enabled = input("Enable? (y/n): ").strip().lower() == 'y'
            print(json.dumps(controller.airplane(enabled), indent=2))
        elif choice == '27':
            enabled = input("Enable GPS? (y/n): ").strip().lower() == 'y'
            print(json.dumps(controller.gps(enabled), indent=2))
        elif choice == '28':
            limit = input("Limit (default 50): ").strip() or '50'
            print(json.dumps(controller.get_contacts(int(limit)), indent=2))
        elif choice == '29':
            limit = input("Limit (default 20): ").strip() or '20'
            print(json.dumps(controller.get_calendar(int(limit)), indent=2))
        elif choice == '30':
            print(json.dumps(controller.get_alarms(), indent=2))
            hour = input("Hour (0-23): ").strip()
            minute = input("Minute (0-59): ").strip()
            if hour and minute:
                msg = input("Message (optional): ").strip() or None
                vib = input("Vibrate? (y/n): ").strip().lower() == 'y'
                print(json.dumps(controller.set_alarm(int(hour), int(minute), msg, vib), indent=2))
        elif choice == '31':
            action = input("Media action (play/pause/next/previous/stop): ").strip()
            url = input("URL (optional): ").strip() or None
            print(json.dumps(controller.control_media(action, url), indent=2))
        elif choice == '32':
            print(json.dumps(controller.ring(), indent=2))
        elif choice == '33':
            action = input("Power action (reboot/shutdown/screenoff/screenon): ").strip()
            print(json.dumps(controller.power(action), indent=2))
        elif choice == '34':
            name = input("Shortcut name: ").strip()
            url = input("URL: ").strip()
            if name and url:
                print(json.dumps(controller.create_shortcut(name, url), indent=2))
        elif choice == '35':
            print(json.dumps(controller.debug_dump(), indent=2))
        elif choice == '36':
            lines = input("Lines (default 200): ").strip() or '200'
            flt = input("Filter (optional, e.g. *:E): ").strip() or None
            print(json.dumps(controller.debug_logcat(int(lines), flt), indent=2))
        elif choice == '37':
            print(json.dumps(controller.find_phone(), indent=2))
        elif choice == '38':
            interval = input("Interval seconds: ").strip() or '60'
            controller.monitor(int(interval))
        elif choice == '0':
            print("👋 Goodbye!")
            break
        else:
            print("❌ Invalid option")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Phone Controller Client')
    parser.add_argument('--ip', required=True, help='Phone IP address')
    parser.add_argument('--port', type=int, default=18790, help='Phone port (default: 18790)')
    parser.add_argument('--token', help='Auth token')
    
    # Core
    parser.add_argument('--status', action='store_true', help='Get phone status')
    parser.add_argument('--device', action='store_true', help='Get device info')
    parser.add_argument('--systeminfo', action='store_true', help='Get system info')
    
    # Apps
    parser.add_argument('--apps', action='store_true', help='List installed apps')
    parser.add_argument('--launch', help='Launch app by package name')
    parser.add_argument('--stop', help='Force stop app by package name')
    parser.add_argument('--install', help='Install APK')
    parser.add_argument('--uninstall', help='Uninstall app by package name')
    
    # Files
    parser.add_argument('--files', nargs='?', default=None, help='List files in path')
    parser.add_argument('--read', help='Read file')
    parser.add_argument('--write', nargs=2, metavar=('PATH', 'CONTENT'), help='Write file')
    
    # Screenshot/Camera
    parser.add_argument('--screenshot', action='store_true', help='Take screenshot')
    parser.add_argument('--camera', action='store_true', help='Take camera photo')
    parser.add_argument('--screenrecord', action='store_true', help='Start screen recording')
    parser.add_argument('--mic', nargs='?', const=10, type=int, metavar='SECONDS', help='Record mic clip (default 10s)')
    
    # Input
    parser.add_argument('--tap', nargs=2, type=int, metavar=('X', 'Y'), help='Tap at coordinates')
    parser.add_argument('--swipe', nargs=4, type=int, metavar=('X1', 'Y1', 'X2', 'Y2'), help='Swipe')
    parser.add_argument('--text', help='Type text')
    parser.add_argument('--key', help='Send key event')
    
    # Communications
    parser.add_argument('--sms', nargs=2, metavar=('TO', 'BODY'), help='Send SMS')
    parser.add_argument('--call', help='Make a call')
    parser.add_argument('--notifications', action='store_true', help='List notifications')
    
    # Location/Battery/Network
    parser.add_argument('--location', action='store_true', help='Get location')
    parser.add_argument('--battery', action='store_true', help='Get battery')
    parser.add_argument('--network', action='store_true', help='Get network')
    parser.add_argument('--wifi', help='WiFi action')
    parser.add_argument('--bluetooth', help='Bluetooth action')
    
    # System
    parser.add_argument('--clipboard', action='store_true', help='Get clipboard')
    parser.add_argument('--set-clipboard', help='Set clipboard text')
    parser.add_argument('--volume', action='store_true', help='Get volume')
    parser.add_argument('--brightness', action='store_true', help='Get brightness')
    parser.add_argument('--airplane', action='store_true', help='Toggle airplane')
    parser.add_argument('--gps', action='store_true', help='Toggle GPS')
    
    # PIM
    parser.add_argument('--contacts', help='List contacts (limit)')
    parser.add_argument('--calendar', help='List calendar (limit)')
    parser.add_argument('--alarms', action='store_true', help='List alarms')
    
    # Media/Power/Shortcut
    parser.add_argument('--ring', action='store_true', help='Ring phone')
    parser.add_argument('--power', help='Power action (reboot/shutdown/screenoff/screenon)')
    parser.add_argument('--shortcut', nargs=2, metavar=('NAME', 'URL'), help='Create shortcut')
    
    # Debug
    parser.add_argument('--dump', action='store_true', help='Full device dump')
    parser.add_argument('--logcat', help='Get logcat (lines)')
    parser.add_argument('--logcat-filter', help='Logcat filter')
    parser.add_argument('--processes', action='store_true', help='List processes')
    parser.add_argument('--imei', action='store_true', help='Get IMEI')
    parser.add_argument('--lsof', action='store_true', help='List open files')
    parser.add_argument('--netstat', action='store_true', help='List network connections')
    # Launcher
    parser.add_argument('--launcher', action='store_true', help='List home screen apps')
    # Setup
    parser.add_argument('--setup-developer', action='store_true', help='Enable developer options')
    parser.add_argument('--setup-adb-usb', action='store_true', help='Enable ADB over USB')
    parser.add_argument('--setup-wireless-debug', action='store_true', help='Enable wireless debugging')
    # UI
    parser.add_argument('--ui-tap', help='Tap UI element by text')
    parser.add_argument('--ui-tap-repeat', type=int, default=1, help='Repeat count')
    parser.add_argument('--ui-tap-delay', type=int, default=250, help='Delay between taps')
    parser.add_argument('--ui-open', help='Open system settings (about/developer/wifi/display/bluetooth)')
    
    # Shell/Monitor
    parser.add_argument('--command', help='Execute single command')
    parser.add_argument('--shell', action='store_true', help='Interactive shell')
    parser.add_argument('--monitor', type=int, metavar='SECONDS', help='Monitor status')
    
    # Find
    parser.add_argument('--find', action='store_true', help='Find phone')
    
    args = parser.parse_args()
    
    controller = PhoneController(args.ip, args.port, args.token)
    
    # Core
    if args.status:
        print(json.dumps(controller.get_status(), indent=2))
    elif args.device:
        print(json.dumps(controller.get_device_info(), indent=2))
    elif args.systeminfo:
        print(json.dumps(controller.get_systeminfo(), indent=2))
    # Apps
    elif args.apps:
        apps = controller.get_apps()
        print(json.dumps(apps, indent=2))
    elif args.launch:
        print(json.dumps(controller.launch_app(args.launch), indent=2))
    elif args.stop:
        print(json.dumps(controller.stop_app(args.stop), indent=2))
    elif args.install:
        print(json.dumps(controller.install_app(args.install), indent=2))
    elif args.uninstall:
        print(json.dumps(controller.uninstall_app(args.uninstall), indent=2))
    # Files
    elif args.files:
        print(json.dumps(controller.list_files(args.files), indent=2))
    elif args.read:
        print(json.dumps(controller.read_file(args.read), indent=2))
    elif args.write:
        print(json.dumps(controller.write_file(args.write[0], args.write[1]), indent=2))
    # Screenshot/Camera
    elif args.screenshot:
        print(json.dumps(controller.take_screenshot(), indent=2))
    elif args.camera:
        print(json.dumps(controller.camera_photo(), indent=2))
    elif args.screenrecord:
        print(json.dumps(controller.screenrecord('start'), indent=2))
    elif args.mic:
        print(json.dumps(controller.mic_record(args.mic), indent=2))
    # Input
    elif args.tap:
        print(json.dumps(controller.input_tap(args.tap[0], args.tap[1]), indent=2))
    elif args.swipe:
        print(json.dumps(controller.input_swipe(args.swipe[0], args.swipe[1], args.swipe[2], args.swipe[3]), indent=2))
    elif args.text:
        print(json.dumps(controller.input_text(args.text), indent=2))
    elif args.key:
        print(json.dumps(controller.input_key(args.key), indent=2))
    # Communications
    elif args.sms:
        print(json.dumps(controller.send_sms(args.sms[0], args.sms[1]), indent=2))
    elif args.call:
        print(json.dumps(controller.make_call(args.call), indent=2))
    elif args.notifications:
        print(json.dumps(controller.get_notifications(), indent=2))
    # Location/Battery/Network
    elif args.location:
        print(json.dumps(controller.get_location(), indent=2))
    elif args.battery:
        print(json.dumps(controller.get_battery(), indent=2))
    elif args.network:
        print(json.dumps(controller.get_network(), indent=2))
    elif args.wifi:
        print(json.dumps(controller.wifi(args.wifi), indent=2))
    elif args.bluetooth:
        print(json.dumps(controller.bluetooth(args.bluetooth), indent=2))
    # System
    elif args.clipboard:
        print(json.dumps(controller.get_clipboard(), indent=2))
    elif args.set_clipboard:
        print(json.dumps(controller.set_clipboard(args.set_clipboard), indent=2))
    elif args.volume:
        print(json.dumps(controller.get_volume(), indent=2))
    elif args.brightness:
        print(json.dumps(controller.get_brightness(), indent=2))
    elif args.airplane:
        print(json.dumps(controller.airplane(True), indent=2))
    elif args.gps:
        print(json.dumps(controller.gps(True), indent=2))
    # PIM
    elif args.contacts:
        print(json.dumps(controller.get_contacts(int(args.contacts)), indent=2))
    elif args.calendar:
        print(json.dumps(controller.get_calendar(int(args.calendar)), indent=2))
    elif args.alarms:
        print(json.dumps(controller.get_alarms(), indent=2))
    # Media/Power/Shortcut
    elif args.ring:
        print(json.dumps(controller.ring(), indent=2))
    elif args.power:
        print(json.dumps(controller.power(args.power), indent=2))
    elif args.shortcut:
        print(json.dumps(controller.create_shortcut(args.shortcut[0], args.shortcut[1]), indent=2))
    # Debug
    elif args.dump:
        print(json.dumps(controller.debug_dump(), indent=2))
    elif args.logcat:
        flt = args.logcat_filter if args.logcat_filter else None
        print(json.dumps(controller.debug_logcat(int(args.logcat), flt), indent=2))
    elif args.processes:
        print(json.dumps(controller.debug_processes(), indent=2))
    elif args.imei:
        print(json.dumps(controller.debug_imei(), indent=2))
    elif args.lsof:
        print(json.dumps(controller.debug_lsof(), indent=2))
    elif args.netstat:
        print(json.dumps(controller.debug_netstat(), indent=2))
    elif args.launcher:
        print(json.dumps(controller.get_launcher(), indent=2))
    elif args.setup_developer:
        print(json.dumps(controller.setup_developer(), indent=2))
    elif args.setup_adb_usb:
        print(json.dumps(controller.setup_adb_usb(), indent=2))
    elif args.setup_wireless_debug:
        print(json.dumps(controller.setup_wireless_debug(), indent=2))
    elif args.ui_tap:
        print(json.dumps(controller.ui_tap(args.ui_tap, args.ui_tap_repeat, args.ui_tap_delay), indent=2))
    elif args.ui_open:
        print(json.dumps(controller.ui_open(args.ui_open), indent=2))
    # Shell/Monitor/Find
    elif args.command:
        print(json.dumps(controller.execute_command(args.command), indent=2))
    elif args.shell:
        controller.remote_shell()
    elif args.monitor:
        controller.monitor(args.monitor)
    elif args.find:
        print(json.dumps(controller.find_phone(), indent=2))
    else:
        interactive_menu(controller)


if __name__ == '__main__':
    main()
