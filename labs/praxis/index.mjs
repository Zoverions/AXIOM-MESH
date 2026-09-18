import {
  createHash,
  createPublicKey,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify
} from 'node:crypto';

const HOST_AUTHORITY = Symbol('praxis.host-authority');
const HOST_SECRET_REF = Symbol('praxis.host-secret-ref');
const HOST_PREPARED_REF = Symbol('praxis.host-prepared-ref');
const HOST_OPERATION_REGISTRY = Symbol('praxis.host-operation-registry');
const VERIFIED_EVIDENCE = Symbol('praxis.verified-evidence');
const consumedAuthorityTokens = new WeakSet();
const consumedPreparedRefs = new WeakSet();

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

export function operationDigestPraxis({
  action,
  scope,
  args = [],
  secretReferences = []
}) {
  return operationDigest({
    schema: 'praxis-operation.v0',
    action: String(action),
    scope: String(scope),
    args,
    secret_references: secretReferences
  });
}

export function irDigestPraxis(ir) {
  if (!ir || typeof ir !== 'object') {
    throw new TypeError('Praxis IR digest requires an object');
  }
  const { digest: ignoredDigest, ...body } = ir;
  return `sha256:${digestPraxis(body)}`;
}

function deepFreezePraxis(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreezePraxis(item);
  return Object.freeze(value);
}

function immutablePraxisSnapshot(value) {
  return deepFreezePraxis(canonicalizePraxis(value));
}

export function createOperationDescriptorPraxis({
  action,
  scope,
  args = [],
  secretReferences = [],
  effect = undefined,
  irreversible = undefined,
  egress = undefined,
  hostOperation = undefined
}) {
  if (!action || !scope) throw new TypeError('Praxis operation descriptor requires action and scope');
  const bodyInput = {
    schema: 'praxis-operation.v0',
    action: String(action),
    scope: String(scope),
    args,
    secret_references: secretReferences
  };
  if (effect !== undefined) {
    if (typeof effect !== 'string' || effect.length === 0) {
      throw new TypeError('Praxis measured operation effect must be a non-empty string');
    }
    if (irreversible !== undefined && typeof irreversible !== 'boolean') {
      throw new TypeError('Praxis measured operation irreversible must be boolean');
    }
    if (egress !== undefined && egress !== null && (typeof egress !== 'string' || egress.length === 0)) {
      throw new TypeError('Praxis measured operation egress must be null or a non-empty string');
    }
    bodyInput.host_operation = String(hostOperation ?? action);
    bodyInput.effect = effect;
    bodyInput.irreversible = irreversible === true;
    bodyInput.egress = egress ?? null;
  }
  const body = immutablePraxisSnapshot(bodyInput);
  return Object.freeze({
    kind: 'Operation',
    ...body,
    operation_digest: operationDigest(body)
  });
}

function validateOperationDescriptorPraxis(operation) {
  if (!operation || operation.kind !== 'Operation' || operation.schema !== 'praxis-operation.v0') {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_SUBJECT_REQUIRED',
      'policy evaluation requires a Praxis Operation descriptor'
    );
  }
  const {
    kind: ignoredKind,
    operation_digest: claimedDigest,
    ...body
  } = operation;
  const expected = operationDigest(body);
  if (claimedDigest !== expected) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_SUBJECT_INVALID',
      'operation descriptor digest does not match its content'
    );
  }
  return operation;
}


export function createHostOperationRegistry(definitions = {}) {
  const operations = {};
  for (const [name, definition] of Object.entries(definitions)) {
    if (['__proto__', 'constructor', 'prototype'].includes(name)) {
      throw new TypeError('host operation name is forbidden: ' + name);
    }
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      throw new TypeError('host operation ' + name + ' definition must be an object');
    }
    const action = String(definition.action ?? name);
    const scope = String(definition.scope ?? '');
    const effect = String(definition.effect ?? '');
    const irreversible = definition.irreversible === true;
    const egress = definition.egress ?? null;
    if (!action || !scope || !effect) {
      throw new TypeError('host operation ' + name + ' requires action, scope, and effect');
    }
    if (definition.irreversible !== undefined && typeof definition.irreversible !== 'boolean') {
      throw new TypeError('host operation ' + name + ' irreversible must be boolean');
    }
    if (egress !== null && (typeof egress !== 'string' || egress.length === 0)) {
      throw new TypeError('host operation ' + name + ' egress must be null or a non-empty string');
    }
    operations[name] = Object.freeze({
      name,
      action,
      scope,
      effect,
      irreversible,
      egress
    });
  }
  return Object.freeze({
    [HOST_OPERATION_REGISTRY]: true,
    schema: 'praxis-host-operation-registry.v0',
    operations: Object.freeze(operations)
  });
}

function normalizeHostOperationRegistry(registry) {
  if (registry === null || registry === undefined) return null;
  if (
    !registry
    || registry[HOST_OPERATION_REGISTRY] !== true
    || registry.schema !== 'praxis-host-operation-registry.v0'
    || !registry.operations
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_OPERATION_REGISTRY',
      'run hostOperations must be a Praxis host operation registry'
    );
  }
  return registry;
}

