# Runtime Candidate Survey — 2026-08-21

**Status:** preliminary research input for `RUNTIME-002`; not certification, selection, capability promotion, or permission to install/execute a named runtime

**Architecture dependency:** [Runtime & Connector Fabric](../architecture/RUNTIME-AND-CONNECTOR-FABRIC.md)

## Purpose

The first real Agent Runtime Adapter integration should prove that AXIOM can connect to a maintained external runtime without importing that runtime's authority assumptions.

This survey records a first-pass comparison of three prominent candidates that are directly relevant to current AXIOM planning: Hermes Agent, OpenClaw, and Agent Zero. It is deliberately narrow. A final `RUNTIME-002` selection still requires exact immutable source/release pins, licence/dependency/SBOM review, threat-model work, and a no-secret read-only integration plan.

## Sources checked

- Hermes Agent official documentation and `NousResearch/hermes-agent` repository.
- OpenClaw official `openclaw/openclaw` repository.
- Agent Zero official `agent0ai/agent-zero` orchestrator plugin documentation.

Source observations are current only to this survey date and must be refreshed before implementation.

## Shared evaluation criteria

Each candidate is evaluated for:

1. maintained upstream and release hygiene;
2. licence and source reviewability;
3. stable non-privileged integration boundary;
4. ability to expose one no-secret read-only operation;
5. cancellation/lifecycle characteristics;
6. credential and secret assumptions;
7. filesystem/network assumptions;
8. worker/sub-agent behavior;
9. update/self-modification behavior;
10. risk of creating a second authority/control plane;
11. usefulness as a portability/interchangeability test;
12. suitability for exact AXIOM adapter bindings.

The survey does not assign a universal trust score.

## Hermes Agent

### Current upstream shape

Hermes presents itself as a persistent, self-improving agent with a learning loop that creates/improves skills, remembers across sessions, and supports multiple model/provider backends. Current official documentation provides command-line installation across Linux/macOS/WSL/Android and native Windows, with desktop packaging also available.

### AXIOM value

Hermes is a strong first-integration candidate because:

- it is a general runtime rather than an AXIOM-specific shell;
- it has a CLI/runtime boundary that can potentially be isolated behind an adapter;
- provider choice is already conceptually replaceable;
- persistent memory and skill evolution stress the requirement that runtime cognition/state must not create AXIOM authority;
- it is useful enough to test real interoperability rather than a toy adapter.

### Main risks to review

- self-improving skills create update/provenance questions;
- persistent memory must remain distinct from authoritative AXIOM state;
- provider credentials and runtime auth stores must not be imported into model-visible or AXIOM-global context;
- runtime tool execution must not bypass Gateway policy;
- any automatic learning/update path must be frozen or made explicit during conformance testing.

### Preliminary position

**Candidate for first bounded read-only adapter**, subject to exact source pin and a narrowly defined operation that requires no reusable secret and causes no external effect.

## OpenClaw

### Current upstream shape

OpenClaw presents itself as a personal AI assistant that runs on the user's devices and connects models, tools, messaging channels, and companion applications through its own Gateway. Current official installation supports macOS, Linux, Windows, and Node-based deployment.

### AXIOM value

OpenClaw is a strong interoperability candidate because:

- it is cross-platform and oriented toward a single user/operator;
- it integrates models, tools, and communication channels;
- its own Gateway/control abstractions make it a good test of AXIOM's rule that an external runtime may coordinate work but must not become an AXIOM authority root;
- it is likely to expose practical channel/tool integration patterns useful to the broader connector fabric.

### Main risks to review

- its Gateway must remain an external runtime boundary, not an alternate AXIOM Gateway;
- channel credentials and broad host integrations require strict credential isolation;
- messaging/publication paths can become externally consequential quickly;
- plugin/tool discovery must never map directly to AXIOM permission;
- update/install convenience paths must not bypass inert import, source pinning, review, or permission diffing.

### Preliminary position

**Candidate for second runtime neutrality proof**, or first if its exact pinned source exposes a materially cleaner no-secret/read-only boundary than Hermes after detailed review.

## Agent Zero

### Current upstream shape

Agent Zero currently includes an orchestrator plugin designed to delegate repository/coding work to external terminal/headless agents. Its official plugin documentation lists adapters or guidance for Agent Zero headless, OpenAI Codex CLI, Claude Code, Cursor CLI, Gemini CLI, Grok Build, Hermes Agent, OpenCode, and future terminal agents.

The same current default configuration includes deliberately permissive external-agent modes such as sandbox bypass, permission bypass, always-approve, auto, and YOLO-style flags for some adapters.

### AXIOM value

Agent Zero is exceptionally useful as an **orchestration stress test** because:

- it already treats other agent environments as replaceable workers;
- it can exercise nested runtime -> worker -> tool chains;
- it creates realistic confused-deputy and delegation-laundering test cases;
- its adapter registry can inform AXIOM's runtime-neutral catalog design;
- its permissive execution modes provide concrete negative fixtures for proving that external runtime settings do not override AXIOM policy.

### Main risks to review

- permissive runtime flags are fundamentally incompatible with treating runtime-local approval/sandbox state as AXIOM authority;
- host CLI bridges and container shells can expose ambient filesystem/process authority;
- credential discovery must remain metadata-only and never return secret material;
- nested external agents make worker lineage, cancellation, budget, and delegation boundaries essential;
- direct terminal execution must be prevented from becoming an AXIOM effect fast path.

### Preliminary position

**Do not use as the first authority-bearing integration.** Use it after one or two simpler adapters as an adversarial/meta-orchestration conformance target.

## Preliminary ordering

This is a research recommendation, not a promotion decision:

1. **Hermes Agent** — first bounded no-secret/read-only adapter candidate.
2. **OpenClaw** — second runtime to prove neutrality and exercise channel/tool control-plane overlap.
3. **Agent Zero** — orchestration/adversarial stress target after task/artifact and delegation semantics are stronger.

A fourth maintained runtime should be added before declaring the candidate survey complete. A narrower coding/terminal runtime may be useful as a control because it can expose a simpler surface than a persistent personal-agent shell.

## Required next evidence before selecting runtime 1

- immutable upstream commit and release reference;
- SPDX licence and notices;
- dependency lock/SBOM inventory;
- exact executable/entrypoint and update behavior;
- explicit filesystem/network/credential requirements;
- one read-only operation with no reusable secret and no external effect;
- exact Agent Runtime Adapter mapping;
- native-versus-adapter authorization parity test plan;
- cancellation, idempotency, timeout, bounded output, and receipt plan;
- direct-service-denial test;
- prompt/tool-description injection fixtures;
- independent review scope.

## Non-claims

This survey does not claim that Hermes, OpenClaw, Agent Zero, or any other runtime is safe, AXIOM-conformant, licence-compatible for every use, installed, enabled, production-ready, or authorized to perform any effect. Popularity, feature richness, current documentation, or successful upstream operation do not substitute for AXIOM conformance and local authorization.
