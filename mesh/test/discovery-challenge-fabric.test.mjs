import assert from 'node:assert/strict';
import test from 'node:test';

const MODULE_URL = new URL('../src/lib/discovery-challenge-fabric.mjs', import.meta.url);

async function loadDcf() {
  return import(MODULE_URL.href);
}

test('DCF v0 exports five zero-authority contract surfaces', async () => {
  const dcf = await loadDcf();

  assert.equal(
    dcf.DISCOVERY_SOURCE_ENVELOPE_SCHEMA,
    'axiom-discovery-source-envelope.v0'
  );
  assert.equal(
    dcf.DISCOVERY_INSIGHT_CANDIDATE_SCHEMA,
    'axiom-discovery-insight-candidate.v0'
  );
  assert.equal(dcf.BLINDSPOT_RECORD_SCHEMA, 'axiom-blindspot-record.v0');
  assert.equal(
    dcf.ARCHITECTURE_IMPACT_RECORD_SCHEMA,
    'axiom-architecture-impact-record.v0'
  );
  assert.equal(
    dcf.DISCOVERY_REVIEW_DISPOSITION_SCHEMA,
    'axiom-discovery-review-disposition.v0'
  );

  assert.equal(typeof dcf.validateDiscoverySourceEnvelope, 'function');
  assert.equal(typeof dcf.validateDiscoveryInsightCandidate, 'function');
  assert.equal(typeof dcf.validateBlindspotRecord, 'function');
  assert.equal(typeof dcf.validateArchitectureImpactRecord, 'function');
  assert.equal(typeof dcf.validateDiscoveryReviewDisposition, 'function');
});
