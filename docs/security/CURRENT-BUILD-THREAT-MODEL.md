# AXIOM-MESH Current-Build Threat Model

**Build:** `0.12.0-dev.3`

**Status:** canonical security-review input; not an independent assessment

**Updated:** 2026-08-17

This document defines the threat model for the supported clean-room kernel on
`main`. It replaces historical security narratives as the review baseline. An
actual review policy binds this document and the other required inputs to one
source revision and immutable image digest; this prose alone is not evidence
that an independent review occurred.

For remote-social foundations, this canonical model incorporates
[`REMOTE-SOCIAL-THREAT-REVIEW.md`](REMOTE-SOCIAL-THREAT-REVIEW.md) as a required
companion review input. A review that covers remote-social activation but omits
that companion does not satisfy the current-build threat-model scope.

## Supported system and trust boundary

The supported system is the dependency-free Node.js kernel under `mesh/`.
Gateway, Hypervisor, Sandbox, and Grid are separate responsibilities and may
run under one production supervisor or as four independently restartable
single-host units.

- **Gateway** is the only user/operator ingress. The candidate deployment
  exposes it through a permission-restricted Unix-domain socket. It
  authenticates bearer principals, validates request sizes and shapes,
  rate-limits abuse, enforces constrained-machine request-size, request-rate,
  concurrency, and response-size ceilings, exposes constrained-machine-only
  requestability discovery and owner-scoped terminal receipt retrieval, and forwards signed internal requests.
- **Hypervisor** normalizes intent, composes deny-dominant policy, independently
  revalidates constrained agent principals, computes the current built-in effect
  destination from the policy-selected tool, enforces the principal's finite
  destination ceiling, computes machine discovery from the active deny-dominant
  policy intersected with the authenticated machine profile, intersects the machine
  execution-time ceiling with policy, constructs an explicit plan, and issues
  short-lived, audience-bound, single-use grants.
- **Sandbox** accepts only authenticated Hypervisor work covered by an unused
  grant. The supported operation set is built in and deterministic. Arbitrary
  untrusted code execution is not a supported capability.
- **Grid** owns durable encrypted state, the signed hash-linked evidence chain,
  identities, consent, governance, node records, backups, import/export, and
  Grid-attested terminal machine-receipt construction. It is one transparency log, not replicated consensus.

Local Grid chain and checkpoint verification are modification-evident: they detect
invalid signatures, altered events, gaps, broken links, and disagreement with the
locally stored head. Local state alone does **not** make a consistently deleted tail
detectable if an actor can also rewrite the local head metadata and trailing local
checkpoints. Truncation assurance therefore requires an `axiom-grid-continuity-anchor.v1`
retained outside `AXIOM_DATA_DIR`, derived from a Grid-signed export-manifest head and
verified with full genesis re-verification. A valid anchor proves that the current
history equals or extends that retained head and makes truncation detectable only
through the anchor's committed sequence. It does not prove preservation of events
after the newest retained anchor and does not move malicious host/root or active
signing-key compromise outside the trusted-computing-base assumptions below.

Authenticated `agent` principals use `axiom-machine-principal.v1`. They require
a configured human sponsor and are constrained by finite scopes, action and
purpose allowlists, runtime identity, lifetime/expiry, non-delegation, and a
currently enforced execution-time ceiling, authenticated Gateway request-size,
request-rate, concurrency, and response-size ceilings, and an AXIOM-computed
current built-in effect destination constrained to the principal's finite destination
allowlist. Wildcard or glob scope syntax and administrator role
are rejected; machine scopes therefore use the same exact-match grammar as the
authorization evaluator. The machine authority digest is carried through request
binding, plan provenance, capability claims, and result evidence. Existing
least-privilege infrastructure `service` principals remain backward-compatible
unless they explicitly opt into the constrained machine profile.

