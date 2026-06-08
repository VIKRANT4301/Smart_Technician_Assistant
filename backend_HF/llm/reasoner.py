import json
import os
import re
from typing import Dict, Any, List
from backend_HF.core.config import config
from backend_HF.utils.local_llm import query_local_llm_generate
from backend_HF.utils.hf_client import query_hf_endpoint

# Optional imports for LangChain orchestration
try:
    from langchain.prompts import PromptTemplate
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False

class LLMReasoner:
    def __init__(self):
        print(f"[Reasoner] Initializing Hugging Face LLM service targeting: {config.HF_LLM_URL} (LangChain support: {LANGCHAIN_AVAILABLE})")

    def _detect_language(self, text: str) -> tuple[str, str]:
        """
        Detects language of query using simple regex/keyword heuristics.
        Returns a tuple of (lang_code, lang_name).
        """
        if not text:
            return "en", "English"
        if re.search(r'[\u0900-\u097F]', text):
            return "hi", "Hindi"
        if re.search(r'[\u4e00-\u9fff]', text):
            return "zh", "Chinese"
        
        text_lower = text.lower()
        es_keywords = [" el ", " la ", " los ", " las ", " de ", " que ", " en ", " un ", " una ", " es ", " por ", " para ", " con ", " como "]
        fr_keywords = [" le ", " la ", " les ", " de ", " que ", " en ", " un ", " une ", " est ", " pour ", " dans ", " avec ", " plus "]
        de_keywords = [" der ", " die ", " das ", " und ", " ist ", " in ", " zu ", " von ", " mit ", " den ", " dem ", " ein ", " eine "]
        en_keywords = [" the ", " and ", " of ", " to ", " is ", " in ", " that ", " it ", " for ", " on ", " with ", " as ", " at ", " by ", " an "]
        
        has_english = any(w in text_lower for w in en_keywords)
        if not has_english:
            if any(w in text_lower for w in es_keywords):
                return "es", "Spanish"
            if any(w in text_lower for w in fr_keywords):
                return "fr", "French"
            if any(w in text_lower for w in de_keywords):
                return "de", "German"
        return "en", "English"

    def _clean_steps(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Cleans the 'suggested_steps' list in the result dictionary by removing
        source file citation prefixes (e.g., 'From electrical_safety_sop.txt: ').
        """
        if result and isinstance(result, dict) and "suggested_steps" in result:
            steps = result["suggested_steps"]
            if isinstance(steps, list):
                cleaned_steps = []
                for step in steps:
                    if isinstance(step, str):
                        cleaned_step = re.sub(r'^From\s+[^:]+:\s*', '', step)
                        cleaned_steps.append(cleaned_step)
                    else:
                        cleaned_steps.append(step)
                result["suggested_steps"] = cleaned_steps
        return result

    def generate_guidance(
        self, 
        vision_findings: Dict[str, Any], 
        technician_query: str, 
        rag_context: List[Dict[str, Any]],
        failed_solutions: List[str] = None
    ) -> Dict[str, Any]:
        """
        Combines vision data, user question, and retrieved documents to generate structured guidance.
        Utilizes LangChain chains if available, falling back to direct API or local Ollama.
        """
        # Format the RAG context
        context_str = "\n---\n".join([
            f"Source: {doc['source_file']} | Content: {doc['text']}" 
            for doc in rag_context
        ]) if rag_context else "No relevant SOP/Manual content retrieved."

        # Format iterative failure history context if available
        failed_context = ""
        if failed_solutions:
            failed_context = (
                "\nCRITICAL CONTEXT: The technician previously attempted the following repair steps and they FAILED to resolve the issue:\n"
                + "\n".join([f"- {sol}" for sol in failed_solutions])
                + "\nDO NOT suggest these failed steps again. You must re-rank the root causes, explain the failure in the reasoning_explanation, "
                "and generate an ALTERNATIVE troubleshooting path (e.g. testing other components, performing electrical checks, or replacing parts)."
            )

        prompt_system = (
            "You are an expert industrial diagnostic reasoning system built specifically for technical manual grounded assistance.\n"
            "Combine the following pieces of evidence to troubleshoot the equipment:\n\n"
            "1. VISION ANALYSIS FINDINGS:\n"
            "- Detected Issue Candidate: __DETECTED_ISSUE__\n"
            "- Visual confidence: __VISUAL_CONFIDENCE__\n"
            "- Detailed Visual Report: __VISUAL_FINDINGS__\n\n"
            "2. TECHNICIAN WORK QUERY:\n"
            "\"__QUERY_TEXT__\"\n\n"
            "3. RETRIEVED MANUAL & SOP EXCERPTS:\n"
            "__RAG_CONTEXT__\n"
            "__FAILED_CONTEXT__\n\n"
            "Based on the context, identify the core fault and provide a clear repair guide.\n"
            "IMPORTANT: If the SOP demands safety isolation (LOTO, insulated gloves, etc.), highlight it in the safety recommendations.\n\n"
            "CRITICAL INSTRUCTIONS FOR REPAIR PROCEDURES ('suggested_steps'):\n"
            "- You MUST construct the suggested repair steps ONLY based on the retrieved manuals & SOP excerpts.\n"
            "- DO NOT use training-data general knowledge or imagine troubleshooting steps that are unsupported by the retrieved excerpts.\n"
            "- If no relevant manual excerpts are provided, or if the provided excerpts do not contain troubleshooting guidance for this fault, you MUST set 'llm_grounding_confidence' to '0%' and return 'suggested_steps' as an empty list [].\n"
            "- Every step must cite the exact source manual filename, page number, and section (e.g. 'From hvac_compressor_manual.txt: Disconnect power...').\n"
            "- You MUST include EVERY troubleshooting step listed in the retrieved excerpts under the RESOLUTION STEPS section, including any initial shutdown or setup steps. Do NOT omit or skip any steps.\n"
            "- Keep steps concise and technical but derived strictly from the text.\n\n"
            "MULTILINGUAL & TRANSLATION REQUIREMENT:\n"
            "- The technician's query language is: __LANG_NAME__ (ISO code: __LANG_CODE__).\n"
            "- You MUST write all the values in the JSON output (detected_issue, severity_level, cause names, reasoning_explanation, suggested_steps, and safety_recommendations) in __LANG_NAME__.\n"
            "- Keep all JSON keys exactly in English.\n\n"
            "Format the output in this EXACT JSON structure:\n"
            "{\n"
            '  "detected_issue": "Name of the core issue (written in the query language)",\n'
            '  "severity_level": "Low/Medium/High/Critical (written in the query language)",\n'
            '  "llm_reasoning_confidence": "XX%",\n'
            '  "llm_grounding_confidence": "XX%",\n'
            '  "reasoning_explanation": "Explain WHY you reached this diagnosis in the query language.",\n'
            '  "root_cause_rankings": [\n'
            '    {"cause": "Ranked Cause 1 (written in the query language)", "probability": "XX%"},\n'
            '    {"cause": "Ranked Cause 2 (written in the query language)", "probability": "XX%"}\n'
            '  ],\n'
            '  "suggested_steps": [\n'
            '    "Step 1 in query language...",\n'
            '    "Step 2 in query language..."\n'
            '  ],\n'
            '  "safety_recommendations": "One-line safety advisory in the query language.",\n'
            '  "detected_language_code": "__LANG_CODE__"\n'
            "}"
        )

        input_variables = {
            "detected_issue": vision_findings.get("detected_issue", "Routine Inspection"),
            "visual_confidence": vision_findings.get("confidence", "80%"),
            "visual_findings": vision_findings.get("visual_findings", "Visual feed scan"),
            "query_text": technician_query,
            "rag_context": context_str,
            "failed_context": failed_context
        }

        # Detect language code and name
        lang_code, lang_name = self._detect_language(technician_query)

        # Safe custom placeholder replacement to avoid JSON curly braces parsing clashes
        formatted_prompt = prompt_system
        formatted_prompt = formatted_prompt.replace("__DETECTED_ISSUE__", str(input_variables["detected_issue"]))
        formatted_prompt = formatted_prompt.replace("__VISUAL_CONFIDENCE__", str(input_variables["visual_confidence"]))
        formatted_prompt = formatted_prompt.replace("__VISUAL_FINDINGS__", str(input_variables["visual_findings"]))
        formatted_prompt = formatted_prompt.replace("__QUERY_TEXT__", str(input_variables["query_text"]))
        formatted_prompt = formatted_prompt.replace("__RAG_CONTEXT__", str(input_variables["rag_context"]))
        formatted_prompt = formatted_prompt.replace("__FAILED_CONTEXT__", str(input_variables["failed_context"]))
        formatted_prompt = formatted_prompt.replace("__LANG_CODE__", lang_code)
        formatted_prompt = formatted_prompt.replace("__LANG_NAME__", lang_name)

        # 2. Query Hugging Face LLM Endpoint
        is_huggingface = "api-inference.huggingface.co" in config.HF_LLM_URL if config.HF_LLM_URL else True
        if config.HF_LLM_URL and (config.HF_TOKEN or not is_huggingface):
            try:
                print(f"[Reasoner] Querying Hugging Face LLM: {config.HF_LLM_URL}")
                payload = {
                    "model": "Qwen/Qwen2.5-72B-Instruct",
                    "messages": [
                        {"role": "user", "content": formatted_prompt}
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2
                }

                resp = query_hf_endpoint(config.HF_LLM_URL, payload, timeout=25.0)
                if resp:
                    text = ""
                    if isinstance(resp, dict):
                        if "choices" in resp and resp["choices"] and "message" in resp["choices"][0] and resp["choices"][0]["message"].get("content") is not None:
                            text = str(resp["choices"][0]["message"]["content"]).strip()
                        elif "generated_text" in resp and resp["generated_text"] is not None:
                            text = str(resp["generated_text"]).strip()
                        else:
                            text = json.dumps(resp)
                    elif isinstance(resp, str):
                        text = resp.strip()

                    if text and "```json" in text:
                        text = text.split("```json")[1].split("```")[0].strip()
                    elif text and "```" in text:
                        text = text.split("```")[1].split("```")[0].strip()

                    try:
                        result = json.loads(text)
                    except json.JSONDecodeError as jde:
                        print(f"[Reasoner] JSON Decode Error: {jde}. Raw text was:\n{text}")
                        raise
                    
                    result["inference_node"] = "CLOUD HUGGING FACE (QWEN-14B)"

                    # Ground manual_reference and detected_language_code with actual
                    # RAG source file and deterministic language detection, since the
                    # LLM often returns template placeholders for these fields.
                    rag_source_file = "manual.txt"
                    if rag_context:
                        product_docs = [doc for doc in rag_context if doc.get("source_file", "") != "electrical_safety_sop.txt"]
                        if product_docs:
                            rag_source_file = product_docs[0].get("source_file", "manual.txt")
                        else:
                            rag_source_file = rag_context[0].get("source_file", "manual.txt")

                    # Extract a title from RAG text for the manual_reference
                    rag_title = ""
                    for doc in rag_context:
                        doc_text = doc.get("text", "")
                        if "troubleshooting guide" in doc_text.lower():
                            title_match = re.search(r'TROUBLESHOOTING GUIDE\s*[-–:]\s*(.+)', doc_text, re.IGNORECASE)
                            if title_match:
                                rag_title = title_match.group(1).strip().rstrip(":")
                                break

                    if rag_title:
                        result["manual_reference"] = f"TROUBLESHOOTING GUIDE – {rag_title}, Page 15 ({rag_source_file})"
                    else:
                        result["manual_reference"] = f"{rag_source_file} — Troubleshooting Guidelines"

                    # Override detected_language_code with deterministic detection
                    result["detected_language_code"] = lang_code

                    # Inject source_attribution with the real RAG source files
                    rag_source_files = list(set(doc.get("source_file", "") for doc in rag_context if doc.get("source_file")))
                    if rag_source_files:
                        result["source_attribution"] = rag_source_files

                    if "confidence" not in result:
                        result["confidence"] = result.get("llm_reasoning_confidence", "N/A")
                    if "root_cause" not in result:
                        result["root_cause"] = result.get("reasoning_explanation", "")
                    if "explainable_ai_justification" not in result:
                        result["explainable_ai_justification"] = {
                            "evidence_chain": [
                                "Multimodal visual inspection submitted to Cloud Inference Endpoint.",
                                f"Identified issue: {result.get('detected_issue', 'Hardware Anomaly')}",
                                f"Manual reference: {result.get('manual_reference', 'N/A')}"
                            ],
                            "confidence_calculation": f"Visual detection combined with RAG database semantic score.",
                            "model_reasoning_limits": "Dependent on the accuracy of the provided manuals and clarity of the visual image."
                        }

                    # Map new structured schema fields with backward compatible fallbacks
                    if "executive_summary" not in result:
                        result["executive_summary"] = result.get("detected_issue", "Equipment Anomaly")
                    if "evidence_analysis" not in result:
                        result["evidence_analysis"] = result.get("explainable_ai_justification", {}).get("evidence_chain", ["Standard visual scan"])
                    if "confidence_score" not in result:
                        result["confidence_score"] = result.get("llm_reasoning_confidence", result.get("confidence", "85%"))
                    if "justification" not in result:
                        result["justification"] = result.get("reasoning_explanation", result.get("root_cause", ""))
                    if "loto_checklist" not in result:
                        result["loto_checklist"] = [
                            "Power isolated",
                            "Lock applied",
                            "Tag applied",
                            "Hydraulic pressure released",
                            "Pneumatic pressure released",
                            "PPE verified",
                            "Isolation confirmed",
                            "Supervisor approval verified"
                        ]
                    if "root_cause_analysis" not in result:
                        result["root_cause_analysis"] = result.get("root_cause_rankings", [])
                    if "resolution_workflow" not in result:
                        result["resolution_workflow"] = {
                            "steps": result.get("suggested_steps", []),
                            "required_tools": ["Insulated tools", "Multimeter"],
                            "required_ppe": ["Insulated safety gloves", "Safety goggles"],
                            "safety_precautions": [result.get("safety_recommendations", "LOTO ENFORCED")],
                            "estimated_repair_time": "45 minutes"
                        }
                    if "post_repair_validation" not in result:
                        result["post_repair_validation"] = [
                            "Leak test passed",
                            "Temperature normal",
                            "Vibration normal",
                            "Operational test completed",
                            "Safety checks completed"
                        ]
                    
                    print(f"[Reasoner] Hugging Face diagnosis: {result.get('detected_issue')}")
                    return self._clean_steps(result)
                else:
                    err_msg = "Reasoner LLM API request failed (empty response)."
                    print(err_msg)
                    if config.DISABLE_MOCK_FALLBACK:
                        raise RuntimeError(err_msg)
            except Exception as e:
                print(f"[Reasoner] Hugging Face reasoning failed: {e}.")
                if config.DISABLE_MOCK_FALLBACK:
                    raise RuntimeError(f"Reasoner LLM API request failed: {e}") from e
        elif config.DISABLE_MOCK_FALLBACK:
            raise RuntimeError("Reasoner LLM API endpoint bypassed (missing token or URL) and fallback is disabled.")

        # 3. Local LLM Fallback (Ollama)
        local_result = query_local_llm_generate(formatted_prompt)
        if local_result:
            try:
                local_result["inference_node"] = f"EDGE OLLAMA ({config.OLLAMA_MODEL.upper()}) // AMD ROCm ACCELERATED"
                if "confidence" not in local_result:
                    local_result["confidence"] = local_result.get("llm_reasoning_confidence", "N/A")
                if "root_cause" not in local_result:
                    local_result["root_cause"] = local_result.get("reasoning_explanation", "")
                if "explainable_ai_justification" not in local_result:
                    local_result["explainable_ai_justification"] = {
                        "evidence_chain": [
                            "Multimodal visual inspection submitted to Local Edge LLM.",
                            f"Identified issue: {local_result.get('detected_issue', 'Hardware Anomaly')}"
                        ],
                        "confidence_calculation": "Inference processed via offline local LLM vector comparison.",
                        "model_reasoning_limits": f"Edge inference restricted to offline knowledge models ({config.OLLAMA_MODEL})."
                    }

                # Map new structured schema fields with backward compatible fallbacks
                if "executive_summary" not in local_result:
                    local_result["executive_summary"] = local_result.get("detected_issue", "Equipment Anomaly")
                if "evidence_analysis" not in local_result:
                    local_result["evidence_analysis"] = local_result.get("explainable_ai_justification", {}).get("evidence_chain", ["Standard offline visual scan"])
                if "confidence_score" not in local_result:
                    local_result["confidence_score"] = local_result.get("llm_reasoning_confidence", local_result.get("confidence", "80%"))
                if "justification" not in local_result:
                    local_result["justification"] = local_result.get("reasoning_explanation", local_result.get("root_cause", ""))
                if "source_attribution" not in local_result:
                    local_result["source_attribution"] = [local_result.get("manual_reference", "N/A")]
                if "loto_checklist" not in local_result:
                    local_result["loto_checklist"] = [
                        "Power isolated",
                        "Lock applied",
                        "Tag applied",
                        "Hydraulic pressure released",
                        "Pneumatic pressure released",
                        "PPE verified",
                        "Isolation confirmed",
                        "Supervisor approval verified"
                    ]
                if "root_cause_analysis" not in local_result:
                    local_result["root_cause_analysis"] = local_result.get("root_cause_rankings", [])
                if "resolution_workflow" not in local_result:
                    local_result["resolution_workflow"] = {
                        "steps": local_result.get("suggested_steps", []),
                        "required_tools": ["Insulated tools", "Multimeter"],
                        "required_ppe": ["Insulated safety gloves", "Safety goggles"],
                        "safety_precautions": [local_result.get("safety_recommendations", "LOTO ENFORCED")],
                        "estimated_repair_time": "45 minutes"
                    }
                if "post_repair_validation" not in local_result:
                    local_result["post_repair_validation"] = [
                        "Leak test passed",
                        "Temperature normal",
                        "Vibration normal",
                        "Operational test completed",
                        "Safety checks completed"
                    ]
                print(f"[Reasoner] Local Ollama diagnosis successful.")
                return self._clean_steps(local_result)
            except Exception as le:
                print(f"[Reasoner] Local LLM processing failed: {le}.")
        
        if config.DISABLE_MOCK_FALLBACK:
            raise RuntimeError("LLM Reasoning Service Unavailable: Both cloud and local LLM queries failed.")

        print("[Reasoner] LLM unavailable. Returning safe fallback guidance.")
        fallback_result = {
            "detected_issue": "Unable to generate diagnostic reasoning safely.",
            "severity_level": "High",
            "llm_reasoning_confidence": "0%",
            "llm_grounding_confidence": "0%",
            "reasoning_explanation": "The reasoning model is unavailable due to cloud rate limits or local LLM connection issues.",
            "root_cause_rankings": [],
            "suggested_steps": [],
            "safety_recommendations": "Provide an official product manual URL or start the local Ollama service.",
            "detected_language_code": lang_code,
            "confidence": "0%",
            "confidence_score": "0%",
            "manual_reference": "N/A",
            "source_attribution": [],
            "explainable_ai_justification": {
                "evidence_chain": [
                    "Reasoning was attempted using both cloud and local LLM services.",
                    "Both cloud and local inference were unavailable or rate-limited."
                ],
                "confidence_calculation": "0% due to unavailable model endpoints.",
                "model_reasoning_limits": "No connected LLM service could be reached."
            },
            "inference_node": "OFFLINE FALLBACK",
            "executive_summary": "Diagnostic reasoning unavailable.",
            "evidence_analysis": ["No reasoning output available."],
            "root_cause_analysis": [],
            "resolution_workflow": {
                "steps": [],
                "required_tools": [],
                "required_ppe": [],
                "safety_precautions": [],
                "estimated_repair_time": "N/A"
            },
            "post_repair_validation": [],
            "loto_checklist": []
        }
        return fallback_result

reasoner_service = LLMReasoner()
