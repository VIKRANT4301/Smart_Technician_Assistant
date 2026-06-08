from fastapi import APIRouter, HTTPException
from backend_HF.models.schemas import ChatRequest
from backend_HF.core.config import config
from backend_HF.rag.vector_store import vector_store
from backend_HF.utils.local_llm import query_local_llm_chat
from backend_HF.database.db_service import db
from backend_HF.utils.hf_client import query_hf_endpoint
import json
import re

router = APIRouter(prefix="", tags=["Chat"])

@router.post("/chat")
async def chat_assistant(req: ChatRequest):
    try:
        # Resolve product model from query message or history
        from backend_HF.utils.product_resolver import resolve_product_by_query
        all_prods = db.get_all_products()
        
        chat_context_text = req.message + " " + " ".join([m.content for m in req.history])
        matched_p = resolve_product_by_query(chat_context_text, all_prods)
        
        model_number = None
        if matched_p:
            model_number = matched_p["model_number"]

        allowed_files = None
        if model_number:
            prod = db.get_product_by_model(model_number)
            if prod:
                allowed_files = [prod["manual_filename"], "electrical_safety_sop.txt"]
            else:
                allowed_files = None
        else:
            allowed_files = None

        # 1. RAG Search to retrieve context
        print(f"[API Chat] Querying RAG manuals: \"{req.message}\" with allowed files: {allowed_files}")
        rag_hits = vector_store.search(req.message, top_k=2, allowed_files=allowed_files)
        
        # Dual-pass implicit product resolution based on retrieved RAG sources in chat
        if not model_number and rag_hits:
            sources = [hit[0]["source_file"] for hit in rag_hits if hit[0]["source_file"] != "electrical_safety_sop.txt"]
            if not sources:
                sources = [hit[0]["source_file"] for hit in rag_hits]
            if sources:
                primary_source = sources[0]
                implicit_prod = next((p for p in all_prods if p["manual_filename"] == primary_source), None)
                if implicit_prod:
                    model_number = implicit_prod["model_number"]
                    allowed_files = [implicit_prod["manual_filename"], "electrical_safety_sop.txt"]
        
        if not allowed_files or not rag_hits:
            return {
                "response": "Official troubleshooting guidance is unavailable in the knowledge base. Please contact the authorized service center.",
                "sources": [],
                "inference_node": "SYSTEM ESCALATION"
            }
            
        context_str = "\n---\n".join([
            f"Source: {hit[0]['source_file']} | Excerpt: {hit[0]['text']}"
            for hit in rag_hits
        ])
        sources = [hit[0]["source_file"] for hit in rag_hits]

        # 2. Setup system instructions and prompt
        system_instruction = (
            "You are an expert conversational AI diagnostic assistant for industrial maintenance.\n"
            "Help the technician resolve machinery issues, verify steps, explain technical details, and retrieve information. "
            "Prioritize safety and precision. Link to the exact page, guide, or manual sections when relevant.\n\n"
            "Here is the retrieved technical manual context to help you answer:\n"
            f"{context_str}\n\n"
            "Guidelines:\n"
            "- Be concise, direct, and structured.\n"
            "- Provide clear safety isolation warnings where relevant.\n"
            "- You MUST answer questions ONLY based on the provided technical manual context. DO NOT invent repair steps or general advice if the context does not support it.\n"
            "- If the context does not contain the answer, state: 'We could not locate official repair documentation for this product. Please contact the authorized service center.'"
        )

        # 3. Request completion from Hugging Face Pro LLM endpoint
        is_huggingface = "api-inference.huggingface.co" in config.HF_LLM_URL if config.HF_LLM_URL else True
        if config.HF_LLM_URL and (config.HF_TOKEN or not is_huggingface):
            try:
                print(f"[API Chat] Generating chat response via Hugging Face Endpoint...")
                hf_messages = [{"role": "system", "content": system_instruction}]
                for msg in req.history:
                    hf_messages.append({
                        "role": "user" if msg.role == "user" else "assistant",
                        "content": msg.content
                    })
                hf_messages.append({"role": "user", "content": req.message})

                payload = {
                    "model": "Qwen/Qwen2.5-14B-Instruct",
                    "messages": hf_messages,
                    "temperature": 0.2
                }

                resp = query_hf_endpoint(config.HF_LLM_URL, payload, timeout=20.0)
                if resp:
                    response_text = ""
                    if isinstance(resp, dict):
                        if "choices" in resp and resp["choices"] and "message" in resp["choices"][0] and resp["choices"][0]["message"].get("content") is not None:
                            response_text = str(resp["choices"][0]["message"]["content"]).strip()
                        elif "generated_text" in resp and resp["generated_text"] is not None:
                            response_text = str(resp["generated_text"]).strip()
                        else:
                            response_text = json.dumps(resp)
                    elif isinstance(resp, str):
                        response_text = resp.strip()

                    return {
                        "response": response_text,
                        "sources": list(set(sources)),
                        "inference_node": "CLOUD HUGGING FACE (QWEN-14B)"
                    }
                else:
                    err_msg = "Hugging Face LLM endpoint returned empty response in Chat."
                    print(f"[API Chat] {err_msg}")
                    if config.DISABLE_MOCK_FALLBACK:
                        raise HTTPException(status_code=500, detail=err_msg)
            except HTTPException:
                raise
            except Exception as hfe:
                print(f"[API Chat] Hugging Face chat completion failed: {hfe}.")
                if config.DISABLE_MOCK_FALLBACK:
                    raise HTTPException(status_code=500, detail=f"Hugging Face Chat API failed: {hfe}") from hfe
        elif config.DISABLE_MOCK_FALLBACK:
            raise HTTPException(status_code=500, detail="Hugging Face LLM Endpoint bypassed (missing token or URL) in Chat.")

        # Reconstruct messages for Local LLM
        local_messages = [{"role": "user", "parts": [system_instruction]}]
        for msg in req.history:
            local_messages.append({
                "role": "user" if msg.role == "user" else "model",
                "parts": [msg.content]
            })
        local_messages.append({"role": "user", "parts": [req.message]})

        # Try local edge LLM chat first
        try:
            local_text = query_local_llm_chat(local_messages)
            if local_text:
                return {
                    "response": local_text,
                    "sources": list(set(sources)) if 'sources' in locals() else [],
                    "inference_node": f"EDGE OLLAMA ({config.OLLAMA_MODEL.upper()}) // AMD ROCm ACCELERATED"
                }
        except Exception as le:
            print(f"[API Chat] Local LLM chat fallback failed: {le}")
            if config.DISABLE_MOCK_FALLBACK:
                raise HTTPException(status_code=500, detail=f"Local LLM chat failed: {le}") from le

        if config.DISABLE_MOCK_FALLBACK:
            raise HTTPException(status_code=500, detail="All LLM chat inference nodes failed/bypassed in Chat.")

    except HTTPException:
        raise
    except Exception as e:
        print(f"[API Chat] Reasoning pipeline failed: {e}.")
        if config.DISABLE_MOCK_FALLBACK:
            raise HTTPException(status_code=500, detail=str(e)) from e
        print("[API Chat] Running offline fallback.")
        
    # Fallback offline chat reasoning
    msg_lower = req.message.lower()
    sources_list = list(set(sources)) if ('sources' in locals() and sources) else []
    
    if 'rag_hits' in locals() and rag_hits:
        full_text = "\n".join([hit[0]["text"] for hit in rag_hits])
        full_text = re.sub(r'Source:\s*[^\s|]+\s*\|', '', full_text)
        
        # Specs request
        if any(w in msg_lower for w in ["spec", "specification", "parameter", "dimension", "battery", "ram", "cpu", "processor", "temp", "cool"]):
            spec_lines = []
            in_spec = False
            for line in full_text.split("\n"):
                line_strip = line.strip()
                if "SPECIFICATION" in line_strip.upper():
                    in_spec = True
                    continue
                if in_spec:
                    if line_strip.startswith("===") or "TROUBLESHOOTING" in line_strip.upper() or "RESOLUTION" in line_strip.upper():
                        break
                    if line_strip.startswith("*") or line_strip.startswith("-") or ":" in line_strip:
                        if line_strip not in spec_lines:
                            spec_lines.append(line_strip)
            if spec_lines:
                fallback_text = f"Here are the system specifications for the product based on {sources_list[0]}:\n\n" + "\n".join(spec_lines)
            else:
                fallback_text = f"Based on the official manual {sources_list[0]}, here is the relevant technical detail:\n\n{full_text[:600]}..."
        
        # Troubleshooting steps
        elif any(w in msg_lower for w in ["how", "fix", "step", "troubleshoot", "repair", "clean", "symptom"]):
            steps = []
            for line in full_text.split("\n"):
                line_strip = line.strip()
                if re.match(r'^\d+[\.\)]', line_strip) or "Step" in line_strip:
                    if line_strip not in steps:
                        steps.append(line_strip)
            if steps:
                fallback_text = f"According to {sources_list[0]}, please follow these steps:\n\n" + "\n".join(steps)
            else:
                fallback_text = f"Here is the relevant repair documentation from {sources_list[0]}:\n\n{full_text[:600]}..."
        else:
            fallback_text = f"Based on the retrieved context from {sources_list[0]}:\n\n{full_text[:400]}..."
    else:
        if "safety" in msg_lower or "ppe" in msg_lower or "isolate" in msg_lower or "loto" in msg_lower:
            fallback_text = (
                "OFFLINE MODE // SAFETY RETRIEVAL:\n\n"
                "1. ELECTRICAL HAZARD CONTROL:\n"
                "- PPE: Wear Class E insulated safety gloves (rated for at least 1000V) and safety glasses. Remove all metal jewelry, rings, and watches.\n"
                "- LOTO (Lockout/Tagout): Lock out the electrical panel feeding the machinery. Apply a personalized safety tag with your name, date, and contact details.\n"
                "- VERIFICATION: Use a calibrated non-contact voltage tester to verify the circuit is completely dead before touching any terminal.\n\n"
                "2. FLUID/CHEMICAL ISOLATION:\n"
                "- Close inlet and outlet valves to isolate the fluid line. Open bleed valve to drain remaining pressure."
            )
            sources_list = ["electrical_safety_sop.txt"]
        elif "pump" in msg_lower or "leak" in msg_lower:
            fallback_text = (
                "OFFLINE MODE // CENTRIFUGAL PUMP REPAIR GUIDELINES:\n\n"
                "Common Causes:\n"
                "1. Worn Mechanical Seal / Gland Packing: Friction and high operating hours degrade packing rings or ceramic faces of the seal.\n"
                "2. Damaged O-Rings or Casing Gaskets: Chemical incompatibility or thermal cycles cause elastomeric seals to split.\n"
                "3. Shaft Misalignment: Creates eccentric rotation which destroys seals.\n\n"
                "Recommended Actions:\n"
                "- Isolate and de-pressurize the fluid line. Shut down power using LOTO.\n"
                "- Disassemble casing by undoing casing bolts in a cross-pattern. Inspect gaskets.\n"
                "- Replace mechanical seals or install new packing rings (offsetting joints by 90 degrees).\n"
                "- Realign the shaft using a laser or dial indicator (ensure radial misalignment is under 0.05mm)."
            )
            sources_list = ["industrial_pump_leak_guide.txt"]
        elif "compressor" in msg_lower or "hvac" in msg_lower or "overheat" in msg_lower:
            fallback_text = (
                "OFFLINE MODE // HVAC COMPRESSOR OVERHEATING GUIDELINES:\n\n"
                "Common Causes:\n"
                "1. Blocked Condenser Coils: Accumulation of dirt, debris, or calcium.\n"
                "2. Low Refrigerant Charge: System leakage or pressure drops.\n"
                "3. Faulty Run/Start Capacitor: Swollen or degraded capacitor leading to high winding currents.\n\n"
                "Recommended Actions:\n"
                "- Isolate electrical power at the main circuit breaker.\n"
                "- Spray commercial coil cleaner on condenser coils and rinse with low-pressure water.\n"
                "- Discharge the run capacitor using an insulated resistor tool before inspection.\n"
                "- Check capacitor capacitance; replace if reading is ±10% outside nominal rating."
            )
            sources_list = ["hvac_compressor_manual.txt"]
        else:
            fallback_text = "Official troubleshooting guidance is unavailable in the knowledge base. Please contact the authorized service center."
            sources_list = []

    return {
        "response": fallback_text,
        "sources": sources_list,
        "inference_node": "LOCAL AMD RYZEN AI EDGE NODE"
    }
