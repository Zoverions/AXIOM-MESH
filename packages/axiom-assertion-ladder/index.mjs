// Source-distribution facade. The production runtime implementation lives inside
// the kernel image boundary under mesh/src/lib so container builds do not depend
// on files outside the mesh build context.
export * from '../../mesh/src/lib/assertion-ladder.mjs';