The v1 machine schema contains a finite destination ceiling. For current built-in
effects, Hypervisor derives the destination from the policy-selected `builtin.*`
tool, which resolves canonically to `local`, and denies the request before capability
issuance when that computed destination is not allowed. Sandbox independently
recomputes and verifies the signed destination before execution. Unknown provider,
remote, or MCP destination semantics remain unresolved and fail closed; no arbitrary
external-destination or remote-execution claim follows. Constrained machines may
query `/v1/machine-discovery`; the response contains only the caller's own
principal/runtime authority facts, merged policy version/digest, purposes,
destinations, budgets, and the requestable action intersection. It omits denied,
out-of-scope, unresolved-destination, and unrelated policy actions and explicitly
states that discovery is not authorization. After a constrained-machine intent reaches
a terminal evidence state, the owner may request a Grid-attested receipt. The receipt binds
the canonical request and machine-authority digests, exactly one accepted and one terminal
Grid event, current chain-verification metadata, and a terminal result/error digest. Raw
results and errors are omitted; foreign-owned and nonexistent identifiers deliberately
return the same `not_found` boundary. Independent verification checks the Grid signature
against a trusted Grid public key. This proves the signed AXIOM receipt statement and its
recorded evidence binding, not that an arbitrary external-world effect occurred. Runtime IDs and software
digests are attribution/binding metadata; they are not hardware,
TPM/TEE, measured-boot, or remote-attestation proof.

The compact candidate container uses `network_mode: none`. Signed deny-egress
runtime evidence binds the observed `/proc/self/ns/net` namespace identity by
digest. The static `network_mode: none` requirement is intentionally not asserted
inside runtime evidence: release/deployment verification reads the actual production
Compose policy, requires that setting, and binds the Compose digest before the
protected container job launches it. Host-local Gateway ingress is mounted
separately, and startup fails before launching children if the enforced Linux
namespace contains a non-loopback interface or IPv4/IPv6 default route. The
four-unit topology uses an internal service network with no external route. Both
models trust the host kernel, container engine, mount policy, process owner, and
deployment operator. Container configuration is a boundary control, not proof
against a malicious host administrator or a kernel escape.

Every internal service edge uses TLS 1.3 with CA validation, DNS and
SPIFFE-style URI identity, and an exact active-leaf fingerprint. The signed
request envelope remains required above TLS and binds method, path, audience,
timestamp, nonce, caller, and body digest. CA custody, runtime private-key
mounts, clock correctness, and active-peer manifests are therefore security
dependencies.

Production secrets are provisioned before startup. The kernel does not
generate replacement credentials while starting. The data-protection key,
service identities, transport credentials, operator and telemetry tokens,
machine bearer credentials, and provider trust roots are outside source
control. The included file provider is a protocol reference, not a production
vault. An authentic pilot must supply a separately reviewed provider adapter
and workload identity.

External telemetry runs in a host-side relay so the kernel can retain deny
egress. The relay has a dedicated read-only credential, accepts only fixed
metric and alert vocabularies, and sends to exact allowlisted HTTPS origins.
That relay, its credential files, DNS/TLS behavior, receiver retention, and
host networking sit outside the kernel container boundary.

Remote-social foundations are currently separated by trust role rather than
collapsed into one network authority. S3A exporter signatures attest only to what
a trusted exporter Grid signed. S3F transport envelopes attest only to one
nonce-bound response from an independently pinned HTTPS transport endpoint. S3D
local admission records only what the local Grid accepted under an exact intent
and independent one-use approval. S3E Following is a private local preference over
already admitted observations. None of these signals proves legal identity,
biological identity, content truth, or personal authorship, and none may become
ordinary Mesh authority merely because it is cryptographically valid.

The disabled `RemoteSocialRuntimeCandidateGridStore` composes Grid-side S3C
staging, S3D admission, S3E private Following, and the bounded retention lifecycle.
It has no public routes, no network egress, and no S3F transport methods. The
accepted Grid service still imports and instantiates `SocialGridStore`; there is no
runtime switch selecting the remote candidate. S3F transport remains laboratory
code only. A future live social transport path must use a separately reviewed
host-side egress relay with least-privilege source-read authority and a staging-only
authenticated handoff into Grid. No source-package endpoint or social relay is
currently deployed.

Admitted-node discovery, placement reservations, operator-approved causal
exchange, and local constrained machine principals are supported foundations.
They do not authorize remote workload execution, autonomous delegation,
MCP/A2A endpoints, automatic federation, or consensus. Every admitted identity,
discovery statement, schedule, causal bundle, apply approval, and supported
machine effect remains signature-, sponsor/owner-, scope-, purpose-, expiry-,
and replay-bound as applicable.

