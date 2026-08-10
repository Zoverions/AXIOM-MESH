# AXIOM-MESH Full-Depth Audit — 2026-08-10

**Date:** 2026-08-10  
**Build:** `0.12.0-dev.3`  
**Scope:** complete supported tree (`mesh/`, `apps/`, `packages/`, `docs/`, CI)  
**Status:** repository-internal audit; **not** an independent security review and
**not** a production-promotion claim

This is an append-only record of a full read of the supported kernel against its
own claims. It does not change the capability registry, does not promote a
capability, and does not satisfy SEC-002. SEC-002 still requires an accountable
external organization to review the pinned source and sign an authentic findings
ledger, as defined in
[the independent security review procedure](../security/INDEPENDENT-SECURITY-REVIEW.md).

## Method and coverage

The audit read every authority-bearing path rather than sampling. Concretely:

- the four service entry points (`gateway/server.mjs`, `hypervisor/server.mjs`,
  `sandbox/server.mjs`, `grid/server.mjs`) and the shared HTTP substrate;
- authentication and authorization: bearer principal registry normalization,
  machine-principal normalization, machine ingress ceilings, signed
  service-request envelopes, capability issuance and verification, and mTLS peer
  binding;
- the policy engine, deny-dominant layer merge, plan construction/validation, and
  the Sandbox built-in effect registry;
- Grid durable state: event append, materialization, protected-column sealing,
  chain and checkpoint verification, export/import, and consent-scoped reads;
- the external-effect path: outbox transitions, the GitHub docs operator, its
  Unix-domain service, and the Hypervisor client;
- the AXIOM One loopback preview server and the versioned Gateway client
  contract;
- supporting libraries for causal sync, node admission and scheduling, transport
  credentials, service network policy, telemetry redaction, and logging;
- both GitHub workflows and the container/compose deployment inputs.

Claims were checked against [`mesh/config/capabilities.json`](../../mesh/config/capabilities.json),
the [current-build threat model](../security/CURRENT-BUILD-THREAT-MODEL.md), and
[`README.md`](../../README.md). Every finding below was reproduced with an
executable proof before it was written down; each fixed finding now has a
regression that fails on the unfixed source.

## Verification baseline

Every repository gate passes on the audited tree:

- `node src/setup.mjs check`, `check-service-network-policy`,
  `check-gateway-client-contract`, `check-axiom-one`, `check-registry`,
  `status`, `check-docs`, and `check-education-contract` all succeed;
- `node src/release.mjs` succeeds over the complete tracked source boundary: two
  zero-dependency lockfiles, 40 policy routes, 10 migrations, and the closed
  documentation allowlist;
- `node --test` runs 345 tests with 344 passing.

The single failing test is environmental, not a defect: see A-7.

## Findings

Severity reflects impact inside the documented single-host trust boundary, where
a malicious host administrator is already outside scope.

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| A-1 | High | Constrained machine-principal expiry was not enforced on the authenticated Gateway surface | Fixed in this change |
| A-2 | Medium | Repository-operator mutual exclusion was bypassable by connection ordering | Fixed in this change |
| A-3 | Medium | Per-source abuse controls collapse into one shared bucket under the documented Unix-socket ingress | Reported; deployment decision required |
| A-4 | Low | Evidence-chain verification detects modification but not tail truncation | Reported; residual property |
| A-5 | Low | `event_id` is the only event-envelope field accepted from the caller unvalidated | Reported; not currently reachable |
| A-6 | Informational | `DataProtector.open` carries an unused plaintext-downgrade parameter | Reported |
| A-7 | Informational | The Node.js engine pin makes one test fail on any other major version | Reported |

### A-1 — Machine-principal expiry was not enforced at Gateway ingress (High)

**Claim under test.** The capability registry marks `core.machine-principals`
`implemented` and states that agent principals are bounded by "finite scopes,
action and purpose ceilings, runtime identity, **expiry**, non-delegation". The
threat model lists "expired session principals" as a required abuse case and
relies on expiry to bound bearer theft: "Bearer theft still conveys the
configured principal until expiry/revocation."

