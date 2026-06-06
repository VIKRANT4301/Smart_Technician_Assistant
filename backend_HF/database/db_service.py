import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend_HF.core.config import config

# Optional Redis client for fast mobile session state caching
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

class Database:
    def __init__(self):
        self.db_path = config.DATABASE_URL.replace("sqlite:///", "")
        if not os.path.isabs(self.db_path):
            current_dir = os.path.dirname(os.path.abspath(__file__))
            root_dir = os.path.dirname(os.path.dirname(current_dir))
            self.db_path = os.path.join(root_dir, self.db_path)
            
        self._init_db()
        self._init_supabase()
        self._init_redis()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            # Product database linking models to manuals
            conn.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_name TEXT NOT NULL,
                    manufacturer TEXT NOT NULL,
                    model_number TEXT NOT NULL UNIQUE,
                    manual_filename TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL
                )
            """)

            # Inspection history for standard maintenance logging
            conn.execute("""
                CREATE TABLE IF NOT EXISTS inspection_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    image_path TEXT,
                    detected_issue TEXT NOT NULL,
                    confidence TEXT NOT NULL,
                    root_cause TEXT NOT NULL,
                    suggested_steps TEXT NOT NULL,
                    safety_recommendations TEXT NOT NULL,
                    audio_url TEXT,
                    query_text TEXT,
                    inference_node TEXT
                )
            """)
            
            # Active troubleshooting sessions for feedback loops and memory
            conn.execute("""
                CREATE TABLE IF NOT EXISTS troubleshooting_sessions (
                    session_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    detected_issue TEXT,
                    severity_level TEXT,
                    confidence_score TEXT,
                    root_cause_rankings TEXT,
                    suggested_steps TEXT,
                    safety_recommendations TEXT,
                    failed_steps TEXT,
                    image_url TEXT,
                    query_text TEXT,
                    inference_node TEXT
                )
            """)

            # Feedback history tracking for scoring formulas and AI refinement
            conn.execute("""
                CREATE TABLE IF NOT EXISTS feedback_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    user_issue TEXT,
                    suggested_repair TEXT,
                    was_successful INTEGER,
                    repair_duration INTEGER,
                    user_rating INTEGER,
                    timestamp TEXT NOT NULL
                )
            """)
            
            try:
                conn.execute("ALTER TABLE inspection_history ADD COLUMN inference_node TEXT")
            except sqlite3.OperationalError:
                pass
                
            try:
                conn.execute("ALTER TABLE troubleshooting_sessions ADD COLUMN inference_node TEXT")
            except sqlite3.OperationalError:
                pass
                
            conn.commit()
        self.init_products()

    def _init_supabase(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_KEY")
        self.supabase_client = None
        if self.supabase_url and self.supabase_key:
            try:
                from supabase import create_client
                self.supabase_client = create_client(self.supabase_url, self.supabase_key)
                print("[Database] Connected to Supabase DB sync node.")
            except Exception as e:
                print(f"[Database] Supabase DB sync bypass: {e}")

    def _init_redis(self):
        self.redis_url = os.getenv("REDIS_URL")
        self.redis_client = None
        if REDIS_AVAILABLE and self.redis_url:
            try:
                self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
                print("[Database] Connected to Redis Cache Node.")
            except Exception as e:
                print(f"[Database] Redis Cache bypass: {e}")

    def init_products(self):
        default_products = [
            ("HVAC Compressor AC-X200", "Samsung", "AC-X200", "hvac_compressor_manual.txt", "Samsung HVAC Compressor System", datetime.now().isoformat()),
            ("Centrifugal Pump CP-100", "Centrifugal Pumps", "CP-100", "industrial_pump_leak_guide.txt", "Centrifugal Pump Unit CP-100 to CP-500", datetime.now().isoformat()),
            ("Electrical Control Cabinet SOP-ELEC-04", "Standard", "SOP-ELEC-04", "electrical_safety_sop.txt", "Standard Operating Procedure Electrical Control", datetime.now().isoformat())
        ]
        with self._get_connection() as conn:
            for p in default_products:
                conn.execute("""
                    INSERT OR IGNORE INTO products (product_name, manufacturer, model_number, manual_filename, description, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, p)
            conn.commit()

    def get_product_by_model(self, model: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM products WHERE LOWER(model_number) = LOWER(?) OR LOWER(?) LIKE '%' || LOWER(model_number) || '%'", (model, model))
            row = cursor.fetchone()
            return dict(row) if row else None

    def add_product(self, product: Dict[str, Any]) -> int:
        payload = {
            "product_name": product["product_name"],
            "manufacturer": product["manufacturer"],
            "model_number": product["model_number"],
            "manual_filename": product["manual_filename"],
            "description": product.get("description", ""),
            "created_at": datetime.now().isoformat()
        }
        
        # Sync to Supabase
        if self.supabase_client:
            try:
                self.supabase_client.table("products").upsert(payload).execute()
            except Exception as e:
                print(f"[Database] Supabase product sync skipped: {e}")

        # Local DB write
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT OR REPLACE INTO products (
                    product_name, manufacturer, model_number, manual_filename, description, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["product_name"],
                    payload["manufacturer"],
                    payload["model_number"],
                    payload["manual_filename"],
                    payload["description"],
                    payload["created_at"]
                )
            )
            conn.commit()
            return cursor.lastrowid

    def get_all_products(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM products ORDER BY id DESC")
            return [dict(row) for row in cursor.fetchall()]

    def delete_product(self, product_id: int):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
            conn.commit()

    def get_unresolved_cases(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT f.*, s.image_url, s.suggested_steps
                FROM feedback_history f
                LEFT JOIN troubleshooting_sessions s ON f.session_id = s.session_id
                WHERE f.was_successful = 0
                ORDER BY f.id DESC
            """)
            return [dict(row) for row in cursor.fetchall()]

    def get_analytics_summary(self) -> Dict[str, Any]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) as cnt FROM inspection_history")
            total_scans = cursor.fetchone()["cnt"] or 0
            
            cursor.execute("SELECT SUM(was_successful) as succ, COUNT(*) as tot FROM feedback_history")
            fb_row = cursor.fetchone()
            succ = fb_row["succ"] or 0
            tot = fb_row["tot"] or 0
            success_rate = f"{(succ / tot * 100):.1f}%" if tot > 0 else "100.0%"
            
            cursor.execute("SELECT AVG(user_rating) as avg_r FROM feedback_history")
            avg_rating = round(cursor.fetchone()["avg_r"] or 5.0, 1)
            
            cursor.execute("SELECT COUNT(*) as cnt FROM feedback_history WHERE was_successful = 0")
            unresolved_count = cursor.fetchone()["cnt"] or 0
            
            cursor.execute("SELECT detected_issue, COUNT(*) as cnt FROM inspection_history GROUP BY detected_issue ORDER BY cnt DESC LIMIT 5")
            top_issues = [dict(row) for row in cursor.fetchall()]

            cursor.execute("SELECT confidence FROM inspection_history")
            conf_rows = cursor.fetchall()
            conf_sum = 0.0
            conf_count = 0
            for r in conf_rows:
                val_str = str(r["confidence"]).replace("%", "").strip()
                try:
                    conf_sum += float(val_str)
                    conf_count += 1
                except ValueError:
                    pass
            avg_confidence = f"{(conf_sum / conf_count):.1f}%" if conf_count > 0 else "N/A"
            
            return {
                "total_scans": total_scans,
                "success_rate": success_rate,
                "avg_rating": avg_rating,
                "unresolved_count": unresolved_count,
                "top_issues": top_issues,
                "avg_confidence": avg_confidence
            }

    def add_record(self, record: Dict[str, Any]) -> int:
        payload = {
            "timestamp": datetime.now().isoformat(),
            "image_path": record.get("image_path"),
            "detected_issue": record.get("detected_issue", "Unknown"),
            "confidence": record.get("confidence", "N/A"),
            "root_cause": record.get("root_cause", ""),
            "suggested_steps": json.dumps(record.get("suggested_steps", [])),
            "safety_recommendations": record.get("safety_recommendations", ""),
            "audio_url": record.get("audio_url"),
            "query_text": record.get("query_text"),
            "inference_node": record.get("inference_node")
        }

        # Sync to Supabase
        if self.supabase_client:
            try:
                self.supabase_client.table("inspection_history").insert(payload).execute()
            except Exception as e:
                print(f"[Database] Supabase record sync skipped: {e}")

        # Local Write
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO inspection_history (
                    timestamp, image_path, detected_issue, confidence, 
                    root_cause, suggested_steps, safety_recommendations, audio_url, query_text, inference_node
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["timestamp"],
                    payload["image_path"],
                    payload["detected_issue"],
                    payload["confidence"],
                    payload["root_cause"],
                    payload["suggested_steps"],
                    payload["safety_recommendations"],
                    payload["audio_url"],
                    payload["query_text"],
                    payload["inference_node"]
                )
            )
            conn.commit()
            return cursor.lastrowid

    def get_history(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM inspection_history ORDER BY id DESC")
            rows = cursor.fetchall()
            
            history = []
            for row in rows:
                item = dict(row)
                try:
                    item["suggested_steps"] = json.loads(item["suggested_steps"])
                except Exception:
                    item["suggested_steps"] = []
                history.append(item)
            return history

    # --- Troubleshooting Sessions State Machine ---
    
    def create_or_update_session(self, session: Dict[str, Any]):
        payload = {
            "session_id": session["session_id"],
            "created_at": session.get("created_at", datetime.now().isoformat()),
            "detected_issue": session.get("detected_issue"),
            "severity_level": session.get("severity_level"),
            "confidence_score": session.get("confidence_score"),
            "root_cause_rankings": json.dumps(session.get("root_cause_rankings", [])),
            "suggested_steps": json.dumps(session.get("suggested_steps", [])),
            "safety_recommendations": session.get("safety_recommendations"),
            "failed_steps": json.dumps(session.get("failed_steps", [])),
            "image_url": session.get("image_url"),
            "query_text": session.get("query_text"),
            "inference_node": session.get("inference_node")
        }

        # 1. Cache in Redis
        if self.redis_client:
            try:
                # 24 hour expiry
                self.redis_client.set(f"session:{session['session_id']}", json.dumps(payload), ex=86400)
            except Exception as e:
                print(f"[Database] Redis caching skipped: {e}")

        # 2. Sync to Supabase
        if self.supabase_client:
            try:
                self.supabase_client.table("troubleshooting_sessions").upsert(payload).execute()
            except Exception as e:
                print(f"[Database] Supabase session sync skipped: {e}")

        # 3. Local Write
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO troubleshooting_sessions (
                    session_id, created_at, detected_issue, severity_level,
                    confidence_score, root_cause_rankings, suggested_steps,
                    safety_recommendations, failed_steps, image_url, query_text, inference_node
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    detected_issue=excluded.detected_issue,
                    severity_level=excluded.severity_level,
                    confidence_score=excluded.confidence_score,
                    root_cause_rankings=excluded.root_cause_rankings,
                    suggested_steps=excluded.suggested_steps,
                    safety_recommendations=excluded.safety_recommendations,
                    failed_steps=excluded.failed_steps,
                    image_url=excluded.image_url,
                    query_text=excluded.query_text,
                    inference_node=excluded.inference_node
                """,
                (
                    payload["session_id"],
                    payload["created_at"],
                    payload["detected_issue"],
                    payload["severity_level"],
                    payload["confidence_score"],
                    payload["root_cause_rankings"],
                    payload["suggested_steps"],
                    payload["safety_recommendations"],
                    payload["failed_steps"],
                    payload["image_url"],
                    payload["query_text"],
                    payload["inference_node"]
                )
            )
            conn.commit()

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        # 1. Try reading from Redis Cache
        if self.redis_client:
            try:
                cached = self.redis_client.get(f"session:{session_id}")
                if cached:
                    session = json.loads(cached)
                    session["root_cause_rankings"] = json.loads(session["root_cause_rankings"])
                    session["suggested_steps"] = json.loads(session["suggested_steps"])
                    session["failed_steps"] = json.loads(session["failed_steps"])
                    return session
            except Exception as e:
                print(f"[Database] Redis session read skipped: {e}")

        # 2. Try reading from Supabase
        if self.supabase_client:
            try:
                res = self.supabase_client.table("troubleshooting_sessions").select("*").eq("session_id", session_id).execute()
                if res.data:
                    session = res.data[0]
                    session["root_cause_rankings"] = json.loads(session["root_cause_rankings"])
                    session["suggested_steps"] = json.loads(session["suggested_steps"])
                    session["failed_steps"] = json.loads(session["failed_steps"])
                    return session
            except Exception as e:
                print(f"[Database] Supabase session read skipped: {e}")

        # 3. Fallback to Local SQL
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM troubleshooting_sessions WHERE session_id = ?", (session_id,))
            row = cursor.fetchone()
            if not row:
                return None
            
            session = dict(row)
            try:
                session["root_cause_rankings"] = json.loads(session["root_cause_rankings"])
            except Exception:
                session["root_cause_rankings"] = []
            try:
                session["suggested_steps"] = json.loads(session["suggested_steps"])
            except Exception:
                session["suggested_steps"] = []
            try:
                session["failed_steps"] = json.loads(session["failed_steps"])
            except Exception:
                session["failed_steps"] = []
            return session

    # --- Repair Feedback & Analytics ---
    
    def add_feedback(self, feedback: Dict[str, Any]):
        payload = {
            "session_id": feedback.get("session_id"),
            "user_issue": feedback.get("user_issue"),
            "suggested_repair": feedback.get("suggested_repair"),
            "was_successful": 1 if feedback.get("was_successful") else 0,
            "repair_duration": feedback.get("repair_duration", 0),
            "user_rating": feedback.get("user_rating", 5),
            "timestamp": datetime.now().isoformat()
        }

        # Sync to Supabase
        if self.supabase_client:
            try:
                self.supabase_client.table("feedback_history").insert(payload).execute()
            except Exception as e:
                print(f"[Database] Supabase feedback sync skipped: {e}")

        # Local Write
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO feedback_history (
                    session_id, user_issue, suggested_repair, was_successful,
                    repair_duration, user_rating, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["session_id"],
                    payload["user_issue"],
                    payload["suggested_repair"],
                    payload["was_successful"],
                    payload["repair_duration"],
                    payload["user_rating"],
                    payload["timestamp"]
                )
            )
            conn.commit()

    def get_historical_success_rate(self, detected_issue: str) -> float:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT SUM(was_successful) as success, COUNT(*) as total
                FROM feedback_history
                WHERE user_issue LIKE ?
                """,
                (f"%{detected_issue}%",)
            )
            row = cursor.fetchone()
            if not row or not row["total"]:
                return 0.80
            
            success = row["success"] or 0
            total = row["total"] or 1
            return float(success / total)

    def get_feedback_reliability(self) -> float:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT AVG(user_rating) as avg_rating FROM feedback_history")
            row = cursor.fetchone()
            if not row or not row["avg_rating"]:
                return 0.90
            return float(row["avg_rating"] / 5.0)

    def get_all_feedback(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM feedback_history ORDER BY id DESC")
            return [dict(row) for row in cursor.fetchall()]

db = Database()
