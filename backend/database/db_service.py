import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend.core.config import config

class Database:
    def __init__(self):
        # Extract db path from file URL or relative path
        self.db_path = config.DATABASE_URL.replace("sqlite:///", "")
        self._init_db()

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
                    suggested_steps TEXT NOT NULL, -- JSON string array
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
                    root_cause_rankings TEXT, -- JSON representation of ranked causes
                    suggested_steps TEXT, -- JSON representation of steps
                    safety_recommendations TEXT,
                    failed_steps TEXT, -- JSON representation of failed steps
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
                    was_successful INTEGER, -- 1 = Yes, 0 = No
                    repair_duration INTEGER, -- In minutes
                    user_rating INTEGER, -- 1 to 5 stars
                    timestamp TEXT NOT NULL
                )
            """)
            
            # Dynamic schema update for existing tables
            try:
                conn.execute("ALTER TABLE inspection_history ADD COLUMN inference_node TEXT")
            except sqlite3.OperationalError:
                pass # Column already exists
                
            try:
                conn.execute("ALTER TABLE troubleshooting_sessions ADD COLUMN inference_node TEXT")
            except sqlite3.OperationalError:
                pass # Column already exists
                
            conn.commit()
        # Initialize default products
        self.init_products()

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
            cursor.execute("SELECT * FROM products WHERE model_number = ? OR ? LIKE '%' || model_number || '%'", (model, model))
            row = cursor.fetchone()
            return dict(row) if row else None

    def add_product(self, product: Dict[str, Any]) -> int:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT OR REPLACE INTO products (
                    product_name, manufacturer, model_number, manual_filename, description, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    product["product_name"],
                    product["manufacturer"],
                    product["model_number"],
                    product["manual_filename"],
                    product.get("description", ""),
                    datetime.now().isoformat()
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
            
            # Total scans
            cursor.execute("SELECT COUNT(*) as cnt FROM inspection_history")
            total_scans = cursor.fetchone()["cnt"] or 0
            
            # Success rate
            cursor.execute("SELECT SUM(was_successful) as succ, COUNT(*) as tot FROM feedback_history")
            fb_row = cursor.fetchone()
            succ = fb_row["succ"] or 0
            tot = fb_row["tot"] or 0
            success_rate = f"{(succ / tot * 100):.1f}%" if tot > 0 else "100.0%"
            
            # Average rating
            cursor.execute("SELECT AVG(user_rating) as avg_r FROM feedback_history")
            avg_rating = round(cursor.fetchone()["avg_r"] or 5.0, 1)
            
            # Unresolved count
            cursor.execute("SELECT COUNT(*) as cnt FROM feedback_history WHERE was_successful = 0")
            unresolved_count = cursor.fetchone()["cnt"] or 0
            
            # Historical scan counts grouped by issue
            cursor.execute("SELECT detected_issue, COUNT(*) as cnt FROM inspection_history GROUP BY detected_issue ORDER BY cnt DESC LIMIT 5")
            top_issues = [dict(row) for row in cursor.fetchall()]

            # Average confidence score
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
                    datetime.now().isoformat(),
                    record.get("image_path"),
                    record.get("detected_issue", "Unknown"),
                    record.get("confidence", "N/A"),
                    record.get("root_cause", ""),
                    json.dumps(record.get("suggested_steps", [])),
                    record.get("safety_recommendations", ""),
                    record.get("audio_url"),
                    record.get("query_text"),
                    record.get("inference_node")
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
                    session["session_id"],
                    session.get("created_at", datetime.now().isoformat()),
                    session.get("detected_issue"),
                    session.get("severity_level"),
                    session.get("confidence_score"),
                    json.dumps(session.get("root_cause_rankings", [])),
                    json.dumps(session.get("suggested_steps", [])),
                    session.get("safety_recommendations"),
                    json.dumps(session.get("failed_steps", [])),
                    session.get("image_url"),
                    session.get("query_text"),
                    session.get("inference_node")
                )
            )
            conn.commit()

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
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
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO feedback_history (
                    session_id, user_issue, suggested_repair, was_successful,
                    repair_duration, user_rating, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    feedback.get("session_id"),
                    feedback.get("user_issue"),
                    feedback.get("suggested_repair"),
                    1 if feedback.get("was_successful") else 0,
                    feedback.get("repair_duration", 0),
                    feedback.get("user_rating", 5),
                    datetime.now().isoformat()
                )
            )
            conn.commit()

    def get_historical_success_rate(self, detected_issue: str) -> float:
        """
        Get the percentage rate of successful repairs for a given issue type.
        Returns a float between 0.0 and 1.0 (defaulting to 0.80 if no history exists).
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Normalize issues to find similar cases
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
                return 0.80 # Baseline rating
            
            success = row["success"] or 0
            total = row["total"] or 1
            return float(success / total)

    def get_feedback_reliability(self) -> float:
        """
        Calculates user feedback rating average as a percentage.
        Defaults to 0.90 (90%) if no reviews are registered.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT AVG(user_rating) as avg_rating FROM feedback_history")
            row = cursor.fetchone()
            if not row or not row["avg_rating"]:
                return 0.90
            
            # Scales 1-5 scale to 0.0-1.0
            return float(row["avg_rating"] / 5.0)

    def get_all_feedback(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM feedback_history ORDER BY id DESC")
            return [dict(row) for row in cursor.fetchall()]

db = Database()
