import { ValidationError, digestObject } from './canonical.mjs';
import { validateInformationAccessDecision } from '../domain/information-access-decision.mjs';
import { validateReputationQuery } from '../domain/reputation-query.mjs';
import { evaluateContextualReputation } from '../domain/contextual-reputation.mjs';
import { signDerivedReputationClaim } from '../domain/derived-reputation-claim.mjs';
import { buildReputationPresentation } from '../domain/reputation-presentation.mjs';

function assertStore(store) {
  if (!store || typeof store.listAuthorizedSovereignInformation !== 'function') {
    throw new ValidationError('contextual trust projector requires governed sovereign information store');
  }
}

function assertCriterionEvaluators(criterionEvaluators) {
  if (!(criterionEvaluators instanceof Map)) {
    throw new ValidationError('criterionEvaluators must be a Map keyed by exact criterion reference');
  }
}

function assertSigner(identity, name) {
  if (!identity || typeof identity.signObject !== 'function' || !identity.publicKey) {
    throw new ValidationError(`${name} must provide signing identity and public key`);
  }
}

function unresolvedCriterionEvaluator(query) {
  return () => ({
    result: 'unresolved',
    supporting_assertion_refs: [],
    contrary_assertion_refs: [],
    neutral_assertion_refs: [],
    reason_codes: ['criterion_evaluator_unavailable'],
    recommended_ttl_seconds: query.max_claim_ttl_seconds,
    requires_complete_evidence: false
  });
}

export class ContextualTrustProjector {
  constructor({ store, criterionEvaluators, claimSigner, presentationSigner }) {
    assertStore(store);
    assertCriterionEvaluators(criterionEvaluators);
    assertSigner(claimSigner, 'claimSigner');
    assertSigner(presentationSigner, 'presentationSigner');
    this.store = store;
    this.criterionEvaluators = criterionEvaluators;
    this.claimSigner = claimSigner;
    this.presentationSigner = presentationSigner;
  }

  project({ query, disclosureRequest, projectionPolicy, accessDecisions, now }) {
    validateReputationQuery(query);
    if (!Array.isArray(accessDecisions)) {
      throw new ValidationError('accessDecisions must be an array');
    }

    const authorized = this.store.listAuthorizedSovereignInformation({
      requester: query.requester,
      purpose: query.purpose,
      right: 'inspect-full-content',
      decisions: accessDecisions,
      now
    });
    const objects = authorized.items;

    const accessDecisionDigests = accessDecisions.map(decision =>
      digestObject(validateInformationAccessDecision(decision))
    );
    const criterionEvaluator = this.criterionEvaluators.get(query.criterion_ref)
      ?? unresolvedCriterionEvaluator(query);

    const claim = evaluateContextualReputation({
      query,
      objects,
      criterionEvaluator,
      accessDecisionDigests,
      now
    });
    const derived_claim_envelope = signDerivedReputationClaim({
      claim,
      signer: this.claimSigner
    });
    const { projection_result, presentation_envelope } = buildReputationPresentation({
      query,
      derivedClaimEnvelope: derived_claim_envelope,
      claimPublicKey: this.claimSigner.publicKey,
      disclosureRequest,
      projectionPolicy,
      signer: this.presentationSigner,
      now
    });

    return {
      derived_claim_envelope,
      projection_result,
      presentation_envelope
    };
  }
}
