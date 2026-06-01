import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert, ScrollView, Platform } from 'react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { Settings, Moon, Sun, Server, Camera, Mic, Info, CheckCircle2, Sliders, Volume2, ShieldCheck } from 'lucide-react-native';
import { getOllamaConfig, updateOllamaConfig } from '../services/api';

const SettingsScreen: React.FC = () => {
  const { theme, setTheme, backendUrl, updateBackendUrl, refreshHistory } = useApp();
  const activeTheme = Theme.colors[theme];

  const [inputUrl, setInputUrl] = useState(backendUrl);
  const [aiSensitivity, setAiSensitivity] = useState<'low' | 'med' | 'high'>('med');
  const [handsFree, setHandsFree] = useState(false);
  const [speechRate, setSpeechRate] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [pushAlerts, setPushAlerts] = useState(true);

  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3');

  useEffect(() => {
    let active = true;
    const fetchConfig = async () => {
      try {
        const config = await getOllamaConfig();
        if (active && config) {
          if (config.ollama_base_url) setOllamaUrl(config.ollama_base_url);
          if (config.ollama_model) setOllamaModel(config.ollama_model);
        }
      } catch (e) {
        console.log('[SettingsScreen] Failed to fetch Ollama config:', e);
      }
    };
    fetchConfig();
    return () => {
      active = false;
    };
  }, [backendUrl]);

  const handleSaveUrl = () => {
    if (!inputUrl.trim()) {
      Alert.alert('Invalid URL', 'Backend URL cannot be empty.');
      return;
    }
    
    if (!inputUrl.startsWith('http://') && !inputUrl.startsWith('https://')) {
      Alert.alert('Invalid Format', 'URL must start with http:// or https://');
      return;
    }

    updateBackendUrl(inputUrl.trim());
    Alert.alert('Settings Saved', 'Backend API URL updated successfully.', [
      { text: 'OK', onPress: () => refreshHistory() }
    ]);
  };

  const handleSaveOllamaConfig = async () => {
    if (!ollamaUrl.trim()) {
      Alert.alert('Invalid URL', 'Ollama Base URL cannot be empty.');
      return;
    }
    try {
      const response = await updateOllamaConfig({
        ollama_base_url: ollamaUrl.trim(),
        ollama_model: ollamaModel.trim(),
      });
      if (response && response.status === 'success') {
        Alert.alert('Success', 'Edge-AI configuration updated successfully.');
      } else {
        Alert.alert('Error', 'Failed to update Edge-AI configuration.');
      }
    } catch (e: any) {
      console.log('[SettingsScreen] Error saving config:', e);
      Alert.alert('Error', `Could not update backend Ollama settings: ${e.message || e}`);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: activeTheme.background }]} contentContainerStyle={styles.content}>
      
      {/* 1. Theme Setting Segment */}
      <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
        <Text style={[styles.cardLabel, { color: activeTheme.primary }]}>APPEARANCE SYSTEM SPECTRUM</Text>
        <Text style={[styles.descText, { color: activeTheme.muted, marginBottom: 12 }]}>
          Toggle between multiple tactical high-visibility color HUD profiles.
        </Text>
        
        <View style={styles.themeGrid}>
          {/* Cyberpunk HUD */}
          <Pressable 
            style={[
              styles.themeSelectorOption, 
              { backgroundColor: activeTheme.background, borderColor: theme === 'cyberpunk' || theme === 'dark' ? activeTheme.primary : 'rgba(255,255,255,0.03)' }
            ]}
            onPress={() => setTheme('cyberpunk')}
          >
            <View style={[styles.colorPreviewIndicator, { backgroundColor: '#00F0FF' }]} />
            <Text style={[styles.themeSelectorText, { color: theme === 'cyberpunk' || theme === 'dark' ? activeTheme.text : activeTheme.muted }]}>
              CYBERPUNK HUD
            </Text>
          </Pressable>

          {/* Steel Industrial */}
          <Pressable 
            style={[
              styles.themeSelectorOption, 
              { backgroundColor: activeTheme.background, borderColor: theme === 'steel' ? activeTheme.primary : 'rgba(255,255,255,0.03)' }
            ]}
            onPress={() => setTheme('steel')}
          >
            <View style={[styles.colorPreviewIndicator, { backgroundColor: '#F59E0B' }]} />
            <Text style={[styles.themeSelectorText, { color: theme === 'steel' ? activeTheme.text : activeTheme.muted }]}>
              STEEL AMBER
            </Text>
          </Pressable>
        </View>

        <View style={[styles.themeGrid, { marginTop: 8 }]}>
          {/* Emerald Biotech */}
          <Pressable 
            style={[
              styles.themeSelectorOption, 
              { backgroundColor: activeTheme.background, borderColor: theme === 'emerald' ? activeTheme.primary : 'rgba(255,255,255,0.03)' }
            ]}
            onPress={() => setTheme('emerald')}
          >
            <View style={[styles.colorPreviewIndicator, { backgroundColor: '#10B981' }]} />
            <Text style={[styles.themeSelectorText, { color: theme === 'emerald' ? activeTheme.text : activeTheme.muted }]}>
              BIOTECH EMERALD
            </Text>
          </Pressable>

          {/* Light Mode */}
          <Pressable 
            style={[
              styles.themeSelectorOption, 
              { backgroundColor: activeTheme.background, borderColor: theme === 'light' ? activeTheme.primary : 'rgba(255,255,255,0.03)' }
            ]}
            onPress={() => setTheme('light')}
          >
            <View style={[styles.colorPreviewIndicator, { backgroundColor: '#0284C7' }]} />
            <Text style={[styles.themeSelectorText, { color: theme === 'light' ? activeTheme.text : activeTheme.muted }]}>
              LIGHT INTERFACE
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 2. Connection Settings Segment */}
      <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
        <Text style={[styles.cardLabel, { color: activeTheme.primary }]}>CONNECTION ENDPOINT</Text>
        <Text style={[styles.descText, { color: activeTheme.muted }]}>
          Specify the local or production IP address of the FastAPI backend.
        </Text>
        
        <View style={styles.inputContainer}>
          <Server size={18} color={activeTheme.muted} style={styles.inputIcon} />
          <TextInput
            placeholder="http://192.168.1.100:8000"
            placeholderTextColor={activeTheme.muted}
            value={inputUrl}
            onChangeText={setInputUrl}
            style={[styles.textInput, { color: activeTheme.text, borderColor: activeTheme.border }]}
          />
        </View>

        <Pressable 
          style={({ pressed }) => [
            styles.saveBtn, 
            { 
              backgroundColor: activeTheme.primary,
              transform: [{ scale: pressed ? 1.01 : 1 }],
            }
          ]}
          onPress={handleSaveUrl}
        >
          <Text style={styles.saveBtnText}>SAVE API ENDPOINT</Text>
        </Pressable>
      </View>

      {/* Edge-AI Configuration Segment */}
      <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
        <View style={styles.labelWithIcon}>
          <Server size={14} color={activeTheme.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.cardLabel, { color: activeTheme.primary, marginBottom: 0 }]}>EDGE-AI CONFIGURATION (OLLAMA)</Text>
        </View>
        <Text style={[styles.descText, { color: activeTheme.muted, marginTop: 8 }]}>
          Configure the offline/local Ollama instance base URL and LLM model tag.
        </Text>
        
        <Text style={[styles.inputLabel, { color: activeTheme.text }]}>Ollama Node URL</Text>
        <View style={styles.inputContainer}>
          <Server size={18} color={activeTheme.muted} style={styles.inputIcon} />
          <TextInput
            placeholder="http://127.0.0.1:11434"
            placeholderTextColor={activeTheme.muted}
            value={ollamaUrl}
            onChangeText={setOllamaUrl}
            style={[styles.textInput, { color: activeTheme.text, borderColor: activeTheme.border }]}
          />
        </View>

        <Text style={[styles.inputLabel, { color: activeTheme.text }]}>Ollama Model Tag</Text>
        <View style={styles.inputContainer}>
          <Sliders size={18} color={activeTheme.muted} style={styles.inputIcon} />
          <TextInput
            placeholder="llama3"
            placeholderTextColor={activeTheme.muted}
            value={ollamaModel}
            onChangeText={setOllamaModel}
            style={[styles.textInput, { color: activeTheme.text, borderColor: activeTheme.border }]}
          />
        </View>

        <Pressable 
          style={({ pressed }) => [
            styles.saveBtn, 
            { 
              backgroundColor: activeTheme.primary,
              transform: [{ scale: pressed ? 1.01 : 1 }],
            }
          ]}
          onPress={handleSaveOllamaConfig}
        >
          <Text style={styles.saveBtnText}>SAVE EDGE-AI SETTINGS</Text>
        </Pressable>
      </View>

      {/* 3. AI Inference & Sensitivity Settings */}
      <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
        <View style={styles.labelWithIcon}>
          <Sliders size={14} color={activeTheme.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.cardLabel, { color: activeTheme.primary, marginBottom: 0 }]}>AI SENSITIVITY DECK</Text>
        </View>
        <Text style={[styles.descText, { color: activeTheme.muted, marginTop: 8 }]}>
          Set confidence threshold filter. High requires stronger model agreement before warning.
        </Text>

        <View style={styles.chipRow}>
          <Pressable 
            onPress={() => setAiSensitivity('low')}
            style={[
              styles.settingChip, 
              { backgroundColor: aiSensitivity === 'low' ? 'rgba(0, 240, 255, 0.15)' : activeTheme.background },
              aiSensitivity === 'low' && { borderColor: activeTheme.primary }
            ]}
          >
            <Text style={[styles.chipText, { color: aiSensitivity === 'low' ? activeTheme.primary : activeTheme.muted }]}>LOW (70%)</Text>
          </Pressable>

          <Pressable 
            onPress={() => setAiSensitivity('med')}
            style={[
              styles.settingChip, 
              { backgroundColor: aiSensitivity === 'med' ? 'rgba(0, 240, 255, 0.15)' : activeTheme.background },
              aiSensitivity === 'med' && { borderColor: activeTheme.primary }
            ]}
          >
            <Text style={[styles.chipText, { color: aiSensitivity === 'med' ? activeTheme.primary : activeTheme.muted }]}>MEDIUM (85%)</Text>
          </Pressable>

          <Pressable 
            onPress={() => setAiSensitivity('high')}
            style={[
              styles.settingChip, 
              { backgroundColor: aiSensitivity === 'high' ? 'rgba(0, 240, 255, 0.15)' : activeTheme.background },
              aiSensitivity === 'high' && { borderColor: activeTheme.primary }
            ]}
          >
            <Text style={[styles.chipText, { color: aiSensitivity === 'high' ? activeTheme.primary : activeTheme.muted }]}>HIGH (95%)</Text>
          </Pressable>
        </View>
      </View>

      {/* 4. Voice Guidance Settings */}
      <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
        <View style={styles.labelWithIcon}>
          <Volume2 size={14} color={activeTheme.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.cardLabel, { color: activeTheme.primary, marginBottom: 0 }]}>SPEECH & TRANSCRIPTION</Text>
        </View>

        {/* Toggle 1 */}
        <Pressable 
          onPress={() => setHandsFree(!handsFree)}
          style={styles.toggleItem}
        >
          <Text style={[styles.toggleText, { color: activeTheme.text }]}>Hands-free Voice Wake</Text>
          <View style={[styles.toggleSwitch, { backgroundColor: handsFree ? activeTheme.primary : '#1E293B' }]}>
            <View style={[styles.toggleKnob, handsFree && { transform: [{ translateX: 16 }] }]} />
          </View>
        </Pressable>

        {/* Selector */}
        <Text style={[styles.descText, { color: activeTheme.muted, marginTop: 12, marginBottom: 8 }]}>
          TTS Speech Playback Rate:
        </Text>
        <View style={styles.chipRow}>
          {['slow', 'normal', 'fast'].map((rate) => (
            <Pressable 
              key={rate}
              onPress={() => setSpeechRate(rate as any)}
              style={[
                styles.settingChip,
                { backgroundColor: speechRate === rate ? 'rgba(0, 240, 255, 0.15)' : activeTheme.background },
                speechRate === rate && { borderColor: activeTheme.primary }
              ]}
            >
              <Text style={[styles.chipText, { color: speechRate === rate ? activeTheme.primary : activeTheme.muted }]}>
                {rate.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 5. Notification Toggles */}
      <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
        <Text style={[styles.cardLabel, { color: activeTheme.primary }]}>ALERT PREFERENCES</Text>
        
        <Pressable 
          onPress={() => setPushAlerts(!pushAlerts)}
          style={styles.toggleItem}
        >
          <Text style={[styles.toggleText, { color: activeTheme.text }]}>Real-time Critical Notifications</Text>
          <View style={[styles.toggleSwitch, { backgroundColor: pushAlerts ? activeTheme.primary : '#1E293B' }]}>
            <View style={[styles.toggleKnob, pushAlerts && { transform: [{ translateX: 16 }] }]} />
          </View>
        </Pressable>
      </View>

      {/* 6. Device Hardware Diagnostic Status */}
      <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
        <Text style={[styles.cardLabel, { color: activeTheme.primary }]}>HARDWARE & SYSTEM PERMISSIONS</Text>
        
        <View style={styles.permissionItem}>
          <View style={styles.permissionLeft}>
            <Camera size={18} color={activeTheme.muted} style={{ marginRight: 8 }} />
            <Text style={[styles.permissionName, { color: activeTheme.text }]}>Camera Access</Text>
          </View>
          <CheckCircle2 size={16} color={activeTheme.success} />
        </View>

        <View style={[styles.permissionItem, { borderTopWidth: 1, borderTopColor: activeTheme.border }]}>
          <View style={styles.permissionLeft}>
            <Mic size={18} color={activeTheme.muted} style={{ marginRight: 8 }} />
            <Text style={[styles.permissionName, { color: activeTheme.text }]}>Microphone Access</Text>
          </View>
          <CheckCircle2 size={16} color={activeTheme.success} />
        </View>
      </View>

      {/* 7. About System Info */}
      <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border, marginBottom: 40 }]}>
        <Text style={[styles.cardLabel, { color: activeTheme.primary }]}>ABOUT ASSISTANT</Text>
        
        <View style={styles.infoRow}>
          <Info size={16} color={activeTheme.muted} style={{ marginRight: 8, marginTop: 2 }} />
          <Text style={[styles.infoText, { color: activeTheme.muted }]}>
            Smart Technician Assistant utilizes cognitive local vector retrieval and Vision models. Fully SSL encrypted.
          </Text>
        </View>

        <View style={[styles.versionRow, { borderTopWidth: 1, borderTopColor: activeTheme.border }]}>
          <Text style={[styles.versionLabel, { color: activeTheme.muted }]}>Software Version</Text>
          <Text style={[styles.versionValue, { color: activeTheme.text }]}>v1.0.8 (Stable Core)</Text>
        </View>
      </View>
    </ScrollView>
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
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 10,
    height: 50,
    marginHorizontal: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  themeOptionText: {
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 8,
  },
  descText: {
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  inputIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  textInput: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 42,
    paddingRight: 16,
    fontSize: 13,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any
    })
  },
  saveBtn: {
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  saveBtnText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  settingChip: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 3,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  chipText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  toggleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  toggleSwitch: {
    width: 38,
    height: 22,
    borderRadius: 11,
    padding: 3,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  permissionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  permissionName: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
  },
  versionRow: {
    marginTop: 14,
    paddingTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  versionLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  versionValue: {
    fontSize: 11,
    fontWeight: '800',
  },
  themeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  themeSelectorOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 8,
    borderWidth: 1.5,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  colorPreviewIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  themeSelectorText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  }
});

export default SettingsScreen;
