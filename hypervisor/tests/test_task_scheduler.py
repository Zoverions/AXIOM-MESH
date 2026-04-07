import pytest
import asyncio
import os
import hmac
import hashlib
import time
import uuid
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport
from src.api.server import app
from src.orchestrator.task_scheduler import global_scheduler
from src.api.routers import tasks as tasks_router

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

# M7.3 Sandbox scheduled-command execution: replace raw command execution in hypervisor/src/api/routers/tasks.py with an allowlisted/sandboxed executor, signed task payloads, per-command timeouts, and immutable audit evidence.
@pytest.mark.asyncio
async def test_m73_sandbox_scheduled_command_execution():
    os.environ["TASK_SCHEDULER_SIGNING_KEY"] = "test-signing-key"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        nonce = str(uuid.uuid4())
        timestamp_ms = int(time.time() * 1000)
        command = "echo hello"

        # Test signature for an allowlisted command (echo)
        signature = build_schedule_signature("test_task", 3600, True, command, timestamp_ms, nonce, os.environ["TASK_SCHEDULER_SIGNING_KEY"])

        # Create a signed task payload
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

        # List tasks to ensure it was created
        response = await ac.get("/tasks/")
        assert response.status_code == 200
        tasks = response.json()["tasks"]
        assert any(t["name"] == "test_task" for t in tasks)

        # Delete the task to clean up
        response = await ac.delete("/tasks/test_task")
        assert response.status_code == 200

        # List tasks again to ensure it was removed
        response = await ac.get("/tasks/")
        tasks = response.json()["tasks"]
        assert not any(t["name"] == "test_task" for t in tasks)

# M7.3 Sandbox scheduled-command execution (immutable audit evidence + signature checking)
@pytest.mark.asyncio
async def test_m73_scheduler_rejects_invalid_signature_and_raw_commands():
    os.environ["TASK_SCHEDULER_SIGNING_KEY"] = "test-signing-key"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/tasks/schedule", json={
            "name": "bad_task",
            "interval": 60,
            "is_recurring": False,
            "command": "cat /etc/passwd", # Command execution without signature/whitelist
            "timestamp_ms": int(time.time() * 1000),
            "nonce": str(uuid.uuid4()),
            "signature": "not-valid",
        })
        # Should be rejected because it lacks a valid signature
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_scheduler_defers_non_local_route(monkeypatch):
    os.environ["TASK_SCHEDULER_SIGNING_KEY"] = "test-signing-key"
    nonce = str(uuid.uuid4())
    timestamp_ms = int(time.time() * 1000)
    command = "echo deferred"
    signature = build_schedule_signature("deferred_task", 3600, True, command, timestamp_ms, nonce, os.environ["TASK_SCHEDULER_SIGNING_KEY"])

    monkeypatch.setattr(tasks_router, "analyze_metrics", lambda state: {"metrics": {"local_load": 0.92, "memory_pressure": 0.81}})
    monkeypatch.setattr(tasks_router, "evaluate_route", AsyncMock(return_value={"selected_route": "p2p"}))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/tasks/schedule", json={
            "name": "deferred_task",
            "interval": 3600,
            "is_recurring": True,
            "command": command,
            "priority_tag": "background",
            "timestamp_ms": timestamp_ms,
            "nonce": nonce,
            "signature": signature,
        })
        assert response.status_code == 200

    assert "deferred_task" in global_scheduler.tasks
    await global_scheduler.tasks["deferred_task"]["func"]()
    tasks_router.evaluate_route.assert_awaited()
    global_scheduler.remove_task("deferred_task")


@pytest.mark.asyncio
async def test_scheduler_rejects_high_risk_without_required_approvals():
    os.environ["TASK_SCHEDULER_SIGNING_KEY"] = "test-signing-key"
    nonce = str(uuid.uuid4())
    timestamp_ms = int(time.time() * 1000)
    command = "echo high-risk"
    signature = build_schedule_signature("high_risk_task", 60, False, command, timestamp_ms, nonce, os.environ["TASK_SCHEDULER_SIGNING_KEY"])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/tasks/schedule", json={
            "name": "high_risk_task",
            "interval": 60,
            "is_recurring": False,
            "command": command,
            "risk_class": "high",
            "required_approvals": 1,
            "autonomy_level": "autonomous",
            "fleet_scope": "business",
            "timestamp_ms": timestamp_ms,
            "nonce": nonce,
            "signature": signature,
        })
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_scheduler_accepts_high_risk_with_required_approvals(monkeypatch):
    os.environ["TASK_SCHEDULER_SIGNING_KEY"] = "test-signing-key"
    nonce = str(uuid.uuid4())
    timestamp_ms = int(time.time() * 1000)
    command = "echo approved"
    signature = build_schedule_signature("approved_task", 60, False, command, timestamp_ms, nonce, os.environ["TASK_SCHEDULER_SIGNING_KEY"])

    monkeypatch.setattr(tasks_router, "analyze_metrics", lambda state: {"metrics": {"local_load": 0.3, "memory_pressure": 0.2}})
    monkeypatch.setattr(tasks_router, "evaluate_route", AsyncMock(return_value={"selected_route": "p2p"}))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/tasks/schedule", json={
            "name": "approved_task",
            "interval": 60,
            "is_recurring": False,
            "command": command,
            "risk_class": "high",
            "required_approvals": 2,
            "autonomy_level": "autonomous",
            "fleet_scope": "business",
            "timestamp_ms": timestamp_ms,
            "nonce": nonce,
            "signature": signature,
        })
        assert response.status_code == 200

    global_scheduler.remove_task("approved_task")
