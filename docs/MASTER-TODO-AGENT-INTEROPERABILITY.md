# AXIOM-MESH Master Todo — Agent Interoperability and Capability Substrate

**Status:** active subordinate execution queue; subordinate to current production blockers and `docs/MASTER-TODO.md`

**Adopted:** 2026-08-09

**Current-build rule:** a checked item records work already merged or evidenced in the current development line; unchecked items remain non-claims until exact registry, schema, implementation, tests, security review, and executable evidence agree. Completing a planning checkbox alone never promotes a capability.

## Priority 0 — Protect the current authority boundary

- [x] Keep `Gateway -> Hypervisor -> Sandbox -> Grid` mandatory for every privileged or externally visible machine-originated effect.
- [x] Do not introduce an agent-only fast path around authentication, policy, consent, approvals, grants, evidence, or execution bounds.
- [x] Keep external agent frameworks outside the authority boundary.
- [x] Require fail-closed behavior when machine identity, policy, adapter, credential, schema, or evidence dependencies are unavailable for a supported effect.
- [x] Preserve current non-claims for autonomous agents, remote execution, MCP, A2A, and federation.
- [ ] Complete the authentic current-build pilot and independent security review before production promotion of new externally effective surfaces.

## Priority 1 — Legacy agent extraction inventory

- [x] Inventory implementation-bearing `ZovsIronClaw`, `IronAgent`, `Context-Poisoning-Detector`, and the quarantined `claw_academy` boundary by capability/path sufficiently to make first extraction decisions.
- [x] Mark inspected meaningful components as `EXTRACT`, `RESEARCH`, `HISTORICAL`, `QUARANTINE`, `SUPERSEDED`, or `VERIFY`.
- [x] Preserve unique tests, algorithms, manifests, adapters, and negative findings before archive/deletion decisions in the portfolio audit.
- [x] Extract skill registry and normalization logic worth retaining as an AXIOM Studio design input; do not retain automatic skill installation authority.
- [x] Extract context-integrity/prompt-injection detection as advisory security/test signals, not authorization.
- [x] Extract channel-adapter lessons without making the old gateway a trusted authority layer.
- [x] Extract hardware/resource profile heuristics into scheduling research where evidence supports them.
- [x] Extract adversarial/Arena testing concepts into reusable conformance-fixture requirements.
- [x] Record fail-open, plaintext remote execution, weak proof-of-logic, and ambient-authority patterns as permanent regression threats.
- [x] Do not carry forward broad production claims that were never evidence-promoted.

**Checkpoint:** extraction evidence is recorded in the portfolio canonicalization audit. Repository-level archive/delete decisions remain separate and no legacy repository is deleted by this queue.

## Priority 2 — Machine principal specification

- [x] Define agent/service/runtime principal identifier schema.
- [ ] Complete key issuance, ownership/sponsorship, device/runtime binding, rotation, compromise, and dedicated revocation. Human sponsorship, runtime binding, lifetime and expiry are implemented; dedicated machine revocation/rotation remains open.
- [x] Distinguish human, agent, infrastructure service, and constrained machine-service identities at bearer-registry normalization; future delegator/executor/verifier/remote-peer profiles remain separate later work.
- [x] Define short-lived versus persistent machine principal semantics.
- [x] Define purpose and destination restrictions. Purpose/action ceilings are live; current built-in effect destination is AXIOM-computed as `local` and enforced against the finite principal ceiling; external/provider/MCP destination semantics remain future adapter work.
- [ ] Complete compute, storage, bandwidth, cost, time, request, response, rate, and concurrency budgets. Execution time, authenticated Gateway request size, authenticated Gateway request rate, authenticated Gateway concurrency, and authenticated Gateway response size are live; storage/bandwidth/cost profiles remain future work.
- [x] Define whether a principal may delegate and maximum delegation depth for v1: delegation is disabled and depth is zero.
- [x] Prohibit universal reputation or moral scores as base authority.
- [ ] Complete negative tests for identity substitution, credential replay, stale identity, confused ownership, and compromise. Sponsor, expiry, wildcard/admin, legacy-agent, action/purpose, request-size/rate, and authority-binding negatives are implemented; credential lifecycle attack coverage remains open.

