# AXIOM Human Interface Boundary v0

**Status:** experimental, inert source-registry foundation  
**Runtime activation:** none  
**Authority effect:** none  
**Network effect:** none

## Purpose

This package defines the first reusable AXIOM human-interface foundation for
Axiom One and future human-facing clients.

It uses the shadcn registry format as a **code-distribution and composition
mechanism**, not as an authority, policy, identity, or runtime layer.

The current Axiom One local preview does **not** consume this registry. Adopting
a component framework, React, TypeScript, Tailwind, Base UI, Radix, or another
browser toolchain remains a separate reviewed application-boundary change.

## Non-negotiable authority boundary

Human interfaces may:

- present authenticated Gateway facts;
- collect user intent;
- explain consequence, scope, destination, cost, retention, and uncertainty;
- ask for explicit review or confirmation;
- submit a request through an already reviewed Gateway client contract;
- render receipts and verification evidence;
- expose raw evidence alongside human-readable explanations.

Human interfaces may not:

- grant capability or authority;
- infer authorization from discovery, visibility, role labels, model output, or
  prior success;
- bypass Gateway, Hypervisor, Sandbox, or Grid;
- convert a verification result into a truth or legitimacy claim;
- hide denial, uncertainty, revocation, destructive effects, or raw evidence;
- persist secrets merely because a component library makes persistence easy.

For supported privileged effects, authority remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

## Three layers

### 1. Generic UI primitives

Buttons, dialogs, drawers, tables, cards, forms, command surfaces, tooltips,
navigation, charts, and other generic interaction primitives.

These are replaceable presentation code.

### 2. AXIOM semantic primitives

Reusable components should be built around AXIOM meanings rather than around a
particular application:

- `CapabilityState`
- `AuthorityReview`
- `ReceiptView`
- `ConsentScope`
- `VerificationResult`
- `RiskBoundary`

These components may render trusted state and collect a proposal. They do not
become trusted decision engines.

### 3. Domain components

Axiom One, Circles, Governance, Verify, Education, MAJIK, and later products may
compose the semantic primitives into domain-specific workflows.

Domain composition does not inherit additional authority from the UI layer.

## Capability-state rule

Do not collapse these concepts into one green/red badge:

- implemented;
- available on this node;
- authorized to this principal;
- consequence;
- assurance;
- maturity;
- confirmation requirement;
- independent-approval requirement.

If the trusted source does not provide a dimension, present it as unknown rather
than inferring a favorable state.

## Consequential-action rule

A consequential action should use a review-first interaction:

```text
user intent
  -> local form state
  -> human-readable consequence review
  -> explicit submit
  -> reviewed Gateway client
  -> trusted runtime decision
  -> receipt / denial / uncertainty
  -> human explanation + raw evidence
```

The pre-submit UI is a proposal surface. It is never the final authorization
source.

## Registry intake rule

Treat third-party registry material as untrusted input.

Before an external item becomes an AXIOM-distributed item:

1. inspect all source files;
2. inspect runtime and build dependencies;
3. reject remote runtime imports and hidden analytics;
4. review accessibility and keyboard behavior;
5. review browser persistence and secret handling;
6. review network behavior;
7. pin the reviewed source/version;
8. add negative-path tests where the component can influence consequential
   workflows;
9. distribute the reviewed AXIOM-owned copy rather than relying on mutable
   upstream code at runtime.

A visually harmless component is not exempt from supply-chain review.

## Current v0 scope

This source-registry item distributes only:

- this boundary document;
- `interface-contract.json`;
- `foundation.css`.

It adds no React runtime, Tailwind runtime, Base UI dependency, Radix dependency,
remote asset, build step, Gateway route, capability-registry entry, browser
storage, network listener, model/provider call, or production deployment.

## Next bounded slice

A later UI implementation may create reviewed TypeScript components for the
semantic primitives above inside a separately isolated human-product toolchain.

That slice should demonstrate:

- keyboard and screen-reader behavior;
- phone-sized layouts;
- denial/unknown/uncertain states;
- raw-evidence escape hatches;
- no secret persistence;
- no direct internal-service calls;
- exact Gateway-client use for any request submission;
- removal/rollback without affecting the trusted kernel.

Framework adoption should follow those tests, not precede them.
