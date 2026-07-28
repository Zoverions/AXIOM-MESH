import pytest
from fastapi.testclient import TestClient
import sys
import os
from unittest.mock import patch

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from hypervisor.src.api.server import app

client = TestClient(app)

def test_health_check_ok():
    with patch('hypervisor.src.api.server.context_engine') as mock_context_engine:
        # Mocking deep_archive.degraded_counters to empty
        mock_context_engine.deep_archive.degraded_counters = {}

        with patch.dict('hypervisor.src.api.server.intent_metrics', {"success": 0, "error": 0, "degraded": 0}, clear=True):
            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ok"
            assert data["component"] == "hypervisor"
            assert isinstance(data["uptime_seconds"], int)
            assert data["ready"] is True
            assert data["timestamp"].endswith("Z")
            assert data["dependencies"]["grid"] == "ok"
            assert data["dependencies"]["ipfs"] == "ok"
            assert data["dependencies"]["arweave"] == "ok"
            assert data["dependencies"]["sandbox"] == "ok"
            assert data["metrics"]["distributed"] == {}
            assert data["metrics"]["degraded"] == 0

def test_health_check_degraded_distributed():
    with patch('hypervisor.src.api.server.context_engine') as mock_context_engine:
        mock_context_engine.deep_archive.degraded_counters = {
            "grid": 1,
            "ipfs": 0,
            "arweave": 5
        }

        with patch.dict('hypervisor.src.api.server.intent_metrics', {"success": 0, "error": 0, "degraded": 0}, clear=True):
            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "degraded"
            assert data["component"] == "hypervisor"
            assert data["ready"] is False
            assert data["dependencies"]["grid"] == "degraded"
            assert data["dependencies"]["ipfs"] == "ok"
            assert data["dependencies"]["arweave"] == "degraded"
            assert data["dependencies"]["sandbox"] == "ok"
            assert data["metrics"]["distributed"] == {
                "grid": 1,
                "ipfs": 0,
                "arweave": 5
            }

def test_health_check_degraded_intent():
    with patch('hypervisor.src.api.server.context_engine') as mock_context_engine:
        mock_context_engine.deep_archive.degraded_counters = {}

        with patch.dict('hypervisor.src.api.server.intent_metrics', {"success": 0, "error": 0, "degraded": 1}, clear=True):
            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "degraded"
            assert data["component"] == "hypervisor"
            assert data["ready"] is False
            assert data["dependencies"]["grid"] == "ok"
            assert data["dependencies"]["ipfs"] == "ok"
            assert data["dependencies"]["arweave"] == "ok"
            assert data["dependencies"]["sandbox"] == "ok"
            assert data["metrics"]["distributed"] == {}
            assert data["metrics"]["degraded"] == 1


def test_health_live():
    response = client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["component"] == "hypervisor"
    assert isinstance(data["uptime_seconds"], int)


def test_health_ready_ok():
    with patch('hypervisor.src.api.server.context_engine') as mock_context_engine:
        mock_context_engine.deep_archive.degraded_counters = {}
        with patch.dict('hypervisor.src.api.server.intent_metrics', {"success": 1, "error": 0, "degraded": 0}, clear=True):
            response = client.get("/health/ready")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ready"


def test_health_ready_not_ready():
    with patch('hypervisor.src.api.server.context_engine') as mock_context_engine:
        mock_context_engine.deep_archive.degraded_counters = {"grid": 1}
        with patch.dict('hypervisor.src.api.server.intent_metrics', {"success": 1, "error": 0, "degraded": 0}, clear=True):
            response = client.get("/health/ready")
            assert response.status_code == 503
            data = response.json()
            assert data["status"] == "not_ready"
            assert data["dependencies"]["grid"] == "degraded"
