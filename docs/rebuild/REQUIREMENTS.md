<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.12.0-dev.3; digest=8223c0c40f8aa9671b85ade6a1fa06712d583d2c68e4073c0371639fd4bf1c6e -->
# AXIOM-MESH Rebuild Requirements

**Current build:** `0.12.0-dev.3`

**Updated:** 2026-08-10

**Normative language:** MUST, MUST NOT, SHOULD, and MAY are used in their usual
requirements sense.

## Requirement-state rule

Requirements define the intended system. They do not themselves establish that
a capability is runnable or production-promoted.

The implementation MUST distinguish:

1. **built** code;
2. operator-**enabled** capability;
3. user- or network-**exposed** capability;
4. **production-promoted** capability;
5. publicly **marketed** capability.

The machine-readable capability registry remains authoritative for runnable
status. Public and user-facing claims MUST describe only the exact evidenced
state.

## Core-loop requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| CORE-01 | Every privileged or externally visible effect MUST follow Gateway → Hypervisor → Sandbox → Grid. | End-to-end tests reject direct and bypass paths. |
| CORE-02 | Every request MUST carry a trace ID, versioned schema, and idempotency key where repetition could create another effect. | Duplicate and incompatible-version tests. |
| CORE-03 | Every mutation MUST append a signed hash-linked evidence event transactionally with the state change. | Restart verification and tamper tests. |
| CORE-04 | Services MUST fail closed when identity, policy, consent, approval, grant, verifier, provider, destination, evidence, or required settlement state is unavailable. | Fault-injection tests for each dependency. |
| CORE-05 | Plans MUST name every effect, provider, destination, data scope, dependency, approval, budget, timeout, cancellation rule, and evidence obligation before execution. | Plan-schema validation and negative fixtures. |
| CORE-06 | A model, browser, adapter, administrator, autonomous loop, or settlement process MUST NOT mint or widen its own authority. | Architectural and runtime denial tests. |
| CORE-07 | A production path MUST NOT return mock, synthetic, or fallback success when a real dependency is absent. | Provider-absence and dependency-failure tests. |

## Identity, authorization, and consent

| ID | Requirement | Acceptance evidence |
|---|---|---|
| IAM-01 | Public, user, operator, service, provider, reviewer, and exception-approver identities MUST be distinct where their authority conflicts. | Cross-role denial and self-approval tests. |
| IAM-02 | Service requests MUST be mutually authenticated, audience-bound, body-bound, time-bound, and replay-resistant. | TLS peer, signed-caller, expiry, nonce, body mutation, and wrong-audience tests. |
| IAM-03 | Capability grants MUST be short-lived, single-use, revocable, and bound to principal, intent, plan, policy, tool, provider, destination, data, resource, constraints, and audience. | Sandbox and adapter negative-path suites. |
| IAM-04 | Policy inheritance MUST be deny-dominant. Lower layers may tighten but MUST NOT loosen higher layers. | Property tests across policy stacks. |
| IAM-05 | Consent MUST identify subject, controller, purpose, data scope, destination, retention, expiry, and revocation handle where applicable. | Wrong-purpose, destination, expired, and revoked tests. |
| IAM-06 | Production startup MUST reject default, weak, missing, example, stale, or partially provisioned credentials. | Startup configuration tests. |
| IAM-07 | Device and browser sessions MUST support expiry, idle timeout, revocation, and scope reduction without requiring destruction of the user’s underlying identity. | Session and device-revocation tests. |
| IAM-08 | Core access and identity MUST NOT require a token, settlement account, or platform-controlled social account. | Token-disabled and offline-local onboarding tests. |
| IAM-09 | An authenticated `agent` principal MUST use the constrained machine-principal profile, MUST resolve to a configured human sponsor, MUST NOT receive wildcard scope or administrator role, and MUST bind finite action and purpose ceilings, runtime identity, lifetime/expiry, non-delegation, a current execution-time ceiling, authenticated Gateway request-size, request-rate, concurrency, and response-size ceilings, and a finite destination ceiling enforced against the AXIOM-computed destination for current supported effects. Machine constraints may only reduce authority granted by ordinary policy. | `machine-principal`, principal-registry, machine-ingress, destination, and four-service end-to-end tests. |
| IAM-10 | Machine-principal v1 MUST NOT delegate authority. Any future machine delegation MUST be attenuation-only, explicitly scoped, expiring, revocable, chain-bound, independently evidenced, and separately promoted before use. | Non-delegation validation plus future delegation property and negative-path tests. |
| IAM-11 | Machine discovery MUST be authenticated, constrained-machine-only, filtered by the active deny-dominant policy plus the caller's own scopes, actions, purposes, destinations, and budgets, MUST minimize metadata, and MUST explicitly state that discovery does not grant execution authority. Every discovered action MUST still undergo normal intent evaluation before execution. | Machine-discovery unit, client, service-network, and four-service leakage/authorization tests. |

