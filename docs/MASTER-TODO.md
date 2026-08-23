# AXIOM-MESH Production Execution Queue

**Status:** canonical active queue
**Updated:** 2026-08-23
**Current kernel:** `0.12.0-dev.3`
**Current stage:** production candidate; not production-promoted

This queue orders concrete work across the controlled pilot, human-product
layer, machine/runtime interoperability, multi-host platform, adapter ecosystem,
and isolated frontier laboratories. [ROADMAP.md](ROADMAP.md) defines phase
outcomes; this file defines executable work.

A completed item means its acceptance evidence exists. It does not necessarily
mean the code is enabled, exposed, production-promoted, or marketed.

## Promotion rules

A capability may move to `implemented` only when it has production-path code,
fail-closed authorization/negative tests, durable executable evidence, matching
operator/user documentation, and a current registry/status record.

Production promotion additionally requires green protected CI, an independently
reviewed release dossier, rollback, and measured deployment evidence.

**Built, enabled, exposed, production-promoted, and marketed are separate
states.** A built primitive that production policy/registry/routes cannot reach
must remain described as production-unreachable until those gates are
explicitly opened.

## P0 — repository and release control

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| REP-001 | Complete | Clean-room `main` + immutable legacy preservation | Default `main`; legacy tag `archive/legacy-main-pre-clean-room-2026-05-21` |
| REP-002 | Complete | Canonical docs + protected lowercase-`main` CI | Documentation and workflow gates |
| REP-003 | Complete | Branch protection | Force-push/deletion disabled; required verification |
| REP-004 | Complete | Remove unsupported legacy runtime/docs from supported branch | Legacy tag + locked `deprecated/pre-0.12-documentation-corpus` branch |
| REP-005 | Complete | Exact source setup/dependency verification | Node `>=24.14.0 <25`; CI/.node-version 24.18.0; production image 24.19.0; npm 11.x; two zero-dependency locks; lifecycle scripts disabled; unchanged-lock proof |
| REL-001 | Complete | Publish clean-room 0.11 baseline | Immutable `v0.11.0` prerelease with checksum/SBOM/provenance |
| REL-002 | Complete | Candidate image build/readiness | Protected container evidence |
| SEC-001 | Complete for repository trust | Revoke deprecated-history credential candidates from supported trust | 32-entry keyed ledger + supported-tip reuse rejection; external dispositions still pending |
| DOC-001 | Complete | Canonical current-build documentation boundary | Exact allowlist, link verification, locked deprecated corpus |
| DOC-002 | Complete for current narrative gate | Prevent current-state authority/evidence regressions | Semantic tests for machine ceilings, Grid continuity, repository-effect reachability/draft-PR/no-merge, runtime-adapter non-certification + computed route/capability/link checks |

## P0 — production candidate closure

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| OPS-001 | Complete | Candidate container package | Protected image/runtime evidence |
| OPS-002 | Complete | Backup/tamper/restore/rollback drill | Signed recovery evidence |
| OPS-003 | Complete | Initial SLO/load/restart baseline | Signed bounded-load evidence |
| OPS-004 | Complete for candidate | Deny-egress + Unix-socket ingress | `network_mode:none`, route rejection, public TCP negative probe |
| OPS-005 | Complete for candidate request path | Request pressure + dependency loss | Oversize/rate/dependency/fail-closed/restart/state evidence |
| SEC-002 | Complete for intake; authentic review pending | Exact current-build independent-review contract | Threat model, signed findings/remediation/exception verifier |
| SEC-003 | Complete | Make capability consumption restart-safe | Grid-backed consume-before-execute, deterministic per-JTI consume event, signed receipt, exact Sandbox process-epoch binding, restart/crash replay rejection, burn-on-uncertainty semantics; no exactly-once external-effect claim |
| SEC-004 | Complete | Restrict authority/evidence canonicalization to plain JSON data | Reject class/custom prototypes, accessors, non-enumerable/symbol state, sparse/custom arrays; preserve safe JSON `__proto__`; array/object hidden-state regressions |
| SEC-005 | Complete | Make policy-constraint merge direction explicit | Declared monotonic boolean/numeric operators, finite allowlist intersection using canonical digest identity, ambiguous conflicts fail closed, exhaustive/property regressions; current production policy still has no action-level constraints |
| SUP-001 | Complete | Reproducible release verification | Source/registry/docs/deployment/migration checks; no embedded secrets |

