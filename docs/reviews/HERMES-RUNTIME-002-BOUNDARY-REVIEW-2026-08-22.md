# Hermes RUNTIME-002 Boundary Review — 2026-08-22

**Status:** bounded implementation review for the first `RUNTIME-002` source-inspection slice; not runtime certification, installation approval, capability promotion, or authority to execute Hermes

**Historical pin:** [Hermes Runtime Candidate Pin — 2026-08-21](HERMES-RUNTIME-002-CANDIDATE-PIN-2026-08-21.md)

**Parent architecture:** [Runtime & Connector Fabric](../architecture/RUNTIME-AND-CONNECTOR-FABRIC.md)

## Decision

Retain Hermes Agent commit `b6bcb3e791c673e63974029bbab40cc9326803ff` for the first code-identity-only `RUNTIME-002` slice.

Do **not** float the integration to upstream `main`, do not import the full `hermes_cli` package, do not install Hermes dependencies, and do not map the probe onto an unrelated existing AXIOM action.

The first implementation is a fail-closed **source profile and invocation specification** only. It does not yet launch Hermes or a Python child process, create a machine grant, add a Gateway route, enable policy, change `mesh/config/capabilities.json`, or perform an external effect.

## Upstream freshness review

On 2026-08-22, Hermes upstream `main` was observed at:

`530028c213ae9eed5d7f1a826451e0edf24a11d2`

That head was 96 commits ahead of the retained candidate pin. The delta included substantial work in the Hermes gateway, updater/install-repair paths, desktop client, Windows process handling, runtime state, and associated tests.

The two files needed by the identity-only observation — `hermes_cli/build_info.py` and `pyproject.toml` — were not changed in that 96-commit comparison. The identity-only surface therefore did not require a repin merely because broader Hermes `main` moved.

This is an intentionally conservative selection. A later Hermes capability slice must re-evaluate upstream state rather than assume this pin remains appropriate for provider, gateway, tool, memory, messaging, update, or orchestration behavior.

## Exact retained source identity

| Item | Retained identity |
|---|---|
| upstream repository | `https://github.com/NousResearch/hermes-agent` |
| source commit | `b6bcb3e791c673e63974029bbab40cc9326803ff` |
| commit signature | GitHub observed `verified: false`, reason `unsigned` |
| project version | `0.20.5` |
| Python declaration | `>=3.11,<3.14` |
| licence | MIT |
| `hermes_cli/build_info.py` Git blob | `e2ae06ba73e5ec5ae737c3c4691362c0f99d6fc8` |
| `pyproject.toml` Git blob | `863115484515e1f80495da54da20ff8912ede3e6` |
| `uv.lock` Git blob | `0b058b8e70aaaaee618b5e9e4529fac863b84c03` |
| `tools/lazy_deps.py` Git blob | `3887d3a2575c0fefb8226de89619cad0cf11a305` |
| `LICENSE` Git blob | `75410e73319c72cd3e991a501c5455eb78f38375` |

The Git commit and selected-file blob pins identify repository content. They do **not** prove a publisher signature from Nous Research. Publisher authenticity remains a separate assurance requirement because the retained commit is unsigned.

## Import-side-effect finding

The historical candidate review correctly selected `hermes_cli/build_info.py::get_code_identity()` instead of `hermes dump`, but this review found an additional boundary issue.

A normal Python import such as:

```python
from hermes_cli.build_info import get_code_identity
```

first imports `hermes_cli/__init__.py`. At the retained commit, that package initializer executes `_ensure_utf8()` at import time. On a non-UTF-8 host it may reconfigure `stdout`/`stderr` and set `PYTHONUTF8` and `PYTHONIOENCODING` for child processes.

Those changes are not network access and do not create AXIOM authority, but they are broader process mutation than an identity-only conformance probe needs.

### Boundary decision

The first probe must load the exact pinned `hermes_cli/build_info.py` file directly through Python's standard-library `importlib.util.spec_from_file_location` path. It must not import the `hermes_cli` package initializer.

The proposed child invocation uses Python isolation flags:

`-I -S -B`

and an empty, non-inherited child environment specification.

## Dependency and lazy-install boundary

The full Hermes project has a broad dependency surface. Its core project dependencies include provider/network, web-service, cryptographic, process-management, browser-support, and platform-specific packages. Hermes also has optional/lazy backends.

At the retained source, `tools/lazy_deps.py` can install allowlisted optional packages at runtime when lazy installation is enabled; upstream documents `security.allow_lazy_installs` as enabled by default, with deployment-specific mechanisms to disable it. The exact reviewed lazy-installer source is retained as Git blob `3887d3a2575c0fefb8226de89619cad0cf11a305`.

That file is now pinned by the AXIOM source profile as **review-provenance-only**. It is not imported or executed by the identity probe. Its purpose in this slice is fail-closed source drift detection for a security-relevant upstream mechanism that a later, broader Hermes import could otherwise expose.

None of that dependency surface is required for `build_info.py`. The selected helper uses Python standard-library facilities for path handling and TOML parsing.

Therefore the identity-only profile requires:

- no Hermes package installation;
- no Hermes dependency installation;
- no lazy dependency installation;
- no provider/model credential;
- no inherited child environment;
- no network;
- no `.env` load;
- no browser, messaging, MCP, terminal, cron, skill, updater, gateway, memory, model, or worker path;
- read-only access to the pinned source checkout only;
- one attempt, finite timeout, and bounded stdout/stderr.

