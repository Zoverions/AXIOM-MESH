# AXIOM-MESH Custom GUI Skin

A beautiful, node-type-specific custom interface for AXIOM-MESH that automatically adapts its theme and metrics based on your node role.

## 🎨 Features

### Automatic Node Type Detection
The GUI automatically detects your node type and applies:
- **Unique color themes** for each node type
- **Specialized metrics** relevant to that node's function
- **Custom dashboards** showing node-specific statistics

### Supported Node Types

| Node Type | Theme Color | Key Metrics |
|-----------|-------------|-------------|
| 🎓 Education Node | Blue (#00d4ff) | Tasks Completed, Learning Score, Progress |
| ✅ Validator Node | Purple (#bd00ff) | Blocks Validated, Accuracy, Pending TX |
| 💾 Storage Node | Orange (#ffb800) | Storage Used, Files Stored, Retrieval Requests |
| 🧮 Compute Node | Red (#ff4757) | Jobs Processed, Active Jobs, GPU Utilization |

### Real-Time Updates
- Live system resource monitoring (CPU, Memory)
- Network activity tracking (Upload/Download speeds)
- Earnings display with 24h statistics
- Activity log with timestamped events
- Animated status indicators

## 📁 Files

- `index.html` - Main GUI interface (single-file, no dependencies)
- `install-skin.sh` - Automated installation script

## 🚀 Installation

### Automatic Installation (Recommended)

The GUI skin is automatically installed when you:
1. Boot from the AXIOM-MESH Live USB
2. Run the full installation process

Or manually run:
```bash
cd /opt/axiom-mesh/live-installer/gui-skin
sudo bash install-skin.sh
```

### Manual Installation

```bash
# Copy GUI files
sudo mkdir -p /opt/axiom-mesh/gui-skin
sudo cp -r * /opt/axiom-mesh/gui-skin/

# Start the GUI server
cd /opt/axiom-mesh/gui-skin
python3 -m http.server 8080 --bind 0.0.0.0 &

# Open in browser
xdg-open http://localhost:8080
```

## 🔌 Access Points

After installation, access the GUI through:

| Interface | URL | Description |
|-----------|-----|-------------|
| Custom GUI | http://localhost:8080 | Node-type-specific interface |
| Standard Dashboard | http://localhost:3000 | Original AXIOM-MESH dashboard |
| Via Nginx* | http://localhost/gui | Reverse-proxied custom GUI |

*Nginx integration requires nginx to be installed

## ⚙️ Service Management

The installer creates a systemd service (`axiom-gui.service`) for automatic startup:

```bash
# Check status
systemctl status axiom-gui.service

# Restart service
sudo systemctl restart axiom-gui.service

# View logs
journalctl -u axiom-gui.service -f

# Disable auto-start
sudo systemctl disable axiom-gui.service
```

## 🎯 How It Works

### 1. Node Detection
On load, the GUI attempts to detect your node type via:
- API call to `/api/node/info`
- Fallback to localStorage
- Default to Education Node if undetermined

### 2. Theme Application
Based on node type, CSS variables are dynamically updated:
```css
.node-type-education { --primary: #00d4ff; }
.node-type-validator { --primary: #bd00ff; }
.node-type-storage   { --primary: #ffb800; }
.node-type-compute   { --primary: #ff4757; }
```

### 3. Dynamic Content
Node-specific cards display relevant metrics:
- **Education**: Learning progress, task completion
- **Validator**: Block validation stats, accuracy
- **Storage**: Capacity usage, file counts
- **Compute**: Job queue, GPU utilization

## 🎨 Customization

### Modify Colors
Edit the CSS variables in `index.html`:
```css
:root {
    --primary: #YOUR_COLOR;
    --secondary: #YOUR_SECONDARY_COLOR;
}
```

### Add New Node Types
1. Add CSS class:
```css
.node-type-yourtype {
    --primary: #yourcolor;
    --secondary: #yoursecondary;
}
```

2. Add configuration in JavaScript:
```javascript
'yourtype-node': {
    title: 'Your Type Stats',
    icon: '🆕',
    content: `...your metrics...`
}
```

### Integrate Real Data
Replace simulated metrics with actual API calls:
```javascript
async function fetchRealMetrics() {
    const response = await fetch('/api/metrics');
    const data = await response.json();
    // Update DOM elements with real data
}
```

## 🔧 Troubleshooting

### GUI Not Loading
```bash
# Check if service is running
systemctl status axiom-gui.service

# Check port availability
netstat -tlnp | grep 8080

# Restart service
sudo systemctl restart axiom-gui.service
```

### Port 8080 Already in Use
Edit the service file to use a different port:
```bash
sudo nano /etc/systemd/system/axiom-gui.service
# Change: ExecStart=/usr/bin/python3 -m http.server 8081 --bind 0.0.0.0
sudo systemctl daemon-reload
sudo systemctl restart axiom-gui.service
```

### Nginx Integration Issues
```bash
# Test nginx configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Reload nginx
sudo systemctl reload nginx
```

## 📸 Screenshots

The GUI features:
- **Dark theme** with neon accents
- **Responsive design** (works on mobile/tablet/desktop)
- **Animated elements** (pulsing status dots, smooth transitions)
- **Card-based layout** with hover effects
- **Real-time activity log** with color-coded entries

## 🛠️ Development

### Local Testing
```bash
# Serve the GUI locally
python3 -m http.server 8080

# Open in browser
http://localhost:8080
```

### Browser Compatibility
Tested on:
- ✅ Chrome/Chromium (latest)
- ✅ Firefox (latest)
- ✅ Edge (latest)
- ✅ Safari (latest)

## 📝 License

Part of the AXIOM-MESH project. See main repository for license details.

## 🤝 Contributing

To contribute improvements to the GUI skin:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

For issues or questions:
- Check the main AXIOM-MESH documentation
- Open an issue on GitHub
- Join the community Discord/Telegram

---

**Enjoy your personalized AXIOM-MESH experience!** 🚀
