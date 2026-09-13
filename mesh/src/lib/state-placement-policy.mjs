import { ValidationError } from './canonical.mjs';
import {
  contractDigest,
  verifyStatePlacementRequest,
  verifyStateDestinationProfile,
  verifyStatePlacementPolicy,
  verifyStatePlacementPlan,
  PLACEMENT_REASON_CODES
} from './state-placement-contracts.mjs';

export { PLACEMENT_REASON_CODES };

const MAX_DESTINATIONS = 64;
const RESIDENCY_EVIDENCE_RANK = Object.freeze({
  unknown: 0,
  declared: 1,
  'provider-configured': 2,
  'authenticated-assertion': 3,
  'independently-verified': 4
});
const CONFIDENTIALITY_RANK = Object.freeze({
  public: 0,
  protected: 1,
  sensitive: 2,
  restricted: 3
});

export function evaluateStatePlacement({ request, policy, destinations, now }) {
  const verifiedRequest = verifyStatePlacementRequest(request, { now });
  const verifiedPolicy = verifyStatePlacementPolicy(policy, { now });

  if (verifiedRequest.policy_profile_digest !== verifiedPolicy.policy_digest) {
    throw new ValidationError('request policy_profile_digest does not match placement policy digest');
  }
  if (verifiedRequest.owner_scope !== verifiedPolicy.owner_scope) {
    throw new ValidationError('policy owner scope does not match request owner scope');
  }
  if (!verifiedPolicy.allowed_operations.includes(verifiedRequest.operation_class)) {
    throw new ValidationError('operation is disallowed by placement policy');
  }
  if (!Array.isArray(destinations) || destinations.length > MAX_DESTINATIONS) {
    throw new ValidationError('state placement evaluation accepts at most 64 candidate destinations');
  }

  const verifiedDestinations = destinations.map((destination) => verifyStateDestinationProfile(destination, { now }));
  rejectDuplicateDestinationIdentity(verifiedDestinations);

  const eligible = [];
  const ineligible = [];
  for (const destination of verifiedDestinations) {
    const reasonCodes = evaluateDestination({ request: verifiedRequest, policy: verifiedPolicy, destination });
    if (reasonCodes.length === 0) {
      eligible.push({
        destination_id: destination.destination_id,
        destination_class: destination.destination_class,
        profile_digest: destination.profile_digest,
        failure_domain: destination.failure_domain,
        required_encryption_profile: verifiedRequest.encryption_profile,
        receipt_required: true
      });
    } else {
      ineligible.push({
        destination_id: destination.destination_id,
        destination_class: destination.destination_class,
        profile_digest: destination.profile_digest,
        reason_codes: reasonCodes
      });
    }
  }

  eligible.sort((left, right) => left.destination_id.localeCompare(right.destination_id));
  ineligible.sort((left, right) => left.destination_id.localeCompare(right.destination_id));
  if (eligible.length > verifiedPolicy.maximum_eligible_destinations) {
    throw new ValidationError('eligible destination ceiling exceeds policy maximum_eligible_destinations');
  }

  const failureDomains = new Set(eligible.map((item) => item.failure_domain));
  const availability = {
    required_replicas: verifiedRequest.availability_target.minimum_replicas,
    eligible_replicas: eligible.length,
    required_failure_domains: verifiedRequest.availability_target.minimum_failure_domains,
    eligible_failure_domains: failureDomains.size
  };
  const satisfied = availability.eligible_replicas >= availability.required_replicas &&
    availability.eligible_failure_domains >= availability.required_failure_domains;

  const evaluatedMs = parseTime(now, 'now');
  const expiresMs = Math.min(
    parseTime(verifiedRequest.expires_at, 'request.expires_at'),
    parseTime(verifiedPolicy.expires_at, 'policy.expires_at'),
    evaluatedMs + verifiedPolicy.maximum_plan_lifetime_ms
  );
  if (expiresMs <= evaluatedMs) throw new ValidationError('placement plan would have no valid lifetime');

  const plan = {
    schema: 'axiom-state-placement-plan.v1',
    version: 1,
    status: 'inert-contract-laboratory',
    plan_id: `placement-plan:${verifiedRequest.request_id}`,
    request_id: verifiedRequest.request_id,
    request_digest: verifiedRequest.request_digest,
    policy_id: verifiedPolicy.policy_id,
    policy_digest: verifiedPolicy.policy_digest,
    evaluated_at: new Date(evaluatedMs).toISOString(),
    expires_at: new Date(expiresMs).toISOString(),
    satisfied,
    eligible_destinations: eligible,
    ineligible_destinations: ineligible,
    availability_result: availability,
    authority_effect: 'none',
    network_effect: 'none',
    provider_effect: 'none',
    canonical_state_effect: 'none'
  };
  plan.plan_digest = contractDigest(plan, 'plan_digest');
  return verifyStatePlacementPlan(plan);
}

