import time
import asyncio
import httpx
from fastapi import FastAPI
import uvicorn
import multiprocessing
import sys
import os

# Mock Grid Server
mock_app = FastAPI()

@mock_app.get("/skills")
def get_skills():
    time.sleep(0.5) # Simulate network latency
    return {"skills": ["skill_1", "skill_2"]}

def run_mock_server():
    uvicorn.run(mock_app, host="127.0.0.1", port=5000, log_level="critical")

def run_hypervisor():
    sys.path.append(os.path.join(os.path.dirname(__file__), "src"))
    from src.api.server import app
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="critical")

async def make_request(client, i):
    payload = {
        "id": f"test_{i}",
        "channel": "test",
        "content": "/sync_skills",
        "metadata": {},
        "timestamp": int(time.time())
    }
    response = await client.post("http://127.0.0.1:8000/process", json=payload, timeout=20.0)
    return response.json()

async def run_benchmark():
    async with httpx.AsyncClient() as client:
        start_time = time.time()
        tasks = [make_request(client, i) for i in range(5)]
        results = await asyncio.gather(*tasks)
        end_time = time.time()
        print(f"Total time for 5 requests: {end_time - start_time:.2f} seconds")
        print(f"Results: {len(results)} successful")
        # print(results)

if __name__ == "__main__":
    p_mock = multiprocessing.Process(target=run_mock_server)
    p_mock.start()

    p_hyp = multiprocessing.Process(target=run_hypervisor)
    p_hyp.start()

    # Wait for servers to start
    time.sleep(4) # Increased wait time

    try:
        asyncio.run(run_benchmark())
    finally:
        p_mock.terminate()
        p_hyp.terminate()
