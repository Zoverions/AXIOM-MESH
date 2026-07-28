import { readFile } from 'node:fs/promises';
import { digestObject, ValidationError } from './canonical.mjs';

const RISK_ORDER = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });
const PROTECTED_RECOVERY_ACTIONS = new Set([
  'approval.grant',
  'governance.rollback',
  'governance.emergency.review',
  'governance.appeal',
  'export.create'
]);

export async function loadPolicy(path) {
  const policy = JSON.parse(await readFile(path, 'utf8'));
  validatePolicy(policy);
  return new PolicyEngine(policy);
}

export async function loadPolicyStack(paths) {
  if (!Array.isArray(paths) || !paths.length) {
    throw new ValidationError('At least one policy path is required');
  }
  const layers = await Promise.all(paths.map(async path => {
    const policy = JSON.parse(await readFile(path, 'utf8'));
    validatePolicy(policy);
    return policy;
  }));
  return new PolicyEngine(mergeDenyDominantPolicy(layers), {
    layers: layers.map((layer, index) => ({
      order: index,
      version: layer.version,
      digest: digestObject(layer)
    }))
  });
}

export function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || typeof policy.version !== 'string') {
    throw new ValidationError('Policy must include a version');
  }
  if (!policy.actions || typeof policy.actions !== 'object') {
    throw new ValidationError('Policy must include actions');
  }
  for (const [action, rule] of Object.entries(policy.actions)) {
    if (!/^[a-z][a-z0-9.-]{1,127}$/.test(action)) throw new ValidationError(`Invalid policy action: ${action}`);
    if (!['allow', 'deny'].includes(rule.decision)) throw new ValidationError(`Invalid decision for ${action}`);
    if (!(rule.risk in RISK_ORDER)) throw new ValidationError(`Invalid risk for ${action}`);
    if (
      rule.http_status !== undefined
      && (!Number.isSafeInteger(rule.http_status) || rule.http_status < 400 || rule.http_status > 599)
    ) {
      throw new ValidationError(`Invalid HTTP status for ${action}`);
    }
    if (
      rule.required_confirmation_values !== undefined
      && (!Array.isArray(rule.required_confirmation_values)
        || rule.required_confirmation_values.some(value => typeof value !== 'string' || value.length > 160))
    ) {
      throw new ValidationError(`Invalid confirmation values for ${action}`);
    }
    if (
      rule.requires_independent_approval !== undefined
      && typeof rule.requires_independent_approval !== 'boolean'
    ) {
      throw new ValidationError(`Invalid independent approval requirement for ${action}`);
    }
    if (
      rule.timeout_ms !== undefined
      && (!Number.isSafeInteger(rule.timeout_ms) || rule.timeout_ms < 1 || rule.timeout_ms > 300_000)
    ) {
      throw new ValidationError(`Invalid timeout for ${action}`);
    }
    if (
      rule.decision === 'allow'
      && RISK_ORDER[rule.risk] >= RISK_ORDER.high
      && rule.requires_independent_approval !== true
    ) {
      throw new ValidationError(`High-risk action ${action} must require independent approval`);
    }
  }
}

export function validateAuthorityReducingPolicy(policy) {
  validatePolicy(policy);
  const rules = Object.values(policy.actions);
  if (!rules.length || rules.some(rule => rule.decision !== 'deny')) {
    throw new ValidationError('Authority-reducing policy overlays may contain deny rules only');
  }
  const blockedRecovery = Object.keys(policy.actions).filter(action => PROTECTED_RECOVERY_ACTIONS.has(action));
  if (blockedRecovery.length) {
    throw new ValidationError(`Policy overlays cannot block recovery action: ${blockedRecovery.join(', ')}`);
  }
  return policy;
}

function hasScope(scopes, required) {
  return scopes.includes('*') || scopes.includes(required);
}

export class PolicyEngine {
  constructor(policy, { layers } = {}) {
    this.policy = structuredClone(policy);
    this.digest = digestObject(policy);
    this.layers = structuredClone(layers ?? [{
      order: 0,
      version: policy.version,
      digest: this.digest
    }]);
  }

