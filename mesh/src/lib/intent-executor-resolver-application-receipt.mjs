import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { normalizeIntentExecutorRegistry } from './intent-execution-eligibility.mjs';
import { normalizeIntentExecutorAdmissionDossier } from './intent-executor-admission-current.mjs';
import {
  INTENT_EXECUTOR_REGISTRY_PATH,
  INTENT_EXECUTOR_REGISTRY_REPOSITORY,
  INTENT_RESOLVER_PROMOTION_PACKAGE_SCHEMA,
  verifyIntentExecutorPromotionPackage
} from './intent-executor-promotion-package-current.mjs';

export const INTENT_RESOLVER_APPLICATION_RECEIPT_SCHEMA = 'axiom-intent-resolver-application-receipt.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const REVISION = /^[A-Za-z0-9][A-Za-z0-9_.:@/+~-]{0,255}$/;
const MAX_REGISTRY_BYTES = 512 * 1024;

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function parseRegistryBytes(rawBytes, name) {
  if (typeof rawBytes !== 'string') throw new ValidationError(`${name} must be UTF-8 text`);
  const length = Buffer.byteLength(rawBytes, 'utf8');
  if (length <= 0 || length > MAX_REGISTRY_BYTES) {
    throw new ValidationError(`${name} must be between 1 and ${MAX_REGISTRY_BYTES} UTF-8 bytes`);
  }
  let document;
  try {
    document = JSON.parse(rawBytes);
  } catch {
    throw new ValidationError(`${name} must contain valid JSON`);
  }
  return {
    bytes: rawBytes,
    bytes_digest: sha256(rawBytes),
    bytes_length: length,
    normalized: normalizeIntentExecutorRegistry(document)
  };
}

function mappingMap(registry) {
  return new Map(registry.mappings.map(mapping => [mapping.semantic_action, mapping]));
}

function assertExactOneAddition(preRegistry, postRegistry, mapping) {
  if (postRegistry.mappings.length !== preRegistry.mappings.length + 1) {
    throw new ValidationError('observed resolver post registry must contain exactly one added mapping');
  }
  const pre = mappingMap(preRegistry);
  const post = mappingMap(postRegistry);
  for (const [semanticAction, existing] of pre) {
    const observed = post.get(semanticAction);
    if (!observed || canonicalJson(observed) !== canonicalJson(existing)) {
      throw new ValidationError('observed resolver post registry modified or deleted an existing mapping');
    }
  }
  if (pre.has(mapping.semantic_action)) {
    throw new ValidationError('resolver candidate semantic action already existed before application');
  }
  const addition = post.get(mapping.semantic_action);
  if (!addition || canonicalJson(addition) !== canonicalJson(mapping)) {
    throw new ValidationError('observed resolver post registry does not contain the exact reviewed mapping');
  }
}

function normalizeReleaseContext(value) {
  if (value === undefined || value === null) return {};
  return JSON.parse(canonicalJson(assertPlainObject(value, 'release_context')));
}

function reviewBindings(value) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new ValidationError('resolver application receipt must bind exactly two mapping reviews');
  }
  return value.map((rawReview, index) => {
    const review = assertPlainObject(rawReview, `reviews[${index}]`);
    return {
      review_id: assertString(review.review_id, `reviews[${index}].review_id`, { max: 192 }),
      review_digest: assertDigest(review.review_digest, `reviews[${index}].review_digest`),
      reviewer: assertString(review.reviewer, `reviews[${index}].reviewer`, { max: 160, pattern: ID }),
      review_role: assertString(review.review_role, `reviews[${index}].review_role`, { max: 64 })
    };
  }).sort((left, right) => left.review_role.localeCompare(right.review_role));
}

