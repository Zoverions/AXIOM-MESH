# AXIOM-MESH Production Readiness Tracker

**Updated:** 2026-08-16

**Active build:** `0.12.0-dev.3`

**Last published candidate:** `v0.11.0`

**Overall decision:** **Not production-promoted**

This tracker records evidence, not aspiration. A gate is `Pass` only when its
artifact is reproducible and tied to the exact source commit or image digest.
A built primitive may be technically complete while remaining production-
unreachable because policy, registry, runtime wiring, external custody, or
promotion review is intentionally absent.

Human previews, synthetic conformance, repository-effect prototypes, and
frontier laboratories do not replace production-pilot evidence.

## Current gate status

| Gate | Status | Evidence | Remaining action |
|---|---|---|---|
| Source integrity | Pass | Clean-room tree, source checksum, SBOM, provenance, exact zero-dependency locks | Maintain for every candidate/release |
| Capability claims | Pass | Registry/generated status/claim markers; 49 tracked / 31 implemented | Maintain on every change; source presence alone cannot promote capability |
| Kernel tests | Pass | Protected Clean Kernel suite | Require on protected `main` |
| Cross-platform verification | Pass for current source | Linux/container + hosted Windows path/clock/documentation verification | Keep both protected surfaces green |
| Source setup and dependency audit | Pass | Node `>=24.14.0 <25`; CI/.node-version 24.18.0; candidate production image 24.19.0; npm 11.x; two zero-dependency locks; lifecycle scripts disabled; unchanged-lock proof | Maintain exact machine-readable policy and negative tests |
| Container source policy | Pass | Digest-pinned Dockerfile/Compose release checks | Maintain exact production image/base digest |
| Container build/readiness | Pass for candidate | Protected image build, readiness, authenticated operations, teardown | Repeat for promoted pilot image/platform |
| Container network boundary | Pass for candidate topology | `network_mode: none`, Unix-socket ingress, route rejection, public TCP negative probe | Repeat and independently inspect pilot host/daemon policy |
| Host production drill | Pass | Real four-process supervisor evidence | Preserve on runtime changes |
| Constrained machine principals | Pass for current local production surface | Human sponsor; finite scopes/actions/purposes/destinations; runtime/expiry/non-delegation; execution-time/request-size/rate/concurrency/response-size ceilings | Provider/MCP destinations, hardware attestation, delegation, remote execution remain separate gates |
| Machine discovery | Pass for current local surface | Authenticated `/v1/machine-discovery` returns only caller requestability intersection and declares discovery non-authorizing | Re-open minimization/inference review for future global/provider schemas |
| Machine terminal receipts | Pass for current local surface | Owner-scoped Grid-attested digest-only receipts bind request/machine authority, accepted/terminal anchors, chain assurance, terminal outcome digest | AXIOM Verify UX and external-effect truth semantics remain separate |
| Grid modification integrity | Pass for local trust model | Authenticated encryption, signed hash-linked evidence, restart/full-chain verification, tamper/wrong-key tests | Maintain on Grid/schema/key changes |
| Grid truncation assurance | Pass only with retained external anchor | `axiom-grid-continuity-anchor.v1`, full-genesis verification, negative tests | Define pilot anchor cadence/custody outside `AXIOM_DATA_DIR`; assurance ends at newest retained anchor |
| Backup and restore | Pass for candidate-host lifecycle | Signed encrypted backup, retention, tamper rejection, exact restore, rollback, weekly CI | Scheduled pilot-owned-media restore |
| Observability | Pass for automated candidate relay | Least-privilege scrape, fixed OTLP/alert vocabulary, exact origins, bounded retry/receipts | Pilot-owned receivers/retention/named acknowledgement |
| SLO and capacity | Pass for initial CI baseline | Fixed authenticated load, latency/error/throughput, CPU/memory, restart | Dedicated pilot hardware + 30-day observation |
| Resilience | Pass for automated candidate | Oversized-body, rate-limit, dependency suspension/loss, fail-closed exit, state-preserving restart | Pilot cgroup/disk/traffic/replacement scenarios |
| Internal transport | Pass for single-host candidate | TLS 1.3, Ed25519 identities, active-leaf pinning, rotation, retired-leaf rejection, rollback | Pilot CA custody/rollout/compromise recovery/independent review |
| Independent service units | Pass for single-host candidate | Per-unit identities, Grid-only state, segmented internal networks, Sandbox-only recovery | Pilot orchestrator resource/network/update/rollback evidence |
| Service network policy | Pass for reference single-host topology | Exact default-deny 40-route policy at sender/receiver, derived mTLS peers, four segments, forbidden-edge probes, release binding | Reproduce on pilot and future independent hosts |
| Node discovery/scheduling | Pass for single-Grid reservation candidate | Signed admissions, filtered discovery, deterministic encrypted leases, capacity/security/owner/domain/expiry/quarantine | Remote dispatch, measured resources, endpoint health, result provenance |
| Online causal exchange | Pass for two-Grid candidate | Pinned Grid evidence, signed bundles, encrypted ordered queues, duplicate preflight, independent approval, visible conflicts/convergence | Independent-host WAN loss/delay/clock/backlog/custody evidence |
| Secret/policy providers | Pass for signed protocol/reference adapter | Independent signers, pinned artifacts, nonce-bound inventories, private generation, invalid-signer rejection | Pilot vault/orchestrator adapter/workload identity |
| Credential rotation | Pass for candidate host | Coordinated service/API rotation, inactive credential rejection, key lineage, encrypted rollback | Repeat under pilot custody |
| Data-key rotation | Pass for candidate host | Live/recovery re-encryption, wrong-key rejection, interrupted-cutover recovery, state-preserving rollback | Repeat with pilot secret-manager approval/escrow/destruction |
| Deprecated credential trust | Pass for repository boundary; external evidence pending | Keyed ledger covers 32 candidates and rejects supported-tip reuse | Provider/custodian disposition or independently reviewed N/A per entry |
| Independent security review | Pass for intake contract; authentic review pending | Canonical threat model + exact findings/remediation/exception verifier | Commission review of exact source/image/deployment/pilot config |
| Incident response | Pass for automated candidate | Deterministic severity, independent roles, authority-reducing containment, linked controls | Facilitated pilot exercise with named roster |
| Pilot evidence intake | Pass for verifier contracts; authentic package pending | Exact authority policy, five roles, 720-hour contract, 13 canonical envelopes, semantic/signature checks | Collect authentic evidence and separate promotion decision |
| Agent Runtime Adapter v1 | Pass for contract + synthetic reference only | Byte-pinned v1 schema, contract verifier, 28-case synthetic drill, commit-bound evidence | Select/review one maintained runtime and prove bounded real adapter before exposure |
| Resolver-backed dynamic input | Pass for production-unreachable core | Fresh eligibility, signed repository plan, resolver admission/review, exact-one mapping package, application observation, target gates | Keep production mapping/policy/runtime closed pending explicit activation review |
| Prepared-effect authority | Pass for production-unreachable core | Authenticated Grid approval read; one transaction records `approval.consumed` + `external.effect.prepared`; concurrency yields one durable winner | Maintain exact binding; activation remains separate |
| External-effect outbox | Pass for production-unreachable core | Requires durable prepare before operator invocation; uncertain operator/receipt remains prepared; verified receipt required before `external.effect.completed`; restart/idempotency/completion-failure tests | No production route/mapping; retain evidence-first semantics for future adapters |
| GitHub docs repository operator | Pass for production-unreachable prototype | Independently verifies durable Grid prepare before any GitHub request; fixed repo; exact planned docs paths/content; deterministic effect branch; creates/recovers **open draft PR**; stale-main/path/content/proof/idempotency/transport-loss tests | Production mapping/policy/runtime/credential/egress/rollback/review gate remains closed; **no merge/direct-main authority** |
| Release governance | Pass for development line | Protected `main`, release verifier, canonical docs boundary, immutable v0.11 baseline | Publish new immutable dossier only after 0.12 promotion |

