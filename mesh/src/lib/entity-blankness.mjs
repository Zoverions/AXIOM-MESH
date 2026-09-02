import { ValidationError } from './canonical.mjs';
import { entityFoundationDigest, validateEntityFoundation } from './entity-foundation.mjs';
import { entityLayerStackDigest, resolveEntityLayerStack, validateEntityLayerStack } from './entity-layer-stack.mjs';

const NON_CLAIMS = Object.freeze([
  'does-not-prove-model-weight-neutrality',
  'does-not-prove-consciousness-status',
  'does-not-prove-environmental-neutrality'
]);

export function verifyEntityBlankness(foundation, stack, layers = []) {
  validateEntityFoundation(foundation);
  validateEntityLayerStack(stack);
  resolveEntityLayerStack(stack, foundation, layers);

  if (stack.active_layers.length !== 0) {
    throw new ValidationError('Blankness proof requires zero active layers');
  }

  const layerHistoryPresent = stack.suspended_layer_ids.length > 0 || stack.superseded_layer_ids.length > 0;

  return Object.freeze({
    valid: true,
    claim: 'blank-at-axiom-composition-layer',
    blank_mode: layerHistoryPresent ? 'currently-blank-with-layer-history' : 'genesis-clean',
    foundation_id: foundation.foundation_id,
    entity_id: foundation.entity_id,
    foundation_digest: entityFoundationDigest(foundation),
    stack_digest: entityLayerStackDigest(stack),
    optional_active_layer_count: 0,
    layer_history_present: layerHistoryPresent,
    historical_influence_not_erased: layerHistoryPresent,
    personal_grounding_present: false,
    worldview_layers_present: false,
    disposition_layers_present: false,
    provider_binding_present: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    non_claims: NON_CLAIMS
  });
}
