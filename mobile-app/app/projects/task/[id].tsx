import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const STATUS_OPTIONS = [
  { key: "todo", label: "ממתין", color: Colors.light.textMuted },
  { key: "in-progress", label: "בביצוע", color: Colors.light.warning },
  { key: "done", label: "הושלם", color: Colors.light.success },
  { key: "blocked", label: "חסום", color: Colors.light.danger },
];

export default function TaskDetailWrapper() {
  return (
    <AuthGuard>
      <TaskDetail />
    </AuthGuard>
  );
}

function TaskDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["project-tasks"],
    queryFn: () => api.getProjectTasks(),
  });

  const task = Array.isArray(tasks) ? tasks.find((t: any) => String(t.id) === String(id)) : null;

  const updateMutation = useMutation({
    mutationFn: (updates: any) => api.updateProjectTask(Number(id), updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-tasks"] });
      setEditingNotes(false);
    },
    onError: (err: any) => {
      Alert.alert("שגיאה", err.message || "שגיאה בעדכון");
    },
  });

  const currentStatus = STATUS_OPTIONS.find((s) => s.key === task?.status) || STATUS_OPTIONS[0];

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>פרטי משימה</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : !task ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>המשימה לא נמצאה</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryCard}>
            <View style={[styles.statusBadge, { backgroundColor: currentStatus.color + "20" }]}>
              <View style={[styles.statusDot, { backgroundColor: currentStatus.color }]} />
              <Text style={[styles.statusText, { color: currentStatus.color }]}>{currentStatus.label}</Text>
            </View>
            <Text style={styles.taskTitle}>{task.title || task.name || "—"}</Text>
            {task.projectName && <Text style={styles.projectName}>{task.projectName}</Text>}
            {task.description && (
              <Text style={styles.description}>{task.description}</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>פרטי משימה</Text>
            <InfoRow label="עדיפות" value={
              (({ low: "נמוכה", medium: "בינונית", high: "גבוהה", critical: "קריטית" } as Record<string, string>)[task.priority]) || task.priority || "—"
            } />
            <InfoRow label="אחראי" value={task.assigneeName || task.assignee || "—"} />
            <InfoRow label="תאריך יעד" value={task.dueDate || task.due_date || "—"} />
            <InfoRow label="תאריך התחלה" value={task.startDate || task.start_date || "—"} />
          </View>

          <View style={styles.statusSection}>
            <Text style={styles.sectionTitle}>עדכון סטטוס</Text>
            <View style={styles.statusGrid}>
              {STATUS_OPTIONS.map((s) => (
                <Pressable
                  key={s.key}
                  style={({ pressed }) => [
                    styles.statusOption,
                    task.status === s.key && { borderColor: s.color, borderWidth: 2 },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    if (task.status !== s.key) {
                      updateMutation.mutate({ status: s.key });
                    }
                  }}
                  disabled={updateMutation.isPending}
                >
                  <View style={[styles.statusOptionDot, { backgroundColor: s.color }]} />
                  <Text style={[styles.statusOptionText, task.status === s.key && { color: s.color, fontFamily: "Inter_700Bold" }]}>
                    {s.label}
                  </Text>
                  {task.status === s.key && <Feather name="check" size={14} color={s.color} />}
                </Pressable>
              ))}
            </View>
            {updateMutation.isPending && (
              <ActivityIndicator size="small" color={Colors.light.primary} style={{ marginTop: 8 }} />
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.notesHeader}>
              <Pressable
                onPress={() => {
                  if (editingNotes && notes.trim()) {
                    updateMutation.mutate({ notes: notes.trim() });
                  } else {
                    setNotes(task.notes || "");
                    setEditingNotes(!editingNotes);
                  }
                }}
              >
                <Text style={styles.notesAction}>{editingNotes ? "שמור" : "ערוך"}</Text>
              </Pressable>
              <Text style={styles.sectionTitle}>הערות</Text>
            </View>
            {editingNotes ? (
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="הוסף הערות..."
                placeholderTextColor={Colors.light.textMuted}
                textAlign="right"
                textAlignVertical="top"
              />
            ) : (
              <Text style={styles.notesText}>{task.notes || "אין הערות"}</Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 16, color: Colors.light.textSecondary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  summaryCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  taskTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  projectName: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center", lineHeight: 22 },
  section: { backgroundColor: Colors.light.surfaceCard, borderRadius: 16, padding: 16, gap: 4 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right", marginBottom: 8 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  infoValue: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text, textAlign: "right", flex: 1 },
  statusSection: { backgroundColor: Colors.light.surfaceCard, borderRadius: 16, padding: 16 },
  statusGrid: { gap: 8 },
  statusOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  statusOptionDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text, textAlign: "right" },
  pressed: { opacity: 0.85 },
  notesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  notesAction: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.primary },
  notesInput: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  notesText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.text, textAlign: "right", lineHeight: 22 },
});
