# AXIOM-MESH Production Execution Queue

**Status:** canonical active queue
**Updated:** 2026-07-28
**Current kernel:** 0.11.0
**Current stage:** production candidate; not production-promoted

This queue orders concrete work. The [roadmap](ROADMAP.md) defines phase
outcomes; this file defines the next executable items. A checked box means the
acceptance evidence exists, not merely that code or prose was written.

## Promotion rules

A capability may move to `implemented` only when it has:

1. production-path code without a synthetic-success fallback;
2. fail-closed authorization and negative-path tests;
3. durable evidence from an executable verification command;
4. operator documentation that matches behavior;
5. a current status record bound to a commit.

Production promotion additionally requires green protected-branch CI, an
independently reviewed release dossier, a rollback target, and measured
deployment evidence. Exceptions require an owner, rationale, containment,
expiry, and approval; an exception cannot waive credential compromise,
evidence-chain integrity, or unauthorized effects.

## P0 - repository and release control

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| REP-001 | Complete | Make clean-room `main` the GitHub default and preserve the old line as deprecated | Default is `main`; the legacy branch is locked and read-only at `deprecated/legacy-main-pre-clean-room` |
| REP-002 | Complete | Enforce canonical documentation and lowercase-`main` CI | Documentation checks and [workflow run 30376178779](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30376178779) |
| REP-004 | Complete | Remove unsupported legacy runtimes and dependency manifests from the supported branch | Legacy source remains recoverable from Git history and the deprecated branch |
| REP-003 | Complete | Protect `main` against deletion and force pushes; require green verification | Required kernel/container/CodeQL checks; deletion and force pushes disabled |
| REL-001 | Complete | Publish the verified 0.11.0 clean-room baseline | [v0.11.0 prerelease](https://github.com/Zoverions/AXIOM-MESH/releases/tag/v0.11.0) with source checksum, SPDX SBOM, and provenance |
| REL-002 | Complete | Run the GitHub image build and composed container readiness drill | [Workflow run 30376178779](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30376178779) passed both jobs |
| SEC-001 | Complete for repository trust | Record revocation of every credential candidate from deprecated history | Keyed 32-entry ledger, exact-history rescan, supported-tip comparison, and protected signed evidence; external attestations remain a promotion gate |

## P0 - production candidate closure

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| OPS-001 | Complete | Promote the container package only after CI image/runtime evidence passes | Registry promotion tied to workflow run 30376178779 |
| OPS-002 | Complete | Exercise backup, tamper rejection, exact restore, and rollback on a disposable production host | Protected CI uploads signed, secret-free `axiom-recovery-drill-evidence-<commit>` artifacts with measured recovery point and recovery time |
| OPS-003 | Complete | Establish an initial latency, error-rate, saturation, and restart baseline | Protected CI uploads signed `axiom-slo-baseline-evidence-<commit>` from a fixed 40-request, concurrency-4 production profile |
| OPS-004 | Complete for candidate container | Enforce deny-egress while preserving explicit host-local Gateway ingress | Compose `network_mode: none`, permission-restricted Unix socket ingress, fail-closed route check, runner positive control, in-container negative probe, and signed protected-CI evidence |
| SEC-002 | Pending | Perform an independent threat-model and configuration review of the supported kernel | Findings ledger with severity and remediation owners |
| SUP-001 | Complete | Produce a reproducible release dossier without embedding secrets | v0.11.0 checksums, SPDX SBOM, provenance, policy and registry digests |

## P1 - single-node production pilot

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| PILOT-001 | Pending | Deploy one isolated non-public pilot using external secret custody | Deployment manifest and trust-root inventory |
| PILOT-002 | Complete for automated candidate; pilot endpoint pending | Add authenticated external metrics collection without exposing sensitive labels | Host-side relay preserves kernel deny-egress, requires the exact four-service Unix-socket scrape, emits 68 fixed OTLP/HTTP JSON points, and uploads signed least-privilege/cardinality evidence; repeat with the pilot collector |
| PILOT-003 | Complete for automated candidate; live route pending | Add alert routing with bounded retry, redaction, and delivery audit | Alertmanager v2 fixed vocabulary, exact HTTPS allowlist, alert-reserved persistent queue, retry/dead-letter audit, idempotency, negative paths, forced 503/429, and signed receipts; repeat with named pilot on-call route |
| PILOT-004 | Complete for candidate host | Automate four-service identity and operator/telemetry-token rotation with coordinated trust updates and exact rollback | Protected CI uploads signed, secret-free `axiom-credential-rotation-evidence-<commit>` after active/inactive trust and token rejection checks |
| PILOT-005 | Complete for candidate host | Re-encrypt and rotate the data-protection key across live state and retained recovery contexts with interruption recovery and rollback | Protected CI uploads signed `axiom-data-key-rotation-evidence-<commit>` after real-stack wrong-key rejection, backup restore, state-preserving rollback, and recovery-copy checks |
| PILOT-006 | Complete for candidate host | Automate encrypted backup retention and restore verification | Signed policy-derived plan/receipt, kill recovery, data-key interoperability, and weekly protected-CI restore evidence; repeat from pilot-owned media |
| PILOT-007 | Complete for automated candidate; pilot exercise pending | Enforce incident command, deterministic severity, authority-reducing containment, evidence preservation, communication, recovery, and closure | Protected CI uploads signed `axiom-incident-tabletop-evidence-<commit>` bound to five verified control artifacts; repeat with named pilot roster and independent human review |

## P2 - multi-host foundations

| ID | Work | Acceptance evidence |
|---|---|---|
| NET-001 | Specify and implement mutually authenticated service transport | Certificate lifecycle and peer-identity tests |
| NET-002 | Separate four services into independently deployable units | Failure-isolation and dependency-readiness drill |
| NET-003 | Implement admitted-node discovery and capability-aware scheduling | Sybil, expiry, quarantine, and partition tests |
| NET-004 | Define consistency and conflict behavior for online causal exchange | Partition/rejoin evidence and bounded state tests |
| NET-005 | Add deployment-independent secret and policy providers | Provider conformance and fail-closed startup tests |

## P3 - adapter and domain expansion

No external AI, messaging, education, health, government, finance, chain,
bridge, token, or embodied adapter may enter P3 implementation until it has a
named owner, least-privilege capability contract, consent and retention model,
failure budget, independent test environment, and rollback plan.

## Deferred research

- BFT or federated consensus;
- public token, bridge, liquidity, or settlement systems;
- arbitrary-code execution;
- zk proof verifier adapters;
- autonomous research and training;
- regulated domain deployment;
- post-quantum migration.

These remain research or specification work and are not production promises.
