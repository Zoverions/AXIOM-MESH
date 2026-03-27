import json
import gzip
import os
import threading
from typing import Any, Dict, List, Optional

class WriteBatchManager:
    """
    Manages batching of write operations to reduce disk I/O.
    Periodically or threshold-based flushes to compressed storage.
    """
    def __init__(self, directory: str, batch_size: int = 100):
        self.directory = directory
        self.batch_size = batch_size
        self.buffer: List[Dict[str, Any]] = []
        self.lock = threading.Lock()

        if not os.path.exists(self.directory):
            os.makedirs(self.directory)

    def add(self, data: Dict[str, Any]) -> None:
        """
        Adds a record to the buffer. Flushes if batch_size is reached.
        """
        with self.lock:
            self.buffer.append(data)
            should_flush = len(self.buffer) >= self.batch_size

        if should_flush:
            self.flush()

    def flush(self) -> None:
        """
        Flushes the current buffer to disk as a compressed file.
        """
        with self.lock:
            if not self.buffer:
                return

            # Use timestamp or UUID for filename in production,
            # here we use the length of directory for uniqueness or a random UUID
            import uuid
            filename = f"batch_{uuid.uuid4().hex}.json.gz"
            filepath = os.path.join(self.directory, filename)

            with gzip.open(filepath, 'wt', encoding='utf-8') as f:
                json.dump(self.buffer, f)

            self.buffer.clear()

    def load_all(self) -> List[Dict[str, Any]]:
        """
        Loads all flushed batches from disk.
        """
        results = []
        if not os.path.exists(self.directory):
            return results

        for filename in os.listdir(self.directory):
            if filename.endswith(".json.gz"):
                filepath = os.path.join(self.directory, filename)
                try:
                    with gzip.open(filepath, 'rt', encoding='utf-8') as f:
                        data = json.load(f)
                        results.extend(data)
                except Exception:
                    # Ignore corrupted files
                    pass
        return results
