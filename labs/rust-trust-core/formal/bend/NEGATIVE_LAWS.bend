import Base
import ./authority.bend as Authority

# Intentionally false control: a fully satisfied authority state is not a denial.
# CI must prove that the pinned Bend checker rejects the attempted proof.
law fully_satisfied_denies:
  {Authority.allow(True{}, True{}, True{}, True{}, True{}, True{}) == False{} : Bool}
