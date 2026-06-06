import os
import json
import urllib.request
import urllib.error
from backend_HF.core.config import config

class SpeechToText:
    def __init__(self):
        print(f"[STT] Initializing Hugging Face Whisper STT service targeting: {config.HF_STT_URL}")

    def transcribe(self, audio_file_path: str) -> str:
        """
        Transcribe audio file to text.
        Supports WAV, MP3, AAC, M4A, etc.
        """
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        is_huggingface = "api-inference.huggingface.co" in config.HF_STT_URL if config.HF_STT_URL else True
        if config.HF_STT_URL and (config.HF_TOKEN or not is_huggingface):
            try:
                print(f"[STT] Transcribing file via Hugging Face Whisper: {audio_file_path}")
                with open(audio_file_path, "rb") as f:
                    audio_bytes = f.read()

                headers = {
                    "Content-Type": "application/octet-stream"
                }
                if config.HF_TOKEN:
                    headers["Authorization"] = f"Bearer {config.HF_TOKEN}"

                req = urllib.request.Request(
                    config.HF_STT_URL, 
                    data=audio_bytes, 
                    headers=headers, 
                    method="POST"
                )

                # Set a timeout of 20 seconds
                with urllib.request.urlopen(req, timeout=20.0) as response:
                    if response.status == 200:
                        resp_text = response.read().decode("utf-8")
                        resp_json = json.loads(resp_text)
                        transcription = resp_json.get("text", "").strip()
                        print(f"[STT] Hugging Face Transcription: \"{transcription}\"")
                        return transcription
                    else:
                        err_msg = f"[STT] Hugging Face API returned status code {response.status}"
                        print(err_msg)
                        if config.DISABLE_MOCK_FALLBACK:
                            raise RuntimeError(err_msg)
            except Exception as e:
                print(f"[STT] Hugging Face transcription failed: {e}.")
                if config.DISABLE_MOCK_FALLBACK:
                    raise RuntimeError(f"STT API request failed: {e}") from e
        elif config.DISABLE_MOCK_FALLBACK:
            raise RuntimeError("STT API endpoint bypassed (missing token or URL) and fallback is disabled.")

        # Mock Fallback for local testing
        print("[STT] Using offline mock transcription fallback.")
        filename = os.path.basename(audio_file_path).lower()
        if "leak" in filename or "water" in filename:
            return "The pump is leaking water from the front casing joint, and I notice some rust."
        elif "capacitor" in filename or "hot" in filename or "heat" in filename:
            return "The HVAC compressor unit is extremely hot to the touch and just shut down."
        elif "wire" in filename or "electrical" in filename:
            return "We have loose wiring on the main control panel and need to shut down safely."
        else:
            return "Compressor running hot. Please inspect safety rules and condenser coils."

stt_service = SpeechToText()
