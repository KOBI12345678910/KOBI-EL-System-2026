import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import { useTheme } from "@/contexts/ThemeContext";
import * as api from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

const CHANNELS = [
  { id: "support", label: "תמיכה" },
  { id: "development", label: "פיתוח" },
  { id: "management", label: "ניהול" },
  { id: "dataflow", label: "נתונים" },
  { id: "testing", label: "בדיקות" },
  { id: "automation", label: "אוטומציה" },
  { id: "architecture", label: "ארכיטקטורה" },
];

export default function AiChatScreenWrapper() {
  return (
    <AuthGuard>
      <AiChatScreen />
    </AuthGuard>
  );
}

function AiChatScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [channel, setChannel] = useState("support");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [showChannels, setShowChannels] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await api.sendClaudeMessage({
        message: trimmed,
        channel,
        conversationId: conversationId || undefined,
      });

      if (result.conversationId) {
        setConversationId(result.conversationId);
      }

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.message?.content || result.content || result.response || "אין תגובה",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "אירעה שגיאה";
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `שגיאה: ${errorMsg}`,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setConversationId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const selectedChannel = CHANNELS.find((c) => c.id === channel);

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={[styles.topBar, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.topCenter}>
          <View style={[styles.aiIconWrap, { backgroundColor: colors.primary + "15" }]}>
            <Feather name="cpu" size={16} color={colors.primary} />
          </View>
          <Text style={[styles.topTitle, { color: colors.text }]}>עוזי AI</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => setShowChannels(!showChannels)}
            style={[styles.channelBtn, { backgroundColor: colors.primary + "12" }]}
            hitSlop={8}
          >
            <Text style={[styles.channelBtnText, { color: colors.primary }]}>{selectedChannel?.label || "ערוץ"}</Text>
            <Feather name="chevron-down" size={14} color={colors.primary} />
          </Pressable>
          <Pressable onPress={clearConversation} style={styles.iconBtn} hitSlop={8}>
            <Feather name="trash-2" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {showChannels && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.channelBar, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]}
          contentContainerStyle={styles.channelBarContent}
        >
          {CHANNELS.map((ch) => (
            <Pressable
              key={ch.id}
              style={[
                styles.channelChip,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
                channel === ch.id && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => {
                setChannel(ch.id);
                setShowChannels(false);
                clearConversation();
              }}
            >
              <Text style={[styles.channelChipText, { color: colors.textSecondary }, channel === ch.id && { color: "#fff" }]}>
                {ch.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.primary + "12" }]}>
              <Feather name="cpu" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>עוזי AI</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>שאל שאלה, בקש עזרה, או תן הוראה</Text>
            <View style={styles.examplesContainer}>
              {["מה המצב הכללי של המערכת?", "כמה ספקים יש במערכת?", "מה הסטטוס של ההזמנות הפתוחות?"].map(
                (ex) => (
                  <Pressable
                    key={ex}
                    style={[styles.exampleChip, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
                    onPress={() => setInput(ex)}
                  >
                    <Text style={[styles.exampleText, { color: colors.text }]}>{ex}</Text>
                  </Pressable>
                )
              )}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ChatBubble message={item} colors={colors} />}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
          />
        )}

        {isLoading && (
          <View style={styles.thinkingRow}>
            <View style={[styles.thinkingBubble, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.thinkingText, { color: colors.textSecondary }]}>עוזי חושב...</Text>
            </View>
          </View>
        )}

        <View style={[styles.inputBar, { backgroundColor: colors.surfaceCard, borderTopColor: colors.border, paddingBottom: Platform.OS === "web" ? 16 : insets.bottom + 8 }]}>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
            value={input}
            onChangeText={setInput}
            placeholder="שאל שאלה..."
            placeholderTextColor={colors.textMuted}
            textAlign="right"
            multiline
            maxLength={2000}
            editable={!isLoading}
            onSubmitEditing={sendMessage}
          />
          <Pressable
            style={[styles.sendBtn, { backgroundColor: colors.primary }, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || isLoading}
          >
            <Feather name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

type Colors = ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];

function ChatBubble({ message, colors }: { message: Message; colors: Colors }) {
  const isUser = message.role === "user";
  const timeStr = message.createdAt.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI]}>
      {!isUser && (
        <View style={[styles.aiBubbleIcon, { backgroundColor: colors.primary + "12" }]}>
          <Feather name="cpu" size={14} color={colors.primary} />
        </View>
      )}
      <View style={[
        styles.bubble,
        isUser
          ? { backgroundColor: colors.primary }
          : { backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.border },
      ]}>
        <Text style={[styles.bubbleText, { color: isUser ? "#fff" : colors.text }]}>
          {message.content}
        </Text>
        <Text style={[styles.timeText, { color: isUser ? "rgba(255,255,255,0.6)" : colors.textMuted }]}>
          {timeStr}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  topCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "center",
  },
  aiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  channelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  channelBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  channelBar: {
    borderBottomWidth: 1,
    maxHeight: 52,
  },
  channelBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  channelChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  channelChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  examplesContainer: {
    width: "100%",
    gap: 8,
    marginTop: 8,
  },
  exampleChip: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  exampleText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  thinkingRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  thinkingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    padding: 12,
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  thinkingText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 120,
    borderWidth: 1,
    textAlignVertical: "center",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 4,
  },
  bubbleRowUser: {
    justifyContent: "flex-start",
    flexDirection: "row-reverse",
  },
  bubbleRowAI: {
    justifyContent: "flex-start",
  },
  aiBubbleIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 18,
    padding: 12,
    gap: 4,
  },
  bubbleText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    textAlign: "right",
  },
  timeText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
});
