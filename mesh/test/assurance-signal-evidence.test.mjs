import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSURANCE_SIGNAL_EVIDENCE_SCHEMA,
  ASSURANCE_SIGNAL_POLICY_SCHEMA,
  ASSURANCE_RISK_SIGNALS,
  buildAdaptiveAssuranceInputFromEvidence,
  normalizeAssuranceSignalEvidence,
  resolveAdaptiveAssuranceSignals
} from '../src/lib/assurance-signal-evidence.mjs';

const NOW = '2026-09-01T12:00:00.000Z';
const DIGEST = 'a'.repeat(64);
const SOURCE_VERIFICATION_DIGEST = 'b'.repeat(64);
const VERIFIED_SOURCES = new Map([[
  SOURCE_VERIFICATION_DIGEST,
  Object.freeze({ source_id: 'source.local', source_class: 'measurement' })
]]);

function policy(overrides = {}) {
  return {
    schema: ASSURANCE_SIGNAL_POLICY_SCHEMA,
    policy_id: 'policy.assurance-signals.standard',
    accepted_source_classes: [
      'measurement',
      'policy-derived',
      'independently-verified',
      'entity-assurance'
    ],
    maximum_age_ms: 86_400_000,
    require_reputation: true,
    authority_effect: 'none',
    ...overrides
  };
}

function evidence({
  id,
  signal,
  value = 20,
  confidence = 90,
  sourceId = 'source.local',
  sourceClass = 'measurement',
  observedAt = '2026-09-01T11:00:00.000Z',
  expiresAt = '2026-09-02T11:00:00.000Z'
}) {
  return {
    schema: ASSURANCE_SIGNAL_EVIDENCE_SCHEMA,
    evidence_id: id,
    task_id: 'task.signal-example',
    signal,
    value,
    confidence,
    source_id: sourceId,
    source_class: sourceClass,
    basis_digest: DIGEST,
    source_verification_digest: SOURCE_VERIFICATION_DIGEST,
    observed_at: observedAt,
    expires_at: expiresAt,
    non_authorizing: true
  };
}

function completeEvidence() {
  const result = ASSURANCE_RISK_SIGNALS.map((signal, index) => evidence({
    id: `evidence.${signal}.${index}`,
    signal,
    value: 10 + index
  }));
  result.push(evidence({
    id: 'evidence.reputation.primary',
    signal: 'reputation',
    value: 80,
    confidence: 90,
    sourceClass: 'entity-assurance'
  }));
  return result;
}

test('signal evidence is attributable, bounded, digest-bound, and non-authorizing', () => {
  const normalized = normalizeAssuranceSignalEvidence(evidence({
    id: 'evidence.consequence.1',
    signal: 'consequence'
  }));
  assert.equal(normalized.source_id, 'source.local');
  assert.equal(normalized.non_authorizing, true);
  assert.match(normalized.evidence_digest, /^[a-f0-9]{64}$/);
});

test('missing current risk evidence fails closed instead of defaulting safe', () => {
  assert.throws(
    () => resolveAdaptiveAssuranceSignals({
      taskId: 'task.signal-example',
      policy: policy(),
      evidence: completeEvidence().filter(item => item.signal !== 'anomaly'),
      verifiedSourceBindings: VERIFIED_SOURCES,
      now: NOW
    }),
    /anomaly/
  );
});

test('expired, stale, future, and unsupported-source evidence cannot satisfy a signal', () => {
  const cases = [
    evidence({
      id: 'evidence.anomaly.expired',
      signal: 'anomaly',
      expiresAt: '2026-09-01T11:30:00.000Z'
    }),
    evidence({
      id: 'evidence.anomaly.stale',
      signal: 'anomaly',
      observedAt: '2026-08-20T11:00:00.000Z',
      expiresAt: '2026-09-20T11:00:00.000Z'
    }),
    evidence({
      id: 'evidence.anomaly.future',
      signal: 'anomaly',
      observedAt: '2026-09-01T13:00:00.000Z',
      expiresAt: '2026-09-02T13:00:00.000Z'
    })
  ];
  for (const replacement of cases) {
    const items = completeEvidence().filter(item => item.signal !== 'anomaly');
    items.push(replacement);
    assert.throws(
      () => resolveAdaptiveAssuranceSignals({
        taskId: 'task.signal-example',
        policy: policy(),
        evidence: items,
        verifiedSourceBindings: VERIFIED_SOURCES,
        now: NOW
      }),
      /anomaly/
    );
  }

  const unsupported = completeEvidence().filter(item => item.signal !== 'anomaly');
  unsupported.push({
    ...evidence({
      id: 'evidence.anomaly.agent-declared',
      signal: 'anomaly'
    }),
    source_class: 'agent-declaration'
  });
  assert.throws(
    () => resolveAdaptiveAssuranceSignals({
      taskId: 'task.signal-example',
      policy: policy(),
      evidence: unsupported,
      verifiedSourceBindings: VERIFIED_SOURCES,
      now: NOW
    }),
    /source_class/
  );
});

