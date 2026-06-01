import os
import uuid
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from backend.utils.file_handler import file_handler
from backend.vision.analyzer import vision_analyzer
from backend.speech.stt import stt_service
from backend.speech.tts import tts_service
from backend.rag.vector_store import vector_store
from backend.llm.reasoner import reasoner_service
from backend.database.db_service import db
from backend.analytics.scoring import scoring_engine
from backend.core.config import config

router = APIRouter(prefix="", tags=["Analysis"])

def get_simulated_telemetry_and_integrations(model_number: Optional[str], session_id: str, response_allowed: bool) -> tuple:
    model = (model_number or "").upper()
    if "AC-X200" in model or "HVAC" in model:
        telemetry = {
            "remaining_useful_life": "82%",
            "vibration_deviation": [0.02, 0.05, 0.08, 0.12, 0.15, 0.14, 0.18, 0.22, 0.25, 0.24, 0.28],
            "temperature_logs": [31.2, 32.5, 33.4, 34.8, 35.5, 36.1, 37.0, 37.8, 38.2, 38.4]
        }
        maximo_asset_id = "MX-COMP-200"
    elif "CP-100" in model or "PUMP" in model:
        telemetry = {
            "remaining_useful_life": "76%",
            "vibration_deviation": [0.10, 0.12, 0.18, 0.15, 0.22, 0.24, 0.28, 0.32, 0.35, 0.38],
            "temperature_logs": [45.1, 46.2, 47.0, 48.3, 49.0, 49.5, 50.1, 50.8, 51.2, 51.5]
        }
        maximo_asset_id = "MX-PUMP-100"
    elif "SOP-ELEC" in model or "ELEC" in model or "CABINET" in model:
        telemetry = {
            "remaining_useful_life": "68%",
            "vibration_deviation": [0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.03, 0.02, 0.01, 0.02],
            "temperature_logs": [24.5, 25.1, 26.2, 27.5, 28.1, 28.8, 29.2, 30.1, 30.8, 31.2]
        }
        maximo_asset_id = "MX-CAB-04"
    else:
        telemetry = {
            "remaining_useful_life": "88%",
            "vibration_deviation": [0.05, 0.06, 0.05, 0.07, 0.08, 0.09, 0.08, 0.07, 0.08, 0.09],
            "temperature_logs": [22.1, 22.4, 22.8, 23.1, 23.5, 23.8, 24.1, 24.4, 24.8, 25.0]
        }
        maximo_asset_id = "MX-GENERIC-99"

    wo_suffix = "90812"
    if session_id:
        digits = "".join(filter(str.isdigit, session_id))
        if len(digits) >= 5:
            wo_suffix = digits[-5:]
        else:
            wo_suffix = str(abs(hash(session_id)) % 100000).zfill(5)
            
    sap_work_order = f"WO-2026-{wo_suffix}"
    servicenow_incident = f"INC{int(wo_suffix) + 800000}"
    sync_status = "Synced" if response_allowed else "Escalated"
    
    enterprise_integrations = {
        "sap_work_order": sap_work_order,
        "maximo_asset_id": maximo_asset_id,
        "servicenow_incident": servicenow_incident,
        "sync_status": sync_status
    }
    return telemetry, enterprise_integrations


class ConfigUpdate(BaseModel):
    ollama_base_url: Optional[str] = None
    ollama_model: Optional[str] = None

@router.get("/config")
async def get_config():
    return {
        "ollama_base_url": config.OLLAMA_BASE_URL,
        "ollama_model": config.OLLAMA_MODEL,
    }

@router.post("/config")
async def update_config(update: ConfigUpdate):
    if update.ollama_base_url is not None:
        config.OLLAMA_BASE_URL = update.ollama_base_url
        try:
            from backend.config import config as root_config
            root_config.OLLAMA_BASE_URL = update.ollama_base_url
        except Exception:
            pass
    if update.ollama_model is not None:
        config.OLLAMA_MODEL = update.ollama_model
        try:
            from backend.config import config as root_config
            root_config.OLLAMA_MODEL = update.ollama_model
        except Exception:
            pass
    return {
        "status": "success",
        "ollama_base_url": config.OLLAMA_BASE_URL,
        "ollama_model": config.OLLAMA_MODEL
    }

