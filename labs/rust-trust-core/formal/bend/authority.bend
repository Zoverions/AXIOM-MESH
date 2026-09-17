import Base

# Laboratory-only formal model of the six-input AXIOM authority-v0 abstraction.
# This model is evidence input only. It cannot mint runtime authority.
def budget_ok(required: Bool, positive: Bool) -> Bool:
  match required:
    case False{}:
      True{}
    case True{}:
      positive

def allow(
  principal_verified: Bool,
  capability_authorized: Bool,
  consent_required: Bool,
  consent_valid: Bool,
  budget_required: Bool,
  budget_positive: Bool
) -> Bool:
  match principal_verified:
    case False{}:
      False{}
    case True{}:
      match capability_authorized:
        case False{}:
          False{}
        case True{}:
          match consent_required:
            case False{}:
              budget_ok(budget_required, budget_positive)
            case True{}:
              match consent_valid:
                case False{}:
                  False{}
                case True{}:
                  budget_ok(budget_required, budget_positive)
