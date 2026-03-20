import asyncio
import hashlib
import json
import os
import re
import uuid
import time
from typing import Dict, List
from cryptography.fernet import Fernet

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

        self.encryption_key = os.environ.get("MEMORY_ENCRYPTION_KEY")
        self._fernet = Fernet(self.encryption_key.encode()) if self.encryption_key else None

        ttl = os.environ.get("MEMORY_TTL_DAYS")
        self.ttl_days = float(ttl) if ttl else None

        self._cache = None
        self._last_mtime = 0

        self._ensure_storage()
        self.cleanup_expired()

    def _load_data(self) -> dict:
        if not os.path.exists(self.storage_path) or os.path.getsize(self.storage_path) == 0:
            self._cache = {"nodes": {}, "edges": []}
            return self._cache

        mtime = os.path.getmtime(self.storage_path)
        if self._cache is not None and self._last_mtime == mtime:
            return self._cache

        with open(self.storage_path, "rb") as f:
            raw_data = f.read()

        if self._fernet:
            try:
                raw_data = self._fernet.decrypt(raw_data)
            except Exception as e:
                try:
                    # Fallback test: is it actually valid unencrypted JSON?
                    json.loads(raw_data.decode("utf-8"))
                except Exception:
                    # It's not valid JSON, and we failed to decrypt it. Data loss imminent if we proceed.
                    raise ValueError("Failed to decrypt archive. Invalid MEMORY_ENCRYPTION_KEY or corrupt data.") from e

        try:
            self._cache = json.loads(raw_data.decode("utf-8"))
            self._last_mtime = mtime
            return self._cache
        except json.JSONDecodeError as e:
            # If we don't have fernet configured but the data isn't valid JSON, it might be encrypted
            raise ValueError("Archive data is not valid JSON. If it is encrypted, provide the correct MEMORY_ENCRYPTION_KEY.") from e

    def _save_data(self, data: dict) -> None:
        raw_data = json.dumps(data, indent=2).encode("utf-8")
        if self._fernet:
            raw_data = self._fernet.encrypt(raw_data)

        with open(self.storage_path, "wb") as f:
            f.write(raw_data)

        self._cache = data
        self._last_mtime = os.path.getmtime(self.storage_path)

    def _ensure_storage(self) -> None:
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
        if not os.path.exists(self.storage_path) or os.path.getsize(self.storage_path) == 0:
            self._save_data({"nodes": {}, "edges": []})
            return

        # Migration logic from old flat list format.
        data = self._load_data()

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
                    "timestamp": time.time(),
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

            self._save_data(new_data)

    def _extract_keywords(self, text: str) -> List[str]:
        text = _NON_WORD_PATTERN.sub("", text.lower())
        return list({w for w in text.split() if w not in _STOPWORDS and len(w) > 2})

    def cleanup_expired(self) -> int:
        if self.ttl_days is None:
            return 0

        data = self._load_data()
        now = time.time()
        expired_nodes = []

        for node_id, node in data.get("nodes", {}).items():
            node_ts = node.get("timestamp", now)
            if (now - node_ts) > (self.ttl_days * 86400):
                expired_nodes.append(node_id)

        if not expired_nodes:
            return 0

        for node_id in expired_nodes:
            del data["nodes"][node_id]

        data["edges"] = [e for e in data.get("edges", []) if e["source"] not in expired_nodes and e["target"] not in expired_nodes]

        self._save_data(data)
        return len(expired_nodes)

    def export_data(self, format: str = "json") -> str:
        data = self._load_data()
        if format == "json":
            return json.dumps(data, indent=2)
        else:
            raise ValueError(f"Unsupported format: {format}")

    def delete_node(self, node_id: str) -> bool:
        data = self._load_data()
        if node_id not in data.get("nodes", {}):
            return False

        del data["nodes"][node_id]
        data["edges"] = [e for e in data.get("edges", []) if e["source"] != node_id and e["target"] != node_id]

        self._save_data(data)
        return True

    def clear(self) -> None:
        self._save_data({"nodes": {}, "edges": []})

    def zeroize(self) -> None:
        """
        Securely erases the archive data by overwriting the file with random bytes
        multiple times before truncating and writing an empty state.
        This enforces strict memory zeroization for bilateral severance.
        """
        if os.path.exists(self.storage_path):
            file_size = os.path.getsize(self.storage_path)
            if file_size > 0:
                # 3-pass overwrite
                with open(self.storage_path, "r+b") as f:
                    for _ in range(3):
                        f.seek(0)
                        f.write(os.urandom(file_size))
                        f.flush()
                        os.fsync(f.fileno())
        # Finally, reset to empty state
        self.clear()

    def search(self, query: str) -> List[Dict]:
        data = self._load_data()

        query_keywords = set(self._extract_keywords(query))
        entry_nodes = set()
        for node_id, node in data.get("nodes", {}).items():
            node_keywords = set(node.get("keywords", []))
            if query_keywords.intersection(node_keywords) or query.lower() in node.get("content", "").lower():
                entry_nodes.add(node_id)

        traversed_nodes = set(entry_nodes)
        for edge in data.get("edges", []):
            if edge["source"] in entry_nodes:
                traversed_nodes.add(edge["target"])
            elif edge["target"] in entry_nodes:
                traversed_nodes.add(edge["source"])

        return [
            {"content": data["nodes"][node_id]["content"], "metadata": data["nodes"][node_id].get("metadata", {})}
            for node_id in traversed_nodes
        ]

    def get_all(self, session_id: str = None) -> List[Dict]:
        data = self._load_data()

        results = []
        for node_id, node in data.get("nodes", {}).items():
            metadata = node.get("metadata", {})
            if session_id is None or metadata.get("session_id") == session_id:
                results.append({"id": node_id, "content": node["content"], "metadata": metadata})
        return results

    def delete(self, node_id: str) -> bool:
        data = self._load_data()

        if node_id in data.get("nodes", {}):
            del data["nodes"][node_id]
            data["edges"] = [e for e in data.get("edges", []) if e["source"] != node_id and e["target"] != node_id]
            self._save_data(data)
            return True
        return False

    def edit(self, node_id: str, new_content: str = None, metadata_updates: Dict = None) -> bool:
        data = self._load_data()

        if node_id in data.get("nodes", {}):
            if new_content is not None:
                data["nodes"][node_id]["content"] = new_content
            if metadata_updates is not None:
                if "metadata" not in data["nodes"][node_id]:
                    data["nodes"][node_id]["metadata"] = {}
                data["nodes"][node_id]["metadata"].update(metadata_updates)

            self._save_data(data)
            return True
        return False

    def add(self, content: str, metadata: Dict = None) -> None:
        data = self._load_data()

        node_id = str(uuid.uuid4())
        keywords = self._extract_keywords(content)
        new_node = {
            "id": node_id,
            "content": content,
            "metadata": metadata or {},
            "keywords": keywords,
            "timestamp": time.time()
        }

        edges_added = 0
        keywords_set = set(keywords)
        for existing_id, existing_node in data.get("nodes", {}).items():
            shared = keywords_set.intersection(existing_node.get("keywords", []))
            if shared:
                data.setdefault("edges", []).append(
                    {
                        "source": node_id,
                        "target": existing_id,
                        "relationship": "shares_keywords",
                        "weight": len(shared),
                    }
                )
                edges_added += 1

        if edges_added == 0 and data.get("nodes"):
            last_node_id = list(data["nodes"].keys())[-1]
            data.setdefault("edges", []).append(
                {"source": node_id, "target": last_node_id, "relationship": "sequential", "weight": 1}
            )

        data.setdefault("nodes", {})[node_id] = new_node
        self._save_data(data)


