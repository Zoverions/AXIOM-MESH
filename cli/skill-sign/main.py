import argparse
import json
import base64
import hashlib
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization
from cryptography.exceptions import InvalidSignature
import sys

def sign_capsule(binary_path, manifest_path, private_key_path, out_path):
    # Load manifest
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)

    # Ensure required fields
    required = ["id", "version", "entrypoint", "scopes", "required_hardware_tier", "attestation_policy"]
    for req in required:
        if req not in manifest:
            print(f"Error: manifest missing required field '{req}'")
            sys.exit(1)

    # Load binary and compute hash
    with open(binary_path, 'rb') as f:
        binary_data = f.read()

    binary_b64 = base64.b64encode(binary_data).decode('utf-8')

    # Payload to sign
    payload = {
        "manifest": manifest,
        "binary_base64": binary_b64
    }
    payload_str = json.dumps(payload, separators=(',', ':'), sort_keys=True)
    payload_bytes = payload_str.encode('utf-8')

    # Load private key
    with open(private_key_path, 'rb') as key_file:
        private_key = serialization.load_pem_private_key(
            key_file.read(),
            password=None
        )

    # Sign payload
    signature = private_key.sign(
        payload_bytes,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH
        ),
        hashes.SHA256()
    )

    capsule = {
        "manifest": manifest,
        "binary_base64": binary_b64,
        "signature": base64.b64encode(signature).decode('utf-8')
    }

    # Write out capsule
    with open(out_path, 'w') as f:
        json.dump(capsule, f, indent=2)
    print(f"Capsule successfully signed and written to {out_path}")

def generate_keys():
    from cryptography.hazmat.primitives.asymmetric import rsa
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    with open('private.pem', 'wb') as f:
        f.write(pem)

    public_key = private_key.public_key()
    pub_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    with open('public.pem', 'wb') as f:
        f.write(pub_pem)
    print("Generated private.pem and public.pem")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Sign a skill capsule")
    parser.add_argument('--binary', type=str, help='Path to skill binary (WASM/OCI or simple script)')
    parser.add_argument('--manifest', type=str, help='Path to manifest JSON')
    parser.add_argument('--private-key', type=str, help='Path to PEM private key')
    parser.add_argument('--out', type=str, help='Output signed capsule JSON path')
    parser.add_argument('--keygen', action='store_true', help='Generate test RSA keypair')

    args = parser.parse_args()

    if args.keygen:
        generate_keys()
        sys.exit(0)

    if not all([args.binary, args.manifest, args.private_key, args.out]):
        parser.print_help()
        sys.exit(1)

    sign_capsule(args.binary, args.manifest, args.private_key, args.out)
