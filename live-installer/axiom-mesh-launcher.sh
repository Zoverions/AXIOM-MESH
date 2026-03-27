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

# Try to detect existing installation on any internal drive
echo -e "${YELLOW}🔍 Scanning for existing AXIOM-MESH installations...${NC}"

for dev in /dev/sd[a-z] /dev/nvme0n1 /dev/vda; do
    if [ -e "$dev" ]; then
        # Try common partition numbers
        for part in 1 2 3; do
            partition="${dev}${part}"
            if [ -e "$partition" ]; then
                mkdir -p /mnt/check_axiom
                if mount "$partition" /mnt/check_axiom 2>/dev/null; then
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
    echo ""
    
    # Try to open dashboard in browser
    if command -v xdg-open &> /dev/null; then
        xdg-open "http://localhost:3000" 2>/dev/null || true
    fi
    
    echo -e "${YELLOW}📊 Dashboard: http://localhost:3000${NC}"
    echo -e "${YELLOW}📁 Installation path: $INSTALL_PATH${NC}"
    echo ""
    echo "You can now:"
    echo "  - Open http://localhost:3000 in your browser"
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
        echo "Next steps:"
        echo "  1. Start the mesh: cd /opt/axiom-mesh && make up"
        echo "  2. Open dashboard: http://localhost:3000"
        echo "  3. Or reboot into your installed system"
        echo ""
        
        # Optionally start the services automatically
        read -p "Start AXIOM-MESH services now? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Starting services..."
            make up
        fi
    else
        echo -e "${RED}❌ Installation failed with status: $INSTALL_STATUS${NC}"
        echo "Please check the logs above for details."
        exit $INSTALL_STATUS
    fi
fi