function keyToPublicDerBase64(key) {
  if (typeof key === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(key)) return key;
  const publicKey = key?.type === 'public' ? key : createPublicKey(key);
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

function publicKeyFromDerBase64(value) {
  return createPublicKey({
    key: Buffer.from(value, 'base64'),
    format: 'der',
    type: 'spki'
  });
}

function signatureBodyDigest(body) {
  return 'sha256:' + digestPraxis(body);
}

function signDigest(digest, privateKey) {
  return cryptoSign(null, Buffer.from(digest, 'utf8'), privateKey).toString('base64');
}

function verifyDigestSignature(digest, signature, publicKey) {
  try {
    return cryptoVerify(
      null,
      Buffer.from(digest, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

function normalizePrincipalDefinitions(principals) {
  const output = {};
  const usedKeys = new Set();
  for (const [name, definition] of Object.entries(principals ?? {})) {
    if (!definition || !['human', 'agent', 'service'].includes(definition.kind)) {
      throw new TypeError('principal ' + name + ' must declare kind human, agent, or service');
    }
    const publicKey = keyToPublicDerBase64(definition.publicKey ?? definition.public_key);
    if (usedKeys.has(publicKey)) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_KEYS',
        'charter cannot bind one public key to multiple principals'
      );
    }
    usedKeys.add(publicKey);
    output[name] = {
      kind: definition.kind,
      public_key: publicKey
    };
  }
  return output;
}

function normalizeAgentBindings(agents, principals) {
  const output = {};
  for (const [agent, principal] of Object.entries(agents ?? {})) {
    if (!Object.hasOwn(principals, principal)) {
      throw new TypeError('agent ' + agent + ' references unknown principal ' + principal);
    }
    output[agent] = String(principal);
  }
  return output;
}


function normalizeEffectEnvelopes(effectEnvelopes, principals) {
  const output = {};
  for (const [principal, effects] of Object.entries(effectEnvelopes ?? {})) {
    if (!Object.hasOwn(principals, principal)) {
      throw new TypeError('effect envelope references unknown principal ' + principal);
    }
    if (!Array.isArray(effects)) {
      throw new TypeError('effect envelope for ' + principal + ' must be an array');
    }
    const normalized = effects.map(effect => {
      if (typeof effect !== 'string' || effect.length === 0) {
        throw new TypeError('effect envelope entries must be non-empty strings');
      }
      return effect;
    });
    if (new Set(normalized).size !== normalized.length) {
      throw new TypeError('effect envelope for ' + principal + ' contains duplicate effects');
    }
    output[principal] = Object.freeze([...normalized].sort());
  }
  return Object.freeze(output);
}

const POLICY_COMPARATORS = new Set(['eq', 'neq', 'lt', 'lte', 'gt', 'gte']);
const FORBIDDEN_POLICY_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function policyPremiseError(message) {
  return new PraxisRuntimeError('PRAXIS_POLICY_PREMISE', message);
}

function normalizePolicyPath(path, label) {
  if (path === undefined || path === null) return Object.freeze([]);
  if (!Array.isArray(path)) {
    throw policyPremiseError(label + ' path must be an array');
  }
  const normalized = path.map(segment => {
    if (
      !(typeof segment === 'string' || (Number.isSafeInteger(segment) && segment >= 0))
    ) {
      throw policyPremiseError(label + ' path contains an invalid segment');
    }
    if (typeof segment === 'string' && FORBIDDEN_POLICY_PATH_SEGMENTS.has(segment)) {
      throw policyPremiseError(label + ' path contains a forbidden host-runtime name');
    }
    return segment;
  });
  return Object.freeze(normalized);
}

function normalizePolicyOperand(operand, label) {
  if (!operand || typeof operand !== 'object' || Array.isArray(operand)) {
    throw policyPremiseError(label + ' must be a policy operand object');
  }
  if (operand.source === 'const') {
    if (!Object.hasOwn(operand, 'value')) {
      throw policyPremiseError(label + ' constant is missing value');
    }
    return Object.freeze({
      source: 'const',
      value: immutablePraxisSnapshot(operand.value)
    });
  }
  if (operand.source === 'evidence') {
    if (typeof operand.verifier !== 'string' || operand.verifier.length === 0) {
      throw policyPremiseError(label + ' evidence operand requires verifier');
    }
    return Object.freeze({
      source: 'evidence',
      verifier: operand.verifier,
      path: normalizePolicyPath(operand.path, label)
    });
  }
  if (operand.source === 'operation') {
    const path = normalizePolicyPath(operand.path, label);
    if (path.length === 0) {
      throw policyPremiseError(label + ' operation operand requires a path');
    }
    if (!['action', 'scope', 'args', 'operation_digest'].includes(path[0])) {
      throw policyPremiseError(label + ' operation path may read only action, scope, args, or operation_digest');
    }
    return Object.freeze({
      source: 'operation',
      path
    });
  }
  throw policyPremiseError(
    label + ' may use only verified evidence, exact operation fields, or constants'
  );
}

function normalizePolicyPredicate(predicate, index, requiredVerifiers) {
  if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) {
    throw policyPremiseError('require[' + index + '] must be an object');
  }
  if (!POLICY_COMPARATORS.has(predicate.op)) {
    throw policyPremiseError('require[' + index + '] uses unsupported comparator ' + predicate.op);
  }
  const left = normalizePolicyOperand(predicate.left, 'require[' + index + '].left');
  const right = normalizePolicyOperand(predicate.right, 'require[' + index + '].right');
  for (const operand of [left, right]) {
    if (operand.source === 'evidence' && !requiredVerifiers.has(operand.verifier)) {
      throw policyPremiseError(
        'require[' + index + '] references evidence verifier ' + operand.verifier
        + ' without declaring it in requires_evidence'
      );
    }
  }
  return Object.freeze({
    op: predicate.op,
    left,
    right
  });
}

function normalizePolicyDefinition(name, definition) {
  if (!definition || !['Permit', 'Quorum'].includes(definition.authority_kind)) {
    throw new TypeError('policy ' + name + ' must declare authority_kind Permit or Quorum');
  }
  if (!definition.action || !definition.scope) {
    throw new TypeError('policy ' + name + ' requires action and scope');
  }
  if (!Number.isSafeInteger(definition.expires_ms) || definition.expires_ms <= 0) {
    throw new TypeError('policy ' + name + ' requires positive expires_ms');
  }
  if (definition.require !== undefined && !Array.isArray(definition.require)) {
    throw policyPremiseError('policy ' + name + ' require must be an array');
  }
  const requiresEvidence = Object.freeze(
    [...new Set((definition.requires_evidence ?? []).map(String))].sort()
  );
  const requiredVerifierSet = new Set(requiresEvidence);
  const normalized = {
    authority_kind: definition.authority_kind,
    action: String(definition.action),
    scope: String(definition.scope),
    expires_ms: definition.expires_ms,
    requires_evidence: requiresEvidence,
    require: Object.freeze(
      (definition.require ?? []).map((predicate, index) =>
        normalizePolicyPredicate(predicate, index, requiredVerifierSet)
      )
    ),
    advisor: definition.advisor ? String(definition.advisor) : null
  };
  if (definition.authority_kind === 'Quorum') {
    const members = (definition.members ?? []).map(String);
    if (members.length === 0 || new Set(members).size !== members.length) {
      throw new TypeError('policy ' + name + ' requires unique quorum members');
    }
    if (
      !Number.isSafeInteger(definition.threshold)
      || definition.threshold < 1
      || definition.threshold > members.length
    ) {
      throw new TypeError('policy ' + name + ' has invalid quorum threshold');
    }
    const humans = definition.humans ?? 0;
    if (!Number.isSafeInteger(humans) || humans < 0 || humans > definition.threshold) {
      throw new TypeError('policy ' + name + ' has invalid human minimum');
    }
    normalized.members = Object.freeze([...members].sort());
    normalized.threshold = definition.threshold;
    normalized.humans = humans;
  }
  return Object.freeze(normalized);
}

function normalizeVerifierDefinition(name, definition) {
  if (!definition?.source) throw new TypeError('verifier ' + name + ' requires source');
  if (!Number.isSafeInteger(definition.freshness_ms) || definition.freshness_ms <= 0) {
    throw new TypeError('verifier ' + name + ' requires positive freshness_ms');
  }
  const signers = (definition.signers ?? []).map(String);
  if (signers.length === 0 || new Set(signers).size !== signers.length) {
    throw new TypeError('verifier ' + name + ' requires unique signers');
  }
  return Object.freeze({
    source: String(definition.source),
    signers: Object.freeze([...signers].sort()),
    freshness_ms: definition.freshness_ms
  });
}

function pinnedDefinitions(definitions, normalizer) {
  const output = {};
  for (const [name, definition] of Object.entries(definitions ?? {})) {
    const def = normalizer(name, definition);
    output[name] = Object.freeze({
      def,
      digest: signatureBodyDigest(def)
    });
  }
  return output;
}

function validateCharterBody(body) {
  if (!body || body.schema !== 'praxis-charter.v0') {
    throw new PraxisRuntimeError('PRAXIS_CHARTER_SIGNATURE', 'invalid Praxis charter body');
  }
  const usedKeys = new Set();
  for (const [name, principal] of Object.entries(body.principals ?? {})) {
    if (!principal || !['human', 'agent', 'service'].includes(principal.kind)) {
      throw new PraxisRuntimeError('PRAXIS_CHARTER_SIGNATURE', 'invalid principal ' + name);
    }
    if (usedKeys.has(principal.public_key)) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_KEYS',
        'charter cannot bind one public key to multiple principals'
      );
    }
    usedKeys.add(principal.public_key);
  }
  for (const [agent, principal] of Object.entries(body.agents ?? {})) {
    if (!Object.hasOwn(body.principals ?? {}, principal)) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_SIGNATURE',
        'agent ' + agent + ' references unknown principal ' + principal
      );
    }
  }
  for (const [name, entry] of Object.entries(body.policies ?? {})) {
    if (!entry?.def || entry.digest !== signatureBodyDigest(entry.def)) {
      throw new PraxisRuntimeError('PRAXIS_POLICY_UNPINNED', 'policy ' + name + ' digest mismatch');
    }
    let normalizedPolicy;
    try {
      normalizedPolicy = normalizePolicyDefinition(name, entry.def);
    } catch (error) {
      if (error instanceof PraxisRuntimeError) throw error;
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_UNPINNED',
        'policy ' + name + ' is not a valid normalized policy'
      );
    }
    if (canonicalJsonPraxis(normalizedPolicy) !== canonicalJsonPraxis(entry.def)) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_UNPINNED',
        'policy ' + name + ' is not in canonical normalized form'
      );
    }
    for (const verifierName of entry.def.requires_evidence ?? []) {
      if (!Object.hasOwn(body.verifiers ?? {}, verifierName)) {
        throw new PraxisRuntimeError(
          'PRAXIS_POLICY_UNPINNED',
          'policy ' + name + ' references unpinned verifier ' + verifierName
        );
      }
    }
    for (const principalName of entry.def.members ?? []) {
      if (!Object.hasOwn(body.principals ?? {}, principalName)) {
        throw new PraxisRuntimeError(
          'PRAXIS_POLICY_UNPINNED',
          'policy ' + name + ' references unknown principal ' + principalName
        );
      }
    }
  }
  for (const [principal, effects] of Object.entries(body.effect_envelopes ?? {})) {
    if (!Object.hasOwn(body.principals ?? {}, principal)) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_SIGNATURE',
        'effect envelope references unknown principal ' + principal
      );
    }
    if (
      !Array.isArray(effects)
      || effects.some(effect => typeof effect !== 'string' || effect.length === 0)
      || new Set(effects).size !== effects.length
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_SIGNATURE',
        'effect envelope for ' + principal + ' is invalid'
      );
    }
    const sorted = [...effects].sort();
    if (sorted.some((effect, index) => effect !== effects[index])) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_SIGNATURE',
        'effect envelope for ' + principal + ' is not canonical'
      );
    }
  }
  if (!Array.isArray(body.program_digests ?? [])) {
    throw new PraxisRuntimeError(
      'PRAXIS_CHARTER_SIGNATURE',
      'charter program_digests must be an array'
    );
  }
  for (const digest of body.program_digests ?? []) {
    if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_SIGNATURE',
        'charter contains an invalid program digest'
      );
    }
  }
  for (const [name, entry] of Object.entries(body.verifiers ?? {})) {
    if (!entry?.def || entry.digest !== signatureBodyDigest(entry.def)) {
      throw new PraxisRuntimeError('PRAXIS_VERIFIER_UNPINNED', 'verifier ' + name + ' digest mismatch');
    }
    let normalizedVerifier;
    try {
      normalizedVerifier = normalizeVerifierDefinition(name, entry.def);
    } catch {
      throw new PraxisRuntimeError(
        'PRAXIS_VERIFIER_UNPINNED',
        'verifier ' + name + ' is not a valid normalized verifier'
      );
    }
    if (canonicalJsonPraxis(normalizedVerifier) !== canonicalJsonPraxis(entry.def)) {
      throw new PraxisRuntimeError(
        'PRAXIS_VERIFIER_UNPINNED',
        'verifier ' + name + ' is not in canonical normalized form'
      );
    }
    for (const signer of entry.def.signers ?? []) {
      if (!Object.hasOwn(body.principals ?? {}, signer)) {
        throw new PraxisRuntimeError(
          'PRAXIS_VERIFIER_UNPINNED',
          'verifier ' + name + ' references unknown signer ' + signer
        );
      }
    }
  }
}

export function createSyntheticCharter({
  principals = {},
  agents = {},
  policies = {},
  verifiers = {},
  programDigests = [],
  effectEnvelopes = {}
}, rootPrivateKey) {
  if (!rootPrivateKey) throw new TypeError('synthetic charter requires a root private key');
  const normalizedPrincipals = normalizePrincipalDefinitions(principals);
  const normalizedProgramDigests = [...new Set(programDigests.map(digest => {
    if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
      throw new TypeError('charter programDigests must contain sha256:<hex> digests');
    }
    return digest;
  }))].sort();
  const body = {
    schema: 'praxis-charter.v0',
    principals: normalizedPrincipals,
    agents: normalizeAgentBindings(agents, normalizedPrincipals),
    policies: pinnedDefinitions(policies, normalizePolicyDefinition),
    verifiers: pinnedDefinitions(verifiers, normalizeVerifierDefinition),
    effect_envelopes: normalizeEffectEnvelopes(effectEnvelopes, normalizedPrincipals),
    program_digests: Object.freeze(normalizedProgramDigests)
  };
  validateCharterBody(body);
  const digest = signatureBodyDigest(body);
  return Object.freeze({
    schema: 'praxis-signed-charter.v0',
    body: Object.freeze(body),
    digest,
    signer_public_key: keyToPublicDerBase64(rootPrivateKey),
    signature: signDigest(digest, rootPrivateKey)
  });
}

export function verifySyntheticCharter(charter, trustedRootKeys) {
  if (!charter || charter.schema !== 'praxis-signed-charter.v0') {
    throw new PraxisRuntimeError('PRAXIS_CHARTER_SIGNATURE', 'signed charter is required');
  }
  validateCharterBody(charter.body);
  const expectedDigest = signatureBodyDigest(charter.body);
  if (charter.digest !== expectedDigest) {
    throw new PraxisRuntimeError('PRAXIS_CHARTER_SIGNATURE', 'charter digest mismatch');
  }
  const trusted = Array.isArray(trustedRootKeys) ? trustedRootKeys : [trustedRootKeys];
  const trustedPublicKeys = new Set(
    trusted.filter(Boolean).map(keyToPublicDerBase64)
  );
  if (!trustedPublicKeys.has(charter.signer_public_key)) {
    throw new PraxisRuntimeError('PRAXIS_CHARTER_SIGNATURE', 'charter signer is not trusted');
  }
  if (
    !verifyDigestSignature(
      charter.digest,
      charter.signature,
      publicKeyFromDerBase64(charter.signer_public_key)
    )
  ) {
    throw new PraxisRuntimeError('PRAXIS_CHARTER_SIGNATURE', 'charter signature is invalid');
  }
  return Object.freeze({
    charter,
    digest: charter.digest,
    body: charter.body
  });
}

