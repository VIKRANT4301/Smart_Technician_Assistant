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

    def _openrouter_text_model() -> str:
        return config.OPENROUTER_TEXT_MODEL or "gpt-4o-mini"

    def _openrouter_vision_model() -> str:
        return config.OPENROUTER_VISION_MODEL or config.OPENROUTER_TEXT_MODEL or "gpt-4o-mini"

    # If using OpenRouter, redirect chat/vision/reasoning queries to OpenRouter endpoint
    if is_openrouter and ("Qwen" in str(url) or "models/Qwen" in str(url) or "openrouter" in str(url)):
        url = "https://openrouter.ai/api/v1/chat/completions"
        if isinstance(payload, dict) and "model" in payload:
            model = payload["model"]
            if "Qwen2-VL" in model or "qwen2-vl" in model.lower():
                payload["model"] = _openrouter_vision_model()
                payload["response_format"] = {"type": "json_object"}
            else:
                payload["model"] = _openrouter_text_model()
            if "max_tokens" not in payload:
                payload["max_tokens"] = config.MAX_LLM_TOKENS

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

    max_retries = 3
    retry_delay = 2.0

    for attempt in range(max_retries):
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
            print(f"[HF Client] HTTP Error {e.code}: {e.reason} (Attempt {attempt+1}/{max_retries}). Detail: {resp_err}")
            
            if attempt < max_retries - 1:
                import time
                retry_after = e.headers.get("Retry-After")
                sleep_time = float(retry_after) if retry_after and retry_after.isdigit() else (retry_delay * (2 ** attempt))

                current_model = None
                if isinstance(payload, dict) and "model" in payload:
                    current_model = payload["model"]

                # Retry the same OpenRouter model for transient rate limiting only.
                if e.code == 429 and current_model:
                    print(f"[HF Client] Retrying same model {current_model} in {sleep_time} seconds...")
                    time.sleep(sleep_time)
                    continue

                # Do not rotate vision/image models to unsupported free text models.
                if e.code == 404 and is_openrouter and current_model and "image" in str(payload).lower():
                    print(f"[HF Client] OpenRouter model {current_model} likely does not support image input. Aborting model rotation.")
                    break

                if e.code == 429:
                    print(f"[HF Client] Retrying in {sleep_time} seconds...")
                    time.sleep(sleep_time)
                    continue
            break
        except urllib.error.URLError as e:
            print(f"[HF Client] Network Connection Error: {e.reason} (Attempt {attempt+1}/{max_retries})")
            if attempt < max_retries - 1:
                import time
                time.sleep(retry_delay)
                continue
            break
        except Exception as e:
            print(f"[HF Client] Query failed: {e} (Attempt {attempt+1}/{max_retries})")
            if attempt < max_retries - 1:
                import time
                time.sleep(retry_delay)
                continue
            break
    return None
