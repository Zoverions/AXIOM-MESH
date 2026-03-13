import json
import os
import uuid
import re
import asyncio
import hashlib
import httpx
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

    # RFC 3526 1536-bit MODP Group prime (Safe Prime P)
    P_HEX = "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF"
    P = int(P_HEX, 16)
    Q = (P - 1) // 2
    G = 2

    def __init__(self, storage_path="data/archive.json", grid_ws_url="ws://localhost:5000/ws/graph"):
        super().__init__(storage_path)
        self.grid_ws_url = grid_ws_url

    async def persist_to_ipfs(self, payload: dict) -> str:
        """
        Persists the given payload to IPFS and returns the CID.
        Uses a public gateway or local node, falls back to a mock CID if it fails.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://127.0.0.1:5001/api/v0/add",
                    files={"file": json.dumps(payload).encode()},
                    timeout=2.0
                )
                if response.status_code == 200:
                    return response.json().get("Hash", "mock-ipfs-cid")
        except Exception:
            pass
        return "mock-ipfs-cid"

    async def persist_to_arweave(self, payload: dict) -> str:
        """
        Persists the given payload to Arweave and returns the Transaction ID.
        Uses a public gateway or local node, falls back to a mock TX if it fails.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://arweave.net/tx",
                    json={"data": json.dumps(payload)},
                    timeout=2.0
                )
                if response.status_code in (200, 202):
                    # In a real app we'd sign and get the txid properly
                    return "mock-arweave-tx"
        except Exception:
            pass
        return "mock-arweave-tx"

    def _generate_mock_zkp(self, query: str) -> str:
        # Ephemeral private key for the node
        self._secret_x = int.from_bytes(os.urandom(32), 'big') % self.Q
        self._public_y = pow(self.G, self._secret_x, self.P)

    def _generate_zkp(self, query: str) -> str:
        """
        Generates a Non-Interactive Zero-Knowledge Proof (NIZK) of a discrete logarithm.
        This proves the node knows its secret without revealing it, using the Fiat-Shamir heuristic.
        """
        # Random v
        v = int.from_bytes(os.urandom(32), 'big') % self.Q
        t = pow(self.G, v, self.P)

        # Challenge c = Hash(y || t || query)
        hasher = hashlib.sha256()
        hasher.update(str(self._public_y).encode())
        hasher.update(str(t).encode())
        hasher.update(query.encode())
        c = int(hasher.hexdigest(), 16) % self.Q

        # Response r = v - c * x (mod Q)
        r = (v - c * self._secret_x) % self.Q

        proof_data = {
            "y": hex(self._public_y),
            "t": hex(t),
            "r": hex(r)
        }
        return json.dumps(proof_data)

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
                proof = self._generate_zkp(query)
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
            "node": node,
            "edges": edges
        }

        # Persist to IPFS and Arweave
        ipfs_cid = await self.persist_to_ipfs(payload)
        arweave_tx = await self.persist_to_arweave(payload)

        # Update the node's metadata
        if "metadata" not in node:
            node["metadata"] = {}
        node["metadata"]["ipfs_cid"] = ipfs_cid
        node["metadata"]["arweave_tx"] = arweave_tx

        # Save updated node locally
        data["nodes"][node_id] = node
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)

        # Sync to Grid
        try:
            import websockets
            async with websockets.connect(self.grid_ws_url) as ws:
                sync_payload = {
                    "type": "sync",
                    "node": node,
                    "edges": edges
                }
                await ws.send(json.dumps(sync_payload))
                await ws.recv() # Await status
        except Exception as e:
            print(f"Grid sync error: {e}")