export function createHostObservation({
  source,
  value,
  issuedAt,
  principal,
  privateKey,
  nonce = randomBytes(16).toString('hex')
}) {
  if (!source || !principal || !privateKey) {
    throw new TypeError('host observation requires source, principal, and privateKey');
  }
  const issuedAtMs = typeof issuedAt === 'number' ? issuedAt : Date.parse(String(issuedAt));
  if (!Number.isFinite(issuedAtMs)) throw new TypeError('observation issuedAt is invalid');
  const body = Object.freeze({
    schema: 'praxis-observation.v0',
    source: String(source),
    value: immutablePraxisSnapshot(value),
    issued_at_ms: issuedAtMs,
    principal: String(principal),
    nonce: String(nonce)
  });
  const digest = signatureBodyDigest(body);
  return Object.freeze({
    schema: 'praxis-signed-observation.v0',
    body,
    digest,
    signature: signDigest(digest, privateKey)
  });
}

export function verifyHostObservation({
  observation,
  verifierName,
  charter,
  trustedRootKeys,
  now
}) {
  const charterContext = verifySyntheticCharter(charter, trustedRootKeys);
  const verifier = charterContext.body.verifiers?.[verifierName];
  if (!verifier) {
    throw new PraxisRuntimeError(
      'PRAXIS_VERIFIER_UNPINNED',
      'verifier ' + verifierName + ' is not charter-pinned'
    );
  }
  if (!observation || observation.schema !== 'praxis-signed-observation.v0') {
    throw new PraxisRuntimeError('PRAXIS_UNVERIFIED', 'signed observation is required');
  }
  const expectedDigest = signatureBodyDigest(observation.body);
  if (observation.digest !== expectedDigest) {
    throw new PraxisRuntimeError('PRAXIS_UNVERIFIED', 'observation digest mismatch');
  }
  const def = verifier.def;
  if (observation.body.source !== def.source) {
    throw new PraxisRuntimeError(
      'PRAXIS_VERIFIER_ORIGIN',
      'observation source ' + observation.body.source + ' does not match ' + def.source
    );
  }
  if (!def.signers.includes(observation.body.principal)) {
    throw new PraxisRuntimeError(
      'PRAXIS_UNVERIFIED',
      'principal ' + observation.body.principal + ' is not an allowed signer'
    );
  }
  const principal = charterContext.body.principals[observation.body.principal];
  if (
    !verifyDigestSignature(
      observation.digest,
      observation.signature,
      publicKeyFromDerBase64(principal.public_key)
    )
  ) {
    throw new PraxisRuntimeError('PRAXIS_UNVERIFIED', 'observation signature is invalid');
  }
  const nowMs = typeof now === 'number' ? now : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) throw new TypeError('verification time is invalid');
  const validUntil = observation.body.issued_at_ms + def.freshness_ms;
  if (observation.body.issued_at_ms > nowMs || nowMs >= validUntil) {
    throw new PraxisRuntimeError('PRAXIS_EVIDENCE_STALE', 'observation evidence is stale');
  }
  return Object.freeze({
    [VERIFIED_EVIDENCE]: true,
    kind: 'Verified',
    value: observation.body.value,
    provenance: observation.body.source,
    verifier_name: verifierName,
    verifier_digest: verifier.digest,
    evidence_digest: observation.digest,
    issued_at_ms: observation.body.issued_at_ms,
    valid_until_ms: validUntil,
    signer: observation.body.principal,
    charter_digest: charterContext.digest
  });
}

function requireVerifiedAuthorityEvidence(evidence, policy, charterContext, nowMs) {
  const items = Array.isArray(evidence) ? evidence : [];
  const byVerifier = Object.create(null);
  for (const item of items) {
    if (!item || item[VERIFIED_EVIDENCE] !== true || item.kind !== 'Verified') {
      throw new PraxisRuntimeError(
        'PRAXIS_EVIDENCE_REQUIRED',
        'authority premises require kernel-verified evidence'
      );
    }
    if (item.charter_digest !== charterContext.digest) {
      throw new PraxisRuntimeError('PRAXIS_EVIDENCE_REQUIRED', 'evidence belongs to another charter');
    }
    const pinnedVerifier = charterContext.body.verifiers?.[item.verifier_name];
    if (!pinnedVerifier || pinnedVerifier.digest !== item.verifier_digest) {
      throw new PraxisRuntimeError(
        'PRAXIS_VERIFIER_UNPINNED',
        'evidence verifier ' + item.verifier_name + ' is not pinned by this charter'
      );
    }
    if (nowMs >= item.valid_until_ms) {
      throw new PraxisRuntimeError('PRAXIS_EVIDENCE_STALE', 'authority evidence is stale');
    }
    if (Object.hasOwn(byVerifier, item.verifier_name)) {
      throw new PraxisRuntimeError(
        'PRAXIS_EVIDENCE_AMBIGUOUS',
        'multiple authority evidence values were supplied for verifier ' + item.verifier_name
      );
    }
    byVerifier[item.verifier_name] = item;
  }
  for (const required of policy.requires_evidence ?? []) {
    if (!Object.hasOwn(byVerifier, required)) {
      throw new PraxisRuntimeError(
        'PRAXIS_EVIDENCE_REQUIRED',
        'policy requires verified evidence from ' + required
      );
    }
  }
  const metadata = Object.freeze(items.map(item => Object.freeze({
    verifier_name: item.verifier_name,
    verifier_digest: item.verifier_digest,
    evidence_digest: item.evidence_digest,
    valid_until_ms: item.valid_until_ms,
    source: item.provenance,
    signer: item.signer
  })));
  return Object.freeze({
    items: Object.freeze([...items]),
    by_verifier: Object.freeze(byVerifier),
    metadata
  });
}

function readPolicyPath(root, path, label) {
  let current = root;
  for (const segment of path) {
    if (
      current === null
      || current === undefined
      || (typeof current !== 'object' && typeof current !== 'string')
      || !Object.hasOwn(Object(current), segment)
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_ERROR',
        label + ' path does not exist'
      );
    }
    current = current[segment];
  }
  return current;
}

function resolvePolicyOperand(operand, evidenceByVerifier, operation) {
  if (operand.source === 'const') return operand.value;
  if (operand.source === 'evidence') {
    const evidence = evidenceByVerifier[operand.verifier];
    if (!evidence) {
      throw new PraxisRuntimeError(
        'PRAXIS_EVIDENCE_REQUIRED',
        'policy premise evidence ' + operand.verifier + ' is unavailable'
      );
    }
    return readPolicyPath(
      evidence.value,
      operand.path,
      'evidence ' + operand.verifier
    );
  }
  if (operand.source === 'operation') {
    if (!operation) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_SUBJECT_REQUIRED',
        'policy premise references the operation but no exact descriptor was supplied'
      );
    }
    return readPolicyPath(operation, operand.path, 'operation');
  }
  throw new PraxisRuntimeError('PRAXIS_POLICY_ERROR', 'unknown policy operand source');
}

function policyValuesEqual(left, right) {
  try {
    return canonicalJsonPraxis(left) === canonicalJsonPraxis(right);
  } catch {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_ERROR',
      'policy equality comparison received a non-canonical value'
    );
  }
}

function comparePolicyValues(op, left, right) {
  if (op === 'eq') return policyValuesEqual(left, right);
  if (op === 'neq') return !policyValuesEqual(left, right);
  const leftType = typeof left;
  const rightType = typeof right;
  if (
    leftType !== rightType
    || !['number', 'string'].includes(leftType)
    || (leftType === 'number' && (!Number.isFinite(left) || !Number.isFinite(right)))
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_ERROR',
      'ordered policy comparison requires two finite numbers or two strings'
    );
  }
  if (op === 'lt') return left < right;
  if (op === 'lte') return left <= right;
  if (op === 'gt') return left > right;
  if (op === 'gte') return left >= right;
  throw new PraxisRuntimeError('PRAXIS_POLICY_ERROR', 'unknown policy comparator ' + op);
}

function evaluatePolicyRequirements(policy, evidenceContext, operation) {
  const results = [];
  for (const [index, predicate] of (policy.require ?? []).entries()) {
    const left = resolvePolicyOperand(predicate.left, evidenceContext.by_verifier, operation);
    const right = resolvePolicyOperand(predicate.right, evidenceContext.by_verifier, operation);
    let satisfied;
    try {
      satisfied = comparePolicyValues(predicate.op, left, right);
    } catch (error) {
      if (error instanceof PraxisRuntimeError) throw error;
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_ERROR',
        'policy require[' + index + '] evaluation failed closed'
      );
    }
    if (satisfied !== true) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_REQUIRE',
        'policy require[' + index + '] was not satisfied'
      );
    }
    results.push(Object.freeze({
      predicate_digest: signatureBodyDigest(predicate),
      result: true
    }));
  }
  return Object.freeze(results);
}

function resolveRequesterPrincipal(charterContext, requester) {
  if (Object.hasOwn(charterContext.body.principals, requester)) return requester;
  const principal = charterContext.body.agents?.[requester];
  if (principal) return principal;
  throw new PraxisRuntimeError(
    'PRAXIS_UNKNOWN_PRINCIPAL',
    'requester ' + requester + ' is not chartered'
  );
}

