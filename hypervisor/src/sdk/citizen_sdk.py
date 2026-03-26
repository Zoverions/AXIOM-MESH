from typing import Dict, List

class CitizenDigitalEntity:
    """
    CitizenDigitalEntity represents a digital citizen identity (SSI-first).
    It manages Decentralized Identifiers (DIDs), verifiable credentials,
    and selective consent disclosure.
    """
    def __init__(self, did: str):
        self.did = did
        self.credentials: Dict[str, str] = {}
        self.consents: Dict[str, List[str]] = {}

    def add_credential(self, name: str, value: str):
        """Adds a verifiable credential to the citizen's vault."""
        self.credentials[name] = value

    def get_credential(self, name: str) -> str:
        """Retrieves a credential from the vault."""
        return self.credentials.get(name)

    def grant_consent(self, service_id: str, scopes: List[str]):
        """Grants selective disclosure consent to a specific service."""
        if service_id not in self.consents:
            self.consents[service_id] = []
        for scope in scopes:
            if scope not in self.consents[service_id]:
                self.consents[service_id].append(scope)

    def revoke_consent(self, service_id: str, scope: str):
        """Revokes a specific consent scope from a service."""
        if service_id in self.consents and scope in self.consents[service_id]:
            self.consents[service_id].remove(scope)

    def verify_consent(self, service_id: str, required_scope: str) -> bool:
        """Verifies if the citizen has granted the required scope to the service."""
        return service_id in self.consents and required_scope in self.consents[service_id]
