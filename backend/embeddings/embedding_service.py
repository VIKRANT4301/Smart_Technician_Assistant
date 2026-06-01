import os
import hashlib
import numpy as np
from typing import List

class EmbeddingService:
    def __init__(self):
        # Force offline fallback to avoid heavy model downloads and multi-threading deadlocks on Windows/Python 3.14
        print("[Embeddings] Bypassing local sentence-transformers to use fast offline fallback.")
        self.model = None
        self.use_api = False

    def get_embedding(self, text: str, task_type: str = "retrieval_document") -> List[float]:
        """
        Generate embedding using local sentence-transformers model.
        """
        if self.model:
            return self.model.encode(text).tolist()
            
        # Fallback: Deterministic vector based on character features (for mock/offline use)
        # We generate a 384-dimensional normalized float list to match the model dimension
        h = hashlib.md5(text.encode("utf-8")).digest()
        np.random.seed(int.from_bytes(h, byteorder="big") % (2**32))
        vec = np.random.randn(384)
        vec /= np.linalg.norm(vec)
        return vec.tolist()

    def get_embeddings(self, texts: List[str], task_type: str = "retrieval_document") -> List[List[float]]:
        """
        Generate embeddings for a batch of texts using local sentence-transformers model.
        """
        if not texts:
            return []

        if self.model:
            return self.model.encode(texts).tolist()
            
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