@router.post("/analyze")
async def analyze_equipment(
    image: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None),
    query: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    manual_url: Optional[str] = Form(None)
):
    try:
        # Unpack FastAPI Form parameter defaults if called directly in Python tests
        if query is not None and not isinstance(query, str):
            query = None
        if session_id is not None and not isinstance(session_id, str):
            session_id = None
        if manual_url is not None and not isinstance(manual_url, str):
            manual_url = None

        vision_findings = {}
        image_url = None
        
        product_type = None
        model_number = None
        manufacturer = None
        product_det_conf = 0.0
        fault_det_conf = 0.0
        
        # 1. Vision Processing (Fault Detection + Bounding Boxes)
        if image:
            img_path = file_handler.save_upload(image, subfolder="images")
            vision_findings = vision_analyzer.analyze_image(img_path)
            
            # Use annotated image if generated
            annotated_path = vision_findings.get("annotated_image_path", img_path)
            image_url = file_handler.get_relative_url(annotated_path)
            
            product_type = vision_findings.get("product_type")
            model_number = vision_findings.get("model_number")
            manufacturer = vision_findings.get("manufacturer")
            
            product_det_conf = scoring_engine.parse_percentage(vision_findings.get("product_detection_confidence", "0%"))
            fault_det_conf = scoring_engine.parse_percentage(vision_findings.get("fault_detection_confidence", "0%"))
        else:
            vision_findings = {
                "detected_issue": "Routine Inspection",
                "confidence": "0%",
                "visual_findings": "No visual input provided. Standard manual/SOP query execution."
            }

        # 2. Audio transcription
        audio_transcript = ""
        user_audio_url = None
        if audio:
            aud_path = file_handler.save_upload(audio, subfolder="audio")
            user_audio_url = file_handler.get_relative_url(aud_path)
            audio_transcript = stt_service.transcribe(aud_path)

        # 3. Consolidate query string
        final_query = query or audio_transcript or vision_findings.get("detected_issue", "")
        if not final_query:
            final_query = "Routine inspection troubleshooting guidelines"

        # 4. Resolve product model from text query if not resolved from vision
        if not model_number:
            from backend.utils.product_resolver import resolve_product_by_query
            all_prods = db.get_all_products()
            matched_p = resolve_product_by_query(final_query, all_prods)
            if matched_p:
                # If manual_url is provided, ignore loose/partial matches
                if manual_url and matched_p.get("match_score", 0) < 15:
                    pass
                else:
                    model_number = matched_p["model_number"]
                    manufacturer = matched_p["manufacturer"]
                    product_type = matched_p["product_name"]
                    product_det_conf = min(1.0, max(0.7, matched_p["match_score"] / 100.0))
                    fault_det_conf = 1.0 if fault_det_conf == 0.0 else fault_det_conf

        # 4.5 Scrape manual from URL and index it
        if manual_url:
            import re
            from backend.utils.scraper import scrape_url
            
            # If a model number is resolved, make it unique for this custom URL
            if model_number:
                if not model_number.endswith("_CRAWLED"):
                    model_number = f"{model_number}_CRAWLED"
            else:
                # Attempt to extract exact model number from final_query if not resolved
                model_candidates = re.findall(r'[A-Za-z0-9]+-[A-Za-z0-9]+', final_query)
                if model_candidates:
                    model_number = f"{model_candidates[0].upper()}_CRAWLED"
                    
            # Generate fallback model number if still not resolved
            if not model_number:
                clean_type = re.sub(r'[^a-zA-Z0-9]', '_', (product_type or "EQUIPMENT").upper())
                model_number = f"DETECTED_{clean_type}_{uuid.uuid4().hex[:6].upper()}_CRAWLED"
                
            if not product_type:
                product_type = f"{model_number.replace('_CRAWLED', '').replace('_', ' ').title()} Product"
            if not manufacturer:
                manufacturer = "Standard"
                
            try:
                raw_text = scrape_url(manual_url)
                if raw_text.strip():
                    safe_model = re.sub(r'[^a-zA-Z0-9_-]', '_', model_number.replace("_CRAWLED", "").lower())
                    filename = f"{safe_model}_crawled_manual.txt"
                    
                    kb_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "knowledge-base", "manuals"))
                    os.makedirs(kb_dir, exist_ok=True)
                    
                    filepath = os.path.join(kb_dir, filename)
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(raw_text)
                        
                    # Register product in database
                    db.add_product({
                        "product_name": product_type,
                        "manufacturer": manufacturer,
                        "model_number": model_number,
                        "manual_filename": filename,
                        "description": f"Auto-scraped from URL: {manual_url}"
                    })
                    
                    # Force dynamic RAG indexing
                    print(f"[API Analyze] Scraping complete. Re-indexing knowledge base for new file: {filename}")
                    from backend.rag.document_processor import processor
                    processor.process_kb()
                    
                    product_det_conf = 1.0
                    fault_det_conf = 1.0 if fault_det_conf == 0.0 else fault_det_conf
                else:
                    print(f"[API Analyze] Warning: Scraped text from {manual_url} is empty.")
            except Exception as scrape_err:
                print(f"[API Analyze] Scrape/Index error: {scrape_err}")
                raise HTTPException(status_code=400, detail=f"Failed to scrape manual URL: {str(scrape_err)}")

        # 5. Link manuals/SOPs based on product model
        allowed_files = None
        if model_number:
            prod = db.get_product_by_model(model_number)
            if prod:
                allowed_files = [prod["manual_filename"], "electrical_safety_sop.txt"]
            else:
                allowed_files = None
        else:
            allowed_files = None

        # 6. RAG Retrieval Search
        print(f"[API Analyze] Running RAG search for: \"{final_query}\" with allowed files: {allowed_files}")
        rag_hits = vector_store.search(final_query, top_k=3, allowed_files=allowed_files)
        rag_context = [hit[0] for hit in rag_hits]
        
        # Dual-pass implicit product resolution based on retrieved RAG sources
        if not model_number and rag_context:
            sources = [doc["source_file"] for doc in rag_context if doc["source_file"] != "electrical_safety_sop.txt"]
            if not sources:
                sources = [doc["source_file"] for doc in rag_context]
            if sources:
                primary_source = sources[0]
                all_prods = db.get_all_products()
                implicit_prod = next((p for p in all_prods if p["manual_filename"] == primary_source), None)
                if implicit_prod:
                    model_number = implicit_prod["model_number"]
                    manufacturer = implicit_prod["manufacturer"]
                    product_type = implicit_prod["product_name"]
                    product_det_conf = 0.85
                    allowed_files = [implicit_prod["manual_filename"], "electrical_safety_sop.txt"]
                    
        raw_rag_score = rag_hits[0][1] if rag_hits else 0.0
        # Normalize RRF score: 1.0 rank in both searches is 2/61 ≈ 0.032786
        rag_score_val = min(1.0, raw_rag_score / (2.0 / 61.0))

        # 7. Session State Retrieval (failed solutions memory)
        active_session_id = session_id or f"sess_{uuid.uuid4().hex[:8]}"
        session = db.get_session(active_session_id)
        
        failed_solutions = []
        if session:
            failed_solutions = session.get("failed_steps", [])

        # 8. LLM Reasoner Guidance
        if allowed_files and rag_context:
            diagnosis = reasoner_service.generate_guidance(
                vision_findings=vision_findings or {
                    "detected_issue": final_query,
                    "confidence": f"{int(fault_det_conf * 100)}%",
                    "visual_findings": "Direct text scan"
                },
                technician_query=final_query,
                rag_context=rag_context,
                failed_solutions=failed_solutions
            )
            detected_issue = diagnosis.get("detected_issue", "Unknown Issue")
            llm_conf_val = scoring_engine.parse_percentage(diagnosis.get("llm_reasoning_confidence", "85%"))
            llm_grounding_val = scoring_engine.parse_percentage(diagnosis.get("llm_grounding_confidence", "0%"))
            suggested_steps = diagnosis.get("suggested_steps", [])
            safety = diagnosis.get("safety_recommendations", "Follow standard safety practices.")
            manual_ref = diagnosis.get("manual_reference", "N/A")
            root_cause_rankings = diagnosis.get("root_cause_rankings", [])
            reasoning_explanation = diagnosis.get("reasoning_explanation", "")
            lang_code = diagnosis.get("detected_language_code", "en")
            inference_node = diagnosis.get("inference_node", "LOCAL HEURISTIC RULES")
            explainable_ai_justification = diagnosis.get("explainable_ai_justification", {})
        else:
            detected_issue = "Official troubleshooting guidance is unavailable in the knowledge base."
            llm_conf_val = 0.0
            llm_grounding_val = 0.0
            suggested_steps = []
            safety = "Please contact the authorized service center."
            manual_ref = "N/A"
            root_cause_rankings = []
            reasoning_explanation = "We could not locate official repair documentation for this product. Please contact the authorized service center."
            lang_code = "en"
            inference_node = "LOCAL HEURISTIC RULES"
            explainable_ai_justification = {
                "evidence_chain": ["Zero matching manual entries found in local vector RAG."],
                "confidence_calculation": "Determined as 0.0% due to absence of matching manuals.",
                "model_reasoning_limits": "Cannot proceed safely without verified service documents."
            }

        # 9. Strict Confidence Formula Calculation
        # Final Confidence = 0.35 * Product + 0.30 * Manual + 0.20 * Fault + 0.15 * Grounding
        final_confidence_val = (
            (0.35 * product_det_conf) +
            (0.30 * rag_score_val) +
            (0.20 * fault_det_conf) +
            (0.15 * llm_grounding_val)
        )

        # Enforce threshold: 60% (0.60)
        response_allowed = True
        if final_confidence_val < 0.60 or not allowed_files or not rag_context:
            response_allowed = False
            detected_issue = "Official troubleshooting guidance is unavailable in the knowledge base."
            suggested_steps = []
            safety = "Please contact the authorized service center."
            reasoning_explanation = "We could not locate official repair documentation for this product. Please contact the authorized service center."
            root_cause_rankings = []
            manual_ref = "N/A"
            explainable_ai_justification = {
                "evidence_chain": ["Safety block activated due to low grounding confidence."],
                "confidence_calculation": f"Confidence score fell below the required 60% safety threshold.",
                "model_reasoning_limits": "Safety threshold constraint enforced; instruction manual grounding insufficient."
            }

        confidence_percent_str = f"{final_confidence_val * 100:.1f}%"
        repair_success_probability = f"{((0.20 * rag_score_val) + (0.30 * llm_conf_val) + (0.50 * db.get_historical_success_rate(detected_issue))) * 100:.1f}%"

        # 10. Voice Synthesis
        if response_allowed:
            steps_speech = " ... ".join([f"Step {i+1}. {step}" for i, step in enumerate(suggested_steps)])
            speech_script = f"Safety Advisory: {safety} ... ... Troubleshooting Steps: ... {steps_speech}"
        else:
            speech_script = "We could not locate official repair documentation for this product. Please contact the authorized service center."
            
        tts_filename = tts_service.text_to_speech(speech_script, lang=lang_code)
        tts_audio_url = f"/static/{tts_filename}" if tts_filename else None

        # 11. Update Active Session State
        session_payload = {
            "session_id": active_session_id,
            "detected_issue": detected_issue,
            "severity_level": "Medium" if response_allowed else "High",
            "confidence_score": confidence_percent_str,
            "root_cause_rankings": root_cause_rankings,
            "suggested_steps": suggested_steps,
            "safety_recommendations": safety,
            "failed_steps": failed_solutions,
            "image_url": image_url,
            "query_text": final_query,
            "inference_node": inference_node
        }
        db.create_or_update_session(session_payload)

        # 12. Log standard inspection to history DB
        db_record = {
            "image_path": image_url,
            "detected_issue": detected_issue,
            "confidence": confidence_percent_str,
            "root_cause": reasoning_explanation,
            "suggested_steps": suggested_steps,
            "safety_recommendations": safety,
            "audio_url": tts_audio_url,
            "query_text": final_query,
            "inference_node": inference_node
        }
        db.add_record(db_record)

        sim_telemetry, sim_integrations = get_simulated_telemetry_and_integrations(model_number, active_session_id, response_allowed)

        return {
            "session_id": active_session_id,
            "image_url": image_url,
            "user_audio_url": user_audio_url,
            "query_text": final_query,
            "detected_issue": detected_issue,
            "confidence": confidence_percent_str,
            "confidence_score": confidence_percent_str,
            "repair_success_probability": repair_success_probability,
            "severity_level": "High" if not response_allowed else "Medium",
            "root_cause_rankings": root_cause_rankings,
            "reasoning_explanation": reasoning_explanation,
            "root_cause": reasoning_explanation,
            "suggested_steps": suggested_steps,
            "safety_recommendations": safety,
            "tts_audio_url": tts_audio_url,
            "rag_sources": [doc["source_file"] for doc in rag_context] if rag_context else [],
            "feedback_request": "Did this solution resolve the issue?",
            "detected_language_code": lang_code,
            "inference_node": inference_node,
            "response_allowed": response_allowed,
            "manual_reference": manual_ref,
            "manual_match_confidence": f"{rag_score_val * 100:.1f}%",
            "explainable_ai_justification": explainable_ai_justification,
            "telemetry": sim_telemetry,
            "enterprise_integrations": sim_integrations
        }
    except Exception as e:
        print(f"[API Analyze] Error during pipeline analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query")
