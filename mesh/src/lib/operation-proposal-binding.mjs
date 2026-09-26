import { types } from 'node:util';

import {
  ValidationError,
  canonicalize,
  digestObject
} from './canonical.mjs';
import {
  computeCandidateSetDigest,
  createInertOperationManifestFixture,
  validateSemanticOperationProposalShape
} from './semantic-operation-proposal.mjs';
import {
  validateOperationCandidateSelectionProposal
} from './operation-candidate-selection.mjs';
import {
  evaluateExternalOperationOffer
} from './external-operation-offer.mjs';

/**
 * O1 Operation Proposal Binding verifier (#1628).
 *
 * Pure, inert and fail-closed. It recomputes every digest a Semantic
 * Operation Proposal claims (manifest, candidate set, selection, offers) from
 * the caller's ORIGINAL objects and binds the proposal to the deterministic
 * selection only when every check passes. A binding is evidence, never
 * permission: every effect field is a hard zero.
 */

export const OPERATION_PROPOSAL_BINDING_SCHEMA = 'axiom-operation-proposal-binding.v0';
export const OPERATION_PROPOSAL_BINDING_SCHEMA_ID =
  'urn:axiom:contract:operation-proposal-binding:v0';

const VERSION = 0;
const STATUS = 'inert-operation-proposal-binding';
const MANIFEST_SCHEMA = 'axiom-semantic-operation-manifest.v0';
const MANIFEST_STATUS = 'inert-semantic-operation-manifest';
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const REASON_TOKEN = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_DEPTH = 64;

export const OPERATION_PROPOSAL_BINDING_LIMITS = Object.freeze({
  max_candidates: 64,
  max_proposed_operations: 32,
  max_offers: 32,
  max_offer_rejection_reasons: 16
});

export const OPERATION_PROPOSAL_BINDING_STATUSES = Object.freeze([
  'bound',
  'unresolved-deliberation',
  'abstained',
  'rejected'
]);

/** Closed reason codes, in the order the checks run. */
export const OPERATION_PROPOSAL_BINDING_REASONS = Object.freeze([
  'input-not-plain-data',
  'input-malformed',
  'candidate-limit-exceeded',
  'proposed-limit-exceeded',
  'offer-limit-exceeded',
  'proposal-invalid',
  // (a) manifest
  'manifest-invalid',
  'manifest-digest-mismatch',
  'proposal-manifest-digest-mismatch',
  'candidate-not-in-manifest',
  'candidate-manifest-digest-mismatch',
  // (b) selection and candidate set
  'selection-not-recomputed',
  'candidate-set-digest-mismatch',
  // (c) discovery mode
  'discovery-mode-not-bindable',
  // (d)/(e) proposed operations
  'operation-deterministic-ineligible',
  'operation-not-selected',
  // (f) offers
  'offer-malformed',
  'offer-duplicate',
  'offer-operation-not-proposed',
  'offer-ineligible',
  'offer-digest-mismatch'
]);

const ZERO_EFFECTS = Object.freeze({
  authority_effect: 'none',
  assurance_effect: 'none',
  currentness_effect: 'none',
  execution_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  authorization_result: 'not-evaluated'
});

const TRUSTED_FIELDS = Object.freeze([
  'manifest',
  'selection_trusted_input',
  'selection',
  'proposal',
  'offers'
]);
const TRUSTED_REQUIRED = Object.freeze([
  'manifest',
  'selection_trusted_input',
  'selection',
  'proposal'
]);
const MANIFEST_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'operations',
  'authority_effect',
  'assurance_effect',
  'currentness_effect',
  'execution_effect',
  'runtime_activation',
  'network_effect',
  'selection_effect',
  'manifest_digest'
]);
const MANIFEST_ZERO = Object.freeze({
  authority_effect: 'none',
  assurance_effect: 'none',
  currentness_effect: 'none',
  execution_effect: 'none',
  runtime_activation: false,
  network_effect: 'none',
  selection_effect: 'proposal-only'
});
const OFFER_ENTRY_FIELDS = Object.freeze([
  'operation_id',
  'offer_digest',
  'offer',
  'catalog_entry',
  'constraints'
]);

