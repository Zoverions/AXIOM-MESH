import os
import shutil
import tempfile
import pytest

from src.graph.write_batch_manager import WriteBatchManager
from src.graph.columnar_cache import ColumnarCache
from src.graph.lru_tiered_cache import LRUTieredCache

@pytest.fixture
def temp_dir():
    d = tempfile.mkdtemp()
    yield d
    shutil.rmtree(d)

def test_write_batch_manager(temp_dir):
    manager = WriteBatchManager(directory=temp_dir, batch_size=2)

    # Should not flush yet
    manager.add({"id": 1, "name": "A"})
    assert len(os.listdir(temp_dir)) == 0

    # Should flush now because batch_size=2
    manager.add({"id": 2, "name": "B"})
    assert len(os.listdir(temp_dir)) == 1

    # Check load
    loaded = manager.load_all()
    assert len(loaded) == 2
    assert loaded[0]["id"] == 1
    assert loaded[1]["id"] == 2

    # Test manual flush
    manager.add({"id": 3, "name": "C"})
    manager.flush()
    assert len(os.listdir(temp_dir)) == 2

    loaded2 = manager.load_all()
    assert len(loaded2) == 3

def test_columnar_cache(temp_dir):
    cache = ColumnarCache(directory=temp_dir)
    records = [
        {"id": 1, "value": 10},
        {"id": 2, "value": 20},
        {"id": 3, "value": 30}
    ]
    cache.insert(records)

    # Test memory
    ids = cache.get_column("id")
    assert ids == [1, 2, 3]

    values = cache.get_column("value")
    assert values == [10, 20, 30]

    # Test disk
    cache.flush_to_disk()
    assert len(os.listdir(temp_dir)) == 2  # id.json.gz and value.json.gz

    # Load into new cache
    cache2 = ColumnarCache(directory=temp_dir)
    cache2.load_from_disk()
    assert cache2.get_column("id") == [1, 2, 3]

def test_lru_tiered_cache(temp_dir):
    cache = LRUTieredCache(directory=temp_dir, max_memory_items=2)

    # Add items within memory limit
    cache.put("key1", "value1")
    cache.put("key2", "value2")

    assert cache.get("key1") == "value1"
    assert len(os.listdir(temp_dir)) == 0

    # Add 3rd item, key2 should be evicted because key1 was accessed last (so key2 is LRU)
    cache.put("key3", "value3")
    assert len(os.listdir(temp_dir)) == 1

    # Retrieve key2 from disk
    assert cache.get("key2") == "value2"
    # Now key2 is back in memory, key1 (LRU among remaining) should be evicted
    assert len(os.listdir(temp_dir)) == 1

    # Verify we can clear correctly
    cache.clear()
    assert cache.get("key1") is None
    assert cache.get("key2") is None
    assert cache.get("key3") is None
    assert len(os.listdir(temp_dir)) == 0
