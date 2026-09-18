import { createHash } from 'node:crypto';

const HOST_AUTHORITY = Symbol('praxis.host-authority');
const HOST_SECRET_REF = Symbol('praxis.host-secret-ref');
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
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'PraxisRuntimeError';
    this.code = code;
    this.details = details;
  }
}

export function canonicalizePraxis(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Praxis canonical JSON does not allow non-finite numbers');
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError('Praxis canonical arrays must use the ordinary Array prototype');
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      throw new TypeError('Praxis canonical arrays cannot contain symbol-keyed state');
    }

    const allowedNames = new Set(['length']);
    const output = [];
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      allowedNames.add(key);
      if (!Object.hasOwn(value, key)) {
        throw new TypeError(`Praxis canonical arrays cannot contain a sparse index at ${index}`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`Praxis canonical array index ${index} must be an enumerable data property`);
      }
      output.push(canonicalizePraxis(descriptor.value));
    }

    for (const name of Object.getOwnPropertyNames(value)) {
      if (!allowedNames.has(name)) {
        throw new TypeError(`Praxis canonical arrays cannot contain custom property ${name}`);
      }
    }
    return output;
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Praxis canonical objects must be plain records');
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      throw new TypeError('Praxis canonical objects cannot contain symbol-keyed state');
    }

    const ownNames = Object.getOwnPropertyNames(value);
    const enumerableKeys = Object.keys(value);
    if (ownNames.length !== enumerableKeys.length) {
      throw new TypeError('Praxis canonical objects cannot contain non-enumerable state');
    }

    const output = {};
    for (const key of enumerableKeys.sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`Praxis canonical property ${key} must be an enumerable data property`);
      }
      const item = descriptor.value;
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
        throw new TypeError(`Praxis canonical JSON cannot encode property ${key}`);
      }
      Object.defineProperty(output, key, {
        value: canonicalizePraxis(item),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return output;
  }

  throw new TypeError(`Praxis canonical JSON cannot encode ${typeof value}`);
}

export function canonicalJsonPraxis(value) {
  return JSON.stringify(canonicalizePraxis(value));
}

export function digestPraxis(value) {
  return createHash('sha256').update(canonicalJsonPraxis(value), 'utf8').digest('hex');
}

