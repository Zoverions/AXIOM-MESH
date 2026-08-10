# Agent Interoperability and Capability Substrate

**Status:** approved candidate architecture for review; not an implemented capability claim

**Adopted for branch review:** 2026-08-09

**Applies to:** AXIOM-MESH machine clients, future agent principals, capsules, provider/tool adapters, remote execution, AXIOM Studio, AXIOM Verify, and external agent-framework interoperability

**Current-build boundary:** AXIOM-MESH `0.12.0-dev.3` does not currently claim a supported autonomous-agent runtime, MCP server/client, A2A endpoint, remote task execution, or production agent-to-agent federation. The machine-readable capability registry remains authoritative.

## Purpose

AXIOM-MESH should not become another general-purpose agent framework. Agent runtimes evolve quickly and already compete on model loops, memory, channel integrations, tool discovery, skills, coding workflows, and user experience. Reimplementing that layer would create churn and duplicate work without strengthening AXIOM's core advantage.

AXIOM's distinctive role should instead be the **trusted capability and communication substrate underneath agents**.

External agents, local agents, service agents, human interfaces, scheduled workers, and future embodied systems should be able to use the same governed capability fabric without receiving ambient authority merely because they can plan, reason, call a tool, load a skill, or speak a supported protocol.

The architectural rule is:

> **Agents may propose. AXIOM authorizes. Sandboxes execute. Grid records. Verify checks. Protocol compatibility never imports authority.**

This creates a protocol-neutral trust membrane between rapidly changing agent ecosystems and slower-moving authority, security, evidence, and governance infrastructure.

## 1. Agent runtimes are clients, not authorities

An agent runtime may provide:

- model inference and reasoning loops;
- memory retrieval and summarization;
- skills or procedural knowledge;
- tool discovery;
- channel integrations;
- multi-agent planning and delegation;
- scheduling and background workflows;
- user-facing conversation surfaces.

None of those functions inherently authorizes an external effect.

A conforming AXIOM integration treats the runtime as one or more authenticated principals that must use the same mandatory path as any other caller:

```text
agent/runtime/client
  -> Gateway
  -> Hypervisor policy + authority evaluation
  -> explicit plan / approvals where required
  -> short-lived scoped grant
  -> Sandbox bounded execution
  -> Grid state + evidence
  -> machine-readable result / receipt
```

No plugin, skill file, prompt, model output, agent reputation score, remote Agent Card, MCP tool declaration, or framework-specific permission setting may bypass that path.

## 2. Protocol-neutral core, standard-compatible edges

AXIOM should avoid inventing a new transport when a standard protocol can carry the request safely. Protocols are edge adapters; AXIOM semantics remain the authority layer.

Initial compatibility targets should include:

### 2.1 MCP edge adapters

A future **MCP server adapter** may expose a policy-selected subset of AXIOM capabilities to compatible clients. Discovery exposes what may be requested, not what will be authorized for a particular principal.

A future **MCP client adapter** may let an AXIOM-governed workflow invoke external MCP tools. External tools remain untrusted effectors. Credentials, destinations, environment variables, filesystem access, cost, network access, and output handling remain explicitly bounded by AXIOM policy and capsule/adapter contracts.

The adapter must not translate `tools/list` into blanket permission. Every consequential tool invocation becomes an AXIOM intent.

### 2.2 A2A edge adapter

A future A2A-compatible adapter may support agent discovery, task exchange, asynchronous status, streaming, artifacts, and remote collaboration.

An Agent Card or equivalent descriptor is treated as a **claim about an agent**, not proof of identity, trust, competence, or authorization. Signed metadata may improve attribution but cannot grant local authority.

Remote tasks entering AXIOM become intents. Remote task outputs become typed artifacts/evidence with source identity, protocol context, integrity metadata, and declared assurance. Remote agents cannot self-assert local grants.

### 2.3 Native Gateway client

The existing versioned Gateway client remains the lowest-friction native machine interface for callers that do not need an external compatibility protocol. MCP and A2A adapters should project onto the same underlying capability semantics rather than create parallel authority systems.

## 3. AXIOM Invocation Envelope

Protocol messages should bind to a common semantic envelope. This envelope is not a replacement transport. It is the information AXIOM requires to authorize, execute, and evidence a machine-originated request regardless of whether it arrived through the native Gateway contract, MCP, A2A, a local adapter, or a future protocol.

Candidate fields include:

```text
schema_version
protocol_profile
caller_principal
runtime_instance_id
owner_or_delegator
 delegation_chain
intent_id
idempotency_key
causal_parent_ids
conversation_or_task_context
capability_id
capability_version_or_digest
purpose
input_schema_digest
data_classification
consent_scope
policy_digest
requested_assurance
required_approvals
grant_id
expires_at
nonce
resource_budget
network_egress_budget
cost_budget
time_budget
destination_scope
expected_output_schema
required_evidence_profile
result_digest
artifact_ids
evidence_receipt_ids
```

