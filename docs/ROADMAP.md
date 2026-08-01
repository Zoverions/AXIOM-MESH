# AXIOM-MESH Roadmap

**Status:** canonical strategic roadmap

**Updated:** 2026-07-30

**Planning horizon:** active build `0.12.0-dev.1` through evidence-gated 1.0 and isolated frontier incubation

AXIOM-MESH is being developed as both a defensible capability kernel and a
useful human network. The roadmap therefore advances three coordinated tracks:

1. **Trust and operations** — prove that the kernel can be deployed, measured,
   recovered, rotated, contained, and independently reviewed.
2. **Human utility and network activation** — give non-developers useful local
   products, understandable approvals, portable evidence, and safe collaboration.
3. **Frontier incubation** — build and test distributed authority, settlement,
   autonomy, regulated-domain, and embodied-system foundations without treating
   experimental code as a production claim.

Historical token, bridge, multi-chain, installer, domain, and autonomous-agent
plans remain research and traceability inputs. They may inform new isolated
implementations, but no historical implementation inherits trust, support, or
promotion status.

## Development posture: build broadly, expose narrowly

AXIOM-MESH distinguishes five states that must never be conflated:

1. **Built** — code and tests exist in an isolated development path.
2. **Enabled** — an operator has deliberately activated the capability under an
   explicit policy and credential boundary.
3. **Exposed** — a user, node, or external system can reach the capability.
4. **Production-promoted** — the exact build and deployment have passed the
   applicable evidence, security, recovery, governance, and legal gates.
5. **Marketed** — public claims accurately describe only the promoted scope.

A capability may be built long before it is enabled, exposed, promoted, or
marketed. Frontier work should proceed where it creates reusable knowledge or
removes future technical uncertainty, but it must remain disabled by default,
isolated from production credentials and data, and clearly labeled in the
capability registry.

The preferred doctrine is:

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**

Every user-facing and frontier capability must preserve the mandatory authority
path:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

No product, adapter, experimental runtime, privileged administrator, autonomous
agent, settlement process, or domain capsule may bypass policy, consent,
short-lived grants, bounded execution, evidence creation, or revocation.

## Promotion rules

Roadmap phases are evidence gates, not date promises. A phase advances when:

- acceptance criteria are executable and green;
- capability claims match `mesh/config/capabilities.json`;
- security and recovery negative paths pass;
- operator and user documentation match deployed behavior;
- release evidence is tied to a protected commit and immutable artifacts;
- no critical/high finding remains unresolved; any medium/low exception is
  approved by a separate identity, owned, contained, and expiring;
- data minimization, consent, deletion, export, accessibility, and rollback have
  been tested for any human-facing capability;
- legal or regulated-domain claims are reviewed independently from technical
  correctness.

The active task order is maintained in
[`docs/MASTER-TODO.md`](MASTER-TODO.md). The current production decision is in
the [readiness tracker](PRODUCTION-READINESS-TRACKER.md).

## Published baseline - clean-room kernel 0.11.0

**State:** code complete; protected repository, release, container, recovery,
rotation, retention, and repository-credential evidence are operational.

Delivered:

- four-process Gateway, Hypervisor, Sandbox, and Grid runtime;
- authenticated intent-to-evidence pipeline;
- deny-dominant policy and independent high-risk approval;
- encrypted durable state and signed evidence;
- consent, capsules, memory, local accounting, governance records, admitted
  nodes, storage offers, export/import, backup/restore, offline causal sync,
  operator-approved two-Grid online causal exchange, and independently signed
  deployment-provider startup;
- operator API and CLI;
- bounded telemetry, readiness, operations report, metrics, and a host-side
  OTLP/Alertmanager relay with exact HTTPS routing;
- production provisioning, supervisor, and hardened container candidate.

Boundary: single-node local authority and transparency log. No federation, BFT,
external settlement, arbitrary code, or regulated-domain claim.

## Completed Phase 1 - repository and container evidence

**Delivered in:** published `v0.11.0`

**Outcome:** the clean-room line becomes the protected GitHub default and the
container candidate has reproducible public CI evidence.

Milestones:

1. publish lowercase `main` from a clean root;
2. archive and mark the former `Main` unsupported;
3. enforce canonical documentation and supply-chain checks;
4. protect `main` and require verification/container checks;
5. build the digest-pinned image in GitHub Actions;
6. pass the composed readiness and authenticated operations probe;
7. publish the 0.11 release dossier, checksums, SBOM, and provenance;
8. inventory and revoke 32 conservative deprecated-history credential
   candidates from supported repository trust, with signed protected-CI
   evidence and an explicit queue for outside-provider attestations.

Exit criteria:

- protected `main` is the default;
- kernel and container jobs pass at the release commit;
- image and base digests are recorded;
- no legacy credential is trusted;
- rollback and compatibility notes are published.

## Current Phase 2 - single-node production pilot

**Target line:** `0.12.x`; active build `0.12.0-dev.1`

**Outcome:** one controlled deployment can be operated, measured, rotated,
backed up, restored, and contained.

Milestones:

- coordinated service/API and data-protection-key rotation, rejection, and
  rollback are implemented for the candidate host; repeat both under external
  pilot secret custody;
- signed encrypted-backup retention and weekly disposable-host restore
  verification are implemented for the candidate host; repeat against
  pilot-owned media and key custody;
- external metrics collection and bounded alert delivery are implemented for
  the automated candidate; repeat against pilot-owned HTTPS receivers and
  measure named human acknowledgement;
- controlled load profile and initial latency/error/saturation baseline;
- bounded request-body/rate-limit pressure and real dependency-process loss are
  implemented with signed restart evidence; repeat under cgroup, disk, traffic,
  and pilot-orchestrator resource controls;
- candidate-container deny-egress with preserved loopback ingress is
  implemented; repeat and independently inspect it on the pilot platform;
- incident command, deterministic severity, authority-reducing containment,
  communication, and signed automated tabletop evidence are implemented;
  repeat as a facilitated exercise with the named pilot roster;
- four independently restartable service units, isolated private identities,
  Grid-only durable state, dependency degradation, and Sandbox-only recovery
  are implemented for the single-host candidate; repeat on the pilot
  orchestrator;
- authenticated signed admitted-node discovery and deterministic placement
  reservations are implemented in the single Grid; repeat with measured
  pilot-node resources and identity review before remote dispatch is added;
- independently signed deployment-provider startup is implemented with
  digest-pinned adapters, exact secret/policy inventories, private ephemeral
  generations, rotation/restart proof, and fail-closed invalid-signer
  rejection; repeat with the pilot's actual vault or orchestrator custody
  adapter and workload identity;
- fail-closed pilot intake is implemented with a separately pinned policy
  authority, five distinct review roles, exact build/image binding, current
  30-day/SLO/recovery/custody requirements, and an exact offline inventory of
  13 canonical role-signed v2 evidence envelopes with exact type-specific
  detail contracts; collect, independently review, and run the package
  verifier over the authentic deployment artifacts;
- the current-build threat model and fail-closed independent-review intake are
  implemented; commission the authentic review of the pinned kernel,
  container/deployment policy, and external pilot configuration;
- an authentic signed pilot deployment dossier and later immutable release
  dossier.

Exit criteria:

- measured pilot SLO, RPO, and RTO targets pass;
- rotation and recovery drills pass twice;
- critical/high findings are remediated and independently reverified; any
  medium/low exception has separate approval, ownership, containment, and
  expiry;
- pilot operators complete a facilitated tabletop incident exercise;
- the capability registry is updated only for evidenced promotions.

## Parallel Phase 2H - human utility and network activation

**Target line:** `0.12.x`, developed in parallel with the controlled pilot

**Outcome:** a non-developer can install or open a personal AXIOM node, complete
useful work through a browser interface, understand and control consequential
actions, retain private memory, and selectively collaborate without using the
CLI or surrendering their data to the platform.

This track does not weaken Phase 2. Human-facing preview builds remain local,
invitation-only, or explicitly experimental until their exact deployment and
support boundaries are promoted.

### Product family

- **AXIOM One** — private personal agent, vault, approval centre, and evidence
  record.
- **AXIOM Circles** — invitation-based spaces for families, teams, community
  groups, researchers, creators, and organizations to coordinate under shared
  policies while retaining independently owned nodes and records.
- **AXIOM Verify** — a standalone verifier that explains signatures, evidence
  continuity, package contents, alterations, and non-claims in human language.
- **AXIOM Studio** — capsule, adapter, policy, schema, permission, test-fixture,
  threat-model, and rollback tooling for builders.