The runtime-adapter and repository-effect rows intentionally record **built
safety mechanisms without capability promotion**. The GitHub operator can be
real source and tests while the supported runtime has no
`repository.docs.pull-request.create` policy/registry/route that can invoke it.

## Human-product preview status

| Product gate | Current state | Required before exposure/promotion |
|---|---|---|
| Versioned Gateway client | Pass for current contract/library (`UX-001`): exact 30-route machine contract, reviewed schema, relative-only targets, explicit errors, bounded timeout/request/response, cancellation, stable idempotency, real-stack compatibility | Maintain exact compatibility; version/migrate/rollback incompatible changes |
| Owner-local social substrate | In progress: intent-authorized local actor/persona/publication create/supersede/retract plus owner-derived `/v1/social`; A2 publication projection; no federation or network distribution | Complete exact-head owner-read evidence, then AXIOM One UI; later exchange/federation requires a separate protocol/security gate |
| AXIOM One browser/PWA shell | Experimental (`UX-002`): loopback-only shell, contract-only proxy, memory-only token, governed bounded Ask/Vault/receipt views | Complete local social UI, onboarding, session/device security, browser fixtures, accessibility/usability, signed package/update/rollback/uninstall/support |
| Human authority explanations | Experimental bounded slice (`UX-003`): five-action review, stable outcomes/events, approval states, raw evidence, uncertainty recovery | Authoritative policy-bound broader consequential plan/execute, reversible approval actions, consent/revocation journeys, comprehension evidence |
| Governed memory lifecycle | Experimental (`UX-004`): owner create/list, three fixed provenance links, correction-without-replacement, tombstone, selective export, bundle reveal, cross-principal negatives | Edge deletion, bounded bulk ingest, authorized hard deletion, restore/recovery, download threat analysis, human lifecycle evidence |
| Browser security | Planned (`UX-005`) | CSP, CSRF, origin, session/cookie/token, clickjacking, device revocation, storage inspection |
| Accessibility/phone usability | Planned (`UX-006`) | Keyboard, screen reader, contrast, reduced motion, phone layouts, plain language, human tests |
| Packaging/onboarding | Planned (`UX-007`) | Signed package, safe updates, recovery/uninstall, first-use study |
| Bounded AI provider | Adapter required (`AI-001`) | Named provider/model, minimal data, exact egress, budget/timeout/cancellation/retention/receipts/leakage tests |
| External agent runtime | Candidate contract only | Pin/review maintained upstream runtime; bounded read-only no-secret Gateway path; native authority/cancellation/idempotency/receipt parity; direct-service denial; independent review |
| Personal Agent Pack and Runtime Capsule | Draft contracts only (`ARCH-001`; `PACK-001`/`ORCH-001` pending) | Secret-free cross-provider export/import, exact implementation/SBOM, permissions, budgets, cancellation, stop/fallback, revocation, licences, recovery, uninstall, rollback, and no self-authority expansion |
| Policy-first compute routing | Draft contract only (`ROUTE-001` pending) | Private/Balanced/Best/Budget UX, hard privacy/consent/destination/jurisdiction/licence/security/health/freshness/capability/deadline/budget filters, measured evaluation, forbidden fallback, and transparent cost/provider receipts |
| AXIOM Link wearable endpoint | Specified prototype only (`DEVICE-001` pending) | Authenticated pairing, unique revocable identity, signed firmware, physical mute, recording indication, bounded audio, update/rollback, loss/replacement, accessibility/usability, and independent RF/battery/charging/acoustic/electrical/thermal/mechanical/manufacturing review |
| Local Trust access authorization | Draft contract only (`TRUST-001` pending) | Deterministic model-free decision, exact credential/status/policy/consent/user-presence checks, one-use mandate, replay/tamper/stale tests, denial/uncertainty receipts, recovery, and independent AXIOM Verify reproduction |
| Identity presentation laboratory | Specified; synthetic/test authority only (`ID-001`/`ID-002`) | One exact credential/presentation profile, holder binding, issuer trust, minimum disclosure, status freshness, revocation, correlation analysis, interoperability vectors, readable non-claims, privacy/legal review, and no real identity assurance claim |
| Payment authorization simulation | Specified; synthetic value and processor sandbox only (`PAY-001`) | Token custody boundary, exact mandate, local reserve, external response, uncertain state, reconciliation, refunds/reversals/disputes, PCI/custody/consumer/legal review, and no real-value or settlement claim |
| AXIOM Verify | Planned | Independent local/static verification and tamper/non-claim UX |
| AXIOM Circles | Planned | Membership/device/role/revocation/selective-disclosure/conflict/exit/export + consented pilot |
| AXIOM Studio | Planned | Development artifact generation without runtime authority |
| AXIOM Managed Node | Planned | Custody separation, operator limits, exportability, recovery, updates, decommissioning, support SLO |

