import { createHash } from 'node:crypto';

const HOST_PERMIT = Symbol('praxis.host-permit');
const consumedAuthorityTokens = new WeakSet();

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
  constructor(code, message) {
    super(message);
    this.name = 'PraxisRuntimeError';
    this.code = code;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}

export function lex(source) {
  if (typeof source !== 'string') throw new TypeError('Praxis source must be a string');

  const tokens = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const advance = (text) => {
    for (const char of text) {
      if (char === '\n') {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
    index += text.length;
  };

  while (index < source.length) {
    const rest = source.slice(index);

    const whitespace = rest.match(/^[\s]+/);
    if (whitespace) {
      advance(whitespace[0]);
      continue;
    }

    const comment = rest.match(/^(?:\/\/|#)[^\n]*/);
    if (comment) {
      advance(comment[0]);
      continue;
    }

    const tokenLine = line;
    const tokenColumn = column;

    const stringMatch = rest.match(/^"(?:\\.|[^"\\])*"/);
    if (stringMatch) {
      let value;
      try {
        value = JSON.parse(stringMatch[0]);
      } catch {
        throw new PraxisSyntaxError('invalid string literal', {
          line: tokenLine,
          column: tokenColumn
        });
      }
      tokens.push({ type: 'string', value, line: tokenLine, column: tokenColumn });
      advance(stringMatch[0]);
      continue;
    }

    const numberMatch = rest.match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?/);
    if (numberMatch) {
      tokens.push({
        type: 'number',
        value: Number(numberMatch[0]),
        line: tokenLine,
        column: tokenColumn
      });
      advance(numberMatch[0]);
      continue;
    }

    const wordMatch = rest.match(/^[A-Za-z_][A-Za-z0-9_.-]*/);
    if (wordMatch) {
      tokens.push({ type: 'word', value: wordMatch[0], line: tokenLine, column: tokenColumn });
      advance(wordMatch[0]);
      continue;
    }

    const punct = rest[0];
    if (':@;=(),'.includes(punct)) {
      tokens.push({ type: punct, value: punct, line: tokenLine, column: tokenColumn });
      advance(punct);
      continue;
    }

    throw new PraxisSyntaxError(`unexpected character ${JSON.stringify(rest[0])}`, {
      line: tokenLine,
      column: tokenColumn
    });
  }

  tokens.push({ type: 'eof', value: null, line, column });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  current() {
    return this.tokens[this.index];
  }

  take(type, value) {
    const token = this.current();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      const expected = value === undefined ? type : JSON.stringify(value);
      throw new PraxisSyntaxError(`expected ${expected}, received ${JSON.stringify(token.value)}`, token);
    }
    this.index += 1;
    return token;
  }

  word(value) {
    return this.take('word', value);
  }

  identifier() {
    return this.take('word').value;
  }

  literalOrReference() {
    const token = this.current();
    if (token.type === 'string' || token.type === 'number') {
      this.index += 1;
      return { kind: 'literal', value: token.value };
    }
    if (token.type === 'word' && (token.value === 'true' || token.value === 'false')) {
      this.index += 1;
      return { kind: 'literal', value: token.value === 'true' };
    }
    if (token.type === 'word') {
      this.index += 1;
      return { kind: 'reference', name: token.value };
    }
    throw new PraxisSyntaxError('expected literal or reference', token);
  }

  statement() {
    const token = this.current();
    if (token.type !== 'word') throw new PraxisSyntaxError('expected statement', token);

    switch (token.value) {
      case 'requires':
        return this.requiresPermit();
      case 'observe':
        return this.observe();
      case 'verify':
        return this.verify();
      case 'assess':
        return this.assess();
      case 'op':
        return this.operation();
      case 'authorize':
        return this.authorize();
      case 'commit':
        return this.commit();
      default:
        throw new PraxisSyntaxError(`unknown statement ${JSON.stringify(token.value)}`, token);
    }
  }

  requiresPermit() {
    this.word('requires');
    this.word('permit');
    const name = this.identifier();
    this.take(':');
    const action = this.identifier();
    this.take('@');
    const scope = this.identifier();
    this.take(';');
    return { kind: 'RequirePermit', name, action, scope };
  }

  observe() {
    this.word('observe');
    const name = this.identifier();
    this.take('=');
    const value = this.literalOrReference();
    this.word('from');
    const provenance = this.take('string').value;
    this.take(';');
    return { kind: 'Observe', name, value, provenance };
  }

  verify() {
    this.word('verify');
    const name = this.identifier();
    this.take('=');
    const input = this.identifier();
    this.word('with');
    const policy = this.identifier();
    this.take(';');
    return { kind: 'Verify', name, input, policy };
  }

  assess() {
    this.word('assess');
    const name = this.identifier();
    this.take('=');
    const input = this.identifier();
    this.word('with');
    const policy = this.identifier();
    this.take(';');
    return { kind: 'Assess', name, input, policy };
  }

  operation() {
    this.word('op');
    const name = this.identifier();
    this.take('=');
    const action = this.identifier();
    this.take('(');
    const args = [];
    if (this.current().type !== ')') {
      args.push(this.literalOrReference());
      while (this.current().type === ',') {
        this.take(',');
        args.push(this.literalOrReference());
      }
    }
    this.take(')');
    this.take('@');
    const scope = this.identifier();
    this.take(';');
    return { kind: 'Operation', name, action, scope, args };
  }

  authorize() {
    this.word('authorize');
    const operation = this.identifier();
    this.word('using');
    const permit = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Authorize', name, operation, permit };
  }

  commit() {
    this.word('commit');
    const operation = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Commit', name, operation };
  }

  program() {
    const body = [];
    while (this.current().type !== 'eof') body.push(this.statement());
    return { kind: 'Program', body };
  }
}

export function parse(source) {
  return new Parser(lex(source)).program();
}

function assertFreshName(env, name) {
  if (env.has(name)) {
    throw new PraxisTypeError('PRAXIS_DUPLICATE_BINDING', `binding ${name} already exists`);
  }
}

function requireBinding(env, name) {
  const binding = env.get(name);
  if (!binding) {
    throw new PraxisTypeError('PRAXIS_UNKNOWN_BINDING', `binding ${name} does not exist`);
  }
  return binding;
}

function knowledgeKind(kind) {
  return kind === 'Observed' || kind === 'Verified' || kind === 'Assessment' || kind === 'Receipt';
}

export function analyze(ast) {
  if (!ast || ast.kind !== 'Program') {
    throw new TypeError('analyze expects a Praxis Program AST');
  }

  const env = new Map();
  const ir = [];
  const requiredPermits = [];
  const usedPermits = new Set();
  const committedOperations = new Set();

  for (const node of ast.body) {
    assertFreshName(env, node.name);

    switch (node.kind) {
      case 'RequirePermit': {
        const type = { kind: 'Permit', action: node.action, scope: node.scope, linear: true };
        env.set(node.name, type);
        requiredPermits.push({ name: node.name, action: node.action, scope: node.scope });
        ir.push({ op: 'REQUIRE_PERMIT', name: node.name, action: node.action, scope: node.scope });
        break;
      }

      case 'Observe': {
        if (node.value.kind === 'reference') {
          const source = requireBinding(env, node.value.name);
          if (!knowledgeKind(source.kind)) {
            throw new PraxisTypeError(
              'PRAXIS_INFORMATION_FLOW_VIOLATION',
              `observe cannot copy ${source.kind} binding ${node.value.name}`
            );
          }
        }
        env.set(node.name, { kind: 'Observed', provenance: node.provenance });
        ir.push({ op: 'OBSERVE', name: node.name, value: node.value, provenance: node.provenance });
        break;
      }

      case 'Verify': {
        const input = requireBinding(env, node.input);
        if (input.kind !== 'Observed' && input.kind !== 'Verified') {
          throw new PraxisTypeError(
            'PRAXIS_VERIFY_REQUIRES_EVIDENCE',
            `verify requires Observed or Verified input, received ${input.kind}`
          );
        }
        env.set(node.name, { kind: 'Verified', policy: node.policy });
        ir.push({ op: 'VERIFY', name: node.name, input: node.input, policy: node.policy });
        break;
      }

      case 'Assess': {
        const input = requireBinding(env, node.input);
        if (!knowledgeKind(input.kind) || input.kind === 'Receipt') {
          throw new PraxisTypeError(
            'PRAXIS_ASSESS_REQUIRES_KNOWLEDGE',
            `assess requires knowledge input, received ${input.kind}`
          );
        }
        env.set(node.name, { kind: 'Assessment', policy: node.policy });
        ir.push({ op: 'ASSESS', name: node.name, input: node.input, policy: node.policy });
        break;
      }

      case 'Operation': {
        for (const arg of node.args) {
          if (arg.kind !== 'reference') continue;
          const input = requireBinding(env, arg.name);
          if (input.kind === 'Permit' || input.kind === 'AuthorizedOperation') {
            throw new PraxisTypeError(
              'PRAXIS_AUTHORITY_EXFILTRATION',
              `authority binding ${arg.name} cannot be embedded in an operation`
            );
          }
        }
        env.set(node.name, { kind: 'Operation', action: node.action, scope: node.scope });
        ir.push({
          op: 'PLAN',
          name: node.name,
          action: node.action,
          scope: node.scope,
          args: node.args
        });
        break;
      }

      case 'Authorize': {
        const operation = requireBinding(env, node.operation);
        const permit = requireBinding(env, node.permit);

        if (operation.kind !== 'Operation') {
          throw new PraxisTypeError(
            'PRAXIS_AUTHORIZE_REQUIRES_OPERATION',
            `authorize requires Operation, received ${operation.kind}`
          );
        }
        if (permit.kind !== 'Permit') {
          throw new PraxisTypeError(
            'PRAXIS_AUTHORIZE_REQUIRES_PERMIT',
            `authorize requires Permit, received ${permit.kind}`
          );
        }
        if (permit.action !== operation.action || permit.scope !== operation.scope) {
          throw new PraxisTypeError(
            'PRAXIS_AUTHORITY_MISMATCH',
            `permit ${node.permit} grants ${permit.action}@${permit.scope}, operation requires ${operation.action}@${operation.scope}`
          );
        }
        if (usedPermits.has(node.permit)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_AUTHORITY_REUSE',
            `permit ${node.permit} is linear and was already consumed`
          );
        }
        usedPermits.add(node.permit);
        env.set(node.name, {
          kind: 'AuthorizedOperation',
          action: operation.action,
          scope: operation.scope,
          operation: node.operation,
          permit: node.permit,
          linear: true
        });
        ir.push({
          op: 'AUTHORIZE',
          name: node.name,
          operation: node.operation,
          permit: node.permit
        });
        break;
      }

      case 'Commit': {
        const operation = requireBinding(env, node.operation);
        if (operation.kind !== 'AuthorizedOperation') {
          throw new PraxisTypeError(
            'PRAXIS_COMMIT_REQUIRES_AUTHORITY',
            `commit requires AuthorizedOperation, received ${operation.kind}`
          );
        }
        if (committedOperations.has(node.operation)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            `authorized operation ${node.operation} was already committed`
          );
        }
        committedOperations.add(node.operation);
        env.set(node.name, { kind: 'Receipt', action: operation.action, scope: operation.scope });
        ir.push({ op: 'COMMIT', name: node.name, operation: node.operation });
        break;
      }

      default:
        throw new PraxisTypeError('PRAXIS_UNKNOWN_AST_NODE', `unknown AST node ${node.kind}`);
    }
  }

  return Object.freeze({
    schema: 'praxis-ir.v0',
    required_permits: Object.freeze(requiredPermits.map(item => Object.freeze({ ...item }))),
    instructions: Object.freeze(ir.map(item => Object.freeze({ ...item }))),
    bindings: Object.freeze(
      Object.fromEntries([...env.entries()].map(([name, type]) => [name, Object.freeze({ ...type })]))
    )
  });
}

