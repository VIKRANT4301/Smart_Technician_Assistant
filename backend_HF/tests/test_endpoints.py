import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend_HF.main import app
from backend_HF.core.config import config

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "online"
    assert "service" in response.json()

def test_get_config():
    response = client.get("/config")
    assert response.status_code == 200
    data = response.json()
    assert "ollama_base_url" in data
    assert "ollama_model" in data

def test_post_config():
    payload = {
        "ollama_base_url": "http://localhost:11434",
        "ollama_model": "llama3"
    }
    response = client.post("/config", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    # Verify values were updated in config
    assert config.OLLAMA_BASE_URL == "http://localhost:11434"
    assert config.OLLAMA_MODEL == "llama3"

def test_analyze_empty_payload():
    mock_response = {
        "detected_issue": "Loose cable connection near terminal block 4",
        "severity_level": "Medium",
        "llm_reasoning_confidence": "70%",
        "llm_grounding_confidence": "80%",
        "reasoning_explanation": "Test explanation.",
        "root_cause_rankings": [
            {"cause": "Loose cable connection", "probability": "80%"}
        ],
        "suggested_steps": ["Step 1", "Step 2"],
        "safety_recommendations": "Isolate power.",
        "detected_language_code": "en",
        "inference_node": "MOCK NODE"
    }
    
    mock_rag_hits = [
        ({
            "source_file": "hvac_compressor_manual.txt",
            "text": "TROUBLESHOOTING GUIDE - HVAC Compressor Overheating. Causes: Blocked condenser coils, low refrigerant."
        }, 1.0)
    ]
    
    # Mock the LLM Reasoning Service call and RAG search to prevent network/Ollama dependency
    with patch("backend_HF.api.analyze.reasoner_service.generate_guidance", return_value=mock_response), \
         patch("backend_HF.api.analyze.vector_store.search", return_value=mock_rag_hits):
        response = client.post("/analyze", data={})
        assert response.status_code == 200
        data = response.json()
        assert data["detected_issue"] == "Loose cable connection near terminal block 4"
        assert data["confidence_score"] is not None
        assert "loto_checklist" in data
        assert "resolution_workflow" in data
