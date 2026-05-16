import qrcode
import os
import ast
import time
from cryptography.fernet import Fernet

class ConsentManifest:
    def __init__(self, data_category: str, purpose: str, retention_period: int):
        self.data_category = data_category
        self.purpose = purpose
        self.retention_period = retention_period
        self.timestamp = int(time.time())

    def to_dict(self):
        return {
            "data_category": self.data_category,
            "purpose": self.purpose,
            "retention_period": self.retention_period,
            "timestamp": self.timestamp
        }

class AirGapConsent:
    @staticmethod
    def generate_qr_consent(shadow_node_instance):
        """Generate QR code for physical air-gap consent (USB scan or phone camera)"""
        consent_data = {
            "action": "ENABLE_SHADOW_BRIDGE",
            "phantomDIDHash": shadow_node_instance.phantom_did,
            "timestamp": int(os.times()[0]),
            "nonce": os.urandom(16).hex()
        }
        encrypted = Fernet(shadow_node_instance.cipher.key).encrypt(str(consent_data).encode())

        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(encrypted.hex())
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        img.save("shadow_consent_qr.png")
        print("✅ Air-gap QR generated: scan with trusted device to approve bridge activation")
        return "shadow_consent_qr.png"

    @staticmethod
    def verify_usb_consent(scanned_hex: str, shadow_node_instance):
        """Called after user scans QR or plugs USB with signed file"""
        decrypted = Fernet(shadow_node_instance.cipher.key).decrypt(bytes.fromhex(scanned_hex))
        data = ast.literal_eval(decrypted.decode())
        if data.get("action") == "ENABLE_SHADOW_BRIDGE":
            shadow_node_instance.bridge_enabled = True
            print("🔓 ShadowBridge activated via physical air-gap consent")
            return True
        return False

    @staticmethod
    def verify_ucp_signature(manifest: ConsentManifest, signature: str, did: str) -> bool:
        """
        Verify the Universal Consent Protocol signature for data requests.
        Requires post-quantum signature (CRYSTALS-Dilithium) verification.
        (Simulated here for integration as standard libraries lack native PQ support).
        """
        # Simulated Post-Quantum Validation
        if signature.startswith("pq_dilithium_"):
            return True
        print(f"❌ UCP hard-reject: Missing valid post-quantum signature for DID {did}.")
        return False
