import json
import gzip
import os
import threading
from typing import Any, Dict, Optional, Tuple

class LRUTieredCache:
    """
    Tiered Cache where hot items reside in-memory (LRU logic),
    while evicted items are spilled to disk in a compressed format.
    """
    def __init__(self, directory: str, max_memory_items: int = 1000):
        self.directory = directory
        self.max_memory_items = max_memory_items

        # O(1) memory lookup
        self.memory_cache: Dict[str, Any] = {}
        # Keeps track of access order for LRU (key: key, value: None to emulate ordered set)
        self.access_order: Dict[str, None] = {}

        self.lock = threading.Lock()

        if not os.path.exists(self.directory):
            os.makedirs(self.directory)

    def _get_disk_path(self, key: str) -> str:
        # Simplistic mapping. In prod, hash the key to avoid filename issues
        import hashlib
        safe_key = hashlib.md5(key.encode('utf-8')).hexdigest()
        return os.path.join(self.directory, f"{safe_key}.json.gz")

    def _evict_lru(self) -> None:
        """
        Evicts the least recently used item from memory to disk.
        """
        if not self.access_order:
            return

        # First item in access_order is the least recently used
        lru_key = next(iter(self.access_order))

        value = self.memory_cache.pop(lru_key, None)
        self.access_order.pop(lru_key, None)

        if value is not None:
            filepath = self._get_disk_path(lru_key)
            try:
                with gzip.open(filepath, 'wt', encoding='utf-8') as f:
                    json.dump(value, f)
            except Exception:
                pass

    def put(self, key: str, value: Any) -> None:
        with self.lock:
            # If already in memory, update value and mark as most recently used
            if key in self.memory_cache:
                self.memory_cache[key] = value
                self.access_order.pop(key, None)
                self.access_order[key] = None
                return

            # If new item and we're at capacity, evict one
            if len(self.memory_cache) >= self.max_memory_items:
                self._evict_lru()

            self.memory_cache[key] = value
            self.access_order[key] = None

    def get(self, key: str) -> Optional[Any]:
        with self.lock:
            # 1. Check Memory
            if key in self.memory_cache:
                # Mark as recently used
                self.access_order.pop(key, None)
                self.access_order[key] = None
                return self.memory_cache[key]

            # 2. Check Disk
            filepath = self._get_disk_path(key)
            if os.path.exists(filepath):
                try:
                    with gzip.open(filepath, 'rt', encoding='utf-8') as f:
                        value = json.load(f)

                    # Bring back to memory
                    if len(self.memory_cache) >= self.max_memory_items:
                        self._evict_lru()

                    self.memory_cache[key] = value
                    self.access_order[key] = None

                    # Remove from disk to prevent duplicate state
                    os.remove(filepath)

                    return value
                except Exception:
                    pass

            return None

    def clear(self) -> None:
        """
        Clears both memory and disk cache.
        """
        with self.lock:
            self.memory_cache.clear()
            self.access_order.clear()

            if os.path.exists(self.directory):
                for filename in os.listdir(self.directory):
                    if filename.endswith(".json.gz"):
                        try:
                            os.remove(os.path.join(self.directory, filename))
                        except Exception:
                            pass
