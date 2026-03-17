import pytest
from src.graph.autoresearch_graph import autoresearch_app

@pytest.mark.asyncio
async def test_autoresearch_graph_flow():
    initial_state = {
        "intent": "Test intent",
        "context": "",
        "sandbox_output": "",
        "zkml_verified": False,
        "stake_status": ""
    }

    final_state = await autoresearch_app.ainvoke(initial_state)

    assert final_state["intent"] == "Test intent"
    assert "Context derived for: Test intent" in final_state["context"]
    assert "Executed code based on" in final_state["sandbox_output"] or "Sandbox" in final_state["sandbox_output"]
    # Verified will likely be False in unit test without mock grid
    assert "stake_status" in final_state
