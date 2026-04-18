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

export default function QualityWrapper() {
  return (
    <AuthGuard>
      <QualityScreen />
    </AuthGuard>
  );
}

function QualityScreen() {
  const insets = useSafeAreaInsets();

  const { data: stats } = useQuery({
    queryKey: ["quality-stats"],
    queryFn: api.getQualityStats,
  });

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["quality-inspections"],
    queryFn: () => api.getQualityInspections(),
  });

  const inspections = Array.isArray(data) ? data : [];

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>בקרת איכות</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={inspections}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListHeaderComponent={
            stats ? (
              <View style={styles.statsRow}>
                <StatCard label="עברו" value={String(stats.passed || 0)} color={Colors.light.success} />
                <StatCard label="נכשלו" value={String(stats.failed || 0)} color={Colors.light.danger} />
                <StatCard label="ממתינות" value={String(stats.pending || 0)} color={Colors.light.warning} />
              </View>
            ) : null
          }
          renderItem={({ item }) => <InspectionRow inspection={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="check-square" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין בדיקות איכות</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color, borderTopWidth: 3 }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InspectionRow({ inspection }: { inspection: any }) {
  const resultColors: Record<string, string> = {
    pass: Colors.light.success,
    fail: Colors.light.danger,
    pending: Colors.light.warning,
    conditional: Colors.light.info,
  };
  const resultLabels: Record<string, string> = { pass: "עבר", fail: "נכשל", pending: "ממתין", conditional: "מותנה" };
  const result = inspection.result || "pending";
  const color = resultColors[result] || Colors.light.textMuted;

  return (
    <View style={styles.inspectionCard}>
      <View style={[styles.resultBadge, { backgroundColor: color + "18" }]}>
        <Text style={[styles.resultText, { color }]}>{resultLabels[result] || result}</Text>
      </View>
      <View style={styles.inspectionInfo}>
        <Text style={styles.inspectionName}>{inspection.inspection_number || inspection.product_name || `#${inspection.id}`}</Text>
        <Text style={styles.inspectionDate}>{inspection.inspection_date || "—"}</Text>
        {inspection.inspector_name && (
          <Text style={styles.inspectorName}>בודק: {inspection.inspector_name}</Text>
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  listContent: { gap: 8 },
  inspectionCard: {
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
  resultBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, minWidth: 56, alignItems: "center" },
  resultText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  inspectionInfo: { flex: 1 },
  inspectionName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  inspectionDate: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  inspectorName: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
