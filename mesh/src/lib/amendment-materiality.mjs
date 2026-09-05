import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

const DIGEST = /^[a-f0-9]{64}$/;

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

export function assessAmendmentMateriality(raw) {
  const value = assertPlainObject(raw, 'amendment materiality input');
  digest(value.base_contract_digest, 'base_contract_digest');
  digest(value.proposed_contract_digest, 'proposed_contract_digest');

  const changed = assertStringArray(value.changed_dimensions ?? [], 'changed_dimensions', {
    maxItems: 64, itemMax: 128
  });

  const materialDimensions = new Set([
    'obligation','beneficiary','obligor','price_or_value','deadline','data_scope',
    'privacy','risk','remedy','jurisdiction','termination','delegation',
    'authority_context','verification_requirement','retention'
  ]);
  const material = changed.some(item => materialDimensions.has(item));

  const affectedParties = assertStringArray(value.affected_party_ids ?? [], 'affected_party_ids', {
    maxItems: 128, itemMax: 192
  });

  if (material && affectedParties.length === 0) {
    throw new ValidationError('material amendment requires explicit affected_party_ids');
  }

  return Object.freeze({
    material,
    changed_dimensions: Object.freeze([...changed]),
    renewed_acceptance_required_from: Object.freeze(material ? [...affectedParties] : []),
    authority_effect: 'none'
  });
}
