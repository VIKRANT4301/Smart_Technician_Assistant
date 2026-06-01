import os
import uuid
import socket
from gtts import gTTS
from backend.core.config import config

class TextToSpeech:
    def __init__(self):
        self.output_dir = config.STATIC_DIR
        os.makedirs(self.output_dir, exist_ok=True)

    def text_to_speech(self, text: str, lang: str = "en") -> str:
        """
        Convert text to speech in the specified language and save as an MP3 file.
        Returns the filename of the generated MP3 file.
        """
        if not text:
            text = "No guidance text provided."

        filename = f"guidance_{uuid.uuid4().hex[:8]}.mp3"
        filepath = os.path.join(self.output_dir, filename)
        
        # Supported language codes in gTTS
        supported_langs = ['en', 'hi', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'pt', 'ru', 'zh', 'ar', 'nl']
        tts_lang = lang.lower() if lang.lower() in supported_langs else 'en'
        
        # Verify internet connectivity to Google Translate to prevent blocking/hanging
        import urllib.request
        try:
            with urllib.request.urlopen("https://translate.google.com", timeout=1.0):
                pass
        except Exception as e:
            print(f"[TTS] Google Translate unreachable ({e}). Bypassing speech synthesis fallback.")
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
if __name__ == "__main__":
    # Test
    fn = tts_service.text_to_speech("Warning: Compressor overheating. Wear insulated gloves.")
    print("Test file generated:", fn)