The exact schema requires normative design and adversarial testing before runtime promotion.

## 4. First-class machine principals

Agents should eventually be represented as first-class principals rather than disguised human users or generic API tokens.

An agent principal should support:

- an authenticated identity tied to a specific runtime, service, workload, or delegated role;
- explicit owner, sponsoring institution, Circle, or autonomous service relationship where applicable;
- scoped capability grants;
- purpose and destination restrictions;
- time, cost, compute, storage, and network budgets;
- expiration and revocation;
- attenuation-only delegation unless a separately authorized authority explicitly grants expansion;
- evidence of which principal proposed, approved, delegated, executed, and verified an action;
- independent device/runtime rotation without silently changing owner authority.

Agent identity must not become a universal reputation or moral score. Trust remains claim-, capability-, context-, and authority-specific.

## 5. Delegation without ambient autonomy

Agent-to-agent delegation is useful, but the safe primitive is not "agent A trusts agent B." The primitive is a bounded delegation record.

A delegation should eventually identify:

- delegator and delegate;
- capabilities permitted;
- actions or action families permitted;
- purpose;
- input/data scope;
- destinations;
- budget ceilings;
- maximum delegation depth;
- whether subdelegation is permitted;
- assurance floor;
- approval requirements;
- start, expiry, and revocation;
- evidence and receipt obligations.

Subdelegation must be equal to or narrower than the authority received. A downstream agent cannot increase scope by changing framework, protocol, prompt, model, or tool name.

## 6. Skills and capsules

The useful part of modern agent skill ecosystems is portability and progressive disclosure, not their authority semantics.

AXIOM Studio should eventually be able to import or adapt common skill/package formats into an **inert capsule candidate**.

An imported skill or capsule candidate should declare:

- source and upstream version;
- immutable content digest;
- instructions and entry points;
- required tools/capabilities;
- required files and filesystem modes;
- required environment variables and credentials;
- allowed network destinations;
- data classes consumed and produced;
- compute, time, storage, and cost expectations;
- output schema;
- known side effects;
- licensing and provenance;
- tests and conformance evidence.

Installation or import grants **zero authority**. Skill instructions are untrusted content. A skill becomes executable only when a policy-authorized AXIOM capability/capsule path grants the required effects.

This preserves useful ideas from older agent repositories—skills registries, tool normalization, progressive disclosure, hardware profiles, and reusable procedures—without preserving their ambient execution assumptions.

## 7. Credentials and secrets

Machine interoperability must reduce credential spread rather than create another secret-sharing layer.

Required direction:

- no blanket forwarding of the host environment;
- no agent prompt or skill may receive credentials merely because a tool might use them;
- credentials are adapter/capsule specific and purpose bound;
- secrets are materialized only at the execution boundary that requires them;
- remote agents receive derived authority or signed requests, not reusable owner credentials;
- logs, errors, model context, evidence summaries, and protocol metadata must redact or omit secret values;
- credential availability must never silently weaken policy when a provider is unavailable;
- revocation and rotation must not require rewriting historical evidence.

## 8. Communication efficiency

Security should not require bloated agent traffic. Machine paths should support compact deterministic exchanges and asynchronous operation.

The design should favor:

- capability discovery with stable identifiers and schemas;
- request digests and idempotency keys;
- asynchronous task handles for long-running work;
- bounded streaming for progress and artifacts;
- resumable observation where protocol support permits it;
- signed or integrity-bound receipts instead of replaying full transcripts;
- selective evidence retrieval;
- batching where independent authorization semantics are preserved;
- cacheable immutable capability/capsule metadata;
- explicit size, concurrency, time, rate, and cost limits;
- causal identifiers so agents can coordinate without copying entire histories.

Machine interfaces should expose exact structured errors rather than forcing agents to infer policy state from prose.

## 9. Machine-facing capability surface

The long-horizon machine surface should be smaller and more stable than a full agent framework. Candidate primitives are:

1. discover capabilities and schemas;
2. inspect capsule/adapter metadata and provenance;
3. submit an intent;
4. request a policy-bound plan preview;
5. observe approval requirements and status;
6. request human/independent approval without self-approving;
7. inspect grant scope and expiry;
8. observe asynchronous task status;
9. retrieve typed results and artifacts;
10. retrieve and independently verify receipts/evidence;
11. perform authorized memory/object reads and writes;
12. create provenance links;
13. perform selective sharing;
14. participate in approved causal exchange;
15. delegate a strictly bounded capability;
16. revoke or expire delegated authority;
17. subscribe to permitted events;
18. invoke an approved external adapter/capsule.

