import requests
import uuid
from typing import List, Dict, Any, Optional

GRID_URL = "http://localhost:5000"

class SwarmManager:
    """
    Manages Swarm Orchestration by interacting with the Grid's /swarm endpoints.
    Allows nodes to dynamically group together to solve high-compute problems.
    """

    def __init__(self, node_id: str):
        self.node_id = node_id

    def get_swarms(self) -> List[Dict[str, Any]]:
        """Retrieves all active swarms from the decentralized Grid."""
        import time
        max_retries = 3
        base_delay = 1.0
        for attempt in range(max_retries):
            try:
                res = requests.get(f"{GRID_URL}/swarm", timeout=5)
                if res.status_code == 200:
                    return res.json()
                else:
                    print(f"Failed to fetch swarms: {res.text}")
                    return []
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(base_delay * (2 ** attempt))
                else:
                    print(f"[Degraded Mode] Failed to connect to Grid to get swarms after {max_retries} attempts: {e}")
                    return []

    def create_swarm(self, task_id: str) -> Optional[str]:
        """
        Creates a new swarm on the Grid for a specific high-compute task.
        Requires the node to have an active compute bond.
        Returns the swarm_id if successful, None otherwise.
        """
        import time
        max_retries = 3
        base_delay = 1.0
        swarm_id = str(uuid.uuid4())
        payload = {
            "id": swarm_id,
            "taskId": task_id,
            "nodes": [self.node_id],
            "status": "pending"
        }
        for attempt in range(max_retries):
            try:
                res = requests.post(f"{GRID_URL}/swarm", json=payload, timeout=5)
                if res.status_code == 200:
                    print(f"Swarm {swarm_id} created successfully for task {task_id}.")
                    return swarm_id
                else:
                    print(f"Failed to create swarm: {res.text}")
                    return None
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(base_delay * (2 ** attempt))
                else:
                    print(f"[Degraded Mode] Failed to connect to Grid to create swarm after {max_retries} attempts: {e}")
                    return None

    def join_swarm(self, swarm_id: str) -> bool:
        """
        Joins an existing swarm on the Grid to help solve a task.
        Requires the node to have an active compute bond.
        """
        import time
        max_retries = 3
        base_delay = 1.0
        payload = {
            "swarmId": swarm_id,
            "nodeId": self.node_id
        }
        for attempt in range(max_retries):
            try:
                res = requests.post(f"{GRID_URL}/swarm/join", json=payload, timeout=5)
                if res.status_code == 200:
                    print(f"Node {self.node_id} successfully joined swarm {swarm_id}.")
                    return True
                else:
                    print(f"Failed to join swarm {swarm_id}: {res.text}")
                    return False
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(base_delay * (2 ** attempt))
                else:
                    print(f"[Degraded Mode] Failed to connect to Grid to join swarm after {max_retries} attempts: {e}")
                    return False