## Human interface and application requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| UX-01 | Human applications MUST remain outside the trusted zero-dependency kernel and use versioned Gateway contracts. | Dependency-boundary and API compatibility checks. |
| UX-02 | A user MUST be shown the proposed effect, provider, destination, information scope, cost or budget, retention, timeout, cancellation, reversibility, and required approval before a consequential action. | Usability fixtures and browser end-to-end tests. |
| UX-03 | A friendly interface MUST NOT conceal denial, uncertainty, degraded state, unresolved conflict, external transfer, or the difference between integrity evidence and truth. | Content and state-parity tests. |
| UX-04 | Local operation MUST require no advertising identifier, third-party analytics, remote font, account service, or unrelated telemetry destination. | Network inspection and static policy tests. |
| UX-05 | Secrets MUST NOT be persisted in browser storage unless a separately reviewed local key-management design explicitly permits the exact secret class. | Browser storage inspection and negative tests. |
| UX-06 | Browser surfaces MUST implement explicit origin, CSP, CSRF, cookie/token, clickjacking, content-type, upload, download, session, and device-revocation controls. | Browser security suite and threat-model review. |
| UX-07 | Primary workflows MUST support keyboard navigation, screen readers, contrast, reduced motion, phone-size layouts, plain language, and recoverable errors. | Automated accessibility checks and documented human testing. |
| UX-08 | Export, deletion, revocation, receipt inspection, and recovery guidance MUST be reachable from the primary user interface. | User-flow tests. |
| UX-09 | A new user SHOULD reach one useful result without using the CLI or understanding the four-service topology. | Bounded onboarding study and activation evidence. |
| UX-10 | Human-product previews MUST be labeled with their exact support, privacy, recovery, and promotion state. | Claim and release checks. |

## Capsules, tools, providers, and execution

| ID | Requirement | Acceptance evidence |
|---|---|---|
| CAP-01 | Capsules MUST be immutable, content-addressed, signed, versioned, and include provenance, manifest, constraints, schemas, and SBOM. | Registry verification fixtures. |
| CAP-02 | External capsules, MCP tools, provider code, and uploaded executables MUST never execute directly from intake. | Quarantine-state tests. |
| CAP-03 | Install, discovery, listing, invitation, or provider connection MUST NOT imply execution authority. | Execution-without-grant denial. |
| CAP-04 | Revocation MUST block new execution immediately and bound in-flight execution by a declared kill window. | Revocation race tests. |
| CAP-05 | Untrusted execution MUST have no ambient host authority and MUST use explicit digest, command, filesystem, capability, resource, network, timeout, cancellation, and artifact controls. | Runtime policy inspection and escape regression tests. |
| CAP-06 | Every adapter MUST declare credentials, trust anchors, origins, egress, schemas, consent, data scope, budget, timeout, cancellation, retry, retention, deletion, evidence, failure, uninstall, and rollback. | Adapter conformance kit. |
| CAP-07 | Missing or invalid external providers MUST return `capability_unavailable`, not mock output. | Provider-absence tests. |
| CAP-08 | Provider results MUST remain data until a later authorized effect explicitly consumes them. | Model-to-effect separation tests. |
| CAP-09 | Arbitrary-code execution MUST remain disabled until an independently reviewed isolation profile and adversarial escape suite are tied to the exact runtime. | Promotion gate. |

## Personal AI and bounded orchestration

