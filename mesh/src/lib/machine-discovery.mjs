import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';
import { effectDestinationForTool } from './effect-destination.mjs';
import { machinePrincipalAuthorityFacts } from './machine-principal.mjs';

export const MACHINE_DISCOVERY_SCHEMA = 'axiom-machine-discovery.v1';
export const MACHINE_DISCOVERY_NOTICE = 'discovery_is_not_authorization';

export function buildMachineDiscovery({ principal, policy, kernelVersion }) {
  if (principal?.schema !== 'axiom-machine-principal.v1') {
    throw new ValidationError('Machine discovery requires a constrained machine principal');
  }
  if (!policy?.policy || typeof policy.evaluate !== 'function') {
    throw new ValidationError('Machine discovery requires an active policy engine');
  }
  if (typeof kernelVersion !== 'string' || !kernelVersion.length) {
    throw new ValidationError('Machine discovery requires a kernel version');
  }

  const machine = machinePrincipalAuthorityFacts(principal);
  const constraints = principal.constraints;
  const actions = [];

  for (const action of constraints.actions) {
    const rule = policy.policy.actions?.[action];
    if (!rule || rule.decision !== 'allow') continue;
    const requiredScopes = [...new Set(rule.required_scopes ?? [])].sort();
    if (requiredScopes.some(scope => !principal.scopes.includes(scope))) continue;

    let effectDestination;
    try {
      effectDestination = effectDestinationForTool(rule.tool);
    } catch {
      continue;
    }
    if (!constraints.destinations.includes(effectDestination)) continue;

    actions.push({
      id: action,
      risk: rule.risk,
      effect_destination: effectDestination,
      required_confirmations: Number(rule.required_confirmations ?? 0),
      required_confirmation_values: [...new Set(rule.required_confirmation_values ?? [])].sort(),
      requires_independent_approval: rule.requires_independent_approval === true,
      timeout_ms: Math.min(
        Number(rule.timeout_ms ?? 10_000),
        constraints.budgets.max_execution_ms
      )
    });
  }

  actions.sort((left, right) => left.id.localeCompare(right.id));
  const document = {
    schema: MACHINE_DISCOVERY_SCHEMA,
    kernel_version: kernelVersion,
    notice: MACHINE_DISCOVERY_NOTICE,
    principal: {
      id: machine.principal_id,
      type: machine.principal_type,
      sponsor: machine.sponsor,
      runtime_id: machine.runtime_id,
      runtime_kind: machine.runtime_kind,
      authority_digest: machine.authority_digest
    },
    policy: {
      version: policy.policy.version,
      digest: policy.digest
    },
    purposes: [...constraints.purposes],
    destinations: [...constraints.destinations],
    limits: {
      max_requests_per_minute: constraints.budgets.max_requests_per_minute,
      max_concurrent_requests: constraints.budgets.max_concurrent_requests,
      max_execution_ms: constraints.budgets.max_execution_ms,
      max_request_bytes: constraints.budgets.max_request_bytes,
      max_response_bytes: constraints.budgets.max_response_bytes,
      delegation_allowed: false,
      max_delegation_depth: 0
    },
    actions
  };
  return {
    ...document,
    digest: digestObject(document)
  };
}

export function validateMachineDiscovery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Machine discovery document must be an object');
  }
  if (value.schema !== MACHINE_DISCOVERY_SCHEMA) {
    throw new ValidationError('Machine discovery schema is invalid');
  }
  if (value.notice !== MACHINE_DISCOVERY_NOTICE) {
    throw new ValidationError('Machine discovery notice is invalid');
  }
  const { digest, ...document } = value;
  if (digestObject(document) !== digest) {
    throw new ValidationError('Machine discovery digest is invalid');
  }
  if (!Array.isArray(value.actions)) {
    throw new ValidationError('Machine discovery actions must be an array');
  }
  const ids = value.actions.map(action => action.id);
  if (canonicalJson(ids) !== canonicalJson([...ids].sort())) {
    throw new ValidationError('Machine discovery actions are not canonical');
  }
  return value;
}
