import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAssuranceProfile } from '../src/domain/assurance-profile.mjs';

function baseline(overrides={}){return {data_sensitivity:'public',disclosure_breadth:'none',third_party_impact:'none',monetary_exposure:'none',physical_safety_impact:'none',legal_regulatory_consequence:'none',clinical_consequence:'none',employment_eligibility_consequence:'none',governance_authority_consequence:'none',trust_root_impact:'none',reversibility:'reversible',affected_population:'one',destination_currentness:'current',evidence_freshness:'current',runtime_uncertainty:'low',contestability:'clear',...overrides};}

test('low consequence returns standard assurance without granting permission',()=>{const result=evaluateAssuranceProfile(baseline());assert.equal(result.profile,'standard');assert.equal(Object.hasOwn(result,'allowed'),false);assert.equal(Object.hasOwn(result,'authorized'),false);assert.equal(Object.hasOwn(result,'requires_human_confirmation'),false);});

test('high consequence increases safeguards rather than automatically denying',()=>{const result=evaluateAssuranceProfile(baseline({data_sensitivity:'highly-restricted',clinical_consequence:'severe',reversibility:'irreversible'}));assert.equal(result.profile,'critical-assurance');assert.ok(result.required_controls.includes('strong-identity-assurance'));assert.ok(result.required_controls.includes('independent-verification-when-policy-requires'));assert.ok(result.required_controls.includes('recovery-or-containment-plan'));assert.equal(Object.hasOwn(result,'deny'),false);});

test('unknown consequence dimensions select stricter assurance with stable reasons',()=>{const result=evaluateAssuranceProfile(baseline({evidence_freshness:'unknown'}));assert.equal(result.profile,'high-assurance');assert.ok(result.reason_codes.includes('evidence_freshness_unknown'));});