## P0 — install and first-class application convergence

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| INSTALL-001 | Pending; profile specified | Fresh Linux personal/local node installer | Starts from a supported clean Linux host with no AXIOM checkout; verifies one immutable signed release; installs only pinned host/runtime dependencies; creates unprivileged service/data/secret boundaries; defaults to no public ingress and deny egress; proves readiness, reboot, update, incompatible/tampered-update rejection, rollback-or-restore, second-host restore, uninstall, and non-secret install receipts |
| INSTALL-002 | Pending; profile specified | Infrastructure/support-node installer | Clean headless-host installation of independently deployable units; explicit role selection without automatic network enrollment; per-unit identities, Grid-only durable state, default-deny network, observability, backup/restore, rotation, quarantine/revocation, update/rollback, decommission, and community-testnet reproduction evidence |
| EDU-001 | In progress; Mesh convergence candidate | Keep Axiom Education first-class and independently releasable while synchronized to Mesh | Governed learner memory/write/self-read substrate on current Mesh; exact merged Mesh compatibility pin in `Zoverions/Axiom-Education`; feature-adoption ledger; downstream protected CI; no automatic production/provider/curriculum/cross-subject authority claim |
| APP-001 | Complete for catalogue/specification; runtime adoption remains per application | Maintain first-class application catalogue and downstream compatibility discipline | Machine-readable application catalogue, application/release independence, change-impact classes, feature-adoption states, documentation synchronization, install-without-authority invariants |
| BACKUP-ADAPTER-001 | Pending; architecture specified | Provider-neutral encrypted remote-backup adapter contract | Local signed/encrypted backup envelope; narrow provider credential reference; exact copy/list/read/delete scopes; Google Drive/OneDrive/S3-compatible or decentralized providers remain adapters; restore verified locally; provider never receives Grid plaintext/data key/general Gateway authority |

## P1 — single-node production pilot

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| PILOT-001 | Pending | Deploy one isolated non-public pilot with external secret custody | Deployment manifest + trust-root inventory |
| PILOT-002 | Candidate mechanism complete; pilot endpoint pending | External metrics | Least-privilege Unix-socket scrape, bounded OTLP, signed evidence; repeat with pilot receiver |
| PILOT-003 | Candidate mechanism complete; pilot route pending | Alert routing | Fixed vocabulary, exact HTTPS destination, bounded retry/dead-letter/idempotency/receipts; repeat with named on-call route |
| PILOT-004 | Candidate mechanism complete | Service/API credential rotation | Active/inactive trust and exact rollback evidence; repeat under pilot custody |
| PILOT-005 | Candidate mechanism complete | Data-protection-key rotation | Live/recovery re-encryption, wrong-key rejection, interruption recovery, rollback; repeat under pilot custody |
| PILOT-006 | Candidate mechanism complete | Backup retention + restore | Signed plan/receipt, recoverable quarantine, protected restore; repeat from pilot-owned media |
| PILOT-007 | Candidate mechanism complete; human exercise pending | Incident command/tabletop | Automated signed composition; repeat with named pilot roster and human review |
| PILOT-008 | Intake contract complete; authentic package pending | Exact pilot evidence package | Five roles, 720-hour contract, exact 13-envelope package, explicit non-promotion result |
| PILOT-009 | Pending | Resolve 32 external credential-history dispositions | Provider/custodian receipt or independently reviewed N/A per entry |
| PILOT-010 | Pending | Authentic independent security review | Exact source/image/deployment/pilot findings ledger + verified remediation |
| PILOT-011 | Pending | 30-day controlled observation | Availability/capacity/alerts/incidents/recovery/rotation/RPO/RTO/custody records |
| PILOT-012 | Pending | External Grid continuity-anchor cadence/custody | Anchor outside `AXIOM_DATA_DIR`, custody/retention record, full-genesis verification, truncation negative test, explicit newest-anchor coverage boundary |

