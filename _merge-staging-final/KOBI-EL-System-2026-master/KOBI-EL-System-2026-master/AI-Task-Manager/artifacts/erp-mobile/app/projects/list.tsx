import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  type DimensionValue,
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
  { key: "active", label: "פעיל" },
  { key: "in_progress", label: "בביצוע" },
  { key: "completed", label: "הושלם" },
];

const STATUS_COLORS: Record<string, string> = {
  planning: Colors.light.textMuted,
  active: Colors.light.primary,
  in_progress: Colors.light.warning,
  on_hold: "#9CA89F",
  completed: Colors.light.success,
  cancelled: Colors.light.danger,
};
const STATUS_LABELS: Record<string, string> = {
  planning: "תכנון",
  active: "פעיל",
  in_progress: "בביצוע",
  on_hold: "בהמתנה",
  completed: "הושלם",
  cancelled: "בוטל",
};

export default function ProjectsListWrapper() {
  return (
    <AuthGuard>
      <ProjectsListScreen />
    </AuthGuard>
  );
}

function ProjectsListScreen() {
  const insets = useSafeAreaInsets();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.getProjects(),
  });

  const projects = Array.isArray(data) ? data : [];
  const filtered = statusFilter === "all"
    ? projects
    : projects.filter((p: any) => p.status === statusFilter);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>פרויקטים</Text>
          <Text style={styles.subtitle}>{filtered.length} פרויקטים</Text>
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
          renderItem={({ item }) => <ProjectRow project={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="clipboard" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין פרויקטים</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function ProjectRow({ project }: { project: any }) {
  const status = project.status || "active";
  const color = STATUS_COLORS[status] || Colors.light.textMuted;
  const progress = Number(project.progress || project.completionPercentage || 0);

  return (
    <Pressable
      style={({ pressed }) => [styles.projectCard, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/projects/project/[id]", params: { id: String(project.id) } })}
    >
      <View style={[styles.statusBar, { backgroundColor: color }]} />
      <View style={styles.projectInfo}>
        <View style={styles.topRow}>
          <View style={[styles.statusBadge, { backgroundColor: color + "18" }]}>
            <Text style={[styles.statusText, { color }]}>{STATUS_LABELS[status] || status}</Text>
          </View>
          <Text style={styles.projectName}>{project.name || project.projectName || "—"}</Text>
        </View>
        {project.description && (
          <Text style={styles.description} numberOfLines={2}>{project.description}</Text>
        )}
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` as DimensionValue, backgroundColor: color }]} />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
        {(project.startDate || project.endDate) && (
          <Text style={styles.dates}>
            {project.startDate || "—"} — {project.endDate || project.dueDate || "—"}
          </Text>
        )}
      </View>
      <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
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
  projectCard: {
    flexDirection: "row",
    alignItems: "center",
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
  statusBar: { width: 4, height: 80, borderRadius: 2 },
  projectInfo: { flex: 1, gap: 4 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  projectName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right", flex: 1 },
  description: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  progressSection: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressBar: { flex: 1, height: 6, backgroundColor: Colors.light.border, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, width: 30, textAlign: "left" },
  dates: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
