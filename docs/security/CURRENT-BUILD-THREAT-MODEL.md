# AXIOM-MESH Current-Build Threat Model

**Build:** `0.12.0-dev.3`

**Status:** canonical security review input for the supported clean-room tree; not an independent assessment

**Updated:** 2026-08-17

This document defines the security boundary, adversaries, trust assumptions,
assets, entry points, abuse cases, and residual risk for the current supported
AXIOM-MESH build. It is an input to the
[independent security review procedure](INDEPENDENT-SECURITY-REVIEW.md), not a
substitute for that review.

The focused [remote-social threat review companion](REMOTE-SOCIAL-THREAT-REVIEW.md)
is part of this current-build review input. Independent review of any future
remote-social activation must cover both documents and the exact source revision.

## Supported system and trust boundary

The supported runtime is the clean-room `mesh/` kernel with four authority
roles:

```text
principal -> Gateway -> Hypervisor -> Sandbox -> Grid
```

- **Gateway** authenticates principals, validates and bounds requests, applies
  request-size/rate/concurrency/response ceilings, and is the only supported
  host-facing application endpoint.
- **Hypervisor** normalizes intent, evaluates deny-dominant policy, revalidates
  constrained machine authority, constructs plans, requires confirmation and
  independent approval where policy demands it, and signs exact one-use grants.
- **Sandbox** verifies the signed grant and executes only the fixed built-in
  operation set. It is not an arbitrary-code sandbox claim.
- **Grid** owns durable encrypted state, consent, evidence, approvals, memory,
  governance, accounting, portability, admitted-node state, backup/recovery,
  local/online causal-sync state, and current local social actor/persona/publication
  state.

The production-candidate single-host package can run these roles under one
supervisor or as four isolated service units. Internal production traffic uses
TLS 1.3, distinct Ed25519 service identities, exact active-leaf pinning, signed
caller binding, and a default-deny service-network policy. The compact
container additionally uses `network_mode: none`; the independent-unit topology
uses four internal-only segments plus the same application and transport
allowlists.

The accepted Grid server remains hard-bound to `SocialGridStore`. The repository
also contains a **disabled** Grid-side remote-social candidate that composes S3C
staging, S3D admission, S3E owner-private Following, S3G2 retention/quota
lifecycle, and S3G6 owner-private abuse controls/quarantine while remaining
no-egress, transport-free, and absent from the accepted Grid server. The
separate S3F transport laboratory remains network-capable only as isolated
source code/tests; there is no deployed source endpoint or host-side social
relay and no accepted public remote-social route on this branch.

The current local social actor/persona/publication surface remains owner-local.
It does not by itself create remote Following, federation, public profile
hosting, messaging, recommendation ranking, or a moderation service.

## Assets and security objectives

Security review must protect at least:

- bearer principals and their human sponsorship/expiry/role/scope state;
- constrained machine-principal v1 authority fields, runtime identity,
  destination/action/purpose ceilings, budgets, and authority digests;
- service signing identities, internal TLS leaves, CA/trust registries, provider
  signers, active/retired credential state, data-protection keys, and recovery
  packages;
- policy layers, capability registry, operator/client contracts, source setup,
  container/service topology, release inputs, and immutable evidence digests;
- encrypted Grid database, backups, rollback/recovery copies, continuity
  anchors, migration state, and signed/hash-linked evidence;
- node admission/discovery/scheduling data, storage offers, causal bundles,
  queued online-sync state, and independent approvals;
- consent, memory, governance, accounting, import/export, local social actor/
  persona/publication state, and owner-scoped machine receipts;
- remote-social public projections/packages, exporter Grid/key IDs, package and
  import-plan digests, trusted exporter keys/labels, staged encrypted records,
  admission authority/provenance, remote observations, private follow/trust
  state, retention/quota records, S3F transport pins/jobs/receipts, and S3G6
  private mute/block/report/quarantine state plus protected reason/note/source
  metadata;
- telemetry labels, queued alerts, receiver credentials, retry/dead-letter
  state, and delivery receipts; and
- pilot/review policies, role keys, findings, exceptions, evidence envelopes,
  build/image identity, and promotion decisions.

