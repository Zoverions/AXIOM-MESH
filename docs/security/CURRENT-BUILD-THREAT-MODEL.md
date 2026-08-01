# AXIOM-MESH Current-Build Threat Model

**Build:** `0.12.0-dev.1`

**Status:** canonical security-review input; not an independent assessment

**Updated:** 2026-07-29

This document defines the threat model for the supported clean-room kernel on
`main`. It replaces historical security narratives as the review baseline. An
actual review policy binds this document and the other required inputs to one
source revision and immutable image digest; this prose alone is not evidence
that an independent review occurred.

## Supported system and trust boundary

The supported system is the dependency-free Node.js kernel under `mesh/`.
Gateway, Hypervisor, Sandbox, and Grid are separate responsibilities and may
run under one production supervisor or as four independently restartable
single-host units.

- **Gateway** is the only user/operator ingress. The candidate deployment
  exposes it through a permission-restricted Unix-domain socket. It
  authenticates bearer principals, validates request sizes and shapes,
  rate-limits abuse, and forwards signed internal requests.
- **Hypervisor** normalizes intent, composes deny-dominant policy, constructs an
  explicit plan, and issues short-lived, audience-bound, single-use grants.
- **Sandbox** accepts only authenticated Hypervisor work covered by an unused
  grant. The supported operation set is built in and deterministic. Arbitrary
  untrusted code execution is not a supported capability.
- **Grid** owns durable encrypted state, the signed hash-linked evidence chain,
  identities, consent, governance, node records, backups, and import/export.
  It is one transparency log, not replicated consensus.

The compact candidate container uses `network_mode: none`. Host-local Gateway
ingress is mounted separately, and startup fails before launching children if
the enforced Linux namespace contains a non-loopback interface or IPv4/IPv6
default route. The four-unit topology uses an internal service network with no
external route. Both models trust the host kernel, container engine, mount
policy, process owner, and deployment operator. Container configuration is a
boundary control, not proof against a malicious host administrator or a kernel
escape.

Every internal service edge uses TLS 1.3 with CA validation, DNS and
SPIFFE-style URI identity, and an exact active-leaf fingerprint. The signed
request envelope remains required above TLS and binds method, path, audience,
timestamp, nonce, caller, and body digest. CA custody, runtime private-key
mounts, clock correctness, and active-peer manifests are therefore security
dependencies.

Production secrets are provisioned before startup. The kernel does not
generate replacement credentials while starting. The data-protection key,
service identities, transport credentials, operator and telemetry tokens, and
provider trust roots are outside source control. The included file provider is
a protocol reference, not a production vault. An authentic pilot must supply a
separately reviewed provider adapter and workload identity.

External telemetry runs in a host-side relay so the kernel can retain deny
egress. The relay has a dedicated read-only credential, accepts only fixed
metric and alert vocabularies, and sends to exact allowlisted HTTPS origins.
That relay, its credential files, DNS/TLS behavior, receiver retention, and
host networking sit outside the kernel container boundary.

Admitted-node discovery, placement reservations, and operator-approved causal
exchange are supported foundations. They do not authorize remote workload
execution, automatic federation, or consensus. Every admitted identity,
discovery statement, schedule, causal bundle, and apply approval remains
signature-, owner-, scope-, expiry-, and replay-bound.

## Assets and security objectives

The primary assets are:

- user and operator identities, tokens, consent, intent, and policy state;
- service, transport, provider, reviewer, and data-protection keys;
- grants and approvals that can authorize effects;
- Grid state, migrations, evidence events, indexes, and encryption metadata;
- backup snapshots, retention receipts, rollback packages, rotation journals,
  and recovery copies;
- capsule, node, schedule, causal-exchange, governance, and import/export
  records;
- release source, lockfiles, container policy, capability claims, SBOM,
  provenance, protected CI results, and promotion evidence;
- telemetry, alerts, incident records, pilot evidence, security findings, and
  review attestations.

The confidentiality objective is to prevent unauthorized disclosure of
secrets, protected Grid data, consent-scoped information, recovery material,
and operational metadata. The integrity objective is to prevent unauthorized
effects, policy weakening, identity substitution, evidence alteration,
rollback manipulation, and false capability or promotion claims. The
availability objective is bounded: authorized local work should fail clearly
and recoverably when a dependency is unavailable, without silently bypassing
authorization or evidence.

