import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  type DimensionValue,
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


export default function HRDashboardWrapper() {
  return (
    <AuthGuard>
      <HRDashboard />
    </AuthGuard>
  );
}

function HRDashboard() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["hr-dashboard"],
    queryFn: api.getHRDashboard,
  });

  const { data: employees } = useQuery({
    queryKey: ["employees", { limit: 5 }],
    queryFn: () => api.getEmployees({ limit: 5 }),
  });

  const empList: any[] = Array.isArray(employees?.employees) ? employees.employees : [];

  const totalEmployees = data?.employees?.total_employees ?? data?.employees?.active_employees ?? 0;
  const presentToday = data?.attendance?.present_today ?? 0;
  const onLeave = data?.employees?.on_leave ?? 0;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>משאבי אנוש</Text>
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
              <KPICard
                icon="users"
                label="סה״כ עובדים"
                value={String(totalEmployees)}
                color={Colors.light.primary}
              />
              <KPICard
                icon="check-circle"
                label="נוכחים היום"
                value={String(presentToday)}
                color={Colors.light.success}
              />
              <KPICard
                icon="user-x"
                label="בחופשה"
                value={String(onLeave)}
                color={Colors.light.warning}
              />
            </View>

            <View style={styles.actionsSection}>
              <Text style={styles.sectionTitle}>ניהול</Text>
              <View style={styles.actionGrid}>
                <ActionCard icon="users" label="עובדים" color="#1B4332" onPress={() => router.push("/hr/employees")} />
                <ActionCard icon="clock" label="נוכחות" color="#2D6A4F" onPress={() => router.push("/hr/attendance")} />
                <ActionCard icon="calendar" label="משמרות" color="#40916C" onPress={() => router.push("/hr/shifts")} />
                <ActionCard icon="bar-chart-2" label="מחלקות" color="#1A535C" onPress={() => router.push("/hr/departments")} />
              </View>
            </View>

            {empList.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>עובדים אחרונים</Text>
                  <Pressable onPress={() => router.push("/hr/employees")}>
                    <Text style={styles.seeAll}>הכל</Text>
                  </Pressable>
                </View>
                {empList.slice(0, 5).map((emp: any) => {
                  const empData = emp.data || emp;
                  const name = empData.full_name || empData.fullName || "—";
                  const role = empData.job_title || empData.jobTitle || empData.department || "—";
                  return (
                    <Pressable
                      key={emp.id}
                      style={({ pressed }) => [styles.empRow, pressed && styles.pressed]}
                      onPress={() => router.push({ pathname: "/hr/employee/[id]", params: { id: String(emp.id) } })}
                    >
                      <View style={styles.empAvatar}>
                        <Text style={styles.empAvatarText}>{name.charAt(0)}</Text>
                      </View>
                      <View style={styles.empInfo}>
                        <Text style={styles.empName}>{name}</Text>
                        <Text style={styles.empRole}>{role}</Text>
                      </View>
                      <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
                    </Pressable>
                  );
                })}
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
        <Feather name={icon} size={22} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  loadingContainer: { paddingTop: 80, alignItems: "center" },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, textAlign: "center" },
  actionsSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginBottom: 12, textAlign: "right" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionCard: {
    width: "47%" as DimensionValue,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  recentSection: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  seeAll: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  empRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  pressed: { opacity: 0.85 },
  empAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  empAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.primary },
  empInfo: { flex: 1 },
  empName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  empRole: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
});
