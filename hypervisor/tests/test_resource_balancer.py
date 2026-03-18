import pytest
from src.graph.resource_balancer import resource_balancer_app
from src.engine.alignment import AlignmentProfile
import os

@pytest.mark.asyncio
async def test_resource_balancer_routing_critical():
    initial_state = {
        "intent": "Execute high value smart contract",
        "priority_tag": "critical",
        "selected_route": "",
        "metrics": {}
    }

    final_state = await resource_balancer_app.ainvoke(initial_state)
    assert final_state["selected_route"] == "grid"

@pytest.mark.asyncio
async def test_resource_balancer_routing_low():
    initial_state = {
        "intent": "Run background data sync",
        "priority_tag": "low",
        "selected_route": "",
        "metrics": {"local_load": 0.9} # Simulate high local load
    }

    final_state = await resource_balancer_app.ainvoke(initial_state)
    # The analyze_metrics node currently overrides the initial metrics,
    # let's assert the logic in evaluate_route works as intended based on the system metrics
    # (which are mocked to 0.7 load in the file). Since 0.7 > 0.5, it should route to p2p.
    assert final_state["selected_route"] == "p2p"

def test_alignment_profile_init_and_update(tmp_path):
    # Test initialization
    storage_path = str(tmp_path / "test_alignment_profile.json")
    if os.path.exists(storage_path):
        os.remove(storage_path)
    profile = AlignmentProfile(storage_path=storage_path)

    prof_data = profile.get_profile()
    assert "subject_did" in prof_data
    assert prof_data["subject_did"].startswith("did:axiom:")
    assert "goals" in prof_data
    assert prof_data["risk_tolerance"] == "balanced"

    # Test priority tag update without bicameral approval
    with pytest.raises(PermissionError):
        profile.update_priority_tag("critical", 10.0, bicameral_approval=False)

    # Test priority tag update with bicameral approval
    profile.update_priority_tag("critical", 10.0, bicameral_approval=True)
    assert profile.get_priority_weight("critical") == 10.0

    # Test normal tag update
    profile.update_priority_tag("user_pref", 2.0)
    assert profile.get_priority_weight("user_pref") == 2.0