**Implemented checkpoint:** `core.machine-principals` is an implemented registry capability. Its current verified bounds include sponsorship, finite scopes, action/purpose ceilings, runtime identity, expiry, non-delegation, execution time, authenticated Gateway request size, authenticated Gateway request rate, authenticated Gateway concurrency, authenticated Gateway response size, and AXIOM-computed current built-in effect destination constrained to the principal allowlist. It does not claim autonomous agent loops, machine delegation, MCP/A2A, remote execution, external/provider destination semantics, or hardware/runtime attestation.

## Priority 3 — Minimal AXIOM Invocation Envelope

- [ ] Freeze the smallest v1 semantic envelope necessary for one native machine client and one MCP projection. The internal native core is now frozen as `axiom-invocation-envelope.v1` / `axiom-native-gateway.v1`; the first MCP projection remains pending.
- [ ] Bind caller principal, intent/idempotency identity, capability ID/version, purpose, policy/grant, destination, budgets, causal parent, and evidence/result identity. The current native core binds caller, canonical request/input identity, purpose/data scopes, policy/risk/approval requirement, execution timeout, machine sponsor/runtime/authority, live ingress limits, the AXIOM-computed current built-in effect destination, and one invocation digest through Grid acceptance, capability, Sandbox attestation, mutation evidence, and returned result; capability/version projection, external/provider destination semantics, causal parent, and fuller result/artifact semantics remain open.
- [ ] Reuse protocol-native fields rather than duplicate them unnecessarily. No external protocol projection is promoted yet.
- [x] Define exact canonicalization and digest rules for the current native v1 envelope. Data scopes are normalized, exact fields are validated, and policy/machine-authority changes alter the invocation digest.
- [ ] Define version negotiation and reject ambiguous downgrade. The current native implementation pins one exact profile and rejects profile downgrade; cross-version/protocol negotiation remains future adapter work.
- [x] Define which fields are caller claims versus AXIOM-computed facts for the native core: callers submit the normal intent, while Hypervisor computes the authority/limit/evidence envelope from authenticated principal and policy state.
- [x] Ensure unsupported native-v1 envelope fields cannot silently broaden authority; exact-field validation fails closed.
- [ ] Preserve envelope semantics through export, evidence verification, and causal exchange. Grid acceptance, execution/result evidence, and owner-scoped terminal receipt verification are bound now; export/selective artifact verification and causal transport remain open.
- [ ] Add property tests proving transport choice does not alter authorization outcome.

**Implemented native checkpoint:** the native Invocation Envelope is an internal kernel invariant, not a new external protocol or capability-registry promotion. Its digest is bound across `intent.accepted` Grid evidence, the Hypervisor-signed capability, Sandbox-signed execution attestation, mutation evidence where applicable, and returned/completed intent evidence. MCP, A2A, delegation, remote execution, external/provider destination semantics, async task/artifact semantics, and production promotion remain non-claims.

## Priority 4 — Native machine discovery and Verify surface

- [ ] Define a compact capability-discovery response with stable IDs, versions, schemas, status, and declared constraints. The native `axiom-machine-discovery.v1` slice now exposes stable action IDs, risk, approval/confirmation requirements, verified destination, bounded timeout, caller purposes/destinations/budgets, and a digest; per-action versions and input/output schemas remain future work.
- [x] Expose discovery only through the existing authenticated Gateway boundary.
- [x] Separate discoverable/requestable capability from principal-specific authorization: `/v1/machine-discovery` declares `discovery_is_not_authorization`, and actual execution still uses normal intent evaluation.
- [x] Add machine-readable receipt/evidence verification foundations: owner-scoped terminal intent receipts are Grid-attested, digest-only, independently verifiable with the trusted Grid public key, and do not promote the separate AXIOM Verify product.
- [ ] Add exact structured errors for unsupported capability, denied scope, expired grant, missing approval, unavailable adapter, budget exhaustion, and evidence uncertainty.
- [ ] Add pagination/bounds so discovery cannot become metadata exfiltration. Current v1 does not enumerate the global policy; it iterates only the principal's finite action ceiling, but general future pagination/schema bounds remain open.
- [ ] Prove a low-privilege machine principal cannot infer protected capability or object metadata beyond policy. Current E2E coverage proves unrelated actions and bearer material are absent; broader protected-object inference remains open.