const DOCUMENT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'binding_status',
  'rejection_reason',
  'offer_rejection_reasons',
  'operation_manifest_digest',
  'proposal_candidate_set_digest',
  'selection_candidate_set_digest',
  'selection_proposal_digest',
  'selection_mode',
  'proposal_id',
  'proposal_digest',
  'bound_operations',
  'binding_digest',
  'authority_effect',
  'assurance_effect',
  'currentness_effect',
  'execution_effect',
  'network_effect',
  'runtime_activation',
  'authorization_result'
]);
const NULLABLE_ON_REJECT = Object.freeze([
  'operation_manifest_digest',
  'proposal_candidate_set_digest',
  'selection_candidate_set_digest',
  'selection_proposal_digest',
  'selection_mode',
  'proposal_id',
  'proposal_digest'
]);
const DIGEST_FIELDS = Object.freeze([
  'operation_manifest_digest',
  'proposal_candidate_set_digest',
  'selection_candidate_set_digest',
  'selection_proposal_digest',
  'proposal_digest'
]);
const BOUND_OPERATION_FIELDS = Object.freeze([
  'operation_id',
  'arguments_digest',
  'offer_digest'
]);
const SELECTION_MODES = Object.freeze([
  'deterministic-exact',
  'semantic-single',
  'semantic-top-k',
  'fallback-retain-eligible',
  'fallback-escalate',
  'no-eligible-candidates'
]);

class BindingRejection extends Error {
  constructor(reason, offerReasons = []) {
    super(reason);
    this.reason = reason;
    this.offerReasons = offerReasons;
  }
}

function reject(reason, offerReasons = []) {
  throw new BindingRejection(reason, offerReasons);
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Walks the caller's original value (never a clone). Proxies, cycles,
 * accessors, symbol keys, non-enumerable state, sparse arrays and non-plain
 * prototypes all fail. Property values are read through descriptors so no
 * getter ever runs. The repo's strict canonicalize then runs on the same
 * original as the second gate.
 */
function strictPlainWalk(value, path, ancestors, depth) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError(`${path} is not a finite number`);
    return;
  }
  if (typeof value !== 'object') {
    throw new ValidationError(`${path} cannot encode ${typeof value}`);
  }
  if (types.isProxy(value)) {
    throw new ValidationError(`${path} is a Proxy`);
  }
  if (depth > MAX_DEPTH) {
    throw new ValidationError(`${path} exceeds depth bound`);
  }
  if (ancestors.has(value)) {
    throw new ValidationError(`${path} is cyclic`);
  }
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (isArray ? prototype !== Array.prototype : (prototype !== Object.prototype && prototype !== null)) {
    throw new ValidationError(`${path} has a non-plain prototype`);
  }
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key === 'symbol') {
      throw new ValidationError(`${path} has a symbol key`);
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (isArray && key === 'length') continue;
    if (!Object.hasOwn(descriptor, 'value')) {
      throw new ValidationError(`${path}.${key} is an accessor`);
    }
    if (!descriptor.enumerable) {
      throw new ValidationError(`${path}.${key} is non-enumerable`);
    }
    if (isArray && !/^(0|[1-9][0-9]*)$/.test(key)) {
      throw new ValidationError(`${path} has a custom array property ${key}`);
    }
    strictPlainWalk(descriptor.value, `${path}.${key}`, ancestors, depth + 1);
  }
  if (isArray) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, String(index))) {
        throw new ValidationError(`${path} is sparse at ${index}`);
      }
    }
  }
  ancestors.delete(value);
}

function assertStrictPlainData(value, name) {
  strictPlainWalk(value, name, new Set(), 0);
  canonicalize(value);
  return value;
}

