import { Ionicons } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  CATEGORY_LABELS,
  getCommandsByCategory,
  matchCommand,
  speakHebrew,
  stopSpeaking,
  type VoiceCommand,
} from "@/lib/voice-commands";

export default function VoiceFab() {
  const [isListening, setIsListening] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [inputText, setInputText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState("");
  const [lastMatched, setLastMatched] = useState<VoiceCommand | null>(null);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isListening, pulseAnim]);

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results?.[0]?.transcript || "";
    setTranscript(text);
    if (event.isFinal && text.trim()) {
      handleCommand(text.trim());
      stopListeningHardware();
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent("error", (event) => {
    console.warn("[VoiceFab] Speech recognition error:", event.error);
    setIsListening(false);
    if (event.error !== "no-speech") {
      showFeedbackMsg("שגיאה בזיהוי קולי. נסה שוב.");
    }
  });

  const showFeedbackMsg = useCallback((text: string, durationMs = 3000) => {
    setFeedback(text);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(""), durationMs);
  }, []);

  const handleCommand = useCallback(async (text: string) => {
    const matched = matchCommand(text);
    if (matched) {
      setLastMatched(matched);
      const msg = `מבצע: ${matched.label}`;
      showFeedbackMsg(msg);
      await speakHebrew(msg);
      matched.action();
      setIsListening(false);
      setInputText("");
      setTranscript("");
    } else {
      showFeedbackMsg("לא זיהיתי פקודה. נסה שוב.");
      await speakHebrew("לא זיהיתי פקודה");
    }
  }, [showFeedbackMsg]);

  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") return false;
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      const granted = result.granted;
      setMicPermission(granted);
      return granted;
    } catch {
      setMicPermission(false);
      return false;
    }
  }, []);

  const startListeningHardware = useCallback(async () => {
    if (Platform.OS === "web") {
      setIsListening(true);
      return;
    }
    let hasPermission = micPermission;
    if (hasPermission === null || hasPermission === false) {
      hasPermission = await requestMicPermission();
    }
    if (!hasPermission) {
      showFeedbackMsg("נדרשת הרשאת מיקרופון לזיהוי קולי");
      return;
    }
    try {
      ExpoSpeechRecognitionModule.start({
        lang: "he-IL",
        interimResults: true,
        maxAlternatives: 1,
      });
      setIsListening(true);
      setTranscript("");
    } catch {
      showFeedbackMsg("שגיאה בהפעלת זיהוי קולי. נסה שוב.");
    }
  }, [micPermission, requestMicPermission, showFeedbackMsg]);

  const stopListeningHardware = useCallback(() => {
    if (Platform.OS === "web") return;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListeningHardware();
      setIsListening(false);
      stopSpeaking();
      if (inputText.trim()) {
        handleCommand(inputText.trim());
      }
    } else {
      setInputText("");
      setFeedback("");
      setTranscript("");
      startListeningHardware();
    }
  }, [isListening, inputText, handleCommand, startListeningHardware, stopListeningHardware]);

  const handleSubmitText = useCallback(() => {
    if (inputText.trim()) {
      handleCommand(inputText.trim());
    }
  }, [inputText, handleCommand]);

  const categories = getCommandsByCategory();

  return (
    <>
      {!!feedback && (
        <View style={styles.feedbackBar}>
          <Text style={styles.feedbackText}>{feedback}</Text>
        </View>
      )}

      {isListening && (
        <View style={styles.listeningPanel}>
          <View style={styles.listeningHeader}>
            <Ionicons name="mic" size={24} color="#60a5fa" />
            <Text style={styles.listeningTitle}>
              {transcript ? "זוהה:" : "מקשיב..."}
            </Text>
          </View>
          {!!transcript && (
            <Text style={styles.transcriptText}>{transcript}</Text>
          )}
          <TextInput
            style={styles.textInput}
            placeholder={'או הקלד פקודה (למשל: "בדיקת מלאי")'}
            placeholderTextColor="#6b7280"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSubmitText}
            returnKeyType="send"
          />
          <View style={styles.listeningActions}>
            <Pressable style={styles.sendBtn} onPress={handleSubmitText}>
              <Text style={styles.sendBtnText}>שלח</Text>
            </Pressable>
            <Pressable style={styles.helpBtn} onPress={() => { setShowHelp(true); setIsListening(false); stopListeningHardware(); }}>
              <Ionicons name="help-circle-outline" size={20} color="#9ca3af" />
              <Text style={styles.helpBtnText}>פקודות</Text>
            </Pressable>
          </View>
          {!!lastMatched && (
            <Text style={styles.lastCmd}>פקודה אחרונה: {lastMatched.label}</Text>
          )}
        </View>
      )}

      <Pressable onPress={toggleListening} onLongPress={() => setShowHelp(true)}>
        <Animated.View style={[styles.fab, isListening && styles.fabActive, { transform: [{ scale: pulseAnim }] }]}>
          <Ionicons name={isListening ? "mic" : "mic-outline"} size={28} color="#fff" />
        </Animated.View>
      </Pressable>

      <Modal visible={showHelp} animationType="slide" transparent onRequestClose={() => setShowHelp(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>פקודות קוליות</Text>
              <Pressable onPress={() => setShowHelp(false)}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              לחץ על המיקרופון ואמור את הפקודה בעברית, או הקלד אותה
            </Text>
            <ScrollView style={styles.commandsList}>
              {Object.entries(categories).map(([cat, cmds]) => (
                <View key={cat} style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>{CATEGORY_LABELS[cat] || cat}</Text>
                  {cmds.map((cmd) => (
                    <Pressable
                      key={cmd.label}
                      style={styles.commandRow}
                      onPress={() => {
                        setShowHelp(false);
                        cmd.action();
                        speakHebrew(`מבצע: ${cmd.label}`);
                      }}
                    >
                      <View style={styles.commandInfo}>
                        <Text style={styles.commandLabel}>{cmd.label}</Text>
                        <Text style={styles.commandDesc}>{cmd.description}</Text>
                        <Text style={styles.commandKeywords}>
                          {cmd.keywords.join(" | ")}
                        </Text>
                      </View>
                      <Ionicons name="chevron-back" size={18} color="#6b7280" />
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 100,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabActive: {
    backgroundColor: "#ef4444",
  },
  feedbackBar: {
    position: "absolute",
    bottom: 170,
    left: 16,
    right: 16,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  feedbackText: {
    color: "#e2e8f0",
    fontSize: 14,
    textAlign: "right",
  },
  listeningPanel: {
    position: "absolute",
    bottom: 170,
    left: 16,
    right: 16,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  listeningHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  listeningTitle: {
    color: "#60a5fa",
    fontSize: 16,
    fontWeight: "600",
  },
  transcriptText: {
    color: "#e2e8f0",
    fontSize: 15,
    textAlign: "right",
    marginBottom: 10,
    backgroundColor: "#0f172a",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  textInput: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 12,
    color: "#e2e8f0",
    fontSize: 15,
    textAlign: "right",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 12,
  },
  listeningActions: {
    flexDirection: "row-reverse",
    gap: 12,
    alignItems: "center",
  },
  sendBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  helpBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  helpBtnText: {
    color: "#9ca3af",
    fontSize: 13,
  },
  lastCmd: {
    color: "#6b7280",
    fontSize: 12,
    textAlign: "right",
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    color: "#f1f5f9",
    fontSize: 20,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "right",
    marginBottom: 16,
  },
  commandsList: {
    flex: 1,
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryTitle: {
    color: "#60a5fa",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "right",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  commandRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1e293b",
  },
  commandInfo: {
    flex: 1,
  },
  commandLabel: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "right",
  },
  commandDesc: {
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "right",
    marginTop: 2,
  },
  commandKeywords: {
    color: "#475569",
    fontSize: 11,
    textAlign: "right",
    marginTop: 2,
    fontStyle: "italic",
  },
});
