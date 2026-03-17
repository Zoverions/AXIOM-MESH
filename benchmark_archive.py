import time
import uuid
import random
import string
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "hypervisor", "src"))
from memory.archive import DeepArchive

def generate_random_word(length=5):
    return ''.join(random.choice(string.ascii_lowercase) for _ in range(length))

def generate_random_text(num_words=100):
    return ' '.join(generate_random_word(random.randint(3, 8)) for _ in range(num_words))

print("Setting up initial archive with 10000 nodes...")

archive = DeepArchive("data/benchmark_archive.json")
data = archive._load_data()
for i in range(10000):
    node_id = str(uuid.uuid4())
    data.setdefault("nodes", {})[node_id] = {
        "keywords": [generate_random_word() for _ in range(20)]
    }
archive._save_data(data)

print("Starting benchmark for add()...")

test_content = [generate_random_text(50) for _ in range(100)]

start_time = time.time()
for content in test_content:
    archive.add(content)
old_duration = time.time() - start_time
print(f"Old time: {old_duration:.4f} seconds")

# Clean up
if os.path.exists("data/benchmark_archive.json"):
    os.remove("data/benchmark_archive.json")