| ID | Requirement | Acceptance evidence |
|---|---|---|
| AI-01 | Every AI request MUST bind a named provider, model, purpose, information scope, retention rule, budget, deadline, cancellation signal, and result receipt. | Adapter schema and negative tests. |
| AI-02 | The provider MUST receive only the minimum approved data and MUST NOT receive unrelated memory by default. | Data-minimization and leakage tests. |
| AI-03 | Multi-step loops MUST have budgets, deadlines, bounded recursion, cancellation, checkpoint evidence, and emergency halt. | Exhaustion, cancellation, and halt tests. |
| AI-04 | Model output MUST NOT directly authorize external, destructive, public, financial, identity, legal, health, education, government, or embodied effects. | End-to-end denial tests. |
| AI-05 | Useful workflows MUST retain source provenance, uncertainty, corrections, and user edits without claiming private chain-of-thought. | Workflow and receipt tests. |
| AI-06 | Evaluation MUST measure usefulness, latency, cost, correction rate, privacy leakage, cancellation, and recovery rather than only model quality. | User and operational evidence. |

## Grid, state, privacy, and reliability

| ID | Requirement | Acceptance evidence |
|---|---|---|
| GRID-01 | Grid MUST be unable to originate user effects or mint capability grants. | Import boundary and runtime denial. |
| GRID-02 | Durable state MUST be encrypted, transactional, restart-safe, migration-versioned, and context-bound. | Crash, wrong-key, migration, and storage inspection tests. |
| GRID-03 | Evidence continuity MUST survive authorized key rotation through explicit signed transitions and MUST fail closed on unresolved lineage. | Rotation and verification tests. |
| GRID-04 | Grid in single-node mode MUST describe itself as a transparency log, not BFT consensus. | Runtime and documentation parity checks. |
| GRID-05 | Memory MUST be owner-bound, provenance-preserving, selectively disclosable, exportable, tombstonable, and deletable where the retention contract permits. | Memory, consent, export, and deletion tests. |
| GRID-06 | Node admission MUST bind identity, owner, origin, failure domain, roles, software digest, security profile, resource ceilings, expiry, and quarantine. | Admission and renewal tests. |
| GRID-07 | Discovery MUST exclude ineligible nodes and return bounded Grid-signed results. | Query, expiry, quarantine, and signature tests. |
| GRID-08 | Scheduling MUST reserve only a complete deterministic placement inside declared capability, capacity, concurrency, owner, domain, security, and lease limits. | Determinism, capacity, and restart tests. |
| GRID-09 | Scheduling MUST NOT imply resource truth, remote dispatch, result authenticity, federation, or consensus. | Claim and API tests. |
| GRID-10 | Backup and restore MUST verify signatures, schema, exact digest, evidence head, runtime lock, retention policy, and recovery chronology. | Backup, tamper, retention, kill, restore, and rollback drills. |
| GRID-11 | Data-key rotation MUST cover every supported live and recovery context, reject wrong keys, recover interrupted cutover, and preserve later evidence through rollback. | Signed real-stack rotation evidence. |
| GRID-12 | Operational telemetry MUST exclude raw user content, secrets, prompts, object identifiers, and user-controlled high-cardinality labels. | Telemetry inspection tests. |

## Portability, sharing, and Circles

| ID | Requirement | Acceptance evidence |
|---|---|---|
| PORT-01 | Users MUST be able to export supported identity, consent, intent, memory, receipt, governance, accounting, and causal records. | Coverage tests against the data registry. |
| PORT-02 | Exports MUST support time, type, object, capsule, and recipient scopes without leaking unrelated records. | Selective-export tests. |
| PORT-03 | Bundles MUST contain canonical data, signed manifests, file digests, schema versions, continuity metadata, and explicit non-claims. | Independent verifier command. |
| PORT-04 | Import MUST support validate-only and deterministic dry-run diff before mutation. | Round-trip and no-write tests. |
| PORT-05 | Sensitive exports SHOULD support recipient-key encryption and MUST not weaken manifest verification. | Cryptographic tests. |
| PORT-06 | AXIOM Verify MUST operate locally or statically and explain signer identity, integrity, continuity, scope, alteration, and non-claims. | Independent fixture suite. |
| CIRCLE-01 | Circle membership MUST be invitation-based or otherwise explicitly admitted, role-bound, device-aware, expiring or revocable, and evidence-linked. | Membership lifecycle tests. |
| CIRCLE-02 | Shared records MUST use selective disclosure and explicit consent compatible with every affected subject and controller. | Consent and disclosure tests. |
| CIRCLE-03 | Concurrent non-commutative changes MUST remain visible until an explicit complete resolution. | Partition and conflict tests. |
| CIRCLE-04 | Circle proposals, tasks, commitments, approvals, and policies MUST NOT silently enable payroll, settlement, public publication, or external effects. | Scope-separation tests. |
| CIRCLE-05 | Members MUST be able to leave, revoke devices, export their records, and understand what shared evidence remains legitimately retained. | Exit and retention tests. |