function operationDigest(value) {
  return `sha256:${digestPraxis(value)}`;
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
        return this.requiresResource();
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
      case 'prepare':
        return this.prepare();
      case 'commit':
        return this.commit();
      default:
        throw new PraxisSyntaxError(`unknown statement ${JSON.stringify(token.value)}`, token);
    }
  }

  requiresResource() {
    this.word('requires');
    const resourceType = this.identifier();
    const name = this.identifier();
    this.take(':');

    if (resourceType === 'secret') {
      const secretKind = this.identifier();
      this.take(';');
      return {
        kind: 'RequireSecret',
        name,
        secretKind
      };
    }

    if (resourceType !== 'permit' && resourceType !== 'lease') {
      throw new PraxisSyntaxError(
        'requires must declare permit, lease, or secret',
        this.tokens[this.index - 2]
      );
    }

    const action = this.identifier();
    this.take('@');
    const scope = this.identifier();
    this.take(';');
    return {
      kind: resourceType === 'permit' ? 'RequirePermit' : 'RequireLease',
      name,
      action,
      scope
    };
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
    const secrets = [];
    if (this.current().type === 'word' && this.current().value === 'using') {
      this.word('using');
      this.word('secrets');
      secrets.push(this.identifier());
      while (this.current().type === ',') {
        this.take(',');
        secrets.push(this.identifier());
      }
    }
    this.take(';');
    return { kind: 'Operation', name, action, scope, args, secrets };
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

  prepare() {
    this.word('prepare');
    const operation = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Prepare', name, operation };
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
  const requiredSecrets = [];
  const usedPermits = new Set();
  const preparedOperations = new Set();
  const committedOperations = new Set();

  for (const node of ast.body) {
    assertFreshName(env, node.name);

    switch (node.kind) {
      case 'RequirePermit':
      case 'RequireLease': {
        const authorityKind = node.kind === 'RequireLease' ? 'Lease' : 'Permit';
        const type = {
          kind: authorityKind,
          action: node.action,
          scope: node.scope,
          linear: true
        };
        env.set(node.name, type);
        requiredPermits.push({
          name: node.name,
          authority_kind: authorityKind,
          action: node.action,
          scope: node.scope
        });
        ir.push({
          op: authorityKind === 'Lease' ? 'REQUIRE_LEASE' : 'REQUIRE_PERMIT',
          name: node.name,
          action: node.action,
          scope: node.scope
        });
        break;
      }

      case 'RequireSecret': {
        env.set(node.name, {
          kind: 'SecretRef',
          secret_kind: node.secretKind
        });
        requiredSecrets.push({
          name: node.name,
          secret_kind: node.secretKind
        });
        ir.push({
          op: 'REQUIRE_SECRET',
          name: node.name,
          secret_kind: node.secretKind
        });
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
          if (
            input.kind === 'Permit'
            || input.kind === 'Lease'
            || input.kind === 'SecretRef'
            || input.kind === 'AuthorizedOperation'
            || input.kind === 'PreparedOperation'
          ) {
            throw new PraxisTypeError(
              input.kind === 'SecretRef'
                ? 'PRAXIS_SECRET_EXFILTRATION'
                : 'PRAXIS_AUTHORITY_EXFILTRATION',
              `${input.kind} binding ${arg.name} cannot be embedded as an ordinary operation argument`
            );
          }
        }

        const seenSecrets = new Set();
        for (const secretName of node.secrets) {
          if (seenSecrets.has(secretName)) {
            throw new PraxisTypeError(
              'PRAXIS_DUPLICATE_SECRET_BINDING',
              `secret binding ${secretName} is listed more than once`
            );
          }
          seenSecrets.add(secretName);
          const secret = requireBinding(env, secretName);
          if (secret.kind !== 'SecretRef') {
            throw new PraxisTypeError(
              'PRAXIS_SECRET_REFERENCE_REQUIRED',
              `operation secret binding ${secretName} must be SecretRef, received ${secret.kind}`
            );
          }
        }

        env.set(node.name, {
          kind: 'Operation',
          action: node.action,
          scope: node.scope,
          secrets: [...node.secrets]
        });
        ir.push({
          op: 'PLAN',
          name: node.name,
          action: node.action,
          scope: node.scope,
          args: node.args,
          secrets: node.secrets
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
        if (permit.kind !== 'Permit' && permit.kind !== 'Lease') {
          throw new PraxisTypeError(
            'PRAXIS_AUTHORIZE_REQUIRES_PERMIT',
            `authorize requires Permit or Lease, received ${permit.kind}`
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

      case 'Prepare': {
        const operation = requireBinding(env, node.operation);
        if (operation.kind !== 'AuthorizedOperation') {
          throw new PraxisTypeError(
            'PRAXIS_PREPARE_REQUIRES_AUTHORITY',
            `prepare requires AuthorizedOperation, received ${operation.kind}`
          );
        }
        if (preparedOperations.has(node.operation)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            `authorized operation ${node.operation} was already prepared`
          );
        }
        preparedOperations.add(node.operation);
        env.set(node.name, {
          kind: 'PreparedOperation',
          action: operation.action,
          scope: operation.scope,
          operation: operation.operation,
          permit: operation.permit,
          linear: true
        });
        ir.push({
          op: 'PREPARE',
          name: node.name,
          operation: node.operation
        });
        break;
      }

      case 'Commit': {
        const operation = requireBinding(env, node.operation);
        if (operation.kind !== 'PreparedOperation') {
          throw new PraxisTypeError(
            'PRAXIS_COMMIT_REQUIRES_PREPARATION',
            `commit requires PreparedOperation, received ${operation.kind}`
          );
        }
        if (committedOperations.has(node.operation)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            `prepared operation ${node.operation} was already committed`
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
    required_secrets: Object.freeze(requiredSecrets.map(item => Object.freeze({ ...item }))),
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
    [HOST_AUTHORITY]: 'Permit',
    schema: 'praxis-host-permit.v0',
    id: String(id),
    action: String(action),
    scope: String(scope)
  });
}

export function createHostLease({ action, scope, id, expiresAt }) {
  if (!action || !scope || !id || expiresAt === undefined || expiresAt === null) {
    throw new TypeError('host lease requires action, scope, id, and expiresAt');
  }
  const expiresAtMs = typeof expiresAt === 'number' ? expiresAt : Date.parse(String(expiresAt));
  if (!Number.isFinite(expiresAtMs)) {
    throw new TypeError('host lease expiresAt must be a finite timestamp or parseable date');
  }
  return Object.freeze({
    [HOST_AUTHORITY]: 'Lease',
    schema: 'praxis-host-lease.v0',
    id: String(id),
    action: String(action),
    scope: String(scope),
    expires_at_ms: expiresAtMs
  });
}

export function createHostSecretRef({ id, kind }) {
  if (!id || !kind) throw new TypeError('host secret reference requires id and kind');
  return Object.freeze({
    [HOST_SECRET_REF]: true,
    schema: 'praxis-host-secret-ref.v0',
    id: String(id),
    kind: String(kind)
  });
}

function resolveValue(arg, values) {
  if (arg.kind === 'literal') return arg.value;
  if (!values.has(arg.name)) {
    throw new PraxisRuntimeError('PRAXIS_RUNTIME_UNKNOWN_BINDING', `runtime binding ${arg.name} missing`);
  }
  return values.get(arg.name);
}

function validateAuthorityToken(token, requirement, {
  nowMs,
  revokedAuthorityIds
}) {
  const expectedKind = requirement.authority_kind ?? 'Permit';
  if (!token || token[HOST_AUTHORITY] !== expectedKind) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_REQUIRED',
      `host did not provide a matching Praxis ${expectedKind} for ${requirement.name}`
    );
  }
  if (revokedAuthorityIds.has(token.id)) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_REVOKED',
      `host authority token ${token.id} is revoked`
    );
  }
  if (expectedKind === 'Lease' && nowMs >= token.expires_at_ms) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_EXPIRED',
      `host authority lease ${token.id} expired`
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

function normalizeRuntimeTime(now) {
  const nowMs = typeof now === 'number' ? now : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('run now must be a finite timestamp or parseable date');
  }
  return nowMs;
}

function normalizeRevocations(value) {
  if (value instanceof Set) return new Set([...value].map(String));
  if (Array.isArray(value)) return new Set(value.map(String));
  throw new TypeError('revokedAuthorityIds must be an array or Set');
}

export async function run(source, {
  authorities = {},
  secrets = {},
  preparer = null,
  executor = null,
  completer = null,
  verifiers = {},
  assessors = {},
  now = Date.now(),
  revokedAuthorityIds = []
} = {}) {
  const ir = typeof source === 'string' ? compile(source) : source;
  if (!ir || ir.schema !== 'praxis-ir.v0') {
    throw new TypeError('run expects Praxis source or praxis-ir.v0');
  }

  const values = new Map();
  const requirements = new Map(ir.required_permits.map(item => [item.name, item]));
  const secretRequirements = new Map((ir.required_secrets ?? []).map(item => [item.name, item]));
  const authorityTokens = new Map();
  const secretRefs = new Map();
  const nowMs = normalizeRuntimeTime(now);
  const revoked = normalizeRevocations(revokedAuthorityIds);

  for (const requirement of ir.required_permits) {
    const token = authorities[requirement.name];
    validateAuthorityToken(token, requirement, {
      nowMs,
      revokedAuthorityIds: revoked
    });
    authorityTokens.set(requirement.name, token);
    values.set(requirement.name, {
      kind: requirement.authority_kind ?? 'Permit',
      authority_id: token.id,
      action: token.action,
      scope: token.scope,
      expires_at_ms: token.expires_at_ms ?? null
    });
  }

  for (const requirement of ir.required_secrets ?? []) {
    const ref = secrets[requirement.name];
    if (!ref || ref[HOST_SECRET_REF] !== true) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_SECRET_REQUIRED',
        `host did not provide an opaque secret reference for ${requirement.name}`
      );
    }
    if (ref.kind !== requirement.secret_kind) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_SECRET_KIND_MISMATCH',
        `host secret reference ${ref.id} has kind ${ref.kind}, expected ${requirement.secret_kind}`
      );
    }
    secretRefs.set(requirement.name, ref);
    values.set(requirement.name, Object.freeze({
      kind: 'SecretRef',
      secret_ref_id: ref.id,
      secret_kind: ref.kind
    }));
  }

  for (const instruction of ir.instructions) {
    switch (instruction.op) {
      case 'REQUIRE_PERMIT':
      case 'REQUIRE_LEASE':
      case 'REQUIRE_SECRET':
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
        const secretReferences = (instruction.secrets ?? []).map(name => {
          const requirement = secretRequirements.get(name);
          const ref = secretRefs.get(name);
          if (!requirement || !ref) {
            throw new PraxisRuntimeError(
              'PRAXIS_HOST_SECRET_REQUIRED',
              `secret reference ${name} is unavailable`
            );
          }
          return Object.freeze({
            binding: name,
            secret_ref_id: ref.id,
            secret_kind: ref.kind
          });
        });
        const operation = Object.freeze({
          schema: 'praxis-operation.v0',
          action: instruction.action,
          scope: instruction.scope,
          args,
          secret_references: Object.freeze(secretReferences)
        });
        values.set(instruction.name, Object.freeze({
          kind: 'Operation',
          ...operation,
          operation_digest: operationDigest(operation)
        }));
        break;
      }

      case 'AUTHORIZE': {
        const operation = values.get(instruction.operation);
        const requirement = requirements.get(instruction.permit);
        const token = authorityTokens.get(instruction.permit);
        validateAuthorityToken(token, requirement, {
          nowMs,
          revokedAuthorityIds: revoked
        });
        values.set(instruction.name, Object.freeze({
          kind: 'AuthorizedOperation',
          operation,
          permit_name: instruction.permit,
          authority: Object.freeze({
            authority_id: token.id,
            action: token.action,
            scope: token.scope
          })
        }));
        break;
      }

      case 'PREPARE': {
        if (typeof preparer !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_PREPARER_REQUIRED',
            'prepare is fail-closed: a host durable preparer must be explicitly injected'
          );
        }

        const authorized = values.get(instruction.operation);
        const requirement = requirements.get(authorized.permit_name);
        const token = authorityTokens.get(authorized.permit_name);
        validateAuthorityToken(token, requirement, {
          nowMs,
          revokedAuthorityIds: revoked
        });

        const request = Object.freeze({
          schema: 'praxis-prepare-request.v0',
          operation: authorized.operation,
          authority: authorized.authority
        });

        let preparedResult;
        try {
          preparedResult = await preparer(request);
        } catch {
          throw new PraxisRuntimeError(
            'PRAXIS_PREPARATION_UNCOMMITTED',
            'effect was not made executable because durable preparation failed',
            {
              operation_digest: authorized.operation.operation_digest,
              executor_invoked: false
            }
          );
        }

        const evidence = preparedResult?.evidence;
        if (
          preparedResult?.ok !== true
          || !evidence
          || evidence.durable !== true
          || evidence.operation_digest !== authorized.operation.operation_digest
          || typeof evidence.preparation_digest !== 'string'
          || !/^sha256:[a-f0-9]{64}$/.test(evidence.preparation_digest)
        ) {
          throw new PraxisRuntimeError(
            'PRAXIS_PREPARATION_EVIDENCE_INVALID',
            'preparer did not return durable evidence bound to the exact operation digest',
            {
              operation_digest: authorized.operation.operation_digest,
              executor_invoked: false
            }
          );
        }

        consumedAuthorityTokens.add(token);
        values.set(instruction.name, Object.freeze({
          kind: 'PreparedOperation',
          operation: authorized.operation,
          authority: authorized.authority,
          preparation: Object.freeze({ ...evidence })
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
        if (typeof completer !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_COMPLETER_REQUIRED',
            'commit is fail-closed: a host durable completion recorder must be explicitly injected'
          );
        }

        const prepared = values.get(instruction.operation);
        const expectedDigest = prepared.operation.operation_digest;
        const preparationDigest = prepared.preparation.preparation_digest;
        const request = Object.freeze({
          schema: 'praxis-commit-request.v0',
          operation: prepared.operation,
          authority: prepared.authority,
          preparation: prepared.preparation
        });

        let result;
        try {
          result = await executor(request);
        } catch {
          throw new PraxisRuntimeError(
            'PRAXIS_EXTERNAL_OUTCOME_UNCERTAIN',
            'external outcome is unresolved; effect remains prepared',
            {
              state: 'prepared',
              operation_digest: expectedDigest,
              preparation_digest: preparationDigest,
              completion_committed: false
            }
          );
        }

        if (result?.status === 'uncertain') {
          throw new PraxisRuntimeError(
            'PRAXIS_EXTERNAL_OUTCOME_UNCERTAIN',
            'external outcome is unresolved; effect remains prepared',
            {
              state: 'prepared',
              operation_digest: expectedDigest,
              preparation_digest: preparationDigest,
              completion_committed: false
            }
          );
        }

        if (
          result?.status !== 'completed'
          || !result.receipt
          || result.receipt.operation_digest !== expectedDigest
          || result.receipt.preparation_digest !== preparationDigest
        ) {
          throw new PraxisRuntimeError(
            'PRAXIS_EXTERNAL_RECEIPT_UNVERIFIED',
            'external receipt is not verified; effect remains prepared',
            {
              state: 'prepared',
              operation_digest: expectedDigest,
              preparation_digest: preparationDigest,
              completion_committed: false
            }
          );
        }

        const completionRequest = Object.freeze({
          schema: 'praxis-completion-request.v0',
          operation_digest: expectedDigest,
          preparation_digest: preparationDigest,
          receipt: Object.freeze({ ...result.receipt })
        });

        let completion;
        try {
          completion = await completer(completionRequest);
        } catch {
          throw new PraxisRuntimeError(
            'PRAXIS_COMPLETION_UNCOMMITTED',
            'receipt verified but durable completion failed; replay must use the same prepared effect',
            {
              state: 'prepared',
              operation_digest: expectedDigest,
              preparation_digest: preparationDigest,
              completion_committed: false
            }
          );
        }

        if (
          completion?.ok !== true
          || !completion.evidence
          || completion.evidence.durable !== true
          || completion.evidence.operation_digest !== expectedDigest
          || completion.evidence.preparation_digest !== preparationDigest
        ) {
          throw new PraxisRuntimeError(
            'PRAXIS_COMPLETION_EVIDENCE_INVALID',
            'completion recorder did not return durable evidence bound to the prepared effect',
            {
              state: 'prepared',
              operation_digest: expectedDigest,
              preparation_digest: preparationDigest,
              completion_committed: false
            }
          );
        }

        values.set(instruction.name, Object.freeze({
          kind: 'Receipt',
          schema: 'praxis-receipt.v0',
          operation_digest: expectedDigest,
          preparation_digest: preparationDigest,
          authority_id: prepared.authority.authority_id,
          executor_receipt: Object.freeze({ ...result.receipt }),
          completion_evidence: Object.freeze({ ...completion.evidence })
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
