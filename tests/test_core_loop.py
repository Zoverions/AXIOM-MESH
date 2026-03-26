import pytest

def test_core_loop_enforcement():
    loop_state = []
    def execute_step(step):
        if step == "Plan" and "Intent" not in loop_state: raise Exception("Missing Intent")
        if step == "Capability Manifest" and "Plan" not in loop_state: raise Exception("Missing Plan")
        if step == "Sandbox Execution" and "Capability Manifest" not in loop_state: raise Exception("Missing Manifest")
        if step == "Attestation" and "Sandbox Execution" not in loop_state: raise Exception("Missing Execution")
        if step == "Response Shaping" and "Attestation" not in loop_state: raise Exception("Missing Attestation")
        loop_state.append(step)

    # Valid sequence
    for s in ["Intent", "Plan", "Capability Manifest", "Sandbox Execution", "Attestation", "Response Shaping"]:
        execute_step(s)

    # Invalid sequence
    loop_state = []
    with pytest.raises(Exception, match="Missing Manifest"):
        execute_step("Intent")
        execute_step("Plan")
        execute_step("Sandbox Execution")
