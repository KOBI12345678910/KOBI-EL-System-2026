import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

const STATUS_FILTERS = [
  { key: "all", label: "הכל" },
  { key: "todo", label: "ממתין" },
  { key: "in-progress", label: "בביצוע" },
  { key: "done", label: "הושלם" },
  { key: "blocked", label: "חסום" },
];

const STATUS_COLORS: Record<string, string> = {
  todo: Colors.light.textMuted,
  "in-progress": Colors.light.warning,
  done: Colors.light.success,
  blocked: Colors.light.danger,
};
const STATUS_LABELS: Record<string, string> = {
  todo: "ממתין",
  "in-progress": "בביצוע",
  done: "הושלם",
  blocked: "חסום",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: Colors.light.success,
  medium: Colors.light.warning,
  high: Colors.light.danger,
  critical: "#8B0000",
};
const PRIORITY_LABELS: Record<string, string> = {
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
  critical: "קריטית",
};

export default function TasksWrapper() {
  return (
    <AuthGuard>
      <TasksScreen />
    </AuthGuard>
  );
}

function TasksScreen() {
  const insets = useSafeAreaInsets();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["project-tasks"],
    queryFn: () => api.getProjectTasks(),
  });

  const tasks = Array.isArray(data) ? data : [];
  const filtered = statusFilter === "all" ? tasks : tasks.filter((t: any) => t.status === statusFilter);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>משימות</Text>
          <Text style={styles.subtitle}>{filtered.length} משימות</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterBtn, statusFilter === f.key && styles.filterBtnActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterText, statusFilter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <TaskRow task={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="check-square" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין משימות</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function TaskRow({ task }: { task: any }) {
  const status = task.status || "todo";
  const priority = task.priority || "medium";
  const statusColor = STATUS_COLORS[status] || Colors.light.textMuted;
  const priorityColor = PRIORITY_COLORS[priority] || Colors.light.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.taskCard, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/projects/task/[id]", params: { id: String(task.id) } })}
    >
      <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />
      <View style={styles.taskInfo}>
        <Text style={styles.taskTitle}>{task.title || task.name || "—"}</Text>
        {task.projectName && <Text style={styles.projectName}>{task.projectName}</Text>}
        {task.assigneeName && (
          <Text style={styles.assignee}>
            <Feather name="user" size={11} color={Colors.light.textMuted} /> {task.assigneeName}
          </Text>
        )}
        {task.dueDate && <Text style={styles.dueDate}>יעד: {task.dueDate}</Text>}
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[status] || status}</Text>
        </View>
        <View style={[styles.priorityBadge, { backgroundColor: priorityColor + "18" }]}>
          <Text style={[styles.priorityText, { color: priorityColor }]}>{PRIORITY_LABELS[priority] || priority}</Text>
        </View>
        <Feather name="chevron-left" size={14} color={Colors.light.textMuted} />
      </View>
    </Pressable>
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center" },
  filterRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.light.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  filterBtnActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  filterTextActive: { color: "#fff" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, gap: 10 },
  taskCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  pressed: { opacity: 0.85 },
  priorityBar: { width: 4, height: 70, borderRadius: 2, marginTop: 2 },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right", marginBottom: 3 },
  projectName: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.primary, textAlign: "right" },
  assignee: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right", marginTop: 2 },
  dueDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right", marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  priorityBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  priorityText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