Required objectives are confidentiality for secrets/private user state;
integrity and non-equivocation detection for signed evidence within the stated
trust model; exact authorization and least privilege; owner isolation; bounded
resource use; durable/recoverable acknowledged mutations; truthful evidence and
public claims; revocation/rotation/rollback; and fail-closed behavior when trust,
identity, evidence, policy, or dependencies are ambiguous.

## Trust assumptions and trusted computing base

The current trusted computing base includes:

- the host OS/kernel, filesystem permissions, process identity, container
  engine/orchestrator, local network namespace, and configured administrators;
- the exact supported source revision, Node.js runtime, npm/lockfiles,
  digest-pinned production base image, and CI actions/runners used for evidence;
- active Grid/service/provider/review/pilot authority keys and their external
  custody as declared by the deployment;
- the Grid data-protection key and exact protected-column context scheme;
- configured trusted remote-social exporter keys for any operator-selected
  laboratory import, and independently configured S3F transport keys/origins if
  that laboratory is exercised;
- correct time within the bounded clock/expiry assumptions used by tokens,
  grants, approvals, TLS certificates, provider responses, remote-social
  transport envelopes, and evidence; and
- GitHub branch protection/workflow isolation for development/release evidence.

A signature proves only that the corresponding trusted key signed the exact
bytes. It does not prove human competence, legal identity, content truth,
biological identity, personal authorship, honest observation, hardware/runtime
integrity, or independence beyond the signed/policy-pinned declaration.

A remote-social exporter signature proves exporter-Grid attestation of the
exact package. A transport signature proves one exact nonce-bound response from
the configured transport key/origin. Local admission proves the local Grid
accepted the exact staged package under the recorded local intent and
independent one-use approval. A follow record proves a local owner preference.
A mute/block proves only a local owner preference; a report proves only that the
owner recorded an assertion; exporter/source quarantine proves only that the
owner locally selected fail-closed handling. None of those statements alone
proves content truth, abuse, legal identity, actor-key ownership, or personal
authorship.

## Adversaries and out-of-scope powers

The model considers:

- unauthenticated or incorrectly authenticated API clients;
- authenticated human or machine principals attempting to exceed scopes,
  roles, actions, purposes, destinations, budgets, approval state, or ownership;
- replay, substitution, stale authority, confused-deputy, cross-owner, and
  idempotency attacks;
- malicious or compromised remote-social exporters, transport endpoints,
  future relays, or local principals attempting to abuse stage/admit/follow/
  retention/mute/block/report/quarantine semantics;
- storage, request, retry, report, preference, quarantine, and observation
  amplification intended to exhaust bounded resources;
- malicious public text/link/media metadata intended to exploit future
  renderers, reviewers, or moderation tooling despite structural package
  validity;
- compromise or misuse of an active API, service, exporter, transport, or
  future relay credential;
- one compromised service attempting to impersonate another service or exceed
  its declared role;
- a supply-chain contributor attempting to change dependencies, deployment
  inputs, tests, capability claims, or documentation without matching review;
- an evidence producer or reviewer attempting to omit findings, substitute a
  build, alter a signed artifact, reuse an identity, or imply promotion;
- operational mistakes during provisioning, sponsorship, expiry, rotation,
  remote-social retention/admission/abuse-control handling, backup retention,
  recovery, rollback, upgrade, or incident containment.

The single-host candidate assumes the operating-system kernel, container
engine, filesystem permissions, process account, monotonic-enough wall clock,
and named deployment administrators are trustworthy. Root or equivalent host
control can read memory, replace binaries, change mounts, intercept local
traffic, and bypass namespace policy; the kernel cannot defend against that
actor. Physical attacks, hardware implants, malicious firmware, compiler
subversion, denial of the complete host, traffic analysis outside encrypted
channels, and cryptographic breaks are outside the implemented boundary.

The repository also assumes GitHub branch protection, action isolation, and
separately managed workflow secrets operate as configured. A green workflow is
development/release evidence, not proof that a pilot host or external custodian
has the same controls.

## Entry points and privileged flows

Reviewers must trace at least these entry points:

1. Gateway liveness, readiness, authenticated API, constrained-machine
   discovery, intent, operations, telemetry, export, import, and administrative routes.
