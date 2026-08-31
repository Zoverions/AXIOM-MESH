import { ValidationError } from './canonical.mjs';

export const DISCOVERY_SOURCE_ENVELOPE_SCHEMA =
  'axiom-discovery-source-envelope.v0';
export const DISCOVERY_INSIGHT_CANDIDATE_SCHEMA =
  'axiom-discovery-insight-candidate.v0';
export const BLINDSPOT_RECORD_SCHEMA = 'axiom-blindspot-record.v0';
export const ARCHITECTURE_IMPACT_RECORD_SCHEMA =
  'axiom-architecture-impact-record.v0';
export const DISCOVERY_REVIEW_DISPOSITION_SCHEMA =
  'axiom-discovery-review-disposition.v0';

function unimplemented(name) {
  throw new ValidationError(`${name} validation is not implemented`);
}

export function validateDiscoverySourceEnvelope() {
  return unimplemented('Discovery Source Envelope v0');
}

export function validateDiscoveryInsightCandidate() {
  return unimplemented('Discovery Insight Candidate v0');
}

export function validateBlindspotRecord() {
  return unimplemented('Blindspot Record v0');
}

export function validateArchitectureImpactRecord() {
  return unimplemented('Architecture Impact Record v0');
}

export function validateDiscoveryReviewDisposition() {
  return unimplemented('Discovery Review Disposition v0');
}
