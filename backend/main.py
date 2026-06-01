import sys
import os
# Add parent directory to path so that 'backend' module is recognized when running main.py directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.core.config import config
from backend.api import vision, speech, history, analyze, feedback, solution, chat, admin
from backend.rag.document_processor import processor

app = FastAPI(
    title="Smart Technician Assistant API",
    description="Multimodal diagnostic backend using RAG, Vision analysis, and Voice synthesis.",
    version="1.0.0"
)

# Configure CORS for local development and mobile connectivity
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to app origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
app.include_router(vision.router)
app.include_router(speech.router)
app.include_router(history.router)
app.include_router(analyze.router)
app.include_router(feedback.router)
app.include_router(solution.router)
app.include_router(chat.router)
app.include_router(admin.router)

# Mount static folder (so we can download uploads and TTS guides)
app.mount("/static", StaticFiles(directory=config.STATIC_DIR), name="static")

@app.on_event("startup")
async def startup_event():
    print("[Server] Starting up Smart Technician Assistant Backend...")
    # Validate configuration
    config.validate()
    # Trigger knowledge base processing to sync manuals and SOPs
    try:
        import threading
        print("[Server] Launching auto-indexing pipeline in a background thread...")
        threading.Thread(target=processor.process_kb, daemon=True).start()
    except Exception as e:
        print(f"[Server] Failed to start auto-indexing thread: {e}")

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Smart Technician Assistant API",
        "docs_url": "/docs"
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=config.PORT,
        reload=True
    )