export function compile(source) {
  return analyze(parse(source));
}

export function createHostPermit({ action, scope, id }) {
  if (!action || !scope || !id) throw new TypeError('host permit requires action, scope, and id');
  return Object.freeze({
    [HOST_PERMIT]: true,
    schema: 'praxis-host-permit.v0',
    id: String(id),
    action: String(action),
    scope: String(scope)
  });
}

function resolveValue(arg, values) {
  if (arg.kind === 'literal') return arg.value;
  if (!values.has(arg.name)) {
    throw new PraxisRuntimeError('PRAXIS_RUNTIME_UNKNOWN_BINDING', `runtime binding ${arg.name} missing`);
  }
  return values.get(arg.name);
}

function validateAuthorityToken(token, requirement) {
  if (!token || token[HOST_PERMIT] !== true) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_REQUIRED',
      `host did not provide a Praxis authority token for ${requirement.name}`
    );
  }
  if (consumedAuthorityTokens.has(token)) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_CONSUMED',
      `host authority token ${token.id} was already consumed`
    );
  }
  if (token.action !== requirement.action || token.scope !== requirement.scope) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_MISMATCH',
      `host authority ${token.id} grants ${token.action}@${token.scope}, expected ${requirement.action}@${requirement.scope}`
    );
  }
}

