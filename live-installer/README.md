# AXIOM-MESH Live USB/ISO Builder

Create a bootable Ubuntu 24.04 Desktop environment with AXIOM-MESH pre-configured for automatic installation.

## Features

- **Full Desktop Environment**: Boots into a complete Ubuntu 24.04 Desktop (not server-only)
- **Auto-Detection**: Automatically detects existing AXIOM-MESH installations on internal drives
- **Smart Installation**:
  - If installation found → boots normally with dashboard link
  - If no installation → runs fully automated installer
- **Zero Configuration**: Uses sensible defaults (education-node, local-mesh, cost priority, 50GB storage)
- **Built from Your Repo**: 100% compiled from the AXIOM-MESH repository

## Prerequisites

- Ubuntu/Debian Linux machine (or WSL2 with Ubuntu)
- At least 10GB free disk space in `/tmp`
- Required packages: `xorriso`, `squashfs-tools`, `wget`, `genisoimage`

Install prerequisites:
```bash
sudo apt-get update
sudo apt-get install -y xorriso squashfs-tools wget genisoimage
```

## Quick Start

### Build the Live ISO

```bash
cd live-installer
./build-axiom-live.sh
```

The script will:
1. Download Ubuntu 24.04 Desktop ISO (~5GB)
2. Extract and customize it with your AXIOM-MESH repo
3. Install all dependencies (Docker, Node.js, Python packages, etc.)
4. Configure auto-launcher for first boot
5. Rebuild into a new bootable ISO
6. Optionally write directly to USB

### Write to USB (Manual)

If you skipped the automatic USB write:

```bash
# Identify your USB device (BE CAREFUL - this will destroy all data!)
lsblk

# Write the ISO (replace /dev/sdX with your actual device)
sudo dd if=axiom-mesh-live-YYYYMMDD.iso of=/dev/sdX bs=4M status=progress oflag=sync
```

### Boot from USB

1. Insert the USB stick into target machine
2. Boot from USB (may need to change boot order in BIOS/UEFI)
3. Choose "Boot AXIOM-MESH Live (Auto-Install)" from menu
4. Wait for desktop to load
5. Auto-installer will run automatically

## How It Works

### Detection Logic

On boot, the launcher scans all internal drives for:
- `.installed` file in axiom-mesh directory
- `/opt/axiom-mesh` directory
- `.env` configuration file
- `axiom-mesh` directory at root

If found → Skips installer, shows dashboard link  
If not found → Runs `install.py --auto` with defaults

### Default Configuration

- **Role**: education-node
- **Mode**: local-mesh
- **Priority**: cost
- **Storage**: 50GB default allocation

### Customization

To change defaults, edit `axiom-mesh-launcher.sh`:

```bash
python3 install.py --auto \
    --role validator-node \
    --mode production \
    --priority performance
```

## Files

| File | Purpose |
|------|---------|
| `build-axiom-live.sh` | Main build script - creates the ISO |
| `axiom-mesh-launcher.sh` | Auto-launcher that runs on first boot |
| `README.md` | This documentation |

## Output

After successful build:
- `axiom-mesh-live-YYYYMMDD.iso` - The bootable ISO
- `axiom-mesh-live-YYYYMMDD.iso.sha256` - SHA256 checksum

## Troubleshooting

### Build fails with "No space left on device"

Ensure you have at least 10GB free in `/tmp`:
```bash
df -h /tmp
```

### Missing packages error

Install all prerequisites:
```bash
sudo apt-get install -y xorriso squashfs-tools wget genisoimage
```

### ISO won't boot

Try rebuilding with different options or use a different USB stick. Some older machines may need legacy BIOS mode instead of UEFI.

### Chroot errors during build

Ensure you're running as root or with sudo privileges. The build process needs to mount filesystems and run chroot commands.

## Advanced Usage

### Headless Mode (Server Only)

For server deployments without GUI, modify the build script to use Ubuntu Server ISO instead:

```bash
UBUNTU_ISO_URL="https://releases.ubuntu.com/noble/ubuntu-24.04-live-server-amd64.iso"
```

### Custom Package List

Edit the package list in `build-axiom-live.sh`:

```bash
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
# Add your custom packages here
EOF
```

### GitHub Actions CI/CD

To automatically build ISOs on release:

```yaml
# .github/workflows/build-live-iso.yml
name: Build Live ISO

on:
  release:
    types: [published]

jobs:
  build-iso:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install prerequisites
        run: sudo apt-get install -y xorriso squashfs-tools wget genisoimage
      
      - name: Build ISO
        run: cd live-installer && ./build-axiom-live.sh
      
      - name: Upload ISO
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: ./live-installer/axiom-mesh-live-*.iso
          asset_name: axiom-mesh-live.iso
          asset_content_type: application/x-iso9660-image
```

## Security Notes

- The ISO includes your entire repository - ensure no sensitive data is committed
- Docker daemon runs with default configuration - secure for live environment but review for production
- Auto-installer uses default credentials - change after installation

## License

Same as main AXIOM-MESH repository.

## Support

For issues or questions:
- Check main repository documentation
- Open an issue on GitHub
- Join the community Discord/Telegram

---

**Happy meshing! 🚀**
