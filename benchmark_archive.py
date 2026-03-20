import time
import os
import json
import uuid
import sys

# Setup test data
test_path = "data/test_archive.json"
os.makedirs("data", exist_ok=True)

# Generate mock data manually to avoid slow .add() method
print("Generating test data...")
data = {"nodes": {}, "edges": []}
for i in range(5000):
    node_id = str(uuid.uuid4())
    data["nodes"][node_id] = {
        "id": node_id,
        "content": f"test content {i}",
        "metadata": {"session_id": "test_session" if i % 2 == 0 else "other_session", "idx": i},
        "keywords": [f"test", "content", str(i)],
        "timestamp": time.time()
    }

with open(test_path, "w") as f:
    json.dump(data, f)

print(f"File size: {os.path.getsize(test_path) / 1024 / 1024:.2f} MB")

# Import now that we have data
sys.path.insert(0, os.path.abspath('hypervisor'))
from src.memory.archive import DeepArchive

archive = DeepArchive(test_path)

# Benchmark get_all
print("Benchmarking get_all...")
start_time = time.time()

num_reads = 100
for _ in range(num_reads):
    results = archive.get_all(session_id="test_session")

end_time = time.time()
duration = end_time - start_time

print(f"Time for {num_reads} get_all calls: {duration:.4f}s")
print(f"Average time per get_all call: {duration / num_reads:.4f}s")

# Clean up
if os.path.exists(test_path):
    os.remove(test_path)
