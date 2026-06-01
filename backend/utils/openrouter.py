import urllib.request
import json
import base64
from backend.core.config import config

def query_openrouter(model: str, messages: list, json_response: bool = False) -> str:
    """
    Queries OpenRouter chat completions endpoint.
    """
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {config.GEMINI_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "Smart Technician Assistant"
    }
    payload = {
        "model": model,
        "messages": messages
    }
    if json_response:
        payload["response_format"] = {"type": "json_object"}
        
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        # Set a timeout of 20 seconds
        with urllib.request.urlopen(req, timeout=20.0) as response:
            if response.status == 200:
                resp_text = response.read().decode("utf-8")
                resp_json = json.loads(resp_text)
                return resp_json["choices"][0]["message"]["content"].strip()
            else:
                print(f"[OpenRouter] Request failed with status code {response.status}")
    except Exception as e:
        print(f"[OpenRouter] API request failed: {e}")
    raise Exception("OpenRouter request failed.")