async def text_query(query: str = Form(...)):
    """
    Perform a text-only query against the manuals & SOPs knowledge base.
    """
    try:
        model_number = None
        manufacturer = None
        product_type = None
        product_det_conf = 0.0
        
        # Resolve product model from query text
        from backend.utils.product_resolver import resolve_product_by_query
        all_prods = db.get_all_products()
        matched_p = resolve_product_by_query(query, all_prods)
        if matched_p:
            model_number = matched_p["model_number"]
            manufacturer = matched_p["manufacturer"]
            product_type = matched_p["product_name"]
            product_det_conf = min(1.0, max(0.7, matched_p["match_score"] / 100.0))

        allowed_files = None
        if model_number:
            prod = db.get_product_by_model(model_number)
            if prod:
                allowed_files = [prod["manual_filename"], "electrical_safety_sop.txt"]
            else:
                allowed_files = None
        else:
            allowed_files = None

        # Retrieve manuals context
        print(f"[API Query] Running RAG search for query: \"{query}\" with allowed files: {allowed_files}")
        rag_hits = vector_store.search(query, top_k=3, allowed_files=allowed_files)
        rag_context = [hit[0] for hit in rag_hits]
        
        # Dual-pass implicit product resolution based on retrieved RAG sources
        if not model_number and rag_context:
            sources = [doc["source_file"] for doc in rag_context if doc["source_file"] != "electrical_safety_sop.txt"]
            if not sources:
                sources = [doc["source_file"] for doc in rag_context]
            if sources:
                primary_source = sources[0]
                all_prods = db.get_all_products()
                implicit_prod = next((p for p in all_prods if p["manual_filename"] == primary_source), None)
                if implicit_prod:
                    model_number = implicit_prod["model_number"]
                    manufacturer = implicit_prod["manufacturer"]
                    product_type = implicit_prod["product_name"]
                    product_det_conf = 0.85
                    allowed_files = [implicit_prod["manual_filename"], "electrical_safety_sop.txt"]
                    
        raw_rag_score = rag_hits[0][1] if rag_hits else 0.0
        # Normalize RRF score: 1.0 rank in both searches is 2/61 ≈ 0.032786
        rag_score_val = min(1.0, raw_rag_score / (2.0 / 61.0))
        
        dummy_findings = {
            "detected_issue": "Text Query Search",
            "confidence": "100%",
            "visual_findings": "Direct database query. No image provided."
        }
        
        if allowed_files and rag_context:
            diagnosis = reasoner_service.generate_guidance(
                vision_findings=dummy_findings,
                technician_query=query,
                rag_context=rag_context
            )
            detected_issue = diagnosis.get("detected_issue", "Unknown")
            llm_conf_val = scoring_engine.parse_percentage(diagnosis.get("llm_reasoning_confidence", "85%"))
            llm_grounding_val = scoring_engine.parse_percentage(diagnosis.get("llm_grounding_confidence", "0%"))
            steps = diagnosis.get("suggested_steps", [])
            safety = diagnosis.get("safety_recommendations", "")
            manual_ref = diagnosis.get("manual_reference", "N/A")
            root_cause_rankings = diagnosis.get("root_cause_rankings", [])
            reasoning_explanation = diagnosis.get("reasoning_explanation", "")
            lang_code = diagnosis.get("detected_language_code", "en")
            inference_node = diagnosis.get("inference_node", "LOCAL HEURISTIC RULES")
            explainable_ai_justification = diagnosis.get("explainable_ai_justification", {})
        else:
            detected_issue = "Official troubleshooting guidance is unavailable in the knowledge base."
            llm_conf_val = 0.0
            llm_grounding_val = 0.0
            steps = []
            safety = "Please contact the authorized service center."
            manual_ref = "N/A"
            root_cause_rankings = []
            reasoning_explanation = "We could not locate official repair documentation for this product. Please contact the authorized service center."
            lang_code = "en"
            inference_node = "LOCAL HEURISTIC RULES"
            explainable_ai_justification = {
                "evidence_chain": ["Zero matching manual entries found in local vector RAG."],
                "confidence_calculation": "Determined as 0.0% due to absence of matching manuals.",
                "model_reasoning_limits": "Cannot proceed safely without verified service documents."
            }

        # Strict Confidence Formula Calculation
        final_confidence_val = (
            (0.35 * product_det_conf) +
            (0.30 * rag_score_val) +
            (0.20 * 1.0) + # Text query assumes 100% fault detection intent
            (0.15 * llm_grounding_val)
        )

        response_allowed = True
        if final_confidence_val < 0.60 or not allowed_files or not rag_context:
            response_allowed = False
            detected_issue = "Official troubleshooting guidance is unavailable in the knowledge base."
            steps = []
            safety = "Please contact the authorized service center."
            reasoning_explanation = "We could not locate official repair documentation for this product. Please contact the authorized service center."
            root_cause_rankings = []
            manual_ref = "N/A"
            explainable_ai_justification = {
                "evidence_chain": ["Safety block activated due to low grounding confidence."],
                "confidence_calculation": f"Confidence score fell below the required 60% safety threshold.",
                "model_reasoning_limits": "Safety threshold constraint enforced; instruction manual grounding insufficient."
            }

        confidence_percent_str = f"{final_confidence_val * 100:.1f}%"
        repair_success_probability = f"{((0.20 * rag_score_val) + (0.30 * llm_conf_val) + (0.50 * db.get_historical_success_rate(detected_issue))) * 100:.1f}%"

        # Speech synth
        if response_allowed:
            steps_speech = " ... ".join([f"Step {i+1}. {step}" for i, step in enumerate(steps)])
            speech_script = f"Safety Advisory: {safety} ... ... Troubleshooting Steps: ... {steps_speech}"
        else:
            speech_script = "We could not locate official repair documentation for this product. Please contact the authorized service center."
            
        tts_filename = tts_service.text_to_speech(speech_script, lang=lang_code)
        tts_audio_url = f"/static/{tts_filename}" if tts_filename else None
        
        # Log to history
        db.add_record({
            "image_path": None,
            "detected_issue": detected_issue,
            "confidence": confidence_percent_str,
            "root_cause": reasoning_explanation,
            "suggested_steps": steps,
            "safety_recommendations": safety,
            "audio_url": tts_audio_url,
            "query_text": query,
            "inference_node": inference_node
        })
        
        sim_telemetry, sim_integrations = get_simulated_telemetry_and_integrations(model_number, "sess_query", response_allowed)

        return {
            "query_text": query,
            "detected_issue": detected_issue,
            "confidence": confidence_percent_str,
            "confidence_score": confidence_percent_str,
            "repair_success_probability": repair_success_probability,
            "severity_level": "High" if not response_allowed else "Medium",
            "root_cause_rankings": root_cause_rankings,
            "reasoning_explanation": reasoning_explanation,
            "root_cause": reasoning_explanation,
            "suggested_steps": steps,
            "safety_recommendations": safety,
            "tts_audio_url": tts_audio_url,
            "detected_language_code": lang_code,
            "inference_node": inference_node,
            "response_allowed": response_allowed,
            "manual_reference": manual_ref,
            "manual_match_confidence": f"{rag_score_val * 100:.1f}%",
            "explainable_ai_justification": explainable_ai_justification,
            "telemetry": sim_telemetry,
            "enterprise_integrations": sim_integrations
        }
        
    except Exception as e:
        print(f"[API Analyze] Error during text query: {e}")
        raise HTTPException(status_code=500, detail=str(e))
