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

export default function ShiftsWrapper() {
  return (
    <AuthGuard>
      <ShiftsScreen />
    </AuthGuard>
  );
}

function ShiftsScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["shifts-schedule"],
    queryFn: () => api.getShiftsSchedule(),
  });

  const shifts = Array.isArray(data?.shifts) ? data.shifts : Array.isArray(data) ? data : [];

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>משמרות</Text>
          <Text style={styles.subtitle}>{shifts.length} משמרות</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(item, idx) => String(item.id || idx)}
          renderItem={({ item }) => <ShiftRow shift={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="calendar" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין משמרות מתוכננות</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function ShiftRow({ shift }: { shift: any }) {
  const shiftColors: Record<string, string> = {
    morning: "#F0AD4E",
    afternoon: "#17A2B8",
    night: "#3D405B",
    default: Colors.light.primary,
  };

  const type = (shift.shift_type || shift.shiftType || "default").toLowerCase();
  const color = shiftColors[type] || shiftColors.default;
  const typeLabels: Record<string, string> = { morning: "בוקר", afternoon: "צהריים", night: "לילה" };

  return (
    <View style={styles.shiftCard}>
      <View style={[styles.shiftTypeBar, { backgroundColor: color }]} />
      <View style={styles.shiftInfo}>
        <Text style={styles.empName}>{shift.employee_name || shift.employeeName || "—"}</Text>
        <Text style={styles.shiftDate}>{shift.shift_date || shift.shiftDate || "—"}</Text>
        <Text style={styles.shiftName}>{shift.shift_name || shift.template_name || "—"}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <View style={[styles.typeBadge, { backgroundColor: color + "20" }]}>
          <Text style={[styles.typeText, { color }]}>{typeLabels[type] || type}</Text>
        </View>
        {(shift.start_time || shift.startTime) && (
          <Text style={styles.timeText}>
            {shift.start_time || shift.startTime} — {shift.end_time || shift.endTime || "—"}
          </Text>
        )}
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  shiftCard: {
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
  shiftTypeBar: { width: 4, height: 50, borderRadius: 2 },
  shiftInfo: { flex: 1 },
  empName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  shiftDate: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  shiftName: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  typeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  timeText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
