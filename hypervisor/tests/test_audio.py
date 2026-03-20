import os
import sys
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import tempfile

# Add hypervisor to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from src.api.audio import router as audio_router
import src.api.audio as audio_module

app = FastAPI()
app.include_router(audio_router)

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_audio_model():
    """Reset the global _model variable before each test."""
    audio_module._model = None
    yield
    audio_module._model = None

@patch("whisper.load_model")
def test_transcribe_audio_success(mock_load_model):
    # Mock the whisper model and its transcribe method
    mock_model = MagicMock()
    mock_model.transcribe.return_value = {"text": "This is a test transcription."}
    mock_load_model.return_value = mock_model

    # Create dummy audio content
    dummy_audio_content = b"dummy audio data"

    # Use a dummy file to upload
    response = client.post(
        "/transcribe",
        files={"file": ("test.ogg", dummy_audio_content, "audio/ogg")}
    )

    assert response.status_code == 200
    assert response.json() == {"text": "This is a test transcription."}

    # Verify the model's transcribe method was called
    mock_model.transcribe.assert_called_once()

    # Verify the temporary file path passed to transcribe ends with .ogg
    called_path = mock_model.transcribe.call_args[0][0]
    assert called_path.endswith(".ogg")

    # The file should have been deleted by the finally block
    assert not os.path.exists(called_path)

@patch("whisper.load_model")
def test_get_model_lazy_loading(mock_load_model):
    """Test that whisper.load_model is called only once and the model is cached."""
    mock_model = MagicMock()
    mock_load_model.return_value = mock_model

    # The _model should be None initially due to the reset_audio_model fixture
    assert audio_module._model is None

    # First call should load the model
    model1 = audio_module.get_model()
    mock_load_model.assert_called_once_with("base")
    assert model1 is mock_model

    # Second call should return the cached model without calling load_model again
    model2 = audio_module.get_model()
    mock_load_model.assert_called_once()  # Still called only once
    assert model2 is mock_model

@patch("whisper.load_model")
def test_transcribe_audio_exception(mock_load_model):
    # Mock the whisper model to raise an exception
    mock_model = MagicMock()
    mock_model.transcribe.side_effect = Exception("Whisper error")
    mock_load_model.return_value = mock_model

    dummy_audio_content = b"dummy audio data"

    response = client.post(
        "/transcribe",
        files={"file": ("test.ogg", dummy_audio_content, "audio/ogg")}
    )

    assert response.status_code == 500
    assert "Transcription failed: Whisper error" in response.json()["detail"]

    mock_model.transcribe.assert_called_once()
