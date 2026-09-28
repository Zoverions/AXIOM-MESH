# Ambient Teammate Policy v0

**Status:** inert architecture/laboratory contract only  
**Tracking:** #1896  
**Authority:** none; this layer cannot grant data access, tool use, communication authority, execution authority, delegation, or runtime activation.

## Purpose

AXIOM needs a first-class way to decide **whether an agent should participate** without confusing that decision with **whether the agent is authorized to act**.

The immediate design trigger is Supermemory's open-sourced Company Brain harness. Its useful architectural ideas are narrower than the product itself:

- semantic triage can estimate usefulness, confidence, urgency, noise, interruption cost, investigation value, and reaction fit;
- deterministic policy can map those observations into answer, investigate, acknowledge, or pass;
- proactivity modes can be threshold packages rather than prompt-only personalities;
- investigation can end silently when no useful intervention exists;
- active work can accept steering instead of spawning competing turns;
- durable semantic memory should remain distinct from current transactional state;
- progressive tool disclosure can reduce context and selection noise;
- approval can suspend and resume the same causal task.

AXIOM does **not** adopt the Slack/Cloudflare topology, the source thresholds as calibrated truth, or any implication that model judgment creates permission.

## Governing separation

```text
semantic observation
        |
        v
participation policy
        |
        v
ANSWER | INVESTIGATE | ACKNOWLEDGE | PASS
        |
        v
knowledge / task handling only

protected effect
        |
        v
Gateway -> Hypervisor -> Sandbox -> Grid
```

Participation is cognition and interaction policy. Authority remains a separate deterministic boundary.

## Contracts in this slice

### Participation Observation v0

`axiom-participation-observation.v0` binds one event and context to seven bounded semantic dimensions:

- usefulness;
- answer confidence;
- urgency;
- noise;
- interruption cost;
- investigation value;
- acknowledgement fit.

Each dimension is an ordinal `0..100` value or explicit `null`. The durable contract labels these values `uncalibrated-ordinal-0-100`; they must not be presented as correctness probabilities unless separate calibration evidence supports that interpretation.

The observation stores only state/event digests and bounded evidence references. It does not carry raw private context.

TypeSafe/System One is a natural provider for these narrow typed judgments because its Choice/Score/Noul primitives return typed decisions and distributions while application code retains control. AXIOM's existing bounded-decision evidence layer remains the preferred place to preserve provider/model provenance and probability distributions. The participation observation is a derived policy input, not a replacement probability contract and not privileged to one vendor.

### Participation Policy v0

`axiom-participation-policy.v0` makes proactivity inspectable as machine-readable policy:

- passive participation on/off;
- reactions on/off;
- silent investigation on/off;
- explicit-message handling;
- context scope mode (`all-eligible` or exact context allowlist);
- allowed context classes;
- quiet-context exceptions;
- consequence ceiling for unsolicited participation;
- reply/investigate/acknowledge thresholds;
- noise/interruption ceilings;
- cooldown window and unsolicited-intervention count.

Policy currentness is evaluated against the event's canonical `evaluated_at`; the policy `issued_at` must not be later than that evaluation point, and any `expires_at` must still be current. Observation `observed_at` must likewise not be in the future relative to the event being evaluated.

The built-in `listener`, `investigator`, `balanced`, and `teammate` presets are **illustrative, unvalidated laboratory defaults**. Their numbers are not safety or quality claims. A later evaluation programme may replace them with locally calibrated policy, but calibration still cannot mint authority.

### Deterministic participation evaluator

The pure evaluator uses observation + policy + current event state. For passive participation it fails closed when:

- passive participation is disabled;
- the participation policy is not yet effective or has expired;
- the context is quiet, outside the allowed class set, or outside an exact context allowlist;
- the event exceeds the autonomous consequence ceiling;
- cooldown state is blocked or unavailable;
- the semantic observation is stale/unknown or claims to come from after the current evaluation time;
- a human has already answered;
- noise/interruption evidence needed for unsolicited speech is unknown;
- event/context bindings do not match the observation.

Explicit supported requests can still enter normal answer handling when the semantic evaluator is unavailable, stale, from the future, mismatched to the current event/context, or paired with a not-yet-effective/expired proactivity policy. In those cases the semantic/policy advice is bypassed rather than allowed to suppress the explicit user request, and the fallback decision carries `null` observation/policy digests so unusable semantic evidence is not misrepresented as the basis for the answer. Passive proactivity never fails open because a semantic provider or policy-currentness check failed.

### Participation Decision v0

`axiom-participation-decision.v0` is the closed evidence record emitted by the deterministic evaluator. It binds the chosen `ANSWER | INVESTIGATE | ACKNOWLEDGE | PASS` action, bounded reason codes, the exact participation-observation and policy digests when they were usable, and its own self-digest.

The decision has hard-zero authority, data-scope, communication, execution, and runtime effects. A fallback decision that intentionally bypasses stale, mismatched, or unavailable semantic evidence records both observation and policy digests as `null` rather than laundering unusable evidence into the decision basis.

A participation decision is therefore evidence about **what the interaction policy recommended**. It is not a send authorization, tool grant, disclosure grant, task mutation, or execution permit.

### Cooldown Evidence v0

Policy carries a cooldown window and maximum unsolicited-intervention count, but live code must not trust a caller-supplied `ready` flag.

`axiom-participation-cooldown-evidence.v0` binds:

- exact participation-policy digest;
- exact context;
- bounded time window ending exactly at the evaluation instant;
- observed unsolicited-intervention count;
- policy maximum;
- history digest and at least one evidence reference;
- deterministic `ready | blocked` state.