## Network and remote execution

| ID | Requirement | Acceptance evidence |
|---|---|---|
| NET-01 | Production internal traffic MUST use mutually authenticated TLS 1.3 plus signed replay-protected request envelopes. | Transport negative paths and rotation drill. |
| NET-02 | Services MUST be independently deployable with least-privilege identities, explicit ingress/egress, dependency-aware readiness, and Grid-only durable authority. | Unit and multi-container tests. |
| NET-03 | Online causal exchange MUST verify pinned source evidence, preserve encrypted ordered state, require independent destination approval, and retain visible conflicts. | Two-stack partition/rejoin drill. |
| NET-04 | Remote dispatch MUST bind exact workload digest, capsule, policy, grant, node identity, measured resources, input digest, budget, deadline, cancellation, and output provenance. | Dispatcher and remote-node negative tests. |
| NET-05 | Remote results MUST be authenticated and evidence-linked before any downstream effect may consume them. | Forged, replayed, stale, partial, and wrong-node tests. |
| NET-06 | Multi-host claims MUST be based on independently operated hosts and measured WAN delay, loss, partition, clock, backlog, recovery, and key-custody evidence. | External pilot evidence. |
| NET-07 | Federation or consensus MUST NOT be inferred from causal transport or placement reservations. | Claim parity tests. |

## Governance and societal safety

| ID | Requirement | Acceptance evidence |
|---|---|---|
| GOV-01 | Policy changes MUST use proposal → approval → timelock → activation → verification, with rollback metadata. | Governance lifecycle test. |
| GOV-02 | Emergency action MAY only reduce authority, MUST expire, and MUST be reviewed. | Emergency-policy property tests. |
| GOV-03 | Automated governance MUST NOT expand its own authority or lower a safety requirement. | Negative tests. |
| GOV-04 | Human appeal MUST exist for consequential institutional and Circle decisions. | Appeal workflow tests. |
| GOV-05 | Embodied or high-autonomy actions MUST bind device, geofence, time, tool/force ceiling, approvals, telemetry, and halt state. | Simulation and policy fixtures. |
| GOV-06 | Sentience uncertainty MAY trigger protected mode but MUST NOT be represented as a sentience detector. | Terminology and policy tests. |
| GOV-07 | Governance delegation MUST be scoped, expiring, revocable, auditable, and unable to delegate more authority than the delegator possesses. | Delegation property tests. |

## Economics and settlement

| ID | Requirement | Acceptance evidence |
|---|---|---|
| ECON-01 | Core access and identity MUST NOT require a token. | Token-disabled end-to-end tests. |
| ECON-02 | Accounting MUST use balanced double-entry journals with integer units. | Balance property tests. |
| ECON-03 | Real-value token, reward, bond, treasury, escrow, payroll, bridge, liquidity, and settlement paths MUST remain disabled until separately promoted. | Configuration and release gates. |
| ECON-04 | Useful-compute or reputation scores MUST NOT substitute for Sybil-resistant membership or consensus. | Architecture and adversarial tests. |
| ECON-05 | Settlement adapters MUST be isolated, idempotent, finality-aware, replay-safe, reorganization-aware, budgeted, cancellable where possible, and disabled without exact deployment metadata. | Adapter contract and chain-simulation tests. |
| ECON-06 | Economic invariants MUST be tested under adversarial sequencing, insolvency, oracle failure, duplicate delivery, rollback, and governance capture. | Property and model tests. |
| ECON-07 | No contract or tokenomics module may be described as audited without an independent artifact tied to exact source and deployed bytecode. | Release-claim gate. |
| ECON-08 | Frontier economic experiments MUST use test value only and MUST NOT custody real user funds. | Environment and key-policy checks. |

## Regulated and high-impact domains

| ID | Requirement | Acceptance evidence |
|---|---|---|
| DOM-01 | Education, health, government, legal, employment, finance, and minor-related capsules MUST default to data minimization, strict purpose-bound consent, human appeal, and domain-specific retention. | Domain-policy fixtures. |
| DOM-02 | Technical correctness MUST NOT be represented as legal, clinical, educational, financial, or regulatory compliance. | Claim review and release gate. |
| DOM-03 | Domain systems MUST use synthetic or separately governed test data until an exact jurisdictional deployment is independently approved. | Environment and data-provenance checks. |
| DOM-04 | Clinical, legal, financial, eligibility, discipline, custody, or liberty-affecting decisions MUST require qualified human authority and record the decision boundary. | Workflow denial and approval tests. |
| DOM-05 | Domain deployment MUST document jurisdiction, controller, processor, appeal, records, deletion, incident, accessibility, and decommissioning responsibilities. | Deployment dossier. |

