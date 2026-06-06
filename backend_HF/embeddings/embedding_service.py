import json
import hashlib
import numpy as np
from typing import List
from backend_HF.core.config import config
from backend_HF.utils.hf_client import query_hf_endpoint

class EmbeddingService:
    def __init__(self):
        print(f"[Embeddings] Initializing Hugging Face Embedding service targeting: {config.HF_EMBEDDING_URL}")

    def get_embedding(self, text: str, task_type: str = "retrieval_document") -> List[float]:
        """
        Generate embedding using Hugging Face Inference Endpoint.
        Falls back to deterministic offline vectors if the API call fails or is unconfigured.
        """
        is_huggingface = "api-inference.huggingface.co" in config.HF_EMBEDDING_URL if config.HF_EMBEDDING_URL else True
        if config.HF_EMBEDDING_URL and (config.HF_TOKEN or not is_huggingface):
            # Hugging Face TEI / model endpoints expect {"inputs": "text"}
            payload = {"inputs": text}
            # Add options for specific models if needed (BGE-M3 handles tasks via prompt templates or parameters)
            resp = query_hf_endpoint(config.HF_EMBEDDING_URL, payload, timeout=10.0)
            if resp:
                # If output is a list of floats (direct vector representation)
                if isinstance(resp, list) and len(resp) > 0:
                    if isinstance(resp[0], float):
                        return resp
                    elif isinstance(resp[0], list): # sometimes returns a nested batch representation
                        return resp[0]
                err_msg = f"[Embeddings] Unexpected format from Hugging Face API: {resp}."
                print(err_msg)
                if config.DISABLE_MOCK_FALLBACK:
                    raise RuntimeError(err_msg)
            elif config.DISABLE_MOCK_FALLBACK:
                raise RuntimeError("Embedding API request failed (empty response).")
        elif config.DISABLE_MOCK_FALLBACK:
            raise RuntimeError("Embedding API endpoint bypassed (missing token or URL) and fallback is disabled.")

        # Fallback: Deterministic vector based on character features (matching size 384)
        h = hashlib.md5(text.encode("utf-8")).digest()
        np.random.seed(int.from_bytes(h, byteorder="big") % (2**32))
        vec = np.random.randn(384)
        vec /= np.linalg.norm(vec)
        return vec.tolist()

    def get_embeddings(self, texts: List[str], task_type: str = "retrieval_document") -> List[List[float]]:
        """
        Generate embeddings for a batch of texts using Hugging Face Inference Endpoint.
        """
        if not texts:
            return []

        is_huggingface = "api-inference.huggingface.co" in config.HF_EMBEDDING_URL if config.HF_EMBEDDING_URL else True
        if config.HF_EMBEDDING_URL and (config.HF_TOKEN or not is_huggingface):
            payload = {"inputs": texts}
            resp = query_hf_endpoint(config.HF_EMBEDDING_URL, payload, timeout=15.0)
            if resp and isinstance(resp, list):
                # Ensure it returns a list of float lists
                if len(resp) == len(texts):
                    processed_embeddings = []
                    for item in resp:
                        if isinstance(item, list) and isinstance(item[0], float):
                            processed_embeddings.append(item)
                        else:
                            break
                    if len(processed_embeddings) == len(texts):
                        return processed_embeddings
                err_msg = "[Embeddings] Batch API returned incompatible format."
                print(err_msg)
                if config.DISABLE_MOCK_FALLBACK:
                    raise RuntimeError(err_msg)
            elif config.DISABLE_MOCK_FALLBACK:
                raise RuntimeError("Batch Embedding API request failed (empty response).")
        elif config.DISABLE_MOCK_FALLBACK:
            raise RuntimeError("Batch Embedding API endpoint bypassed (missing token or URL) and fallback is disabled.")

        # Fallback for batch
        results = []
        for text in texts:
            h = hashlib.md5(text.encode("utf-8")).digest()
            np.random.seed(int.from_bytes(h, byteorder="big") % (2**32))
            vec = np.random.randn(384)
            vec /= np.linalg.norm(vec)
            results.append(vec.tolist())
        return results

embedding_service = EmbeddingService()
