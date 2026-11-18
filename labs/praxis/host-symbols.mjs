// labs/praxis/host-symbols.mjs
//
// Host brand symbols and consumption registries shared by the synthetic host. Single instance per module graph; imported, never duplicated.
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.


export const HOST_AUTHORITY = Symbol('praxis.host-authority');

export const HOST_SECRET_REF = Symbol('praxis.host-secret-ref');

export const HOST_PREPARED_REF = Symbol('praxis.host-prepared-ref');

export const HOST_OPERATION_REGISTRY = Symbol('praxis.host-operation-registry');

export const VERIFIED_EVIDENCE = Symbol('praxis.verified-evidence');

export const consumedAuthorityTokens = new WeakSet();

export const consumedPreparedRefs = new WeakSet();
