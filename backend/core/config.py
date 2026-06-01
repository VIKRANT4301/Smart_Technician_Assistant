import os
from dotenv import load_dotenv

# Load environmental variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

class Config:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./technician_assistant.db")
    STATIC_DIR = os.getenv("STATIC_DIR", "./static")
    PORT = int(os.getenv("PORT", "8000"))
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

    @classmethod
    def validate(cls):
        if not cls.GEMINI_API_KEY or cls.GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
            print("[WARNING] GEMINI_API_KEY is not set or using the default placeholder. AI features will run in mock fallback mode.")
            return False
        return True

config = Config()
# Create static directory if it doesn't exist
os.makedirs(config.STATIC_DIR, exist_ok=True)
