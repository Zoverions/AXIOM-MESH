import pytest
from langgraph.graph import StateGraph
from src.graph.autoresearch_graph import autoresearch_app

@pytest.mark.asyncio
async def test_resource_balancer_grid():
    initial_state = {
        "intent": "Research consensus mechanisms and grid stability",
        "context": "",
        "routing_decision": "",
        "priority_tag": "",
        "treasury_split": {},
        "sandbox_output": "",
        "zkml_verified": False,
        "stake_status": ""
    }

    result = await autoresearch_app.ainvoke(initial_state)

    assert result["routing_decision"] == "grid"
    assert result["priority_tag"] == "high"
    assert result["treasury_split"]["network_security_fund"] == 0.60
    assert result["treasury_split"]["wealth_generation_pool"] == 0.40
    assert "firewalls" in result["treasury_split"]["security_upgrades_applied"]

@pytest.mark.asyncio
async def test_resource_balancer_l1():
    initial_state = {
        "intent": "Settle the outstanding balance to L1 chain",
        "context": "",
        "routing_decision": "",
        "priority_tag": "",
        "treasury_split": {},
        "sandbox_output": "",
        "zkml_verified": False,
        "stake_status": ""
    }

    result = await autoresearch_app.ainvoke(initial_state)

    assert result["routing_decision"] == "l1"
    assert result["priority_tag"] == "critical"
    assert "audits" in result["treasury_split"]["security_upgrades_applied"]

@pytest.mark.asyncio
async def test_resource_balancer_peer():
    initial_state = {
        "intent": "Offload simple computation to peer node",
        "context": "",
        "routing_decision": "",
        "priority_tag": "",
        "treasury_split": {},
        "sandbox_output": "",
        "zkml_verified": False,
        "stake_status": ""
    }

    result = await autoresearch_app.ainvoke(initial_state)

    assert result["routing_decision"] == "peer"
    assert result["priority_tag"] == "low"
    assert len(result["treasury_split"]["security_upgrades_applied"]) == 0

@pytest.mark.asyncio
async def test_resource_balancer_local():
    initial_state = {
        "intent": "Run simple python task",
        "context": "",
        "routing_decision": "",
        "priority_tag": "",
        "treasury_split": {},
        "sandbox_output": "",
        "zkml_verified": False,
        "stake_status": ""
    }

    result = await autoresearch_app.ainvoke(initial_state)

    assert result["routing_decision"] == "local"
    assert result["priority_tag"] == "normal"
    assert len(result["treasury_split"]["security_upgrades_applied"]) == 0
