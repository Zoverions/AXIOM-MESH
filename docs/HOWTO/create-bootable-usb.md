# Create Bootable Live USB

This guide walks you through creating a bootable AXIOM-MESH Live USB stick that automatically installs and configures the platform on first boot.

## Overview

The AXIOM-MESH Live USB is a self-contained Ubuntu 24.04 Desktop environment with:
- Pre-bundled AXIOM-MESH repository
- Automatic dependency installation
- Smart detection of existing installations
- Node-specific GUI interfaces
- Zero-config deployment

## Prerequisites

- **Host System**: Linux (Ubuntu/Debian recommended), macOS, or WSL2
- **USB Stick**: Minimum 16 GB (32 GB recommended)
- **Internet Connection**: For downloading base ISO (~5 GB)
- **Disk Space**: ~10 GB temporary space for ISO building

## Quick Start

### 1. Navigate to Live Installer Directory

```bash
cd live-installer
```

### 2. Run the Build Script

```bash
./build-axiom-live.sh
```

The script will automatically:
1. Download Ubuntu 24.04 Desktop ISO
2. Extract and customize the ISO
3. Install all dependencies (Docker, Node.js, Python packages)
4. Configure auto-launcher with node detection
5. Rebuild into bootable ISO
6. Optionally write directly to USB

### 3. Write to USB (if not done automatically)

If you skipped the automatic USB write:

```bash
# Identify your USB device (BE CAREFUL - this will erase the device!)
lsblk

# Write ISO to USB (replace /dev/sdX with your device)
sudo dd if=axiom-mesh-live-$(date +%Y%m%d).iso of=/dev/sdX bs=4M status=progress conv=fsync
sync
```

## Build Options

### Automated Build (Non-Interactive)

```bash
./build-axiom-live.sh --auto --usb /dev/sdX
```

### Custom Configuration

Edit `live-installer/config.sh` before building:

```bash
# Set custom defaults
DEFAULT_NODE_ROLE="validator"
DEFAULT_LAUNCH_MODE="global-mesh"
DEFAULT_PRIORITY="performance"
STORAGE_ALLOCATION="100G"
```

### Lightweight Xubuntu Version

For faster boot times and lower resource usage:

```bash
./build-axiom-live.sh --flavor xubuntu
```

### Headless Server Version

For server-only deployments without GUI:

```bash
./build-axiom-live.sh --flavor server
```

## First Boot Experience

### Scenario A: No Existing Installation

1. Boot from USB
2. Auto-installer launches automatically
3. Installs to internal drive (or runs in persistent mode)
4. Configures default node settings
5. Launches dashboard at `http://localhost:3000`

### Scenario B: Existing Installation Detected

1. Boot from USB
2. Detection script finds existing installation
3. Skips installer
4. Opens dashboard link directly
5. Provides access to running node metrics

## Node-Specific GUIs

On first boot, the system detects your node type and launches the appropriate interface:

| Node Type | Port | Features |
|-----------|------|----------|
| Education | 8081 | Learning progress, student metrics, curriculum tracking |
| Validator | 8082 | Validation stats, consensus participation, rewards |
| Storage | 8083 | Storage utilization, file pinning, retrieval metrics |
| Compute | 8084 | GPU/CPU usage, inference jobs, zkML proofs |

Access via: `http://localhost:808X` (where X is the node type number)

## Troubleshooting

### Build Fails at Download Step

Ensure you have sufficient disk space and internet connectivity:

```bash
df -h /tmp
ping -c 4 releases.ubuntu.com
```

### USB Write Fails

Make sure the USB is not mounted:

```bash
sudo umount /dev/sdX*
```

### Boot Issues on Target Machine

1. Enter BIOS/UEFI setup
2. Disable Secure Boot temporarily
3. Enable Legacy/CSM boot if needed
4. Set USB as primary boot device

### Existing Installation Not Detected

Check that the installation marker exists:

```bash
# On the target drive
ls -la /path/to/installation/.installed
ls -la /path/to/installation/.env
```

## Advanced Customization

### Add Custom Scripts

Place scripts in `live-installer/custom-scripts/` to run during installation:

```bash
mkdir -p live-installer/custom-scripts
echo "#!/bin/bash\necho 'Custom setup step'" > live-installer/custom-scripts/99-custom.sh
chmod +x live-installer/custom-scripts/99-custom.sh
```

### Pre-configure Node Settings

Create a pre-seeded `.env` file:

```bash
cat > live-installer/preseed.env << ENV
NODE_ROLE=validator
LAUNCH_MODE=global-mesh
PRIORITY=performance
STORAGE_LIMIT=200G
WALLET_ADDRESS=0xYourAddressHere
ENV
```

Then modify `build-axiom-live.sh` to copy this file during build.

### Multi-Architecture Support

Build for different architectures:

```bash
# ARM64 (for Raspberry Pi, Apple Silicon Macs)
./build-axiom-live.sh --arch arm64

# AMD64 (standard PCs)
./build-axiom-live.sh --arch amd64
```

## Security Considerations

- **Secure Boot**: The ISO supports Secure Boot; keep it enabled in production
- **Encryption**: Consider full-disk encryption for persistent installations
- **Network Security**: Change default passwords immediately after first boot
- **Updates**: Run `make update` regularly to get security patches

## Distribution

### Share ISO via Torrent

```bash
# Generate torrent file
mktorrent -p -a udp://tracker.example.com:1337/announce axiom-mesh-live-*.iso

# Seed the torrent
transmission-cli axiom-mesh-live-*.torrent
```

### Host on IPFS

```bash
ipfs add axiom-mesh-live-*.iso
# Share the resulting CID
```

## Next Steps

- **[First Steps](first-steps.md)**: Configure your node after installation
- **[Node Configuration](node-config.md)**: Customize roles and resources
- **[Custom Node GUIs](custom-guis.md)**: Learn about node-specific interfaces
- **[Disaster Recovery](disaster-recovery.md)**: Backup strategies for Live USB deployments

## Resources

- [Live Installer README](../../live-installer/README.md)
- [Build Script Source](../../live-installer/build-axiom-live.sh)
- [Auto-Launcher Source](../../live-installer/axiom-mesh-launcher.sh)
- [GitHub Actions Workflow](../../.github/workflows/build-live-iso.yml)
