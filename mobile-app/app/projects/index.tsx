import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";


export default function ProjectsDashboardWrapper() {
  return (
    <AuthGuard>
      <ProjectsDashboard />
    </AuthGuard>
  );
}

function ProjectsDashboard() {
  const insets = useSafeAreaInsets();

  const { data: projects, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.getProjects(),
  });

  const { data: tasks } = useQuery({
    queryKey: ["project-tasks"],
    queryFn: () => api.getProjectTasks(),
  });

  const { data: milestones } = useQuery({
    queryKey: ["project-milestones"],
    queryFn: () => api.getProjectMilestones(),
  });

  const projectList = Array.isArray(projects) ? projects : [];
  const taskList = Array.isArray(tasks) ? tasks : [];
  const milestoneList = Array.isArray(milestones) ? milestones : [];

  const activeProjects = projectList.filter((p: any) => p.status === "active" || p.status === "in_progress");
  const completedProjects = projectList.filter((p: any) => p.status === "completed");
  const openTasks = taskList.filter((t: any) => t.status === "todo" || t.status === "in-progress");

  const today = new Date().toISOString().slice(0, 10);
  const upcomingMilestones = milestoneList
    .filter((m: any) => m.status !== "completed" && m.dueDate && m.dueDate >= today)
    .sort((a: any, b: any) => (a.dueDate || "").localeCompare(b.dueDate || ""))
    .slice(0, 5);

  const recentProjects = projectList.slice(0, 5);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>פרויקטים</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
          </View>
        ) : (
          <>
            <View style={styles.kpiRow}>
              <KPICard icon="folder" label="פרויקטים פעילים" value={String(activeProjects.length)} color={Colors.light.primary} />
              <KPICard icon="check-circle" label="הושלמו" value={String(completedProjects.length)} color={Colors.light.success} />
              <KPICard icon="list" label="משימות פתוחות" value={String(openTasks.length)} color={Colors.light.warning} />
            </View>

            <View style={styles.actionsSection}>
              <Text style={styles.sectionTitle}>ניהול</Text>
              <View style={styles.actionRow}>
                <ActionCard icon="folder" label="רשימת פרויקטים" color="#1B4332" onPress={() => router.push("/projects/list")} />
                <ActionCard icon="check-square" label="משימות" color="#2D6A4F" onPress={() => router.push("/projects/tasks")} />
              </View>
            </View>

            {upcomingMilestones.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>אבני דרך קרובות</Text>
                </View>
                {upcomingMilestones.map((m: any) => (
                  <MilestoneRow key={m.id} milestone={m} />
                ))}
              </View>
            )}

            {recentProjects.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>פרויקטים אחרונים</Text>
                  <Pressable onPress={() => router.push("/projects/list")}>
                    <Text style={styles.seeAll}>הכל</Text>
                  </Pressable>
                </View>
                {recentProjects.map((project: any) => (
                  <ProjectMiniRow key={project.id} project={project} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function KPICard({ icon, label, value, color }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; color: string }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function ActionCard({ icon, label, color, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={24} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function ProjectMiniRow({ project }: { project: any }) {
  const statusColors: Record<string, string> = {
    planning: Colors.light.info,
    active: Colors.light.warning,
    in_progress: Colors.light.warning,
    completed: Colors.light.success,
    on_hold: Colors.light.textMuted,
    cancelled: Colors.light.danger,
  };
  const statusLabels: Record<string, string> = {
    planning: "תכנון",
    active: "פעיל",
    in_progress: "בביצוע",
    completed: "הושלם",
    on_hold: "בהמתנה",
    cancelled: "בוטל",
  };
  const status = project.status || "active";
  const color = statusColors[status] || Colors.light.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.miniRow, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/projects/project/[id]", params: { id: String(project.id) } })}
    >
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <View style={styles.miniInfo}>
        <Text style={styles.miniTitle}>{project.name || project.projectName || "—"}</Text>
        <Text style={styles.miniSub}>{project.client_name || project.clientName || "—"}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: color + "18" }]}>
        <Text style={[styles.statusText, { color }]}>{statusLabels[status] || status}</Text>
      </View>
    </Pressable>
  );
}

function MilestoneRow({ milestone }: { milestone: any }) {
  const daysLeft = milestone.dueDate
    ? Math.ceil((new Date(milestone.dueDate).getTime() - Date.now()) / 86400000)
    : null;
  const isUrgent = daysLeft !== null && daysLeft <= 7;

  return (
    <View style={styles.milestoneRow}>
      <View style={[styles.milestoneIcon, { backgroundColor: isUrgent ? Colors.light.danger + "15" : Colors.light.primary + "15" }]}>
        <Feather name="flag" size={16} color={isUrgent ? Colors.light.danger : Colors.light.primary} />
      </View>
      <View style={styles.miniInfo}>
        <Text style={styles.miniTitle}>{milestone.name || "—"}</Text>
        {daysLeft !== null && (
          <Text style={[styles.miniSub, { color: isUrgent ? Colors.light.danger : Colors.light.textSecondary }]}>
            {daysLeft === 0 ? "היום" : daysLeft === 1 ? "מחר" : `בעוד ${daysLeft} ימים`}
          </Text>
        )}
      </View>
      <View style={[styles.statusBadge, { backgroundColor: (isUrgent ? Colors.light.danger : Colors.light.info) + "18" }]}>
        <Text style={[styles.statusText, { color: isUrgent ? Colors.light.danger : Colors.light.info }]}>
          {milestone.status === "pending" ? "ממתין" : milestone.status === "in-progress" ? "בביצוע" : milestone.status}
        </Text>
      </View>
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
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  loadingContainer: { paddingTop: 80, alignItems: "center" },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  kpiLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, textAlign: "center" },
  actionsSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginBottom: 12, textAlign: "right" },
  actionRow: { flexDirection: "row", gap: 12 },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  pressed: { opacity: 0.85 },
  recentSection: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  seeAll: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  miniRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  miniInfo: { flex: 1 },
  miniTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  miniSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  milestoneIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
