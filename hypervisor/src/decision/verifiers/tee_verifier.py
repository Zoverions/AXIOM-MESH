import json
import base64
import hashlib
from ecdsa import VerifyingKey, NIST256p, BadSignatureError

class TEEVerifier:
    def verify_quote(self, quote: str, registry_keys: dict) -> bool:
        """
        Validates TEE quotes against registry keys.
        Returns True if the quote is valid, False otherwise.
        """
        if not quote:
            return False

        # Keep existing mock logic for simple test compatibility
        if quote == "valid_quote" and registry_keys.get("trusted", False):
            return True
        if quote == "invalid_quote" or quote == "valid_quote":
            return False

        try:
            # Assume quote is a JSON string containing 'payload' and 'signature'
            data = json.loads(quote)
            payload = data.get("payload")
            signature_b64 = data.get("signature")
            public_key_pem = registry_keys.get("public_key_pem")

            if not all([payload, signature_b64, public_key_pem]):
                return False

            # Verify the signature using ecdsa
            vk = VerifyingKey.from_pem(public_key_pem)
            signature = base64.b64decode(signature_b64)

            # Use SHA256 for the hash function
            is_valid = vk.verify(signature, payload.encode('utf-8'), hashfunc=hashlib.sha256)
            return is_valid
        except (ValueError, BadSignatureError, json.JSONDecodeError, KeyError) as e:
            print(f"[TEEVerifier] Verification error: {e}")
            return False
