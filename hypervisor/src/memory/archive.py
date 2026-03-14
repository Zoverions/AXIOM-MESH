import asyncio
import hashlib
import json
import os
import re
import uuid
from typing import Dict, List

import httpx
from ecdsa import NIST256p, SigningKey

_STOPWORDS = frozenset(
    {
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with",
        "is", "are", "was", "were", "it", "this", "that", "of", "by", "as",
    }
)
_NON_WORD_PATTERN = re.compile(r"[^\w\s]")


class DeepArchive:
    def __init__(self, storage_path: str = "data/archive.json"):
        self.storage_path = storage_path
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
        if not os.path.exists(self.storage_path) or os.path.getsize(self.storage_path) == 0:
            with open(self.storage_path, "w") as f:
                json.dump({"nodes": {}, "edges": []}, f)
            return

        # Migration logic from old flat list format.
        try:
            with open(self.storage_path, "r") as f:
                data = json.load(f)

            if isinstance(data, list):
                new_data = {"nodes": {}, "edges": []}
                previous_node_id = None
                for item in data:
                    node_id = str(uuid.uuid4())
                    content = item.get("content", "")
                    metadata = item.get("metadata", {})
                    new_data["nodes"][node_id] = {
                        "id": node_id,
                        "content": content,
                        "metadata": metadata,
                        "keywords": self._extract_keywords(content),
                    }
                    if previous_node_id is not None:
                        new_data["edges"].append(
                            {
                                "source": previous_node_id,
                                "target": node_id,
                                "relationship": "sequential",
                                "weight": 1,
                            }
                        )
                    previous_node_id = node_id

                with open(self.storage_path, "w") as f:
                    json.dump(new_data, f, indent=2)
        except Exception:
            with open(self.storage_path, "w") as f:
                json.dump({"nodes": {}, "edges": []}, f)

    def _extract_keywords(self, text: str) -> List[str]:
        text = _NON_WORD_PATTERN.sub("", text.lower())
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

        return [
            {"content": data["nodes"][node_id]["content"], "metadata": data["nodes"][node_id].get("metadata", {})}
            for node_id in traversed_nodes
        ]

    def add(self, content: str, metadata: Dict = None) -> None:
        with open(self.storage_path, "r") as f:
            data = json.load(f)

        node_id = str(uuid.uuid4())
        keywords = self._extract_keywords(content)
        new_node = {"id": node_id, "content": content, "metadata": metadata or {}, "keywords": keywords}

        edges_added = 0
        for existing_id, existing_node in data["nodes"].items():
            shared = set(keywords).intersection(set(existing_node.get("keywords", [])))
            if shared:
                data["edges"].append(
                    {
                        "source": node_id,
                        "target": existing_id,
                        "relationship": "shares_keywords",
                        "weight": len(shared),
                    }
                )
                edges_added += 1

        if edges_added == 0 and data["nodes"]:
            last_node_id = list(data["nodes"].keys())[-1]
            data["edges"].append(
                {"source": node_id, "target": last_node_id, "relationship": "sequential", "weight": 1}
            )

        data["nodes"][node_id] = new_node
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)


