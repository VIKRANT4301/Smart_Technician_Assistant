import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image
} from 'react-native';
import {
  Search,
  Cpu,
  ShieldAlert,
  Check,
  RotateCcw,
  Activity,
  FileText,
  Volume2,
  Terminal,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Upload,
  PlusCircle,
  Camera,
  Mic
} from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { analyzeDiagnostic, uploadManualText, uploadManualFile, uploadManualUrl } from '../services/api';
import * as ImagePicker from 'expo-image-picker';

interface Props {
  navigation: any;
}

const SYMPTOM_PRESETS = [
  {
    label: 'Pump Leaking Water',
    query: 'Centrifugal pump is leaking water from the casing flange joint and base plate.'
  },
  {
    label: 'Coil Isolation Fault',
    query: 'High-voltage transformer coil showing isolation failure and winding resistance anomaly.'
  },
  {
    label: 'Condenser Unit Vibrating',
    query: 'HVAC condenser unit is vibrating excessively and overheating.'
  },
  {
    label: 'Pump Pressure Dropping',
    query: 'Fluid power pump H-500 discharge pressure dropping with cavitation noise.'
  }
];

const TERMINAL_LOGS = [
  'INIT COGNITIVE VECTOR ENGINE V3.4...',
  'ENCODING TEXT QUERY TO VECTOR WEIGHTS...',
  'RUNNING COSINE SEARCH ON RAG DATABASE...',
  'EXTRACTING TOP RELATIVE MANUAL EXCERPTS...',
  'COMPILING MULTIMODAL CONTEXT DECK...',
  'SENDING COMPILATION TO GEMINI REASONER...',
  'GENERATING STABILITY HYPOTHESIS MATRIX...',
  'FORMULATING SOP STEPS AND MIGRATION PATHS...',
  'TRANSLATING DIAGNOSTICS TO TARGET LANGUAGE...',
  'PACKAGING DIAGNOSTIC LOG TELEMETRY FEED...'
];

const KnowledgeScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, refreshHistory } = useApp();
  const activeTheme = Theme.colors[theme];

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any | null>(null);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);

  // Custom manual ingestion states
  const [showIngestManual, setShowIngestManual] = useState(false);
  const [productName, setProductName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [description, setDescription] = useState('');
  const [ingestMethod, setIngestMethod] = useState<'text' | 'file' | 'url'>('text');
  const [manualText, setManualText] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [diagnosticQuery, setDiagnosticQuery] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [devicePhotoUri, setDevicePhotoUri] = useState<string | null>(null);

  const handlePickDevicePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        setDevicePhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      console.log('[Knowledge] ImagePicker error:', err);
      Alert.alert('Gallery Error', 'Could not open image gallery.');
    }
  };

  const handleCaptureDevicePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to capture photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        setDevicePhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      console.log('[Knowledge] Camera launch error:', err);
      Alert.alert('Camera Error', 'Could not launch camera.');
    }
  };

  React.useEffect(() => {
    let interval: any;
    if (loading) {
      setTerminalLines(['[0.00s] SYSTEM DIAGNOSTICS CORE READY']);
      let currentIdx = 0;
      interval = setInterval(() => {
        if (currentIdx < TERMINAL_LOGS.length) {
          const timestamp = ((currentIdx + 1) * 0.15 + Math.random() * 0.05).toFixed(2);
          const newLine = `[${timestamp}s] ${TERMINAL_LOGS[currentIdx]}`;
          setTerminalLines(prev => [...prev, newLine]);
          currentIdx++;
        } else {
          clearInterval(interval);
        }
      }, 180);
    } else {
      setTerminalLines([]);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleRunDiagnosis = async (queryText = searchQuery) => {
    const query = queryText.trim();
    if (!query) {
      Alert.alert('Empty Symptom Query', 'Please describe the machine anomaly or symptoms.');
      return;
    }

    setLoading(true);
    setDiagnosticResult(null);
    try {
      console.log(`[Knowledge AI] Submitting symptom query: "${query}"`);
      const result = await analyzeDiagnostic({ queryText: query });
      
      if (result) {
        setDiagnosticResult(result);
        refreshHistory();
      } else {
        throw new Error('Null response from diagnosis engine');
      }
    } catch (e: any) {
      console.log('[Knowledge AI] Diagnosis failed:', e);
      Alert.alert('Fault Detection Failed', e.message || 'Error communicating with AI reasoning engine.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFile = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.pdf';
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
          const fileUri = URL.createObjectURL(file);
          setSelectedFileUri(fileUri);
          setSelectedFileName(file.name);
        }
      };
      input.click();
    } else {
      Alert.alert(
        'Platform Limitation',
        'Direct file upload is optimized for the web interface. Please paste the manual text content below to ingest on mobile devices.'
      );
    }
  };

  const handleIngestManual = async () => {
    if (!productName.trim() || !manufacturer.trim() || !modelNumber.trim()) {
      Alert.alert('Required Fields', 'Please fill in Product Name, Manufacturer, and Model Number.');
      return;
    }

    if (ingestMethod === 'text' && !manualText.trim()) {
      Alert.alert('Required Fields', 'Please paste the manual content text.');
      return;
    }

    if (ingestMethod === 'file' && !selectedFileUri) {
      Alert.alert('Required Fields', 'Please select a manual file (.txt or .pdf).');
      return;
    }

    if (ingestMethod === 'url' && !manualUrl.trim()) {
      Alert.alert('Required Fields', 'Please enter a manual URL.');
      return;
    }

    setIngesting(true);
    setLoading(true);
    setTerminalLines(['[0.00s] INITIALIZING CUSTOM MANUAL INGESTION PIPELINE...']);
    
    try {
      if (ingestMethod === 'text') {
        setTerminalLines(prev => [...prev, '[0.45s] SENDING TEXT PAYLOAD TO BACKEND FOR PARSING...']);
        await uploadManualText({
          product_name: productName.trim(),
          manufacturer: manufacturer.trim(),
          model_number: modelNumber.trim(),
          description: description.trim(),
          manual_text: manualText.trim(),
          category: 'manuals'
        });
      } else if (ingestMethod === 'url') {
        setTerminalLines(prev => [...prev, `[0.45s] REQUESTING CRAWLER ENGINE TO SCRAPE URL: ${manualUrl.trim()}...`]);
        await uploadManualUrl({
          product_name: productName.trim(),
          manufacturer: manufacturer.trim(),
          model_number: modelNumber.trim(),
          description: description.trim(),
          url: manualUrl.trim(),
          category: 'manuals'
        });
      } else {
        setTerminalLines(prev => [...prev, `[0.45s] UPLOADING FILE ${selectedFileName} WITH PRODUCT METADATA...`]);
        await uploadManualFile(
          selectedFileUri!,
          {
            product_name: productName.trim(),
            manufacturer: manufacturer.trim(),
            model_number: modelNumber.trim(),
            description: description.trim()
          },
          'manuals'
        );
      }

      setTerminalLines(prev => [...prev, '[1.10s] BACKEND RECEIVED PAYLOAD, SAVED DOCUMENT FILE']);
      setTerminalLines(prev => [...prev, '[1.80s] RUNNING RAG RE-INDEXING (CHUNK SPLITTING & EMBEDDING)...']);

      await new Promise(resolve => setTimeout(resolve, 800));

      setTerminalLines(prev => [...prev, '[2.60s] CUSTOM MANUAL FULLY INDEXED IN COGNITIVE VECTOR STORE!']);

      const finalModelNumber = modelNumber.trim();
      const finalProductName = productName.trim();

      // Reset form
      setProductName('');
      setManufacturer('');
      setModelNumber('');
      setDescription('');
      setManualText('');
      setManualUrl('');
      setSelectedFileUri(null);
      setSelectedFileName(null);
      setDevicePhotoUri(null);
      setShowIngestManual(false);

      if (diagnosticQuery.trim() || devicePhotoUri) {
        const queryText = diagnosticQuery.trim()
          ? `${finalModelNumber} - ${diagnosticQuery.trim()}`
          : `${finalModelNumber} - Multimodal visual inspection`;

        setTerminalLines(prev => [...prev, `[3.10s] AUTO-RUNNING TARGETED MULTIMODAL INFERENCE...`]);
        await new Promise(resolve => setTimeout(resolve, 600));
        
        const diagnosticRes = await analyzeDiagnostic({ 
          queryText, 
          imageUri: devicePhotoUri 
        });
        if (diagnosticRes) {
          setDiagnosticResult(diagnosticRes);
          refreshHistory();
          setDiagnosticQuery('');
          setDevicePhotoUri(null);
        } else {
          Alert.alert('Diagnosis Failed', 'Upload succeeded but immediate diagnosis failed.');
        }
      } else {
        Alert.alert(
          'Ingestion Complete',
          `Successfully registered product ${finalProductName} (${finalModelNumber}) and indexed its manual. It is now active in the RAG knowledge base.`
        );
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Ingestion Failed', e.message || 'Error occurred during manual indexing.');
    } finally {
      setIngesting(false);
      setLoading(false);
    }
  };

  const resetConsole = () => {
    setDiagnosticResult(null);
    setSearchQuery('');
  };

  const getSeverityColor = (level: string) => {
    const l = (level || 'Medium').toLowerCase();
    if (l === 'critical') return activeTheme.danger;
    if (l === 'high') return activeTheme.warning;
    if (l === 'medium') return activeTheme.info;
    return activeTheme.success;
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={[styles.container, { backgroundColor: activeTheme.background }]}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        
        {/* If no active recommendation, display the symptom input console */}
        {!diagnosticResult ? (
          <View>
            {/* Header block */}
            <View style={[styles.consoleCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
              <View style={styles.consoleHeader}>
                <Cpu size={24} color={activeTheme.primary} style={styles.cpuIcon} />
                <View>
                  <Text style={[styles.consoleTitle, { color: activeTheme.text }]}>AI FAULT DIAGNOSIS CONSOLE</Text>
                  <Text style={[styles.consoleSubtitle, { color: activeTheme.primary }]}>MULTIMODAL RAG COGNITIVE SEARCH</Text>
                </View>
              </View>

              <Text style={[styles.consoleDesc, { color: activeTheme.muted }]}>
                Submit machine symptoms or logs to trigger real-time AI fault classification, root-cause hypothesis generation, and localized manual recommendations.
              </Text>

              {/* Symptom Input Field */}
              <View style={[styles.inputWrapper, { backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}>
                <Pressable 
                  onPress={() => handleRunDiagnosis()}
                  style={({ pressed }) => [
                    styles.searchIconBtn,
                    pressed && { opacity: 0.7 }
                  ]}
                >
                  <Search size={20} color={activeTheme.primary} style={styles.searchIcon} />
                </Pressable>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={[styles.textInput, { color: activeTheme.text }]}
                  placeholder="Search, scan, or speak to diagnose..."
                  placeholderTextColor={activeTheme.muted}
                  onSubmitEditing={() => handleRunDiagnosis()}
                  returnKeyType="search"
                />
                <View style={styles.searchShortcutsRow}>
                  <Pressable 
                    style={({ pressed }) => [
                      styles.searchShortcutBtn,
                      pressed && { opacity: 0.7 }
                    ]}
                    onPress={() => navigation.navigate('Camera')}
                  >
                    <Camera size={20} color={activeTheme.primary} />
                  </Pressable>
                  <Pressable 
                    style={({ pressed }) => [
                      styles.searchShortcutBtn,
                      pressed && { opacity: 0.7 }
                    ]}
                    onPress={() => navigation.navigate('VoiceQuery')}
                  >
                    <Mic size={20} color={activeTheme.info} />
                  </Pressable>
                </View>
              </View>

              {/* Search, Scan, Speak Visual Helper Labels */}
              <View style={styles.searchLabelsRow}>
                <View style={styles.searchLabelTag}>
                  <Search size={10} color={activeTheme.muted} style={{ marginRight: 4 }} />
                  <Text style={[styles.searchLabelText, { color: activeTheme.muted }]}>SEARCH</Text>
                </View>
                <View style={styles.searchLabelTag}>
                  <Camera size={10} color={activeTheme.muted} style={{ marginRight: 4 }} />
                  <Text style={[styles.searchLabelText, { color: activeTheme.muted }]}>SCAN</Text>
                </View>
                <View style={styles.searchLabelTag}>
                  <Mic size={10} color={activeTheme.muted} style={{ marginRight: 4 }} />
                  <Text style={[styles.searchLabelText, { color: activeTheme.muted }]}>SPEAK</Text>
                </View>
              </View>

              {loading ? (
                <View style={[styles.terminalContainer, { backgroundColor: '#020617', borderColor: activeTheme.border }]}>
                  <View style={styles.terminalHeader}>
                    <Cpu size={14} color={activeTheme.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.terminalHeaderText, { color: activeTheme.primary }]}>AI DIAGNOSTICS LOG PROCESSOR</Text>
                  </View>
                  <ScrollView style={styles.terminalBody} contentContainerStyle={{ paddingVertical: 8 }}>
                    {terminalLines.map((line, idx) => (
                      <Text key={idx} style={[styles.terminalLineText, { color: activeTheme.primary }]}>
                        {line}
                      </Text>
                    ))}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 2 }}>
                      <ActivityIndicator size="small" color={activeTheme.primary} style={{ marginRight: 8 }} />
                      <Text style={{ fontSize: 9, color: activeTheme.muted, fontWeight: '700' }}>EXECUTING PIPELINE INFERENCE...</Text>
                    </View>
                  </ScrollView>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.submitBtn,
                    { backgroundColor: searchQuery.trim() ? activeTheme.primary : 'rgba(148, 163, 184, 0.1)' },
                    pressed && { opacity: 0.8 }
                  ]}
                  disabled={!searchQuery.trim()}
                  onPress={() => handleRunDiagnosis()}
                >
                  <Text style={[styles.submitBtnText, { color: searchQuery.trim() ? '#000' : activeTheme.muted }]}>
                    RUN FAULT DETECTION
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Custom Manual Ingestion Section */}
            <View style={[styles.ingestCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
              <Pressable
                style={styles.ingestHeader}
                onPress={() => setShowIngestManual(!showIngestManual)}
              >
                <View style={styles.ingestTitleRow}>
                  <FileText size={20} color={activeTheme.primary} style={{ marginRight: 10 }} />
                  <View>
                    <Text style={[styles.ingestTitle, { color: activeTheme.text }]}>INGEST CUSTOM TECHNICAL MANUAL</Text>
                    <Text style={[styles.ingestSubtitle, { color: activeTheme.primary }]}>INDEX DYNAMIC REPAIR INTELLIGENCE</Text>
                  </View>
                </View>
                {showIngestManual ? (
                  <ChevronUp size={18} color={activeTheme.muted} />
                ) : (
                  <ChevronDown size={18} color={activeTheme.muted} />
                )}
              </Pressable>

              {showIngestManual && (
                <View style={[styles.formContainer, { borderTopColor: activeTheme.border }]}>
                  {/* Product Name */}
                  <Text style={[styles.formLabel, { color: activeTheme.muted }]}>PRODUCT NAME</Text>
                  <TextInput
                    value={productName}
                    onChangeText={setProductName}
                    style={[styles.formInput, { color: activeTheme.text, backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}
                    placeholder="e.g. Industrial Valve V3"
                    placeholderTextColor={activeTheme.muted}
                  />

                  {/* Manufacturer */}
                  <Text style={[styles.formLabel, { color: activeTheme.muted }]}>MANUFACTURER</Text>
                  <TextInput
                    value={manufacturer}
                    onChangeText={setManufacturer}
                    style={[styles.formInput, { color: activeTheme.text, backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}
                    placeholder="e.g. Honeywell"
                    placeholderTextColor={activeTheme.muted}
                  />

                  {/* Model Number */}
                  <Text style={[styles.formLabel, { color: activeTheme.muted }]}>MODEL NUMBER</Text>
                  <TextInput
                    value={modelNumber}
                    onChangeText={setModelNumber}
                    style={[styles.formInput, { color: activeTheme.text, backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}
                    placeholder="e.g. HW-V3"
                    placeholderTextColor={activeTheme.muted}
                  />

                  {/* Description */}
                  <Text style={[styles.formLabel, { color: activeTheme.muted }]}>DESCRIPTION (OPTIONAL)</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    style={[styles.formInput, { color: activeTheme.text, backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}
                    placeholder="e.g. Official pressure valve maintenance log SOP"
                    placeholderTextColor={activeTheme.muted}
                  />

                  {/* Ingest Method Toggle */}
                  <Text style={[styles.formLabel, { color: activeTheme.muted }]}>INGESTION METHOD</Text>
                  <View style={[styles.toggleGroup, { backgroundColor: activeTheme.background, borderColor: activeTheme.border, borderWidth: 1 }]}>
                    <Pressable
                      style={[
                        styles.toggleBtn,
                        ingestMethod === 'text' && { backgroundColor: 'rgba(0, 240, 255, 0.15)' }
                      ]}
                      onPress={() => setIngestMethod('text')}
                    >
                      <Text style={[styles.toggleBtnText, { color: ingestMethod === 'text' ? activeTheme.primary : activeTheme.muted }]}>
                        PASTE TEXT
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.toggleBtn,
                        ingestMethod === 'file' && { backgroundColor: 'rgba(0, 240, 255, 0.15)' }
                      ]}
                      onPress={() => setIngestMethod('file')}
                    >
                      <Text style={[styles.toggleBtnText, { color: ingestMethod === 'file' ? activeTheme.primary : activeTheme.muted }]}>
                        UPLOAD FILE
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.toggleBtn,
                        ingestMethod === 'url' && { backgroundColor: 'rgba(0, 240, 255, 0.15)' }
                      ]}
                      onPress={() => setIngestMethod('url')}
                    >
                      <Text style={[styles.toggleBtnText, { color: ingestMethod === 'url' ? activeTheme.primary : activeTheme.muted }]}>
                        FROM URL
                      </Text>
                    </Pressable>
                  </View>

                  {ingestMethod === 'text' && (
                    <View>
                      <Text style={[styles.formLabel, { color: activeTheme.muted }]}>MANUAL TEXT CONTENT</Text>
                      <TextInput
                        value={manualText}
                        onChangeText={setManualText}
                        style={[styles.formTextArea, { color: activeTheme.text, backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}
                        placeholder="Paste official troubleshooting steps, safety codes, and repair documentation details..."
                        placeholderTextColor={activeTheme.muted}
                        multiline={true}
                        numberOfLines={6}
                      />
                    </View>
                  )}

                  {ingestMethod === 'file' && (
                    <Pressable
                      style={[styles.fileSelector, { borderColor: selectedFileUri ? activeTheme.primary : activeTheme.border, backgroundColor: activeTheme.background }]}
                      onPress={handleSelectFile}
                    >
                      <Upload size={24} color={selectedFileUri ? activeTheme.primary : activeTheme.muted} />
                      <Text style={[styles.fileSelectorText, { color: selectedFileUri ? activeTheme.primary : activeTheme.text }]}>
                        {selectedFileUri ? 'MANUAL FILE CHARGED' : 'SELECT DOCUMENT FILE'}
                      </Text>
                      {selectedFileName && (
                        <Text style={[styles.fileSelectedInfo, { color: activeTheme.muted }]}>
                          {selectedFileName}
                        </Text>
                      )}
                    </Pressable>
                  )}

                  {ingestMethod === 'url' && (
                    <View>
                      <Text style={[styles.formLabel, { color: activeTheme.muted }]}>MANUAL WEB URL</Text>
                      <TextInput
                        value={manualUrl}
                        onChangeText={setManualUrl}
                        style={[styles.formInput, { color: activeTheme.text, backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}
                        placeholder="https://example.com/repairs/manual.html"
                        placeholderTextColor={activeTheme.muted}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                  )}

                  {/* Device Fault Photo Section */}
                  <Text style={[styles.formLabel, { color: activeTheme.muted }]}>DEVICE FAULT PHOTO (OPTIONAL)</Text>
                  {devicePhotoUri ? (
                    <View style={[styles.photoPreviewCard, { borderColor: activeTheme.primary, backgroundColor: activeTheme.background }]}>
                      <Image source={{ uri: devicePhotoUri }} style={styles.photoPreviewImage} />
                      <View style={styles.photoPreviewOverlay}>
                        <View style={[styles.previewReticle, { borderColor: activeTheme.primary }]}>
                          <View style={[styles.previewDot, { backgroundColor: activeTheme.primary }]} />
                        </View>
                        <Pressable
                          style={[styles.removePhotoBtn, { backgroundColor: 'rgba(239, 68, 68, 0.85)' }]}
                          onPress={() => setDevicePhotoUri(null)}
                        >
                          <Text style={styles.removePhotoText}>REMOVE PHOTO</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.photoUploadCard, { borderColor: activeTheme.border, backgroundColor: activeTheme.background }]}>
                      <Camera size={24} color={activeTheme.muted} style={{ marginBottom: 8 }} />
                      <Text style={[styles.photoUploadText, { color: activeTheme.text, marginBottom: 12 }]}>
                        ADD PROBLEMATIC DEVICE VISUAL
                      </Text>
                      <View style={styles.photoActionRow}>
                        <Pressable
                          style={[styles.photoActionBtn, { backgroundColor: 'rgba(0, 240, 255, 0.15)', borderColor: activeTheme.primary, borderWidth: 1 }]}
                          onPress={handleCaptureDevicePhoto}
                        >
                          <Text style={[styles.photoActionBtnText, { color: activeTheme.primary }]}>CAMERA CAPTURE</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.photoActionBtn, { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: activeTheme.border, borderWidth: 1 }]}
                          onPress={handlePickDevicePhoto}
                        >
                          <Text style={[styles.photoActionBtnText, { color: activeTheme.text }]}>GALLERY UPLOAD</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {/* Diagnostic Query input */}
                  <Text style={[styles.formLabel, { color: activeTheme.muted }]}>RUN IMMEDIATE DIAGNOSIS QUERY (OPTIONAL)</Text>
                  <TextInput
                    value={diagnosticQuery}
                    onChangeText={setDiagnosticQuery}
                    style={[styles.formInput, { color: activeTheme.text, backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}
                    placeholder="e.g. pressure flashes red three times"
                    placeholderTextColor={activeTheme.muted}
                  />

                  {ingesting ? (
                    <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={activeTheme.primary} />
                      <Text style={{ fontSize: 9, color: activeTheme.primary, fontWeight: '700', marginTop: 6, letterSpacing: 1 }}>
                        INDEXING INTEL DECK...
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [
                        styles.ingestSubmitBtn,
                        { backgroundColor: activeTheme.primary },
                        pressed && { opacity: 0.8 }
                      ]}
                      onPress={handleIngestManual}
                    >
                      <Text style={[styles.ingestSubmitBtnText, { color: '#000' }]}>
                        INGEST & RUN DIAGNOSIS
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* Template Presets */}
            {!loading && (
              <View style={styles.presetSection}>
                <Text style={[styles.presetSectionTitle, { color: activeTheme.primary }]}>TEMPLATE SYMPTOMS</Text>
                {SYMPTOM_PRESETS.map((preset, i) => (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [
                      styles.presetCard,
                      { backgroundColor: activeTheme.card, borderColor: activeTheme.border },
                      pressed && { borderColor: activeTheme.primary }
                    ]}
                    onPress={() => {
                      setSearchQuery(preset.query);
                      handleRunDiagnosis(preset.query);
                    }}
                  >
                    <View style={styles.presetHeader}>
                      <Terminal size={14} color={activeTheme.primary} style={{ marginRight: 6 }} />
                      <Text style={[styles.presetLabel, { color: activeTheme.text }]}>{preset.label}</Text>
                    </View>
                    <Text style={[styles.presetDesc, { color: activeTheme.muted }]}>{preset.query}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : (
          // Active AI Recommendation view
          <View>
            {renderActiveNodeBadge(diagnosticResult.inference_node || 'LOCAL HEURISTIC RULES')}
            {/* Top diagnostic header */}
            <View style={[styles.reportCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
              <View style={styles.reportHeader}>
                <View>
                  <Text style={[styles.reportSubtitle, { color: activeTheme.primary }]}>DETECTION ENGINE VERDICT</Text>
                  <Text style={[styles.reportTitle, { color: activeTheme.text }]}>
                    {diagnosticResult.detected_issue}
                  </Text>
                </View>
                <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(diagnosticResult.severity_level) }]}>
                  <Text style={styles.severityText}>{diagnosticResult.severity_level?.toUpperCase() || 'MEDIUM'}</Text>
                </View>
              </View>

              {/* Confidence scores */}
              <View style={[styles.scoresContainer, { borderTopColor: activeTheme.border }]}>
                <View style={styles.scoreMetric}>
                  <Text style={[styles.metricLabel, { color: activeTheme.muted }]}>AI CONFIDENCE</Text>
                  <Text style={[styles.metricValue, { color: activeTheme.primary }]}>
                    {diagnosticResult.confidence_score || diagnosticResult.confidence || '90%'}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.scoreMetric}>
                  <Text style={[styles.metricLabel, { color: activeTheme.muted }]}>REPAIR SUCCESS</Text>
                  <Text style={[styles.metricValue, { color: activeTheme.success }]}>
                    {diagnosticResult.repair_success_probability || '85%'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Hypotheses Matrix */}
            <View style={[styles.reportCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
              <Text style={[styles.cardHeading, { color: activeTheme.primary }]}>AI COGNITION HYPOTHESIS MATRIX</Text>
              {diagnosticResult.root_cause_rankings?.map((hypo: any, idx: number) => {
                const prob = parseInt(hypo.probability) || 50;
                const barColor = idx === 0 ? activeTheme.primary : idx === 1 ? activeTheme.info : activeTheme.warning;
                return (
                  <View key={idx} style={styles.hypoRow}>
                    <View style={styles.hypoMeta}>
                      <Text style={[styles.hypoName, { color: activeTheme.text }]}>{hypo.cause}</Text>
                      <Text style={[styles.hypoVal, { color: barColor }]}>{prob}%</Text>
                    </View>
                    <View style={[styles.hypoBarBg, { backgroundColor: '#1E293B' }]}>
                      <View style={[styles.hypoBarFill, { width: `${prob}%`, backgroundColor: barColor }]} />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Explanation reasoning */}
            <View style={[styles.reportCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
              <Text style={[styles.cardHeading, { color: activeTheme.primary }]}>DIAGNOSTIC LOGICAL EXPLANATION</Text>
              <Text style={[styles.explanationText, { color: activeTheme.text }]}>
                {diagnosticResult.reasoning_explanation || diagnosticResult.root_cause}
              </Text>
            </View>

            {/* Critical Safety Mandate */}
            {diagnosticResult.safety_recommendations && (
              <View style={[styles.safetyCard, { borderColor: activeTheme.danger }]}>
                <View style={styles.safetyHeader}>
                  <ShieldAlert size={16} color={activeTheme.danger} style={{ marginRight: 6 }} />
                  <Text style={[styles.safetyTitle, { color: activeTheme.danger }]}>SAFETY MANDATE</Text>
                </View>
                <Text style={styles.safetyDesc}>{diagnosticResult.safety_recommendations}</Text>
              </View>
            )}

            {/* Recommended Steps checklist */}
            {diagnosticResult.suggested_steps && (
              <View style={[styles.reportCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
                <Text style={[styles.cardHeading, { color: activeTheme.primary }]}>RECOMMENDED SOP REPAIR STEPS</Text>
                {diagnosticResult.suggested_steps.map((step: string, idx: number) => (
                  <View key={idx} style={[styles.stepRow, { borderBottomColor: activeTheme.border }]}>
                    <View style={styles.stepCircle}>
                      <Text style={styles.stepNum}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.stepText, { color: activeTheme.text }]}>{step}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: '#1E293B', borderColor: activeTheme.border, borderWidth: 1 },
                  pressed && { opacity: 0.8 }
                ]}
                onPress={resetConsole}
              >
                <RotateCcw size={16} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 11 }}>RESET CONSOLE</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: activeTheme.primary },
                  pressed && { opacity: 0.8 }
                ]}
                onPress={() => navigation.navigate('Result', { analysisResult: diagnosticResult })}
              >
                <Volume2 size={16} color="#000" style={{ marginRight: 6 }} />
                <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 11 }}>LAUNCH DYNAMIC SOP</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  consoleCard: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  consoleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cpuIcon: {
    marginRight: 12,
  },
  consoleTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  consoleSubtitle: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 2,
  },
  consoleDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 26,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 10,
  },
  searchIcon: {
    marginRight: 4,
  },
  searchIconBtn: {
    padding: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    height: '100%',
    paddingHorizontal: 8,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any
    })
  },
  submitBtn: {
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  loadingText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 10,
  },
  presetSection: {
    marginTop: 6,
  },
  presetSectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
  },
  presetCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  presetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  presetDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  // Report styling
  reportCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reportSubtitle: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 8,
    color: '#000',
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  scoresContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 14,
    justifyContent: 'space-around',
  },
  scoreMetric: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardHeading: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 14,
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
  explanationText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  safetyCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.05)',
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  safetyTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  safetyDesc: {
    fontSize: 11,
    lineHeight: 16,
    color: '#FFF',
    fontWeight: '600',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  stepCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  stepNum: {
    color: '#00F0FF',
    fontSize: 9,
    fontWeight: '900',
  },
  stepText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  terminalContainer: {
    borderWidth: 1.5,
    borderRadius: 10,
    height: 180,
    marginTop: 10,
    overflow: 'hidden',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  terminalHeaderText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  terminalBody: {
    flex: 1,
    paddingHorizontal: 12,
  },
  terminalLineText: {
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 15,
    fontWeight: '600',
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
  ingestCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  ingestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ingestTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ingestTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  ingestSubtitle: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 2,
  },
  formContainer: {
    marginTop: 18,
    borderTopWidth: 1,
    paddingTop: 16,
  },
  formLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  formTextArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    fontWeight: '600',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  toggleGroup: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  fileSelector: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  fileSelectorText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  fileSelectedInfo: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  ingestSubmitBtn: {
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  ingestSubmitBtnText: {
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  searchShortcutsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 8,
  },
  searchShortcutBtn: {
    padding: 6,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  searchLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
    marginBottom: 16,
  },
  searchLabelTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  searchLabelText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  photoUploadCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  photoUploadText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    justifyContent: 'center',
  },
  photoActionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 160,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  photoActionBtnText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  photoPreviewCard: {
    borderWidth: 2,
    borderRadius: 12,
    height: 180,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
  },
  photoPreviewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  previewReticle: {
    width: 60,
    height: 60,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 30,
    alignSelf: 'center',
    marginTop: 35,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.6,
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  removePhotoBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  removePhotoText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  }
});

export default KnowledgeScreen;
