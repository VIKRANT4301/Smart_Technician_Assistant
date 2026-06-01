import json
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from backend.core.config import config

def query_local_llm_generate(prompt: str) -> Optional[Dict[str, Any]]:
    """
    Query local Ollama runner using /api/generate in JSON format using urllib.
    """
    url = f"{config.OLLAMA_BASE_URL}/api/generate"
    try:
        payload = {
            "model": config.OLLAMA_MODEL,
            "prompt": prompt,
            "format": "json",
            "stream": False
        }
        
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, 
            data=data, 
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        
        print(f"[Local LLM] Requesting completion from Ollama ({config.OLLAMA_MODEL}) at {url}...")
        # Set a timeout of 8 seconds
        with urllib.request.urlopen(req, timeout=8.0) as response:
            if response.status == 200:
                resp_text = response.read().decode("utf-8")
                resp_json = json.loads(resp_text)
                response_text = resp_json.get("response", "").strip()
                result = json.loads(response_text)
                return result
            else:
                print(f"[Local LLM] Ollama returned status code {response.status}")
    except urllib.error.URLError as e:
        print(f"[Local LLM] Ollama connection failed (URLError): {e}. Verify Ollama is running.")
    except Exception as e:
        print(f"[Local LLM] Ollama generate request failed: {e}")
    return None

def query_local_llm_chat(messages: List[Dict[str, Any]]) -> Optional[str]:
    """
    Query local Ollama runner using /api/chat with a list of messages.
    """
    url = f"{config.OLLAMA_BASE_URL}/api/chat"
    try:
        # Convert messages from Gemini parts structure to standard Ollama structure
        ollama_messages = []
        for msg in messages:
            content = msg["parts"][0]
            role = "user" if msg["role"] == "user" else "assistant"
            # Detect system instruction prefix
            if "You are an expert conversational AI diagnostic assistant" in content:
                role = "system"
            ollama_messages.append({"role": role, "content": content})
            
        payload = {
            "model": config.OLLAMA_MODEL,
            "messages": ollama_messages,
            "stream": False
        }
        
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, 
            data=data, 
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        
        print(f"[Local LLM] Requesting chat completion from Ollama ({config.OLLAMA_MODEL}) at {url}...")
        with urllib.request.urlopen(req, timeout=8.0) as response:
            if response.status == 200:
                resp_text = response.read().decode("utf-8")
                resp_json = json.loads(resp_text)
                response_text = resp_json.get("message", {}).get("content", "").strip()
                return response_text
            else:
                print(f"[Local LLM] Ollama chat returned status code {response.status}")
    except urllib.error.URLError as e:
        print(f"[Local LLM] Ollama chat connection failed (URLError): {e}. Verify Ollama is running.")
    except Exception as e:
        print(f"[Local LLM] Ollama chat request failed: {e}")
    return None
