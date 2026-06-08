# Trigger reload - update
import sys
import os

# Reconfigure stdout/stderr to use UTF-8 to prevent charmap print crashes on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

# Add parent directory to path so that 'backend_HF' module is recognized when running main.py directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend_HF.core.config import config
from backend_HF.api import vision, speech, history, analyze, feedback, solution, chat, admin, digital_twin
from backend_HF.rag.document_processor import processor

app = FastAPI(
    title="Smart Technician Assistant API (Hugging Face Pro Version)",
    description="Multimodal diagnostic backend using RAG, Qwen2-VL Vision analysis, and Whisper Voice synthesis.",
    version="1.0.0"
)

# Configure CORS for local development and mobile connectivity
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
app.include_router(digital_twin.router)

# Mount static folder
static_dir_path = config.STATIC_DIR
if not os.path.isabs(static_dir_path):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(current_dir)
    static_dir_path = os.path.join(root_dir, static_dir_path)

app.mount("/static", StaticFiles(directory=static_dir_path), name="static")

@app.on_event("startup")
async def startup_event():
    print("[Server] Starting up Smart Technician Assistant Backend (Hugging Face Pro)...")
    config.validate()
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
        "service": "Smart Technician Assistant API (Hugging Face Pro)",
        "docs_url": "/docs",
        "dashboard_url": "/dashboard",
        "overview_url": "/overview"
    }

@app.get("/dashboard", response_class=HTMLResponse)
async def get_dashboard():
    dashboard_path = config.STATIC_DIR
    if not os.path.isabs(dashboard_path):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        root_dir = os.path.dirname(current_dir)
        dashboard_path = os.path.join(root_dir, dashboard_path, "dashboard.html")
    else:
        dashboard_path = os.path.join(dashboard_path, "dashboard.html")
        
    if os.path.exists(dashboard_path):
        with open(dashboard_path, "r", encoding="utf-8") as f:
            return f.read()
    return "Dashboard HTML file not found."

@app.get("/overview", response_class=HTMLResponse)
async def get_overview():
    overview_path = config.STATIC_DIR
    if not os.path.isabs(overview_path):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        root_dir = os.path.dirname(current_dir)
        overview_path = os.path.join(root_dir, overview_path, "overview.html")
    else:
        overview_path = os.path.join(overview_path, "overview.html")
        
    if os.path.exists(overview_path):
        with open(overview_path, "r", encoding="utf-8") as f:
            return f.read()
    return "Platform Overview HTML file not found."

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=config.PORT,
        reload=True
    )
