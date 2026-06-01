import os
import sys
import asyncio

# Add parent directory to path so we can import from backend
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from backend.database.db_service import db
from backend.rag.vector_store import vector_store
from backend.llm.reasoner import reasoner_service
from backend.api.analyze import text_query, analyze_equipment
from backend.models.schemas import ChatRequest, ChatMessage
from backend.api.chat import chat_assistant

async def run_verification():
    print("=== STARTING NEW EQUIPMENT DIAGNOSTIC VERIFICATION ===")

    print("\n--- Listing All Registered Products in Database ---")
    products = db.get_all_products()
    for p in products:
        print(f"Product: {p['product_name']} | Model: {p['model_number']} | Manual: {p['manual_filename']}")

    # Verification 1: AC-X300 Classification
    print("\n1. Testing AC-X300 Query classification...")
    ac_response = await text_query(query="Samsung AC-X300 compressor is overheating and tripping the breaker")
    print("  Detected Issue:", ac_response.get("detected_issue"))
    print("  Confidence Score:", ac_response.get("confidence"))
    print("  Manual Reference:", ac_response.get("manual_reference"))
    print("  Suggested Steps:")
    for idx, step in enumerate(ac_response.get("suggested_steps", [])):
        print(f"    Step {idx+1}: {step}")
    
    assert ac_response.get("response_allowed") is True
    assert "ac-x300_manual" in ac_response.get("manual_reference") or "AC-X300" in ac_response.get("manual_reference")
    assert len(ac_response.get("suggested_steps", [])) > 0
    print("OK: AC-X300 classification and diagnostics verified.")

    # Verification 2: COOLMAX-R10 Classification
    print("\n2. Testing Refrigerator COOLMAX-R10 Query classification...")
    ref_response = await text_query(query="Whirlpool Refrigerator model COOLMAX-R10 compartment temperature exceeds 45 degrees")
    print("  Detected Issue:", ref_response.get("detected_issue"))
    print("  Confidence Score:", ref_response.get("confidence"))
    print("  Manual Reference:", ref_response.get("manual_reference"))
    print("  Suggested Steps:")
    for idx, step in enumerate(ref_response.get("suggested_steps", [])):
        print(f"    Step {idx+1}: {step}")

    assert ref_response.get("response_allowed") is True
    assert "refrigerator_coolmax_manual" in ref_response.get("manual_reference") or "COOLMAX-R10" in ref_response.get("manual_reference")
    assert len(ref_response.get("suggested_steps", [])) > 0
    print("OK: Refrigerator COOLMAX-R10 classification and diagnostics verified.")

    # Verification 3: VIVID-4K Classification
    print("\n3. Testing Smart TV VIVID-4K Query classification...")
    tv_response = await text_query(query="LG TV screen VIVID-4K backlight failure, showing black screen")
    print("  Detected Issue:", tv_response.get("detected_issue"))
    print("  Confidence Score:", tv_response.get("confidence"))
    print("  Manual Reference:", tv_response.get("manual_reference"))
    print("  Suggested Steps:")
    for idx, step in enumerate(tv_response.get("suggested_steps", [])):
        print(f"    Step {idx+1}: {step}")

    assert tv_response.get("response_allowed") is True
    assert "tv_vivid_4k_manual" in tv_response.get("manual_reference") or "VIVID-4K" in tv_response.get("manual_reference")
    assert len(tv_response.get("suggested_steps", [])) > 0
    print("OK: TV VIVID-4K classification and diagnostics verified.")

    # Verification 4: LT-PRO X15 Classification
    print("\n4. Testing Laptop LT-PRO X15 Query classification...")
    laptop_response = await text_query(query="ASUS Laptop LT-PRO X15 cooling fans are running too loud and hot")
    print("  Detected Issue:", laptop_response.get("detected_issue"))
    print("  Confidence Score:", laptop_response.get("confidence"))
    print("  Manual Reference:", laptop_response.get("manual_reference"))
    print("  Suggested Steps:")
    for idx, step in enumerate(laptop_response.get("suggested_steps", [])):
        print(f"    Step {idx+1}: {step}")

    assert laptop_response.get("response_allowed") is True
    assert "lt-pro_x15_manual" in laptop_response.get("manual_reference") or "LT-PRO" in laptop_response.get("manual_reference")
    assert len(laptop_response.get("suggested_steps", [])) > 0
    print("OK: Laptop LT-PRO X15 classification and diagnostics verified.")

    # Verification 5: Image-based Fallback Classification
    print("\n5. Testing Vision fallback mock classification...")
    # Create a dummy temp image to run the image processing pipeline
    dummy_img = "refrigerator_coolmax_leak.jpg"
    with open(dummy_img, "wb") as f:
        f.write(b"dummy")
        
    try:
        # Save a mock class check
        import class_check_mock
        # We can call the analyze_equipment function directly with class mock
    except ImportError:
        pass
        
    try:
        # Force offline mock vision analyze
        from fastapi import UploadFile
        import io
        
        # Test simulated vision analysis using endpoint or analyzer
        # Since analyze_image uses file basename token parsing, "refrigerator_coolmax_leak.jpg" 
        # should match COOLMAX-R10 (or refrigerator) product registered in DB.
        from backend.vision.analyzer import vision_analyzer
        findings = vision_analyzer.analyze_image(dummy_img)
        print("  Vision Findings:")
        print("    Product Type Detected:", findings.get("product_type"))
        print("    Model Number Detected:", findings.get("model_number"))
        print("    Detected Issue:", findings.get("detected_issue"))
        
        assert "Refrigerator" in findings.get("product_type", "") or "COOLMAX-R10" in findings.get("model_number", "")
        print("OK: Image-based classification matching verified.")
    finally:
        if os.path.exists(dummy_img):
            os.remove(dummy_img)

    print("\n=== ALL NEW PRODUCTS DIAGNOSTIC VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    asyncio.run(run_verification())
