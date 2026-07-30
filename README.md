<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.12.0-dev.0; digest=58b9fb3086613cc41559240ab389cbc2e87ef0f51456c3c70453e1ae5a97f124 -->
# AXIOM-MESH

<img src="logo.png" alt="AXIOM-MESH logo" width="150" align="right">

AXIOM-MESH is a local-first capability network: it turns a human or agent
intent into a policy-authorized plan, executes each approved effect inside a
bounded runtime, and emits portable cryptographically linked evidence.

## First 5 Minutes

Requirements: Node.js `>=24.14.0 <25` and npm `>=11.0.0 <12`. The supported
pin is Node.js `24.18.0`. From a clean terminal:

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git
cd AXIOM-MESH
npm run doctor
npm run setup
npm run dev
```

A successful start prints `"message": "AXIOM-MESH ready"`, the local Gateway
endpoint, and the next command. In a second terminal:

```bash
npm run axiom -- status
npm run axiom -- intent system.echo '{"message":"hello"}'
```

Use `npm run axiom -- --help` to discover commands and append `--json` when
you need the complete machine-readable response. The documented local command
uses the checked-out source directly; it does not ask `npx` to resolve a
similarly named registry package.

Docker is **not required** for this local development path. On Windows, use a
short checkout path and PowerShell or a terminal that preserves the JSON quotes
shown above. Run `npm run doctor` first when diagnosing Node, npm, lock, or port
problems.

## Choose Your Path

| Level | Goal | Minimum command path |
|---|---|---|
| **Local Play** | Start the kernel and submit one intent | `npm run doctor` → `npm run setup` → `npm run dev` → `npm run axiom -- status` |
| **Verify** | Re-run source, test, documentation, and release gates | `npm run check` → `npm run release:verify` |
| **Operator / Pilot** | Exercise recovery, resilience, transport, evidence, and promotion controls | Use the bounded drills below and their linked runbooks |

You do not need to understand or run every production drill to evaluate the
local intent path.

**Current status:** `0.12.0-dev.0`, the supported development build on `main`.
It is not production-promoted and no live deployment is claimed. The last
published production-candidate release is immutable `v0.11.0`; current build
notes are maintained in
[`docs/releases/0.12.0-dev.0.md`](docs/releases/0.12.0-dev.0.md).

## Supported runtime

The supported implementation is [`mesh/`](mesh/README.md). It keeps the
original four responsibilities as distinct processes:

| Service | Authority |
|---|---|
| Gateway | Public authentication, validation, abuse controls, and user/operator API |
| Hypervisor | Intent normalization, policy decision, explicit plan, and short-lived grant issuance |
| Sandbox | Grant-bound deterministic execution with no arbitrary code or ambient network authority |
| Grid | Transactional state, signed hash-linked evidence, registries, consent, and export |

Every privileged mutation follows:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Grid is currently a **single-node transparency log**, not BFT consensus.
Blockchain settlement, bridges, tokens, arbitrary containers, external AI,
messaging, health, education, government, finance, and embodied systems are
disabled or adapter-required until their controls and evidence exist.

## Verification and operator drills

The first-run path above uses the same fail-closed source setup used by the
verification boundary. The setup command disables install lifecycle scripts,
verifies that both committed locks remain unchanged, runs the clean-kernel and
release gates, and does not create production credentials.

Use `npm run setup:check` for a read-only prerequisite and drift check or
`npm run setup:install` for exact lock installation without the full suite. See
the [automated source setup boundary](docs/operations/AUTOMATED-SOURCE-SETUP.md).

After source changes, rerun:

```bash
npm run check
npm run release:verify
npm run axiom -- audit
```

Run the production recovery exercise against an explicitly empty disposable
workspace:

```bash
npm run recovery:drill -- /tmp/axiom-recovery-drill
```

The command writes signed, secret-free JSON evidence to standard output. It
provisions isolated production credentials, exercises encrypted backup,
tamper and unsafe-restore rejection, exact-digest restore, rollback
preservation, evidence-chain verification, and measured recovery time. Never
point it at a live or non-empty directory.

Exercise signed retention planning, recoverable retirement, and restoration of
a retained backup in another empty disposable workspace:

```bash
npm run backup-lifecycle:drill -- /tmp/axiom-backup-lifecycle-drill
```

The protected workflow also runs this drill every Monday and retains
commit-bound signed evidence for 90 days. That recurring disposable-runner
proof is not a claim about pilot-owned media or external key custody.

Run the controlled production SLO baseline in a different empty disposable
workspace:

```bash
npm run slo:drill -- /tmp/axiom-slo-drill
```

That drill starts the real four-process production supervisor, exercises 40
authenticated low-risk intents at concurrency 4, measures latency, error rate,
throughput, process CPU and memory, performs a graceful full-stack restart,
verifies a post-restart intent, and emits signed, secret-free JSON evidence.
Concurrent real-stack drills retain separate aligned four-port leases through
their complete runtime and restart windows, preventing parallel bind races.
It is a short host-mode baseline, not a 30-day availability claim or a
substitute for measurement on pilot hardware.

Exercise bounded request pressure and real dependency process loss on Linux:

```bash
npm run resilience:drill -- /tmp/axiom-resilience-drill
```

The drill rejects an oversized authenticated request without reserving its
idempotency key, proves bounded rate limiting under a concurrent burst,
suspends and kills the real Sandbox process, verifies dependency-aware
degradation and supervisor failure, restarts the full stack, and emits signed,
secret-free evidence. It covers request-path pressure and dependency loss, not
cgroup OOM/CPU enforcement or pilot-platform behavior.

Exercise mutually authenticated transport rotation and rollback:

```bash
npm run transport:drill -- /tmp/axiom-transport-drill
```

The real production supervisor uses TLS 1.3 on every internal edge, validates
CA signatures, DNS and SPIFFE-style URI identities, and exact active leaf
fingerprints, then retains the signed one-use request envelope above TLS. The
drill rotates all leaves offline, rejects a retired CA-valid leaf, proves the
new generation, restores the prior generation exactly, and signs secret-free
evidence. External CA custody and multi-host rollout remain pilot work.

Exercise the independently restartable four-unit topology:

```bash
npm run service-units:drill -- /tmp/axiom-service-unit-drill
```

The drill projects exactly one application private key and one TLS leaf per
unit, starts Gateway, Grid, Hypervisor, and Sandbox without the supervisor,
kills Sandbox, proves the other three processes survive while readiness
degrades to `503`, restarts Sandbox alone, and verifies preserved Grid state.
Protected CI separately repeats the failure against
[`mesh/compose.units.yml`](mesh/compose.units.yml) and proves its internal
network cannot reach a public TCP target. See the
[independent-service runbook](docs/operations/INDEPENDENT-SERVICE-UNITS.md).

Exercise signed admitted-node discovery and deterministic scheduling:

```bash
npm run node-scheduling:drill -- /tmp/axiom-node-scheduling-drill
```

The drill admits signed v2 nodes, rejects a copied signing identity and
resource exhaustion, selects replicas across owners and failure domains,
degrades a reservation after quarantine, expires a missed-renewal node, and
proves restart persistence. This is authenticated placement reservation, not
remote workload execution or multi-host federation. See the
[discovery and scheduling runbook](docs/operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md).

Exercise operator-approved bidirectional causal exchange:

```bash
npm run online-sync:drill -- /tmp/axiom-online-causal-sync-drill
```

The drill starts two real production supervisors, injects a two-direction
transport partition, stages node-signed bundles in encrypted ordered state,
requires an independent destination approval for every apply, exposes
concurrent heads on both Grids, converges through explicit complete
resolution, and absorbs duplicate replay before approval. It does not claim
replicated Grid consensus or arbitrary federation. See the
[online causal exchange runbook](docs/operations/ONLINE-CAUSAL-EXCHANGE.md).

Exercise signed deployment-independent provider startup:

```bash
npm run provider:drill -- /tmp/axiom-provider-conformance
```

The drill starts the real four-service supervisor from independent
Ed25519-signed secret and policy providers, rotates both resource classes
across restart, proves retired-token rejection and policy activation, removes
the private per-start generations, and rejects an invalid provider signer
before service startup. The included file adapter is a protocol reference, not
evidence for a vendor vault or cloud custody backend. See the
[provider runbook](docs/operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md).

Verify a separately reviewed pilot evidence package without granting
production status:

```bash
npm run pilot:dossier:verify -- \
  pilot-dossier.json \
  pilot-review-policy.json \
  pilot-policy-authority-public.pem
