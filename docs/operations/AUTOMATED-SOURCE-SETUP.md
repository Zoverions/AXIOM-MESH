# Automated Current-Build Source Setup

**Applies to:** `0.12.0-dev.3`

**Status:** implemented current-build source and verification automation

**Updated:** 2026-07-29

## Current-build setup boundary

AXIOM-MESH has one supported source setup path for the current development
build. The machine-readable policy is
[`mesh/config/setup.json`](../../mesh/config/setup.json), and the fail-closed
implementation is
[`mesh/src/setup.mjs`](../../mesh/src/setup.mjs). The policy binds the source
setup to:

- Node.js `>=24.14.0 <25`;
- Node.js `24.18.0` in protected CI, `.node-version`, and the candidate
  production image;
- npm `>=11.0.0 <12`;
- npm lockfile version 3;
- the root command surface and `mesh/` kernel as the only workspaces;
- both committed dependency-free lockfiles;
- installation with lifecycle scripts, audit requests, funding requests, and
  package writes disabled;
- the full clean-kernel and release-readiness commands.

The setup verifier reads the policy, both package manifests, both lockfiles,
`mesh/.node-version`, the candidate Dockerfile, and the protected workflow. It
rejects an unknown policy field as well as a missing field. It also rejects
runtime-range drift, version drift, command drift, an additional workspace,
any dependency entry, an install lifecycle script, a non-root lock entry, or a
CI/container pin that no longer matches the policy.

This boundary applies to a clean checkout of the current `main` source line.
The immutable `v0.11.0` release and the locked
`deprecated/pre-0.12-documentation-corpus` branch retain their own historical
instructions. They are not alternate setup paths for this build.

## One-command setup

From the repository root, run:

```bash
npm run setup
```

That command performs three ordered operations:

1. it checks the current Node.js and npm versions and validates all setup
   inputs before installation;
2. it applies `npm ci --ignore-scripts --no-audit --no-fund` to the root and
   `mesh/` committed locks, then proves that neither lock changed;
3. it runs `npm run check` and `npm run release:verify`.

Success prints a non-secret JSON receipt. The receipt identifies the policy
schema and digest, kernel version, detected Node.js and npm versions,
CI/production runtime pins, lockfile version, workspace and installed-package
counts, lock digests, installation state, and whether full verification
completed. It always reports `production_credentials_created: false`.

For a read-only prerequisite and drift check, use:

```bash
npm run setup:check
```

This does not install packages or write repository state. For exact lock
installation without the full test and release suite, use:

```bash
npm run setup:install
```

The shorter command is the protected-CI installation surface. It is also
useful when a contributor wants to install first and run a focused test before
the full checks. `npm run setup` remains the documented clean-checkout
acceptance command.

Commands may also be invoked from `mesh/` using the same script names. The
implementation still resolves and verifies the repository root, so the setup
boundary is identical from either command surface.

## Dependency and lifecycle policy

The current kernel contains no third-party npm packages. Each committed
lockfile contains only its root package entry, and the setup receipt must
report `dependency_packages: 0`. The verifier examines all npm dependency
classes:

- `dependencies`;
- `devDependencies`;
- `optionalDependencies`;
- `peerDependencies`;
- `bundleDependencies`;
- `bundledDependencies`.

An absent or empty dependency object is acceptable. Any named package fails
the setup check. A dependency cannot be introduced by editing only a lockfile:
each lock is required to contain exactly the root entry and exact current
package metadata.

The repository also prohibits `preinstall`, `install`, `postinstall`, and
`prepare` scripts in both package manifests. npm is invoked with
`--ignore-scripts`, and the child environment repeats that restriction with
`npm_config_ignore_scripts=true`. This is deliberate defense in depth: a
manifest that adds an installation hook fails validation, while npm remains
instructed not to execute one.

Installation uses `npm ci`, never dependency resolution through `npm install`.
The command disables audit and funding network requests because there are no
dependency packages to query. It disables package saving and requires package
locks. The setup implementation locates the npm CLI supplied by the active
Node.js toolchain, executes it with the already validated Node.js executable,
and fails if npm cannot be located or its version cannot be verified.

The dependency-free status is a current-build fact, not a permanent ban on
reviewed dependencies. A future dependency requires the threat, license,
maintenance, integrity, and removal-path review described in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md). Introducing one also requires an
intentional setup-policy and test change. It cannot pass merely because a
manifest and lock were regenerated together.

## CI and production separation

Protected CI uses `npm run setup:install` before the clean-kernel and release
checks. The release verifier independently calls the setup-state validator and
includes its result in release provenance. Consequently, weakening or
bypassing the workflow command, changing the Node.js pin, changing a lock, or
adding an install hook blocks both the normal kernel check and release
verification.

Source setup does not provision a runtime identity. It does not create:

- Ed25519 service or transport private keys;
- API, operator, or telemetry relay tokens;
- the data-protection key;
- production trust records or provider material;
- a Grid database, backup, or operational evidence artifact.

Production credential generation remains an explicit operator action against
two named, access-controlled directories:

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

Those commands have different authority and failure consequences from source
setup. They are documented in
[`mesh/PRODUCTION.md`](../../mesh/PRODUCTION.md) and are never called by the
setup automation.

The source setup command also does not start development services, build a
container, deploy a container, modify a remote repository, or promote a
release. Those remain separate, observable operator or protected-workflow
steps.

## Failure behavior and non-claims

Setup is fail-closed. Validation runs before either workspace installation. A
nonzero npm result stops the sequence. After installation, all setup inputs
are read again and both lock digests must match their pre-install values. Full
verification starts only after this second validation succeeds. A failed
check or release verifier makes the one-command setup fail.

The automation intentionally does not install Node.js, npm, Git, Docker,
Compose, operating-system packages, a container runtime, or host security
controls. Node.js and npm are host prerequisites because silently acquiring
and executing a toolchain would enlarge the setup trust boundary. Docker and
Compose are required only for container-impacting work and protected
container verification.

The exact Node.js `24.18.0` pin is the CI and candidate-production target.
Local Node.js versions from `24.14.0` up to, but not including, 25 are accepted
for development checks; the receipt records the detected version. npm versions
from 11.0.0 up to, but not including, 12 are accepted. A future pin or range
change requires a policy change, matching package/lock/workflow/container
updates, negative-test review, and release-verifier agreement.

Passing `npm run setup` proves that the current source inputs installed from
the two committed zero-dependency locks and passed the repository's automated
kernel and release gates in the caller's environment. It does not prove:

- that the host operating system or Node.js distribution is independently
  attested;
- that the candidate container passed on the caller's host;
- that production credentials, external custody, or a deployment exist;
- that a pilot has run for the required observation window;
- that an independent security review occurred;
- that `0.12.0-dev.3` is production-promoted.

Those claims require their own signed evidence and promotion gates. Setup
automation narrows and records the source-installation boundary; it does not
substitute for deployment, operational, custody, pilot, or review evidence.
