"""
Physics Engine — Degradation Model & What-If Simulation Runner

Implements Arrhenius-inspired degradation physics to simulate asset health decay
under varying operating conditions (load, temperature, vibration).

No GPU required — pure Python math, portable across all deployment targets.
"""
import math
from typing import Dict, Any, List


# ─── Component Failure Thresholds ─────────────────────────────────────────────
# Maps component type to its known failure health threshold (%)
COMPONENT_THRESHOLDS = {
    "Bearing":      25.0,
    "Motor":        20.0,
    "Compressor":   22.0,
    "Fan":          30.0,
    "Pump":         25.0,
    "Gear":         20.0,
    "Seal":         35.0,
    "Belt":         30.0,
    "Capacitor":    15.0,
    "General":      20.0,
}

# Maps device type → most likely critical component under stress
DEVICE_COMPONENT_MAP = {
    "Motor":             "Bearing",
    "Compressor":        "Compressor",
    "HVAC":              "Fan",
    "Pump":              "Pump",
    "Gearbox":           "Gear",
    "Laptop":            "Capacitor",
    "Computer":          "Capacitor",
    "Electronic Device": "Capacitor",
    "Keyboard":          "General",
    "Printer":           "Belt",
    "Server":            "Fan",
    "Generator":         "Bearing",
}