Evidence integrity is stricter than ordinary availability. An acknowledged
mutation must not be reported as successful without its Grid evidence. Missing
authorization, identity, policy, encryption, or evidence dependencies fail
closed. Degraded readiness may preserve inspection and recovery, but it does
not grant replacement authority.

## Threat actors and assumptions

The model considers:

- an unauthenticated local or proxied client sending malformed, oversized,
  replayed, or high-volume requests;
- an authenticated principal attempting horizontal/vertical privilege
  escalation, consent misuse, grant replay, or evidence confusion;
- a malicious or compromised capsule, node, provider process, telemetry
  receiver, or causal-exchange peer;
- theft or reuse of an active, retired, or historically exposed credential;
- one compromised service attempting to impersonate another service or exceed
  its declared role;
- a supply-chain contributor attempting to change dependencies, deployment
  inputs, tests, capability claims, or documentation without matching review;
- an evidence producer or reviewer attempting to omit findings, substitute a
  build, alter a signed artifact, reuse an identity, or imply promotion;
- operational mistakes during provisioning, rotation, backup retention,
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

1. Gateway liveness, readiness, authenticated API, intent, operations,
   telemetry, export, import, and administrative routes.
2. Gateway-to-Hypervisor, Hypervisor-to-Sandbox, and service-to-Grid
   authenticated requests.
3. policy, principal, trust-root, transport, provider, and deployment files
   loaded at provisioning or startup;
4. encrypted Grid database, migrations, backups, recovery copies, rotation
   packages, and rollback journals;
5. node admission/renewal, storage offers, discovery, scheduling, quarantine,
   causal bundles, apply approvals, and resolution;
6. telemetry scraping, queued alert delivery, receiver responses, receipts,
   retry, and dead-letter state;
7. import/export bundles and recipient encryption;
8. source checkout, package locks, container build inputs, release verifier,
   capability registry, documentation checker, and CI evidence;
9. pilot policy, dossier, evidence package, independent-review policy, findings
   ledger, remediation records, and exceptions.

No privileged effect may bypass the intent, policy, plan, grant, execution,
evidence sequence. Stopped-runtime recovery is the documented exception to the
online path: it requires separate signed/encrypted artifacts, exact target
binding, Grid exclusion, and post-recovery verification rather than an online
grant.

## Threat analysis

| Threat | Implemented prevention or detection | Residual risk / required external evidence |
|---|---|---|
| Authentication bypass or token theft | Exact bearer principals, scoped telemetry identity, restrictive secret-file checks, signed service envelopes, mTLS peer identity, active-leaf pinning, replay guards | Host memory and external custodian compromise remain possible; pilot custody and token operational monitoring are pending |
| Authorization or consent weakening | Deny-dominant layered policy, explicit risk classification, independent high-risk approval, purpose/scope/subject/controller-bound consent, audience-bound one-use grants | Policy correctness and all high-risk classifications require independent source/configuration review |
| Request replay, substitution, or confused deputy | Method/path/audience/body digest, caller identity, timestamp, nonce, one-use approval and grant state | Clock failure and stolen active keys require deployment alerts, rotation, and incident response |
| Unauthorized Sandbox effect | Fixed built-in operation registry, grant/tool/constraint binding, no ambient supported external adapters, deny egress | This is not arbitrary-code isolation; host/container escape resistance is not externally audited |
| Service impersonation or retired-leaf reuse | TLS 1.3 CA validation plus DNS/URI identity and exact active fingerprint; distinct service keys; signed caller/certificate binding | Pilot CA custody, compromise recovery, and orchestrator mount policy remain external gates |
| Grid data disclosure or tamper | Authenticated encryption, signed hash-linked evidence, schema validation, transaction boundaries, wrong-key/tamper tests | Host root and active data-key compromise remain in the trusted-computing base |
| Backup deletion, rollback substitution, or partial rotation | Signed encrypted snapshots, exact manifests, inventory recheck, recoverable quarantine, Grid locks, atomic journals, rewrap chains, rollback verification | Pilot-owned media policy, external key versioning, escrow, destruction, and operator separation remain pending |
| Provider response injection or secret leakage | Separate pinned Ed25519 signers, digest-pinned adapter, nonce/audience/expiry-bound exact inventories, bounded process I/O, private ephemeral generation, secret scans | Reference file adapter is not vendor custody; real backend authorization, HA, audit retention, and workload identity need review |
| Telemetry exfiltration or receiver abuse | Fixed labels/attributes, exact four-service scrape, dedicated scope, exact HTTPS origins, no redirect, bounded queue/retry, receipts and forbidden-term scans | Host relay can access collected operations data; live receiver custody, DNS/TLS policy, retention, and on-call routing remain external |
| Malicious admitted node or causal peer | Signed owner/key-bound admission, unique active keys, roles/resources/expiry/quarantine, signed bounded discovery, deterministic leases, pinned streams, encrypted queues, independent one-use apply approval | Remote execution is absent; multi-host identity, WAN faults, resource truth, endpoint health, residency, and Sybil resistance are unresolved |
| Import/export forgery or over-disclosure | Signed manifest, stable schemas, content digests, selective scopes, recipient encryption, staged validation | External identity and recipient-key lifecycle adapters are not implemented |
| Release or claim substitution | Exact package/lock/version checks, dependency-free boundary, digest-pinned container input, capability registry, generated status, documentation allowlist, protected CI and CodeQL | GitHub and build-runner compromise remain supply-chain assumptions; immutable release/pilot artifacts still require accountable custody |
| False pilot or security-review evidence | Separately supplied authority keys, exact build/image and artifact digests, distinct reviewer roles, canonical files, raw hashes, exact schemas, recomputed summaries, Ed25519 attestations, explicit non-promotion output | Signatures prove the authorized key signed bytes, not reviewer competence, honest observation, or independence beyond the signed/policy-pinned declaration |

