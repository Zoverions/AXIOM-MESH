import asyncio
import time
import uuid
import os
import secrets
from pathlib import Path

# Add the parent directory to the path
import sys
sys.path.insert(0, str(Path(__file__).parent))

from provision_service import generate_invitation, InvitationRequest, token_store

async def benchmark_endpoint(num_requests=100):
    start_time = time.time()

    # We will simulate the endpoint directly to measure the specific issue
    # and to bypass HTTP overhead which might mask the file IO blocking

    for _ in range(num_requests):
        request = InvitationRequest(
            node_type="validator",
            duration_minutes=5,
            max_uses=1,
            metadata={}
        )
        await generate_invitation(request)

    end_time = time.time()
    duration = end_time - start_time

    print(f"Executed {num_requests} requests in {duration:.4f} seconds")
    print(f"Average time per request: {(duration/num_requests)*1000:.2f} ms")
    print(f"Throughput: {num_requests/duration:.2f} req/s")

    return duration

if __name__ == "__main__":
    os.environ["MESH_ID"] = "test-mesh"
    os.environ["COORDINATOR_URL"] = "http://test-url"

    # Run the benchmark
    print("Running initial baseline benchmark...")
    asyncio.run(benchmark_endpoint(200))
