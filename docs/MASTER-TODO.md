# AXIOM-MESH Production Execution Queue

**Status:** canonical active queue
**Updated:** 2026-07-30
**Current kernel:** `0.12.0-dev.3`
**Current stage:** production candidate; not production-promoted

This queue orders concrete work across the production pilot, human-product
layer, multi-host platform, adapter ecosystem, and isolated frontier
laboratories. The [roadmap](ROADMAP.md) defines phase outcomes; this file defines
the next executable items. A completed item means its acceptance evidence
exists, not merely that code or prose was written.

## Promotion rules

A capability may move to `implemented` only when it has:

1. production-path code without a synthetic-success fallback;
2. fail-closed authorization and negative-path tests;
3. durable evidence from an executable verification command;
4. operator and user documentation that matches behavior;
5. a current status record bound to a commit.

Production promotion additionally requires green protected-branch CI, an
independently reviewed release dossier, a rollback target, and measured
deployment evidence. Critical/high security findings require independently
verified closure. Medium/low exceptions require an owner, rationale,
containment, expiry, and separate approval; an exception cannot waive
credential compromise, evidence-chain integrity, or unauthorized effects.

`Built`, `enabled`, `exposed`, `production-promoted`, and `marketed` are separate
states. Experimental and frontier work may be implemented in isolated paths,
but must remain disabled by default, excluded from production credentials and
user data, and explicitly classified in the capability registry until its own
promotion gates pass.

