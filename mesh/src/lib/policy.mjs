import { readFile } from 'node:fs/promises';
import { digestObject, ValidationError } from './canonical.mjs';
import {
  ASSURANCE_TIER_IDS,
  getAssuranceTier
} from './assurance-tiers.mjs';

const RISK_ORDER = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });
const DEFAULT_ASSURANCE_BY_RISK = Object.freeze({
  low: 'A1',
  medium: 'A2',
  high: 'A3',
  critical: 'A3'
});
const CURRENT_RUNTIME_BASE_ASSURANCE = 'A2';
const CURRENT_RUNTIME_APPROVED_ASSURANCE = 'A3';
const CURRENT_RUNTIME_MAX_ASSURANCE = 'A3';
const PROTOTYPE_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));
const BASE_POLICY_OBJECTS = new WeakSet();
const MERGED_POLICY_METADATA = new WeakMap();
const PROTECTED_RECOVERY_ACTIONS = new Set([
  'approval.grant',
  'governance.rollback',
  'governance.emergency.review',
  'governance.appeal',
  'export.create'
]);
const ALLOW_RULE_FIELDS = new Set([
  'decision',
  'risk',
  'required_scopes',
  'required_confirmations',
  'required_confirmation_values',
  'requires_independent_approval',
  'required_assurance',
  'timeout_ms',
  'constraints',
  'tool',
  'effect'
]);
const DENY_RULE_FIELDS = new Set([
  ...ALLOW_RULE_FIELDS,
  'code',
  'http_status',
  'reason'
]);

function assuranceRank(tier) {
  return getAssuranceTier(tier).rank;
}

function requiredAssurance(rule) {
  return rule.required_assurance ?? DEFAULT_ASSURANCE_BY_RISK[rule.risk];
}

function maxAssurance(left, right) {
  return assuranceRank(left) >= assuranceRank(right) ? left : right;
}

export async function loadPolicy(path) {
  const policy = JSON.parse(await readFile(path, 'utf8'));
  validatePolicy(policy);
  const engine = new PolicyEngine(policy);
  BASE_POLICY_OBJECTS.add(engine.policy);
  return engine;
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
  const engine = new PolicyEngine(mergeDenyDominantPolicy(layers), {
    layers: layers.map((layer, index) => ({
      order: index,
      version: layer.version,
      digest: digestObject(layer)
    }))
  });
  BASE_POLICY_OBJECTS.add(engine.policy);
  return engine;
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
    if (PROTOTYPE_KEYS.has(action)) {
      throw new ValidationError(`Policy action uses a reserved prototype identifier: ${action}`);
    }
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new ValidationError(`Invalid policy rule for ${action}`);
    }
    if (!['allow', 'deny'].includes(rule.decision)) throw new ValidationError(`Invalid decision for ${action}`);
    if (!Object.hasOwn(RISK_ORDER, rule.risk)) throw new ValidationError(`Invalid risk for ${action}`);
    if (
      rule.required_assurance !== undefined
      && !ASSURANCE_TIER_IDS.includes(rule.required_assurance)
    ) {
      throw new ValidationError(`Invalid required assurance for ${action}`);
    }
    if (
      rule.http_status !== undefined
      && (!Number.isSafeInteger(rule.http_status) || rule.http_status < 400 || rule.http_status > 599)
    ) {
      throw new ValidationError(`Invalid HTTP status for ${action}`);
    }
    if (
      rule.required_confirmations !== undefined
      && (!Number.isSafeInteger(rule.required_confirmations)
        || rule.required_confirmations < 0
        || rule.required_confirmations > 16)
    ) {
      throw new ValidationError(`Invalid required confirmations for ${action}`);
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

export function createOverlayPolicyResolver(basePolicy) {
  if (!(basePolicy instanceof PolicyEngine)) {
    throw new ValidationError('Overlay policy resolver requires a validated base PolicyEngine');
  }
  let cachedKey = null;
  let cachedPolicy = null;

  return overlays => {
    if (!Array.isArray(overlays)) {
      throw new ValidationError('Policy overlays must be an array');
    }
    if (!overlays.length) return basePolicy;

    const measured = overlays.map((overlay, index) => {
      if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) {
        throw new ValidationError(`Policy overlay ${index} is invalid`);
      }
      const policy = validateAuthorityReducingPolicy(overlay.policy_json);
      const digest = digestObject(policy);
      if (overlay.policy_digest !== undefined && overlay.policy_digest !== digest) {
        throw new ValidationError(`Policy overlay ${index} digest does not match measured policy bytes`);
      }
      return {
        policy,
        layer: {
          order: basePolicy.layers.length + index,
          version: policy.version,
          digest
        }
      };
    });

    const key = digestObject(measured.map(item => item.layer));
    if (cachedPolicy && cachedKey === key) return cachedPolicy;

    const merged = mergeDenyDominantPolicy([
      basePolicy.policy,
      ...measured.map(item => item.policy)
    ]);
    cachedPolicy = new PolicyEngine(merged, {
      layers: [
        ...basePolicy.layers,
        ...measured.map(item => item.layer)
      ]
    });
    cachedKey = key;
    return cachedPolicy;
  };
}

