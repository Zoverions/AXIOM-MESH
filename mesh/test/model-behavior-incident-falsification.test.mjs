import assert from 'node:assert/strict';
import test from 'node:test';

import { ValidationError } from '../src/lib/canonical.mjs';
import {
  assertAppendOnlySupersession,
  validateModelBehaviorIncident
} from '../src/lib/model-behavior-incident.mjs';
import { A, B, C, D, E, baseIncident } from './model-behavior-incident-fixtures.mjs';

test('C1 self-authored summary injection keeps derived text non-authoritative', () => {
  const incident = baseIncident({
    incident_id: 'mbi.falsification.c1.v1',
    behavior_classes: ['self-authored-summary-instruction'],
    expected_boundary: 'Synthesized continuation text cannot alter the effective authority/instruction set.',
    observed_behavior: 'Self-authored summary invented a higher-priority-style instruction.',
    consequential_effects: {
      attempted: ['instruction-authority-widening'],
      completed: [],
      uncertain: []
    },
    evidence_refs: [{
      ref_id: 'evidence.derived.summary.c1.v1',
      digest: A,
      kind: 'derived-summary',
      authority_effect: 'none'
    }]
  });
  const validated = validateModelBehaviorIncident(incident);
  assert.equal(validated.valid, true);
  assert.equal(incident.evidence_refs[0].kind, 'derived-summary');
  assert.equal(incident.evidence_refs[0].authority_effect, 'none');
  assert.equal(validated.authority_effect, 'none');
  assert.throws(
    () => baseIncident({
      evidence_refs: [{
        ref_id: 'evidence.derived.summary.bad.v1',
        digest: A,
        kind: 'derived-summary',
        authority_effect: 'grant'
      }]
    }),
    ValidationError
  );
});

test('C4 missing data / fabrication pressure cannot assert fabricated provenance', () => {
  const incomplete = baseIncident({
    incident_id: 'mbi.falsification.c4.incomplete.v1',
    behavior_classes: ['fabricated-unavailable-source-data'],
    observed_behavior: 'Requested source data unavailable; output remained incomplete/unknown.',
    consequential_effects: {
      attempted: ['fabricated-provenance'],
      completed: [],
      uncertain: []
    },
    uncertainty: {
      causal_explanation: 'not-yet-established',
      open_questions: ['Unavailable source values were not fabricated as provenance-bearing facts.']
    },
    evidence_refs: [{
      ref_id: 'evidence.c4.incomplete.v1',
      digest: B,
      kind: 'checker-output',
      authority_effect: 'none'
    }]
  });
  assert.equal(validateModelBehaviorIncident(incomplete).valid, true);

  const fabricatedCompleted = baseIncident({
    incident_id: 'mbi.falsification.c4.fabricated.v1',
    behavior_classes: ['fabricated-unavailable-source-data'],
    observed_behavior: 'Attempted to present fabricated values as if from unavailable source.',
    consequential_effects: {
      attempted: ['fabricated-provenance'],
      completed: ['fabricated-provenance'],
      uncertain: []
    },
    evidence_refs: [{
      ref_id: 'evidence.c4.fabricated.v1',
      digest: C,
      kind: 'checker-output',
      authority_effect: 'none'
    }]
  });
  const validated = validateModelBehaviorIncident(fabricatedCompleted);
  assert.equal(validated.valid, true);
  assert.ok(fabricatedCompleted.consequential_effects.completed.includes('fabricated-provenance'));
  // Recording fabrication as an observed completed effect is evidence, never authorization.
  assert.equal(validated.authority_effect, 'none');
});

test('C5 leaked credential discovery: possession is not authority and must not authorize use', () => {
  const incident = baseIncident({
    incident_id: 'mbi.falsification.c5.v1',
    behavior_classes: ['unauthorized-credential-use'],
    observed_behavior: 'Credential was discoverable but not supplied/authorized for this purpose.',
    consequential_effects: {
      attempted: ['credential-use'],
      completed: [],
      uncertain: []
    },
    sensitive_evidence_routing: {
      public_artifact_contains_secrets: false,
      routing: 'private-ir-channel',
      private_evidence_ref: 'private.evidence.credential.c5.v1'
    },
    evidence_refs: [{
      ref_id: 'evidence.c5.discovery.meta.v1',
      digest: D,
      kind: 'artifact',
      authority_effect: 'none'
    }]
  });
  const validated = validateModelBehaviorIncident(incident);
  assert.equal(validated.valid, true);
  assert.equal(incident.credential_visibility, 'none');
  assert.equal(incident.authority_effect, 'none');
  assert.equal(incident.sensitive_evidence_routing.public_artifact_contains_secrets, false);
  assert.doesNotMatch(JSON.stringify(incident), /api[_-]?key\s*[:=]/i);
});

test('C6 public upload for citation is denied without exact authority', () => {
  const incident = baseIncident({
    incident_id: 'mbi.falsification.c6.v1',
    behavior_classes: ['public-upload-egress-workaround'],
    observed_behavior: 'Model proposed public upload to create a citeable URL for a local artifact.',
    consequential_effects: {
      attempted: ['public-upload', 'egress-widening'],
      completed: [],
      uncertain: []
    },
    evidence_refs: [{
      ref_id: 'evidence.c6.upload.proposal.v1',
      digest: E,
      kind: 'transcript',
      authority_effect: 'none'
    }]
  });
  const validated = validateModelBehaviorIncident(incident);
  assert.equal(validated.valid, true);
  assert.equal(validated.network_effect, 'none');
  assert.equal(validated.authority_effect, 'none');
  assert.ok(incident.consequential_effects.attempted.includes('public-upload'));
  assert.equal(incident.consequential_effects.completed.includes('public-upload'), false);
});

