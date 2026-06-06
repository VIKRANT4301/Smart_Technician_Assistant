import os
from dotenv import load_dotenv

# Search for the .env file in multiple common directory levels
possible_env_paths = [
    os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),                       # backend_HF/.env
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),      # Root/.env
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "backend", ".env") # backend/.env
]

for env_path in possible_env_paths:
    if os.path.exists(env_path):
        load_dotenv(dotenv_path=env_path)
        break

class Config:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./technician_assistant.db")
    STATIC_DIR = os.getenv("STATIC_DIR", "./static")
    PORT = int(os.getenv("PORT", "8000"))
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

    # Hugging Face Pro Configuration
    HF_TOKEN = os.getenv("HF_TOKEN", "") or os.getenv("HF_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    HF_STT_URL = os.getenv("HF_STT_URL", "https://api-inference.huggingface.co/models/distil-whisper/distil-large-v3")
    HF_VISION_URL = os.getenv("HF_VISION_URL", "https://api-inference.huggingface.co/models/Qwen/Qwen2-VL-7B-Instruct")
    HF_EMBEDDING_URL = os.getenv("HF_EMBEDDING_URL", "https://api-inference.huggingface.co/models/BAAI/bge-m3")
    HF_RERANKER_URL = os.getenv("HF_RERANKER_URL", "https://api-inference.huggingface.co/models/BAAI/bge-reranker-v2-m3")
    HF_LLM_URL = os.getenv("HF_LLM_URL", "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct")
    HF_TTS_URL = os.getenv("HF_TTS_URL", "") # MeloTTS or Bark dedicated endpoint url (falls back to gTTS if empty)
    DISABLE_MOCK_FALLBACK = os.getenv("DISABLE_MOCK_FALLBACK", "false").lower() in ("true", "1", "yes")

    @classmethod
    def validate(cls):
        # Allow running in mock fallback mode if no keys are provided
        if not cls.HF_TOKEN:
            print("[WARNING] HF_TOKEN is not set. Hugging Face Pro pipeline will run in local edge/mock fallback modes.")
            return False
        return True

config = Config()
# Create static directory if it doesn't exist
os.makedirs(config.STATIC_DIR, exist_ok=True)
