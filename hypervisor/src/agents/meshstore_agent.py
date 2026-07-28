# hypervisor/src/agents/meshstore_agent.py
import requests
from src.core.secrets import SecretManager
from src.memory.crdt_sync import sync_storage_manifest

class MeshStoreAgent:
    def __init__(self):
        self.quota = int(SecretManager.get_secret("MESHSTORE_QUOTA_GB", 50))
        self.node_id = SecretManager.get_secret("NODE_ID", "local_node")
        self.grid_url = SecretManager.get_secret("GRID_URL", "http://localhost:5000")

    def run(self):
        # Runs in existing Hypervisor loop
        manifest = sync_storage_manifest()  # reuses CRDT
        # Pin popular CIDs, offer excess
        if self.quota > 10:
            # call offerStorage via Grid RPC (already wired)
            try:
                requests.post(
                    f"{self.grid_url}/swarm/join",
                    json={"swarmId": "meshstore", "nodeId": self.node_id},
                    timeout=5
                )
            except Exception as e:
                pass
