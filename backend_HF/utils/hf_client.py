import json
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, Union
from backend_HF.core.config import config

def query_hf_endpoint(
    url: str, 
    payload: Union[Dict[str, Any], list], 
    timeout: float = 25.0,
    headers_override: Optional[Dict[str, str]] = None
) -> Optional[Union[Dict[str, Any], list, str]]:
    """
    Sends a POST request to a Hugging Face Serverless or Dedicated Inference Endpoint.
    Uses standard urllib.request.
    """
    is_openrouter = bool(config.HF_TOKEN and config.HF_TOKEN.startswith("sk-or-v1-"))
    
    # If using OpenRouter, redirect chat/vision/reasoning queries to OpenRouter endpoint
    if is_openrouter and ("Qwen" in str(url) or "models/Qwen" in str(url) or "openrouter" in str(url)):
        url = "https://openrouter.ai/api/v1/chat/completions"
        if isinstance(payload, dict) and "model" in payload:
            model = payload["model"]
            if "Qwen2-VL" in model or "qwen2-vl" in model.lower():
                payload["model"] = "google/gemini-2.5-flash"
                payload["response_format"] = {"type": "json_object"}
            elif "Qwen2.5" in model or "qwen2.5" in model.lower():
                payload["model"] = "google/gemini-2.5-pro"
            if "max_tokens" not in payload:
                payload["max_tokens"] = 2048

    is_huggingface_url = "api-inference.huggingface.co" in url
    if is_huggingface_url and not config.HF_TOKEN and not is_openrouter:
        print("[HF Client] Bypassing endpoint query: HF_TOKEN is not set.")
        return None

    headers = {
        "Content-Type": "application/json"
    }
    if config.HF_TOKEN:
        if is_openrouter:
            # Send Auth token only to OpenRouter, not Hugging Face anonymous endpoints (like embeddings)
            if "openrouter.ai" in url:
                headers["Authorization"] = f"Bearer {config.HF_TOKEN}"
                headers["HTTP-Referer"] = "http://localhost:8000"
                headers["X-Title"] = "Smart Technician Assistant"
        else:
            headers["Authorization"] = f"Bearer {config.HF_TOKEN}"
    if headers_override:
        headers.update(headers_override)

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status == 200:
                resp_bytes = response.read()
                resp_text = resp_bytes.decode("utf-8")
                try:
                    return json.loads(resp_text)
                except json.JSONDecodeError:
                    return resp_text
            else:
                print(f"[HF Client] Request failed with status code {response.status}")
    except urllib.error.HTTPError as e:
        resp_err = ""
        try:
            resp_err = e.read().decode("utf-8")
        except Exception:
            pass
        print(f"[HF Client] HTTP Error {e.code}: {e.reason}. Detail: {resp_err}")
    except urllib.error.URLError as e:
        print(f"[HF Client] Network Connection Error: {e.reason}")
    except Exception as e:
        print(f"[HF Client] Query failed: {e}")
    return None
