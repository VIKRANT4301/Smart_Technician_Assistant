"""
Digital Twin API Routes — /digital-twin/*

Provides 5 endpoints:
  POST   /digital-twin/create                    — Create/update twin from analyze result
  GET    /digital-twin/list                      — List all registered asset twins
  GET    /digital-twin/{asset_id}                — Fetch twin state + predictions
  POST   /digital-twin/{asset_id}/simulate       — Run a what-if simulation
  GET    /digital-twin/{asset_id}/simulations    — Fetch past simulation history
"""
import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend_HF.services.digital_twin_db import twin_db
from backend_HF.services.physics_engine import physics_engine
from backend_HF.services.failure_predictor import failure_predictor

router = APIRouter(prefix="/digital-twin", tags=["Digital Twin"])


# ─── Request / Response Models ─────────────────────────────────────────────────

class CreateTwinRequest(BaseModel):
    asset_id:          Optional[str]   = None   # Auto-generated if not provided
    device_type:       str             = "Unknown Device"
    model_number:      str             = "Unknown Model"
    manufacturer:      str             = "Unknown"
    image_url:         Optional[str]   = None
    detected_issue:    Optional[str]   = None
    visual_findings:   Optional[str]   = None
    # Optional manual sensor overrides
    current_load_pct:       Optional[float] = None
    current_temp_c:         Optional[float] = None
    current_vibration_g:    Optional[float] = None
    current_pressure_bar:   Optional[float] = None
    days_since_service:     int = 0
    notes:             str = ""


class SimulateRequest(BaseModel):
    scenario_name:       str   = "Custom Scenario"
    load_pct:            float = Field(80.0, ge=10.0, le=200.0)
    temp_offset_c:       float = Field(0.0,  ge=-30.0, le=100.0)
    vibration_offset_g:  float = Field(0.0,  ge=-2.0,  le=10.0)
    duration_days:       int   = Field(7,    ge=1,     le=365)


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/create")
async def create_or_update_twin(req: CreateTwinRequest):
    """
    Create or update a digital twin for an asset.
    Automatically estimates health score and telemetry from vision analysis
    text when physical sensor values are not provided.
    """
    asset_id = req.asset_id or f"asset-{str(uuid.uuid4())[:8]}"

    # Estimate health from vision findings if not explicitly provided
    health_score = failure_predictor.estimate_health_from_findings(
        visual_findings=req.visual_findings or "",
        detected_issue=req.detected_issue or ""
    )

    # Estimate telemetry from vision findings if not manually provided
    estimated_telemetry = failure_predictor.estimate_telemetry_from_findings(
        device_type=req.device_type,
        detected_issue=req.detected_issue or "",
        visual_findings=req.visual_findings or ""
    )

    state = {
        "device_type":          req.device_type,
        "model_number":         req.model_number,
        "manufacturer":         req.manufacturer,
        "current_load_pct":     req.current_load_pct   if req.current_load_pct   is not None else estimated_telemetry["load_pct"],
        "current_temp_c":       req.current_temp_c     if req.current_temp_c     is not None else estimated_telemetry["temp_c"],
        "current_vibration_g":  req.current_vibration_g if req.current_vibration_g is not None else estimated_telemetry["vibration_g"],
        "current_pressure_bar": req.current_pressure_bar if req.current_pressure_bar is not None else estimated_telemetry["pressure_bar"],
        "health_score":         health_score,
        "days_since_service":   req.days_since_service,
        "image_url":            req.image_url,
        "notes":                req.notes,
    }

    twin = twin_db.upsert_twin(asset_id, state)

    # Add initial telemetry snapshot
    twin_db.add_telemetry(asset_id, {
        "timestamp":   datetime.now().isoformat(),
        "load_pct":    state["current_load_pct"],
        "temp_c":      state["current_temp_c"],
        "vibration_g": state["current_vibration_g"],
        "pressure_bar":state["current_pressure_bar"],
        "health_score":state["health_score"],
    })

    # Compute baseline predictions
    degradation_rate = physics_engine.compute_degradation_rate(
        state["current_load_pct"],
        state["current_temp_c"],
        state["current_vibration_g"]
    )
    rul_days = physics_engine.estimate_rul(
        health_score, degradation_rate, req.device_type
    )
    failure_prob = physics_engine.compute_failure_probability(
        health_score, req.days_since_service, degradation_rate
    )
    risk_level = physics_engine.classify_risk(failure_prob)
    critical_component = physics_engine.get_critical_component(
        req.device_type, state["current_load_pct"], state["current_temp_c"]
    )

    return {
        "asset_id":            asset_id,
        "twin":                twin,
        "predictions": {
            "health_score":         health_score,
            "failure_probability":  failure_prob,
            "rul_days":             rul_days,
            "risk_level":           risk_level,
            "critical_component":   critical_component,
            "degradation_rate":     degradation_rate,
        },
        "message": "Digital twin created/updated successfully."
    }


