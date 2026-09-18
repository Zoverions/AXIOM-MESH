import {
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify
} from 'node:crypto';

import {
  PraxisRuntimeError,
  canonicalizePraxis,
  canonicalJsonPraxis,
  digestPraxis,
  createOperationDescriptorPraxis,
  createCharteredHostPermit,
  createCharteredHostQuorum,
  verifySyntheticCharter
} from './index.mjs';

const SHA256 = /^sha256:[a-f0-9]{64}$/;

function fail(code, message) {
  throw new PraxisRuntimeError(code, message);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function snapshot(value) {
  return deepFreeze(canonicalizePraxis(value));
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail('PRAXIS_EFFECT_CONTRACT', `${label} must contain exactly ${expected.join(', ')}`);
  }
}

function normalizeOptionalString(value, label) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string or null`);
  }
  return value;
}

function normalizeStringSet(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  const normalized = values.map(value => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label} entries must be non-empty strings`);
    }
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    fail('PRAXIS_EFFECT_CONTRACT', `${label} must not contain duplicates`);
  }
  return Object.freeze([...normalized].sort());
}

function normalizeOperationContract(name, value) {
  exactKeys(
    value,
    ['action', 'scope', 'effect', 'irreversible', 'egress_class', 'destination'],
    `operation contract ${name}`
  );
  if (typeof value.action !== 'string' || value.action.length === 0) {
    throw new TypeError(`operation contract ${name} requires action`);
  }
  if (typeof value.scope !== 'string' || value.scope.length === 0) {
    throw new TypeError(`operation contract ${name} requires scope`);
  }
  if (typeof value.effect !== 'string' || value.effect.length === 0) {
    throw new TypeError(`operation contract ${name} requires effect`);
  }
  if (typeof value.irreversible !== 'boolean') {
    throw new TypeError(`operation contract ${name} irreversible must be boolean`);
  }
  const egressClass = normalizeOptionalString(
    value.egress_class,
    `operation contract ${name} egress_class`
  );
  const destination = normalizeOptionalString(
    value.destination,
    `operation contract ${name} destination`
  );
  if ((egressClass === null) !== (destination === null)) {
    fail(
      'PRAXIS_EFFECT_CONTRACT',
      `operation contract ${name} must declare both egress_class and destination or neither`
    );
  }
  return Object.freeze({
    action: value.action,
    scope: value.scope,
    effect: value.effect,
    irreversible: value.irreversible,
    egress_class: egressClass,
    destination
  });
}

function normalizeContractMap(operations, label) {
  if (!operations || typeof operations !== 'object' || Array.isArray(operations)) {
    throw new TypeError(`${label} operations must be a plain object`);
  }
  const out = {};
  for (const name of Object.keys(operations).sort()) {
    if (!name) throw new TypeError(`${label} operation name must be non-empty`);
    out[name] = normalizeOperationContract(name, operations[name]);
  }
  if (Object.keys(out).length === 0) {
    fail('PRAXIS_EFFECT_CONTRACT', `${label} must define at least one operation`);
  }
  return Object.freeze(out);
}

function sealed(schema, body) {
  const canonical = snapshot({ schema, ...body });
  return Object.freeze({
    ...canonical,
    digest: `sha256:${digestPraxis(canonical)}`
  });
}

function validateSeal(value, schema, label) {
  if (!value || value.schema !== schema || !SHA256.test(value.digest ?? '')) {
    fail('PRAXIS_EFFECT_TAMPER', `${label} is malformed`);
  }
  const { digest, ...body } = value;
  const expected = `sha256:${digestPraxis(body)}`;
  if (digest !== expected) fail('PRAXIS_EFFECT_TAMPER', `${label} digest mismatch`);
}

export function createHostOperationRegistryPraxis(operations) {
  return sealed('praxis-host-operation-registry.v0', {
    operations: normalizeContractMap(operations, 'host registry')
  });
}

export function createProgramEffectManifestPraxis({
  programDigest,
  declaredEffects,
  operations
}) {
  if (!SHA256.test(programDigest ?? '')) {
    throw new TypeError('programDigest must be sha256:<hex>');
  }
  return sealed('praxis-program-effect-manifest.v0', {
    program_digest: programDigest,
    declared_effects: normalizeStringSet(declaredEffects, 'declaredEffects'),
    operations: normalizeContractMap(operations, 'program manifest')
  });
}

