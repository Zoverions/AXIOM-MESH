# GTM Evidence Loop

**Status:** bounded growth decision aid; no runtime or outreach authority

## Purpose

AXIOM should not treat a large lead list as a sales advantage. The useful asset is a
repeatable map of which accounts are relevant, why they are relevant now, how well
that conclusion is supported, and what happened after a bounded GTM action.

The v0 account model is:

**fit × timing × intent × confidence**

This is represented as a four-component evidence vector, not as an opaque
multiplicative score. Each component remains inspectable and provenance-bearing.

The learning loop is:

**signal -> evidence -> vector -> advisory lane -> separately authorized operation -> outcome -> updated evidence**

The evaluator in `mesh/src/check-gtm-evidence.mjs` covers only the evidence and
advisory-lane portion of that loop. It does **not** send email, connect to a CRM,
write to LinkedIn or X, spend money, create external accounts, or authorize contact.

## Boundary

This growth surface preserves the project boundary:

**Knowledge -> Operation -> Authority**

A GTM signal can change an account's advisory priority. It cannot create external
authority.

In v0:

- there is no outreach executor;
- there is no CRM mutation path;
- there is no credential handling;
- there is no network call;
- there is no automated message generation or sending;
- there is no rule that converts `HIGH_SIGNAL` into permission to contact someone.

Any later outbound or CRM integration must enter through an explicit operation and
authority boundary rather than treating a ranking result as permission.

## Account evidence contract

An account record uses schema `axiom-gtm-account-evidence.v0` and evaluation
version `axiom-gtm-priority.v0`.

The account identifier is intentionally opaque. The contract contains no required
person name, email address, phone number, or other contact field.

Each signal records:

- `id`;
- one dimension: `fit`, `timing`, or `intent`;
- an ordinal evidence level from 0 through 3;
- an HTTPS source URL;
- source kind;
- observation date;
- explicit `valid_until` date;
- independence group;
- a bounded summary.

A single source URL may not be split across multiple independence groups. This
prevents one source from being counted as several independent confirmations.

## Dimension semantics

The evaluator does not attempt to infer universal sales truth. Teams must define
what the levels mean for a specific campaign before collecting evidence.

A practical interpretation is:

| Level | Fit | Timing | Intent |
|---|---|---|---|
| 0 | incompatible or absent | no current trigger | no observed intent |
| 1 | plausible | weak or indirect trigger | weak engagement |
| 2 | strong ICP match | current relevant trigger | active category interest |
| 3 | exact target profile | explicit high-urgency trigger | explicit evaluation/request |

The evaluator takes the highest active level for each dimension. Timing evidence
must carry an explicit validity horizon so old funding, hiring, leadership-change,
launch, contract, or engagement signals naturally stop influencing priority.

## Confidence

Confidence is derived from the provenance class supporting the decisive signal,
not authored as an arbitrary score.

| Source kind | Quality |
|---|---:|
| `semantic_inference` | 0 |
| `public_secondary` | 1 |
| `public_primary` | 2 |
| `owned_first_party` | 3 |

The account confidence component is the weakest provenance quality among the
decisive fit and timing evidence, plus intent when positive intent is present.

This makes confidence deny-dominant: a strong-looking account cannot become
`HIGH_SIGNAL` when a decisive claim depends on weak secondary material or a
semantic inference.

Semantic systems may classify or propose signals. They do not get to upgrade their
own evidence quality.

## Advisory lanes

The deterministic v0 lanes are:

| Lane | Meaning |
|---|---|
| `EXCLUDE` | No positive active fit evidence. Do not spend GTM attention on the account. |
| `WATCH` | Some fit exists, but fit or timing is below the high-signal threshold. Re-evaluate when evidence changes. |
| `RESEARCH` | Fit and timing may be strong, but intent is absent or decisive evidence is not verified strongly enough. Gather better evidence. |
| `HIGH_SIGNAL` | Fit >= 2, timing >= 2, intent >= 1, and confidence >= 2. The account merits human or separately authorized GTM consideration. |

The lane is advisory. It is not a contact authorization.

An input record must declare its lane, and the evaluator rejects the record when
that declaration overstates or understates the deterministic result. This keeps
stored claims synchronized with the evidence.

## Evidence digest

Every successful evaluation returns a SHA-256 `evidence_digest` over the
normalized account evidence and evaluation date.

That digest is the handoff point for the next GTM layer. A future outcome record
can bind:

- campaign ID;
- account ID;
- evidence digest used for the decision;
- operation type;
- operator or authorized automation identity;
- outcome class;
- outcome timestamp;
- optional revenue or conversion evidence.

This creates the training loop without rewriting history. New evidence produces a
new digest; later outcomes can still be attributed to the exact state that
motivated the action.

## Relationship to the Demand Evidence Gate

The two growth systems answer different questions.

`DEMAND-EVIDENCE-GATE.md` asks:

> Is there enough market evidence to justify progressing a product hypothesis?

This document asks:

> Given a product/campaign hypothesis, which accounts currently carry the strongest
> evidence of fit, timing, and intent?

Product demand evidence must come first. A precise account-ranking system should
not be used to manufacture confidence in a market that has not earned it.

## Verification

Run the focused contract tests with:

```bash
npm run growth:gtm:check
```

The normal repository test suite also discovers `mesh/test/gtm-evidence.test.mjs`.

Current tests pin these boundaries:

- strong, current primary evidence can produce `HIGH_SIGNAL`;
- expired timing evidence cannot continue to raise priority;
- secondary evidence caps confidence;
- one source cannot masquerade as several independent groups;
- stored lane declarations fail closed when they overstate the computed lane;
- the evidence digest changes when the supporting evidence changes.

## Next bounded increment

The next useful step is an **outcome receipt**, not an outreach bot.

That receipt should bind a GTM result to the exact `evidence_digest` used when
the account was prioritized. Once enough receipts exist, campaign learning can
measure which signals actually predicted qualified conversations, trials, paid
pilots, and revenue.

Only after that learning layer is trustworthy should AXIOM consider separately
authorized connectors for CRM updates or outbound actions.
