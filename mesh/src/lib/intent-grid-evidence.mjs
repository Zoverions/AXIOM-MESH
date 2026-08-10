import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  compileIntentContract,
  reconcileIntentGraph,
  validateIntentGraph
} from './intent-contract.mjs';

export const INTENT_ACTIVATION_SCHEMA = 'axiom-intent-contract-activation.v1';
export const INTENT_ATTESTATION_SCHEMA = 'axiom-intent-evidence-attestation.v1';
export const INTENT_GRID_ASSESSMENT_SCHEMA = 'axiom-intent-grid-assessment.v1';
export const INTENT_ACTIVATION_RECORD_KIND = 'intent.contract.activated';
export const INTENT_ATTESTATION_RECORD_KIND = 'intent.evidence.attested';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const VERDICTS = new Set(['pass', 'fail']);
const MAX_ATTESTATION_LIFETIME_MS = 366 * 24 * 60 * 60 * 1000;

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function isoDate(value, name) {
  const date = new Date(assertString(value, name, { max: 64 }));
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return date.toISOString();
}

function normalizeBuild(raw) {
  const value = assertPlainObject(raw, 'build');
  const base = {
    kernel_version: assertString(value.kernel_version, 'build.kernel_version', { max: 64 }),
    source_digest: assertDigest(value.source_digest, 'build.source_digest')
  };
  const buildDigest = digestObject(base);
  if (value.build_digest !== undefined && value.build_digest !== buildDigest) {
    throw new ValidationError('build.build_digest does not match the exact build binding');
  }
  return { ...base, build_digest: buildDigest };
}

