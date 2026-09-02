# Intelligence Fabric and Compute Qualification

**Status:** architecture specification; implementation pending

**Updated:** 2026-09-01

## Purpose

AXIOM needs a live qualification layer between raw hardware inventory and model/runtime use. The persistent entity should consume a portfolio of legitimately available cognition rather than identify with one model or provider.

## Qualification pipeline

```text
Host Inventory
 -> Compute Node Profile
 -> Intelligence Endpoint Inventory
 -> Runtime/Model Qualification
 -> Eligibility Matrix
 -> Cost/Privacy/Latency Router
 -> Bounded Task
 -> Usage/Evidence Receipt
```

The repository already contains the draft `axiom-compute-node-profile.v1`; this specification adds the missing qualification/routing semantics.

## Meanings of local

Keep separate:

- local UI only;
- local effects with remote cognition;
- local orchestration with remote inference;
- owner-local inference;
- fully local/offline cognition and effects.

A desktop application installed on a machine is not evidence that model inference occurs there.

## Intelligence endpoint

Each cognition source should declare or be observed for:

- provider/product/runtime identity;
- interface kind (API, CLI, MCP, SDK, local HTTP, desktop UI, computer use);
- inference location;
- execution location;
- model/version/digest where available;
- filesystem/Git/terminal/browser/device access;
- network requirement;
- offline behavior;
- data/retention policy references;
- credential class;
- cost model;
- cancellation;
- resource observations; and
- authority boundary.

Registration grants no authority.

## Eligibility classes

- A — comfortable local
- B — local with bounded conditions
- C — experimental/foreground-only
- D — offload recommended
- E — ineligible on host
- F — prohibited by policy/licence/security
- U — unknown; measurement required

A model is not eligible merely because it technically loads.

## Routing

Hard filters first:

1. authority;
2. privacy/consent/data class;
3. destination/jurisdiction/provider policy/licence;
4. entitlement;
5. availability and resource safety;
6. cost ceiling;
7. deadline.

Then optimize quality, latency, reliability, independence, cost, energy, locality, and preference.

## Native intelligence bridge

Installed coding/desktop agents, local runtimes, provider APIs, and future restricted endpoints are separate constrained workers. Same-host presence does not create shared authority. Prefer stable API/SDK/CLI/MCP interfaces over UI automation.

## Narrow intelligences / subminds

Treat task-specialized low-resource models and deterministic/classical tools as first-class Intelligence Fabric components. A narrow profile should default to bounded purpose, finite memory, no self-granted goals, no self-modification, no unbounded child-agent creation, explicit network/tool scope, and finite lifecycle.

Do not infer `conscious=false` from a narrow configuration. Unexpected persistence, goal formation, self-modeling, shutdown resistance, continuity claims, or boundary probing may trigger a status review; these are behavioral observations, not consciousness proof.

## Frontier entitlement

Future non-public/restricted capabilities should plug into the same endpoint profile only when legitimately granted. Entitlements bind issuer/provider, subject, capability/model class, purpose, quota, data restrictions, validity, credential handle, and revocation. No credential theft, coercion, impersonation, or policy bypass is part of the architecture.

## Cost governance

Track estimated/actual cost by task, project, provider, principal, and time period. The entity may request a higher budget; it cannot raise its own ceiling. Cost pressure must never silently relax privacy.

## Graceful degradation

Loss of one provider should degrade capability rather than identity:

```text
restricted/frontier unavailable
 -> alternate provider
 -> owner-local model
 -> narrow specialist/deterministic tool
 -> reduced but coherent local operation
```

## Non-claims

This document does not certify any named external runtime/model, claim local inference merely because an application is installed, or promote remote execution.