**Actual behavior before the fix.** `expires_at` was validated only by
`normalizeMachinePrincipalDefinition`. That runs in two places: once per process
when `loadApiPrincipals` builds the bearer registry, and again inside the
Hypervisor when it normalizes a submitted intent. Nothing revalidated the
declared lifetime on the Gateway's own request path. A `lifetime: "session"`
principal therefore kept authenticating for the remaining process lifetime on
every Gateway- and Grid-terminated route.

**Reproduction.** A stack was started with an agent principal expiring three
seconds later; after expiry the same bearer token produced:

| Route | Before fix |
|---|---|
| `GET /v1/status` | allowed |
| `GET /v1/events` | allowed |
| `GET /v1/intents/:id` | allowed |
| `GET /v1/machine-receipts/intents/:id/verify` | allowed — a Grid-attested receipt was signed for an expired principal |
| `GET /v1/machine-discovery` | denied (Hypervisor re-normalizes) |
| `POST /v1/intents` | denied (Hypervisor re-normalizes) |

Only the two Hypervisor-terminated routes failed closed. Everything the Gateway
or Grid answered directly — including owner-scoped reads and the signed receipt
route — ignored the declared lifetime entirely.

**Impact.** A stolen or retired session credential retained full read authority,
and the kernel would mint a Grid-signed receipt attributing terminal evidence to
a principal whose authority had lapsed. Expiry could not bound the theft window,
which is precisely the property the threat model depends on.

**Fix.** `MachineIngressGuard.enforce` now revalidates the declared lifetime on
every authenticated request, before any budget is consumed. A non-persistent
lifetime without an expiry, and an unparseable expiry, fail closed as
`machine_authority_invalid` (403); an elapsed expiry fails as
`machine_principal_expired` (401). Because the guard runs inside the bearer
authenticator, this closes the entire authenticated Gateway surface at once
rather than route by route.

**Regression.** `test/machine-ingress.test.mjs` covers the unit boundaries
(before/after expiry, budget dominance, missing and malformed expiry, persistent
lifetimes, and the bearer-authenticator path).
`test/machine-principal-e2e.test.mjs` proves the end-to-end property: after a
real session principal expires, all six routes above return
`machine_principal_expired`.

### A-2 — Repository-operator mutual exclusion was bypassable (Medium)

**Claim under test.** The external-effect service admits one effect at a time and
answers `repository_operator_busy` otherwise. Serialization is the only thing
preventing two prepared GitHub effects from interleaving.

**Actual behavior before the fix.** The `active` flag was checked when a
connection was accepted, but never rechecked when the request actually arrived.
Two peers that connected while the operator was idle both passed the check, and
both then entered `runOperator` when they sent their payloads.

**Reproduction.** Opening two Unix-socket connections before either wrote its
request produced a peak of **2** concurrent `runOperator` invocations and two
success responses; the busy path never fired. The existing test did not catch
this because it opens its second connection only after the first request is
already executing, which is the sequential case the connection-time check does
handle.

**Impact.** Concurrent execution of distinct prepared effects against the same
repository, with `mutation_count` and ambiguous-recovery accounting computed per
run. Deterministic per-effect branches limit the practical blast radius, but the
stated one-at-a-time invariant did not hold.

**Fix.** Mutual exclusion is now claimed where the effect actually starts —
immediately before `active = true` in the data handler — with the
connection-time check retained as a fast path.

**Regression.** `test/repository-operator-service.test.mjs` now opens both
connections while the operator is idle, writes both requests, and asserts exactly
one execution and exactly one `repository_operator_busy` rejection.

### A-3 — Per-source abuse controls collapse under Unix-socket ingress (Medium)

**Not fixed.** The correct remedy is a deployment decision, described below.