2. human, constrained-agent, and service bearer-principal registry loading,
   sponsorship resolution, machine-profile normalization, and expiry handling;
3. Gateway-to-Hypervisor, Hypervisor-to-Sandbox, and service-to-Grid
   authenticated requests;
4. machine action/purpose checks, authority-digest request binding, plan
   provenance, approval matching, capability issuance, and execution evidence;
5. policy, principal, trust-root, transport, provider, and deployment files
   loaded at provisioning or startup;
6. encrypted Grid database, migrations, backups, recovery copies, rotation
   packages, rollback journals, and externally retained continuity-anchor
   creation/verification while Grid is stopped;
7. node admission/renewal, storage offers, discovery, scheduling, quarantine,
   causal bundles, apply approvals, and resolution;
8. telemetry scraping, queued alert delivery, receiver responses, receipts,
   retry, and dead-letter state;
9. import/export bundles and recipient encryption;
10. remote-social package construction/verification, review staging, exact
    intent/approval-bound admission, observation materialization, private Following,
    quota/retention events, owner-private mute/block/report/quarantine state,
    protected-column rotation, and disabled runtime candidate composition;
11. S3F transport-envelope verification, exact origin/key/nonce/package binding,
    retry/lease state, and the future host-side relay plus staging-only handoff if
    that relay is ever implemented;
12. source checkout, package locks, container build inputs, release verifier,
    capability registry, documentation checker, and CI evidence;
13. pilot policy, dossier, evidence package, independent-review policy, findings
    ledger, remediation records, and exceptions.

No privileged effect may bypass the intent, policy, machine-authority where
applicable, plan, grant, execution, evidence sequence. Remote-social package or
transport verification does not create admission authority: S3D admission remains
bound to its exact local intent and independent one-use approval. G6 local
preferences/reports/quarantines likewise create no remote authority, admission,
ranking, recommendation, content-truth, identity, or legal-status effect.
Stopped-runtime recovery is the documented exception to the online path: it
requires separate signed/encrypted artifacts, exact target binding, Grid
exclusion, and post-recovery verification rather than an online grant.

## Threat analysis

