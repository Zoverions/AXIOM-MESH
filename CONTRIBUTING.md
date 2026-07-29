# Contributing to AXIOM-MESH

AXIOM-MESH accepts changes to the supported clean-room Node.js kernel in
`mesh/`, its canonical documentation, and its production/release controls.
The former multi-language runtime is retained only at immutable archive tag
`archive/legacy-main-pre-clean-room-2026-05-21`. Superseded documentation is
retained only on locked branch `deprecated/pre-0.12-documentation-corpus`.
Neither archive is a target for new pull requests.

## Development requirements

- Node.js `>=24.14.0 <25`; CI and the container pin 24.18.0.
- npm `>=11.0.0 <12` for lockfile verification and the repository command
  surface.
- Docker with Compose only when changing the container package.

From a clean checkout, install both committed dependency-free locks and run
the required kernel and release gates:

```bash
npm run setup
```

Use `npm run setup:check` for read-only runtime, policy, lock, lifecycle-script,
and CI/container-pin validation. Use `npm run setup:install` for the exact
script-disabled lock installation without running the full suite. The setup
does not provision credentials or deploy the runtime; see the
[automated source setup boundary](docs/operations/AUTOMATED-SOURCE-SETUP.md).

Do not add a dependency without a threat, licensing, maintenance, integrity,
lockfile, setup-policy, and removal-path review.

## Required checks

Before opening a pull request:

```bash
npm run check
npm run release:verify
```

Container-impacting changes must also build the digest-pinned image and pass
the composed readiness and authenticated operations drill in the `Clean
Kernel` workflow.

## Change requirements

1. Keep privileged behavior fail-closed and add negative-path tests.
2. Update `mesh/config/capabilities.json` when runnable claims change.
3. Regenerate `docs/rebuild/STATUS.md` and governing claim markers with
   `npm --prefix mesh run status:generate`.
4. Update the affected canonical document, operator runbook, and
   `docs/MASTER-TODO.md`.
5. Never commit private keys, tokens, data-protection keys, production data, or
   evidence containing secret values.
6. Target lowercase `main`; do not target
   `deprecated/pre-0.12-documentation-corpus` or the immutable
   `archive/legacy-main-pre-clean-room-2026-05-21` tag.

## Pull requests

Keep changes narrowly scoped, describe the security and rollback impact, link
the requirement or roadmap item, and attach reproducible verification
evidence. A capability is not promoted merely because code exists.

Report security issues through the private process in `SECURITY.md`. Use public
issues for non-sensitive defects with reproduction steps and expected
behavior.