**Implemented discovery checkpoint:** constrained machines can request a digest-bound `axiom-machine-discovery.v1` snapshot through the normal Gateway. Hypervisor computes it from the active deny-dominant policy and the authenticated machine profile, omits denied, out-of-scope, unresolved-destination, and out-of-destination-ceiling actions, exposes only merged policy version/digest rather than overlay structure, and never converts discovery into permission.

**Implemented receipt checkpoint:** `core.machine-receipts` promotes only the native verification primitive. A constrained machine can retrieve its own terminal Grid-attested receipt; the receipt binds request and machine-authority digests, accepted/terminal Grid anchors, current chain assurance and terminal outcome digests, omits raw terminal content, and verifies against the trusted Grid public key. Foreign-owned and nonexistent receipt ids are intentionally indistinguishable at the public boundary. AXIOM Verify as a product, remote verification, arbitrary external-effect truth, MCP/A2A, delegation and remote execution remain separate non-claims.

## Priority 4.5 — Sovereign Context Plane

- [x] Define strict `axiom-context-claim.v1` records with owner, semantic slot, canonical value, claim type/cardinality, source reference and digest, observation/validity time, sensitivity, confidence metadata, disclosure boundaries, supersession/contradiction relationships, and mandatory `authority_effect: none`.
- [x] Reuse the encrypted content-addressed memory graph rather than create a parallel context database.
- [x] Compile context writes into the ordinary governed `memory.put` path and context removal into `memory.tombstone`; no context-only effect shortcut exists.
- [x] Re-bind each projected context object to its content address and exactly one owner-authenticated `memory.put` Grid evidence event after full chain verification.
- [x] Make compiled context views deterministic and digest-addressable, with explicit temporal filtering, same-slot supersession, conflict withholding, and no silent eligible-claim truncation.
- [x] Keep existing cross-owner memory consent as an outer disclosure ceiling before claim-level principal/purpose/scope evaluation.
- [x] Expose authenticated read-only `GET /v1/context` through the native Gateway contract without adding a new internal service-network path.
- [x] Derive projection principal/scopes from the authenticated bearer rather than caller query assertions; require explicit purpose and reject caller-provided principal/scope overrides.
- [x] Bind constrained-machine context purpose to the machine principal purpose ceiling and carry the machine authority digest into the projection-authority statement.
- [x] Keep machine wildcard context authority invalid and reduce authenticated operator wildcard authority to the finite consent-visible `context:*` scope universe before compilation.
- [x] Carry the bounded canonical context-authority envelope only in the signed Gateway-to-Grid request target on the existing memory-read route; reject digest/requester mismatch and malformed/oversized envelopes.
- [x] Add unit, Grid-boundary and full-stack tests covering authority derivation, tampering, governed writes, existing memory behavior, consent ceilings, machine purpose denial, and authenticated Gateway projection.
- [x] Expand the current threat model for context authority injection, poisoning, provenance laundering, staleness, conflict masking, hidden-state enumeration, and context-to-authority conversion.
- [ ] Bind any material context `view_digest`/`projection_digest` into the later task/plan/receipt model when context actually shapes a consequential task; do not invent ambient transcript binding.
- [ ] Integrate selected legacy context-poisoning detectors as advisory red-team/security signals without making detector scores authorization.
- [ ] Add external source-authentication adapters only with exact source-specific digest/authenticity rules and privacy review.
- [ ] Add privacy/side-channel tests for repeated cross-owner queries, counts/timing/conflict-shape inference, and future selectors.
- [ ] Benchmark view compilation, finite-scope reduction, payload size and cache behavior without weakening freshness, consent, conflict visibility or evidence verification.
- [ ] Complete independent review and promotion evidence before adding a Sovereign Context Plane capability to the registry.
- [ ] Project context into MCP/A2A only after native context semantics, task binding, privacy review and protocol-parity evidence are stable.