export function createApprovalRequest({
  charter,
  policyName,
  operationDigest,
  evidence = [],
  requester,
  expiresAt,
  nonce = randomBytes(16).toString('hex')
}) {
  const policy = charter?.body?.policies?.[policyName];
  if (!policy) throw new TypeError('unknown policy ' + policyName);
  normalizeOperationDigest(operationDigest);
  const expiresAtMs = typeof expiresAt === 'number' ? expiresAt : Date.parse(String(expiresAt));
  if (!Number.isFinite(expiresAtMs)) throw new TypeError('approval expiry is invalid');
  const body = Object.freeze({
    schema: 'praxis-approval-request.v0',
    charter_digest: charter.digest,
    policy_name: String(policyName),
    policy_digest: policy.digest,
    operation_digest: operationDigest,
    evidence_digests: Object.freeze(
      evidence.map(item => item?.evidence_digest).filter(Boolean).sort()
    ),
    requester: String(requester),
    nonce: String(nonce),
    expires_at_ms: expiresAtMs
  });
  return Object.freeze({
    schema: 'praxis-approval-request-envelope.v0',
    body,
    digest: signatureBodyDigest(body)
  });
}

export function signApprovalRequest({ request, principal, privateKey }) {
  if (!request || request.schema !== 'praxis-approval-request-envelope.v0') {
    throw new TypeError('approval request envelope is required');
  }
  if (request.digest !== signatureBodyDigest(request.body)) {
    throw new TypeError('approval request digest is invalid');
  }
  return Object.freeze({
    schema: 'praxis-approval.v0',
    principal: String(principal),
    request_digest: request.digest,
    signature: signDigest(request.digest, privateKey)
  });
}

async function runPinnedAdvisor(policy, advisors, context) {
  if (!policy.advisor) return null;
  const advisor = advisors?.[policy.advisor];
  if (typeof advisor !== 'function') {
    throw new PraxisRuntimeError(
      'PRAXIS_ADVISOR_REQUIRED',
      'pinned advisor ' + policy.advisor + ' is unavailable'
    );
  }
  let result;
  try {
    result = await advisor(Object.freeze(context));
  } catch {
    throw new PraxisRuntimeError(
      'PRAXIS_ADVISOR_REQUIRED',
      'pinned advisor ' + policy.advisor + ' failed closed'
    );
  }
  if (!result || result.ok !== true || typeof result.deny !== 'boolean') {
    throw new PraxisRuntimeError(
      'PRAXIS_ADVISOR_REQUIRED',
      'pinned advisor ' + policy.advisor + ' did not return explicit ok and deny'
    );
  }
  if (result.deny) {
    throw new PraxisRuntimeError('PRAXIS_POLICY_VETO', 'pinned advisor ' + policy.advisor + ' vetoed');
  }
  return Object.freeze({
    advisor: policy.advisor,
    deny: false
  });
}

function validateApprovalRequest({
  request,
  charterContext,
  policyName,
  policyEntry,
  operationDigest,
  evidenceMetadata,
  requester,
  nowMs
}) {
  if (!request || request.schema !== 'praxis-approval-request-envelope.v0') {
    throw new PraxisRuntimeError('PRAXIS_QUORUM', 'approval request is required');
  }
  if (request.digest !== signatureBodyDigest(request.body)) {
    throw new PraxisRuntimeError('PRAXIS_QUORUM', 'approval request digest mismatch');
  }
  const expectedEvidence = evidenceMetadata.map(item => item.evidence_digest).sort();
  const actualEvidence = [...(request.body.evidence_digests ?? [])].sort();
  if (
    request.body.charter_digest !== charterContext.digest
    || request.body.policy_name !== policyName
    || request.body.policy_digest !== policyEntry.digest
    || request.body.operation_digest !== operationDigest
    || request.body.requester !== requester
    || expectedEvidence.length !== actualEvidence.length
    || expectedEvidence.some((digest, index) => digest !== actualEvidence[index])
  ) {
    throw new PraxisRuntimeError('PRAXIS_QUORUM', 'approval request does not match authority request');
  }
  if (nowMs >= request.body.expires_at_ms) {
    throw new PraxisRuntimeError('PRAXIS_QUORUM', 'approval request expired');
  }
}

function normalizeAuthoritySubject(operation, suppliedDigest) {
  if (operation !== null && operation !== undefined) {
    const validated = validateOperationDescriptorPraxis(operation);
    if (suppliedDigest !== null && suppliedDigest !== undefined) {
      normalizeOperationDigest(suppliedDigest);
      if (suppliedDigest !== validated.operation_digest) {
        throw new PraxisRuntimeError(
          'PRAXIS_POLICY_SUBJECT_INVALID',
          'supplied operation digest does not match the exact operation descriptor'
        );
      }
    }
    return Object.freeze({
      operation: validated,
      operation_digest: validated.operation_digest
    });
  }
  normalizeOperationDigest(suppliedDigest);
  return Object.freeze({
    operation: null,
    operation_digest: suppliedDigest
  });
}

async function createCharteredHostAuthority({
  id,
  authorityKind,
  charter,
  trustedRootKeys,
  policyName,
  operation = null,
  operationDigest = null,
  evidence = [],
  requester,
  request = null,
  approvals = [],
  advisors = {},
  now = Date.now()
}) {
  if (!id || !policyName || !requester) {
    throw new TypeError('chartered authority requires id, policyName, and requester');
  }
  const subject = normalizeAuthoritySubject(operation, operationDigest);
  const subjectDigest = subject.operation_digest;
  const nowMs = typeof now === 'number' ? now : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) throw new TypeError('authority time is invalid');
  const charterContext = verifySyntheticCharter(charter, trustedRootKeys);
  const policyEntry = charterContext.body.policies?.[policyName];
  if (!policyEntry) {
    throw new PraxisRuntimeError('PRAXIS_POLICY_UNPINNED', 'policy ' + policyName + ' is not charter-pinned');
  }
  const policy = policyEntry.def;
  if (policy.authority_kind !== authorityKind) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_UNPINNED',
      'policy ' + policyName + ' grants ' + policy.authority_kind + ', not ' + authorityKind
    );
  }
  if (
    subject.operation
    && (subject.operation.action !== policy.action || subject.operation.scope !== policy.scope)
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_SUBJECT_INVALID',
      'operation descriptor action/scope does not match the pinned policy'
    );
  }
  const requesterPrincipal = resolveRequesterPrincipal(charterContext, requester);
  const evidenceContext = requireVerifiedAuthorityEvidence(
    evidence,
    policy,
    charterContext,
    nowMs
  );
  const premises = evaluatePolicyRequirements(policy, evidenceContext, subject.operation);
  const evidenceMetadata = evidenceContext.metadata;
  const advice = await runPinnedAdvisor(policy, advisors, {
    policy_name: policyName,
    operation_digest: subjectDigest,
    evidence_digests: evidenceMetadata.map(item => item.evidence_digest),
    premise_digests: premises.map(item => item.predicate_digest),
    requester: requesterPrincipal
  });

  let approvedBy = [];
  let requestDigest = null;
  let expiry = nowMs + policy.expires_ms;

  if (authorityKind === 'Quorum') {
    validateApprovalRequest({
      request,
      charterContext,
      policyName,
      policyEntry,
      operationDigest: subjectDigest,
      evidenceMetadata,
      requester,
      nowMs
    });
    requestDigest = request.digest;
    expiry = Math.min(expiry, request.body.expires_at_ms);
    const seenPrincipals = new Set();
    const seenKeys = new Set();
    let humanCount = 0;
    for (const approval of approvals) {
      if (
        !approval
        || approval.schema !== 'praxis-approval.v0'
        || approval.request_digest !== request.digest
      ) {
        throw new PraxisRuntimeError('PRAXIS_QUORUM', 'approval is not bound to this request');
      }
      const principalName = approval.principal;
      if (!policy.members.includes(principalName)) {
        throw new PraxisRuntimeError('PRAXIS_QUORUM', 'approval principal ' + principalName + ' is not a member');
      }
      if (principalName === requesterPrincipal) {
        throw new PraxisRuntimeError('PRAXIS_QUORUM', 'requester cannot approve its own authority request');
      }
      if (seenPrincipals.has(principalName)) continue;
      const principal = charterContext.body.principals[principalName];
      if (seenKeys.has(principal.public_key)) {
        throw new PraxisRuntimeError('PRAXIS_CHARTER_KEYS', 'one key cannot fill multiple quorum seats');
      }
      if (
        !verifyDigestSignature(
          request.digest,
          approval.signature,
          publicKeyFromDerBase64(principal.public_key)
        )
      ) {
        throw new PraxisRuntimeError('PRAXIS_QUORUM', 'invalid approval signature from ' + principalName);
      }
      seenPrincipals.add(principalName);
      seenKeys.add(principal.public_key);
      if (principal.kind === 'human') humanCount += 1;
    }
    approvedBy = [...seenPrincipals].sort();
    if (approvedBy.length < policy.threshold || humanCount < (policy.humans ?? 0)) {
      throw new PraxisRuntimeError('PRAXIS_QUORUM', 'signed quorum requirements are not satisfied');
    }
  }

  return Object.freeze({
    [HOST_AUTHORITY]: authorityKind,
    schema: authorityKind === 'Quorum'
      ? 'praxis-chartered-quorum.v0'
      : 'praxis-chartered-permit.v0',
    id: String(id),
    action: policy.action,
    scope: policy.scope,
    operation_digest: subjectDigest,
    expires_at_ms: expiry,
    threshold: authorityKind === 'Quorum' ? policy.threshold : null,
    members: authorityKind === 'Quorum' ? policy.members : null,
    approved_by: Object.freeze(approvedBy),
    human_minimum: authorityKind === 'Quorum' ? policy.humans : 0,
    charter_digest: charterContext.digest,
    policy_name: policyName,
    policy_digest: policyEntry.digest,
    requester: requesterPrincipal,
    request_digest: requestDigest,
    evidence: evidenceMetadata,
    premises,
    advice
  });
}

export async function createCharteredHostPermit(options) {
  return createCharteredHostAuthority({
    ...options,
    authorityKind: 'Permit'
  });
}