class DistributedDeepArchive(DeepArchive):
    """DeepArchive with Grid sync/query and deterministic non-interactive ZKP generation."""

    P_HEX = "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF"
    P = int(P_HEX, 16)
    Q = (P - 1) // 2
    G = 2

    def __init__(self, storage_path: str = "data/archive.json", grid_ws_url: str = None):
        super().__init__(storage_path)
        if grid_ws_url is None:
            grid_ws_url = os.environ.get("GRID_WS_URL", "ws://localhost:5000/ws/graph")
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
        self.degraded_counters = {"ipfs": 0, "arweave": 0, "grid": 0}
        self.max_sync_queue = int(os.environ.get("ARCHIVE_SYNC_BACKPRESSURE_LIMIT", "200"))

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

        max_retries = 3
        base_delay = 1.0
        import websockets

        for attempt in range(max_retries):
            try:
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
                    break
            except Exception as e:
                if attempt < max_retries - 1:
                    await asyncio.sleep(base_delay * (2 ** attempt))
                else:
                    print(f"[Degraded Mode] Grid search failed after {max_retries} attempts: {e}. Returning local results only.")

        return local_results

    async def sync_to_grid(self, content: str, metadata: Dict = None) -> None:
        if len(self._load_data().get("nodes", {})) >= self.max_sync_queue:
            print("[Degraded Mode] Archive backpressure active: sync queue limit reached. Skipping distributed sync.")
            self.degraded_counters["grid"] += 1
            self.add(content, {**(metadata or {}), "sync_mode": "local_only_backpressure"})
            return

        data = self._load_data()
        old_nodes = set(data.get("nodes", {}).keys())

        self.add(content, metadata)

        data = self._load_data()

        new_nodes = set(data.get("nodes", {}).keys()) - old_nodes
        if not new_nodes:
            if not data.get("nodes"):
                print("Sync error: No nodes found in archive.")
                return
            node_id = list(data["nodes"].keys())[-1]
        else:
            node_id = list(new_nodes)[0]

        node = data["nodes"][node_id]
        edges = [e for e in data.get("edges", []) if e["source"] == node_id or e["target"] == node_id]

        persist_payload = {"node": node, "edges": edges}

        try:
            node.setdefault("metadata", {})["ipfs_cid"] = await self.persist_to_ipfs(persist_payload)
        except Exception as e:
            print(f"[Degraded Mode] Failed to persist to IPFS: {e}")
            node.setdefault("metadata", {})["ipfs_cid"] = None
            self.degraded_counters["ipfs"] += 1

        try:
            node["metadata"]["arweave_tx"] = await self.persist_to_arweave(persist_payload)
        except Exception as e:
            print(f"[Degraded Mode] Failed to persist to Arweave: {e}")
            node.setdefault("metadata", {})["arweave_tx"] = None
            self.degraded_counters["arweave"] += 1

        data.setdefault("nodes", {})[node_id] = node
        self._save_data(data)

        max_retries = 3
        base_delay = 1.0
        import websockets
        for attempt in range(max_retries):
            try:
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
                    break
            except Exception as e:
                if attempt < max_retries - 1:
                    await asyncio.sleep(base_delay * (2 ** attempt))
                else:
                    print(f"[Degraded Mode] Grid sync failed after {max_retries} attempts: {e}")
                    self.degraded_counters["grid"] += 1

    async def sever_bond(self, peer_id: str, zk_proof: str) -> bool:
        """
        Implements bilateral severance. Requires a valid zero-knowledge proof
        that validates the peer_id's right to sever the bond and erase shared memory.
        If valid, it triggers zeroization of local data associated with that bond,
        or entirely zeroizes the memory if no bond-specific scope is given.
        """
        if not zk_proof:
            raise ValueError(f"Invalid or insufficient zero-knowledge proof for severance of bond {peer_id}")

        try:
            proof_data = json.loads(zk_proof)
        except json.JSONDecodeError:
            raise ValueError("Malformed ZKP payload: must be valid JSON")

        # Verify against Grid API
        grid_url = os.environ.get("GRID_API_URL", "http://localhost:5000") + "/zkml/verify"
        async with httpx.AsyncClient() as client:
            res = await client.post(grid_url, json=proof_data, timeout=10.0)
            if res.status_code != 200:
                raise ValueError(f"ZKP verification failed: {res.text}")

        # For this scope, the bilateral severance rule states we must trigger zeroize
        # upon successful severance to ensure complete memory privacy.
        self.zeroize()
        return True
