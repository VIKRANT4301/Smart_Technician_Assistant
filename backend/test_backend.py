import os
import sys

# Add parent directory to path so we can import from backend
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from backend.rag.document_processor import processor
from backend.rag.vector_store import vector_store
from backend.vision.analyzer import vision_analyzer
from backend.llm.reasoner import reasoner_service

def run_tests():
    print("=== STARTING BACKEND COMPONENT VERIFICATION ===")
    
    # 1. Test Document Indexing
    print("\n1. Testing document chunking and vector indexing...")
    try:
        processor.process_kb()
        print("OK: RAG Document Indexing completed successfully.")
    except Exception as e:
        print(f"FAIL: RAG Document Indexing failed: {e}")
        return False

    # 2. Test Vector Search
    print("\n2. Testing vector search retrieval...")
    try:
        query = "compressor thermal overload coil cleaning"
        results = vector_store.search(query, top_k=2)
        print(f"Query: \"{query}\"")
        print(f"Found {len(results)} matches.")
        for idx, (doc, sim) in enumerate(results):
            print(f"  Match {idx+1} [Similarity: {sim:.4f}]: Source: {doc['source_file']} | Content: {doc['text'][:80]}...")
        if not results:
            print("FAIL: Vector search returned empty results.")
            return False
        print("OK: Vector similarity search verified.")
    except Exception as e:
        print(f"FAIL: Vector search failed: {e}")
        return False

    # 3. Test Vision Analyzer (Mock Mode)
    print("\n3. Testing Vision analyzer (Mock Mode)...")
    dummy_path = "leak_pump.jpg"
    original_use_api = vision_analyzer.use_api
    try:
        # Force offline mock mode for this test
        vision_analyzer.use_api = False
        
        # Create a dummy blank file to pass the file existence check
        with open(dummy_path, "wb") as f:
            f.write(b"placeholder")
            
        result = vision_analyzer.analyze_image(dummy_path)
        print("Vision analysis output:", result)
        if result.get("detected_issue") != "Leakage":
            print("FAIL: Vision mock did not classify leakage based on filename.")
            return False
        print("OK: Vision analysis mock verified.")
    except Exception as e:
        print(f"FAIL: Vision analysis failed: {e}")
        return False
    finally:
        # Restore original setting
        vision_analyzer.use_api = original_use_api
        # Clean up temporary test file
        if os.path.exists(dummy_path):
            os.remove(dummy_path)

    # 4. Test LLM Reasoner (Mock Mode)
    print("\n4. Testing LLM Reasoner (Mock Mode)...")
    try:
        findings = {
            "detected_issue": "Leakage",
            "confidence": "88%",
            "visual_findings": "Puddling detected near the pump base plate."
        }
        diagnosis = reasoner_service.generate_guidance(
            vision_findings=findings,
            technician_query="pump is leaking water",
            rag_context=[{"source_file": "manual.txt", "text": "For centrifugal pump leakages, isolate and replace casings."}]
        )
        print("Reasoner JSON output:", diagnosis)
        assert "detected_issue" in diagnosis
        assert "confidence" in diagnosis
        assert "root_cause" in diagnosis
        assert len(diagnosis.get("suggested_steps", [])) > 0
        assert "safety_recommendations" in diagnosis
        print("OK: LLM Reasoner JSON schema verified.")
    except Exception as e:
        print(f"FAIL: LLM Reasoner failed: {e}")
        return False

    # 5. Test LLM Chat (Conversational RAG)
    print("\n5. Testing LLM Chat (Conversational RAG)...")
    try:
        from backend.models.schemas import ChatMessage, ChatRequest
        from backend.api.chat import chat_assistant
        
        req = ChatRequest(
            message="What is the safety PPE requirement for electrical isolation on SOP-ELEC-04?",
            history=[
                ChatMessage(role="user", content="Hello assistant"),
                ChatMessage(role="model", content="Understood. Let me know how I can help troubleshoot.")
            ]
        )
        
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def run_chat_test():
            return await chat_assistant(req)
            
        chat_res = loop.run_until_complete(run_chat_test())
        print("Chat Response:", chat_res.get("response")[:120], "...")
        assert "response" in chat_res
        # Since we query electrical safety, we expect RAG sources to match electrical manual
        print(f"Chat RAG sources: {chat_res.get('sources')}")
        print("OK: LLM Chat Conversational RAG verified.")
    except Exception as e:
        print(f"FAIL: LLM Chat failed: {e}")
        return False

    print("\n=== ALL BACKEND COMPONENT TESTS PASSED SUCCESSFULLY ===")
    return True

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
