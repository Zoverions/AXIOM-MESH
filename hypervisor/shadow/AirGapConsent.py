# hypervisor/shadow/AirGapConsent.py
import qrcode
import os
from cryptography.fernet import Fernet
from PIL import Image  # pip install pillow (already in your env or add to requirements)

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
        data = eval(decrypted.decode())
        if data["action"] == "ENABLE_SHADOW_BRIDGE":
            shadow_node_instance.bridge_enabled = True
            print("🔓 ShadowBridge activated via physical air-gap consent")
            return True
        return False