function receiptBodyFrom(raw) {
  const value = assertPlainObject(raw, 'Intent resolver application receipt');
  if (value.schema !== INTENT_RESOLVER_APPLICATION_RECEIPT_SCHEMA) {
    throw new ValidationError(`resolver application receipt schema must be ${INTENT_RESOLVER_APPLICATION_RECEIPT_SCHEMA}`);
  }
  if (
    value.application_verified !== true
    || value.mapping_installed_observed !== true
    || value.apply_authorized !== false
    || value.execution_authorized !== false
    || value.resolved_input_observed !== false
    || value.external_effect_prepared_observed !== false
    || value.external_effect_executed_observed !== false
  ) {
    throw new ValidationError('resolver application receipt observation/authority flags are invalid');
  }
  const destination = assertPlainObject(value.destination, 'destination');
  if (
    destination.repository !== INTENT_EXECUTOR_REGISTRY_REPOSITORY
    || destination.path !== INTENT_EXECUTOR_REGISTRY_PATH
  ) {
    throw new ValidationError('resolver application receipt registry destination is invalid');
  }
  const pre = assertPlainObject(value.pre_registry, 'pre_registry');
  const post = assertPlainObject(value.post_registry, 'post_registry');
  const proposed = assertPlainObject(value.package_proposed_registry, 'package_proposed_registry');
  const mapping = assertPlainObject(value.mapping, 'mapping');
  const resolver = assertPlainObject(value.resolver, 'resolver');
  const authority = assertPlainObject(value.authority_bindings, 'authority_bindings');
  const verifiedAt = new Date(assertString(value.verified_at, 'verified_at', { max: 64 }));
  if (Number.isNaN(verifiedAt.valueOf())) throw new ValidationError('verified_at must be an ISO timestamp');
  const sourceRevision = value.source_revision === null
    ? null
    : assertString(value.source_revision, 'source_revision', { max: 256, pattern: REVISION });
  return {
    schema: INTENT_RESOLVER_APPLICATION_RECEIPT_SCHEMA,
    package_id: assertString(value.package_id, 'package_id', { max: 192 }),
    package_digest: assertDigest(value.package_digest, 'package_digest'),
    promotion_candidate_id: assertString(value.promotion_candidate_id, 'promotion_candidate_id', { max: 192 }),
    promotion_candidate_digest: assertDigest(value.promotion_candidate_digest, 'promotion_candidate_digest'),
    facts_digest: assertDigest(value.facts_digest, 'facts_digest'),
    mapping: JSON.parse(canonicalJson(mapping)),
    mapping_digest: assertDigest(value.mapping_digest, 'mapping_digest'),
    resolver: JSON.parse(canonicalJson(resolver)),
    resolver_digest: assertDigest(value.resolver_digest, 'resolver_digest'),
    effect_destination: assertString(value.effect_destination, 'effect_destination', { min: 1, max: 256 }),
    policy_gates: JSON.parse(canonicalJson(assertPlainObject(value.policy_gates, 'policy_gates'))),
    semantic_action: assertString(value.semantic_action, 'semantic_action', { max: 128 }),
    destination: {
      repository: destination.repository,
      path: destination.path
    },
    pre_registry: {
      semantic_digest: assertDigest(pre.semantic_digest, 'pre_registry.semantic_digest'),
      file_bytes_digest: assertDigest(pre.file_bytes_digest, 'pre_registry.file_bytes_digest'),
      file_bytes_length: Number(pre.file_bytes_length)
    },
    post_registry: {
      semantic_digest: assertDigest(post.semantic_digest, 'post_registry.semantic_digest'),
      file_bytes_digest: assertDigest(post.file_bytes_digest, 'post_registry.file_bytes_digest'),
      file_bytes_length: Number(post.file_bytes_length)
    },
    package_proposed_registry: {
      semantic_digest: assertDigest(proposed.semantic_digest, 'package_proposed_registry.semantic_digest'),
      file_bytes_digest: assertDigest(proposed.file_bytes_digest, 'package_proposed_registry.file_bytes_digest'),
      file_bytes_length: Number(proposed.file_bytes_length)
    },
    delta: {
      operation: 'add_exactly_one_mapping',
      input_mode: 'input_resolver',
      existing_mapping_modifications: 0,
      existing_mapping_deletions: 0,
      unrelated_additions: 0
    },
    authority_bindings: {
      policy_digest: assertDigest(authority.policy_digest, 'authority_bindings.policy_digest'),
      capability_registry_digest: assertDigest(authority.capability_registry_digest, 'authority_bindings.capability_registry_digest'),
      build_digest: assertDigest(authority.build_digest, 'authority_bindings.build_digest'),
      base_executor_registry_digest: assertDigest(authority.base_executor_registry_digest, 'authority_bindings.base_executor_registry_digest')
    },
    reviews: reviewBindings(value.reviews),
    application_verifier: assertString(value.application_verifier, 'application_verifier', { max: 160, pattern: ID }),
    verified_at: verifiedAt.toISOString(),
    source_revision: sourceRevision,
    release_context: normalizeReleaseContext(value.release_context),
    application_verified: true,
    mapping_installed_observed: true,
    apply_authorized: false,
    execution_authorized: false,
    resolved_input_observed: false,
    external_effect_prepared_observed: false,
    external_effect_executed_observed: false,
    non_claim: assertString(value.non_claim, 'non_claim', { max: 512 })
  };
}

