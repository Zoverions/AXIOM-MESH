import { digestObject, ValidationError } from './canonical.mjs';
import {
  assessAgentAssuranceEvidence,
  normalizeAgentAssuranceEvidence
} from './agent-assurance-evidence.mjs';
import {
  evaluateMachineIntent,
  normalizeMachinePrincipalDefinition
} from './machine-principal.mjs';

export const AGENT_ASSURANCE_AUTHORITY_BINDING_SCHEMA =
  'axiom-agent-assurance-authority-binding.v0';
export const AGENT_ASSURANCE_DENY_SIGNAL_SCHEMA =
  'axiom-agent-assurance-deny-signal.v0';

export function bindAgentAssuranceToMachinePrincipal(rawEvidence, rawPrincipal) {
  const principal = normalizeMachinePrincipalDefinition(rawPrincipal);
  const evidence = normalizeAgentAssuranceEvidence(rawEvidence);
  const mismatches = [];

  if (evidence.agent.principal_id !== principal.id) {
    mismatches.push('principal_id');
  }
  if (evidence.agent.authority_digest !== principal.authority_digest) {
    mismatches.push('authority_digest');
  }

  return {
    schema: AGENT_ASSURANCE_AUTHORITY_BINDING_SCHEMA,
    bound: mismatches.length === 0,
    mismatches,
    principal_id: principal.id,
    authority_digest: principal.authority_digest,
    evidence_principal_id: evidence.agent.principal_id,
    evidence_authority_digest: evidence.agent.authority_digest,
    evidence_digest: digestObject(evidence),
    authority_effect: 'none',
    authorizes_execution: false
  };
}

export function evaluateAgentAssuranceDenySignal(rawEvidence, rawPrincipal) {
  const binding = bindAgentAssuranceToMachinePrincipal(rawEvidence, rawPrincipal);
  const evidence = normalizeAgentAssuranceEvidence(rawEvidence);
  const assessment = assessAgentAssuranceEvidence(evidence);

  if (!binding.bound) {
    return {
      schema: AGENT_ASSURANCE_DENY_SIGNAL_SCHEMA,
      deny: true,
      code: 'machine_assurance_binding_denied',
      reason: 'Agent assurance evidence does not bind to the current machine principal authority',
      evidence_digest: binding.evidence_digest,
      binding,
      finding_codes: [],
      authority_effect: 'deny-only',
      authorizes_execution: false
    };
  }

  const hardEnvironmentFindings = assessment.findings.filter(item => (
    item.severity === 'hard'
    && typeof item.code === 'string'
    && item.code.startsWith('environment_')
  ));
  if (hardEnvironmentFindings.length > 0) {
    return {
      schema: AGENT_ASSURANCE_DENY_SIGNAL_SCHEMA,
      deny: true,
      code: 'machine_assurance_environment_denied',
      reason: 'Observed agent environment exceeds the declared assurance boundary',
      evidence_digest: binding.evidence_digest,
      binding,
      finding_codes: hardEnvironmentFindings.map(item => item.code).sort(),
      authority_effect: 'deny-only',
      authorizes_execution: false
    };
  }

  return {
    schema: AGENT_ASSURANCE_DENY_SIGNAL_SCHEMA,
    deny: false,
    code: 'machine_assurance_no_deny_signal',
    reason: 'Agent assurance evidence adds no deny signal',
    evidence_digest: binding.evidence_digest,
    binding,
    finding_codes: assessment.findings.map(item => item.code).sort(),
    authority_effect: 'none',
    authorizes_execution: false
  };
}

export function evaluateMachineIntentWithAssurance(principal, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new ValidationError('Machine intent assurance options must be an object');
  }
  const {
    assurance_evidence: assuranceEvidence,
    ...machineIntent
  } = options;
  const baseDecision = evaluateMachineIntent(principal, machineIntent);

  if (!baseDecision.allow || assuranceEvidence === undefined || assuranceEvidence === null) {
    return baseDecision;
  }

  const signal = evaluateAgentAssuranceDenySignal(assuranceEvidence, principal);
  if (signal.deny) {
    return {
      allow: false,
      code: signal.code,
      reason: signal.reason,
      assurance: signal
    };
  }

  return {
    ...baseDecision,
    assurance: signal
  };
}