**Implemented branch checkpoint:** the native Sovereign Context slice is exposed as an authenticated read-only Gateway surface and has a governed write compiler, but it is deliberately not a production-promoted registry capability. Source digests prove byte binding rather than universal truth. Semantic truth adjudication, third-party personal-data ingestion, task/plan/receipt context binding, formal hidden-state non-interference, MCP/A2A context projection and autonomous-agent production use remain non-claims.

## Priority 5 — Read-only MCP server laboratory

- [ ] Pin an exact supported MCP protocol profile for the laboratory.
- [ ] Implement the adapter outside the trusted kernel unless a kernel change is demonstrably necessary.
- [ ] Start with read-only/non-consequential capabilities.
- [ ] Map MCP discovery to AXIOM capability discovery without mapping discovery to permission.
- [ ] Map every tool call to a normal Gateway request/intent.
- [ ] Preserve authenticated AXIOM principal identity rather than trusting client-supplied names.
- [ ] Enforce origin/authentication, request size, rate, concurrency, timeout, and response bounds.
- [ ] Reject protocol header/body mismatch and ambiguous routing.
- [ ] Add protocol-parity tests against the native Gateway client.
- [ ] Add prompt/tool-description injection fixtures.
- [ ] Demonstrate that an MCP client cannot reach internal services directly.

## Priority 6 — AXIOM Studio skill/capsule importer

- [ ] Define an inert imported-skill artifact schema.
- [ ] Support one common skill format first; add others only with real interoperability value.
- [ ] Record source URL/repository, upstream version, license, content digest, and import time.
- [ ] Parse declared tools, environment variables, files, commands, network needs, and credentials.
- [ ] Require explicit output/data schemas where practical.
- [ ] Generate an AXIOM capsule candidate manifest with zero authority.
- [ ] Add static scans for secret requests, path traversal, hidden binaries, remote bootstrap, prompt injection, and undeclared effects.
- [ ] Add sandbox conformance tests.
- [ ] Require human/operator review before any permission-bearing activation.
- [ ] Make update diffs visible; never silently replace an activated capsule with upstream changes.

## Priority 7 — Bounded external tool/provider path

- [ ] Select one low-risk external tool/provider for the first real machine adapter.
- [ ] Use dedicated purpose-bound credentials.
- [ ] Allow only declared network destinations.
- [ ] Define exact input/output schemas and size bounds.
- [ ] Define retry/idempotency semantics and prove no duplicate consequential effect.
- [ ] Redact credentials from logs, errors, evidence summaries, and model-visible context.
- [ ] Record provider identity/version where knowable and output integrity metadata.
- [ ] Treat provider output as external evidence/data, not automatically as truth.
- [ ] Add outage, timeout, malformed response, credential failure, and rate-limit negative tests.

## Priority 8 — Asynchronous tasks, artifacts, and event observation

- [ ] Define task identifier and state machine.
- [ ] Define queued, running, awaiting-approval, blocked, completed, failed, cancelled, expired, and uncertain states.
- [ ] Bind every transition to principal, policy, and evidence.
- [ ] Define bounded progress/event streaming.
- [ ] Define artifact identity, digest, MIME/schema, size, source, and retention.
- [ ] Support polling without forcing conversation-history replay.
- [ ] Define resume/reconnect behavior where transport supports it.
- [ ] Define cancellation semantics without falsely claiming rollback after an effect has occurred.
- [ ] Add runaway-loop budget exhaustion tests.

## Priority 9 — Attenuation-only agent delegation

