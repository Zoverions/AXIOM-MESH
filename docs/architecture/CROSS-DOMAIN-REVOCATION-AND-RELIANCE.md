# Cross-Domain Revocation, Compromise Propagation, and Reliance Receipts

**Status:** experimental interoperability architecture; no global revocation authority claim.

Federated recognition needs a way to answer two different questions:

1. **May I rely on this claim now?**
2. **What did I legitimately rely on in the past?**

Those are not the same question.

## Status propagation

Institutions may publish signed or otherwise verifiable status events about:

- credential revocation or suspension;
- issuer/verifier compromise;
- recognition withdrawal or narrowing;
- trust-anchor rotation or compromise;
- policy supersession;
- institutional succession or dissolution.

Recipients treat those as evidence inputs.

The notice can block future reliance under local policy, but it does not itself authorize punishment, remediation, or unrelated state changes.

## Historical reliance

Every consequential recognition decision should be able to emit a reliance receipt bound to:

- local relying party;
- exact recognition-edge digest;
- exact claim digest;
- local policy digest;
- currentness status/evidence;
- decision time;
- decision result.

If a compromise is discovered later, the receipt may be **annotated** with the new information.

It must not be rewritten to pretend the later fact was known earlier.

## Why this matters

Without historical immutability, revocation systems create two bad failure modes:

- rewriting history to make earlier decisions look negligent or invalid when they were reasonable at the time;
- preserving old approvals as if they were still current after compromise.

AXIOM should do neither.

The correct model is:

```text
historical receipt = what was known and decided then
later status event = what became known later
future admissibility = current local policy after reconciliation
```

## Root versus leaf compromise

A service/leaf-key compromise may have a narrow blast radius.

A root/trust-anchor compromise is wider and may require re-establishing descendant trust rather than ordinary key rotation.

Cross-domain status events must identify exact scope so local policy can respond proportionally.

## Offline nodes

An offline node retains its last-known currentness state but must not claim fresh external status.

When it reconnects it:

1. verifies new status events;
2. identifies affected recognition edges/claims;
3. annotates historical receipts;
4. re-evaluates future reliance;
5. preserves conflicts if status sources disagree.

## Governing rule

**Stop unsafe future reliance. Preserve honest historical evidence. Never let revocation become retroactive fiction.**
