import sys
import os

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from llm.reasoner import reasoner_service
from backend_HF.core.config import config

print("=== CONFIG CHECK ===")
print("HF_TOKEN:", config.HF_TOKEN)
print("HF_LLM_URL:", config.HF_LLM_URL)
print("os.environ.OPENROUTER:", os.environ.get("OPENROUTER_API_KEY"))
print("====================")

vision_findings = {
    "detected_issue": "HVAC Compressor Overheating",
    "confidence": "80%",
    "visual_findings": "Blocked condenser coils"
}

rag_context = [
    {
        "source_file": "hvac_compressor_manual.txt",
        "text": "TROUBLESHOOTING GUIDE - HVAC Compressor Overheating. Causes: Blocked condenser coils, low refrigerant. Steps: 1. Turn off power. 2. Clean coils."
    }
]

print("Calling generate_guidance...")
try:
    result = reasoner_service.generate_guidance(
        vision_findings=vision_findings,
        technician_query="How to fix overheating HVAC compressor?",
        rag_context=rag_context
    )
    print("Success! Result:")
    import json
    print(json.dumps(result, indent=2))
except Exception as e:
    print("Failed with exception:", e)
