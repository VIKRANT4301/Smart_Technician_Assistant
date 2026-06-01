import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Image, Platform } from 'react-native';
import { Audio } from 'expo-av';
import Svg, { Circle, Rect, Path, G, Line, Text as SvgText } from 'react-native-svg';
import { Play, Pause, AlertTriangle, CheckSquare, Square, Volume2, ShieldAlert, Cpu, HeartHandshake, Eye, ChevronDown, ChevronUp, Star, Sliders } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { submitFeedback, generateAlternativeSolution } from '../services/api';

type ResultScreenRouteProp = RouteProp<RootStackParamList, 'Result'>;

interface Props {
  route: ResultScreenRouteProp;
  navigation: any;
}

const ResultScreen: React.FC<Props> = ({ route, navigation }) => {
  const { theme, backendUrl } = useApp();
  const activeTheme = Theme.colors[theme];

  // Dynamic state to support reloading alternative results
  const [currentResult, setCurrentResult] = useState(route.params.analysisResult);
  
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  // Interactive feedback states
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [userRating, setUserRating] = useState(5);
  const [repairDuration, setRepairDuration] = useState(15);

  // Destructure variables from local currentResult state
  const {
    session_id = null,
    detected_issue = 'Unidentified Issue',
    confidence = 'N/A',
    confidence_score = 'N/A',
    repair_success_probability = 'N/A',
    severity_level = 'Medium',
    root_cause_rankings = [],
    reasoning_explanation = '',
    root_cause = '',
    suggested_steps = [],
    safety_recommendations = 'Please proceed with general safety precautions.',
    tts_audio_url = null,
    image_url = null,
    query_text = '',
    feedback_request = 'Did this solution resolve the issue?',
    inference_node = 'LOCAL HEURISTIC RULES',
    response_allowed = true,
    explainable_ai_justification = {
      evidence_chain: [],
      confidence_calculation: '',
      model_reasoning_limits: ''
    },
    telemetry = {
      remaining_useful_life: '',
      vibration_deviation: [],
      temperature_logs: []
    },
    enterprise_integrations = {
      sap_work_order: '',
      maximo_asset_id: '',
      servicenow_incident: '',
      sync_status: ''
    }
  } = currentResult;

  // Unload sound when unmounting
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const handlePlayVoice = async () => {
    if (!tts_audio_url) {
      Alert.alert('Audio Unavailable', 'No voice guide was generated for this report.');
      return;
    }

    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
      return;
    }

    let formattedUrl = tts_audio_url;
    if (formattedUrl.startsWith('/static/')) {
      formattedUrl = formattedUrl.replace('/static/', '');
    }
    const fullAudioUrl = `${backendUrl}/static/${formattedUrl}`;

    setLoadingAudio(true);
    try {
      console.log(`[Result] Loading TTS Audio: ${fullAudioUrl}`);
      
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: fullAudioUrl },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });

    } catch (e: any) {
      console.log('[Result] Audio load failed:', e);
      Alert.alert('Audio Error', 'Failed to play generated voice file. Ensure backend is running.');
    } finally {
      setLoadingAudio(false);
    }
  };

  const toggleStep = (index: number) => {
    setCompletedSteps(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const toggleExpand = (index: number) => {
    setExpandedStep(prev => (prev === index ? null : index));
  };

  const handleRepairSuccess = async () => {
    if (!session_id) {
      navigation.navigate('MainTabs', { screen: 'HomeTab' });
      return;
    }

    setSubmittingFeedback(true);
    try {
      await submitFeedback({
        session_id,
        was_successful: true,
        user_rating: userRating,
        repair_duration: repairDuration
      });
      setShowRatingModal(false);
      Alert.alert('Feedback Logged', 'Worklog saved. Case closed successfully!', [
        { text: 'OK', onPress: () => navigation.navigate('MainTabs', { screen: 'HomeTab' }) }
      ]);
    } catch (error) {
      console.log('[ResultScreen] Feedback submit failed:', error);
      Alert.alert('Network Error', 'Failed to submit feedback to server.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleRepairFailed = async () => {
    if (!session_id) {
      Alert.alert('Session Error', 'No active session found.');
      return;
    }

    // Stop current audio guide
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch (err) {
        console.log('[ResultScreen] Audio unload error:', err);
      }
      setSound(null);
      setIsPlaying(false);
    }

    setSubmittingFeedback(true);
    try {
      // 1. Submit negative feedback
      await submitFeedback({
        session_id,
        was_successful: false,
        user_rating: 3,
        repair_duration: repairDuration
      });

      // 2. Generate alternative solution from backend memory
      const alternative = await generateAlternativeSolution({ session_id });
      
      // 3. Set the new dynamic state
      setCurrentResult(alternative);
      setCompletedSteps({});
      setExpandedStep(null);
      
      Alert.alert(
        'Alternative Generated', 
        'The AI has excluded the failed steps, re-ranked the root causes, and generated an alternative troubleshooting flow.'
      );
    } catch (error) {
      console.log('[ResultScreen] Alternative solution error:', error);
      Alert.alert('Error', 'Failed to generate alternative steps. Ensure backend is running.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const getSeverityColor = (level: string) => {
    const l = level.toLowerCase();
    if (l === 'critical') return '#EF4444';
    if (l === 'high') return '#F97316';
    if (l === 'medium') return '#EAB308';
    return '#10B981'; // low
  };

  const confidencePercent = parseInt(confidence_score || confidence) || 75;

  // Gauge color based on confidence level
  const getGaugeColor = (pct: number) => {
    if (pct >= 85) return activeTheme.success;
    if (pct >= 70) return activeTheme.warning;
    return activeTheme.danger;
  };
  const activeGaugeColor = getGaugeColor(confidencePercent);

  // SVG Radial Progress math
  const svgSize = 84;
  const strokeWidth = 6;
  const radius = (svgSize - strokeWidth) / 2;
  const circum = radius * 2 * Math.PI;
  const strokeDashoffset = circum - (confidencePercent / 100) * circum;

  // Simulated SOP details for expansion
  const getStepDetails = (index: number) => {
    const details = [
      { tools: 'Insulation Gloves, Multimeter, LOTO Tag', estTime: '15 Mins', difficulty: 'MODERATE' },
      { tools: 'Pneumatic wrench, descaling cleaner fluid, wire brush', estTime: '20 Mins', difficulty: 'HIGH' },
      { tools: 'Shaft alignment laser tool, replacement gasket', estTime: '30 Mins', difficulty: 'MODERATE' },
      { tools: 'Standard screwdriver, dry clean cloth', estTime: '10 Mins', difficulty: 'LOW' }
    ];
    return details[index % details.length];
  };

  const renderActiveNodeBadge = (node: string) => {
    if (!node) return null;
    
    let color = '#00F0FF'; // default cyan for Gemini
    let bgGlow = 'rgba(0, 240, 255, 0.1)';
    const nodeUpper = node.toUpperCase();
    
    if (nodeUpper.includes('GEMINI')) {
      color = '#00F0FF';
      bgGlow = 'rgba(0, 240, 255, 0.1)';
    } else if (nodeUpper.includes('OLLAMA') || nodeUpper.includes('EDGE')) {
      color = '#F59E0B'; // Amber
      bgGlow = 'rgba(245, 158, 11, 0.1)';
    } else if (nodeUpper.includes('HEURISTIC') || nodeUpper.includes('LOCAL')) {
      color = '#EF4444'; // Red/Warning
      bgGlow = 'rgba(239, 68, 68, 0.1)';
    }
    
    return (
      <View style={[styles.activeNodeOuter, { borderColor: color }]}>
        <View style={[styles.activeNodeInner, { borderColor: color, backgroundColor: bgGlow }]}>
          <Cpu size={12} color={color} style={{ marginRight: 6 }} />
          <Text style={[styles.activeNodeText, { color, textShadowColor: color, textShadowRadius: 6 }]}>
            {`[ ${nodeUpper} ]`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: activeTheme.background }}>
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {renderActiveNodeBadge(inference_node)}
        {/* Top Image Preview with Bounding Box Overlay */}
        {image_url && (
          <View style={[styles.imageContainer, { borderColor: '#00F0FF', borderWidth: 2 }]}>
            <Image 
              source={{ uri: image_url.startsWith('http') ? image_url : `${backendUrl}${image_url}` }} 
              style={styles.headerImage as any} 
            />
            {/* Holographic Diagnostic Reticle HUD Overlays */}
            <View style={styles.hudCornerTL} />
            <View style={styles.hudCornerTR} />
            <View style={styles.hudCornerBL} />
            <View style={styles.hudCornerBR} />
            <View style={styles.hudScanline} />
            
            {/* Real Fault Hotspot Box Overlay (Simulated fallbacks removed if drawn on backend) */}
            {!image_url.includes('annotated_') && (
              <View style={[styles.faultHotspot, { borderColor: activeTheme.danger, borderWidth: 2.5 }]}>
                <View style={[styles.faultHotspotLabel, { backgroundColor: activeTheme.danger }]}>
                  <Text style={styles.faultHotspotLabelText}>ANOMALY TARGET DETECTED</Text>
                </View>
              </View>
            )}

            <View style={[styles.imageOverlay, { backgroundColor: 'rgba(0, 240, 255, 0.15)', borderTopColor: '#00F0FF', borderTopWidth: 1.5 }]}>
              <Text style={[styles.imageLabel, { color: '#00F0FF', fontWeight: '900', letterSpacing: 2.5 }]}>
                HOLOGRAPHIC CAMERA DIAGNOSTIC FEED // COGNITIVE SCAN
              </Text>
            </View>
          </View>
        )}

        {/* Main Issue Header Card with Severity Badge */}
        <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
          <View style={styles.headerRow}>
            <View style={styles.titleContainer}>
              <View style={styles.tagRow}>
                <Text style={[styles.tag, { color: activeTheme.primary }]}>CLASSIFIED FAULT NODE</Text>
                <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(severity_level) }]}>
                  <Text style={styles.severityText}>{severity_level.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={[styles.issueTitle, { color: activeTheme.text }]}>{detected_issue}</Text>
            </View>
            
            {/* Circular SVG Confidence Progress Ring */}
            <View style={styles.radialGaugeContainer}>
              <Svg width={svgSize} height={svgSize}>
                {/* Outer tracking ring */}
                <Circle
                  stroke="rgba(0, 240, 255, 0.08)"
                  fill="transparent"
                  strokeWidth={strokeWidth}
                  r={radius}
                  cx={svgSize / 2}
                  cy={svgSize / 2}
                />
                <Circle
                  stroke={activeGaugeColor}
                  fill="transparent"
                  strokeWidth={strokeWidth}
                  strokeDasharray={circum}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  r={radius}
                  cx={svgSize / 2}
                  cy={svgSize / 2}
                  transform={`rotate(-90 ${svgSize / 2} ${svgSize / 2})`}
                />
                {/* Inner dashed dial ring */}
                <Circle
                  stroke={activeTheme.info}
                  fill="transparent"
                  strokeWidth={1.5}
                  strokeDasharray="4, 4"
                  r={radius - 6}
                  cx={svgSize / 2}
                  cy={svgSize / 2}
                  opacity={0.6}
                />
                {/* Outer HUD Telemetry Ticks */}
                {Array.from({ length: 8 }).map((_, i) => {
                  const angle = (i * 45 * Math.PI) / 180;
                  const x1 = (svgSize / 2) + (radius + 2) * Math.cos(angle);
                  const y1 = (svgSize / 2) + (radius + 2) * Math.sin(angle);
                  const x2 = (svgSize / 2) + (radius + 6) * Math.cos(angle);
                  const y2 = (svgSize / 2) + (radius + 6) * Math.sin(angle);
                  return (
                    <Line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={activeGaugeColor}
                      strokeWidth={1.5}
                      opacity={0.6}
                    />
                  );
                })}
              </Svg>
              <View style={styles.gaugeTextWrapper}>
                <Text style={[styles.radialVal, { color: activeGaugeColor, textShadowColor: activeGaugeColor, textShadowRadius: 6 }]}>{confidencePercent}%</Text>
                <Text style={[styles.radialLabel, { color: activeGaugeColor, fontSize: 6, fontWeight: '900', letterSpacing: 1 }]}>COGNITIVE</Text>
              </View>
            </View>
          </View>

          {query_text ? (
            <View style={[styles.queryContext, { backgroundColor: activeTheme.background }]}>
              <Text style={[styles.queryLabel, { color: activeTheme.muted }]}>TRANSCRIPTION SEED:</Text>
              <Text style={[styles.queryVal, { color: activeTheme.text }]}>"{query_text}"</Text>
            </View>
          ) : null}
        </View>

        {/* Enterprise System Synchronization HUD */}
        {enterprise_integrations && (enterprise_integrations.sap_work_order || enterprise_integrations.maximo_asset_id) ? (
          <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
            <View style={styles.sectionHeader}>
              <HeartHandshake size={16} color={activeTheme.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.sectionTitle, { color: activeTheme.text }]}>ENTERPRISE INTEGRATION CODES</Text>
            </View>
            <Text style={[styles.cardSubText, { color: activeTheme.muted, marginBottom: 12 }]}>
              Bi-directional ERP work logs synchronization status.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {enterprise_integrations.sap_work_order && (
                <View style={{ backgroundColor: 'rgba(56, 189, 248, 0.06)', borderWidth: 1, borderColor: activeTheme.info, borderRadius: 8, padding: 10, flex: 1, minWidth: 100 }}>
                  <Text style={{ fontSize: 8, fontWeight: '800', color: activeTheme.muted }}>SAP WORK ORDER</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: activeTheme.text, marginTop: 2 }}>{enterprise_integrations.sap_work_order}</Text>
                  <Text style={{ fontSize: 8, color: activeTheme.success, marginTop: 4, fontWeight: '900' }}>✓ SYNC ACTIVE</Text>
                </View>
              )}
              {enterprise_integrations.maximo_asset_id && (
                <View style={{ backgroundColor: 'rgba(0, 240, 255, 0.06)', borderWidth: 1, borderColor: activeTheme.primary, borderRadius: 8, padding: 10, flex: 1, minWidth: 100 }}>
                  <Text style={{ fontSize: 8, fontWeight: '800', color: activeTheme.muted }}>IBM MAXIMO ASSET</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: activeTheme.text, marginTop: 2 }}>{enterprise_integrations.maximo_asset_id}</Text>
                  <Text style={{ fontSize: 8, color: activeTheme.success, marginTop: 4, fontWeight: '900' }}>✓ SYNC ACTIVE</Text>
                </View>
              )}
              {enterprise_integrations.servicenow_incident && (
                <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.06)', borderWidth: 1, borderColor: activeTheme.danger, borderRadius: 8, padding: 10, flex: 1, minWidth: 100 }}>
                  <Text style={{ fontSize: 8, fontWeight: '800', color: activeTheme.muted }}>SERVICENOW TICKET</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: activeTheme.text, marginTop: 2 }}>{enterprise_integrations.servicenow_incident}</Text>
                  <Text style={{ fontSize: 8, color: enterprise_integrations.sync_status === 'Escalated' ? activeTheme.danger : activeTheme.success, marginTop: 4, fontWeight: '900' }}>
                    ● STATUS: {enterprise_integrations.sync_status.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        {/* Real-time Telemetry & Remaining Useful Life HUD */}
        {telemetry && telemetry.remaining_useful_life ? (
          <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
            <View style={styles.sectionHeader}>
              <Sliders size={16} color={activeTheme.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.sectionTitle, { color: activeTheme.text }]}>LIVE ASSET TELEMETRY & FORECASTS</Text>
            </View>
            <Text style={[styles.cardSubText, { color: activeTheme.muted, marginBottom: 12 }]}>
              Continuous sensor analytics and Remaining Useful Life (RUL) predictive trends.
            </Text>

            {/* RUL Progress Bar */}
            <View style={{ marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: activeTheme.text }}>REMAINING USEFUL LIFE (RUL)</Text>
                <Text style={{ fontSize: 12, fontWeight: '900', color: activeTheme.primary }}>{telemetry.remaining_useful_life}</Text>
              </View>
              <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                <View 
                  style={{ 
                    height: '100%', 
                    width: telemetry.remaining_useful_life, 
                    backgroundColor: parseInt(telemetry.remaining_useful_life) > 75 ? activeTheme.success : activeTheme.warning 
                  }} 
                />
              </View>
              <Text style={{ fontSize: 8, color: activeTheme.muted, marginTop: 4 }}>AI PREDICTIVE FAILURE ESTIMATION WINDOW: +180 DAYS</Text>
            </View>

            {/* Sparkline plots for vibration and temperature */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              
              {/* Vibration Deviation Sparkline */}
              {telemetry.vibration_deviation && telemetry.vibration_deviation.length > 0 && (
                <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                  <Text style={{ fontSize: 8, fontWeight: '900', color: activeTheme.muted, marginBottom: 4 }}>VIBRATION DEVIATION (mm/s)</Text>
                  <Svg width="100%" height="40">
                    {(() => {
                      const points = telemetry.vibration_deviation.map((val: number, idx: number) => {
                        const x = (idx / (telemetry.vibration_deviation.length - 1)) * 120; // scale to fit width
                        const y = 35 - val * 60; // invert and scale to fit height
                        return `${x},${y}`;
                      }).join(' ');
                      return (
                        <>
                          <Path d={`M ${points}`} stroke={activeTheme.primary} strokeWidth="1.5" fill="none" />
                          {telemetry.vibration_deviation.map((val: number, idx: number) => {
                            if (idx === telemetry.vibration_deviation.length - 1) {
                              const x = (idx / (telemetry.vibration_deviation.length - 1)) * 120;
                              const y = 35 - val * 60;
                              return <Circle key={idx} cx={x} cy={y} r="2.5" fill={activeTheme.primary} />;
                            }
                            return null;
                          })}
                        </>
                      );
                    })()}
                  </Svg>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: activeTheme.text, marginTop: 4 }}>
                    LATEST: {telemetry.vibration_deviation[telemetry.vibration_deviation.length - 1]} mm/s
                  </Text>
                </View>
              )}

              {/* Temperature Logs Sparkline */}
              {telemetry.temperature_logs && telemetry.temperature_logs.length > 0 && (
                <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                  <Text style={{ fontSize: 8, fontWeight: '900', color: activeTheme.muted, marginBottom: 4 }}>THERMAL TELEMETRY LOGS (°C)</Text>
                  <Svg width="100%" height="40">
                    {(() => {
                      const minTemp = Math.min(...telemetry.temperature_logs);
                      const maxTemp = Math.max(...telemetry.temperature_logs);
                      const tempRange = maxTemp - minTemp || 1;
                      const points = telemetry.temperature_logs.map((val: number, idx: number) => {
                        const x = (idx / (telemetry.temperature_logs.length - 1)) * 120;
                        const y = 35 - ((val - minTemp) / tempRange) * 30; // scaled
                        return `${x},${y}`;
                      }).join(' ');
                      return (
                        <>
                          <Path d={`M ${points}`} stroke={activeTheme.warning} strokeWidth="1.5" fill="none" />
                          {telemetry.temperature_logs.map((val: number, idx: number) => {
                            if (idx === telemetry.temperature_logs.length - 1) {
                              const x = (idx / (telemetry.temperature_logs.length - 1)) * 120;
                              const y = 35 - ((val - minTemp) / tempRange) * 30;
                              return <Circle key={idx} cx={x} cy={y} r="2.5" fill={activeTheme.warning} />;
                            }
                            return null;
                          })}
                        </>
                      );
                    })()}
                  </Svg>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: activeTheme.text, marginTop: 4 }}>
                    LATEST: {telemetry.temperature_logs[telemetry.temperature_logs.length - 1]}°C
                  </Text>
                </View>
              )}

            </View>
          </View>
        ) : null}

        {/* AI Cognition Matrix Card showing root cause probabilities & success prediction */}
        <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
          <View style={styles.hypothesisHeader}>
            <Text style={[styles.subSectionTitle, { color: activeTheme.primary, marginBottom: 0 }]}>AI COGNITION HYPOTHESIS MATRIX</Text>
            <View style={[styles.successProbBadge, { borderColor: activeTheme.primary, borderWidth: 1 }]}>
              <Text style={[styles.successProbText, { color: activeTheme.primary }]}>REPAIR PROBABILITY: {repair_success_probability}</Text>
            </View>
          </View>
          
          {root_cause_rankings && root_cause_rankings.length > 0 ? (
            root_cause_rankings.map((hypo: any, idx: number) => {
              const probPercent = parseInt(hypo.probability) || 50;
              const barColor = idx === 0 ? activeTheme.primary : idx === 1 ? activeTheme.info : activeTheme.warning;
              return (
                <View key={idx} style={styles.hypoRow}>
                  <View style={styles.hypoMeta}>
                    <Text style={[styles.hypoName, { color: idx === 0 ? activeTheme.text : activeTheme.muted, fontWeight: idx === 0 ? '900' : '600' }]}>
                      {idx + 1}. {hypo.cause.toUpperCase()}
                    </Text>
                    <Text style={[styles.hypoVal, { color: barColor, fontWeight: '900' }]}>{probPercent}%</Text>
                  </View>
                  <View style={[styles.hypoBarBg, { backgroundColor: 'rgba(30, 41, 59, 0.5)', borderColor: 'rgba(255,255,255,0.04)', borderWidth: 1 }]}>
                    <View style={[styles.hypoBarFill, { width: `${probPercent}%`, backgroundColor: barColor, position: 'relative' }]}>
                      {/* Glow beacon at the tip */}
                      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#FFFFFF', opacity: 0.8 }} />
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <>
              {/* Fallback simulation */}
              <View style={styles.hypoRow}>
                <View style={styles.hypoMeta}>
                  <Text style={[styles.hypoName, { color: activeTheme.text, fontWeight: '900' }]}>{detected_issue.toUpperCase()}</Text>
                  <Text style={[styles.hypoVal, { color: activeTheme.primary, fontWeight: '900' }]}>{confidencePercent}%</Text>
                </View>
                <View style={[styles.hypoBarBg, { backgroundColor: 'rgba(30, 41, 59, 0.5)', borderColor: 'rgba(255,255,255,0.04)', borderWidth: 1 }]}>
                  <View style={[styles.hypoBarFill, { width: `${confidencePercent}%`, backgroundColor: activeTheme.primary, position: 'relative' }]}>
                    <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#FFFFFF', opacity: 0.8 }} />
                  </View>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Audio Playback Deck */}
        {tts_audio_url && (
          <Pressable 
            style={({ pressed }) => [
              styles.audioCard, 
              { 
                backgroundColor: isPlaying ? 'rgba(0, 240, 255, 0.08)' : activeTheme.card, 
                borderColor: pressed ? activeTheme.primary : activeTheme.border,
              }
            ]}
            onPress={handlePlayVoice}
          >
            <View style={styles.audioRow}>
              <View style={[styles.playBtn, { backgroundColor: activeTheme.primary }]}>
                {loadingAudio ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : isPlaying ? (
                  <Pause size={18} color="#000" fill="#000" />
                ) : (
                  <Play size={18} color="#000" fill="#000" />
                )}
              </View>
              <View style={styles.audioMetaDetails}>
                <Text style={[styles.audioTitle, { color: activeTheme.text }]}>AI TTS VOICE SUMMARY</Text>
                <Text style={[styles.audioDesc, { color: activeTheme.muted }]}>
                  {isPlaying ? 'PLAYING STEP-BY-STEP REPAIR PROCEDURES' : 'ACTIVATE VOICE DIAGNOSTIC AUDIO'}
                </Text>
              </View>
              <Volume2 size={22} color={activeTheme.primary} />
            </View>
          </Pressable>
        )}

        {response_allowed ? (
          <>
            {/* Safety Alert (Prominent Zebra Danger Card) */}
            <View style={[styles.safetyCard, { borderColor: activeTheme.danger, borderLeftWidth: 6, borderWidth: 1.5, backgroundColor: 'rgba(255, 59, 48, 0.05)' }]}>
              {/* Top zebra-stripes safety decoration */}
              <View style={styles.safetyHeader}>
                <ShieldAlert size={18} color={activeTheme.danger} />
                <Text style={[styles.safetyTitle, { color: activeTheme.danger, fontWeight: '900', letterSpacing: 2 }]}>
                  CRITICAL HAZARD MANDATE // LOTO ACTIVE
                </Text>
              </View>
              <View style={{ height: 2, backgroundColor: activeTheme.danger, marginVertical: 6, opacity: 0.4 }} />
              <Text style={[styles.safetyDesc, { color: '#FCA5A5', fontWeight: '800', lineHeight: 18 }]}>
                {safety_recommendations.toUpperCase()}
              </Text>
            </View>

            {/* Root Cause Card */}
            <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
              <View style={styles.sectionHeader}>
                <Cpu size={16} color={activeTheme.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.sectionTitle, { color: activeTheme.text }]}>EXPLAINABLE AI DIAGNOSTICS & JUSTIFICATION</Text>
              </View>
              <Text style={[styles.causeText, { color: activeTheme.text, marginBottom: 12 }]}>
                {reasoning_explanation || root_cause || 'Analysis in progress or inconclusive.'}
              </Text>
              
              {explainable_ai_justification && explainable_ai_justification.evidence_chain && (
                <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)', paddingTop: 12, gap: 10 }}>
                  
                  {/* Evidence Chain */}
                  {explainable_ai_justification.evidence_chain && explainable_ai_justification.evidence_chain.length > 0 && (
                    <View>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: activeTheme.primary, letterSpacing: 1, marginBottom: 4 }}>EVIDENCE CHAIN PATH</Text>
                      {explainable_ai_justification.evidence_chain.map((item: string, idx: number) => (
                        <Text key={idx} style={{ fontSize: 11, color: activeTheme.text, lineHeight: 15, paddingLeft: 8 }}>
                          • {item}
                        </Text>
                      ))}
                    </View>
                  )}

                  {/* Confidence Math */}
                  {explainable_ai_justification.confidence_calculation && (
                    <View style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: activeTheme.info, letterSpacing: 1, marginBottom: 2 }}>COGNITIVE CONFIDENCE BREAKDOWN</Text>
                      <Text style={{ fontSize: 11, color: activeTheme.muted, lineHeight: 15, fontStyle: 'italic' }}>
                        {explainable_ai_justification.confidence_calculation}
                      </Text>
                    </View>
                  )}

                  {/* Model Reasoning Limits */}
                  {explainable_ai_justification.model_reasoning_limits && (
                    <View style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: activeTheme.warning, letterSpacing: 1, marginBottom: 2 }}>COGNITIVE SYSTEM CONSTRAINTS</Text>
                      <Text style={{ fontSize: 11, color: activeTheme.muted, lineHeight: 15 }}>
                        {explainable_ai_justification.model_reasoning_limits}
                      </Text>
                    </View>
                  )}

                </View>
              )}
            </View>

            {/* Explainable AI Topology Map Card */}
            <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
              <View style={styles.sectionHeader}>
                <Sliders size={16} color={activeTheme.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.sectionTitle, { color: activeTheme.text }]}>COGNITIVE DIAGNOSTIC TOPOLOGY MAP</Text>
              </View>
              <Text style={[styles.cardSubText, { color: activeTheme.muted, marginBottom: 16 }]}>
                Trace path showing RAG documents, model reasoning, and neural engine vector weightings.
              </Text>
              <View style={styles.topologyMapContainer}>
                <Svg width="100%" height="220" viewBox="0 0 340 220">
                  {/* Grid background lines */}
                  <Line x1="0" y1="55" x2="340" y2="55" stroke="rgba(255,255,255,0.03)" strokeDasharray="3, 3" />
                  <Line x1="0" y1="110" x2="340" y2="110" stroke="rgba(255,255,255,0.03)" strokeDasharray="3, 3" />
                  <Line x1="0" y1="165" x2="340" y2="165" stroke="rgba(255,255,255,0.03)" strokeDasharray="3, 3" />
                  <Line x1="85" y1="0" x2="85" y2="220" stroke="rgba(255,255,255,0.03)" strokeDasharray="3, 3" />
                  <Line x1="170" y1="0" x2="170" y2="220" stroke="rgba(255,255,255,0.03)" strokeDasharray="3, 3" />
                  <Line x1="255" y1="0" x2="255" y2="220" stroke="rgba(255,255,255,0.03)" strokeDasharray="3, 3" />

                  {/* Connection Pathways */}
                  <Line x1="170" y1="35" x2="85" y2="90" stroke={activeTheme.border} strokeWidth="1.5" />
                  <Line x1="170" y1="35" x2="255" y2="90" stroke={activeTheme.border} strokeWidth="1.5" />
                  <Line x1="85" y1="90" x2="170" y2="145" stroke={activeTheme.primary} strokeWidth="1.5" strokeDasharray="4, 2" />
                  <Line x1="255" y1="90" x2="170" y2="145" stroke={activeTheme.primary} strokeWidth="1.5" strokeDasharray="4, 2" />
                  <Line x1="170" y1="90" x2="170" y2="145" stroke={activeTheme.success} strokeWidth="1.5" />
                  <Line x1="170" y1="145" x2="170" y2="190" stroke={activeTheme.danger} strokeWidth="2" />

                  {/* Node 1: Operator Input */}
                  <G transform="translate(170, 35)">
                    <Circle r="18" fill={activeTheme.background} stroke={activeTheme.primary} strokeWidth="2" />
                    <Circle r="5" fill={activeTheme.primary} />
                    <SvgText x="0" y="-22" fill={activeTheme.text} fontSize="9" fontWeight="900" textAnchor="middle">OPERATOR INPUT</SvgText>
                  </G>

                  {/* Node 2: Vision Input */}
                  <G transform="translate(85, 90)">
                    <Circle r="16" fill={activeTheme.background} stroke={image_url ? activeTheme.success : activeTheme.muted} strokeWidth="1.5" />
                    <SvgText x="0" y="4" fill={image_url ? activeTheme.success : activeTheme.muted} fontSize="8" fontWeight="800" textAnchor="middle">VISION</SvgText>
                    <SvgText x="0" y="-20" fill={activeTheme.text} fontSize="8" fontWeight="900" textAnchor="middle">IMAGE FEED</SvgText>
                  </G>

                  {/* Node 3: Audio Input */}
                  <G transform="translate(255, 90)">
                    <Circle r="16" fill={activeTheme.background} stroke={query_text ? activeTheme.success : activeTheme.muted} strokeWidth="1.5" />
                    <SvgText x="0" y="4" fill={query_text ? activeTheme.success : activeTheme.muted} fontSize="8" fontWeight="800" textAnchor="middle">VOICE</SvgText>
                    <SvgText x="0" y="-20" fill={activeTheme.text} fontSize="8" fontWeight="900" textAnchor="middle">SPEECH RAG</SvgText>
                  </G>

                  {/* Node 4: Manual Document Index Embeddings */}
                  <G transform="translate(170, 90)">
                    <Rect x="-22" y="-12" width="44" height="24" rx="4" fill={activeTheme.background} stroke={activeTheme.success} strokeWidth="1.5" />
                    <SvgText x="0" y="3" fill={activeTheme.success} fontSize="7" fontWeight="900" textAnchor="middle">RAG DB</SvgText>
                  </G>

                  {/* Node 5: AI Engine (Core reasoning) */}
                  <G transform="translate(170, 145)">
                    <Circle r="18" fill={activeTheme.background} stroke={activeTheme.primary} strokeWidth="2" />
                    <SvgText x="0" y="3" fill={activeTheme.primary} fontSize="8" fontWeight="900" textAnchor="middle">GEMINI</SvgText>
                    <SvgText x="32" y="3" fill={activeTheme.muted} fontSize="8" fontWeight="700">REASONING</SvgText>
                  </G>

                  {/* Node 6: Failure Target */}
                  <G transform="translate(170, 190)">
                    <Rect x="-50" y="-10" width="100" height="20" rx="4" fill={activeTheme.background} stroke={activeTheme.danger} strokeWidth="2" />
                    <SvgText x="0" y="3" fill={activeTheme.danger} fontSize="8" fontWeight="900" textAnchor="middle">FAULT INDEX</SvgText>
                  </G>
                </Svg>
              </View>
            </View>

            {/* Interactive SOP checklist */}
            {suggested_steps.length > 0 && (() => {
              const totalSteps = suggested_steps.length;
              const completedCount = Object.values(completedSteps).filter(Boolean).length;
              const completionPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
              return (
                <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
                  <View style={styles.sectionHeader}>
                    <HeartHandshake size={16} color={activeTheme.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.sectionTitle, { color: activeTheme.text }]}>SUGGESTED ASSEMBLY RESOLUTION STEPS</Text>
                  </View>

                  <View style={styles.progressBarWrapper}>
                    <View style={styles.progressBarHeader}>
                      <Text style={[styles.progressBarLabel, { color: activeTheme.muted }]}>
                        PROGRESS: {completedCount} OF {totalSteps} STEPS COMPLETED
                      </Text>
                      <Text style={[styles.progressBarValue, { color: completionPercent === 100 ? activeTheme.success : activeTheme.primary }]}>
                        {completionPercent}%
                      </Text>
                    </View>
                    <View style={[styles.progressBarTrack, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                      <View 
                        style={[
                          styles.progressBarFill, 
                          { 
                            width: `${completionPercent}%`, 
                            backgroundColor: completionPercent === 100 ? activeTheme.success : activeTheme.primary 
                          }
                        ]} 
                      />
                    </View>
                  </View>

                  {suggested_steps.map((step: string, index: number) => {
                    const isDone = !!completedSteps[index];
                    const isExpanded = expandedStep === index;
                    const stepSpec = getStepDetails(index);
                    
                    return (
                      <View key={index} style={[styles.stepItemWrapper, { borderBottomColor: activeTheme.border }]}>
                        <View style={styles.stepHeaderRow}>
                          <Pressable onPress={() => toggleStep(index)} style={styles.checkboxContainer}>
                            {isDone ? (
                              <CheckSquare size={18} color={activeTheme.success} />
                            ) : (
                              <Square size={18} color={activeTheme.muted} />
                            )}
                          </Pressable>

                          <Pressable 
                            onPress={() => toggleExpand(index)} 
                            style={styles.stepTextClickable}
                          >
                            <View style={styles.stepTextContainer}>
                              <View style={[styles.stepBadge, { backgroundColor: isDone ? 'rgba(0, 255, 102, 0.08)' : 'rgba(0, 240, 255, 0.05)', borderColor: isDone ? activeTheme.success : activeTheme.primary }]}>
                                <Text style={[styles.stepNumberText, { color: isDone ? activeTheme.success : activeTheme.primary }]}>
                                  0{index + 1}
                                </Text>
                              </View>
                              <Text style={[styles.stepText, { color: activeTheme.text }, isDone && styles.stepDoneText]}>
                                {step}
                              </Text>
                            </View>
                          </Pressable>

                          <Pressable onPress={() => toggleExpand(index)} style={styles.expandChevron}>
                            {isExpanded ? <ChevronUp size={16} color={activeTheme.muted} /> : <ChevronDown size={16} color={activeTheme.muted} />}
                          </Pressable>
                        </View>

                        {/* Expandable specs panel */}
                        {isExpanded && (
                          <View style={[styles.expandedSpecCard, { backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}>
                            <Text style={[styles.specText, { color: activeTheme.text }]}><Text style={{ color: activeTheme.primary, fontWeight: '800' }}>TOOLS REQ: </Text>{stepSpec.tools}</Text>
                            <View style={styles.specBottomRow}>
                              <Text style={[styles.specText, { color: activeTheme.text }]}><Text style={{ color: activeTheme.info, fontWeight: '800' }}>EST TIME: </Text>{stepSpec.estTime}</Text>
                              <Text style={[styles.specText, { color: activeTheme.text }]}><Text style={{ color: activeTheme.warning, fontWeight: '800' }}>RISK LEVEL: </Text>{stepSpec.difficulty}</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })()}

            {/* Feedback loop question panel */}
            {session_id && (
              <View style={[styles.feedbackCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
                <Text style={[styles.feedbackTitle, { color: activeTheme.text }]}>{feedback_request}</Text>
                <Text style={[styles.feedbackDesc, { color: activeTheme.muted }]}>
                  Your response helps the AI engine dynamically re-evaluate root causes and refine confidence formulas.
                </Text>
                <View style={styles.feedbackBtnRow}>
                  <Pressable 
                    style={[styles.feedbackBtn, { backgroundColor: activeTheme.success }]}
                    onPress={() => setShowRatingModal(true)}
                  >
                    <Text style={styles.feedbackBtnText}>YES, IT RESOLVED</Text>
                  </Pressable>
                  <Pressable 
                    style={[styles.feedbackBtn, { backgroundColor: activeTheme.danger }]}
                    onPress={handleRepairFailed}
                  >
                    <Text style={styles.feedbackBtnText}>NO, IT FAILED</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={[styles.card, { borderColor: activeTheme.danger, borderLeftWidth: 6, borderWidth: 1.5, backgroundColor: 'rgba(255, 59, 48, 0.05)' }]}>
            <View style={styles.sectionHeader}>
              <AlertTriangle size={18} color={activeTheme.danger} style={{ marginRight: 6 }} />
              <Text style={[styles.sectionTitle, { color: activeTheme.danger, fontWeight: '900', letterSpacing: 1 }]}>
                DIAGNOSTIC REPAIR BLOCKED // SAFETY ESCALATION REQUIRED
              </Text>
            </View>
            <View style={{ height: 1.5, backgroundColor: activeTheme.danger, marginVertical: 10, opacity: 0.3 }} />
            
            <Text style={[styles.causeText, { color: '#FCA5A5', fontWeight: '700', lineHeight: 18, marginBottom: 14 }]}>
              {reasoning_explanation}
            </Text>
            
            <Text style={[styles.feedbackDesc, { color: activeTheme.muted, marginBottom: 16 }]}>
              Total AI Grounding and Match confidence is below the safety threshold. Actionable repair instructions have been blocked to prevent hazard exposure or incorrect maintenance.
            </Text>

            <Pressable 
              style={({ pressed }) => [
                styles.feedbackBtn, 
                { 
                  backgroundColor: activeTheme.danger, 
                  width: '100%', 
                  height: 48,
                  justifyContent: 'center', 
                  alignItems: 'center',
                  borderRadius: 10,
                  elevation: 3,
                  marginTop: 6
                }
              ]}
              onPress={() => {
                Alert.alert(
                  "Service Ticket Opened", 
                  "Safety escalation initiated. A ticket has been created with authorized factory maintenance personnel.",
                  [{ text: "OK", onPress: () => navigation.navigate('MainTabs', { screen: 'HomeTab' }) }]
                );
              }}
            >
              <Text style={[styles.feedbackBtnText, { color: '#FFF', fontWeight: '900', letterSpacing: 1 }]}>
                ESCALATE TO SERVICE CENTER
              </Text>
            </Pressable>
          </View>
        )}

        {/* Close without logging button */}
        <Pressable 
          style={({ pressed }) => [
            styles.homeBtn, 
            { 
              backgroundColor: '#1E293B',
              transform: [{ scale: pressed ? 1.02 : 1 }],
              borderColor: activeTheme.border,
              borderWidth: 1
            }
          ]}
          onPress={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
        >
          <Text style={[styles.homeBtnText, { color: '#FFF' }]}>CLOSE WORKLOG</Text>
        </Pressable>

      </ScrollView>

      {/* 5-Star Rating & Repair Duration Logging Dialog */}
      {showRatingModal && (
        <View style={styles.ratingOverlay}>
          <View style={[styles.ratingModal, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
            <Text style={[styles.ratingTitle, { color: activeTheme.text }]}>LOG SUCCESSFUL REPAIR</Text>
            <Text style={[styles.ratingDesc, { color: activeTheme.muted }]}>
              Please rate the diagnostic accuracy of the proposed troubleshooting steps.
            </Text>

            {/* 5-Star Row */}
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setUserRating(star)} style={{ padding: 6 }}>
                  <Star 
                    size={36} 
                    color={star <= userRating ? '#FBBF24' : '#475569'} 
                    fill={star <= userRating ? '#FBBF24' : 'transparent'} 
                  />
                </Pressable>
              ))}
            </View>

            {/* Duration select */}
            <Text style={[styles.durationLabel, { color: activeTheme.text }]}>
              ESTIMATED TIME TAKEN: <Text style={{ color: activeTheme.primary, fontWeight: '900' }}>{repairDuration} MINS</Text>
            </Text>
            <View style={styles.durationBtnRow}>
              {[5, 15, 30, 60, 120].map((mins) => (
                <Pressable
                  key={mins}
                  onPress={() => setRepairDuration(mins)}
                  style={[
                    styles.durationBtn,
                    {
                      backgroundColor: repairDuration === mins ? activeTheme.primary : '#1E293B',
                      borderColor: activeTheme.border
                    }
                  ]}
                >
                  <Text style={[styles.durationBtnText, { color: repairDuration === mins ? '#000' : '#FFF' }]}>
                    {mins >= 60 ? `${mins/60}h` : `${mins}m`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Modal actions */}
            <View style={styles.modalBtnRow}>
              <Pressable 
                style={[styles.modalSubmitBtn, { backgroundColor: activeTheme.success }]}
                onPress={handleRepairSuccess}
              >
                <Text style={styles.modalSubmitBtnText}>LOG WORKLOG & CLOSE</Text>
              </Pressable>
              <Pressable 
                style={[styles.modalCancelBtn, { borderColor: activeTheme.border }]}
                onPress={() => setShowRatingModal(false)}
              >
                <Text style={[styles.modalCancelBtnText, { color: activeTheme.text }]}>CANCEL</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Screen blocker loading indicator for adaptive feedback loops */}
      {submittingFeedback && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={activeTheme.primary} />
          <Text style={[styles.loaderText, { color: '#FFF' }]}>
            AI RE-EVALUATING CAUSES... FORMULATING ALTERNATIVE REPAIR STEPS...
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginBottom: 20,
    position: 'relative',
    elevation: 3,
  },
  headerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  faultHotspot: {
    position: 'absolute',
    top: '38%',
    left: '42%',
    width: 90,
    height: 60,
    borderWidth: 2,
    borderRadius: 4,
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 5,
  },
  faultHotspotLabel: {
    position: 'absolute',
    top: -14,
    left: -1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  faultHotspotLabelText: {
    color: '#FFF',
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(6, 11, 22, 0.75)',
    paddingVertical: 6,
    alignItems: 'center',
  },
  imageLabel: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    marginRight: 14,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  tag: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginRight: 8,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 8,
    color: '#000',
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  issueTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    lineHeight: 26,
  },
  radialGaugeContainer: {
    width: 84,
    height: 84,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  gaugeTextWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radialVal: {
    fontSize: 18,
    fontWeight: '900',
  },
  radialLabel: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  queryContext: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
  },
  queryLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  queryVal: {
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  hypothesisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  subSectionTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  successProbBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  successProbText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  hypoRow: {
    marginVertical: 6,
  },
  hypoMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  hypoName: {
    fontSize: 11,
    fontWeight: '700',
  },
  hypoVal: {
    fontSize: 11,
    fontWeight: '900',
  },
  hypoBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  hypoBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  audioCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    elevation: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioMetaDetails: {
    flex: 1,
    marginLeft: 14,
  },
  audioTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  audioDesc: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 4,
  },
  safetyCard: {
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderLeftWidth: 5,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  safetyTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginLeft: 8,
  },
  safetyDesc: {
    fontSize: 11,
    lineHeight: 18,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  causeText: {
    fontSize: 13,
    lineHeight: 20,
  },
  stepItemWrapper: {
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxContainer: {
    padding: 2,
    marginRight: 10,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  stepTextClickable: {
    flex: 1,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  stepTextContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumber: {
    fontWeight: '900',
    fontSize: 13,
    marginRight: 6,
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  stepDoneText: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  expandChevron: {
    padding: 6,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  expandedSpecCard: {
    marginTop: 8,
    marginLeft: 30,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  specText: {
    fontSize: 10,
    lineHeight: 14,
    marginVertical: 2,
  },
  specBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 4,
  },
  feedbackCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 4,
  },
  feedbackTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  feedbackDesc: {
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 16,
  },
  feedbackBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  feedbackBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  feedbackBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  homeBtn: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    elevation: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  homeBtnText: {
    color: '#000',
    fontWeight: '900',
    letterSpacing: 1.2,
    fontSize: 12,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 11, 22, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: 24,
  },
  loaderText: {
    marginTop: 18,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    lineHeight: 18,
  },
  ratingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 11, 22, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    padding: 20,
  },
  ratingModal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    elevation: 10,
  },
  ratingTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  ratingDesc: {
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  durationLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  durationBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 6,
  },
  durationBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  durationBtnText: {
    fontSize: 10,
    fontWeight: '800',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalSubmitBtn: {
    flex: 2,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  modalSubmitBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  modalCancelBtnText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  hudCornerTL: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 20,
    height: 20,
    borderLeftWidth: 3,
    borderTopWidth: 3,
    borderColor: '#00F0FF',
  },
  hudCornerTR: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 20,
    height: 20,
    borderRightWidth: 3,
    borderTopWidth: 3,
    borderColor: '#00F0FF',
  },
  hudCornerBL: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 20,
    height: 20,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#00F0FF',
  },
  hudCornerBR: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 20,
    height: 20,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#00F0FF',
  },
  hudScanline: {
    position: 'absolute',
    top: '48%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0, 240, 255, 0.4)',
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  stepBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: 10,
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cardSubText: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  topologyMapContainer: {
    width: '100%',
    height: 225,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  activeNodeOuter: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
    marginBottom: 16,
    width: '100%',
  },
  activeNodeInner: {
    borderWidth: 1.5,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeNodeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  progressBarWrapper: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: 16,
  },
  progressBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBarLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  progressBarValue: {
    fontSize: 11,
    fontWeight: '900',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  }
});

export default ResultScreen;
