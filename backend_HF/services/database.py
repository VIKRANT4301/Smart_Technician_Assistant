import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend.config import config

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
                    query_text TEXT
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
                    query_text TEXT
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
            conn.commit()

    def add_record(self, record: Dict[str, Any]) -> int:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO inspection_history (
                    timestamp, image_path, detected_issue, confidence, 
                    root_cause, suggested_steps, safety_recommendations, audio_url, query_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    record.get("query_text")
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
                    safety_recommendations, failed_steps, image_url, query_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    detected_issue=excluded.detected_issue,
                    severity_level=excluded.severity_level,
                    confidence_score=excluded.confidence_score,
                    root_cause_rankings=excluded.root_cause_rankings,
                    suggested_steps=excluded.suggested_steps,
                    safety_recommendations=excluded.safety_recommendations,
                    failed_steps=excluded.failed_steps,
                    image_url=excluded.image_url,
                    query_text=excluded.query_text
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
                    session.get("query_text")
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
