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
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

interface TerminalEntry {
  id: string;
  type: "input" | "output" | "error" | "system";
  content: string;
  timestamp: Date;
}

const KIMI_MODELS = [
  { id: "moonshot-v1-8k", label: "8K" },
  { id: "moonshot-v1-32k", label: "32K" },
  { id: "moonshot-v1-128k", label: "128K" },
];

export default function KimiTerminalWrapper() {
  return (
    <AuthGuard>
      <KimiTerminalScreen />
    </AuthGuard>
  );
}

function KimiTerminalScreen() {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<TerminalEntry[]>([
    {
      id: "welcome",
      type: "system",
      content: "Kimi Terminal v1.0\nמוכן לקבל פקודות. הקלד הודעה ולחץ שלח.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState("moonshot-v1-8k");
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);
  const flatListRef = useRef<FlatList>(null);

  const scrollToBottom = () => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [entries]);

  const sendCommand = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const inputEntry: TerminalEntry = {
      id: `in-${Date.now()}`,
      type: "input",
      content: trimmed,
      timestamp: new Date(),
    };

    setEntries((prev) => [...prev, inputEntry]);
    setInput("");
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const newHistory = [...history, { role: "user", content: trimmed }];

    try {
      const result = await api.sendKimiMessage({ messages: newHistory, model });

      const content = result.content || "אין תגובה";
      const outputEntry: TerminalEntry = {
        id: `out-${Date.now()}`,
        type: "output",
        content,
        timestamp: new Date(),
      };
      setEntries((prev) => [...prev, outputEntry]);
      setHistory([...newHistory, { role: "assistant", content }]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "אירעה שגיאה";
      const errEntry: TerminalEntry = {
        id: `err-${Date.now()}`,
        type: "error",
        content: `ERROR: ${errorMsg}`,
        timestamp: new Date(),
      };
      setEntries((prev) => [...prev, errEntry]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearTerminal = () => {
    setEntries([
      {
        id: "clear",
        type: "system",
        content: "Terminal cleared.",
        timestamp: new Date(),
      },
    ]);
    setHistory([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View style={styles.topCenter}>
          <View style={styles.kimiIconWrap}>
            <Feather name="terminal" size={16} color="#00C4B4" />
          </View>
          <Text style={styles.topTitle}>Kimi Terminal</Text>
        </View>
        <View style={styles.topActions}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {KIMI_MODELS.map((m) => (
              <Pressable
                key={m.id}
                style={[styles.modelChip, model === m.id && styles.modelChipActive]}
                onPress={() => setModel(m.id)}
              >
                <Text style={[styles.modelChipText, model === m.id && styles.modelChipTextActive]}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={clearTerminal} style={styles.iconBtn} hitSlop={8}>
            <Feather name="trash-2" size={18} color={Colors.light.textMuted} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TerminalEntry entry={item} />}
          contentContainerStyle={styles.terminalContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
        />

        {isLoading && (
          <View style={styles.loadingRow}>
            <Text style={styles.loadingPrompt}>{">"}</Text>
            <ActivityIndicator size="small" color="#00C4B4" style={{ marginRight: 8 }} />
            <Text style={styles.loadingText}>Kimi מעבד...</Text>
          </View>
        )}

        <View
          style={[styles.inputBar, { paddingBottom: Platform.OS === "web" ? 16 : insets.bottom + 8 }]}
        >
          <Text style={styles.promptSymbol}>{">"}</Text>
          <TextInput
            style={styles.terminalInput}
            value={input}
            onChangeText={setInput}
            placeholder="הקלד פקודה..."
            placeholderTextColor="#4A7A74"
            textAlign="right"
            multiline={false}
            editable={!isLoading}
            onSubmitEditing={sendCommand}
            returnKeyType="send"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={sendCommand}
            disabled={!input.trim() || isLoading}
          >
            <Feather name="send" size={16} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function TerminalEntry({ entry }: { entry: TerminalEntry }) {
  const timeStr = entry.timestamp.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const textColor =
    entry.type === "input"
      ? "#00C4B4"
      : entry.type === "error"
      ? "#FF6B6B"
      : entry.type === "system"
      ? "#888"
      : "#E0E0E0";

  const prefix =
    entry.type === "input" ? "> " : entry.type === "output" ? "  " : "  ";

  return (
    <View style={styles.entryRow}>
      <Text style={[styles.entryText, { color: textColor }]}>
        {prefix}
        {entry.content}
      </Text>
      <Text style={styles.entryTime}>{timeStr}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D1117",
  },
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
    borderBottomColor: "#1C2A26",
    backgroundColor: "#161B22",
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
  kimiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#00C4B415",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: "#E0E0E0",
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 160,
  },
  modelChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#1C2A26",
    marginRight: 4,
  },
  modelChipActive: {
    backgroundColor: "#00C4B4",
  },
  modelChipText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#4A7A74",
  },
  modelChipTextActive: {
    color: "#fff",
  },
  terminalContent: {
    padding: 16,
    gap: 2,
  },
  entryRow: {
    marginBottom: 4,
  },
  entryText: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 20,
  },
  entryTime: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "#333",
    textAlign: "right",
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 4,
  },
  loadingPrompt: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#00C4B4",
  },
  loadingText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#4A7A74",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#161B22",
    borderTopWidth: 1,
    borderTopColor: "#1C2A26",
  },
  promptSymbol: {
    fontSize: 16,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#00C4B4",
  },
  terminalInput: {
    flex: 1,
    backgroundColor: "#0D1117",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#E0E0E0",
    borderWidth: 1,
    borderColor: "#1C2A26",
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#00C4B4",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },
});
