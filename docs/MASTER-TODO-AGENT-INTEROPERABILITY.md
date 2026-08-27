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
- [ ] Preserve Collective Authority Non-Amplification across every future multi-agent surface: communication, consensus, assignment, discovery, receipts, causal state, and shared artifacts may carry information or evidence but never mint or widen authority.
- [x] Require the PHASEONE emergent-coordination campaign before promoting machine delegation, remote execution, broad remote-agent federation, or live machine-agent authority in Circles. The promotion gate is now explicit in the current threat model, security invariants, interoperability queue, and Circle/plural-authority planning; passing the campaign itself remains capability-specific future evidence.
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

## Priority 5 — Read-only MCP server laboratory

- [x] Freeze candidate Agent Runtime Adapter contract v1 as an exact schema,
  semantic version, and SHA-256 without changing capability status.
- [x] Protect a synthetic reference adapter drill in the required `verify` job;
  it covers 28 fail-closed cases and emits commit-bound workflow evidence while
  loading no external runtime and performing no external effect.
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

- [x] Require passing PHASEONE emergent-coordination evidence before any delegation capability is promoted beyond the current depth-zero denial rule. The promotion gate is implemented; delegation itself remains disabled and no PHASEONE completion claim is implied.
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

- [x] Require passing PHASEONE emergent-coordination evidence before remote execution or multi-node agent work is promoted. The gate is implemented; no remote-execution capability or campaign-completion claim is made.
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

- [x] Require passing PHASEONE emergent-coordination evidence before machine-agent Circle authority or machine-to-machine delegation is promoted; ordinary human/local Circle development is not blocked by this gate. The gate is implemented; machine-agent Circle authority remains unpromoted.
- [ ] Define whether agent principals may be members, service roles, delegates, or tools for each Circle type.
- [ ] Require explicit Circle charter permission for machine participation.
- [ ] Preserve a responsible sponsoring principal/institution where required.
- [ ] Define agent term, role, delegation, suspension, and revocation.
- [ ] Prevent agents from counting as human consent or participation unless the charter explicitly defines a machine role.
- [ ] Keep agent voting/governance power separately reviewable.
- [ ] Keep Circle votes, assignments, charter decisions, and shared state as governance evidence for local evaluation; they do not directly mint Sandbox authority.
- [ ] Provide human-readable records of agent actions and delegations.

## Priority 14 — Communication efficiency benchmarks

- [ ] Establish baseline native Gateway request/receipt sizes and latency.
- [ ] Benchmark MCP projection overhead against native calls.
- [ ] Benchmark async task polling versus bounded event streaming.
- [ ] Measure evidence size with full versus selective retrieval.
- [ ] Measure capability-discovery cache effectiveness.
- [ ] Measure idempotent replay and retry overhead.
- [ ] Measure credential and policy lookup cost without weakening isolation.
- [ ] Set performance targets that cannot override authorization or evidence requirements.

## Priority 15 — Threat model and red-team campaign