The Gateway keys its pre-authentication limiters on
`sha256(req.socket.remoteAddress)`: `ipLimiter` (capacity 60, refill 1/s) for
authenticated routes and `probeLimiter` (capacity 10, refill 1/s) for `/ready`.
The candidate deployment exposes the Gateway through
`AXIOM_GATEWAY_SOCKET=/run/axiom-mesh/gateway.sock`, and
`startLocalIngressBridge` forwards every socket connection to
`127.0.0.1:<gateway port>`. Every request therefore reaches the Gateway with the
same source address, so both limiters degenerate to a single global bucket
shared by all callers.

**Reproduction.** Through the bridge:

- 10 **unauthenticated** `GET /ready` requests exhausted the probe bucket, after
  which the container healthcheck (`src/healthcheck.mjs`, which fetches
  `http://127.0.0.1:<port>/ready`) received **429**. With `retries: 3` at a 10s
  or 30s interval, a sustained ~1 req/s unauthenticated flood keeps the
  production-candidate container permanently unhealthy;
- tenant `alpha` hit `429` on its 61st authenticated request, and tenant
  `bravo`'s **first ever** request was then rejected with `429`.

**Impact.** Any caller that can reach the ingress socket — including one that
never authenticates, since `ipLimiter.take` runs before bearer validation — can
deny service to every other principal and to the orchestrator's own liveness
probe. The threat model's required abuse case "rate pressure" and its
availability objective ("authorized local work should fail clearly and
recoverably") are not met under the documented topology.

**Why this was not fixed here.** Every candidate remedy trades off against
something the maintainers own, and picking one silently would be worse than
reporting it:

1. propagate caller identity across the bridge (for example a PROXY-protocol or
   peer-credential header) and key the limiters on it — most faithful, but adds a
   trusted header the Gateway must then validate;
2. key per connection instead of per address — restores cross-client isolation
   through the bridge, but makes the limit resettable by reconnecting, which
   weakens it for any future non-loopback deployment;
3. keep one global bucket but size and segment it deliberately — give `/ready` a
   budget that external ingress cannot spend, and treat the authenticated bucket
   as a coarse backstop beneath the existing per-principal and per-machine
   ceilings.

Option 3 removes both demonstrated impacts with the least new trust. In all
cases the per-principal limiter (`principalLimiter`) and the machine ingress
ceilings already behave correctly and are unaffected.

**Recommended tracking.** A `P0 - production candidate closure` item alongside
OPS-005, since it is a request-pressure property of the production supervisor.

### A-4 — Chain verification does not detect tail truncation (Low)

`verifyFullChain` walks events from genesis, chains `prev_hash`, and then
requires the computed head and count to equal `meta.last_hash` and
`meta.last_seq`. Deleting a suffix of the log and rewriting those two `meta`
rows to the values of the new final event leaves a fully self-consistent chain.
Checkpoint mode does not add resistance: each checkpoint record is individually
signed, but the history is stored as an ordinary JSON array in `meta`, so the
trailing checkpoints can be dropped together with the events they anchor.

This is the expected property of a hash chain whose only anchor is local, and
the repository does not over-claim it — the threat model keeps host root and
active-key compromise inside the trusted computing base, and the "truncation is
rejected" language in
[the causal-exchange runbook](../operations/ONLINE-CAUSAL-EXCHANGE.md) refers to
the relay state file, not the Grid chain. It is recorded here because the
distinction between *modification-evident* and *deletion-evident* matters to a
reviewer, and because the mechanism that would close it already exists: signed
export manifests carry `continuity.evidence_head`, so any manifest retained
outside the host is an external anchor that a truncated chain cannot satisfy.
Making that comparison an explicit operator procedure would convert an implicit
property into a checkable one.

### A-5 — `event_id` is accepted from the caller unvalidated (Low)

In `appendEvents`, every envelope field is normalized through `normalizeEvent`
except the identifier: `const eventId = raw.event_id ?? newId('evt')`. That value
becomes the row primary key *and* the AEAD protection context for the sealed
payload, but is never checked against the `ID` pattern applied to `actor`,
`subject`, and `trace_id`.

This is not currently reachable. Grid `POST /internal/v1/commit` accepts events
only from the Hypervisor, which constructs them from its own literals and from
Sandbox mutations, and no `mutationFor` branch emits an `event_id`. It is
recorded as a hardening item because the field's validation posture does not
match its role, and any future path that forwards a caller-shaped event would
inherit the gap silently.

### A-6 — Unused plaintext-downgrade parameter (Informational)

`DataProtector.open(serialized, context, { allowPlaintext })` returns the parsed
envelope unauthenticated when `allowPlaintext` is true and the value is not in
`axiom-protected.v1` format. No call site passes it — the only occurrences are
the parameter and its own branch. Removing it would delete a latent
authenticated-encryption bypass from the class surface.

### A-7 — Engine pin makes one test environment-dependent (Informational)

`mesh/package.json` pins `node >=24.14.0 <25`, and `validateSourceSetupState`
enforces that range at runtime. On any other major version, `setup installer
executes only fixed lock installs and optional fixed verification commands`
fails with `Node.js <version> is outside 24.14.0 <= version < 25.0.0`. This is
the pin working as designed, and CI uses the supported `24.18.0`. It is recorded
so that a reviewer who reproduces the suite on a different runtime recognizes
the failure as environmental rather than as a kernel defect.

## What held up under review

The following were examined specifically for weaknesses and found sound. They
are listed so a later reviewer knows they were covered rather than skipped.

- **Signed service envelopes.** Method, path, audience, interface version,
  caller, timestamp, nonce, and body digest are all bound; the key identifier is
  recomputed from the trusted key rather than trusted from the header, and digest
  comparisons use `timingSafeEqual`.
- **Grant binding.** The Sandbox independently rechecks intent digest, plan
  digest, policy digest, subject, single-use replay state, and — for machine
  intents — recomputes the effect destination from the authorized tool instead of
  trusting the claim.
- **Deny-dominant policy merge.** Overlays cannot replace a tool or effect,
  cannot widen constraints, cannot add unsupported allow fields, and the merged
  result is re-validated in full. High-risk allow rules without independent
  approval fail validation.
- **Prototype-key handling.** Policy actions, machine actions, and constraint
  merges use own-property semantics and reject `Object.prototype` names.
- **mTLS peer binding.** `assertTransportPeer` requires an authorized socket, an
  exact active-leaf fingerprint from the manifest, the expected CN, and the
  matching SPIFFE URI SAN. The peer CN only selects which pinned fingerprint to
  compare against.
- **Export and import.** Manifest signature, signer key identifier, byte count,
  bundle digest, canonical-JSONL record encoding, record count, recipient
  encryption metadata, and continuity head are all checked before any record is
  accepted.
- **Causal sync.** Per-update and per-bundle Ed25519 statements, owner and
  source-node binding, key-digest pinning, value digests, strictly increasing
  source counters, duplicate rejection, and bounded sizes.
- **Log redaction.** `redactForLog` masks a broad sensitive-key pattern, bounds
  depth, array length, and string length, and reduces `Error` values to name and
  code.
- **Subprocess use.** Every `spawn`/`execFileSync` call passes an argument array
  with no shell; there is no `eval` or `new Function` anywhere in the tree.
- **AXIOM One preview.** Static assets come from a fixed map with no traversal,
  the proxy admits only contract routes and declared query parameters, and the
  browser boundary requires same-origin `Origin` and `Sec-Fetch-Site`.

## Non-claims

This audit was performed by the repository's own tooling and reading, not by an
independent organization. It does not establish reviewer independence, does not
close SEC-002, does not promote any capability, and does not assert that the
tree is free of defects outside the paths listed under *Method and coverage*.
Fixed findings are proven by regressions that fail on the unfixed source; the
reported-only findings carry no fix and no exception approval.
