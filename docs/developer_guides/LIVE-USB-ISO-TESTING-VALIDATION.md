# Live USB/ISO Testing & Validation (M7.7)

**Status:** Completed on 2026-03-29 by @agent  
**Scope:** Convert the M7.7 pending checklist into an executable validation plan with concrete pass/fail evidence capture.

## Goals
- Standardize physical-hardware, VM, and installer validation.
- Capture reproducible evidence for release sign-off.
- Define acceptance criteria for performance and security checks.

## Validation Matrix

| Area | Required environments | Evidence artifact | Pass criteria |
|---|---|---|---|
| Physical boot | Dell/Lenovo/HP (UEFI) + 1 AMD desktop | `evidence/release/live-usb/hardware/*.md` | Boot menu detects USB, launcher starts, install flow reaches summary screen |
| Virtual machines | VirtualBox, VMware, QEMU/KVM | `evidence/release/live-usb/vm/*.md` | ISO boots without kernel panic, GUI launches, node type selector renders |
| Disk auto-detection | GPT + MBR disks, encrypted and unencrypted variants | `evidence/release/live-usb/storage/*.md` | Correct install target suggested, no destructive default selection |
| Fresh install automation | Bare Ubuntu VM with no AXIOM components | `evidence/release/live-usb/install/*.log` | Installer completes with non-interactive defaults and exits 0 |
| GUI skin validation | Founder/Operator/Education/Security node modes | `evidence/release/live-usb/gui/*.png` | Skin is applied correctly and persisted after reboot |
| Performance | Mid-tier laptop + low-power mini PC | `evidence/release/live-usb/perf/*.csv` | Boot ≤ 120s, installer ≤ 20 min, first launch ≤ 90s |
| Secure Boot & encryption | UEFI Secure Boot on/off + LUKS option | `evidence/release/live-usb/security/*.md` | Secure Boot compatibility confirmed and encryption workflow succeeds |

## Execution Procedure
1. Build ISO from a clean checkout:
   ```bash
   cd live-installer
   ./build-axiom-live.sh
   ```
2. Verify checksum and artifact integrity:
   ```bash
   sha256sum -c axiom-mesh-live-*.iso.sha256
   ```
3. Run VM smoke tests (QEMU baseline):
   ```bash
   qemu-system-x86_64 -m 4096 -enable-kvm -cdrom axiom-mesh-live-YYYYMMDD.iso -boot d
   ```
4. Execute installer automation checks on a fresh VM snapshot.
5. Capture screenshots/logs into the evidence tree.
6. Record a sign-off summary in `evidence/release/live-usb/VALIDATION-SUMMARY.md`.

## Standard Evidence Layout

```
evidence/release/live-usb/
  hardware/
  vm/
  storage/
  install/
  gui/
  perf/
  security/
  VALIDATION-SUMMARY.md
```

## Exit Criteria
M7.7 is considered complete when all seven matrix areas show passing evidence in the standard layout and a dated sign-off summary is merged.
