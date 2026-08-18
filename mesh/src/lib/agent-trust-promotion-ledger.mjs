import { readFile, access } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';

export const AGENT_TRUST_PROMOTION_LEDGER_SCHEMA = 'axiom-agent-trust-promotion-ledger.v1';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const CAPABILITY_ID = /^[a-z][a-z0-9.-]+$/;
const SHA = /^[a-f0-9]{40}$/;
const PATH = /^[A-Za-z0-9_.\/-]+$/;
const GATES = new Set(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10']);
const COMPOSITION_STATES = new Set(['in-candidate-tree', 'separate-branch']);
const LAB_STATES = new Set(['green', 'partial-green', 'separate-branch-green']);

const TOP_KEYS = new Set([
  'schema',
  'protocol',
  'authoritative_registry_path',
  'authoritative_registry_mutated_by_laboratory',
  'documentation_alone_satisfies_promotion',
  'protected_ci_required',
  'independent_review_required',
  'exact_registry_evidence_binding_required',
  'post_registry_change_ci_required',
  'production_marketing_claims_allowed',
  'promotion_runbook',
  'entries'
]);
const ENTRY_KEYS = new Set([
  'gate',
  'capability_id',
  'source_pr',
  'source_head',
  'composition_state',
  'laboratory_state',
  'implementation_paths',
  'strict_validation_paths',
  'test_paths',
  'threat_model_paths',
  'runbook_paths',
  'verifier_or_conformance_paths',
  'protected_ci',
  'readiness_recorded',
  'independent_review_complete',
  'independent_review_evidence_paths',
  'authoritative_registry_present',
  'exact_registry_evidence_binding_complete',
  'production_claims_allowed',
  'promotion_ready',
  'blockers'
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

function exactBoolean(value, expected, label) {
  if (value !== expected) throw new ValidationError(`${label} must remain ${String(expected)}`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function repositoryPath(value, label) {
  return assertString(value, label, { min: 1, max: 320, pattern: PATH });
}

function canonicalPathSet(raw, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(raw) || (!allowEmpty && raw.length < 1) || raw.length > 64) {
    throw new ValidationError(`${label} must contain ${allowEmpty ? '0' : '1'}-64 paths`);
  }
  const paths = raw.map((item, index) => repositoryPath(item, `${label}[${index}]`));
  const canonical = [...new Set(paths)].sort();
  if (canonicalJson(paths) !== canonicalJson(canonical)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return Object.freeze(canonical);
}

function canonicalBlockers(raw, label) {
  if (!Array.isArray(raw) || raw.length > 64) {
    throw new ValidationError(`${label} must contain at most 64 blocker codes`);
  }
  const values = raw.map((item, index) => assertString(item, `${label}[${index}]`, {
    min: 3,
    max: 96,
    pattern: /^[a-z0-9][a-z0-9.-]+$/
  }));
  const canonical = [...new Set(values)].sort();
  if (canonicalJson(values) !== canonicalJson(canonical)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return Object.freeze(canonical);
}

function normalizeCi(raw, label) {
  const value = exactObject(raw, CI_KEYS, label);
  if (value.conclusion !== 'success') {
    throw new ValidationError(`${label} conclusion must be success for a green laboratory record`);
  }
  return Object.freeze({
    clean_kernel_run_id: positiveInteger(value.clean_kernel_run_id, `${label}.clean_kernel_run_id`),
    windows_run_id: positiveInteger(value.windows_run_id, `${label}.windows_run_id`),
    conclusion: 'success'
  });
}

function normalizeEntry(raw, index) {
  const label = `agent trust promotion entry[${index}]`;
  const value = exactObject(raw, ENTRY_KEYS, label);
  const gate = assertString(value.gate, `${label}.gate`, { min: 2, max: 3 });
  if (!GATES.has(gate)) throw new ValidationError(`${label}.gate is unsupported`);
  const composition = assertString(value.composition_state, `${label}.composition_state`, {
    min: 10,
    max: 32
  });
  if (!COMPOSITION_STATES.has(composition)) {
    throw new ValidationError(`${label}.composition_state is unsupported`);
  }
  const labState = assertString(value.laboratory_state, `${label}.laboratory_state`, {
    min: 5,
    max: 32
  });
  if (!LAB_STATES.has(labState)) throw new ValidationError(`${label}.laboratory_state is unsupported`);
  if (composition === 'separate-branch' && labState !== 'separate-branch-green') {
    throw new ValidationError(`${label} separate-branch entry must use separate-branch-green state`);
  }
  if (composition === 'in-candidate-tree' && labState === 'separate-branch-green') {
    throw new ValidationError(`${label} in-tree entry cannot use separate-branch-green state`);
  }
  if (typeof value.source_head !== 'string' || !SHA.test(value.source_head)) {
    throw new ValidationError(`${label}.source_head must be a 40-character commit SHA`);
  }
  if (typeof value.capability_id !== 'string' || !CAPABILITY_ID.test(value.capability_id)) {
    throw new ValidationError(`${label}.capability_id is invalid`);
  }
  const inTree = composition === 'in-candidate-tree';
  const implementationPaths = canonicalPathSet(value.implementation_paths, `${label}.implementation_paths`, {
    allowEmpty: !inTree
  });
  const strictPaths = canonicalPathSet(value.strict_validation_paths, `${label}.strict_validation_paths`, {
    allowEmpty: !inTree
  });
  const testPaths = canonicalPathSet(value.test_paths, `${label}.test_paths`, { allowEmpty: !inTree });
  const threatPaths = canonicalPathSet(value.threat_model_paths, `${label}.threat_model_paths`, {
    allowEmpty: !inTree
  });
  const runbookPaths = canonicalPathSet(value.runbook_paths, `${label}.runbook_paths`);
  const verifierPaths = canonicalPathSet(
    value.verifier_or_conformance_paths,
    `${label}.verifier_or_conformance_paths`,
    { allowEmpty: !inTree }
  );
  const reviewEvidence = canonicalPathSet(
    value.independent_review_evidence_paths,
    `${label}.independent_review_evidence_paths`,
    { allowEmpty: true }
  );
  const blockers = canonicalBlockers(value.blockers, `${label}.blockers`);

  if (value.independent_review_complete === true && reviewEvidence.length === 0) {
    throw new ValidationError(`${label} independent review marked complete without evidence`);
  }
  if (value.independent_review_complete === false && reviewEvidence.length !== 0) {
    throw new ValidationError(`${label} incomplete independent review cannot carry completion evidence`);
  }
  if (value.authoritative_registry_present === false && value.exact_registry_evidence_binding_complete === true) {
    throw new ValidationError(`${label} cannot complete registry evidence binding before registry presence`);
  }
  if (value.promotion_ready === false) {
    if (value.production_claims_allowed !== false) {
      throw new ValidationError(`${label} non-promoted capability cannot allow production claims`);
    }
    if (blockers.length === 0) {
      throw new ValidationError(`${label} non-promoted capability must name at least one blocker`);
    }
  }
  if (value.promotion_ready === true) {
    if (!inTree) throw new ValidationError(`${label} separate-branch capability cannot be promotion-ready`);
    if (labState !== 'green') throw new ValidationError(`${label} promotion-ready capability must be fully green`);
    if (value.readiness_recorded !== true) throw new ValidationError(`${label} promotion-ready capability lacks readiness record`);
    if (value.independent_review_complete !== true) throw new ValidationError(`${label} promotion-ready capability lacks independent review`);
    if (value.authoritative_registry_present !== true) throw new ValidationError(`${label} promotion-ready capability lacks registry entry`);
    if (value.exact_registry_evidence_binding_complete !== true) throw new ValidationError(`${label} promotion-ready capability lacks exact registry evidence binding`);
    if (value.production_claims_allowed !== true) throw new ValidationError(`${label} promotion-ready capability must explicitly permit its bounded production claims`);
    if (blockers.length !== 0) throw new ValidationError(`${label} promotion-ready capability cannot retain blockers`);
  }

  return Object.freeze({
    gate,
    capability_id: value.capability_id,
    source_pr: positiveInteger(value.source_pr, `${label}.source_pr`),
    source_head: value.source_head,
    composition_state: composition,
    laboratory_state: labState,
    implementation_paths: implementationPaths,
    strict_validation_paths: strictPaths,
    test_paths: testPaths,
    threat_model_paths: threatPaths,
    runbook_paths: runbookPaths,
    verifier_or_conformance_paths: verifierPaths,
    protected_ci: normalizeCi(value.protected_ci, `${label}.protected_ci`),
    readiness_recorded: value.readiness_recorded === true,
    independent_review_complete: value.independent_review_complete === true,
    independent_review_evidence_paths: reviewEvidence,
    authoritative_registry_present: value.authoritative_registry_present === true,
    exact_registry_evidence_binding_complete: value.exact_registry_evidence_binding_complete === true,
    production_claims_allowed: value.production_claims_allowed === true,
    promotion_ready: value.promotion_ready === true,
    blockers
  });
}

export function normalizeAgentTrustPromotionLedger(raw) {
  const value = exactObject(raw, TOP_KEYS, 'agent trust promotion ledger');
  if (value.schema !== AGENT_TRUST_PROMOTION_LEDGER_SCHEMA) {
    throw new ValidationError(`agent trust promotion ledger schema must be ${AGENT_TRUST_PROMOTION_LEDGER_SCHEMA}`);
  }
  if (value.protocol !== 'agent-trust-protocol-v1') {
    throw new ValidationError('agent trust promotion ledger protocol is unsupported');
  }
  exactBoolean(value.authoritative_registry_mutated_by_laboratory, false, 'authoritative_registry_mutated_by_laboratory');
  exactBoolean(value.documentation_alone_satisfies_promotion, false, 'documentation_alone_satisfies_promotion');
  exactBoolean(value.protected_ci_required, true, 'protected_ci_required');
  exactBoolean(value.independent_review_required, true, 'independent_review_required');
  exactBoolean(value.exact_registry_evidence_binding_required, true, 'exact_registry_evidence_binding_required');
  exactBoolean(value.post_registry_change_ci_required, true, 'post_registry_change_ci_required');
  exactBoolean(value.production_marketing_claims_allowed, false, 'production_marketing_claims_allowed');

  if (!Array.isArray(value.entries) || value.entries.length !== GATES.size) {
    throw new ValidationError(`agent trust promotion ledger must contain exactly ${GATES.size} A1-A10 entries`);
  }
  const entries = value.entries.map(normalizeEntry);
  const gates = entries.map(item => item.gate);
  const expectedGates = [...GATES];
  if (canonicalJson(gates) !== canonicalJson(expectedGates)) {
    throw new ValidationError('agent trust promotion ledger entries must be ordered A1 through A10 exactly once');
  }
  if (new Set(entries.map(item => item.capability_id)).size !== entries.length) {
    throw new ValidationError('agent trust promotion ledger capability IDs must be unique');
  }
  return Object.freeze({
    schema: AGENT_TRUST_PROMOTION_LEDGER_SCHEMA,
    protocol: value.protocol,
    authoritative_registry_path: repositoryPath(
      value.authoritative_registry_path,
      'agent trust promotion authoritative_registry_path'
    ),
    authoritative_registry_mutated_by_laboratory: false,
    documentation_alone_satisfies_promotion: false,
    protected_ci_required: true,
    independent_review_required: true,
    exact_registry_evidence_binding_required: true,
    post_registry_change_ci_required: true,
    production_marketing_claims_allowed: false,
    promotion_runbook: repositoryPath(value.promotion_runbook, 'agent trust promotion promotion_runbook'),
    entries: Object.freeze(entries)
  });
}

async function requireRepositoryFile(path, repositoryRoot, label) {
  const absolute = resolve(repositoryRoot, path);
  const rel = relative(repositoryRoot, absolute);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || rel.startsWith('/') || rel.startsWith('\\')) {
    throw new ValidationError(`${label} escapes repository root`);
  }
  try {
    await access(absolute);
  } catch {
    throw new ValidationError(`${label} does not exist: ${path}`);
  }
}

export async function verifyAgentTrustPromotionLedger(raw, {
  repositoryRoot = REPOSITORY_ROOT
} = {}) {
  const ledger = normalizeAgentTrustPromotionLedger(raw);
  const root = resolve(repositoryRoot);
  await requireRepositoryFile(ledger.authoritative_registry_path, root, 'ATP authoritative registry');
  await requireRepositoryFile(ledger.promotion_runbook, root, 'ATP promotion runbook');

  let registry;
  try {
    registry = JSON.parse(await readFile(resolve(root, ledger.authoritative_registry_path), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError('ATP authoritative registry is invalid JSON');
    throw error;
  }
  const registryCapabilities = new Map(
    (registry.capabilities ?? []).map(item => [item.id, item])
  );

  for (const entry of ledger.entries) {
    if (entry.composition_state === 'in-candidate-tree') {
      for (const [kind, paths] of [
        ['implementation', entry.implementation_paths],
        ['strict validation', entry.strict_validation_paths],
        ['test', entry.test_paths],
        ['threat model', entry.threat_model_paths],
        ['runbook', entry.runbook_paths],
        ['verifier/conformance', entry.verifier_or_conformance_paths]
      ]) {
        for (const path of paths) {
          await requireRepositoryFile(path, root, `ATP ${entry.gate} ${kind}`);
        }
      }
    } else if (!entry.blockers.includes('separate-branch-not-composed')) {
      throw new ValidationError(`ATP ${entry.gate} separate-branch entry must block on composition`);
    }
    for (const path of entry.independent_review_evidence_paths) {
      await requireRepositoryFile(path, root, `ATP ${entry.gate} independent review evidence`);
    }

    const registryItem = registryCapabilities.get(entry.capability_id) ?? null;
    if (entry.authoritative_registry_present === false && registryItem !== null) {
      throw new ValidationError(`ATP ${entry.gate} registry says absent but capability is present: ${entry.capability_id}`);
    }
    if (entry.authoritative_registry_present === true && registryItem === null) {
      throw new ValidationError(`ATP ${entry.gate} registry says present but capability is absent: ${entry.capability_id}`);
    }
    if (entry.authoritative_registry_present === true && registryItem?.status === 'implemented') {
      if (!Array.isArray(registryItem.evidence) || registryItem.evidence.length < 1) {
        throw new ValidationError(`ATP ${entry.gate} implemented registry entry lacks evidence`);
      }
      if (entry.exact_registry_evidence_binding_complete !== true) {
        throw new ValidationError(`ATP ${entry.gate} implemented entry lacks exact ledger evidence-binding completion`);
      }
    }
  }

  const promotionReady = ledger.entries.filter(item => item.promotion_ready);
  if (promotionReady.length > 0 && ledger.production_marketing_claims_allowed !== true) {
    throw new ValidationError('ATP promotion-ready entries cannot coexist with globally disabled production marketing claims');
  }
  return Object.freeze({
    valid: true,
    schema: ledger.schema,
    protocol: ledger.protocol,
    ledger_digest: digestObject(ledger),
    gates_tracked: ledger.entries.length,
    in_candidate_tree: ledger.entries.filter(item => item.composition_state === 'in-candidate-tree').length,
    separate_branch: ledger.entries.filter(item => item.composition_state === 'separate-branch').length,
    laboratory_green_or_partial: ledger.entries.filter(item => item.protected_ci.conclusion === 'success').length,
    promotion_ready: promotionReady.length,
    authoritative_registry_entries_present: ledger.entries.filter(item => item.authoritative_registry_present).length,
    independent_reviews_complete: ledger.entries.filter(item => item.independent_review_complete).length,
    production_marketing_claims_allowed: false,
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
