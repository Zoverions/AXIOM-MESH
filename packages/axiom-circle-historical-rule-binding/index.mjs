import { ValidationError } from '../../mesh/src/lib/canonical.mjs';
import {
  validateCircleHistoricalRuleBindingLedger as validateBaseCircleHistoricalRuleBindingLedger,
  validateCircleHistoricalRuleBindingPolicy
} from './implementation.mjs';

export { validateCircleHistoricalRuleBindingPolicy };

export function validateCircleHistoricalRuleBindingLedger(
  policy,
  charterPolicy,
  circlePackage,
  charterLifecycle,
  ledger,
  options = {}
) {
  const validation = validateBaseCircleHistoricalRuleBindingLedger(
    policy,
    charterPolicy,
    circlePackage,
    charterLifecycle,
    ledger,
    options
  );
  enforceOneUseInvitationConsumption(ledger.bindings);
  return validation;
}

function enforceOneUseInvitationConsumption(bindings) {
  const consumedInvitationBindings = new Set();
  for (const binding of bindings) {
    if (binding.record_type !== 'membership') continue;
    if (consumedInvitationBindings.has(binding.basis_binding_id)) {
      throw new ValidationError(
        `Circle historical invitation binding ${binding.basis_binding_id} is one-use and cannot create multiple memberships`
      );
    }
    consumedInvitationBindings.add(binding.basis_binding_id);
  }
}
