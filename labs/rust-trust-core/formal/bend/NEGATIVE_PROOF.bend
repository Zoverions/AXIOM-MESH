import Base
import ./authority.bend as Authority
import ./NEGATIVE_LAWS.bend as NegativeLaws

# This body is intentionally invalid. A working checker must reject it.
def NegativeLaws.fully_satisfied_denies():
  {==}
