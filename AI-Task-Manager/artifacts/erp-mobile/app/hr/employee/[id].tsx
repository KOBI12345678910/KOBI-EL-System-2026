import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
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

export default function EmployeeDetailWrapper() {
  return (
    <AuthGuard>
      <EmployeeDetail />
    </AuthGuard>
  );
}

function EmployeeDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: emp, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => api.getEmployee(Number(id)),
    enabled: !!id,
  });

  const employeeRecord = emp?.employee || emp;
  const employee = employeeRecord?.data || employeeRecord;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>פרטי עובד</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : !employee ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>העובד לא נמצא</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(employee.full_name || "?").charAt(0)}</Text>
            </View>
            <Text style={styles.empName}>{employee.full_name || "—"}</Text>
            <Text style={styles.empTitle}>{employee.job_title || "—"}</Text>
            <View style={styles.badgeRow}>
              {employee.department && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{employee.department}</Text>
                </View>
              )}
              {employee.employment_type && (
                <View style={[styles.badge, { backgroundColor: Colors.light.info + "15" }]}>
                  <Text style={[styles.badgeText, { color: Colors.light.info }]}>{employee.employment_type}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>פרטים אישיים</Text>
            <InfoRow label="ת.ז." value={employee.id_number || "—"} />
            <InfoRow label="מספר עובד" value={employee.employee_id || "—"} />
            <InfoRow label="תאריך קליטה" value={employee.hire_date || "—"} />
            <InfoRow label="סוג העסקה" value={employee.employment_type || "—"} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>פרטי עבודה</Text>
            <InfoRow label="מחלקה" value={employee.department || "—"} />
            <InfoRow label="תפקיד" value={employee.job_title || "—"} />
            <InfoRow label="מנהל ישיר" value={employee.manager_name || employee.role || "—"} />
          </View>

          {(employee.base_salary || employee.overtime_hours !== undefined) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>שכר</Text>
              {employee.base_salary && (
                <InfoRow label="שכר בסיס" value={`₪${Number(employee.base_salary).toLocaleString()}`} />
              )}
              {employee.overtime_hours !== undefined && (
                <InfoRow label="שעות נוספות" value={String(employee.overtime_hours)} />
              )}
              {employee.bonus !== undefined && (
                <InfoRow label="בונוס" value={`₪${Number(employee.bonus).toLocaleString()}`} />
              )}
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  profileCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.light.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.light.primary },
  empName: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
  empTitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  badge: {
    backgroundColor: Colors.light.primary + "15",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  section: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 10,
  },
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
});
