import json
import os
import uuid
import re
from typing import List, Dict

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
        text = re.sub(r'[^\w\s]', '', text.lower())
        words = text.split()
        stopwords = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "is", "are", "was", "were", "it", "this", "that", "of", "by", "as"}
        return list(set([w for w in words if w not in stopwords and len(w) > 2]))

    def search(self, query: str) -> List[Dict]:
        with open(self.storage_path, "r") as f:
            data = json.load(f)

        query_keywords = set(self._extract_keywords(query))

        entry_nodes = []
        for node_id, node in data["nodes"].items():
            node_keywords = set(node.get("keywords", []))
            if query_keywords.intersection(node_keywords) or query.lower() in node.get("content", "").lower():
                entry_nodes.append(node_id)

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
