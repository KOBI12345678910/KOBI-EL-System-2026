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

interface Campaign {
  status: string;
}

function fmt(n: number | string | null | undefined): string {
  const num = Number(n || 0);
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function fmtNum(n: number | string | null | undefined): string {
  return new Intl.NumberFormat("he-IL").format(Number(n || 0));
}

export default function MarketingHubWrapper() {
  return (
    <AuthGuard>
      <MarketingHub />
    </AuthGuard>
  );
}

function MarketingHub() {
  const insets = useSafeAreaInsets();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats, isRefetching } = useQuery({
    queryKey: ["marketing-campaigns-stats"],
    queryFn: api.getMarketingCampaignStats,
  });

  const { data: campaigns, isLoading: campLoading, refetch: refetchCamp } = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: api.getMarketingCampaigns,
  });

  const isLoading = statsLoading || campLoading;

  const refetch = () => {
    refetchStats();
    refetchCamp();
  };

  const activeCampaigns = campaigns ? (campaigns as Campaign[]).filter((c) => c.status === "פעיל").length : 0;
  const totalLeads = Number(stats?.total_leads || 0);
  const totalConversions = Number(stats?.total_conversions || 0);
  const conversionRate = totalLeads > 0 ? ((totalConversions / totalLeads) * 100).toFixed(1) : "0";

  const kpis = [
    { label: "קמפיינים פעילים", value: String(activeCampaigns), icon: "target" as const, color: Colors.light.primary },
    { label: "הוצאות כוללות", value: fmt(stats?.total_spend), icon: "dollar-sign" as const, color: Colors.light.warning },
    { label: "לידים", value: fmtNum(stats?.total_leads), icon: "users" as const, color: Colors.light.info },
    { label: "המרות", value: fmtNum(stats?.total_conversions), icon: "trending-up" as const, color: Colors.light.success },
  ];

  const navItems: Array<{ label: string; icon: keyof typeof Feather.glyphMap; color: string; route: string }> = [
    { label: "קמפיינים", icon: "target", color: "#7B5EA7", route: "/marketing/campaigns" },
    { label: "אנליטיקה", icon: "bar-chart-2", color: Colors.light.success, route: "/marketing/analytics" },
    { label: "יומן תוכן", icon: "calendar", color: "#6366F1", route: "/marketing/content-calendar" },
    { label: "דיוור", icon: "mail", color: "#0D9488", route: "/marketing/email-campaigns" },
    { label: "רשתות חברתיות", icon: "share-2", color: "#EC4899", route: "/marketing/social-media" },
    { label: "תקציב", icon: "pie-chart", color: Colors.light.warning, route: "/marketing/budget" },
  ];

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>מרכז שיווק</Text>
        <View style={{ width: 32 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.light.primary}
            />
          }
        >
          <View style={styles.kpiGrid}>
            {kpis.map((kpi, i) => (
              <View key={i} style={styles.kpiCard}>
                <View style={[styles.kpiIcon, { backgroundColor: kpi.color + "18" }]}>
                  <Feather name={kpi.icon} size={18} color={kpi.color} />
                </View>
                <Text style={styles.kpiValue} numberOfLines={1}>{kpi.value}</Text>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>ניווט מהיר</Text>
          <View style={styles.navGrid}>
            {navItems.map((item, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.navCard, pressed && styles.pressed]}
                onPress={() => router.push(item.route as never)}
              >
                <View style={[styles.navIcon, { backgroundColor: item.color + "18" }]}>
                  <Feather name={item.icon} size={24} color={item.color} />
                </View>
                <Text style={styles.navLabel}>{item.label}</Text>
                <Feather name="chevron-left" size={14} color={Colors.light.textMuted} />
              </Pressable>
            ))}
          </View>

          {stats && (
            <View style={styles.statsCard}>
              <Text style={styles.sectionTitle}>סיכום ביצועים</Text>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>ROI ממוצע</Text>
                <Text style={[styles.statValue, { color: Colors.light.success }]}>{fmtNum(stats.avg_roi)}%</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>סה"כ קמפיינים</Text>
                <Text style={styles.statValue}>{fmtNum(stats.total)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>הוצאות כוללות</Text>
                <Text style={[styles.statValue, { color: Colors.light.warning }]}>{fmt(stats.total_spend)}</Text>
              </View>
              <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.statLabel}>שיעור המרה</Text>
                <Text style={[styles.statValue, { color: Colors.light.primary }]}>{conversionRate}%</Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  topTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
  },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  kpiCard: {
    width: "47%" as DimensionValue,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    alignItems: "flex-end",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    textAlign: "right",
  },
  kpiLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    textAlign: "right",
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 12,
  },
  navGrid: { gap: 8, marginBottom: 24 },
  navCard: {
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
  navIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  pressed: { opacity: 0.85 },
  statsCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  statLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  statValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
});