- **AXIOM Managed Node** — an optional supported deployment for people and small
  organizations that need hosting, backup, updates, and operational assistance
  without transferring ownership of their information.

### 0.12.1 - human shell

- maintain the implemented versioned Gateway client with exact 27-route
  compatibility, schema, error, idempotency, cancellation, and same-origin
  boundary checks;
- extend the experimental loopback-only `apps/axiom-one/` PWA foundation into
  a reviewed local human product outside the trusted zero-dependency kernel;
- maintain the experimental exact human-explanation contract: reversible
  review for the bounded echo action, all stable Gateway outcomes, all current
  kernel events, approval-state distinctions, raw evidence, and same-key
  uncertain-outcome recovery, without calling it an authoritative kernel plan;
- provide human onboarding, node health, intent submission, visible plans,
  approval queues, revocation, receipts, memory inspection, selective export,
  deletion, and recovery guidance;
- present user concepts such as Ask, Plan, Approvals, Vault, Receipts, Share,
  and Circles while retaining advanced inspection of the underlying services;
- require no third-party analytics, advertising identifier, remote font,
  telemetry destination, or account service for local operation;
- provide keyboard, screen-reader, reduced-motion, contrast, phone-size, and
  plain-language accessibility as tested release requirements;
- package a safe local preview path that creates no production claim.

### 0.12.2 - bounded personal agent

- implement one least-privilege AI provider adapter outside the kernel;
- bind every request to a named provider, model, data scope, purpose, budget,
  timeout, cancellation signal, retention rule, and result receipt;
- support local or user-supplied providers without making either mandatory;
- add document, note, link, and structured-record ingestion into the encrypted
  memory graph with explicit ownership, provenance, deduplication, tombstoning,
  and export behavior;
- deliver useful workflows such as summarize, organize, compare, draft, plan,
  extract commitments, identify missing information, and prepare shareable
  evidence packages;
- prevent model output from directly authorizing external effects;
- evaluate usefulness, latency, cost, correction rate, privacy leakage, and
  failure recovery with real users.

### 0.12.3 - sharing, Circles, and verification

- add invitation, membership, role, device, and revocation records suitable for
  small trusted groups;
- expose selective object and evidence sharing through approved causal exchange;
- make concurrent updates and unresolved conflicts visible rather than silently
  overwriting them;
- add shared proposals, tasks, commitments, approvals, policies, and evidence
  timelines without enabling autonomous payroll or public settlement;
- release AXIOM Verify as a local and static verification surface that does not
  require trusting an AXIOM operator;
- pilot at least one small community, research, creator, family, or civic Circle
  with named participants and explicit consent;
- measure activation, successful outcomes, support burden, accessibility,
  revocation, export, deletion, and trust comprehension.

### Human-product security boundary

- user applications remain outside the trusted kernel and receive no ambient
  filesystem, network, secret, or Grid authority;
- browser sessions use explicit origin, CSRF, CSP, cookie, token, idle-timeout,
  and device-revocation policy;
- secrets are never persisted in browser storage unless a separately reviewed
  local key-management design explicitly permits it;
- user content is encrypted at rest and excluded from operational telemetry;
- every external transfer identifies destination, purpose, scope, retention,
  budget, and cancellation behavior before approval;
- all destructive, public, financial, identity, legal, health, education,
  government, or embodied effects remain independently gated;
- a friendly interface may simplify language but may not conceal uncertainty,
  conflict, denial, degraded state, or the difference between evidence and
  truth.

Exit criteria:

- a new user can reach a useful first result without using the CLI;
- every consequential action remains inspectable, revocable where possible,
  and evidence-linked;
- export and deletion are available from the primary interface;
- accessibility and phone usability pass documented tests;
- at least one real Circle completes a bounded collaborative workflow;
- no preview deployment is described as production-promoted without the full
  Phase 2 evidence package.

## Phase 3 - multi-host foundations

**Target:** 0.13

**Outcome:** four services may be deployed separately over mutually
authenticated transport without claiming distributed consensus.

Milestones:

- mutually authenticated TLS 1.3 service identity and offline certificate
  lifecycle are implemented for the single-host candidate; repeat with
  per-unit mounts, external CA custody, and orchestrator rollout;