## Required abuse cases

The current review must consider at minimum:

- missing, expired, replayed, wrong-audience, wrong-body, or wrong-peer
  credentials and approvals;
- one valid identity reused for another role, node, provider, reviewer, or
  exception approver;
- policy-layer reordering, omission, unknown fields, numeric boundary errors,
  or a lower layer attempting to expand authority;
- accepted API work whose Grid evidence commit fails;
- oversized bodies, rate pressure, dependency suspension/loss, partial
  startup, stale readiness, and restart races;
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
- a findings ledger with omitted scope, anonymous owners, altered counts,
  unverified critical/high closure, reviewer-approved risk exception, or
  non-expiring exception.

## Security invariants

Independent review should treat these as invariants, not best-effort goals:

1. Missing authorization, evidence integrity, identity, or encryption material
   cannot become success through a fallback.
2. A denial in any applicable policy layer dominates permission.
3. A grant or approval is exact-audience, request-bound, short-lived, and
   single-use.
4. A privileged mutation is acknowledged only with durable linked evidence.
5. A retired or unpinned credential is rejected even if otherwise
   cryptographically valid.
6. Only Grid owns durable runtime state; recovery operates with Grid stopped.
7. Secrets do not enter source, images, signed public evidence, logs, dossier
   details, findings ledgers, or command output.
8. Synthetic drills identify themselves and cannot claim live operation,
   external review, or production promotion.
9. No older source revision, image, release, or archived document can satisfy
   a current-build gate.
10. Critical/high security findings must be closed and independently
    reverified before review intake; lesser accepted risk needs a named owner,
    separate approval, containment, and a bounded unexpired exception.

## Residual risk and non-claims

The repository does not claim defense against a malicious host administrator,
secure arbitrary-code execution, replicated consensus, automatic federation,
remote dispatch, Sybil resistance, externally hosted key custody, live vendor
provider security, audited WAN behavior, post-quantum security, or regulatory
certification.

The repository-owned verifier can prove the internal consistency, signature,
build binding, scope, disposition, and non-promotion behavior of an independent
review package. Its synthetic CI drill does not perform that review. SEC-002
remains pending until an accountable independent organization reviews the
actual pinned source and configuration, signs the authentic findings ledger,
and the ledger passes offline intake.

The threat model must be reassessed when authentication, policy, grants,
Sandbox operations, Grid schemas, encryption, backup/recovery, service
topology, container policy, provider protocol, node/sync behavior, telemetry,
pilot evidence, release gates, or the trusted computing base changes. A prior
ledger cannot approve another build. The
[independent security review procedure](INDEPENDENT-SECURITY-REVIEW.md)
defines the exact current intake contract.