function forbiddenVerifierIdentities(dossier, promotionPackage) {
  return new Set([
    dossier.producer,
    ...promotionPackage.reviews.map(review => review.reviewer)
  ]);
}

export function buildIntentResolverApplicationReceipt({
  promotion_package,
  promotion_candidate,
  dossier: rawDossier,
  reviews,
  current_context,
  pre_registry_bytes,
  post_registry_bytes,
  identity,
  application_verifier = identity?.service,
  verified_at,
  source_revision = null,
  release_context = {},
  now = verified_at
}) {
  if (!identity || typeof identity.signObject !== 'function' || typeof identity.service !== 'string') {
    throw new ValidationError('resolver application receipt requires an AXIOM signing identity');
  }
  if (application_verifier !== identity.service) {
    throw new ValidationError('resolver application verifier must match the signing identity service');
  }
  const dossier = normalizeIntentExecutorAdmissionDossier(rawDossier);
  const promotionPackage = verifyIntentExecutorPromotionPackage(promotion_package, {
    promotion_candidate,
    dossier,
    reviews,
    current_context,
    current_registry_bytes: pre_registry_bytes,
    now
  });
  if (promotionPackage.schema !== INTENT_RESOLVER_PROMOTION_PACKAGE_SCHEMA) {
    throw new ValidationError('resolver application receipt requires a resolver promotion package');
  }
  if (forbiddenVerifierIdentities(dossier, promotionPackage).has(application_verifier)) {
    throw new ValidationError('resolver application verifier must be independent from dossier producer and mapping reviewers');
  }

  const pre = parseRegistryBytes(pre_registry_bytes, 'pre_registry_bytes');
  const post = parseRegistryBytes(post_registry_bytes, 'post_registry_bytes');
  if (
    pre.bytes_digest !== promotionPackage.base_registry.file_bytes_digest
    || pre.normalized.registry_digest !== promotionPackage.base_registry.semantic_digest
  ) {
    throw new ValidationError('pre-application registry does not exactly match the reviewed resolver package base');
  }
  if (post.bytes !== promotionPackage.proposed_registry.utf8) {
    throw new ValidationError('post-application registry bytes do not exactly match the reviewed resolver package proposal');
  }
  if (
    post.bytes_digest !== promotionPackage.proposed_registry.file_bytes_digest
    || post.normalized.registry_digest !== promotionPackage.proposed_registry.semantic_digest
  ) {
    throw new ValidationError('post-application resolver registry checksums do not match the reviewed proposal');
  }
  assertExactOneAddition(pre.normalized, post.normalized, promotionPackage.mapping);

  const body = receiptBodyFrom({
    schema: INTENT_RESOLVER_APPLICATION_RECEIPT_SCHEMA,
    package_id: promotionPackage.package_id,
    package_digest: promotionPackage.package_digest,
    promotion_candidate_id: promotionPackage.promotion_candidate_id,
    promotion_candidate_digest: promotionPackage.promotion_candidate_digest,
    facts_digest: promotionPackage.facts_digest,
    mapping: promotionPackage.mapping,
    mapping_digest: promotionPackage.mapping_digest,
    resolver: promotionPackage.resolver,
    resolver_digest: promotionPackage.resolver_digest,
    effect_destination: promotionPackage.effect_destination,
    policy_gates: promotionPackage.policy_gates,
    semantic_action: promotionPackage.mapping.semantic_action,
    destination: {
      repository: promotionPackage.destination.repository,
      path: promotionPackage.destination.path
    },
    pre_registry: {
      semantic_digest: pre.normalized.registry_digest,
      file_bytes_digest: pre.bytes_digest,
      file_bytes_length: pre.bytes_length
    },
    post_registry: {
      semantic_digest: post.normalized.registry_digest,
      file_bytes_digest: post.bytes_digest,
      file_bytes_length: post.bytes_length
    },
    package_proposed_registry: {
      semantic_digest: promotionPackage.proposed_registry.semantic_digest,
      file_bytes_digest: promotionPackage.proposed_registry.file_bytes_digest,
      file_bytes_length: promotionPackage.proposed_registry.file_bytes_length
    },
    delta: {
      operation: 'add_exactly_one_mapping',
      input_mode: 'input_resolver',
      existing_mapping_modifications: 0,
      existing_mapping_deletions: 0,
      unrelated_additions: 0
    },
    authority_bindings: {
      policy_digest: promotionPackage.authority_bindings.policy_digest,
      capability_registry_digest: promotionPackage.authority_bindings.capability_registry_digest,
      build_digest: promotionPackage.authority_bindings.build_digest,
      base_executor_registry_digest: promotionPackage.authority_bindings.expected_executor_registry_digest
    },
    reviews: promotionPackage.reviews,
    application_verifier,
    verified_at,
    source_revision,
    release_context,
    application_verified: true,
    mapping_installed_observed: true,
    apply_authorized: false,
    execution_authorized: false,
    resolved_input_observed: false,
    external_effect_prepared_observed: false,
    external_effect_executed_observed: false,
    non_claim: 'This signed receipt observes the exact reviewed resolver mapping addition. It does not authorize application, resolve executor input, grant a capability, prepare a GitHub effect, or prove any remediation effect executed.'
  });
  const signature = identity.signObject(body);
  const receiptDigest = digestObject({ body, signature });
  return {
    ...body,
    signature,
    receipt_id: `intent-resolver-application-receipt:${receiptDigest}`,
    receipt_digest: receiptDigest
  };
}

