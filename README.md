# Privoo Browser

A privacy-first web browser built with Electron, featuring comprehensive ad blocking, tracker protection, and modern browsing features.

![Privoo Browser](logo.png)

## 🚀 Features

### Privacy & Security
- **Ad & Tracker Blocking** - EasyList, EasyPrivacy, and uBlock Origin lists
- **Force HTTPS** - Automatic HTTP to HTTPS upgrades
- **Third-Party Cookie Blocking** - Prevents cross-site tracking
- **DNS-over-HTTPS** - Encrypted DNS lookups via Cloudflare
- **User-Agent Spoofing** - Reduces browser fingerprinting
- **Canvas Fingerprint Protection** - Adds noise to canvas data
- **WebRTC IP Leak Protection** - Prevents local IP exposure
- **Do Not Track** - Sends DNT header with requests

### Browsing Features
- **Tabbed Browsing** - Full tab management with drag-to-reorder
- **Smart Address Bar** - Combined search and URL input
- **Search Suggestions** - Real-time suggestions from multiple engines
- **Download Manager** - Track and manage downloads
- **History** - Full browsing history with search
- **Extensions** - Extension management system (foundation)
- **Keyboard Shortcuts** - Comprehensive keyboard navigation

### New Tab Page
- **Live Clock** - 24-hour format with date
- **Time-Based Greeting** - Good morning/afternoon/evening
- **Quick Links** - Customizable shortcuts with favicons
- **Search Bar** - Instant search with suggestions
- **Privacy Stats** - Real-time blocked content counter

### Customization
- **Dark Mode** - System-wide dark filter
- **Search Engine Choice** - Google, Bing, DuckDuckGo, Brave
- **Download Location** - Custom download folder
- **Appearance Options** - Home button, bookmarks bar toggles

## 📦 Installation

### Prerequisites
- Node.js 16+ and npm
- Python (for native modules)

### Setup
```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build for production
npm run build
```

## 🎯 Usage

### Keyboard Shortcuts

#### Tab Management
- `Ctrl + T` - New tab
- `Ctrl + W` - Close tab
- `Ctrl + Shift + T` - Reopen closed tab
- `Ctrl + 1-8` - Switch to tab 1-8
- `Ctrl + 9` - Switch to last tab
- `Ctrl + Tab` - Next tab
- `Ctrl + Shift + Tab` - Previous tab

#### Navigation
- `Ctrl + L` - Focus address bar
- `Ctrl + R` or `F5` - Reload page
- `Alt + ←` - Back
- `Alt + →` - Forward

#### Browser Features
- `Ctrl + H` - History
- `Ctrl + J` - Downloads
- `Ctrl + N` - New window
- `F12` - Developer tools

#### Zoom
- `Ctrl + +` - Zoom in
- `Ctrl + -` - Zoom out
- `Ctrl + 0` - Reset zoom

## 🏗️ Architecture

### Project Structure
```
privoo/
├── main.js                 # Main process (Electron)
├── preload.js             # Preload script (IPC bridge)
├── webview-preload.js     # Webview preload
├── settings-store.js      # Settings persistence
├── history-store.js       # History database
├── download-store.js      # Download tracking
├── blocklist.js           # Ad/tracker blocklist
├── renderer/
│   ├── index.html         # Main browser UI
│   ├── renderer.js        # Renderer process logic
│   ├── styles.css         # Browser UI styles
│   └── internal/
│       ├── newtab.html    # New tab page
│       ├── settings.html  # Settings page
│       ├── downloads.html # Downloads manager
│       ├── history.html   # History viewer
│       └── extensions.html # Extensions manager
└── package.json
```

### Key Technologies
- **Electron** - Cross-platform desktop framework
- **Chromium** - Web rendering engine
- **@ghostery/adblocker-electron** - Ad blocking engine
- **Custom Protocol** - `privoo://` for internal pages

## 🔧 Configuration

Settings are stored in:
- **Windows**: `%APPDATA%/privoo/privoo-settings.json`
- **macOS**: `~/Library/Application Support/privoo/privoo-settings.json`
- **Linux**: `~/.config/privoo/privoo-settings.json`

### Default Settings
```json
{
  "searchEngine": "google",
  "adBlocking": true,
  "httpsUpgrade": true,
  "blockThirdPartyCookies": true,
  "dnsOverHttps": true,
  "spoofUserAgent": true,
  "canvasSpoofing": true,
  "webrtcProtection": true,
  "darkMode": false
}
```

## 🛡️ Privacy Features Explained

### Ad & Tracker Blocking
Uses industry-standard filter lists to block ads, trackers, and malicious content before they load.

### HTTPS Upgrades
Automatically attempts to upgrade insecure HTTP connections to HTTPS, protecting your data in transit.

### Third-Party Cookie Blocking
Prevents cookies from domains other than the one you're visiting, stopping cross-site tracking.

### DNS-over-HTTPS
Encrypts DNS queries so your ISP and network can't see which websites you're visiting.

### Fingerprint Protection
- **User-Agent Spoofing**: Presents a standard Chrome identity
- **Canvas Noise**: Adds subtle randomness to canvas fingerprinting
- **WebRTC Protection**: Prevents IP address leaks

## 🎨 Customization

### Search Engines
Choose from:
- Google
- Bing
- DuckDuckGo
- Brave Search

### Quick Links
Add custom shortcuts to your new tab page:
1. Click the "+" button on the new tab page
2. Enter name and URL
3. Shortcuts automatically fetch favicons

### Extensions
Install custom extensions:
1. Go to `privoo://extensions/`
2. Click "Install extension"
3. Provide extension details and path

## 🐛 Troubleshooting

### Ad Blocking Not Working
- Restart Privoo after enabling ad blocking
- Check that `@ghostery/adblocker-electron` is installed
- Verify settings in `privoo://settings/`

### Downloads Not Appearing
- Check download location in settings
- Ensure folder has write permissions
- Check `privoo://downloads/` for status

### Dark Mode Issues
- Dark mode applies a CSS filter to all pages
- Some sites may look incorrect
- Toggle off for specific sites if needed

## 📝 Development

### Running Tests
```bash
npm test
```

### Building
```bash
# Build for current platform
npm run build

# Build for all platforms
npm run build:all
```

### Debug Mode
```bash
# Enable Electron DevTools
npm start -- --debug
```

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- **Ghostery** - Ad blocking engine
- **EasyList** - Filter lists
- **Electron** - Framework
- **Chromium** - Rendering engine

## 📞 Support

- Issues: [GitHub Issues](https://github.com/sharp4real/privoo/issues)
- Discussions: [GitHub Discussions](https://github.com/sharp4real/privoo/discussions)

## 🗺️ Roadmap

- [ ] Creating multiple browser profiles
- [ ] Reading mode

---

**Built with privacy in mind. No telemetry. No tracking. No data collection.**