## P1H — human utility and network activation

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| UX-001 | Complete | Versioned Gateway client contract | Machine contract and reviewed schema cover all 31 authenticated routes; relative-only targets; explicit errors; bounded request/response/timeout; cancellation/idempotency; real-stack compatibility |
| UX-002 | In progress | AXIOM One local browser/PWA shell | Loopback-only proxy, memory-only token, bounded Ask/Vault/receipt/raw-evidence views; local social UI integration, onboarding/session/device/accessibility/package work remain |
| UX-003 | In progress | Human authority explanations | Five bounded actions, stable outcomes/events, approval states, raw evidence, uncertainty recovery; broader authoritative consequential plan/execute + comprehension evidence pending |
| UX-004 | In progress | Governed memory lifecycle | Owner create/list, three exact provenance links, correction-without-replacement, tombstone, selective export, bundle reveal, cross-principal negatives; edge deletion/hard deletion/restore/bulk ingestion pending |
| UX-005 | Pending | Browser security boundary | CSP/CSRF/origin/session/cookie/token/clickjacking/device-revocation/storage tests |
| UX-006 | Pending | Accessibility/phone usability | Keyboard/screen-reader/contrast/reduced-motion/phone/plain-language human evidence |
| UX-007 | Pending | Signed local packaging/onboarding | Safe update/rollback/recovery/uninstall/first-use evidence |
| SOCIAL-001 | In progress | Owner-local actor/persona/publication + remote-review surface | Intent-authorized local create/supersede/retract; A2 non-raw publication projection; owner-derived `/v1/social`; owner-only read-only `/v1/social/remote-review` with no schema creation or social/network effect; no federation/network distribution; AXIOM One UI next |
| ARCH-001 | Complete for draft specification; no runtime capability | Define Personal Compute Fabric and Local Trust Plane `1.0.0-draft.1` | Canonical architecture, explicit non-claims, phased MVP, and five JSON Schemas for Personal Agent Pack, Runtime Capsule, Runtime Adapter, Compute Node Profile, and Local Trust Envelope; documentation checks only |
| AI-001 | Pending | One least-privilege AI provider | Exact provider/model/egress/data/purpose/budget/timeout/cancel/retention/receipt/failure tests |
| AI-002 | Pending | Local/user-supplied providers under same contract | Replacement/offline/degraded/no-authority-expansion conformance |
| AI-003 | Pending | Bounded useful personal workflows | Usefulness/provenance/correction/privacy/cost/latency/cancellation/human-confirmation evaluation |
| PACK-001 | Pending | Implement secret-free Personal Agent Pack export/import | Supported memory, preferences, policy, consent, routing, evaluation, licences, recovery, cross-provider continuity, deletion, migration, and no plaintext credential evidence |
| ORCH-001 | Pending | Implement one immutable bounded single-agent Runtime Capsule | Exact implementation/SBOM, interfaces, requested authority, step/call/unit/cost/time budgets, cancellation, stop, fallback, receipts, revocation, uninstall, rollback, and no self-authority expansion |
| ROUTE-001 | Pending | Implement policy-first compute placement with Private, Balanced, Best, and Budget modes | Hard privacy/consent/destination/jurisdiction/licence/security/health/freshness/capability/deadline/budget filters, transparent ranking, forbidden-fallback tests, and local evaluation ledger |
| DEVICE-001 | Pending | Prototype a phone-relayed push-to-talk personal endpoint | Unique revocable identity, authenticated pairing, signed firmware, physical mute, recording indication, bounded audio, update/rollback, loss/replacement, no Grid/provider/payment secrets, and honest prototype-only hardware claims |
| TRUST-001 | Pending | Implement deterministic Local Trust access authorization with synthetic credentials | Canonical request, named verifiers, passkey/user-presence proof, status freshness, deny-dominant policy, one-use mandate, denial/uncertainty receipts, replay/tamper tests, and no model in allow/deny logic |
| VERIFY-001 | Pending | AXIOM Verify | Independent local/static signature/digest/continuity/scope/non-claim verification |
| CIRCLE-001 | Pending | Circle membership/device/role/consent/revocation | Escalation/stale/removed/cross-Circle negative tests |
| CIRCLE-002 | Pending | Shared objects/proposals/tasks/commitments/approvals/conflicts | Multi-user owner scope, independent apply, concurrency, resolution, export/exit |
| CIRCLE-003 | Pending | Bounded real Circle pilot | Consent, useful workflow, support log, revocation/export/deletion, trust-comprehension report |
| MANAGED-001 | Specified | Managed Node design without platform data ownership | Tenant isolation, export/keys, operator least privilege, support receipts, recovery/migration/decommissioning |

## P1M — machine principals, runtimes, agent participation, and safe external effects

