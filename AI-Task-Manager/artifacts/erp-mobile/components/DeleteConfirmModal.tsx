import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Colors from "@/constants/colors";

const CONFIRM_WORD = "מחק";

interface DeleteConfirmModalProps {
  visible: boolean;
  itemName?: string;
  entityType?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  visible,
  itemName,
  entityType,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const [inputValue, setInputValue] = useState("");
  const canConfirm = inputValue.trim() === CONFIRM_WORD;

  const handleCancel = () => {
    setInputValue("");
    onCancel();
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    setInputValue("");
    onConfirm();
  };

  const c = Colors.light;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.dialog, { backgroundColor: c.surfaceCard }]}>
          <View style={styles.iconRow}>
            <Text style={styles.warningIcon}>⚠️</Text>
          </View>
          <Text style={[styles.title, { color: c.text }]}>אישור מחיקה</Text>

          {(itemName || entityType) && (
            <View style={[styles.itemInfo, { backgroundColor: c.surface }]}>
              {entityType && <Text style={[styles.entityType, { color: c.textMuted }]}>{entityType}</Text>}
              {itemName && <Text style={[styles.itemName, { color: c.text }]}>{itemName}</Text>}
            </View>
          )}

          <Text style={styles.warning}>
            פעולה זו אינה ניתנת לביטול. הרשומה תועבר לפח המחזור.
          </Text>

          <Text style={[styles.instruction, { color: c.textSecondary }]}>
            כדי לאשר, הקלד{" "}
            <Text style={[styles.confirmWord, { color: c.text }]}>"{CONFIRM_WORD}"</Text>
            {" "}בשדה למטה:
          </Text>

          <TextInput
            style={[
              styles.input,
              { borderColor: c.border, color: c.text, backgroundColor: c.inputBg },
              canConfirm && styles.inputValid,
            ]}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder={`הקלד "${CONFIRM_WORD}" לאישור`}
            placeholderTextColor={c.textMuted}
            textAlign="right"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.buttonRow}>
            <Pressable
              style={({ pressed }) => [
                styles.cancelBtn,
                { backgroundColor: c.surface },
                pressed && { opacity: 0.75 },
              ]}
              onPress={handleCancel}
            >
              <Text style={[styles.cancelBtnText, { color: c.text }]}>ביטול</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.confirmBtn,
                !canConfirm && styles.confirmBtnDisabled,
                pressed && canConfirm && { opacity: 0.8 },
              ]}
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text style={styles.confirmBtnText}>מחק</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  dialog: {
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  warningIcon: {
    fontSize: 36,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  itemInfo: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: "center",
  },
  entityType: {
    fontSize: 11,
    textAlign: "center",
  },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
  },
  warning: {
    fontSize: 13,
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 20,
  },
  instruction: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 20,
  },
  confirmWord: {
    fontWeight: "700",
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 16,
    textAlign: "right",
  },
  inputValid: {
    borderColor: "#ef4444",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: "#ef444460",
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
