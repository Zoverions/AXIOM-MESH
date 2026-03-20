import time

class MPCOrchestrator:
    def __init__(self):
        self.nodes = []

    def add_node(self, node_id: str):
        self.nodes.append(node_id)

    def orchestrate(self, data: dict) -> dict:
        """
        Orchestrates MPC across multiple nodes.
        """
        if len(self.nodes) < 2:
            raise ValueError("MPC requires at least 2 nodes")

        # Simulate network latency and processing
        time.sleep(0.1)

        return {
            "status": "success",
            "participants": self.nodes,
            "result_hash": "mock_mpc_result_hash"
        }
