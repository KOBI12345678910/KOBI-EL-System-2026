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

interface MarketingCampaign {
  channel?: string;
  actual_spend?: number | string;
  leads_count?: number | string;
  conversions?: number | string;
  impressions_count?: number | string;
  clicks_count?: number | string;
  roi?: number | string;
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

function buildChannelData(campaigns: MarketingCampaign[]) {
  const byChannel: Record<string, {
    channel: string;
    spend: number;
    leads: number;
    conversions: number;
    impressions: number;
    clicks: number;
    roi: number;
    count: number;
  }> = {};
  campaigns.forEach((c) => {
    const ch = c.channel || "אחר";
    if (!byChannel[ch]) byChannel[ch] = { channel: ch, spend: 0, leads: 0, conversions: 0, impressions: 0, clicks: 0, roi: 0, count: 0 };
    byChannel[ch].spend += Number(c.actual_spend || 0);
    byChannel[ch].leads += Number(c.leads_count || 0);
    byChannel[ch].conversions += Number(c.conversions || 0);
    byChannel[ch].impressions += Number(c.impressions_count || 0);
    byChannel[ch].clicks += Number(c.clicks_count || 0);
    byChannel[ch].roi += Number(c.roi || 0);
    byChannel[ch].count++;
  });
  return Object.values(byChannel).sort((a, b) => b.spend - a.spend).map((ch) => ({
    ...ch,
    avgRoi: ch.count > 0 ? ch.roi / ch.count : 0,
    ctr: ch.impressions > 0 ? (ch.clicks / ch.impressions) * 100 : 0,
    convRate: ch.leads > 0 ? (ch.conversions / ch.leads) * 100 : 0,
  }));
}

export default function MarketingAnalyticsWrapper() {
  return (
    <AuthGuard>
      <MarketingAnalytics />
    </AuthGuard>
  );
}

function MarketingAnalytics() {
  const insets = useSafeAreaInsets();

  const { data: campaigns, isLoading: campLoading, refetch: refetchCamp, isRefetching } = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: api.getMarketingCampaigns,
  });

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["marketing-campaigns-stats"],
    queryFn: api.getMarketingCampaignStats,
  });

  const isLoading = campLoading || statsLoading;
  const refetch = () => { refetchCamp(); refetchStats(); };

  const campaignList: MarketingCampaign[] = (campaigns as MarketingCampaign[] | null | undefined) || [];
  const channelData = buildChannelData(campaignList);

  const totalLeads = Number(stats?.total_leads || 0);
  const totalConversions = Number(stats?.total_conversions || 0);
  const totalSpend = Number(stats?.total_spend || 0);
  const avgRoi = Number(stats?.avg_roi || 0);
  const totalImpressions = campaignList.reduce((s, c) => s + Number(c.impressions_count || 0), 0);
  const totalClicks = campaignList.reduce((s, c) => s + Number(c.clicks_count || 0), 0);

  const costPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const convRate = totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0;
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  const kpis = [
    { label: "ROI ממוצע", value: `${fmtNum(avgRoi)}%`, color: Colors.light.success, icon: "trending-up" as const },
    { label: "עלות-ליד", value: fmt(costPerLead), color: Colors.light.info, icon: "dollar-sign" as const },
    { label: "שיעור המרה", value: `${convRate.toFixed(1)}%`, color: "#7B5EA7", icon: "target" as const },
    { label: "CTR", value: `${ctr.toFixed(2)}%`, color: Colors.light.warning, icon: "mouse-pointer" as const },
  ];

  const maxSpend = Math.max(...channelData.map((c) => c.spend), 1);
  const maxImpressions = Math.max(...channelData.map((c) => c.impressions), 1);
  const maxClicks = Math.max(...channelData.map((c) => c.clicks), 1);
  const maxLeads = Math.max(...channelData.map((c) => c.leads), 1);

  const roiBarMax = Math.max(...channelData.map((c) => Math.abs(c.avgRoi)), 1);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>אנליטיקה שיווקית</Text>
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
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
        >
          <View style={styles.kpiRow}>
            {kpis.map((kpi, i) => (
              <View key={i} style={[styles.kpiCard, { borderLeftColor: kpi.color, borderLeftWidth: 3 }]}>
                <Feather name={kpi.icon} size={16} color={kpi.color} />
                <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>סיכום חשיפות וקליקים</Text>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { borderColor: "#7B5EA7" + "40" }]}>
                <Feather name="eye" size={20} color="#7B5EA7" />
                <Text style={[styles.summaryValue, { color: "#7B5EA7" }]}>{fmtNum(totalImpressions)}</Text>
                <Text style={styles.summaryLabel}>חשיפות כוללות</Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: Colors.light.info + "40" }]}>
                <Feather name="mouse-pointer" size={20} color={Colors.light.info} />
                <Text style={[styles.summaryValue, { color: Colors.light.info }]}>{fmtNum(totalClicks)}</Text>
                <Text style={styles.summaryLabel}>קליקים כוללים</Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: Colors.light.success + "40" }]}>
                <Feather name="users" size={20} color={Colors.light.success} />
                <Text style={[styles.summaryValue, { color: Colors.light.success }]}>{fmtNum(totalLeads)}</Text>
                <Text style={styles.summaryLabel}>לידים כוללים</Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: Colors.light.warning + "40" }]}>
                <Feather name="check-circle" size={20} color={Colors.light.warning} />
                <Text style={[styles.summaryValue, { color: Colors.light.warning }]}>{fmtNum(totalConversions)}</Text>
                <Text style={styles.summaryLabel}>המרות כוללות</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ROI לפי ערוץ</Text>
            <View style={styles.chartCard}>
              {channelData.length === 0 ? (
                <Text style={styles.emptyText}>אין נתונים</Text>
              ) : (
                channelData.map((ch, i) => {
                  const roi = ch.avgRoi;
                  const pct = Math.min((Math.abs(roi) / roiBarMax) * 100, 100);
                  const color = roi >= 0 ? Colors.light.success : Colors.light.danger;
                  return (
                    <View key={i} style={styles.barRow}>
                      <Text style={styles.barLabel} numberOfLines={1}>{ch.channel}</Text>
                      <View style={styles.roiBarContainer}>
                        <View style={styles.roiBarTrack}>
                          <View style={[styles.roiBar, { width: `${pct}%` as DimensionValue, backgroundColor: color }]} />
                        </View>
                        <Text style={[styles.roiValue, { color }]}>{roi.toFixed(1)}%</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>חשיפות לפי ערוץ</Text>
            <View style={styles.chartCard}>
              {channelData.length === 0 ? (
                <Text style={styles.emptyText}>אין נתונים</Text>
              ) : (
                channelData.map((ch, i) => (
                  <View key={i} style={styles.barRow}>
                    <Text style={styles.barLabel} numberOfLines={1}>{ch.channel}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            width: `${Math.max((ch.impressions / maxImpressions) * 100, 4)}%` as DimensionValue,
                            backgroundColor: "#7B5EA7",
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barValue, { color: "#7B5EA7" }]}>{fmtNum(ch.impressions)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>קליקים לפי ערוץ</Text>
            <View style={styles.chartCard}>
              {channelData.length === 0 ? (
                <Text style={styles.emptyText}>אין נתונים</Text>
              ) : (
                channelData.map((ch, i) => (
                  <View key={i} style={styles.barRow}>
                    <Text style={styles.barLabel} numberOfLines={1}>{ch.channel}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            width: `${Math.max((ch.clicks / maxClicks) * 100, 4)}%` as DimensionValue,
                            backgroundColor: Colors.light.info,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barValue, { color: Colors.light.info }]}>{fmtNum(ch.clicks)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>לידים לפי ערוץ</Text>
            <View style={styles.chartCard}>
              {channelData.length === 0 ? (
                <Text style={styles.emptyText}>אין נתונים</Text>
              ) : (
                channelData.map((ch, i) => (
                  <View key={i} style={styles.barRow}>
                    <Text style={styles.barLabel} numberOfLines={1}>{ch.channel}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            width: `${Math.max((ch.leads / maxLeads) * 100, 4)}%` as DimensionValue,
                            backgroundColor: Colors.light.success,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barValue, { color: Colors.light.success }]}>{fmtNum(ch.leads)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>פירוט ביצועי ערוצים</Text>
            <View style={styles.tableCard}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableCell, styles.tableCellHeader, { flex: 2 }]}>ערוץ</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader]}>חשיפות</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader]}>קליקים</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader]}>לידים</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader]}>המרות</Text>
              </View>
              {channelData.length === 0 ? (
                <Text style={styles.emptyText}>אין נתונים</Text>
              ) : (
                channelData.map((ch, i) => (
                  <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{ch.channel}</Text>
                    <Text style={[styles.tableCell, { color: "#7B5EA7" }]}>{fmtNum(ch.impressions)}</Text>
                    <Text style={[styles.tableCell, { color: Colors.light.info }]}>{fmtNum(ch.clicks)}</Text>
                    <Text style={[styles.tableCell, { color: Colors.light.success }]}>{fmtNum(ch.leads)}</Text>
                    <Text style={[styles.tableCell, { color: Colors.light.warning }]}>{fmtNum(ch.conversions)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
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
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  kpiCard: {
    width: "47%" as DimensionValue,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    alignItems: "flex-end",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiValue: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "right" },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  summarySection: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 12,
  },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryValue: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "center" },
  summaryLabel: { fontSize: 9, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "center" },
  section: { marginBottom: 20 },
  chartCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    width: 70,
    textAlign: "right",
  },
  barTrack: {
    flex: 1,
    height: 14,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 7,
    overflow: "hidden",
  },
  bar: { height: "100%" as DimensionValue, borderRadius: 7 },
  barValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    width: 60,
    textAlign: "right",
  },
  roiBarContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  roiBarTrack: {
    flex: 1,
    height: 14,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 7,
    overflow: "hidden",
  },
  roiBar: { height: "100%" as DimensionValue, borderRadius: 7 },
  roiValue: { fontSize: 12, fontFamily: "Inter_700Bold", width: 44, textAlign: "right" },
  tableCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  tableHeader: {
    backgroundColor: Colors.light.inputBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  tableRowAlt: { backgroundColor: Colors.light.inputBg + "60" },
  tableCell: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    textAlign: "right",
  },
  tableCellHeader: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    fontSize: 11,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "center",
    paddingVertical: 16,
  },
});