class PhysicsEngine:
    """
    Implements simplified physics-based degradation model.

    Key equations:
    ─────────────
    load_factor      = 1 + ((load_pct - 100) / 100)²   [non-linear above 100%]
    temp_factor      = exp(0.05 × (temp_c - 25))        [Arrhenius activation]
    vibration_factor = 1 + (vibration_g / 5)^1.5        [bearing fatigue]
    degradation_rate = base_rate × load_f × temp_f × vibration_f
    health_after_N_days = health_now - (degradation_rate × N)
    """

    BASE_DEGRADATION_RATE = 0.35  # % health lost per day at nominal conditions

    def compute_degradation_rate(
        self,
        load_pct: float,
        temp_c: float,
        vibration_g: float
    ) -> float:
        """
        Calculate daily health degradation rate (% per day) under given conditions.
        """
        # Load factor — non-linear penalty above 100%
        load_normalized = load_pct / 100.0
        if load_normalized > 1.0:
            load_factor = 1.0 + ((load_normalized - 1.0) ** 2) * 4.0
        else:
            load_factor = max(0.5, load_normalized)

        # Temperature factor — Arrhenius: doubles roughly every 15°C above 25°C
        temp_delta = max(0, temp_c - 25.0)
        temp_factor = math.exp(0.05 * temp_delta)

        # Vibration factor — bearing fatigue increases superlinearly
        vibration_factor = 1.0 + (max(0, vibration_g) / 5.0) ** 1.5

        rate = self.BASE_DEGRADATION_RATE * load_factor * temp_factor * vibration_factor
        return round(rate, 4)

    def estimate_rul(
        self,
        current_health: float,
        degradation_rate: float,
        device_type: str = "General"
    ) -> int:
        """
        Estimate Remaining Useful Life in days before health drops to failure threshold.
        """
        component = DEVICE_COMPONENT_MAP.get(device_type, "General")
        failure_threshold = COMPONENT_THRESHOLDS.get(component, 20.0)

        usable_health = max(0, current_health - failure_threshold)
        if degradation_rate <= 0:
            return 365  # Effectively infinite

        rul = usable_health / degradation_rate
        return max(0, int(rul))

    def compute_failure_probability(
        self,
        current_health: float,
        days_since_service: int,
        degradation_rate: float
    ) -> float:
        """
        Compute failure probability (0–100%) based on current health + degradation context.
        Uses a sigmoid-like curve: probability rises sharply below 40% health.
        """
        # Base probability from health score (inverted sigmoid)
        health_prob = 100.0 * (1.0 / (1.0 + math.exp(0.12 * (current_health - 40))))

        # Service penalty — older service intervals increase risk
        service_penalty = min(15.0, days_since_service * 0.3)

        # Degradation speed penalty — fast degraders are riskier
        rate_penalty = min(20.0, degradation_rate * 10.0)

        probability = health_prob + service_penalty + rate_penalty
        return round(min(99.0, max(1.0, probability)), 1)

    def build_degradation_curve(
        self,
        current_health: float,
        degradation_rate: float,
        duration_days: int
    ) -> List[float]:
        """
        Build a day-by-day health degradation curve over `duration_days`.
        Returns a list of health % values from day 0 to day N.
        Caps at 8 points for UI sparkline rendering.
        """
        points = min(duration_days + 1, 8)
        step = max(1, duration_days // (points - 1)) if points > 1 else 1
        curve = []
        for i in range(points):
            day = i * step
            health = current_health - (degradation_rate * day)
            curve.append(round(max(0.0, health), 1))
        return curve

    def get_critical_component(self, device_type: str, load_pct: float, temp_c: float) -> str:
        """Determine which component is most at risk given device type and conditions."""
        component = DEVICE_COMPONENT_MAP.get(device_type, "General")
        # High temp overrides to cooling-related components for certain devices
        if temp_c > 80 and device_type in ("Laptop", "Computer", "Server", "Electronic Device"):
            return "Thermal Module"
        return component

    def get_recommended_action(
        self,
        risk_level: str,
        rul_days: int,
        critical_component: str
    ) -> str:
        """Generate a human-readable recommended action based on risk."""
        if risk_level == "CRITICAL":
            return f"URGENT: Replace {critical_component} within {rul_days} days to prevent failure."
        elif risk_level == "HIGH":
            return f"Schedule {critical_component} inspection within {rul_days} days. Monitor closely."
        elif risk_level == "MEDIUM":
            return f"Plan preventive maintenance for {critical_component} within {rul_days} days."
        else:
            return f"Continue normal operations. Next {critical_component} check in {rul_days} days."

    def classify_risk(self, failure_probability: float) -> str:
        """Classify failure probability into risk level."""
        if failure_probability >= 75:
            return "CRITICAL"
        elif failure_probability >= 50:
            return "HIGH"
        elif failure_probability >= 25:
            return "MEDIUM"
        else:
            return "LOW"

    def simulate_scenario(
        self,
        current_state: Dict[str, Any],
        what_if_params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Run a complete what-if simulation scenario.

        Args:
            current_state: Current twin state (health, load, temp, vibration, device_type, days_since_service)
            what_if_params: Scenario overrides (load_pct, temp_offset_c, vibration_offset_g, duration_days, scenario_name)

        Returns:
            Full simulation result dict ready for API response + DB storage.
        """
        # Extract current state
        current_health  = float(current_state.get("health_score", 85.0))
        base_load       = float(current_state.get("current_load_pct", 80.0))
        base_temp       = float(current_state.get("current_temp_c", 45.0))
        base_vibration  = float(current_state.get("current_vibration_g", 1.2))
        days_in_service = int(current_state.get("days_since_service", 0))
        device_type     = current_state.get("device_type", "General")

        # Apply what-if overrides
        sim_load       = float(what_if_params.get("load_pct", base_load))
        sim_temp       = base_temp + float(what_if_params.get("temp_offset_c", 0.0))
        sim_vibration  = base_vibration + float(what_if_params.get("vibration_offset_g", 0.0))
        duration_days  = int(what_if_params.get("duration_days", 7))
        scenario_name  = what_if_params.get("scenario_name", "Custom Scenario")

        # Run physics model
        degradation_rate     = self.compute_degradation_rate(sim_load, sim_temp, sim_vibration)
        projected_health     = max(0.0, current_health - (degradation_rate * duration_days))
        rul_days             = self.estimate_rul(projected_health, degradation_rate, device_type)
        failure_probability  = self.compute_failure_probability(projected_health, days_in_service, degradation_rate)
        risk_level           = self.classify_risk(failure_probability)
        critical_component   = self.get_critical_component(device_type, sim_load, sim_temp)
        recommended_action   = self.get_recommended_action(risk_level, rul_days, critical_component)
        degradation_curve    = self.build_degradation_curve(current_health, degradation_rate, duration_days)

        return {
            "scenario_name":         scenario_name,
            "load_pct":              sim_load,
            "temp_offset_c":         what_if_params.get("temp_offset_c", 0.0),
            "vibration_offset_g":    what_if_params.get("vibration_offset_g", 0.0),
            "duration_days":         duration_days,
            "degradation_rate":      round(degradation_rate, 4),
            "projected_health":      round(projected_health, 1),
            "failure_probability":   failure_probability,
            "rul_days":              rul_days,
            "risk_level":            risk_level,
            "critical_component":    critical_component,
            "recommended_action":    recommended_action,
            "degradation_curve":     degradation_curve,
        }


# Singleton
physics_engine = PhysicsEngine()
