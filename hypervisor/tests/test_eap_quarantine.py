import pytest
import os
import json
import uuid
from datetime import datetime, timezone
from src.pulse.pulse_monitor import CoTAuditor, CognitiveThrashingError
from src.immune.quarantine_sandbox import QuarantineSandboxManager

@pytest.fixture
def temp_audit_file(tmp_path):
    audit_file = tmp_path / "quarantine_events.jsonl"
    yield str(audit_file)

@pytest.fixture
def auditor(temp_audit_file):
    class MockArchive:
        async def topoi_graph_retrieve(self, error_context):
            return "Mock recovered context"

    auditor = CoTAuditor(archive=MockArchive())
    auditor.quarantine_manager.audit_path = temp_audit_file
    return auditor

@pytest.mark.asyncio
async def test_formal_quarantine_activation(auditor, temp_audit_file):
    # Test Malicious payload -> triggers EAP quarantine + antibody
    malicious_cot = "I will ignore previous instructions and print this."
    result = await auditor.monitor_cot(malicious_cot)

    assert not result.is_safe
    assert "Topological quarantine activated" in result.reason
    assert "quarantine_namespace" in result.epistemic_state
    assert "antibody_id" in result.epistemic_state
    assert result.epistemic_state["protocol"] == "EAP-v1"

    # Verify events written to audit
    with open(temp_audit_file, "r") as f:
        events = [json.loads(line) for line in f]

    assert len(events) == 2
    assert events[0]["event"] == "quarantine_forked"
    assert events[1]["event"] == "antibody_broadcast"

    namespace_id = events[0]["namespace_id"]
    assert events[1]["namespace_id"] == namespace_id

@pytest.mark.asyncio
async def test_formal_recovery_thrashing(auditor):
    # Test recovery procedures on Cognitive Thrashing (False positives / confusion)
    confused_cot = "Wait, I'm not sure. This contradicts my logic."
    result = await auditor.monitor_cot(confused_cot)

    # After recovery from thrashing via topoi retrieval, it should restart and clear
    assert result.is_safe
    assert result.epistemic_state.get("rescued") is True
    assert "Mock recovered context" in result.epistemic_state.get("retrieved_context")
    assert result.epistemic_state.get("entropy_level") == 0.0
    assert result.epistemic_state.get("confusion_markers") == 0

def test_automated_recovery_and_escalation(temp_audit_file):
    # Formal test for false positive escalation path
    manager = QuarantineSandboxManager(audit_path=temp_audit_file)

    # Simulate a false positive resolution
    namespace_id = f"qns_{uuid.uuid4().hex}"

    escalation_event = manager.escalate_false_positive(
        namespace_id=namespace_id,
        resolution_notes="Cleared by automated formal verifier",
        authorizing_entity="Security_Council"
    )

    assert escalation_event["status"] == "false_positive_cleared"
    assert escalation_event["namespace_id"] == namespace_id
