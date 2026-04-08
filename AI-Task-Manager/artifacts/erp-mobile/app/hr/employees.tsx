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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

export default function EmployeesWrapper() {
  return (
    <AuthGuard>
      <EmployeesScreen />
    </AuthGuard>
  );
}

function EmployeesScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.getEmployees(),
  });

  const employees: any[] = Array.isArray(data?.employees) ? data.employees : Array.isArray(data) ? data : [];

  const filtered = employees.filter((emp: any) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const d = emp.data || emp;
    return (
      (d.full_name || "").toLowerCase().includes(term) ||
      (d.department || "").toLowerCase().includes(term) ||
      (d.job_title || "").toLowerCase().includes(term) ||
      (d.employee_id || "").toLowerCase().includes(term)
    );
  });

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>עובדים</Text>
          <Text style={styles.subtitle}>{filtered.length} עובדים</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש עובדים..."
          placeholderTextColor={Colors.light.textMuted}
          textAlign="right"
        />
        {!!search && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={16} color={Colors.light.textMuted} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <EmployeeRow employee={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="users" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין עובדים</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function EmployeeRow({ employee: emp }: { employee: any }) {
  const empData = emp.data || emp;
  const name = empData.full_name || empData.fullName || "—";
  const jobTitle = empData.job_title || empData.jobTitle || "—";
  const department = empData.department || "";

  const status = emp.status || empData.status || "active";
  const statusColors: Record<string, string> = {
    active: Colors.light.success,
    inactive: Colors.light.danger,
    on_leave: Colors.light.warning,
    terminated: Colors.light.danger,
  };
  const statusLabels: Record<string, string> = {
    active: "פעיל",
    inactive: "לא פעיל",
    on_leave: "בחופשה",
    terminated: "הסתיים",
  };
  const statusColor = statusColors[status] || Colors.light.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.empCard, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/hr/employee/[id]", params: { id: String(emp.id) } })}
    >
      <View style={styles.empAvatar}>
        <Text style={styles.empAvatarText}>{name.charAt(0)}</Text>
      </View>
      <View style={styles.empInfo}>
        <Text style={styles.empName}>{name}</Text>
        <Text style={styles.empSub}>{jobTitle}</Text>
        {!!department && <Text style={styles.empDept}>{department}</Text>}
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabels[status] || status}
          </Text>
        </View>
        <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
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
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, gap: 10 },
  empCard: {
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
  empAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  empAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.primary },
  empInfo: { flex: 1 },
  empName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  empSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  empDept: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
