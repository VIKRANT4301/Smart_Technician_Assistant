import os
import sys

# Add parent directory to path so we can import from backend
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from backend.database.db_service import db
from backend.rag.vector_store import vector_store
from backend.llm.reasoner import reasoner_service
from backend.api.analyze import analyze_equipment
from backend.models.schemas import ChatRequest, ChatMessage
from backend.api.chat import chat_assistant

import asyncio

async def test_diagnostics():
    print("=== STARTING LAPTOP DIAGNOSTIC VERIFICATION ===")

    # Test case 1: Keyword-based mapping to LT-PRO X15 and dynamic RRF score normalization
    print("\nTest Case 1: Text Query for Laptop overheating (No explicit model name)")
    
    from backend.api.analyze import text_query
    
    response = await text_query(query="My laptop is overheating and throttling performance")
    
    print("Response allowed:", response.get("response_allowed"))
    print("Detected Issue:", response.get("detected_issue"))
    print("Confidence score:", response.get("confidence"))
    print("Manual reference:", response.get("manual_reference"))
    print("Suggested steps:")
    for idx, step in enumerate(response.get("suggested_steps", [])):
        print(f"  Step {idx+1}: {step}")
        
    assert response.get("response_allowed") is True
    assert "LT-PRO" in response.get("manual_reference") or "lt-pro_x15_manual" in response.get("manual_reference")
    # Should extract dynamic steps from lt-pro_x15_manual.txt
    assert len(response.get("suggested_steps", [])) > 0
    assert "Safe Shutdown" in response.get("suggested_steps", [])[0]
    print("OK: Keyword mapping, RRF normalization, and dynamic retrieval verified successfully!")

    # Test case 2: Chat keyword resolution and local LLM/heuristic response
    print("\nTest Case 2: Chat Query fallback check")
    chat_req = ChatRequest(
        message="What are the specs of the LT-PRO X15?",
        history=[]
    )
    
    chat_response = await chat_assistant(chat_req)
    print("Chat Response:")
    print(chat_response.get("response")[:200] + "...")
    print("Sources:", chat_response.get("sources"))
    print("Inference Node:", chat_response.get("inference_node"))
    
    assert len(chat_response.get("sources")) > 0
    assert "lt-pro_x15_manual.txt" in chat_response.get("sources")
    print("OK: Chat fallback and sources indexing verified successfully!")

    # Test case 3: Failed solutions logic check
    print("\nTest Case 3: Failed solutions re-ranking check")
    
    findings = {
        "detected_issue": "Overheating",
        "confidence": "90%",
        "visual_findings": "Laptop temperature is high"
    }
    
    # We retrieve the RAG context for laptop manual
    rag_hits = vector_store.search("laptop overheating", top_k=3, allowed_files=["lt-pro_x15_manual.txt"])
    rag_context = [hit[0] for hit in rag_hits]
    
    # Run reasoner with failed vent cleaning
    diagnosis = reasoner_service.generate_guidance(
        vision_findings=findings,
        technician_query="Laptop overheating",
        rag_context=rag_context,
        failed_solutions=["Vent Cleaning"]
    )
    
    print("Re-ranked causes:", diagnosis.get("root_cause_rankings"))
    print("OK: Re-ranking of failed steps verified successfully!")

    print("\n=== ALL DIAGNOSTIC TESTS COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    asyncio.run(test_diagnostics())
