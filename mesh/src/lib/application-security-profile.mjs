import baseline from '../../config/application-security-baseline.json' with { type: 'json' };
import { canonicalJson, ValidationError } from './canonical.mjs';

const CONTROL_STATES = Object.freeze(['enforced', 'inherited', 'not-applicable']);
const ADAPTERS = Object.freeze([
  'hosted_web',
  'relational_database',
  'reusable_session',
  'password_store',
  'file_upload'
]);
const UNIVERSAL_CONTROLS = Object.freeze([
  'secret_non_disclosure',
  'server_authentication',
  'server_authorization',
  'record_access',
  'field_integrity',
  'input_validation',
  'output_encoding',
  'response_minimization',
  'security_headers',
  'transport_policy',
  'request_bounding',
  'security_event_redaction',
  'dependency_integrity'
]);

export const ACTIVE_APPLICATION_SECURITY_BASELINE = Object.freeze(baseline);

export function validateApplicationSecurityBaseline(value) {
  exactObject(value, 'application security baseline', [
    'schema',
    'version',
    'browser_trust',
    'unknown_state',
    'control_states',
    'adapters',
    'universal_controls'
  ]);
  if (
    value.schema !== 'axiom-application-security-baseline.v1'
    || value.version !== 1
    || value.browser_trust !== 'untrusted'
    || value.unknown_state !== 'deny'
    || canonicalJson(value.control_states) !== canonicalJson(CONTROL_STATES)
    || canonicalJson(value.adapters) !== canonicalJson(ADAPTERS)
    || canonicalJson(value.universal_controls) !== canonicalJson(UNIVERSAL_CONTROLS)
  ) throw new ValidationError('Application security baseline is weakened');
  return true;
}

export function validateApplicationSecurityProfile(
  profile,
  active = ACTIVE_APPLICATION_SECURITY_BASELINE
) {
  validateApplicationSecurityBaseline(active);
  exactObject(profile, 'application security profile', [
    'schema',
    'version',
    'application_id',
    'status',
    'exposure',
    'browser_untrusted',
    'adapters',
    'controls',
    'evidence'
  ]);

  if (
    profile.schema !== 'axiom-application-security-profile.v1'
    || profile.version !== 1
    || typeof profile.application_id !== 'string'
    || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(profile.application_id)
    || !['active', 'experimental'].includes(profile.status)
    || !['loopback-only', 'internet'].includes(profile.exposure)
    || profile.browser_untrusted !== true
  ) throw new ValidationError('Application security profile identity is invalid');

  exactObject(profile.adapters, 'application security adapters', ADAPTERS);
  for (const adapter of ADAPTERS) {
    if (typeof profile.adapters[adapter] !== 'boolean') {
      throw new ValidationError(`Application security adapter flag is invalid: ${adapter}`);
    }
  }

  exactObject(profile.controls, 'application security controls', UNIVERSAL_CONTROLS);
  for (const control of UNIVERSAL_CONTROLS) {
    if (!CONTROL_STATES.includes(profile.controls[control])) {
      throw new ValidationError(`Application security control state is invalid: ${control}`);
    }
  }

  if (!Array.isArray(profile.evidence) || profile.evidence.length === 0) {
    throw new ValidationError('Application security evidence is required');
  }

  if (profile.exposure === 'internet' && profile.adapters.hosted_web !== true) {
    throw new ValidationError('Internet exposure requires the hosted_web adapter');
  }

  return true;
}

function exactObject(value, name, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}
