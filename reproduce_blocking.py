
import asyncio
import httpx
import time
import os
import threading

API_KEY = "test-key"
BASE_URL = "http://localhost:8000"

async def call_health():
    async with httpx.AsyncClient() as client:
        start = time.perf_counter()
        resp = await client.get(f"{BASE_URL}/health")
        end = time.perf_counter()
        print(f"Health check took {end - start:.4f}s - Status: {resp.status_code}")
        return end - start

async def call_transcribe(audio_content):
    async with httpx.AsyncClient() as client:
        files = {'file': ('test.ogg', audio_content, 'audio/ogg')}
        headers = {"Authorization": f"Bearer {API_KEY}"}
        start = time.perf_counter()
        # This will likely take a while
        resp = await client.post(f"{BASE_URL}/transcribe", files=files, headers=headers, timeout=60.0)
        end = time.perf_counter()
        print(f"Transcription took {end - start:.4f}s - Status: {resp.status_code}")

async def benchmark():
    # Create a dummy large-ish content
    # whisper needs real audio probably, but let's see if we can just give it some random data or a small silent ogg
    # For blocking test, even a small file might block if the model loading/init is slow.
    audio_content = b"fake audio content" * 1000

    print("Starting background health checks...")

    # Run transcription
    transcribe_task = asyncio.create_task(call_transcribe(audio_content))

    # Wait a bit for it to start
    await asyncio.sleep(0.5)

    # Call health multiple times
    health_times = []
    for _ in range(5):
        health_times.append(await call_health())
        await asyncio.sleep(0.2)

    await transcribe_task

    avg_health = sum(health_times) / len(health_times)
    print(f"Average health check time during transcription: {avg_health:.4f}s")

if __name__ == "__main__":
    # This script assumes the server is running
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "run":
        asyncio.run(benchmark())
    else:
        print("Usage: python reproduce_blocking.py run")