## Frontier isolation requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| LAB-01 | Frontier code MUST be disabled by default and isolated from production identities, secrets, data, value, and public authority. | Configuration and environment inspection. |
| LAB-02 | Laboratory experiments MUST declare hypothesis, threat model, assumptions, data provenance, failure criteria, halt procedure, and reproducibility steps. | Experiment manifest verifier. |
| LAB-03 | BFT or distributed-authority work MUST specify safety, liveness, membership, fault, synchrony, recovery, and governance assumptions. | Formal specification and adversarial simulation. |
| LAB-04 | Autonomous research and agent loops MUST have explicit budgets, recursion limits, evaluation gates, artifact provenance, cancellation, and emergency halt. | Loop and fault-injection tests. |
| LAB-05 | Embodied-system work MUST remain in simulation or separately approved hardware test environments until device-specific safety evidence exists. | Environment attestation and halt tests. |
| LAB-06 | Post-quantum migration MUST use named algorithms, hybrid transition rules, downgrade resistance, key lifecycle, evidence compatibility, and rollback. | Interoperability and downgrade tests. |
| LAB-07 | Laboratory code MUST NOT change the current capability or production status without the normal promotion process. | Registry and release checks. |

## Operations and supply chain

| ID | Requirement | Acceptance evidence |
|---|---|---|
| OPS-01 | A clean checkout MUST validate the supported Node.js/npm toolchain, install exact committed locks with lifecycle scripts disabled, prove locks unchanged, and run kernel/release gates without provisioning production credentials. | `npm run setup` and protected CI. |
| OPS-02 | Containers MUST use non-root users, read-only filesystems where possible, pinned images, dropped capabilities, explicit networks, explicit resources, and health checks. | Deployment policy tests. |
| OPS-03 | Secrets, private keys, generated credentials, binaries, caches, and build artifacts MUST NOT be tracked. | Repository hygiene gate. |
| OPS-04 | Logs MUST be structured, redact secrets and sensitive data, and include traceability without storing raw user content by default. | Log-redaction tests. |
| OPS-05 | Releases MUST include tests, SBOM, provenance, migrations, rollback, status, documentation, evidence freshness, and non-claims. | Release verifier. |
| OPS-06 | External telemetry MUST preserve kernel deny-egress and use exact origins, least-privilege credentials, fixed schemas, bounded queues, retry, idempotency, redaction, receipts, and visible dead letters. | Relay tests and signed drill. |
| OPS-07 | Claims MUST match the capability registry, current project status, and deployment evidence. | Documentation/status consistency gate. |
| OPS-08 | Production supervisors MUST bound request pressure, propagate dependency loss, exit fail-closed after child death, and preserve Grid state through recovery. | Signed resilience drill. |
| OPS-09 | Secret and policy providers MUST use independent signers, digest-pinned command chains, nonce-bound exact inventories, bounded execution, semantic validation, private materialization, and fail-closed cleanup. | Provider conformance drill. |
| OPS-10 | Every user-facing and frontier component MUST have an owner, threat model, support boundary, update path, rollback, uninstall or decommissioning procedure, and incident contact before exposure. | Release checklist and deployment dossier. |
| OPS-11 | Internal service communication MUST default deny, authorize an exact caller, destination, method, and route before request signing or network I/O, derive active mTLS peers from the same policy, keep plaintext development traffic on loopback, and remove unrelated unit-network adjacency. | Policy/route/Compose negative tests, protected required-path readiness, selected forbidden-edge container probes, and release-provenance binding. |

## Production and marketing promotion

