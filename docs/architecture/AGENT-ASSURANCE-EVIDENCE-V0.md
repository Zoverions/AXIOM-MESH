# Agent Assurance Evidence v0

## Status

Bounded evidence contract. This slice is deliberately non-authoritative.

It does not add a capability, enable machine delegation, execute evaluator code,
mutate Grid state, change policy, authorize an action, certify a model, or turn
identity/reputation into authority.

## Purpose

The contract joins five assurance concerns without creating a second authority
engine:

1. keep persistent agent identity separate from the authority principal, model,
   and individual run;
2. compare declared runtime capability with observed runtime capability before
   downstream trust is placed in a run;
3. expose monitor coverage, blocks, escalations, and review latency as evidence
   instead of treating a low block rate as proof of safety;
4. describe evaluator bundles as isolated, read-only, offline artifacts with no
   authority; and
5. preserve a mission/task graph for cross-run and multi-actor provenance while
   keeping delegation observational-only.

Any future authority decision must still pass through the existing AXIOM
principal, policy, consent, grant, approval, execution, and evidence path.

## Identity separation

`agent_id`, `principal_id`, `model_id`, and `run_id` represent different facts.

- `agent_id` is a persistent participation/continuity reference.
- `principal_id` identifies the current authority-bearing machine principal.
- `authority_digest` records the claimed normalized authority-profile digest.
  v0 does not resolve that claim against the live principal registry.
- `model_id` records the model implementation used for the run.
- `run_id` identifies one execution/run instance.

`agent_id`, `model_id`, and `run_id` must not collapse into one identifier. A
stable agent identity does not cause a replacement model or run to inherit
permissions. Likewise, an agent identity or reputation record does not mint an
AXIOM principal or capability. A supplied `authority_digest` is evidence data,
not proof of a current authority binding until a later integration verifies it
against the existing principal path.

## Declared versus observed environment

The evidence records both a declaration and an observation across:

- egress class (`none`, `loopback`, or `allowlist`);
- network destination references;
- writable path references;
- secret references; and
- tool references.

Observation may be narrower than declaration. If observation is broader, the
assessment emits a hard non-conformance finding. This is evidence only: the v0
contract does not start, stop, sandbox, or authorize a workload.

## Oversight telemetry

The contract records:

- total actions;
- monitored actions;
- blocked actions;
- escalated actions;
- p50 review latency; and
- p95 review latency.

Monitor coverage is derived in basis points. Incomplete coverage remains an
explicit finding. These metrics describe observation quality; they do not prove
that a monitor is correct or independent.

## Evaluator bundle

A v0 evaluator descriptor is intentionally narrow:

- `execution_mode = isolated-readonly`;
- `network = none`; and
- `authority = none`.

The contract stores evaluator and artifact digests but does not execute those
artifacts. A future evaluator runner requires its own isolated execution and
supply-chain threat model before promotion.

## Mission graph

The mission graph records one rooted task tree/graph with actor references,
objective digests, parent relationships, and statuses. It rejects missing
parents, duplicate task IDs, self-parenting, cycles, multiple roots, active
`delegation_mode`, or any non-zero `authority_effect`.

This graph is provenance about work decomposition. It is not a delegation
credential. Current machine-principal v1 non-delegation remains unchanged.

## Signed envelope

`sealAgentAssuranceEvidence` accepts an existing AXIOM-compatible signer and
binds the normalized evidence digest into an attested statement.
`verifySealedAgentAssuranceEvidence` requires a caller-supplied signature
verifier so this module does not create another cryptographic trust root.

Both sealed and verified outputs explicitly carry:

- `authority_effect: none`; and
- `authorizes_execution: false` (on the assessment/verification result).

## Next bounded integrations

After this contract survives repository review and full CI, follow-on work can
remain incremental:

1. bind a real machine-principal authority digest and runtime observation into
   the envelope at run start/end;
2. emit the oversight counters from the existing observability path;
3. feed environment non-conformance into the existing policy/approval path as
   a deny-only signal;
4. add an isolated evaluator-bundle runner without network or authority; and
5. attach mission-graph provenance to existing receipts without enabling
   machine delegation.

None of those steps should promote `research.autonomy`, remote execution, or
machine delegation merely because assurance evidence exists.
