from typing import Dict, Any, Optional
from fastapi import HTTPException
from backend.database.db_service import db
from backend.analytics.scoring import scoring_engine
from backend.llm.reasoner import reasoner_service
from backend.rag.vector_store import vector_store
from backend.speech.tts import tts_service

class FeedbackService:
    @staticmethod
    def process_repair_feedback(
        session_id: str,
        was_successful: bool,
        user_rating: int = 5,
        repair_duration: int = 0
    ) -> Dict[str, Any]:
        """
        Processes technician repair feedback.
        If failed, appends current steps to failed_steps of session.
        Logs stats to feedback_history database.
        """
        session = db.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail=f"Active troubleshooting session {session_id} not found.")

        # Update session failed steps if repair unsuccessful
        if not was_successful:
            suggested = session.get("suggested_steps", [])
            failed_accumulated = session.get("failed_steps", [])
            
            # Add suggested steps to failed steps list (avoiding duplicates)
            for step in suggested:
                if step not in failed_accumulated:
                    failed_accumulated.append(step)
            
            session["failed_steps"] = failed_accumulated
            db.create_or_update_session(session)
            print(f"[FeedbackService] Updated session {session_id} with failed steps: {failed_accumulated}")

        # Log feedback into analytics table
        db.add_feedback({
            "session_id": session_id,
            "user_issue": session.get("detected_issue", "Unknown"),
            "suggested_repair": ", ".join(session.get("suggested_steps", [])),
            "was_successful": was_successful,
            "repair_duration": repair_duration,
            "user_rating": user_rating
        })

        return {
            "status": "success",
            "message": "Feedback registered successfully.",
            "session_id": session_id,
            "was_successful": was_successful,
            "failed_steps_count": len(session.get("failed_steps", []))
        }

    @staticmethod
    def get_alternative_solution(session_id: str, query: Optional[str] = None) -> Dict[str, Any]:
        """
        Retrieves active session state and queries Gemini RAG for an alternative solution,
        re-ranking root causes and excluding failed steps.
        """
        session = db.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail=f"Troubleshooting session {session_id} not found.")

        failed_solutions = session.get("failed_steps", [])
        initial_query = query or session.get("query_text", "") or session.get("detected_issue", "")

        # RAG Search
        print(f"[FeedbackService] Running RAG search for alternative: \"{initial_query}\"")
        rag_hits = vector_store.search(initial_query, top_k=3)
        rag_context = [hit[0] for hit in rag_hits]
        raw_rag_score = rag_hits[0][1] if rag_hits else 0.0
        rag_score_val = min(1.0, raw_rag_score / (2.0 / 61.0)) if rag_hits else 0.50

        # Visual context reconstruction
        image_url = session.get("image_url")
        vision_conf_val = 0.75 if image_url else 0.0
        dummy_findings = {
            "detected_issue": session.get("detected_issue"),
            "confidence": "75%" if image_url else "0%",
            "visual_findings": "Iterative troubleshooting based on session history."
        }

        # Generate alternative guidance
        diagnosis = reasoner_service.generate_guidance(
            vision_findings=dummy_findings,
            technician_query=initial_query,
            rag_context=rag_context,
            failed_solutions=failed_solutions
        )

        detected_issue = diagnosis.get("detected_issue", session.get("detected_issue"))
        llm_conf_val = scoring_engine.parse_percentage(diagnosis.get("llm_reasoning_confidence", "80%"))

        # Recalculate metrics
        historical_success = db.get_historical_success_rate(detected_issue)
        scores = scoring_engine.calculate_metrics(
            vision_confidence=vision_conf_val,
            rag_similarity=rag_score_val,
            llm_reasoning_confidence=llm_conf_val,
            historical_success_rate=historical_success
        )

        steps = diagnosis.get("suggested_steps", [])
        safety = diagnosis.get("safety_recommendations", "Follow standard safety protocols.")

        # Re-synthesize audio instructions
        steps_speech = " ... ".join([f"Step {i+1}. {step}" for i, step in enumerate(steps)])
        speech_script = f"Safety Advisory: {safety} ... ... Troubleshooting Steps: ... {steps_speech}"
        tts_filename = tts_service.text_to_speech(speech_script)
        tts_audio_url = f"/static/{tts_filename}" if tts_filename else None

        # Update active session in DB
        session["detected_issue"] = detected_issue
        session["severity_level"] = diagnosis.get("severity_level", "Medium")
        session["confidence_score"] = scores["confidence_score"]
        session["root_cause_rankings"] = diagnosis.get("root_cause_rankings", [])
        session["suggested_steps"] = steps
        session["safety_recommendations"] = safety
        db.create_or_update_session(session)

        # Log to inspection history
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
            "session_id": session_id,
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

feedback_service = FeedbackService()
