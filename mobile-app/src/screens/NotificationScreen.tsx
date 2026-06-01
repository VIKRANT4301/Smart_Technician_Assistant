import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, StatusBar, Platform } from 'react-native';
import { ArrowLeft, AlertTriangle, Wrench, Lightbulb, Bell, ArrowRight, ShieldAlert } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';

interface Props {
  navigation: any;
}

const MOCK_NOTIFICATIONS = [
  {
    id: 'n1',
    type: 'critical',
    title: 'CRITICAL ANOMALY DETECTED',
    message: 'Coil overload detected on Condenser Unit C-200. Current draws exceed limits by 18%. Potential motor burn risk.',
    timestamp: '10 mins ago',
    actionLabel: 'INSPECT SCAN',
    target: 'Camera'
  },
  {
    id: 'n2',
    type: 'warning',
    title: 'HYDRAULIC PRESSURE SPIKE',
    message: 'Pump Station H-500 reports high variance vibration signals during cycle runs. Scheduled fluid checks recommended.',
    timestamp: '2 hours ago',
    actionLabel: 'VIEW DETAILS',
    target: 'HistoryTab'
  },
  {
    id: 'n3',
    type: 'recommendation',
    title: 'AI SOP ADVISORY',
    message: 'A new revision (v4.2) for High-Voltage Transformer procedures is synced. Tap to cache the vector file locally.',
    timestamp: '5 hours ago',
    actionLabel: 'CACHE MANUAL',
    target: 'KnowledgeTab'
  },
  {
    id: 'n4',
    type: 'maintenance',
    title: 'ROUTINE CALIBRATION OVERDUE',
    message: 'Laser alignment for Rotating Motor R-12 was due 4 days ago. Performance degradation index at 4.2%.',
    timestamp: '1 day ago',
    actionLabel: 'RUN CALIBRATION',
    target: 'Camera'
  }
];

const NotificationScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useApp();
  const activeTheme = Theme.colors[theme];

  const getIconColor = (type: string) => {
    switch (type) {
      case 'critical': return activeTheme.danger;
      case 'warning': return activeTheme.warning;
      case 'recommendation': return activeTheme.primary;
      default: return activeTheme.info;
    }
  };

  const getIcon = (type: string) => {
    const size = 18;
    const color = getIconColor(type);
    switch (type) {
      case 'critical': return <ShieldAlert size={size} color={color} />;
      case 'warning': return <AlertTriangle size={size} color={color} />;
      case 'recommendation': return <Lightbulb size={size} color={color} />;
      default: return <Wrench size={size} color={color} />;
    }
  };

  const handleAction = (target: string) => {
    if (target === 'Camera') {
      navigation.navigate('Camera');
    } else if (target === 'KnowledgeTab') {
      navigation.navigate('MainTabs', { screen: 'KnowledgeTab' });
    } else if (target === 'HistoryTab') {
      navigation.navigate('MainTabs', { screen: 'HistoryTab' });
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: activeTheme.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#060B16" />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: activeTheme.card, borderBottomColor: activeTheme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={24} color={activeTheme.text} />
        </Pressable>
        <View style={styles.titleGroup}>
          <Bell size={16} color={activeTheme.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.headerTitle, { color: activeTheme.text }]}>SYSTEM NOTIFICATIONS</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Notifications List */}
      <FlatList
        data={MOCK_NOTIFICATIONS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const typeColor = getIconColor(item.type);
          
          return (
            <View style={[styles.notiCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
              {/* Top Row */}
              <View style={styles.cardHeader}>
                <View style={styles.titleRow}>
                  {getIcon(item.type)}
                  <Text style={[styles.cardTitle, { color: typeColor }]}>{item.title}</Text>
                </View>
                <Text style={[styles.timestamp, { color: activeTheme.muted }]}>{item.timestamp}</Text>
              </View>

              {/* Message */}
              <Text style={[styles.messageText, { color: activeTheme.text }]}>{item.message}</Text>

              {/* Footer action button */}
              <View style={[styles.footer, { borderTopColor: activeTheme.border }]}>
                <View style={styles.statusGroup}>
                  <View style={[styles.indicator, { backgroundColor: typeColor }]} />
                  <Text style={[styles.statusText, { color: activeTheme.muted }]}>
                    {item.type.toUpperCase()} THREAT LEVEL
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { borderColor: typeColor },
                    pressed && { backgroundColor: `${typeColor}1C` }
                  ]}
                  onPress={() => handleAction(item.target)}
                >
                  <Text style={[styles.actionBtnText, { color: typeColor }]}>{item.actionLabel}</Text>
                  <ArrowRight size={10} color={typeColor} style={{ marginLeft: 4 }} />
                </Pressable>
              </View>
            </View>
          );
        }}
      />
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
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  notiCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginLeft: 8,
  },
  timestamp: {
    fontSize: 10,
    fontWeight: '700',
  },
  messageText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      }
    })
  },
  actionBtnText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  }
});

export default NotificationScreen;
