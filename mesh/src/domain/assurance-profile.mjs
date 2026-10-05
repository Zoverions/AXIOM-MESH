import { ValidationError, assertPlainObject } from '../lib/canonical.mjs';
import { assertNoUnknownKeys } from './sovereign-information-common.mjs';

export const ASSURANCE_PROFILE_SCHEMA = 'axiom-assurance-profile.v1';

const DIMENSION_MAPS = Object.freeze({
  data_sensitivity: { public:0, private:1, restricted:2, 'highly-restricted':3, unknown:2 },
  disclosure_breadth: { none:0, bounded:1, broad:2, mass:3, unknown:2 },
  third_party_impact: { none:0, limited:1, material:2, severe:3, unknown:2 },
  monetary_exposure: { none:0, bounded:1, high:2, systemic:3, unknown:2 },
  physical_safety_impact: { none:0, limited:1, material:2, severe:3, unknown:2 },
  legal_regulatory_consequence: { none:0, limited:1, material:2, severe:3, unknown:2 },
  clinical_consequence: { none:0, limited:1, material:2, severe:3, unknown:2 },
  employment_eligibility_consequence: { none:0, limited:1, material:2, severe:3, unknown:2 },
  governance_authority_consequence: { none:0, limited:1, material:2, severe:3, unknown:2 },
  trust_root_impact: { none:0, limited:1, material:2, root:3, unknown:2 },
  reversibility: { reversible:0, recoverable:1, 'hard-to-reverse':2, irreversible:3, unknown:2 },
  affected_population: { one:0, small:1, large:2, mass:3, unknown:2 },
  destination_currentness: { current:0, stale:2, unknown:2 },
  evidence_freshness: { current:0, stale:2, unknown:2 },
  runtime_uncertainty: { low:0, moderate:1, high:2, unknown:2 },
  contestability: { clear:0, disputed:2, unavailable:3, unknown:2 }
});

const PROFILES = ['standard','enhanced','high-assurance','critical-assurance'];
const CONTROLS = Object.freeze({
  standard: ['bounded-inputs'],
  enhanced: ['bounded-inputs','fresh-evidence-check','explicit-destination-check'],
  'high-assurance': ['bounded-inputs','fresh-evidence-check','explicit-destination-check','strong-identity-assurance','enhanced-observability','recovery-or-containment-plan'],
  'critical-assurance': ['bounded-inputs','fresh-evidence-check','explicit-destination-check','strong-identity-assurance','enhanced-observability','recovery-or-containment-plan','independent-verification-when-policy-requires','post-action-reconciliation']
});

export function evaluateAssuranceProfile(consequence) {
  assertPlainObject(consequence,'consequence');
  assertNoUnknownKeys(consequence,'consequence',new Set(Object.keys(DIMENSION_MAPS)));
  let severity = 0;
  const reason_codes = [];
  for (const [dimension, mapping] of Object.entries(DIMENSION_MAPS)) {
    if (!Object.hasOwn(consequence,dimension)) throw new ValidationError(`consequence is missing ${dimension}`);
    const value = consequence[dimension];
    if (!Object.hasOwn(mapping,value)) throw new ValidationError(`${dimension} has invalid value`);
    severity = Math.max(severity,mapping[value]);
    if (value === 'unknown') reason_codes.push(`${dimension}_unknown`);
  }
  const profile = PROFILES[severity];
  return { schema:ASSURANCE_PROFILE_SCHEMA, profile, required_controls:[...CONTROLS[profile]], reason_codes };
}