| ID | Requirement | Acceptance evidence |
|---|---|---|
| PROMO-01 | A capability may be `implemented` only with production-path code, negative tests, executable evidence, matching documentation, and a protected-commit status record. | Registry and release verifier. |
| PROMO-02 | Production promotion MUST bind the exact source, image, deployment, keys, policies, data lifecycle, SLO, recovery, incident, accessibility, and review evidence. | Signed promotion package. |
| PROMO-03 | Critical/high findings MUST be independently reverified closed. Medium/low exceptions MUST be separately approved, owned, contained, and expiring. | Findings ledger verifier. |
| PROMO-04 | Human products MUST pass privacy, accessibility, phone usability, export, deletion, revocation, onboarding, support, and recovery gates. | Human-product dossier. |
| PROMO-05 | Regulated and economic systems MUST pass separate legal, domain, economic, and custody review. | Domain-specific dossier. |
| PROMO-06 | Marketing MUST NOT describe a built, enabled, exposed, preview, synthetic, or laboratory capability as production-promoted. | Claim and publication review. |

## Verified implementation checkpoint

The active `0.12.0-dev.3` build currently verifies:

- the authenticated Gateway → Hypervisor → Sandbox → Grid intent path;
- human-sponsored constrained agent principals with finite scopes, action and
  purpose ceilings, runtime identity, expiry, non-delegation, an enforced
  execution-time ceiling, and authority digests bound into request approval,
  plans, capability claims, and execution evidence;
- version negotiation, explicit plans, deny-dominant policy, and independent
  one-use approval for permitted high-risk effects;
- signed replay-resistant internal requests and TLS 1.3 peer identity;
- encrypted transactional Grid state, evidence continuity, migrations, memory,
  consent, governance, local accounting, export/import, backup, and recovery;
- exact source setup, zero-dependency locks, documentation, SBOM, provenance,
  migration, rollback, and release checks;
- bounded telemetry, alert relay, SLO, request pressure, dependency loss,
  supervisor recovery, service-unit isolation, transport rotation, credential
  rotation, data-key rotation, backup retention, and incident evidence;
- signed node admissions, Grid-signed discovery, deterministic encrypted
  placement reservations, expiry, quarantine, and restart persistence;
- signed offline bundles and operator-approved online causal exchange with
  visible conflicts and explicit all-head resolution;
- signed deployment-independent secret and policy provider startup;
- the experimental loopback AXIOM One shell, including an exact human
  explanation contract for five bounded actions, all 20 stable Gateway
  outcomes, all 37 current kernel event kinds, approval states, raw evidence,
  fixed directional owner-scoped provenance with correction-without-replacement,
  and same-key uncertain-outcome recovery without claiming an authoritative
  pre-execution kernel plan or edge-deletion control;
- strict pilot-evidence and independent-security-review intake verifiers;
- authenticated operator API and CLI;
- an experimental loopback-only AXIOM One PWA foundation with a contract-only
  proxy, memory-only token, public-shell-only cache, owner-scoped private-note
  creation/listing, three fixed directional provenance links,
  correction-without-replacement, confirmation-bound tombstoning, selective
  local export, explicit-only bundle reveal, cross-principal denial evidence,
  and explicit unavailable Share, Circles, and AI states.

The current checkpoint does **not** include a supported AXIOM One browser
application, autonomous-agent runtime, MCP/A2A endpoint, machine delegation,
remote agent execution, external AI provider, AXIOM Verify, Circles, remote
dispatch, authenticated remote results, federation, consensus, arbitrary code,
tokens, settlement, regulated-domain deployment, embodied autonomy, or
post-quantum security. The machine-principal schema's destination, rate,
concurrency, request-size, and response-size fields are not live enforcement
claims yet.

## Capability coverage

Every intended feature family MUST be represented in the capability registry
as `implemented`, `adapter_required`, `experimental`, `specified`, or
`disabled`; only `implemented` may be advertised as runnable:

- core intent, policy, machine principals, grant, execution, and evidence;
- operator API, CLI, AXIOM One, Verify, Circles, Studio, and managed-node tools;
- AI providers, bounded orchestration, memory, and research tools;
- messaging, publishing, identity, credentials, and selective disclosure;
- capsules, signing, revocation, conformance, and catalogue metadata;
- node discovery, scheduling, remote dispatch, result provenance, and causal
  exchange;
- storage, backup, recovery, content transfer, export, and import;
- governance, delegation, emergency controls, appeals, and collaboration;
- education, health, government, legal, employment, business, and finance;
- task markets, workforce, payroll, embodied devices, and digital legacy;
- accounting, rewards, bonds, treasury, tokens, settlement, bridges, and
  liquidity;
- zk verification, arbitrary-code isolation, BFT/distributed authority, and
  post-quantum migration.