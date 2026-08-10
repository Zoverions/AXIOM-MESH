# Contributing to AXIOM-MESH

AXIOM-MESH accepts changes to:

- the supported clean-room Node.js kernel in `mesh/`;
- human products and versioned Gateway clients outside the trusted kernel;
- capsules, adapters, conformance tools, and managed-node operations;
- isolated frontier laboratories;
- canonical documentation, security, production, and release controls.

The former multi-language runtime is retained only at immutable archive tag
`archive/legacy-main-pre-clean-room-2026-05-21`. Superseded documentation is
retained only on locked branch `deprecated/pre-0.12-documentation-corpus`.
Neither archive is a target for new pull requests.

## Development posture

Contributions follow:

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**

A pull request must state whether its capability is merely built, deliberately
enabled, user/network exposed, production-promoted, or marketed. Code does not
advance automatically through those states.

The capability registry is authoritative for runnable claims. Experimental and
frontier work must remain disabled by default and isolated from production
identities, secrets, user data, real value, and public authority.

## Development requirements

- Node.js `>=24.14.0 <25`; CI and the candidate container pin 24.18.0.
- npm `>=11.0.0 <12` for lockfile verification and repository commands.
- Docker with Compose only when changing container or service-unit packages.
- Browser/product toolchains only within their separately reviewed application
  boundary; they must not become kernel dependencies.

From a clean checkout:

```bash
npm run doctor
npm run setup
```

Use `npm run setup:check` for read-only runtime, policy, lock,
lifecycle-script, and CI/container-pin validation. Use
`npm run setup:install` for exact script-disabled lock installation without the
full suite. Setup does not provision production credentials or deploy the
runtime. See the
[automated source setup boundary](docs/operations/AUTOMATED-SOURCE-SETUP.md).

Do not add a dependency without threat, licensing, maintenance, integrity,
lockfile, update, removal, and supply-chain review. Application dependencies
must not silently enlarge kernel authority.

## Required checks

Before opening a pull request:

```bash
npm run check
npm run release:verify
```

Container-impacting changes must also build the digest-pinned image and pass
the protected container, readiness, deny-egress, and service-isolation checks.

Human-product changes must add the applicable browser security, accessibility,
phone usability, privacy, export, deletion, revocation, session, and recovery
tests before exposure.

Adapter and remote-execution changes must add credential, egress, data-scope,
budget, cancellation, retention, replay, failure, uninstall, rollback, and
provenance tests.

Frontier experiments must define a hypothesis, threat model, assumptions, test
data, failure criteria, halt procedure, and reproducibility steps.

## Change requirements

1. Preserve the Gateway → Hypervisor → Sandbox → Grid path for every
   privileged or externally visible effect.
2. Keep privileged behavior fail-closed and add negative-path tests.
3. Update `mesh/config/capabilities.json` only when runnable claims and their
   executable evidence change.
4. Regenerate `docs/rebuild/STATUS.md` and governing claim markers with
   `npm --prefix mesh run status:generate` after registry changes.
5. Update every affected canonical document, including product definition,
   requirements, status, roadmap, execution queue, readiness tracker, release
   notes, white paper, threat model, and operator/user runbook as applicable.
6. For every defect or security fix, search the supported tree for equivalent
   patterns and either backfill the fix everywhere it applies or record why a
   matching site is intentionally different; add regression coverage for the
   class, not only the first instance.
7. Add or update rollback, uninstall, migration, recovery, and decommissioning
   procedures for every exposed component.
8. Never commit private keys, tokens, data-protection keys, production data,
   plaintext user data, or evidence containing secret values.
9. Target lowercase `main`; do not target the deprecated branch or immutable
   archive tag.

## Documentation matrix

- Runtime/evidence change: registry, generated status, requirements, project
  status, release notes, runbook, and white paper where material.
- Product/UX change: product definition, requirements, roadmap, execution
  queue, project status, release notes, and white paper.
- Promotion/deployment change: readiness tracker, production-grade definition,
  project status, release notes, and immutable evidence.
- Security-boundary change: threat model, requirements, affected runbook,
  readiness tracker, and independent-review scope.
- Laboratory change: roadmap/queue item, experiment manifest, isolation
  boundary, explicit non-claim, and capability status where applicable.

## Pull requests

Keep each pull request reviewable and describe:

- user or operator outcome;
- affected authority and data boundaries;
- built/enabled/exposed/promoted/marketed state;
- threat and abuse cases;
- failure and rollback behavior;
- compatibility and migration impact;
- evidence and commands used to validate it;
- documentation and claim changes.

A capability is not promoted merely because code exists. A preview is not a
production service. A synthetic fixture is not a live pilot. A laboratory is
not a public network or audited economic system.

Report security issues through the private process in `SECURITY.md`. Use public
issues for non-sensitive defects with reproduction steps and expected behavior.
