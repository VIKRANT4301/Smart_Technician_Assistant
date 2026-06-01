import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Pressable
} from 'react-native';
import { Send, Cpu, MessageSquare, BookOpen, User, Terminal, HelpCircle } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { Theme } from '../theme/theme';
import { queryChat, ChatMessage } from '../services/api';

interface ChatScreenProps {
  navigation: any;
}

const PRESETS = [
  'How do I isolate the primary cooling pump?',
  'Shaft alignment tolerances for motor R-12',
  'What are the transformer coil winding safety steps?',
  'Troubleshoot low pressure in Fluid Power Pump H-500'
];

const ChatScreen: React.FC<ChatScreenProps> = ({ navigation }) => {
  const { theme } = useApp();
  const activeTheme = Theme.colors[theme];

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      content: 'SYSTEM ACTIVE // AI Cognitive Assistant initialized.\n\nAsk me any diagnostic question, machine troubleshooting query, or safety protocol from our manual repository.'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSources, setLastSources] = useState<string[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, loading]);

  const handleSend = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    // Add user message
    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);

    try {
      // API call
      // Filter out the initial welcome message from history to focus backend context
      const apiHistory = updatedMessages.slice(1, -1); 
      
      console.log(`[ChatScreen] Sending message to /chat. History length: ${apiHistory.length}`);
      const result = await queryChat(trimmed, apiHistory);
      
      // Update with model message
      if (result && result.response) {
        setMessages(prev => [
          ...prev,
          { role: 'model', content: result.response }
        ]);
        if (result.sources && result.sources.length > 0) {
          setLastSources(result.sources);
        }
      } else {
        throw new Error('Malformed backend response');
      }
    } catch (e: any) {
      console.log('[ChatScreen] Error querying assistant:', e);
      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          content: `ERROR: SYSTEM DEGRADED // Unable to connect to diagnostic reasoning node. details: ${e.message || 'Network error'}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={[styles.container, { backgroundColor: activeTheme.background }]}
    >
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Futuristic Telemetry Header */}
      <View style={[styles.headerBanner, { backgroundColor: activeTheme.card, borderBottomColor: activeTheme.border }]}>
        <View style={styles.headerTitleRow}>
          <View style={[styles.pulseDot, { backgroundColor: activeTheme.primary }]} />
          <Text style={[styles.headerSubtitle, { color: activeTheme.primary }]}>OPERATIONAL NODE // CHAT-COGNITIVE</Text>
        </View>
        <Text style={[styles.headerTitle, { color: activeTheme.text }]}>AI ASSISTANT CHAT</Text>
      </View>

      {/* Main Conversation Stream */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
      >
        {messages.map((msg, index) => {
          const isModel = msg.role === 'model';
          return (
            <View
              key={index}
              style={[
                styles.messageContainer,
                isModel ? styles.modelContainer : styles.userContainer
              ]}
            >
              {/* Message Header (Terminal or User ID) */}
              <View style={[styles.messageHeader, isModel ? styles.modelHeader : styles.userHeader]}>
                {isModel ? (
                  <>
                    <Cpu size={12} color={activeTheme.primary} style={styles.headerIcon} />
                    <Text style={[styles.headerLabel, { color: activeTheme.primary }]}>AI.COGNITIVE.BOT</Text>
                  </>
                ) : (
                  <>
                    <User size={12} color={activeTheme.success} style={styles.headerIcon} />
                    <Text style={[styles.headerLabel, { color: activeTheme.success }]}>OPERATOR.ENGINEER</Text>
                  </>
                )}
              </View>

              {/* Message Content Bubble */}
              <View
                style={[
                  styles.messageBubble,
                  isModel
                    ? { backgroundColor: activeTheme.card, borderColor: activeTheme.border }
                    : { backgroundColor: 'rgba(0, 240, 255, 0.07)', borderColor: activeTheme.primary }
                ]}
              >
                <Text style={[styles.messageText, { color: activeTheme.text }]}>
                  {msg.content}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Loading Spinner */}
        {loading && (
          <View style={[styles.messageContainer, styles.modelContainer]}>
            <View style={styles.messageHeader}>
              <Cpu size={12} color={activeTheme.primary} style={styles.headerIcon} />
              <Text style={[styles.headerLabel, { color: activeTheme.primary }]}>AI.THINKING.NODE</Text>
            </View>
            <View style={[styles.messageBubble, styles.loadingBubble, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
              <ActivityIndicator size="small" color={activeTheme.primary} style={styles.loaderIcon} />
              <Text style={[styles.loadingText, { color: activeTheme.muted }]}>
                EXTRACTING PROCEDURES & REASONING...
              </Text>
            </View>
          </View>
        )}

        {/* Retrieved Manual References Box */}
        {lastSources.length > 0 && !loading && (
          <View style={[styles.sourcesCard, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
            <View style={styles.sourcesHeader}>
              <BookOpen size={13} color={activeTheme.info} style={{ marginRight: 6 }} />
              <Text style={[styles.sourcesTitle, { color: activeTheme.info }]}>
                RETRIEVED RAG SOURCES ({lastSources.length})
              </Text>
            </View>
            <View style={styles.sourcesList}>
              {lastSources.map((source, i) => (
                <View key={i} style={styles.sourceItem}>
                  <Terminal size={11} color={activeTheme.muted} style={{ marginRight: 6 }} />
                  <Text style={[styles.sourceText, { color: activeTheme.muted }]} numberOfLines={1}>
                    {source}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Preset Command Suggestions */}
      {messages.length === 1 && (
        <View style={styles.presetContainer}>
          <Text style={[styles.presetTitle, { color: activeTheme.muted }]}>
            SUGGESTED TROUBLESHOOTING INQUIRIES
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetScroll}>
            {PRESETS.map((preset, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  setInputText(preset);
                  handleSend(preset);
                }}
                style={[styles.presetChip, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}
              >
                <HelpCircle size={11} color={activeTheme.primary} style={{ marginRight: 4 }} />
                <Text style={[styles.presetChipText, { color: activeTheme.text }]} numberOfLines={1}>
                  {preset}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Command Input Console */}
      <View style={[styles.inputConsole, { backgroundColor: activeTheme.card, borderTopColor: activeTheme.border }]}>
        <View style={[styles.inputWrapper, { backgroundColor: activeTheme.background, borderColor: activeTheme.border }]}>
          <TextInput
            placeholder="Type command / query to technician assistant..."
            placeholderTextColor={activeTheme.muted}
            value={inputText}
            onChangeText={setInputText}
            editable={!loading}
            style={[styles.input, { color: activeTheme.text }]}
            onSubmitEditing={() => handleSend(inputText)}
          />
          <TouchableOpacity
            onPress={() => handleSend(inputText)}
            disabled={loading || !inputText.trim()}
            style={[
              styles.sendBtn,
              { backgroundColor: inputText.trim() && !loading ? activeTheme.primary : 'rgba(148, 163, 184, 0.1)' }
            ]}
          >
            <Send size={16} color={inputText.trim() && !loading ? '#000000' : activeTheme.muted} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBanner: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
    paddingBottom: 24,
  },
  messageContainer: {
    marginBottom: 20,
    maxWidth: '85%',
  },
  modelContainer: {
    alignSelf: 'flex-start',
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  modelHeader: {
    justifyContent: 'flex-start',
  },
  userHeader: {
    justifyContent: 'flex-end',
  },
  headerIcon: {
    marginRight: 4,
  },
  headerLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  messageBubble: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loaderIcon: {
    marginRight: 8,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sourcesCard: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignSelf: 'stretch',
  },
  sourcesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sourcesTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sourcesList: {
    gap: 4,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  presetContainer: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  presetTitle: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  presetScroll: {
    paddingHorizontal: 16,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
    maxWidth: 240,
  },
  presetChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  inputConsole: {
    padding: 12,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    height: '100%',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any
    })
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  }
});

export default ChatScreen;