function isStrictPlainData(value, name) {
  try {
    assertStrictPlainData(value, name);
    return true;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TypeError || error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

/** Closed-key check on own keys, including non-enumerable and symbol keys. */
function exactOwnKeys(value, required, name, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new ValidationError(`${name} contains unknown field ${String(key)}`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${name}.${key} is required`);
    }
  }
  return value;
}

function guard(reason, fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof BindingRejection) throw error;
    if (error instanceof ValidationError || error instanceof TypeError || error instanceof RangeError) {
      reject(reason);
    }
    throw error;
  }
}

function manifestDigestPreimage(manifest) {
  return {
    schema: manifest.schema,
    version: manifest.version,
    status: manifest.status,
    operations: manifest.operations
  };
}

function proposalSpaceCandidates(trustedCandidates) {
  return trustedCandidates.map((candidate) => ({
    operation_id: candidate.operationId,
    eligible: candidate.eligible,
    eligibility_reason: candidate.eligibilityReason
  }));
}

function sortBoundOperations(left, right) {
  return compareCodeUnits(left.operation_id, right.operation_id)
    || compareCodeUnits(left.arguments_digest, right.arguments_digest)
    || compareCodeUnits(left.offer_digest ?? '', right.offer_digest ?? '');
}

function bindingDigestPayload(document) {
  const payload = {};
  for (const field of DOCUMENT_FIELDS) {
    if (field === 'binding_digest') continue;
    payload[field] = document[field];
  }
  return payload;
}

function finalize(fields) {
  const document = {
    schema: OPERATION_PROPOSAL_BINDING_SCHEMA,
    version: VERSION,
    status: STATUS,
    binding_status: fields.binding_status,
    rejection_reason: fields.rejection_reason,
    offer_rejection_reasons: fields.offer_rejection_reasons,
    operation_manifest_digest: fields.operation_manifest_digest,
    proposal_candidate_set_digest: fields.proposal_candidate_set_digest,
    selection_candidate_set_digest: fields.selection_candidate_set_digest,
    selection_proposal_digest: fields.selection_proposal_digest,
    selection_mode: fields.selection_mode,
    proposal_id: fields.proposal_id,
    proposal_digest: fields.proposal_digest,
    bound_operations: [...fields.bound_operations].sort(sortBoundOperations),
    binding_digest: '0'.repeat(64),
    ...ZERO_EFFECTS
  };
  document.binding_digest = digestObject(bindingDigestPayload(document));
  validateOperationProposalBinding(document);
  return deepFreeze(document);
}

function rejectedDocument(reason, offerReasons) {
  return finalize({
    binding_status: 'rejected',
    rejection_reason: reason,
    offer_rejection_reasons: [...offerReasons],
    operation_manifest_digest: null,
    proposal_candidate_set_digest: null,
    selection_candidate_set_digest: null,
    selection_proposal_digest: null,
    selection_mode: null,
    proposal_id: null,
    proposal_digest: null,
    bound_operations: []
  });
}

function runChecks(trusted) {
  // Plain-data gate on the caller's ORIGINAL objects, before anything reads them.
  if (!isStrictPlainData(trusted, 'trusted')) reject('input-not-plain-data');

  guard('input-malformed', () => {
    exactOwnKeys(trusted, TRUSTED_REQUIRED, 'trusted', ['offers']);
    exactOwnKeys(trusted.manifest, MANIFEST_FIELDS, 'manifest');
    exactOwnKeys(trusted.selection_trusted_input, ['taskPurposeDigest', 'candidates', 'semanticEvidence', 'policy'], 'selection_trusted_input');
    if (!Array.isArray(trusted.selection_trusted_input.candidates)) {
      throw new ValidationError('selection_trusted_input.candidates must be an array');
    }
    if (!trusted.proposal || typeof trusted.proposal !== 'object' || !Array.isArray(trusted.proposal.proposed)) {
      throw new ValidationError('proposal.proposed must be an array');
    }
    if (Object.hasOwn(trusted, 'offers') && !Array.isArray(trusted.offers)) {
      throw new ValidationError('offers must be an array');
    }
  });

  const { manifest, selection_trusted_input: selectionInput, proposal } = trusted;
  const selection = trusted.selection;
  const offers = Object.hasOwn(trusted, 'offers') ? trusted.offers : [];
  const limits = OPERATION_PROPOSAL_BINDING_LIMITS;

  if (selectionInput.candidates.length > limits.max_candidates) reject('candidate-limit-exceeded');
  if (
    (Array.isArray(selection.selected) ? selection.selected.length : 0)
    + (Array.isArray(selection.withheld) ? selection.withheld.length : 0) > limits.max_candidates
  ) {
    reject('candidate-limit-exceeded');
  }
  if (proposal.proposed.length > limits.max_proposed_operations) reject('proposed-limit-exceeded');
  if (offers.length > limits.max_offers) reject('offer-limit-exceeded');

  // Object.keys-based closed checks inside the reused validators are sound
  // here only because the strict walk above already rejected non-enumerable,
  // symbol-keyed and accessor state on these same original objects.
  const validatedProposal = guard('proposal-invalid', () =>
    validateSemanticOperationProposalShape(proposal)
  );

  // (a) Recompute the manifest digest from the original manifest.
  guard('manifest-invalid', () => {
    for (const [field, expected] of Object.entries(MANIFEST_ZERO)) {
      if (manifest[field] !== expected) throw new ValidationError(`manifest.${field} is invalid`);
    }
    if (manifest.schema !== MANIFEST_SCHEMA || manifest.version !== VERSION || manifest.status !== MANIFEST_STATUS) {
      throw new ValidationError('manifest identity is invalid');
    }
    if (typeof manifest.manifest_digest !== 'string' || !DIGEST.test(manifest.manifest_digest)) {
      throw new ValidationError('manifest.manifest_digest is invalid');
    }
    if (!Array.isArray(manifest.operations)) throw new ValidationError('manifest.operations must be an array');
  });
  const manifestDigest = guard('manifest-invalid', () => digestObject(manifestDigestPreimage(manifest)));
  if (manifestDigest !== manifest.manifest_digest) reject('manifest-digest-mismatch');
  const rebuilt = guard('manifest-invalid', () =>
    createInertOperationManifestFixture({ operations: manifest.operations })
  );
  if (rebuilt.manifest_digest !== manifestDigest) reject('manifest-invalid');
  if (proposal.operation_manifest_digest !== manifestDigest) reject('proposal-manifest-digest-mismatch');

  const manifestIds = new Set(manifest.operations.map((operation) => operation.operation_id));
  const trustedById = new Map();
  guard('input-malformed', () => {
    for (const [index, candidate] of selectionInput.candidates.entries()) {
      exactOwnKeys(
        candidate,
        ['operationId', 'manifestDigest', 'eligible', 'eligibilityReason', 'deterministicMatch'],
        `selection_trusted_input.candidates[${index}]`
      );
    }
  });
  for (const candidate of selectionInput.candidates) {
    if (!manifestIds.has(candidate.operationId)) reject('candidate-not-in-manifest');
    if (candidate.manifestDigest !== manifestDigest) reject('candidate-manifest-digest-mismatch');
    trustedById.set(candidate.operationId, candidate);
  }
  for (const listName of ['selected', 'withheld']) {
    const list = selection[listName];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (entry && typeof entry === 'object' && entry.manifest_digest !== manifestDigest) {
        reject('candidate-manifest-digest-mismatch');
      }
    }
  }

  // (b) Recompute the selection from trusted input, then derive the
  // proposal-space candidate digest from the same trusted candidates.
  const selectionResult = guard('selection-not-recomputed', () =>
    validateOperationCandidateSelectionProposal(selection, selectionInput)
  );
  const proposalCandidateSetDigest = guard('candidate-set-digest-mismatch', () =>
    computeCandidateSetDigest(proposalSpaceCandidates(selectionInput.candidates))
  );
  if (proposal.candidate_set_digest !== proposalCandidateSetDigest) reject('candidate-set-digest-mismatch');

  // (c) Descriptive discovery is never bindable.
  if (proposal.candidate_mode !== 'eligible-only') reject('discovery-mode-not-bindable');

  // (d)/(e) Every proposed operation: ineligibility dominates, then selection membership.
  const selectedIds = new Set(selection.selected.map((entry) => entry.operation_id));
  for (const item of proposal.proposed) {
    const candidate = trustedById.get(item.operation_id);
    if (candidate && candidate.eligible !== true) reject('operation-deterministic-ineligible');
    if (!candidate || !selectedIds.has(item.operation_id)) reject('operation-not-selected');
  }

  // (f) Offers: re-evaluate eligibility and recompute the digest from the original offer.
  const proposedIds = new Set(proposal.proposed.map((item) => item.operation_id));
  const offerDigestById = new Map();
  guard('offer-malformed', () => {
    for (const [index, entry] of offers.entries()) {
      exactOwnKeys(entry, OFFER_ENTRY_FIELDS, `offers[${index}]`);
      if (typeof entry.operation_id !== 'string' || !IDENTIFIER.test(entry.operation_id)) {
        throw new ValidationError(`offers[${index}].operation_id is invalid`);
      }
      if (typeof entry.offer_digest !== 'string' || !DIGEST.test(entry.offer_digest)) {
        throw new ValidationError(`offers[${index}].offer_digest is invalid`);
      }
    }
  });
  for (const entry of offers) {
    if (offerDigestById.has(entry.operation_id)) reject('offer-duplicate');
    if (!proposedIds.has(entry.operation_id)) reject('offer-operation-not-proposed');
    const result = guard('offer-malformed', () =>
      evaluateExternalOperationOffer(entry.offer, entry.catalog_entry, entry.constraints)
    );
    if (result.eligible !== true) {
      reject('offer-ineligible', result.reasons.slice(0, limits.max_offer_rejection_reasons));
    }
    const recomputed = digestObject(entry.offer);
    if (recomputed !== entry.offer_digest || result.offer_digest !== recomputed) {
      reject('offer-digest-mismatch');
    }
    offerDigestById.set(entry.operation_id, recomputed);
  }

  const boundOperations = proposal.proposed.map((item) => ({
    operation_id: item.operation_id,
    arguments_digest: digestObject(item.arguments),
    offer_digest: offerDigestById.get(item.operation_id) ?? null
  }));

  // (g) Zero proposed operations is an explicit abstention.
  let bindingStatus;
  if (boundOperations.length === 0) bindingStatus = 'abstained';
  else if (selection.unresolved !== false) bindingStatus = 'unresolved-deliberation';
  else bindingStatus = 'bound';

  return {
    binding_status: bindingStatus,
    rejection_reason: null,
    offer_rejection_reasons: [],
    operation_manifest_digest: manifestDigest,
    proposal_candidate_set_digest: proposalCandidateSetDigest,
    selection_candidate_set_digest: selection.candidate_set_digest,
    selection_proposal_digest: selectionResult.proposal_digest,
    selection_mode: selection.selection_mode,
    proposal_id: proposal.proposal_id,
    proposal_digest: validatedProposal.proposal_digest,
    bound_operations: bindingStatus === 'abstained' ? [] : boundOperations
  };
}

/**
 * verifyOperationProposalBinding(trusted)
 *
 * trusted = { manifest, selection_trusted_input, selection, proposal, offers? }
 * offers[] = { operation_id, offer_digest, offer, catalog_entry, constraints }
 *
 * Returns a closed, deep-frozen axiom-operation-proposal-binding.v0 document.
 * Checks run in a fixed order; the first failure wins and yields
 * binding_status 'rejected' with a closed rejection_reason.
 */
export function verifyOperationProposalBinding(trusted) {
  try {
    return finalize(runChecks(trusted));
  } catch (error) {
    if (error instanceof BindingRejection) {
      return rejectedDocument(error.reason, error.offerReasons);
    }
    throw error;
  }
}

function assertDigest(value, name) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${name} must be a sha256 hex digest`);
  }
}

/** Strict validator for axiom-operation-proposal-binding.v0 documents. */
export function validateOperationProposalBinding(document) {
  assertStrictPlainData(document, 'operation proposal binding');
  const value = exactOwnKeys(document, DOCUMENT_FIELDS, 'operation proposal binding');
  if (value.schema !== OPERATION_PROPOSAL_BINDING_SCHEMA || value.version !== VERSION || value.status !== STATUS) {
    throw new ValidationError('operation proposal binding identity is invalid');
  }
  for (const [field, expected] of Object.entries(ZERO_EFFECTS)) {
    if (value[field] !== expected) {
      throw new ValidationError(`operation proposal binding ${field} must be ${String(expected)}`);
    }
  }
  if (!OPERATION_PROPOSAL_BINDING_STATUSES.includes(value.binding_status)) {
    throw new ValidationError('operation proposal binding binding_status is invalid');
  }
  const rejected = value.binding_status === 'rejected';
  if (rejected) {
    if (!OPERATION_PROPOSAL_BINDING_REASONS.includes(value.rejection_reason)) {
      throw new ValidationError('rejected binding requires a closed rejection_reason');
    }
    for (const field of NULLABLE_ON_REJECT) {
      if (value[field] !== null) throw new ValidationError(`rejected binding ${field} must be null`);
    }
  } else {
    if (value.rejection_reason !== null) {
      throw new ValidationError('non-rejected binding rejection_reason must be null');
    }
    for (const field of DIGEST_FIELDS) assertDigest(value[field], field);
    if (!SELECTION_MODES.includes(value.selection_mode)) {
      throw new ValidationError('operation proposal binding selection_mode is invalid');
    }
    if (typeof value.proposal_id !== 'string' || !IDENTIFIER.test(value.proposal_id)) {
      throw new ValidationError('operation proposal binding proposal_id is invalid');
    }
  }

  if (
    !Array.isArray(value.offer_rejection_reasons)
    || value.offer_rejection_reasons.length > OPERATION_PROPOSAL_BINDING_LIMITS.max_offer_rejection_reasons
  ) {
    throw new ValidationError('offer_rejection_reasons must be a bounded array');
  }
  for (const reason of value.offer_rejection_reasons) {
    if (typeof reason !== 'string' || !REASON_TOKEN.test(reason)) {
      throw new ValidationError('offer_rejection_reasons entries are invalid');
    }
  }
  if (value.offer_rejection_reasons.length > 0 && value.rejection_reason !== 'offer-ineligible') {
    throw new ValidationError('offer_rejection_reasons require rejection_reason offer-ineligible');
  }
  if (value.rejection_reason === 'offer-ineligible' && value.offer_rejection_reasons.length === 0) {
    throw new ValidationError('offer-ineligible requires offer_rejection_reasons');
  }

  if (
    !Array.isArray(value.bound_operations)
    || value.bound_operations.length > OPERATION_PROPOSAL_BINDING_LIMITS.max_proposed_operations
  ) {
    throw new ValidationError('bound_operations must be a bounded array');
  }
  const bindsOperations = value.binding_status === 'bound'
    || value.binding_status === 'unresolved-deliberation';
  if (bindsOperations !== (value.bound_operations.length > 0)) {
    throw new ValidationError('bound_operations cardinality is inconsistent with binding_status');
  }
  value.bound_operations.forEach((entry, index) => {
    exactOwnKeys(entry, BOUND_OPERATION_FIELDS, `bound_operations[${index}]`);
    if (typeof entry.operation_id !== 'string' || !IDENTIFIER.test(entry.operation_id)) {
      throw new ValidationError(`bound_operations[${index}].operation_id is invalid`);
    }
    assertDigest(entry.arguments_digest, `bound_operations[${index}].arguments_digest`);
    if (entry.offer_digest !== null) assertDigest(entry.offer_digest, `bound_operations[${index}].offer_digest`);
    if (index > 0 && sortBoundOperations(value.bound_operations[index - 1], entry) > 0) {
      throw new ValidationError('bound_operations must be in canonical order');
    }
  });

  assertDigest(value.binding_digest, 'binding_digest');
  if (value.binding_digest !== digestObject(bindingDigestPayload(value))) {
    throw new ValidationError('operation proposal binding binding_digest is invalid');
  }
  return Object.freeze({
    valid: true,
    binding_digest: value.binding_digest,
    ...ZERO_EFFECTS
  });
}
