import pytest
from fastapi.testclient import TestClient
import sys
import os
from unittest.mock import patch, MagicMock

# Add hypervisor to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from hypervisor.src.api.server import app, autoresearch_daemon, auto_training_loop

client = TestClient(app)

def test_startup_shutdown_events():
    # Setup mocks
    with patch.object(autoresearch_daemon, 'start') as mock_ar_start, \
         patch.object(auto_training_loop, 'start') as mock_at_start, \
         patch.object(autoresearch_daemon, 'stop') as mock_ar_stop, \
         patch.object(auto_training_loop, 'stop') as mock_at_stop:

        # Test startup event
        with TestClient(app) as test_client:
            mock_ar_start.assert_called_once()
            mock_at_start.assert_called_once()

            # Application is now running, lets make a request
            response = test_client.get("/health")
            assert response.status_code == 200

        # After TestClient context exits, shutdown event is fired
        mock_ar_stop.assert_called_once()
        mock_at_stop.assert_called_once()
