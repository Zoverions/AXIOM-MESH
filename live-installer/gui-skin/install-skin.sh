#!/bin/bash
# AXIOM-MESH Custom GUI Skin Installer for Live USB
# This script installs the custom node-type-specific GUI skin

set -e

echo "🎨 Installing AXIOM-MESH Custom GUI Skin..."

# Determine installation directory
if [ -d "/opt/axiom-mesh" ]; then
    INSTALL_DIR="/opt/axiom-mesh"
elif [ -d "$HOME/axiom-mesh" ]; then
    INSTALL_DIR="$HOME/axiom-mesh"
else
    INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

GUI_SRC_DIR="$(dirname "${BASH_SOURCE[0]}")/gui-skin"
GUI_DEST_DIR="$INSTALL_DIR/gui-skin"

echo "📁 Source: $GUI_SRC_DIR"
echo "📁 Destination: $GUI_DEST_DIR"

# Create destination directory
mkdir -p "$GUI_DEST_DIR"

# Copy GUI files
echo "📦 Copying GUI skin files..."
cp -r "$GUI_SRC_DIR"/* "$GUI_DEST_DIR/"

# Set permissions
chmod -R 755 "$GUI_DEST_DIR"

# Create systemd service to serve the GUI
echo "⚙️  Creating GUI service..."

cat > /tmp/axiom-gui.service << 'EOF'
[Unit]
Description=AXIOM-MESH Custom GUI Server
After=network.target axiom-mesh.service
Wants=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/axiom-mesh/gui-skin
ExecStart=/usr/bin/python3 -m http.server 8080 --bind 0.0.0.0
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Move service file
if [ -f "/etc/systemd/system/axiom-gui.service" ]; then
    echo "⚠️  Service already exists, updating..."
fi

cp /tmp/axiom-gui.service /etc/systemd/system/axiom-gui.service

# Create nginx config for production (if nginx is available)
if command -v nginx &> /dev/null; then
    echo "🌐 Configuring nginx reverse proxy..."
    
    cat > /etc/nginx/sites-available/axiom-gui << 'EOF'
server {
    listen 80;
    server_name _;
    
    location /gui {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location / {
        # Redirect root to dashboard if axiom-mesh is running
        # Otherwise show GUI
        try_files $uri $uri/ @gui;
    }
    
    location @gui {
        proxy_pass http://127.0.0.1:8080;
    }
}
EOF
    
    # Enable site
    ln -sf /etc/nginx/sites-available/axiom-gui /etc/nginx/sites-enabled/axiom-gui
    
    # Test and reload nginx
    if nginx -t; then
        systemctl reload nginx
        echo "✅ Nginx configured successfully"
    else
        echo "⚠️  Nginx config test failed, skipping nginx integration"
    fi
fi

# Reload systemd and enable service
echo "🔄 Enabling GUI service..."
systemctl daemon-reload
systemctl enable axiom-gui.service
systemctl start axiom-gui.service

# Check service status
if systemctl is-active --quiet axiom-gui.service; then
    echo "✅ GUI service started successfully"
else
    echo "⚠️  GUI service may have issues, check with: systemctl status axiom-gui"
fi

# Update auto-launcher to open custom GUI
LAUNCHER_FILE="/opt/axiom-mesh/axiom-mesh-launcher.sh"
if [ -f "$LAUNCHER_FILE" ]; then
    echo "🔧 Updating auto-launcher to use custom GUI..."
    
    # Backup original
    cp "$LAUNCHER_FILE" "${LAUNCHER_FILE}.bak"
    
    # Add GUI opening logic after existing content
    cat >> "$LAUNCHER_FILE" << 'EOF'

# Open custom GUI in browser
echo "🎨 Opening custom GUI..."
if command -v xdg-open &> /dev/null; then
    sleep 5  # Wait for GUI service to start
    xdg-open "http://localhost:8080" 2>/dev/null || \
    xdg-open "http://localhost:3000" 2>/dev/null || \
    echo "Open http://localhost:8080 in your browser for the custom interface"
fi
EOF
    
    echo "✅ Auto-launcher updated"
fi

echo ""
echo "🎉 Custom GUI Skin installed successfully!"
echo ""
echo "Access points:"
echo "  • Direct: http://localhost:8080"
echo "  • Via Nginx: http://localhost/gui"
echo "  • Standard Dashboard: http://localhost:3000"
echo ""
echo "The GUI will automatically adapt based on your node type:"
echo "  🎓 Education Node - Blue theme, learning progress tracking"
echo "  ✅ Validator Node - Purple theme, validation metrics"
echo "  💾 Storage Node - Orange theme, storage statistics"
echo "  🧮 Compute Node - Red theme, compute job monitoring"
echo ""
echo "Service commands:"
echo "  systemctl status axiom-gui    # Check service status"
echo "  systemctl restart axiom-gui   # Restart GUI server"
echo "  journalctl -u axiom-gui -f    # View logs"
