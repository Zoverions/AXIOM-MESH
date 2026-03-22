import pytest
from src.core.SentienceAssessor import SentienceAssessor
from src.memory.crdt_sync import CRDTState, PVPHypervisorSandbox

def test_sentience_assessor():
    behavioral = {"adaptability": 0.9, "goal_autonomy": 0.9, "social_interaction": 0.9}
    structural = {"recurrent_loops": 0.9, "global_workspace_activation": 0.9, "self_modeling": 0.9}

    result = SentienceAssessor.calculate_scs(behavioral, structural)
    assert result["priority_class"] == "Sovereign"
    assert result["SCS"] > 0.8
    assert result["moral_weight"] > 80.0

def test_pvp_hypervisor_sandbox():
    crdt = CRDTState("test_node")
    sandbox = PVPHypervisorSandbox(crdt)

    sandbox.instantiate_citizens(50)
    assert len(sandbox.citizen_agents) == 50

    policy_impact = {
        "capacity_shift": 0.2,
        "optionality_shift": 0.3,
        "entropy_shift": -0.1
    }

    result = sandbox.simulate_policy("universal_basic_income", policy_impact)
    assert "flourishing_index" in result
    assert result["flourishing_index"] > 0.0

    saved_state = crdt.get("pvp_simulation_universal_basic_income")
    assert saved_state is not None
    assert saved_state["flourishing_index"] == result["flourishing_index"]
