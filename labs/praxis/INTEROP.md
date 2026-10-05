# Praxis interop research (P0, read-only)

Praxis v0 is an **inert laboratory**: it parses, type-checks, compiles to
inspectable IR, and executes only against explicitly injected synthetic/test
hosts. It has no capability-registry entry, no production route, and grants no
Mesh, Grid, Hypervisor, Sandbox, repository, credential, deployment, spending,
or external-effect authority (README.md, "Current state").

This memo is research only. It changes no semantics, adds no runtime surface,
and promotes nothing. Every interop candidate below is evaluated against the
P0 threat model and halt procedure first; anything that would create a
lab-to-production effect path is a non-goal at P0.

## 1. What could Praxis interoperate with?

### 1a. The AXIOM envelope protocol itself — Praxis as a policy/effect language for envelopes

AXIOM-MESH already thinks in signed envelopes. Relevant surfaces in this repo:

- `docs/rebuild/MEASUREMENT-SOURCE-ENVELOPES.md`: measurement-source envelopes
  bind an evidence `source_ref` and artifact digest to a separately signed
  record (recorder, method, clock, uncertainty, raw-artifact digest) under a
  layered trust sequence: `raw measurement -> signed envelope -> recorder
  trust -> freshness policy -> signed evidence -> still no route authority`.
  This is the same shape as Praxis's epistemic pipeline
  (`Observed -> Verified(Policy) -> Assessment`, README.md): an envelope
  proves a claim about provenance, never authority by itself.
- `docs/architecture/contracts/local-trust-envelope.v1.schema.json` and
  `resource-envelope.v0.schema.json`: versioned envelope schemas as wire
  contracts.
- `agent-commons/adaptive-protection-envelope.v1.json`: treats verification,
  contracting, retention as separate policy dimensions, with the rule
  "verification strength affects evidence confidence, not ambient execution
  authority" — the same non-amplification principle Praxis encodes for
  assessments and collective agreement (P1 corpus:
  `collective-agreement-cannot-amplify-authority`, covered).

