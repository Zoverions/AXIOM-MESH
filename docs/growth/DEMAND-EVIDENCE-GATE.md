# Demand Evidence Gate

The Demand Evidence Gate prevents AXIOM-MESH, MAJIK, Axiom One, and related product work from treating attention, enthusiasm, or semantic scores as proof that a market should be built.

It is a growth/product decision aid only. It does **not** grant runtime authority, approve spending, authorize deployment, change capability status, or bypass security/promotion gates.

## Principle

> Evidence before product investment.

The sequence is:

**person -> existing spend -> repeated pain -> desired outcome / switch condition -> owned intent -> paid commitment -> build**

A product hypothesis may advance only when the evidence package for that hypothesis satisfies the deterministic gate in `mesh/src/check-demand-evidence.mjs`.

## Gate states

| State | Meaning | Allowed next move |
|---|---|---|
| `DISCOVERY` | Interesting signal exists, but the pain is not yet independently established among paying or strongly committed users. | Continue research; do not present the wedge as validated. |
| `PROBE` | Independent firsthand evidence shows repeated pain, including confirmed paying users and explicit desired outcomes. | Run the cheapest owned test of the offer: landing page, interview, waitlist, or other reversible probe. |
| `VALIDATE` | The `PROBE` bar is met and an AXIOM-owned experiment has produced at least five independent intent signals, including at least two waitlist-or-stronger commitments. | Test willingness to pay and the narrowest deliverable. Do not infer production readiness. |
| `BUILD` | `VALIDATE` is met and at least three independent owned observations are paid preorders or paid pilots. | A bounded product build may be justified, subject to normal engineering, security, legal, privacy, spending, and deployment gates. |

These are default evidence floors, not universal laws of entrepreneurship. Changing them is a reviewable policy change. A lower-status package may never declare a higher state merely because an agent or operator prefers the idea.

## What counts

Each evidence package under `docs/growth/evidence/` records observations with explicit provenance.

Strong evidence can be:

- a firsthand report from someone describing their own workflow or problem;
- a firsthand feature/request description that gives concrete current workarounds and a desired outcome;
- an AXIOM-owned experiment such as an interview, waitlist, paid preorder, or paid pilot. An `owned_experiment` row can advance `VALIDATE` or `BUILD` only when `owned_experiment_ref` names a separate `docs/growth/owned-experiments/*.json` provenance receipt in the repository and that receipt explicitly binds the observation ID to `Zoverions/AXIOM-MESH`.

Secondary snapshots and aggregations may be retained for discovery, but they do not satisfy the strong independent-evidence threshold. Evidence packages and observations are rejected when dated after the evaluation date. A package may accumulate later observations over time as long as those observations already exist when the gate is evaluated.

The checker counts **independence groups**, not raw rows. A single source URL is not allowed to map to multiple independence groups, so repeating one thread under invented group IDs cannot inflate the gate. Multiple distinct source URLs may still belong to one independence group when they refer to the same person or experiment participant.

## Semantic assistance is advisory

Raw feedback is unstructured. A semantic model may help classify passages into candidate pain tags, desired outcomes, payer signals, or likely switch conditions.

TypeSafe System One is a good fit for this enrichment lane because its current model is built around typed `Choice`, `Noul`, and `Score` judgments with probabilities, while code retains control of the workflow. Relevant current documentation includes:

- https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md
- https://docs.typesafe.ai/patterns/composite-scoring.md
- https://docs.typesafe.ai/cookbooks/hierarchical_classification.md

But semantic output is **not** market authority. An agent may suggest a tag; the evidence record must still preserve the source and reviewed structured claim. The deterministic gate uses the reviewed evidence package, not an opaque model score.

This preserves the project boundary:

**Knowledge -> Operation -> Authority**

Market knowledge can recommend an experiment. It cannot authorize a build, deployment, purchase, or external effect by itself.

## Initial wedge: provider-independent personal continuity

Hypothesis: a high-usage professional who pays for one or more frontier AI products and depends on long-running project work has a real problem when memory, project state, and workflow continuity remain bound to individual providers or chats.

The initial evidence package is:

`docs/growth/evidence/majik-multi-ai-continuity-2026-09-18.json`

The current computed state is **`PROBE`**:

- 6 recorded observations;
- 5 strong independent groups;
- 3 groups explicitly identify a paid plan;
- 4 independent groups report `context_loss`;
- 5 groups describe concrete desired outcomes;
- 0 AXIOM-owned intent observations;
- 0 AXIOM-owned paid commitments.

The evidence supports testing the wedge. It does **not** support claiming product-market fit or starting a large build because people have not yet demonstrated intent to obtain this capability from us.

## Offer probe

The narrow promise to test is:

> **Bring your project context once. Keep it user-controlled, verifiable, and portable across the AI providers you choose.**

The first owned experiment should test the person and promise before adding features.

1. Present the promise to high-usage paid AI users who maintain long-running work across chats or providers.
2. Ask what they use now, what they pay for, the workaround they maintain, and what would have to be true for them to switch or add this service.
3. Record each observation as a new provenance-bearing row rather than summarizing sentiment into one score.
4. Start with a no-card early-access/waitlist probe.
5. Only after meaningful owned intent, test a transparent paid reservation or paid pilot. Any live payment experiment remains subject to the normal deployment/payment approval boundary.
6. Do not widen the promised product merely to improve conversion.

A useful first product can therefore be much narrower than the full MAJIK/AXIOM vision: **portable project continuity with permissioned provider handoff**. Personal-model depth, provider routing, agents, coaching, marketplace features, and broader sovereign infrastructure can remain downstream capabilities rather than being bundled into the first demand test.

## Failure conditions

Stop or reframe the hypothesis when:

- users complain but do not already spend money or meaningful time on the problem;
- the pain does not recur across independent people;
- desired outcomes conflict materially;
- users want a feature but will not join, trial, reserve, or pay for it;
- the wedge requires violating AXIOM privacy, consent, authority, portability, or security boundaries;
- the economic value depends primarily on locking the user into our provider rather than making the user's state portable.

## Verification

Run:

```bash
npm run growth:demand:check
```

The command fails closed when an evidence package is malformed, contains unknown fields, is future-dated, overstates its computed gate state, splits one source URL across multiple independence groups, labels owned evidence without a repository-backed provenance receipt, or attempts to count weak secondary snapshots as strong independent evidence.

The normal repository `npm run check` also runs the gate checker, so a documented demand state cannot silently drift above its evidence.
