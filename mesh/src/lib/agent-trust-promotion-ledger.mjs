import { access, readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ValidationError, assertPlainObject, assertString, digestObject } from './canonical.mjs';

export const AGENT_TRUST_PROMOTION_LEDGER_SCHEMA = 'axiom-agent-trust-promotion-ledger.v1';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const GATES = Object.freeze(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10']);
const COMPOSITION = new Set(['in-candidate-tree', 'separate-branch']);
const LAB_STATES = new Set(['green', 'partial-green', 'separate-branch-green']);
const SHA = /^[a-f0-9]{40}$/;
const CAPABILITY_ID = /^[a-z][a-z0-9.-]+$/;
const PATH = /^[A-Za-z0-9_.\/-]+$/;
const BLOCKER = /^[a-z0-9][a-z0-9.-]+$/;

const TOP_KEYS = new Set([
  'schema', 'protocol', 'authoritative_registry_path',
  'authoritative_registry_mutated_by_laboratory', 'documentation_alone_satisfies_promotion',
  'protected_ci_required', 'independent_review_required',
  'exact_registry_evidence_binding_required', 'post_registry_change_ci_required',
  'production_marketing_claims_allowed', 'promotion_runbook', 'entries'
]);
const ENTRY_KEYS = new Set([
  'gate', 'capability_id', 'source_pr', 'source_head', 'composition_state', 'laboratory_state',
  'implementation_paths', 'strict_validation_paths', 'test_paths', 'threat_model_paths',
  'runbook_paths', 'verifier_or_conformance_paths', 'protected_ci', 'readiness_recorded',
  'independent_review_complete', 'independent_review_evidence_paths',
  'authoritative_registry_present', 'exact_registry_evidence_binding_complete',
  'production_claims_allowed', 'promotion_ready', 'blockers'
]);
const CI_KEYS = new Set(['clean_kernel_run_id', 'windows_run_id', 'conclusion']);

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function bool(value, label) {
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be boolean`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new ValidationError(`${label} must be a positive safe integer`);
  return value;
}

function repositoryPath(value, label) {
  return assertString(value, label, { min: 1, max: 320, pattern: PATH });
}

function uniqueStrings(raw, label, { allowEmpty = false, path = false } = {}) {
  if (!Array.isArray(raw) || (!allowEmpty && raw.length === 0) || raw.length > 64) {
    throw new ValidationError(`${label} must contain ${allowEmpty ? '0' : '1'}-64 values`);
  }
  const values = raw.map((item, index) => path
    ? repositoryPath(item, `${label}[${index}]`)
    : assertString(item, `${label}[${index}]`, { min: 3, max: 96, pattern: BLOCKER }));
  if (new Set(values).size !== values.length) throw new ValidationError(`${label} contains duplicates`);
  return Object.freeze([...values].sort());
}

function normalizeCi(raw, label) {
  const value = exactObject(raw, CI_KEYS, label);
  if (value.conclusion !== 'success') throw new ValidationError(`${label} must record successful protected CI`);
  return Object.freeze({
    clean_kernel_run_id: positiveInteger(value.clean_kernel_run_id, `${label}.clean_kernel_run_id`),
    windows_run_id: positiveInteger(value.windows_run_id, `${label}.windows_run_id`),
    conclusion: 'success'
  });
}

function normalizeEntry(raw, index) {
  const label = `ATP promotion entry[${index}]`;
  const value = exactObject(raw, ENTRY_KEYS, label);
  if (value.gate !== GATES[index]) throw new ValidationError(`${label} must be ${GATES[index]}`);
  if (typeof value.capability_id !== 'string' || !CAPABILITY_ID.test(value.capability_id)) {
    throw new ValidationError(`${label}.capability_id is invalid`);
  }
  if (typeof value.source_head !== 'string' || !SHA.test(value.source_head)) {
    throw new ValidationError(`${label}.source_head must be a 40-character commit SHA`);
  }
  const composition = assertString(value.composition_state, `${label}.composition_state`, { min: 10, max: 32 });
  if (!COMPOSITION.has(composition)) throw new ValidationError(`${label}.composition_state is unsupported`);
  const laboratoryState = assertString(value.laboratory_state, `${label}.laboratory_state`, { min: 5, max: 32 });
  if (!LAB_STATES.has(laboratoryState)) throw new ValidationError(`${label}.laboratory_state is unsupported`);
  const inTree = composition === 'in-candidate-tree';
  if (!inTree && laboratoryState !== 'separate-branch-green') {
    throw new ValidationError(`${label} separate branch must be labelled separate-branch-green`);
  }
  if (inTree && laboratoryState === 'separate-branch-green') {
    throw new ValidationError(`${label} in-tree entry cannot be labelled separate-branch-green`);
  }

  const paths = name => uniqueStrings(value[name], `${label}.${name}`, { allowEmpty: !inTree, path: true });
  const implementationPaths = paths('implementation_paths');
  const validationPaths = paths('strict_validation_paths');
  const testPaths = paths('test_paths');
  const threatPaths = paths('threat_model_paths');
  const runbookPaths = uniqueStrings(value.runbook_paths, `${label}.runbook_paths`, { path: true });
  const verifierPaths = paths('verifier_or_conformance_paths');
  const reviewPaths = uniqueStrings(
    value.independent_review_evidence_paths,
    `${label}.independent_review_evidence_paths`,
    { allowEmpty: true, path: true }
  );
  const blockers = uniqueStrings(value.blockers, `${label}.blockers`, { allowEmpty: true });

  const independentReview = bool(value.independent_review_complete, `${label}.independent_review_complete`);
  const registryPresent = bool(value.authoritative_registry_present, `${label}.authoritative_registry_present`);
  const evidenceBinding = bool(value.exact_registry_evidence_binding_complete, `${label}.exact_registry_evidence_binding_complete`);
  const claimsAllowed = bool(value.production_claims_allowed, `${label}.production_claims_allowed`);
  const promotionReady = bool(value.promotion_ready, `${label}.promotion_ready`);
  const readinessRecorded = bool(value.readiness_recorded, `${label}.readiness_recorded`);

  if (independentReview !== (reviewPaths.length > 0)) {
    throw new ValidationError(`${label} independent-review flag must match review evidence presence`);
  }
  if (!registryPresent && evidenceBinding) {
    throw new ValidationError(`${label} cannot complete registry evidence binding before registry presence`);
  }
  if (!promotionReady) {
    if (claimsAllowed) throw new ValidationError(`${label} non-promoted capability cannot allow production claims`);
    if (blockers.length === 0) throw new ValidationError(`${label} non-promoted capability must name blockers`);
  } else {
    if (!inTree) throw new ValidationError(`${label} separate branch cannot be promotion-ready`);
    if (laboratoryState !== 'green') throw new ValidationError(`${label} promotion-ready capability must be fully green`);
    if (!readinessRecorded) throw new ValidationError(`${label} promotion-ready capability lacks readiness status`);
    if (!independentReview) throw new ValidationError(`${label} promotion-ready capability lacks independent review`);
    if (!registryPresent) throw new ValidationError(`${label} promotion-ready capability lacks authoritative registry entry`);
    if (!evidenceBinding) throw new ValidationError(`${label} promotion-ready capability lacks exact registry evidence binding`);
    if (!claimsAllowed) throw new ValidationError(`${label} promotion-ready capability must explicitly permit bounded production claims`);
    if (blockers.length !== 0) throw new ValidationError(`${label} promotion-ready capability cannot retain blockers`);
  }

  return Object.freeze({
    gate: value.gate,
    capability_id: value.capability_id,
    source_pr: positiveInteger(value.source_pr, `${label}.source_pr`),
    source_head: value.source_head,
    composition_state: composition,
    laboratory_state: laboratoryState,
    implementation_paths: implementationPaths,
    strict_validation_paths: validationPaths,
    test_paths: testPaths,
    threat_model_paths: threatPaths,
    runbook_paths: runbookPaths,
    verifier_or_conformance_paths: verifierPaths,
    protected_ci: normalizeCi(value.protected_ci, `${label}.protected_ci`),
    readiness_recorded: readinessRecorded,
    independent_review_complete: independentReview,
    independent_review_evidence_paths: reviewPaths,
    authoritative_registry_present: registryPresent,
    exact_registry_evidence_binding_complete: evidenceBinding,
    production_claims_allowed: claimsAllowed,
    promotion_ready: promotionReady,
    blockers
  });
}

export function normalizeAgentTrustPromotionLedger(raw) {
  const value = exactObject(raw, TOP_KEYS, 'ATP promotion ledger');
  if (value.schema !== AGENT_TRUST_PROMOTION_LEDGER_SCHEMA) {
    throw new ValidationError(`ATP promotion ledger schema must be ${AGENT_TRUST_PROMOTION_LEDGER_SCHEMA}`);
  }
  if (value.protocol !== 'agent-trust-protocol-v1') throw new ValidationError('ATP promotion ledger protocol is unsupported');
  if (value.authoritative_registry_mutated_by_laboratory !== false) {
    throw new ValidationError('ATP laboratory may not mutate authoritative registry merely by recording promotion state');
  }
  if (value.documentation_alone_satisfies_promotion !== false) {
    throw new ValidationError('ATP documentation alone cannot satisfy promotion');
  }
  if (value.protected_ci_required !== true || value.independent_review_required !== true
    || value.exact_registry_evidence_binding_required !== true || value.post_registry_change_ci_required !== true) {
    throw new ValidationError('ATP promotion safety gates must remain required');
  }
  const marketingAllowed = bool(value.production_marketing_claims_allowed, 'ATP production_marketing_claims_allowed');
  if (!Array.isArray(value.entries) || value.entries.length !== GATES.length) {
    throw new ValidationError(`ATP promotion ledger must contain exactly ${GATES.length} A1-A10 entries`);
  }
  const entries = value.entries.map(normalizeEntry);
  if (new Set(entries.map(item => item.capability_id)).size !== entries.length) {
    throw new ValidationError('ATP promotion capability IDs must be unique');
  }
  const ready = entries.filter(item => item.promotion_ready);
  if (marketingAllowed && ready.length === 0) {
    throw new ValidationError('ATP production marketing cannot be enabled without at least one promotion-ready capability');
  }
  if (!marketingAllowed && entries.some(item => item.production_claims_allowed)) {
    throw new ValidationError('ATP capability production claims cannot be enabled while global production marketing is disabled');
  }
  return Object.freeze({
    schema: AGENT_TRUST_PROMOTION_LEDGER_SCHEMA,
    protocol: value.protocol,
    authoritative_registry_path: repositoryPath(value.authoritative_registry_path, 'ATP authoritative_registry_path'),
    authoritative_registry_mutated_by_laboratory: false,
    documentation_alone_satisfies_promotion: false,
    protected_ci_required: true,
    independent_review_required: true,
    exact_registry_evidence_binding_required: true,
    post_registry_change_ci_required: true,
    production_marketing_claims_allowed: marketingAllowed,
    promotion_runbook: repositoryPath(value.promotion_runbook, 'ATP promotion_runbook'),
    entries: Object.freeze(entries)
  });
}

async function requireFile(repositoryRoot, path, label) {
  const root = resolve(repositoryRoot);
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('/') || rel.startsWith('\\')) {
    throw new ValidationError(`${label} escapes repository root`);
  }
  try {
    await access(absolute);
  } catch {
    throw new ValidationError(`${label} does not exist: ${path}`);
  }
}

export async function verifyAgentTrustPromotionLedger(raw, { repositoryRoot = REPOSITORY_ROOT } = {}) {
  const ledger = normalizeAgentTrustPromotionLedger(raw);
  await requireFile(repositoryRoot, ledger.authoritative_registry_path, 'ATP authoritative registry');
  await requireFile(repositoryRoot, ledger.promotion_runbook, 'ATP promotion runbook');

  let registry;
  try {
    registry = JSON.parse(await readFile(resolve(repositoryRoot, ledger.authoritative_registry_path), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError('ATP authoritative registry is invalid JSON');
    throw error;
  }
  const registryCapabilities = new Map((registry.capabilities ?? []).map(item => [item.id, item]));

  for (const entry of ledger.entries) {
    if (entry.composition_state === 'in-candidate-tree') {
      for (const [kind, paths] of [
        ['implementation', entry.implementation_paths],
        ['validation', entry.strict_validation_paths],
        ['test', entry.test_paths],
        ['threat-model', entry.threat_model_paths],
        ['runbook', entry.runbook_paths],
        ['verifier/conformance', entry.verifier_or_conformance_paths]
      ]) {
        for (const path of paths) await requireFile(repositoryRoot, path, `ATP ${entry.gate} ${kind}`);
      }
    } else if (!entry.blockers.includes('separate-branch-not-composed')) {
      throw new ValidationError(`ATP ${entry.gate} separate branch must explicitly block on composition`);
    }
    for (const path of entry.independent_review_evidence_paths) {
      await requireFile(repositoryRoot, path, `ATP ${entry.gate} independent-review evidence`);
    }

    const registryItem = registryCapabilities.get(entry.capability_id) ?? null;
    if (!entry.authoritative_registry_present && registryItem !== null) {
      throw new ValidationError(`ATP ${entry.gate} ledger says registry absent but ${entry.capability_id} is present`);
    }
    if (entry.authoritative_registry_present && registryItem === null) {
      throw new ValidationError(`ATP ${entry.gate} ledger says registry present but ${entry.capability_id} is absent`);
    }
    if (registryItem?.status === 'implemented') {
      if (!Array.isArray(registryItem.evidence) || registryItem.evidence.length === 0) {
        throw new ValidationError(`ATP ${entry.gate} implemented registry entry lacks evidence`);
      }
      if (!entry.exact_registry_evidence_binding_complete) {
        throw new ValidationError(`ATP ${entry.gate} implemented registry entry lacks completed exact evidence binding`);
      }
    }
  }

  return Object.freeze({
    valid: true,
    schema: ledger.schema,
    protocol: ledger.protocol,
    ledger_digest: digestObject(ledger),
    gates_tracked: ledger.entries.length,
    in_candidate_tree: ledger.entries.filter(item => item.composition_state === 'in-candidate-tree').length,
    separate_branch: ledger.entries.filter(item => item.composition_state === 'separate-branch').length,
    promotion_ready: ledger.entries.filter(item => item.promotion_ready).length,
    authoritative_registry_entries_present: ledger.entries.filter(item => item.authoritative_registry_present).length,
    independent_reviews_complete: ledger.entries.filter(item => item.independent_review_complete).length,
    production_marketing_claims_allowed: ledger.production_marketing_claims_allowed,
    authoritative_registry_mutated_by_laboratory: false
  });
}

export async function loadAndVerifyAgentTrustPromotionLedger({
  repositoryRoot = REPOSITORY_ROOT,
  ledgerPath = 'agent-commons/agent-trust-promotion-ledger.json'
} = {}) {
  const path = repositoryPath(ledgerPath, 'ATP promotion ledger path');
  let raw;
  try {
    raw = JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError('ATP promotion ledger is invalid JSON');
    throw error;
  }
  return verifyAgentTrustPromotionLedger(raw, { repositoryRoot });
}