| Threat | Implemented prevention or detection | Residual risk / required external evidence |
|---|---|---|
| Authentication bypass or token theft | Exact bearer principals, constrained agent profile, scoped telemetry identity, restrictive secret-file checks, signed service envelopes, mTLS peer identity, active-leaf pinning, replay guards | Bearer theft still conveys the configured principal until expiry/revocation; host memory and external custodian compromise remain possible; pilot custody and token operational monitoring are pending |
| Legacy or forged unconstrained agent identity | Bearer registry requires `agent` principals to normalize as `axiom-machine-principal.v1`; Hypervisor independently rejects legacy `agent` shape; unknown/non-human sponsor, wildcard scope, and administrator role fail closed | A stolen valid constrained-agent bearer still needs operational revocation; runtime identity metadata is not hardware attestation |
| Sponsor laundering or authority-profile substitution | Sponsor must resolve to a configured human principal; normalized authority digest includes sponsor, roles/scopes, lifetime, runtime and constraints; approvals bind request digest containing the machine authority digest | Human sponsor compromise and social/organizational authorization errors remain outside cryptographic proof |
| Machine action, purpose, or destination escalation | Ordinary policy is evaluated first; machine action/purpose ceilings form a second deny-dominant layer; current built-in effect destination is computed from the authorized tool and must remain inside the principal's finite destination ceiling | External/provider/MCP destination semantics and remote execution remain unimplemented and fail closed |
| Machine discovery metadata inference or discovery-as-authority | The route is constrained-machine-only; Hypervisor intersects the active deny-dominant policy with only the authenticated principal's finite actions, scopes and destinations; unresolved or denied actions are omitted; overlay structure, bearer material and unrelated actions are not returned; the response declares `discovery_is_not_authorization` | The caller intentionally learns its own authority facts plus merged policy version/digest and requestable action metadata; future provider/MCP schemas or global discovery must receive separate minimization and inference review |
| Machine receipt substitution, disclosure, or intent-existence probing | Receipt construction requires terminal evidence, exact accepted/terminal event identity, verified Grid chain state and a Grid signature; the public route is constrained-machine owner-only, raw terminal content is replaced by digests, and foreign/nonexistent ids share `not_found` | A trusted Grid key proves Grid attestation, not external-world truth; key compromise, host compromise, selective evidence disclosure beyond the current receipt, and future remote verifier/product semantics require separate controls |
| Machine execution-budget widening | Hypervisor intersects policy timeout with machine `max_execution_ms`; plan and capability bind the resulting authority context | CPU/memory/cost accounting beyond the supported timeout path needs later resource-meter evidence |
| Machine delegation laundering | Machine-principal v1 validation requires delegation disabled and depth zero; no machine delegation runtime exists | Future delegation requires a separate attenuation-only design, threat model, property tests, revocation and promotion |
| Approval reuse after machine-authority change | Request digest includes machine authority digest; plan provenance and capability claims repeat the exact digest; result/mutation evidence records it | Reviewers must verify all future adapters preserve the same request-binding semantics |
| Runtime/software-digest overclaim | Runtime identity and optional software digest are typed and authority-bound metadata only | No TPM/TEE, measured boot, workload attestation, process isolation proof, or remote attestation is claimed |
| Authorization or consent weakening | Deny-dominant layered policy, explicit risk classification, independent high-risk approval, purpose/scope/subject/controller-bound consent, audience-bound one-use grants | Policy correctness and all high-risk classifications require independent source/configuration review |
| Request replay, substitution, or confused deputy | Method/path/audience/body digest, caller identity, timestamp, nonce, one-use approval and grant state | Clock failure and stolen active keys require deployment alerts, rotation, and incident response |
| Unauthorized Sandbox effect | Fixed built-in operation registry, grant/tool/constraint binding, no ambient supported external adapters, deny egress | This is not arbitrary-code isolation; host/container escape resistance is not externally audited |
| Service impersonation or retired-leaf reuse | TLS 1.3 CA validation plus DNS/URI identity and exact active fingerprint; distinct service keys; signed caller/certificate binding | Pilot CA custody, compromise recovery, and orchestrator mount policy remain external gates |
| Grid data disclosure, tamper, or local history truncation | Authenticated encryption, signed hash-linked evidence, schema validation, transaction boundaries, wrong-key/tamper tests; local full/checkpoint verification detects modification; an externally retained Grid-signed continuity anchor plus full genesis verification detects truncation through the retained sequence | Local state alone cannot detect a consistently truncated suffix with matching local head/checkpoint rewrite; external-anchor assurance ends at the newest retained anchor; host root, external-anchor custody failure, and active Grid/data-key compromise remain trusted/external risks |
| Backup deletion, rollback substitution, or partial rotation | Signed encrypted snapshots, exact manifests, inventory recheck, recoverable quarantine, Grid locks, atomic journals, rewrap chains, rollback verification | Pilot-owned media policy, external key versioning, escrow, destruction, and operator separation remain pending |
| Provider response injection or secret leakage | Separate pinned Ed25519 signers, digest-pinned adapter, nonce/audience/expiry-bound exact inventories, bounded process I/O, private ephemeral generation, secret scans | Reference file adapter is not vendor custody; real backend authorization, HA, audit retention, and workload identity need review |
| Telemetry exfiltration or receiver abuse | Fixed labels/attributes, exact four-service scrape, dedicated scope, exact HTTPS origins, no redirect, bounded queue/retry, receipts and forbidden-term scans | Host relay can access collected operations data; live receiver custody, DNS/TLS policy, retention, and on-call routing remain external |
| Malicious admitted node or causal peer | Signed owner/key-bound admission, unique active keys, roles/resources/expiry/quarantine, signed bounded discovery, deterministic leases, pinned streams, encrypted queues, independent one-use apply approval | Remote execution is absent; multi-host identity, WAN faults, resource truth, endpoint health, residency, and Sybil resistance are unresolved |
| Remote-social exporter forgery, compromise, or provenance overclaim | S3A exact public-only schemas/content addresses, explicit trusted exporter key, Ed25519 package verification, complete lineage checks, exporter attestation scope limited to `grid-export` | A compromised trusted exporter key can sign deceptive schema-valid packages; signature does not prove content truth, legal identity, biological identity, actor-key ownership, or personal authorship; revocation/rotation and operator trust policy remain required |
| Remote-social transport substitution, replay, or origin confusion | S3F exact HTTPS origin, redirect rejection, distinct pinned transport key, exporter key kept separate, nonce/freshness binding, canonical package-byte digest, independent S3A re-verification, bounded response/timeout | S3F remains laboratory-only and no source endpoint/relay is deployed; future relay DNS/TLS custody, source credential handling, key rotation, HA and incident response require separate review |
| Remote-social storage amplification or retry exhaustion | Bounded S3 package size/object counts, S3F job lease and bounded retry/backoff, S3G2 owner-scoped stage/admission/observation counts and protected-byte quotas, G6 owner-scoped preference/report/quarantine ceilings | Real untrusted-network rate limits, cross-owner/global capacity planning, source-quarantine relay enforcement and relay concurrency controls remain future gates |
| Remote-social admission confused deputy or approval substitution | Stage binds exact package/exporter/import-plan/trust facts; S3D deterministic request digest; accepted `social.remote.admit` intent plus matching independent one-use approval; quota failure occurs before approval consumption; admission and approval consumption are transactional | Human/operator review can still trust the wrong source or misunderstand provenance; no cryptographic mechanism proves remote content truth or socially valid identity |
| Remote-social retention erases evidence or replay dependencies | G2 expiry alone deletes nothing; explicit cleanup is limited to expired unadmitted stages; cleanup event/receipt/deletion are transactional; admitted stage payloads remain replay dependencies; protected columns participate in data-key rotation | Admitted observation compaction is intentionally absent; future schema changes that make admission replay independent of staged payloads require a new migration/threat review |
| Remote-social Following leaks private preference or expands trust | S3E owner-scoped encrypted trust metadata, trust scope fixed to exporter-attestation-only, admitted-observation-only chronological projection, no live fetch/ranking/recommendation/public graph; G6 mute/block and exporter quarantine suppress owner-local projection/follow without deleting evidence | Private follow/trust/abuse-control correlation remains sensitive; accepted API disclosure minimization, renderer safety, appeal/correction semantics for any shared reports, and public-rate controls remain required before untrusted-network exposure |
| Remote-social report or quarantine becomes false authority | G6 reports are append-only owner assertions with `adjudicated: false` and no automatic visibility/trust effect; exporter/source quarantine is owner-local with explicit no-network/no-authority/no-recommendation/no-adjudication effects; source origin is normalized/digest-addressed and protected at rest | A human or future service may still overinterpret local records; shared moderation, reputation, automated classification, source-relay enforcement, appeal and legal process require separate review before exposure |
| Future social relay becomes confused deputy or egress bridge | G3 Grid candidate is disabled, no-egress and transport-free; S3F network class has no admission/follow methods; G6 source quarantine performs no fetch; required design places future relay outside Grid with quarantine preflight and staging-only handoff | Relay is not implemented/deployed; least-privilege identity, handoff authentication, DNS/TLS, queueing, credential rotation and incident isolation require independent evidence before activation |
| Import/export forgery or over-disclosure | Signed manifest, stable schemas, content digests, selective scopes, recipient encryption, staged validation | External identity and recipient-key lifecycle adapters are not implemented |
| Release or claim substitution | Exact package/lock/version checks, dependency-free boundary, digest-pinned container input, capability registry, generated status, documentation allowlist, protected CI and CodeQL | GitHub and build-runner compromise remain supply-chain assumptions; immutable release/pilot artifacts still require accountable custody |
| False pilot or security-review evidence | Separately supplied authority keys, exact build/image and artifact digests, distinct reviewer roles, canonical files, raw hashes, exact schemas, recomputed summaries, Ed25519 attestations, explicit non-promotion output | Signatures prove the authorized key signed bytes, not reviewer competence, honest observation, or independence beyond the signed/policy-pinned declaration |