A later broader Hermes integration must receive its own dependency/SBOM and threat review. This profile does not convert the full Hermes dependency graph into an approved AXIOM runtime artifact.

## Selected-file integrity versus whole-worktree integrity

Matching `.git/HEAD` to the retained commit is necessary but insufficient. A checkout can have modified working-tree files while HEAD still names the expected commit.

Before the identity helper can be considered eligible for execution, the AXIOM-side profile therefore verifies the exact Git blob identities of the files it executes or depends on for the observation:

- `hermes_cli/build_info.py`;
- `pyproject.toml`.

The profile additionally pins `uv.lock`, `tools/lazy_deps.py`, and `LICENSE` as review-provenance inputs. `tools/lazy_deps.py` is deliberately retained because runtime dependency installation is default-enabled upstream unless separately disabled; pinning it does not make it part of the probe's execution graph.

The source preflight rejects a `.hermes_build_sha` in this first source-checkout profile so the observation cannot silently fall back from live Git identity to a separately supplied build identity.

This selected-file check does **not** claim complete worktree cleanliness. Whole-artifact construction and digesting remains an open gate before a real adapter artifact can be admitted.

## AXIOM action semantics

Repository policy currently has no action whose exact meaning is “inspect an external runtime's immutable source/code identity.”

The proposed semantic action name is:

`runtime.identity.inspect`

It is intentionally **not** added to `mesh/config/policy.json` by this boundary slice and is not authorized by the source profile.

The implementation records:

- `proposed_axiom_action: runtime.identity.inspect`;
- `action_authorized: false`;
- `capability_promoted: false`;
- `external_runtime_loaded: false`;
- `external_effect_performed: false`.

No existing `system.*`, node, storage, governance, import/export, education, or other action is reused as a semantic shortcut.

## Implemented AXIOM-side preflight

`mesh/src/lib/hermes-runtime-002-profile.mjs` now defines the non-authorizing identity profile and reusable selected-file Git verification logic.

It can:

1. verify an absolute checkout root;
2. resolve normal, detached-HEAD, worktree/submodule, loose-ref, and packed-ref Git identity without spawning `git`;
3. require the exact retained commit;
4. calculate canonical Git blob SHA-1 identities over selected files and compare them with the retained pins;
5. retain the exact security-relevant lazy-installer source as non-executed review provenance;
6. reject a `.hermes_build_sha` for this source-checkout slice;
7. construct a deterministic **invocation specification** that demands Sandbox execution, read-only files, deny-egress, no credentials, no dependency install, and no package import;
8. validate that observed output contains exactly `sha`, `short_sha`, `source`, and `version` and exactly matches the retained pin/version.

The module does not execute the generated invocation.

## Adversarial tests in this slice

`mesh/test/hermes-runtime-002-profile.test.mjs` covers:

- retained source and selected-file pins, including the exact non-executed `tools/lazy_deps.py` provenance pin;
- Git canonical blob hashing;
- exact synthetic checkout acceptance;
- dirty selected-file rejection;
- wrong-HEAD rejection;
- forbidden build-identity-file rejection;
- direct-file loader construction rather than `hermes_cli` package import;
- isolated Python flags;
- empty/non-inherited child environment;
- Sandbox read-only and deny-network requirements;
- no credentials or dependency installation;
- exact four-field observation shape;
- wrong SHA/version/source rejection;
- output-field widening rejection;
- malformed, multi-record, and oversized stdout rejection.

These are local profile/preflight tests. They are not evidence that a real external Hermes process has run through AXIOM.

## Remaining gates before a real no-secret observation

The next slice must not skip these gates:

1. construct or obtain the exact retained Hermes checkout/artifact in a controlled test environment;
2. verify the real source checkout with the AXIOM-side preflight before any Hermes source is executed;
3. bind an exact Python runtime artifact/version rather than relying on an unspecified host interpreter;
4. define and review `runtime.identity.inspect` Gateway/action semantics without enabling broader runtime authority;
5. create a truthful Agent Runtime Adapter v1 manifest with real artifact and SBOM/provenance digests — never placeholders;
6. execute the direct-file probe only inside the existing Sandbox/deny-egress boundary;
7. prove no provider credential or ambient environment reaches the child;
8. prove direct Hypervisor/Sandbox/Grid service access from the external runtime boundary is denied;
9. prove Gateway-native and adapter authorization/denial outcomes are equivalent for the inspection action;
10. prove timeout, cancellation, idempotency, bounded output, and receipt behavior against the real process boundary;
11. bind evidence to exact AXIOM adapter contract, source pin, catalog entry, invocation, and result;
12. complete threat-model delta and independent review before any consequential Hermes operation is considered.

## Explicit non-claims

This review does not claim that Hermes Agent is AXIOM-certified, signed by its publisher, installed, enabled, production-ready, or authorized.

It does not claim that the Hermes gateway, updater, installer, providers, browser, messaging integrations, MCP, terminal, memory, skills, worker/sub-agent system, or self-improvement paths satisfy AXIOM requirements.

It does not claim full worktree cleanliness, a complete Hermes SBOM, a real admitted runtime artifact, live external-runtime execution, Gateway authorization parity, direct-service denial evidence, or production capability promotion.

The completed result of this slice is narrower: **an exact retained source identity, a tightened import boundary, a fail-closed selected-file preflight, pinned non-executed provenance for the default-enabled lazy installer, a non-executing invocation specification, and adversarial tests that preserve zero authority.**
