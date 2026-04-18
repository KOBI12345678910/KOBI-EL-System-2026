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
import MobileEmptyState from "@/components/MobileEmptyState";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

export default function AttendanceWrapper() {
  return (
    <AuthGuard>
      <AttendanceScreen />
    </AuthGuard>
  );
}

function AttendanceScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["attendance-summary"],
    queryFn: () => api.getAttendanceSummary(),
  });

  const summary = data?.summary || {};
  const employeeBreakdown: any[] = Array.isArray(data?.employeeBreakdown) ? data.employeeBreakdown : [];

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>נוכחות</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={employeeBreakdown}
          keyExtractor={(item, idx) => String(item.employee_id || idx)}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListHeaderComponent={
            <View style={styles.summarySection}>
              <View style={styles.kpiRow}>
                <KPICard
                  icon="users"
                  label="נוכחים"
                  value={String(summary.present_count || 0)}
                  color={Colors.light.success}
                />
                <KPICard
                  icon="x-circle"
                  label="נעדרים"
                  value={String(summary.absent_count || 0)}
                  color={Colors.light.danger}
                />
                <KPICard
                  icon="clock"
                  label="שעות ממוצע"
                  value={summary.avg_hours ? Number(summary.avg_hours).toFixed(1) : "—"}
                  color={Colors.light.info}
                />
              </View>
              {summary.late_count > 0 && (
                <View style={styles.lateBanner}>
                  <Feather name="alert-circle" size={14} color={Colors.light.warning} />
                  <Text style={styles.lateText}>{summary.late_count} איחורים החודש</Text>
                </View>
              )}
              <Text style={styles.sectionTitle}>סיכום לפי עובד</Text>
            </View>
          }
          renderItem={({ item }) => <EmployeeAttendanceRow record={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <MobileEmptyState
              icon="clock"
              title="אין רשומות נוכחות"
              description="לא נמצאו רשומות נוכחות עובדים לתקופה זו."
            />
          }
        />
      )}
    </View>
  );
}

function EmployeeAttendanceRow({ record }: { record: any }) {
  const attendanceRate = record.total_days > 0
    ? Math.round((record.present_days / record.total_days) * 100)
    : 0;
  const rateColor = attendanceRate >= 90 ? Colors.light.success : attendanceRate >= 70 ? Colors.light.warning : Colors.light.danger;

  return (
    <View style={styles.recordCard}>
      <View style={styles.recordInfo}>
        <Text style={styles.empName}>{record.employee_name || "—"}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.recordStat}>{record.present_days || 0} נוכחות</Text>
          <Text style={styles.recordStatSep}>·</Text>
          <Text style={styles.recordStat}>{record.absent_days || 0} היעדרות</Text>
          {record.total_hours > 0 && (
            <>
              <Text style={styles.recordStatSep}>·</Text>
              <Text style={styles.recordStat}>{Number(record.total_hours).toFixed(0)} שע׳</Text>
            </>
          )}
        </View>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[styles.rateText, { color: rateColor }]}>{attendanceRate}%</Text>
        <Text style={styles.rateLabel}>נוכחות</Text>
      </View>
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
  summarySection: { paddingHorizontal: 20, paddingTop: 8 },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, textAlign: "center" },
  lateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.warning + "12",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  lateText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.warning },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginBottom: 12, textAlign: "right" },
  listContent: { gap: 8 },
  recordCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 20,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  recordInfo: { flex: 1 },
  empName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  statsRow: { flexDirection: "row", gap: 4, justifyContent: "flex-end", marginTop: 2 },
  recordStat: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  recordStatSep: { fontSize: 12, color: Colors.light.textMuted },
  rateText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  rateLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
});