## Required abuse cases

The current review must consider at minimum:

- missing, expired, replayed, wrong-audience, wrong-body, or wrong-peer
  credentials and approvals;
- unconstrained `agent` registry entries, unknown/non-human sponsors, wildcard
  machine scopes, administrator-role injection, expired session principals, or
  attempted machine delegation;
- a machine request whose action, purpose, or computed effect destination is outside
  its profile, whose authority digest changed after approval, or whose runtime metadata is
  presented as attestation;
- a machine treating discovery as a grant, probing discovery for unrelated policy or
  object metadata, or attempting to recover bearer material or overlay structure;
- one valid identity reused for another role, node, provider, reviewer, or
  exception approver;
- policy-layer reordering, omission, unknown fields, numeric boundary errors,
  or a lower layer attempting to expand authority;
- accepted API work whose Grid evidence commit fails;
- consistent Grid suffix deletion paired with rewritten local `last_seq`, `last_hash`,
  or trailing checkpoint metadata; forged, re-addressed, wrong-Grid, wrong-build,
  malformed, or locally retained-only continuity anchors;
- oversized request/response bodies, rate pressure, constrained-machine
  concurrency pressure, dependency suspension/loss, partial startup, stale
  readiness, and restart races;
- retired certificate/token acceptance, partial rotation, killed cutover,
  rollback to altered files, wrong data key, corrupt backup, and changed
  retention inventory;
