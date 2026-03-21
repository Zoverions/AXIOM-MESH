# Subtasks: Installer Automation

Parent queue: `docs/MASTER-TODO.md` (Lane M2)

## M2.1 First-run orchestration
- [ ] Add startup detection (`first_run=true`) and bootstrap wizard entrypoint.
- [ ] Add interactive path (human-guided prompts).
- [ ] Add unattended path (machine/agent defaults from policy).

## M2.2 Capability detection
- [ ] Detect CPU cores/arch, RAM, storage free space, GPU availability, network profile.
- [ ] Map to hardware tier in `docs/HARDWARE-PROFILE-MATRIX.md`.

## M2.3 Role mode selection
- [ ] Define presets: `dedicated-mesh`, `shared-machine`, `minimal-edge`.
- [ ] Persist selected profile to local config.

## M2.4 Automated install guidance
- [ ] Validate prerequisites and missing dependencies.
- [ ] Provide deterministic remediation actions.
- [ ] Re-run checks after remediation.

## M2.5 Runtime handoff
- [ ] Export machine profile and installer choices for Hypervisor/Gateway/Grid/Sandbox.
- [ ] Ensure ResourceBalancer consumes profile on startup.

## M2.6 Launch preflight + funding gate
- [ ] Add launch mode gate (`local-mesh`, `single-node`, `launch-network`).
- [ ] Assess RPC/wallet readiness before network launch.
- [ ] Estimate bootstrap ETH requirement and request user funding decision.
- [ ] Allow safe fallback to local mesh mode if funding is deferred.
