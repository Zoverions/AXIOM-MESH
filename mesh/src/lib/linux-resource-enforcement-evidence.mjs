import { createPublicKey } from 'node:crypto';
import { ValidationError } from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';

const SCHEMA = 'linux.resource-enforcement-drill-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UNIT = /^mesh-contribution-[a-f0-9]{24}\.service$/;

export function verifyLinuxResourceEnforcementEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new ValidationError(
      'Linux resource enforcement evidence must be an object'
    );
  }
  if (evidence.schema !== SCHEMA || evidence.status !== 'passed') {
    throw new ValidationError(
      'Linux resource enforcement evidence metadata is invalid'
    );
  }
  if (!REVISION.test(evidence.source?.revision ?? '')) {
    throw new ValidationError(
      'Linux resource enforcement source revision is invalid'
    );
  }
  const profile = evidence.profile;
  if (
    profile?.backend !== 'systemd-cgroup-v2'
    || profile?.guardian_fixture !== 'synthetic-local-lab'
    || profile?.remote_execution_authorized !== false
    || profile?.arbitrary_command_executed !== false
    || profile?.network_task_executed !== false
  ) {
    throw new ValidationError(
      'Linux resource enforcement profile or non-claims are invalid'
    );
  }
  const capability = evidence.capability;
  if (
    !DIGEST.test(capability?.observation_digest ?? '')
    || capability?.cgroup_version !== 2
    || !Array.isArray(capability?.controllers)
    || !['cpu', 'memory', 'pids'].every(
      item => capability.controllers.includes(item)
    )
  ) {
    throw new ValidationError(
      'Linux resource enforcement capability evidence is invalid'
    );
  }
  const enforcement = evidence.enforcement;
  if (
    !UNIT.test(enforcement?.unit_name ?? '')
    || !DIGEST.test(enforcement?.request_digest ?? '')
    || !DIGEST.test(enforcement?.guardian_binding_digest ?? '')
    || !integer(
      enforcement?.requested_cpu_millis,
      1,
      1_000_000_000
    )
    || !integer(
      enforcement?.requested_memory_bytes,
      1,
      Number.MAX_SAFE_INTEGER
    )
    || !integer(enforcement?.requested_pids_max, 1, 128)
    || !integer(enforcement?.lease_seconds, 1, 300)
  ) {
    throw new ValidationError(
      'Linux resource enforcement request evidence is invalid'
    );
  }
  const observations = evidence.observations;
  if (
    !integer(
      observations?.cpu_max_quota,
      1,
      Number.MAX_SAFE_INTEGER
    )
    || !integer(
      observations?.cpu_max_period,
      1,
      Number.MAX_SAFE_INTEGER
    )
    || !integer(
      observations?.memory_max_bytes,
      1,
      Number.MAX_SAFE_INTEGER
    )
    || !integer(observations?.pids_max, 1, Number.MAX_SAFE_INTEGER)
    || observations?.stop_state !== 'inactive_or_absent'
  ) {
    throw new ValidationError(
      'Linux resource enforcement cgroup observations are invalid'
    );
  }
  if (
    observations.cpu_max_quota * 1000
      !== enforcement.requested_cpu_millis * observations.cpu_max_period
    || observations.memory_max_bytes !== enforcement.requested_memory_bytes
    || observations.pids_max !== enforcement.requested_pids_max
  ) {
    throw new ValidationError(
      'Linux resource enforcement observed limits do not match the request'
    );
  }
  const expectedChecks = [
    'cpu_limit_matches',
    'memory_limit_matches',
    'pids_limit_matches',
    'stop_confirmed',
    'no_unrequested_network_or_storage_resource'
  ];
  if (
    !evidence.checks
    || expectedChecks.some(name => evidence.checks[name] !== true)
    || Object.keys(evidence.checks).some(
      name => !expectedChecks.includes(name)
    )
  ) {
    throw new ValidationError(
      'Linux resource enforcement drill checks are invalid'
    );
  }
  if (
    evidence.signer?.service !== 'host-guardian-lab'
    || typeof evidence.signer?.key_id !== 'string'
    || evidence.attestation?.key_id !== evidence.signer.key_id
    || typeof evidence.signer?.public_key_pem !== 'string'
  ) {
    throw new ValidationError(
      'Linux resource enforcement signer metadata is invalid'
    );
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError(
      'Linux resource enforcement signer public key is invalid'
    );
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(
      'Linux resource enforcement signer is not Ed25519'
    );
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError(
      'Linux resource enforcement attestation is invalid'
    );
  }
  if (
    !Array.isArray(evidence.limitations)
    || evidence.limitations.length < 1
  ) {
    throw new ValidationError(
      'Linux resource enforcement limitations are required'
    );
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source.revision,
    cpu_millis: enforcement.requested_cpu_millis,
    memory_bytes: enforcement.requested_memory_bytes,
    pids_max: enforcement.requested_pids_max
  };
}

function integer(value, minimum, maximum) {
  return (
    Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum
  );
}
