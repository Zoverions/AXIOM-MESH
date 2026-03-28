import json
import os
from typing import Dict, Any, List
from src.engine.alignment import AlignmentProfile
from src.graph.resource_balancer import SystemMetrics
import logging

logger = logging.getLogger(__name__)

class ModelManager:
    """
    Manages local models, updates, and risk tolerance for AXIOM-MESH nodes.
    Tracks 'has_personality' to prevent overwriting mature models.
    """
    def __init__(self, storage_path: str = "data/local_models.json"):
        self.storage_path = storage_path
        self.models: Dict[str, Any] = {}
        self._load_models()

    def _load_models(self):
        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, "r") as f:
                    self.models = json.load(f)
            except json.JSONDecodeError:
                self.models = {}
        else:
            self.models = {}

    def _save_models(self):
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
        with open(self.storage_path, "w") as f:
            json.dump(self.models, f, indent=2)

    def register_model(self, model_id: str, version: str, risk_tier: str, has_personality: bool = False):
        self.models[model_id] = {
            "version": version,
            "risk_tier": risk_tier,
            "has_personality": has_personality
        }
        self._save_models()

    def check_for_updates(self, available_updates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Evaluate available updates against node risk tolerance, hardware load,
        and personality preservation.

        available_updates format:
        [{"model_id": "model_a", "version": "1.2", "risk_tier": "Canary"}]
        """
        profile = AlignmentProfile()
        risk_tolerance = profile.get_profile().get("risk_tolerance", "balanced")

        allowed_tiers = ["Stable"]
        if risk_tolerance in ["balanced", "assertive", "experimental"]:
            allowed_tiers.append("Beta")
        if risk_tolerance in ["assertive", "experimental"]:
            allowed_tiers.append("Canary")

        approved_updates = []

        for update in available_updates:
            model_id = update.get("model_id")
            risk_tier = update.get("risk_tier", "Stable")

            # Check risk tolerance
            if risk_tier not in allowed_tiers:
                logger.info(f"Update for {model_id} rejected: Risk tier {risk_tier} not allowed by {risk_tolerance} tolerance.")
                continue

            # Check personality preservation
            if model_id in self.models:
                if self.models[model_id].get("has_personality", False):
                    logger.info(f"Update for {model_id} rejected: Model has formed a personality and will not be overwritten.")
                    continue

            # Check hardware load to prevent overload
            memory_pressure = SystemMetrics.get_memory_pressure()
            if memory_pressure > 0.8:
                logger.warning(f"Update for {model_id} delayed: Hardware memory pressure too high ({memory_pressure}).")
                continue

            approved_updates.append(update)

        return approved_updates

    def apply_update(self, update: Dict[str, Any]):
        model_id = update.get("model_id")
        version = update.get("version")
        risk_tier = update.get("risk_tier", "Stable")

        # In a real implementation, downloading/swapping happens here

        self.register_model(model_id, version, risk_tier, False)
        logger.info(f"Model {model_id} updated to version {version} ({risk_tier}).")
