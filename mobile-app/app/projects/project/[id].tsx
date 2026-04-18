import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  type DimensionValue,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

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

export default function ProjectDetailWrapper() {
  return (
    <AuthGuard>
      <ProjectDetail />
    </AuthGuard>
  );
}

function ProjectDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.getProject(Number(id)),
    enabled: !!id,
  });

  const { data: tasks } = useQuery({
    queryKey: ["project-tasks", { projectId: Number(id) }],
    queryFn: () => api.getProjectTasks({ projectId: Number(id) }),
    enabled: !!id,
  });

  const { data: milestones } = useQuery({
    queryKey: ["project-milestones", { projectId: Number(id) }],
    queryFn: () => api.getProjectMilestones({ projectId: Number(id) }),
    enabled: !!id,
  });

  const status = project?.status || "active";
  const color = STATUS_COLORS[status] || Colors.light.textMuted;
  const progress = Number(project?.progress || project?.completionPercentage || 0);
  const taskList = Array.isArray(tasks) ? tasks : [];
  const milestoneList = Array.isArray(milestones) ? milestones : [];
  const openTasks = taskList.filter((t: any) => t.status !== "completed" && t.status !== "cancelled");

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>פרטי פרויקט</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : !project ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>הפרויקט לא נמצא</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryCard}>
            <View style={[styles.statusBadge, { backgroundColor: color + "20" }]}>
              <View style={[styles.statusDot, { backgroundColor: color }]} />
              <Text style={[styles.statusText, { color }]}>{STATUS_LABELS[status] || status}</Text>
            </View>
            <Text style={styles.projectName}>{project.name || project.projectName || "—"}</Text>
            {project.description && (
              <Text style={styles.description}>{project.description}</Text>
            )}
            <View style={styles.progressSection}>
              <Text style={styles.progressLabel}>{progress}% הושלם</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` as DimensionValue, backgroundColor: color }]} />
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.light.warning }]}>{openTasks.length}</Text>
              <Text style={styles.statLabel}>משימות פתוחות</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.light.success }]}>
                {taskList.filter((t: any) => t.status === "completed").length}
              </Text>
              <Text style={styles.statLabel}>משימות שהושלמו</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.light.info }]}>{milestoneList.length}</Text>
              <Text style={styles.statLabel}>אבני דרך</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>פרטי פרויקט</Text>
            <InfoRow label="מנהל פרויקט" value={project.projectManager || project.managerName || "—"} />
            <InfoRow label="תאריך התחלה" value={project.startDate || project.start_date || "—"} />
            <InfoRow label="תאריך יעד" value={project.endDate || project.end_date || project.dueDate || "—"} />
            {project.budget && <InfoRow label="תקציב" value={`₪${Number(project.budget).toLocaleString()}`} />}
            {project.client && <InfoRow label="לקוח" value={project.client} />}
          </View>

          {milestoneList.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>אבני דרך</Text>
              {milestoneList.slice(0, 5).map((ms: any) => (
                <View key={ms.id} style={styles.milestoneRow}>
                  <View style={[styles.msDot, { backgroundColor: ms.status === "completed" ? Colors.light.success : Colors.light.warning }]} />
                  <Text style={styles.msName}>{ms.name || ms.title || "—"}</Text>
                  {ms.dueDate && <Text style={styles.msDate}>{ms.dueDate}</Text>}
                </View>
              ))}
            </View>
          )}

          {openTasks.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Pressable onPress={() => router.push("/projects/tasks")}>
                  <Text style={styles.seeAll}>הכל</Text>
                </Pressable>
                <Text style={styles.sectionTitle}>משימות פתוחות</Text>
              </View>
              {openTasks.slice(0, 4).map((task: any) => (
                <Pressable
                  key={task.id}
                  style={({ pressed }) => [styles.taskRow, pressed && styles.pressed]}
                  onPress={() => router.push({ pathname: "/projects/task/[id]", params: { id: String(task.id) } })}
                >
                  <View style={[styles.taskStatusDot, { backgroundColor: task.status === "in_progress" ? Colors.light.warning : Colors.light.textMuted }]} />
                  <Text style={styles.taskTitle}>{task.title || task.name || "—"}</Text>
                  <Feather name="chevron-left" size={14} color={Colors.light.textMuted} />
                </Pressable>
              ))}
            </View>
          )}
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
  projectName: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center", lineHeight: 22 },
  progressSection: { width: "100%", gap: 6 },
  progressLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, textAlign: "center" },
  progressBar: { height: 8, backgroundColor: Colors.light.border, borderRadius: 4, overflow: "hidden", width: "100%" },
  progressFill: { height: 8, borderRadius: 4 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center" },
  section: { backgroundColor: Colors.light.surfaceCard, borderRadius: 16, padding: 16, gap: 4 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right", marginBottom: 8 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.primary },
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
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  msDot: { width: 8, height: 8, borderRadius: 4 },
  msName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text, textAlign: "right" },
  msDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  taskStatusDot: { width: 8, height: 8, borderRadius: 4 },
  taskTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text, textAlign: "right" },
  pressed: { opacity: 0.85 },
});
