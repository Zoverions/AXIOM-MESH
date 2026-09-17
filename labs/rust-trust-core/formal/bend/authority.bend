import Base

# Laboratory-only formal model of the six-input AXIOM authority-v0 abstraction.
# This model is evidence input only. It cannot mint runtime authority.
def allow(
  principal_verified: Bool,
  capability_authorized: Bool,
  consent_required: Bool,
  consent_valid: Bool,
  budget_required: Bool,
  budget_positive: Bool
) -> Bool:
  principal_verified
  && capability_authorized
  && ((~consent_required) || consent_valid)
  && ((~budget_required) || budget_positive)
