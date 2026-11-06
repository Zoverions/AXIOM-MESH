import Base
import ./authority.bend as Authority
import ./LAWS.bend as Laws

# False at the first deny-dominant gate normalizes the whole decision to False.
def Laws.unverified_principal_never_allows(
  capability_authorized,
  consent_required,
  consent_valid,
  budget_required,
  budget_positive
):
  {==}

# Once the principal gate is inspected, an unauthorized capability normalizes to False.
def Laws.unauthorized_capability_never_allows(
  principal_verified,
  consent_required,
  consent_valid,
  budget_required,
  budget_positive
):
  match principal_verified:
    case False{}:
      {==}
    case True{}:
      {==}

# Required invalid consent is deny-dominant once earlier gates are reduced.
def Laws.required_invalid_consent_never_allows(
  principal_verified,
  capability_authorized,
  budget_required,
  budget_positive
):
  match principal_verified:
    case False{}:
      {==}
    case True{}:
      match capability_authorized:
        case False{}:
          {==}
        case True{}:
          {==}

# Required exhausted budget is deny-dominant after the earlier consent gate is reduced.
def Laws.required_exhausted_budget_never_allows(
  principal_verified,
  capability_authorized,
  consent_required,
  consent_valid
):
  match principal_verified:
    case False{}:
      {==}
    case True{}:
      match capability_authorized:
        case False{}:
          {==}
        case True{}:
          match consent_required:
            case False{}:
              {==}
            case True{}:
              match consent_valid:
                case False{}:
                  {==}
                case True{}:
                  {==}

# Fully satisfied required gates normalize to True.
def Laws.all_required_conditions_satisfied_allows():
  {==}

# Optional consent cannot deny solely because its validity bit is false.
def Laws.optional_consent_state_cannot_deny(consent_valid):
  match consent_valid:
    case False{}:
      {==}
    case True{}:
      {==}

# Optional effect budget cannot deny solely because its remaining-state bit is false.
def Laws.optional_budget_state_cannot_deny(budget_positive):
  match budget_positive:
    case False{}:
      {==}
    case True{}:
      {==}
