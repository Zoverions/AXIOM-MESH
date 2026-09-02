# Evidence-Bound Decision Explanations

**Status:** experimental long-horizon explanation architecture. AXIOM One already has a bounded experimental human-explanation slice; this profile does not replace or promote it.

A trustworthy system should be able to answer why an action was allowed, denied, held, or downgraded to advisory use; which requirement blocked it; what is known versus uncertain; which evidence was considered; which policy layer required the stronger condition; what can safely happen next; and whether a review path exists.

It should answer those questions **without inventing a narrative about hidden model reasoning**.

## Evidence-bound, not chain-of-thought

The explanation is generated from recorded decision fields: policy result, assurance vector, currentness state, evidence references, conflict record, and challenge/review metadata.

It is not generated from private chain-of-thought.

A model may paraphrase the structured explanation for accessibility, but it may not add a new factual reason, remove an inconvenient recorded reason, or upgrade uncertainty.

## Certainty vocabulary

The explanation layer preserves exact states such as established for declared scope, supported but incomplete, unknown, conflicted, stale, failed check, and not evaluated.

"Unknown" must not become "probably fine." "Stale" must not become "verified." "Conflicted" must not become "denied because X is wrong" unless the underlying process actually resolved the conflict.

## Denials and holds

A denial should identify the blocking condition instead of collapsing into a generic policy error.

A hold should explain what required condition is unresolved, why it is unresolved, what event could safely resolve it, and whether a review path exists. A hold is not a soft allow.

## Sensitive reasons

Some reasons are themselves sensitive. The structured record can mark a reason as sensitive so a recipient-facing renderer can expose a bounded explanation while an authorized operator may see the exact internal reference.

This is explanation minimization, not deception: the existence of denial or uncertainty remains visible.

## Appeals and exceptions

The interface may explain available review or exception procedures. It must never imply that using the path guarantees approval.

## Accessibility

Stable reason codes can support plain-language UI, detailed operator view, screen-reader text, translations, machine-agent consumption, and audit exports. Changing wording does not change the underlying decision.

## Governing rule

**Explain from evidence. Preserve uncertainty. Name the blocking condition. Never manufacture certainty or hidden reasoning.**
