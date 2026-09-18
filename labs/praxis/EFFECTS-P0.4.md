# Praxis P0.4 measured-effect envelope

Praxis P0.4 is an inert, synthetic-only laboratory slice. It adds a host-measured effect contract beside the existing P0.2/P0.3 chartered authority path. It does not execute an effect, expose a provider/network adapter, resolve credentials, touch Grid/Gateway/Hypervisor/Sandbox, or create production authority.

## Core rule

A governed program may declare what it expects an operation to do, but it cannot define the authoritative effect classification. A synthetic host registry measures the operation contract outside governed source and binds:

- action and scope;
- effect label;
- reversible versus irreversible classification;
- egress class and exact destination when egress exists.

The program manifest must match that host measurement exactly and must be bound to a program digest already pinned by the signed Praxis charter. A missing registry entry, source/host mismatch, unpinned program digest, undeclared measured effect, or changed egress metadata denies the check.

## Signed effect envelope

A charter-root-signed effect envelope is a hard upper bound over measured effects, egress classes, and destinations for one chartered principal. The envelope is not authority and cannot grant an operation by itself. A successful P0.4 preparation check reconstructs authority through the existing P0.3 `createCharteredHostPermit(...)` or `createCharteredHostQuorum(...)` path so signed policy premises, exact-operation binding, verified evidence, quorum rules, advisor vetoes, and freshness checks remain canonical.

The P0.4 result records only inert, content-addressed evidence that those checks agreed. It has `external_effect_performed: false` and is not accepted by any production executor.

## Finality

The host registry, not governed source, declares whether an operation is irreversible.

- reversible measured effects require `commit`;
- irreversible measured effects require `finalize`;
- `commit` on an irreversible operation denies;
- `finalize` on a reversible operation denies;
- replay revalidates the current registry, program manifest, signed envelope, and P0.3 authority and cannot switch terminal mode.

This P0.4 helper models finality as checked-only metadata. It does **not** add a `.prax` `finalize` grammar instruction or call a real executor. Wiring finality into the core interpreter remains a later reviewable sub-slice.

## Failure and rollback

The slice fails closed on malformed/tampered seals, host/program relabeling, missing effect declarations, envelope widening, unpinned program identity, operation substitution, stale/invalid P0.3 evidence, or terminal-mode drift. Rollback is deletion of this isolated module, test file, and document; no production state or credential exists to unwind.

## Claim boundary

This work does not claim production promotion, formal verification, generic rollback, live irreversible effects, network/provider execution, secret-byte access, agent testimony lanes, or a second authority engine. Existing AXIOM authority remains separate, and within Praxis the P0.3 chartered authority issuer remains the only positive authority source used by this slice.
