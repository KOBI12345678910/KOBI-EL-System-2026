import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
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

export default function DepartmentsWrapper() {
  return (
    <AuthGuard>
      <DepartmentsScreen />
    </AuthGuard>
  );
}

function DepartmentsScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["departments"],
    queryFn: api.getDepartments,
  });

  const departments: any[] = Array.isArray(data) ? data : [];
  const stats = { totalDepartments: departments.length, totalEmployees: departments.reduce((sum: number, d: any) => sum + (d.count || 0), 0) };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>מחלקות</Text>
          <Text style={styles.subtitle}>{departments.length} מחלקות</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={departments}
          keyExtractor={(item, idx) => String(item.department || item.name || idx)}
          renderItem={({ item, index }) => <DeptRow dept={item} index={index} />}
          ListHeaderComponent={
            stats.totalEmployees > 0 ? (
              <View style={styles.statsSection}>
                <View style={styles.statRow}>
                  <StatCard label="סה״כ עובדים" value={String(stats.totalEmployees)} icon="users" color={Colors.light.primary} />
                  <StatCard label="מחלקות" value={String(stats.totalDepartments)} icon="bar-chart-2" color={Colors.light.info} />
                </View>
              </View>
            ) : null
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="bar-chart-2" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין מחלקות</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const DEPT_COLORS = ["#1B4332", "#2D6A4F", "#40916C", "#1A535C", "#4ECDC4", "#3D405B", "#E07A5F", "#F4A261"];

function DeptRow({ dept, index }: { dept: any; index: number }) {
  const color = DEPT_COLORS[index % DEPT_COLORS.length];
  const name = dept.department || dept.name || dept.department_name || "—";
  const count = dept.count ?? dept.employee_count ?? 0;

  return (
    <View style={styles.deptCard}>
      <View style={[styles.deptIcon, { backgroundColor: color + "15" }]}>
        <Feather name="users" size={20} color={color} />
      </View>
      <View style={styles.deptInfo}>
        <Text style={styles.deptName}>{name}</Text>
        {dept.manager_name && <Text style={styles.deptManager}>מנהל: {dept.manager_name}</Text>}
      </View>
      <View style={styles.countBadge}>
        <Text style={[styles.countText, { color }]}>{count}</Text>
        <Text style={styles.countLabel}>עובדים</Text>
      </View>
    </View>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: keyof typeof Feather.glyphMap; color: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  statsSection: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  statRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center" },
  largestDept: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.warning + "12",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  largestDeptText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.warning, textAlign: "right", flex: 1 },
  listContent: { paddingHorizontal: 20, gap: 10 },
  deptCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  deptIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  deptInfo: { flex: 1 },
  deptName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  deptManager: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right", marginTop: 2 },
  countBadge: { alignItems: "center" },
  countText: { fontSize: 20, fontFamily: "Inter_700Bold" },
  countLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
