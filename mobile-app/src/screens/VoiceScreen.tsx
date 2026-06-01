import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, StatusBar, Alert, Platform, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import { Mic, Square, Trash2, ArrowLeft, ArrowUp, Info, Radio, MessageSquareCode } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { analyzeDiagnostic } from '../services/api';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type VoiceScreenRouteProp = RouteProp<RootStackParamList, 'VoiceQuery'> & {
  params?: {
    imageUri?: string;
    manualUrl?: string;
  }
};
type VoiceScreenNavigationProp = StackNavigationProp<RootStackParamList, 'VoiceQuery'>;

interface Props {
  route: VoiceScreenRouteProp;
  navigation: VoiceScreenNavigationProp;
}

const VoiceScreen: React.FC<Props> = ({ route, navigation }) => {
  const imageUri = route.params?.imageUri;
  const manualUrl = route.params?.manualUrl;
  const { theme, refreshHistory } = useApp();
  const activeTheme = Theme.colors[theme];

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [waveHeights, setWaveHeights] = useState<number[]>(Array.from({ length: 15 }, () => 10));
  const [transcriptStream, setTranscriptStream] = useState('Awaiting operator voice input...');
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sound Wave Fluctuations
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setWaveHeights(Array.from({ length: 18 }, () => Math.floor(Math.random() * 45) + 12));
        
        // Simulate real-time streaming transcripts based on recording time
        setTranscriptStream((prev) => {
          if (prev === 'Awaiting operator voice input...') return 'TRANSCRIPT ENGINE START...';
          const logs = [
            'STREAMING: "checking hydraulic shaft valve leak on H-500..."',
            'STREAMING: "checking hydraulic shaft valve leak on H-500... temperature readings exceed..."',
            'STREAMING: "checking hydraulic shaft valve leak on H-500... temperature readings exceed normal threshold..."',
            'STREAMING: "checking hydraulic shaft valve leak on H-500... temperature readings exceed normal threshold... requesting immediate SOP guide..."'
          ];
          const logIdx = Math.min(Math.floor(recordingDuration / 3), logs.length - 1);
          return logs[logIdx];
        });
      }, 150);
    } else {
      setWaveHeights(Array.from({ length: 18 }, () => 10));
    }
    return () => clearInterval(interval);
  }, [isRecording, recordingDuration]);

  useEffect(() => {
    // Request microphone permission on load
    if (Platform.OS !== 'web') {
      Audio.requestPermissionsAsync();
    } else {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
          console.log('[Voice] Web microphone permission request/denial:', err);
        });
      }
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      if (Platform.OS !== 'web') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }

      console.log('[Voice] Starting audio recording...');
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
      setRecordedUri(null);
      setTranscriptStream('Listening to operator stream...');

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('[Voice] Failed to start recording:', err);
      Alert.alert('Microphone Error', 'Could not start recording session.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      console.log('[Voice] Stopping audio recording...');
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedUri(uri);
      setRecording(null);
      setTranscriptStream((prev) => prev.replace('STREAMING:', 'CAPTURED TRANSCRIPT:'));
    } catch (err) {
      console.error('[Voice] Failed to stop recording:', err);
    }
  };

  const deleteRecording = () => {
    setRecordedUri(null);
    setRecordingDuration(0);
    setTranscriptStream('Awaiting operator voice input...');
  };

  const formatDuration = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const remainingSeconds = secs % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async () => {
    const audioToSubmit = recordedUri;
    if (!audioToSubmit) {
      Alert.alert('No Audio', 'Please record a voice query before submitting.');
      return;
    }

    setAnalyzing(true);
    try {
      console.log(`[Voice] Submitting diagnostic analysis. Audio: ${audioToSubmit}, Image: ${imageUri || 'None'}, URL: ${manualUrl || 'None'}`);
      const result = await analyzeDiagnostic({
        audioUri: audioToSubmit,
        imageUri: imageUri,
        manualUrl: manualUrl
      });
      refreshHistory();
      setRecordedUri(null);
      setRecordingDuration(0);
      navigation.navigate('Result', { analysisResult: result });
    } catch (e: any) {
      console.log('[Voice] Pipeline submission failed:', e);
      Alert.alert('Analysis Failed', e.message || 'Error processing multimodal query.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: activeTheme.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#060B16" />
      
      {/* Header bar */}
      <View style={[styles.header, { backgroundColor: activeTheme.card, borderBottomColor: activeTheme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} disabled={analyzing} style={styles.backBtn}>
          <ArrowLeft size={24} color={activeTheme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: activeTheme.text }]}>VOICE CORE SYSTEM</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Associated image thumbnail (if passed from camera) */}
        {imageUri ? (
          <View style={[styles.imagePreviewContainer, { borderColor: activeTheme.border }]}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <View style={[styles.imageOverlayTag, { backgroundColor: activeTheme.primary }]}>
              <Text style={styles.imageTagText}>ATTACHED IMAGE CONTEXT</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.noImageCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
            <Info size={18} color={activeTheme.info} style={{ marginBottom: 6 }} />
            <Text style={[styles.noImageText, { color: activeTheme.text }]}>AUDIO ONLY RETRIEVAL</Text>
            <Text style={[styles.noImageSub, { color: activeTheme.muted }]}>
              AI will search safety procedures using voice speech RAG matching.
            </Text>
          </View>
        )}

        {/* Central pulsing node avatar */}
        <View style={styles.avatarOuter}>
          <View style={[styles.avatarRing, { borderColor: isRecording ? activeTheme.danger : activeTheme.primary, shadowColor: isRecording ? activeTheme.danger : activeTheme.primary }]}>
            <View style={styles.avatarInner}>
              <Radio size={36} color={isRecording ? activeTheme.danger : activeTheme.primary} />
            </View>
          </View>
          <Text style={[styles.listenStateText, { color: isRecording ? activeTheme.danger : activeTheme.text }]}>
            {isRecording ? 'A.I. IS LISTENING...' : 'READY FOR INPUT'}
          </Text>
        </View>

        {/* Real-time decibel wavebars */}
        <View style={styles.waveformWrapper}>
          <View style={styles.waveContainer}>
            {waveHeights.map((h, i) => (
              <View 
                key={i} 
                style={[
                  styles.waveBar, 
                  { 
                    height: h, 
                    backgroundColor: isRecording ? activeTheme.danger : activeTheme.primary,
                    opacity: isRecording ? 1 : 0.4
                  }
                ]} 
              />
            ))}
          </View>
        </View>

        {/* Real-time Streaming Transcript Console */}
        <View style={[styles.transcriptConsole, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
          <View style={styles.transcriptHeader}>
            <MessageSquareCode size={14} color={activeTheme.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.transcriptHeaderTitle, { color: activeTheme.muted }]}>SPEECH STREAM LOG</Text>
          </View>
          <Text style={[styles.transcriptBody, { color: activeTheme.text }]}>
            {transcriptStream}
          </Text>
        </View>

        {/* Recording Duration Meter */}
        <View style={styles.timerContainer}>
          <Text style={[styles.timerText, { color: isRecording ? activeTheme.danger : activeTheme.text }]}>
            {formatDuration(recordingDuration)}
          </Text>
          <Text style={[styles.statusSubText, { color: activeTheme.muted }]}>
            MAX STREAM SIZE Limit: 10m // 44.1 kHz WMT
          </Text>
        </View>

        {/* Dynamic Controls */}
        <View style={styles.controlsRow}>
          {/* Clear Button */}
          {recordedUri && !analyzing && (
            <TouchableOpacity onPress={deleteRecording} style={[styles.auxBtn, { borderColor: activeTheme.danger }]}>
              <Trash2 size={20} color={activeTheme.danger} />
            </TouchableOpacity>
          )}

          {/* Record Button */}
          {!recordedUri ? (
            <TouchableOpacity 
              onPress={isRecording ? stopRecording : startRecording} 
              style={[styles.mainRecordBtn, { 
                backgroundColor: isRecording ? activeTheme.danger : activeTheme.primary,
                shadowColor: isRecording ? activeTheme.danger : activeTheme.primary
              }]}
            >
              {isRecording ? (
                <Square size={26} color="#FFF" />
              ) : (
                <Mic size={26} color="#000" />
              )}
            </TouchableOpacity>
          ) : (
            // Submit Button
            !analyzing && (
              <TouchableOpacity onPress={handleSubmit} style={[styles.submitBtn, { backgroundColor: activeTheme.success }]}>
                <ArrowUp size={24} color="#FFF" />
                <Text style={styles.submitBtnText}>TRANSCRIBE & RESOLVE</Text>
              </TouchableOpacity>
            )
          )}

          {/* Spacer */}
          {recordedUri && !analyzing && <View style={{ width: 50 }} />}
        </View>

        {/* Loading Overlay */}
        {analyzing && (
          <View style={styles.analyzingContainer}>
            <ActivityIndicator size="large" color={activeTheme.primary} />
            <Text style={[styles.analyzingText, { color: activeTheme.text }]}>
              COMPUTING NEURAL PIPELINE TRANSCRIPTION...
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 60,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  scrollContent: {
    padding: 24,
    alignItems: 'center',
    paddingBottom: 40,
  },
  imagePreviewContainer: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 20,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageOverlayTag: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  imageTagText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  noImageCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  noImageText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  noImageSub: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
  },
  avatarOuter: {
    alignItems: 'center',
    marginVertical: 14,
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listenStateText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 12,
  },
  waveformWrapper: {
    width: '100%',
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  waveBar: {
    width: 3.5,
    marginHorizontal: 2.5,
    borderRadius: 2,
  },
  transcriptConsole: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  transcriptHeaderTitle: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  transcriptBody: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  timerText: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 1,
  },
  statusSubText: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  auxBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 24,
  },
  mainRecordBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    elevation: 3,
  },
  submitBtnText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 12,
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  analyzingContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(6, 11, 22, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  analyzingText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 16,
  }
});

export default VoiceScreen;
