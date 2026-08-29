import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { selfBundleIndexDigest } from '../src/lib/self-bundle-index.mjs';
import {
  CONTINUITY_REPORT_SCHEMA,
  buildContinuityReport
} from '../src/lib/continuity-report.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);

function rootBundle() {
  return {
    schema: 'axiom-self-bundle-index.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    bundle_id: 'self.personal.v1',
    principal_id: 'agent.personal.primary',
    created_at: '2026-08-29T12:00:00.000Z',
    predecessor_bundle: null,
    agent_composition: { ref: 'composition.personal.primary', digest: DIGEST_A },
    personal_agent_pack: { ref: 'pack.personal.v2', digest: DIGEST_B },
    semantic_state: [
      {
        claim_id: 'claim.preference.001',
        ref: 'semantic.claim.preference.001',
        digest: DIGEST_A,
        required_for_continuity: true
      },
      {
        claim_id: 'claim.style.001',
        ref: 'semantic.claim.style.001',
        digest: DIGEST_B,
        required_for_continuity: false
      }
    ],
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function successorOf(predecessor = rootBundle()) {
  const successor = structuredClone(predecessor);
  successor.bundle_id = 'self.personal.v2';
  successor.created_at = '2026-08-29T13:00:00.000Z';
  successor.predecessor_bundle = {
    ref: predecessor.bundle_id,
    digest: selfBundleIndexDigest(predecessor)
  };
  return successor;
}

function observationsFor(bundle) {
  return [
    {
      ref: bundle.personal_agent_pack.ref,
      available: true,
      observed_digest: bundle.personal_agent_pack.digest
    },
    ...bundle.semantic_state.map(entry => ({
      ref: entry.ref,
      available: true,
      observed_digest: entry.digest
    }))
  ];
}

function buildHealthy() {
  const predecessor = rootBundle();
  const successor = successorOf(predecessor);
  return {
    predecessor,
    successor,
    observations: observationsFor(successor)
  };
}

test('exact lineage and matching evidence produce full continuity', () => {
  const { predecessor, successor, observations } = buildHealthy();
  const report = buildContinuityReport(predecessor, successor, observations);
  assert.equal(CONTINUITY_REPORT_SCHEMA, 'axiom-continuity-report.v0');
  assert.equal(report.schema, CONTINUITY_REPORT_SCHEMA);
  assert.equal(report.continuity_status, 'full');
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.dimensions.principal.state, 'retained');
  assert.equal(report.dimensions.lineage.state, 'retained');
  assert.equal(report.dimensions.composition.state, 'retained');
  assert.equal(report.dimensions.portable_state.state, 'retained');
  assert.equal(report.dimensions.semantic_state.state, 'retained');
  assert.equal(report.dimensions.evidence_completeness.state, 'full');
  assert.match(report.report_digest, /^[a-f0-9]{64}$/);
});

test('principal mismatch blocks continuity', () => {
  const { predecessor, successor, observations } = buildHealthy();
  successor.principal_id = 'agent.personal.other';
  const report = buildContinuityReport(predecessor, successor, observations);
  assert.equal(report.continuity_status, 'blocked');
  assert.equal(report.dimensions.principal.state, 'blocked');
  assert.ok(report.blockers.includes('principal-mismatch'));
});

test('predecessor reference mismatch blocks lineage', () => {
  const { predecessor, successor, observations } = buildHealthy();
  successor.predecessor_bundle.ref = 'self.personal.unrelated';
  const report = buildContinuityReport(predecessor, successor, observations);
  assert.equal(report.continuity_status, 'blocked');
  assert.equal(report.dimensions.lineage.state, 'blocked');
  assert.ok(report.blockers.includes('predecessor-reference-mismatch'));
});

test('predecessor digest mismatch blocks lineage', () => {
  const { predecessor, successor, observations } = buildHealthy();
  successor.predecessor_bundle.digest = DIGEST_C;
  const report = buildContinuityReport(predecessor, successor, observations);
  assert.equal(report.continuity_status, 'blocked');
  assert.equal(report.dimensions.lineage.state, 'blocked');
  assert.ok(report.blockers.includes('predecessor-digest-mismatch'));
});

test('changed composition degrades continuity without declaring identity loss', () => {
  const { predecessor, successor, observations } = buildHealthy();
  successor.agent_composition = { ref: 'composition.personal.next', digest: DIGEST_C };
  const report = buildContinuityReport(predecessor, successor, observations);
  assert.equal(report.continuity_status, 'degraded');
  assert.equal(report.dimensions.principal.state, 'retained');
  assert.equal(report.dimensions.lineage.state, 'retained');
  assert.equal(report.dimensions.composition.state, 'changed');
  assert.ok(report.warnings.includes('composition-changed'));
  assert.ok(!report.blockers.includes('composition-changed'));
});

test('changed Pack with matching successor evidence degrades portable continuity', () => {
  const { predecessor, successor } = buildHealthy();
  successor.personal_agent_pack = { ref: 'pack.personal.v3', digest: DIGEST_C };
  const report = buildContinuityReport(predecessor, successor, observationsFor(successor));
  assert.equal(report.continuity_status, 'degraded');
  assert.equal(report.dimensions.portable_state.state, 'changed');
  assert.equal(report.dimensions.portable_state.observation_state, 'digest-match');
  assert.ok(report.warnings.includes('personal-agent-pack-changed'));
});

test('explicitly unavailable Pack blocks continuity', () => {
  const { predecessor, successor, observations } = buildHealthy();
  observations[0] = { ref: successor.personal_agent_pack.ref, available: false };
  const report = buildContinuityReport(predecessor, successor, observations);
  assert.equal(report.continuity_status, 'blocked');
  assert.equal(report.dimensions.portable_state.state, 'missing');
  assert.ok(report.blockers.includes('personal-agent-pack-missing'));
});

test('Pack digest mismatch blocks continuity', () => {
  const { predecessor, successor, observations } = buildHealthy();
  observations[0].observed_digest = DIGEST_C;
  const report = buildContinuityReport(predecessor, successor, observations);
  assert.equal(report.continuity_status, 'blocked');
  assert.equal(report.dimensions.portable_state.state, 'digest-mismatch');
  assert.ok(report.blockers.includes('personal-agent-pack-digest-mismatch'));
});

test('omitted Pack observation is unassessed and degrades continuity', () => {
  const { predecessor, successor, observations } = buildHealthy();
  const report = buildContinuityReport(predecessor, successor, observations.slice(1));
  assert.equal(report.continuity_status, 'degraded');
  assert.equal(report.dimensions.portable_state.state, 'unassessed');
  assert.ok(report.warnings.includes('personal-agent-pack-unassessed'));
});

test('required semantic state missing or digest-mismatched blocks continuity', () => {
  for (const mode of ['missing', 'digest-mismatch']) {
    const { predecessor, successor, observations } = buildHealthy();
    const requiredRef = successor.semantic_state[0].ref;
    const index = observations.findIndex(entry => entry.ref === requiredRef);
    observations[index] = mode === 'missing'
      ? { ref: requiredRef, available: false }
      : { ref: requiredRef, available: true, observed_digest: DIGEST_C };
    const report = buildContinuityReport(predecessor, successor, observations);
    assert.equal(report.continuity_status, 'blocked');
    assert.ok(report.blockers.includes(`required-semantic-${mode}:claim.preference.001`));
  }
});

test('optional semantic state missing or digest-mismatched only degrades continuity', () => {
  for (const mode of ['missing', 'digest-mismatch']) {
    const { predecessor, successor, observations } = buildHealthy();
    const optionalRef = successor.semantic_state[1].ref;
    const index = observations.findIndex(entry => entry.ref === optionalRef);
    observations[index] = mode === 'missing'
      ? { ref: optionalRef, available: false }
      : { ref: optionalRef, available: true, observed_digest: DIGEST_C };
    const report = buildContinuityReport(predecessor, successor, observations);
    assert.equal(report.continuity_status, 'degraded');
    assert.ok(report.warnings.includes(`optional-semantic-${mode}:claim.style.001`));
  }
});

test('added, removed, or changed semantic claims degrade continuity', () => {
  const cases = [
    successor => {
      successor.semantic_state.push({
        claim_id: 'claim.new.001',
        ref: 'semantic.claim.new.001',
        digest: DIGEST_C,
        required_for_continuity: false
      });
    },
    successor => {
      successor.semantic_state = successor.semantic_state.filter(
        entry => entry.claim_id !== 'claim.style.001'
      );
    },
    successor => {
      successor.semantic_state[0].digest = DIGEST_C;
    }
  ];

  for (const mutate of cases) {
    const predecessor = rootBundle();
    const successor = successorOf(predecessor);
    mutate(successor);
    const report = buildContinuityReport(predecessor, successor, observationsFor(successor));
    assert.equal(report.continuity_status, 'degraded');
    assert.equal(report.dimensions.semantic_state.state, 'changed');
  }
});

test('required semantic state without an observation is unassessed rather than assumed missing', () => {
  const { predecessor, successor, observations } = buildHealthy();
  const requiredRef = successor.semantic_state[0].ref;
  const filtered = observations.filter(entry => entry.ref !== requiredRef);
  const report = buildContinuityReport(predecessor, successor, filtered);
  assert.equal(report.continuity_status, 'degraded');
  assert.ok(report.warnings.includes('required-semantic-unassessed:claim.preference.001'));
  assert.ok(!report.blockers.some(item => item.includes('claim.preference.001')));
});

test('duplicate observations fail closed', () => {
  const { predecessor, successor, observations } = buildHealthy();
  observations.push({ ...observations[0] });
  assert.throws(
    () => buildContinuityReport(predecessor, successor, observations),
    /duplicate observation/i
  );
});

test('unavailable observations cannot carry an observed digest', () => {
  const { predecessor, successor, observations } = buildHealthy();
  observations[0] = {
    ref: successor.personal_agent_pack.ref,
    available: false,
    observed_digest: successor.personal_agent_pack.digest
  };
  assert.throws(
    () => buildContinuityReport(predecessor, successor, observations),
    /unavailable observation.*observed_digest/i
  );
});

test('builder does not mutate inputs and returns a deeply frozen report', () => {
  const { predecessor, successor, observations } = buildHealthy();
  const deepFreeze = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  deepFreeze(predecessor);
  deepFreeze(successor);
  deepFreeze(observations);
  const report = buildContinuityReport(predecessor, successor, observations);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.dimensions), true);
  assert.equal(Object.isFrozen(report.dimensions.semantic_state.observations), true);
  assert.equal(Object.isFrozen(report.authority_boundary), true);
});

test('report digest is deterministic across observation ordering', () => {
  const { predecessor, successor, observations } = buildHealthy();
  const first = buildContinuityReport(predecessor, successor, observations);
  const second = buildContinuityReport(predecessor, successor, [...observations].reverse());
  assert.equal(first.report_digest, second.report_digest);
});

test('authority boundary denies effects, access, substitution, and subjective identity proof', () => {
  const { predecessor, successor, observations } = buildHealthy();
  const report = buildContinuityReport(predecessor, successor, observations);
  assert.deepEqual(report.authority_boundary, {
    writes_files: false,
    performs_network_effects: false,
    opens_or_decrypts_vaults: false,
    activates_runtimes: false,
    loads_models: false,
    issues_or_refreshes_credentials: false,
    substitutes_missing_artifacts: false,
    grants_vault_access: false,
    grants_execution_authority: false,
    proves_subjective_identity: false
  });
});

test('continuity module imports only canonical and self bundle helpers', async () => {
  const sourceUrl = new URL('../src/lib/continuity-report.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs', './self-bundle-index.mjs']);
});