- exact default-deny application routes, policy-derived mTLS peers, and four
  segmented single-host networks are implemented; reproduce per-service
  ingress/egress enforcement on the pilot orchestrator and independently
  hosted deployment;
- independent deployment units and failure isolation are implemented for the
  single-host candidate with signed host evidence and protected four-container
  checks; multi-host rollout remains;
- remote dependency readiness and bounded retry/idempotency contracts;
- admitted-node v2 discovery, renewal, expiry, quarantine, and Grid-signed
  filtered results are implemented for one Grid; multi-host endpoint health
  and membership identity remain;
- capability-aware deterministic reservations with bounded resource,
  concurrency, owner, failure-domain, security, and lease constraints are
  implemented; authenticated remote dispatch and result provenance remain;
- operator-approved online causal exchange is implemented for two candidate
  Grids with pinned source evidence, encrypted ordered staging, duplicate
  preflight, visible concurrent heads, and explicit all-head convergence;
  repeat under independent-host WAN conditions;
- deployment-independent secret and policy provider contracts are implemented
  for the single-host supervisor with separate pinned signers, bounded
  nonce-bound responses, and signed conformance evidence; multi-unit rollout
  coordination and a pilot-owned backend adapter remain;
- add authenticated remote dispatch only after workload identity, resource
  enforcement, cancellation, result provenance, replay rejection, and
  compensation behavior are explicit and tested.

Exit criteria:

- remote plaintext is impossible in production mode;
- identity rotation does not create an authorization gap;
- partition/rejoin and duplicate delivery do not corrupt state;
- loss of one non-Grid service does not silently authorize effects;
- remote results are bound to the admitted node, workload, grant, inputs,
  software digest, resource observations, and evidence chain;
- multi-host runbooks and rollback are independently exercised.

Current boundary: the single-Grid scheduler records complete, encrypted,
auditable placement leases and fails closed on capacity, expiry, or quarantine.
The separate online causal relay exchanges already node-signed owner data
between two Gateways while preserving destination independent approval. It does
not contact scheduled nodes, authorize workloads, replicate the Grid log, or
provide consensus. Phase 3 remains open until a dispatcher, measured resources,
independently hosted partition/rejoin evidence, and deployment-specific identity
controls exist.

The provider runtime can now start the existing supervisor from a complete
signed secret and policy generation without embedding a vault SDK in the
kernel. It does not prove any vendor backend, live refresh, multi-host rollout,
or external custody configuration. Phase 3 therefore still requires
pilot-owned adapter and workload-identity evidence.

## Phase 4 - controlled adapters and product ecosystem

**Target:** 0.14

**Outcome:** selected external capabilities and third-party products can be
added without enlarging ambient authority or converting installation into
permission.

Candidate work:

- signed provider-capsule contract and conformance kit;
- multiple least-privilege AI providers, including a local-provider profile;
- messaging and publishing adapters with consent, retention, rate, moderation,
  impersonation, deletion, and account-recovery controls;
- controlled ActivityPub, email, and webhook bridges as separate adapters, not
  as the Mesh authority system;
- AXIOM Studio with manifest, schema, SBOM, permission, threat-model, test,
  compatibility, evidence, and rollback generation;
- a curated capsule catalogue with quarantine and review, while keeping an open
  marketplace unpromoted until identity, dispute, moderation, update, and
  economic controls exist;
- portable governance delegation and organization policy packs;
- content-transfer adapter for admitted storage offers;
- named Verifiable Credentials and selective-disclosure profiles;
- named zk verifier adapters with circuit, key, input schema, and test vectors;
- managed-node deployment, update, backup, migration, and decommissioning
  controls;
- organization administration that cannot silently override individual consent
  or the global denial floor.

Each adapter requires a threat model, credential boundary, egress policy,
budget, cancellation, audit trail, failure mode, abuse analysis,
uninstall/rollback path, data lifecycle, and independent test environment.

## Phase 5 - distributed authority incubation

**Target:** parallel laboratory implementation; no production version commitment

**Outcome:** build, simulate, attack, and measure candidate distributed-control
protocols while determining whether any secure distributed authority is
necessary and justified.

Incubation work may include executable reference implementations for:

- Sybil-resistant membership and admission economics;
- replicated evidence and conflict semantics;
- BFT safety/liveness under realistic network, operator, and governance
  assumptions;
