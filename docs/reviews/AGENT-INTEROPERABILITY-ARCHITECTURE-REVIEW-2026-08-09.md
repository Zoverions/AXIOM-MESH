# Agent Interoperability Architecture Review — 2026-08-09

**Review type:** architecture, security boundary, interoperability, legacy-agent extraction, and claims review

**Scope:** external agent runtimes, machine principals, MCP/A2A compatibility, skills and capsules, agent delegation, credentials, remote tasks, machine-facing products, and legacy OpenClaw/GCA/IronAgent concepts

**Reviewed against:** current AXIOM-MESH `0.12.0-dev.3` mandatory authority path, capability registry, provider boundary, node discovery/scheduling, causal exchange, capability evidence binding, adaptive assurance/plural-authority architecture, and current non-claims

## Executive finding

The portfolio should **not** maintain a competing general-purpose agent runtime as an AXIOM core responsibility.

The strongest architecture is to treat external and local agent runtimes as rapidly evolving clients of a stable AXIOM authority/evidence substrate. AXIOM should provide secure capability discovery, machine principals, bounded delegation, protocol translation, capsule/tool execution, credential isolation, asynchronous task semantics, and independently verifiable receipts while leaving model loops, personalities, chat channels, general skills UX, and framework-specific orchestration to specialized agent projects.

This direction preserves what is valuable from the older agent experiments without inheriting their maintenance burden or weaker authority models.

**Decision:** accept `docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md` as a long-horizon architectural constraint. Do not change current capability status or claim MCP, A2A, remote execution, agent delegation, or production agent interoperability.

## Load-bearing architectural decision

> **Protocol compatibility does not grant authority. Agent runtimes are principals and planners; AXIOM remains the authority, execution, and evidence boundary.**

Every privileged or externally visible effect continues through:

```text
Gateway -> Hypervisor -> scoped grant -> Sandbox -> Grid
```

An MCP tool declaration, A2A Agent Card, plugin manifest, skill file, model recommendation, framework permission setting, or remote-agent claim cannot replace this path.

## Review of the legacy agent portfolio

The older agent work contains useful mechanisms but should not be treated as a coherent supported stack.

### IronAgent

Useful extraction candidates:

- agent/tool interception patterns;
- skills-registry normalization;
- gateway/channel bridging ideas;
- action-risk classification;
- adversarial testing;
- context-integrity checks;
- multi-runtime integration lessons.

Critical lesson:

A previously identified execution path defaulted to approval when its ethics evaluators were unavailable. That design inversion demonstrates why an advisory agent ethics layer must not be the final authority boundary. A separate draft remediation exists, but the larger architectural answer is to avoid making IronAgent the canonical security substrate.

**Provisional disposition:** extract reusable mechanisms and tests; retain as provenance until extraction is complete; likely archive rather than continue as the main agent runtime.

### ZovsIronClaw / OpenClaw-derived work

Useful extraction candidates:

- channel adapters;
- tool/skill catalog concepts;
- hardware/resource profiles;
- local-model routing;
- multi-agent orchestration experiments;
- adversarial "Arena" concepts;
- packaging/desktop lessons.

Risks:

- maintaining a large fork of a fast-moving upstream runtime creates permanent divergence cost;
- direct host CLI access and framework-level autonomy conflict with AXIOM's bounded execution model;
- ethical/vector scoring is not a substitute for explicit authority and evidence;
- broad runtime claims were never promoted through the current AXIOM evidence process.

**Provisional disposition:** mine unique work; prefer compatibility with maintained upstream ecosystems rather than maintaining a competing fork.

### claw_academy

This repository carries separate credential-history and provenance concerns from earlier portfolio review. It must remain quarantined until those controls and unique-content extraction are completed.

**Provisional disposition:** no automatic migration or deletion. Extract only after dedicated security/provenance review; archive/delete decision later under portfolio policy.

## Review of modern agent-framework capabilities

Modern agent ecosystems increasingly provide their own:

- skill/package systems;
- MCP integrations;
- tool discovery;
- communication channels;
- persistent memory;
- scheduled workflows;
- coding/tool execution;
- multi-agent or sub-agent patterns;
- sandbox options.

Those are valuable compatibility targets but poor candidates for duplication inside AXIOM. Their rate of change is likely to remain much higher than a trust substrate should tolerate.

The correct architectural response is **interoperability tests and adapters**, not another fork.

## Review of MCP compatibility

MCP is a strong first compatibility target because it provides a standardized tool/resource/prompt interface and common transports.

Accepted direction:

- implement adapters outside the trusted zero-dependency kernel where practical;
- expose only policy-selected capabilities;
- translate every consequential call into a normal AXIOM intent;
- retain exact caller/principal identity and protocol metadata;
- apply rate, size, timeout, cost, egress, credential, and destination bounds before execution;
- preserve structured protocol errors without hiding AXIOM denials;
- treat server/tool metadata as untrusted discovery input;
- prove native-Gateway and MCP requests receive equivalent authority decisions for equivalent principals/actions.

Rejected shortcut:

`tools/list` must never become an implicit permission list.

## Review of A2A compatibility