## Assets and security objectives

The primary assets are:

- user, operator, machine-principal and service identities, tokens, consent,
  intent, sponsorship, authority digests, and policy state;
- service, transport, provider, reviewer, machine-runtime, and data-protection
  keys or credentials;
- grants and approvals that can authorize effects;
- Grid state, migrations, evidence events, indexes, encryption metadata, and
  externally retained Grid continuity anchors;
- backup snapshots, retention receipts, rollback packages, rotation journals,
  and recovery copies;
- capsule, node, schedule, causal-exchange, governance, and import/export
  records;
- remote-social package/exporter signatures and digests, encrypted staged review
  state, admission/observation provenance, private follow/trust state, retention
  receipts, transport pins, bounded transport-job state, and any future relay
  credentials or handoff receipts;
- release source, lockfiles, container policy, capability claims, SBOM,
  provenance, protected CI results, and promotion evidence;
- telemetry, alerts, incident records, pilot evidence, security findings, and
  review attestations.

The confidentiality objective is to prevent unauthorized disclosure of
secrets, protected Grid data, consent-scoped information, recovery material,
private remote-social follow/trust metadata, and operational metadata. The
integrity objective is to prevent unauthorized effects, policy weakening,
identity or sponsor substitution, machine-authority widening, remote-social
provenance/authority confusion, evidence alteration, rollback manipulation, and
false capability or promotion claims. The availability objective is bounded:
authorized local work should fail clearly and recoverably when a dependency is
unavailable, without silently bypassing authorization or evidence.

Evidence integrity is stricter than ordinary availability. An acknowledged
mutation must not be reported as successful without its Grid evidence. Missing
authorization, identity, sponsor, policy, encryption, or evidence dependencies
fail closed. Degraded readiness may preserve inspection and recovery, but it
does not grant replacement authority. A local chain verification result must not
be described as deletion evidence; a truncation-detection claim additionally
requires a valid externally retained continuity anchor and full-chain anchor
verification.

## Threat actors and assumptions

The model considers:

- an unauthenticated local or proxied client sending malformed, oversized,
  replayed, or high-volume requests;
- an authenticated human, agent, or service principal attempting horizontal or
  vertical privilege escalation, consent misuse, grant replay, purpose/action
  escalation, sponsor laundering, or evidence confusion;
- a compromised agent runtime attempting to present the legacy unconstrained
  `agent` shape, alter its sponsor/runtime/constraints after approval, replay an
  approval under a new authority profile, or treat declarative metadata as
  proof of trusted execution;
- a malicious or compromised capsule, node, provider process, telemetry
  receiver, or causal-exchange peer;
- a malicious or compromised remote-social exporter Grid, pinned transport
  source, or future host-side social relay attempting provenance substitution,
  replay, amplification, social-engineering, or confused-deputy escalation;
- an authenticated local remote-social reviewer attempting to stage, admit,
  inspect, follow, or reclaim another owner's remote-social records, or to turn a
  trust label into identity/content-truth authority;
- theft or reuse of an active, retired, or historically exposed human, machine,
  service, exporter, transport, or future relay credential;
- one compromised service attempting to impersonate another service or exceed
  its declared role;
- a supply-chain contributor attempting to change dependencies, deployment
  inputs, tests, capability claims, or documentation without matching review;
- an evidence producer or reviewer attempting to omit findings, substitute a
  build, alter a signed artifact, reuse an identity, or imply promotion;
