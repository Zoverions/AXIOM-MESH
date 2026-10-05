// labs/praxis/effects.mjs
//
// Measured-effect validation: operation/registry agreement and effect envelopes (P0.4).
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { PraxisRuntimeError } from './errors.mjs';

export function validateMeasuredOperationAgainstRegistry(operation, registry) {
  if (!operation || operation.effect === undefined) return;
  if (!registry) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_OPERATION_REQUIRED',
      'measured operation requires the host operation registry at terminal use'
    );
  }
  const measured = registry.operations[operation.host_operation];
  if (!measured) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_OPERATION_REQUIRED',
      'measured host operation ' + operation.host_operation + ' is not registered'
    );
  }
  if (
    measured.action !== operation.action
    || measured.scope !== operation.scope
    || measured.effect !== operation.effect
    || measured.irreversible !== operation.irreversible
    || measured.egress !== operation.egress
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_LINK_MISMATCH',
      'prepared operation no longer matches the host-measured contract'
    );
  }
}

export function validateEffectEnvelope(authority, operation, charterContext) {
  const isMeasured = operation?.effect !== undefined;
  if (!authority?.charter_digest) {
    if (isMeasured) {
      throw new PraxisRuntimeError(
        'PRAXIS_EFFECT_AUTHORITY_REQUIRED',
        'host-measured effects require chartered authority'
      );
    }
    return;
  }
  if (!charterContext) {
    throw new PraxisRuntimeError(
      'PRAXIS_CHARTER_REQUIRED',
      'chartered measured effect requires the signed charter'
    );
  }
  if (authority.charter_digest !== charterContext.digest) {
    throw new PraxisRuntimeError(
      'PRAXIS_CHARTER_SIGNATURE',
      'measured effect authority charter digest mismatch'
    );
  }
  const requester = authority.requester;
  const hasEnvelope = Object.hasOwn(
    charterContext.body.effect_envelopes ?? {},
    requester
  );
  if (!hasEnvelope) {
    if (isMeasured) {
      throw new PraxisRuntimeError(
        'PRAXIS_EFFECT_ENVELOPE_REQUIRED',
        'host-measured effects require an explicit signed requester effect envelope'
      );
    }
    return;
  }
  if (!isMeasured) {
    throw new PraxisRuntimeError(
      'PRAXIS_EFFECT_REQUIRED',
      'requester has a signed effect envelope, so authority requires a host-measured operation'
    );
  }
  const allowed = charterContext.body.effect_envelopes[requester];
  if (!allowed.includes(operation.effect)) {
    throw new PraxisRuntimeError(
      'PRAXIS_EFFECT_ENVELOPE',
      'measured effect ' + operation.effect + ' is outside the requester effect envelope'
    );
  }
}
