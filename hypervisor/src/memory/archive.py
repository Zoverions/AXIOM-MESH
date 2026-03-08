import json
import os
from typing import List, Dict

class DeepArchive:
    def __init__(self, storage_path="data/archive.json"):
        self.storage_path = storage_path
        self._ensure_storage()

    def _ensure_storage(self):
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
        if not os.path.exists(self.storage_path):
            with open(self.storage_path, "w") as f:
                json.dump([], f)

    def search(self, query: str) -> List[Dict]:
        with open(self.storage_path, "r") as f:
            data = json.load(f)

        results = [item for item in data if query.lower() in item.get("content", "").lower()]
        return results

    def add(self, content: str, metadata: Dict = None):
        with open(self.storage_path, "r") as f:
            data = json.load(f)
        data.append({"content": content, "metadata": metadata or {}})
        with open(self.storage_path, "w") as f:
            json.dump(data, f)
