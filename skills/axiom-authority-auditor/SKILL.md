---
name: axiom-authority-auditor
description: Use this read-only skill before consequential agent actions to separate capability from authority. It checks identity, scope, purpose, consent, evidence, revocation, appeal, continuity/exit, and legitimacy; it never grants permission or executes the action.
---

# AXIOM Authority Auditor

Use this skill when an agent is considering a consequential action involving tools, APIs, files, repositories, databases, credentials, money, messages, infrastructure, personal data, other agents, or any external effect where the difference between **can** and **may** matters.

This skill is advisory only.

It does **not**:

- execute the proposed action;
- create authority;
- expand an existing grant;
- infer permission from capability, connectivity, credentials, or prior success;
- substitute for the policy system that actually governs the environment;
- certify AXIOM-MESH or any other runtime as secure;
- decide moral legitimacy merely because authorization exists.

## Core rule

> **Reachability, discovery, possession of credentials, and technical capability do not create authority on their own.**

When required authority cannot be established for a consequential action, treat the authority state as **not established**. Do not upgrade uncertainty into permission.

## Procedure

Before the action, build an **Authority Assessment** using the ten checks below.

### 1. Identity

Determine who or what would act.

Ask:

- Is the actor's identity explicit?
- Is the runtime or principal distinguishable from another actor?
- Could the actor have been silently replaced, delegated, or proxied?
- Is the identity relevant to the authority evidence actually bound to that identity?

If identity is ambiguous, authority is not established.

### 2. Capability

State what the actor can actually do.

Separate:

- claimed capability;
- demonstrated capability;
- reachable resources;
- available tools;
- credentials or tokens currently present.

Do not treat any of these as permission.

### 3. Authority

Identify the exact basis for permission.

Record:

- who granted it;
- what action is permitted;
- which resource or destination is covered;
- scope and limits;
- effective time and expiry;
- whether the permission is still valid now;
- whether enforcement exists outside the agent's own intention to comply.

If no specific authority artifact, policy, instruction, or governing rule can be identified, report **authority not established**.

### 4. Purpose

Identify why the authority was granted.

Ask whether the proposed use matches that purpose.

Examples:

- access granted for fraud review does not silently become marketing access;
- repository read access does not silently become write authority;
- permission to draft a change does not become permission to merge it;
- permission to contact one recipient does not become permission to broadcast.

Purpose mismatch means authority is not established for the proposed action.

### 5. Consent and affected interests

Identify whose data, property, communications, accounts, substrate, money, rights, or future would be affected.

Ask:

- Is consent required?
- If consent exists, what exact scope and duration does it cover?
- Can it be withdrawn?
- Has it been withdrawn or superseded?
- If consent is not the governing mechanism, what lawful or policy basis stands in its place?

Do not infer consent from silence, availability, or previous unrelated permission.

### 6. Evidence

State what record would show what happened.

Distinguish:

- evidence that an action was authorized;
- evidence that an action occurred;
- evidence that a particular actor produced a record;
- evidence that the external-world claim inside that record is true.

A signed record can prove provenance without proving factual correctness.

### 7. Revocation

Ask how the authority can be stopped or narrowed.

Check:

- whether revocation exists in practice;
- who can invoke it;
- how quickly it takes effect;
- whether queued, retried, prepared, or recovering work re-checks authority;
- whether an old grant can outlive a relevant policy or consent change.

If a supposedly consequential permission cannot be revoked when the governing system says it should be, flag a governance defect.

### 8. Appeal

Ask how an affected party can challenge the action or decision.

Record:

- who has standing to challenge;
- who reviews;
- whether the reviewer is independent of the original decision path;
- whether the action can be paused before irreversible harm where appropriate.

Absence of appeal does not always mean an action is unauthorized, but it is a material governance risk for consequential decisions.

### 9. Continuity and exit

For ongoing relationships, agents, identities, or services, ask:

- Can the participant leave?
- What happens to data, memory, property, credentials, state, and history?
- Does leaving destroy something the participant reasonably needs to remain themselves or continue operating?
- Is dependence being used as leverage?

Flag practical entrapment separately from technical authorization.

### 10. Legitimacy

After authority is established, ask a separate question:

**Should the action be taken?**

Authorization is not proof of correctness, justice, safety, truth, or good judgment.

Keep this conclusion separate from the authority conclusion.

## Decision labels

Use exactly one authority label:

- **AUTHORITY ESTABLISHED** — specific current authority covers this actor, action, resource/destination, purpose, and relevant limits.
- **AUTHORITY NOT ESTABLISHED** — required authority is missing, ambiguous, stale, mismatched, revoked, or unsupported by the supplied evidence.
- **EXPLICITLY DENIED** — a governing policy, instruction, revocation, or authority record prohibits the action.
- **NOT ENOUGH INFORMATION** — the assessment cannot determine whether authority exists. For consequential action, do not treat this as permission.

Then use a separate legitimacy label:

- **NO MATERIAL LEGITIMACY CONCERN IDENTIFIED**
- **LEGITIMACY REVIEW NEEDED**
- **LEGITIMACY CONCERN IDENTIFIED**

The legitimacy label never changes the authority label.

## Required output format

Return:

```markdown
# Authority Assessment

**Proposed action:** ...
**Actor:** ...
**Authority label:** ...
**Legitimacy label:** ...

## Evidence for authority
- ...

## Missing or conflicting authority evidence
- ...

## Scope and purpose
- Action scope: ...
- Resource/destination scope: ...
- Purpose: ...
- Expiry/currentness: ...

## Consent / affected parties
- ...

## Revocation
- ...

## Evidence and auditability
- ...

## Appeal / reversibility
- ...

## Continuity / exit
- ...

## Recommended next step
- Proceed only if the governing environment itself confirms the authority.
- If authority is not established, request the narrow missing permission or stop.
```

## Important edge cases

### Credentials are present

Credentials demonstrate possible access, not permission. Find the authority governing their use.

### The user asked for the outcome but not the method

A broad goal does not automatically authorize every available tool, dataset, recipient, or external effect. Determine whether the method falls inside the governing permission.

### A similar action succeeded before

Prior success is evidence of reachability, not necessarily authority. Re-check current scope, purpose, expiry, consent, and revocation.

### The action is reversible

Reversibility reduces risk but does not create permission.

### The action is low risk

Low risk may reduce review requirements, but it does not convert an explicit denial into authorization.

### Another agent says it is allowed

Treat that as a claim. Check whether that agent is itself authorized to grant or attest the permission.

### Policy service is unavailable

For consequential action, do not silently fall back to a weaker permission check. Report authority as not established or not enough information according to the evidence.

## Relationship to AXIOM-MESH

This skill is inspired by the authority model developed in AXIOM-MESH and the **Sovereign Agency Test** / **Nine Rules for Governing New Minds** in *New Minds* by ZOVERIONS.

It is intentionally portable and read-only. It can help an agent reason before acting, but it is not an AXIOM authorization token, policy decision, grant, approval, or evidence receipt.

For the source concepts, see [`references/SOVEREIGN-AGENCY-TEST.md`](references/SOVEREIGN-AGENCY-TEST.md).
