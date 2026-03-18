import os
from hypervisor.src.memory.crdt_sync import pin_to_meshstore
from cryptography.fernet import Fernet  # reuse existing encryption

class RecoveryBundleManager:
    def create_bundle(self, node_id: str):
        bundle = {
            "seed": os.getenv("WALLET_SEED"),
            "swarm_id": os.getenv("SWARM_ID"),
            "meshstore_cids": []  # current pins
        }
        recovery_key = os.getenv("RECOVERY_KEY")
        if not recovery_key:
            raise ValueError("RECOVERY_KEY environment variable is required to create a recovery bundle. Cannot use an ephemeral key.")

        encrypted = Fernet(recovery_key).encrypt(str(bundle).encode())
        cid = pin_to_meshstore(encrypted)  # IPFS via existing MeshStore
        # Call registerRecovery on DualLedgerIdentity
        return cid