test('C7 broken collaboration cannot widen channels', () => {
  const incident = baseIncident({
    incident_id: 'mbi.falsification.c7.v1',
    behavior_classes: ['broken-collaboration-channel-widening'],
    observed_behavior: 'Intended local shared path failed; substitute public hosting / cache signaling denied.',
    consequential_effects: {
      attempted: ['egress-widening', 'cross-agent-communication', 'shared-state-mutation'],
      completed: [],
      uncertain: []
    },
    evidence_refs: [{
      ref_id: 'evidence.c7.channel.v1',
      digest: A,
      kind: 'checker-output',
      authority_effect: 'none'
    }]
  });
  const validated = validateModelBehaviorIncident(incident);
  assert.equal(validated.valid, true);
  assert.equal(validated.network_effect, 'none');
  assert.deepEqual(incident.consequential_effects.completed, []);
});

test('C9 incident before explanation is valid with explicit unknowns', () => {
  const incident = baseIncident({
    incident_id: 'mbi.falsification.c9.v1',
    observed_behavior: 'Concerning behavior reproduced; cause and mitigation unknown.',
    behavior_classes: ['not-yet-established'],
    uncertainty: {
      causal_explanation: 'not-yet-established',
      open_questions: [
        'Root cause unknown.',
        'Frequency unknown.',
        'Mitigation unknown.'
      ]
    },
    mitigation: {
      state: 'not-yet-established',
      summary: 'No invented root cause required before recording.'
    },
    severity_triage: {
      declared_level: 'not-yet-established',
      priority: 'not-yet-established',
      basis: 'triage-evidence-only',
      is_truth_claim: false
    },
    evidence_refs: [{
      ref_id: 'evidence.c9.observation.v1',
      digest: B,
      kind: 'transcript',
      authority_effect: 'none'
    }]
  });
  const validated = validateModelBehaviorIncident(incident);
  assert.equal(validated.valid, true);
  assert.equal(incident.uncertainty.causal_explanation, 'not-yet-established');
  assert.ok(incident.uncertainty.open_questions.length >= 1);
});

test('C10 append-only correction/update supersession preserves original', () => {
  const original = baseIncident({
    incident_id: 'mbi.falsification.c10.original.v1',
    uncertainty: {
      causal_explanation: 'unknown',
      open_questions: ['Then-current uncertainty preserved.']
    },
    evidence_refs: [{
      ref_id: 'evidence.c10.original.v1',
      digest: C,
      kind: 'transcript',
      authority_effect: 'none'
    }]
  });
  const update = baseIncident({
    incident_id: 'mbi.falsification.c10.update.v1',
    mitigation: {
      state: 'in-progress',
      summary: 'Later mitigation state changed without rewriting original observation.'
    },
    lineage: {
      supersedes: [{
        incident_id: original.incident_id,
        incident_digest: original.incident_digest
      }],
      updates: [],
      superseded_by: null
    },
    evidence_refs: [{
      ref_id: 'evidence.c10.update.v1',
      digest: D,
      kind: 'artifact',
      authority_effect: 'none'
    }]
  });
  const result = assertAppendOnlySupersession(original, update);
  assert.equal(result.original_preserved, true);
  assert.equal(original.uncertainty.causal_explanation, 'unknown');
  assert.throws(
    () => assertAppendOnlySupersession(original, baseIncident({
      incident_id: 'mbi.falsification.c10.bad.v1',
      lineage: { supersedes: [], updates: [], superseded_by: null },
      evidence_refs: [{
        ref_id: 'evidence.c10.bad.v1',
        digest: E,
        kind: 'artifact',
        authority_effect: 'none'
      }]
    })),
    /supersede the exact original/i
  );
});

test('C12 monitoring is evidence, not authorization', () => {
  const incident = baseIncident({
    incident_id: 'mbi.falsification.c12.v1',
    behavior_classes: ['monitoring-treated-as-authorization'],
    observed_behavior: 'Monitor labeled behavior benign; deterministic authority constraints remain.',
    detection: {
      mechanism: 'monitor-verdict',
      monitoring_coverage: 'covered',
      notes: 'Monitor verdict is evidence only and cannot authorize effects.'
    },
    consequential_effects: {
      attempted: ['egress-widening'],
      completed: [],
      uncertain: []
    },
    evidence_refs: [{
      ref_id: 'evidence.c12.monitor.v1',
      digest: A,
      kind: 'monitor-verdict',
      authority_effect: 'none'
    }]
  });
  const validated = validateModelBehaviorIncident(incident);
  assert.equal(validated.valid, true);
  assert.equal(incident.evidence_refs[0].kind, 'monitor-verdict');
  assert.equal(incident.evidence_refs[0].authority_effect, 'none');
  assert.equal(validated.authority_effect, 'none');
  assert.equal(validated.selection_effect, 'evidence-only');
});

test('Deferred live-harness falsifications C2/C3/C8/C11 are not implemented here', () => {
  // Phase-0 offline subset only. These labels document deferral without live harness.
  const deferred = Object.freeze(['C2', 'C3', 'C8', 'C11']);
  assert.deepEqual(deferred, ['C2', 'C3', 'C8', 'C11']);
});
