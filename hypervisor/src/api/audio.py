from fastapi import APIRouter, UploadFile, File, HTTPException
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
        # Create a temporary file to store the uploaded audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=".ogg") as temp_audio:
            content = await file.read()
            temp_audio.write(content)
            temp_path = temp_audio.name

        # Transcribe using local whisper model
        model = get_model()
        result = model.transcribe(temp_path)

        return {"text": result["text"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
