import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { normalizeIntentExecutorRegistry } from './intent-execution-eligibility.mjs';
import {
  INTENT_RESOLVER_PROMOTION_SCHEMA,
  verifyIntentExecutorPromotionCandidate
} from './intent-executor-admission-current.mjs';
import {
  INTENT_EXECUTOR_REGISTRY_PATH,
  INTENT_EXECUTOR_REGISTRY_REPOSITORY
} from './intent-executor-promotion-package.mjs';

export const INTENT_RESOLVER_PROMOTION_PACKAGE_SCHEMA = 'axiom-intent-resolver-promotion-package.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const MAX_REGISTRY_BYTES = 512 * 1024;

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function stripComputedMappingFields(mapping) {
  const value = assertPlainObject(mapping, 'executor mapping');
  const { mapping_digest: ignoredMappingDigest, ...documentMapping } = value;
  return JSON.parse(canonicalJson(documentMapping));
}

function rawRegistryDocument(normalizedRegistry) {
  return {
    schema: normalizedRegistry.schema,
    kernel_version: normalizedRegistry.kernel_version,
    mappings: normalizedRegistry.mappings.map(stripComputedMappingFields)
  };
}

function prettyRegistryBytes(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function parseRegistryBytes(rawBytes, name) {
  if (typeof rawBytes !== 'string') throw new ValidationError(`${name} must be UTF-8 text`);
  const size = Buffer.byteLength(rawBytes, 'utf8');
  if (size <= 0 || size > MAX_REGISTRY_BYTES) {
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
    document,
    normalized: normalizeIntentExecutorRegistry(document)
  };
}

function normalizedContextRegistry(currentContext) {
  const context = assertPlainObject(currentContext, 'current_context');
  return normalizeIntentExecutorRegistry(context.executor_registry);
}

function mappingMap(registry) {
  return new Map(registry.mappings.map(mapping => [mapping.semantic_action, mapping]));
}

function assertOneAddition(baseRegistry, nextRegistry, candidateMapping) {
  if (nextRegistry.mappings.length !== baseRegistry.mappings.length + 1) {
    throw new ValidationError('proposed resolver registry must contain exactly one added mapping');
  }
  const base = mappingMap(baseRegistry);
  const next = mappingMap(nextRegistry);
  for (const [semanticAction, mapping] of base) {
    const proposed = next.get(semanticAction);
    if (!proposed || canonicalJson(proposed) !== canonicalJson(mapping)) {
      throw new ValidationError('proposed resolver registry may not delete or modify an existing mapping');
    }
  }
  if (base.has(candidateMapping.semantic_action)) {
    throw new ValidationError('resolver promotion semantic action already exists in the base registry');
  }
  const added = next.get(candidateMapping.semantic_action);
  if (!added || canonicalJson(added) !== canonicalJson(candidateMapping)) {
    throw new ValidationError('proposed registry addition does not exactly match the reviewed resolver mapping');
  }
}

function reviewBindings(candidate) {
  if (!Array.isArray(candidate.reviews) || candidate.reviews.length !== 2) {
    throw new ValidationError('resolver promotion candidate must bind exactly two independent reviews');
  }
  return candidate.reviews.map(review => ({
    review_id: assertString(review.review_id, 'review_id', { max: 192 }),
    review_digest: assertDigest(review.review_digest, 'review_digest'),
    reviewer: assertString(review.reviewer, 'reviewer', { max: 160 }),
    review_role: assertString(review.review_role, 'review_role', { max: 64 }),
    expires_at: assertString(review.expires_at, 'review.expires_at', { max: 64 })
  })).sort((left, right) => left.review_role.localeCompare(right.review_role));
}

function buildPackageBody({ candidate, base, proposed }) {
  return {
    schema: INTENT_RESOLVER_PROMOTION_PACKAGE_SCHEMA,
    promotion_candidate_id: candidate.promotion_id,
    promotion_candidate_digest: candidate.promotion_digest,
    facts_digest: candidate.facts_digest,
    mapping: candidate.mapping,
    mapping_digest: candidate.mapping_digest,
    resolver: candidate.resolver,
    resolver_digest: candidate.resolver_digest,
    effect_destination: candidate.effect_destination,
    policy_gates: candidate.policy_gates,
    destination: {
      repository: INTENT_EXECUTOR_REGISTRY_REPOSITORY,
      path: INTENT_EXECUTOR_REGISTRY_PATH,
      mutation_performed: false
    },
    base_registry: {
      semantic_digest: base.normalized.registry_digest,
      file_bytes_digest: base.bytes_digest,
      file_bytes_length: Buffer.byteLength(base.bytes, 'utf8')
    },
    proposed_registry: {
      semantic_digest: proposed.normalized.registry_digest,
      file_bytes_digest: proposed.bytes_digest,
      file_bytes_length: Buffer.byteLength(proposed.bytes, 'utf8'),
      utf8: proposed.bytes
    },
    patch: {
      operation: 'add_exactly_one_mapping',
      added_semantic_action: candidate.mapping.semantic_action,
      added_mapping_digest: candidate.mapping_digest,
      input_mode: 'input_resolver',
      resolver_digest: candidate.resolver_digest,
      base_mapping_count: base.normalized.mappings.length,
      proposed_mapping_count: proposed.normalized.mappings.length,
      existing_mapping_modifications: 0,
      existing_mapping_deletions: 0
    },
    authority_bindings: {
      policy_digest: candidate.policy_digest,
      capability_registry_digest: candidate.capability_registry_digest,
      build_digest: candidate.build_digest,
      expected_executor_registry_digest: candidate.expected_executor_registry_digest
    },
    reviews: reviewBindings(candidate),
    verification: {
      schema: 'axiom-intent-resolver-promotion-package-verification.v1',
      required_checks: [
        'verify_resolver_candidate_against_current_context',
        'verify_base_registry_file_bytes_digest',
        'verify_base_registry_semantic_digest',
        'verify_exactly_one_resolver_mapping_addition',
        'verify_resolver_constraints_and_destination_binding',
        'verify_proposed_registry_file_bytes_digest',
        'verify_proposed_registry_semantic_digest',
        'verify_no_existing_mapping_change',
        'verify_no_install_or_execution_authority'
      ]
    },
    apply_authorized: false,
    mapping_installed: false,
    execution_authorized: false,
    installation_authority: null,
    non_claim: 'This offline resolver package describes one exact independently reviewed registry addition. It does not apply, install, approve, resolve input, or execute that change.'
  };
}

export function buildIntentResolverPromotionPackage({
  promotion_candidate,
  dossier,
  reviews,
  current_context,
  current_registry_bytes,
  now = new Date().toISOString()
}) {
  const candidate = verifyIntentExecutorPromotionCandidate(promotion_candidate, {
    dossier,
    reviews,
    current_context,
    now
  });
  if (candidate.schema !== INTENT_RESOLVER_PROMOTION_SCHEMA) {
    throw new ValidationError('resolver promotion package requires a resolver promotion candidate');
  }
  const contextRegistry = normalizedContextRegistry(current_context);
  const base = parseRegistryBytes(current_registry_bytes, 'current_registry_bytes');
  if (base.normalized.registry_digest !== contextRegistry.registry_digest) {
    throw new ValidationError('current registry file bytes do not match current semantic executor registry');
  }
  if (candidate.expected_executor_registry_digest !== base.normalized.registry_digest) {
    throw new ValidationError('resolver promotion candidate expects a different base executor registry');
  }
  if (base.normalized.mappings.some(mapping => mapping.semantic_action === candidate.mapping.semantic_action)) {
    throw new ValidationError('resolver promotion semantic action already exists in the current registry');
  }

  const nextDocument = rawRegistryDocument(base.normalized);
  nextDocument.mappings.push(stripComputedMappingFields(candidate.mapping));
  nextDocument.mappings.sort((left, right) => left.semantic_action.localeCompare(right.semantic_action));
  const proposedBytes = prettyRegistryBytes(nextDocument);
  const proposed = parseRegistryBytes(proposedBytes, 'proposed_registry_bytes');
  assertOneAddition(base.normalized, proposed.normalized, candidate.mapping);

  const body = buildPackageBody({ candidate, base, proposed });
  const packageDigest = digestObject(body);
  return {
    ...body,
    package_id: `intent-resolver-promotion-package:${packageDigest}`,
    package_digest: packageDigest
  };
}

export function normalizeIntentResolverPromotionPackage(raw) {
  const value = assertPlainObject(raw, 'Intent resolver promotion package');
  if (value.schema !== INTENT_RESOLVER_PROMOTION_PACKAGE_SCHEMA) {
    throw new ValidationError(`resolver promotion package schema must be ${INTENT_RESOLVER_PROMOTION_PACKAGE_SCHEMA}`);
  }
  if (
    value.apply_authorized !== false
    || value.mapping_installed !== false
    || value.execution_authorized !== false
    || value.installation_authority !== null
  ) {
    throw new ValidationError('resolver promotion package must remain non-applying, non-installing, and non-executing');
  }
  const packageId = assertString(value.package_id, 'package_id', { max: 192 });
  const packageDigest = assertDigest(value.package_digest, 'package_digest');
  const { package_id: ignoredId, package_digest: ignoredDigest, ...body } = value;
  const expectedDigest = digestObject(body);
  if (
    packageDigest !== expectedDigest
    || packageId !== `intent-resolver-promotion-package:${expectedDigest}`
  ) {
    throw new ValidationError('resolver executor promotion package is not content-addressed');
  }
  return {
    ...JSON.parse(canonicalJson(body)),
    package_id: packageId,
    package_digest: packageDigest
  };
}

export function verifyIntentResolverPromotionPackage(rawPackage, {
  promotion_candidate,
  dossier,
  reviews,
  current_context,
  current_registry_bytes,
  now = new Date().toISOString()
}) {
  const supplied = normalizeIntentResolverPromotionPackage(rawPackage);
  const expected = buildIntentResolverPromotionPackage({
    promotion_candidate,
    dossier,
    reviews,
    current_context,
    current_registry_bytes,
    now
  });
  if (canonicalJson(supplied) !== canonicalJson(expected)) {
    throw new ValidationError('resolver executor promotion package does not match exact current reviewed state');
  }
  const proposed = parseRegistryBytes(
    supplied.proposed_registry.utf8,
    'package.proposed_registry.utf8'
  );
  if (
    proposed.bytes_digest !== supplied.proposed_registry.file_bytes_digest
    || proposed.normalized.registry_digest !== supplied.proposed_registry.semantic_digest
  ) {
    throw new ValidationError('resolver promotion package proposed registry checksums are invalid');
  }
  const base = parseRegistryBytes(current_registry_bytes, 'current_registry_bytes');
  assertOneAddition(base.normalized, proposed.normalized, supplied.mapping);
  return supplied;
}
