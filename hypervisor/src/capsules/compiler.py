import uuid
from typing import Dict, Any, List
import hashlib
import hmac

# In-memory storage for MVP
_manifests: Dict[str, Dict[str, Any]] = {}
_signatures: Dict[str, str] = {}

# Dummy secret key for MVP signature generation
SECRET_KEY = b"hypervisor_secret_key"

def intake_payload(
    source: str,
    name: str,
    capabilities: List[str],
    constraints: Dict[str, Any],
    runtime: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Accept an Open-CLAW/MCP endpoint payload and normalize it into a capsule manifest.
    """
    capsule_id = f"cap-{uuid.uuid4().hex[:8]}"

    # Normalize capabilities
    if not capabilities:
        capabilities = ["default-capability"]

    # Normalize constraints
    normalized_constraints = {
        "proof_carrying_intents": constraints.get("proof_carrying_intents", False),
        "intent_canonicalization": constraints.get("intent_canonicalization", False),
        "max_risk_score": constraints.get("max_risk_score", 0.5)
    }

    # Normalize runtime
    normalized_runtime = {
        "cpu_limit": runtime.get("cpu_limit", 1.0),
        "memory_limit_mb": runtime.get("memory_limit_mb", 256),
        "timeout_ms": runtime.get("timeout_ms", 5000)
    }

    # Construct manifest
    manifest = {
        "capsule_id": capsule_id,
        "name": name,
        "version": "1.0.0",
        "issuer": {
            "mesh_issuer": "hypervisor",
            "key_id": "key-001"
        },
        "capabilities": capabilities,
        "constraints": normalized_constraints,
        "runtime": normalized_runtime,
        "token_policy": {
            "scope": {
                "tools": [],
                "data": []
            },
            "ttl_seconds": 3600,
            "revocation_handle_required": True,
            "proof_strictness": "strict"
        }
    }

    # Store manifest
    _manifests[capsule_id] = manifest

    return manifest

def compile_manifest(capsule_id: str) -> str:
    """
    Compile a capsule manifest and return a signed signature for execution.
    """
    if capsule_id not in _manifests:
        raise ValueError(f"Capsule ID {capsule_id} not found")

    # In a real system, this would bundle code, dependencies, etc.
    # For MVP, we just generate a signature over the capsule ID.

    # Generate HMAC signature
    signature = hmac.new(SECRET_KEY, capsule_id.encode(), hashlib.sha256).hexdigest()

    # Store signature
    _signatures[capsule_id] = signature

    return signature

def verify_signature(capsule_id: str, signature: str) -> bool:
    """
    Verify the signed capsule signature.
    """
    if capsule_id not in _signatures:
        return False

    # Check if signature matches the one we generated
    expected_signature = _signatures[capsule_id]

    return hmac.compare_digest(expected_signature, signature)