export async function run(source, {
  authorities = {},
  executor = null,
  verifiers = {},
  assessors = {}
} = {}) {
  const ir = typeof source === 'string' ? compile(source) : source;
  if (!ir || ir.schema !== 'praxis-ir.v0') {
    throw new TypeError('run expects Praxis source or praxis-ir.v0');
  }

  const values = new Map();
  const requirements = new Map(ir.required_permits.map(item => [item.name, item]));
  const authorityTokens = new Map();

  for (const requirement of ir.required_permits) {
    const token = authorities[requirement.name];
    validateAuthorityToken(token, requirement);
    authorityTokens.set(requirement.name, token);
    values.set(requirement.name, {
      kind: 'Permit',
      authority_id: token.id,
      action: token.action,
      scope: token.scope
    });
  }

  for (const instruction of ir.instructions) {
    switch (instruction.op) {
      case 'REQUIRE_PERMIT':
        break;

      case 'OBSERVE':
        values.set(instruction.name, {
          kind: 'Observed',
          value: resolveValue(instruction.value, values),
          provenance: instruction.provenance
        });
        break;

      case 'VERIFY': {
        const input = values.get(instruction.input);
        const verifier = verifiers[instruction.policy];
        if (typeof verifier !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_VERIFIER_REQUIRED',
            `verifier ${instruction.policy} is not available`
          );
        }
        const result = await verifier(input);
        if (!result || result.ok !== true) {
          throw new PraxisRuntimeError(
            'PRAXIS_VERIFICATION_DENIED',
            `verifier ${instruction.policy} did not return explicit ok:true`
          );
        }
        values.set(instruction.name, {
          kind: 'Verified',
          value: input.value,
          provenance: input.provenance,
          policy: instruction.policy,
          evidence: result.evidence ?? null
        });
        break;
      }

      case 'ASSESS': {
        const input = values.get(instruction.input);
        const assessor = assessors[instruction.policy];
        if (typeof assessor !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_ASSESSOR_REQUIRED',
            `assessor ${instruction.policy} is not available`
          );
        }
        const result = await assessor(input);
        if (!result || result.ok !== true || !Object.prototype.hasOwnProperty.call(result, 'value')) {
          throw new PraxisRuntimeError(
            'PRAXIS_ASSESSMENT_DENIED',
            `assessor ${instruction.policy} did not return explicit ok:true with value`
          );
        }
        values.set(instruction.name, {
          kind: 'Assessment',
          value: result.value,
          policy: instruction.policy,
          based_on: instruction.input
        });
        break;
      }

      case 'PLAN': {
        const args = instruction.args.map(arg => resolveValue(arg, values));
        const operation = Object.freeze({
          schema: 'praxis-operation.v0',
          action: instruction.action,
          scope: instruction.scope,
          args
        });
        values.set(instruction.name, Object.freeze({
          kind: 'Operation',
          ...operation,
          operation_digest: digest(operation)
        }));
        break;
      }

      case 'AUTHORIZE': {
        const operation = values.get(instruction.operation);
        const requirement = requirements.get(instruction.permit);
        const token = authorityTokens.get(instruction.permit);
        validateAuthorityToken(token, requirement);
        consumedAuthorityTokens.add(token);
        values.set(instruction.name, Object.freeze({
          kind: 'AuthorizedOperation',
          operation,
          authority: Object.freeze({
            authority_id: token.id,
            action: token.action,
            scope: token.scope
          })
        }));
        break;
      }

      case 'COMMIT': {
        if (typeof executor !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_EXECUTOR_REQUIRED',
            'commit is fail-closed: a host executor must be explicitly injected'
          );
        }

        const authorized = values.get(instruction.operation);
        const request = Object.freeze({
          schema: 'praxis-commit-request.v0',
          operation: authorized.operation,
          authority: authorized.authority
        });
        const expectedDigest = authorized.operation.operation_digest;
        const result = await executor(request);

        if (
          !result
          || result.ok !== true
          || !result.receipt
          || result.receipt.operation_digest !== expectedDigest
        ) {
          throw new PraxisRuntimeError(
            'PRAXIS_EXECUTOR_RECEIPT_INVALID',
            'executor did not return an explicit receipt bound to the exact operation digest'
          );
        }

        values.set(instruction.name, Object.freeze({
          kind: 'Receipt',
          schema: 'praxis-receipt.v0',
          operation_digest: expectedDigest,
          authority_id: authorized.authority.authority_id,
          executor_receipt: Object.freeze({ ...result.receipt })
        }));
        break;
      }

      default:
        throw new PraxisRuntimeError(
          'PRAXIS_UNKNOWN_INSTRUCTION',
          `unknown instruction ${instruction.op}`
        );
    }
  }

  return Object.freeze({
    schema: 'praxis-run-result.v0',
    values: Object.freeze(Object.fromEntries(values))
  });
}
