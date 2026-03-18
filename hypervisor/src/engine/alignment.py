import json
import os
import uuid
from typing import Dict, Any, Optional
from datetime import datetime

from src.memory.crdt_sync import CRDTState

class AlignmentProfile:
    """
    Manages the Alignment Profile for the hypervisor.
    Initialization creates a profile with goals, traits, risk tolerance, priority tags.
    Stored via a true CRDT (CRDTState) + bound to a DID/VC model.
    """
    def __init__(self, storage_path: str = "data/alignment_profile.json"):
        self.storage_path = storage_path
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)

        # Load the raw CRDT state if it exists
        self.crdt = self._load_crdt()

        # Check if the CRDT is empty to determine if initialization is needed
        if not self.crdt.state:
            self._init_default_profile()
            self._save_crdt()

    def _load_crdt(self) -> CRDTState:
        node_id = f"node_alignment_{uuid.uuid4().hex[:8]}"
        crdt = CRDTState(node_id=node_id)

        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, "r") as f:
                    data = json.load(f)

                if "crdt_state" in data:
                    crdt.state = data["crdt_state"]
                    if "node_id" in data:
                        crdt.node_id = data["node_id"]
                    if "private_key_pem" in data:
                        from ecdsa import SigningKey
                        crdt.private_key = SigningKey.from_pem(data["private_key_pem"].encode())
                        crdt.public_key_hex = crdt.private_key.get_verifying_key().to_string("uncompressed").hex()
                else:
                    # Migration from old format:
                    self._migrate_old_profile(crdt, data)
            except json.JSONDecodeError:
                pass

        return crdt

    def _migrate_old_profile(self, crdt: CRDTState, old_data: Dict[str, Any]):
        profile_id = old_data.get("profile_id", str(uuid.uuid4()))
        subject_did = old_data.get("did", old_data.get("subject_did", f"did:axiom:{uuid.uuid4()}"))
        version = old_data.get("version", "v1")
        goals = old_data.get("goals", ["maximize_organization", "minimize_chaos", "resource_efficiency"])
        traits = old_data.get("traits", ["analytical", "cautious", "adaptable"])
        characteristics = old_data.get("characteristics", ["logical", "systematic"])
        risk_tolerance = old_data.get("risk_tolerance", "balanced")
        if isinstance(risk_tolerance, float):
            # mapping old float to new string enum
            if risk_tolerance < 0.2: risk_tolerance = "minimal"
            elif risk_tolerance < 0.4: risk_tolerance = "conservative"
            elif risk_tolerance < 0.6: risk_tolerance = "balanced"
            elif risk_tolerance < 0.8: risk_tolerance = "assertive"
            else: risk_tolerance = "experimental"

        priority_tags = old_data.get("priority_tags", {"default": 1.0, "critical": 5.0, "low": 0.1})
        # Note: new schema requires array of strings, but old schema used dict weights.
        # We will keep it as dict for backwards compatibility in python code, or map it.
        # Actually, let's keep it dict internally to not break `get_priority_weight`.

        import datetime as dt
        created_at = old_data.get("created_at", dt.datetime.now(dt.timezone.utc).isoformat())
        updated_at = old_data.get("updated_at", created_at)

        crdt.update("profile_id", profile_id)
        crdt.update("subject_did", subject_did)
        crdt.update("version", version)
        crdt.update("goals", goals)
        crdt.update("traits", traits)
        crdt.update("characteristics", characteristics)
        crdt.update("risk_tolerance", risk_tolerance)
        crdt.update("priority_tags", priority_tags)
        crdt.update("created_at", created_at)
        crdt.update("updated_at", updated_at)

    def _init_default_profile(self):
        self.crdt.update("profile_id", str(uuid.uuid4()))
        self.crdt.update("subject_did", f"did:axiom:{uuid.uuid4()}")
        self.crdt.update("version", "v1")
        self.crdt.update("goals", ["maximize_organization", "minimize_chaos", "resource_efficiency"])
        self.crdt.update("traits", ["analytical", "cautious", "adaptable"])
        self.crdt.update("characteristics", ["logical", "systematic"])
        self.crdt.update("risk_tolerance", "balanced")
        self.crdt.update("priority_tags", {"default": 1.0, "critical": 5.0, "low": 0.1})
        import datetime as dt
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        self.crdt.update("created_at", now)
        self.crdt.update("updated_at", now)

        # Constraints as per schema
        self.crdt.update("constraints", {
            "max_external_action_level": "approval_required",
            "allowed_peer_classes": ["S1_BASELINE", "S2_HARDENED"]
        })

    def _save_crdt(self):
        data = {
            "node_id": self.crdt.node_id,
            "private_key_pem": self.crdt.private_key.to_pem().decode(),
            "crdt_state": self.crdt.state
        }
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)

    def update_priority_tag(self, tag: str, weight: float, bicameral_approval: bool = False):
        """
        Updates a priority tag. Respects bicameral governance hooks.
        """
        if not bicameral_approval and tag in ["critical", "system", "override"]:
            raise PermissionError(f"Bicameral governance approval required to update restricted tag: {tag}")

        tags = self.crdt.get("priority_tags") or {}
        tags[tag] = weight
        self.crdt.update("priority_tags", tags)
        import datetime as dt
        self.crdt.update("updated_at", dt.datetime.now(dt.timezone.utc).isoformat())

        self._save_crdt()
        return tags

    def get_priority_weight(self, tag: str) -> float:
        tags = self.crdt.get("priority_tags") or {}
        return tags.get(tag, tags.get("default", 1.0))

    def get_profile(self) -> Dict[str, Any]:
        """
        Returns the resolved state from the CRDT.
        """
        profile = {}
        for key in self.crdt.state.keys():
            profile[key] = self.crdt.get(key)
        return profile
