# Runtime Adapter First Pin

**Build context:** `0.12.0-dev.3`  
**Trackers:** RUNTIME-001 (contract + synthetic reference complete), RUNTIME-002 (in progress — Hermes identity-only research fixture; pin not accepted)  
**Normative:** `docs/architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md`  
**Research pointers (not final selection):** `docs/reviews/RUNTIME-CANDIDATE-SURVEY-2026-08-21.md`, `docs/reviews/HERMES-RUNTIME-002-CANDIDATE-PIN-2026-08-21.md`

**Status:** Process document for the bounded **read-only** Agent Runtime Adapter v1 first pin. Hermes is the provisional candidate; a fixture-backed identity-only research slice may exist under `docs/operations/HERMES-RUNTIME-002-IDENTITY-FIXTURE.md` without accepting the pin. Bounded identity-only dependency inventory + threat notes: `docs/operations/HERMES-RUNTIME-002-IDENTITY-THREAT-INVENTORY.md` (prep toward gate 2; not SBOM certification; not pin acceptance). Not certification. Not install or execute permission until promotion gates below pass in a dated decision log entry that the pin is accepted.

**Authority path:** external runtime or machine client → versioned adapter → Gateway → Hypervisor → Sandbox → Grid → independently consumable receipt.

## Selection criteria

1. Maintained upstream with reviewable source and release hygiene.
2. Licence compatible with AXIOM attribution and redistribution rules in AGENT-RUNTIME-ADAPTER-CONFORMANCE.
3. Stable non-privileged integration boundary.
4. Ability to expose **one** no-secret read-only operation.
5. Observable cancellation and lifecycle behavior.
6. Credential and secret assumptions that can be excluded from the first profile.
7. Filesystem and network assumptions that can be denied by default.
8. Low risk of creating a second authority or control plane.
9. Usefulness as a portability test (replaceable later).
10. Exact immutable commit pin available (branch or latest tag is insufficient).

Record the chosen candidate, rejected alternatives, and evidence in the owner decision log.

## Reject list (authority bypass)

Reject or defer any candidate or first operation that:

- treats runtime-local approval, sandbox-bypass, always-approve, auto, or YOLO-style flags as Mesh authorization;
- maps tool allowlists, skills, or plugins directly to Mesh permissions;
- imports reusable secrets, .env files, or provider API keys into model-visible or Mesh-global context;
- opens network destinations, messaging, browser automation, shell, or worker spawn in the first slice;
- uses mutable refs (`main`, `latest`, unpinned packages, mutable image tags) in the adapter manifest;
- creates a second Gateway or control plane that can authorize Mesh effects;
- claims MCP, A2A, remote execution, or autonomous delegation as part of the first pin;
- aliases a broad diagnostic dump as the first probe when a narrower identity or health helper exists (see HERMES pin review rejecting `hermes dump`).

Local derivatives and unmaintained forks are out of scope for RUNTIME-002 first pin.

## Parity matrix (must be green before calling the pin done)

For the single read-only operation, prove native path versus adapter path on all of:

- **Authorization** — same deny/allow outcomes; broad grant cannot widen narrow mapping; broad mapping cannot widen narrow grant.
- **Cancel** — cancellation observed and recorded; no silent continuation.
- **Idempotency** — same idempotency key yields stable replay semantics.
- **Receipt** — terminal receipt repeats contract pin and manifest digest; tamper rejected.
- **Fallback** — fallback never escalates privilege or switches to a broader runtime path.
- **Uncertainty** — unknown identity or pin mismatch fails closed; no continue-on-unknown.
- **Direct-service denial** — calls that skip Gateway or adapter and hit Mesh services directly are denied.

Run runtime-adapter:contract and runtime-adapter:drill for synthetic baseline; add candidate-specific fixtures without treating them as production certification.

## Promotion gates before remote execution, MCP, or A2A

Do not expand beyond the read-only pin until all are true:

1. Immutable upstream commit and reviewed execution profile recorded.
2. Licence, dependency inventory, and threat-model note for the exact profile.
3. Parity matrix green with signed evidence artifacts retained offline.
4. No secret material in child environment; network disabled for the first operation unless a later dated decision reopens it with new gates.
5. capabilities.json unchanged unless a separate evidence-backed PR intentionally updates adapter-related status.
6. Independent review of the adapter integration surface (can share pilot independent review scope only if explicitly in scope).
7. Owner decision log entry: "RUNTIME-002 read-only pin accepted" with explicit non-claims.

Only after those gates: consider a second operation, then remote execution proposals, then MCP/A2A — each as its own progression with new reject lists.

## Non-claims

This document does not select Hermes, OpenClaw, Agent Zero, or Codex; does not certify any runtime; does not authorize install or execute; and does not change Mesh capability status.