```

Use that command only for metadata preflight. Authentic intake verifies the
complete offline package:

```bash
npm run pilot:package:verify -- \
  pilot-evidence-package \
  pilot-policy-authority-public.pem
```

The authority-signed policy pins one source revision and image digest, current
30-day/SLO/recovery requirements, and five distinct reviewer keys. The package
must contain exactly the canonical policy, dossier, and 13 local
evidence-specific v2 envelopes. Each envelope is secret-free, hash-bound to
the dossier, signed by its policy-assigned reviewer role, and checked against
an exact type-specific detail contract. Stale, cross-build, incomplete,
structurally meaningless, altered, noncanonical, unexpected, or symlinked
input fails closed. A valid result is accepted only for a separate promotion
review and always reports `production_promoted: false`. Protected CI exercises
both pilot verifiers with synthetic inputs that explicitly do not claim a live
pilot. See the
[pilot deployment dossier runbook](docs/operations/PILOT-DEPLOYMENT-DOSSIER.md).

Verify an independently produced current-build security findings ledger:

```bash
npm run security-review:verify -- \
  findings.json \
  review-policy.json \
  review-policy-authority-public.pem
```

The separately supplied policy-authority key authenticates one current source
revision, image digest, exact threat-model/configuration scope, eight reviewed
artifact digests, an independent reviewer, and a distinct exception approver.
The signed ledger must have owned findings and recomputed counts.
Critical/high findings require closed remediation reverified by the reviewer;
only medium/low findings may use separately signed, contained, expiring
exceptions. Success is intake for a later promotion review and always reports
`production_promoted: false`. Protected CI exercises only synthetic verifier
conformance and explicitly states that it did not perform an independent
review. See the [current threat model](docs/security/CURRENT-BUILD-THREAT-MODEL.md)
and [review intake runbook](docs/security/INDEPENDENT-SECURITY-REVIEW.md).

Exercise the host-side external telemetry and alert path on Linux:

```bash
npm run telemetry-relay:drill -- /tmp/axiom-telemetry-relay-drill
```

The drill keeps the kernel deny-egress, scrapes its Unix socket with a
dedicated `telemetry:collect` credential, converts 68 fixed points to
OTLP/HTTP JSON, routes bounded Alertmanager v2 alerts, forces transient 503
and 429 responses, verifies retry and receipts, and signs secret-free
evidence. Production destinations remain exact-origin HTTPS and require
pilot-owned receivers. See the
[external telemetry and alerting runbook](docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md).

Run the coordinated service and API credential lifecycle drill in another
empty disposable workspace:

```bash
npm run credential-rotation:drill -- /tmp/axiom-credential-rotation-drill
```

It boots the real stack before rotation, with four rotated Ed25519 identities
and new operator and telemetry-relay tokens, and again after authenticated rollback. The drill
proves active credentials work, inactive service identities and API tokens
fail, historical Grid evidence remains valid through a dual-signed key
transition, and the original set is restored exactly. It does not rotate the
data-protection key or prove external revocation of historic credentials.

The immutable pre-clean-room archive also has a keyed, secret-free credential
inventory and revocation ledger:

```bash
npm run credential-history:audit
```

This operator/CI command requires the external 32-byte
`AXIOM_CREDENTIAL_AUDIT_KEY`. It rescans every reachable deprecated object,
requires exact coverage of 32 conservative credential candidates, and rejects
reuse in the supported tip. Protected CI retains signed evidence. All 32 are
revoked from repository trust; external provider or prior-deployment
attestations remain required and are not claimed by this check. See the
[credential-history revocation record](docs/security/CREDENTIAL-HISTORY-REVOCATION.md).

Exercise the separate data-protection-key lifecycle in another empty
workspace:

```bash
npm run data-key-rotation:drill -- /tmp/axiom-data-key-rotation-drill
```

This drill boots the real stack, rotates and re-encrypts the live Grid,
encrypted backups, retained credential packages, and recovery database copies,
proves the retired key fails, restores a backup under the new key, rolls back
without losing later evidence, and proves the rolled-back key then fails. Its
signed JSON contains outcomes and digests, never key material.

## Canonical documentation

- [Technical white paper](docs/whitepapers_and_research/WHITEPAPER.md)
- [Current project status](docs/PROJECT-STATUS-2026.md)
- [Production-grade definition](docs/PRODUCTION-GRADE.md)
- [Production readiness tracker](docs/PRODUCTION-READINESS-TRACKER.md)
- [Active execution queue](docs/MASTER-TODO.md)
- [Phased roadmap](docs/ROADMAP.md)
- [Documentation authority and index](docs/README.md)
- [Security policy](SECURITY.md)

When documents conflict, the executable
[`mesh/config/capabilities.json`](mesh/config/capabilities.json) registry and
the governing rebuild requirements control. Historical documents are research
or traceability inputs unless a current capability and its evidence say
otherwise.

The candidate production package is
[`mesh/compose.production.yml`](mesh/compose.production.yml), with its
provisioning and verification runbook in
[`mesh/PRODUCTION.md`](mesh/PRODUCTION.md). It runs the four responsibilities
as independent supervised processes in one hardened container. Internal
plaintext traffic remains loopback-only, the container uses
`network_mode: "none"`, and explicit host-local Gateway access crosses a
bind-mounted Unix-domain socket rather than a published port. Startup and
protected CI fail if effective deny-egress is absent. See the
[candidate network boundary](docs/security/DENY-EGRESS-BOUNDARY.md).

The alternate single-host
[`mesh/compose.units.yml`](mesh/compose.units.yml) runs the same four services
as independently restartable containers with per-unit private credentials,
Grid-only durable state, and a Docker internal network. It preserves the same
Unix-domain Gateway ingress and makes no multi-host or automatic-failover
claim.

The machine-readable
[`mesh/config/capabilities.json`](mesh/config/capabilities.json) file is the
source of truth for runnable claims. Only entries marked `implemented` are
advertised as runnable. Other entries are explicitly `experimental`,
`adapter_required`, `specified`, or `disabled`.

The generated [capability status](docs/rebuild/STATUS.md), Constitution, and
governing rebuild documents must match that registry's schema, kernel version,
and digest. The verifier checks implemented-feature evidence, migration
checksums, the exact setup policy and both dependency-free locks, rollback
coverage, governing-document claim markers, and that only the clean-kernel
workflow is active.

The authenticated operator API and command-line client are implemented. The
historical browser dashboards are not a supported control surface; a new
dashboard remains specified until it has the same authorization, negative-path,
and release evidence as the API.

## Rebuild documents

- [`docs/rebuild/PRODUCT-DEFINITION.md`](docs/rebuild/PRODUCT-DEFINITION.md) —
  reconciled product definition extracted from the complete iterative corpus.
- [`docs/rebuild/REQUIREMENTS.md`](docs/rebuild/REQUIREMENTS.md) — normative
  security, functionality, portability, governance, and operations
  requirements.
- [`docs/rebuild/SOURCE-TRACEABILITY.md`](docs/rebuild/SOURCE-TRACEABILITY.md) —
  current requirements-to-code and requirements-to-evidence mapping.
- [`docs/rebuild/ROLLBACK.md`](docs/rebuild/ROLLBACK.md) — supported kernel
  rollback procedure.

Every file under `docs/` on `main` is part of the enforced current-build
documentation boundary. Superseded generated APIs, installers, research,
audits, and implementation narratives exist only on the locked
`deprecated/pre-0.12-documentation-corpus` branch and cannot override current
code, the capability registry, or release evidence.

## Security

- Only Gateway is intended for public exposure; internal services bind to
  loopback.
- Service calls use Ed25519 signatures, body digests, audience binding,
  timestamps, and one-use nonces.
- Execution grants are signed, short-lived, single-use, and bound to the
  principal, intent, plan, policy, tool, and Sandbox audience.
- Runtime policy layers are deny-dominant, internal interface versions are
  signed, and high-risk effects require a one-use approval from an independent
  authenticated principal.
- Durable JSON is authenticated-encrypted at rest; the supported kernel also
  includes consent-scoped content-addressed memory and local balanced
  double-entry accounting without enabling token or chain settlement.
- Signed exports can be staged, deterministically diffed, and independently
  approved into an isolated foreign-provenance store; imports cannot overwrite
  native state or impersonate locally signed evidence.
- Canonical exports support time, type, object, and capsule selection. Optional
  X25519 recipient encryption keeps bundle records opaque to transport and
  storage while retaining a signed, independently verifiable manifest.
- Encrypted signed Grid snapshots support exact-digest offline restore,
  tamper detection, preservation of the replaced database, and signed recovery
  evidence on restart.
- Signed, policy-derived retention plans verify every encrypted backup before
  selection, require a stopped and unchanged inventory to apply, retain a
  configured minimum, and atomically move excess media into recoverable
  quarantine. A recurring drill restores a retained snapshot and emits signed
  evidence; permanent media destruction remains an external approval.
- Offline credential rotation replaces all four service identities, coordinated
  trust records, the operator API token, and the least-privilege telemetry
  relay token; dual-signed Grid key lineage keeps
  historical evidence verifiable, and an authenticated-encrypted package
  supports exact rollback without retaining retired private keys.
- The host-side relay preserves kernel deny-egress, admits only an exact
  four-service Unix-socket scrape, emits 68 fixed OTLP points, and sends a
  bounded alert vocabulary through exact-origin HTTPS with alert-reserved
  queues, exponential retry, stable idempotency, redaction, and delivery audit.
- The deprecated-history audit records keyed HMAC identifiers for 32
  credential candidates, requires their revocation from supported repository
  trust, and fails protected CI if the ledger drifts or a candidate returns to
  the supported tip. Provider and former-deployment attestations remain
  separate promotion evidence.
- Offline data-key rotation re-encrypts the live Grid and every supported
  recovery context, chains signed ciphertext/plaintext transitions to original
  manifests, switches the key last, and supports journaled interruption
  recovery plus state-preserving rollback.
- Independent service-unit projection gives each runtime only its own
  application and TLS private keys. Signed host evidence and protected
  four-container checks prove Sandbox-only loss, dependency-aware degradation,
  survivor continuity, state preservation, and Sandbox-only recovery.
- Owner-bound admitted nodes can exchange independently verifiable signed
  causal-update bundles. Version vectors preserve concurrent heads, replays and
  node-counter equivocation fail closed, and conflict resolution must name
  every current head. Separately, signed v2 node metadata supports
  authenticated discovery and deterministic capacity-aware placement leases
  with owner/domain constraints, expiry, and quarantine degradation. A
  two-Grid relay can verify pinned Grid event evidence, stage encrypted ordered
  bundles, preserve destination independent approval, recover from partition,
  and absorb duplicates without silently choosing a conflict winner. No remote
  execution, replicated Grid consensus, or arbitrary federation is claimed.
- Local governance now drives live but authority-reducing policy overlays
  through human voting, finalization, timelock, independently approved
  activation, verification, rollback, expiring emergency review, and appeal.
- Capsule manifests are immutable, content-addressed, signed, versioned, and
  include constraints, schemas, provenance, and an SBOM digest.
- Economic, chain, bridge, autonomous research, and embodied effects fail
  closed.
- Production startup rejects local credential bootstrap and non-loopback
  plaintext internal transport.
- Production may instead start from independent, digest-pinned secret and
  policy providers using nonce-bound short-lived signed responses, an exact
  validated resource inventory, and one private generation removed at
  shutdown. Vendor custody adapters still require pilot evidence.
- The production container uses a digest-pinned Node.js base, a non-root user,
  read-only root filesystem, dropped capabilities, explicit resource ceilings,
  mounted secrets, and readiness-based health checks. Its source policy is
  verified by protected image-build and composed-runtime checks.
- The signed provider protocol does not claim that any vendor vault, cloud
  secret manager, HSM/KMS, workload identity, live-refresh path, or
  high-availability custody deployment has been independently validated.
- The candidate container has no attached Docker network and preserves only
  explicit Unix-domain Gateway ingress. Production startup rejects every
  non-loopback or default route, and protected CI proves a runner-reachable
  public TCP target is unreachable from the container in signed evidence.
- Authenticated bounded-cardinality operations and OpenMetrics surfaces cover
  all four services without placing principals, prompts, payloads, tokens, or
  object identifiers in metric labels.
- Deterministic incident severity, independent command roles,
  authority-reducing containment, evidence-first chronology, bounded
  communications, and closure conditions are machine-readable. Protected CI
  signs an automated tabletop bound to eleven same-revision control artifacts,
  including request-pressure, dependency-loss, transport-lifecycle, and
  node-scheduling, online causal partition/rejoin, and provider fail-closed
  evidence;
  a facilitated named-roster pilot exercise remains required.
- Pilot evidence intake uses a separately distributed policy-authority key,
  five distinct role signatures, an exact build and image, 30-day
  measurements, custody receipts, and exactly 13 canonical, role-signed local
  v2 evidence envelopes with type-specific detail contracts. Passing intake
  does not promote production.

Report vulnerabilities using [`.github/SECURITY.md`](.github/SECURITY.md).

## Archived material

Unsupported legacy code and superseded documentation are absent from `main`.
The pre-0.12 documentation corpus is preserved on the locked, read-only
`deprecated/pre-0.12-documentation-corpus` branch. The divergent pre-clean-room
implementation is preserved by the immutable
`archive/legacy-main-pre-clean-room-2026-05-21` tag. Neither archive is a
supported runtime, deployment target, or product claim.