export function verifyIntentResolverApplicationReceipt(rawReceipt, {
  promotion_package,
  promotion_candidate,
  dossier: rawDossier,
  reviews,
  current_context,
  pre_registry_bytes,
  post_registry_bytes,
  public_key,
  now = new Date().toISOString()
}) {
  const value = assertPlainObject(rawReceipt, 'Intent resolver application receipt');
  const body = receiptBodyFrom(value);
  const signature = JSON.parse(canonicalJson(assertPlainObject(value.signature, 'signature')));
  const receiptDigest = digestObject({ body, signature });
  if (
    value.receipt_digest !== receiptDigest
    || value.receipt_id !== `intent-resolver-application-receipt:${receiptDigest}`
  ) {
    throw new ValidationError('resolver application receipt is not content-addressed');
  }
  if (!signature.key_id?.startsWith(`${body.application_verifier}:`)) {
    throw new ValidationError('resolver application receipt key id does not match verifier identity');
  }
  if (!public_key || !verifyObjectSignature(body, signature, public_key)) {
    throw new ValidationError('resolver application receipt signature is invalid');
  }
  const expectedIdentity = {
    service: body.application_verifier,
    signObject() {
      return signature;
    }
  };
  const expected = buildIntentResolverApplicationReceipt({
    promotion_package,
    promotion_candidate,
    dossier: rawDossier,
    reviews,
    current_context,
    pre_registry_bytes,
    post_registry_bytes,
    identity: expectedIdentity,
    application_verifier: body.application_verifier,
    verified_at: body.verified_at,
    source_revision: body.source_revision,
    release_context: body.release_context,
    now
  });
  const {
    signature: ignoredExpectedSignature,
    receipt_id: ignoredExpectedId,
    receipt_digest: ignoredExpectedDigest,
    ...expectedBody
  } = expected;
  if (canonicalJson(body) !== canonicalJson(expectedBody)) {
    throw new ValidationError('resolver application receipt does not match exact current package and observed registry state');
  }
  const nowDate = new Date(assertString(now, 'now', { max: 64 }));
  if (Number.isNaN(nowDate.valueOf())) throw new ValidationError('now must be an ISO timestamp');
  if (new Date(body.verified_at).valueOf() > nowDate.valueOf() + 5 * 60 * 1000) {
    throw new ValidationError('resolver application receipt verification timestamp is from the future');
  }
  return {
    ...body,
    signature,
    receipt_id: value.receipt_id,
    receipt_digest: value.receipt_digest
  };
}