function normalizeEvidence(raw) {
  if (!Array.isArray(raw) || raw.length > 64) {
    throw new ValidationError('attestation.evidence must be an array with at most 64 items');
  }
  const normalized = raw.map((entry, index) => {
    const value = assertPlainObject(entry, `attestation.evidence[${index}]`);
    const output = {
      obligation: assertString(value.obligation, `attestation.evidence[${index}].obligation`, {
        max: 256
      }),
      artifact_digest: assertDigest(
        value.artifact_digest,
        `attestation.evidence[${index}].artifact_digest`
      )
    };
    if (value.artifact_type !== undefined) {
      output.artifact_type = assertString(
        value.artifact_type,
        `attestation.evidence[${index}].artifact_type`,
        { max: 128, pattern: /^[a-z][a-z0-9._:-]*$/ }
      );
    }
    if (value.ref !== undefined) {
      output.ref = assertString(value.ref, `attestation.evidence[${index}].ref`, { max: 512 });
    }
    return output;
  });
  const keys = normalized.map(item => `${item.obligation}\n${item.artifact_digest}\n${item.ref ?? ''}`);
  if (new Set(keys).size !== keys.length) {
    throw new ValidationError('attestation.evidence contains duplicate entries');
  }
  return normalized.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

export function buildIntentActivationRecord(rawContract, rawBuild, {
  supersedesActivationDigest = null
} = {}) {
  const graph = compileIntentContract(rawContract);
  const build = normalizeBuild(rawBuild);
  const contract = normalizeContractFromGraph(rawContract, graph);
  const body = {
    schema: INTENT_ACTIVATION_SCHEMA,
    record_kind: INTENT_ACTIVATION_RECORD_KIND,
    contract_id: graph.contract_id,
    contract,
    contract_digest: graph.contract_digest,
    graph,
    graph_digest: graph.graph_digest,
    build,
    supersedes_activation_digest: supersedesActivationDigest === null
      ? null
      : assertDigest(supersedesActivationDigest, 'supersedes_activation_digest')
  };
  return {
    ...body,
    activation_digest: digestObject(body)
  };
}

function normalizeContractFromGraph(rawContract, graph) {
  const recompiled = compileIntentContract(rawContract);
  if (recompiled.graph_digest !== graph.graph_digest) {
    throw new ValidationError('Intent Contract compilation is not deterministic');
  }
  const contract = structuredClone(rawContract);
  const normalizedGraph = compileIntentContract(contract);
  if (normalizedGraph.contract_digest !== graph.contract_digest) {
    throw new ValidationError('Intent Contract digest changed during normalization');
  }
  // The compiler's normalized contract is not exposed separately. Reconstruct the
  // exact digest-bound form by preserving input then validating it on every read.
  return contract;
}

export function normalizeIntentActivationRecord(raw) {
  const value = assertPlainObject(raw, 'intent activation record');
  if (value.schema !== INTENT_ACTIVATION_SCHEMA) {
    throw new ValidationError(`intent activation schema must be ${INTENT_ACTIVATION_SCHEMA}`);
  }
  if (value.record_kind !== INTENT_ACTIVATION_RECORD_KIND) {
    throw new ValidationError(`intent activation record_kind must be ${INTENT_ACTIVATION_RECORD_KIND}`);
  }
  const contract = structuredClone(assertPlainObject(value.contract, 'activation.contract'));
  const graph = compileIntentContract(contract);
  const suppliedGraph = validateIntentGraph(structuredClone(assertPlainObject(value.graph, 'activation.graph')));
  if (suppliedGraph.graph_digest !== graph.graph_digest) {
    throw new ValidationError('activation.graph does not match activation.contract');
  }
  const build = normalizeBuild(value.build);
  const body = {
    schema: INTENT_ACTIVATION_SCHEMA,
    record_kind: INTENT_ACTIVATION_RECORD_KIND,
    contract_id: assertString(value.contract_id, 'activation.contract_id', { max: 160, pattern: ID }),
    contract,
    contract_digest: assertDigest(value.contract_digest, 'activation.contract_digest'),
    graph: suppliedGraph,
    graph_digest: assertDigest(value.graph_digest, 'activation.graph_digest'),
    build,
    supersedes_activation_digest: value.supersedes_activation_digest === null
      ? null
      : assertDigest(value.supersedes_activation_digest, 'activation.supersedes_activation_digest')
  };
  if (
    body.contract_id !== graph.contract_id
    || body.contract_digest !== graph.contract_digest
    || body.graph_digest !== graph.graph_digest
  ) {
    throw new ValidationError('Intent activation contract, graph, or digest binding is invalid');
  }
  const activationDigest = digestObject(body);
  if (assertDigest(value.activation_digest, 'activation.activation_digest') !== activationDigest) {
    throw new ValidationError('activation.activation_digest is invalid');
  }
  return { ...body, activation_digest: activationDigest };
}

export function activationGovernanceAction(record) {
  const activation = normalizeIntentActivationRecord(record);
  return {
    type: 'record.decision',
    payload: {
      schema: INTENT_ACTIVATION_SCHEMA,
      record_kind: INTENT_ACTIVATION_RECORD_KIND,
      activation
    },
    rollback: {
      description: `Deactivate AXIOM Intent activation ${activation.activation_digest}`
    }
  };
}

export function buildIntentAttestationRecord(rawActivation, {
  requirement_id,
  verdict,
  evidence = [],
  expires_at,
  verifier
}) {
  const activation = normalizeIntentActivationRecord(rawActivation);
  const requirementId = assertString(requirement_id, 'requirement_id', { max: 80, pattern: ID });
  const requirement = activation.graph.requirements.find(item => item.id === requirementId);
  if (!requirement) throw new ValidationError(`Unknown Intent requirement: ${requirementId}`);
  const normalizedVerdict = assertString(verdict, 'verdict', { max: 16 });
  if (!VERDICTS.has(normalizedVerdict)) {
    throw new ValidationError('verdict must be pass or fail');
  }
  const normalizedEvidence = normalizeEvidence(evidence);
  const verifierId = assertString(verifier, 'verifier', { max: 160, pattern: ID });
  const expiresAt = isoDate(expires_at, 'expires_at');
  const body = {
    schema: INTENT_ATTESTATION_SCHEMA,
    record_kind: INTENT_ATTESTATION_RECORD_KIND,
    contract_id: activation.contract_id,
    activation_digest: activation.activation_digest,
    contract_digest: activation.contract_digest,
    graph_digest: activation.graph_digest,
    build_digest: activation.build.build_digest,
    requirement_id: requirement.id,
    verification_class: requirement.verification.classification,
    verification_method: requirement.verification.method,
    verdict: normalizedVerdict,
    evidence: normalizedEvidence,
    expires_at: expiresAt,
    verifier: verifierId
  };
  const attestationDigest = digestObject(body);
  return {
    ...body,
    attestation_id: `intent-attestation:${attestationDigest}`,
    attestation_digest: attestationDigest
  };
}

export function normalizeIntentAttestationRecord(raw) {
  const value = assertPlainObject(raw, 'intent attestation record');
  if (value.schema !== INTENT_ATTESTATION_SCHEMA) {
    throw new ValidationError(`intent attestation schema must be ${INTENT_ATTESTATION_SCHEMA}`);
  }
  if (value.record_kind !== INTENT_ATTESTATION_RECORD_KIND) {
    throw new ValidationError(`intent attestation record_kind must be ${INTENT_ATTESTATION_RECORD_KIND}`);
  }
  const body = {
    schema: INTENT_ATTESTATION_SCHEMA,
    record_kind: INTENT_ATTESTATION_RECORD_KIND,
    contract_id: assertString(value.contract_id, 'attestation.contract_id', { max: 160, pattern: ID }),
    activation_digest: assertDigest(value.activation_digest, 'attestation.activation_digest'),
    contract_digest: assertDigest(value.contract_digest, 'attestation.contract_digest'),
    graph_digest: assertDigest(value.graph_digest, 'attestation.graph_digest'),
    build_digest: assertDigest(value.build_digest, 'attestation.build_digest'),
    requirement_id: assertString(value.requirement_id, 'attestation.requirement_id', {
      max: 80,
      pattern: ID
    }),
    verification_class: assertString(value.verification_class, 'attestation.verification_class', {
      max: 32
    }),
    verification_method: assertString(value.verification_method, 'attestation.verification_method', {
      max: 1024
    }),
    verdict: assertString(value.verdict, 'attestation.verdict', { max: 16 }),
    evidence: normalizeEvidence(value.evidence ?? []),
    expires_at: isoDate(value.expires_at, 'attestation.expires_at'),
    verifier: assertString(value.verifier, 'attestation.verifier', { max: 160, pattern: ID })
  };
  if (!VERDICTS.has(body.verdict)) throw new ValidationError('attestation.verdict must be pass or fail');
  const digest = digestObject(body);
  if (assertDigest(value.attestation_digest, 'attestation.attestation_digest') !== digest) {
    throw new ValidationError('attestation.attestation_digest is invalid');
  }
  const id = assertString(value.attestation_id, 'attestation.attestation_id', { max: 160 });
  if (id !== `intent-attestation:${digest}`) {
    throw new ValidationError('attestation.attestation_id is not content-addressed');
  }
  return { ...body, attestation_id: id, attestation_digest: digest };
}

export function attestationMemoryInput(record) {
  const attestation = normalizeIntentAttestationRecord(record);
  return {
    kind: INTENT_ATTESTATION_RECORD_KIND,
    content: attestation,
    metadata: {}
  };
}

export function validateAttestationAgainstActivation(rawAttestation, rawActivation, {
  actor,
  occurredAt = new Date().toISOString()
} = {}) {
  const attestation = normalizeIntentAttestationRecord(rawAttestation);
  const activation = normalizeIntentActivationRecord(rawActivation);
  const eventTime = new Date(isoDate(occurredAt, 'occurredAt'));
  const expiry = new Date(attestation.expires_at);
  if (expiry <= eventTime) throw new ValidationError('Intent attestation is already expired');
  if (expiry.valueOf() - eventTime.valueOf() > MAX_ATTESTATION_LIFETIME_MS) {
    throw new ValidationError('Intent attestation lifetime exceeds 366 days');
  }
  if (actor !== undefined && attestation.verifier !== actor) {
    throw new ValidationError('Intent attestation verifier must match the authenticated actor');
  }
  if (
    attestation.contract_id !== activation.contract_id
    || attestation.activation_digest !== activation.activation_digest
    || attestation.contract_digest !== activation.contract_digest
    || attestation.graph_digest !== activation.graph_digest
    || attestation.build_digest !== activation.build.build_digest
  ) {
    throw new ValidationError('Intent attestation is bound to the wrong active contract or build');
  }
  const requirement = activation.graph.requirements.find(
    item => item.id === attestation.requirement_id
  );
  if (!requirement) throw new ValidationError('Intent attestation requirement is not active');
  if (
    attestation.verification_class !== requirement.verification.classification
    || attestation.verification_method !== requirement.verification.method
  ) {
    throw new ValidationError('Intent attestation verification method does not match the active graph');
  }
  const allowedObligations = new Set(requirement.verification.evidence_required ?? []);
  for (const evidence of attestation.evidence) {
    if (!allowedObligations.has(evidence.obligation)) {
      throw new ValidationError(`Intent attestation references unknown evidence obligation: ${evidence.obligation}`);
    }
  }
  if (allowedObligations.size && !attestation.evidence.length) {
    throw new ValidationError('Intent attestation requires at least one bound evidence artifact');
  }
  if (attestation.verdict === 'pass') {
    const covered = new Set(attestation.evidence.map(item => item.obligation));
    const missing = [...allowedObligations].filter(item => !covered.has(item));
    if (missing.length) {
      throw new ValidationError(`Passing attestation is missing evidence obligations: ${missing.join(', ')}`);
    }
  }
  return attestation;
}

export function deriveIntentGridAssessment(rawActivation, rawAttestationEvents, {
  now = new Date().toISOString()
} = {}) {
  const activation = normalizeIntentActivationRecord(rawActivation);
  const evaluatedAt = isoDate(now, 'assessment.now');
  if (!Array.isArray(rawAttestationEvents)) {
    throw new ValidationError('attestation events must be an array');
  }
  const validAttestations = [];
  const rejectedAttestations = [];
  for (const [index, raw] of rawAttestationEvents.entries()) {
    const envelope = assertPlainObject(raw, `attestation events[${index}]`);
    try {
      const record = validateAttestationAgainstActivation(envelope.record, activation, {
        actor: envelope.actor,
        occurredAt: envelope.occurred_at
      });
      validAttestations.push({
        record,
        actor: envelope.actor,
        occurred_at: isoDate(envelope.occurred_at, `attestation events[${index}].occurred_at`),
        seq: Number.isSafeInteger(envelope.seq) ? envelope.seq : index,
        event_id: envelope.event_id === undefined
          ? undefined
          : assertString(envelope.event_id, `attestation events[${index}].event_id`, {
              max: 160,
              pattern: ID
            })
      });
    } catch (error) {
      rejectedAttestations.push({
        index,
        code: error?.code ?? 'validation_error',
        reason: error?.message ?? String(error)
      });
    }
  }

  const latest = new Map();
  for (const item of validAttestations.sort((a, b) => a.seq - b.seq)) {
    latest.set(`${item.record.requirement_id}\n${item.actor}`, item);
  }
  const current = [...latest.values()];
  const results = activation.graph.requirements.map(requirement => {
    const candidates = current.filter(item => item.record.requirement_id === requirement.id);
    const fresh = candidates.filter(item => item.record.expires_at > evaluatedAt);
    const stale = candidates.filter(item => item.record.expires_at <= evaluatedAt);
    const pass = fresh.filter(item => item.record.verdict === 'pass');
    const fail = fresh.filter(item => item.record.verdict === 'fail');
    const requiredVerifiers = requirement.verification.minimum_independent_verifiers ?? 0;
    const requiredEvidence = requirement.verification.evidence_required ?? [];
    const coverage = new Set(pass.flatMap(item => item.record.evidence.map(e => e.obligation)));
    const missingEvidence = requiredEvidence.filter(obligation => !coverage.has(obligation));

    let status = 'unknown';
    let reason = 'missing_attestation';
    if (requirement.verification.classification === 'unknown') {
      reason = 'verification_method_unknown';
    } else if (pass.length && fail.length) {
      reason = 'conflicting_attestations';
    } else if (fail.length) {
      status = 'fail';
      reason = 'attested_failure';
    } else if (!pass.length && stale.length) {
      reason = 'stale_attestations';
    } else if (pass.length < requiredVerifiers) {
      reason = 'insufficient_independent_verifiers';
    } else if (missingEvidence.length) {
      reason = 'missing_evidence_obligations';
    } else if (pass.length || requiredVerifiers === 0) {
      status = 'pass';
      reason = 'authenticated_attestations_satisfied';
    }

    return {
      requirement_id: requirement.id,
      kind: requirement.kind,
      ...(requirement.severity ? { severity: requirement.severity } : {}),
      ...(requirement.priority ? { priority: requirement.priority } : {}),
      verification_class: requirement.verification.classification,
      status,
      reason,
      required_independent_verifiers: requiredVerifiers,
      independent_verifiers: pass.map(item => item.actor).sort(),
      failing_verifiers: fail.map(item => item.actor).sort(),
      stale_verifiers: stale.map(item => item.actor).sort(),
      required_evidence: requiredEvidence,
      covered_evidence: [...coverage].sort(),
      missing_evidence: missingEvidence,
      attestation_ids: fresh.map(item => item.record.attestation_id).sort()
    };
  });
  const summary = {
    pass: results.filter(item => item.status === 'pass').length,
    fail: results.filter(item => item.status === 'fail').length,
    unknown: results.filter(item => item.status === 'unknown').length
  };
  const assessment = {
    schema: INTENT_GRID_ASSESSMENT_SCHEMA,
    contract_id: activation.contract_id,
    activation_digest: activation.activation_digest,
    contract_digest: activation.contract_digest,
    graph_digest: activation.graph_digest,
    build: activation.build,
    evaluated_at: evaluatedAt,
    summary,
    requirements: results,
    rejected_attestations: rejectedAttestations
  };
  const derivedObservations = results.map(item => ({
    requirement_id: item.requirement_id,
    status: item.status,
    evidence_refs: item.attestation_ids,
    independent_verifiers: item.independent_verifiers.length
  }));
  const reconciliation = reconcileIntentGraph(activation.graph, derivedObservations);
  return {
    activation,
    assessment: {
      ...assessment,
      assessment_digest: digestObject(assessment)
    },
    reconciliation
  };
}

export function validateActivationSupersession(nextActivation, currentActivation) {
  const next = normalizeIntentActivationRecord(nextActivation);
  if (!currentActivation) {
    if (next.supersedes_activation_digest !== null) {
      throw new ValidationError('First Intent activation must not claim a superseded activation');
    }
    return next;
  }
  const current = normalizeIntentActivationRecord(currentActivation);
  if (next.contract_id !== current.contract_id) {
    throw new ValidationError('Intent activation supersession must stay within one contract ID');
  }
  if (next.activation_digest === current.activation_digest) {
    throw new ValidationError('Intent activation is already active');
  }
  if (next.supersedes_activation_digest !== current.activation_digest) {
    throw new ValidationError('Intent activation does not supersede the current active activation');
  }
  return next;
}

export function emptyIntentActivationProposal({
  title = 'Activate AXIOM Intent Contract',
  body = 'Activate a digest-bound AXIOM Intent Contract through the ordinary governance path.',
  activation,
  voting_ends_at,
  activate_after
}) {
  const normalized = normalizeIntentActivationRecord(activation);
  return {
    title: assertString(title, 'title', { max: 200 }),
    body: assertString(body, 'body', { max: 20_000 }),
    action: activationGovernanceAction(normalized),
    voting_ends_at: isoDate(voting_ends_at, 'voting_ends_at'),
    activate_after: isoDate(activate_after, 'activate_after')
  };
}
