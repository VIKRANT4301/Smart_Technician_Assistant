import os
import uuid
import socket
import urllib.request
import json
from gtts import gTTS
from backend_HF.core.config import config

class TextToSpeech:
    def __init__(self):
        # Resolve static directory relative to root workspace
        db_url_path = config.STATIC_DIR
        if os.path.isabs(db_url_path):
            self.output_dir = db_url_path
        else:
            current_dir = os.path.dirname(os.path.abspath(__file__)) # backend_HF/speech/
            root_dir = os.path.dirname(os.path.dirname(current_dir)) # Smart Technician Assistant/
            self.output_dir = os.path.join(root_dir, db_url_path)
            
        os.makedirs(self.output_dir, exist_ok=True)

    def text_to_speech(self, text: str, lang: str = "en") -> str:
        """
        Convert text to speech in the specified language and save as an MP3/WAV file.
        Returns the filename of the generated audio file.
        """
        if not text:
            text = "No guidance text provided."

        filename = f"guidance_{uuid.uuid4().hex[:8]}.mp3"
        filepath = os.path.join(self.output_dir, filename)

        # 1. Try Hugging Face Dedicated TTS Endpoint if configured
        if config.HF_TOKEN and config.HF_TTS_URL:
            try:
                print(f"[TTS] Synthesizing speech via Hugging Face Endpoint: {config.HF_TTS_URL}")
                payload = {"inputs": text}
                headers = {
                    "Authorization": f"Bearer {config.HF_TOKEN}",
                    "Content-Type": "application/json"
                }
                
                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    config.HF_TTS_URL, 
                    data=data, 
                    headers=headers, 
                    method="POST"
                )
                
                with urllib.request.urlopen(req, timeout=12.0) as response:
                    if response.status == 200:
                        audio_data = response.read()
                        with open(filepath, "wb") as f:
                            f.write(audio_data)
                        print(f"[TTS] Hugging Face Speech file saved to {filepath}")
                        return filename
                    else:
                        print(f"[TTS] Hugging Face TTS endpoint returned status code {response.status}")
            except Exception as e:
                print(f"[TTS] Hugging Face TTS endpoint query failed: {e}. Falling back to gTTS.")

        # 2. Fallback to standard gTTS (Google Translate TTS)
        if not getattr(self, "gtts_available", True):
            print("[TTS] gTTS is marked unavailable. Bypassing speech synthesis.")
            return ""

        supported_langs = ['en', 'hi', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'pt', 'ru', 'zh', 'ar', 'nl']
        tts_lang = lang.lower() if lang.lower() in supported_langs else 'en'
        
        # Verify internet connectivity to Google Translate to prevent blocking/hanging
        try:
            with urllib.request.urlopen("https://translate.google.com", timeout=1.0):
                pass
        except Exception as e:
            print(f"[TTS] Google Translate unreachable ({e}). Bypassing speech synthesis fallback.")
            self.gtts_available = False
            return ""

        # Keep track of original timeout
        original_timeout = socket.getdefaulttimeout()
        
        try:
            print(f"[TTS] Synthesizing speech in language '{tts_lang}' for: \"{text[:50]}...\"")
            # Set a 3.0 second socket timeout to prevent indefinite blocking
            socket.setdefaulttimeout(3.0)
            
            # Generate speech
            tts = gTTS(text=text, lang=tts_lang, slow=False)
            tts.save(filepath)
            
            print(f"[TTS] Speech file saved to {filepath}")
            return filename
        except Exception as e:
            print(f"[TTS] Speech synthesis failed or timed out: {e}")
            return ""
        finally:
            # Restore original timeout
            socket.setdefaulttimeout(original_timeout)

tts_service = TextToSpeech()