@router.get("/list")
async def list_twins():
    """Return all registered digital twins with basic health predictions."""
    twins = twin_db.list_twins()
    enriched = []
    for twin in twins:
        degradation_rate = physics_engine.compute_degradation_rate(
            twin.get("current_load_pct", 80),
            twin.get("current_temp_c", 45),
            twin.get("current_vibration_g", 1.2)
        )
        failure_prob = physics_engine.compute_failure_probability(
            twin.get("health_score", 85),
            twin.get("days_since_service", 0),
            degradation_rate
        )
        twin["failure_probability"] = failure_prob
        twin["risk_level"] = physics_engine.classify_risk(failure_prob)
        twin["rul_days"] = physics_engine.estimate_rul(
            twin.get("health_score", 85), degradation_rate, twin.get("device_type", "General")
        )
        enriched.append(twin)
    return {"twins": enriched, "total": len(enriched)}


@router.get("/{asset_id}")
async def get_twin(asset_id: str):
    """
    Fetch full digital twin state with live predictions and anomaly detection.
    """
    twin = twin_db.get_twin(asset_id)
    if not twin:
        raise HTTPException(status_code=404, detail=f"Digital twin '{asset_id}' not found.")

    telemetry = twin_db.get_telemetry(asset_id, limit=30)

    # Compute live predictions
    degradation_rate = physics_engine.compute_degradation_rate(
        twin["current_load_pct"],
        twin["current_temp_c"],
        twin["current_vibration_g"]
    )
    failure_prob = physics_engine.compute_failure_probability(
        twin["health_score"],
        twin["days_since_service"],
        degradation_rate
    )
    risk_level = physics_engine.classify_risk(failure_prob)
    rul_days   = physics_engine.estimate_rul(
        twin["health_score"], degradation_rate, twin["device_type"]
    )
    critical_component = physics_engine.get_critical_component(
        twin["device_type"], twin["current_load_pct"], twin["current_temp_c"]
    )
    recommended_action = physics_engine.get_recommended_action(
        risk_level, rul_days, critical_component
    )
    degradation_curve = physics_engine.build_degradation_curve(
        twin["health_score"], degradation_rate, 30
    )
    anomalies = failure_predictor.detect_all_anomalies(telemetry)

    # 7-day forecasts
    temp_forecast = failure_predictor.time_series_forecast(telemetry, "temp_c", 7)
    load_forecast = failure_predictor.time_series_forecast(telemetry, "load_pct", 7)

    return {
        "asset_id":   asset_id,
        "twin":       twin,
        "telemetry":  telemetry,
        "predictions": {
            "health_score":         twin["health_score"],
            "failure_probability":  failure_prob,
            "rul_days":             rul_days,
            "risk_level":           risk_level,
            "critical_component":   critical_component,
            "recommended_action":   recommended_action,
            "degradation_rate":     degradation_rate,
            "degradation_curve":    degradation_curve,
        },
        "forecasts": {
            "temp_c_7day":   temp_forecast,
            "load_pct_7day": load_forecast,
        },
        "anomalies": anomalies,
    }


@router.post("/{asset_id}/simulate")
async def run_simulation(asset_id: str, req: SimulateRequest):
    """
    Run a what-if simulation scenario for a digital twin.
    Returns full risk analysis, RUL, degradation curve, and maintenance plan.
    """
    twin = twin_db.get_twin(asset_id)
    if not twin:
        raise HTTPException(status_code=404, detail=f"Digital twin '{asset_id}' not found.")

    # Run physics simulation
    sim_result = physics_engine.simulate_scenario(
        current_state=twin,
        what_if_params={
            "load_pct":           req.load_pct,
            "temp_offset_c":      req.temp_offset_c,
            "vibration_offset_g": req.vibration_offset_g,
            "duration_days":      req.duration_days,
            "scenario_name":      req.scenario_name,
        }
    )

    # Generate maintenance plan
    maintenance_plan = failure_predictor.generate_maintenance_plan(twin, sim_result)
    sim_result["maintenance_plan"] = maintenance_plan

    # Persist simulation result
    sim_id = twin_db.save_simulation(asset_id, sim_result)

    return {
        "sim_id":   sim_id,
        "asset_id": asset_id,
        "twin_state": {
            "device_type":    twin["device_type"],
            "model_number":   twin["model_number"],
            "health_score":   twin["health_score"],
        },
        **sim_result,
        "ran_at": datetime.now().isoformat(),
    }


@router.get("/{asset_id}/simulations")
async def get_simulation_history(asset_id: str):
    """Fetch all past what-if simulation runs for an asset."""
    twin = twin_db.get_twin(asset_id)
    if not twin:
        raise HTTPException(status_code=404, detail=f"Digital twin '{asset_id}' not found.")

    simulations = twin_db.get_simulations(asset_id)
    return {
        "asset_id":    asset_id,
        "simulations": simulations,
        "total":       len(simulations),
    }
