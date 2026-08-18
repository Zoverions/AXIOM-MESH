import {
  ValidationError,
  assertPlainObject
} from '../lib/canonical.mjs';
import { normalizeSemanticMemoryProvenance } from '../lib/semantic-memory-provenance.mjs';

export const SEMANTIC_MEMORY_CONTAGION_CAMPAIGN_SCHEMA =
  'axiom-semantic-memory-contagion-campaign.v1';
export const SEMANTIC_MEMORY_CONTAGION_IMPACT_SCHEMA =
  'axiom-semantic-memory-contagion-impact.v1';

export function inspectSemanticMemoryDescendantImpact(store, rootRecord) {
  requireInspectableStore(store);
  const root = normalizeSemanticMemoryProvenance(rootRecord);
  const rows = store.db.prepare(`
    SELECT object_id, record_json
    FROM semantic_memory_provenance_state
    WHERE owner = ?
    ORDER BY object_id
  `).all(root.owner);

  const currentRecords = rows.map(row => normalizeSemanticMemoryProvenance(
    store.openJson(
      'semantic_memory_provenance_state',
      'record_json',
      row.object_id,
      row.record_json
    )
  ));
  const currentByObjectId = new Map(
    currentRecords.map(record => [record.object_id, record])
  );
  const childrenByParentTuple = new Map();
  for (const record of currentRecords) {
    if (record.origin_class !== 'system-derived') continue;
    const key = tupleKey({
      object_id: record.parent_object_id,
      content_digest: record.parent_content_digest,
      provenance_digest: record.parent_provenance_digest
    });
    const children = childrenByParentTuple.get(key) ?? [];
    children.push(record);
    childrenByParentTuple.set(key, children);
  }

  const rootCurrent = currentByObjectId.get(root.object_id);
  const rootContent = store.db.prepare(`
    SELECT status FROM memory_objects WHERE object_id = ?
  `).get(root.object_id);
  const queue = [{ record: root, depth: 0 }];
  const seen = new Set([tupleKey(root)]);
  const affected = [];

  while (queue.length) {
    const parent = queue.shift();
    const children = childrenByParentTuple.get(tupleKey(parent.record)) ?? [];
    for (const child of children) {
      const childKey = tupleKey(child);
      if (seen.has(childKey)) continue;
      seen.add(childKey);
      const content = store.db.prepare(`
        SELECT status FROM memory_objects WHERE object_id = ?
      `).get(child.object_id);
      affected.push(Object.freeze({
        object_id: child.object_id,
        content_digest: child.content_digest,
        provenance_digest: child.provenance_digest,
        review_state: child.review_state,
        authority_tier: child.authority_tier,
        content_status: content?.status ?? 'missing',
        depth: parent.depth + 1,
        parent_object_id: child.parent_object_id,
        parent_content_digest: child.parent_content_digest,
        parent_provenance_digest: child.parent_provenance_digest,
        affected_by_root_tuple: true
      }));
      queue.push({ record: child, depth: parent.depth + 1 });
    }
  }

  affected.sort((left, right) =>
    left.depth - right.depth || left.object_id.localeCompare(right.object_id)
  );
  const rootTupleCurrent = Boolean(
    rootCurrent
    && rootCurrent.content_digest === root.content_digest
    && rootCurrent.provenance_digest === root.provenance_digest
  );

  return Object.freeze({
    schema: SEMANTIC_MEMORY_CONTAGION_IMPACT_SCHEMA,
    activation_state: 'opt-in-local-laboratory',
    root: Object.freeze({
      object_id: root.object_id,
      content_digest: root.content_digest,
      provenance_digest: root.provenance_digest,
      tuple_is_current: rootTupleCurrent,
      current_provenance_digest: rootCurrent?.provenance_digest ?? null,
      current_review_state: rootCurrent?.review_state ?? null,
      content_status: rootContent?.status ?? 'missing'
    }),
    affected_current_contexts: Object.freeze(affected),
    affected_current_context_count: affected.length,
    remediation_authorized: false,
    downstream_effect_authorized: false,
    production_selection_authorized: false
  });
}

export function summarizeSemanticMemoryContagionCampaign(input) {
  const metrics = assertPlainObject(input, 'semantic memory contagion metrics');
  const escapeAttempts = count(metrics.escape_attempts, 'escape_attempts');
  const escapes = boundedCount(metrics.escapes, escapeAttempts, 'escapes');
  const transformAttempts = count(metrics.transform_attempts, 'transform_attempts');
  const transformLaunderingSuccesses = boundedCount(
    metrics.transform_laundering_successes,
    transformAttempts,
    'transform_laundering_successes'
  );
  const crossAgentAttempts = count(metrics.cross_agent_attempts, 'cross_agent_attempts');
  const crossAgentContaminationSuccesses = boundedCount(
    metrics.cross_agent_contamination_successes,
    crossAgentAttempts,
    'cross_agent_contamination_successes'
  );
  const benignCases = count(metrics.benign_cases, 'benign_cases');
  const falsePositives = boundedCount(
    metrics.false_positives,
    benignCases,
    'false_positives'
  );
  const maliciousCases = count(metrics.malicious_cases, 'malicious_cases');
  const falseNegatives = boundedCount(
    metrics.false_negatives,
    maliciousCases,
    'false_negatives'
  );

  return Object.freeze({
    schema: SEMANTIC_MEMORY_CONTAGION_CAMPAIGN_SCHEMA,
    activation_state: 'opt-in-local-laboratory',
    metrics: Object.freeze({
      escape_attempts: escapeAttempts,
      escapes,
      semantic_contagion_escape_rate: rate(escapes, escapeAttempts),
      transform_attempts: transformAttempts,
      transform_laundering_successes: transformLaunderingSuccesses,
      transform_laundering_success_rate: rate(
        transformLaunderingSuccesses,
        transformAttempts
      ),
      cross_agent_attempts: crossAgentAttempts,
      cross_agent_contamination_successes: crossAgentContaminationSuccesses,
      cross_agent_contamination_success_rate: rate(
        crossAgentContaminationSuccesses,
        crossAgentAttempts
      ),
      benign_cases: benignCases,
      false_positives: falsePositives,
      false_positive_rate: rate(falsePositives, benignCases),
      malicious_cases: maliciousCases,
      false_negatives: falseNegatives,
      false_negative_rate: rate(falseNegatives, maliciousCases)
    }),
    non_claims: Object.freeze({
      production_selection_authorized: false,
      native_memory_put_reconciled: false,
      arbitrary_provider_agent_behavior_proven: false,
      multi_parent_merge_lineage_proven: false,
      downstream_effect_authorized: false
    })
  });
}

function requireInspectableStore(store) {
  if (!store || !store.db || typeof store.openJson !== 'function') {
    throw new TypeError('Semantic memory contagion impact inspection requires a Grid store');
  }
}

function tupleKey(record) {
  return `${record.object_id}\u0000${record.content_digest}\u0000${record.provenance_digest}`;
}

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`Semantic memory contagion ${label} is invalid`);
  }
  return value;
}

function boundedCount(value, maximum, label) {
  const normalized = count(value, label);
  if (normalized > maximum) {
    throw new ValidationError(`Semantic memory contagion ${label} exceeds its case count`);
  }
  return normalized;
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}
