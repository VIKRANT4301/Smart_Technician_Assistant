import json
import sqlite3
import numpy as np
import math
import re
import os
from typing import List, Dict, Any, Tuple
from backend_HF.core.config import config
from backend_HF.embeddings.embedding_service import embedding_service

# Optional imports for external Vector Database scaling
try:
    from qdrant_client import QdrantClient
    from qdrant_client.http.models import Distance, PointStruct, VectorParams
    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False

try:
    from pymilvus import connections, FieldSchema, CollectionSchema, DataType, Collection
    MILVUS_AVAILABLE = True
except ImportError:
    MILVUS_AVAILABLE = False

# Standard English Stop Words to filter non-informative query tokens and optimize search relevance
STOP_WORDS = {
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours",
    "he", "him", "his", "she", "her", "it", "its", "they", "them", "their", "what",
    "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was",
    "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did",
    "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", "while",
    "of", "at", "by", "for", "with", "about", "against", "between", "into", "through",
    "during", "before", "after", "above", "below", "to", "from", "up", "down", "in",
    "out", "on", "off", "over", "under", "again", "further", "then", "once", "here",
    "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so",
    "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now"
}

def tokenize(text: str) -> List[str]:
    """
    Split text into lowercase alphanumeric word tokens, filtering out stop words.
    """
    words = re.findall(r'[a-zA-Z0-9]+', text.lower())
    return [w for w in words if w not in STOP_WORDS]

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
        # Dynamically resolve db_path to handle different startup locations
        db_url_path = config.DATABASE_URL.replace("sqlite:///", "")
        if os.path.isabs(db_url_path):
            self.db_path = db_url_path
        else:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            root_dir = os.path.dirname(os.path.dirname(current_dir))
            self.db_path = os.path.join(root_dir, db_url_path)
            
        self._init_db()
        self._init_external_clients()

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
                    embedding TEXT NOT NULL
                )
            """)
            conn.commit()

    def _init_external_clients(self):
        self.qdrant_host = os.getenv("QDRANT_HOST")
        self.qdrant_api_key = os.getenv("QDRANT_API_KEY", "")
        self.qdrant_collection = os.getenv("QDRANT_COLLECTION", "technician_manuals")
        
        self.milvus_uri = os.getenv("MILVUS_URI")
        self.milvus_token = os.getenv("MILVUS_TOKEN", "")
        self.milvus_collection = os.getenv("MILVUS_COLLECTION", "technician_manuals")
        
        self.qdrant_client = None
        if QDRANT_AVAILABLE and self.qdrant_host:
            try:
                self.qdrant_client = QdrantClient(host=self.qdrant_host, api_key=self.qdrant_api_key)
                self.qdrant_client.recreate_collection(
                    collection_name=self.qdrant_collection,
                    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
                )
                print(f"[RAG Vector DB] Connected to Qdrant collection: {self.qdrant_collection}")
            except Exception as e:
                print(f"[RAG Vector DB] Qdrant connection skipped: {e}")
                self.qdrant_client = None

        self.milvus_collection_obj = None
        if MILVUS_AVAILABLE and self.milvus_uri:
            try:
                connections.connect("default", uri=self.milvus_uri, token=self.milvus_token)
                from pymilvus import utility
                # Define simple collection schema if not existing
                fields = [
                    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
                    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),
                    FieldSchema(name="source_file", dtype=DataType.VARCHAR, max_length=255),
                    FieldSchema(name="category", dtype=DataType.VARCHAR, max_length=255),
                    FieldSchema(name="vector", dtype=DataType.FLOAT_VECTOR, dim=1024)
                ]
                schema = CollectionSchema(fields, "Manual chunks collection")
                self.milvus_collection_obj = Collection(self.milvus_collection, schema)
                
                # Check index
                if not self.milvus_collection_obj.has_index():
                    index_params = {
                        "metric_type": "COSINE",
                        "index_type": "IVF_FLAT",
                        "params": {"nlist": 128}
                    }
                    self.milvus_collection_obj.create_index("vector", index_params)
                self.milvus_collection_obj.load()
                print(f"[RAG Vector DB] Connected to Milvus collection: {self.milvus_collection}")
            except Exception as e:
                print(f"[RAG Vector DB] Milvus connection skipped: {e}")
                self.milvus_collection_obj = None

    def add_chunks(self, chunks: List[Dict[str, Any]], batch_size: int = 100):
        if not chunks:
            return

        qdrant_points = []
        milvus_data = {"texts": [], "sources": [], "categories": [], "vectors": []}

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
                    
                    if self.qdrant_client:
                        qdrant_points.append(
                            PointStruct(
                                id=len(qdrant_points) + 1,
                                vector=embedding,
                                payload={"text": text, "source_file": source_file, "category": category}
                            )
                        )
                    if self.milvus_collection_obj:
                        milvus_data["texts"].append(text)
                        milvus_data["sources"].append(source_file)
                        milvus_data["categories"].append(category)
                        milvus_data["vectors"].append(embedding)

            conn.commit()

        if self.qdrant_client and qdrant_points:
            try:
                self.qdrant_client.upsert(collection_name=self.qdrant_collection, points=qdrant_points)
                print(f"[RAG Vector DB] Upserted {len(qdrant_points)} points to Qdrant.")
            except Exception as e:
                print(f"[RAG Vector DB] Qdrant upsert error: {e}")
        if self.milvus_collection_obj and milvus_data["texts"]:
            try:
                self.milvus_collection_obj.insert([
                    milvus_data["texts"],
                    milvus_data["sources"],
                    milvus_data["categories"],
                    milvus_data["vectors"]
                ])
                print(f"[RAG Vector DB] Inserted {len(milvus_data['texts'])} elements into Milvus.")
            except Exception as e:
                print(f"[RAG Vector DB] Milvus insert error: {e}")

        print(f"[RAG] Successfully indexed {len(chunks)} document chunks.")

    def search(self, query: str, top_k: int = 3, allowed_files: List[str] = None) -> List[Tuple[Dict[str, Any], float]]:
        # 1. Check external Vector DB search if active
        if self.qdrant_client:
            try:
                query_embedding = embedding_service.get_embedding(query, task_type="retrieval_query")
                qdrant_filter = None
                if allowed_files is not None:
                    from qdrant_client.http.models import Filter, FieldCondition, MatchValue
                    qdrant_filter = Filter(
                        must=[
                            FieldCondition(key="source_file", match=MatchValue(value=f)) 
                            for f in allowed_files
                        ]
                    )
                hits = self.qdrant_client.search(
                    collection_name=self.qdrant_collection,
                    query_vector=query_embedding,
                    query_filter=qdrant_filter,
                    limit=top_k
                )
                return [
                    ({
                        "id": hit.id,
                        "text": hit.payload["text"],
                        "source_file": hit.payload["source_file"],
                        "category": hit.payload["category"]
                    }, hit.score)
                    for hit in hits
                ]
            except Exception as e:
                print(f"[RAG Vector DB] Qdrant search bypassed: {e}")

        if self.milvus_collection_obj:
            try:
                query_embedding = embedding_service.get_embedding(query, task_type="retrieval_query")
                expr = None
                if allowed_files is not None:
                    files_str = ", ".join([f"'{f}'" for f in allowed_files])
                    expr = f"source_file in [{files_str}]"
                search_params = {"metric_type": "COSINE", "params": {"nprobe": 10}}
                hits = self.milvus_collection_obj.search(
                    data=[query_embedding],
                    anns_field="vector",
                    param=search_params,
                    limit=top_k,
                    expr=expr,
                    output_fields=["text", "source_file", "category"]
                )
                return [
                    ({
                        "id": hit.id,
                        "text": hit.entity.get("text"),
                        "source_file": hit.entity.get("source_file"),
                        "category": hit.entity.get("category")
                    }, hit.score)
                    for hit in hits[0]
                ]
            except Exception as e:
                print(f"[RAG Vector DB] Milvus search bypassed: {e}")

        # 2. Local SQLite + NumPy Fallback Search
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, text, source_file, category, embedding FROM document_chunks")
            rows = cursor.fetchall()
            
        if not rows:
            return []
            
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
            
            vector_results.sort(key=lambda x: x[1], reverse=True)
            
        query_tokens = tokenize(query)
        bm25_model = BM25(corpus)
        
        bm25_results = []
        for i, doc in enumerate(corpus):
            score = bm25_model.get_score(query_tokens, i)
            bm25_results.append((doc, score))
            
        bm25_results.sort(key=lambda x: x[1], reverse=True)
        
        vector_docs = [item[0] for item in vector_results]
        bm25_docs = [item[0] for item in bm25_results]
        
        fused_results = reciprocal_rank_fusion(vector_docs, bm25_docs)
        
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
        if self.qdrant_client:
            try:
                self.qdrant_client.delete(collection_name=self.qdrant_collection, points_selector=None)
            except Exception as e:
                print(f"[RAG Vector DB] Qdrant clear error: {e}")
        if self.milvus_collection_obj:
            try:
                self.milvus_collection_obj.delete("id >= 0")
            except Exception as e:
                print(f"[RAG Vector DB] Milvus clear error: {e}")

        with self._get_connection() as conn:
            conn.execute("DELETE FROM document_chunks")
            conn.commit()

vector_store = VectorStore()
