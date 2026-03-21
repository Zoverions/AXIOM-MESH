# Subtasks: Installer Automation

Parent queue: `docs/MASTER-TODO.md` (Lane M2)

## M2.1 First-run orchestration
- [x] Add startup detection (`first_run=true`) and bootstrap wizard entrypoint.
- [x] Add interactive path (human-guided prompts).
- [x] Add unattended path (machine/agent defaults from policy).

## M2.2 Capability detection
- [x] Detect CPU cores/arch, RAM, storage free space, GPU availability, network profile.
- [x] Map to hardware tier in `docs/HARDWARE-PROFILE-MATRIX.md`.

## M2.3 Role mode selection
- [x] Define presets: `dedicated-mesh`, `shared-machine`, `minimal-edge`.
- [x] Persist selected profile to local config.

## M2.4 Automated install guidance
- [x] Validate prerequisites and missing dependencies.
- [x] Provide deterministic remediation actions.
- [x] Re-run checks after remediation.

## M2.5 Runtime handoff
- [x] Export machine profile and installer choices for Hypervisor/Gateway/Grid/Sandbox.
- [x] Ensure ResourceBalancer consumes profile on startup.

## M2.6 Launch preflight + funding gate
- [x] Add launch mode gate (`local-mesh`, `single-node`, `launch-network`).
- [x] Assess RPC/wallet readiness before network launch.
- [x] Estimate bootstrap ETH requirement and request user funding decision.
- [x] Allow safe fallback to local mesh mode if funding is deferred.
