# AXIOM-MESH Repository Migration

**Status:** canonical provenance and archive record

**Current build:** `0.12.0-dev.0`

**Cutover date:** 2026-07-28

**Documentation boundary updated:** 2026-07-29

## Purpose

The repository previously combined a broad multi-language implementation,
generated documentation, research, audits, installers, contracts, and
deployment narratives on a branch named `Main`. Some reachable historical
objects also contained credential candidates. The supported kernel therefore
moved to a clean-root lowercase `main` line whose initial tree was identical to
the verified 0.11 checkpoint without inheriting the former ancestry.

The published `v0.11.0` release remains immutable. Development after that tag
is identified as `0.12.0-dev.0`. Unsupported code and documentation are absent
from `main`; specifically named immutable or locked archives preserve their
provenance.

## Provenance map

| Artifact | Identity | Current purpose |
|---|---|---|
| Former `Main` tip | `e65041cb6828a8923e87a3678a104ac40bbf0970` | Unsupported pre-clean-room history preserved by immutable tag `archive/legacy-main-pre-clean-room-2026-05-21` |
| Verified 0.11 checkpoint | `1d318b481dc03858a4f46b63da05a395adbd7c6f` | Original source checkpoint used during clean-room verification |
| Clean public root | `4082d9349a949879e75fe6b0763e8408c5cfec77` | Parentless root for supported `main` |
| Published baseline | Git tag `v0.11.0` | Immutable release source, checksums, SPDX SBOM, and provenance |
| Pre-0.12 documentation corpus | branch `deprecated/pre-0.12-documentation-corpus` at `8083651349d40786fb0761de897859c55947ddd6` | Unsupported read-only archive of the complete 266-file documentation tree before current-build curation |
| Active development | protected branch `main` | Only supported code and documentation line |

The verified 0.11 checkpoint and clean public baseline shared tree object
`9cb841672dc3049f9fbc594b818af8a18e56ba0c`. This records source-tree
identity without making the former ancestry a parent of the supported line.

## Current archive policy

`main` is the only supported development and release branch. It requires
kernel, container, and CodeQL verification; force pushes and deletion are
disabled.

`deprecated/pre-0.12-documentation-corpus` is intentionally not a development
branch. It is locked, rejects force pushes, cannot be deleted, and exists only
to preserve documents removed from `main`. Pull requests, fixes, version
changes, and release work must not target it.

The pre-clean-room implementation is preserved as an immutable tag rather than
an active branch. Neither archive is a deployment target or a source of
current product claims.

## Supported documentation boundary

Every file under `docs/` on `main` supports the active build. The documentation
checker enforces an exact allowlist, required sections, minimum content,
security-policy parity, and local-link validity. It fails when an obsolete or
unreviewed document appears beside current documentation.

The locked documentation archive contains generated API sites, superseded
architecture, assessments, audits, installers, launch material, governance and
token plans, research papers, historical runtime files, and other narratives
that are not authoritative for `0.12.0-dev.0`.

The current build notes are
[`releases/0.12.0-dev.0.md`](releases/0.12.0-dev.0.md). The prior release is
described only by its immutable
[`v0.11.0` release page](https://github.com/Zoverions/AXIOM-MESH/releases/tag/v0.11.0);
its former in-tree rolling notes are not current-build documentation.

## Credential boundary

Every credential candidate reachable from the former implementation is
permanently revoked from supported repository trust. Archiving does not make
an exposed value safe.

The keyed ledger records 32 conservative candidates from every reachable
object at immutable tag `archive/legacy-main-pre-clean-room-2026-05-21`.
Protected CI resolves that tag, reconstructs the inventory with a separately
held HMAC key, requires exact ledger agreement, and rejects reuse in the
supported tree. Candidate values and the HMAC key remain outside Git.

All 32 external dispositions remain `attestation-required`. Repository
verification cannot prove that an outside provider or prior deployment revoked
or destroyed a value. Before pilot promotion:

1. dispose every entry using the
   [external attestation procedure](security/CREDENTIAL-HISTORY-REVOCATION.md);
2. create replacement values through supported provisioning or the approved
   external secret system;
3. update trust records atomically with credential rotation;
4. prove no pilot trust store contains an archived public key;
5. retain only non-secret identifiers, approvals, and receipts.

## Verification

The current migration boundary is valid only while:

- lowercase `main` remains the GitHub default and protected branch;
- the former implementation resolves to its recorded immutable tag and tip;
- the deprecated documentation branch resolves to the recorded pre-cleanup
  commit and remains locked;
- current `docs/` contains only the enforced supported allowlist;
- the package, capability registry, operator surface, container tags, build
  notes, and runtime evidence report one current version;
- protected release verification and credential-history audit pass.

Changing a default branch, creating an archive, or passing CI does not itself
promote a production deployment. Promotion remains governed by the
[production readiness tracker](PRODUCTION-READINESS-TRACKER.md).
