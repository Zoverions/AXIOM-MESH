import Base
import ./authority.bend as Authority

# A failed principal-verification gate is deny-dominant.
law unverified_principal_never_allows:
  for capability_authorized: Bool
  for consent_required: Bool
  for consent_valid: Bool
  for budget_required: Bool
  for budget_positive: Bool
  {Authority.allow(False{}, capability_authorized, consent_required, consent_valid, budget_required, budget_positive) == False{} : Bool}

# A failed capability gate is deny-dominant.
law unauthorized_capability_never_allows:
  for principal_verified: Bool
  for consent_required: Bool
  for consent_valid: Bool
  for budget_required: Bool
  for budget_positive: Bool
  {Authority.allow(principal_verified, False{}, consent_required, consent_valid, budget_required, budget_positive) == False{} : Bool}

# Required consent must be valid.
law required_invalid_consent_never_allows:
  for principal_verified: Bool
  for capability_authorized: Bool
  for budget_required: Bool
  for budget_positive: Bool
  {Authority.allow(principal_verified, capability_authorized, True{}, False{}, budget_required, budget_positive) == False{} : Bool}

# A required effect budget must remain positive.
law required_exhausted_budget_never_allows:
  for principal_verified: Bool
  for capability_authorized: Bool
  for consent_required: Bool
  for consent_valid: Bool
  {Authority.allow(principal_verified, capability_authorized, consent_required, consent_valid, True{}, False{}) == False{} : Bool}

# The fully satisfied required state is admitted.
law all_required_conditions_satisfied_allows:
  {Authority.allow(True{}, True{}, True{}, True{}, True{}, True{}) == True{} : Bool}

# If consent is not required, its validity bit cannot independently deny.
law optional_consent_state_cannot_deny:
  for consent_valid: Bool
  {Authority.allow(True{}, True{}, False{}, consent_valid, True{}, True{}) == True{} : Bool}

# If an effect budget is not required, its remaining-state bit cannot independently deny.
law optional_budget_state_cannot_deny:
  for budget_positive: Bool
  {Authority.allow(True{}, True{}, True{}, True{}, False{}, budget_positive) == True{} : Bool}
