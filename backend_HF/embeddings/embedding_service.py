import json
import hashlib
import numpy as np
from typing import List
from backend_HF.core.config import config
from backend_HF.utils.hf_client import query_hf_endpoint

FALLBACK_EMBEDDING_DIM = 1024

class EmbeddingService:
    def __init__(self):
        print(f"[Embeddings] Initializing Hugging Face Embedding service targeting: {config.HF_EMBEDDING_URL}")

    def _fallback_embedding(self, text: str, dim: int = FALLBACK_EMBEDDING_DIM) -> List[float]:
        """Generate a deterministic local embedding vector when external APIs are unavailable."""
        if not isinstance(text, str):
            text = str(text or "")

        digest = hashlib.sha512(text.encode("utf-8")).digest()
        seed = int.from_bytes(digest[:8], "little", signed=False)
        vector = np.empty(dim, dtype=np.float32)

        for i in range(dim):
            seed ^= (seed << 13) & ((1 << 64) - 1)
            seed ^= seed >> 7
            seed ^= (seed << 17) & ((1 << 64) - 1)
            value = ((seed & 0xFFFFFFFF) / 0xFFFFFFFF) * 2.0 - 1.0
            vector[i] = value

        norm = np.linalg.norm(vector)
        if norm > 0:
            vector /= norm

        return vector.tolist()

    def get_embedding(self, text: str, task_type: str = "retrieval_document") -> List[float]:
        """
        Generate embedding using Hugging Face Inference Endpoint.
        Falls back to deterministic offline vectors if the API call fails or is unconfigured.
        """
        is_huggingface = "api-inference.huggingface.co" in config.HF_EMBEDDING_URL if config.HF_EMBEDDING_URL else True
        if config.HF_EMBEDDING_URL and (config.HF_TOKEN or not is_huggingface):
            try:
                payload = {"inputs": text}
                resp = query_hf_endpoint(config.HF_EMBEDDING_URL, payload, timeout=10.0)
                if resp:
                    if isinstance(resp, list) and len(resp) > 0:
                        if isinstance(resp[0], float):
                            return resp
                        elif isinstance(resp[0], list):
                            return resp[0]
                    err_msg = f"[Embeddings] Unexpected format from Hugging Face API: {resp}."
                    print(err_msg)
                else:
                    print("[Embeddings] Hugging Face embedding returned empty response.")
            except Exception as exc:
                print(f"[Embeddings] External embedding failed: {exc}")

        print("[Embeddings] Falling back to deterministic local embedding.")
        return self._fallback_embedding(text)

    def get_embeddings(self, texts: List[str], task_type: str = "retrieval_document") -> List[List[float]]:
        """
        Generate embeddings for a batch of texts using Hugging Face Inference Endpoint.
        Falls back to deterministic local vectors if the batch request fails.
        """
        if not texts:
            return []

        is_huggingface = "api-inference.huggingface.co" in config.HF_EMBEDDING_URL if config.HF_EMBEDDING_URL else True
        if config.HF_EMBEDDING_URL and (config.HF_TOKEN or not is_huggingface):
            try:
                payload = {"inputs": texts}
                resp = query_hf_endpoint(config.HF_EMBEDDING_URL, payload, timeout=15.0)
                if resp and isinstance(resp, list) and len(resp) == len(texts):
                    processed_embeddings = []
                    for item in resp:
                        if isinstance(item, list) and item and isinstance(item[0], float):
                            processed_embeddings.append(item)
                        else:
                            processed_embeddings = []
                            break
                    if len(processed_embeddings) == len(texts):
                        return processed_embeddings
                    print("[Embeddings] Batch API returned incompatible format.")
                else:
                    print("[Embeddings] Batch embedding API returned empty or mismatched response.")
            except Exception as exc:
                print(f"[Embeddings] External batch embedding failed: {exc}")

        print("[Embeddings] Falling back to deterministic local embeddings for batch.")
        return [self._fallback_embedding(text) for text in texts]

embedding_service = EmbeddingService()
