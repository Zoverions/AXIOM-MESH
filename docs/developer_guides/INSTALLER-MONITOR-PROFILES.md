# AXIOM-MESH Installer Monitor Profiles

This document formalizes the low-overhead installer monitor profiles (the "4-mode matrix") and runtime toggles for AXIOM-MESH.

## 4-Mode Matrix

The installer determines monitoring levels and resource overhead through four distinct profiles.

| Profile Name       | Target Hardware | CPU Overhead | RAM Overhead | Key Capabilities                                             |
|--------------------|-----------------|--------------|--------------|--------------------------------------------------------------|
| `minimal-edge`     | Android / IoT   | < 5%         | < 150 MB     | Basic heartbeat, essential metrics (battery/wifi), QR login. |
| `shared-machine`   | Standard PC/Mac | ~ 10-15%     | 300-600 MB   | Telemetry, Capsule baseline metrics, foreground protection.  |
| `education-node`   | Dedicated PC    | ~ 20-30%     | 1GB - 2GB    | Real-time regional compliance monitoring, EDI checks, DAO.   |
| `dedicated-mesh`   | Server / Rig    | > 50%        | > 2GB        | Full archiver, complete zkML proofs, deep metric ingestion.  |

## Runtime Toggle (`--monitor`)

The runtime toggle allows operators to override the default detected machine role and monitoring behavior on the fly without having to reinstall or modify underlying `machine_profile.json` presets.

### Usage

When running the universal installer (`install.sh`, `install.py`, `install.bat`), the `--monitor` flag directly bypasses the heuristic auto-detection and forces a specific mode:

```bash
# Force minimal monitoring on a powerful machine:
./install.sh --monitor=minimal-edge

# Force full metrics ingestion for a test node:
python3 install.py --monitor=dedicated-mesh
```

### Dynamic Runtime Switch

At runtime, the orchestrator and `ResourceBalancer` read the `MACHINE_ROLE` environment variable (set by the installer). Operators can toggle the mode dynamically by modifying `.env` or exporting the variable before executing the mesh:

```bash
export MACHINE_ROLE=shared-machine
python3 -m hypervisor.src.orchestrator --mode public-pool
```

This updates the `machine_profile.json` loaded constraints dynamically, switching telemetry verbosity and resource caps in real time.
