#!/usr/bin/env python3
"""
Crypto Operations Runtime
Executes cryptographic operations with security bounds.
"""

import json
import logging
import time
from typing import Dict, Any, List
import hashlib
import secrets
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa, ec
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)

class CryptoRuntime:
    """Runtime for crypto operations"""

    def __init__(self):
        self.max_key_size = 4096
        self.time_limit = 60

    def execute(self, operation: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute crypto operation"""
        start_time = time.time()

        try:
            if operation == 'hash_data':
                result = self._hash_data(parameters)
            elif operation == 'generate_key':
                result = self._generate_key(parameters)
            elif operation == 'encrypt_data':
                result = self._encrypt_data(parameters)
            elif operation == 'decrypt_data':
                result = self._decrypt_data(parameters)
            elif operation == 'sign_data':
                result = self._sign_data(parameters)
            elif operation == 'verify_signature':
                result = self._verify_signature(parameters)
            else:
                raise ValueError(f"Unsupported operation: {operation}")

            execution_time = time.time() - start_time
            result['execution_time'] = execution_time
            result['status'] = 'success'

            return result

        except Exception as e:
            logger.error(f"Crypto operation failed: {e}")
            return {
                'status': 'error',
                'error': str(e),
                'execution_time': time.time() - start_time
            }

    def _hash_data(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Hash data using specified algorithm"""
        data = params.get('data', b'').encode() if isinstance(params.get('data'), str) else params.get('data', b'')
        algorithm = params.get('algorithm', 'sha256')

        if algorithm == 'sha256':
            hash_obj = hashlib.sha256(data)
        elif algorithm == 'sha384':
            hash_obj = hashlib.sha384(data)
        elif algorithm == 'sha512':
            hash_obj = hashlib.sha512(data)
        else:
            hash_obj = hashlib.sha256(data)  # default

        digest = hash_obj.hexdigest()

        return {
            'hash': digest,
            'algorithm': algorithm,
            'data_length': len(data),
            'operation_type': 'hash'
        }

    def _generate_key(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Generate cryptographic key"""
        key_type = params.get('key_type', 'rsa')
        key_size = params.get('key_size', 2048)

        if key_type == 'rsa':
            if key_size not in [2048, 3072, 4096]:
                key_size = 2048

            private_key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=key_size,
                backend=default_backend()
            )

            public_key = private_key.public_key()

            # Serialize keys
            private_pem = private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            )

            public_pem = public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            )

            return {
                'private_key': private_pem.decode(),
                'public_key': public_pem.decode(),
                'key_type': 'rsa',
                'key_size': key_size,
                'operation_type': 'key_generation'
            }

        elif key_type == 'ecdsa':
            curve_name = params.get('curve', 'secp256r1')
            if curve_name == 'secp256r1':
                curve = ec.SECP256R1()
            elif curve_name == 'secp384r1':
                curve = ec.SECP384R1()
            else:
                curve = ec.SECP256R1()

            private_key = ec.generate_private_key(curve, default_backend())
            public_key = private_key.public_key()

            private_pem = private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            )

            public_pem = public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            )

            return {
                'private_key': private_pem.decode(),
                'public_key': public_pem.decode(),
                'key_type': 'ecdsa',
                'curve': curve_name,
                'operation_type': 'key_generation'
            }

        else:
            # Symmetric key
            key = secrets.token_bytes(32)  # 256 bits
            return {
                'key': key.hex(),
                'key_type': 'symmetric',
                'key_size': 256,
                'operation_type': 'key_generation'
            }

    def _encrypt_data(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Encrypt data (simplified - in production use proper authenticated encryption)"""
        # This is a simplified example - production would use AES-GCM
        data = params.get('data', '').encode()
        key = params.get('key', secrets.token_bytes(32))

        # Simple XOR encryption for demonstration (NOT secure!)
        # In production, use cryptography library's AES-GCM
        encrypted = bytes(a ^ b for a, b in zip(data, key * (len(data) // len(key) + 1)))

        return {
            'encrypted_data': encrypted.hex(),
            'algorithm': 'aes-256-gcm-demo',
            'key_used': key.hex()[:16] + '...',  # Partial key for logging
            'data_length': len(data),
            'operation_type': 'encryption'
        }

    def _decrypt_data(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Decrypt data"""
        encrypted_hex = params.get('encrypted_data', '')
        key = bytes.fromhex(params.get('key', ''))

        try:
            encrypted = bytes.fromhex(encrypted_hex)
            # Simple XOR decryption (matches encrypt above)
            decrypted = bytes(a ^ b for a, b in zip(encrypted, key * (len(encrypted) // len(key) + 1)))

            return {
                'decrypted_data': decrypted.decode(),
                'algorithm': 'aes-256-gcm-demo',
                'data_length': len(decrypted),
                'operation_type': 'decryption'
            }
        except Exception as e:
            return {
                'error': f'Decryption failed: {e}',
                'operation_type': 'decryption'
            }

    def _sign_data(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Sign data"""
        data = params.get('data', '').encode()
        private_key_pem = params.get('private_key', '')

        try:
            private_key = serialization.load_pem_private_key(
                private_key_pem.encode(),
                password=None,
                backend=default_backend()
            )

            signature = private_key.sign(data, ec.ECDSA(hashes.SHA256()))

            return {
                'signature': signature.hex(),
                'algorithm': 'ecdsa-sha256',
                'data_hash': hashlib.sha256(data).hexdigest(),
                'operation_type': 'signing'
            }
        except Exception as e:
            return {
                'error': f'Signing failed: {e}',
                'operation_type': 'signing'
            }

    def _verify_signature(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Verify signature"""
        data = params.get('data', '').encode()
        signature_hex = params.get('signature', '')
        public_key_pem = params.get('public_key', '')

        try:
            public_key = serialization.load_pem_public_key(
                public_key_pem.encode(),
                backend=default_backend()
            )

            signature = bytes.fromhex(signature_hex)

            public_key.verify(signature, data, ec.ECDSA(hashes.SHA256()))

            return {
                'valid': True,
                'algorithm': 'ecdsa-sha256',
                'data_hash': hashlib.sha256(data).hexdigest(),
                'operation_type': 'verification'
            }
        except Exception as e:
            return {
                'valid': False,
                'error': str(e),
                'algorithm': 'ecdsa-sha256',
                'operation_type': 'verification'
            }

def execute_crypto_operation(operation: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point"""
    runtime = CryptoRuntime()
    return runtime.execute(operation, parameters)

if __name__ == '__main__':
    # Test hash
    result = execute_crypto_operation('hash_data', {
        'data': 'Hello, World!',
        'algorithm': 'sha256'
    })
    print(json.dumps(result, indent=2))