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


export default function ProductionDashboardWrapper() {
  return (
    <AuthGuard>
      <ProductionDashboard />
    </AuthGuard>
  );
}

function ProductionDashboard() {
  const insets = useSafeAreaInsets();

  const { data: stats, isLoading: statsLoading, refetch, isRefetching } = useQuery({
    queryKey: ["work-order-stats"],
    queryFn: api.getWorkOrderStats,
  });

  const { data: workOrders } = useQuery({
    queryKey: ["work-orders", { limit: 5 }],
    queryFn: () => api.getWorkOrders({ limit: 5 }),
  });

  const recentOrders = Array.isArray(workOrders) ? workOrders.slice(0, 5) : [];

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>ייצור</Text>
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
        {statsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
          </View>
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <KPICard icon="tool" label="בתכנון" value={String(stats?.planned || 0)} color={Colors.light.info} />
              <KPICard icon="zap" label="בביצוע" value={String(stats?.in_progress || 0)} color={Colors.light.warning} />
              <KPICard icon="check-circle" label="הושלמו" value={String(stats?.completed || 0)} color={Colors.light.success} />
              <KPICard icon="layers" label="סה״כ" value={String(stats?.total || 0)} color={Colors.light.primary} />
            </View>

            <View style={styles.actionsSection}>
              <Text style={styles.sectionTitle}>ניהול</Text>
              <View style={styles.actionRow}>
                <ActionCard icon="tool" label="הזמנות עבודה" color="#1B4332" onPress={() => router.push("/production/work-orders")} />
                <ActionCard icon="check-square" label="בקרת איכות" color="#2D6A4F" onPress={() => router.push("/production/quality")} />
              </View>
              <View style={[styles.actionRow, { marginTop: 10 }]}>
                <ActionCard icon="clipboard" label="דיווח ייצור" color="#40916C" onPress={() => router.push("/field-ops/production-report")} />
                <ActionCard icon="maximize" label="סורק ברקוד" color="#52B788" onPress={() => router.push("/field-ops/scanner")} />
              </View>
            </View>

            {stats && Number(stats.total) > 0 && (
              <StatusDistributionChart stats={stats} />
            )}

            {recentOrders.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>הזמנות עבודה אחרונות</Text>
                  <Pressable onPress={() => router.push("/production/work-orders")}>
                    <Text style={styles.seeAll}>הכל</Text>
                  </Pressable>
                </View>
                {recentOrders.map((order: any) => (
                  <WorkOrderMiniRow key={order.id} order={order} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatusDistributionChart({ stats }: { stats: any }) {
  const total = Number(stats.total) || 1;
  const bars = [
    { label: "בתכנון", value: Number(stats.planned) || 0, color: Colors.light.info },
    { label: "בביצוע", value: Number(stats.in_progress) || 0, color: Colors.light.warning },
    { label: "בקרת\nאיכות", value: Number(stats.quality_check) || 0, color: Colors.light.primary },
    { label: "הושלם", value: Number(stats.completed) || 0, color: Colors.light.success },
    { label: "בהמתנה", value: Number(stats.on_hold) || 0, color: "#9B9B9B" },
  ].filter((b) => b.value > 0);

  if (bars.length === 0) return null;
  const maxVal = Math.max(...bars.map((b) => b.value));

  return (
    <View style={styles.chartSection}>
      <Text style={styles.sectionTitle}>התפלגות סטטוסים</Text>
      <View style={styles.chartCard}>
        <View style={styles.barsContainer}>
          {bars.map((bar) => {
            const fillFlex = bar.value / maxVal;
            return (
              <View key={bar.label} style={styles.barColumn}>
                <Text style={[styles.barValue, { color: bar.color }]}>{bar.value}</Text>
                <View style={styles.barTrack}>
                  <View style={{ flex: fillFlex, backgroundColor: bar.color, borderRadius: 6, minHeight: 4 }} />
                  <View style={{ flex: 1 - fillFlex }} />
                </View>
                <Text style={styles.barLabel}>{bar.label}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.chartFooter}>
          <Text style={styles.chartFooterText}>סה״כ {total} הזמנות עבודה</Text>
          {Number(stats.critical) > 0 && (
            <View style={styles.criticalBadge}>
              <Feather name="alert-triangle" size={12} color={Colors.light.danger} />
              <Text style={[styles.criticalText]}>{stats.critical} קריטיים</Text>
            </View>
          )}
        </View>
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

function WorkOrderMiniRow({ order }: { order: any }) {
  const statusColors: Record<string, string> = {
    draft: Colors.light.textMuted,
    planned: Colors.light.info,
    in_progress: Colors.light.warning,
    quality_check: Colors.light.primary,
    completed: Colors.light.success,
    cancelled: Colors.light.danger,
    on_hold: "#9B9B9B",
  };
  const statusLabels: Record<string, string> = {
    draft: "טיוטה",
    planned: "בתכנון",
    in_progress: "בביצוע",
    quality_check: "בקרת איכות",
    completed: "הושלם",
    cancelled: "בוטל",
    on_hold: "בהמתנה",
  };
  const status = order.status || "open";
  const color = statusColors[status] || Colors.light.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.miniRow, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/production/work-order/[id]", params: { id: String(order.id) } })}
    >
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <View style={styles.miniInfo}>
        <Text style={styles.miniTitle}>{order.order_number || `#${order.id}`}</Text>
        <Text style={styles.miniSub}>{order.title || order.product_name || "—"}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: color + "18" }]}>
        <Text style={[styles.statusText, { color }]}>{statusLabels[status] || status}</Text>
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  loadingContainer: { paddingTop: 80, alignItems: "center" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  kpiCard: {
    width: "47%" as DimensionValue,
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
  kpiValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
  kpiLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
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
  chartSection: { marginBottom: 24 },
  chartCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  barsContainer: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 8, marginBottom: 8 },
  barColumn: { flex: 1, alignItems: "center", height: "100%" as DimensionValue },
  barValue: { fontSize: 12, fontFamily: "Inter_700Bold", marginBottom: 4 },
  barTrack: { flex: 1, width: "100%" as DimensionValue, backgroundColor: "#F0F0F0", borderRadius: 6 },
  barLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginTop: 6, textAlign: "center" },
  chartFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.light.border },
  chartFooterText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  criticalBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  criticalText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.danger },
});