function publicDerBase64(key) {
  const publicKey = key?.type === 'public' ? key : createPublicKey(key);
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

function signatureDigest(body) {
  return `sha256:${digestPraxis(body)}`;
}

export function createSignedCharterEffectEnvelopePraxis({
  charter,
  trustedRootKeys,
  principal,
  allowedEffects,
  allowedEgressClasses = [],
  allowedDestinations = []
}, rootPrivateKey) {
  if (!rootPrivateKey) throw new TypeError('effect envelope requires rootPrivateKey');
  const charterContext = verifySyntheticCharter(charter, trustedRootKeys);
  if (!Object.hasOwn(charterContext.body.principals, principal)) {
    fail('PRAXIS_EFFECT_ENVELOPE', `principal ${principal} is not present in the signed charter`);
  }
  const signer = publicDerBase64(rootPrivateKey);
  if (signer !== charter.signer_public_key) {
    fail('PRAXIS_EFFECT_ENVELOPE', 'effect envelope must be signed by the charter root key');
  }
  const body = snapshot({
    schema: 'praxis-charter-effect-envelope.v0',
    charter_digest: charterContext.digest,
    principal: String(principal),
    allowed_effects: normalizeStringSet(allowedEffects, 'allowedEffects'),
    allowed_egress_classes: normalizeStringSet(allowedEgressClasses, 'allowedEgressClasses'),
    allowed_destinations: normalizeStringSet(allowedDestinations, 'allowedDestinations')
  });
  const digest = signatureDigest(body);
  return Object.freeze({
    schema: 'praxis-signed-effect-envelope.v0',
    body,
    digest,
    signer_public_key: signer,
    signature: cryptoSign(null, Buffer.from(digest, 'utf8'), rootPrivateKey).toString('base64')
  });
}

export function verifySignedCharterEffectEnvelopePraxis({
  envelope,
  charter,
  trustedRootKeys
}) {
  const charterContext = verifySyntheticCharter(charter, trustedRootKeys);
  if (!envelope || envelope.schema !== 'praxis-signed-effect-envelope.v0') {
    fail('PRAXIS_EFFECT_ENVELOPE', 'signed effect envelope is required');
  }
  const expectedDigest = signatureDigest(envelope.body);
  if (envelope.digest !== expectedDigest) {
    fail('PRAXIS_EFFECT_ENVELOPE', 'effect envelope digest mismatch');
  }
  if (
    envelope.body?.schema !== 'praxis-charter-effect-envelope.v0'
    || envelope.body.charter_digest !== charterContext.digest
  ) {
    fail('PRAXIS_EFFECT_ENVELOPE', 'effect envelope is not bound to the current signed charter');
  }
  if (envelope.signer_public_key !== charter.signer_public_key) {
    fail('PRAXIS_EFFECT_ENVELOPE', 'effect envelope signer is not the charter root');
  }
  if (!Object.hasOwn(charterContext.body.principals, envelope.body.principal)) {
    fail('PRAXIS_EFFECT_ENVELOPE', 'effect envelope principal is not chartered');
  }
  const key = createPublicKey({
    key: Buffer.from(envelope.signer_public_key, 'base64'),
    format: 'der',
    type: 'spki'
  });
  let valid = false;
  try {
    valid = cryptoVerify(
      null,
      Buffer.from(envelope.digest, 'utf8'),
      key,
      Buffer.from(envelope.signature, 'base64')
    );
  } catch {
    valid = false;
  }
  if (!valid) fail('PRAXIS_EFFECT_ENVELOPE', 'effect envelope signature is invalid');

  const canonicalBody = snapshot({
    schema: 'praxis-charter-effect-envelope.v0',
    charter_digest: envelope.body.charter_digest,
    principal: envelope.body.principal,
    allowed_effects: normalizeStringSet(envelope.body.allowed_effects, 'allowed_effects'),
    allowed_egress_classes: normalizeStringSet(
      envelope.body.allowed_egress_classes,
      'allowed_egress_classes'
    ),
    allowed_destinations: normalizeStringSet(
      envelope.body.allowed_destinations,
      'allowed_destinations'
    )
  });
  if (canonicalJsonPraxis(canonicalBody) !== canonicalJsonPraxis(envelope.body)) {
    fail('PRAXIS_EFFECT_ENVELOPE', 'effect envelope body is not canonical');
  }
  return Object.freeze({ charter: charterContext, envelope });
}

function validateOperationDescriptor(operation) {
  if (!operation || operation.kind !== 'Operation' || operation.schema !== 'praxis-operation.v0') {
    fail('PRAXIS_EFFECT_OPERATION', 'exact Praxis Operation descriptor is required');
  }
  const reconstructed = createOperationDescriptorPraxis({
    action: operation.action,
    scope: operation.scope,
    args: operation.args,
    secretReferences: operation.secret_references
  });
  if (reconstructed.operation_digest !== operation.operation_digest) {
    fail('PRAXIS_EFFECT_OPERATION', 'operation descriptor digest is invalid');
  }
  return operation;
}

function contractsEqual(left, right) {
  return canonicalJsonPraxis(left) === canonicalJsonPraxis(right);
}

export function measureOperationEffectPraxis({
  operationName,
  operation,
  registry,
  manifest
}) {
  validateSeal(registry, 'praxis-host-operation-registry.v0', 'host operation registry');
  validateSeal(manifest, 'praxis-program-effect-manifest.v0', 'program effect manifest');
  validateOperationDescriptor(operation);
  if (typeof operationName !== 'string' || operationName.length === 0) {
    throw new TypeError('operationName must be a non-empty string');
  }
  const measured = registry.operations?.[operationName];
  if (!measured) {
    fail('PRAXIS_EFFECT_REGISTRY', `host registry has no operation ${operationName}`);
  }
  const declared = manifest.operations?.[operationName];
  if (!declared) {
    fail('PRAXIS_EFFECT_DECLARATION', `program manifest has no operation ${operationName}`);
  }
  if (!contractsEqual(measured, declared)) {
    fail(
      'PRAXIS_EFFECT_MEASUREMENT',
      `program contract for ${operationName} does not match host-measured operation metadata`
    );
  }
  if (operation.action !== measured.action || operation.scope !== measured.scope) {
    fail('PRAXIS_EFFECT_MEASUREMENT', 'operation action/scope does not match the host registry');
  }
  if (!manifest.declared_effects.includes(measured.effect)) {
    fail(
      'PRAXIS_EFFECT_UNDECLARED',
      `measured effect ${measured.effect} was not declared by the program`
    );
  }
  return sealed('praxis-measured-effect.v0', {
    program_digest: manifest.program_digest,
    registry_digest: registry.digest,
    manifest_digest: manifest.digest,
    operation_name: operationName,
    operation_digest: operation.operation_digest,
    action: measured.action,
    scope: measured.scope,
    effect: measured.effect,
    irreversible: measured.irreversible,
    egress_class: measured.egress_class,
    destination: measured.destination
  });
}

function assertProgramPinned(manifest, charterContext) {
  const pinned = charterContext.body.program_digests ?? [];
  if (!pinned.includes(manifest.program_digest)) {
    fail(
      'PRAXIS_EFFECT_PROGRAM_UNPINNED',
      'program effect manifest is not bound to a program digest pinned by the signed charter'
    );
  }
}

function assertEnvelopeAllows(measurement, envelopeBody) {
  if (!envelopeBody.allowed_effects.includes(measurement.effect)) {
    fail(
      'PRAXIS_EFFECT_ENVELOPE',
      `signed charter effect envelope does not allow ${measurement.effect}`
    );
  }
  if (
    measurement.egress_class !== null
    && !envelopeBody.allowed_egress_classes.includes(measurement.egress_class)
  ) {
    fail(
      'PRAXIS_EFFECT_ENVELOPE',
      `signed charter effect envelope does not allow egress class ${measurement.egress_class}`
    );
  }
  if (
    measurement.destination !== null
    && !envelopeBody.allowed_destinations.includes(measurement.destination)
  ) {
    fail(
      'PRAXIS_EFFECT_ENVELOPE',
      `signed charter effect envelope does not allow destination ${measurement.destination}`
    );
  }
}

function expectedTerminalMode(measurement) {
  return measurement.irreversible ? 'finalize' : 'commit';
}

async function issueExistingCharteredAuthority({
  authorityRequest,
  operation,
  charter,
  trustedRootKeys
}) {
  if (!authorityRequest || typeof authorityRequest !== 'object' || Array.isArray(authorityRequest)) {
    throw new TypeError('authorityRequest must be an object');
  }
  const authorityKind = authorityRequest.authorityKind ?? 'Permit';
  if (!['Permit', 'Quorum'].includes(authorityKind)) {
    fail('PRAXIS_EFFECT_AUTHORITY', 'P0.4 accepts only existing chartered Permit or Quorum authority');
  }
  const common = {
    id: authorityRequest.id,
    charter,
    trustedRootKeys,
    policyName: authorityRequest.policyName,
    operation,
    evidence: authorityRequest.evidence ?? [],
    requester: authorityRequest.requester,
    request: authorityRequest.request ?? null,
    approvals: authorityRequest.approvals ?? [],
    advisors: authorityRequest.advisors ?? {},
    now: authorityRequest.now ?? Date.now()
  };
  const authority = authorityKind === 'Quorum'
    ? await createCharteredHostQuorum(common)
    : await createCharteredHostPermit(common);
  if (!authority?.policy_digest || !Array.isArray(authority.premises)) {
    fail('PRAXIS_EFFECT_AUTHORITY', 'existing Praxis authority did not preserve pinned policy evidence');
  }
  return authority;
}

function validateAuthorityBinding(authority, measurement, charterDigest, envelopePrincipal) {
  if (
    authority.operation_digest !== measurement.operation_digest
    || authority.action !== measurement.action
    || authority.scope !== measurement.scope
  ) {
    fail('PRAXIS_EFFECT_AUTHORITY', 'chartered authority is not bound to this exact measured operation');
  }
  if (authority.charter_digest !== charterDigest) {
    fail('PRAXIS_EFFECT_AUTHORITY', 'chartered authority belongs to another charter');
  }
  if (authority.requester !== envelopePrincipal) {
    fail('PRAXIS_EFFECT_AUTHORITY', 'effect envelope principal does not match authority requester');
  }
}

export async function prepareMeasuredEffectPraxis({
  operationName,
  operation,
  registry,
  manifest,
  authorityRequest,
  envelope,
  charter,
  trustedRootKeys,
  terminalMode
}) {
  const measurement = measureOperationEffectPraxis({ operationName, operation, registry, manifest });
  const envelopeContext = verifySignedCharterEffectEnvelopePraxis({
    envelope,
    charter,
    trustedRootKeys
  });
  assertProgramPinned(manifest, envelopeContext.charter);
  assertEnvelopeAllows(measurement, envelope.body);
  const authority = await issueExistingCharteredAuthority({
    authorityRequest,
    operation,
    charter,
    trustedRootKeys
  });
  validateAuthorityBinding(
    authority,
    measurement,
    envelopeContext.charter.digest,
    envelope.body.principal
  );
  const expectedMode = expectedTerminalMode(measurement);
  if (terminalMode !== expectedMode) {
    fail(
      'PRAXIS_EFFECT_TERMINAL_MODE',
      `${measurement.irreversible ? 'irreversible' : 'reversible'} effect requires ${expectedMode}`
    );
  }
  return sealed('praxis-prepared-measured-effect.v0', {
    measurement_digest: measurement.digest,
    program_digest: measurement.program_digest,
    registry_digest: measurement.registry_digest,
    manifest_digest: measurement.manifest_digest,
    operation_name: measurement.operation_name,
    operation_digest: measurement.operation_digest,
    effect: measurement.effect,
    irreversible: measurement.irreversible,
    egress_class: measurement.egress_class,
    destination: measurement.destination,
    terminal_mode: terminalMode,
    charter_digest: envelopeContext.charter.digest,
    envelope_digest: envelope.digest,
    authority_id: authority.id,
    authority_policy_digest: authority.policy_digest
  });
}

export async function revalidatePreparedEffectPraxis({
  prepared,
  operationName,
  operation,
  registry,
  manifest,
  authorityRequest,
  envelope,
  charter,
  trustedRootKeys,
  terminalMode
}) {
  validateSeal(prepared, 'praxis-prepared-measured-effect.v0', 'prepared measured effect');
  const measurement = measureOperationEffectPraxis({ operationName, operation, registry, manifest });
  const envelopeContext = verifySignedCharterEffectEnvelopePraxis({
    envelope,
    charter,
    trustedRootKeys
  });
  assertProgramPinned(manifest, envelopeContext.charter);
  assertEnvelopeAllows(measurement, envelope.body);
  const authority = await issueExistingCharteredAuthority({
    authorityRequest,
    operation,
    charter,
    trustedRootKeys
  });
  validateAuthorityBinding(
    authority,
    measurement,
    envelopeContext.charter.digest,
    envelope.body.principal
  );
  const expectedMode = expectedTerminalMode(measurement);
  if (terminalMode !== expectedMode || terminalMode !== prepared.terminal_mode) {
    fail('PRAXIS_EFFECT_TERMINAL_MODE', 'prepared replay cannot change commit/finalize mode');
  }
  const bindings = {
    measurement_digest: measurement.digest,
    program_digest: measurement.program_digest,
    registry_digest: measurement.registry_digest,
    manifest_digest: measurement.manifest_digest,
    operation_name: measurement.operation_name,
    operation_digest: measurement.operation_digest,
    effect: measurement.effect,
    irreversible: measurement.irreversible,
    egress_class: measurement.egress_class,
    destination: measurement.destination,
    terminal_mode: terminalMode,
    charter_digest: envelopeContext.charter.digest,
    envelope_digest: envelope.digest,
    authority_id: authority.id,
    authority_policy_digest: authority.policy_digest
  };
  for (const [key, value] of Object.entries(bindings)) {
    if (canonicalJsonPraxis(prepared[key]) !== canonicalJsonPraxis(value)) {
      fail('PRAXIS_EFFECT_REPLAY', `prepared measured effect changed ${key}`);
    }
  }
  return Object.freeze({
    schema: 'praxis-effect-terminal-check.v0',
    disposition: 'checked-only',
    external_effect_performed: false,
    terminal_mode: terminalMode,
    prepared_digest: prepared.digest,
    measurement_digest: measurement.digest,
    charter_digest: envelopeContext.charter.digest
  });
}