test('conflicting risk evidence resolves toward the higher observed risk', () => {
  const items = completeEvidence();
  items.push(evidence({
    id: 'evidence.consequence.second',
    signal: 'consequence',
    value: 95,
    sourceId: 'source.independent',
    sourceClass: 'independently-verified'
  }));
  const resolution = resolveAdaptiveAssuranceSignals({
    taskId: 'task.signal-example',
    policy: policy(),
    evidence: items,
    verifiedSourceBindings: VERIFIED_SOURCES,
    now: NOW
  });
  assert.equal(resolution.signals.consequence, 95);
  assert.equal(resolution.conservative_disagreement_resolution, true);
  assert.equal(resolution.authority_effect, 'none');
});

test('conflicting reputation resolves toward less friction rather than trust inflation', () => {
  const items = completeEvidence();
  items.push(evidence({
    id: 'evidence.reputation.caution',
    signal: 'reputation',
    value: 35,
    confidence: 80,
    sourceId: 'source.caution',
    sourceClass: 'independently-verified'
  }));
  const resolution = resolveAdaptiveAssuranceSignals({
    taskId: 'task.signal-example',
    policy: policy(),
    evidence: items,
    verifiedSourceBindings: VERIFIED_SOURCES,
    now: NOW
  });
  assert.equal(resolution.reputation_score, 35);
  assert.equal(resolution.reputation_confidence, 80);
});

test('sourced resolution builds the ordinary adaptive-assurance input without granting authority', () => {
  const built = buildAdaptiveAssuranceInputFromEvidence({
    taskId: 'task.signal-example',
    riskClass: 'medium',
    signalPolicy: policy(),
    evidence: completeEvidence(),
    verifiedSourceBindings: VERIFIED_SOURCES,
    now: NOW
  });
  assert.equal(built.input.schema, 'axiom-adaptive-assurance-input.v1');
  assert.equal(built.input.risk_class, 'medium');
  assert.equal(built.resolution.authority_effect, 'none');
  assert.match(built.resolution.resolution_digest, /^[a-f0-9]{64}$/);
});


test('verified source digest cannot be laundered across source identity or class', () => {
  const identitySubstitution = completeEvidence().map(item => (
    item.signal === 'anomaly'
      ? { ...item, source_id: 'source.other' }
      : item
  ));
  assert.throws(
    () => resolveAdaptiveAssuranceSignals({
      taskId: 'task.signal-example',
      policy: policy(),
      evidence: identitySubstitution,
      verifiedSourceBindings: VERIFIED_SOURCES,
      now: NOW
    }),
    /anomaly/
  );

  const classSubstitution = completeEvidence().map(item => (
    item.signal === 'anomaly'
      ? { ...item, source_class: 'independently-verified' }
      : item
  ));
  assert.throws(
    () => resolveAdaptiveAssuranceSignals({
      taskId: 'task.signal-example',
      policy: policy(),
      evidence: classSubstitution,
      verifiedSourceBindings: VERIFIED_SOURCES,
      now: NOW
    }),
    /anomaly/
  );
});

test('otherwise valid signal evidence is ignored when its upstream verification was not admitted', () => {
  const items = completeEvidence().map(item => (
    item.signal === 'anomaly'
      ? { ...item, source_verification_digest: 'c'.repeat(64) }
      : item
  ));
  assert.throws(
    () => resolveAdaptiveAssuranceSignals({
      taskId: 'task.signal-example',
      policy: policy(),
      evidence: items,
      verifiedSourceBindings: VERIFIED_SOURCES,
      now: NOW
    }),
    /anomaly/
  );
});

test('acting-agent self declarations are not accepted as an evidence class', () => {
  const item = evidence({
    id: 'evidence.bad-self-report',
    signal: 'uncertainty'
  });
  item.source_class = 'agent-declaration';
  assert.throws(
    () => normalizeAssuranceSignalEvidence(item),
    /source_class/
  );
});