- [x] Add malicious/constrained-runtime principal, sponsor laundering, legacy-agent shape, action/purpose escalation, approval authority-digest reuse, and runtime-attestation-overclaim cases to the current threat model.
- [ ] PHASEONE peer-language authority injection: `GO`, `APPROVED`, `OWNER`, `VETO`, `STOP`, forged sponsor/role identifiers, copied approvals, copied receipts, and copied discovery output must remain non-authorizing. Current-v1 peer-language, forged role/sponsor, receipt/discovery, unsupported delegation/sub-agent, and causal fake-approval cases are proven; an exact valid copied-approval cross-principal fixture remains to close this item without inference.
- [ ] PHASEONE distributed-denial bypass: multiple valid principals must not pool action, purpose, data-scope, destination, expiry, approval, or assurance authority to obtain an effect denied to the actual executor. Current-v1 real-stack coverage proves action/purpose pooling denial; data-scope, destination, expiry, approval, and assurance pooling remain explicit gaps.
- [ ] PHASEONE receipt/artifact laundering: a peer's valid receipt, discovery response, causal record, export, error, or artifact metadata must not become executable authority. Valid receipt/discovery and signed causal-state laundering are covered in current v1; export, error, and general artifact-metadata laundering remain open.
- [x] PHASEONE causal-sync authority confusion for the current causal-exchange path: admitted remote state cannot become a local grant, approval, sponsor, principal registration, or executable instruction. Signed authority-like state maps only to fixed local `sync.apply` / `online-causal-exchange`, and the apply path uses only a separately supplied local approval while retaining remote authority-like material as payload data.
- [x] PHASEONE current-build shared-resource communication-edge inventory with exact negative-test binding for every currently promoted cross-principal surface. `axiom-emergent-coordination-surfaces.v1` inventories the active shared surfaces and the fail-closed verifier requires `non-authorizing-input` plus an exact protected test binding; future promoted surfaces must be added before they can be treated as covered.
- [ ] PHASEONE aggregate exhaustion: coordinated identities must not trivially bypass sponsor/task-domain resource controls by distributing attempts. A non-authorizing sponsor + task-domain request/concurrency laboratory is merged and canonical sponsor tampering is denied; production `MachineIngressGuard` remains principal-local and aggregate compute/cost/bandwidth/storage/external-target accounting is not complete.
- [ ] PHASEONE safe-exit persistence: impossible, blocked, unsafe, or budget-exhausted work must terminate without automatic scope widening, sponsor substitution, undeclared destination access, or new-principal creation. Current v1 proves blocked action/purpose escalation preserves discovery/authority and child principals remain unauthorized, and rate/request-size/concurrency exhaustion recovers only through configured refill/release paths; impossible/unsafe future async task states and runaway-loop persistence remain open.
- [ ] Prompt/context/tool-description poisoning.
- [ ] Skill/capsule supply-chain attack.
- [ ] Protocol confusion and alternate-path bypass.
- [ ] Delegation laundering beyond the current v1 no-delegation denial.
- [ ] Credential exfiltration and dedicated machine-credential lifecycle attacks.
- [ ] Remote endpoint substitution.
- [ ] Result/artifact substitution.
- [ ] Replay and duplicate external effect.
- [ ] Hidden sub-agent spawning.
- [ ] Cost/compute/network exhaustion.
- [ ] Cross-agent data leakage.
- [ ] Schema/version downgrade. Native Invocation Envelope profile downgrade and unknown-field rejection are implemented; cross-protocol/version migration cases remain open.
- [ ] Adapter compromise and malicious update.
- [ ] Evidence laundering of untrusted remote outputs.

**PHASEONE current-v1 evidence checkpoint:** #1324 established the invariant, promotion gates, eight-surface inventory/verifier, and baseline peer/distributed/artifact negative proofs; #1325 added the non-authorizing aggregate-risk laboratory and signed causal authority-like-state proof; #1326 proved blocked escalation does not mutate machine authority or create child authority; #1327 proved principal-local rate/request-size/concurrency budget safe exit; #1329 proved the causal apply path imports no peer approval authority. These are security/evidence advances only and do not promote delegation, remote execution, broad agent federation, autonomous swarms, or machine-agent Circle authority.

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
- [ ] PHASEONE emergent-coordination campaign evidence when the promoted capability introduces machine delegation, remote execution, broad agent federation, machine-agent Circle authority, or another cross-principal coordination surface.
- [ ] protocol-version pin and migration policy for the Invocation Envelope/adapters. The current native profile is exactly pinned and downgrade-rejected; migration/cross-protocol policy remains open.
- [x] candidate Agent Runtime Adapter v1 schema, digest lock, signed synthetic
  grant boundary, negative tests, and commit-bound CI artifact; external-runtime
  conformance and production promotion remain open.
- [x] threat-model update for the current machine-principal slice;
- [ ] dedicated machine credential/revocation privacy review beyond current bearer custody;
- [ ] operations/rotation/revocation/recovery runbook for long-lived machine identities;
- [ ] human explanation for machine approvals and denials that may require owner action;
- [ ] complete machine-readable error and receipt contract for future adapter parity;
- [ ] bounded authentic pilot evidence for externally effective machine surfaces;
- [ ] independent security review where externally effective;
- [x] exact public claims and non-claims for the current constrained machine-principal slice.

## Completion rule

No checkbox here promotes an agent capability by itself. A modern external runtime being able to connect to AXIOM is not itself a security or production claim. Promotion occurs only when the capability registry, implementation, exact evidence, applicable reviews, and public claims agree.