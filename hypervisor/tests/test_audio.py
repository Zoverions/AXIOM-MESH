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

app = FastAPI()
app.include_router(audio_router)

client = TestClient(app)

@patch("src.api.audio.get_model")
def test_transcribe_audio_success(mock_get_model):
    # Mock the whisper model and its transcribe method
    mock_model = MagicMock()
    mock_model.transcribe.return_value = {"text": "This is a test transcription."}
    mock_get_model.return_value = mock_model

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

@patch("src.api.audio.get_model")
def test_transcribe_audio_exception(mock_get_model):
    # Mock the whisper model to raise an exception
    mock_model = MagicMock()
    mock_model.transcribe.side_effect = Exception("Whisper error")
    mock_get_model.return_value = mock_model

    dummy_audio_content = b"dummy audio data"

    response = client.post(
        "/transcribe",
        files={"file": ("test.ogg", dummy_audio_content, "audio/ogg")}
    )

    assert response.status_code == 500
    assert "Transcription failed: Whisper error" in response.json()["detail"]

    mock_model.transcribe.assert_called_once()
