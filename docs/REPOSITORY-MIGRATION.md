# AXIOM-MESH Repository Migration

**Status:** canonical cutover record

**Cutover date:** 2026-07-28

## Purpose

The GitHub repository previously used `Main` for a broad legacy implementation
and design history. Version 0.11 introduced a verified clean-room kernel, but
its distribution packages intentionally excluded deprecated ancestry in which
removed credential material remained reachable.

The repository now uses lowercase `main` as its only supported development
line. The new line starts from a clean root whose source tree is byte-identical
to the verified 0.11 checkpoint.

## Provenance map

| Artifact | Commit | Purpose |
|---|---|---|
| Former GitHub `Main` | `e65041cb6828a8923e87a3678a104ac40bbf0970` | Deprecated legacy line |
| Verified 0.11 checkpoint | `1d318b481dc03858a4f46b63da05a395adbd7c6f` | Original release-evidence identity |
| Clean-room public baseline | `4082d9349a949879e75fe6b0763e8408c5cfec77` | Tree-identical new root for `main` |

The tree object for the verified checkpoint and clean public baseline is
`9cb841672dc3049f9fbc594b818af8a18e56ba0c`. This proves source-tree identity
without making deprecated parents ancestors of the new default branch.

## Cutover evidence

- GitHub default branch: `main`.
- Supported tip at cutover: `7a89a88b622a7bf042ba310d2eb3cee0260e35f2`.
- Preserved legacy branch:
  `deprecated/legacy-main-pre-clean-room` at
  `e65041cb6828a8923e87a3678a104ac40bbf0970`.
- Kernel and container evidence:
  [GitHub run 30376178779](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30376178779),
  with both `verify` and `container` successful.
- Release:
  [v0.11.0 clean-room production candidate](https://github.com/Zoverions/AXIOM-MESH/releases/tag/v0.11.0)
  with an exact source archive, SPDX SBOM, provenance, and published SHA-256
  checksums.
- `main` is protected with strict required `verify`, `container`, CodeQL
  Actions, and CodeQL JavaScript/TypeScript checks; pull requests, linear
  history, and conversation resolution are required; force pushes and branch
  deletion are disabled.
- The 35 open pull requests that targeted former `Main` were retargeted by
  GitHub to the deprecated branch; none were merged during cutover.
- Unsupported legacy runtime trees and dependency manifests were removed from
  the supported tip after cutover. Their source remains recoverable from the
  clean baseline history and deprecated branch.
- Clean public root `4082d9349a949879e75fe6b0763e8408c5cfec77`
  has no parent.

## Branch policy

- `main`: supported, protected development and release line.
- `deprecated/legacy-main-pre-clean-room`: retained only for historical
  reference and explicitly unsupported.
- local `rebuild-history/0.11.0`: exact checkpoint sequence used to verify the
  release; not the supported public development line.
- local `release-package/0.11.0`: commit containing the complete distribution
  package; not an application source branch.

New work, pull requests, fixes, documentation, tags, and releases target
lowercase `main`.

## Credential boundary

Every credential that ever appeared in deprecated ancestry is permanently
revoked by policy. The cutover does not make an exposed key safe.

Before a pilot deployment:

1. inventory service identities, API principals, deploy keys, Actions secrets,
   package credentials, and external provider credentials;
2. create new values through the supported production provisioner or the
   relevant external secret system;
3. update trust records atomically with service-key rotation;
4. prove no production trust store contains a deprecated public key;
5. revoke old GitHub and provider credentials;
6. preserve only non-secret identifiers and rotation evidence.

## GitHub cutover sequence

1. Push the clean-root source and current documentation to `main`.
2. Wait for kernel and container CI jobs to pass.
3. Change the repository default from `Main` to `main`.
4. Rename the former line to an explicit deprecated legacy name.
5. Protect `main` against deletion and force pushes.
6. Require pull requests and successful kernel/container checks.
7. Publish release 0.11 with checksums, SBOM, provenance, and migration notes.

If CI fails, the default branch is not changed. If a failure is discovered
after cutover, merges pause and `main` is fixed or rolled back to a compatible
clean-room release. Deprecated runtime code is not restored as a production
fallback.

## Verification

Repository cutover evidence must record:

- old and new branch SHAs;
- default-branch API result;
- branch protection settings;
- successful workflow URLs;
- release tag and artifact checksums;
- credential revocation inventory;
- confirmation that the new `main` root has no parent.

The application release remains subject to the
[production readiness tracker](PRODUCTION-READINESS-TRACKER.md); changing the
default branch does not itself promote a production deployment.
