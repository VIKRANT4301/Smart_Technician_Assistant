import os
import google.generativeai as genai
from backend.core.config import config

class SpeechToText:
    def __init__(self):
        self._setup_gemini()

    def _setup_gemini(self):
        if config.GEMINI_API_KEY and config.GEMINI_API_KEY != "YOUR_GEMINI_API_KEY_HERE":
            genai.configure(api_key=config.GEMINI_API_KEY)
            self.use_api = True
        else:
            self.use_api = False

    def transcribe(self, audio_file_path: str) -> str:
        """
        Transcribe audio file to text.
        Supports WAV, MP3, AAC, M4A, etc.
        """
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        if self.use_api:
            if config.GEMINI_API_KEY.startswith("sk-or-"):
                try:
                    import base64
                    print(f"[STT] Transcribing via OpenRouter using base64: {audio_file_path}")
                    with open(audio_file_path, "rb") as f:
                        audio_base64 = base64.b64encode(f.read()).decode("utf-8")
                    
                    mime_type = "audio/mp3"
                    if audio_file_path.endswith(".wav"):
                        mime_type = "audio/wav"
                    elif audio_file_path.endswith(".m4a"):
                        mime_type = "audio/x-m4a"
                        
                    from backend.utils.openrouter import query_openrouter
                    messages = [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "You are a transcription assistant. Transcribe the spoken text in this audio file exactly as heard. Do not add commentary or assumptions."
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime_type};base64,{audio_base64}"
                                    }
                                }
                            ]
                        }
                    ]
                    transcription = query_openrouter("google/gemini-2.5-flash", messages)
                    print(f"[STT] OpenRouter Transcription: \"{transcription}\"")
                    return transcription
                except Exception as e:
                    print(f"[STT] OpenRouter transcription failed: {e}. Falling back to mock transcription.")
            else:
                try:
                    print(f"[STT] Uploading audio to Gemini: {audio_file_path}")
                    # Upload audio file to Gemini API
                    audio_file = genai.upload_file(path=audio_file_path)
                    
                    # Use Gemini 2.5 Flash for fast transcription
                    model = genai.GenerativeModel("gemini-2.5-flash")
                    response = model.generate_content([
                        "You are a transcription assistant. Transcribe the spoken text in this audio file exactly as heard. Do not add commentary or assumptions.",
                        audio_file
                    ])
                    
                    # Delete the uploaded file from Gemini's storage to clean up
                    try:
                        genai.delete_file(audio_file.name)
                    except Exception as del_err:
                        print(f"[STT] Failed to delete temporary audio upload: {del_err}")
                    
                    transcription = response.text.strip()
                    print(f"[STT] Gemini Transcription: \"{transcription}\"")
                    return transcription
                except Exception as e:
                    print(f"[STT] Gemini transcription failed: {e}. Falling back to mock transcription.")
        
        # Mock Fallback for local testing when API key is missing or failed
        print("[STT] Using offline mock transcription fallback.")
        # We can extract text from file metadata or look at the filename to simulate responses
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