A2A-style agent discovery and task exchange maps well onto later AXIOM multi-node and remote-task goals, but it sits later in the sequence than local MCP compatibility.

Accepted direction:

- use Agent Cards or equivalent as discovery claims only;
- separately authenticate remote peers;
- map remote tasks to AXIOM intents and explicit task/context IDs;
- preserve asynchronous status and typed artifacts;
- attach remote results to source identity, integrity metadata, and assurance limitations;
- prohibit remote agents from asserting local grants;
- require explicit recognition profiles before cross-domain authority or data access.

Remote communication is not remote execution authority.

## Review of the AXIOM Invocation Envelope

A common protocol-neutral semantic envelope is a useful novel contribution if it remains compact and implementation-driven.

Strengths:

- one authority model across native Gateway, MCP, A2A, and future protocols;
- stable audit/evidence semantics despite external protocol churn;
- exact delegation, budget, purpose, capability, destination, and assurance binding;
- easier protocol-parity testing;
- credentials can remain outside model context;
- enables asynchronous machine workflows without requiring full conversation transcripts.

Risks:

- creating an over-general schema before real adapter experience;
- duplicating fields already safely carried by a protocol;
- version-negotiation ambiguity;
- envelope fields being treated as trusted merely because they are present;
- interoperability becoming a new route around Gateway policy.

Required control:

Start with the smallest envelope needed for one read-only MCP adapter and one bounded machine principal. Add fields only when executable use cases require them.

## Review of machine principals and delegation

First-class machine principals are justified. Reusing human identities or long-lived generic API tokens would make provenance and revocation weaker.

Required properties:

- cryptographically attributable runtime/service identity;
- explicit sponsor/owner/domain relationship where applicable;
- least-authority grants;
- expiry/revocation;
- purpose and destination restriction;
- resource/cost/network budgets;
- no privilege increase through subdelegation;
- distinct proposal, approval, execution, and verification identities;
- no universal reputation score.

Delegation should be attenuation-only by default. Any authority expansion must originate from a principal that already possesses and is permitted to grant that authority.

## Review of skills and capsules

The portfolio should retain the portability and progressive-disclosure benefits of modern skill systems but convert them into inert, reviewable AXIOM artifacts.

AXIOM Studio is the appropriate product boundary for:

- importers;
- format normalization;
- immutable source digests;
- permission manifests;
- credential/environment requirements;
- destination and egress declarations;
- static/adversarial scans;
- sandbox conformance tests;
- output schemas;
- upstream provenance/version tracking;
- package publication.

A successful import proves parse/conformance only. It grants no runtime authority.

## Review of ethics and policy

The older "moral kernel" and GCA concepts should be reframed.

Potentially useful:

- action-risk heuristics;
- irreversibility analysis;
- contextual anomaly signals;
- adversarial evaluators;
- alternative ethical-policy research capsules;
- explanation aids.

Not acceptable as sole authority:

- model/vector-derived moral scores;
- opaque aggregate "goodness" values;
- fail-open fallback;
- a self-modifying ethics layer able to broaden its own permissions.

AXIOM policy should remain explicit, versioned, deny-dominant, evidence-bound, and independently reviewable. Ethical evaluators can raise risk, request review, or provide advisory evidence; they cannot silently lower mandatory protections.

## Security review priorities before implementation

1. machine-principal key provisioning, rotation, compromise, and revocation;
2. protocol confusion and alternate-path authorization parity;
3. prompt/tool/skill metadata injection;
4. credential isolation and redaction;
5. delegation amplification and confused deputy;
6. remote endpoint substitution;
7. replay/idempotency across asynchronous tasks;
8. runaway resource/cost loops;
9. result/artifact provenance and substitution;
10. adapter supply-chain integrity;
11. external protocol version downgrade;
12. privacy leakage through discovery metadata and agent descriptions.

## Recommended implementation order

1. preserve current pilot and production-candidate gates;
2. machine-principal specification;
3. minimal invocation-envelope specification;
4. native read-only machine discovery and Verify surface;
5. read-only/local MCP adapter;
6. protocol-parity and negative tests;
7. inert skill-to-capsule importer in AXIOM Studio;
8. one bounded external tool adapter with isolated credentials;
9. asynchronous task/result/receipt contract;
10. attenuation-only delegation;
11. laboratory A2A adapter;
12. authenticated remote execution only after remote evidence and recovery are mature;
13. Circle participation by agent principals after Circle governance exists.

## Claims decision

No current AXIOM-MESH claim changes because of this review.

Specifically, this review does not claim:

- supported MCP or A2A compatibility;
- autonomous-agent production capability;
- a production machine-principal system;
- remote agent execution;
- safe third-party skill execution;
- agent federation;
- production agent delegation;
- a completed security review of external agent frameworks.

## Final assessment

The strongest path is not to resurrect the old agent stack. It is to **extract its useful mechanics and turn AXIOM into the authority/evidence substrate that modern and future agent stacks can use without being trusted with ambient power**.

This is strategically aligned with the existing AXIOM architecture: explicit authority, bounded execution, portable evidence, protocol-independent verification, and truthful claims. It also turns the rapidly changing external agent ecosystem from a maintenance liability into a compatibility opportunity.
