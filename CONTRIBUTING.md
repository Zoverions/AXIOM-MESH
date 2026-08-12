# Contributing to AXIOM-MESH

**Updated:** 2026-08-12

AXIOM-MESH accepts changes to:

- the supported clean-room Node.js kernel in `mesh/`;
- human products and versioned Gateway clients outside the trusted kernel;
- capsules, adapters, conformance tools, managed-node operations, and bounded
  external-effect operators;
- isolated frontier laboratories; and
- canonical documentation, security, production, and release controls.

The former multi-language runtime is retained only at immutable archive tag
`archive/legacy-main-pre-clean-room-2026-05-21`. Superseded documentation is
retained only on locked branch `deprecated/pre-0.12-documentation-corpus`.
Neither archive is a target for new pull requests.

## Development posture

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**

A pull request must state whether its capability is merely built, deliberately
enabled, user/network exposed, production-promoted, or marketed. Code does not
advance automatically through those states.

The capability registry is authoritative for runnable claims. Experimental,
frontier, resolver, operator, and runtime-adapter work may be technically
complete while remaining production-unreachable. In that case the PR and every
current-state document must say so explicitly.

## Development requirements

- Node.js `>=24.14.0 <25`.
- Protected CI and `.node-version` pin Node.js **24.18.0**.
- The candidate production image pins Node.js **24.19.0**.
- npm `>=11.0.0 <12` for lockfile verification and repository commands.
- Docker with Compose only when changing container/service-unit packages.
- Browser/product toolchains only inside separately reviewed application
  boundaries; they must not become kernel dependencies.

From a clean checkout:

```bash
npm run doctor
npm run setup
```

Use `npm run setup:check` for read-only runtime, policy, lock,
lifecycle-script, and CI/production-pin validation. Use
`npm run setup:install` for exact script-disabled lock installation without the
full suite. Setup does not provision production credentials or deploy the
runtime. See the
[automated source setup boundary](docs/operations/AUTOMATED-SOURCE-SETUP.md).

Do not add a dependency without threat, licensing, maintenance, integrity,
lockfile, update, removal, and supply-chain review. Application or adapter
dependencies must not silently enlarge kernel authority.

## Required checks

Before opening a pull request:

```bash
npm run check
npm run release:verify
```

Container-impacting changes must also pass the digest-pinned image, readiness,
deny-egress, and service-isolation checks.

Human-product changes must add applicable browser security, accessibility,
phone usability, privacy, export, deletion, revocation, session, and recovery
tests before exposure.

Adapter, repository-effect, and remote-execution changes must add exact
credential/egress/data-scope/budget/cancellation/retention/replay/failure/
idempotency/uncertainty/rollback/provenance tests.

Frontier experiments must define a hypothesis, threat model, assumptions, test
data, failure criteria, halt procedure, and reproducibility steps.

## Authority invariants

1. Preserve Gateway -> Hypervisor -> Sandbox -> Grid as the normal authority
   path for supported privileged effects.
2. An external-effect adapter/operator may act only from an explicitly reviewed
   durable prepared-effect boundary; registration or connectivity is not
   authority.
3. External I/O must not precede durable preparation evidence.
4. Uncertain external outcomes must remain recoverable/uncertain; never invent
   success.
5. Completion evidence must bind a verified operator/adapter receipt to the
   exact preparation.
6. A proposal mechanism is not merge authority. The current repository operator
   is docs-only, creates an open draft pull request, and has no direct-main or
   merge operation; do not widen that boundary implicitly.
7. Agent Runtime Adapter integration must preserve native AXIOM authorization,
   cancellation, idempotency, receipt, and rollback semantics and must not grant
   direct Grid/Hypervisor/Sandbox authority.

## Change requirements

1. Keep privileged behavior fail-closed and add negative-path tests.
2. Update `mesh/config/capabilities.json` only when runnable claims and their
   executable evidence actually change.
3. Regenerate `docs/rebuild/STATUS.md` and governing claim markers with
   `npm --prefix mesh run status:generate` after registry changes.
4. Update every affected canonical document: product definition, requirements,
   status, roadmap, execution queue, readiness tracker, release notes, white
   paper, threat model, and operator/user runbooks as applicable.
5. For defects/security fixes, search the supported tree for equivalent patterns
   and fix or explicitly justify each matching site; add class-level regression
   coverage, not only one-instance coverage.
6. Add/update rollback, uninstall, migration, recovery, and decommissioning for
   every exposed component.
7. Never commit private keys, tokens, data-protection keys, production data,
   plaintext user data, or evidence containing secret values.
8. Target lowercase `main`; never target the deprecated documentation branch or
   immutable archive tag.

## Documentation matrix

- Runtime/evidence change: registry/status if applicable, requirements, project
  status, release notes, runbook, traceability, and white paper where material.
- Machine-principal change: threat model, policy/authority docs, client surface,
  receipts/discovery claims, readiness, and non-claims.
- Grid-evidence change: threat model, traceability, readiness, recovery/anchor
  runbooks, and exact proof/non-proof language.
- External-effect/operator change: target authorization, prepared-effect/outbox
  semantics, credential/egress boundary, uncertainty/idempotency, signed receipt,
  rollback, production reachability, and explicit merge/direct-main non-claims.
- Product/UX change: product definition, requirements, roadmap/queue, status,
  release notes, accessibility/security evidence, and white paper.
- Promotion/deployment change: readiness tracker, production-grade definition,
  project status, release notes, and immutable evidence.
- Laboratory change: roadmap/queue, experiment manifest, isolation boundary,
  explicit non-claim, and capability state where applicable.

## Pull requests

Keep each pull request reviewable and describe:

- user/operator outcome;
- affected authority and data boundaries;
- built/enabled/exposed/promoted/marketed state;
- threat/abuse cases;
- failure, uncertainty, idempotency, and rollback behavior;
- compatibility/migration impact;
- evidence and commands used to validate it; and
- documentation/claim changes.

A capability is not promoted merely because code exists. A draft PR is not a
merge. A preview is not a production service. A synthetic fixture is not a live
pilot. A runtime contract is not certification of an external runtime. A
laboratory is not a public network or audited economic system.

Report security issues through the private process in `SECURITY.md`. Use public
issues for non-sensitive defects with reproduction steps and expected behavior.