  evaluate({ action, principal, intent }) {
    const rule = this.policy.actions[action];
    if (!rule) {
      return {
        allow: false,
        risk: 'critical',
        code: 'unknown_action',
        reason: 'The action is not present in the active policy.',
        policy_version: this.policy.version,
        policy_digest: this.digest,
        policy_layers: this.layers
      };
    }
    const requiredScopes = rule.required_scopes ?? [];
    const principalScopes = principal.scopes ?? [];
    const missingScopes = requiredScopes.filter(scope => !hasScope(principalScopes, scope));
    if (missingScopes.length) {
      return {
        allow: false,
        risk: rule.risk,
        code: 'insufficient_scope',
        reason: `Missing required scopes: ${missingScopes.join(', ')}`,
        missing_scopes: missingScopes,
        policy_version: this.policy.version,
        policy_digest: this.digest,
        policy_layers: this.layers
      };
    }
    if (rule.decision !== 'allow') {
      return {
        allow: false,
        risk: rule.risk,
        code: rule.code ?? 'policy_denied',
        http_status: rule.http_status,
        reason: rule.reason ?? 'The active policy denies this action.',
        policy_version: this.policy.version,
        policy_digest: this.digest,
        policy_layers: this.layers
      };
    }
    const requiredConfirmations = Number(rule.required_confirmations ?? 0);
    const confirmations = Array.isArray(intent.confirmations)
      ? [...new Set(intent.confirmations.filter(value => typeof value === 'string'))]
      : [];
    const requiredValues = rule.required_confirmation_values ?? [];
    const missingValues = requiredValues.filter(value => !confirmations.includes(value));
    if (confirmations.length < requiredConfirmations || missingValues.length) {
      return {
        allow: false,
        pending: true,
        risk: rule.risk,
        code: 'confirmation_required',
        reason: `This action requires ${requiredConfirmations} explicit confirmation(s).`,
        required_confirmations: requiredConfirmations,
        required_confirmation_values: structuredClone(requiredValues),
        policy_version: this.policy.version,
        policy_digest: this.digest,
        policy_layers: this.layers
      };
    }
    return {
      allow: true,
      risk: rule.risk,
      tool: rule.tool,
      constraints: structuredClone(rule.constraints ?? {}),
      effect: rule.effect ?? action,
      timeout_ms: rule.timeout_ms ?? 10_000,
      requires_independent_approval: rule.requires_independent_approval === true,
      rule_id: `policy:${action}`,
      policy_version: this.policy.version,
      policy_digest: this.digest,
      policy_layers: this.layers
    };
  }
}

export function mergeDenyDominantPolicy(layers) {
  const valid = layers.filter(Boolean);
  if (!valid.length) throw new ValidationError('At least one policy layer is required');
  valid.forEach(validatePolicy);
  const result = structuredClone(valid[0]);
  const versions = [valid[0].version];
  for (const layer of valid.slice(1)) {
    versions.push(layer.version);
    for (const [action, incoming] of Object.entries(layer.actions ?? {})) {
      const current = result.actions[action];
      if (!current) {
        if (incoming.decision === 'deny') result.actions[action] = structuredClone(incoming);
        continue;
      }
      if (current.decision === 'deny' || incoming.decision === 'deny') {
        result.actions[action] = {
          ...current,
          ...incoming,
          decision: 'deny',
          risk: RISK_ORDER[current.risk] >= RISK_ORDER[incoming.risk] ? current.risk : incoming.risk
        };
        continue;
      }
      if (current.tool !== incoming.tool && incoming.tool !== undefined) {
        throw new ValidationError(`Policy layer cannot replace the tool for ${action}`);
      }
      const currentScopes = current.required_scopes ?? [];
      const incomingScopes = incoming.required_scopes ?? [];
      const currentValues = current.required_confirmation_values ?? [];
      const incomingValues = incoming.required_confirmation_values ?? [];
      result.actions[action] = {
        ...current,
        ...incoming,
        decision: 'allow',
        risk: RISK_ORDER[current.risk] >= RISK_ORDER[incoming.risk] ? current.risk : incoming.risk,
        required_scopes: [...new Set([...currentScopes, ...incomingScopes])].sort(),
        required_confirmations: Math.max(
          Number(current.required_confirmations ?? 0),
          Number(incoming.required_confirmations ?? 0)
        ),
        required_confirmation_values: [...new Set([...currentValues, ...incomingValues])].sort(),
        requires_independent_approval:
          current.requires_independent_approval === true || incoming.requires_independent_approval === true,
        timeout_ms: Math.min(
          Number(current.timeout_ms ?? 10_000),
          Number(incoming.timeout_ms ?? 10_000)
        ),
        constraints: mergeConstraints(current.constraints ?? {}, incoming.constraints ?? {}, action)
      };
    }
  }
  result.version = versions.join('+');
  return result;
}

function mergeConstraints(current, incoming, action) {
  const result = structuredClone(current);
  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in result)) {
      result[key] = structuredClone(value);
      continue;
    }
    const existing = result[key];
    if (typeof existing === 'boolean' && typeof value === 'boolean') {
      result[key] = existing && value;
    } else if (Number.isFinite(existing) && Number.isFinite(value)) {
      result[key] = Math.min(existing, value);
    } else if (Array.isArray(existing) && Array.isArray(value)) {
      const allowed = new Set(value.map(item => JSON.stringify(item)));
      result[key] = existing.filter(item => allowed.has(JSON.stringify(item)));
    } else if (digestObject(existing) !== digestObject(value)) {
      throw new ValidationError(`Policy constraints conflict for ${action}.${key}`);
    }
  }
  return result;
}
