# AXIOM-MESH Master Todo — Agent Interoperability and Capability Substrate

**Status:** future execution queue; subordinate to current production blockers and `docs/MASTER-TODO.md`

**Adopted for branch review:** 2026-08-09

**Current-build rule:** no item below changes the current `0.12.0-dev.3` capability status until exact registry, schema, implementation, tests, security review, and executable evidence are merged.

## Priority 0 — Protect the current authority boundary

- [ ] Keep `Gateway -> Hypervisor -> Sandbox -> Grid` mandatory for every privileged or externally visible machine-originated effect.
- [ ] Do not introduce an agent-only fast path around authentication, policy, consent, approvals, grants, evidence, or execution bounds.
- [ ] Keep external agent frameworks outside the authority boundary.
- [ ] Require fail-closed behavior when machine identity, policy, adapter, credential, schema, or evidence dependencies are unavailable.
- [ ] Preserve current non-claims for autonomous agents, remote execution, MCP, A2A, and federation.
- [ ] Complete the authentic current-build pilot and independent security review before production promotion of new externally effective surfaces.

## Priority 1 — Legacy agent extraction inventory

- [ ] Inventory `ZovsIronClaw`, `IronAgent`, `claw_academy`, `Context-Poisoning-Detector`, and related agent/skill repositories by path and capability.
- [ ] Mark every meaningful component as `EXTRACT`, `RESEARCH`, `HISTORICAL`, `QUARANTINE`, `SUPERSEDED`, or `VERIFY`.
- [ ] Preserve unique tests, algorithms, manifests, adapters, and negative findings before archive/deletion decisions.
- [ ] Extract skill registry and normalization logic worth retaining.
- [ ] Extract context-integrity/prompt-injection detection as advisory security signals, not authorization.
- [ ] Extract channel-adapter lessons only where an upstream maintained implementation does not remove the need.
- [ ] Extract hardware/resource profile heuristics into scheduling research where evidence supports them.
- [ ] Extract adversarial/Arena testing concepts into reusable conformance fixtures.
- [ ] Record fail-open and ambient-authority patterns as permanent regression threats.
- [ ] Do not carry forward broad production claims that were never evidence-promoted.

## Priority 2 — Machine principal specification

- [ ] Define agent/service/runtime principal identifier schema.
- [ ] Define key issuance, ownership/sponsorship, device/runtime binding, rotation, compromise, and revocation.
- [ ] Distinguish owner, delegator, planner, approver, executor, verifier, remote peer, and adapter identities.
- [ ] Define short-lived versus persistent machine principal semantics.
- [ ] Define purpose and destination restrictions.
- [ ] Define compute, storage, bandwidth, cost, time, and request budgets.
- [ ] Define whether a principal may delegate and maximum delegation depth.
- [ ] Prohibit universal reputation or moral scores as base authority.
- [ ] Add negative tests for identity substitution, key replay, stale identity, and confused ownership.

## Priority 3 — Minimal AXIOM Invocation Envelope

- [ ] Freeze the smallest v1 semantic envelope necessary for one native machine client and one MCP projection.
- [ ] Bind caller principal, intent/idempotency identity, capability ID/version, purpose, policy/grant, destination, budgets, causal parent, and evidence/result identity.
- [ ] Reuse protocol-native fields rather than duplicate them unnecessarily.
- [ ] Define exact canonicalization and digest rules.
- [ ] Define version negotiation and reject ambiguous downgrade.
- [ ] Define which fields are caller claims versus AXIOM-computed facts.
- [ ] Ensure unsupported fields cannot silently broaden authority.
- [ ] Preserve envelope semantics through export, evidence verification, and causal exchange.
- [ ] Add property tests proving transport choice does not alter authorization outcome.

## Priority 4 — Native machine discovery and Verify surface

- [ ] Define a compact capability-discovery response with stable IDs, versions, schemas, status, and declared constraints.
- [ ] Expose discovery only through the existing authenticated Gateway boundary.
- [ ] Separate discoverable/requestable capability from principal-specific authorization.
- [ ] Add machine-readable receipt/evidence verification through AXIOM Verify foundations.
- [ ] Add exact structured errors for unsupported capability, denied scope, expired grant, missing approval, unavailable adapter, budget exhaustion, and evidence uncertainty.
- [ ] Add pagination/bounds so discovery cannot become metadata exfiltration.
- [ ] Prove a low-privilege machine principal cannot infer protected capability or object metadata beyond policy.

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
- [ ] Benchmark MCP projection overhead against native calls.
- [ ] Benchmark async task polling versus bounded event streaming.
- [ ] Measure evidence size with full versus selective retrieval.
- [ ] Measure capability-discovery cache effectiveness.
- [ ] Measure idempotent replay and retry overhead.
- [ ] Measure credential and policy lookup cost without weakening isolation.
- [ ] Set performance targets that cannot override authorization or evidence requirements.

## Priority 15 — Threat model and red-team campaign

- [ ] Malicious runtime principal.
- [ ] Prompt/context/tool-description poisoning.
- [ ] Skill/capsule supply-chain attack.
- [ ] Protocol confusion and alternate-path bypass.
- [ ] Delegation laundering.
- [ ] Credential exfiltration.
- [ ] Remote endpoint substitution.
- [ ] Result/artifact substitution.
- [ ] Replay and duplicate external effect.
- [ ] Hidden sub-agent spawning.
- [ ] Cost/compute/network exhaustion.
- [ ] Cross-agent data leakage.
- [ ] Schema/version downgrade.
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

- [ ] capability registry entry;
- [ ] exact executable assertion binding;
- [ ] normative requirement and schema;
- [ ] positive, negative, adversarial, compatibility, and recovery tests;
- [ ] protocol-version pin and migration policy;
- [ ] threat-model update;
- [ ] credential and privacy review;
- [ ] operations/rotation/revocation/recovery runbook;
- [ ] human explanation for approvals and denials that may require owner action;
- [ ] machine-readable error and receipt contract;
- [ ] bounded authentic pilot evidence;
- [ ] independent security review where externally effective;
- [ ] exact public claims and non-claims.

## Completion rule

No checkbox here promotes an agent capability. A modern external runtime being able to connect to AXIOM is not itself a security or production claim. Promotion occurs only when the capability registry, implementation, exact evidence, applicable reviews, and public claims agree.