- [ ] Define delegation record schema.
- [ ] Require delegator and delegate identities.
- [ ] Bind permitted capability/action families, purpose, input/data scope, destinations, budgets, assurance floor, approvals, expiry, and revocation.
- [ ] Define maximum delegation depth.
- [ ] Require subdelegation to be a strict subset/equal attenuation of received authority.
- [ ] Reject scope expansion through protocol aliases, tool renames, schema changes, or wrapper agents.
- [ ] Preserve the full delegation chain in receipts without leaking unnecessary private metadata.
- [ ] Add cyclic delegation, stale delegation, revoked parent, and confused-deputy tests.

Current v1 machine principals cannot delegate; this priority is a future capability, not completion of the current denial rule.

## Priority 10 — MCP client adapter laboratory

- [ ] Define external MCP server admission metadata.
- [ ] Strip ambient environment and inject only explicit adapter credentials/settings.
- [ ] Allowlist destinations/transports.
- [ ] Treat server-discovered tools as untrusted dynamic metadata.
- [ ] Detect tool schema or identity changes after admission.
- [ ] Require per-call AXIOM policy evaluation.
- [ ] Run external tools in bounded adapter/capsule contexts where feasible.
- [ ] Add malicious server, credential exfiltration, oversized output, schema substitution, and tool-description poisoning tests.

## Priority 11 — A2A-compatible laboratory

- [ ] Pin an exact supported A2A profile.
- [ ] Parse Agent Cards or equivalent descriptors as claims, never local grants.
- [ ] Separately authenticate/admit remote agent endpoints.
- [ ] Map tasks/messages/artifacts to AXIOM task/context/evidence records.
- [ ] Preserve async/streaming semantics without bypassing policy.
- [ ] Require typed artifact integrity and source identity.
- [ ] Define remote task cancellation and uncertain-result handling.
- [ ] Add endpoint substitution, Agent Card forgery/substitution, result replay, and task hijack tests.
- [ ] Keep remote execution disabled until its own promotion programme passes.

## Priority 12 — Remote execution and multi-node agent work

- [ ] Define authenticated remote executor identity independent of scheduler metadata.
- [ ] Define executable/capsule digest binding.
- [ ] Define remote grant issuance and one-use/replay behavior.
- [ ] Define input custody, encryption, destination, and data-residency rules.
- [ ] Define remote output/evidence verification.
- [ ] Define compromise, partition, timeout, cancellation, and recovery behavior.
- [ ] Require independent verification for consequences that exceed the configured assurance floor.
- [ ] Do not infer trust from node availability or prior successful work alone.
- [ ] Run synthetic and controlled pilot workloads before external production effects.

## Priority 13 — Agent participation in AXIOM Circles

- [ ] Define whether agent principals may be members, service roles, delegates, or tools for each Circle type.
- [ ] Require explicit Circle charter permission for machine participation.
- [ ] Preserve a responsible sponsoring principal/institution where required.
- [ ] Define agent term, role, delegation, suspension, and revocation.
- [ ] Prevent agents from counting as human consent or participation unless the charter explicitly defines a machine role.
- [ ] Keep agent voting/governance power separately reviewable.
- [ ] Provide human-readable records of agent actions and delegations.

## Priority 14 — Communication efficiency benchmarks

- [ ] Establish baseline native Gateway request/receipt sizes and latency.
- [ ] Benchmark native context-view compilation and authenticated payload sizes before protocol projection.
- [ ] Benchmark MCP projection overhead against native calls.
- [ ] Benchmark async task polling versus bounded event streaming.
- [ ] Measure evidence size with full versus selective retrieval.
- [ ] Measure capability-discovery cache effectiveness.
- [ ] Measure idempotent replay and retry overhead.
- [ ] Measure credential and policy lookup cost without weakening isolation.
- [ ] Set performance targets that cannot override authorization, context disclosure, conflict visibility, freshness, or evidence requirements.

## Priority 15 — Threat model and red-team campaign

