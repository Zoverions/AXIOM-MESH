import pytest
import asyncio
import os
import hmac
import hashlib
import time
import uuid
from httpx import AsyncClient, ASGITransport
from src.api.server import app
from src.orchestrator.task_scheduler import global_scheduler

def build_schedule_signature(name: str, interval: int, is_recurring: bool, command: str, timestamp_ms: int, nonce: str, key: str) -> str:
    canonical = f"{name}:{interval}:{is_recurring}:{command}:{timestamp_ms}:{nonce}"
    return hmac.new(key.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()

@pytest.mark.asyncio
async def test_scheduler_lifecycle():
    # It should not be running initially
    assert not global_scheduler.running
    global_scheduler.start()
    assert global_scheduler.running
    assert global_scheduler._task is not None

    # Check if pre-established tasks are loaded
    tasks = global_scheduler.get_tasks()
    assert len(tasks) > 0

    global_scheduler.stop()
    assert not global_scheduler.running

@pytest.mark.asyncio
async def test_scheduler_api():
    os.environ["TASK_SCHEDULER_SIGNING_KEY"] = "test-signing-key"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        nonce = str(uuid.uuid4())
        timestamp_ms = int(time.time() * 1000)
        command = "echo hello"
        signature = build_schedule_signature("test_task", 3600, True, command, timestamp_ms, nonce, os.environ["TASK_SCHEDULER_SIGNING_KEY"])

        # Create a task
        response = await ac.post("/tasks/schedule", json={
            "name": "test_task",
            "interval": 3600,
            "is_recurring": True,
            "command": command,
            "timestamp_ms": timestamp_ms,
            "nonce": nonce,
            "signature": signature,
        })
        assert response.status_code == 200
        assert response.json() == {"status": "scheduled", "task_name": "test_task"}

        # List tasks
        response = await ac.get("/tasks/")
        assert response.status_code == 200
        tasks = response.json()["tasks"]
        assert any(t["name"] == "test_task" for t in tasks)

        # Delete task
        response = await ac.delete("/tasks/test_task")
        assert response.status_code == 200

        # List tasks again
        response = await ac.get("/tasks/")
        tasks = response.json()["tasks"]
        assert not any(t["name"] == "test_task" for t in tasks)


@pytest.mark.asyncio
async def test_scheduler_rejects_invalid_signature():
    os.environ["TASK_SCHEDULER_SIGNING_KEY"] = "test-signing-key"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/tasks/schedule", json={
            "name": "bad_task",
            "interval": 60,
            "is_recurring": False,
            "command": "echo blocked",
            "timestamp_ms": int(time.time() * 1000),
            "nonce": str(uuid.uuid4()),
            "signature": "not-valid",
        })
        assert response.status_code == 403
