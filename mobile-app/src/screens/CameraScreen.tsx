import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, StatusBar, ActivityIndicator, Alert, Animated, TextInput } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { X, RefreshCw, Image as ImageIcon, CheckCircle, Mic, ArrowRight, Zap, Target } from 'lucide-react-native';
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

const CameraScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, refreshHistory } = useApp();
  const activeTheme = Theme.colors[theme];
  
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  
  const cameraRef = useRef<any>(null);
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const driftAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0.2)).current;

  // Infinite tracking drift, rotating dial, and flashing alert caution loops
  useEffect(() => {
    if (!selectedImage && permission?.granted) {
      // 1. Sweeping laser line scan
      Animated.loop(
        Animated.sequence([
          Animated.timing(sweepAnim, {
            toValue: 246, // slightly less than targetBox height to stay inside borders
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

      // 2. Simulated tracking drift loop
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

      // 3. Rotating HUD dial loop
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        })
      ).start();

      // 4. Flashing LOTO safety target zone box
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

  const handleAnalyzeDirectly = async () => {
    if (!selectedImage) return;

    setAnalyzing(true);
    try {
      console.log(`[Camera] Submitting direct image analysis: ${selectedImage} with URL: ${manualUrl}`);
      const result = await analyzeDiagnostic({
        imageUri: selectedImage,
        manualUrl: manualUrl.trim() || null,
      });
      refreshHistory();
      setSelectedImage(null);
      setManualUrl('');
      navigation.navigate('Result', { analysisResult: result });
    } catch (e: any) {
      console.log('[Camera] Direct analysis failed:', e);
      Alert.alert('Analysis Failed', e.message || 'Error communicating with backend server.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddVoice = () => {
    if (!selectedImage) return;
    const tempImage = selectedImage;
    const url = manualUrl;
    setSelectedImage(null);
    setManualUrl('');
    navigation.navigate('VoiceQuery', { imageUri: tempImage, manualUrl: url.trim() || null } as any);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <X size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI VISION ALIGNMENT</Text>
        <TouchableOpacity 
          style={[styles.flashBtn, flash && { backgroundColor: activeTheme.primary }]}
          onPress={() => setFlash(!flash)}
        >
          <Zap size={18} color={flash ? '#000' : '#FFF'} />
        </TouchableOpacity>
      </View>

      {/* Main Viewport */}
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
              <Text style={styles.hudText}>INF-MODEL: RESNET-v5 // DETECT-FREQ: 60FPS</Text>
              <Text style={[styles.hudText, { color: activeTheme.success }]}>SYS STATE: ACQUISITION ACTIVE</Text>
            </View>

            {/* Simulated Bounding Box 1 (with motion tracking drift) */}
            <Animated.View style={[styles.mockBox, { top: '22%', left: '12%', borderColor: activeTheme.info, transform: driftAnim.getTranslateTransform() }]}>
              <View style={[styles.boxLabel, { backgroundColor: activeTheme.info }]}>
                <Text style={styles.boxLabelText}>VALVE COIL [94%]</Text>
              </View>
            </Animated.View>

            {/* Simulated Bounding Box 2 (with motion tracking drift) */}
            <Animated.View style={[styles.mockBox, { bottom: '26%', right: '14%', borderColor: activeTheme.warning, transform: driftAnim.getTranslateTransform() }]}>
              <View style={[styles.boxLabel, { backgroundColor: activeTheme.warning }]}>
                <Text style={[styles.boxLabelText, { color: '#000' }]}>GEARBOX WEAR [81%]</Text>
              </View>
            </Animated.View>

            {/* Simulated Flashing LOTO Safety Target Bounding Box */}
            <Animated.View style={[styles.hazardTargetBox, { borderColor: activeTheme.danger, opacity: flashAnim, transform: driftAnim.getTranslateTransform() }]}>
              <View style={[styles.hazardLabel, { backgroundColor: activeTheme.danger }]}>
                <Text style={styles.hazardLabelText}>LOTO CABINET [ISOLATE 480V]</Text>
              </View>
            </Animated.View>

            {/* Scanner Target Area */}
            <View style={styles.targetBox}>
              <View style={[styles.corner, styles.topLeft, { borderColor: activeTheme.primary }]} />
              <View style={[styles.corner, styles.topRight, { borderColor: activeTheme.primary }]} />
              <View style={[styles.corner, styles.bottomLeft, { borderColor: activeTheme.primary }]} />
              <View style={[styles.corner, styles.bottomRight, { borderColor: activeTheme.primary }]} />
              
              {/* Rotating HUD Calibration Dial */}
              <View style={styles.reticleCenter}>
                <Animated.View style={{ transform: [{ rotate: rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
                  <Svg width="180" height="180" viewBox="0 0 180 180">
                    <Circle cx="90" cy="90" r="80" stroke={activeTheme.primary} strokeWidth="1" strokeDasharray="4, 10" fill="none" opacity="0.3" />
                    <Circle cx="90" cy="90" r="70" stroke={activeTheme.info} strokeWidth="1.5" strokeDasharray="30, 25" fill="none" opacity="0.5" />
                    <Line x1="90" y1="10" x2="90" y2="25" stroke={activeTheme.primary} strokeWidth="1" opacity="0.6" />
                    <Line x1="90" y1="155" x2="90" y2="170" stroke={activeTheme.primary} strokeWidth="1" opacity="0.6" />
                    <Line x1="10" y1="90" x2="25" y2="90" stroke={activeTheme.primary} strokeWidth="1" opacity="0.6" />
                    <Line x1="155" y1="90" x2="170" y2="90" stroke={activeTheme.primary} strokeWidth="1" opacity="0.6" />
                  </Svg>
                </Animated.View>
              </View>

              {/* Pulsing Target Reticle */}
              <View style={styles.reticleCenter}>
                <Target size={28} color="rgba(0, 240, 255, 0.4)" strokeWidth={1} />
              </View>

              {/* Sweeping Laser Scan Line */}
              <Animated.View style={[
                styles.scanLine, 
                { 
                  backgroundColor: activeTheme.primary,
                  shadowColor: activeTheme.primary,
                  transform: [{ translateY: sweepAnim }] 
                }
              ]} />
            </View>

            <Text style={[styles.instructionText, { color: activeTheme.text }]}>ALIGN FAULTY COMPONENT IN HUD TARGET</Text>
          </View>

          {/* Viewport footer buttons */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handlePickImage} style={styles.galleryBtn}>
              <ImageIcon size={22} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleCapture} style={[styles.captureBtn, { borderColor: activeTheme.primary }]}>
              <View style={[styles.captureInner, { backgroundColor: activeTheme.primary }]} />
            </TouchableOpacity>

            <View style={{ width: 48 }} />
          </View>
        </View>
      ) : (
        // Preview State
        <View style={styles.previewContainer}>
          <Image source={{ uri: selectedImage }} style={styles.previewImage} />

          {analyzing && (
            <View style={styles.analyzingOverlay}>
              <ActivityIndicator size="large" color={activeTheme.primary} />
              <Text style={[styles.analyzingText, { color: activeTheme.primary }]}>
                INJECTING MULTIMODAL INFERENCE VECTOR...
              </Text>
            </View>
          )}

          {/* Control overlay */}
          <View style={styles.previewControls}>
            {/* Frosted manual URL input card */}
            <View style={[styles.urlCard, { backgroundColor: 'rgba(13, 17, 26, 0.85)', borderColor: activeTheme.border }]}>
              <Text style={[styles.urlLabel, { color: activeTheme.primary }]}>
                NO LOCAL MANUAL? PASTE WEBSITE URL
              </Text>
              <TextInput
                value={manualUrl}
                onChangeText={setManualUrl}
                placeholder="https://example.com/manual-page.html"
                placeholderTextColor={activeTheme.muted}
                style={[styles.urlInput, { color: activeTheme.text, borderBottomColor: activeTheme.primary }]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!analyzing}
              />
            </View>

            <TouchableOpacity 
              style={styles.retakeBtn} 
              onPress={() => setSelectedImage(null)}
              disabled={analyzing}
            >
              <RefreshCw size={14} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>RETAKE SHOT</Text>
            </TouchableOpacity>

            <View style={styles.flowOptions}>
              <TouchableOpacity 
                style={[styles.flowBtn, { backgroundColor: activeTheme.primary }]}
                onPress={handleAnalyzeDirectly}
                disabled={analyzing}
              >
                <CheckCircle size={15} color="#000" style={{ marginRight: 6 }} />
                <Text style={{ color: '#000', fontWeight: '900', fontSize: 13 }}>ANALYZE NOW</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.flowBtn, { backgroundColor: '#3B82F6' }]}
                onPress={handleAddVoice}
                disabled={analyzing}
              >
                <Mic size={15} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 13 }}>ADD VOICE</Text>
                <ArrowRight size={14} color="#FFF" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  grantBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  grantBtnText: {
    color: '#000',
    fontWeight: '800',
    letterSpacing: 1,
  },
  cancelLink: {
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 60,
    backgroundColor: '#060B16',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  flashBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  hudOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
  },
  hudText: {
    color: '#94A3B8',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginVertical: 2,
  },
  mockBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 4,
    padding: 4,
    width: 100,
    height: 60,
    borderStyle: 'dashed',
  },
  boxLabel: {
    position: 'absolute',
    top: -14,
    left: -1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 2,
  },
  boxLabelText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFF',
  },
  targetBox: {
    width: 254,
    height: 254,
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
    width: 24,
    height: 24,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  scanLine: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: 3,
    opacity: 0.95,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  instructionText: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 28,
    backgroundColor: 'rgba(6, 11, 22, 0.75)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  galleryBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(6, 11, 22, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  previewContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  previewImage: {
    flex: 1,
    resizeMode: 'cover',
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 11, 22, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzingText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 16,
  },
  previewControls: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
  urlCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  urlLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  urlInput: {
    height: 38,
    borderBottomWidth: 1.5,
    fontSize: 12,
    paddingVertical: 4,
    fontWeight: '600',
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6, 11, 22, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    height: 44,
    marginBottom: 12,
  },
  flowOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    height: 48,
    marginHorizontal: 4,
    elevation: 3,
  },
  hazardTargetBox: {
    position: 'absolute',
    top: '38%',
    right: '18%',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 6,
    padding: 4,
    width: 130,
    height: 80,
  },
  hazardLabel: {
    position: 'absolute',
    top: -14,
    left: -1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  hazardLabelText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  }
});

export default CameraScreen;