export async function createCharteredHostQuorum(options) {
  return createCharteredHostAuthority({
    ...options,
    authorityKind: 'Quorum'
  });
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
      case 'cancel':
        return this.cancel();
      case 'commit':
        return this.commit();
      case 'finalize':
        return this.finalize();
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

    if (resourceType === 'prepared') {
      const action = this.identifier();
      this.take('@');
      const scope = this.identifier();
      this.take(';');
      return {
        kind: 'RequirePrepared',
        name,
        action,
        scope
      };
    }

    if (resourceType === 'quorum') {
      const action = this.identifier();
      this.take('@');
      const scope = this.identifier();
      this.word('threshold');
      const threshold = this.take('number').value;
      this.word('of');
      const members = [this.identifier()];
      while (this.current().type === ',') {
        this.take(',');
        members.push(this.identifier());
      }
      this.take(';');
      return {
        kind: 'RequireQuorum',
        name,
        action,
        scope,
        threshold,
        members
      };
    }

    if (resourceType !== 'permit' && resourceType !== 'lease') {
      throw new PraxisSyntaxError(
        'requires must declare permit, lease, quorum, secret, or prepared',
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
    let declaredEffect = null;
    let declaredIrreversible = false;
    let declaredEgress = null;
    let sawIrreversible = false;
    let sawEgress = false;
    let sawSecrets = false;

    while (this.current().type === 'word') {
      if (this.current().value === 'effect') {
        if (declaredEffect !== null) {
          throw new PraxisSyntaxError('operation effect may be declared only once', this.current());
        }
        this.word('effect');
        declaredEffect = this.identifier();
        continue;
      }
      if (this.current().value === 'irreversible') {
        if (sawIrreversible) {
          throw new PraxisSyntaxError('operation irreversible may be declared only once', this.current());
        }
        this.word('irreversible');
        declaredIrreversible = true;
        sawIrreversible = true;
        continue;
      }
      if (this.current().value === 'egress') {
        if (sawEgress) {
          throw new PraxisSyntaxError('operation egress may be declared only once', this.current());
        }
        this.word('egress');
        declaredEgress = this.take('string').value;
        sawEgress = true;
        continue;
      }
      if (this.current().value === 'using') {
        if (sawSecrets) {
          throw new PraxisSyntaxError('operation secrets may be declared only once', this.current());
        }
        this.word('using');
        this.word('secrets');
        secrets.push(this.identifier());
        while (this.current().type === ',') {
          this.take(',');
          secrets.push(this.identifier());
        }
        sawSecrets = true;
        continue;
      }
      break;
    }

    if ((declaredIrreversible || declaredEgress !== null) && declaredEffect === null) {
      throw new PraxisSyntaxError(
        'operation irreversible/egress metadata requires an effect declaration',
        this.current()
      );
    }

    this.take(';');
    return {
      kind: 'Operation',
      name,
      action,
      scope,
      args,
      secrets,
      declaredEffect,
      declaredIrreversible,
      declaredEgress
    };
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

  cancel() {
    this.word('cancel');
    const operation = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Cancel', name, operation };
  }

  commit() {
    this.word('commit');
    const operation = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Commit', name, operation };
  }

  finalize() {
    this.word('finalize');
    const operation = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Finalize', name, operation };
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
  const requiredPrepared = [];
  const usedPermits = new Set();
  const preparedOperations = new Set();
  const terminalOperations = new Set();

  for (const node of ast.body) {
    assertFreshName(env, node.name);

    switch (node.kind) {
      case 'RequireQuorum': {
        if (
          !Number.isSafeInteger(node.threshold)
          || node.threshold < 1
          || node.threshold > node.members.length
        ) {
          throw new PraxisTypeError(
            'PRAXIS_INVALID_QUORUM',
            'quorum threshold must be an integer between 1 and the declared member count'
          );
        }
        if (new Set(node.members).size !== node.members.length) {
          throw new PraxisTypeError(
            'PRAXIS_INVALID_QUORUM',
            'quorum members must be unique'
          );
        }
        const members = [...node.members].sort();
        env.set(node.name, {
          kind: 'Quorum',
          action: node.action,
          scope: node.scope,
          threshold: node.threshold,
          members,
          linear: true
        });
        requiredPermits.push({
          name: node.name,
          authority_kind: 'Quorum',
          action: node.action,
          scope: node.scope,
          threshold: node.threshold,
          members
        });
        ir.push({
          op: 'REQUIRE_QUORUM',
          name: node.name,
          action: node.action,
          scope: node.scope,
          threshold: node.threshold,
          members
        });
        break;
      }

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

      case 'RequirePrepared': {
        env.set(node.name, {
          kind: 'PreparedOperation',
          action: node.action,
          scope: node.scope,
          imported: true,
          linear: true,
          irreversibility_known: false,
          irreversible: null
        });
        requiredPrepared.push({
          name: node.name,
          action: node.action,
          scope: node.scope
        });
        ir.push({
          op: 'REQUIRE_PREPARED',
          name: node.name,
          action: node.action,
          scope: node.scope
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
            || input.kind === 'Quorum'
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
          secrets: [...node.secrets],
          declared_effect: node.declaredEffect,
          irreversibility_known: node.declaredEffect !== null,
          irreversible: node.declaredEffect !== null ? node.declaredIrreversible : null,
          declared_egress: node.declaredEgress
        });
        ir.push({
          op: 'PLAN',
          name: node.name,
          action: node.action,
          scope: node.scope,
          args: node.args,
          secrets: node.secrets,
          declared_effect: node.declaredEffect,
          declared_irreversible: node.declaredEffect !== null ? node.declaredIrreversible : null,
          declared_egress: node.declaredEgress
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
        if (permit.kind !== 'Permit' && permit.kind !== 'Lease' && permit.kind !== 'Quorum') {
          throw new PraxisTypeError(
            'PRAXIS_AUTHORIZE_REQUIRES_PERMIT',
            `authorize requires Permit, Lease, or Quorum, received ${permit.kind}`
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
          linear: true,
          irreversibility_known: operation.irreversibility_known,
          irreversible: operation.irreversible
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
          linear: true,
          irreversibility_known: operation.irreversibility_known,
          irreversible: operation.irreversible
        });
        ir.push({
          op: 'PREPARE',
          name: node.name,
          operation: node.operation
        });
        break;
      }

      case 'Cancel': {
        const operation = requireBinding(env, node.operation);
        if (operation.kind !== 'PreparedOperation') {
          throw new PraxisTypeError(
            'PRAXIS_CANCEL_REQUIRES_PREPARATION',
            `cancel requires PreparedOperation, received ${operation.kind}`
          );
        }
        if (terminalOperations.has(node.operation)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            `prepared operation ${node.operation} already has a terminal transition`
          );
        }
        terminalOperations.add(node.operation);
        env.set(node.name, {
          kind: 'CancellationReceipt',
          action: operation.action,
          scope: operation.scope
        });
        ir.push({ op: 'CANCEL', name: node.name, operation: node.operation });
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
        if (operation.irreversibility_known && operation.irreversible === true) {
          throw new PraxisTypeError(
            'PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE',
            'statically irreversible prepared operation requires finalize'
          );
        }
        if (terminalOperations.has(node.operation)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            `prepared operation ${node.operation} already has a terminal transition`
          );
        }
        terminalOperations.add(node.operation);
        env.set(node.name, {
          kind: 'Receipt',
          action: operation.action,
          scope: operation.scope,
          finality: 'commit'
        });
        ir.push({ op: 'COMMIT', name: node.name, operation: node.operation });
        break;
      }

      case 'Finalize': {
        const operation = requireBinding(env, node.operation);
        if (operation.kind !== 'PreparedOperation') {
          throw new PraxisTypeError(
            'PRAXIS_FINALIZE_REQUIRES_PREPARATION',
            `finalize requires PreparedOperation, received ${operation.kind}`
          );
        }
        if (operation.irreversibility_known && operation.irreversible !== true) {
          throw new PraxisTypeError(
            'PRAXIS_FINALIZE_REQUIRES_IRREVERSIBLE',
            'finalize requires an irreversible prepared operation'
          );
        }
        if (terminalOperations.has(node.operation)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            `prepared operation ${node.operation} already has a terminal transition`
          );
        }
        terminalOperations.add(node.operation);
        env.set(node.name, {
          kind: 'Receipt',
          action: operation.action,
          scope: operation.scope,
          finality: 'finalize'
        });
        ir.push({ op: 'FINALIZE', name: node.name, operation: node.operation });
        break;
      }

      default:
        throw new PraxisTypeError('PRAXIS_UNKNOWN_AST_NODE', `unknown AST node ${node.kind}`);
    }
  }

  const moduleBody = {
    schema: 'praxis-ir.v0',
    required_permits: Object.freeze(requiredPermits.map(item => Object.freeze({ ...item }))),
    required_secrets: Object.freeze(requiredSecrets.map(item => Object.freeze({ ...item }))),
    required_prepared: Object.freeze(requiredPrepared.map(item => Object.freeze({ ...item }))),
    instructions: Object.freeze(ir.map(item => Object.freeze({ ...item }))),
    bindings: Object.freeze(
      Object.fromEntries([...env.entries()].map(([name, type]) => [name, Object.freeze({ ...type })]))
    )
  };

  return Object.freeze({
    ...moduleBody,
    digest: irDigestPraxis(moduleBody)
  });
}

export function compile(source) {
  return analyze(parse(source));
}

function normalizeOperationDigest(value, label = 'operationDigest') {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(`${label} must be a sha256:<hex> digest`);
  }
  return value;
}

export function createHostPermit({ action, scope, id, operationDigest: planDigest }) {
  if (!action || !scope || !id) throw new TypeError('host permit requires action, scope, and id');
  return Object.freeze({
    [HOST_AUTHORITY]: 'Permit',
    schema: 'praxis-host-permit.v0',
    id: String(id),
    action: String(action),
    scope: String(scope),
    operation_digest: normalizeOperationDigest(planDigest)
  });
}

export function createHostLease({ action, scope, id, expiresAt, operationDigest: planDigest }) {
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
    operation_digest: normalizeOperationDigest(planDigest),
    expires_at_ms: expiresAtMs
  });
}

