import { ValidationError, assertPlainObject } from './canonical.mjs';
import {
  INTENT_EXECUTOR_PROMOTION_PACKAGE_SCHEMA,
  INTENT_RESOLVER_PROMOTION_PACKAGE_SCHEMA
} from './intent-executor-promotion-package-current.mjs';
import * as fixed from './intent-executor-application-receipt.mjs';
import * as resolver from './intent-executor-resolver-application-receipt.mjs';

export { INTENT_EXECUTOR_APPLICATION_RECEIPT_SCHEMA } from './intent-executor-application-receipt.mjs';
export { INTENT_RESOLVER_APPLICATION_RECEIPT_SCHEMA } from './intent-executor-resolver-application-receipt.mjs';

function packageKind(rawPackage) {
  const pkg = assertPlainObject(rawPackage, 'promotion_package');
  if (pkg.schema === INTENT_EXECUTOR_PROMOTION_PACKAGE_SCHEMA) return 'fixed_input';
  if (pkg.schema === INTENT_RESOLVER_PROMOTION_PACKAGE_SCHEMA) return 'input_resolver';
  throw new ValidationError('promotion package schema is unsupported by the current application receipt facade');
}

function receiptKind(rawReceipt) {
  const receipt = assertPlainObject(rawReceipt, 'application receipt');
  if (receipt.schema === fixed.INTENT_EXECUTOR_APPLICATION_RECEIPT_SCHEMA) return 'fixed_input';
  if (receipt.schema === resolver.INTENT_RESOLVER_APPLICATION_RECEIPT_SCHEMA) return 'input_resolver';
  throw new ValidationError('application receipt schema is unsupported by the current application receipt facade');
}

export function buildIntentExecutorApplicationReceipt(args) {
  return packageKind(args?.promotion_package) === 'fixed_input'
    ? fixed.buildIntentExecutorApplicationReceipt(args)
    : resolver.buildIntentResolverApplicationReceipt(args);
}

export function verifyIntentExecutorApplicationReceipt(raw, args) {
  return receiptKind(raw) === 'fixed_input'
    ? fixed.verifyIntentExecutorApplicationReceipt(raw, args)
    : resolver.verifyIntentResolverApplicationReceipt(raw, args);
}
