# Legacy Quarantine

## Supported surface

- Runtime: `mesh/`
- Root commands: `npm run dev`, `npm test`, `npm run check`,
  `npm run release:verify`
- Active CI: `.github/workflows/kernel.yml`
- Runtime claims: `mesh/config/capabilities.json`
- Generated public status: `docs/rebuild/STATUS.md`

## Archived operational surfaces

The following files were moved out of locations that GitHub, container tools,
package managers, or operators could mistake for active production paths:

- legacy GitHub workflows → `docs/historical/workflows/`
- root Docker, Compose, dev-container, installer, bootstrap, monitoring,
  contract-tooling, Make, and legacy test entrypoints →
  `docs/historical/runtime/`

The tracked root `.env` was removed. `.env.example` now contains only supported
clean-kernel variables and placeholders.

## Remaining historical source

The original `gateway/`, `hypervisor/`, `sandbox/`, `grid/`, contracts,
installers, domain prototypes, evidence, and iterative documents remain
read-only design inputs until a verified replacement exists. Their presence
does not activate them, and no claim in them overrides the clean-kernel
registry.

Deleting that corpus before the remaining adapter boundaries are reconciled
would destroy traceability. It can be removed in a later repository-history
compaction after feature extraction and external-adapter replacement are
complete.