Completion in this track does **not** automatically promote or expose a
capability.

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| MACHINE-001 | Complete | Human-sponsored constrained machine principals | Finite scopes/actions/purposes/destinations; runtime/expiry/non-delegation; execution-time/request-size/rate/concurrency/response-size ceilings |
| MACHINE-002 | Complete | Policy-filtered machine discovery | `/v1/machine-discovery` exposes requestability only; normal intent/policy re-evaluation remains required |
| MACHINE-003 | Complete | Grid-attested terminal machine receipts | Request/machine-authority digests, accepted/terminal anchors, chain assurance, terminal outcome digest, independent Grid-key verification |
| RUNTIME-001 | Complete for contract + synthetic reference | Agent Runtime Adapter v1 | Byte-pinned schema; 28-case grant/capability/credential/lifecycle/cancel/receipt/rollback drill; no external-runtime certification |
| RUNTIME-002 | Pending | First bounded maintained external runtime integration | Exact upstream pin; source/licence/dependency/threat review; no-secret read-only Gateway path; native authorization/cancel/idempotency/receipt parity; direct-service denial; independent review |
| AGENT-001 | Complete for repository-native evidence workflow | Security Agent Cell | Scout/reproducer/verifier/patcher/triage roles, fresh-evidence and independence rules, canonical red-team lifecycle, public/private safety split, protected CI; no merge/deploy/credential/protocol/production/spending/hardware/destructive authority |
| AGENT-002 | Complete for identity-evidence laboratory only | Portable machine identity | Issuer-signed principal/sponsor/key/runtime/history/rotation/recovery/expiry/revocation/currentness evidence; zero capability-registry/authority effect; no self-service enrollment or delegation |
| AGENT-003 | Pending | Converge Agent Contributor Mode progression | Select one currentness -> bounded contributor session -> attenuation/delegation -> signed handoff -> portable receipt -> independent verification path; supersede overlapping laboratory variants before activation |
| AGENT-004 | Pending | Govern first consequential contributor effect | Exact sponsor/currentness/authority digest, finite action/data/destination/budget, late revalidation, disposable execution, durable receipt, revocation, independent review, no authority from identity/reputation/majority |
| INTENT-001 | Complete for production-unreachable core | Signed dynamic repository-plan resolution | Fresh eligibility, exact repo/base/path/lifetime, signed plan, content-addressed resolution/handoff, staleness/tamper/substitution rejection |
| INTENT-002 | Complete for production-unreachable core | Resolver admission/review/package/application observation | Independent implementation/security reviews, exact-one mapping package, exact before/after observation, no installation-as-authority |
| INTENT-003 | Complete for production-unreachable core | Preserve target policy + atomically durable preparation | Resolved target policy/confirmation/independent approval; authenticated Grid read; one transaction `approval.consumed` + `external.effect.prepared`; one-winner concurrency proof |
| INTENT-004 | **Complete for production-unreachable core** | Evidence-first outbox + repository operator + completion binding | Durable prepare before I/O; uncertainty remains prepared; signed operator receipt before `external.effect.completed`; restart/idempotency/completion-failure tests; operator independently verifies Grid proof before any GitHub request; fixed repo; exact docs paths/content; deterministic effect branch; creates/recovers **open draft PR**; stale-main/path/content/proof/transport-loss tests; `merge_performed:false`; `base_branch_content_changed:false` |
| INTENT-005 | Pending and explicitly gated | Consider first production resolver mapping | Exact capability/policy/registry/runtime change, public route review, operator credential/egress custody, rollback, negative tests, independent review, protected CI, separate promotion decision; **no direct-main or merge authority** |

The current repository effect is therefore a **built proposal mechanism, not a
production-reachable action**. `mesh/config/intent-remediation-executors.json`
has zero mappings, production policy has no
`repository.docs.pull-request.create`, and no supported runtime route activates
the chain.

