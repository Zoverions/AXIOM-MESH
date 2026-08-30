import { ValidationError } from './canonical.mjs';

export const COGNITIVE_SELECTION_POLICY_SCHEMA = 'axiom-cognitive-selection-policy.v0';

export function validateCognitiveSelectionPolicy() {
  throw new ValidationError('Cognitive selection policy validation is not implemented');
}

export function proposeCognitiveSelection() {
  throw new ValidationError('Cognitive selection proposal construction is not implemented');
}
