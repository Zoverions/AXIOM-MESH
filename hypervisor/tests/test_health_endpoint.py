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
            assert data["dependencies"]["grid"] == "ok"
            assert data["dependencies"]["ipfs"] == "ok"
            assert data["dependencies"]["arweave"] == "ok"
            assert data["dependencies"]["sandbox"] == "ok"
            assert data["metrics"]["distributed"] == {}
            assert data["metrics"]["degraded"] == 1
