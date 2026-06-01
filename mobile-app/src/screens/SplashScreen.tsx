import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Animated, StyleSheet, StatusBar, Platform } from 'react-native';
import { Cpu, Zap } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type SplashScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Splash'>;

interface Props {
  navigation: SplashScreenNavigationProp;
}

const BOOT_LOGS = [
  'BOOT SEQUENCE INITIALIZED...',
  'ESTABLISHING COGNITIVE VECTOR SHIELD...',
  'LOCAL SQLite RAG DECK: SYNCED',
  'MULTIMODAL AI INFERENCE NODE: ONLINE',
  'HARDWARE DECODER LINK: OPTIMAL',
  'SYSTEM SECURITY CERTIFICATION: VALID',
  'ACCESS STANDBY... READY'
];

const SplashScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useApp();
  const activeTheme = Theme.colors[theme];
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [logIndex, setLogIndex] = useState(0);

  useEffect(() => {
    // Fade in core
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Pulse animation for AI Core
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1000,
          useNativeDriver: true,
        })
      ])
    ).start();

    // Console logs sequence
    const logInterval = setInterval(() => {
      setLogIndex((prev) => {
        if (prev < BOOT_LOGS.length - 1) {
          return prev + 1;
        } else {
          clearInterval(logInterval);
          return prev;
        }
      });
    }, 450);

    // Route to Login screen
    const timer = setTimeout(() => {
      navigation.replace('Login' as any);
    }, 3800);

    return () => {
      clearTimeout(timer);
      clearInterval(logInterval);
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: '#060B16' }]}>
      <StatusBar barStyle="light-content" backgroundColor="#060B16" />
      
      <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
        {/* Glowing pulsing core logo */}
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <View style={[styles.logoContainer, { borderColor: activeTheme.primary, shadowColor: activeTheme.primary }]}>
            <Cpu size={56} color={activeTheme.primary} strokeWidth={1.5} />
            <View style={[styles.miniIndicator, { backgroundColor: activeTheme.success }]} />
          </View>
        </Animated.View>
        
        <Text style={[styles.title, { color: '#F1F5F9' }]}>SMART TECH</Text>
        <Text style={[styles.subtitle, { color: activeTheme.primary }]}>A.I. MULTIMODAL ASSISTANT</Text>
      </Animated.View>
      
      {/* Booting Terminal Console Logs */}
      <View style={styles.consoleContainer}>
        <View style={styles.consoleHeader}>
          <Text style={styles.consoleHeaderText}>SYSTEM LOGS DECK</Text>
          <View style={styles.consoleHeaderRow}>
            <Zap size={10} color={activeTheme.primary} />
            <Text style={[styles.headerLabelText, { color: activeTheme.primary }]}>INFERENCE V2</Text>
          </View>
        </View>
        <View style={[styles.consoleBody, { borderColor: 'rgba(0, 240, 255, 0.1)' }]}>
          {BOOT_LOGS.slice(0, logIndex + 1).map((log, idx) => (
            <Text key={idx} style={[styles.logText, { color: idx === logIndex ? activeTheme.primary : '#475569' }]}>
              {`> ${log}`}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
    position: 'relative',
  },
  miniIndicator: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginTop: 25,
    letterSpacing: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: 5,
    textAlign: 'center',
  },
  consoleContainer: {
    position: 'absolute',
    bottom: 50,
    width: '85%',
    maxWidth: 400,
  },
  consoleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  consoleHeaderText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1,
  },
  consoleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLabelText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  consoleBody: {
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    padding: 12,
    minHeight: 120,
  },
  logText: {
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700',
    marginVertical: 2,
  }
});

export default SplashScreen;