No human product is an implemented capability claim unless the registry is
explicitly updated with executable evidence.

## Frontier laboratory status

| Laboratory | Current promotion state | Required before real exposure |
|---|---|---|
| BFT/distributed authority | Research | Formal protocol, fault/synchrony assumptions, adversarial tests, independent review, measured operation |
| Settlement/tokens/bridges/liquidity | Disabled | Economic invariants, test value, audits, custody/finality/reorg/governance/legal review |
| Autonomous loops | Disabled | Budgets, recursion limits, evaluation, provenance, cancellation/halt, sandbox/incident evidence |
| Regulated domains | Adapter required | Jurisdiction, qualified authority, consent/appeal/records/deletion/accessibility/legal/domain review |
| Embodied systems | Disabled | Simulation, device safety envelope, geofence/force limits, approval/telemetry/emergency halt |
| Arbitrary code | Adapter required | Independently reviewed isolation profile + escape evidence |
| Zk verification | Adapter required | Named circuit/protocol/key/input schema + vectors |
| Post-quantum migration | Research | Named algorithms, hybrid transition, downgrade resistance, compatibility/rollback |

## Promotion blockers

The following block production promotion of the currently exposed kernel:

1. dedicated pilot-hardware capacity validation and 30-day availability;
2. pilot-owned provider/workload-identity, secret, backup-media, telemetry, and
   alert custody;
