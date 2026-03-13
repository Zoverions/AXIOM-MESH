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
        try:
            res = requests.get(f"{GRID_URL}/swarm")
            if res.status_code == 200:
                return res.json()
            else:
                print(f"Failed to fetch swarms: {res.text}")
                return []
        except Exception as e:
            print(f"Error connecting to Grid: {e}")
            return []

    def create_swarm(self, task_id: str) -> Optional[str]:
        """
        Creates a new swarm on the Grid for a specific high-compute task.
        Requires the node to have an active compute bond.
        Returns the swarm_id if successful, None otherwise.
        """
        swarm_id = str(uuid.uuid4())
        payload = {
            "id": swarm_id,
            "taskId": task_id,
            "nodes": [self.node_id],
            "status": "pending"
        }
        try:
            res = requests.post(f"{GRID_URL}/swarm", json=payload)
            if res.status_code == 200:
                print(f"Swarm {swarm_id} created successfully for task {task_id}.")
                return swarm_id
            else:
                print(f"Failed to create swarm: {res.text}")
                return None
        except Exception as e:
            print(f"Error connecting to Grid: {e}")
            return None

    def join_swarm(self, swarm_id: str) -> bool:
        """
        Joins an existing swarm on the Grid to help solve a task.
        Requires the node to have an active compute bond.
        """
        payload = {
            "swarmId": swarm_id,
            "nodeId": self.node_id
        }
        try:
            res = requests.post(f"{GRID_URL}/swarm/join", json=payload)
            if res.status_code == 200:
                print(f"Node {self.node_id} successfully joined swarm {swarm_id}.")
                return True
            else:
                print(f"Failed to join swarm {swarm_id}: {res.text}")
                return False
        except Exception as e:
            print(f"Error connecting to Grid: {e}")
            return False
