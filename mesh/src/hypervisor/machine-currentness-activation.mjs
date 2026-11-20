import { randomBytes } from 'node:crypto';

import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const GENERATION = /^[A-Za-z0-9_:-]{16,160}$/;
const REPORT_FIELDS = Object.freeze([
  'blockers',
  'configured_principal_count',
  'configured_set_digest',
  'evaluation',
  'grid_snapshot',
  'policy_digest',
  'policy_version',
  'ready',
  'report_digest',
  'retained_projection_count',
  'retained_set_digest',
  'runtime_generation',
  'schema',
  'semantics',
  'source_revision'
]);
const SEMANTICS = Object.freeze({
  production_activation_authorized: false,
  registry_mutation_authorized: false,
  grid_mutation_authorized: false,
  execution_authorized: false,
  deployment_authorized: false,
  promotion_authorized: false,
  authority_effect: 'none'
});

export function createMachineCurrentnessActivationGate({
  enabled,
  expectedSourceRevision = null,
  runtimeGeneration = null
} = {}) {
  if (typeof enabled !== 'boolean') {
    throw new ValidationError('Machine currentness activation gate enabled state is invalid');
  }
  const generation = assertString(
    runtimeGeneration ?? `runtime_generation_${randomBytes(24).toString('base64url')}`,
    'machine currentness runtime generation',
    { max: 160, pattern: GENERATION }
  );
  if (!enabled) return disabledGate(generation);

  const expectedRevision = assertString(
    expectedSourceRevision,
    'machine currentness expected source revision',
    { max: 40, pattern: REVISION }
  );
  let pending = null;
  let activation = null;

  return Object.freeze({
    enabled: true,
    runtimeGeneration: generation,
    get ready() {
      return activation !== null;
    },
    recordPreflight(input) {
      if (activation) throw activationError(
        'machine_currentness_preflight_replayed',
        'Machine currentness preflight was already consumed for this runtime generation'
      );
      const report = normalizeReadyReport(input);
      if (report.runtime_generation !== generation) {
        throw activationError(
          'machine_currentness_preflight_wrong_generation',
          'Machine currentness preflight belongs to a different runtime generation'
        );
      }
      pending = report;
      return report;
    },
    activate({ reportDigest, policyVersion, policyDigest, gridStatus } = {}) {
      if (activation) throw activationError(
        'machine_currentness_preflight_replayed',
        'Machine currentness preflight was already consumed for this runtime generation'
      );
      if (!pending) throw activationError(
        'machine_currentness_preflight_required',
        'A ready current-generation machine currentness preflight is required'
      );
      const digest = assertString(reportDigest, 'machine currentness report digest', {
        max: 64,
        pattern: DIGEST
      });
      if (digest !== pending.report_digest) {
        throw activationError(
          'machine_currentness_preflight_substituted',
          'Machine currentness preflight digest does not match the current candidate'
        );
      }
      if (pending.source_revision !== expectedRevision) {
        throw activationError(
          'machine_currentness_preflight_wrong_revision',
          'Machine currentness preflight source revision does not match this runtime'
        );
      }
      const currentPolicyVersion = assertString(policyVersion, 'machine currentness policy version', {
        max: 160,
        pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
      });
      const currentPolicyDigest = assertString(policyDigest, 'machine currentness policy digest', {
        max: 64,
        pattern: DIGEST
      });
      if (
        currentPolicyVersion !== pending.policy_version
        || currentPolicyDigest !== pending.policy_digest
      ) {
        throw activationError(
          'machine_currentness_preflight_wrong_policy',
          'Machine currentness preflight policy binding is stale or substituted'
        );
      }
      const currentGrid = normalizeGridStatus(gridStatus);
      if (digestObject(currentGrid) !== pending.grid_snapshot.snapshot_digest) {
        throw activationError(
          'machine_currentness_preflight_stale_grid',
          'Grid changed after the machine currentness preflight was produced'
        );
      }

      const body = {
        schema: 'axiom-machine-currentness-enforcement-activation.v1',
        active: true,
        runtime_generation: generation,
        source_revision: expectedRevision,
        policy_version: currentPolicyVersion,
        policy_digest: currentPolicyDigest,
        grid_snapshot_digest: pending.grid_snapshot.snapshot_digest,
        report_digest: pending.report_digest,
        enforcement_effect: 'enabled',
        authority_effect: 'none'
      };
      activation = Object.freeze({ ...body, activation_digest: digestObject(body) });
      pending = null;
      return activation;
    },
    assertEffective() {
      if (!activation) throw activationError(
        'machine_currentness_preflight_required',
        'Machine currentness enforcement is blocked until this runtime generation consumes a verified preflight'
      );
      return activation;
    }
  });
}

