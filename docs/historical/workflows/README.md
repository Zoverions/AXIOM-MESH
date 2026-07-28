# Archived Legacy Workflows

These GitHub Actions workflows belong to the unsupported historical runtime.
They were moved out of `.github/workflows/` during the clean-kernel rebuild so
they cannot publish ISOs, deploy mock contracts, attest stale artifacts, or
gate the supported kernel with contradictory branch and toolchain assumptions.

They remain here only as design and repository-history evidence. Do not
reactivate them. Any useful control must be reimplemented against `mesh/`, tied
to the machine-readable capability registry, and backed by current executable
evidence.