function hasScope(scopes, required) {
  return scopes.includes('*') || scopes.includes(required);
}

export class PolicyEngine {
  constructor(policy, { layers } = {}) {
    const metadata = MERGED_POLICY_METADATA.get(policy);
    this.policy = structuredClone(policy);
    this.digest = digestObject(policy);
    this.layers = normalizeMeasuredLayers(
      layers ?? [{
        order: 0,
        version: policy.version,
        digest: this.digest
      }],
      metadata
    );
  }

  evaluate({ action, principal, intent }) {
    const rule = Object.hasOwn(this.policy.actions, action)
      ? this.policy.actions[action]
      : null;
    if (!rule) {
      return {
        allow: false,
        risk: 'critical',
        required_assurance: DEFAULT_ASSURANCE_BY_RISK.critical,
        code: 'unknown_action',
        reason: 'The action is not present in the active policy.',
        policy_version: this.policy.version,
        policy_digest: this.digest,
        policy_layers: this.layers
      };
    }
    const assurance = requiredAssurance(rule);
    if (rule.decision !== 'allow') {
      return {
        allow: false,
        risk: rule.risk,
        required_assurance: assurance,
        code: rule.code ?? 'policy_denied',
        http_status: rule.http_status,
        reason: rule.reason ?? 'The active policy denies this action.',
        policy_version: this.policy.version,
        policy_digest: this.digest,
        policy_layers: this.layers
      };
    }
    if (assuranceRank(assurance) > assuranceRank(CURRENT_RUNTIME_MAX_ASSURANCE)) {
      return {
        allow: false,
        risk: rule.risk,
        required_assurance: assurance,
        runtime_max_assurance: CURRENT_RUNTIME_MAX_ASSURANCE,
        code: 'assurance_unavailable',
        http_status: 503,
        reason: `The current kernel cannot satisfy required assurance ${assurance}; maximum available assurance is ${CURRENT_RUNTIME_MAX_ASSURANCE}.`,
        policy_version: this.policy.version,
        policy_digest: this.digest,
        policy_layers: this.layers
      };
    }
    if (
      assuranceRank(assurance) > assuranceRank(CURRENT_RUNTIME_BASE_ASSURANCE)
      && rule.requires_independent_approval !== true
    ) {
      return {
        allow: false,
        risk: rule.risk,
        required_assurance: assurance,
        runtime_max_assurance: CURRENT_RUNTIME_MAX_ASSURANCE,
        code: 'assurance_path_unavailable',
        http_status: 503,
        reason: `Required assurance ${assurance} needs the current independent-approval path; this rule does not require it.`,
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
        required_assurance: assurance,
        code: 'insufficient_scope',
        reason: `Missing required scopes: ${missingScopes.join(', ')}`,
        missing_scopes: missingScopes,
        policy_version: this.policy.version,
        policy_digest: this.digest,
        policy_layers: this.layers
      };
    }
    const requiredConfirmations = rule.required_confirmations ?? 0;
    if (
      !Number.isSafeInteger(requiredConfirmations)
      || requiredConfirmations < 0
      || requiredConfirmations > 16
    ) {
      throw new ValidationError(`Invalid required confirmations for ${action}`);
    }
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
        required_assurance: assurance,
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
      required_assurance: assurance,
      achievable_assurance: rule.requires_independent_approval === true
        ? CURRENT_RUNTIME_APPROVED_ASSURANCE
        : CURRENT_RUNTIME_BASE_ASSURANCE,
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
  const overlayMode = BASE_POLICY_OBJECTS.has(valid[0]);
  if (overlayMode) valid.slice(1).forEach(validateAuthorityReducingPolicy);
  const result = structuredClone(valid[0]);
  const versions = [valid[0].version];
  for (const layer of valid.slice(1)) {
    versions.push(layer.version);
    for (const [action, incoming] of Object.entries(layer.actions ?? {})) {
      assertMergeRuleFields(incoming, action);
      const current = Object.hasOwn(result.actions, action)
        ? result.actions[action]
        : null;
      if (!current) {
        if (incoming.decision === 'deny') result.actions[action] = structuredClone(incoming);
        continue;
      }
      if (current.decision === 'deny' || incoming.decision === 'deny') {
        result.actions[action] = {
          ...current,
          ...incoming,
          decision: 'deny',
          risk: RISK_ORDER[current.risk] >= RISK_ORDER[incoming.risk] ? current.risk : incoming.risk,
          required_assurance: maxAssurance(requiredAssurance(current), requiredAssurance(incoming))
        };
        continue;
      }
      if (current.tool !== incoming.tool && incoming.tool !== undefined) {
        throw new ValidationError(`Policy layer cannot replace the tool for ${action}`);
      }
      if (current.effect !== incoming.effect && incoming.effect !== undefined) {
        throw new ValidationError(`Policy layer cannot replace the effect for ${action}`);
      }
      const currentScopes = current.required_scopes ?? [];
      const incomingScopes = incoming.required_scopes ?? [];
      const currentValues = current.required_confirmation_values ?? [];
      const incomingValues = incoming.required_confirmation_values ?? [];
      result.actions[action] = {
        ...current,
        decision: 'allow',
        risk: RISK_ORDER[current.risk] >= RISK_ORDER[incoming.risk] ? current.risk : incoming.risk,
        required_scopes: [...new Set([...currentScopes, ...incomingScopes])].sort(),
        required_confirmations: Math.max(
          current.required_confirmations ?? 0,
          incoming.required_confirmations ?? 0
        ),
        required_confirmation_values: [...new Set([...currentValues, ...incomingValues])].sort(),
        requires_independent_approval:
          current.requires_independent_approval === true || incoming.requires_independent_approval === true,
        required_assurance: maxAssurance(requiredAssurance(current), requiredAssurance(incoming)),
        timeout_ms: Math.min(
          Number(current.timeout_ms ?? 10_000),
          Number(incoming.timeout_ms ?? 10_000)
        ),
        constraints: mergeConstraints(current.constraints ?? {}, incoming.constraints ?? {}, action)
      };
      if (result.actions[action].tool === undefined && incoming.tool !== undefined) {
        result.actions[action].tool = incoming.tool;
      }
      if (result.actions[action].effect === undefined && incoming.effect !== undefined) {
        result.actions[action].effect = incoming.effect;
      }
    }
  }
  result.version = versions.join('+');
  validatePolicy(result);
  MERGED_POLICY_METADATA.set(result, {
    overlayMode,
    measuredLayers: valid.map(layer => ({
      version: layer.version,
      digest: digestObject(layer)
    }))
  });
  return result;
}

function normalizeMeasuredLayers(layers, metadata) {
  const output = structuredClone(layers);
  if (!metadata) return output;
  const measured = metadata.measuredLayers;
  if (!metadata.overlayMode) {
    if (output.length !== measured.length) {
      throw new ValidationError('Policy layer evidence does not match the measured merge inputs');
    }
    for (let index = 0; index < measured.length; index += 1) {
      assertMeasuredLayer(output[index], measured[index], index);
      output[index].version = measured[index].version;
      output[index].digest = measured[index].digest;
    }
    return output;
  }

  const overlayCount = measured.length - 1;
  if (output.length < overlayCount + 1) {
    throw new ValidationError('Policy overlay evidence is incomplete');
  }
  for (let index = 0; index < overlayCount; index += 1) {
    const outputIndex = output.length - overlayCount + index;
    const measuredLayer = measured[index + 1];
    assertMeasuredLayer(output[outputIndex], measuredLayer, outputIndex);
    output[outputIndex].version = measuredLayer.version;
    output[outputIndex].digest = measuredLayer.digest;
  }
  return output;
}

function assertMeasuredLayer(supplied, measured, index) {
  if (!supplied || supplied.version !== measured.version || supplied.digest !== measured.digest) {
    throw new ValidationError(`Policy layer ${index} evidence does not match measured policy bytes`);
  }
}

function assertMergeRuleFields(rule, action) {
  const allowed = rule.decision === 'deny' ? DENY_RULE_FIELDS : ALLOW_RULE_FIELDS;
  const unsupportedFields = Object.keys(rule).filter(field => !allowed.has(field));
  if (unsupportedFields.length) {
    throw new ValidationError(
      `Policy layer contains unsupported ${rule.decision} fields for ${action}: ${unsupportedFields.join(', ')}`
    );
  }
}

function mergeConstraints(current, incoming, action) {
  const result = structuredClone(current);
  for (const [key, value] of Object.entries(incoming)) {
    if (!Object.hasOwn(result, key)) {
      result[key] = structuredClone(value);
      continue;
    }
    const existing = result[key];
    if (typeof existing === 'boolean' && typeof value === 'boolean') {
      result[key] = existing && value;
    } else if (Number.isFinite(existing) && Number.isFinite(value)) {
      if (/^(?:max_|maximum_)/.test(key) || /_(?:max|maximum)$/.test(key)) {
        result[key] = Math.min(existing, value);
      } else if (/^(?:min_|minimum_)/.test(key) || /_(?:min|minimum)$/.test(key)) {
        result[key] = Math.max(existing, value);
      } else {
        throw new ValidationError(
          `Numeric policy constraint direction is undeclared for ${action}.${key}`
        );
      }
    } else if (Array.isArray(existing) && Array.isArray(value)) {
      const allowed = new Set(value.map(item => JSON.stringify(item)));
      result[key] = existing.filter(item => allowed.has(JSON.stringify(item)));
    } else if (digestObject(existing) !== digestObject(value)) {
      throw new ValidationError(`Policy constraints conflict for ${action}.${key}`);
    }
  }
  return result;
}
