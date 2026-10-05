// labs/praxis/format.mjs
//
// Canonical pretty-printer for Praxis source: source -> AST -> canonical text.
//
// Canonical form choices (documented, deterministic):
// - one statement per line, in source order; a single trailing newline
//   terminates a non-empty program (an empty program formats to '')
// - single spaces between tokens; every statement ends with ';'
// - 'op' modifiers always print in README order:
//   effect, irreversible, egress, using secrets
// - strings print via JSON.stringify; numbers print as plain decimals with
//   no exponent notation (exact for every finite double); booleans print as
//   true/false; references print as their bare name
// - comments are NOT preserved: the lexer discards '//' and '#' comments and
//   they never reach the AST, so canonical text strips them
//
// Guarantees:
// - idempotent: format(format(x)) === format(x)
// - round-trip stable: parse(format(x)) deep-equals parse(x)
// - deterministic: no timestamps, no randomness
// - total over finite inputs: never throws on valid source; invalid source
//   surfaces the parser's own PraxisSyntaxError unchanged. The one documented
//   exception is a non-finite numeric value (only producible by an overflow
//   literal such as a 400-digit integer, which no Praxis literal can denote
//   exactly); that raises PraxisFormatError.
//
// Formatting only: this module never evaluates, authorizes, or executes.

import { parse } from './parser.mjs';

export class PraxisFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PraxisFormatError';
    this.code = 'PRAXIS_FORMAT_ERROR';
  }
}

