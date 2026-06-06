import os
import uuid
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from backend.utils.file_handler import file_handler
from backend.vision.analyzer import vision_analyzer
from backend.speech.stt import stt_service
from backend.speech.tts import tts_service
from backend.rag.vector_store import vector_store
from backend.llm.reasoner import reasoner_service
from backend.services.database import db
from backend.services.scoring import scoring_engine

router = APIRouter(prefix="", tags=["Analysis"])

@router.post("/analyze")
async def analyze_equipment(
    image: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None),
    query: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None)
):
    try:
        vision_findings = {}
        image_url = None
        vision_conf_val = 0.0
        
        # 1. Vision Processing (Detects and Annotates Faults)
        if image:
            img_path = file_handler.save_upload(image, subfolder="images")
            vision_findings = vision_analyzer.analyze_image(img_path)
            
            # Use the annotated image if generated, else the original
            annotated_path = vision_findings.get("annotated_image_path", img_path)
            image_url = file_handler.get_relative_url(annotated_path)
            
            vision_conf_val = scoring_engine.parse_percentage(vision_findings.get("confidence", "75%"))
        else:
            vision_findings = {
                "detected_issue": "Routine Inspection",
                "confidence": "0%",
                "visual_findings": "No visual input provided. Standard manual/SOP query execution."
            }

        # 2. Audio/Speech-to-Text Processing
        audio_transcript = ""
        user_audio_url = None
        if audio:
            aud_path = file_handler.save_upload(audio, subfolder="audio")
            user_audio_url = file_handler.get_relative_url(aud_path)
            audio_transcript = stt_service.transcribe(aud_path)

        # 3. Consolidate query string (from voice recording or form text input)
        final_query = query or audio_transcript or vision_findings.get("detected_issue", "")
        if not final_query:
            final_query = "Routine inspection troubleshooting guidelines"

        # 4. RAG Knowledge Search
        print(f"[Orchestrator] Running RAG search for: \"{final_query}\"")
        rag_hits = vector_store.search(final_query, top_k=3)
        rag_context = [hit[0] for hit in rag_hits]
        
        # Get highest RAG match similarity
        rag_score_val = rag_hits[0][1] if rag_hits else 0.50

        # 5. Session State Retrieval (Iterative / Adaptive Memory)
        active_session_id = session_id or f"sess_{uuid.uuid4().hex[:8]}"
        session = db.get_session(active_session_id)
        
        failed_solutions = []
        if session:
            failed_solutions = session.get("failed_steps", [])
            print(f"[Orchestrator] Retained active session {active_session_id} with failed steps: {failed_solutions}")

        # 6. LLM Diagnostic Reasoning (Supports iterative alternative paths)
        diagnosis = reasoner_service.generate_guidance(
            vision_findings=vision_findings,
            technician_query=final_query,
            rag_context=rag_context,
            failed_solutions=failed_solutions
        )

        detected_issue = diagnosis.get("detected_issue", "Unknown Issue")
        llm_conf_val = scoring_engine.parse_percentage(diagnosis.get("llm_reasoning_confidence", "85%"))

        # 7. Scoring Engine Calculations (Weighted Dynamic Formulas)
        historical_success = db.get_historical_success_rate(detected_issue)
        
        scores = scoring_engine.calculate_metrics(
            vision_confidence=vision_conf_val,
            rag_similarity=rag_score_val,
            llm_reasoning_confidence=llm_conf_val,
            historical_success_rate=historical_success
        )

        # 8. Text-to-Speech Generation for synthesized AI Guidance (With natural pauses)
        safety = diagnosis.get("safety_recommendations", "Follow standard safety practices.")
        steps = diagnosis.get("suggested_steps", [])
        
        # Format speech script with safety warnings first, and sentence breaks for TTS pauses
        steps_speech = " ... ".join([f"Step {i+1}. {step}" for i, step in enumerate(steps)])
        speech_script = f"Safety Advisory: {safety} ... ... Troubleshooting Steps: ... {steps_speech}"
        
        tts_filename = tts_service.text_to_speech(speech_script)
        tts_audio_url = f"/static/{tts_filename}" if tts_filename else None

        # 9. Update SQLite active session memory
        session_payload = {
            "session_id": active_session_id,
            "detected_issue": detected_issue,
            "severity_level": diagnosis.get("severity_level", "Medium"),
            "confidence_score": scores["confidence_score"],
            "root_cause_rankings": diagnosis.get("root_cause_rankings", []),
            "suggested_steps": steps,
            "safety_recommendations": safety,
            "failed_steps": failed_solutions,
            "image_url": image_url,
            "query_text": final_query
        }
        db.create_or_update_session(session_payload)

        # 10. Log standard inspection to history DB
        db_record = {
            "image_path": image_url,
            "detected_issue": detected_issue,
            "confidence": scores["confidence_score"],
            "root_cause": diagnosis.get("reasoning_explanation", diagnosis.get("root_cause", "")),
            "suggested_steps": steps,
            "safety_recommendations": safety,
            "audio_url": tts_audio_url,
            "query_text": final_query
        }
        db.add_record(db_record)

        # 11. Return enterprise payload conforming to frontend and scoring requirements
        return {
            "session_id": active_session_id,
            "image_url": image_url,
            "user_audio_url": user_audio_url,
            "query_text": final_query,
            "detected_issue": detected_issue,
            "confidence": scores["confidence_score"], # Keep 'confidence' for mobile app backward compatibility
            "confidence_score": scores["confidence_score"],
            "repair_success_probability": scores["repair_success_probability"],
            "severity_level": diagnosis.get("severity_level", "Medium"),
            "root_cause_rankings": diagnosis.get("root_cause_rankings", []),
            "reasoning_explanation": diagnosis.get("reasoning_explanation", ""),
            "root_cause": diagnosis.get("reasoning_explanation", ""),
            "suggested_steps": steps,
            "safety_recommendations": safety,
            "tts_audio_url": tts_audio_url,
            "rag_sources": [doc["source_file"] for doc in rag_context] if rag_context else [],
            "feedback_request": "Did this solution resolve the issue?"
        }

    except Exception as e:
        print(f"[Orchestrator] Error during pipeline analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query")
