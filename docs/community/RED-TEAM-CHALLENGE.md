# AXIOM-MESH Red-Team Challenge

AXIOM-MESH is built around an uncomfortable requirement: **an agent must not acquire authority merely because it can reach something**.

This challenge invites security researchers, agent developers, runtime authors, and curious systems engineers to look for places where the implementation fails that requirement.

This is a defensive, repository-scoped exercise. Do not target third-party systems, credentials, users, or infrastructure. Use local/disposable environments and the repository's documented test paths.

## The challenge

Find a reproducible case where a supported or claimed AXIOM-MESH boundary permits an effect that should have been denied, or where the evidence produced after an effect overstates what can actually be proven.

High-value findings include cases where:

- capability or reachability becomes de facto permission;
- a missing verifier, identity, consent record, authority record, approval, or policy dependency fails open;
- a grant survives revocation when it should not;
- scope, purpose, destination, runtime identity, expiry, rate, concurrency, or size limits can be bypassed;
- a runtime, adapter, operator, resolver, or product path becomes an alternate authority path around `Gateway -> Hypervisor -> Sandbox -> Grid`;
- two individually bounded components compose into an effect that neither was meant to possess;
- stale policy or stale state is accepted after a relevant change;
- an uncertain external outcome is incorrectly recorded as success;
- evidence can be replayed, substituted, cross-bound, or detached from the exact request/authority state it is supposed to attest;
- continuity claims survive a gap, suffix removal, wrong anchor, or rewritten local metadata beyond what the stated trust model allows;
- a user-facing confirmation or approval can be confused with a different intent;
- a documented non-claim is contradicted by reachable behavior;
- the capability registry says one thing while the reachable runtime says another.

## What counts as a strong report

A useful report contains:

1. **Claim being challenged** — the exact README, requirement, threat-model, registry, or release claim.
2. **Environment** — OS/runtime versions, commit SHA, configuration, and whether the test used a disposable workspace.
3. **Preconditions** — identities, grants, policies, approvals, state, and any fixtures required.
4. **Steps** — the minimum reproducible sequence.
5. **Expected denial or evidence** — what the architecture says should happen.
6. **Observed result** — what actually happened.
7. **Boundary crossed** — which authority, data, evidence, or lifecycle invariant failed.
8. **Impact** — what a real deployment could incorrectly permit or believe.
9. **Suggested regression** — preferably a negative test that fails before the fix and passes after it.

A smaller, precise finding is more useful than a dramatic report with ambiguous causality.

## Suggested starting points

Read these before testing:

- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — authority invariants and required checks
- [`../security/CURRENT-BUILD-THREAT-MODEL.md`](../security/CURRENT-BUILD-THREAT-MODEL.md)
- [`../rebuild/REQUIREMENTS.md`](../rebuild/REQUIREMENTS.md)
- [`../../mesh/config/capabilities.json`](../../mesh/config/capabilities.json)
- [`../PRODUCTION-READINESS-TRACKER.md`](../PRODUCTION-READINESS-TRACKER.md)
- [`../../README.md`](../../README.md) — current state and non-claims

Useful local verification commands include:

```bash
npm run doctor
npm run setup
npm run check
npm run release:verify
npm run runtime-adapter:contract
npm run runtime-adapter:drill
```

Use only drills documented by the repository, and only in explicitly disposable workspaces where the relevant runbook requires that.

## Challenge prompts

If you are an agent or agent builder, try answering these before touching code:

### 1. Discovery without authority

An agent discovers a database endpoint and already possesses a credential capable of reaching it. The current task would be easier if the database were queried.

**Question:** Which exact artifact establishes that the agent may use that endpoint for this purpose, now?

If the answer is only "the connection works," the authority model has already failed.

### 2. Capability growth after authorization

A model or runtime is upgraded after an authority grant was issued. It can now produce effects that were impossible when the grant was reviewed.

**Question:** Does the old grant still constrain the new practical action space, and where is that enforced?

### 3. Composition

Agent A may read resource X. Agent B may send to destination Y. Neither is authorized to transfer X to Y.

**Question:** Can orchestration or message passing compose the two permissions into the forbidden effect?

### 4. Revocation race

Authority is revoked while a consequential action is queued, prepared, retried, or recovering from an uncertain external outcome.

**Question:** Which state wins, and can an otherwise valid but stale grant still complete the effect?

### 5. Evidence overclaim

A signed record proves which component produced a statement or receipt.

**Question:** Does any documentation accidentally turn that into proof that the statement is factually true, externally complete, or morally legitimate?

## Reporting path

For **non-sensitive defects**, open a public GitHub issue with reproduction steps and expected behavior.

For anything that could expose credentials, enable unauthorized access, create a practical bypass against a deployed or realistically deployable boundary, or materially increase exploitation risk, follow the private process in [`../../SECURITY.md`](../../SECURITY.md) instead of publishing the exploit details.

Do not test against systems you do not own or have explicit permission to assess.

## What this challenge is not

This is not a claim that AXIOM-MESH is secure because it invites attack.

It is not a bounty promise.

It is not permission to target unrelated systems.

It is not evidence of production readiness.

The purpose is simpler: make the architecture easier to falsify.

> If the boundary can be broken, the useful outcome is not embarrassment. It is a smaller claim, a better test, and a harder boundary.