`assessParticipationCooldown` fails to `unavailable` when the evidence is malformed or does not bind the current policy, context, evaluation time, window length, or intervention limit. The evidence-backed evaluation wrapper then feeds only that derived state into the participation evaluator. Missing or invalid cooldown evidence therefore cannot make passive proactivity fail open.

This remains an offline composition contract. It does not define the eventual durable history store or grant communication authority.

### Active Task Steering v0

`axiom-active-task-steering.v0` records one evidence-only decision:

- `IGNORE` — unrelated/no change;
- `APPEND` — add context to the same task;
- `REPLACE` — supersede the task revision;
- `STOP` — request cancellation.

The record binds the previous task digest, new event digest, actor principal, semantic observation, and current authority-snapshot reference. It does **not** modify that authority snapshot. APPEND/REPLACE may change task knowledge/intent only; any newly required authority must go through normal AXIOM authorization separately.

This composes `axiom-task-lifecycle.v0` from #1823 rather than creating another task system.

Before a future task harness consumes steering, `verifyActiveTaskSteeringBinding` must bind the record to the exact predecessor and, for `APPEND` / `REPLACE`, the exact successor `axiom-task-lifecycle.v0` state. The verifier rejects task, outcome, principal, authority-snapshot, budget, digest, or temporal drift. `STOP` and `IGNORE` remain evidence-only requests and cannot carry a successor task state.

This verifier still does not execute the transition. Cancellation, replacement, or any consequential follow-on remains subject to the normal task/currentness and AXIOM authority paths.

The v0 binding accepts only self-steering by the task's current principal. That is a deliberate fail-closed limitation, not a claim that collaborative steering must always be single-principal. A later Circle/team surface may allow a different actor only after an existing AXIOM authority/delegation mechanism can prove that actor's current steering authority for the exact task and decision; the steering record itself will not mint that relationship.

### Silent Investigation Result v0

`axiom-silent-investigation-result.v0` makes silence an explicit terminal evidence state. It can record bounded evidence, work counts, useful/actionable findings, unresolved unknowns, and the reason no message was emitted.

A silent result is not a hidden failure and is not proof that no relevant fact exists outside the searched evidence universe.

## Memory boundary

This design composes #1138 rather than weakening it:

- retrieval does not raise memory authority;
- private/narrow context does not become broadly disclosable because it was useful;
- a participation policy never expands the set of memory a task may read;
- a model-produced suggestion to remember, repeat, or retransmit something remains data unless a separate local authority transition permits that use.

Do **not** add a parallel Context/Memory Read Envelope. AXIOM already has the canonical `axiom-context-request.v1` -> purpose/consent/policy -> `axiom-vault-access-lease.v1` -> minimized Context Capsule architecture. Ambient participation should consume that boundary when private context is needed: the participation layer may express or carry a semantic need, but it cannot select a source vault, mint a lease, widen a disclosure projection, or convert local read access into effect authority.

## Tool disclosure

Progressive disclosure is a cognition/context optimization only.

Making a tool schema visible, enabling a tool family in a prompt, discovering a plugin, or successfully invoking an unprotected helper does not grant protected execution authority. Consequential tool effects still require the normal AXIOM path.

## Approval and resume

If an admitted task pauses for approval, a future live harness must checkpoint the exact task/plan/effect revision. Resume must revalidate current principal, policy, revocation, budget, task revision, and exact effect arguments. Approval for revision `N` cannot silently authorize revision `N+1`.

This extends the existing task-resume/currentness work rather than replacing it.

## Relationship to existing programmes

| Existing work | Relationship |
| --- | --- |
| #1822 Agent-OS leapfrog | participation becomes a policy layer over outcome/task lifecycle |
| #1823 Outcome + Task Lifecycle | steering composes the existing task contract |
| #1600 Behavioral Assurance | participation scores remain bounded behavioral evidence, not authority |
| #1597 Knowledge -> Operation -> Authority | semantic participation decisions remain upstream of authority |
| #1138 Semantic contagion / memory authority | scoped memory cannot become instruction authority |
| Sovereign Vault / Context Request architecture | private context is requested and minimized through the existing request/lease/capsule boundary, not a new ambient-memory path |
| #1422 Subagent communication/delegation | messages and steering are not implicit delegation |
| #1575 Watch integration | external harness finding is converted into executable falsification targets |

## Falsification properties

The implementation must preserve at least these properties:

1. high semantic usefulness with missing authority cannot execute a protected effect;
2. tool visibility cannot create authority;
3. private-context evidence cannot leak into broader output without disclosure authority;
4. stale or repeated memory cannot raise authority;
5. quiet/passive-disabled contexts stay silent;
6. no useful finding may terminate silently;
7. steering cannot widen an effect envelope or delegate implicitly;
8. an authorized STOP can flow into task cancellation, after which queued effects must fail currentness checks;
9. stale approval after task replacement is rejected by the existing approval/currentness boundary;
10. semantic evaluator failure is conservative for passive participation;
11. a preset change alters participation policy only, not consent, capability, or data scope;
12. same text in different contexts is re-evaluated against the actual context boundary.

## Non-claims

This slice does not provide a live proactive agent, Slack/Discord integration, automatic reactions, new provider access, memory sharing, autonomous external investigation, public messaging, task execution, a durable cooldown-history store, production policy, or calibrated participation thresholds.

It is a network-free, zero-authority contract/evaluator layer intended to make later ambient behavior inspectable and falsifiable before any live interaction surface is enabled.
