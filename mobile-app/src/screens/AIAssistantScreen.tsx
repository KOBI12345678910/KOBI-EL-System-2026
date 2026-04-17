import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Header from '../components/Header';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import {
  colors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  shadow,
} from '../constants/theme';

type Assistant = 'kobi' | 'uzi';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_ACTIONS_KOBI = [
  'סטטוס פרויקטים היום',
  'הכנסות החודש',
  'עובדים בשטח',
  'התראות דחופות',
];

const QUICK_ACTIONS_UZI = [
  'הזמנות עבודה פתוחות',
  'חומרים נמוכים',
  'לו"ז השבוע',
  'צוות זמין היום',
];

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <View
      style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.assistantBubble,
      ]}
    >
      <Text
        style={[
          styles.messageText,
          isUser ? styles.userMessageText : styles.assistantMessageText,
        ]}
      >
        {message.content}
      </Text>
      <Text style={styles.messageTime}>
        {message.timestamp.toLocaleTimeString('he-IL', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
}

export default function AIAssistantScreen() {
  const user = useAppStore((s) => s.user);
  const [activeAssistant, setActiveAssistant] = useState<Assistant>('kobi');
  const [kobicMessages, setKobiMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: `שלום ${user?.name || 'קובי'}! אני עוזר קובי, עוזר ה-AI שלך לניהול עסקי. איך אוכל לעזור?`,
      timestamp: new Date(),
    },
  ]);
  const [uziMessages, setUziMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'שלום! אני עוזר עוזי, מתמחה בניהול שטח ועבודה. מה הצורך?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const messages = activeAssistant === 'kobi' ? kobicMessages : uziMessages;
  const setMessages = activeAssistant === 'kobi' ? setKobiMessages : setUziMessages;
  const quickActions =
    activeAssistant === 'kobi' ? QUICK_ACTIONS_KOBI : QUICK_ACTIONS_UZI;

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        const res: any =
          activeAssistant === 'kobi'
            ? await api.chatKobi(text.trim(), history)
            : await api.chatUzi(text.trim(), history);

        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: res?.reply || res?.message || 'קיבלתי את הבקשה שלך.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        // Fallback response
        const fallbackMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: getMockResponse(text, activeAssistant),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, fallbackMsg]);
      } finally {
        setLoading(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [loading, messages, activeAssistant, setMessages]
  );

  return (
    <View style={styles.container}>
      <Header title="עוזר AI" showNotifications />

      {/* Assistant tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeAssistant === 'uzi' && styles.tabActive]}
          onPress={() => setActiveAssistant('uzi')}
        >
          <Text
            style={[
              styles.tabText,
              activeAssistant === 'uzi' && styles.tabTextActive,
            ]}
          >
            🔧 עוזר עוזי
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeAssistant === 'kobi' && styles.tabActive]}
          onPress={() => setActiveAssistant('kobi')}
        >
          <Text
            style={[
              styles.tabText,
              activeAssistant === 'kobi' && styles.tabTextActive,
            ]}
          >
            👑 עוזר קובי
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {loading && (
            <View style={styles.typingIndicator}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.typingText}>מעבד...</Text>
            </View>
          )}
        </ScrollView>

        {/* Quick Actions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickActionsContainer}
          style={styles.quickActionsScroll}
        >
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action}
              style={styles.quickChip}
              onPress={() => sendMessage(action)}
              disabled={loading}
            >
              <Text style={styles.quickChipText}>{action}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input row */}
        <View style={styles.inputRow}>
          <TouchableOpacity
            style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
            onPress={() => sendMessage(input)}
            disabled={loading || !input.trim()}
          >
            <Ionicons
              name={loading ? 'hourglass-outline' : 'send'}
              size={20}
              color={colors.white}
            />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="שאל שאלה..."
            placeholderTextColor={colors.textDim}
            textAlign="right"
            writingDirection="rtl"
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(input)}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function getMockResponse(text: string, assistant: Assistant): string {
  const t = text.toLowerCase();
  if (t.includes('פרויקט') || t.includes('עבודות')) {
    return '📊 כרגע יש 12 פרויקטים פעילים. הפרויקט הגדול ביותר הוא "שערים מגדל המים" בשיתוף עם עיריית תל אביב — ב-65% ביצוע. 3 פרויקטים מתקרבים לתאריך היעד.';
  }
  if (t.includes('הכנסות') || t.includes('כסף') || t.includes('פיננס')) {
    return '💰 הכנסות החודש: ₪285,000. הוצאות: ₪178,000. רווח נקי: ₪107,000 (שולי רווח 37.5%). חשבונית INV-010 באיחור — מומלץ לפנות ללקוח.';
  }
  if (t.includes('עובד') || t.includes('צוות')) {
    return '👷 כרגע 18 עובדים בשטח, 7 במשרד, 5 בחופשה. ראש הצוות שמואל כהן נמצא ב"שערים מגדל המים". ניר שלום חזר מחופשה ב-20/04.';
  }
  if (t.includes('חומר') || t.includes('מחסן')) {
    return '📦 2 פריטים אזלו: כבל נירוסטה 8mm, מנוע FAAC. 3 פריטים נמוכים: ברזל מרובע 40×40, צבע אנטי-חלודה, גלגלת שער. מומלץ להזמין בהקדם.';
  }
  if (t.includes('התראה') || t.includes('בעיה')) {
    return '🚨 יש 3 התראות קריטיות: (1) שמואל לא דיווח כניסה לאתר, (2) כבל נירוסטה אזל, (3) חשבונית באיחור. מומלץ לטפל בהתראות הראשונות מיד.';
  }
  return assistant === 'kobi'
    ? 'כמנהל, אני ממליץ לסקור את הדוח השבועי ולהתמקד בפרויקטים הקרובים לסיום. יש לי מידע על כל נושא — שאל ספציפי!'
    : 'כמתמחה בשטח, אני כאן לעזור עם לו"ז עבודה, הקצאת עובדים, וניהול חומרים. מה צריך?';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  tabs: {
    flexDirection: 'row-reverse',
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: fontSize.md,
    color: colors.textDim,
    fontWeight: fontWeight.medium,
  },
  tabTextActive: { color: colors.accent, fontWeight: fontWeight.semibold },
  messages: { flex: 1 },
  messagesContent: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadow.sm,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderBottomRightRadius: borderRadius.sm,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: borderRadius.sm,
  },
  messageText: {
    fontSize: fontSize.md,
    lineHeight: 22,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  userMessageText: { color: colors.white },
  assistantMessageText: { color: colors.text },
  messageTime: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    color: colors.white,
    opacity: 0.7,
    textAlign: 'right',
  },
  typingIndicator: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  typingText: { fontSize: fontSize.sm, color: colors.textDim },
  quickActionsScroll: {
    flexGrow: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  quickActionsContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  quickChip: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  quickChipText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  inputRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.panel,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.panel2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: fontSize.md,
    maxHeight: 100,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  sendBtnDisabled: { opacity: 0.5 },
});
