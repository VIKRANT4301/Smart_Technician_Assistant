/**
 * Digital Twin API Service
 * Handles all /digital-twin/* API calls for the Smart Technician Assistant.
 */
import axios from 'axios';
import { getBackendUrl } from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DigitalTwin {
  asset_id: string;
  device_type: string;
  model_number: string;
  manufacturer: string;
  current_load_pct: number;
  current_temp_c: number;
  current_vibration_g: number;
  current_pressure_bar: number;
  health_score: number;
  days_since_service: number;
  image_url?: string;
  telemetry_history: any[];
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface TwinPredictions {
  health_score: number;
  failure_probability: number;
  rul_days: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  critical_component: string;
  recommended_action: string;
  degradation_rate: number;
  degradation_curve: number[];
}

export interface TelemetrySnapshot {
  id: number;
  asset_id: string;
  timestamp: string;
  load_pct: number;
  temp_c: number;
  vibration_g: number;
  pressure_bar: number;
  health_score: number;
  anomaly_flags: any[];
}

export interface AnomalyAlert {
  timestamp: string;
  metric: string;
  value: number;
  z_score: number;
  severity: 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface MaintenancePlan {
  risk_level: string;
  critical_component: string;
  immediate_actions: string[];
  scheduled_actions: Array<{ day: number; action: string }>;
  estimated_cost_saving: string;
  downtime_prevented_hours: number;
  next_service_in_days: number;
  generated_at: string;
}

export interface SimulationResult {
  sim_id?: string;
  asset_id?: string;
  scenario_name: string;
  load_pct: number;
  temp_offset_c: number;
  vibration_offset_g: number;
  duration_days: number;
  failure_probability: number;
  rul_days: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  critical_component: string;
  recommended_action: string;
  degradation_curve: number[];
  projected_health: number;
  degradation_rate: number;
  maintenance_plan: MaintenancePlan;
  ran_at?: string;
}

export interface TwinFullResponse {
  asset_id: string;
  twin: DigitalTwin;
  telemetry: TelemetrySnapshot[];
  predictions: TwinPredictions;
  forecasts: {
    temp_c_7day: number[];
    load_pct_7day: number[];
  };
  anomalies: AnomalyAlert[];
}

export interface SimulateParams {
  scenario_name?: string;
  load_pct: number;
  temp_offset_c: number;
  vibration_offset_g: number;
  duration_days: number;
}

// ─── API Calls ───────────────────────────────────────────────────────────────

/**
 * Fetch a digital twin with live predictions, telemetry and anomalies.
 */
export const getDigitalTwin = async (assetId: string): Promise<TwinFullResponse> => {
  const response = await axios.get(`${getBackendUrl()}/digital-twin/${assetId}`);
  return response.data;
};

/**
 * List all registered digital twins.
 */
export const listDigitalTwins = async (): Promise<{ twins: DigitalTwin[]; total: number }> => {
  const response = await axios.get(`${getBackendUrl()}/digital-twin/list`);
  return response.data;
};

/**
 * Run a what-if simulation scenario.
 */
export const runWhatIfSimulation = async (
  assetId: string,
  params: SimulateParams
): Promise<SimulationResult> => {
  const response = await axios.post(
    `${getBackendUrl()}/digital-twin/${assetId}/simulate`,
    params,
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
};

/**
 * Fetch past simulation history for an asset.
 */
export const getSimulationHistory = async (
  assetId: string
): Promise<{ simulations: SimulationResult[]; total: number }> => {
  const response = await axios.get(`${getBackendUrl()}/digital-twin/${assetId}/simulations`);
  return response.data;
};

/**
 * Create or update a digital twin from an analyze result.
 */
export const createDigitalTwin = async (data: {
  asset_id?: string;
  device_type: string;
  model_number: string;
  manufacturer: string;
  image_url?: string;
  detected_issue?: string;
  visual_findings?: string;
}): Promise<{ asset_id: string; twin: DigitalTwin; predictions: TwinPredictions }> => {
  const response = await axios.post(
    `${getBackendUrl()}/digital-twin/create`,
    data,
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const getRiskColor = (riskLevel: string): string => {
  switch (riskLevel) {
    case 'CRITICAL': return '#FF3B3B';
    case 'HIGH':     return '#FF9500';
    case 'MEDIUM':   return '#FFD60A';
    case 'LOW':      return '#30D158';
    default:         return '#636366';
  }
};

export const getRiskBgColor = (riskLevel: string): string => {
  switch (riskLevel) {
    case 'CRITICAL': return 'rgba(255, 59, 59, 0.12)';
    case 'HIGH':     return 'rgba(255, 149, 0, 0.12)';
    case 'MEDIUM':   return 'rgba(255, 214, 10, 0.12)';
    case 'LOW':      return 'rgba(48, 209, 88, 0.12)';
    default:         return 'rgba(99, 99, 102, 0.12)';
  }
};
