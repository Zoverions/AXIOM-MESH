import json
import os
import uuid
import re
import asyncio
import hashlib
from typing import List, Dict, Optional

_STOPWORDS = frozenset({"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "is", "are", "was", "were", "it", "this", "that", "of", "by", "as"})
_NON_WORD_PATTERN = re.compile(r'[^\w\s]')

class DeepArchive:
    def __init__(self, storage_path="data/archive.json"):
        self.storage_path = storage_path
        self._ensure_storage()

    def _ensure_storage(self):
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
        if not os.path.exists(self.storage_path) or os.path.getsize(self.storage_path) == 0:
            with open(self.storage_path, "w") as f:
                json.dump({"nodes": {}, "edges": []}, f)
        else:
            # Migration logic
            try:
                with open(self.storage_path, "r") as f:
                    data = json.load(f)

                # If it's a list, it's the old flat format
                if isinstance(data, list):
                    new_data = {"nodes": {}, "edges": []}
                    previous_node_id = None
                    for item in data:
                        content = item.get("content", "")
                        metadata = item.get("metadata", {})

                        node_id = str(uuid.uuid4())
                        keywords = self._extract_keywords(content)
                        new_data["nodes"][node_id] = {
                            "id": node_id,
                            "content": content,
                            "metadata": metadata,
                            "keywords": keywords
                        }

                        if previous_node_id is not None:
                            new_data["edges"].append({
                                "source": previous_node_id,
                                "target": node_id,
                                "relationship": "sequential",
                                "weight": 1
                            })
                        previous_node_id = node_id

                    with open(self.storage_path, "w") as f:
                        json.dump(new_data, f, indent=2)
            except Exception as e:
                # In case of corruption, re-initialize
                with open(self.storage_path, "w") as f:
                    json.dump({"nodes": {}, "edges": []}, f)

    def _extract_keywords(self, text: str) -> List[str]:
        text = _NON_WORD_PATTERN.sub('', text.lower())
        return list({w for w in text.split() if w not in _STOPWORDS and len(w) > 2})

    def search(self, query: str) -> List[Dict]:
        with open(self.storage_path, "r") as f:
            data = json.load(f)

        query_keywords = set(self._extract_keywords(query))

        entry_nodes = set()
        for node_id, node in data["nodes"].items():
            node_keywords = set(node.get("keywords", []))
            if query_keywords.intersection(node_keywords) or query.lower() in node.get("content", "").lower():
                entry_nodes.add(node_id)

        traversed_nodes = set(entry_nodes)
        for edge in data["edges"]:
            if edge["source"] in entry_nodes:
                traversed_nodes.add(edge["target"])
            elif edge["target"] in entry_nodes:
                traversed_nodes.add(edge["source"])

        results = []
        for node_id in traversed_nodes:
            results.append({
                "content": data["nodes"][node_id]["content"],
                "metadata": data["nodes"][node_id].get("metadata", {})
            })

        return results

    def add(self, content: str, metadata: Dict = None):
        with open(self.storage_path, "r") as f:
            data = json.load(f)

        node_id = str(uuid.uuid4())
        keywords = self._extract_keywords(content)

        new_node = {
            "id": node_id,
            "content": content,
            "metadata": metadata or {},
            "keywords": keywords
        }

        edges_added = 0
        for existing_id, existing_node in data["nodes"].items():
            existing_keywords = existing_node.get("keywords", [])
            shared = set(keywords).intersection(set(existing_keywords))
            if shared:
                data["edges"].append({
                    "source": node_id,
                    "target": existing_id,
                    "relationship": "shares_keywords",
                    "weight": len(shared)
                })
                edges_added += 1

        if edges_added == 0 and data["nodes"]:
            last_node_id = list(data["nodes"].keys())[-1]
            data["edges"].append({
                "source": node_id,
                "target": last_node_id,
                "relationship": "sequential",
                "weight": 1
            })

        data["nodes"][node_id] = new_node

        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)

class DistributedDeepArchive(DeepArchive):
    """
    Extends DeepArchive to support decentralized graph queries over the Grid network
    using WebSockets and Zero-Knowledge Proofs.
    """
    def __init__(self, storage_path="data/archive.json", grid_ws_url="ws://localhost:5000/ws/graph"):
        super().__init__(storage_path)
        self.grid_ws_url = grid_ws_url

    def _generate_mock_zkp(self, query: str) -> str:
        """
        Generates a mock ZKP proof that starts with "000" when hashed with the query.
        This is a computationally simple brute-force for the mock.
        """
        nonce = 0
        while True:
            proof = f"mock-zkp-{nonce}"
            h = hashlib.sha256((query + proof).encode()).hexdigest()
            if h.startswith("000"):
                return proof
            nonce += 1

    async def search_distributed(self, query: str) -> List[Dict]:
        """
        Searches both the local archive and the distributed Grid network.
        """
        # Local search
        local_results = self.search(query)

        # Distributed search via Grid
        try:
            import websockets
            async with websockets.connect(self.grid_ws_url) as ws:
                proof = self._generate_mock_zkp(query)
                payload = {
                    "type": "query",
                    "query": query,
                    "proof": proof
                }
                await ws.send(json.dumps(payload))

                response = await ws.recv()
                grid_data = json.loads(response)

                if "nodes" in grid_data:
                    for node in grid_data["nodes"]:
                        local_results.append({
                            "content": node["content"],
                            "metadata": {**(node.get("metadata") or {}), "source": "grid_p2p"}
                        })
        except Exception as e:
            print(f"Distributed search error: {e}")

        return local_results

    async def sync_to_grid(self, content: str, metadata: Dict = None):
        """
        Adds to local archive and syncs to the Grid network.
        """
        # Find all current node IDs to identify the new one after add()
        with open(self.storage_path, "r") as f:
            data = json.load(f)
        old_nodes = set(data.get("nodes", {}).keys())

        self.add(content, metadata)

        # Sync to Grid
        try:
            import websockets
            async with websockets.connect(self.grid_ws_url) as ws:
                with open(self.storage_path, "r") as f:
                    data = json.load(f)

                new_nodes = set(data.get("nodes", {}).keys()) - old_nodes
                if not new_nodes:
                    # In case of duplicates or other issues, fall back to last node if it exists
                    if data.get("nodes"):
                        node_id = list(data["nodes"].keys())[-1]
                    else:
                        print("Sync error: No nodes found in archive.")
                        return
                else:
                    node_id = list(new_nodes)[0]

                node = data["nodes"][node_id]

                # Find related edges
                edges = [e for e in data["edges"] if e["source"] == node_id or e["target"] == node_id]

                payload = {
                    "type": "sync",
                    "node": node,
                    "edges": edges
                }
                await ws.send(json.dumps(payload))
                await ws.recv() # Await status
        except Exception as e:
            print(f"Grid sync error: {e}")
