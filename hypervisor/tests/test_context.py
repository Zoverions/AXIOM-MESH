import os
import json
import pytest
from unittest.mock import patch, mock_open

from src.engine.context import ContextEngine

@pytest.fixture
def mock_clients():
    """Mock the external clients/engines initialized by ContextEngine to avoid network calls."""
    with patch("src.engine.context.NCPClient"), \
         patch("src.engine.context.MCPClient"), \
         patch("src.engine.context.ChainlinkOracle"), \
         patch("src.engine.context.TemporalStateManager"), \
         patch("src.engine.context.DistributedDeepArchive"), \
         patch("src.engine.context.MiroFishMapper"), \
         patch("src.engine.context.DivergenceEngine"):
        yield

def test_set_user_mode(mock_clients, tmp_path):
    """Test that setting user mode updates the dictionary and writes to file."""
    pref_path = tmp_path / "data" / "preferences.json"

    # We patch os.makedirs to prevent it from creating "data" in the real CWD during __init__
    with patch("src.engine.context.os.makedirs"):
        engine = ContextEngine()

    engine.preferences_path = str(pref_path)

    # Ensure the directory exists for writing the file
    pref_path.parent.mkdir(parents=True, exist_ok=True)

    # Act
    engine.set_user_mode("alice", "analytical")

    # Assert memory state
    assert engine.user_preferences["alice"] == "analytical"

    # Assert file state
    assert os.path.exists(pref_path)
    with open(pref_path, "r") as f:
        data = json.load(f)

    assert data == {"alice": "analytical"}

    # Try setting another one to verify it updates instead of overwriting all
    engine.set_user_mode("bob", "executive")
    assert engine.user_preferences["alice"] == "analytical"
    assert engine.user_preferences["bob"] == "executive"

    with open(pref_path, "r") as f:
        data = json.load(f)

    assert data == {"alice": "analytical", "bob": "executive"}

def test_init_loads_existing_preferences(mock_clients):
    """Test that ContextEngine loads existing preferences from the JSON file on init."""
    pref_data = '{"bob": "socratic"}'

    with patch("src.engine.context.os.makedirs"), \
         patch("src.engine.context.os.path.exists", return_value=True), \
         patch("builtins.open", mock_open(read_data=pref_data)):

        engine = ContextEngine()
        assert engine.user_preferences == {"bob": "socratic"}

def test_init_handles_invalid_json(mock_clients):
    """Test that ContextEngine falls back to an empty dict if the JSON is invalid."""
    pref_data = 'invalid json'

    with patch("src.engine.context.os.makedirs"), \
         patch("src.engine.context.os.path.exists", return_value=True), \
         patch("builtins.open", mock_open(read_data=pref_data)):

        engine = ContextEngine()
        assert engine.user_preferences == {}

def test_init_creates_data_directory(mock_clients):
    """Test that ContextEngine initializes the data directory."""
    with patch("src.engine.context.os.makedirs") as mock_makedirs, \
         patch("src.engine.context.os.path.exists", return_value=False):

        engine = ContextEngine()
        mock_makedirs.assert_called_once_with("data", exist_ok=True)
        assert engine.user_preferences == {}
