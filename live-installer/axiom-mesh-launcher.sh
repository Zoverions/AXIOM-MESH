#!/bin/bash
# AXIOM-MESH Live USB Auto-Launcher with detection
# This script runs on first boot of the Live USB

set -e

echo "=================================================="
echo "   🚀 AXIOM-MESH Live Boot detected..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

EXISTING=0
INSTALL_PATH=""
DETECTED_OS="unknown"

hardware_assessment() {
    echo -e "${YELLOW}🧠 Running hardware assessment...${NC}"
    local cpu_model cpu_cores ram_mb disk_gb
    cpu_model="$(lscpu 2>/dev/null | awk -F: '/Model name/ {gsub(/^[ \t]+/, "", $2); print $2; exit}')"
    cpu_cores="$(nproc 2>/dev/null || echo "unknown")"
    ram_mb="$(free -m 2>/dev/null | awk '/^Mem:/ {print $2; exit}')"
    disk_gb="$(lsblk -b -dn -o SIZE,TYPE 2>/dev/null | awk '$2=="disk"{sum+=$1} END {printf "%.0f", sum/1024/1024/1024}')"

    cpu_model="${cpu_model:-unknown}"
    cpu_cores="${cpu_cores:-unknown}"
    ram_mb="${ram_mb:-0}"
    disk_gb="${disk_gb:-0}"

    echo "CPU: $cpu_model ($cpu_cores cores)"
    echo "RAM: ${ram_mb}MB"
    echo "Disk: ${disk_gb}GB total attached"

    mkdir -p /tmp/axiom-assessment
    cat > /tmp/axiom-assessment/hardware_profile.json << EOF
{
  "cpu_model": "$(echo "$cpu_model" | sed 's/"/\\"/g')",
  "cpu_cores": "$cpu_cores",
  "ram_mb": "$ram_mb",
  "disk_gb": "$disk_gb",
  "timestamp_utc": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
}

detect_partition_os() {
    local mount_point="$1"
    if [ -f "$mount_point/etc/os-release" ]; then
        DETECTED_OS="$(grep '^PRETTY_NAME=' "$mount_point/etc/os-release" | head -n1 | cut -d= -f2- | tr -d '"')"
        return
    fi
    if [ -d "$mount_point/Windows/System32" ] || [ -d "$mount_point/Program Files" ]; then
        DETECTED_OS="Microsoft Windows"
        return
    fi
    if [ -d "$mount_point/System/Library/CoreServices" ] || [ -f "$mount_point/System/Library/CoreServices/SystemVersion.plist" ]; then
        DETECTED_OS="Apple macOS"
        return
    fi
}

announce_local_payloads() {
    local payload_root="/opt/axiom-mesh/live-installer/offline"
    if [ ! -d "$payload_root" ]; then
        echo -e "${YELLOW}ℹ️ No offline payload directory found. Installer will use online package sources when needed.${NC}"
        return
    fi

    echo -e "${YELLOW}📦 Offline payload inventory:${NC}"
    for subdir in models wheels npm platforms; do
        if [ -d "$payload_root/$subdir" ]; then
            local count
            count="$(find "$payload_root/$subdir" -type f | wc -l)"
            echo "  - $subdir: $count file(s)"
        fi
    done
}

# Try to detect existing installation on any internal drive
echo -e "${YELLOW}🔍 Scanning for existing AXIOM-MESH installations...${NC}"
hardware_assessment

for dev in /dev/sd[a-z] /dev/nvme0n1 /dev/vda; do
    if [ -e "$dev" ]; then
        # Try common partition numbers
        for part in 1 2 3; do
            partition="${dev}${part}"
            if [ -e "$partition" ]; then
                mkdir -p /mnt/check_axiom
                if mount "$partition" /mnt/check_axiom 2>/dev/null; then
                    detect_partition_os /mnt/check_axiom
                    # Check for AXIOM-MESH indicators
                    if [ -f /mnt/check_axiom/axiom-mesh/.installed ] || \
                       [ -d /mnt/check_axiom/opt/axiom-mesh ] || \
                       [ -f /mnt/check_axiom/.env ] || \
                       [ -d /mnt/check_axiom/axiom-mesh ]; then
                        EXISTING=1
                        INSTALL_PATH="/mnt/check_axiom"
                        echo -e "${GREEN}✅ Found AXIOM-MESH at: $partition${NC}"
                        umount /mnt/check_axiom 2>/dev/null || true
                        break 2
                    fi
                    umount /mnt/check_axiom 2>/dev/null || true
                fi
            fi
        done
    fi
done

if [ $EXISTING -eq 1 ]; then
    echo ""
    echo -e "${GREEN}==================================================${NC}"
    echo -e "${GREEN}   ✅ Existing AXIOM-MESH installation detected!${NC}"
    echo -e "${GREEN}==================================================${NC}"
    echo ""
    echo "Booting in normal mode..."
    echo -e "${YELLOW}🖥️ Existing OS detected: ${DETECTED_OS}${NC}"
    echo ""
    
    # Check if custom GUI is available
    if [ -f /opt/axiom-mesh/gui-skin/index.html ] || [ -d /opt/axiom-mesh/gui-skin ]; then
        echo -e "${YELLOW}🎨 Custom GUI skin detected!${NC}"
        echo "Opening both standard dashboard and custom interface..."
        echo ""
        
        # Start the custom GUI service if not running
        if command -v systemctl &> /dev/null && systemctl is-active --quiet axiom-gui.service 2>/dev/null; then
            echo "✅ Custom GUI service already running"
        elif command -v systemctl &> /dev/null; then
            echo "Starting custom GUI service..."
            systemctl start axiom-gui.service 2>/dev/null || true
        fi
        
        sleep 3
        
        # Try to open both interfaces
        if command -v xdg-open &> /dev/null; then
            xdg-open "http://localhost:8080" 2>/dev/null &
            sleep 1
            xdg-open "http://localhost:3000" 2>/dev/null &
        fi
        
        echo -e "${GREEN}📊 Standard Dashboard: http://localhost:3000${NC}"
        echo -e "${YELLOW}🎨 Custom Node GUI: http://localhost:8080${NC}"
        echo ""
        echo "The custom GUI will automatically adapt to your node type!"
    else
        # Try to open dashboard in browser
        if command -v xdg-open &> /dev/null; then
            xdg-open "http://localhost:3000" 2>/dev/null || true
        fi
        
        echo -e "${YELLOW}📊 Dashboard: http://localhost:3000${NC}"
    fi
    
    echo -e "${YELLOW}📁 Installation path: $INSTALL_PATH${NC}"
    echo ""
    echo "You can now:"
    echo "  - Open the dashboards in your browser"
    echo "  - Access your existing AXIOM-MESH instance"
    echo "  - Use the live environment for troubleshooting"
    echo ""
    exit 0
else
    echo ""
    echo -e "${YELLOW}==================================================${NC}"
    echo -e "${YELLOW}   🔧 No existing installation found${NC}"
    echo -e "${YELLOW}==================================================${NC}"
    echo ""
    echo "Launching full auto-installer..."
    echo -e "${YELLOW}🖥️ Existing OS detected: ${DETECTED_OS}${NC}"
    announce_local_payloads
    echo ""
    
    # Navigate to the AXIOM-MESH directory on the live USB
    cd /opt/axiom-mesh || {
        echo -e "${RED}❌ Error: AXIOM-MESH directory not found at /opt/axiom-mesh${NC}"
        exit 1
    }
    
    # Run the installer in auto mode with sensible defaults
    echo -e "${GREEN}🚀 Starting automated installation...${NC}"
    echo "   Role: education-node"
    echo "   Mode: local-mesh"
    echo "   Priority: cost"
    echo "   Storage: 50GB default"
    echo ""
    
    python3 install.py --auto \
        --role education-node \
        --mode local-mesh \
        --priority cost
    
    INSTALL_STATUS=$?
    
    if [ $INSTALL_STATUS -eq 0 ]; then
        echo ""
        echo -e "${GREEN}==================================================${NC}"
        echo -e "${GREEN}   🎉 Installation completed successfully!${NC}"
        echo -e "${GREEN}==================================================${NC}"
        echo ""
        
        # Install custom GUI skin if available
        if [ -d /opt/axiom-mesh/live-installer/gui-skin ]; then
            echo ""
            echo -e "${YELLOW}🎨 Installing custom GUI skin...${NC}"
            bash /opt/axiom-mesh/live-installer/gui-skin/install-skin.sh
            echo ""
        fi
        
        echo "Next steps:"
        echo "  1. Start the mesh: cd /opt/axiom-mesh && make up"
        echo "  2. Open standard dashboard: http://localhost:3000"
        echo "  3. Open custom node GUI: http://localhost:8080"
        echo "  4. Or reboot into your installed system"
        if [ -f /opt/axiom-mesh/config/local_model_tags.txt ]; then
            echo ""
            echo -e "${YELLOW}🤖 Local model targets bundled in ISO:${NC}"
            sed 's/^/  - /' /opt/axiom-mesh/config/local_model_tags.txt
        fi
        echo ""
        
        # Optionally start the services automatically
        read -p "Start AXIOM-MESH services now? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Starting services..."
            make up
            
            # Start custom GUI service
            if command -v systemctl &> /dev/null; then
                echo "Starting custom GUI service..."
                systemctl start axiom-gui.service 2>/dev/null || true
            fi
            
            echo ""
            echo -e "${GREEN}✅ Services started!${NC}"
            echo -e "${YELLOW}📊 Opening dashboards...${NC}"
            
            sleep 5
            
            if command -v xdg-open &> /dev/null; then
                xdg-open "http://localhost:3000" 2>/dev/null &
                sleep 2
                xdg-open "http://localhost:8080" 2>/dev/null &
            fi
        fi
    else
        echo -e "${RED}❌ Installation failed with status: $INSTALL_STATUS${NC}"
        echo "Please check the logs above for details."
        exit $INSTALL_STATUS
    fi
fi
