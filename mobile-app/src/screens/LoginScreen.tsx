import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { User, Lock, Fingerprint, ShieldCheck, Zap } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Splash'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useApp();
  const activeTheme = Theme.colors[theme];

  const [username, setUsername] = useState('ENG-4029');
  const [password, setPassword] = useState('********');
  const [loading, setLoading] = useState(false);
  const [biometricScanning, setBiometricScanning] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // Navigate to Main Tabs Dashboard
      navigation.replace('MainTabs' as any);
    }, 1200);
  };

  const triggerBiometricScan = () => {
    setBiometricScanning(true);
    setTimeout(() => {
      setBiometricScanning(false);
      navigation.replace('MainTabs' as any);
    }, 1500);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: activeTheme.background }]}
    >
      <StatusBar barStyle="light-content" backgroundColor="#060B16" />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Futuristic Top Glowing Header */}
        <View style={styles.header}>
          <View style={[styles.glowRing, { borderColor: activeTheme.primary, shadowColor: activeTheme.primary }]}>
            <ShieldCheck size={32} color={activeTheme.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.title, { color: activeTheme.text }]}>SECURE ACCESS</Text>
          <Text style={[styles.subtitle, { color: activeTheme.muted }]}>SMART TECHNICIAN ECOSYSTEM</Text>
        </View>

        {/* Credentials Form Card */}
        <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
          <View style={styles.inputLabelContainer}>
            <Text style={[styles.inputLabel, { color: activeTheme.primary }]}>OPERATOR IDENTIFIER</Text>
            <View style={[styles.badge, { backgroundColor: 'rgba(0, 240, 255, 0.1)', borderColor: 'rgba(0, 240, 255, 0.2)' }]}>
              <Text style={[styles.badgeText, { color: activeTheme.primary }]}>SYSTEMS COGNITION</Text>
            </View>
          </View>

          <View style={[styles.inputWrapper, { backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}>
            <User size={18} color={activeTheme.muted} style={styles.inputIcon} />
            <TextInput
              value={username}
              onChangeText={setUsername}
              style={[styles.textInput, { color: activeTheme.text }]}
              placeholder="Operator ID"
              placeholderTextColor={activeTheme.muted}
            />
          </View>

          <Text style={[styles.inputLabel, { color: activeTheme.primary, marginTop: 16 }]}>SECURITY KEYCODE</Text>
          <View style={[styles.inputWrapper, { backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}>
            <Lock size={18} color={activeTheme.muted} style={styles.inputIcon} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={[styles.textInput, { color: activeTheme.text }]}
              placeholder="Security Keycode"
              placeholderTextColor={activeTheme.muted}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              { backgroundColor: activeTheme.primary },
              pressed && { shadowColor: activeTheme.primary, shadowOpacity: 0.4, shadowRadius: 10 }
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <View style={styles.btnRow}>
                <Text style={styles.loginButtonText}>AUTHORIZE PROFILE</Text>
                <Zap size={16} color="#000" style={{ marginLeft: 6 }} />
              </View>
            )}
          </Pressable>
        </View>

        {/* Biometrics Authorization Portal */}
        <View style={[styles.card, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
          <Text style={[styles.cardLabel, { color: activeTheme.primary }]}>BIOMETRIC CORE PORTAL</Text>
          
          <View style={styles.biometricContent}>
            {biometricScanning ? (
              <View style={styles.biometricScanState}>
                <ActivityIndicator size="large" color={activeTheme.primary} />
                <Text style={[styles.scanText, { color: activeTheme.primary }]}>SCANNING BIO-NODAL ENCRYPTIONS...</Text>
              </View>
            ) : (
              <Pressable
                onPress={triggerBiometricScan}
                style={({ pressed }) => [
                  styles.biometricFingerprint,
                  { borderColor: activeTheme.primary, shadowColor: activeTheme.primary },
                  pressed && { transform: [{ scale: 1.05 }], shadowOpacity: 0.3, shadowRadius: 8 }
                ]}
              >
                <Fingerprint size={48} color={activeTheme.primary} strokeWidth={1.5} />
              </Pressable>
            )}
            
            <Text style={[styles.biometricDesc, { color: activeTheme.muted }]}>
              {biometricScanning ? 'Keep finger resting on core reader' : 'Press scanner node for rapid authentication'}
            </Text>
          </View>
        </View>

        {/* Footer Technical Metrics */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: activeTheme.muted }]}>NODE SYNC: ACTIVE // SSL ENCRYPTED</Text>
          <Text style={[styles.footerText, { color: activeTheme.muted }]}>FIRMWARE: v1.0.8 // DEVICE TRUSTED</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 60 : 40,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  glowRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    marginBottom: 20,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 6,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 4,
  },
  inputLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    fontWeight: '600',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any
    })
  },
  loginButton: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#000',
    fontWeight: '900',
    letterSpacing: 1.5,
    fontSize: 13,
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  biometricContent: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  biometricFingerprint: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    marginBottom: 16,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  biometricScanState: {
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  scanText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 12,
  },
  biometricDesc: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    marginVertical: 2,
  }
});

export default LoginScreen;
