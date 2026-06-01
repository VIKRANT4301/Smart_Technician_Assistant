from fastapi import APIRouter, UploadFile, File, HTTPException
from backend.utils.file_handler import file_handler
from backend.speech.stt import stt_service

router = APIRouter(prefix="", tags=["Speech"])

@router.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...)):
    try:
        filepath = file_handler.save_upload(file, subfolder="audio")
        transcription = stt_service.transcribe(filepath)
        relative_url = file_handler.get_relative_url(filepath)
        return {
            "audio_url": relative_url,
            "transcription": transcription
        }
    except Exception as e:
        print(f"[API Speech] Error in /upload-audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))
