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
| REP-001 | Complete | Make clean-room `main` the GitHub default and preserve the old line as deprecated | Default is `main`; legacy branch is `deprecated/legacy-main-pre-clean-room` |
| REP-002 | Complete | Enforce canonical documentation and lowercase-`main` CI | Documentation checks and [workflow run 30375390450](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30375390450) |
| REP-004 | Complete | Remove unsupported legacy runtimes and dependency manifests from the supported branch | Legacy source remains recoverable from Git history and the deprecated branch |
| REP-003 | Pending | Protect `main` against deletion and force pushes; require green verification | Branch-protection API result |
| REL-001 | Pending | Publish the verified 0.11.0 clean-room baseline | Signed release notes, source checksum, SBOM, provenance |
| REL-002 | Complete | Run the GitHub image build and composed container readiness drill | [Workflow run 30375390450](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30375390450) passed both jobs |
| SEC-001 | Pending | Record revocation of every credential from deprecated history | Rotation inventory and trust-store comparison |

## P0 - production candidate closure

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| OPS-001 | Complete | Promote the container package only after CI image/runtime evidence passes | Registry promotion tied to workflow run 30375390450 |
| OPS-002 | Pending | Exercise backup, tamper rejection, restore, and rollback on a disposable production host | Encrypted drill artifact with measured RPO/RTO |
| OPS-003 | Pending | Establish an initial latency, error-rate, saturation, and restart baseline | Versioned SLO report from a controlled load profile |
| SEC-002 | Pending | Perform an independent threat-model and configuration review of the supported kernel | Findings ledger with severity and remediation owners |
| SUP-001 | Pending | Produce a reproducible release dossier without embedding secrets | Checksums, SPDX SBOM, provenance, policy and registry digests |

## P1 - single-node production pilot

| ID | Work | Acceptance evidence |
|---|---|---|
| PILOT-001 | Deploy one isolated non-public pilot using external secret custody | Deployment manifest and trust-root inventory |
| PILOT-002 | Add authenticated external metrics collection without exposing sensitive labels | Collector integration tests and label-cardinality report |
| PILOT-003 | Add alert routing with bounded retry, redaction, and delivery audit | Negative-path tests and delivery receipts |
| PILOT-004 | Automate credential rotation with coordinated trust updates | Rotation and rollback drill |
| PILOT-005 | Automate encrypted backup retention and restore verification | Scheduled restore evidence |
| PILOT-006 | Document incident command, severity, containment, and recovery roles | Tabletop exercise record |

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
