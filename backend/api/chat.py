import google.generativeai as genai
from fastapi import APIRouter, HTTPException
from backend.models.schemas import ChatRequest
from backend.core.config import config
from backend.rag.vector_store import vector_store
from backend.utils.local_llm import query_local_llm_chat
from backend.database.db_service import db

router = APIRouter(prefix="", tags=["Chat"])

@router.post("/chat")
async def chat_assistant(req: ChatRequest):
    try:
        # Resolve product model from query message or history using product_resolver
        from backend.utils.product_resolver import resolve_product_by_query
        all_prods = db.get_all_products()
        
        # Combine message and history contents to scan for products
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

        # Build prompt list for Gemini Model
        messages = [
            {"role": "user", "parts": [system_instruction]}
        ]

        # Re-play conversation history (client-provided)
        for msg in req.history:
            messages.append({
                "role": "user" if msg.role == "user" else "model",
                "parts": [msg.content]
            })

        # Append current user question
        messages.append({
            "role": "user",
            "parts": [req.message]
        })

        # Generate response using Gemini 2.5 Flash or OpenRouter
        if config.GEMINI_API_KEY.startswith("sk-or-"):
            try:
                print(f"[API Chat] Generating chat response via OpenRouter...")
                openrouter_messages = []
                openrouter_messages.append({"role": "system", "content": system_instruction})
                for msg in req.history:
                    openrouter_messages.append({
                        "role": "user" if msg.role == "user" else "assistant",
                        "content": msg.content
                    })
                openrouter_messages.append({"role": "user", "content": req.message})
                
                from backend.utils.openrouter import query_openrouter
                response_text = query_openrouter("google/gemini-2.5-flash", openrouter_messages)
                
                return {
                    "response": response_text,
                    "sources": list(set(sources)),
                    "inference_node": "CLOUD GEMINI (OPENROUTER)"
                }
            except Exception as ore:
                print(f"[API Chat] OpenRouter reasoning failed: {ore}. Attempting local Edge LLM chat fallback.")
                raise ore
        else:
            model = genai.GenerativeModel("gemini-2.5-flash")
            print(f"[API Chat] Generating chat response...")
            response = model.generate_content(messages)
            
            return {
                "response": response.text.strip(),
                "sources": list(set(sources)),
                "inference_node": "CLOUD GEMINI"
            }

    except Exception as e:
        print(f"[API Chat] Gemini reasoning failed: {e}. Attempting local Edge LLM chat fallback.")
        
        # Try local edge LLM chat first
        try:
            local_text = query_local_llm_chat(messages)
            if local_text:
                return {
                    "response": local_text,
                    "sources": list(set(sources)) if 'sources' in locals() else [],
                    "inference_node": f"EDGE OLLAMA ({config.OLLAMA_MODEL.upper()})"
                }
        except Exception as le:
            print(f"[API Chat] Local LLM chat fallback failed: {le}")
            
        # Fallback offline chat reasoning
        msg_lower = req.message.lower()
        sources_list = list(set(sources)) if ('sources' in locals() and sources) else []
        
        if 'rag_hits' in locals() and rag_hits:
            import re
            full_text = "\n".join([hit[0]["text"] for hit in rag_hits])
            full_text = re.sub(r'Source:\s*[^\s|]+\s*\|', '', full_text)
            
            # 1. Spec/Specifications request
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
            
            # 2. Troubleshooting steps request
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
            "inference_node": "LOCAL HEURISTIC"
        }