function disabledGate(generation) {
  return Object.freeze({
    enabled: false,
    runtimeGeneration: generation,
    ready: true,
    recordPreflight() {
      throw activationError(
        'machine_currentness_preflight_not_required',
        'Machine currentness production preflight activation is not required'
      );
    },
    activate() {
      throw activationError(
        'machine_currentness_preflight_not_required',
        'Machine currentness production preflight activation is not required'
      );
    },
    assertEffective() {
      return null;
    }
  });
}

function normalizeReadyReport(input) {
  const report = assertPlainObject(input, 'machine currentness preflight report');
  if (Object.keys(report).sort().join(',') !== REPORT_FIELDS.join(',')) {
    throw new ValidationError('Machine currentness preflight report fields are invalid');
  }
  if (
    report.schema !== 'axiom-machine-currentness-production-preflight-report.v1'
    || report.ready !== true
    || !Array.isArray(report.blockers)
    || report.blockers.length !== 0
  ) {
    throw activationError(
      'machine_currentness_preflight_not_ready',
      'Machine currentness preflight is not ready for enforcement activation'
    );
  }
  assertString(report.runtime_generation, 'machine currentness report runtime generation', {
    max: 160,
    pattern: GENERATION
  });
  assertString(report.source_revision, 'machine currentness report source revision', {
    max: 40,
    pattern: REVISION
  });
  assertString(report.policy_version, 'machine currentness report policy version', {
    max: 160,
    pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
  });
  assertString(report.policy_digest, 'machine currentness report policy digest', {
    max: 64,
    pattern: DIGEST
  });
  assertString(report.configured_set_digest, 'machine currentness configured set digest', {
    max: 64,
    pattern: DIGEST
  });
  assertString(report.retained_set_digest, 'machine currentness retained set digest', {
    max: 64,
    pattern: DIGEST
  });
  if (
    !Number.isSafeInteger(report.configured_principal_count)
    || report.configured_principal_count < 0
    || !Number.isSafeInteger(report.retained_projection_count)
    || report.retained_projection_count < 0
  ) {
    throw new ValidationError('Machine currentness preflight report counts are invalid');
  }
  assertPlainObject(report.evaluation, 'machine currentness preflight evaluation');
  const semantics = assertPlainObject(report.semantics, 'machine currentness report semantics');
  if (
    Object.keys(semantics).length !== Object.keys(SEMANTICS).length
    || digestObject(semantics) !== digestObject(SEMANTICS)
  ) {
    throw new ValidationError('Machine currentness preflight report semantics are invalid');
  }
  const snapshot = normalizeGridSnapshot(report.grid_snapshot);
  const suppliedDigest = assertString(report.report_digest, 'machine currentness report digest', {
    max: 64,
    pattern: DIGEST
  });
  const { report_digest: ignored, ...body } = report;
  if (digestObject(body) !== suppliedDigest) {
    throw activationError(
      'machine_currentness_preflight_substituted',
      'Machine currentness preflight content digest is invalid'
    );
  }
  return Object.freeze({ ...structuredClone(report), grid_snapshot: snapshot });
}

function normalizeGridSnapshot(input) {
  const snapshot = assertPlainObject(input, 'machine currentness Grid snapshot');
  const status = normalizeGridStatus(snapshot);
  const snapshotDigest = assertString(snapshot.snapshot_digest, 'machine currentness Grid snapshot digest', {
    max: 64,
    pattern: DIGEST
  });
  if (digestObject(status) !== snapshotDigest) {
    throw new ValidationError('Machine currentness Grid snapshot digest is invalid');
  }
  return Object.freeze({ ...status, snapshot_digest: snapshotDigest });
}

function normalizeGridStatus(input) {
  const value = assertPlainObject(input, 'Grid status');
  if (
    value.mode !== undefined && value.mode !== 'single-node-transparency-log'
    || value.consensus !== undefined && value.consensus !== false
    || !Number.isSafeInteger(value.schema_version)
    || value.schema_version < 1
    || !Number.isSafeInteger(value.last_seq)
    || value.last_seq < 0
  ) {
    throw new ValidationError('Grid status is invalid');
  }
  return {
    schema_version: value.schema_version,
    last_seq: value.last_seq,
    last_hash: assertString(value.last_hash, 'Grid last_hash', {
      max: 64,
      pattern: DIGEST
    })
  };
}

function activationError(code, message) {
  return new AxiomError(code, message, 409);
}