export function createHostQuorum({
  id,
  action,
  scope,
  members,
  approvedBy,
  threshold,
  operationDigest: planDigest
}) {
  if (!id || !action || !scope) {
    throw new TypeError('host quorum requires id, action, and scope');
  }
  if (!Array.isArray(members) || members.length === 0) {
    throw new TypeError('host quorum requires at least one member');
  }
  if (!Array.isArray(approvedBy)) {
    throw new TypeError('host quorum approvedBy must be an array');
  }
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > members.length) {
    throw new TypeError('host quorum threshold must be an integer within the member set');
  }
  const normalizedMembers = members.map(String);
  const normalizedApprovals = approvedBy.map(String);
  if (new Set(normalizedMembers).size !== normalizedMembers.length) {
    throw new TypeError('host quorum members must be unique');
  }
  if (new Set(normalizedApprovals).size !== normalizedApprovals.length) {
    throw new TypeError('host quorum approvals must be unique');
  }
  const memberSet = new Set(normalizedMembers);
  if (normalizedApprovals.some(member => !memberSet.has(member))) {
    throw new TypeError('host quorum approval is not a declared member');
  }
  return Object.freeze({
    [HOST_AUTHORITY]: 'Quorum',
    schema: 'praxis-host-quorum.v0',
    id: String(id),
    action: String(action),
    scope: String(scope),
    operation_digest: normalizeOperationDigest(planDigest),
    threshold,
    members: Object.freeze([...normalizedMembers].sort()),
    approved_by: Object.freeze([...normalizedApprovals].sort())
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

export function createHostPreparedRef({
  id,
  action,
  scope,
  operation,
  authority,
  preparation
}) {
  if (!id || !action || !scope) {
    throw new TypeError('host prepared reference requires id, action, and scope');
  }
  if (!operation || operation.kind !== 'Operation' || operation.schema !== 'praxis-operation.v0') {
    throw new TypeError('host prepared reference requires a Praxis Operation');
  }
  const {
    kind: ignoredKind,
    operation_digest: suppliedDigest,
    ...operationBody
  } = operation;
  const expectedDigest = operationDigest(operationBody);
  if (suppliedDigest !== expectedDigest) {
    throw new TypeError('host prepared reference operation digest is invalid');
  }
  if (operation.action !== action || operation.scope !== scope) {
    throw new TypeError('host prepared reference action/scope does not match operation');
  }
  if (
    !authority
    || authority.action !== action
    || authority.scope !== scope
    || authority.operation_digest !== suppliedDigest
    || typeof authority.authority_id !== 'string'
  ) {
    throw new TypeError('host prepared reference authority binding is invalid');
  }
  if (
    !preparation
    || preparation.durable !== true
    || preparation.operation_digest !== suppliedDigest
    || typeof preparation.preparation_digest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(preparation.preparation_digest)
  ) {
    throw new TypeError('host prepared reference preparation evidence is invalid');
  }
  return Object.freeze({
    [HOST_PREPARED_REF]: true,
    schema: 'praxis-host-prepared-ref.v0',
    id: String(id),
    action: String(action),
    scope: String(scope),
    operation: Object.freeze({ ...operation }),
    authority: Object.freeze({ ...authority }),
    preparation: Object.freeze({ ...preparation })
  });
}

function resolveValue(arg, values) {
  if (arg.kind === 'literal') return arg.value;
  if (!values.has(arg.name)) {
    throw new PraxisRuntimeError('PRAXIS_RUNTIME_UNKNOWN_BINDING', `runtime binding ${arg.name} missing`);
  }
  return values.get(arg.name);
}

function validateCharteredAuthorityToken(token, requirement, charterContext, nowMs) {
  if (!token?.charter_digest) return;
  if (!charterContext) {
    throw new PraxisRuntimeError(
      'PRAXIS_CHARTER_REQUIRED',
      'chartered authority requires the signed charter at runtime'
    );
  }
  if (token.charter_digest !== charterContext.digest) {
    throw new PraxisRuntimeError('PRAXIS_CHARTER_SIGNATURE', 'authority charter digest mismatch');
  }
  const policyEntry = charterContext.body.policies?.[token.policy_name];
  if (!policyEntry || policyEntry.digest !== token.policy_digest) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_UNPINNED',
      'authority policy is not pinned by the runtime charter'
    );
  }
  const policy = policyEntry.def;
  const expectedKind = requirement.authority_kind ?? 'Permit';
  if (
    policy.authority_kind !== expectedKind
    || policy.action !== token.action
    || policy.scope !== token.scope
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_UNPINNED',
      'chartered authority does not match the pinned policy'
    );
  }
  if (expectedKind === 'Quorum') {
    const policyMembers = [...(policy.members ?? [])].sort();
    const tokenMembers = [...(token.members ?? [])].sort();
    if (
      policy.threshold !== token.threshold
      || policyMembers.length !== tokenMembers.length
      || policyMembers.some((member, index) => member !== tokenMembers[index])
      || (policy.humans ?? 0) !== (token.human_minimum ?? 0)
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_UNPINNED',
        'chartered quorum was weakened relative to the pinned policy'
      );
    }
  }
  for (const evidence of token.evidence ?? []) {
    const verifier = charterContext.body.verifiers?.[evidence.verifier_name];
    if (!verifier || verifier.digest !== evidence.verifier_digest) {
      throw new PraxisRuntimeError(
        'PRAXIS_VERIFIER_UNPINNED',
        'authority evidence uses an unpinned verifier'
      );
    }
    if (nowMs >= evidence.valid_until_ms) {
      throw new PraxisRuntimeError('PRAXIS_EVIDENCE_STALE', 'authority evidence is stale');
    }
  }
  const expectedPremises = policy.require ?? [];
  const actualPremises = token.premises ?? [];
  if (
    expectedPremises.length !== actualPremises.length
    || expectedPremises.some((predicate, index) =>
      actualPremises[index]?.result !== true
      || actualPremises[index]?.predicate_digest !== signatureBodyDigest(predicate)
    )
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_REQUIRE',
      'chartered authority does not preserve its pinned premise results'
    );
  }
  if (policy.advisor) {
    if (!token.advice || token.advice.advisor !== policy.advisor || token.advice.deny !== false) {
      throw new PraxisRuntimeError(
        'PRAXIS_ADVISOR_REQUIRED',
        'pinned advisor result is missing from authority'
      );
    }
  }
}

function validateEffectEnvelope(authority, operation, charterContext) {
  if (!operation || operation.effect === undefined) return;
  if (!authority?.charter_digest) return;
  if (!charterContext) {
    throw new PraxisRuntimeError(
      'PRAXIS_CHARTER_REQUIRED',
      'chartered measured effect requires the signed charter'
    );
  }
  if (authority.charter_digest !== charterContext.digest) {
    throw new PraxisRuntimeError(
      'PRAXIS_CHARTER_SIGNATURE',
      'measured effect authority charter digest mismatch'
    );
  }
  const requester = authority.requester;
  const allowed = charterContext.body.effect_envelopes?.[requester] ?? [];
  if (!allowed.includes(operation.effect)) {
    throw new PraxisRuntimeError(
      'PRAXIS_EFFECT_ENVELOPE',
      'measured effect ' + operation.effect + ' is outside the requester effect envelope'
    );
  }
}

function validateAuthorityToken(token, requirement, {
  nowMs,
  revokedAuthorityIds,
  operationDigest: expectedOperationDigest = null,
  charterContext = null
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
  if (
    token.expires_at_ms !== null
    && token.expires_at_ms !== undefined
    && nowMs >= token.expires_at_ms
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_EXPIRED',
      `host authority token ${token.id} expired`
    );
  }
  validateCharteredAuthorityToken(token, requirement, charterContext, nowMs);
  if (expectedKind === 'Quorum') {
    const expectedMembers = [...requirement.members].sort();
    const actualMembers = Array.isArray(token.members) ? [...token.members].sort() : [];
    if (
      expectedMembers.length !== actualMembers.length
      || expectedMembers.some((member, index) => member !== actualMembers[index])
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_QUORUM_MISMATCH',
        `host quorum ${token.id} does not match the declared member set`
      );
    }
    if (token.threshold !== requirement.threshold) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_QUORUM_MISMATCH',
        `host quorum ${token.id} threshold ${token.threshold} does not match declared threshold ${requirement.threshold}`
      );
    }
    if (!Array.isArray(token.approved_by) || token.approved_by.length < requirement.threshold) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_QUORUM_INSUFFICIENT',
        `host quorum ${token.id} has insufficient approvals for threshold ${requirement.threshold}`
      );
    }
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
  if (expectedOperationDigest !== null && token.operation_digest !== expectedOperationDigest) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_PLAN_MISMATCH',
      `host authority ${token.id} is not bound to operation ${expectedOperationDigest}`
    );
  }
}

function runtimeKnowledgeKind(kind) {
  return kind === 'Observed' || kind === 'Verified' || kind === 'Assessment' || kind === 'Receipt';
}

