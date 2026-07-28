import asyncio
import logging
from typing import Any, AsyncIterator

logger = logging.getLogger(__name__)

class QueueShutdownError(Exception):
    pass

class BackpressureError(Exception):
    pass

class BackpressureQueue:
    def __init__(self, maxsize: int = 1000, timeout: float = 30.0):
        self.queue = asyncio.Queue(maxsize=maxsize)
        self.timeout = timeout
        self._shutdown = False

    async def put(self, item: Any) -> None:
        if self._shutdown:
            raise QueueShutdownError("Queue is shutdown")

        try:
            await asyncio.wait_for(
                self.queue.put(item),
                timeout=self.timeout
            )
        except asyncio.TimeoutError:
            logger.warning(f"Backpressure triggered, queue size: {self.queue.qsize()}")
            raise BackpressureError("Queue backpressure triggered")

    async def get(self) -> Any:
        try:
            return await asyncio.wait_for(
                self.queue.get(),
                timeout=self.timeout
            )
        except asyncio.TimeoutError:
            return None

    def shutdown(self):
        self._shutdown = True
        # Note: self.queue.shutdown() is available in Python 3.13+, but we are targeting 3.9
        # In earlier versions, there's no native asyncio.Queue shutdown, so we manage the flag.

import json

# Dummy hypervisor for streaming response example (simulating the external processing logic)
class _DummyHypervisor:
    async def process_streaming(self, intent_id: str):
        class Chunk:
            def json(self):
                return '{"chunk": "data"}'
        return [Chunk(), Chunk()]

hypervisor = _DummyHypervisor()

async def stream_intent_response(intent_id: str) -> AsyncIterator[str]:
    chunks = await hypervisor.process_streaming(intent_id)
    for chunk in chunks:
        # Standardize yielding chunks over NDJSON for streaming endpoints as requested
        if hasattr(chunk, 'json'):
            yield chunk.json() + "\n"
        elif isinstance(chunk, dict):
            yield json.dumps(chunk) + "\n"
        else:
            yield str(chunk) + "\n"

from contextlib import asynccontextmanager
import asyncpg
import os

# Production-ready asyncpg pool connection pattern
_pool = None

async def init_db_pool():
    global _pool
    if not _pool:
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            raise RuntimeError("DATABASE_URL environment variable is required to initialize the database pool.")

        _pool = await asyncpg.create_pool(
            dsn=db_url,
            min_size=1,
            max_size=10
        )
    return _pool

@asynccontextmanager
async def get_db_connection() -> AsyncIterator[asyncpg.Connection]:
    pool = await init_db_pool()
    conn = await pool.acquire()
    try:
        yield conn
    finally:
        await pool.release(conn)
