# AXIOM-MESH Kernel Rollback

**Updated:** 2026-07-29

**Applies to:** AXIOM-MESH `0.12.0-dev.1` supported development build

This runbook applies only to the supported `mesh/` kernel. Archived runtimes,
contracts, installers, and superseded deployment evidence are not rollback
targets.

## Rollback procedure

1. Stop Gateway first so no new intents enter the system.
2. Stop Hypervisor and Sandbox, then stop Grid after its active transaction
   finishes.
3. Preserve the current data directory and encryption key as a read-only
   incident artifact. Never copy the key into source control or release output.
4. Select the previous signed release whose migration ceiling is greater than
   or equal to the database's recorded schema version.
5. Verify that release's registry digest, SBOM, provenance, migration checksums,
   and source commit before starting it.
6. Start Grid alone. It must verify the signed evidence chain and rebuild all
   materialized state successfully.
7. Verify `/internal/v1/status` and the evidence head, then start Sandbox,
   Hypervisor, and Gateway in that order.
8. Run the audit verifier and a read-only status check before reopening traffic.

If the previous runtime cannot read the current migration version, do not force
it to start and do not edit `schema_migrations`. Restore into an isolated copy
using the deterministic procedure below.

## Migration compatibility

Migrations are forward-only, contiguous, and checksum verified. A runtime
refuses a database with a newer schema or a changed migration checksum.

Schema version 9 adds causal-sync bundles, signed updates, and multi-head
materialization. A `0.9.x` runtime cannot interpret those tables and MUST NOT be
started against a `0.10.x` database. Preserve the complete newer database,
encryption key, evidence log, and exported `sync_update` records before any
downgrade. Older runtimes may stage those records only as foreign provenance;
they cannot recreate native causal heads.

For an incompatible rollback:

1. Create an isolated data directory with the older runtime.
2. Export from the newer runtime or use its signed evidence log as the source.
3. Stage the bundle in the isolated runtime and inspect the deterministic diff.
4. Apply only after explicit independent approval.
5. Compare record counts and evidence heads; retain foreign provenance.
6. Switch traffic only after functional and audit verification.

This process intentionally avoids reverse SQL migrations that could discard
newer evidence or silently reinterpret state.
