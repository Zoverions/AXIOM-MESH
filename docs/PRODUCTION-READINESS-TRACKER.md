# AXIOM-MESH Production Readiness Tracker

**Updated:** 2026-08-12

**Active build:** `0.12.0-dev.3`

**Last published candidate:** `v0.11.0`

**Overall decision:** **Not production-promoted**

This tracker records evidence, not aspiration. A gate is `Pass` only when its
artifact is reproducible and tied to the exact source commit or image digest.
A built primitive can be technically complete while remaining production-
unreachable when policy, registry, runtime wiring, external custody, or review
requirements are intentionally absent.

Human-product preview status is tracked separately from kernel production
promotion. A useful local preview, synthetic adapter drill, or resolver fixture
does not make the kernel, adapter, managed service, repository effect, or
network production-promoted.

## Current gate status

| Gate | Status | Evidence | Remaining action |
|---|---|---|---|
| Source integrity | Pass | Verified clean-room tree, source checksum, SBOM, provenance, exact zero-dependency locks | Maintain for every candidate and release |
| Capability claims | Pass | Registry, generated status, claim-marker checks; 49 tracked / 31 implemented | Maintain on every change; source presence alone cannot promote a capability |
| Kernel tests | Pass | Protected kernel suite in the [Clean Kernel workflow](https://github.com/Zoverions/AXIOM-MESH/actions/workflows/kernel.yml) | Require on protected `main` |
| Cross-platform verification | Pass for current source | Hosted Windows compatibility plus Linux/container verification; path and expiry/clock determinism hardening | Keep protected Windows and Linux verification green on source/tooling changes |
| Host production drill | Pass | Real four-process supervisor test in protected CI | Preserve on every runtime change |
| Container source policy | Pass | Dockerfile/Compose static release gate | Maintain digest pin |
| Container image build | Pass for candidate | Digest-pinned build and protected image evidence | Publish immutable image digest for the promoted pilot build |
| Composed container drill | Pass for candidate | Readiness, authenticated operations, deny-egress, and teardown | Repeat for each candidate and pilot platform |
| Container network boundary | Pass for candidate topology | `network_mode: none`, permission-restricted Unix socket, route rejection, and blocked public TCP egress | Repeat on pilot platform and independently review host/daemon policy |
| Source setup and dependency audit | Pass | Exact Node.js/npm policy, two zero-dependency locks, lifecycle scripts disabled, unchanged-lock proof | Maintain exact policy and negative tests |
| Constrained machine principals | Pass for current local production surface | Human sponsor, finite scopes/actions/purposes/destinations, runtime/expiry/non-delegation, execution-time, request-size/rate, concurrency and response-size ceilings; destination and negative-path tests | External/provider/MCP destination semantics, hardware/workload attestation, delegation and remote execution remain separate future gates |
| Machine discovery | Pass for current local surface | Authenticated `/v1/machine-discovery` returns only the caller's policy/principal intersection and declares discovery non-authorizing | Re-open minimization/inference review for future provider/MCP/global discovery schemas |
| Machine terminal receipts | Pass for current local surface | Owner-scoped Grid-attested digest-only receipts bind request/machine authority, accepted/terminal anchors, chain assurance and terminal outcome digests | AXIOM Verify product UX and external-effect truth semantics remain separate gates |
| Grid modification integrity | Pass for local trust model | Authenticated encryption, signed hash-linked events, restart/full-chain verification, tamper/wrong-key tests | Maintain on every Grid/migration/key change |
| Grid truncation assurance | Pass only when an external continuity anchor is retained and verified | `axiom-grid-continuity-anchor.v1`, operator flow, full-genesis verification and negative tests | Define pilot anchor cadence/custody; retain anchors outside `AXIOM_DATA_DIR`; assurance ends at newest retained anchor |
| Backup and restore | Pass for candidate-host lifecycle | Encrypted signed backup, retention, tamper rejection, exact restore, rollback, and weekly CI evidence | Run scheduled recovery from pilot-owned media under pilot custody |
| Observability | Pass for automated candidate relay | Least-privilege scrape, 68 fixed OTLP points, fixed Alertmanager vocabulary, exact origins, bounded retry, receipts | Repeat with pilot-owned receivers, retention decision, and named acknowledgement |
| SLO and capacity | Pass for initial CI baseline | Fixed authenticated load, latency/error/throughput observations, memory/CPU, restart | Repeat on dedicated pilot hardware for 30 days under expected traffic and limits |
| Resilience and fault tolerance | Pass for automated candidate | Oversized-body rejection, bounded rate limiting, Sandbox suspension/loss, fail-closed exit, state-preserving restart | Repeat cgroup, disk, traffic, and replacement scenarios on pilot orchestrator |
| Internal service transport | Pass for single-host candidate | TLS 1.3, Ed25519 leaves, identity binding, active-leaf pinning, rotation, retired-leaf rejection, rollback | External CA custody, pilot rollout, compromise recovery, and independent review |
| Independent service units | Pass for single-host candidate | Per-unit private identities, Grid-only state, segmented internal deny-egress, Sandbox-only restart and preservation | Repeat resource, network, upgrade, rollback, and custody controls on pilot orchestrator |
| Service network policy | Pass for reference single-host topology | Exact default-deny 40-route policy enforced at sender and receiver, policy-derived active mTLS peer allowlists, four internal edge segments, loopback-only development plaintext, required-path operation, selected forbidden-edge container probes, and release-provenance binding | Reproduce and independently inspect equivalent workload, network, and egress policy on the pilot orchestrator and later independently operated hosts |
| Node discovery and scheduling | Pass for single-Grid reservation candidate | Signed v2 admissions, filtered discovery, deterministic encrypted leases, capacity/security/owner/domain/expiry/quarantine controls | Add authenticated remote dispatch, measured resources, endpoint health, and result provenance |
| Online causal exchange | Pass for two-Grid candidate | Pinned Grid evidence, node-signed bundles, encrypted ordered queues, duplicate preflight, independent approval, visible conflict convergence | Repeat on independently operated hosts under WAN loss, delay, clock, backlog, and custody faults |
| Secret and policy providers | Pass for signed protocol and reference adapter | Independent signers, pinned commands/artifacts, nonce-bound exact inventories, private generation, invalid-signer rejection | Implement and review the pilot's actual vault/orchestrator adapter and workload identity |
| Credential rotation | Pass for candidate-host lifecycle | Coordinated service/API rotation, inactive credential rejection, key lineage, encrypted rollback | Repeat under pilot secret custody |
| Data-key rotation | Pass for candidate-host lifecycle | Live and recovery re-encryption, wrong-key rejection, interrupted-cutover recovery, state-preserving rollback | Repeat with pilot secret-manager versioning, approval, escrow, and destruction evidence |
| Deprecated credential trust | Pass for repository boundary; external evidence pending | Keyed ledger covers 32 conservative candidates and rejects supported-tip reuse | Obtain provider/custodian disposition or independent not-applicable attestation for every entry |
| Independent security review | Pass for intake contract; authentic review pending | Canonical threat model and exact signed findings/remediation/exception verifier | Commission independent review of exact source, image, and pilot configuration |
| Incident response | Pass for automated candidate exercise | Deterministic severity, independent roles, authority-reducing containment, eleven linked controls | Run facilitated pilot exercise with named roster and independent human review |
| Pilot evidence intake | Pass for dossier/package verifiers; authentic package pending | Exact authority-signed policy, five roles, 720-hour contract, 13 canonical envelopes, semantic and signature checks | Collect authentic evidence, signatures, offline verification, and separate promotion decision |
| Agent Runtime Adapter v1 contract | Pass for contract + synthetic reference only | Byte-pinned v1 schema, exact contract verifier, 28-case synthetic drill, commit-bound artifact | Select/review one maintained external runtime and prove a real bounded adapter against the same authority/receipt/cancellation semantics before exposure |
| Resolver-backed dynamic input | Pass for production-unreachable core | Fresh eligibility binding, signed repository-plan verification, resolver admission facts, independent review, exact-one-addition package, application observation, target-gate binding and adversarial tests | Keep production registry/policy closed until full runtime/operator completion, review, and explicit promotion |
| Resolver prepared-effect authority | Pass for production-unreachable preparation core | Hypervisor reads the named approval over authenticated Grid channel and atomically commits `approval.consumed` plus `external.effect.prepared`; concurrent race yields exactly one durable preparation | Repository operator must consume only Grid-durable prepared effects, completion must bind to same preparation, and production registry/policy/runtime reachability must be separately reviewed before any activation |
| Release governance | Pass for development line | Protected `main`, current release verifier, exact documentation boundary, immutable v0.11 baseline | Publish a new immutable dossier only after 0.12 promotion |

The three rows for runtime-adapter/resolver work are intentionally not
capability promotions. They record that the safe boundaries are built and
verified while the actual production reachability remains absent.

## Human-product preview status

These gates do not replace production-pilot gates.

| Product gate | Current state | Required evidence before exposure or promotion |
|---|---|---|
| Versioned Gateway client | Pass for current contract/library (`UX-001`): exact 29-route machine contract, hand-reviewed JSON Schema, relative-only targets, explicit errors, bounded request/response/timeout, cancellation, stable idempotent replay, source parity, and real-stack compatibility | Maintain exact compatibility evidence; require a new contract version plus migration and rollback evidence for an incompatible change |
| AXIOM One browser/PWA shell | Experimental local foundation (`UX-002` in progress): loopback-only server, contract-only proxy, memory-only token, public-shell-only offline cache, reviewed Ask/approval/Vault/receipt/raw-inspection views, honest unavailable Share/Circles | Complete onboarding, consent and remaining lifecycle flows, browser session/device review, real-fixture browser tests, accessibility/usability evidence, signed packaging, update, rollback, uninstall, and support |
| Human authority explanations | Experimental bounded slice (`UX-003` in progress): exact five-action review, stable Gateway outcomes/current kernel events, active/expired/consumed approvals, raw evidence, and same-key uncertain-outcome recovery | Add an authoritative policy-bound pre-execution plan/execute protocol for broader consequential effects, separately authenticated reversible approval actions, consent/revocation journeys, accessibility and comprehension fixtures, and documented human usability evidence |
| Governed memory lifecycle | Experimental bounded slice (`UX-004` in progress): owner-scoped create/list, three fixed directional provenance links, correction-without-replacement, exact confirmation-bound tombstone, selective local export, explicit bundle reveal, and real-stack negative tests for cross-principal read/link/export/tombstone | Add arbitrary-provenance policy only if justified, edge deletion, bounded bulk ingestion, retention-authorized hard deletion, restore/recovery controls, download threat analysis, and human lifecycle/recovery evidence before promotion |
| Browser security boundary | Planned (`UX-005`) | CSP, CSRF, origin, cookie/token, clickjacking, upload/download, session, device-revocation, storage inspection |
| Accessibility and phone usability | Planned (`UX-006`) | Keyboard, screen reader, contrast, reduced motion, phone layouts, plain language, human testing |
| Local packaging and onboarding | Planned (`UX-007`) | Signed package, safe updates, recovery, uninstall, no production credential creation, first-use study |
| Bounded AI provider | Adapter required (`AI-001`) | Named provider/model, minimum data scope, budget, timeout, cancellation, retention, receipts, leakage tests |
| External agent runtime adapter | Candidate contract and synthetic verifier only | Pin one maintained upstream runtime, complete source/licence/dependency review, implement one bounded read-only no-secret Gateway path, prove native parity and direct-service denial, and obtain independent review before exposure |
| Personal workflows | Planned (`AI-002`/`AI-003`) | Provenance, uncertainty, corrections, usefulness, latency, cost, cancellation, recovery, privacy evaluation |
| AXIOM Verify | Planned (`VERIFY-001`) | Independent local/static verification, signer/integrity/scope/non-claim explanations, tamper fixtures |
| AXIOM Circles | Planned (`CIRCLE-001`-`CIRCLE-003`) | Admission, roles, devices, revocation, selective disclosure, conflict visibility, exit/export, real consented pilot |
| AXIOM Studio | Planned | Manifest/schema/policy/threat/rollback/conformance generation without runtime authority |
| AXIOM Managed Node | Planned | Custody separation, encryption, operator limits, exportability, recovery, updates, decommissioning, support SLO |

No human product listed above is currently an `implemented` capability claim
unless and until the registry is updated with executable evidence.

## Frontier laboratory status

Frontier work is allowed to proceed, but remains disabled and isolated.

| Laboratory | Current promotion state | Required before real exposure |
|---|---|---|
| BFT and distributed authority | Research/laboratory | Formal protocol, fault/synchrony assumptions, adversarial tests, independent review, measured operation |
| Settlement, tokens, bridges, liquidity | Disabled | Economic invariants, test-value deployment, audits, custody, finality/reorg handling, governance and legal review |
| Autonomous agents and research loops | Disabled | Budgets, recursion limits, evaluation, provenance, cancellation, halt, sandbox and incident evidence |
| Regulated domains | Adapter required | Jurisdiction, qualified human authority, consent, appeal, records, deletion, accessibility, legal/domain review |
| Embodied systems | Disabled | Simulation, device-specific safety envelope, geofence, force/tool ceilings, approvals, telemetry, emergency halt |
| Arbitrary code | Adapter required | Independently reviewed isolation profile and adversarial escape evidence tied to exact runtime |
| Zk verification | Adapter required | Named circuit/protocol, verification key/material, public-input schema, implementation and test vectors |
| Post-quantum migration | Research | Named algorithms, hybrid transition, downgrade resistance, key/evidence compatibility, rollback |

Laboratory completion does not change the current production decision.

## Promotion blockers

The following block production promotion of the current kernel:

1. no dedicated pilot-hardware capacity validation or 30-day availability
   observation;
2. no pilot-owned provider adapter/workload-identity review, custody rotation
   repetition, or scheduled restore from pilot-owned media;
3. no authentic independent findings ledger for the supported kernel and
   deployment policy;
4. all 32 deprecated-history entries still require provider, custodian, or
   independently reviewed not-applicable attestations;
5. no facilitated pilot incident exercise with a named roster and
   deployment-specific notification decision tree;
6. no operator-owned OTLP/Alertmanager receivers, receiver-side retention
   decision, or measured named-person acknowledgement;
7. no authentic exact pilot evidence package and separate promotion decision.

The repository has strict intake formats for these blockers. Synthetic
conformance proves verifier behavior only and supplies none of the missing
external facts.

The production-unreachable resolver and runtime-adapter work are **not** pilot
promotion blockers because they are not part of the current exposed production
surface. They become separate promotion gates if a future change proposes to
activate them.

## Gate owners

| Area | Accountable role | Required reviewer |
|---|---|---|
| Release and repository | Release manager | Security reviewer |
| Runtime and reliability | Platform operator | Independent operator |
| Security and credentials | Security owner | Maintainer not authoring the change |
| Data and recovery | Grid/data owner | Platform operator |
| Human product and accessibility | Product owner | Accessibility/privacy reviewer |
| Adapters and external providers | Adapter owner | Security/data reviewer |
| Frontier laboratory | Research owner | Independent protocol/domain reviewer |
| Documentation and claims | Documentation owner | Release manager |

Names may change; roles and independence requirements do not.

## Evidence retention

Promotion evidence must identify:

- source commit, clean/dirty state, image and base-image digests;
- capability, policy, operator-surface, application, and documentation digests;
- test and workflow identifiers;
- deployment configuration without secret values;
- backup/restore, rotation, continuity-anchor, provider, telemetry, incident,
  accessibility, usability, and pilot timestamps;
- approvers, reviewers, findings, exceptions, and expiry;
- the exact built/enabled/exposed/promoted/marketed state.

Secret values, private keys, production tokens, and unencrypted user data must
never enter the evidence package.

The exact pilot package is defined in the
[pilot deployment dossier runbook](operations/PILOT-DEPLOYMENT-DOSSIER.md).
Independent review is defined in the
[independent security review runbook](security/INDEPENDENT-SECURITY-REVIEW.md).

## Reassessment rule

Any change to authentication, machine-principal ceilings, policy, grants,
Sandbox authority, Grid schema, evidence or continuity-anchor semantics,
encryption, backup, service topology, container base, secret handling, browser
session behavior, adapter egress, provider data scope, resolver activation,
repository-effect execution, external runtime integration, remote execution,
settlement, domain authority, or release gates reopens the relevant gate.

Production promotion is not permanent evidence for later commits, deployments,
applications, adapters, runtimes, resolver mappings, or laboratories.