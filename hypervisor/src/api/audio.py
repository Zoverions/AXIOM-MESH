from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool
import whisper
import os
import tempfile

router = APIRouter()

# Load model globally to avoid reloading on every request (lazy loading)
_model = None

def get_model():
    global _model
    if _model is None:
        _model = whisper.load_model("base")
    return _model

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    temp_path = None
    try:
        # Read file content asynchronously
        content = await file.read()

        def perform_transcription(audio_content):
            # Create a temporary file to store the uploaded audio
            with tempfile.NamedTemporaryFile(delete=False, suffix=".ogg") as temp_audio:
                temp_audio.write(audio_content)
                t_path = temp_audio.name

            try:
                # Transcribe using local whisper model
                model = get_model()
                res = model.transcribe(t_path)
                return res, t_path
            except Exception:
                if os.path.exists(t_path):
                    os.remove(t_path)
                raise

        # Offload blocking I/O and computation to a threadpool
        result, temp_path = await run_in_threadpool(perform_transcription, content)

        return {"text": result["text"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
