import asyncio
import time
import httpx
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "hypervisor"))

from src.evolution.skill_rl import ActionEngine
from src.evolution.network_sync import NetworkSync

# Monkeypatch requests to add delay so we can see the blocking
import requests
original_post = requests.post
def delayed_post(*args, **kwargs):
    time.sleep(1.0) # simulate blocking IO
    class DummyResponse:
        status_code = 200
    return DummyResponse()
requests.post = delayed_post

# Mock server response for httpx.AsyncClient.get
original_get = httpx.AsyncClient.get
async def dummy_get(self, url, *args, **kwargs):
    if "cache" in url:
        # cache fetch
        class DummyCache:
            status_code = 404
        return DummyCache()
    class DummyResponse:
        status_code = 200
        text = "<html><body><a href='http://localhost:8000/link1'>Link</a><a href='http://localhost:8000/link2'>Link2</a></body></html>"
    return DummyResponse()
httpx.AsyncClient.get = dummy_get

async def background_task():
    for _ in range(50):
        start = time.perf_counter()
        await asyncio.sleep(0.1)
        end = time.perf_counter()
        if end - start > 0.3:
            print(f"\n[Warning] Event loop blocked for {end - start - 0.1:.4f}s", end="")
        else:
            print(".", end="", flush=True)

async def main():
    print("Starting benchmark...")
    sync = NetworkSync()
    engine = ActionEngine(network_sync=sync)

    bg_task = asyncio.create_task(background_task())

    start_time = time.time()
    await engine.offline_web_mapping(["http://localhost:8000/start"], max_depth=1)
    duration = time.time() - start_time

    bg_task.cancel()
    print(f"\nTotal mapping time: {duration:.4f}s")

if __name__ == "__main__":
    asyncio.run(main())