- symlinked, world-readable, unexpected, noncanonical, stale, cross-build, or
  secret-bearing provider, pilot, release, or review artifacts;
- discovery of copied keys, owner/failure-domain concentration, false resource
  claims, quarantine, missed renewal, lease expiry, partition/rejoin,
  concurrent heads, duplicate causal bundles, and approval replay;
- telemetry label/cardinality expansion, credentialed URLs, redirects,
  receiver 429/503 behavior, queue exhaustion, and dead-letter leakage;
- malicious or compromised remote-social exporter keys signing deceptive but
  schema-valid content, transport/exporter key substitution, retired-key reuse,
  stale or replayed nonce-bound transport envelopes, origin confusion, and
  canonical package-byte substitution;
- package amplification, repeated unique remote observations, stage/admission quota
  exhaustion, retry pressure, preference/report/quarantine pressure, and cleanup
  attempts against admitted replay dependencies;
- malicious public text/link/media metadata intended to exploit future renderers or
  mislead a reviewer even though the package is structurally valid;
- trust labels, report state, quarantine state, or provenance UI being interpreted as
  content truth, legal identity, biological identity, personal authorship, adjudication,
  or global moderation;
- owner-crossing stage/admission/follow/retention/mute/block/report/quarantine
  reads or mutations, private follow/trust/report/quarantine correlation, and
  source/exporter quarantine bypass;
- malformed or over-broad source origins, HTTP/userinfo/path/query/fragment source
  quarantine inputs, and attempts to make Grid perform source network access;
- a future relay with leaked or over-broad source credentials, permissive DNS/TLS or
  redirect behavior, or an authenticated handoff capable of invoking admission rather
  than staging only; and
- a findings ledger with omitted scope, anonymous owners, altered counts,
  unverified critical/high closure, reviewer-approved risk exception, or
  non-expiring exception.

## Security invariants

Independent review should treat these as invariants, not best-effort goals:

1. Missing authorization, evidence integrity, identity, sponsor, or encryption
   material cannot become success through a fallback.
2. A denial in any applicable policy or machine-authority layer dominates
   permission.
3. A grant or approval is exact-audience, request-bound, short-lived, and
   single-use.
4. A machine authority change changes the request/plan/capability evidence
   binding; old approval must not authorize the new authority profile.
5. Machine-principal v1 cannot delegate and cannot receive wildcard scope or
   administrator role.
6. A privileged mutation is acknowledged only with durable linked evidence.
7. A retired or unpinned credential is rejected even if otherwise
   cryptographically valid.
8. Only Grid owns durable runtime state; recovery operates with Grid stopped.
9. Secrets do not enter source, images, signed public evidence, logs, dossier
   details, findings ledgers, or command output.
10. Synthetic drills identify themselves and cannot claim live operation,
    external review, or production promotion.
11. No older source revision, image, release, or archived document can satisfy
    a current-build gate.
12. Critical/high security findings must be closed and independently
    reverified before review intake; lesser accepted risk needs a named owner,
    separate approval, containment, and a bounded unexpired exception.
