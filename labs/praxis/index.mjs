// labs/praxis/index.mjs
//
// Thin re-export facade over the split Praxis language modules.
// The public API surface is unchanged: same names, same bindings.
// Deep imports (e.g. ./lexer.mjs) remain available but are not
// part of the public surface.

export { analyze } from './analyzer.mjs';
export { canonicalJsonPraxis, canonicalizePraxis, createOperationDescriptorPraxis, digestPraxis, irDigestPraxis, operationDigestPraxis } from './canonical.mjs';
export { createApprovalRequest, createCharteredHostPermit, createCharteredHostQuorum, createHostObservation, createSyntheticCharter, signApprovalRequest, verifyHostObservation, verifySyntheticCharter } from './charter.mjs';
export { compile } from './compiler.mjs';
export { PraxisRuntimeError, PraxisSyntaxError, PraxisTypeError } from './errors.mjs';
export { createHostLease, createHostPermit, createHostPreparedRef, createHostQuorum, createHostSecretRef, run } from './host.mjs';
export { lex } from './lexer.mjs';
export { parse } from './parser.mjs';
export { createHostOperationRegistry } from './registry.mjs';
