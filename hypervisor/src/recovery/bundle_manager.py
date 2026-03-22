import os
import json
import base64
import time
from hypervisor.src.memory.crdt_sync import pin_to_meshstore
from cryptography.fernet import Fernet  # reuse existing encryption

class RecoveryBundleManager:
    def create_bundle(self, node_id: str) -> bytes:
        """
        Creates an encrypted bundle containing wallet info, deep archive (memories),
        and skill vectors / personalities.
        """
        bundle = {
            "node_id": node_id,
            "timestamp": time.time(),
            "seed": os.getenv("WALLET_SEED", ""),
            "swarm_id": os.getenv("SWARM_ID", ""),
            "meshstore_cids": [],  # current pins
            "archive_data": None,
            "safetensors": {}
        }

        # Load Deep Archive (Memories)
        archive_path = "data/archive.json"
        if os.path.exists(archive_path):
            with open(archive_path, "r", encoding="utf-8") as f:
                try:
                    bundle["archive_data"] = json.load(f)
                except json.JSONDecodeError:
                    pass

        # Load specific .safetensors (Skills and Personalities)
        memory_dir = "hypervisor/memory"
        target_tensors = [
            "skill_rust_coder.safetensors",
            "ethics_thermodynamic_v1.safetensors",
            "default_steering.safetensors"
        ]

        for tensor_name in target_tensors:
            tensor_path = os.path.join(memory_dir, tensor_name)
            if os.path.exists(tensor_path):
                with open(tensor_path, "rb") as f:
                    bundle["safetensors"][tensor_name] = base64.b64encode(f.read()).decode("utf-8")

        recovery_key = os.getenv("RECOVERY_KEY")
        if not recovery_key:
            raise ValueError("RECOVERY_KEY environment variable is required to create a recovery bundle. Cannot use an ephemeral key.")

        # Encrypt the bundle
        bundle_json = json.dumps(bundle).encode("utf-8")
        encrypted = Fernet(recovery_key).encrypt(bundle_json)

        return encrypted

    def restore_bundle(self, encrypted_data: bytes) -> bool:
        """
        Decrypts a bundle and restores the wallet info, deep archive (memories),
        and skill vectors / personalities.
        """
        recovery_key = os.getenv("RECOVERY_KEY")
        if not recovery_key:
            raise ValueError("RECOVERY_KEY environment variable is required to restore a recovery bundle.")

        decrypted = Fernet(recovery_key).decrypt(encrypted_data)
        bundle = json.loads(decrypted.decode("utf-8"))

        # Restore Deep Archive
        archive_data = bundle.get("archive_data")
        if archive_data is not None:
            os.makedirs("data", exist_ok=True)
            archive_path = "data/archive.json"
            with open(archive_path, "w", encoding="utf-8") as f:
                json.dump(archive_data, f, indent=2)

        # Restore safetensors
        safetensors = bundle.get("safetensors", {})
        if safetensors:
            memory_dir = "hypervisor/memory"
            os.makedirs(memory_dir, exist_ok=True)
            for tensor_name, b64_data in safetensors.items():
                tensor_path = os.path.join(memory_dir, tensor_name)
                with open(tensor_path, "wb") as f:
                    f.write(base64.b64decode(b64_data))

        return True
