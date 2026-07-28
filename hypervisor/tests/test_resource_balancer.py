import json
import os

import pytest

from src.engine.alignment import AlignmentProfile
from src.graph.resource_balancer import resource_balancer_app, SystemMetrics


@pytest.mark.asyncio
async def test_resource_balancer_routing_critical():
    initial_state = {
        "intent": "Execute high value smart contract",
        "priority_tag": "critical",
        "selected_route": "",
        "metrics": {},
    }

    final_state = await resource_balancer_app.ainvoke(initial_state)
    assert final_state["selected_route"] == "grid"


@pytest.mark.asyncio
async def test_resource_balancer_routing_low():
    initial_state = {
        "intent": "Run background data sync",
        "priority_tag": "low",
        "selected_route": "",
        "metrics": {"local_load": 0.9},
    }

    final_state = await resource_balancer_app.ainvoke(initial_state)
    assert final_state["selected_route"] == "p2p"


def test_alignment_profile_init_and_update(tmp_path):
    storage_path = str(tmp_path / "test_alignment_profile.json")
    if os.path.exists(storage_path):
        os.remove(storage_path)
    profile = AlignmentProfile(storage_path=storage_path)

    prof_data = profile.get_profile()
    assert "subject_did" in prof_data
    assert prof_data["subject_did"].startswith("did:axiom:")
    assert "goals" in prof_data
    assert prof_data["risk_tolerance"] == "balanced"

    with pytest.raises(PermissionError):
        profile.update_priority_tag("critical", 10.0, bicameral_approval=False)

    profile.update_priority_tag("critical", 10.0, bicameral_approval=True)
    assert profile.get_priority_weight("critical") == 10.0

    profile.update_priority_tag("user_pref", 2.0)
    assert profile.get_priority_weight("user_pref") == 2.0


@pytest.mark.asyncio
async def test_resource_balancer_shared_machine_pressure_routes_offbox(tmp_path, monkeypatch):
    profile_path = tmp_path / "machine_profile.json"
    profile_path.write_text(
        json.dumps(
            {
                "machine_role": "shared-machine",
                "local_load_threshold": 0.6,
                "memory_pressure_threshold": 0.7,
            }
        )
    )
    monkeypatch.setenv("MACHINE_PROFILE_PATH", str(profile_path))

    initial_state = {
        "intent": "run indexing task",
        "priority_tag": "normal",
        "selected_route": "",
        "metrics": {"local_load": 0.85, "memory_pressure": 0.8, "p2p_latency": 0.2},
    }

    final_state = await resource_balancer_app.ainvoke(initial_state)
    assert final_state["selected_route"] == "p2p"


@pytest.mark.asyncio
async def test_resource_balancer_dedicated_machine_keeps_local(tmp_path, monkeypatch):
    profile_path = tmp_path / "machine_profile.json"
    profile_path.write_text(
        json.dumps(
            {
                "machine_role": "dedicated-mesh",
                "local_load_threshold": 0.95,
                "memory_pressure_threshold": 0.95,
            }
        )
    )
    monkeypatch.setenv("MACHINE_PROFILE_PATH", str(profile_path))

    initial_state = {
        "intent": "run local batch",
        "priority_tag": "normal",
        "selected_route": "",
        "metrics": {"local_load": 0.7, "memory_pressure": 0.5, "p2p_latency": 0.2},
    }

    final_state = await resource_balancer_app.ainvoke(initial_state)
    assert final_state["selected_route"] == "local"


def test_system_metrics_get_local_load_oserror(monkeypatch):
    def mock_getloadavg():
        raise OSError("Mocked OSError")

    monkeypatch.setattr(os, "getloadavg", mock_getloadavg)

    from src.graph.resource_balancer import SystemMetrics

    assert SystemMetrics.get_local_load() == 0.7
