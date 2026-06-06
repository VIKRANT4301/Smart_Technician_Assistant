"""
Failure Predictor — Anomaly Detection, RUL Analysis & Maintenance Plan Generator

Provides:
  - Statistical anomaly detection (z-score on rolling window)
  - Time series trend forecasting (linear extrapolation)
  - Maintenance plan generation with cost estimates
"""
import math
import statistics
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta


class FailurePredictor:
    """
    AI analytics layer for the Digital Twin engine.
    Uses statistical methods — no ML framework dependency required.
    """

    # ─── Anomaly Detection ─────────────────────────────────────────────────────

    Z_SCORE_THRESHOLD = 2.5  # Readings beyond 2.5σ are flagged as anomalies

    def detect_anomalies(
        self,
        telemetry_series: List[Dict[str, Any]],
        metric: str = "temp_c"
    ) -> List[Dict[str, Any]]:
        """
        Detect anomalies in a telemetry time series using rolling z-score.
        Flags readings more than Z_SCORE_THRESHOLD standard deviations from the mean.

        Args:
            telemetry_series: List of snapshot dicts (each has timestamp + metric fields)
            metric: The metric key to analyze (e.g. 'temp_c', 'load_pct', 'vibration_g')

        Returns:
            List of anomaly dicts with {timestamp, metric, value, z_score, severity}
        """
        values = [
            s.get(metric) for s in telemetry_series
            if s.get(metric) is not None
        ]

        if len(values) < 5:
            return []  # Not enough data for meaningful stats

        mean = statistics.mean(values)
        try:
            std  = statistics.stdev(values)
        except Exception:
            std = 0.001  # Avoid division by zero

        anomalies = []
        for snapshot in telemetry_series:
            val = snapshot.get(metric)
            if val is None:
                continue
            z = abs((val - mean) / std) if std > 0 else 0
            if z > self.Z_SCORE_THRESHOLD:
                anomalies.append({
                    "timestamp": snapshot.get("timestamp", ""),
                    "metric": metric,
                    "value": val,
                    "z_score": round(z, 2),
                    "severity": "CRITICAL" if z > 4.0 else "HIGH" if z > 3.0 else "MEDIUM",
                })
        return anomalies

    def detect_all_anomalies(self, telemetry_series: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Run anomaly detection across all key metrics."""
        all_anomalies = []
        for metric in ["temp_c", "load_pct", "vibration_g", "pressure_bar"]:
            all_anomalies.extend(self.detect_anomalies(telemetry_series, metric))
        # Sort by severity then timestamp
        severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}
        all_anomalies.sort(key=lambda x: (severity_order.get(x["severity"], 3), x["timestamp"]))
        return all_anomalies

    # ─── Time Series Forecasting ───────────────────────────────────────────────

    def time_series_forecast(
        self,
        telemetry_series: List[Dict[str, Any]],
        metric: str,
        horizon_days: int = 7
    ) -> List[float]:
        """
        Simple linear trend extrapolation over `horizon_days`.
        Uses last N readings to compute slope and project forward.

        Returns: list of forecasted metric values (one per day for horizon_days).
        """
        values = [
            s.get(metric) for s in telemetry_series
            if s.get(metric) is not None
        ]

        if len(values) < 2:
            # Flat forecast — return last known value
            last = values[-1] if values else 0.0
            return [round(last, 2)] * horizon_days

        # Linear regression on last 14 readings
        recent = values[-14:]
        n = len(recent)
        x_mean = (n - 1) / 2.0
        y_mean = statistics.mean(recent)

        numerator   = sum((i - x_mean) * (recent[i] - y_mean) for i in range(n))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        slope = numerator / denominator if denominator != 0 else 0

        last_val = recent[-1]
        forecast = []
        for day in range(1, horizon_days + 1):
            projected = last_val + slope * day
            forecast.append(round(max(0.0, projected), 2))
        return forecast

    # ─── Health Score Estimation ───────────────────────────────────────────────

    def estimate_health_from_findings(self, visual_findings: str, detected_issue: str) -> float:
        """
        Estimate a starting health score from vision analysis text findings.
        Used when a new twin is created from a photo scan.
        """
        score = 85.0  # Baseline

        issue_lower = (detected_issue or "").lower()
        findings_lower = (visual_findings or "").lower()

        # Heavy penalties for critical issues
        critical_keywords = ["crack", "burn", "overheating", "leak", "severe", "critical", "broken", "fail"]
        for kw in critical_keywords:
            if kw in issue_lower or kw in findings_lower:
                score -= 25.0
                break

        # Moderate penalties
        moderate_keywords = ["wear", "worn", "scratch", "dirty", "corrode", "rust", "degrad", "aged"]
        for kw in moderate_keywords:
            if kw in issue_lower or kw in findings_lower:
                score -= 12.0
                break

        # Minor penalties
        minor_keywords = ["dust", "minor", "small", "slight", "early"]
        for kw in minor_keywords:
            if kw in issue_lower or kw in findings_lower:
                score -= 5.0
                break

        return round(max(10.0, min(95.0, score)), 1)

    def estimate_telemetry_from_findings(
        self,
        device_type: str,
        detected_issue: str,
        visual_findings: str
    ) -> Dict[str, float]:
        """
        Estimate sensor telemetry values from vision analysis text.
        Used to populate the twin when no physical sensors are present.
        """
        issue_lower = (detected_issue or "").lower()
        findings_lower = (visual_findings or "").lower()

        # Defaults by device type
        defaults = {
            "Motor":             {"load_pct": 85.0, "temp_c": 65.0, "vibration_g": 1.8, "pressure_bar": 1.2},
            "Compressor":        {"load_pct": 90.0, "temp_c": 75.0, "vibration_g": 2.5, "pressure_bar": 4.0},
            "HVAC":              {"load_pct": 75.0, "temp_c": 55.0, "vibration_g": 1.2, "pressure_bar": 1.5},
            "Laptop":            {"load_pct": 70.0, "temp_c": 55.0, "vibration_g": 0.1, "pressure_bar": 1.0},
            "Computer":          {"load_pct": 65.0, "temp_c": 50.0, "vibration_g": 0.2, "pressure_bar": 1.0},
            "Electronic Device": {"load_pct": 60.0, "temp_c": 45.0, "vibration_g": 0.1, "pressure_bar": 1.0},
            "Keyboard":          {"load_pct": 40.0, "temp_c": 30.0, "vibration_g": 0.0, "pressure_bar": 1.0},
            "Server":            {"load_pct": 80.0, "temp_c": 70.0, "vibration_g": 0.5, "pressure_bar": 1.0},
            "Generator":         {"load_pct": 85.0, "temp_c": 80.0, "vibration_g": 3.0, "pressure_bar": 2.0},
        }

        telemetry = defaults.get(device_type, {"load_pct": 75.0, "temp_c": 50.0, "vibration_g": 1.0, "pressure_bar": 1.0})

        # Boost readings based on fault keywords
        if any(kw in issue_lower or kw in findings_lower for kw in ["overheat", "hot", "thermal", "burn"]):
            telemetry["temp_c"] = min(120.0, telemetry["temp_c"] + 25.0)

        if any(kw in issue_lower or kw in findings_lower for kw in ["vibrat", "shake", "rattle", "bearing"]):
            telemetry["vibration_g"] = min(8.0, telemetry["vibration_g"] + 2.0)

        if any(kw in issue_lower or kw in findings_lower for kw in ["overload", "strain", "high load", "stress"]):
            telemetry["load_pct"] = min(130.0, telemetry["load_pct"] + 20.0)

        return {k: round(v, 2) for k, v in telemetry.items()}

    # ─── Maintenance Plan ──────────────────────────────────────────────────────

    def generate_maintenance_plan(
        self,
        twin_state: Dict[str, Any],
        sim_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate a structured maintenance plan from twin state + simulation result.
        """
        risk_level         = sim_result.get("risk_level", "LOW")
        rul_days           = sim_result.get("rul_days", 30)
        critical_component = sim_result.get("critical_component", "General")
        device_type        = twin_state.get("device_type", "Device")

        # Build timeline of actions
        immediate_actions = []
        scheduled_actions = []

        if risk_level == "CRITICAL":
            immediate_actions = [
                f"Stop high-load operations immediately",
                f"Inspect {critical_component} for visible damage",
                f"Order replacement {critical_component} (lead time ~2–3 days)",
                "Deploy backup unit if available",
            ]
            scheduled_actions = [
                {"day": 1,        "action": f"Full {critical_component} diagnostic test"},
                {"day": rul_days, "action": f"Replace {critical_component}"},
                {"day": rul_days + 2, "action": "Post-replacement performance validation"},
            ]
        elif risk_level == "HIGH":
            immediate_actions = [
                f"Reduce {device_type} load by 20%",
                f"Increase {critical_component} inspection frequency to weekly",
            ]
            scheduled_actions = [
                {"day": 3,        "action": f"Vibration + temperature analysis"},
                {"day": rul_days, "action": f"Preventive {critical_component} replacement"},
            ]
        elif risk_level == "MEDIUM":
            immediate_actions = [
                f"Schedule {critical_component} inspection within 2 weeks",
                "Ensure lubrication and cooling systems are optimal",
            ]
            scheduled_actions = [
                {"day": 7,        "action": f"{critical_component} visual inspection"},
                {"day": rul_days, "action": f"Preventive maintenance check"},
            ]
        else:
            immediate_actions = ["Continue monitoring. No immediate action required."]
            scheduled_actions = [
                {"day": rul_days, "action": "Routine preventive maintenance"}
            ]

        # Estimate cost savings (heuristic — avoidance of unplanned downtime)
        downtime_hours = rul_days * 2 if risk_level in ("CRITICAL", "HIGH") else rul_days
        downtime_hours = min(downtime_hours, 240)  # Cap at 10 days
        cost_saving    = downtime_hours * 250  # $250/hr industry average downtime cost

        return {
            "risk_level":            risk_level,
            "critical_component":    critical_component,
            "immediate_actions":     immediate_actions,
            "scheduled_actions":     scheduled_actions,
            "estimated_cost_saving": f"${cost_saving:,.0f}",
            "downtime_prevented_hours": downtime_hours,
            "next_service_in_days":  max(1, rul_days),
            "generated_at":          datetime.now().isoformat(),
        }

    def classify_risk_level(self, failure_probability: float) -> str:
        """Classify failure probability into a named risk level."""
        if failure_probability >= 75:
            return "CRITICAL"
        elif failure_probability >= 50:
            return "HIGH"
        elif failure_probability >= 25:
            return "MEDIUM"
        return "LOW"


# Singleton
failure_predictor = FailurePredictor()
