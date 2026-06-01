import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { Camera, Mic, Search, ShieldAlert, Cpu, CheckCircle2, History, Bell, Activity, Thermometer, Radio, BookOpen, MessageSquare, Sliders } from 'lucide-react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { analyzeDiagnostic } from '../services/api';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MainTabs'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, historyList, refreshHistory } = useApp();
  const activeTheme = Theme.colors[theme];
  
  const [textQuery, setTextQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // Statistics calculations
  const totalScans = historyList.length;
  const criticalIssues = historyList.filter(item => {
    const isCritical = (item.severity_level && item.severity_level.toLowerCase() === 'critical') || 
                       (item.detected_issue && (item.detected_issue.toLowerCase().includes('cabinet') || item.detected_issue.toLowerCase().includes('leak') || item.detected_issue.toLowerCase().includes('overheating')));
    return isCritical;
  }).length;

  // Dynamic Metrics Formulas
  const computedDowntimeSaved = Math.round((totalScans * 45) / 60 * 10) / 10; // 45 mins saved per scan, in hours
  const computedMTTR = Math.max(12, Math.round((45 - totalScans * 2) * 10) / 10); // Starts at 45m and decreases with usage down to 12m
  const globalHealthScore = Math.min(100, Math.max(72, 98 - criticalIssues * 8)); // Dynamic score based on critical count

  const handleTextSearch = async () => {
    if (!textQuery.trim()) {
      Alert.alert('Empty Query', 'Please write your troubleshooting query first.');
      return;
    }
    
    setSearching(true);
    try {
      console.log(`[Home] Submitting AI solution query: ${textQuery}`);
      const result = await analyzeDiagnostic({ queryText: textQuery });
      setTextQuery('');
      refreshHistory();
      navigation.navigate('Result', { analysisResult: result });
    } catch (e: any) {
      console.log('[Home] AI solution query failed:', e);
      Alert.alert('AI Search Failed', e.message || 'Error communicating with backend.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: activeTheme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* 1. Futuristic Shift Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={[styles.headerSubtitle, { color: activeTheme.primary }]}>OPERATIONAL NODE // ENG-4029</Text>
          <Text style={[styles.headerTitle, { color: activeTheme.text }]}>WELCOME, ENGINEER</Text>
        </View>
        <Pressable 
          style={({ pressed }) => [
            styles.bellBtn, 
            { backgroundColor: activeTheme.card, borderColor: activeTheme.border },
            pressed && { borderColor: activeTheme.primary }
          ]}
          onPress={() => navigation.navigate('Notifications' as any)}
        >
          <Bell size={18} color={activeTheme.text} />
          <View style={[styles.badgeIndicator, { backgroundColor: activeTheme.danger }]} />
        </Pressable>
      </View>

      {/* 2. System Status Banner (Jarvis Alert Style) */}
      <View style={[styles.statusBanner, { 
        backgroundColor: criticalIssues > 0 ? 'rgba(255, 59, 48, 0.08)' : 'rgba(0, 255, 102, 0.06)',
        borderColor: criticalIssues > 0 ? activeTheme.danger : activeTheme.success,
      }]}>
        <View style={styles.statusRow}>
          {criticalIssues > 0 ? (
            <ShieldAlert size={18} color={activeTheme.danger} style={styles.bannerIcon} />
          ) : (
            <CheckCircle2 size={18} color={activeTheme.success} style={styles.bannerIcon} />
          )}
          <Text style={[styles.statusText, { 
            color: criticalIssues > 0 ? activeTheme.danger : activeTheme.success 
          }]}>
            {criticalIssues > 0 
              ? `WARNING: ${criticalIssues} DANGER ANOMALIES DETECTED` 
              : 'ALL MONITORED CORE ENGINES STATUS: OPTIMAL'}
          </Text>
        </View>
      </View>

      {/* 3. Telemetry/Metrics Grid */}
      <Text style={[styles.sectionTitle, { color: activeTheme.primary }]}>OPERATIONAL TELEMETRY & HEALTH</Text>
      <View style={styles.metricsGrid}>
        
        {/* Metric 1: Mean Time To Repair (MTTR) */}
        <View style={[styles.metricCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
          <View style={styles.metricTopRow}>
            <Activity size={14} color={activeTheme.primary} />
            <Text style={[styles.metricLabel, { color: activeTheme.muted }]}>MTTR VALUE</Text>
          </View>
          <Text style={[styles.metricValue, { color: activeTheme.text }]}>
            {computedMTTR}m
          </Text>
          <View style={styles.sparklineContainer}>
            <Svg width="100%" height="20">
              {/* Downward trend line representing faster repair times */}
              <Path d="M 0 5 L 20 8 L 40 12 L 60 14 L 80 18" stroke={activeTheme.success} strokeWidth="2" fill="none" />
              <Circle cx="80" cy="18" r="3" fill={activeTheme.success} />
            </Svg>
          </View>
          <Text style={[styles.metricSub, { color: activeTheme.success }]}>KPI REDUCED BY {Math.round((45 - computedMTTR)/45 * 100)}%</Text>
        </View>

        {/* Metric 2: Downtime Saved */}
        <View style={[styles.metricCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
          <View style={styles.metricTopRow}>
            <Sliders size={14} color={activeTheme.info} />
            <Text style={[styles.metricLabel, { color: activeTheme.muted }]}>DOWNTIME SAVED</Text>
          </View>
          <Text style={[styles.metricValue, { color: activeTheme.info }]}>{computedDowntimeSaved}h</Text>
          <View style={styles.sparklineContainer}>
            <Svg width="100%" height="20">
              {/* Upward trend line representing savings accum */}
              <Path d="M 0 18 L 20 15 L 40 10 L 60 7 L 80 4" stroke={activeTheme.info} strokeWidth="2" fill="none" />
              <Circle cx="80" cy="4" r="3" fill={activeTheme.info} />
            </Svg>
          </View>
          <Text style={[styles.metricSub, { color: activeTheme.muted }]}>TOTAL HOURS SAVED</Text>
        </View>

        {/* Metric 3: Global Asset Health */}
        <View style={[styles.metricCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
          <View style={styles.metricTopRow}>
            <Thermometer size={14} color={criticalIssues > 0 ? activeTheme.danger : activeTheme.success} />
            <Text style={[styles.metricLabel, { color: activeTheme.muted }]}>ASSET HEALTH</Text>
          </View>
          <Text style={[styles.metricValue, { color: criticalIssues > 0 ? activeTheme.danger : activeTheme.success }]}>
            {globalHealthScore}%
          </Text>
          <View style={styles.sparklineContainer}>
            <Svg width="100%" height="20">
              <Rect x="0" y="8" width="80" height="4" rx="2" fill="rgba(255,255,255,0.08)" />
              <Rect x="0" y="8" width={80 * (globalHealthScore / 100)} height="4" rx="2" fill={criticalIssues > 0 ? activeTheme.danger : activeTheme.success} />
            </Svg>
          </View>
          <Text style={[styles.metricSub, { color: activeTheme.muted }]}>
            {criticalIssues > 0 ? 'CRITICAL ALERT ACTIVE' : 'OPTIMAL STABILITY'}
          </Text>
        </View>

      </View>

      {/* Quick Actions Shortcuts Grid */}
      <Text style={[styles.sectionTitle, { color: activeTheme.primary }]}>OPERATIONAL SHORTCUTS</Text>
      <View style={styles.shortcutsGrid}>
        <Pressable 
          style={({ pressed }) => [
            styles.shortcutCard, 
            { backgroundColor: activeTheme.card, borderColor: activeTheme.border },
            pressed && { borderColor: activeTheme.primary }
          ]}
          onPress={() => navigation.navigate('KnowledgeTab' as any)}
        >
          <BookOpen size={20} color={activeTheme.primary} />
          <Text style={[styles.shortcutText, { color: activeTheme.text }]}>MANUALS</Text>
        </Pressable>

        <Pressable 
          style={({ pressed }) => [
            styles.shortcutCard, 
            { backgroundColor: activeTheme.card, borderColor: activeTheme.border },
            pressed && { borderColor: activeTheme.primary }
          ]}
          onPress={() => navigation.navigate('ChatTab' as any)}
        >
          <MessageSquare size={20} color={activeTheme.info} />
          <Text style={[styles.shortcutText, { color: activeTheme.text }]}>AI CHAT</Text>
        </Pressable>

        <Pressable 
          style={({ pressed }) => [
            styles.shortcutCard, 
            { backgroundColor: activeTheme.card, borderColor: activeTheme.border },
            pressed && { borderColor: activeTheme.primary }
          ]}
          onPress={() => navigation.navigate('HistoryTab' as any)}
        >
          <History size={20} color={activeTheme.success} />
          <Text style={[styles.shortcutText, { color: activeTheme.text }]}>WORKLOGS</Text>
        </Pressable>

        <Pressable 
          style={({ pressed }) => [
            styles.shortcutCard, 
            { backgroundColor: activeTheme.card, borderColor: activeTheme.border },
            pressed && { borderColor: activeTheme.primary }
          ]}
          onPress={() => navigation.navigate('SettingsTab' as any)}
        >
          <Sliders size={20} color={activeTheme.warning} />
          <Text style={[styles.shortcutText, { color: activeTheme.text }]}>SETTINGS</Text>
        </Pressable>
      </View>

      {/* Cross-Site Plant Health & Threat Monitor Widget */}
      <Text style={[styles.sectionTitle, { color: activeTheme.primary }]}>CROSS-SITE RELIABILITY & THREAT HUD</Text>
      <View style={[styles.searchConsole, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
        <View style={styles.metricTopRow}>
          <Radio size={14} color={activeTheme.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.consoleLabel, { color: activeTheme.text }]}>GLOBAL PLANT CONTEXT MAP</Text>
        </View>
        <Text style={[styles.consoleDesc, { color: activeTheme.muted, marginBottom: 12 }]}>
          Real-time diagnostics sync active across multi-tenant production zones.
        </Text>

        {/* Site 1: Chicago */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 6 }}>
          <View>
            <Text style={{ color: activeTheme.text, fontSize: 12, fontWeight: '800' }}>CHICAGO PLANT (ZONE-A)</Text>
            <Text style={{ color: activeTheme.muted, fontSize: 8, fontWeight: '600' }}>SAP GATEWAY SYNC ACTIVE // 12 ASSETS</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: activeTheme.success, fontSize: 12, fontWeight: '900' }}>94% HEALTH</Text>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: activeTheme.success }} />
          </View>
        </View>

        {/* Site 2: Munich */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 6 }}>
          <View>
            <Text style={{ color: activeTheme.text, fontSize: 12, fontWeight: '800' }}>MUNICH ENGINE LINE (ZONE-B)</Text>
            <Text style={{ color: activeTheme.warning, fontSize: 8, fontWeight: '600' }}>MAXIMO SYNC // {criticalIssues} PENDING DEFECTS</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: criticalIssues > 0 ? activeTheme.danger : activeTheme.success, fontSize: 12, fontWeight: '900' }}>
              {criticalIssues > 0 ? '82% RISK' : '90% HEALTH'}
            </Text>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: criticalIssues > 0 ? activeTheme.danger : activeTheme.success }} />
          </View>
        </View>

        {/* Site 3: Mumbai */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 2 }}>
          <View>
            <Text style={{ color: activeTheme.text, fontSize: 12, fontWeight: '800' }}>MUMBAI PLC CABINETS (ZONE-C)</Text>
            <Text style={{ color: activeTheme.muted, fontSize: 8, fontWeight: '600' }}>SERVICENOW APIS CONNECTED // 18 ASSETS</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: activeTheme.success, fontSize: 12, fontWeight: '900' }}>96% HEALTH</Text>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: activeTheme.success }} />
          </View>
        </View>
      </View>

      {/* 4. Glowing AI Core Assistant Widget */}
      <View style={[styles.jarvisCard, { borderColor: activeTheme.primary }]}>
        <View style={styles.jarvisCoreHeader}>
          <Cpu size={24} color={activeTheme.primary} style={styles.pulseCore} />
          <View style={styles.jarvisLabelGroup}>
            <Text style={[styles.jarvisTitle, { color: activeTheme.text }]}>COGNITIVE A.I. COMMAND</Text>
            <Text style={[styles.jarvisSubtitle, { color: activeTheme.primary }]}>RAG-AUGMENTED DIALOGUE</Text>
          </View>
        </View>
        
        <Text style={[styles.jarvisPrompt, { color: activeTheme.muted }]}>
          "Awaiting diagnostics request. You can perform a real-time vision alignment scan or hold vocal dialogue for immediate SOP extraction."
        </Text>

        <View style={styles.jarvisActionRow}>
          {/* Camera Scan Button */}
          <Pressable
            style={({ pressed }) => [
              styles.jarvisBtn,
              { backgroundColor: 'rgba(0, 240, 255, 0.1)', borderColor: activeTheme.primary },
              pressed && { backgroundColor: 'rgba(0, 240, 255, 0.18)' }
            ]}
            onPress={() => navigation.navigate('Camera')}
          >
            <Camera size={18} color={activeTheme.primary} />
            <Text style={[styles.jarvisBtnText, { color: activeTheme.primary }]}>VISION SCAN</Text>
          </Pressable>

          {/* Voice Chat Button */}
          <Pressable
            style={({ pressed }) => [
              styles.jarvisBtn,
              { backgroundColor: 'rgba(56, 189, 248, 0.1)', borderColor: activeTheme.info },
              pressed && { backgroundColor: 'rgba(56, 189, 248, 0.18)' }
            ]}
            onPress={() => navigation.navigate('VoiceQuery')}
          >
            <Mic size={18} color={activeTheme.info} />
            <Text style={[styles.jarvisBtnText, { color: activeTheme.info }]}>VOICE CORE</Text>
          </Pressable>
        </View>
      </View>

      {/* 5. Interactive RAG Search Manuals Console */}
      <View style={[styles.searchConsole, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
        <Text style={[styles.consoleLabel, { color: activeTheme.text }]}>COGNITIVE AI SOLUTION SEARCH</Text>
        <Text style={[styles.consoleDesc, { color: activeTheme.muted }]}>
          Submit queries to the dynamic AI reasoning engine for instant diagnostic repair solutions.
        </Text>
        
        <View style={[styles.searchInputContainer, { borderColor: activeTheme.border, backgroundColor: activeTheme.background }]}>
          <Pressable 
            onPress={handleTextSearch}
            style={({ pressed }) => [
              styles.searchIconBtn,
              pressed && { opacity: 0.7 }
            ]}
          >
            <Search size={20} color={activeTheme.primary} style={styles.searchIcon} />
          </Pressable>
          <TextInput
            placeholder="Search, scan, or speak to diagnose..."
            placeholderTextColor={activeTheme.muted}
            value={textQuery}
            onChangeText={setTextQuery}
            style={[styles.searchInput, { color: activeTheme.text }]}
            onSubmitEditing={handleTextSearch}
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
          {searching && (
            <ActivityIndicator size="small" color={activeTheme.primary} style={styles.loader} />
          )}
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
      </View>

      {/* 6. Latest Diagnostic Log Timeline */}
      {historyList.length > 0 && (
        <View style={styles.latestSession}>
          <View style={styles.latestTitleRow}>
            <History size={16} color={activeTheme.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.sectionTitle, { color: activeTheme.text, marginTop: 0 }]}>LATEST DIAGNOSTIC LOG</Text>
          </View>
          <Pressable 
            style={({ pressed }) => [
              styles.latestCard, 
              { 
                backgroundColor: activeTheme.card, 
                borderColor: pressed ? activeTheme.primary : activeTheme.border,
                transform: [{ scale: pressed ? 1.01 : 1 }],
              }
            ]}
            onPress={() => navigation.navigate('Result', { analysisResult: historyList[0] })}
          >
            <View style={styles.latestHeader}>
              <Text style={[styles.latestIssue, { color: activeTheme.text }]}>
                {historyList[0].detected_issue}
              </Text>
              <View style={[styles.latestBadge, { backgroundColor: 'rgba(0, 240, 255, 0.1)', borderColor: 'rgba(0, 240, 255, 0.2)' }]}>
                <Text style={[styles.latestBadgeText, { color: activeTheme.primary }]}>
                  {historyList[0].confidence} CONFIDENCE
                </Text>
              </View>
            </View>
            <Text style={[styles.latestCause, { color: activeTheme.muted }]} numberOfLines={2}>
              Root Cause: {historyList[0].root_cause}
            </Text>
            <View style={[styles.latestFooter, { borderTopColor: activeTheme.border }]}>
              <Text style={[styles.latestActionText, { color: activeTheme.primary }]}>TAP TO EXTRACT REPAIR INSTRUCTIONS</Text>
            </View>
          </Pressable>
        </View>
      )}
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: Platform.OS === 'web' ? 10 : 5,
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 2,
  },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  badgeIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBanner: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerIcon: {
    marginRight: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
    marginTop: 6,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 4,
  },
  metricTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    marginLeft: 6,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  metricSub: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  jarvisCard: {
    borderWidth: 2,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 240, 255, 0.03)',
    padding: 20,
    marginBottom: 24,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  jarvisCoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pulseCore: {
    marginRight: 12,
  },
  jarvisLabelGroup: {
    flex: 1,
  },
  jarvisTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  jarvisSubtitle: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 2,
  },
  jarvisPrompt: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    fontStyle: 'italic',
    marginBottom: 20,
  },
  jarvisActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  jarvisBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    borderWidth: 1.5,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  jarvisBtnText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginLeft: 8,
  },
  searchConsole: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    elevation: 3,
  },
  consoleLabel: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  consoleDesc: {
    fontSize: 11,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
  },
  searchInputContainer: {
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
  searchInput: {
    flex: 1,
    fontSize: 13,
    height: '100%',
    paddingHorizontal: 8,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any
    })
  },
  searchSubmit: {
    paddingVertical: 8,
    paddingHorizontal: 12,
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
    marginTop: 12,
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
  loader: {
    paddingHorizontal: 12,
  },
  latestSession: {
    marginTop: 6,
  },
  latestTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  latestCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    elevation: 3,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transitionProperty: 'all',
        transitionDuration: '200ms',
      }
    })
  },
  latestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  latestIssue: {
    fontSize: 16,
    fontWeight: '900',
  },
  latestBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  latestBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  latestCause: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  latestFooter: {
    borderTopWidth: 1,
    paddingTop: 12,
    alignItems: 'center',
  },
  latestActionText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sparklineContainer: {
    height: 24,
    marginTop: 6,
    marginBottom: 6,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 4,
  },
  shortcutsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8,
  },
  shortcutCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  shortcutText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
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
  }
});

export default HomeScreen;
