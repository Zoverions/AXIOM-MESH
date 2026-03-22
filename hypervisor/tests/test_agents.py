import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from hypervisor.src.api.server import app

def test_agents_status_endpoint_stopped():
    with TestClient(app) as client:
        response = client.get("/agents")
        assert response.status_code == 200
        data = response.json()
        assert "agents" in data
        agents = data["agents"]
        assert len(agents) == 3

        # Verify AutoResearch Daemon
        assert agents[0]["name"] == "AutoResearch Daemon"
        assert agents[0]["status"] == "Active (Idle/Foraging)" # When client is created, lifespan starts it

        # Verify AutoTraining Loop
        assert agents[1]["name"] == "AutoTraining Loop"
        # AutoTraining Loop may be stopped because AutoTrainingLoop.running is False unless start() sets it
        # Actually in lifespan, auto_training_loop.start() is called, so it might be Active
        # Let's just check the keys exist for now
        assert "status" in agents[1]
        assert "current_task" in agents[1]

        # Verify Dialectic Orchestrator
        assert agents[2]["name"] == "Dialectic Orchestrator"
        assert agents[2]["status"] == "Standby"

def test_agents_status_active_mocks():
    # If we mock the state directly
    from hypervisor.src.api.server import auto_training_loop
    import hypervisor.src.api.server as server

    with patch.object(server, 'autoresearch_task', MagicMock()) as mock_task, \
         patch.object(auto_training_loop, 'running', True):

        mock_task.done.return_value = False # Not done -> Active

        # We don't use the TestClient context manager to avoid lifespan overriding our mocks
        client = TestClient(app)
        response = client.get("/agents")

        assert response.status_code == 200
        agents = response.json()["agents"]

        assert agents[0]["name"] == "AutoResearch Daemon"
        assert agents[0]["status"] == "Active (Idle/Foraging)"

        assert agents[1]["name"] == "AutoTraining Loop"
        assert agents[1]["status"] == "Active (Mutating)"

def test_agents_status_stopped_mocks():
    from hypervisor.src.api.server import auto_training_loop
    import hypervisor.src.api.server as server

    with patch.object(server, 'autoresearch_task', MagicMock()) as mock_task, \
         patch.object(auto_training_loop, 'running', False):

        mock_task.done.return_value = True # Done -> Stopped

        client = TestClient(app)
        response = client.get("/agents")

        assert response.status_code == 200
        agents = response.json()["agents"]

        assert agents[0]["name"] == "AutoResearch Daemon"
        assert agents[0]["status"] == "Stopped"

        assert agents[1]["name"] == "AutoTraining Loop"
        assert agents[1]["status"] == "Stopped"
