import { ValidationError, assertPlainObject } from './canonical.mjs';
import { normalizeIntentExecutorRegistry } from './intent-execution-eligibility.mjs';
import { classifyExecutorMappingInputMode } from './intent-resolver-admission-facts.mjs';
import * as fixed from './intent-executor-admission.mjs';
import * as resolver from './intent-executor-resolver-admission.mjs';

export {
  INTENT_EXECUTOR_ADMISSION_DOSSIER_SCHEMA,
  INTENT_EXECUTOR_PROMOTION_SCHEMA,
  INTENT_EXECUTOR_REVIEW_SCHEMA
} from './intent-executor-admission.mjs';
export {
  INTENT_RESOLVER_ADMISSION_DOSSIER_SCHEMA,
  INTENT_RESOLVER_PROMOTION_SCHEMA,
  INTENT_RESOLVER_REVIEW_SCHEMA
} from './intent-executor-resolver-admission.mjs';

function inputMode(candidateMapping, currentContext) {
  const context = assertPlainObject(currentContext, 'executor admission current context');
  const registry = normalizeIntentExecutorRegistry(context.executor_registry);
  return classifyExecutorMappingInputMode(
    candidateMapping,
    registry.kernel_version
  ).mode;
}

function dossierKind(rawDossier) {
  const dossier = assertPlainObject(rawDossier, 'executor admission dossier');
  if (dossier.schema === fixed.INTENT_EXECUTOR_ADMISSION_DOSSIER_SCHEMA) return 'fixed_input';
  if (dossier.schema === resolver.INTENT_RESOLVER_ADMISSION_DOSSIER_SCHEMA) return 'input_resolver';
  throw new ValidationError('executor admission dossier schema is unsupported');
}

function promotionKind(rawCandidate) {
  const candidate = assertPlainObject(rawCandidate, 'executor promotion candidate');
  if (candidate.schema === fixed.INTENT_EXECUTOR_PROMOTION_SCHEMA) return 'fixed_input';
  if (candidate.schema === resolver.INTENT_RESOLVER_PROMOTION_SCHEMA) return 'input_resolver';
  throw new ValidationError('executor promotion candidate schema is unsupported');
}

export function buildIntentExecutorAdmissionDossier(args) {
  return inputMode(args?.candidate_mapping, args?.current_context) === 'fixed_input'
    ? fixed.buildIntentExecutorAdmissionDossier(args)
    : resolver.buildIntentResolverAdmissionDossier(args);
}

export function normalizeIntentExecutorAdmissionDossier(raw) {
  return dossierKind(raw) === 'fixed_input'
    ? fixed.normalizeIntentExecutorAdmissionDossier(raw)
    : resolver.normalizeIntentResolverAdmissionDossier(raw);
}

export function validateIntentExecutorAdmissionDossierCurrent(raw, currentContext, options) {
  return dossierKind(raw) === 'fixed_input'
    ? fixed.validateIntentExecutorAdmissionDossierCurrent(raw, currentContext, options)
    : resolver.validateIntentResolverAdmissionDossierCurrent(raw, currentContext, options);
}

export function buildIntentExecutorReviewAttestation(rawDossier, options) {
  return dossierKind(rawDossier) === 'fixed_input'
    ? fixed.buildIntentExecutorReviewAttestation(rawDossier, options)
    : resolver.buildIntentResolverReviewAttestation(rawDossier, options);
}

export function verifyIntentExecutorReviewAttestation(rawReview, rawDossier, options) {
  return dossierKind(rawDossier) === 'fixed_input'
    ? fixed.verifyIntentExecutorReviewAttestation(rawReview, rawDossier, options)
    : resolver.verifyIntentResolverReviewAttestation(rawReview, rawDossier, options);
}

export function buildIntentExecutorPromotionCandidate(args) {
  return dossierKind(args?.dossier) === 'fixed_input'
    ? fixed.buildIntentExecutorPromotionCandidate(args)
    : resolver.buildIntentResolverPromotionCandidate(args);
}

export function normalizeIntentExecutorPromotionCandidate(raw) {
  return promotionKind(raw) === 'fixed_input'
    ? fixed.normalizeIntentExecutorPromotionCandidate(raw)
    : resolver.normalizeIntentResolverPromotionCandidate(raw);
}

export function verifyIntentExecutorPromotionCandidate(raw, args) {
  return promotionKind(raw) === 'fixed_input'
    ? fixed.verifyIntentExecutorPromotionCandidate(raw, args)
    : resolver.verifyIntentResolverPromotionCandidate(raw, args);
}

export function requiredIntentExecutorAdmissionEvidenceAssertions({ mode = 'fixed_input' } = {}) {
  if (mode === 'fixed_input') return fixed.requiredIntentExecutorAdmissionEvidenceAssertions();
  if (mode === 'input_resolver') return resolver.requiredIntentResolverAdmissionEvidenceAssertions();
  throw new ValidationError('executor admission evidence mode is unsupported');
}