Where Praxis fits: AXIOM's envelope ecosystem is evidence plumbing. Praxis's
P0.2/P0.3 chartered-authority path already consumes exactly this kind of
input — a signed charter pins principal kinds, agent→principal bindings,
policy definitions and verifier definitions; authority-grade observations are
separately signed and checked for signer, origin, and freshness before
producing a runtime-branded `Verified` value (README.md, "P0.2 chartered
authority path"). In other words, Praxis already models *what an AXIOM
envelope would need to carry for a chartered issuer to trust it*:
charter/pinned policy digest, operation digest, evidence digests, requester,
nonce, expiry.

The natural interop claim, if it is ever pursued (P2+ territory, not P0), is
not "Praxis executes envelopes" but "Praxis's `praxis-decision-receipt.v0`
and `praxis-ledger-entry.v0` records are *envelope-compatible evidence* that
AXIOM-side verifiers can consume with the same signature/origin/freshness
checks they already apply." The decision receipt was deliberately designed
for this: `ledger.mjs` states receipts are "plain, unbranded records" that
carry no Praxis host-authority symbol, "so they can never satisfy `authorize`,
mint a Permit/Quorum, or serve as granting premises."

### 1b. Other agent policy DSLs — a brief survey

The field splits into decision-point languages (evaluate a request, return
allow/deny) and relationship/graph stores. Praxis is neither; it is an
*effect-authority* language: it models the transitions between knowledge,
operation, authority, preparation, execution, and receipt. That distinction
drives the comparisons below.

**1. OPA / Rego (CNCF graduated).** General-purpose policy engine:
decouple policy logic from application code, evaluate JSON input against
declarative Rego rules, return a decision (typically `{"allow": true/false}`)
via sidecar, library, or central service. Designed to be un-opinionated —
one engine for Kubernetes admission, microservice authz, CI/CD gates —
and deliberately narrow: "no user management, no token issuance, no
identity. Just: here's input, here's policy, give me a decision"
([Medium field guide, 2026](https://medium.com/@adamczyk.maciej01/beyond-scopes-a-field-guide-to-opa-and-where-oauth-hands-off-df841d24c442)).
Rego is a Prolog/Datalog derivative ([dev.to policy-as-code overview](https://DEV.to/orweis/what-is-policy-as-code-7ak)).
Praxis overlaps in the `verify`/`assess` stage (deterministic granting
premises over verified evidence, P0.3, is the same shape as Rego rules over
supplied input), but differs in everything after the decision: OPA stops at
allow/deny; Praxis starts there and continues through linear authority,
durable preparation, irreversible-finality-aware execution, and signed
receipts. Praxis would consume OPA-style evaluations as *assessments* —
veto-only advisory input — never as authority, matching P1's
`assessment/advisor veto-only semantics`.

**2. Cedar (AWS, open source).** A purpose-built authorization language
designed for expressiveness, performance, safety, and analyzability, with
formal verification of its evaluation semantics; the authorization engine is
used by Amazon Verified Permissions / Verified Access and by Amazon
Bedrock AgentCore Policy for AI agents
([AWS Security Blog](https://aws.amazon.com/blogs/security/how-we-designed-cedar-to-be-intuitive-to-use-fast-and-safe/),
[AWS ML Blog](https://aws.amazon.com/blogs/machine-learning/secure-ai-agents-with-policy-in-amazon-bedrock-agentcore/)).
Semantics: default deny, forbid-wins, order-independent evaluation,
loop-free (therefore sandbox-free) evaluation — "Cedar policies do not have
side effects like file system access, system calls, or networking."
Praxis shares Cedar's default-deny and compositional design goals but
addresses a different layer: Cedar answers "is this principal allowed this
action on this resource?"; Praxis answers "given authority was granted, how
is the effect measured, prepared, bounded, and finalized — and what
tamper-evident receipt proves it?" Notably, Cedar's principal/action/resource
triple maps cleanly onto Praxis's `Action @ Scope` with the P0.4 host-owned
operation registry (action, scope, effect label, irreversibility, egress
class) — the host registry is Praxis's answer to Cedar's entity/schema
model, except the host *measures* the effect rather than the client
declaring it.

**3. Zanzibar-style ReBAC (SpiceDB, OpenFGA).** Relationship-graph
authorization: permissions are graph traversals over relationship tuples,
designed for billions of users at Google scale; open implementations use
graph traversal with globally bounded latencies
([Medium, distributed auth 2026](https://medium.com/@agadallh5/distributed-authorization-in-microservices-architecture-patterns-and-trade-offs-773ebc9b0d1f)).
Compared to policy-as-code, graph systems are lower-latency-locality,
centralized, and hard to run at the edge
([permit.io comparison](https://dev.to/permit_io/google-zanzibar-vs-opa-graph-vs-code-based-authorization-3c9b?url=https://dev.to/permit_io/google-zanzibar-vs-opa-graph-vs-code-based-authorization-3c9b)).
Praxis's relationship to ReBAC is complementary: relationship evidence
("A is B's manager") is *knowledge*, and Praxis's core invariant is that
knowledge never becomes authority (`knowledge-cannot-become-authority`,
covered in the P1 corpus). A Zanzibar check result would enter Praxis as
an observation to be verified by a charter-pinned verifier, then used only
as a granting premise — the same treatment as any external evidence.

**4. Oso / Polar.** Application-centric authorization: a declarative
language (Polar, also Datalog-flavored) embedded in application code,
optimized for fine-grained in-app checks and query generation
([Medium, distributed auth 2026](https://medium.com/@agadallh5/distributed-authorization-in-microservices-architecture-patterns-and-trade-offs-773ebc9b0d1f)).
Oso's design goal is developer ergonomics at the application layer; it
trusts the embedding application. Praxis is the inverse bet: the embedding
host is *outside* the P0 protection ("A malicious embedding host remains
outside the protection of the P0 lab," BOOTSTRAP.md), and the runtime
treats compiled IR as hostile input, re-checking authority invariants
regardless of what the compiler emitted. Polar trusts the app; Praxis
distrusts the compiler.

**5. Casbin (PERM model).** Model-driven access control: users supply a
model file (subject, object, action, effect) plus policy, and Casbin
evaluates requests against it in-process. Its design goal is *model
flexibility* — RBAC, ABAC, and hybrids expressed in one PERM metamodel.
Like OPA and Cedar, it terminates at the decision. Praxis would treat a
Casbin evaluation as an assessor: allowed to advise, veto only, never to
mint a permit.

**Where Praxis's measured-effects/charter model differs, in one paragraph:**
OPA, Cedar, Oso, and Casbin all end at the authorization decision; their
threat models assume a trustworthy enforcement point that acts on the
decision. Praxis assumes the enforcement point is where things go wrong:
it models authority as linear and consumable, requires host-*measured*
(rather than source-declared) effect contracts, distinguishes reversible
`commit` from irreversible `finalize` at the language level, and produces
signed, hash-linked evidence of what was decided and what was prepared.
No surveyed DSL has a measured-effect envelope, a charter-pinned policy
digest covering granting premises, or terminal-finality-preserving
receipts. That is Praxis's interop niche — not another PDP, but a
*preparation-and-finality* layer that existing PDPs could feed.

**AuthZEN note:** the OpenID Foundation's AuthZEN 1.0 (March 2026)
standardizes the PEP↔PDP protocol so engines can be swapped without
rewriting enforcement logic
([Medium, distributed auth 2026](https://medium.com/@agadallh5/distributed-authorization-in-microservices-architecture-patterns-and-trade-offs-773ebc9b0d1f)).
If Praxis ever exposes a decision surface to other systems, speaking
AuthZEN at the boundary would be the vendor-neutral choice — but at P0
there is no boundary to speak through.

### 1c. Host embedding — the JS embedding API as an interop surface

The embedding API (`labs/praxis/host.mjs`, re-exported through
`index.mjs`) is Praxis's only execution surface, and it is deliberately
structured as a *capability checklist* rather than an executor:

- `createHostPermit` / `createHostLease` / `createHostQuorum` — raw
  laboratory token constructors, bound to one exact operation digest.
  README.md warns they "must never be exposed to untrusted Praxis source,
  agents, plugins, or remote callers."
- `createSyntheticCharter` — the authority-grade path: Ed25519-signed
  charter pinning principal kinds, agent→principal bindings, policy and
  verifier definitions (with content digests), and optional exact
  `praxis-ir.v0` module digests.
- `createHostOperationRegistry` — host-owned measured operation contracts
  (action, scope, effect label, irreversibility, egress class/destination).
- `createHostSecretRef` / `createHostPreparedRef` — opaque secret
  surrogates and replayable prepared-effect references.
- `run(source, { authorities, secrets, prepared, observations, charter,
  trustedCharterKeys, hostOperations, preparer, executor, completer,
  canceler, verifiers, assessors, ... })` — the interpreter. Every
  authority-bearing input is injected by the host; the language runtime
  itself "contains no network, filesystem-write, subprocess, provider,
  credential, or Grid executor."

As an interop surface this is strong in exactly one way: the host must
supply *everything* consequential, so integration is explicit and
auditable. Its weakness as an interop surface is the mirror image: the
raw constructors are laboratory fixtures, not a secure issuer, and
README.md is explicit that "a future AXIOM adapter must derive these
runtime objects only from already-authorized AXIOM evidence." Any real
interop through this surface requires that future adapter — a P5-stage
artifact (BOOTSTRAP.md: "P5 — constrained authority adapter"), not
something this memo specifies.

## 2. Hard constraints from the inert-lab threat model

The following are *forbidden* for any P0 interop work, derived directly
from the threat model, failure criteria, and halt procedure (README.md):

1. **No lab-to-production effect paths.** The CLI "has no `run` command"
   and "there is intentionally no CLI command that executes effects." Any
   interop that gives a `.prax` program, its IR, or its receipts a path to
   Grid mutation, credential use, deployment, spending, or external
   effects violates P0. Praxis "grants no Mesh, Grid, Hypervisor, Sandbox,
   repository, credential, deployment, spending, or external-effect
   authority."
2. **No ambient authority leakage.** Authority tokens are created only by
   explicit host injection (`createHostPermit(...)` et al. take an exact
   operation digest). An interop surface must not let a token, receipt, or
   ledger entry be *reinterpreted* as authority by another system. This is
   why decision receipts are unbranded by design (ledger.mjs): a receipt
   that another system's verifier could mistake for a permit would be an
   authority-smuggling channel — the exact attack class the P0 corpus
   covers (`authority smuggling inside operation arguments`).
3. **No assessment-to-authority promotion across the boundary.** External
   policy evaluations (OPA/Cedar/Oso/Casbin decisions, Zanzibar checks)
   entering Praxis may only arrive as observations → verified evidence →
   granting premises, or as veto-only advisor output. They must never be
   wired to mint permits. Symmetrically, Praxis receipts leaving the lab
   must carry no host-authority symbol and must be documented as
   evidence-only, so a consuming system cannot treat a signed receipt as
   an authorization.
4. **No weakening of charter pinning.** Signed charters pin program IR
   digests, policy/verifier content digests, quorum membership, and agent
   bindings. An interop integration must not accept "equivalent"
   policies from a foreign DSL without re-pinning: a Cedar policy
   translated into a Praxis granting premise changes the policy digest,
   so the charter must be re-signed by the trust root. Translation across
   DSLs is a *new charter*, never an implicit equivalence.
5. **No production reachability through the conformance corpus or ledger.**
   The semantic corpus (`conformance/semantic-corpus.v0.json`) and the
   audit ledger are fixtures/evidence, not authority sources. Quoting
   ledger.mjs: the ledger adds "evidence-only decision receipts WITHOUT
   making the audit record an authority source."
6. **Halt procedure stays trivial.** "Halting the experiment requires only
   stopping use of `labs/praxis/` and reverting its isolated files/tests.
   No production service, credential, Grid state, or deployment path
   depends on it." Any interop proposal that would make halting require
   coordinating with an external system (revoking cross-system
   credentials, unwinding shared state) fails this constraint and is
   rejected at P0.

Concretely: at P0 the only permissible interop is **read-only,
evidence-shaped, and one-directional-out** — Praxis artifacts (receipts,
canonical digests, corpus fixtures) may be *inspected* by other systems
as evidence; nothing may *act* on them as authority, and nothing
production may act on Praxis input.

## 3. Candidate integration points, ranked

**1. Decision receipts (`praxis-decision-receipt.v0`) as cross-system
evidence.** Highest value, lowest risk. Receipts are already designed as
the portable artifact: plain JSON, canonical-JSON digest conventions,
Ed25519-signed, closed denial codes (`POLICY_UNPINNED`,
`EFFECT_ENVELOPE_DENIED`, `QUORUM_INSUFFICIENT`, ...), explicitly
unbranded so they cannot be mistaken for authority (ledger.mjs). A
foreign verifier (AXIOM envelope consumer, audit pipeline, or another
agent framework) can check the signature, the denial/allow code, and the
bound digests without trusting the Praxis runtime. This is the closest
Praxis has to a wire-ready interop artifact today.

**2. Canonical formatting as a stable wire representation.**
`canonical.mjs` provides `canonicalizePraxis`, `canonicalJsonPraxis`,
`digestPraxis` (`sha256:<hex>`), `operationDigestPraxis`, and
`immutablePraxisSnapshot`. Every cross-system claim in Praxis (operation
descriptors, evidence snapshots, charter bodies, ledger entries) already
goes through these. If any Praxis artifact is ever consumed externally,
the canonical form is the contract — and the corpus already tests
format round-trip stability (fuzz bench: 40 seeded programs, AST-stable
round trips). Ranked second because it is the *enabler* of point 1, not
an integration by itself.

**3. The conformance corpus as an interop contract.**
`conformance/semantic-corpus.v0.json` (`praxis-semantic-conformance.v0`)
encodes invariants as fixtures with explicit coverage states
(`covered`, `covered-as-epistemic-value`,
`covered-compile-time-and-runtime-hostile-ir`, and deliberately visible
`pending`). As an interop contract it says: "any implementation claiming
Praxis-compatibility must deny/allow/leave-uncertain exactly as these
fixtures do." This is the right shape for a future differential target
(P2) and for another team reimplementing the authority checks. Ranked
third because a contract without a second implementation is a
specification, not an integration.

**4. Measured-effect envelopes as verifiable claims.** The P0.4
measured-effect model (host-owned operation registry + signed
per-principal effect envelopes + irreversible `finalize` vs reversible
`commit`) is Praxis's most distinctive contribution, and an effect
envelope is structurally similar to an AXIOM measurement-source envelope.
But at P0 the envelopes are synthetic and host-injected; the measurement
provenance they would need in a real deployment (who measured, with what
method, under what clock — exactly the fields
MEASUREMENT-SOURCE-ENVELOPES.md requires) does not exist. Ranked last:
highest future value, but the most work before it is interop-credible.

## 4. Recommended direction

**Primary: decision receipts as cross-system evidence (point 1), carried
on the canonical wire form (point 2).**

Reasoning: it is the only candidate that satisfies every P0 hard
constraint *today*. Receipts already exist, are already signed, already
use canonical digests, and are already engineered to be authority-inert
("can never satisfy `authorize`, mint a Permit/Quorum, or serve as
granting premises"). Publishing the receipt schema and denial-code
registry as a stable, versioned evidence format lets AXIOM-side audit and
envelope tooling consume Praxis lab output without any lab-to-production
path: the flow is read-only and one-directional-out. It also composes
with the future: a P5 adapter's first job would be turning
already-authorized AXIOM evidence *into* host tokens, and the receipt is
the symmetric artifact for reporting lab decisions *back out*.

**Secondary: conformance corpus as interop contract (point 3).**

Reasoning: the corpus is the cheapest way to make "Praxis-compatible"
mean something checkable by a second party — including a future AXIOM
adapter team or an independent reimplementation of the authority checks.
Keeping the corpus's `pending` states visible (README.md: "missing
semantics must remain visible rather than being inferred") is what makes
it an honest contract rather than marketing. No code changes needed;
the work is curation and versioning discipline.

**Explicit non-goals (P0):**

- No bidirectional policy translation (Praxis ↔ Rego/Cedar/Polar):
  translation would invalidate charter-pinned policy digests and create
  an implicit-equivalence attack surface (constraint 4).
- No AuthZEN / PDP network surface: there is no decision service to
  expose, and exposing one would create a production-adjacent effect
  path (constraints 1, 6).
- No eBPF-adjacent or kernel-level enforcement thinking: Praxis's
  enforcement model is host-injected authority with runtime re-checks,
  not in-kernel program verification; conflating the layers would
  misrepresent both.
- No using external DSL decisions as Praxis authority: foreign
  evaluations enter as evidence/premises or veto-only advice, never as
  minted permits (constraint 3).
- No production-status claims for any of this: the P0 bar is the inert
  laboratory, and this memo does not move it.

## 5. Open questions for Zov

Interop is partly a product call. These need your judgment:

1. **Receipt consumers:** is there a real near-term consumer for
   `praxis-decision-receipt.v0` (e.g., the mesh evidence-chain /
   continuous-audit layer from the 2026-09-22 strategy notes), or
   should the receipt schema stay a lab-internal artifact until P2+?
2. **Envelope alignment:** should future receipt/ledger schemas converge
   toward the AXIOM envelope conventions (`docs/rebuild/`, agent-commons
   envelopes), or stay Praxis-specific with a documented mapping?
3. **Foreign DSL posture:** is the intended long-term relationship
   "Praxis consumes OPA/Cedar-style evaluations as evidence" (advisor
   pattern), "Praxis replaces them for agent-effect governance," or
   "they stay separate tools for separate layers"? This determines
   whether any translation work is ever in scope.
4. **Corpus as public contract:** the conformance corpus is currently a
   lab fixture. Do you want `praxis-semantic-conformance.v0` versioned
   and published as a stability contract other implementations can build
   against, or kept internal until the semantics stop moving?
5. **Charter trust roots:** any cross-system consumption of receipts
   needs a story for who holds the audit signing keys and how trust
   roots are distributed. Is that a design track you want opened now,
   or deferred to P5 adapter work?

---

*Status: P0 inert laboratory. No production authority. No runtime
promotion. This memo is research documentation only.*