13. Discovery, listing, installation, connection, or protocol advertisement never
    creates execution authority; every effect still requires normal intent evaluation.
14. Local Grid chain/checkpoint verification is not deletion evidence. Any claim
    of truncation detection requires a signed continuity anchor retained outside
    `AXIOM_DATA_DIR`, verified against the exact source/build context with full
    genesis chain verification; assurance stops at the newest retained anchor.
15. Remote-social exporter, transport, trust-label, visibility, ranking,
    reputation, report, mute/block, or quarantine metadata never creates Mesh
    authorization, consent, actor identity proof, legal-status proof,
    content-truth proof, personal-authorship proof, or abuse adjudication.
16. Transport verification and staging never create remote-social admission;
    admission requires its exact local intent and independent one-use approval.
17. The accepted Grid remains deny-egress. The disabled Grid-side remote-social
    candidate must not gain S3F transport/fetch behavior; G6 source quarantine
    must not perform network I/O; any future egress relay is a separately reviewed
    component with staging-only authority.
18. Expiry alone does not silently delete remote-social evidence. An admitted stage
    remains a replay dependency until a separately reviewed migration changes that
    replay model.
19. Local mute/block/report/quarantine records remain owner-private safety state;
    they do not silently rewrite remote observations or create global moderation,
    ranking, reputation, admission, or identity authority.
20. No remote-social surface becomes public merely because its library or laboratory
    implementation exists; route, policy, service-network, privacy, rollback,
    renderer, relay, and independent-review gates remain separate.

## Residual risk and non-claims

The repository does not claim defense against a malicious host administrator,
secure arbitrary-code execution, an autonomous-agent runtime, machine
delegation, MCP/A2A interoperability, agent federation, remote agent/workload
execution, TPM/TEE or measured-runtime attestation, replicated consensus,
automatic federation, remote dispatch, Sybil resistance, externally hosted key
custody, live vendor provider security, audited WAN behavior, post-quantum
security, or regulatory certification.

The repository also does not claim that the merged remote-social foundations or
this G6 candidate branch are a live social network. The accepted Grid still
instantiates `SocialGridStore`; the remote-social candidate is disabled, has no
public routes and no network egress; S3F has no deployed source endpoint or
host-side relay. There is no current live federation, public remote Following,
recommendation system, messaging system, production moderation service,
relay/index service, public follow graph, or public profile hosting. A Grid
export signature, transport signature, local admission, private follow record,
mute/block preference, report, or quarantine record does not by itself prove
content truth, abuse, legal/biological identity, actor-key ownership, personal
authorship, or a right to impose authority on another actor.

An externally retained continuity anchor makes a fully verified current Grid
history truncation-detectable only through the newest retained anchor sequence.
It does not prove that events after that anchor were preserved, does not recover a
deleted tail, and does not defend against compromise of the host or an active Grid
signing key capable of producing new trusted statements. Anchor custody is therefore
an external operational dependency rather than a substitute for host security.

The constrained machine-principal implementation does not by itself prove that
the named runtime is uncompromised, that its software digest corresponds to
loaded bytes, or that the human sponsor made a socially/legally valid choice.
It constrains and records the authority presented to the kernel. Future
protocol adapters, remote executors, attestation systems, and delegation must
preserve or further reduce this authority rather than bypass it.

The repository-owned verifier can prove the internal consistency, signature,
build binding, scope, disposition, and non-promotion behavior of an independent
review package. Its synthetic CI drill does not perform that review. SEC-002
remains pending until an accountable independent organization reviews the
actual pinned source and configuration, signs the authentic findings ledger,
and the ledger passes offline intake.

The threat model must be reassessed when authentication, machine-principal
semantics, policy, grants, Sandbox operations, Grid schemas, encryption,
backup/recovery, service topology, container policy, provider protocol,
node/sync behavior, telemetry, remote-social package/staging/admission/Following/
retention/abuse-control/transport semantics, any social relay or public source
endpoint, pilot evidence, release gates, or the trusted computing base changes.
A prior ledger cannot approve another build. The
[independent security review procedure](INDEPENDENT-SECURITY-REVIEW.md)
defines the exact current intake contract.
