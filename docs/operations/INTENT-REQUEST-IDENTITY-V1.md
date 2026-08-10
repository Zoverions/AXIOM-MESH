# Canonical Intent Request Identity v1

**Status:** implemented internal kernel invariant; not a new externally exposed protocol

AXIOM uses one canonical request identity for both Gateway idempotent replay and Hypervisor approval binding.

The identity includes only effect-defining facts:

- action;
- input;
- purpose;
- sorted, duplicate-free `data_scopes`;
- `machine_authority_digest` when the principal is `axiom-machine-principal.v1`.

It intentionally excludes transient transport/workflow facts such as:

- `intent_id`;
- submission timestamp;
- confirmations;
- approval IDs;
- trace IDs;
- idempotency keys.

This prevents Gateway retry semantics from drifting from Hypervisor authorization semantics. A change to machine authority necessarily changes the request identity, while reordering or duplicating equivalent data scopes does not.

This invariant is a native prerequisite for a future AXIOM Invocation Envelope. It does **not** add MCP, A2A, delegation, remote execution, autonomous loops, or production-promotion claims.
