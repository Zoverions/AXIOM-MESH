// labs/praxis/errors.mjs
//
// Praxis error classes (syntax, type, runtime). No dependencies.
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.


export class PraxisSyntaxError extends Error {
  constructor(message, token) {
    const where = token ? ` at ${token.line}:${token.column}` : '';
    super(`${message}${where}`);
    this.name = 'PraxisSyntaxError';
    this.code = 'PRAXIS_SYNTAX_ERROR';
  }
}

export class PraxisTypeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PraxisTypeError';
    this.code = code;
  }
}

export class PraxisRuntimeError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'PraxisRuntimeError';
    this.code = code;
    this.details = details;
  }
}