function evaluateDestination({ request, policy, destination }) {
  const reasons = new Set();
  if (!policy.allowed_destination_classes.includes(destination.destination_class)) reasons.add('destination-class-disallowed-by-policy');
  if (policy.forbidden_destination_ids.includes(destination.destination_id)) reasons.add('destination-id-forbidden-by-policy');
  if (!policy.managed_destinations_allowed && destination.managed_provider) reasons.add('managed-destination-disallowed-by-policy');
  if (!request.permitted_destination_classes.includes(destination.destination_class)) reasons.add('destination-class-not-permitted-by-request');
  if (request.forbidden_destination_classes.includes(destination.destination_class)) reasons.add('destination-class-forbidden-by-request');
  if (!destination.allowed_operations.includes(request.operation_class)) reasons.add('operation-unsupported');
  if (!destination.allowed_purposes.includes(request.purpose)) reasons.add('purpose-unsupported');
  if (!destination.allowed_data_classes.includes(request.data_class)) reasons.add('data-class-unsupported');
  if (CONFIDENTIALITY_RANK[destination.maximum_confidentiality] < CONFIDENTIALITY_RANK[request.confidentiality_requirement]) reasons.add('confidentiality-insufficient');
  if (!destination.disclosure_modes.includes(request.disclosure_ceiling)) reasons.add('disclosure-mode-unsupported');
  if (!destination.regions.some((region) => request.residency.allowed_regions.includes(region))) reasons.add('residency-region-mismatch');
  const requiredResidencyEvidence = Math.max(
    RESIDENCY_EVIDENCE_RANK[request.residency.minimum_evidence_level],
    RESIDENCY_EVIDENCE_RANK[policy.minimum_residency_evidence_level]
  );
  if (RESIDENCY_EVIDENCE_RANK[destination.residency_evidence_level] < requiredResidencyEvidence) reasons.add('residency-evidence-insufficient');
  if (destination.retention_days.minimum > request.retention.minimum_days || destination.retention_days.maximum < request.retention.maximum_days) reasons.add('retention-window-unsupported');
  if (destination.maximum_lag_ms > request.maximum_lag_ms) reasons.add('freshness-unsupported');
  if (!destination.consistency_classes.includes(request.consistency_class)) reasons.add('consistency-unsupported');
  if (!destination.encryption_profiles.includes(request.encryption_profile)) reasons.add('encryption-profile-unsupported');
  if (!destination.recovery_importance_supported.includes(request.recovery_importance)) reasons.add('recovery-importance-unsupported');
  if (destination.cost_units > request.cost_ceiling_units) reasons.add('cost-ceiling-exceeded');
  return [...reasons].sort();
}

function rejectDuplicateDestinationIdentity(destinations) {
  const ids = new Set();
  const digests = new Map();
  for (const destination of destinations) {
    if (ids.has(destination.destination_id)) throw new ValidationError(`duplicate destination_id ${destination.destination_id}`);
    ids.add(destination.destination_id);
    const priorId = digests.get(destination.profile_digest);
    if (priorId && priorId !== destination.destination_id) {
      throw new ValidationError(`duplicate profile_digest used by ${priorId} and ${destination.destination_id}`);
    }
    digests.set(destination.profile_digest, destination.destination_id);
  }
}

function parseTime(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  return parsed.getTime();
}
