import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl, Platform } from 'react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { Calendar, AlertCircle, Eye, Search, Activity, ShieldAlert, Cpu } from 'lucide-react-native';

interface Props {
  navigation: any;
}

const HistoryScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, historyList, refreshHistory, loadingHistory } = useApp();
  const activeTheme = Theme.colors[theme];

  const [searchFilter, setSearchFilter] = useState('');

  // Filter history based on search text
  const filteredHistory = historyList.filter(item => {
    const query = searchFilter.toLowerCase();
    return (
      item.detected_issue.toLowerCase().includes(query) ||
      item.root_cause.toLowerCase().includes(query) ||
      (item.query_text && item.query_text.toLowerCase().includes(query))
    );
  });

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  // Threat score classification
  const getSeverity = (item: any) => {
    const confVal = parseInt(item.confidence);
    const isNormal = item.detected_issue?.toLowerCase() === 'normal';
    
    if (isNormal) return { label: 'OPTIMAL', color: activeTheme.success };
    if (!isNaN(confVal) && confVal > 90) return { label: 'CRITICAL', color: activeTheme.danger };
    return { label: 'WARNING', color: activeTheme.warning };
  };

  // Top Statistics
  const totalAudits = historyList.length;
  const criticalCount = historyList.filter(item => {
    const severity = getSeverity(item);
    return severity.label === 'CRITICAL';
  }).length;
  
  const avgConfidence = historyList.length > 0 
    ? Math.round(historyList.reduce((acc, curr) => acc + (parseInt(curr.confidence) || 0), 0) / historyList.length)
    : 0;

  return (
    <View style={[styles.container, { backgroundColor: activeTheme.background }]}>
      
      {/* 1. Top Diagnostic Stats Header */}
      <View style={[styles.statsHeader, { backgroundColor: activeTheme.card, borderBottomColor: activeTheme.border }]}>
        <View style={styles.statWidget}>
          <Activity size={14} color={activeTheme.primary} />
          <Text style={[styles.statValue, { color: activeTheme.text }]}>{totalAudits}</Text>
          <Text style={[styles.statLabel, { color: activeTheme.muted }]}>TOTAL AUDITS</Text>
        </View>

        <View style={[styles.statWidget, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: activeTheme.border }]}>
          <ShieldAlert size={14} color={activeTheme.danger} />
          <Text style={[styles.statValue, { color: activeTheme.danger }]}>{criticalCount}</Text>
          <Text style={[styles.statLabel, { color: activeTheme.muted }]}>CRITICAL FAULTS</Text>
        </View>

        <View style={styles.statWidget}>
          <Cpu size={14} color={activeTheme.info} />
          <Text style={[styles.statValue, { color: activeTheme.text }]}>{avgConfidence}%</Text>
          <Text style={[styles.statLabel, { color: activeTheme.muted }]}>AVG CONFIDENCE</Text>
        </View>
      </View>

      {/* 2. Filter Bar */}
      <View style={[styles.searchBarContainer, { backgroundColor: activeTheme.card, borderBottomColor: activeTheme.border }]}>
        <Search size={16} color={activeTheme.muted} style={styles.searchIcon} />
        <TextInput
          placeholder="Filter repair logs (e.g. Pump, Overheat)"
          placeholderTextColor={activeTheme.muted}
          value={searchFilter}
          onChangeText={setSearchFilter}
          style={[styles.searchBar, { color: activeTheme.text }]}
        />
      </View>

      {/* 3. Timeline Log List */}
      <FlatList
        data={filteredHistory}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        refreshControl={
          <RefreshControl 
            refreshing={loadingHistory} 
            onRefresh={refreshHistory} 
            colors={[activeTheme.primary]}
            tintColor={activeTheme.primary}
          />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <AlertCircle size={36} color={activeTheme.muted} style={{ marginBottom: 10 }} />
            <Text style={[styles.emptyText, { color: activeTheme.text }]}>NO MAINTENANCE RECORDS IN SUITE</Text>
            <Text style={[styles.emptySub, { color: activeTheme.muted }]}>
              Perform a quick Vision Scan or RAG Query to index a new log.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const severity = getSeverity(item);
          
          return (
            <View style={styles.timelineItem}>
              {/* Vertical timeline connector */}
              <View style={styles.timelineAxis}>
                <View style={[styles.timelineBeacon, { backgroundColor: severity.color, shadowColor: severity.color }]} />
                {index < filteredHistory.length - 1 && (
                  <View style={[styles.timelineLine, { backgroundColor: activeTheme.border }]} />
                )}
              </View>

              {/* Log Card */}
              <TouchableOpacity 
                style={[styles.logCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}
                onPress={() => navigation.navigate('Result', { analysisResult: item })}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.issueContainer}>
                    <Text style={[styles.issueText, { color: activeTheme.text }]}>{item.detected_issue}</Text>
                    <View style={[styles.severityBadge, { backgroundColor: `${severity.color}15`, borderColor: severity.color }]}>
                      <Text style={[styles.severityText, { color: severity.color }]}>{severity.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.confidenceText, { color: activeTheme.primary }]}>{item.confidence}</Text>
                </View>

                <Text style={[styles.causeText, { color: activeTheme.muted }]} numberOfLines={2}>
                  {item.root_cause}
                </Text>

                <View style={[styles.cardFooter, { borderTopColor: activeTheme.border }]}>
                  <View style={styles.dateRow}>
                    <Calendar size={12} color={activeTheme.muted} style={{ marginRight: 6 }} />
                    <Text style={[styles.dateText, { color: activeTheme.muted }]}>
                      {formatDate(item.timestamp)}
                    </Text>
                  </View>
                  <View style={styles.viewRow}>
                    <Eye size={12} color={activeTheme.primary} style={{ marginRight: 4 }} />
                    <Text style={[styles.viewText, { color: activeTheme.primary }]}>PULL REPORT</Text>
                  </View>
                </View>
              </TouchableOpacity>
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
  statsHeader: {
    flexDirection: 'row',
    height: 64,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  statWidget: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    height: 52,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchBar: {
    flex: 1,
    fontSize: 13,
    height: '100%',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  emptySub: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  timelineAxis: {
    width: 32,
    alignItems: 'center',
    position: 'relative',
  },
  timelineBeacon: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 20,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 4,
    zIndex: 2,
  },
  timelineLine: {
    position: 'absolute',
    top: 25,
    bottom: -20,
    width: 1.5,
    zIndex: 1,
  },
  logCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  issueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  issueText: {
    fontSize: 14,
    fontWeight: '800',
  },
  severityBadge: {
    borderWidth: 1,
    paddingVertical: 1.5,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  severityText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '900',
  },
  causeText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  cardFooter: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 10,
    fontWeight: '600',
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  }
});

export default HistoryScreen;
