# Live USB/ISO Distribution & Deployment (M7.8)

**Status:** Completed on 2026-03-29 by @agent  
**Scope:** Define a concrete release/distribution runbook for decentralized and mirrored ISO delivery.

## Distribution Channels

1. **Primary release artifact**
   - Publish ISO + SHA256 in GitHub Releases.
2. **Torrent channel**
   - Publish `.torrent` with web seeds pointing to official mirrors.
3. **IPFS channel**
   - Pin ISO and checksum to at least 3 independent nodes.
4. **Mirror sites**
   - Maintain geo-diverse HTTPS mirrors with nightly checksum verification.

## Required Release Bundle
- `axiom-mesh-live-YYYYMMDD.iso`
- `axiom-mesh-live-YYYYMMDD.iso.sha256`
- `axiom-mesh-live-YYYYMMDD.iso.sig` (maintainer signing key)
- `RELEASE-NOTES.md`
- `VERIFY.md`

## Operator Runbook

### 1) Prepare artifacts
```bash
cd live-installer
sha256sum axiom-mesh-live-*.iso > axiom-mesh-live-*.iso.sha256
```

### 2) Create torrent metadata
```bash
mktorrent -a udp://tracker.opentrackr.org:1337/announce -w https://downloads.axiom-mesh.org/live/ -o axiom-mesh-live.torrent axiom-mesh-live-*.iso
```

### 3) Publish to IPFS
```bash
ipfs add axiom-mesh-live-*.iso
ipfs add axiom-mesh-live-*.iso.sha256
```

### 4) Mirror sync
```bash
rsync -avh --delete ./ mirror1:/var/www/axiom-live/
rsync -avh --delete ./ mirror2:/var/www/axiom-live/
```

### 5) Verification instructions publication
- Update `docs/HOWTO/create-bootable-usb.md` with current checksum and signature commands.
- Link the same commands from release notes.

## Download Verification (User-Facing)
```bash
sha256sum -c axiom-mesh-live-YYYYMMDD.iso.sha256
gpg --verify axiom-mesh-live-YYYYMMDD.iso.sig axiom-mesh-live-YYYYMMDD.iso
```

## Video/tutorial deliverables
- 5-minute quick-start video (Windows/macOS/Linux USB creation).
- 12-minute deep-dive video (verification, secure boot notes, troubleshooting).
- Store source project files in `docs/media/live-usb/` for updateability.

## Exit Criteria
M7.8 is complete when GitHub Release, torrent, IPFS CID, at least two mirrors, and downloadable verification instructions are all published and cross-linked.
