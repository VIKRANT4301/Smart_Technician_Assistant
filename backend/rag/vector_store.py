import json
import sqlite3
import numpy as np
import math
import re
from typing import List, Dict, Any, Tuple
from backend.core.config import config
from backend.embeddings.embedding_service import embedding_service

def tokenize(text: str) -> List[str]:
    """
    Split text into lowercase alphanumeric word tokens.
    """
    return re.findall(r'[a-zA-Z0-9]+', text.lower())

class BM25:
    def __init__(self, corpus: List[Dict[str, Any]], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus = corpus
        self.doc_len = [len(tokenize(doc['text'])) for doc in corpus]
        self.avg_doc_len = sum(self.doc_len) / len(self.doc_len) if corpus else 0
        self.doc_count = len(corpus)
        self.df = self._calc_df()
        self.idf = self._calc_idf()

    def _calc_df(self) -> Dict[str, int]:
        df = {}
        for doc in self.corpus:
            words = set(tokenize(doc['text']))
            for word in words:
                df[word] = df.get(word, 0) + 1
        return df

    def _calc_idf(self) -> Dict[str, float]:
        idf = {}
        for word, df in self.df.items():
            # BM25 IDF with smoothing
            idf[word] = math.log((self.doc_count - df + 0.5) / (df + 0.5) + 1.0)
        return idf

    def get_score(self, query_tokens: List[str], doc_idx: int) -> float:
        score = 0.0
        doc_words = tokenize(self.corpus[doc_idx]['text'])
        word_counts = {}
        for word in doc_words:
            word_counts[word] = word_counts.get(word, 0) + 1
        
        Ld = self.doc_len[doc_idx]
        
        for token in query_tokens:
            if token not in self.idf:
                continue
            f = word_counts.get(token, 0)
            numerator = self.idf[token] * f * (self.k1 + 1)
            denominator = f + self.k1 * (1 - self.b + self.b * (Ld / self.avg_doc_len))
            score += numerator / denominator
        return score

def reciprocal_rank_fusion(
    vector_rankings: List[Dict[str, Any]], 
    bm25_rankings: List[Dict[str, Any]], 
    k: int = 60
) -> List[Tuple[Dict[str, Any], float]]:
    """
    Combines ranks from Vector Search and BM25 Search.
    """
    rrf_scores = {}
    
    # Process vector rankings
    for rank, doc in enumerate(vector_rankings):
        doc_id = doc["id"]
        if doc_id not in rrf_scores:
            rrf_scores[doc_id] = {"doc": doc, "score": 0.0}
        rrf_scores[doc_id]["score"] += 1.0 / (k + rank + 1)
        
    # Process BM25 rankings
    for rank, doc in enumerate(bm25_rankings):
        doc_id = doc["id"]
        if doc_id not in rrf_scores:
            rrf_scores[doc_id] = {"doc": doc, "score": 0.0}
        rrf_scores[doc_id]["score"] += 1.0 / (k + rank + 1)
        
    # Sort docs descending by fused RRF score
    sorted_docs = sorted(rrf_scores.values(), key=lambda x: x["score"], reverse=True)
    return [(item["doc"], item["score"]) for item in sorted_docs]

class VectorStore:
    def __init__(self):
        self.db_path = config.DATABASE_URL.replace("sqlite:///", "")
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT NOT NULL,
                    source_file TEXT NOT NULL,
                    category TEXT,
                    embedding TEXT NOT NULL -- JSON representation of float list
                )
            """)
            conn.commit()

    def add_chunks(self, chunks: List[Dict[str, Any]], batch_size: int = 100):
        """
        Expects a list of dictionaries with keys: 'text', 'source_file', 'category'
        """
        if not chunks:
            return

        with self._get_connection() as conn:
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i + batch_size]
                texts = [chunk["text"] for chunk in batch]
                
                embeddings = embedding_service.get_embeddings(texts, task_type="retrieval_document")
                
                for chunk, embedding in zip(batch, embeddings):
                    text = chunk["text"]
                    source_file = chunk["source_file"]
                    category = chunk.get("category", "")
                    
                    conn.execute(
                        """
                        INSERT INTO document_chunks (text, source_file, category, embedding)
                        VALUES (?, ?, ?, ?)
                        """,
                        (text, source_file, category, json.dumps(embedding))
                    )
            conn.commit()
            print(f"[RAG] Successfully indexed {len(chunks)} document chunks.")

    def search(self, query: str, top_k: int = 3, allowed_files: List[str] = None) -> List[Tuple[Dict[str, Any], float]]:
        """
        Perform hybrid search using BM25 and Cosine Vector similarity, fused via Reciprocal Rank Fusion (RRF).
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, text, source_file, category, embedding FROM document_chunks")
            rows = cursor.fetchall()
            
        if not rows:
            return []
            
        # Parse database rows to corpus dictionary list
        corpus = []
        for row in rows:
            if allowed_files is not None and row["source_file"] not in allowed_files:
                continue
            corpus.append({
                "id": row["id"],
                "text": row["text"],
                "source_file": row["source_file"],
                "category": row["category"],
                "embedding": row["embedding"]
            })
            
        # 1. Cosine Vector Similarity Reranking
        has_vector = True
        try:
            query_embedding = np.array(embedding_service.get_embedding(query, task_type="retrieval_query"))
        except Exception as e:
            print(f"[RAG Hybrid] Embedding generation failed: {e}. Vector search bypassed.")
            has_vector = False
            
        vector_results = []
        if has_vector:
            for doc in corpus:
                chunk_embedding = np.array(json.loads(doc["embedding"]))
                dot_product = np.dot(query_embedding, chunk_embedding)
                norm_q = np.linalg.norm(query_embedding)
                norm_c = np.linalg.norm(chunk_embedding)
                
                similarity = float(dot_product / (norm_q * norm_c)) if (norm_q > 0 and norm_c > 0) else 0.0
                vector_results.append((doc, similarity))
            
            # Sort by vector similarity descending
            vector_results.sort(key=lambda x: x[1], reverse=True)
            
        # 2. BM25 Search Reranking
        query_tokens = tokenize(query)
        bm25_model = BM25(corpus)
        
        bm25_results = []
        for i, doc in enumerate(corpus):
            score = bm25_model.get_score(query_tokens, i)
            bm25_results.append((doc, score))
            
        # Sort by BM25 score descending
        bm25_results.sort(key=lambda x: x[1], reverse=True)
        
        # 3. Reciprocal Rank Fusion
        vector_docs = [item[0] for item in vector_results]
        bm25_docs = [item[0] for item in bm25_results]
        
        fused_results = reciprocal_rank_fusion(vector_docs, bm25_docs)
        
        # 4. Clean output format to Tuple[Dict[str, Any], float]
        cleaned_results = []
        for doc, score in fused_results:
            doc_cleaned = {
                "id": doc["id"],
                "text": doc["text"],
                "source_file": doc["source_file"],
                "category": doc["category"]
            }
            cleaned_results.append((doc_cleaned, score))
            
        return cleaned_results[:top_k]

    def clear_database(self):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM document_chunks")
            conn.commit()

vector_store = VectorStore()
