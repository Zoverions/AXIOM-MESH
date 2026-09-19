import { ValidationError } from './canonical.mjs';
import { validateTaskArtifactHandoff } from './runtime-connector-fabric-contracts.mjs';

export const GOOGLE_MANAGED_AGENT_CATALOG_ENTRY =
  'runtime:google-antigravity-managed:preview-09-2026';
export const GOOGLE_MANAGED_AGENT_ID = 'antigravity-preview-09-2026';
export const GOOGLE_MANAGED_AGENT_MODEL = 'gemini-3.8-flash';
export const GOOGLE_MANAGED_AGENT_OPERATION = 'managed-agent.execute';
export const GOOGLE_MANAGED_AGENT_AXIOM_ACTION = 'runtime.managed-agent.execute';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DOMAIN_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function requireString(value, label, max = 4096) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${label} is invalid`);
  }
}

function requireId(value, label) {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
}

function normalizeDomain(value) {
  requireString(value, 'Google managed-agent domain', 253);
  const domain = value.toLowerCase();
  if (
    domain.includes('*')
    || domain.includes('://')
    || domain.includes('/')
    || domain.includes(':')
    || !DOMAIN_RE.test(domain)
  ) {
    throw new ValidationError(
      'Google managed-agent egress destinations must be exact hostnames without wildcards, schemes, ports, or paths'
    );
  }
  return domain;
}

function exactDomainList(values) {
  if (!Array.isArray(values)) {
    throw new ValidationError('Google managed-agent allowedDomains must be an array');
  }
  const normalized = values.map(normalizeDomain);
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError('Google managed-agent allowedDomains contains duplicates');
  }
  return normalized;
}

function rejectCredentialBindings(bindings) {
  if (!Array.isArray(bindings)) {
    throw new ValidationError('Google managed-agent credentialBindings must be an array');
  }
  if (bindings.length > 0) {
    throw new ValidationError(
      'Google managed-agent provider credential brokerage is disabled until credential handles are bound to a verified AXIOM runtime-adapter grant'
    );
  }
}


function validateAuthorizedHandoff(handoff, allowedDomains) {
  validateTaskArtifactHandoff(handoff);
  if (
    handoff.execution_target.integration_id !== GOOGLE_MANAGED_AGENT_CATALOG_ENTRY
    || handoff.execution_target.catalog_entry_id !== GOOGLE_MANAGED_AGENT_CATALOG_ENTRY
    || handoff.execution_target.catalog_entry_version !== '0.1.0'
    || handoff.execution_target.integration_class !== 'agent-runtime'
  ) {
    throw new ValidationError(
      'Google managed-agent handoff is not pinned to the candidate catalog entry'
    );
  }
  if (
    handoff.request.runtime_operation !== GOOGLE_MANAGED_AGENT_OPERATION
    || handoff.request.axiom_action !== GOOGLE_MANAGED_AGENT_AXIOM_ACTION
  ) {
    throw new ValidationError(
      'Google managed-agent handoff operation mapping is invalid'
    );
  }
  if (!handoff.authority.grant_id || !handoff.authority.grant_digest) {
    throw new ValidationError(
      'Google managed-agent remote execution requires an explicit AXIOM grant'
    );
  }
  if (!['queued', 'running'].includes(handoff.lifecycle.state)) {
    throw new ValidationError(
      'Google managed-agent interaction can be built only for queued or running work'
    );
  }
  const requestedDestinations = [...handoff.request.destinations]
    .map(normalizeDomain)
    .sort();
  const configuredDestinations = [...allowedDomains].sort();
  if (
    requestedDestinations.length !== configuredDestinations.length
    || requestedDestinations.some(
      (destination, index) => destination !== configuredDestinations[index]
    )
  ) {
    throw new ValidationError(
      'Google managed-agent egress must exactly match the authorized handoff destinations'
    );
  }
}

function optionalProviderLocator(value, label) {
  if (value === undefined || value === null) return null;
  requireString(value, label, 1024);
  return value;
}

/**
 * Build a Google Interactions API request without performing network I/O.
 *
 * This candidate deliberately does not accept arbitrary Google environment
 * objects. That prevents an adapter caller from smuggling inline headers,
 * plaintext secrets, wildcard egress, or an omitted network policy through the
 * builder.
 */
export function buildGoogleManagedAgentInteraction({
  handoff,
  input,
  allowedDomains = [],
  credentialBindings = [],
  environmentId = null,
  previousInteractionId = null,
  maxTotalTokens
}) {
  requireString(input, 'Google managed-agent input', 1_000_000);
  if (!Number.isSafeInteger(maxTotalTokens) || maxTotalTokens < 1) {
    throw new ValidationError(
      'Google managed-agent maxTotalTokens must be a positive safe integer'
    );
  }

  const domains = exactDomainList(allowedDomains);
  validateAuthorizedHandoff(handoff, domains);
  rejectCredentialBindings(credentialBindings);
  const pinnedEnvironmentId = optionalProviderLocator(
    environmentId,
    'Google managed-agent environmentId'
  );
  const pinnedPreviousInteractionId = optionalProviderLocator(
    previousInteractionId,
    'Google managed-agent previousInteractionId'
  );

  const network = domains.length === 0
    ? 'disabled'
    : {
      allowlist: domains.map((domain) => ({ domain }))
    };

  const environment = {
    type: 'remote',
    network
  };
  if (pinnedEnvironmentId) {
    environment.environment_id = pinnedEnvironmentId;
  }

  const request = {
    agent: GOOGLE_MANAGED_AGENT_ID,
    input,
    environment,
    agent_config: {
      type: 'antigravity',
      model: GOOGLE_MANAGED_AGENT_MODEL,
      max_total_tokens: maxTotalTokens
    }
  };
  if (pinnedPreviousInteractionId) {
    request.previous_interaction_id = pinnedPreviousInteractionId;
  }

  return Object.freeze(request);
}
