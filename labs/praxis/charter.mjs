// labs/praxis/charter.mjs
//
// Synthetic charters, host observations, approval requests, and chartered authority issuance.
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { randomBytes } from 'node:crypto';
import { canonicalJsonPraxis, immutablePraxisSnapshot, normalizeOperationDigest, operationDigest, validateOperationDescriptorPraxis } from './canonical.mjs';
import { keyToPublicDerBase64, publicKeyFromDerBase64, signDigest, signatureBodyDigest, verifyDigestSignature } from './crypto.mjs';
import { validateEffectEnvelope } from './effects.mjs';
import { PraxisRuntimeError } from './errors.mjs';
import { HOST_AUTHORITY, VERIFIED_EVIDENCE } from './host-symbols.mjs';
import { evaluatePolicyRequirements, normalizePolicyDefinition, normalizeVerifierDefinition, pinnedDefinitions } from './policy.mjs';

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
  // A request need not come from createApprovalRequest, so its expiry is
  // checked here: a missing or non-numeric expires_at_ms never compares as
  // expired and would yield an authority whose expiry is NaN, i.e. never.
  if (
    request.body?.schema !== 'praxis-approval-request.v0'
    || !Number.isFinite(request.body.expires_at_ms)
  ) {
    throw new PraxisRuntimeError('PRAXIS_QUORUM', 'approval request is malformed');
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
  validateEffectEnvelope(
    {
      charter_digest: charterContext.digest,
      requester: requesterPrincipal
    },
    subject.operation,
    charterContext
  );
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
