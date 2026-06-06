from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.database import db
from backend.services.scoring import scoring_engine
from backend.llm.reasoner import reasoner_service
from backend.rag.vector_store import vector_store
from backend.speech.tts import tts_service

router = APIRouter(prefix="", tags=["Solution"])

class SolutionRequest(BaseModel):
    session_id: str
    query: Optional[str] = None

@router.post("/generate-solution")
async def generate_alternative_solution(req: SolutionRequest):
    try:
        # 1. Retrieve the session state
        session = db.get_session(req.session_id)
        if not session:
            raise HTTPException(status_code=404, detail=f"Troubleshooting session {req.session_id} not found.")

        failed_solutions = session.get("failed_steps", [])
        initial_query = req.query or session.get("query_text", "") or session.get("detected_issue", "")

        # 2. RAG Search
        print(f"[Solution] Running RAG search for alternative: \"{initial_query}\"")
        rag_hits = vector_store.search(initial_query, top_k=3)
        rag_context = [hit[0] for hit in rag_hits]
        rag_score_val = rag_hits[0][1] if rag_hits else 0.50

        # 3. Vision mock findings reconstruction
        image_url = session.get("image_url")
        vision_conf_val = 0.75 if image_url else 0.0
        dummy_findings = {
            "detected_issue": session.get("detected_issue"),
            "confidence": "75%" if image_url else "0%",
            "visual_findings": "Iterative troubleshooting execution based on session history."
        }

        # 4. Generate Alternative LLM Reasoning (Excluding failed steps)
        diagnosis = reasoner_service.generate_guidance(
            vision_findings=dummy_findings,
            technician_query=initial_query,
            rag_context=rag_context,
            failed_solutions=failed_solutions
        )

        detected_issue = diagnosis.get("detected_issue", session.get("detected_issue"))
        llm_conf_val = scoring_engine.parse_percentage(diagnosis.get("llm_reasoning_confidence", "80%"))

        # 5. Recalculate Scoring Matrix
        historical_success = db.get_historical_success_rate(detected_issue)
        scores = scoring_engine.calculate_metrics(
            vision_confidence=vision_conf_val,
            rag_similarity=rag_score_val,
            llm_reasoning_confidence=llm_conf_val,
            historical_success_rate=historical_success
        )

        steps = diagnosis.get("suggested_steps", [])
        safety = diagnosis.get("safety_recommendations", "Follow standard safety protocols.")

        # 6. Re-synthesize Spoken TTS Guidance with pauses
        steps_speech = " ... ".join([f"Step {i+1}. {step}" for i, step in enumerate(steps)])
        speech_script = f"Safety Advisory: {safety} ... ... Troubleshooting Steps: ... {steps_speech}"
        tts_filename = tts_service.text_to_speech(speech_script)
        tts_audio_url = f"/static/{tts_filename}" if tts_filename else None

        # 7. Update active session in DB
        session["detected_issue"] = detected_issue
        session["severity_level"] = diagnosis.get("severity_level", "Medium")
        session["confidence_score"] = scores["confidence_score"]
        session["root_cause_rankings"] = diagnosis.get("root_cause_rankings", [])
        session["suggested_steps"] = steps
        session["safety_recommendations"] = safety
        db.create_or_update_session(session)

        # 8. Log updated check to history
        db.add_record({
            "image_path": image_url,
            "detected_issue": detected_issue,
            "confidence": scores["confidence_score"],
            "root_cause": diagnosis.get("reasoning_explanation", ""),
            "suggested_steps": steps,
            "safety_recommendations": safety,
            "audio_url": tts_audio_url,
            "query_text": initial_query
        })

        return {
            "session_id": req.session_id,
            "image_url": image_url,
            "query_text": initial_query,
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
            "tts_audio_url": tts_audio_url,
            "rag_sources": [doc["source_file"] for doc in rag_context] if rag_context else [],
            "feedback_request": "Did this solution resolve the issue?"
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[Solution] Error generating alternative solution: {e}")
        raise HTTPException(status_code=500, detail=str(e))
