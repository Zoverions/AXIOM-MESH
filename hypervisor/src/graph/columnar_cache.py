import json
import gzip
import os
import threading
from typing import Any, Dict, List

class ColumnarCache:
    """
    Implements a columnar storage/cache, where data is grouped by field rather than by row.
    Efficient for aggregations and analytic workloads. Supports compression.
    """
    def __init__(self, directory: str):
        self.directory = directory
        self.columns: Dict[str, List[Any]] = {}
        self.lock = threading.Lock()

        if not os.path.exists(self.directory):
            os.makedirs(self.directory)

    def insert(self, records: List[Dict[str, Any]]) -> None:
        """
        Inserts a list of row-oriented records into the columnar format.
        """
        with self.lock:
            for record in records:
                for key, value in record.items():
                    if key not in self.columns:
                        self.columns[key] = []
                    self.columns[key].append(value)

    def get_column(self, column_name: str) -> List[Any]:
        """
        Retrieves an entire column of data. Returns empty list if not found.
        """
        with self.lock:
            return self.columns.get(column_name, [])

    def flush_to_disk(self) -> None:
        """
        Saves each column to a separate compressed file.
        """
        with self.lock:
            for col_name, data in self.columns.items():
                if not data:
                    continue
                filename = f"{col_name}.json.gz"
                filepath = os.path.join(self.directory, filename)

                with gzip.open(filepath, 'wt', encoding='utf-8') as f:
                    json.dump(data, f)

    def load_from_disk(self) -> None:
        """
        Loads all columns from compressed files into memory.
        """
        with self.lock:
            if not os.path.exists(self.directory):
                return

            for filename in os.listdir(self.directory):
                if filename.endswith(".json.gz"):
                    col_name = filename[:-8] # remove .json.gz
                    filepath = os.path.join(self.directory, filename)
                    try:
                        with gzip.open(filepath, 'rt', encoding='utf-8') as f:
                            self.columns[col_name] = json.load(f)
                    except Exception:
                        pass