## P0 - repository and release control

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| REP-001 | Complete | Make clean-room `main` the GitHub default and preserve unsupported history outside it | Default is `main`; the pre-clean-room tip is immutable tag `archive/legacy-main-pre-clean-room-2026-05-21` |
| REP-002 | Complete | Enforce canonical documentation and lowercase-`main` CI | Documentation checks and [workflow run 30376178779](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30376178779) |
| REP-004 | Complete | Remove unsupported legacy runtimes, dependency manifests, and documentation from the supported branch | Pre-clean-room code remains at the immutable archive tag; the complete pre-0.12 documentation corpus remains on locked branch `deprecated/pre-0.12-documentation-corpus` |
| REP-003 | Complete | Protect `main` against deletion and force pushes; require green verification | Required kernel/container/CodeQL checks; deletion and force pushes disabled |
| REP-005 | Complete | Automate clean current-build source setup and dependency verification | Exact Node.js/npm policy, two zero-dependency locks, prohibited lifecycle scripts, unchanged-lock proof, protected-CI installation, and one command for installation plus full kernel/release verification |
| REL-001 | Complete | Publish the verified 0.11.0 clean-room baseline | [v0.11.0 prerelease](https://github.com/Zoverions/AXIOM-MESH/releases/tag/v0.11.0) with source checksum, SPDX SBOM, and provenance |
| REL-002 | Complete | Run the GitHub image build and composed container readiness drill | [Workflow run 30376178779](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30376178779) passed both jobs |
| SEC-001 | Complete for repository trust | Record revocation of every credential candidate from deprecated history | Keyed 32-entry ledger, exact-history rescan, supported-tip comparison, and protected signed evidence; external attestations remain a promotion gate |
| DOC-001 | Complete | Make every document on `main` specific to the current build | Exact current-build `docs/` allowlist, local-link verification, current build notes, and locked deprecated documentation branch |

## P0 - production candidate closure

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| OPS-001 | Complete | Promote the container package only after CI image/runtime evidence passes | Registry promotion tied to workflow run 30376178779 |
| OPS-002 | Complete | Exercise backup, tamper rejection, exact restore, and rollback on a disposable production host | Protected CI uploads signed, secret-free `axiom-recovery-drill-evidence-<commit>` artifacts with measured recovery point and recovery time |
| OPS-003 | Complete | Establish an initial latency, error-rate, saturation, and restart baseline | Protected CI uploads signed `axiom-slo-baseline-evidence-<commit>` from a fixed 40-request, concurrency-4 production profile |
| OPS-004 | Complete for candidate container | Enforce deny-egress while preserving explicit host-local Gateway ingress | Compose `network_mode: none`, permission-restricted Unix socket ingress, fail-closed route check, runner positive control, in-container negative probe, and signed protected-CI evidence |
| OPS-005 | Complete for automated request-path candidate; pilot resource limits pending | Exercise bounded request pressure and dependency process loss against the real production supervisor | Protected CI uploads signed `axiom-resilience-drill-evidence-<commit>` after oversized-body, concurrent rate-limit, dependency degradation, fail-closed exit, clean restart, and state-preservation checks |
| OPS-006 | Open | Restore caller-scoped Gateway abuse control under Unix-socket ingress; the local ingress bridge gives every request the same source address, so the pre-authentication per-address limiters become one shared bucket that an unauthenticated caller can exhaust for every principal and for the container readiness probe | A negative test in which an unauthenticated flood through the ingress socket leaves both a second principal's first request and the `/ready` healthcheck unaffected; see [full-depth audit A-3](audits/FULL-DEPTH-AUDIT-2026-08-10.md) |
| SEC-002 | Complete for review intake; authentic independent review pending | Perform an independent threat-model and configuration review of the supported kernel | Canonical current-build threat model plus authority-pinned, build/artifact-bound signed findings ledger; critical/high findings require independently verified closure, lesser exceptions require separate owned expiring approval, and synthetic conformance explicitly cannot claim a review or promotion |
| SUP-001 | Complete | Produce reproducible release verification without embedding secrets | Current `0.12.0-dev.3` source, registry, documentation, deployment, and migration verification; immutable v0.11.0 checksums, SPDX SBOM, and provenance remain on the published release |

## P1 - single-node production pilot

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| PILOT-001 | Pending | Deploy one isolated non-public pilot using external secret custody | Deployment manifest and trust-root inventory |
| PILOT-002 | Complete for automated candidate; pilot endpoint pending | Add authenticated external metrics collection without exposing sensitive labels | Host-side relay preserves kernel deny-egress, requires the exact four-service Unix-socket scrape, emits 68 fixed OTLP/HTTP JSON points, and uploads signed least-privilege/cardinality evidence; repeat with the pilot collector |
| PILOT-003 | Complete for automated candidate; live route pending | Add alert routing with bounded retry, redaction, and delivery audit | Alertmanager v2 fixed vocabulary, exact HTTPS allowlist, alert-reserved persistent queue, retry/dead-letter audit, idempotency, negative paths, forced 503/429, and signed receipts; repeat with named pilot on-call route |
| PILOT-004 | Complete for candidate host | Automate four-service identity and operator/telemetry-token rotation with coordinated trust updates and exact rollback | Protected CI uploads signed, secret-free `axiom-credential-rotation-evidence-<commit>` after active/inactive trust and token rejection checks |
| PILOT-005 | Complete for candidate host | Re-encrypt and rotate the data-protection key across live state and retained recovery contexts with interruption recovery and rollback | Protected CI uploads signed `axiom-data-key-rotation-evidence-<commit>` after real-stack wrong-key rejection, backup restore, state-preserving rollback, and recovery-copy checks |
| PILOT-006 | Complete for candidate host | Automate encrypted backup retention and restore verification | Signed policy-derived plan/receipt, kill recovery, data-key interoperability, and weekly protected-CI restore evidence; repeat from pilot-owned media |
| PILOT-007 | Complete for automated candidate; pilot exercise pending | Enforce incident command, deterministic severity, authority-reducing containment, evidence preservation, communication, recovery, and closure | Protected CI uploads signed `axiom-incident-tabletop-evidence-<commit>` bound to eleven verified control artifacts; repeat with named pilot roster and independent human review |
| PILOT-008 | Complete for evidence intake; authentic package pending | Require one build-bound signed pilot package without allowing either verifier to promote production | Separately pinned policy authority, five distinct review roles, exact canonical policy/dossier/13-envelope inventory, per-type v2 detail contracts, raw-byte digest and build binding, semantic/secret/symlink/unexpected-file rejection, role signatures, chronology checks, signed CI conformance evidence, and explicit `production_promoted: false` |
| PILOT-009 | Pending | Dispose the 32 external credential-history attestations | Provider/custodian attestations or independently reviewed not-applicable dispositions bound to the inventory |
| PILOT-010 | Pending | Commission and complete the authentic independent security review | Authority-pinned findings ledger for the exact source, image, deployment policy, and pilot configuration, with verified remediation |
| PILOT-011 | Pending | Complete the 30-day controlled pilot observation | Signed availability, capacity, alert acknowledgement, incident, backup, rotation, RPO, RTO, custody, and operator records |

## P1H - human utility and network activation

This track runs in parallel with the controlled pilot. It may produce local and
invitation-only previews, but it cannot imply production promotion.

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| UX-001 | Complete | Define and implement a versioned browser/client contract for the authenticated Gateway API | Machine contract and hand-reviewed JSON Schema cover all 27 authenticated routes; same-origin client enforces exact inputs, explicit errors, 1 MiB requests, 2 MiB responses, 1 millisecond-30 second timeouts, AbortSignal cancellation, stable idempotent replay, source parity, real four-service compatibility, and no direct internal-service access |
| UX-002 | In progress | Build `apps/axiom-one/` as the local personal-node browser/PWA shell outside the trusted kernel | Experimental loopback-only PWA foundation has node health, reviewed bounded Ask, explained approval and receipt records, governed owner-scoped Vault lifecycle, honest unavailable Share/Circles, and advanced raw inspection surfaces; full onboarding, complete lifecycle, session/device review, accessibility/usability evidence, packaging, and support remain pending |
| UX-003 | In progress | Make plans, grants, denials, uncertainty, approvals, revocations, and receipts understandable to non-developers | Exact experimental explanation contract maps five bounded actions, all 20 stable Gateway outcomes, and all 37 current kernel event kinds; distinguishes active/expired/consumed approvals; provides reversible pre-submit review and same-key uncertain-outcome recovery; preserves raw evidence; and explicitly refuses an authoritative pre-execution kernel-plan claim; separately bound consequential plan/approval, human usability, and promotion evidence remain pending |
| UX-004 | In progress | Expose encrypted memory, ownership, provenance, ingestion, tombstoning, export, deletion, and recovery through the primary interface | Current bounded slice creates owner-scoped private notes, lists only authorized active objects and edges, records one of three exact directional provenance relations without replacement, confirmation-binds exact tombstones, creates exact-object local exports, reveals bundles only after a separate action, and proves a second principal cannot read, link, export, or tombstone the owner's object; arbitrary relations, edge deletion, bulk ingestion, permitted hard deletion, restore, and human recovery evidence remain pending |
| UX-005 | Pending | Harden the browser security boundary | Exact origins, CSP, CSRF protection, secure session/cookie policy, idle timeout, device revocation, no secret leakage to logs or browser storage, and adversarial tests |
| UX-006 | Pending | Make phone, keyboard, screen-reader, reduced-motion, contrast, and plain-language accessibility release gates | Automated accessibility checks plus documented manual test matrix and user evidence |
| UX-007 | Pending | Package a non-developer local preview and safe update path | Signed artifacts, rollback, migration, uninstall, backup guidance, no production credentials, and no third-party analytics/account dependency |
| AI-001 | Pending | Implement one least-privilege AI provider adapter outside the kernel | Named provider/model, exact egress, request data scope, purpose, timeout, cancellation, cost ceiling, retention, redaction, result receipt, and failure tests |
| AI-002 | Pending | Support local and user-supplied model providers under the same adapter contract | Conformance suite proving provider replacement, offline/degraded modes, no authority expansion, and no synthetic success |
| AI-003 | Pending | Deliver bounded useful workflows: summarize, organize, compare, draft, plan, extract commitments, identify gaps, and prepare evidence packages | Scenario tests, usefulness evaluation, provenance, correction path, privacy leakage assessment, and human confirmation before effects |
| VERIFY-001 | Pending | Release AXIOM Verify as a standalone local/static verifier | Independent signature, digest, continuity, canonical-package, signer, scope, alteration, and non-claim explanations without node membership |
| CIRCLE-001 | Pending | Implement invitation, membership, device, role, consent, policy, expiry, removal, and revocation records for small trusted Circles | Negative tests for removed/expired devices, role escalation, copied identity, stale invitations, and cross-Circle access |
| CIRCLE-002 | Pending | Add selectively shared objects, proposals, tasks, commitments, approvals, evidence timelines, and visible conflicts | Two-node and multi-user tests proving owner scope, independent apply approval, concurrency visibility, explicit resolution, export, and exit |
| CIRCLE-003 | Pending | Run one bounded real-world Circle pilot | Named participants, informed consent, support log, useful completed workflow, revocation/export/deletion exercise, and human trust-comprehension report |
| MANAGED-001 | Specified | Define AXIOM Managed Node without converting hosting into data ownership | Tenant isolation, customer-controlled export and keys where practical, operator least privilege, support access receipts, migration, backup, deletion, and decommissioning design |

## P2 - multi-host foundations

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| NET-001 | Complete for single-host candidate; multi-host custody pending | Specify and implement mutually authenticated service transport | TLS 1.3, CA and exact active-leaf validation, signed-caller/certificate binding, expiry, offline atomic rotation, retired-leaf rejection, exact rollback, real-stack drill, and signed protected-CI evidence |
| NET-002 | Complete for single-host candidate; pilot orchestrator pending | Separate four services into independently deployable units | Per-unit application/TLS private keys, Grid-only durable state, internal deny-egress network, signed independent-process failure-isolation and state-preservation drill, and protected four-container Sandbox-only restart evidence |
| NET-003 | Complete for single-Grid reservation candidate; remote dispatch and multi-host evidence pending | Implement admitted-node discovery and capability-aware scheduling | Signed v2 metadata, authenticated signed discovery, deterministic encrypted leases, copied-key/owner/domain/resource controls, expiry/quarantine/partition-by-missed-renewal tests, restart persistence, and protected signed drill evidence |
| NET-004 | Complete for two-Grid candidate; independent-host pilot pending | Define consistency and conflict behavior for online causal exchange | Pinned Grid-signed source events, node-signed bundles, encrypted ordered staging, bounded retry, owner-scoped duplicate preflight, exact independent apply approval, two-real-stack partition/rejoin/conflict/resolution drill, and protected signed evidence |
| NET-005 | Complete for signed provider protocol and reference adapter; pilot custody adapter pending | Add deployment-independent secret and policy providers | Independent Ed25519 signers, digest-pinned command chains, nonce-bound short-lived exact inventories, private per-start materialization, semantic validation, cleanup, rotation/restart proof, invalid-signer fail-closed startup, and signed protected-CI conformance evidence |
| NET-006 | Pending | Add authenticated remote dispatch and result provenance | Workload identity, grant/input/software binding, measured resources, timeout/cancellation, replay rejection, partial-failure semantics, compensation, signed result evidence, and malicious-node tests |
| NET-007 | Pending | Repeat causal exchange and service operation across independently operated WAN hosts | External custody, latency/loss/clock/partition injection, sustained backlog, data residency, recovery, key rotation, and independent review evidence |
| NET-008 | Pending | Define stronger membership identity and endpoint-health evidence before distributed-compute promotion | Threat model and tests for Sybil, copied ownership, endpoint substitution, stale measurement, collusion, quarantine, appeal, and re-admission |
| NET-009 | Complete for reference single-host topology; pilot orchestrator pending | Enforce an explicit per-service ingress/egress graph | Default-deny 38-route application policy, policy-derived mTLS peer allowlists, four exact internal network segments, loopback-only plaintext development, release provenance, and protected required/forbidden-edge proof |

## P3 - controlled adapters and product ecosystem

No adapter receives production authority merely because it exists. Every item
requires a named owner, least-privilege capability contract, consent and
retention model, failure budget, independent test environment, abuse analysis,
and rollback plan.

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| STUDIO-001 | Pending | Build AXIOM Studio for capsule and adapter development | Manifest, schema, SBOM, permission, threat-model, fixtures, compatibility, conformance evidence, signing, revocation, and rollback generation |
| ADAPTER-001 | Pending | Implement one consent- and rate-bounded messaging adapter | Exact account scope, recipient confirmation, impersonation protection, retention/deletion, abuse controls, retries, cancellation, receipts, and uninstall |
| ADAPTER-002 | Specified | Implement controlled ActivityPub, email, and webhook publishing bridges | Separate adapter identities, exact destinations, content previews, moderation, deletion limits, inbound trust, rate controls, and no authority inheritance |
| ID-001 | Specified | Add a named Verifiable Credentials profile and selective-disclosure boundary | Exact schemas, issuer/verifier trust, status/revocation, holder consent, correlation analysis, interoperability vectors, and independent review |
| ZK-001 | Specified | Add one named zero-knowledge proof verifier adapter | Fixed circuit, verification key, public-input schema, implementation digest, positive/negative vectors, resource limits, and no generic-proof claim |
| STORAGE-001 | Pending | Implement controlled content transfer for admitted storage offers | Object encryption, owner scope, capacity reservation, integrity, retry, deletion, provider loss, retrieval, payment-independent operation, and receipts |
| CATALOG-001 | Specified | Build a curated capsule catalogue before any open marketplace | Quarantine, review, signer identity, versioning, update policy, permissions diff, vulnerability response, revocation, moderation, and dispute process |
| GOVERN-001 | Specified | Add portable governance delegation and organization policy packs | Scope, expiry, revocation, non-transferability, appeal, emergency limits, cross-node verification, and no weakening of individual/global denial floors |
| MANAGED-002 | Specified | Implement managed-node deployment and lifecycle tooling | Provisioning, tenant isolation, updates, rollback, backup, key rotation, export, migration, support access audit, incident response, and decommissioning evidence |

## P4 - isolated frontier incubation

Frontier items may be substantially built, but only in isolated laboratories or
disabled capability paths. They receive synthetic identities, data, value, and
networks unless a separately promoted test environment explicitly authorizes
otherwise.

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| LAB-001 | Research | Build a distributed-authority simulator and executable protocol reference | Formal state/transition specification, model checking, Byzantine fault injection, partition/liveness tests, governance-capture scenarios, and reproducible simulations |
| LAB-002 | Research | Implement candidate BFT, replicated-evidence, threshold-authorization, and catastrophic-recovery protocols | Safety/liveness invariants, version-skew and rollback behavior, adversarial tests, independent cryptographic review, and proof that complexity is justified |
| LAB-003 | Research | Build a test-value-only settlement laboratory | Double-entry reconciliation, token/non-token models, escrow, rewards, bonds, staking, treasury, dispute, insolvency, oracle, MEV, bridge, key-compromise, and invariant tests |
| LAB-004 | Research | Build bounded autonomous-agent and research-loop runtimes | Budgets, cancellation, checkpoints, provenance, evaluator separation, escalation, no self-authority expansion, adversarial tool tests, and reproducible outcome scoring |
| LAB-005 | Research | Build task-market, service-offer, compensation, payroll-simulation, and dispute primitives | Identity, labor-policy assumptions, accounting, quality evidence, cancellation, appeal, inheritance, fraud, collusion, and synthetic-value-only tests |
| LAB-006 | Research | Build regulated-domain development harnesses for education, health, government, finance, legal, and employment capsules | Synthetic/consented data boundary, jurisdiction profiles, consent, retention, appeal, accessibility, professional responsibility, safety, audit, and domain-review templates |
| LAB-007 | Research | Build embodied-system simulation and safety envelopes | Device identity, command grants, geofence, force/energy limits, digital twin, degraded mode, emergency halt, operator takeover, incident evidence, and no real actuation by default |
| LAB-008 | Research | Evaluate arbitrary-code isolation without promoting it | Rootless runtime, digest allowlist, syscall/filesystem/network/device limits, secret denial, resource exhaustion, escape tests, teardown, provenance, and external isolation review |
| LAB-009 | Research | Develop a post-quantum migration plan and hybrid test profile | Inventory, algorithm agility, compatibility, hybrid signatures/KEM experiments, performance, downgrade prevention, backup/key-history implications, and standards tracking |

These laboratories create future options and reduce uncertainty. They are not
production promises, public settlement systems, autonomous authorities, or
regulated-domain approvals.