// Print a finite double as a plain decimal literal the Praxis lexer accepts.
// Uses the shortest round-trip representation and expands any exponent
// notation, so the printed literal always parses back to the identical double.
function formatNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PraxisFormatError(
      `cannot format non-finite number ${String(value)}: no Praxis literal denotes it`
    );
  }
  if (Object.is(value, -0)) return '-0';
  if (Number.isInteger(value) && Math.abs(value) < 1e21) return String(value);
  const shortest = value.toString();
  const exponent = shortest.match(/^([+-]?)(\d)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!exponent) return shortest;
  const sign = exponent[1] === '-' ? '-' : '';
  const digits = exponent[2] + (exponent[3] ?? '');
  const pointPos = 1 + Number.parseInt(exponent[4], 10);
  let plain;
  if (pointPos >= digits.length) {
    plain = digits + '0'.repeat(pointPos - digits.length);
  } else if (pointPos <= 0) {
    plain = `0.${'0'.repeat(-pointPos)}${digits}`;
  } else {
    plain = `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
  }
  return sign + plain;
}

function formatLiteralOrReference(node) {
  if (!node || typeof node.kind !== 'string') {
    throw new PraxisFormatError('cannot format malformed literal or reference');
  }
  if (node.kind === 'reference') return node.name;
  if (node.kind === 'literal') {
    const value = node.value;
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return formatNumber(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    throw new PraxisFormatError(`cannot format literal of type ${typeof value}`);
  }
  throw new PraxisFormatError(`cannot format unknown value kind ${JSON.stringify(node.kind)}`);
}

function needFields(node, names) {
  for (const name of names) {
    if (node[name] === undefined || node[name] === null) {
      throw new PraxisFormatError(`cannot format ${node.kind}: missing ${name}`);
    }
  }
  if (names.includes('args') && !Array.isArray(node.args)) {
    throw new PraxisFormatError('cannot format Operation: args must be an array');
  }
  if (names.includes('secrets') && !Array.isArray(node.secrets)) {
    throw new PraxisFormatError('cannot format Operation: secrets must be an array');
  }
  if (names.includes('members') && !Array.isArray(node.members)) {
    throw new PraxisFormatError('cannot format RequireQuorum: members must be an array');
  }
}

function formatRequires(node) {
  switch (node.kind) {
    case 'RequirePermit':
      needFields(node, ['name', 'action', 'scope']);
      return `requires permit ${node.name}: ${node.action} @ ${node.scope};`;
    case 'RequireLease':
      needFields(node, ['name', 'action', 'scope']);
      return `requires lease ${node.name}: ${node.action} @ ${node.scope};`;
    case 'RequireQuorum':
      needFields(node, ['name', 'action', 'scope', 'threshold', 'members']);
      return `requires quorum ${node.name}: ${node.action} @ ${node.scope} ` +
        `threshold ${formatNumber(node.threshold)} of ${node.members.join(', ')};`;
    case 'RequireSecret':
      needFields(node, ['name', 'secretKind']);
      return `requires secret ${node.name}: ${node.secretKind};`;
    case 'RequirePrepared':
      needFields(node, ['name', 'action', 'scope']);
      return `requires prepared ${node.name}: ${node.action} @ ${node.scope};`;
    default:
      return null;
  }
}

function formatOperation(node) {
  const args = node.args.map(formatLiteralOrReference).join(', ');
  let text = `op ${node.name} = ${node.action}(${args}) @ ${node.scope}`;
  if (node.declaredEffect !== null && node.declaredEffect !== undefined) {
    text += ` effect ${node.declaredEffect}`;
  }
  if (node.declaredIrreversible) text += ' irreversible';
  if (node.declaredEgress !== null && node.declaredEgress !== undefined) {
    text += ` egress ${JSON.stringify(node.declaredEgress)}`;
  }
  if (node.secrets.length > 0) text += ` using secrets ${node.secrets.join(', ')}`;
  return `${text};`;
}

function formatStatement(node) {
  if (!node || typeof node.kind !== 'string') {
    throw new PraxisFormatError('cannot format malformed statement');
  }
  const required = formatRequires(node);
  if (required !== null) return required;
  switch (node.kind) {
    case 'Observe':
      needFields(node, ['name', 'value', 'provenance']);
      return `observe ${node.name} = ${formatLiteralOrReference(node.value)} ` +
        `from ${JSON.stringify(node.provenance)};`;
    case 'Verify':
      needFields(node, ['name', 'input', 'policy']);
      return `verify ${node.name} = ${node.input} with ${node.policy};`;
    case 'Assess':
      needFields(node, ['name', 'input', 'policy']);
      return `assess ${node.name} = ${node.input} with ${node.policy};`;
    case 'Operation':
      needFields(node, ['name', 'action', 'scope', 'args', 'secrets']);
      return formatOperation(node);
    case 'Authorize':
      needFields(node, ['operation', 'permit', 'name']);
      return `authorize ${node.operation} using ${node.permit} as ${node.name};`;
    case 'Prepare':
      needFields(node, ['operation', 'name']);
      return `prepare ${node.operation} as ${node.name};`;
    case 'Cancel':
      needFields(node, ['operation', 'name']);
      return `cancel ${node.operation} as ${node.name};`;
    case 'Commit':
      needFields(node, ['operation', 'name']);
      return `commit ${node.operation} as ${node.name};`;
    case 'Finalize':
      needFields(node, ['operation', 'name']);
      return `finalize ${node.operation} as ${node.name};`;
    default:
      throw new PraxisFormatError(`cannot format unknown statement kind ${JSON.stringify(node.kind)}`);
  }
}

export function formatProgram(program) {
  if (!program || program.kind !== 'Program' || !Array.isArray(program.body)) {
    throw new PraxisFormatError('formatProgram expects a Program AST node');
  }
  const lines = program.body.map(formatStatement);
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

// Parse source and print its canonical form. Parser errors propagate
// unchanged as PraxisSyntaxError.
export function format(source) {
  return formatProgram(parse(source));
}

// True when source is already in canonical form. Parser errors propagate.
export function isCanonical(source) {
  return format(source) === source;
}

// Null when source is canonical; otherwise a small diff-style report with
// '-' lines from the input and '+' lines from the canonical form.
export function formatCheckReport(source, label = '<input>') {
  const canonical = format(source);
  if (canonical === source) return null;
  const before = source.split('\n');
  const after = canonical.split('\n');
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }
  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start && endAfter > start &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore -= 1;
    endAfter -= 1;
  }
  const lines = [`--- ${label}`, '+++ canonical'];
  for (let i = start; i < endBefore; i += 1) lines.push(`- ${before[i]}`);
  for (let i = start; i < endAfter; i += 1) lines.push(`+ ${after[i]}`);
  return lines.join('\n');
}
