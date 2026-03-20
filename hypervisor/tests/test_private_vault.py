import pytest
from fastapi.testclient import TestClient
from src.api.server import app

client = TestClient(app)

def test_private_vault_stub():
    pass