Tracked resolver work remains associated with
[issue #967](https://github.com/Zoverions/AXIOM-MESH/issues/967). Future issue
closure should distinguish completion of the safety substrate from any later
production activation decision.

## P2 — multi-host foundations

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| NET-001 | Complete for single-host candidate; multi-host custody pending | Mutually authenticated service transport | TLS 1.3, CA/active-leaf validation, signed caller binding, rotation/rollback, real-stack evidence |
| NET-002 | Complete for single-host candidate; pilot orchestrator pending | Independently deployable units | Per-unit credentials, Grid-only durable state, segmented deny-egress, failure isolation/recovery |
| NET-003 | Complete for reservation candidate | Admitted-node discovery/scheduling | Signed v2 metadata, filtered discovery, deterministic encrypted leases, owner/domain/resource/security/expiry/quarantine tests |
| NET-004 | Complete for two-Grid candidate | Online causal exchange | Pinned Grid evidence, signed bundles, encrypted ordered staging, independent approval, partition/rejoin/conflict/convergence tests |
| NET-005 | Complete for provider protocol/reference adapter | Deployment-independent secret/policy providers | Independent signers, digest-pinned commands, nonce-bound exact inventories, private materialization, invalid-signer rejection |
| NET-006 | Pending | Authenticated remote dispatch/result provenance | Workload identity, input/software binding, measured resources, timeout/cancel/replay/partial failure, compensation, signed result evidence |
| NET-007 | Pending | Independently operated WAN hosts | External custody, latency/loss/clock/partition/backlog/residency/recovery/key-rotation evidence |
| NET-008 | Pending | Stronger membership/endpoint-health evidence | Sybil/copied-owner/endpoint substitution/stale measurement/collusion/quarantine/appeal/re-admission tests |
| NET-009 | Complete for reference single-host topology | Explicit service ingress/egress graph | Default-deny 42-route application policy, derived mTLS peers, four segments, required/forbidden-edge proof |

## P3 — controlled adapters and product ecosystem

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| STUDIO-001 | Pending | AXIOM Studio | Manifest/schema/SBOM/permission/threat/fixtures/compatibility/conformance/signing/revocation/rollback generation |
| ADAPTER-001 | Pending | One bounded messaging adapter | Account scope, recipient confirmation, impersonation/abuse controls, retention/deletion, retries/cancel/receipts/uninstall |
| ADAPTER-002 | Specified | ActivityPub/email/webhook publishing bridges | Separate identities, exact destinations, previews/moderation/deletion limits/inbound trust/rate controls |
| ID-001 | Specified | Named VC/selective-disclosure profile | Schemas, issuer/verifier trust, revocation, holder consent, correlation analysis, vectors, review |
| ID-002 | Specified; synthetic/test authority only | Implement the Local Trust identity-presentation laboratory | WebAuthn, one exact credential profile, holder binding, minimum disclosure, status freshness, revocation, wrong-holder/issuer/audience/replay tests, readable non-claims, and independent AXIOM Verify reproduction |
| PAY-001 | Specified; synthetic value and processor sandbox only | Implement payment mandate and reconciliation simulation | Tokenized credential boundary, exact payee/amount/currency/fee/purpose, confirmation, local reserve, one-use mandate, idempotency, timeout/late success, uncertain state, reconciliation, refund, reversal, dispute, balanced accounting, and no real-value claim |
| ZK-001 | Specified | One named zk verifier adapter | Fixed circuit/key/public inputs/implementation digest/vectors/resource limits |
| STORAGE-001 | Pending | Controlled storage transfer | Encryption/owner/capacity/integrity/retry/deletion/provider-loss/retrieval/receipts |
| CATALOG-001 | Specified | Curated capsule catalogue | Quarantine/review/signer/version/update/permission diff/vulnerability/revocation/moderation/dispute |
| GOVERN-001 | Specified | Portable governance delegation/policy packs | Scope/expiry/revocation/non-transferability/appeal/emergency limits/cross-node verification |
| MANAGED-002 | Specified | Managed-node lifecycle tooling | Provisioning/isolation/update/rollback/backup/key rotation/export/migration/support audit/decommissioning |

## P4 — isolated frontier incubation

| ID | Status | Work | Acceptance evidence |
|---|---|---|---|
| LAB-001 | Research | Distributed-authority simulator/reference protocol | Formal state model, model checking, Byzantine/partition/liveness/governance-capture experiments |
| LAB-002 | Research | BFT/replicated-evidence/threshold-authorization candidates | Safety/liveness/version-skew/rollback/adversarial/independent cryptographic review |
| LAB-003 | Research | Test-value settlement laboratory | Accounting/escrow/rewards/bonds/staking/treasury/dispute/oracle/MEV/bridge/invariant tests |
| LAB-004 | Research | Bounded autonomous/research-loop runtimes | Budgets/cancel/checkpoints/provenance/evaluator separation/escalation/no self-authority expansion |
| LAB-005 | Research | Task-market/service/compensation simulations | Identity/accounting/quality/cancel/appeal/fraud/collusion/synthetic value |
| LAB-006 | Research | Regulated-domain harnesses | Synthetic/consented data, jurisdiction profiles, consent/retention/appeal/accessibility/professional responsibility/domain review |
| LAB-007 | Research | Embodied-system simulation/safety envelopes | Device identity, command grants, geofence/force limits/digital twin/degraded mode/emergency halt/operator takeover |
| LAB-008 | Research | Arbitrary-code isolation evaluation | Rootless runtime, digest allowlist, syscall/fs/network/device/secret/resource/escape/teardown evidence |
| LAB-009 | Research | Post-quantum migration plan | Inventory, algorithm agility, hybrid experiments, performance, downgrade resistance, backup/key-history compatibility |

Frontier completion creates options and reduces uncertainty. It is not a public
production, settlement, autonomous-authority, or regulated-domain claim.