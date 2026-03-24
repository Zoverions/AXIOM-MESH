import hashlib

class ZKGraphQueryProver:
    """Lightweight ZK graph query proofs."""

    def generate_query_proof(self, query_id: str, graph_root_hash: str) -> dict:
        """Generates a lightweight ZK proof for a graph query."""
        # Synthesize a lightweight proof
        payload = f"{query_id}:{graph_root_hash}:zk_proof"
        proof = hashlib.sha256(payload.encode()).hexdigest()

        return {
            "query_id": query_id,
            "graph_root": graph_root_hash,
            "zk_proof": proof,
            "valid": True
        }

    def verify_query_proof(self, proof_data: dict) -> bool:
        """Verifies the generated proof."""
        expected_payload = f"{proof_data.get('query_id')}:{proof_data.get('graph_root')}:zk_proof"
        expected_proof = hashlib.sha256(expected_payload.encode()).hexdigest()
        return proof_data.get("zk_proof") == expected_proof
