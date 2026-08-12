# Automated Current-Build Source Setup

**Applies to:** `0.12.0-dev.3`

**Status:** implemented current-build source and verification automation

**Updated:** 2026-08-12

## Current-build setup boundary

AXIOM-MESH has one supported source setup path for the active development build.
The machine-readable policy is
[`mesh/config/setup.json`](../../mesh/config/setup.json), and the fail-closed
implementation is [`mesh/src/setup.mjs`](../../mesh/src/setup.mjs).

The policy binds source setup to:

- Node.js `>=24.14.0 <25`;
- Node.js **24.18.0** in protected CI and `.node-version`;
- Node.js **24.19.0** in the candidate production image;
- npm `>=11.0.0 <12`;
- npm lockfile version 3;
- the root command surface and `mesh/` kernel as the only workspaces;
- both committed dependency-free lockfiles;
- installation with lifecycle scripts, audit requests, funding requests, and
  package writes disabled; and
- the full clean-kernel and release-readiness commands.

The setup verifier reads the policy, both package manifests, both lockfiles,
`mesh/.node-version`, the candidate Dockerfile, and the protected workflow. It
rejects unknown or missing policy fields, runtime-range drift, CI or production
pin drift, command drift, additional workspaces, dependency entries,
installation lifecycle scripts, non-root lock entries, or source inputs that no
longer match policy.

CI and production pins are deliberately independent policy fields. They are not
required to be the same version; each must match its own declared authority.

This boundary applies to a clean checkout of the current `main` source line.
Immutable `v0.11.0` and the locked
`deprecated/pre-0.12-documentation-corpus` branch retain historical material;
they are not alternate setup paths for this build.

## One-command setup

From repository root:

```bash
npm run setup
```

That command performs three ordered operations:

1. validate the current Node.js/npm versions and all machine-readable setup
   inputs before installation;
2. run `npm ci --ignore-scripts --no-audit --no-fund` against the root and
   `mesh/` committed locks, then prove neither lock changed; and
3. run `npm run check` and `npm run release:verify`.

Success prints a non-secret JSON receipt identifying the policy schema/digest,
kernel version, detected Node/npm versions, separate CI/production pins,
lockfile version, workspace/installed-package counts, lock digests,
installation state, and full-verification result. It always reports
`production_credentials_created: false`.

For a read-only prerequisite/drift check:

```bash
npm run setup:check
```

For exact lock installation without the full test/release suite:

```bash
npm run setup:install
```

The shorter install command is the protected-CI installation surface and is
useful before focused local tests. `npm run setup` remains the clean-checkout
acceptance command.

The same scripts may be invoked from `mesh/`; the implementation still resolves
and verifies the repository root.

## Dependency and lifecycle policy

The current kernel contains no third-party npm packages. Each committed lockfile
contains only its root package entry, and the setup receipt must report
`dependency_packages: 0`.

The verifier checks every npm dependency class:

- `dependencies`;
- `devDependencies`;
- `optionalDependencies`;
- `peerDependencies`;
- `bundleDependencies`;
- `bundledDependencies`.

Absent/empty dependency objects are valid. Any named package fails the current
setup check. A dependency cannot be smuggled in by editing only a lockfile: each
lock must contain exactly its root entry and current package metadata.

`preinstall`, `install`, `postinstall`, and `prepare` scripts are prohibited in
both package manifests. npm is also invoked with `--ignore-scripts`, and the
child environment repeats that restriction with
`npm_config_ignore_scripts=true`. This is deliberate defense in depth.

Installation uses `npm ci`, not dependency resolution through `npm install`.
Audit/funding requests are disabled because there are no dependency packages to
query. Package saving is disabled and package locks are required.

Zero dependencies is a current-build fact rather than a permanent prohibition.
A future dependency requires the threat, licence, maintenance, integrity,
update, removal, and supply-chain review in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), plus an intentional policy/test
change.

## CI and production separation

Protected CI uses `npm run setup:install` before clean-kernel and release checks.
The release verifier independently evaluates setup state and includes it in
release provenance.

The exact current pins are:

```text
supported engine:          >=24.14.0 <25
protected CI/.node-version: 24.18.0
candidate production image: 24.19.0
npm:                        >=11.0.0 <12
```

The candidate Dockerfile is therefore expected to use Node.js 24.19.0 while the
protected CI workflow and `.node-version` remain at 24.18.0. Changing either
value without its matching setup-policy update fails verification.

Source setup does not provision runtime identities or create:

- Ed25519 service/transport private keys;
- API, operator, or telemetry tokens;
- the data-protection key;
- production trust/provider material;
- Grid databases, backups, or operational evidence.

Production credential generation remains an explicit operator action:

```bash
npm run provision:production -- /srv/axiom-mesh/data /srv/axiom-mesh/secrets
```

Independent service-unit projection is separately explicit:

```bash
npm run provision:units -- \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets/transport \
  /srv/axiom-mesh/units
```

Those commands have different authority/failure consequences from source setup
and are documented in [`mesh/PRODUCTION.md`](../../mesh/PRODUCTION.md). Setup
never calls them.

Source setup also does not start services, build/deploy a container, modify a
remote repository, activate the production-unreachable repository-effect
operator, or promote a release.

## Failure behavior and non-claims

Setup is fail-closed. Validation runs before either workspace installation. A
nonzero npm result stops the sequence. After installation, all setup inputs are
read again and both lock digests must equal their pre-install values. Full
verification starts only after that second validation succeeds.

The automation intentionally does not install Node.js, npm, Git, Docker,
Compose, OS packages, a container runtime, or host-security controls. Silently
acquiring a toolchain would enlarge the setup trust boundary.

Local Node.js versions from 24.14.0 up to but not including 25 are accepted for
source checks. The receipt records the detected local version. Protected CI and
the candidate image remain bound to their distinct exact policy pins. npm 11.x
within the declared range is accepted.

A future pin/range change requires a policy change plus matching package/lock,
workflow, Dockerfile, negative-test, documentation, and release-verifier
updates.

Passing `npm run setup` proves that current source inputs installed from the two
committed zero-dependency locks and passed repository kernel/release gates in
the caller's environment. It does **not** prove:

- host OS or Node distribution attestation;
- candidate-container success on the caller's host;
- production credentials, custody, or deployment;
- a live pilot or required observation window;
- independent security review;
- production repository-effect activation;
- external-runtime certification; or
- production promotion of `0.12.0-dev.3`.

Those claims require their own evidence and promotion gates.