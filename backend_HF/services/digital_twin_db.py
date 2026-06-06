"""
Digital Twin Database Service
Manages persistent storage for asset digital twins, simulation results, and telemetry snapshots.
"""
import sqlite3
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

# Reuse the same DB path logic as the main database service
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from backend_HF.core.config import config


class DigitalTwinDB:
    def __init__(self):
        self.db_path = config.DATABASE_URL.replace("sqlite:///", "")
        self._init_tables()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        with self._get_connection() as conn:
            # Core digital twin state per asset
            conn.execute("""
                CREATE TABLE IF NOT EXISTS digital_twins (
                    asset_id TEXT PRIMARY KEY,
                    device_type TEXT NOT NULL DEFAULT 'Unknown Device',
                    model_number TEXT NOT NULL DEFAULT 'Unknown Model',
                    manufacturer TEXT NOT NULL DEFAULT 'Unknown',
                    current_load_pct REAL NOT NULL DEFAULT 80.0,
                    current_temp_c REAL NOT NULL DEFAULT 45.0,
                    current_vibration_g REAL NOT NULL DEFAULT 1.2,
                    current_pressure_bar REAL NOT NULL DEFAULT 1.0,
                    health_score REAL NOT NULL DEFAULT 85.0,
                    days_since_service INTEGER NOT NULL DEFAULT 0,
                    image_url TEXT,
                    telemetry_history TEXT DEFAULT '[]',
                    notes TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)

            # What-if simulation run history
            conn.execute("""
                CREATE TABLE IF NOT EXISTS simulation_results (
                    sim_id TEXT PRIMARY KEY,
                    asset_id TEXT NOT NULL,
                    scenario_name TEXT NOT NULL DEFAULT 'Custom Scenario',
                    load_pct REAL NOT NULL,
                    temp_offset_c REAL NOT NULL DEFAULT 0.0,
                    vibration_offset_g REAL NOT NULL DEFAULT 0.0,
                    duration_days INTEGER NOT NULL,
                    failure_probability REAL NOT NULL,
                    rul_days INTEGER NOT NULL,
                    risk_level TEXT NOT NULL,
                    critical_component TEXT NOT NULL DEFAULT 'General',
                    recommended_action TEXT NOT NULL,
                    degradation_curve TEXT DEFAULT '[]',
                    maintenance_plan TEXT DEFAULT '{}',
                    ran_at TEXT NOT NULL,
                    FOREIGN KEY (asset_id) REFERENCES digital_twins(asset_id)
                )
            """)

            # Rolling telemetry snapshots (30-day window per asset)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS telemetry_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    asset_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    load_pct REAL,
                    temp_c REAL,
                    vibration_g REAL,
                    pressure_bar REAL,
                    health_score REAL,
                    anomaly_flags TEXT DEFAULT '[]',
                    FOREIGN KEY (asset_id) REFERENCES digital_twins(asset_id)
                )
            """)
            conn.commit()
        print("[DigitalTwinDB] Tables initialized.")

    # ─── Digital Twin CRUD ─────────────────────────────────────────────────────

    def upsert_twin(self, asset_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update a digital twin for an asset."""
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            existing = conn.execute(
                "SELECT asset_id FROM digital_twins WHERE asset_id = ?", (asset_id,)
            ).fetchone()

            if existing:
                conn.execute("""
                    UPDATE digital_twins SET
                        device_type = ?,
                        model_number = ?,
                        manufacturer = ?,
                        current_load_pct = ?,
                        current_temp_c = ?,
                        current_vibration_g = ?,
                        current_pressure_bar = ?,
                        health_score = ?,
                        days_since_service = ?,
                        image_url = ?,
                        notes = ?,
                        updated_at = ?
                    WHERE asset_id = ?
                """, (
                    state.get("device_type", "Unknown Device"),
                    state.get("model_number", "Unknown Model"),
                    state.get("manufacturer", "Unknown"),
                    state.get("current_load_pct", 80.0),
                    state.get("current_temp_c", 45.0),
                    state.get("current_vibration_g", 1.2),
                    state.get("current_pressure_bar", 1.0),
                    state.get("health_score", 85.0),
                    state.get("days_since_service", 0),
                    state.get("image_url"),
                    state.get("notes", ""),
                    now,
                    asset_id
                ))
            else:
                conn.execute("""
                    INSERT INTO digital_twins (
                        asset_id, device_type, model_number, manufacturer,
                        current_load_pct, current_temp_c, current_vibration_g,
                        current_pressure_bar, health_score, days_since_service,
                        image_url, telemetry_history, notes, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    asset_id,
                    state.get("device_type", "Unknown Device"),
                    state.get("model_number", "Unknown Model"),
                    state.get("manufacturer", "Unknown"),
                    state.get("current_load_pct", 80.0),
                    state.get("current_temp_c", 45.0),
                    state.get("current_vibration_g", 1.2),
                    state.get("current_pressure_bar", 1.0),
                    state.get("health_score", 85.0),
                    state.get("days_since_service", 0),
                    state.get("image_url"),
                    json.dumps([]),
                    state.get("notes", ""),
                    now,
                    now
                ))
            conn.commit()
        return self.get_twin(asset_id)

    def get_twin(self, asset_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a digital twin by asset ID."""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM digital_twins WHERE asset_id = ?", (asset_id,)
            ).fetchone()
            if not row:
                return None
            twin = dict(row)
            try:
                twin["telemetry_history"] = json.loads(twin.get("telemetry_history") or "[]")
            except Exception:
                twin["telemetry_history"] = []
            return twin

    def list_twins(self) -> List[Dict[str, Any]]:
        """List all registered digital twins."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM digital_twins ORDER BY updated_at DESC"
            ).fetchall()
            result = []
            for row in rows:
                twin = dict(row)
                try:
                    twin["telemetry_history"] = json.loads(twin.get("telemetry_history") or "[]")
                except Exception:
                    twin["telemetry_history"] = []
                result.append(twin)
            return result

    # ─── Simulation Results ────────────────────────────────────────────────────

    def save_simulation(self, asset_id: str, sim_result: Dict[str, Any]) -> str:
        """Persist a what-if simulation result."""
        sim_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO simulation_results (
                    sim_id, asset_id, scenario_name,
                    load_pct, temp_offset_c, vibration_offset_g, duration_days,
                    failure_probability, rul_days, risk_level,
                    critical_component, recommended_action,
                    degradation_curve, maintenance_plan, ran_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sim_id,
                asset_id,
                sim_result.get("scenario_name", "Custom Scenario"),
                sim_result.get("load_pct", 80.0),
                sim_result.get("temp_offset_c", 0.0),
                sim_result.get("vibration_offset_g", 0.0),
                sim_result.get("duration_days", 7),
                sim_result.get("failure_probability", 0.0),
                sim_result.get("rul_days", 30),
                sim_result.get("risk_level", "LOW"),
                sim_result.get("critical_component", "General"),
                sim_result.get("recommended_action", "Continue monitoring."),
                json.dumps(sim_result.get("degradation_curve", [])),
                json.dumps(sim_result.get("maintenance_plan", {})),
                now
            ))
            conn.commit()
        return sim_id

    def get_simulations(self, asset_id: str) -> List[Dict[str, Any]]:
        """Fetch all simulation runs for an asset, newest first."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM simulation_results WHERE asset_id = ? ORDER BY ran_at DESC",
                (asset_id,)
            ).fetchall()
            results = []
            for row in rows:
                item = dict(row)
                try:
                    item["degradation_curve"] = json.loads(item.get("degradation_curve") or "[]")
                except Exception:
                    item["degradation_curve"] = []
                try:
                    item["maintenance_plan"] = json.loads(item.get("maintenance_plan") or "{}")
                except Exception:
                    item["maintenance_plan"] = {}
                results.append(item)
            return results

    # ─── Telemetry ─────────────────────────────────────────────────────────────

    def add_telemetry(self, asset_id: str, reading: Dict[str, Any]):
        """Append a telemetry snapshot for the asset."""
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO telemetry_snapshots (
                    asset_id, timestamp, load_pct, temp_c,
                    vibration_g, pressure_bar, health_score, anomaly_flags
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                asset_id,
                reading.get("timestamp", now),
                reading.get("load_pct"),
                reading.get("temp_c"),
                reading.get("vibration_g"),
                reading.get("pressure_bar"),
                reading.get("health_score"),
                json.dumps(reading.get("anomaly_flags", []))
            ))
            # Keep only last 90 snapshots per asset (rolling window)
            conn.execute("""
                DELETE FROM telemetry_snapshots
                WHERE asset_id = ? AND id NOT IN (
                    SELECT id FROM telemetry_snapshots
                    WHERE asset_id = ?
                    ORDER BY id DESC LIMIT 90
                )
            """, (asset_id, asset_id))
            conn.commit()

    def get_telemetry(self, asset_id: str, limit: int = 30) -> List[Dict[str, Any]]:
        """Get recent telemetry snapshots for an asset."""
        with self._get_connection() as conn:
            rows = conn.execute(
                """SELECT * FROM telemetry_snapshots
                   WHERE asset_id = ?
                   ORDER BY id DESC LIMIT ?""",
                (asset_id, limit)
            ).fetchall()
            result = []
            for row in rows:
                item = dict(row)
                try:
                    item["anomaly_flags"] = json.loads(item.get("anomaly_flags") or "[]")
                except Exception:
                    item["anomaly_flags"] = []
                result.append(item)
            return list(reversed(result))  # chronological order


# Singleton instance
twin_db = DigitalTwinDB()