- operational mistakes during provisioning, sponsorship, expiry, rotation,
  remote-social retention/admission, backup retention, recovery, rollback,
  upgrade, or incident containment.

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
    quota/retention events, protected-column rotation, and disabled runtime
    candidate composition;
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
bound to its exact local intent and independent one-use approval. Stopped-runtime
recovery is the documented exception to the online path: it requires separate
signed/encrypted artifacts, exact target binding, Grid exclusion, and
post-recovery verification rather than an online grant.

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
| Remote-social storage amplification or retry exhaustion | Bounded S3 package size/object counts, S3F job lease and bounded retry/backoff, S3G2 owner-scoped stage/admission/observation counts and protected-byte quotas | Real untrusted-network rate limits, cross-owner/global capacity planning, source quarantine and relay concurrency controls remain future gates |
| Remote-social admission confused deputy or approval substitution | Stage binds exact package/exporter/import-plan/trust facts; S3D deterministic request digest; accepted `social.remote.admit` intent plus matching independent one-use approval; quota failure occurs before approval consumption; admission and approval consumption are transactional | Human/operator review can still trust the wrong source or misunderstand provenance; no cryptographic mechanism proves remote content truth or socially valid identity |
| Remote-social retention erases evidence or replay dependencies | G2 expiry alone deletes nothing; explicit cleanup is limited to expired unadmitted stages; cleanup event/receipt/deletion are transactional; admitted stage payloads remain replay dependencies; protected columns participate in data-key rotation | Admitted observation compaction is intentionally absent; future schema changes that make admission replay independent of staged payloads require a new migration/threat review |
| Remote-social Following leaks private preference or expands trust | S3E owner-scoped encrypted trust metadata, trust scope fixed to exporter-attestation-only, admitted-observation-only chronological projection, no live fetch/ranking/recommendation/public graph | Private follow/trust correlation remains sensitive; block/mute/report/quarantine and accepted API disclosure minimization remain required before untrusted-network exposure |
| Future social relay becomes confused deputy or egress bridge | G3 Grid candidate is disabled, no-egress and transport-free; S3F network class has no admission/follow methods; required design places future relay outside Grid with staging-only handoff | Relay is not implemented/deployed; least-privilege identity, handoff authentication, DNS/TLS, queueing, credential rotation and incident isolation require independent evidence before activation |
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
  exhaustion, retry pressure, and cleanup attempts against admitted replay dependencies;
- malicious public text/link/media metadata intended to exploit future renderers or
  mislead a reviewer even though the package is structurally valid;
- trust labels or provenance UI being interpreted as content truth, legal identity,
  biological identity, or personal authorship;
- owner-crossing stage/admission/follow/retention reads, private follow/trust
  correlation, and source/exporter quarantine bypass;
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
15. Remote-social exporter, transport, trust-label, visibility, ranking, or
    reputation metadata never creates Mesh authorization, consent, actor identity
    proof, legal-status proof, content-truth proof, or personal-authorship proof.
16. Transport verification and staging never create remote-social admission;
    admission requires its exact local intent and independent one-use approval.
17. The accepted Grid remains deny-egress. The disabled Grid-side remote-social
    candidate must not gain S3F transport/fetch behavior; any future egress relay is a
    separately reviewed component with staging-only authority.
18. Expiry alone does not silently delete remote-social evidence. An admitted stage
    remains a replay dependency until a separately reviewed migration changes that
    replay model.
19. No remote-social surface becomes public merely because its library or laboratory
    implementation exists; route, policy, service-network, abuse, privacy, rollback,
    and independent-review gates remain separate.

## Residual risk and non-claims

The repository does not claim defense against a malicious host administrator,
secure arbitrary-code execution, an autonomous-agent runtime, machine
delegation, MCP/A2A interoperability, agent federation, remote agent/workload
execution, TPM/TEE or measured-runtime attestation, replicated consensus,
automatic federation, remote dispatch, Sybil resistance, externally hosted key
custody, live vendor provider security, audited WAN behavior, post-quantum
security, or regulatory certification.

The repository also does not claim that the merged remote-social foundations are a
live social network. The accepted Grid still instantiates `SocialGridStore`; the
remote-social candidate is disabled, has no public routes and no network egress;
S3F has no deployed source endpoint or host-side relay. There is no current live
federation, public remote Following, recommendation system, messaging system,
production moderation service, relay/index service, public follow graph, or public
profile hosting. A Grid export signature, transport signature, local admission, or
private follow record does not by itself prove content truth, legal/biological
identity, actor-key ownership, or personal authorship.

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
retention/transport semantics, any social relay or public source endpoint, pilot
evidence, release gates, or the trusted computing base changes. A prior ledger
cannot approve another build. The
[independent security review procedure](INDEPENDENT-SECURITY-REVIEW.md)
defines the exact current intake contract.