async def text_query(query: str = Form(...)):
    """
    Perform a text-only query against the manuals & SOPs knowledge base.
    """
    try:
        # Retrieve manuals context
        rag_hits = vector_store.search(query, top_k=3)
        rag_context = [hit[0] for hit in rag_hits]
        rag_score_val = rag_hits[0][1] if rag_hits else 0.50
        
        dummy_findings = {
            "detected_issue": "Text Query Search",
            "confidence": "100%",
            "visual_findings": "Direct database query. No image provided."
        }
        
        diagnosis = reasoner_service.generate_guidance(
            vision_findings=dummy_findings,
            technician_query=query,
            rag_context=rag_context
        )
        
        detected_issue = diagnosis.get("detected_issue", "Unknown")
        llm_conf_val = scoring_engine.parse_percentage(diagnosis.get("llm_reasoning_confidence", "85%"))

        # Scoring Engine
        historical_success = db.get_historical_success_rate(detected_issue)
        scores = scoring_engine.calculate_metrics(
            vision_confidence=0.0,
            rag_similarity=rag_score_val,
            llm_reasoning_confidence=llm_conf_val,
            historical_success_rate=historical_success
        )

        steps = diagnosis.get("suggested_steps", [])
        safety = diagnosis.get("safety_recommendations", "")

        # Speech synth
        steps_speech = " ... ".join([f"Step {i+1}. {step}" for i, step in enumerate(steps)])
        speech_script = f"Safety Advisory: {safety} ... ... Troubleshooting Steps: ... {steps_speech}"
        tts_filename = tts_service.text_to_speech(speech_script)
        tts_audio_url = f"/static/{tts_filename}" if tts_filename else None
        
        # Log to history
        db.add_record({
            "image_path": None,
            "detected_issue": detected_issue,
            "confidence": scores["confidence_score"],
            "root_cause": diagnosis.get("reasoning_explanation", ""),
            "suggested_steps": steps,
            "safety_recommendations": safety,
            "audio_url": tts_audio_url,
            "query_text": query
        })
        
        return {
            "query_text": query,
            "detected_issue": detected_issue,
            "confidence": scores["confidence_score"],
            "confidence_score": scores["confidence_score"],
            "repair_success_probability": scores["repair_success_probability"],
            "severity_level": diagnosis.get("severity_level", "Medium"),
            "root_cause_rankings": diagnosis.get("root_cause_rankings", []),
            "reasoning_explanation": diagnosis.get("reasoning_explanation", ""),
            "root_cause": diagnosis.get("reasoning_explanation", ""),
            "suggested_steps": steps,
            "safety_recommendations": safety,
            "tts_audio_url": tts_audio_url
        }
        
    except Exception as e:
        print(f"[Orchestrator] Error during text query: {e}")
        raise HTTPException(status_code=500, detail=str(e))