function assertRuntimeOrdinaryValue(value, path = 'value', seen = new Set()) {
  if (value === null || typeof value !== 'object') return;

  if (seen.has(value)) {
    throw new PraxisRuntimeError(
      'PRAXIS_IR_MALFORMED',
      `runtime value at ${path} contains a cycle`
    );
  }
  seen.add(value);

  if (value.kind === 'SecretRef') {
    throw new PraxisRuntimeError(
      'PRAXIS_SECRET_EXFILTRATION',
      `SecretRef cannot cross the ordinary value channel at ${path}`
    );
  }
  if (
    value.kind === 'Permit'
    || value.kind === 'Lease'
    || value.kind === 'Quorum'
    || value.kind === 'AuthorizedOperation'
    || value.kind === 'PreparedOperation'
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_AUTHORITY_EXFILTRATION',
      `${value.kind} cannot cross the ordinary value channel at ${path}`
    );
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertRuntimeOrdinaryValue(item, `${path}[${index}]`, seen));
  } else {
    for (const [key, item] of Object.entries(value)) {
      assertRuntimeOrdinaryValue(item, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function validateRuntimeIr(ir) {
  if (!ir || ir.schema !== 'praxis-ir.v0') {
    throw new PraxisRuntimeError('PRAXIS_IR_MALFORMED', 'run expects praxis-ir.v0');
  }
  if (ir.digest !== irDigestPraxis(ir)) {
    throw new PraxisRuntimeError('PRAXIS_IR_TAMPERED', 'Praxis IR digest mismatch');
  }
  if (
    !Array.isArray(ir.required_permits)
    || !Array.isArray(ir.required_secrets)
    || !Array.isArray(ir.required_prepared)
    || !Array.isArray(ir.instructions)
  ) {
    throw new PraxisRuntimeError('PRAXIS_IR_MALFORMED', 'Praxis IR tables must be arrays');
  }
  const allowed = new Set([
    'REQUIRE_PERMIT',
    'REQUIRE_LEASE',
    'REQUIRE_QUORUM',
    'REQUIRE_SECRET',
    'REQUIRE_PREPARED',
    'OBSERVE',
    'VERIFY',
    'ASSESS',
    'PLAN',
    'AUTHORIZE',
    'PREPARE',
    'CANCEL',
    'COMMIT',
    'FINALIZE'
  ]);
  for (const instruction of ir.instructions) {
    if (!instruction || typeof instruction !== 'object' || !allowed.has(instruction.op)) {
      throw new PraxisRuntimeError('PRAXIS_IR_MALFORMED', 'Praxis IR contains an unknown instruction');
    }
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
  if (value instanceof Set) {
    return Object.freeze({
      has(id) {
        return value.has(id) || value.has(String(id));
      }
    });
  }
  if (Array.isArray(value)) {
    const snapshot = new Set(value.map(String));
    return Object.freeze({
      has(id) {
        return snapshot.has(String(id));
      }
    });
  }
  throw new TypeError('revokedAuthorityIds must be an array or Set');
}

function runtimeTime(now) {
  return normalizeRuntimeTime(typeof now === 'function' ? now() : now);
}

function validatePreparedAuthorityState(prepared, {
  nowMs,
  revokedAuthorityIds,
  charterContext = null
}) {
  const authority = prepared?.authority;
  const operation = prepared?.operation;
  if (
    !authority
    || !operation
    || authority.operation_digest !== operation.operation_digest
    || typeof authority.authority_id !== 'string'
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_IR_MALFORMED',
      'prepared operation authority binding is invalid'
    );
  }
  if (revokedAuthorityIds.has(authority.authority_id)) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_REVOKED',
      `host authority token ${authority.authority_id} is revoked at commit`
    );
  }
  if (
    authority.expires_at_ms !== null
    && authority.expires_at_ms !== undefined
    && nowMs >= authority.expires_at_ms
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_EXPIRED',
      `host authority token ${authority.authority_id} expired before commit`
    );
  }
  if (authority.charter_digest) {
    if (!charterContext) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_REQUIRED',
        'chartered prepared authority requires the signed charter at replay/commit'
      );
    }
    if (authority.charter_digest !== charterContext.digest) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_SIGNATURE',
        'prepared authority charter digest does not match the runtime charter'
      );
    }
    const policyEntry = charterContext.body.policies?.[authority.policy_name];
    if (!policyEntry || policyEntry.digest !== authority.policy_digest) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_UNPINNED',
        'prepared authority policy is not pinned by the runtime charter'
      );
    }
    const policy = policyEntry.def;
    if (
      policy.authority_kind !== authority.authority_kind
      || policy.action !== authority.action
      || policy.scope !== authority.scope
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_UNPINNED',
        'prepared authority does not match the pinned policy'
      );
    }
    if (authority.authority_kind === 'Quorum') {
      const expectedMembers = [...(policy.members ?? [])].sort();
      const actualMembers = [...(authority.members ?? [])].sort();
      if (
        policy.threshold !== authority.threshold
        || expectedMembers.length !== actualMembers.length
        || expectedMembers.some((member, index) => member !== actualMembers[index])
        || (policy.humans ?? 0) !== (authority.human_minimum ?? 0)
      ) {
        throw new PraxisRuntimeError(
          'PRAXIS_POLICY_UNPINNED',
          'prepared quorum was weakened relative to the pinned policy'
        );
      }
    }
    const expectedPremises = policy.require ?? [];
    const actualPremises = authority.premises ?? [];
    if (
      expectedPremises.length !== actualPremises.length
      || expectedPremises.some((predicate, index) =>
        actualPremises[index]?.result !== true
        || actualPremises[index]?.predicate_digest !== signatureBodyDigest(predicate)
      )
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_REQUIRE',
        'prepared authority does not preserve its pinned premise results'
      );
    }
    if (policy.advisor) {
      if (
        !authority.advice
        || authority.advice.advisor !== policy.advisor
        || authority.advice.deny !== false
      ) {
        throw new PraxisRuntimeError(
          'PRAXIS_ADVISOR_REQUIRED',
          'prepared authority is missing the pinned advisor result'
        );
      }
    }
  }
  validateEffectEnvelope(authority, operation, charterContext);
  for (const evidence of authority.evidence ?? []) {
    if (authority.charter_digest) {
      const verifier = charterContext?.body.verifiers?.[evidence.verifier_name];
      if (!verifier || verifier.digest !== evidence.verifier_digest) {
        throw new PraxisRuntimeError(
          'PRAXIS_VERIFIER_UNPINNED',
          'prepared authority evidence uses an unpinned verifier'
        );
      }
    }
    if (nowMs >= evidence.valid_until_ms) {
      throw new PraxisRuntimeError(
        'PRAXIS_EVIDENCE_STALE',
        'authority evidence expired before commit'
      );
    }
  }
}

