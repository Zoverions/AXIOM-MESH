import json
import os
import uuid
from typing import Dict, Any, Optional

class AlignmentProfile:
    """
    Manages the Alignment Profile for the hypervisor.
    Initialization creates a profile with goals, traits, risk tolerance, priority tags.
    Stored via a mock CRDT + bound to a DID/VC model.
    """
    def __init__(self, storage_path: str = "data/alignment_profile.json"):
        self.storage_path = storage_path
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
        self.profile = self._load_or_create()

    def _load_or_create(self) -> Dict[str, Any]:
        if os.path.exists(self.storage_path):
            with open(self.storage_path, "r") as f:
                try:
                    return json.load(f)
                except json.JSONDecodeError:
                    pass

        # Create new profile at init
        did = f"did:axiom:{uuid.uuid4()}"
        default_profile = {
            "did": did,
            "goals": ["maximize_organization", "minimize_chaos", "resource_efficiency"],
            "traits": ["analytical", "cautious", "adaptable"],
            "risk_tolerance": 0.5,
            "priority_tags": {"default": 1.0, "critical": 5.0, "low": 0.1},
            "crdt_clock": 0
        }
        self._save(default_profile)
        return default_profile

    def _save(self, profile: Dict[str, Any]):
        with open(self.storage_path, "w") as f:
            json.dump(profile, f, indent=2)

    def update_priority_tag(self, tag: str, weight: float, bicameral_approval: bool = False):
        """
        Updates a priority tag. Respects bicameral governance hooks.
        """
        if not bicameral_approval and tag in ["critical", "system", "override"]:
            raise PermissionError(f"Bicameral governance approval required to update restricted tag: {tag}")

        self.profile["priority_tags"][tag] = weight
        self.profile["crdt_clock"] += 1
        self._save(self.profile)
        return self.profile["priority_tags"]

    def get_priority_weight(self, tag: str) -> float:
        return self.profile["priority_tags"].get(tag, self.profile["priority_tags"].get("default", 1.0))

    def get_profile(self) -> Dict[str, Any]:
        return self.profile