- [x] Add malicious/constrained-runtime principal, sponsor laundering, legacy-agent shape, action/purpose escalation, approval authority-digest reuse, and runtime-attestation-overclaim cases to the current threat model.
- [ ] Prompt/context/tool-description poisoning. Context-specific authority injection, provenance laundering, staleness, conflict masking and context-to-authority abuse cases are now in the canonical threat model; reusable adversarial detector fixtures remain open.
- [ ] Skill/capsule supply-chain attack.
- [ ] Protocol confusion and alternate-path bypass. Native context projection now proves no new internal service-network path is required; cross-protocol alternate paths remain open.
- [ ] Delegation laundering beyond the current v1 no-delegation denial.
- [ ] Credential exfiltration and dedicated machine-credential lifecycle attacks.
- [ ] Remote endpoint substitution.
- [ ] Result/artifact substitution.
- [ ] Replay and duplicate external effect.
- [ ] Hidden sub-agent spawning.
- [ ] Cost/compute/network exhaustion.
- [ ] Cross-agent data leakage. Native context consent/scope tests cover the first local projection boundary; multi-agent/protocol leakage remains open.
- [ ] Schema/version downgrade. Native Invocation Envelope profile downgrade and unknown-field rejection are implemented; cross-protocol/version migration cases remain open.
- [ ] Adapter compromise and malicious update.
- [ ] Evidence laundering of untrusted remote outputs.

## Priority 16 — Legacy repository disposition

After extraction and verification:

- [ ] decide whether `IronAgent` should be archived, retained as a historical integration lab, or removed under portfolio policy;
- [ ] decide whether `ZovsIronClaw` retains any unique value beyond extracted artifacts and upstream compatibility tests;
- [ ] resolve `claw_academy` credential/provenance blockers before any archive/delete action;
- [ ] reconcile `Context-Poisoning-Detector` with the new security-signal architecture;
- [ ] reconcile `Axiom-Forge` with AXIOM Studio rather than maintaining duplicate tool-generation/product identities;
- [ ] preserve repository pointers and extraction provenance so future audits can trace where ideas/code came from.

## Priority 17 — Required promotion artifacts

For every machine/agent interoperability capability promoted beyond planning:

- [x] capability registry entry for `core.machine-principals`;
- [x] exact executable assertion/evidence binding for the constrained machine-principal slice;
- [x] normative requirement and machine-principal schema/code contract for the current slice;
- [x] positive and negative real-stack tests for sponsor/profile/action/purpose/expiry/non-delegation authority;
- [ ] protocol-version pin and migration policy for the Invocation Envelope/adapters. The current native profile is exactly pinned and downgrade-rejected; migration/cross-protocol policy remains open.
- [x] threat-model update for the current machine-principal slice;
- [ ] dedicated machine credential/revocation privacy review beyond current bearer custody;
- [ ] operations/rotation/revocation/recovery runbook for long-lived machine identities;
- [ ] human explanation for machine approvals and denials that may require owner action;
- [ ] complete machine-readable error and receipt contract for future adapter parity;
- [ ] bounded authentic pilot evidence for externally effective machine surfaces;
- [ ] independent security review where externally effective;
- [x] exact public claims and non-claims for the current constrained machine-principal slice.

For the Sovereign Context Plane specifically, promotion additionally requires:

- [x] strict claim/view/authority schemas and deterministic digests;
- [x] authenticated native Gateway projection with caller principal/scope injection rejected;
- [x] normal intent-path lifecycle compilation rather than a context-only effect route;
- [x] full-chain/content-address/owner-evidence rebinding and consent-ceiling tests;
- [x] canonical threat-model coverage and exact current branch non-claims;
- [ ] task/plan/receipt binding where context materially affects a consequential task;
- [ ] privacy and hidden-state side-channel review;
- [ ] source-authentication semantics for any external ingestion adapter;
- [ ] authentic pilot and independent security review evidence appropriate to the eventual promoted surface;
- [ ] explicit registry addition/promotion only after those gates are executable and evidenced.

## Completion rule

No checkbox here promotes an agent capability by itself. A modern external runtime being able to connect to AXIOM is not itself a security or production claim. Promotion occurs only when the capability registry, implementation, exact evidence, applicable reviews, and public claims agree.
