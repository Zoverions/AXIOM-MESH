import os
import sys
import pytest
import uuid
import json
from unittest.mock import patch

# Add hypervisor to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

# To test _process_intent_core, we need to import it.
# But it has many dependencies. We can try to test just the `hypervisor_secret` part by extracting or by mocking appropriately if we import `server`.
# Let's import server and mock everything needed, or just extract the relevant snippet.

from src.api.server import _process_intent_core, IntentObject
from src.core.secrets import SecretManager

@pytest.mark.asyncio
async def test_process_intent_core_missing_hypervisor_secret():
    # Setup intent
    intent = IntentObject(
        id=str(uuid.uuid4()),
        content="hello",
        channel="test",
        metadata={"sender": "test_user"},
        timestamp=1704067200
    )

    # To avoid the try/except block catching it and returning IntentResponse, we can check the return.
    # Actually wait, _process_intent_core has a try-except block that returns IntentResponse with status="error" and text "Hypervisor error: {str(e)}"

    # Let's mock evaluate_policy_gate correctly since it returns a tuple

    with patch("src.api.server.context_engine.get_context", return_value="mock_context"), \
         patch("src.api.server.run_in_threadpool", side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)), \
         patch("src.api.server.llm.process", return_value="mock_response"), \
         patch("src.api.server.arena.verify", return_value=True), \
         patch("src.api.server.pulse.measure", return_value=False), \
         patch("src.api.server.evaluate_policy_gate", return_value=(True, [], "")), \
         patch("src.api.server.InferenceOrchestrator.route", return_value={"output": "mock_response"}), \
         patch("src.api.server.is_safe_code", return_value=True), \
         patch("src.api.server.context_engine.miro_mapper.is_operation_allowed", return_value=True), \
         patch("src.core.secrets.SecretManager.get_secret", return_value=None):

        # It should catch RuntimeError because HYPERVISOR_SECRET is missing, and return IntentResponse with error
        res = await _process_intent_core(intent, "mock_api_key")

        assert res.status == "error"
        assert "HYPERVISOR_SECRET" in res.response

@pytest.mark.asyncio
async def test_process_intent_core_with_hypervisor_secret():
    # Setup intent
    intent = IntentObject(
        id=str(uuid.uuid4()),
        content="hello",
        channel="test",
        metadata={"sender": "test_user"},
        timestamp=1704067200
    )

    with patch("src.api.server.context_engine.get_context", return_value="mock_context"), \
         patch("src.api.server.run_in_threadpool", side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)), \
         patch("src.api.server.llm.process", return_value="mock_response"), \
         patch("src.api.server.arena.verify", return_value=True), \
         patch("src.api.server.pulse.measure", return_value=False), \
         patch("src.api.server.evaluate_policy_gate", return_value=(True, [], "")), \
         patch("src.api.server.InferenceOrchestrator.route", return_value={"output": "mock_response"}), \
         patch("src.api.server.is_safe_code", return_value=True), \
         patch("src.api.server.context_engine.miro_mapper.is_operation_allowed", return_value=True), \
         patch("src.core.secrets.SecretManager.get_secret", return_value="super_secret_value"):

        # This shouldn't raise RuntimeError due to HYPERVISOR_SECRET, and we mock enough to get success
        res = await _process_intent_core(intent, "mock_api_key")

        # Depending on other mocks, this may still fail but we only care about the specific RuntimeError
        if res.status == "error" and "HYPERVISOR_SECRET is not configured" in res.response:
            pytest.fail("HYPERVISOR_SECRET error raised even though it was configured")
