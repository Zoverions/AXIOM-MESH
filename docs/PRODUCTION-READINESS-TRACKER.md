# AXIOM-MESH Production Readiness Tracker

**Updated:** 2026-07-29

**Release candidate:** 0.11.0

**Overall decision:** **Not production-promoted**

This tracker records evidence, not aspiration. A gate is `Pass` only when its
artifact is reproducible and tied to the release commit or image digest.

## Current gate status

| Gate | Status | Evidence | Remaining action |
|---|---|---|---|
| Source integrity | Pass | Verified clean-room tree, source checksum, SBOM, and provenance | Maintain for every release |
| Capability claims | Pass | Registry, generated status, claim-marker checks | Maintain on every change |
| Kernel tests | Pass | Protected kernel suite in the [Clean Kernel workflow](https://github.com/Zoverions/AXIOM-MESH/actions/workflows/kernel.yml) | Require on protected `main` |
| Host production drill | Pass | Real four-process supervisor test in the same run | Preserve on every runtime change |
| Container source policy | Pass | Dockerfile/Compose static release gate | Maintain digest pin |
| Container image build | Pass | Digest-pinned build in [GitHub run 30376178779](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30376178779) | Publish immutable image digest before pilot |
| Composed container drill | Pass | Readiness, authenticated operations, and teardown in the same run | Repeat for future release commits |
| Container network boundary | Pass for candidate topology | Compose `network_mode: none`; permission-restricted Unix socket ingress; startup rejects non-loopback and IPv4/IPv6 default routes; protected CI proves local ingress and blocked public TCP egress in signed evidence | Repeat on the pilot platform and independently review host/daemon policy |
| Dependency audit | Pass | Root and kernel lock audits in the same run | Maintain required check |
| Backup and restore | Pass for candidate-host lifecycle | Protected CI exercises encrypted backup, signed policy-derived retention, corrupt/live-lock/inventory-drift rejection, recoverable quarantine, killed-move recovery, exact restore and rollback; it also runs weekly and uploads signed evidence | Run the schedule against pilot-owned media and custody; authorize quarantine destruction separately |
| Observability | Pass for automated candidate relay | Dedicated route-limited scrape identity; exact four-service Unix-socket collection; 68 fixed OTLP points; Alertmanager v2 fixed vocabulary; exact HTTPS origin policy; alert-reserved queue; bounded retry/dead-letter audit; forced 503/429 and signed delivery receipts in protected CI | Repeat with pilot-owned HTTPS collector/on-call route, receiver retention, credential custody, and named acknowledgement |
| SLO and capacity | Pass for initial CI baseline | Signed protected-CI evidence records a fixed authenticated load profile, latency percentiles, zero-error requirement, throughput, CPU/memory observations, peak concurrency, and graceful restart | Repeat on dedicated pilot hardware under enforced resource limits and expected traffic |
| Resilience and fault tolerance | Pass for automated request-path candidate | Signed protected-CI evidence covers oversized-body rejection without idempotency reservation, concurrent rate limiting, real Sandbox suspension and loss, dependency-aware degradation, fail-closed supervisor exit, clean restart, and state preservation | Repeat cgroup OOM/CPU, disk, traffic, and dependency replacement scenarios under the pilot orchestrator |
| Credential rotation | Pass for service/API candidate lifecycle | Protected CI rotates all four Ed25519 identities, coordinated trust records, operator token, and least-privilege telemetry relay token against the real stack; proves inactive-credential rejection, scope confinement, dual-signed Grid key lineage, exact encrypted rollback, and unchanged data-key custody | Repeat under pilot secret custody |
| Data-key rotation | Pass for candidate-host lifecycle | Protected CI re-encrypts the live Grid, nested backup state, retained credential packages, and recovery database copies; proves wrong-key rejection, rotated-key restore, killed-cutover journal recovery, exact key restoration, and post-rotation state preservation | Repeat with pilot secret-manager versioning, escrow, approval, and destruction evidence |
| Deprecated credential trust | Pass for repository boundary; external evidence pending | Keyed ledger covers 32 conservative candidates across the locked deprecated graph; protected CI checks exact coverage and rejects reuse in the supported tip without exposing values | Dispose all 32 external attestations as verified or independently justified not-applicable |
| Independent security review | Pending | Internal evidence only | Commission scoped review |
| Incident response | Pass for automated candidate exercise | Machine-readable severity/action/closure policy; protected CI verifies six same-revision control artifacts and uploads signed secret-free tabletop evidence | Run a facilitated pilot exercise with named roster, notification tree, corrective owners, and independent human review |
| Release governance | Pass | Protected `main`, release verifier, and [v0.11.0 dossier](https://github.com/Zoverions/AXIOM-MESH/releases/tag/v0.11.0) | Maintain for every release |

## Promotion blockers

The following block production promotion:

1. no dedicated pilot-hardware capacity validation or 30-day availability observation;
2. no pilot-secret-custody rotation repetition or scheduled restore from
   pilot-owned media;
3. no independent review of the supported kernel and deployment policy;
4. all 32 deprecated-history entries still require provider, custodian, or
   independently reviewed not-applicable attestations;
5. no facilitated pilot incident exercise with a named roster and
   deployment-specific notification decision tree;
6. no operator-owned OTLP/Alertmanager receivers, receiver-side retention
   decision, or measured named-person alert acknowledgement.

## Gate owners

| Area | Accountable role | Required reviewer |
|---|---|---|
| Release and repository | Release manager | Security reviewer |
| Runtime and reliability | Platform operator | Independent operator |
| Security and credentials | Security owner | Maintainer not authoring the change |
| Data and recovery | Grid/data owner | Platform operator |
| Documentation and claims | Documentation owner | Release manager |

Names may change; roles and independent review requirements do not.

## Evidence retention

Promotion evidence must identify:

- source commit and clean/dirty state;
- container image digest and base-image digest;
- capability-registry, policy, operator-surface, and documentation digests;
- test and workflow identifiers;
- deployment configuration without secret values;
- backup/restore, rotation, telemetry-relay, and incident-drill timestamps;
- approvers, exceptions, and exception expiries.

Secret values, private keys, production tokens, and unencrypted user data must
never enter the evidence package.

## Reassessment rule

Any change to authentication, policy, grants, Sandbox authority, Grid schema,
encryption, backup, service topology, container base, secret handling, or
release gates reopens the relevant gate. Production promotion is not permanent
evidence for later commits.
