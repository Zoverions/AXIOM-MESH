#!/bin/bash
# AXIOM-MESH Live ISO Builder
# Builds a bootable Ubuntu 24.04 Desktop ISO with AXIOM-MESH pre-installed
# and auto-launcher configured for first boot

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
WORK_DIR="/tmp/axiom-live-build-$$"
ISO_NAME="axiom-mesh-live-$(date +%Y%m%d).iso"
OUTPUT_ISO="$SCRIPT_DIR/$ISO_NAME"
UBUNTU_ISO_URL="https://releases.ubuntu.com/noble/ubuntu-24.04-desktop-amd64.iso"
UBUNTU_ISO="$WORK_DIR/ubuntu-24.04-desktop-amd64.iso"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cleanup() {
    if [ -d "$WORK_DIR" ]; then
        log_warn "Cleaning up temporary files..."
        rm -rf "$WORK_DIR"
    fi
}

trap cleanup EXIT

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing=()
    
    command -v xorriso >/dev/null 2>&1 || missing+=("xorriso")
    command -v unsquashfs >/dev/null 2>&1 || missing+=("squashfs-tools")
    command -v wget >/dev/null 2>&1 || missing+=("wget")
    command -v mkisofs >/dev/null 2>&1 || missing+=("genisoimage")
    
    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing required packages: ${missing[*]}"
        log_info "Install with: sudo apt-get install -y ${missing[*]}"
        exit 1
    fi
    
    # Check disk space (need ~10GB free)
    local available_space=$(df -B1 /tmp | awk 'NR==2 {print $4}')
    local required_space=$((10 * 1024 * 1024 * 1024))  # 10GB
    
    if [ "$available_space" -lt "$required_space" ]; then
        log_error "Insufficient disk space. Need at least 10GB free in /tmp"
        exit 1
    fi
    
    log_success "All prerequisites met."
}

download_ubuntu_iso() {
    if [ -f "$UBUNTU_ISO" ]; then
        log_info "Ubuntu ISO already exists, skipping download."
        return
    fi
    
    log_info "Downloading Ubuntu 24.04 Desktop ISO..."
    log_info "URL: $UBUNTU_ISO_URL"
    log_info "This may take a while (~5GB)..."
    
    wget -c --show-progress "$UBUNTU_ISO_URL" -O "$UBUNTU_ISO"
    
    log_success "Ubuntu ISO downloaded successfully."
}

extract_iso() {
    log_info "Extracting Ubuntu ISO..."
    
    mkdir -p "$WORK_DIR"/{extracted,new-root,new-iso}
    
    # Mount the ISO
    mount -o loop "$UBUNTU_ISO" "$WORK_DIR/extracted"
    
    # Copy contents
    cp -r "$WORK_DIR/extracted/"* "$WORK_DIR/new-iso/"
    
    # Extract squashfs
    cp "$WORK_DIR/extracted/casper/filesystem.squashfs" "$WORK_DIR/"
    unsquashfs -d "$WORK_DIR/new-root" "$WORK_DIR/filesystem.squashfs"
    
    umount "$WORK_DIR/extracted"
    
    log_success "ISO extracted successfully."
}

