import uuid
from typing import Dict, Any, List
import hashlib
import hmac
import json
import os
import datetime
import jsonschema

# In-memory storage for MVP
_manifests: Dict[str, Dict[str, Any]] = {}
_signatures: Dict[str, str] = {}
_source_descriptors: Dict[str, Dict[str, Any]] = {}
_rebuild_attestations: Dict[str, Dict[str, Any]] = {}

# Dummy secret key for MVP signature generation
SECRET_KEY = b"hypervisor_secret_key"

def _load_schema(schema_name: str) -> Dict[str, Any]:
    schema_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'schemas', schema_name))
    with open(schema_path, 'r') as f:
        return json.load(f)

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

    # Determine source_type
    source_type = "internal"
    if "mcp" in source.lower():
        source_type = "mcp"
    elif "git" in source.lower():
        source_type = "git"
    elif "registry" in source.lower():
        source_type = "registry"
    elif "api" in source.lower():
        source_type = "service_api"

    # Construct Source Descriptor
    source_descriptor = {
        "source_type": source_type,
        "source_ref": source,
        "immutable_digest": hashlib.sha256(source.encode()).hexdigest()[:16],
        "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

    # Validate Source Descriptor
    source_descriptor_schema = _load_schema('source_descriptor.v1.json')
    jsonschema.validate(instance=source_descriptor, schema=source_descriptor_schema)

    # Store Source Descriptor
    _source_descriptors[capsule_id] = source_descriptor

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

    # Validate Manifest
    manifest_schema = _load_schema('skill_capsule_manifest.v1.json')
    jsonschema.validate(instance=manifest, schema=manifest_schema)

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

    # Generate Rebuild Attestation
    rebuild_attestation = {
        "capsule_id": capsule_id,
        "mode": "rewrite",
        "compiler_version": "1.0",
        "changes": [
            {
                "component": "I/O",
                "action": "replace_io",
                "reason": "normalize I/O for proof-carrying intents"
            }
        ],
        "compiled_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

    # Validate Rebuild Attestation
    rebuild_attestation_schema = _load_schema('rebuild_attestation.v1.json')
    jsonschema.validate(instance=rebuild_attestation, schema=rebuild_attestation_schema)

    # Store Rebuild Attestation
    _rebuild_attestations[capsule_id] = rebuild_attestation

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
