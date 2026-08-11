import { ValidationError, assertPlainObject } from './canonical.mjs';
import {
  INTENT_EXECUTOR_PROMOTION_SCHEMA,
  INTENT_RESOLVER_PROMOTION_SCHEMA
} from './intent-executor-admission-current.mjs';
import * as fixed from './intent-executor-promotion-package.mjs';
import * as resolver from './intent-executor-resolver-promotion-package.mjs';

export {
  INTENT_EXECUTOR_PROMOTION_PACKAGE_SCHEMA,
  INTENT_EXECUTOR_REGISTRY_PATH,
  INTENT_EXECUTOR_REGISTRY_REPOSITORY
} from './intent-executor-promotion-package.mjs';
export {
  INTENT_RESOLVER_PROMOTION_PACKAGE_SCHEMA
} from './intent-executor-resolver-promotion-package.mjs';

function candidateKind(rawCandidate) {
  const candidate = assertPlainObject(rawCandidate, 'promotion_candidate');
  if (candidate.schema === INTENT_EXECUTOR_PROMOTION_SCHEMA) return 'fixed_input';
  if (candidate.schema === INTENT_RESOLVER_PROMOTION_SCHEMA) return 'input_resolver';
  throw new ValidationError('promotion candidate schema is unsupported by the current package facade');
}

function packageKind(rawPackage) {
  const pkg = assertPlainObject(rawPackage, 'promotion_package');
  if (pkg.schema === fixed.INTENT_EXECUTOR_PROMOTION_PACKAGE_SCHEMA) return 'fixed_input';
  if (pkg.schema === resolver.INTENT_RESOLVER_PROMOTION_PACKAGE_SCHEMA) return 'input_resolver';
  throw new ValidationError('promotion package schema is unsupported by the current package facade');
}

export function buildIntentExecutorPromotionPackage(args) {
  return candidateKind(args?.promotion_candidate) === 'fixed_input'
    ? fixed.buildIntentExecutorPromotionPackage(args)
    : resolver.buildIntentResolverPromotionPackage(args);
}

export function normalizeIntentExecutorPromotionPackage(raw) {
  return packageKind(raw) === 'fixed_input'
    ? fixed.normalizeIntentExecutorPromotionPackage(raw)
    : resolver.normalizeIntentResolverPromotionPackage(raw);
}

export function verifyIntentExecutorPromotionPackage(raw, args) {
  return packageKind(raw) === 'fixed_input'
    ? fixed.verifyIntentExecutorPromotionPackage(raw, args)
    : resolver.verifyIntentResolverPromotionPackage(raw, args);
}
