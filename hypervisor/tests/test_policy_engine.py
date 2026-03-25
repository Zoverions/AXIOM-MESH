import pytest
import time
from unittest.mock import patch, mock_open

from src.core.policy_engine import PolicyEngine

class MockIntent:
    def __init__(self, content="", metadata=None):
        self.content = content
        self.metadata = metadata or {}

@pytest.fixture
def policy_engine():
    # Provide an empty schema file to default properties
    with patch("builtins.open", mock_open(read_data='{}')):
        return PolicyEngine("dummy_schema.json")

def test_revoked_consent_hard_fail(policy_engine):
    intent = MockIntent(
        content="/query_data",
        metadata={
            "consent_scope": "revoked"
        }
    )
    is_allowed, decisions, reason = policy_engine.evaluate(intent)
    assert not is_allowed
    assert reason == "Emergency Revoke: consent scope is strictly revoked"

def test_expired_consent_hard_fail(policy_engine):
    past_time = time.time() - 3600 # 1 hour ago
    intent = MockIntent(
        content="/query_data",
        metadata={
            "consent_scope": "allowed",
            "consent_expiry": past_time
        }
    )
    is_allowed, decisions, reason = policy_engine.evaluate(intent)
    assert not is_allowed
    assert decisions["consent_expired"] is True
    assert reason == "Consent expired"

def test_malformed_expiry_hard_fail(policy_engine):
    intent = MockIntent(
        content="/query_data",
        metadata={
            "consent_scope": "allowed",
            "consent_expiry": "invalid_date"
        }
    )
    is_allowed, decisions, reason = policy_engine.evaluate(intent)
    assert not is_allowed
    assert decisions["consent_expired"] is True
    assert reason == "Consent expired"

def test_overbroad_scope_request_hard_fail():
    # Mocking a rule file with allowed purposes
    rules_data = '{"properties": {"consent": {"properties": {"purpose": {"enum": ["health_check", "billing"]}}}}}'
    with patch("builtins.open", mock_open(read_data=rules_data)):
        engine = PolicyEngine("dummy_schema.json")

        intent = MockIntent(
            content="/query_data",
            metadata={
                "consent_scope": "allowed",
                "purpose_code": "marketing" # Overbroad or unapproved scope
            }
        )
        is_allowed, decisions, reason = engine.evaluate(intent)
        assert not is_allowed
        assert decisions["purpose_valid"] is False
        assert reason == "Purpose limitation violation: overbroad scope request"

def test_valid_request(policy_engine):
    future_time = time.time() + 3600 # 1 hour in future
    intent = MockIntent(
        content="/query_data",
        metadata={
            "consent_scope": "allowed",
            "consent_expiry": future_time
        }
    )
    is_allowed, decisions, reason = policy_engine.evaluate(intent)
    assert is_allowed
    assert reason == "ok"
