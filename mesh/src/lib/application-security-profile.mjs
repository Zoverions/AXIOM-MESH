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

function exactObject(value, name, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}