- threshold authorization and emergency recovery;
- governance capture, bribery, censorship, and minority-exit analysis;
- privacy-preserving verification and selective observability;
- supply-chain transparency across independently operated nodes;
- protocol upgrades, version skew, rollback, and catastrophic partition
  recovery;
- simulation, model checking, property testing, Byzantine fault injection, and
  red-team harnesses.

All Phase 5 implementations remain in isolated laboratories or disabled
capability paths. They may use synthetic identities, value, and networks, but
may not receive production keys, user authority, real settlement value, or
silent access to supported Grid state.

No consensus or federation capability is promoted without a formal protocol
specification, adversarial testing, independent review, measured operations,
clear governance and exit rights, and evidence that distributed authority is
safer or more useful than the simpler alternative.

## Phase 6 - settlement, autonomy, and regulated-domain incubation

**Target:** parallel research and isolated implementation; promotion generally
post-1.0 and always domain-specific

**Outcome:** make future high-impact systems technically concrete and testable
without confusing readiness with existence.

### Settlement and economic systems

- local treasury, reward, bond, staking, escrow, dispute, and accounting models;
- token and non-token coordination mechanisms;
- chain, bridge, liquidity, and settlement adapters;
- invariant testing, reconciliation, insolvency, oracle, MEV, governance, key
  compromise, rollback, and consumer-protection analysis;
- test-value-only deployments until economic, legal, security, and independent
  audit gates pass.

### Autonomous and workforce systems

- bounded multi-step agents with budgets, cancellation, checkpointing,
  provenance, evaluation, and human escalation;
- task markets, service offers, compensation records, quality disputes, and
  worker/agent identity;
- no autonomous authority expansion, secret acquisition, payroll, public
  contracting, or irreversible external effect without explicit capability and
  legal gates.

### Regulated and socially critical domains

- health, education, government, finance, legal, employment, and public-service
  capsules developed as separate domain products;
- jurisdiction-specific consent, records, retention, appeal, professional
  responsibility, accessibility, safety, procurement, and incident controls;
- synthetic, public, or explicitly consented test data only until the exact
  deployment is approved;
- domain usefulness and harm evaluation performed with affected humans and
  qualified independent reviewers.

### Embodied systems

- device identity, command envelopes, geofences, force/energy limits,
  simulation, emergency halt, degraded mode, operator takeover, and physical
  incident evidence;
- no real-world actuation until device-specific safety cases and independent
  testing pass.

Repository history or experimental code describing these systems does not
satisfy their promotion gates. Building them creates options and evidence;
activation remains separately governed.

## Product and ecosystem principles

- **Single-player value first:** AXIOM One must be useful before a network is
  large.
- **Network value second:** Circles should improve coordination while preserving
  independent ownership and exit.
- **Verifiability without membership:** AXIOM Verify must work for people who do
  not operate a node.
- **Developers follow human demand:** Studio and the capsule ecosystem should
  make proven user needs easier to serve, not create permissions in search of a
  use case.
- **No data-extraction business model:** managed services may charge for
  hosting, support, storage, backup, verification, compliance assistance, and
  operations, but not for covert profiling or sale of personal data.
- **Replaceability:** providers, hosts, models, adapters, and applications must
  have export, migration, revocation, and removal paths.
- **Truthful interfaces:** receipts show what was authorized and observed; they
  do not convert inference into fact or cryptographic integrity into truth.

## 1.0 criteria

Version 1.0 requires:

- a stable supported scope and compatibility policy;
- multiple successful production-pilot release cycles;
- independent security review with no unresolved critical/high finding;
- measured availability, capacity, recovery, and incident performance;
- protected release governance and reproducible supply-chain evidence;
- documented data lifecycle, credential lifecycle, and decommissioning;
- clear non-claims for everything outside the supported boundary;
- at least one production-promoted human product that a non-developer can use
  without the CLI;
- tested onboarding, accessibility, revocation, export, deletion, backup,
  migration, and account/device recovery;
- evidence that real users can complete useful workflows while understanding
  approvals, denials, uncertainty, and sharing boundaries.

Distributed consensus, public settlement, autonomous workforce operation, and
regulated-domain deployment are not mandatory for 1.0. They may be substantially
built in isolated tracks, but a smaller promoted system with defensible evidence
is preferred to a larger exposed system whose authority or claims cannot be
verified.
