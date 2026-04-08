import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import * as api from "@/lib/api";

export default function ChatScreenWrapper() {
  return (
    <AuthGuard>
      <ChatScreen />
    </AuthGuard>
  );
}

type Colors = ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];

function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["messages"],
    queryFn: () => api.getMessages({ limit: 50 }),
    refetchInterval: 10000,
  });

  const messages = data?.messages || (Array.isArray(data) ? data : []);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      return api.apiRequest("/platform/messaging/internal", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={[styles.topBar, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.text }]}>הודעות</Text>
        <Pressable onPress={() => refetch()} style={styles.backBtn} hitSlop={8}>
          <Feather name="refresh-cw" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="message-circle" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>אין הודעות עדיין</Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>שלח הודעה ראשונה</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => String(item.id || Math.random())}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isOwn={item.userId === user?.id || item.senderName === user?.fullName}
              colors={colors}
            />
          )}
          inverted
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          scrollEnabled={messages.length > 0}
        />
      )}

      <View style={[styles.inputBar, { backgroundColor: colors.surfaceCard, borderTopColor: colors.border, paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 8 }]}>
        <TextInput
          style={[styles.messageInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
          value={message}
          onChangeText={setMessage}
          placeholder="כתוב הודעה..."
          placeholderTextColor={colors.textMuted}
          textAlign="right"
          multiline
          maxLength={1000}
          editable={!sendMutation.isPending}
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: colors.primary },
            !message.trim() && styles.sendBtnDisabled,
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSend}
          disabled={!message.trim() || sendMutation.isPending}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Feather name="send" size={18} color="#fff" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function MessageBubble({
  message,
  isOwn,
  colors,
}: {
  message: { id?: number; userId?: number; senderName?: string; message?: string; content?: string; body?: string; createdAt?: string };
  isOwn: boolean;
  colors: Colors;
}) {
  const timeStr = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
      <View style={[
        styles.bubble,
        isOwn
          ? { backgroundColor: colors.primary, borderBottomLeftRadius: 18, borderBottomRightRadius: 6 }
          : { backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6, borderBottomRightRadius: 18 },
      ]}>
        {!isOwn && message.senderName && (
          <Text style={[styles.senderName, { color: colors.accent }]}>{message.senderName}</Text>
        )}
        <Text style={[styles.bubbleText, { color: isOwn ? "#fff" : colors.text }]}>
          {message.message || message.content || message.body || ""}
        </Text>
        <Text style={[styles.timeText, { color: isOwn ? "rgba(255,255,255,0.7)" : colors.textMuted }]}>
          {timeStr}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  bubbleRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  bubbleRowOwn: {
    justifyContent: "flex-end",
  },
  bubbleRowOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  senderName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
    textAlign: "right",
  },
  bubbleText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    textAlign: "right",
  },
  timeText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    textAlign: "left",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  messageInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
    borderWidth: 1,
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
});
