import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Alert, Animated, Platform, Dimensions
} from 'react-native';
import Svg, { Circle, Path, Rect, Defs, LinearGradient, Stop, Line, Polygon } from 'react-native-svg';
import {
  Cpu, Zap, Thermometer, Activity, AlertTriangle, CheckCircle2,
  BarChart2, RefreshCw, Play, Clock, ChevronDown, ChevronUp,
  Shield, TrendingDown, TrendingUp, Sliders
} from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  getDigitalTwin, runWhatIfSimulation, getSimulationHistory,
  getRiskColor, getRiskBgColor,
  TwinFullResponse, SimulationResult
} from '../services/digitalTwinApi';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const formatRUL = (days: number) => {
  if (days >= 365) return '> 1 Year';
  if (days >= 30) return `${Math.floor(days / 30)}mo ${days % 30}d`;
  return `${days} Days`;
};

// ─── Animated Gauge ───────────────────────────────────────────────────────────
const GaugeRing: React.FC<{
  value: number; maxValue: number; label: string; unit: string;
  color: string; size?: number;
}> = ({ value, maxValue, label, unit, color, size = 90 }) => {
  const animVal = useRef(new Animated.Value(0)).current;
  const pct = clamp(value / maxValue, 0, 1);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = pct * circumference;

  useEffect(() => {
    Animated.timing(animVal, { toValue: pct, duration: 1200, useNativeDriver: false }).start();
  }, [pct]);

  return (
    <View style={{ alignItems: 'center', width: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth={8} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={8} fill="none"
          strokeDasharray={`${strokeDash} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color, fontSize: 13, fontWeight: '900' }}>{value.toFixed(1)}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 8, fontWeight: '700' }}>{unit}</Text>
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 }}>
        {label}
      </Text>
    </View>
  );
};

// ─── Sparkline ────────────────────────────────────────────────────────────────
const Sparkline: React.FC<{ data: number[]; color: string; width?: number; height?: number }> =
  ({ data, color, width = 100, height = 30 }) => {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    });
    return (
      <Svg width={width} height={height}>
        <Path d={`M ${pts.join(' L ')}`} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
        <Circle cx={parseFloat(pts[pts.length - 1].split(',')[0])}
          cy={parseFloat(pts[pts.length - 1].split(',')[1])}
          r={3} fill={color} />
      </Svg>
    );
  };

// ─── Degradation Curve ────────────────────────────────────────────────────────
const DegradationChart: React.FC<{ curve: number[]; color: string }> = ({ curve, color }) => {
  if (!curve || curve.length < 2) return null;
  const W = SCREEN_WIDTH - 80;
  const H = 80;
  const min = Math.min(...curve, 0);
  const max = Math.max(...curve, 100);
  const range = max - min || 1;
  const pts = curve.map((v, i) => {
    const x = (i / (curve.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return { x, y };
  });
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${H} L 0 ${H} Z`;

  return (
    <Svg width={W} height={H + 10}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.3} />
          <Stop offset="1" stopColor={color} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <Path d={areaD} fill="url(#grad)" />
      <Path d={pathD} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3} fill={color} opacity={0.8} />
      ))}
    </Svg>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
type DigitalTwinScreenRouteProp = RouteProp<RootStackParamList, 'DigitalTwin'>;

interface Props {
  route: DigitalTwinScreenRouteProp;
  navigation: any;
}

const DigitalTwinScreen: React.FC<Props> = ({ route, navigation }) => {
  const { assetId } = route.params;
  const { theme } = useApp();
  const T = Theme.colors[theme];

  const [loading, setLoading] = useState(true);
  const [twinData, setTwinData] = useState<TwinFullResponse | null>(null);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simHistory, setSimHistory] = useState<SimulationResult[]>([]);
  const [simLoading, setSimLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');

  // What-If Inputs
  const [simLoad, setSimLoad] = useState(80);
  const [simTempOffset, setSimTempOffset] = useState(0);
  const [simDuration, setSimDuration] = useState(7);
  const [simName, setSimName] = useState('Custom Scenario');

  // Pulse animation for CRITICAL state
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const loadTwin = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getDigitalTwin(assetId);
      setTwinData(data);
      setSimLoad(Math.round(data.twin.current_load_pct));
      // Load sim history
      const hist = await getSimulationHistory(assetId);
      setSimHistory(hist.simulations || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load digital twin.');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { loadTwin(); }, [loadTwin]);

  useEffect(() => {
    if (twinData?.predictions?.risk_level === 'CRITICAL') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [twinData?.predictions?.risk_level]);

  const handleRunSimulation = async () => {
    if (!twinData) return;
    try {
      setSimLoading(true);
      setSimResult(null);
      const result = await runWhatIfSimulation(assetId, {
        scenario_name:      simName || 'Custom Scenario',
        load_pct:           simLoad,
        temp_offset_c:      simTempOffset,
        vibration_offset_g: 0,
        duration_days:      simDuration,
      });
      setSimResult(result);
      setSimHistory(prev => [result, ...prev]);
    } catch (e: any) {
      Alert.alert('Simulation Failed', e?.response?.data?.detail || e.message || 'Could not run simulation.');
    } finally {
      setSimLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: T.background }]}>
        <ActivityIndicator size="large" color={T.primary} />
        <Text style={[styles.loadingText, { color: T.muted }]}>SYNCING DIGITAL TWIN...</Text>
      </View>
    );
  }

  if (error || !twinData) {
    return (
      <View style={[styles.centered, { backgroundColor: T.background }]}>
        <AlertTriangle size={36} color={T.danger} />
        <Text style={[styles.errorText, { color: T.danger }]}>{error || 'Twin not found.'}</Text>
        <Pressable style={[styles.retryBtn, { borderColor: T.primary }]} onPress={loadTwin}>
          <RefreshCw size={14} color={T.primary} />
          <Text style={[styles.retryBtnText, { color: T.primary }]}>RETRY</Text>
        </Pressable>
      </View>
    );
  }

  const { twin, predictions, telemetry, anomalies, forecasts } = twinData;
  const riskColor   = getRiskColor(predictions.risk_level);
  const riskBg      = getRiskBgColor(predictions.risk_level);
  const healthPct   = clamp(predictions.health_score, 0, 100);
  const failurePct  = clamp(predictions.failure_probability, 0, 100);
  const healthColor = healthPct > 70 ? T.success : healthPct > 40 ? '#FFD60A' : T.danger;

  // Sparkline data from telemetry
  const tempSeries = telemetry.map(t => t.temp_c).filter(Boolean);
  const loadSeries = telemetry.map(t => t.load_pct).filter(Boolean);
  const vibSeries  = telemetry.map(t => t.vibration_g).filter(Boolean);

  return (
    <ScrollView style={[styles.container, { backgroundColor: T.background }]} contentContainerStyle={styles.content}>

      {/* ── Panel 1: Asset Identity ───────────────────────────────────────── */}
      <View style={[styles.card, { backgroundColor: T.card, borderColor: T.primary }]}>
        <View style={styles.cardHeader}>
          <Cpu size={18} color={T.primary} />
          <Text style={[styles.cardTitle, { color: T.primary }]}>DIGITAL TWIN // ASSET NODE</Text>
          <View style={[styles.syncBadge, { backgroundColor: 'rgba(0,255,102,0.1)', borderColor: T.success }]}>
            <View style={[styles.syncDot, { backgroundColor: T.success }]} />
            <Text style={[styles.syncText, { color: T.success }]}>LIVE</Text>
          </View>
        </View>

        <Text style={[styles.assetType, { color: T.text }]}>{twin.device_type.toUpperCase()}</Text>
        <Text style={[styles.assetModel, { color: T.primary }]}>
          {twin.model_number !== 'Unknown' ? twin.model_number : 'MODEL UNRESOLVED'}
        </Text>
        <Text style={[styles.assetMfg, { color: T.muted }]}>
          MFR: {twin.manufacturer}  ·  ASSET: {assetId.toUpperCase()}
        </Text>
        <Text style={[styles.assetUpdated, { color: T.muted }]}>
          LAST SYNC: {new Date(twin.updated_at).toLocaleString()}
        </Text>

        {/* Asset Health Bar */}
        <View style={styles.healthBarContainer}>
          <View style={styles.healthBarRow}>
            <Text style={[styles.healthLabel, { color: T.muted }]}>ASSET HEALTH</Text>
            <Text style={[styles.healthPct, { color: healthColor }]}>{healthPct.toFixed(1)}%</Text>
          </View>
          <View style={[styles.healthBarBg, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
            <View style={[styles.healthBarFill, { width: `${healthPct}%`, backgroundColor: healthColor }]} />
          </View>
        </View>
      </View>

      {/* ── Panel 2: Live Telemetry HUD ───────────────────────────────────── */}
      <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <View style={styles.cardHeader}>
          <Activity size={15} color={T.info} />
          <Text style={[styles.cardTitle, { color: T.text }]}>LIVE TELEMETRY HUD</Text>
        </View>

        <View style={styles.gaugesRow}>
          <GaugeRing value={twin.current_load_pct}     maxValue={150} label="LOAD"      unit="%" color={twin.current_load_pct > 100 ? T.danger : T.info} />
          <GaugeRing value={twin.current_temp_c}       maxValue={120} label="TEMP"      unit="°C" color={twin.current_temp_c > 80 ? T.danger : '#FFD60A'} />
          <GaugeRing value={twin.current_vibration_g}  maxValue={8}   label="VIBRATION" unit="G"  color={twin.current_vibration_g > 3 ? T.danger : T.success} />
        </View>

        {/* Sparklines */}
        <View style={styles.sparklineRow}>
          {[
            { data: loadSeries, color: T.info,    label: 'LOAD TREND' },
            { data: tempSeries, color: '#FFD60A',  label: 'TEMP TREND' },
            { data: vibSeries,  color: T.success,  label: 'VIB TREND' },
          ].map((s, i) => (
            <View key={i} style={styles.sparklineBlock}>
              <Text style={[styles.sparklineLabel, { color: T.muted }]}>{s.label}</Text>
              <Sparkline data={s.data} color={s.color} width={80} height={28} />
            </View>
          ))}
        </View>

        {/* Anomaly Alerts */}
        {anomalies.length > 0 && (
          <View style={[styles.anomalyBanner, { backgroundColor: 'rgba(255,59,59,0.08)', borderColor: T.danger }]}>
            <AlertTriangle size={13} color={T.danger} />
            <Text style={[styles.anomalyText, { color: T.danger }]}>
              {anomalies.length} ANOMAL{anomalies.length === 1 ? 'Y' : 'IES'} DETECTED
            </Text>
            <Text style={[styles.anomalyDetail, { color: T.muted }]}>
              {anomalies[0]?.metric?.toUpperCase()} spike @ z={anomalies[0]?.z_score}σ
            </Text>
          </View>
        )}
      </View>

      {/* ── Panel 3: Failure Risk Gauge ───────────────────────────────────── */}
      <Animated.View style={[styles.card, {
        backgroundColor: riskBg,
        borderColor: riskColor,
        borderWidth: 1.5,
        transform: [{ scale: pulseAnim }],
      }]}>
        <View style={styles.cardHeader}>
          <Shield size={15} color={riskColor} />
          <Text style={[styles.cardTitle, { color: riskColor }]}>FAILURE RISK ANALYSIS</Text>
          <View style={[styles.riskLevelBadge, { backgroundColor: riskBg, borderColor: riskColor }]}>
            <Text style={[styles.riskLevelText, { color: riskColor }]}>{predictions.risk_level}</Text>
          </View>
        </View>

        <View style={styles.riskGaugeRow}>
          {/* Big failure % ring */}
          <GaugeRing value={failurePct} maxValue={100} label="FAILURE RISK" unit="%" color={riskColor} size={110} />

          <View style={styles.riskDetails}>
            <View style={styles.riskRow}>
              <Clock size={13} color={T.muted} />
              <View style={{ marginLeft: 8 }}>
                <Text style={[styles.riskRowLabel, { color: T.muted }]}>RUL REMAINING</Text>
                <Text style={[styles.riskRowValue, { color: riskColor }]}>
                  ⚠ {formatRUL(predictions.rul_days)}
                </Text>
              </View>
            </View>
            <View style={[styles.riskRow, { marginTop: 10 }]}>
              <AlertTriangle size={13} color={T.muted} />
              <View style={{ marginLeft: 8 }}>
                <Text style={[styles.riskRowLabel, { color: T.muted }]}>CRITICAL PART</Text>
                <Text style={[styles.riskRowValue, { color: T.text }]}>{predictions.critical_component}</Text>
              </View>
            </View>
            <View style={[styles.riskRow, { marginTop: 10 }]}>
              <TrendingDown size={13} color={T.muted} />
              <View style={{ marginLeft: 8 }}>
                <Text style={[styles.riskRowLabel, { color: T.muted }]}>DEGRAD RATE</Text>
                <Text style={[styles.riskRowValue, { color: T.text }]}>{predictions.degradation_rate.toFixed(3)}%/day</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={[styles.recommendedAction, { color: T.text, backgroundColor: 'rgba(0,0,0,0.25)', borderColor: riskColor }]}>
          {predictions.recommended_action}
        </Text>

        {/* 30-day degradation curve */}
        {predictions.degradation_curve?.length > 1 && (
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.curveLabel, { color: T.muted }]}>30-DAY HEALTH PROJECTION</Text>
            <DegradationChart curve={predictions.degradation_curve} color={riskColor} />
          </View>
        )}
      </Animated.View>

      {/* ── Panel 4: What-If Simulator ────────────────────────────────────── */}
      <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <View style={styles.cardHeader}>
          <Sliders size={15} color={T.primary} />
          <Text style={[styles.cardTitle, { color: T.primary }]}>WHAT-IF SIMULATOR</Text>
        </View>
        <Text style={[styles.simDesc, { color: T.muted }]}>
          Adjust parameters and run a physics simulation to predict failure risk under different conditions.
        </Text>

        {/* Load Slider */}
        <View style={styles.controlRow}>
          <Text style={[styles.controlLabel, { color: T.text }]}>LOAD</Text>
          <Text style={[styles.controlValue, { color: simLoad > 100 ? T.danger : T.info }]}>{simLoad}%</Text>
        </View>
        <View style={styles.sliderTrack}>
          {[50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150].map(val => (
            <Pressable
              key={val}
              onPress={() => setSimLoad(val)}
              style={[styles.sliderStep, {
                backgroundColor: simLoad >= val
                  ? (val > 100 ? T.danger : T.primary)
                  : 'rgba(255,255,255,0.08)',
                borderRadius: 4,
              }]}
            />
          ))}
        </View>
        <View style={styles.sliderLabels}>
          <Text style={[styles.sliderLabel, { color: T.muted }]}>50%</Text>
          <Text style={[styles.sliderLabel, { color: T.muted }]}>100%</Text>
          <Text style={[styles.sliderLabel, { color: T.danger }]}>150%</Text>
        </View>

        {/* Temp Offset */}
        <View style={[styles.controlRow, { marginTop: 16 }]}>
          <Text style={[styles.controlLabel, { color: T.text }]}>TEMP OFFSET</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={[styles.stepperBtn, { borderColor: T.border }]}
              onPress={() => setSimTempOffset(v => Math.max(-20, v - 5))}
            >
              <Text style={[styles.stepperBtnText, { color: T.text }]}>−</Text>
            </Pressable>
            <Text style={[styles.stepperValue, { color: simTempOffset > 0 ? '#FFD60A' : T.text }]}>
              {simTempOffset >= 0 ? '+' : ''}{simTempOffset}°C
            </Text>
            <Pressable
              style={[styles.stepperBtn, { borderColor: T.border }]}
              onPress={() => setSimTempOffset(v => Math.min(80, v + 5))}
            >
              <Text style={[styles.stepperBtnText, { color: T.text }]}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* Duration */}
        <View style={[styles.controlRow, { marginTop: 12 }]}>
          <Text style={[styles.controlLabel, { color: T.text }]}>DURATION</Text>
          <View style={styles.durationChips}>
            {[1, 3, 7, 14, 30, 90].map(d => (
              <Pressable
                key={d}
                style={[styles.durationChip, {
                  backgroundColor: simDuration === d ? T.primary : 'rgba(255,255,255,0.06)',
                  borderColor: simDuration === d ? T.primary : T.border,
                }]}
                onPress={() => setSimDuration(d)}
              >
                <Text style={[styles.durationChipText, { color: simDuration === d ? '#000' : T.muted }]}>
                  {d}d
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Run Button */}
        <Pressable
          style={({ pressed }) => [styles.runBtn, {
            backgroundColor: simLoading ? 'rgba(0,240,255,0.05)' : 'rgba(0,240,255,0.12)',
            borderColor: T.primary,
            opacity: pressed ? 0.8 : 1,
          }]}
          onPress={handleRunSimulation}
          disabled={simLoading}
        >
          {simLoading ? (
            <ActivityIndicator size="small" color={T.primary} />
          ) : (
            <Play size={16} color={T.primary} />
          )}
          <Text style={[styles.runBtnText, { color: T.primary }]}>
            {simLoading ? 'SIMULATING...' : '▶ RUN SIMULATION'}
          </Text>
        </Pressable>

        {/* Simulation Result Card */}
        {simResult && (
          <View style={[styles.simResultCard, {
            backgroundColor: getRiskBgColor(simResult.risk_level),
            borderColor: getRiskColor(simResult.risk_level),
          }]}>
            <Text style={[styles.simResultTitle, { color: getRiskColor(simResult.risk_level) }]}>
              SIMULATION RESULT — {simResult.scenario_name?.toUpperCase()}
            </Text>

            <View style={styles.simResultGrid}>
              <View style={styles.simResultItem}>
                <Text style={[styles.simResultLabel, { color: T.muted }]}>FAILURE RISK</Text>
                <Text style={[styles.simResultBigVal, { color: getRiskColor(simResult.risk_level) }]}>
                  {simResult.failure_probability}%
                </Text>
              </View>
              <View style={styles.simResultItem}>
                <Text style={[styles.simResultLabel, { color: T.muted }]}>RUL</Text>
                <Text style={[styles.simResultBigVal, { color: T.text }]}>
                  {formatRUL(simResult.rul_days)}
                </Text>
              </View>
            </View>

            <View style={styles.simResultRow}>
              <Text style={[styles.simResultLabel, { color: T.muted }]}>CRITICAL PART</Text>
              <Text style={[styles.simResultVal, { color: T.text }]}>{simResult.critical_component}</Text>
            </View>
            <View style={styles.simResultRow}>
              <Text style={[styles.simResultLabel, { color: T.muted }]}>RISK LEVEL</Text>
              <View style={[styles.riskLevelBadge, { borderColor: getRiskColor(simResult.risk_level), backgroundColor: getRiskBgColor(simResult.risk_level) }]}>
                <Text style={[styles.riskLevelText, { color: getRiskColor(simResult.risk_level) }]}>{simResult.risk_level}</Text>
              </View>
            </View>

            <Text style={[styles.simAction, { color: T.text }]}>{simResult.recommended_action}</Text>

            {/* Degradation Curve */}
            {simResult.degradation_curve?.length > 1 && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.curveLabel, { color: T.muted }]}>PROJECTED HEALTH CURVE ({simResult.duration_days} DAYS)</Text>
                <DegradationChart curve={simResult.degradation_curve} color={getRiskColor(simResult.risk_level)} />
              </View>
            )}

            {/* Maintenance Plan */}
            {simResult.maintenance_plan && (
              <View style={[styles.planCard, { borderColor: T.border }]}>
                <Text style={[styles.planTitle, { color: T.text }]}>MAINTENANCE PLAN</Text>
                {simResult.maintenance_plan.immediate_actions?.map((action, i) => (
                  <View key={i} style={styles.planItem}>
                    <View style={[styles.planDot, { backgroundColor: getRiskColor(simResult.risk_level) }]} />
                    <Text style={[styles.planActionText, { color: T.muted }]}>{action}</Text>
                  </View>
                ))}
                <View style={[styles.planFooter, { borderTopColor: T.border }]}>
                  <Text style={[styles.planCostText, { color: T.success }]}>
                    💰 SAVES {simResult.maintenance_plan.estimated_cost_saving}
                  </Text>
                  <Text style={[styles.planHoursText, { color: T.muted }]}>
                    {simResult.maintenance_plan.downtime_prevented_hours}h downtime prevented
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Panel 5: Simulation History ───────────────────────────────────── */}
      {simHistory.length > 0 && (
        <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <Pressable
            style={styles.cardHeader}
            onPress={() => setShowHistory(h => !h)}
          >
            <BarChart2 size={15} color={T.muted} />
            <Text style={[styles.cardTitle, { color: T.text }]}>SIMULATION HISTORY ({simHistory.length})</Text>
            {showHistory ? <ChevronUp size={16} color={T.muted} /> : <ChevronDown size={16} color={T.muted} />}
          </Pressable>

          {showHistory && simHistory.map((sim, i) => (
            <View key={i} style={[styles.historyItem, {
              borderColor: getRiskColor(sim.risk_level),
              backgroundColor: getRiskBgColor(sim.risk_level),
            }]}>
              <View style={styles.historyHeader}>
                <Text style={[styles.historyName, { color: T.text }]}>{sim.scenario_name}</Text>
                <Text style={[styles.historyRisk, { color: getRiskColor(sim.risk_level) }]}>
                  {sim.risk_level} · {sim.failure_probability}%
                </Text>
              </View>
              <Text style={[styles.historyDetail, { color: T.muted }]}>
                Load: {sim.load_pct}% · RUL: {formatRUL(sim.rul_days)} · Duration: {sim.duration_days}d
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Refresh button */}
      <Pressable style={[styles.refreshBtn, { borderColor: T.border }]} onPress={loadTwin}>
        <RefreshCw size={14} color={T.muted} />
        <Text style={[styles.refreshText, { color: T.muted }]}>REFRESH TWIN DATA</Text>
      </Pressable>

    </ScrollView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 32 },
  loadingText: { fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 12 },
  errorText: { fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20, marginTop: 8 },
  retryBtnText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  card: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 16, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle: { flex: 1, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  syncText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },

  assetType: { fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  assetModel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
  assetMfg: { fontSize: 11, marginTop: 4 },
  assetUpdated: { fontSize: 9, marginTop: 2 },

  healthBarContainer: { marginTop: 14 },
  healthBarRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  healthLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  healthPct: { fontSize: 12, fontWeight: '900' },
  healthBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  healthBarFill: { height: '100%', borderRadius: 3 },

  gaugesRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  sparklineRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
  sparklineBlock: { alignItems: 'center', gap: 4 },
  sparklineLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },

  anomalyBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 12, flexWrap: 'wrap' },
  anomalyText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  anomalyDetail: { fontSize: 9, marginLeft: 2 },

  riskGaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 12 },
  riskDetails: { flex: 1 },
  riskRow: { flexDirection: 'row', alignItems: 'center' },
  riskRowLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  riskRowValue: { fontSize: 13, fontWeight: '900' },

  riskLevelBadge: { borderWidth: 1, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  riskLevelText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },

  recommendedAction: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 4 },
  curveLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },

  simDesc: { fontSize: 11, lineHeight: 16, marginBottom: 16 },

  controlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  controlLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  controlValue: { fontSize: 16, fontWeight: '900' },

  sliderTrack: { flexDirection: 'row', gap: 3, height: 24, alignItems: 'center', marginBottom: 4 },
  sliderStep: { flex: 1, height: 20 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabel: { fontSize: 9, fontWeight: '700' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperBtn: { width: 32, height: 32, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  stepperBtnText: { fontSize: 18, fontWeight: '300', lineHeight: 22 },
  stepperValue: { fontSize: 15, fontWeight: '900', minWidth: 60, textAlign: 'center' },

  durationChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  durationChip: { borderWidth: 1, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  durationChipText: { fontSize: 10, fontWeight: '800' },

  runBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 50, borderWidth: 1.5, borderRadius: 12, marginTop: 20,
    ...Platform.select({ web: { cursor: 'pointer' } as any })
  },
  runBtnText: { fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },

  simResultCard: { borderWidth: 1.5, borderRadius: 14, padding: 16, marginTop: 16 },
  simResultTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 12 },
  simResultGrid: { flexDirection: 'row', gap: 24, marginBottom: 10 },
  simResultItem: { alignItems: 'center' },
  simResultLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  simResultBigVal: { fontSize: 26, fontWeight: '900' },
  simResultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  simResultVal: { fontSize: 13, fontWeight: '800' },
  simAction: { fontSize: 11, fontWeight: '700', marginTop: 10, lineHeight: 16 },

  planCard: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 14 },
  planTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 10 },
  planItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  planDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  planActionText: { flex: 1, fontSize: 11, lineHeight: 16 },
  planFooter: { borderTopWidth: 1, paddingTop: 8, marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  planCostText: { fontSize: 11, fontWeight: '900' },
  planHoursText: { fontSize: 10 },

  historyItem: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  historyName: { fontSize: 12, fontWeight: '800' },
  historyRisk: { fontSize: 11, fontWeight: '900' },
  historyDetail: { fontSize: 10 },

  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 4 },
  refreshText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});

export default DigitalTwinScreen;
