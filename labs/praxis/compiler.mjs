// labs/praxis/compiler.mjs
//
// Sealed IR compiler entry point (parse + analyze).
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { analyze } from './analyzer.mjs';
import { parse } from './parser.mjs';

export function compile(source) {
  return analyze(parse(source));
}
