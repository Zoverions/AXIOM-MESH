import pytest
from src.governance.closure_simulator import StatutePolicyEncoder, GovernanceClosureSimulator

def test_encode_and_evaluate_closure():
    # Arrange
    encoder = StatutePolicyEncoder()
    simulator = GovernanceClosureSimulator(encoder)

    # Encode a health data sharing policy
    policy_name = "HealthData_Consent_Policy_v1"
    conditions = {
        "user_consent_granted": True,
        "requesting_entity_certified": True,
        "data_anonymized": False,
        "audit_log_active": True
    }
    encoder.encode_policy(policy_name, conditions)

    # Act / Assert

    # 1. Matching state achieves closure
    valid_state = {
        "user_consent_granted": True,
        "requesting_entity_certified": True,
        "data_anonymized": False,
        "audit_log_active": True,
        "timestamp": "2026-03-24T12:00:00Z" # Extra state is ignored
    }
    result, msg = simulator.evaluate_closure(valid_state, policy_name)
    assert result is True
    assert msg == "Closure achieved"

    # 2. Missing key fails closure
    missing_key_state = {
        "user_consent_granted": True,
        "requesting_entity_certified": True,
        "data_anonymized": False
        # missing audit_log_active
    }
    result, msg = simulator.evaluate_closure(missing_key_state, policy_name)
    assert result is False
    assert "Missing required state key: 'audit_log_active'" in msg

    # 3. Mismatched value fails closure
    invalid_value_state = {
        "user_consent_granted": True,
        "requesting_entity_certified": False, # Should be True
        "data_anonymized": False,
        "audit_log_active": True
    }
    result, msg = simulator.evaluate_closure(invalid_value_state, policy_name)
    assert result is False
    assert "Condition failed for 'requesting_entity_certified': expected True, got False" in msg

    # 4. Unknown policy fails closure
    result, msg = simulator.evaluate_closure(valid_state, "Unknown_Policy")
    assert result is False
    assert "not found" in msg
