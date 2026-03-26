import pytest
from src.sdk.citizen_sdk import CitizenDigitalEntity
from src.agents.gov_service_agent import GovServiceAgent

def test_citizen_grants_and_revokes_consent():
    citizen = CitizenDigitalEntity(did="did:citizen:123")
    citizen.add_credential("health_record", "asthma")

    assert citizen.verify_consent("health_service", "health_record") == False

    citizen.grant_consent("health_service", ["health_record"])
    assert citizen.verify_consent("health_service", "health_record") == True

    citizen.revoke_consent("health_service", "health_record")
    assert citizen.verify_consent("health_service", "health_record") == False

def test_gov_service_agent_process_request():
    citizen = CitizenDigitalEntity(did="did:citizen:456")
    citizen.add_credential("tax_id", "ABC-123")

    agent = GovServiceAgent(service_id="tax_service", required_scope="tax_id")

    # Denied: no consent
    response = agent.process_service_request(citizen)
    assert response["status"] == "denied"
    assert "lacks required consent scope" in response["reason"]

    # Approved: granted consent
    citizen.grant_consent("tax_service", ["tax_id"])
    response = agent.process_service_request(citizen)
    assert response["status"] == "approved"
    assert response["data_accessed"] == "ABC-123"

def test_gov_service_agent_missing_credential():
    citizen = CitizenDigitalEntity(did="did:citizen:789")

    agent = GovServiceAgent(service_id="health_service", required_scope="health_record")
    citizen.grant_consent("health_service", ["health_record"])

    response = agent.process_service_request(citizen)
    assert response["status"] == "error"
    assert "not found in vault" in response["reason"]
