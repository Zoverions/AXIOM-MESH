# Books and Architecture

AXIOM-MESH did not begin as a claim that software can settle political philosophy. It began from a narrower question: **what would it take to make limits on authority explicit, inspectable, revocable, and difficult to bypass?**

The books below are the conceptual background for that question. They are not implementation evidence. A philosophical argument does not prove that a security boundary works, and a passing test does not prove that the surrounding institution is legitimate.

That separation is intentional.

## 1. New Minds

**Full title:** *New Minds: Agency, Sentience, and Freedom Beyond Biology* — ZOVERIONS

This is the closest conceptual companion to AXIOM-MESH.

The book separates three questions that public discussion often collapses:

- **Capability** — what a system can do.
- **Authority** — what it is permitted to do.
- **Moral standing** — whether what happens to it can matter from its own point of view.

Those axes do not rise together. A highly capable system may have very narrow authority. A system may someday deserve moral protection without being entitled to control infrastructure. A non-sentient agent can still create severe governance risk if it is granted excessive authority.

The engineering consequence is immediate:

> **Reachability, discovery, and capability never create authority on their own.**

The book's **Sovereign Agency Test** asks ten questions of any actor exercising meaningful power: identity, capability, authority, purpose, consent, evidence, revocation, appeal, continuity/exit, and legitimacy.

Its **Nine Rules for Governing New Minds** include:

1. Intelligence is not sentience.
2. Capability is not authority.
3. Authority is not legitimacy.
4. Evidence is not truth.
5. Missing authority should stop high-risk action.
6. Rights are not unlimited permissions.
7. Continuity matters.
8. Power must be challengeable.
9. Higher-level intelligence does not erase its components.

AXIOM-MESH operationalizes only part of that framework. It attempts to make identity, explicit authority, scoped purpose, consent, revocation, evidence, and fail-closed behavior concrete enough to test. It does not claim to solve consciousness, moral standing, legitimacy, or political representation.

## 2. The Constitution of Parallel Societies

**Full title:** *The Constitution of Parallel Societies: A Practical Framework for Building Free, Resilient, and Humane Institutions* — ZOVERIONS

Where *New Minds* focuses on agents and possible new minds, *The Constitution of Parallel Societies* focuses on institutions.

Its relevant commitments include:

- distributed and limited authority;
- specific, recorded, purpose-linked powers;
- evidence and preserved uncertainty;
- reversibility and rollback;
- due process and meaningful appeal;
- technology operating under identifiable human/institutional responsibility;
- meaningful exit;
- no mechanism becoming legitimate merely because it is technically enforceable.

One of the book's central distinctions is directly relevant to this repository:

> **Technical authorization is not political legitimacy. Verification is not truth.**

That is why AXIOM-MESH treats cryptographic evidence as evidence about process, identity, continuity, and exact recorded events — not as proof that an underlying factual or moral conclusion is correct.

## 3. Many Minds and the wider corpus

The wider Zoverions corpus explores coordination among many agents, higher-level agency, institutional emergence, cognition, education, production, and speculative ontology.

Those works may motivate future research questions, but they do not automatically become AXIOM-MESH requirements. The repository's current behavior is governed by its own normative requirements, capability registry, threat model, status documents, tests, and release gates.

In particular, AXIOM-MESH does **not** depend on speculative cosmology elsewhere in the corpus. The engineering case for bounded authority should survive if every cosmological speculation is false.

## 4. The firewall between books and code

Use the relationship this way:

| Layer | What it contributes | What it cannot prove |
|---|---|---|
| Books | Questions, distinctions, normative arguments, failure modes | That software implements them correctly |
| Requirements | Explicit engineering obligations | That the implementation satisfies them |
| Code and tests | Executable mechanisms and reproducible behavior | That every relevant threat was considered |
| Threat model and review | Adversarial assumptions and known limits | That unknown attacks do not exist |
| Evidence and release gates | What was actually checked for a specific build | Universal truth, moral legitimacy, or future safety |

The intended loop is:

```text
philosophical distinction
        ↓
engineering requirement
        ↓
implementation
        ↓
negative test / adversarial review
        ↓
evidence
        ↓
claim narrow enough to survive the evidence
```

If the code cannot support the claim, narrow the claim.

If the philosophical principle cannot survive contact with implementation, revise the principle.

That is what a living framework is for.

## 5. Where to start

For the engineering argument:

1. Read [`AGENT-ENTRY.md`](../../AGENT-ENTRY.md).
2. Read the [current threat model](../security/CURRENT-BUILD-THREAT-MODEL.md).
3. Inspect the [capability registry](../../mesh/config/capabilities.json).
4. Run the verification path in the root README.
5. Try the [red-team challenge](RED-TEAM-CHALLENGE.md).

For the conceptual argument, start with *New Minds*, especially **The Three Ladders**, **Permission Is Not Capability**, **Accountability Needs a Trail**, **Exit Must Be Real**, and the appendices.

## Publication links

Canonical retail or author-page links should be added here only when the exact current editions are verified. The repository should not point readers to stale or superseded editions merely to have a link.