3. scheduled pilot restore and rotation;
4. pilot custody/cadence for external Grid continuity anchors;
5. provider/custodian or independently reviewed not-applicable dispositions for
   all 32 deprecated-history credential candidates;
6. facilitated incident exercise with named roster/notification decision tree;
7. operator-owned telemetry/alert receivers, retention decision, measured named
   acknowledgement;
8. authentic independent security findings ledger for exact source/image/
   deployment/pilot configuration; and
9. authentic exact pilot evidence package plus separate promotion decision.

The repository-effect and runtime-adapter prototypes are not current pilot
blockers because they are production-unreachable. They become separate
promotion gates if a future change proposes to activate them.

## Gate owners

| Area | Accountable role | Required reviewer |
|---|---|---|
| Release/repository | Release manager | Security reviewer |
| Runtime/reliability | Platform operator | Independent operator |
| Security/credentials | Security owner | Maintainer not authoring change |
| Data/recovery | Grid/data owner | Platform operator |
| Human product/accessibility | Product owner | Accessibility/privacy reviewer |
| Adapters/external providers | Adapter owner | Security/data reviewer |
| Frontier laboratory | Research owner | Independent protocol/domain reviewer |
| Documentation/claims | Documentation owner | Release manager |

## Evidence retention

Promotion evidence must identify source revision and clean state, image/base
digests, capability/policy/operator/documentation digests, tests/workflow IDs,
secret-free deployment configuration, backup/restore/rotation/continuity/
telemetry/incident/accessibility/pilot timestamps, approvers/reviewers/findings/
exceptions/expiry, and exact built/enabled/exposed/promoted/marketed state.

Secret values, private keys, production tokens, and unencrypted user content
must never enter the evidence package.

See the [pilot dossier](operations/PILOT-DEPLOYMENT-DOSSIER.md) and
[independent review](security/INDEPENDENT-SECURITY-REVIEW.md).

## Reassessment rule

Any change to authentication, machine ceilings, policy, grants, Sandbox
execution, Grid schema/evidence/continuity semantics, encryption, backup,
service topology, container base, secret handling, browser sessions, adapter
egress, provider scope, resolver activation, outbox/operator execution,
external runtime integration, remote execution, settlement, domain authority,
or release gates reopens the applicable gate.

Production promotion is never inherited automatically by later commits,
deployments, applications, adapters, runtimes, resolver mappings, or
laboratories.