customize_system() {
    log_info "Customizing system..."
    
    # Copy AXIOM-MESH repo to /opt/axiom-mesh
    log_info "Copying AXIOM-MESH repository..."
    mkdir -p "$WORK_DIR/new-root/opt/axiom-mesh"
    cp -r "$REPO_ROOT"/* "$WORK_DIR/new-root/opt/axiom-mesh/"
    
    # Make installer scripts executable
    chmod +x "$WORK_DIR/new-root/opt/axiom-mesh/install.py"
    chmod +x "$WORK_DIR/new-root/opt/axiom-mesh/install.sh"
    chmod +x "$WORK_DIR/new-root/opt/axiom-mesh/install.bat" 2>/dev/null || true
    
    # Copy launcher script
    log_info "Installing auto-launcher..."
    cp "$SCRIPT_DIR/axiom-mesh-launcher.sh" "$WORK_DIR/new-root/usr/local/bin/axiom-launcher"
    chmod +x "$WORK_DIR/new-root/usr/local/bin/axiom-launcher"
    
    # Create autostart entry for desktop environment
    log_info "Configuring autostart..."
    mkdir -p "$WORK_DIR/new-root/etc/xdg/autostart"
    cat > "$WORK_DIR/new-root/etc/xdg/autostart/axiom-launcher.desktop" << EOF
[Desktop Entry]
Type=Application
Name=AXIOM-MESH Launcher
Exec=/usr/local/bin/axiom-launcher
Terminal=true
X-GNOME-Autostart-enabled=true
Hidden=false
NoDisplay=false
EOF
    
    # Also add to user autostart
    mkdir -p "$WORK_DIR/new-root/etc/skel/.config/autostart"
    cp "$WORK_DIR/new-root/etc/xdg/autostart/axiom-launcher.desktop" \
         "$WORK_DIR/new-root/etc/skel/.config/autostart/"
    
    # Install additional packages needed by AXIOM-MESH
    log_info "Preparing package list..."
    cat >> "$WORK_DIR/new-root/tmp/axiom-packages.txt" << EOF
docker.io
docker-compose
make
nodejs
npm
python3
python3-pip
git
curl
wget
EOF
    
    # Create post-installation script to run in chroot
    cat > "$WORK_DIR/new-root/tmp/setup-axiom.sh" << 'CHROOT_SCRIPT'
#!/bin/bash
set -e

echo "Installing AXIOM-MESH dependencies..."

# Update package lists
apt-get update

# Install packages from our list
apt-get install -y $(cat /tmp/axiom-packages.txt | grep -v "^#" | tr '\n' ' ')

# Install Docker (if not installed by package manager)
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
fi

# Add ubuntu user to docker group
usermod -aG docker ubuntu 2>/dev/null || true

# Install Python dependencies for AXIOM-MESH
cd /opt/axiom-mesh
pip3 install --break-system-packages -r requirements.txt 2>/dev/null || \
pip3 install httpx fastapi uvicorn pydantic python-dotenv requests rich psutil docker pyyaml

# Clean up
rm -f /tmp/axiom-packages.txt /tmp/setup-axiom.sh

echo "AXIOM-MESH setup complete!"
CHROOT_SCRIPT
    
    chmod +x "$WORK_DIR/new-root/tmp/setup-axiom.sh"
    
    # Bind mount necessary filesystems for chroot
    mount --bind /dev "$WORK_DIR/new-root/dev"
    mount --bind /proc "$WORK_DIR/new-root/proc"
    mount --bind /sys "$WORK_DIR/new-root/sys"
    mount --bind /run "$WORK_DIR/new-root/run"
    
    # Run setup in chroot
    log_info "Running chroot setup (this will take a few minutes)..."
    chroot "$WORK_DIR/new-root" /tmp/setup-axiom.sh
    
    # Unmount bind mounts
    umount "$WORK_DIR/new-root/dev" || true
    umount "$WORK_DIR/new-root/proc" || true
    umount "$WORK_DIR/new-root/sys" || true
    umount "$WORK_DIR/new-root/run" || true
    
    log_success "System customized successfully."
}

rebuild_iso() {
    log_info "Rebuilding ISO..."
    
    # Compress the new root filesystem
    mksquashfs "$WORK_DIR/new-root" "$WORK_DIR/new-iso/casper/filesystem.squashfs" -comp xz
    
    # Calculate checksum for manifest
    cd "$WORK_DIR/new-root"
    find . -type f -print0 | xargs -0 md5sum > "$WORK_DIR/new-iso/md5sum.txt"
    
    # Create grub configuration with custom menu
    cat > "$WORK_DIR/new-iso/boot/grub/grub.cfg" << EOF
set timeout=10
set default=0

menuentry "🚀 Boot AXIOM-MESH Live (Auto-Install)" {
    set iso_path="/casper/vmlinuz"
    linux /casper/vmlinuz boot=casper quiet splash ---
    initrd /casper/initrd
}

menuentry "🔧 AXIOM-MESH Live (Safe Mode)" {
    set iso_path="/casper/vmlinuz"
    linux /casper/vmlinuz boot=casper nomodeset ---
    initrd /casper/initrd
}

menuentry "💾 Check disk for AXIOM-MESH installation" {
    set iso_path="/casper/vmlinuz"
    linux /casper/vmlinuz boot=casper quiet splash ---
    initrd /casper/initrd
}

menuentry "🔄 Reboot" {
    reboot
}

menuentry "⏻ Shutdown" {
    halt
}
EOF
    
    # Build the ISO
    xorriso -as mkisofs \
        -V "AXIOM-MESH-LIVE" \
        -J -R \
        -b isolinux/isolinux.bin \
        -c isolinux/boot.cat \
        -no-emul-boot \
        -boot-load-size 4 \
        -boot-info-table \
        -eltorito-alt-boot \
        -e boot/grub/efi.img \
        -no-emul-boot \
        -isohybrid-mbr isolinux/isohdpfx.bin \
        -output "$OUTPUT_ISO" \
        "$WORK_DIR/new-iso"
    
    # Generate checksum
    cd "$SCRIPT_DIR"
    sha256sum "$ISO_NAME" > "${ISO_NAME}.sha256"
    
    log_success "ISO built successfully: $OUTPUT_ISO"
    log_info "SHA256: $(cat ${ISO_NAME}.sha256)"
}

write_to_usb() {
    read -p "Would you like to write the ISO to a USB stick now? (y/N) " -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping USB write. You can write it later with:"
        log_info "  sudo dd if=$OUTPUT_ISO of=/dev/sdX bs=4M status=progress oflag=sync"
        return
    fi
    
    # List available drives
    log_info "Available drives:"
    lsblk -d -o NAME,SIZE,MODEL,MOUNTPOINT
    
    echo ""
    read -p "Enter the target device (e.g., /dev/sdb): " -r USB_DEVICE
    
    if [ ! -b "$USB_DEVICE" ]; then
        log_error "Invalid device: $USB_DEVICE"
        exit 1
    fi
    
    # Safety check
    log_warn "WARNING: This will DESTROY all data on $USB_DEVICE"
    read -p "Are you ABSOLUTELY sure? Type 'YES' to confirm: " -r CONFIRM
    
    if [ "$CONFIRM" != "YES" ]; then
        log_info "Aborted."
        exit 0
    fi
    
    log_info "Writing ISO to $USB_DEVICE..."
    dd if="$OUTPUT_ISO" of="$USB_DEVICE" bs=4M status=progress oflag=sync
    
    sync
    log_success "Successfully written to $USB_DEVICE"
    log_info "You can now boot from this USB stick!"
}

main() {
    echo ""
    echo "============================================================"
    echo "   🚀 AXIOM-MESH Live ISO Builder"
    echo "   Build a bootable USB with auto-installer"
    echo "============================================================"
    echo ""
    
    check_prerequisites
    download_ubuntu_iso
    extract_iso
    customize_system
    rebuild_iso
    write_to_usb
    
    echo ""
    echo "============================================================"
    echo "   ✅ Build complete!"
    echo "============================================================"
    echo ""
    echo "Output: $OUTPUT_ISO"
    echo "Checksum: ${ISO_NAME}.sha256"
    echo ""
    echo "Next steps:"
    echo "  1. Write to USB: sudo dd if=$OUTPUT_ISO of=/dev/sdX bs=4M status=progress"
    echo "  2. Boot any machine from the USB"
    echo "  3. AXIOM-MESH will auto-install or detect existing installation"
    echo ""
    echo "Happy meshing! 🎉"
}

main "$@"
