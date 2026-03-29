from src.sdk.citizen_sdk import CitizenDigitalEntity

class GovServiceAgent:
    """
    GovServiceAgent is a pre-built government service agent responsible for
    processing and validating service requests from citizens, governed by
    cryptographic consent schemas.
    """
    def __init__(self, service_id: str, required_scope: str):
        self.service_id = service_id
        self.required_scope = required_scope

    def process_service_request(self, citizen: CitizenDigitalEntity) -> dict:
        """
        Process a service request for a digital citizen.
        Fails closed if the citizen does not provide the correct consent scope.
        """
        has_consent = citizen.verify_consent(self.service_id, self.required_scope)

        if not has_consent:
            return {
                "status": "denied",
                "reason": f"Citizen {citizen.did} lacks required consent scope: {self.required_scope} for service {self.service_id}"
            }

        # Access the credential selectively authorized
        credential_value = citizen.get_credential(self.required_scope)
        if not credential_value:
             return {
                "status": "error",
                "reason": f"Consent granted but credential {self.required_scope} not found in vault."
            }

        return {
            "status": "approved",
            "message": f"Service request approved for citizen {citizen.did}.",
            "data_accessed": credential_value
        }
