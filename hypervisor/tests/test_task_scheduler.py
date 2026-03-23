import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from src.api.server import app
from src.orchestrator.task_scheduler import global_scheduler

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
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create a task
        response = await ac.post("/tasks/schedule", json={
            "name": "test_task",
            "interval": 3600,
            "is_recurring": True,
            "command": "echo hello"
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
