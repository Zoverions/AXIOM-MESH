import { ValidationError } from './canonical.mjs';
import {
  contractDigest,
  verifyFlowContext
} from './agent-containment-contracts.mjs';

function unionSorted(...groups) {
  return [...new Set(groups.flat(2))].sort();
}

export function deriveFlowContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('flow derivation input must be an object');
  }
  if (!Array.isArray(input.parents)) {
    throw new ValidationError('flow parents must be an array');
  }
  if (input.parents.length > 8) {
    throw new ValidationError('flow parent count exceeds 8');
  }

  const parents = input.parents.map(verifyFlowContext);
  for (const parent of parents) {
    if (parent.root_task_id !== input.root_task_id) {
      throw new ValidationError('flow parent root task mismatch');
    }
    if (parent.policy_profile_digest !== input.policy_profile_digest) {
      throw new ValidationError('flow parent policy digest mismatch');
    }
  }

  const lineageDepth = parents.length === 0
    ? 0
    : 1 + Math.max(...parents.map(item => item.lineage_depth));
  if (lineageDepth > 16) {
    throw new ValidationError('flow lineage depth exceeds 16');
  }

  const raw = {
    schema: 'axiom-flow-context.v0',
    flow_context_id: input.id,
    principal: input.principal,
    runtime_identity: input.runtime_identity,
    root_task_id: input.root_task_id,
    parent_flow_contexts: parents.map(item => ({
      flow_context_id: item.flow_context_id,
      flow_digest: item.flow_digest
    })),
    lineage_depth: lineageDepth,
    observed_data_classes: unionSorted(
      parents.map(item => item.observed_data_classes),
      input.observed_data_classes
    ),
    observed_authority_classes: unionSorted(
      parents.map(item => item.observed_authority_classes),
      input.observed_authority_classes
    ),
    owner_or_domain_scopes: unionSorted(
      parents.map(item => item.owner_or_domain_scopes),
      input.owner_or_domain_scopes
    ),
    purpose_scopes: unionSorted(
      parents.map(item => item.purpose_scopes),
      input.purpose_scopes
    ),
    source_commitments: unionSorted(
      parents.map(item => item.source_commitments),
      input.source_commitments
    ),
    created_at: input.created_at,
    updated_at: input.updated_at,
    policy_profile_digest: input.policy_profile_digest
  };
  raw.flow_digest = contractDigest(raw, 'flow_digest');
  return verifyFlowContext(raw);
}