Human products may project these primitives into understandable interfaces. Agents may call them directly. The authority semantics remain identical.

## 10. Relationship to AXIOM products

### AXIOM One

Human personal control plane. It should remain optimized for comprehension, consent, review, recovery, and personal workflows. An agent using the same node does not replace the owner's interface or approval rights.

### AXIOM Verify

Should be both human- and machine-usable. Agents need to validate receipts, source bindings, execution identity, policy/version claims, artifact digests, and assurance limitations without trusting the producing runtime.

### AXIOM Circles

May eventually include service and agent principals alongside people and institutions. Machine members receive explicit roles/delegations; they do not become members merely by possessing a network endpoint.

### AXIOM Studio

Natural home for capsule/skill import, adapter generation, manifests, permission review, conformance testing, protocol compatibility profiles, simulation, and publishing inert packages.

### AXIOM Managed Node

May operate communication and compatibility infrastructure while remaining unable to grant itself data ownership or ambient execution authority.

## 11. What to retain from legacy agent work

The older OpenClaw/GCA/IronAgent experiments should be mined, not preserved as architectural authority.

High-value extraction candidates include:

- skill normalization and registry ideas;
- tool/capability discovery and progressive disclosure;
- context-poisoning and prompt-injection detectors as advisory security signals;
- channel adapters as optional edge integrations;
- hardware/resource profile heuristics for scheduling;
- multi-agent task decomposition patterns;
- local/offline model routing concepts;
- explicit action-risk classification as one policy input;
- adversarial test harness ideas;
- migration/import tooling for external agent ecosystems.

Do **not** preserve as authority:

- fail-open ethics behavior;
- a model-derived "moral kernel" as the final permission gate;
- ambient host CLI access;
- self-expanding skills or tools that acquire permissions by creation;
- framework-level trust scores as substitutes for grants;
- raw chain-of-thought or private reasoning as required evidence;
- autonomous background behavior that can create external effects without explicit delegated authority;
- upstream forks maintained solely to keep pace with fast-moving general agent frameworks.

A GCA-like evaluator may survive as an optional policy signal, research capsule, or comparative evaluator. It must not outrank explicit AXIOM authority, consent, policy, and evidence.

## 12. Threat model additions

Future agent interoperability must address at least:

- malicious or compromised agent runtimes;
- prompt injection and context poisoning;
- tool-description poisoning;
- malicious skill/package instructions;
- confused-deputy attacks across agents;
- delegation laundering and authority amplification;
- protocol identity spoofing;
- Agent Card or capability metadata substitution;
- MCP/A2A endpoint impersonation;
- credential exfiltration through tool arguments, errors, logs, model context, or artifacts;
- untrusted remote results presented as verified local facts;
- replay and duplicate external effects;
- task/result substitution;
- runaway loops consuming compute, money, bandwidth, or external quotas;
- cross-agent data leakage;
- hidden sub-agent spawning;
- adapter supply-chain compromise;
- schema/version downgrade;
- remote tool changes after discovery;
- policy bypass via alternate protocol paths.

Every compatibility adapter must prove that changing the protocol does not change the underlying authority result.

## 13. Promotion sequence

Recommended sequence:

1. finish current production-candidate pilot/security gates and preserve current claims;
2. specify machine principal and invocation-envelope semantics;
3. expose a read-only machine discovery/verification profile through the native Gateway contract;
4. build one local MCP server adapter exposing only non-consequential/read-only capabilities;
5. prove protocol-parity and negative authorization behavior;
6. add one bounded agent principal with no subdelegation and no external egress;
7. add AXIOM Studio skill/capsule import as inert artifacts;
8. add one bounded external tool/provider path with isolated credentials;
9. implement asynchronous task/receipt semantics;
10. specify attenuation-only machine delegation;
11. add A2A-compatible discovery/task translation in a laboratory;
12. add authenticated remote execution only after remote result/evidence semantics, compromise recovery, and independent verification are mature;
13. add agent participation in Circles only after Circle identity/delegation/appeal semantics exist.

## 14. Current non-claims

This architecture does not claim that current `0.12.0-dev.3`:

- implements MCP server or client support;
- implements A2A discovery or task exchange;
- provides a supported autonomous-agent product;
- performs authenticated remote task execution;
- supports production agent-to-agent delegation;
- imports third-party skills safely for execution;
- provides a production capsule marketplace;
- makes external agent outputs trustworthy;
- allows autonomous agents to bypass human, owner, policy, consent, or independent-approval requirements;
- has production-promoted remote federation.

## 15. Governing maxim

> **Do not compete with every agent runtime. Make every agent runtime safer and more useful when it crosses an AXIOM boundary. Standardize the authority envelope, not the personality loop. Let capabilities travel farther than credentials, and let evidence travel farther than authority.**