export async function run(source, {
  authorities = {},
  secrets = {},
  prepared = {},
  observations = {},
  charter = null,
  trustedCharterKeys = [],
  hostOperations = null,
  preparer = null,
  executor = null,
  completer = null,
  canceler = null,
  verifiers = {},
  assessors = {},
  now = Date.now(),
  revokedAuthorityIds = []
} = {}) {
  const ir = typeof source === 'string' ? compile(source) : source;
  validateRuntimeIr(ir);

  const values = new Map();
  const requirements = new Map(ir.required_permits.map(item => [item.name, item]));
  const secretRequirements = new Map((ir.required_secrets ?? []).map(item => [item.name, item]));
  const preparedRequirements = new Map((ir.required_prepared ?? []).map(item => [item.name, item]));
  const authorityTokens = new Map();
  const secretRefs = new Map();
  const preparedRefs = new Map();
  const terminalPreparedValues = new WeakSet();
  const revoked = normalizeRevocations(revokedAuthorityIds);
  const charterContext = charter
    ? verifySyntheticCharter(charter, trustedCharterKeys)
    : null;
  const hostOperationRegistry = normalizeHostOperationRegistry(hostOperations);
  if (
    charterContext
    && (charterContext.body.program_digests?.length ?? 0) > 0
    && !charterContext.body.program_digests.includes(ir.digest)
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_PROGRAM_UNPINNED',
      'executed Praxis IR is not pinned by the signed charter'
    );
  }

  const bindValue = (name, value) => {
    if (typeof name !== 'string' || name.length === 0) {
      throw new PraxisRuntimeError('PRAXIS_IR_MALFORMED', 'Praxis IR binding name is invalid');
    }
    if (values.has(name)) {
      throw new PraxisRuntimeError(
        'PRAXIS_IR_DUPLICATE_BINDING',
        `Praxis IR attempts to redefine binding ${name}`
      );
    }
    values.set(name, value);
  };

  for (const requirement of ir.required_permits) {
    const token = authorities[requirement.name];
    validateAuthorityToken(token, requirement, {
      nowMs: runtimeTime(now),
      revokedAuthorityIds: revoked,
      charterContext
    });
    authorityTokens.set(requirement.name, token);
    bindValue(requirement.name, {
      kind: requirement.authority_kind ?? 'Permit',
      authority_id: token.id,
      action: token.action,
      scope: token.scope,
      expires_at_ms: token.expires_at_ms ?? null,
      threshold: token.threshold ?? null,
      members: token.members ?? null,
      approved_by: token.approved_by ?? null,
      human_minimum: token.human_minimum ?? 0,
      operation_digest: token.operation_digest,
      charter_digest: token.charter_digest ?? null,
      policy_name: token.policy_name ?? null,
      policy_digest: token.policy_digest ?? null,
      requester: token.requester ?? null,
      request_digest: token.request_digest ?? null,
      evidence: token.evidence ?? null,
      premises: token.premises ?? null,
      advice: token.advice ?? null
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
    bindValue(requirement.name, Object.freeze({
      kind: 'SecretRef',
      secret_ref_id: ref.id,
      secret_kind: ref.kind
    }));
  }

  for (const requirement of ir.required_prepared ?? []) {
    const ref = prepared[requirement.name];
    if (!ref || ref[HOST_PREPARED_REF] !== true) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_PREPARED_REQUIRED',
        `host did not provide a prepared-effect reference for ${requirement.name}`
      );
    }
    if (consumedPreparedRefs.has(ref)) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_PREPARED_CONSUMED',
        `prepared-effect reference ${ref.id} already has a terminal transition`
      );
    }
    if (ref.action !== requirement.action || ref.scope !== requirement.scope) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_PREPARED_MISMATCH',
        `prepared-effect reference ${ref.id} does not match ${requirement.action}@${requirement.scope}`
      );
    }
    preparedRefs.set(requirement.name, ref);
    bindValue(requirement.name, Object.freeze({
      kind: 'PreparedOperation',
      operation: ref.operation,
      authority: ref.authority,
      preparation: ref.preparation,
      prepared_ref_id: ref.id,
      imported: true
    }));
  }

  for (const instruction of ir.instructions) {
    switch (instruction.op) {
      case 'REQUIRE_PERMIT':
      case 'REQUIRE_LEASE':
      case 'REQUIRE_QUORUM':
      case 'REQUIRE_SECRET':
      case 'REQUIRE_PREPARED':
        break;

      case 'OBSERVE': {
        const observedValue = resolveValue(instruction.value, values);
        assertRuntimeOrdinaryValue(observedValue, `observe ${instruction.name}`);
        const signedObservation = observations[instruction.provenance] ?? null;
        if (signedObservation) {
          if (
            signedObservation.schema !== 'praxis-signed-observation.v0'
            || signedObservation.body?.source !== instruction.provenance
            || canonicalJsonPraxis(signedObservation.body?.value) !== canonicalJsonPraxis(observedValue)
          ) {
            throw new PraxisRuntimeError(
              'PRAXIS_OBSERVATION_MISMATCH',
              'signed observation does not match the requested source/value'
            );
          }
        }
        bindValue(instruction.name, {
          kind: 'Observed',
          value: signedObservation ? signedObservation.body.value : observedValue,
          provenance: instruction.provenance,
          host_observation: signedObservation
        });
        break;
      }

      case 'VERIFY': {
        const input = values.get(instruction.input);
        if (!input || (input.kind !== 'Observed' && input.kind !== 'Verified')) {
          throw new PraxisRuntimeError(
            'PRAXIS_VERIFY_REQUIRES_EVIDENCE',
            `verify requires Observed or Verified input, received ${input?.kind ?? 'missing'}`
          );
        }

        if (input.host_observation) {
          if (!charterContext) {
            throw new PraxisRuntimeError(
              'PRAXIS_CHARTER_REQUIRED',
              'signed observations require a trusted charter'
            );
          }
          const verified = verifyHostObservation({
            observation: input.host_observation,
            verifierName: instruction.policy,
            charter,
            trustedRootKeys: trustedCharterKeys,
            now: runtimeTime(now)
          });
          const supplementalVerifier = verifiers[instruction.policy];
          if (supplementalVerifier !== undefined) {
            if (typeof supplementalVerifier !== 'function') {
              throw new PraxisRuntimeError(
                'PRAXIS_VERIFIER_REQUIRED',
                `verifier ${instruction.policy} is not callable`
              );
            }
            const supplementalResult = await supplementalVerifier(verified);
            if (!supplementalResult || supplementalResult.ok !== true) {
              throw new PraxisRuntimeError(
                'PRAXIS_VERIFICATION_DENIED',
                `verifier ${instruction.policy} supplemental check denied`
              );
            }
          }
          bindValue(instruction.name, verified);
          break;
        }

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
        bindValue(instruction.name, {
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
        if (!input || !runtimeKnowledgeKind(input.kind) || input.kind === 'Receipt') {
          throw new PraxisRuntimeError(
            'PRAXIS_ASSESS_REQUIRES_KNOWLEDGE',
            `assess requires knowledge input, received ${input?.kind ?? 'missing'}`
          );
        }
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
        bindValue(instruction.name, {
          kind: 'Assessment',
          value: result.value,
          policy: instruction.policy,
          based_on: instruction.input
        });
        break;
      }

      case 'PLAN': {
        if (!Array.isArray(instruction.args) || !Array.isArray(instruction.secrets ?? [])) {
          throw new PraxisRuntimeError('PRAXIS_IR_MALFORMED', 'PLAN args/secrets must be arrays');
        }
        const args = instruction.args.map((arg, index) => {
          const value = resolveValue(arg, values);
          assertRuntimeOrdinaryValue(value, `PLAN ${instruction.name} arg ${index}`);
          return value;
        });
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

        let operation;
        if (hostOperationRegistry) {
          const measured = hostOperationRegistry.operations[instruction.action];
          if (!measured) {
            throw new PraxisRuntimeError(
              'PRAXIS_HOST_OPERATION_REQUIRED',
              `host operation ${instruction.action} is not registered`
            );
          }
          if (instruction.declared_effect === null || instruction.declared_effect === undefined) {
            throw new PraxisRuntimeError(
              'PRAXIS_EFFECT_UNDECLARED',
              `operation ${instruction.name} must declare its measured effect`
            );
          }
          if (
            measured.action !== instruction.action
            || measured.scope !== instruction.scope
            || measured.effect !== instruction.declared_effect
            || measured.irreversible !== (instruction.declared_irreversible === true)
            || measured.egress !== (instruction.declared_egress ?? null)
          ) {
            throw new PraxisRuntimeError(
              'PRAXIS_LINK_MISMATCH',
              `operation ${instruction.name} declaration does not match the host-measured contract`
            );
          }
          operation = createOperationDescriptorPraxis({
            action: measured.action,
            scope: measured.scope,
            args,
            secretReferences,
            hostOperation: measured.name,
            effect: measured.effect,
            irreversible: measured.irreversible,
            egress: measured.egress
          });
        } else {
          if (
            instruction.declared_effect !== null
            && instruction.declared_effect !== undefined
          ) {
            throw new PraxisRuntimeError(
              'PRAXIS_HOST_OPERATION_REQUIRED',
              `operation ${instruction.name} declares an effect but no host registry is present`
            );
          }
          operation = createOperationDescriptorPraxis({
            action: instruction.action,
            scope: instruction.scope,
            args,
            secretReferences
          });
        }

        bindValue(instruction.name, operation);
        break;
      }

      case 'AUTHORIZE': {
        const operation = values.get(instruction.operation);
        if (!operation || operation.kind !== 'Operation') {
          throw new PraxisRuntimeError(
            'PRAXIS_AUTHORIZE_REQUIRES_OPERATION',
            `authorize requires Operation, received ${operation?.kind ?? 'missing'}`
          );
        }
        const authorityValue = values.get(instruction.permit);
        if (!authorityValue) {
          throw new PraxisRuntimeError(
            'PRAXIS_HOST_AUTHORITY_REQUIRED',
            `authority binding ${instruction.permit} is unavailable`
          );
        }
        if (!['Permit', 'Lease', 'Quorum'].includes(authorityValue.kind)) {
          throw new PraxisRuntimeError(
            'PRAXIS_AUTHORIZE_REQUIRES_PERMIT',
            `authorize requires Permit, Lease, or Quorum, received ${authorityValue.kind}`
          );
        }
        const requirement = requirements.get(instruction.permit);
        const token = authorityTokens.get(instruction.permit);
        if (!requirement || !token) {
          throw new PraxisRuntimeError(
            'PRAXIS_HOST_AUTHORITY_REQUIRED',
            `host authority token for ${instruction.permit} is unavailable`
          );
        }
        validateAuthorityToken(token, requirement, {
          nowMs: runtimeTime(now),
          revokedAuthorityIds: revoked,
          operationDigest: operation.operation_digest,
          charterContext
        });
        validateEffectEnvelope(token, operation, charterContext);
        bindValue(instruction.name, Object.freeze({
          kind: 'AuthorizedOperation',
          operation,
          permit_name: instruction.permit,
          authority: Object.freeze({
            authority_id: token.id,
            authority_kind: requirement.authority_kind ?? 'Permit',
            action: token.action,
            scope: token.scope,
            operation_digest: token.operation_digest,
            expires_at_ms: token.expires_at_ms ?? null,
            threshold: token.threshold ?? null,
            members: token.members ?? null,
            approved_by: token.approved_by ?? null,
            human_minimum: token.human_minimum ?? 0,
            charter_digest: token.charter_digest ?? null,
            policy_name: token.policy_name ?? null,
            policy_digest: token.policy_digest ?? null,
            requester: token.requester ?? null,
            request_digest: token.request_digest ?? null,
            evidence: token.evidence ?? null,
            premises: token.premises ?? null,
            advice: token.advice ?? null
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
        if (!authorized || authorized.kind !== 'AuthorizedOperation' || authorized.operation?.kind !== 'Operation') {
          throw new PraxisRuntimeError(
            'PRAXIS_PREPARE_REQUIRES_AUTHORITY',
            `prepare requires AuthorizedOperation, received ${authorized?.kind ?? 'missing'}`
          );
        }
        const requirement = requirements.get(authorized.permit_name);
        const token = authorityTokens.get(authorized.permit_name);
        validateAuthorityToken(token, requirement, {
          nowMs: runtimeTime(now),
          revokedAuthorityIds: revoked,
          operationDigest: authorized.operation.operation_digest,
          charterContext
        });
        validateEffectEnvelope(token, authorized.operation, charterContext);

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
        bindValue(instruction.name, Object.freeze({
          kind: 'PreparedOperation',
          operation: authorized.operation,
          authority: authorized.authority,
          preparation: Object.freeze({ ...evidence })
        }));
        break;
      }

      case 'CANCEL': {
        if (typeof canceler !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_CANCELER_REQUIRED',
            'cancel is fail-closed: a host durable cancellation recorder must be explicitly injected'
          );
        }

        const preparedValue = values.get(instruction.operation);
        if (!preparedValue || preparedValue.kind !== 'PreparedOperation') {
          throw new PraxisRuntimeError(
            'PRAXIS_CANCEL_REQUIRES_PREPARATION',
            `cancel requires PreparedOperation, received ${preparedValue?.kind ?? 'missing'}`
          );
        }
        if (terminalPreparedValues.has(preparedValue)) {
          throw new PraxisRuntimeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            'prepared operation already has a terminal transition'
          );
        }
        const cancellationRequest = Object.freeze({
          schema: 'praxis-cancellation-request.v0',
          operation_digest: preparedValue.operation.operation_digest,
          preparation_digest: preparedValue.preparation.preparation_digest,
          idempotency_key: preparedValue.preparation.preparation_digest
        });

        let cancellation;
        try {
          cancellation = await canceler(cancellationRequest);
        } catch {
          throw new PraxisRuntimeError(
            'PRAXIS_CANCELLATION_UNCOMMITTED',
            'cancellation was not durable; effect remains prepared',
            {
              state: 'prepared',
              operation_digest: cancellationRequest.operation_digest,
              preparation_digest: cancellationRequest.preparation_digest
            }
          );
        }

        if (
          cancellation?.ok !== true
          || !cancellation.evidence
          || cancellation.evidence.durable !== true
          || cancellation.evidence.operation_digest !== cancellationRequest.operation_digest
          || cancellation.evidence.preparation_digest !== cancellationRequest.preparation_digest
        ) {
          throw new PraxisRuntimeError(
            'PRAXIS_CANCELLATION_EVIDENCE_INVALID',
            'cancellation evidence is not bound to the prepared effect',
            {
              state: 'prepared',
              operation_digest: cancellationRequest.operation_digest,
              preparation_digest: cancellationRequest.preparation_digest
            }
          );
        }

        terminalPreparedValues.add(preparedValue);
        const importedRef = preparedRefs.get(instruction.operation);
        if (importedRef) consumedPreparedRefs.add(importedRef);

        bindValue(instruction.name, Object.freeze({
          kind: 'CancellationReceipt',
          schema: 'praxis-cancellation-receipt.v0',
          operation_digest: cancellationRequest.operation_digest,
          preparation_digest: cancellationRequest.preparation_digest,
          cancellation_evidence: Object.freeze({ ...cancellation.evidence })
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
        if (!prepared || prepared.kind !== 'PreparedOperation') {
          throw new PraxisRuntimeError(
            'PRAXIS_COMMIT_REQUIRES_PREPARATION',
            `commit requires PreparedOperation, received ${prepared?.kind ?? 'missing'}`
          );
        }
        if (terminalPreparedValues.has(prepared)) {
          throw new PraxisRuntimeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            'prepared operation already has a terminal transition'
          );
        }
        validatePreparedAuthorityState(prepared, {
          nowMs: runtimeTime(now),
          revokedAuthorityIds: revoked,
          charterContext
        });

        const expectedDigest = prepared.operation.operation_digest;
        const preparationDigest = prepared.preparation.preparation_digest;
        const request = Object.freeze({
          schema: 'praxis-commit-request.v0',
          operation: prepared.operation,
          authority: prepared.authority,
          preparation: prepared.preparation,
          idempotency_key: preparationDigest
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

        terminalPreparedValues.add(prepared);
        const importedRef = preparedRefs.get(instruction.operation);
        if (importedRef) consumedPreparedRefs.add(importedRef);

        bindValue(instruction.name, Object.freeze({
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
