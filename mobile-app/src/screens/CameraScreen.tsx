import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, StatusBar, ActivityIndicator, Alert, Animated, TextInput, ScrollView, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { X, RefreshCw, Image as ImageIcon, CheckCircle, Mic, Square, Trash2, Zap, Target, HelpCircle, Info, BookOpen, MessageSquare } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { analyzeDiagnostic } from '../services/api';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import Svg, { Circle, Line } from 'react-native-svg';

type CameraScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Camera'>;

interface Props {
  navigation: CameraScreenNavigationProp;
}

const hexToRgb = (hex: string): string => {
  const cleaned = hex.replace('#', '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return `${r}, ${g}, ${b}`;
  }
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
};

const getAccentPalette = (primaryColor: string) => {
  const rgb = hexToRgb(primaryColor);
  return [
    `rgba(${rgb}, 0.04)`, // Shade 1
    `rgba(${rgb}, 0.1)`,  // Shade 2
    `rgba(${rgb}, 0.2)`,  // Shade 3
    `rgba(${rgb}, 0.35)`, // Shade 4
    `rgba(${rgb}, 0.5)`,  // Shade 5
    `rgba(${rgb}, 0.65)`, // Shade 6
    `rgba(${rgb}, 0.8)`,  // Shade 7
    `rgba(${rgb}, 0.9)`,  // Shade 8
    primaryColor,         // Shade 9
  ];
};

const CameraScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, refreshHistory } = useApp();
  const activeTheme = Theme.colors[theme];
  const accentPalette = getAccentPalette(activeTheme.primary);
  
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Consolidated Multimodal Inputs
  const [queryText, setQueryText] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  
  // Voice Recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Multi-Stage Loading skeleton states
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'audio' | 'scraping' | 'diagnosing' | 'none'>('none');
  const [loadingProgress, setLoadingProgress] = useState(0);

  const [flash, setFlash] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  
  const cameraRef = useRef<any>(null);
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const driftAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0.2)).current;

  // Sound/Mic permissions setup
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status: micStatus } = await Audio.requestPermissionsAsync();
        if (micStatus !== 'granted') {
          console.log('[CameraScreen] Audio recording permissions denied');
        }
      }
    })();

    return () => {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // Infinite tracking drift, rotating dial, and flashing alert loops
  useEffect(() => {
    if (!selectedImage && permission?.granted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(sweepAnim, {
            toValue: 246,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(sweepAnim, {
            toValue: 4,
            duration: 2000,
            useNativeDriver: true,
          })
        ])
      ).start();

      const startDrift = () => {
        Animated.sequence([
          Animated.timing(driftAnim, {
            toValue: { x: 8, y: -6 },
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(driftAnim, {
            toValue: { x: -4, y: 10 },
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(driftAnim, {
            toValue: { x: -8, y: -4 },
            duration: 2800,
            useNativeDriver: true,
          }),
          Animated.timing(driftAnim, {
            toValue: { x: 0, y: 0 },
            duration: 2500,
            useNativeDriver: true,
          }),
        ]).start(() => startDrift());
      };
      startDrift();

      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        })
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, {
            toValue: 0.7,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(flashAnim, {
            toValue: 0.2,
            duration: 900,
            useNativeDriver: true,
          })
        ])
      ).start();
    }
  }, [selectedImage, permission]);

  if (!permission) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: activeTheme.background }]}>
        <ActivityIndicator size="large" color={activeTheme.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: activeTheme.background }]}>
        <Text style={[styles.permissionText, { color: activeTheme.text }]}>
          Camera permission is required to analyze machinery.
        </Text>
        <TouchableOpacity 
          style={[styles.grantBtn, { backgroundColor: activeTheme.primary }]}
          onPress={requestPermission}
        >
          <Text style={styles.grantBtnText}>GRANT PERMISSION</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.cancelLink}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ color: activeTheme.muted, fontWeight: 'bold' }}>GO BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          skipProcessing: false,
        });
        if (photo && photo.uri) {
          setSelectedImage(photo.uri);
        }
      } catch (err) {
        console.log('[Camera] Capture error:', err);
        Alert.alert('Capture Failed', 'An error occurred during picture capture.');
      }
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (err) {
      console.log('[Camera] ImagePicker error:', err);
      Alert.alert('Gallery Error', 'Could not open image gallery.');
    }
  };

  // Voice recording control functions
  const startRecording = async () => {
    try {
      if (Platform.OS !== 'web') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }

      console.log('[CameraScreen] Starting audio recording...');
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
      setRecordedUri(null);

      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('[CameraScreen] Failed to start recording:', err);
      Alert.alert('Microphone Error', 'Could not start recording session.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    if (recordingTimer.current) clearInterval(recordingTimer.current);

    try {
      console.log('[CameraScreen] Stopping audio recording...');
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedUri(uri);
      setRecording(null);
    } catch (err) {
      console.error('[CameraScreen] Failed to stop recording:', err);
    }
  };

  const deleteRecording = () => {
    setRecordedUri(null);
    setRecordingDuration(0);
    setIsRecording(false);
    if (recordingTimer.current) clearInterval(recordingTimer.current);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Unified submit handler with simulated/timed multi-stage loading skeleton
  const handleAnalyzeDiagnostic = async () => {
    if (!selectedImage) {
      Alert.alert('Image Required', 'Please take or pick an image of the equipment first.');
      return;
    }

    setAnalyzing(true);
    setLoadingProgress(0);

    const hasAudio = !!recordedUri;
    const hasManual = !!manualUrl.trim();

    // Setup progressive visual stages
    const runStagesSim = async () => {
      if (hasAudio) {
        setLoadingStage('audio');
        for (let i = 0; i <= 35; i += 5) {
          setLoadingProgress(i);
          await new Promise(r => setTimeout(r, 150));
        }
      }
      if (hasManual) {
        setLoadingStage('scraping');
        const start = hasAudio ? 36 : 0;
        for (let i = start; i <= 70; i += 5) {
          setLoadingProgress(i);
          await new Promise(r => setTimeout(r, 150));
        }
      }
      setLoadingStage('diagnosing');
      const start = (hasAudio && hasManual) ? 71 : (hasAudio || hasManual) ? 36 : 0;
      for (let i = start; i <= 95; i += 3) {
        setLoadingProgress(i);
        await new Promise(r => setTimeout(r, 100));
      }
    };

    const apiPromise = analyzeDiagnostic({
      imageUri: selectedImage,
      audioUri: recordedUri,
      queryText: queryText.trim() || null,
      manualUrl: manualUrl.trim() || null,
    });

    try {
      // Run the visual stage simulation and API request concurrently
      await Promise.all([runStagesSim(), apiPromise]);
      const result = await apiPromise;

      setLoadingProgress(100);
      await new Promise(r => setTimeout(r, 200));

      // Reset local scan state
      setSelectedImage(null);
      setQueryText('');
      setManualUrl('');
      setRecordedUri(null);
      setRecordingDuration(0);
      refreshHistory();

      navigation.navigate('Result', { analysisResult: result });
    } catch (e: any) {
      console.log('[CameraScreen] Multimodal pipeline failed:', e);
      Alert.alert('Analysis Failed', e.message || 'Error communicating with diagnostic engine.');
    } finally {
      setAnalyzing(false);
      setLoadingStage('none');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: activeTheme.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {/* 1. Header Bar */}
      <View style={[styles.header, { backgroundColor: activeTheme.card, borderBottomColor: activeTheme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <X size={22} color={activeTheme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: activeTheme.text }]}>APEX Industrial AI Scanner</Text>
        <TouchableOpacity 
          style={[styles.flashBtn, flash && { backgroundColor: activeTheme.primary }]}
          onPress={() => setFlash(!flash)}
        >
          <Zap size={16} color={flash ? '#000' : activeTheme.text} />
        </TouchableOpacity>
      </View>

      {/* 2. Onboarding Tooltip banner (shown on first view) */}
      {showHelp && !selectedImage && (
        <View style={[styles.onboardingCard, { backgroundColor: 'rgba(0, 240, 255, 0.04)', borderColor: activeTheme.primary }]}>
          <View style={styles.onboardingHeader}>
            <Info size={16} color={activeTheme.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.onboardingTitle, { color: activeTheme.primary }]}>MULTIMODAL DIAGNOSTIC CONSOLE</Text>
            <TouchableOpacity onPress={() => setShowHelp(false)} style={styles.onboardingClose}>
              <X size={14} color={activeTheme.muted} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.onboardingDesc, { color: activeTheme.text }]}>
            How to use: Align the faulty machinery module in the targeting reticle and capture a photo. Then describe symptoms, paste manuals, or record voice symptom notes to produce precise, RAG-grounded troubleshooting guides.
          </Text>
        </View>
      )}

      {/* 3. Main Scanner Viewport */}
      {!selectedImage ? (
        <View style={{ flex: 1 }}>
          <CameraView 
            style={StyleSheet.absoluteFillObject}
            ref={cameraRef}
          />
          
          {/* Target Grid and AI Detection boxes */}
          <View style={styles.overlay}>
            
            {/* HUD System specs */}
            <View style={styles.hudOverlay}>
              <Text style={styles.hudText}>INF-ENGINE: APEX_ROCm_v6.1 // FREQ: 60FPS</Text>
              <Text style={[styles.hudText, { color: activeTheme.success }]}>HUD STATE: RETICLE ACTIVE</Text>
            </View>

            {/* Simulated Bounding Box 1 */}
            <Animated.View style={[styles.mockBox, { top: '15%', left: '10%', borderColor: activeTheme.info, transform: driftAnim.getTranslateTransform() }]}>
              <View style={[styles.boxLabel, { backgroundColor: activeTheme.info }]}>
                <Text style={styles.boxLabelText}>SHAFT SEAL [94%]</Text>
              </View>
            </Animated.View>

            {/* Simulated Bounding Box 2 */}
            <Animated.View style={[styles.mockBox, { bottom: '30%', right: '12%', borderColor: activeTheme.warning, transform: driftAnim.getTranslateTransform() }]}>
              <View style={[styles.boxLabel, { backgroundColor: activeTheme.warning }]}>
                <Text style={[styles.boxLabelText, { color: '#000' }]}>THERMAL FAULT [88%]</Text>
              </View>
            </Animated.View>

            {/* Target Reticle */}
            <View style={styles.targetBox}>
              <View style={[styles.corner, styles.topLeft, { borderColor: activeTheme.primary }]} />
              <View style={[styles.corner, styles.topRight, { borderColor: activeTheme.primary }]} />
              <View style={[styles.corner, styles.bottomLeft, { borderColor: activeTheme.primary }]} />
              <View style={[styles.corner, styles.bottomRight, { borderColor: activeTheme.primary }]} />
              
              <View style={styles.reticleCenter}>
                <Animated.View style={{ transform: [{ rotate: rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
                  <Svg width="160" height="160" viewBox="0 0 160 160">
                    <Circle cx="80" cy="80" r="70" stroke={activeTheme.primary} strokeWidth="1" strokeDasharray="4, 8" fill="none" opacity="0.3" />
                    <Circle cx="80" cy="80" r="60" stroke={activeTheme.info} strokeWidth="1.5" strokeDasharray="20, 15" fill="none" opacity="0.5" />
                    <Line x1="80" y1="10" x2="80" y2="20" stroke={activeTheme.primary} strokeWidth="1" opacity="0.6" />
                    <Line x1="80" y1="140" x2="80" y2="150" stroke={activeTheme.primary} strokeWidth="1" opacity="0.6" />
                    <Line x1="10" y1="80" x2="20" y2="80" stroke={activeTheme.primary} strokeWidth="1" opacity="0.6" />
                    <Line x1="140" y1="80" x2="150" y2="80" stroke={activeTheme.primary} strokeWidth="1" opacity="0.6" />
                  </Svg>
                </Animated.View>
              </View>

              <View style={styles.reticleCenter}>
                <Target size={24} color="rgba(0, 240, 255, 0.4)" strokeWidth={1.5} />
              </View>

              <Animated.View style={[
                styles.scanLine, 
                { 
                  backgroundColor: activeTheme.primary,
                  shadowColor: activeTheme.primary,
                  transform: [{ translateY: sweepAnim }] 
                }
              ]} />
            </View>

            <Text style={[styles.instructionText, { color: activeTheme.text }]}>ALIGN FAULTY NODE WITHIN HUD TARGET</Text>
          </View>

          {/* Capture controls */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handlePickImage} style={styles.galleryBtn}>
              <ImageIcon size={20} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleCapture} style={[styles.captureBtn, { borderColor: activeTheme.primary }]}>
              <View style={[styles.captureInner, { backgroundColor: activeTheme.primary }]} />
            </TouchableOpacity>

            <View style={{ width: 48 }} />
          </View>
        </View>
      ) : (
        // 4. Consolidated Multimodal Input Preview Mode
        <ScrollView style={styles.previewContainer} contentContainerStyle={styles.previewContent}>
          
          {/* Target image thumbnail */}
          <View style={[styles.imagePreviewBox, { borderColor: activeTheme.border }]}>
            <Image source={{ uri: selectedImage }} style={styles.previewImage} />
            <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.trashImageBtn}>
              <RefreshCw size={14} color="#FFF" style={{ marginRight: 4 }} />
              <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>RETAKE</Text>
            </TouchableOpacity>
            <View style={[styles.attachedTag, { backgroundColor: activeTheme.primary }]}>
              <Text style={styles.attachedTagText}>CAMERA SCAN CAPTURED</Text>
            </View>
          </View>

          {/* 60-30-10 Onboarding purpose note */}
          <View style={[styles.infoCard, { backgroundColor: activeTheme.card, borderColor: accentPalette[2] }]}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: activeTheme.primary, letterSpacing: 1.5, marginBottom: 4 }}>
              COGNITIVE PROCESSOR INPUTS
            </Text>
            <Text style={{ fontSize: 9.5, color: activeTheme.muted, lineHeight: 14 }}>
              Inputs packaged here are parsed concurrently. RAG indexing maps visual tokens against product manuals.
            </Text>
          </View>

          {/* Input 1: Symptom text query */}
          <View style={[styles.inputCard, { backgroundColor: activeTheme.card, borderColor: accentPalette[2] }]}>
            <Text style={[styles.inputLabel, { color: activeTheme.primary }]}>
              1. DESCRIBE SYMPTOM DETAILS
            </Text>
            <TextInput
              style={[styles.textInput, { color: activeTheme.text, borderBottomColor: accentPalette[3] }]}
              placeholder="e.g. Excessive vibrations and overheating under load..."
              placeholderTextColor={activeTheme.muted}
              value={queryText}
              onChangeText={setQueryText}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Input 2: Voice Audio notes */}
          <View style={[styles.inputCard, { backgroundColor: activeTheme.card, borderColor: accentPalette[2] }]}>
            <Text style={[styles.inputLabel, { color: activeTheme.primary }]}>
              2. VOICE SYMPTOM NOTE
            </Text>
            
            <View style={styles.voiceControlsRow}>
              {isRecording ? (
                <TouchableOpacity onPress={stopRecording} style={[styles.recordBtn, { backgroundColor: activeTheme.danger }]}>
                  <Square size={16} color="#FFF" />
                  <Text style={styles.recordBtnText}>STOP ({formatDuration(recordingDuration)})</Text>
                </TouchableOpacity>
              ) : recordedUri ? (
                <View style={styles.recordedPillWrapper}>
                  <View style={[styles.recordedPill, { backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: activeTheme.success }]}>
                    <Mic size={14} color={activeTheme.success} style={{ marginRight: 6 }} />
                    <Text style={{ color: activeTheme.success, fontSize: 10, fontWeight: '800' }}>
                      VOICE ATTACHED ({formatDuration(recordingDuration)})
                    </Text>
                  </View>
                  <TouchableOpacity onPress={deleteRecording} style={[styles.deleteVoiceBtn, { borderColor: activeTheme.danger }]}>
                    <Trash2 size={14} color={activeTheme.danger} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={startRecording} style={[styles.recordBtn, { backgroundColor: accentPalette[2] }]}>
                  <Mic size={16} color={activeTheme.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.recordBtnText, { color: activeTheme.primary }]}>RECORD VOICE NOTE</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Input 3: Manufacturer Manual Web URL */}
          <View style={[styles.inputCard, { backgroundColor: activeTheme.card, borderColor: accentPalette[2] }]}>
            <Text style={[styles.inputLabel, { color: activeTheme.primary }]}>
              3. EXTERNAL MANUFACTURER MANUAL (URL)
            </Text>
            <TextInput
              style={[styles.textInput, { color: activeTheme.text, borderBottomColor: accentPalette[3] }]}
              placeholder="https://example.com/carrier-condenser-manual.pdf"
              placeholderTextColor={activeTheme.muted}
              value={manualUrl}
              onChangeText={setManualUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          {/* Primary Submit Trigger */}
          <TouchableOpacity 
            style={[styles.analyzeButton, { backgroundColor: activeTheme.primary }]}
            onPress={handleAnalyzeDiagnostic}
          >
            <CheckCircle size={18} color="#000" style={{ marginRight: 8 }} />
            <Text style={styles.analyzeButtonText}>SUBMIT DIAGNOSTIC PIPELINE</Text>
          </TouchableOpacity>

        </ScrollView>
      )}

      {/* 5. Progressive Multi-Stage Loading skeleton overlay */}
      {analyzing && (
        <View style={[styles.loadingOverlay, { backgroundColor: 'rgba(6, 11, 22, 0.95)' }]}>
          <View style={[styles.skeletonContainer, { backgroundColor: activeTheme.card, borderColor: accentPalette[2] }]}>
            
            <ActivityIndicator size="large" color={activeTheme.primary} style={{ marginBottom: 20 }} />
            
            {/* Dynamic Stage Indicator */}
            {loadingStage === 'audio' && (
              <View style={styles.stageBox}>
                <Mic size={24} color={activeTheme.primary} style={styles.pulsateIcon} />
                <Text style={[styles.stageTitle, { color: activeTheme.primary }]}>STAGE 1: TRANSCRIBING AUDIO NOTE</Text>
                <Text style={[styles.stageDesc, { color: activeTheme.text }]}>
                  Feeding raw spectrogram metrics into ASR Whisper transcription model...
                </Text>
              </View>
            )}

            {loadingStage === 'scraping' && (
              <View style={styles.stageBox}>
                <BookOpen size={24} color={activeTheme.info} style={styles.pulsateIcon} />
                <Text style={[styles.stageTitle, { color: activeTheme.info }]}>STAGE 2: SCRAPING MANUFACTURER MANUAL URL</Text>
                <Text style={[styles.stageDesc, { color: activeTheme.text }]}>
                  Spawning headless parser on the provided manufacturer document...
                </Text>
              </View>
            )}

            {loadingStage === 'diagnosing' && (
              <View style={styles.stageBox}>
                <MessageSquare size={24} color={activeTheme.success} style={styles.pulsateIcon} />
                <Text style={[styles.stageTitle, { color: activeTheme.success }]}>STAGE 3: COMPUTING AI DIAGNOSTICS</Text>
                <Text style={[styles.stageDesc, { color: activeTheme.text }]}>
                  Running vector RAG retrieval and generating explainable justification trace...
                </Text>
              </View>
            )}

            {/* Custom linear progress bar */}
            <View style={[styles.loadingProgressTrack, { backgroundColor: accentPalette[1] }]}>
              <View style={[styles.loadingProgressBar, { width: `${loadingProgress}%`, backgroundColor: activeTheme.primary }]} />
            </View>
            <Text style={{ fontSize: 9, color: activeTheme.muted, marginTop: 6, fontWeight: '900' }}>
              PROGRESS ACCELERATOR TARGET: {loadingProgress}%
            </Text>

          </View>
        </View>
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  grantBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
  },
  grantBtnText: {
    color: '#000',
    fontWeight: '800',
  },
  cancelLink: {
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  flashBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  onboardingCard: {
    padding: 14,
    borderWidth: 1,
    margin: 12,
    borderRadius: 10,
  },
  onboardingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  onboardingTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    flex: 1,
  },
  onboardingClose: {
    padding: 4,
  },
  onboardingDesc: {
    fontSize: 10.5,
    lineHeight: 15,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  hudOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
  },
  hudText: {
    color: '#94A3B8',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginVertical: 1.5,
  },
  mockBox: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 4,
    padding: 4,
    width: 90,
    height: 50,
    borderStyle: 'dashed',
  },
  boxLabel: {
    position: 'absolute',
    top: -12,
    left: -1,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 2,
  },
  boxLabelText: {
    fontSize: 6.5,
    fontWeight: '900',
    color: '#FFF',
  },
  targetBox: {
    width: 250,
    height: 250,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  reticleCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
  },
  scanLine: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: 2.5,
    opacity: 0.85,
    elevation: 3,
  },
  instructionText: {
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 20,
    backgroundColor: 'rgba(6, 11, 22, 0.8)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  galleryBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(6, 11, 22, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  previewContainer: {
    flex: 1,
  },
  previewContent: {
    padding: 16,
    paddingBottom: 32,
  },
  imagePreviewBox: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  trashImageBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  attachedTag: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  attachedTagText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  inputCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6,
  },
  textInput: {
    borderBottomWidth: 1.5,
    fontSize: 12,
    paddingVertical: 6,
    fontWeight: '600',
  },
  voiceControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  recordBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFF',
  },
  recordedPillWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  recordedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flex: 1,
    marginRight: 10,
  },
  deleteVoiceBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 10,
    marginTop: 12,
    elevation: 3,
  },
  analyzeButtonText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  skeletonContainer: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  stageBox: {
    alignItems: 'center',
    marginBottom: 16,
  },
  pulsateIcon: {
    marginBottom: 10,
  },
  stageTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 6,
  },
  stageDesc: {
    fontSize: 10.5,
    textAlign: 'center',
    lineHeight: 15,
  },
  loadingProgressTrack: {
    height: 6,
    width: '100%',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 12,
  },
  loadingProgressBar: {
    height: '100%',
    borderRadius: 3,
  }
});

export default CameraScreen;
