#!/usr/bin/env python3
"""
Crypto Operations Skill Capsule Adapter
Handles intent normalization for cryptographic operations.
"""

import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import hashlib
import secrets

logger = logging.getLogger(__name__)

@dataclass
class CryptoIntent:
    """Normalized crypto intent"""
    operation: str  # 'encrypt', 'decrypt', 'sign', 'verify', 'hash', 'generate'
    algorithm: str  # 'aes', 'rsa', 'ecdsa', 'sha256', etc.
    parameters: Dict[str, Any]
    constraints: Dict[str, Any]

class CryptoAdapter:
    """Adapter for crypto operations"""

    def __init__(self):
        self.supported_algorithms = {
            'symmetric': ['aes-256-gcm', 'chacha20-poly1305'],
            'asymmetric': ['rsa-2048', 'rsa-4096', 'ecdsa-p256', 'ecdsa-p384'],
            'hash': ['sha256', 'sha384', 'sha512', 'blake2b'],
            'key_derivation': ['pbkdf2', 'scrypt', 'argon2']
        }

    def normalize_intent(self, raw_intent: Dict[str, Any]) -> CryptoIntent:
        """Normalize raw intent"""
        try:
            operation = self._extract_operation(raw_intent)
            algorithm = self._extract_algorithm(raw_intent, operation)
            parameters = self._extract_parameters(raw_intent, operation, algorithm)
            constraints = self._extract_constraints(raw_intent)

            return CryptoIntent(
                operation=operation,
                algorithm=algorithm,
                parameters=parameters,
                constraints=constraints
            )

        except Exception as e:
            logger.error(f"Intent normalization failed: {e}")
            raise ValueError(f"Invalid crypto intent: {e}")

    def _extract_operation(self, intent: Dict[str, Any]) -> str:
        """Extract crypto operation"""
        text = intent.get('text', '').lower()

        if any(word in text for word in ['encrypt', 'encryption']):
            return 'encrypt'
        elif any(word in text for word in ['decrypt', 'decryption']):
            return 'decrypt'
        elif any(word in text for word in ['sign', 'signature']):
            return 'sign'
        elif any(word in text for word in ['verify', 'verification']):
            return 'verify'
        elif any(word in text for word in ['hash', 'digest']):
            return 'hash'
        elif any(word in text for word in ['generate', 'create']):
            return 'generate'
        else:
            return 'hash'  # default

    def _extract_algorithm(self, intent: Dict[str, Any], operation: str) -> str:
        """Extract algorithm"""
        text = intent.get('text', '').lower()

        # Operation-specific defaults
        if operation in ['encrypt', 'decrypt']:
            if 'aes' in text:
                return 'aes-256-gcm'
            elif 'chacha' in text:
                return 'chacha20-poly1305'
            else:
                return 'aes-256-gcm'
        elif operation in ['sign', 'verify']:
            if 'rsa' in text:
                return 'rsa-2048'
            elif 'ecdsa' in text:
                return 'ecdsa-p256'
            else:
                return 'ecdsa-p256'
        elif operation == 'hash':
            if 'sha384' in text:
                return 'sha384'
            elif 'sha512' in text:
                return 'sha512'
            else:
                return 'sha256'
        elif operation == 'generate':
            return 'random'

        return 'sha256'

    def _extract_parameters(self, intent: Dict[str, Any], operation: str, algorithm: str) -> Dict[str, Any]:
        """Extract parameters"""
        params = {}

        if operation in ['encrypt', 'decrypt']:
            params['key_size'] = 32  # 256 bits
            params['mode'] = 'gcm' if 'gcm' in algorithm else 'poly1305'
        elif operation in ['sign', 'verify']:
            if 'rsa' in algorithm:
                params['key_size'] = 2048
            else:  # ECDSA
                params['curve'] = 'secp256r1'
        elif operation == 'hash':
            params['output_format'] = 'hex'

        return params

    def _extract_constraints(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        """Extract constraints"""
        return {
            'max_key_size': 4096,
            'timeout': 60,
            'memory_limit': 256 * 1024 * 1024  # 256MB
        }

    def generate_proof_hooks(self, intent: CryptoIntent) -> List[Dict[str, Any]]:
        """Generate proof hooks"""
        hooks = []

        # Algorithm validation
        hooks.append({
            'type': 'algorithm_validation',
            'algorithm': intent.algorithm,
            'standards': ['NIST', 'RFC']
        })

        # Security strength
        hooks.append({
            'type': 'security_strength',
            'operation': intent.operation,
            'algorithm': intent.algorithm
        })

        # Implementation correctness
        if intent.operation in ['encrypt', 'decrypt']:
            hooks.append({
                'type': 'cipher_correctness',
                'test_vectors': True
            })

        return hooks

    def translate_to_tools(self, intent: CryptoIntent) -> List[Dict[str, Any]]:
        """Translate to tool calls"""
        tools = []

        if intent.operation == 'encrypt':
            tools.append({
                'tool': 'cryptography_encryptor',
                'algorithm': intent.algorithm,
                'parameters': intent.parameters
            })

        elif intent.operation == 'decrypt':
            tools.append({
                'tool': 'cryptography_decryptor',
                'algorithm': intent.algorithm,
                'parameters': intent.parameters
            })

        elif intent.operation == 'sign':
            tools.append({
                'tool': 'cryptography_signer',
                'algorithm': intent.algorithm,
                'parameters': intent.parameters
            })

        elif intent.operation == 'verify':
            tools.append({
                'tool': 'cryptography_verifier',
                'algorithm': intent.algorithm,
                'parameters': intent.parameters
            })

        elif intent.operation == 'hash':
            tools.append({
                'tool': 'hashlib_hasher',
                'algorithm': intent.algorithm,
                'parameters': intent.parameters
            })

        elif intent.operation == 'generate':
            tools.append({
                'tool': 'secrets_generator',
                'type': 'key' if 'key' in str(intent.parameters) else 'random',
                'parameters': intent.parameters
            })

        return tools

def normalize_intent(raw_intent: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point"""
    adapter = CryptoAdapter()
    normalized = adapter.normalize_intent(raw_intent)

    return {
        'operation': normalized.operation,
        'algorithm': normalized.algorithm,
        'parameters': normalized.parameters,
        'constraints': normalized.constraints,
        'proof_hooks': adapter.generate_proof_hooks(normalized),
        'tools': adapter.translate_to_tools(normalized)
    }

if __name__ == '__main__':
    test_intent = {
        'text': 'Generate a SHA256 hash of the message'
    }

    result = normalize_intent(test_intent)
    print(json.dumps(result, indent=2))