class DistributedDeepArchive(DeepArchive):
    """DeepArchive with Grid sync/query and deterministic non-interactive ZKP generation."""

    P_HEX = "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF"
    P = int(P_HEX, 16)
    Q = (P - 1) // 2
    G = 2

    def __init__(self, storage_path: str = "data/archive.json", grid_ws_url: str = "ws://localhost:5000/ws/graph"):
        super().__init__(storage_path)
        self.grid_ws_url = grid_ws_url

        key_path = "data/node_key.pem"
        os.makedirs("data", exist_ok=True)
        if os.path.exists(key_path):
            with open(key_path, "rb") as f:
                self.private_key = SigningKey.from_pem(f.read())
        else:
            self.private_key = SigningKey.generate(curve=NIST256p)
            with open(key_path, "wb") as f:
                f.write(self.private_key.to_pem())

        self.public_key_hex = self.private_key.get_verifying_key().to_string("uncompressed").hex()
        self._secret_x = int.from_bytes(os.urandom(32), "big") % self.Q
        self._public_y = pow(self.G, self._secret_x, self.P)

    async def persist_to_ipfs(self, payload: dict) -> str:
        ipfs_url = os.environ.get("IPFS_API_URL", "http://127.0.0.1:5001/api/v0/add")
        ipfs_api_key = os.environ.get("IPFS_API_KEY", "")

        headers = {}
        if ipfs_api_key:
            headers["Authorization"] = f"Basic {ipfs_api_key}"

        max_retries = 3
        base_delay = 1.0
        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    response = await client.post(
                        ipfs_url,
                        files={"file": json.dumps(payload).encode()},
                        headers=headers,
                        timeout=5.0
                    )
                    if response.status_code == 200:
                        cid = response.json().get("Hash")
                        if cid:
                            return cid
                    if response.status_code in (401, 403):
                        raise RuntimeError(f"IPFS authentication failed (Status {response.status_code})")
                except httpx.RequestError:
                    pass

                if attempt < max_retries - 1:
                    await asyncio.sleep(base_delay * (2**attempt))

        raise RuntimeError(f"Failed to persist to IPFS at {ipfs_url} after {max_retries} attempts.")

    async def persist_to_arweave(self, payload: dict) -> str:
        arweave_url = os.environ.get("ARWEAVE_API_URL", "https://upload.ardrive.io/v1/tx")
        arweave_api_key = os.environ.get("ARWEAVE_API_KEY", "")

        headers = {"Content-Type": "application/json"}
        if arweave_api_key:
            headers["Authorization"] = f"Bearer {arweave_api_key}"

        max_retries = 3
        base_delay = 1.0
        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    response = await client.post(
                        arweave_url,
                        content=json.dumps(payload),
                        headers=headers,
                        timeout=5.0,
                    )
                    if response.status_code in (200, 201, 202, 208):
                        resp_data = response.json() if response.text else {}
                        tx_id = resp_data.get("id") or resp_data.get("tx_id")
                        if tx_id:
                            return tx_id
                        raise RuntimeError(f"Arweave gateway returned success but no transaction ID: {response.text}")
                    if response.status_code in (401, 403):
                        raise RuntimeError(
                            f"Arweave authentication failed (Status {response.status_code}). Please provide a valid ARWEAVE_API_KEY."
                        )
                except httpx.RequestError:
                    pass

                if attempt < max_retries - 1:
                    await asyncio.sleep(base_delay * (2**attempt))

        raise RuntimeError(f"Failed to persist to Arweave at {arweave_url} after {max_retries} attempts.")

    def _generate_mock_zkp(self, query: str) -> str:
        # Backward-compatible alias; now backed by real NIZK generation.
        return self._generate_zkp(query)

    def _generate_zkp(self, query: str) -> str:
        v = int.from_bytes(os.urandom(32), "big") % self.Q
        t = pow(self.G, v, self.P)

        hasher = hashlib.sha256()
        hasher.update(str(self._public_y).encode())
        hasher.update(str(t).encode())
        hasher.update(query.encode())
        c = int(hasher.hexdigest(), 16) % self.Q

        r = (v - c * self._secret_x) % self.Q
        return json.dumps({"y": hex(self._public_y), "t": hex(t), "r": hex(r)})

    async def search_distributed(self, query: str) -> List[Dict]:
        local_results = self.search(query)

        try:
            import websockets

            async with websockets.connect(self.grid_ws_url) as ws:
                await ws.send(json.dumps({"type": "query", "query": query, "proof": self._generate_zkp(query)}))
                grid_data = json.loads(await ws.recv())

                if "nodes" in grid_data:
                    for node in grid_data["nodes"]:
                        local_results.append(
                            {
                                "content": node["content"],
                                "metadata": {**(node.get("metadata") or {}), "source": "grid_p2p"},
                            }
                        )
        except Exception as e:
            print(f"Distributed search error: {e}")

        return local_results

    async def sync_to_grid(self, content: str, metadata: Dict = None) -> None:
        with open(self.storage_path, "r") as f:
            data = json.load(f)
        old_nodes = set(data.get("nodes", {}).keys())

        self.add(content, metadata)

        with open(self.storage_path, "r") as f:
            data = json.load(f)

        new_nodes = set(data.get("nodes", {}).keys()) - old_nodes
        if not new_nodes:
            if not data.get("nodes"):
                print("Sync error: No nodes found in archive.")
                return
            node_id = list(data["nodes"].keys())[-1]
        else:
            node_id = list(new_nodes)[0]

        node = data["nodes"][node_id]
        edges = [e for e in data["edges"] if e["source"] == node_id or e["target"] == node_id]

        persist_payload = {"node": node, "edges": edges}
        node.setdefault("metadata", {})["ipfs_cid"] = await self.persist_to_ipfs(persist_payload)
        node["metadata"]["arweave_tx"] = await self.persist_to_arweave(persist_payload)

        data["nodes"][node_id] = node
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)

        try:
            import websockets

            async with websockets.connect(self.grid_ws_url) as ws:
                payload_str = f"{node.get('id', '')}:{len(edges)}"
                hash_val = hashlib.sha256(payload_str.encode()).digest()
                signature = self.private_key.sign_digest(hash_val).hex()

                await ws.send(
                    json.dumps(
                        {
                            "type": "sync",
                            "node": node,
                            "edges": edges,
                            "node_id": self.public_key_hex,
                            "signature": signature,
                        }
                    )
                )
                await ws.recv()
        except Exception as e:
            print(f"Grid sync error: {e}")
