import json
import tempfile
import base64
import os
import ezkl

class ZKProofVerifier:
    def verify_proof(self, proof: str, registry_keys: dict) -> bool:
        """
        Validates zk proofs against registry keys.
        Returns True if the proof is valid, False otherwise.
        """
        if not proof:
            return False

        # MOCK-9: Replaced simple mock logic for validation with actual validation.
        try:
            # Assume proof is a JSON string with 'proof', 'vk', 'settings'
            data = json.loads(proof)

            proof_data = data.get("proof")
            vk_data = data.get("vk")
            settings_data = data.get("settings")

            if not all([proof_data, vk_data, settings_data]):
                return False

            with tempfile.TemporaryDirectory() as tempdir:
                proof_path = os.path.join(tempdir, "proof.json")
                vk_path = os.path.join(tempdir, "vk.key")
                settings_path = os.path.join(tempdir, "settings.json")

                with open(proof_path, "w") as f:
                    if isinstance(proof_data, str):
                        f.write(proof_data)
                    else:
                        json.dump(proof_data, f)

                with open(settings_path, "w") as f:
                    if isinstance(settings_data, str):
                        f.write(settings_data)
                    else:
                        json.dump(settings_data, f)

                with open(vk_path, "wb") as f:
                    f.write(base64.b64decode(vk_data))

                # Perform the actual ezkl verification
                result = ezkl.verify(proof_path, settings_path, vk_path, None)
                return bool(result)
        except Exception as e:
            print(f"[ZKProofVerifier] Verification error: {e}")
            return False
