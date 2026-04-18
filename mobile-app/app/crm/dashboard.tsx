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

function fmt(n: number | string | null | undefined): string {
  const num = Number(n || 0);
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function fmtShort(n: number | string | null | undefined): string {
  const num = Number(n || 0);
  if (num >= 1000000) return `₪${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `₪${(num / 1000).toFixed(0)}K`;
  return `₪${num.toFixed(0)}`;
}

export default function CRMDashboardWrapper() {
  return (
    <AuthGuard>
      <CRMDashboard />
    </AuthGuard>
  );
}

function CRMDashboard() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["crm-dashboard"],
    queryFn: api.getCrmDashboard,
  });

  const totalCustomers = data?.totalCustomers || 0;
  const quotesStats = data?.quotesStats || {};
  const invoiceStats = data?.invoiceStats || {};
  const recentCustomers: any[] = data?.recentCustomers || [];
  const topCustomers: any[] = data?.topCustomersByValue || [];
  const funnel: any = data?.conversionFunnel || {};

  const openLeads = totalCustomers;
  const totalQuotes = Number(funnel.total_quotes || 0);
  const approvedQuotes = Number(funnel.approved_quotes || 0);
  const pipelineValue = Number(quotesStats.total_value || 0);
  const totalInvoices = Number(funnel.total_invoices || 0);

  const funnelStages = [
    { label: "לקוחות", value: Number(funnel.total_leads || totalCustomers || 0), color: Colors.light.info },
    { label: "הצעות", value: totalQuotes, color: Colors.light.primary },
    { label: "מאושרות", value: approvedQuotes, color: Colors.light.warning },
    { label: "חשבוניות", value: totalInvoices, color: Colors.light.success },
  ];
  const maxFunnel = Math.max(...funnelStages.map((s) => s.value), 1);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>דשבורד CRM</Text>
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
            <KPICard
              label="לקוחות"
              value={String(totalCustomers)}
              icon="users"
              color={Colors.light.primary}
              onPress={() => router.push("/crm/customers")}
            />
            <KPICard
              label="הצעות"
              value={String(totalQuotes)}
              icon="file-text"
              color={Colors.light.info}
              onPress={() => router.push("/crm/quotes")}
            />
            <KPICard
              label="שווי צינור"
              value={fmtShort(pipelineValue)}
              icon="trending-up"
              color={Colors.light.success}
              onPress={() => router.push("/crm/quotes")}
            />
            <KPICard
              label="חשבוניות"
              value={String(totalInvoices)}
              icon="bar-chart-2"
              color={Colors.light.warning}
              onPress={() => router.push("/crm/customers")}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>משפך מכירות</Text>
            <View style={styles.chartCard}>
              {funnelStages.map((stage, i) => (
                <View key={i} style={styles.funnelRow}>
                  <Text style={styles.funnelLabel}>{stage.label}</Text>
                  <View style={styles.funnelBarTrack}>
                    <View
                      style={[
                        styles.funnelBar,
                        {
                          width: `${Math.max((stage.value / maxFunnel) * 100, 4)}%` as any,
                          backgroundColor: stage.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.funnelValue, { color: stage.color }]}>
                    {stage.value}
                  </Text>
                </View>
              ))}
              {Number(funnel.total_leads || 0) > 0 && approvedQuotes > 0 && (
                <View style={styles.conversionRate}>
                  <Text style={styles.conversionLabel}>שיעור המרה (הצעות מאושרות)</Text>
                  <Text style={styles.conversionValue}>
                    {Math.round((approvedQuotes / Number(funnel.total_leads)) * 100)}%
                  </Text>
                </View>
              )}
            </View>
          </View>

          {topCustomers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>לקוחות מובילים</Text>
              <View style={styles.chartCard}>
                {topCustomers.slice(0, 5).map((cust: any, i: number) => {
                  const custName = cust.name || cust.data?.name || cust.data?.fullName || `לקוח #${cust.id}`;
                  const custVal = Number(cust.lifetime_value || cust.total_revenue || cust.value || 0);
                  const maxVal = Number(topCustomers[0]?.lifetime_value || topCustomers[0]?.total_revenue || topCustomers[0]?.value || 1);
                  const barPct = Math.max((custVal / maxVal) * 100, 4);
                  return (
                    <View key={cust.id || i} style={styles.topCustRow}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>{i + 1}</Text>
                      </View>
                      <View style={styles.topCustInfo}>
                        <Text style={styles.topCustName} numberOfLines={1}>{custName}</Text>
                        <View style={styles.topCustBarTrack}>
                          <View
                            style={[
                              styles.topCustBar,
                              { width: `${barPct}%` as any, backgroundColor: Colors.light.primary },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={styles.topCustValue}>{fmtShort(custVal)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.quickActions}>
            <Text style={styles.sectionTitle}>ניווט מהיר</Text>
            <View style={styles.actionRow}>
              <NavAction icon="users" label="לקוחות" onPress={() => router.push("/crm/customers")} color={Colors.light.primary} />
              <NavAction icon="user-check" label="לידים" onPress={() => router.push("/crm/leads")} color={Colors.light.info} />
              <NavAction icon="file-text" label="הצעות" onPress={() => router.push("/crm/quotes")} color={Colors.light.warning} />
            </View>
            <View style={[styles.actionRow, { marginTop: 10 }]}>
              <NavAction icon="map-pin" label="ביקורי שטח" onPress={() => router.push("/field-ops/crm-visits")} color={Colors.light.accent} />
              <NavAction icon="map" label="מעקב GPS" onPress={() => router.push("/field-ops/gps-tracking")} color={Colors.light.success} />
              <NavAction icon="maximize" label="סורק" onPress={() => router.push("/field-ops/scanner")} color={Colors.light.primaryLight} />
            </View>
          </View>

          {recentCustomers.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>לקוחות אחרונים</Text>
                <Pressable onPress={() => router.push("/crm/customers")} hitSlop={8}>
                  <Text style={styles.seeAll}>הכל</Text>
                </Pressable>
              </View>
              {recentCustomers.slice(0, 5).map((cust: any) => {
                const d = cust.data || {};
                const name = d.name || d.fullName || d.company || `לקוח #${cust.id}`;
                const email = d.email || "";
                return (
                  <Pressable
                    key={cust.id}
                    style={({ pressed }) => [styles.custRow, pressed && styles.pressed]}
                    onPress={() => router.push("/crm/customers")}
                  >
                    <View style={styles.custAvatar}>
                      <Text style={styles.custAvatarText}>{name[0] || "?"}</Text>
                    </View>
                    <View style={styles.custInfo}>
                      <Text style={styles.custName} numberOfLines={1}>{name}</Text>
                      {!!email && <Text style={styles.custEmail} numberOfLines={1}>{email}</Text>}
                    </View>
                    <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function KPICard({
  label,
  value,
  icon,
  color,
  onPress,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.kpiCard, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={[styles.kpiIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </Pressable>
  );
}

function NavAction({
  icon,
  label,
  onPress,
  color,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={[styles.navIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={22} color={color} />
      </View>
      <Text style={styles.navLabel}>{label}</Text>
    </Pressable>
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
    width: "47%" as any,
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
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    textAlign: "right",
  },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 12,
  },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.accent },
  chartCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  funnelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  funnelLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    width: 52,
    textAlign: "right",
  },
  funnelBarTrack: {
    flex: 1,
    height: 14,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 7,
    overflow: "hidden",
  },
  funnelBar: { height: "100%" as any, borderRadius: 7 },
  funnelValue: { fontSize: 13, fontFamily: "Inter_700Bold", width: 32, textAlign: "right" },
  conversionRate: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingTop: 12,
    marginTop: 4,
  },
  conversionLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  conversionValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.success,
  },
  topCustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.light.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.light.primary },
  topCustInfo: { flex: 1 },
  topCustName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 4,
  },
  topCustBarTrack: {
    height: 6,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 3,
    overflow: "hidden",
  },
  topCustBar: { height: "100%" as any, borderRadius: 3 },
  topCustValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.primary,
    width: 48,
    textAlign: "right",
  },
  quickActions: { marginBottom: 24 },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  navBtn: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 8,
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
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
    textAlign: "center",
  },
  custRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  custAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  custAvatarText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.light.primary,
  },
  custInfo: { flex: 1 },
  custName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  custEmail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
