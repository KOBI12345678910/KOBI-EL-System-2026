import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  type DimensionValue,
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
import { Circle, Path, Svg, Text as SvgText } from "react-native-svg";

interface BudgetItem {
  id?: number | string;
  budget_name?: string;
  channel?: string;
  status?: string;
  month?: string | number;
  year?: string | number;
  planned_budget?: number | string;
  actual_spend?: number | string;
  remaining?: number | string;
  roi?: number | string;
}

interface BudgetStats {
  total_budget?: number | string;
  total_spent?: number | string;
  total_remaining?: number | string;
  overall_roi?: number | string;
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

const PIE_COLORS = [
  Colors.light.primary,
  "#7B5EA7",
  Colors.light.success,
  Colors.light.warning,
  Colors.light.info,
  "#EC4899",
  "#0D9488",
  "#F59E0B",
];

export default function MarketingBudgetWrapper() {
  return (
    <AuthGuard>
      <MarketingBudgetScreen />
    </AuthGuard>
  );
}

function buildChannelBreakdown(items: BudgetItem[]) {
  const byChannel: Record<string, { channel: string; planned: number; spent: number }> = {};
  items.forEach((item) => {
    const ch = item.channel || "אחר";
    if (!byChannel[ch]) byChannel[ch] = { channel: ch, planned: 0, spent: 0 };
    byChannel[ch].planned += Number(item.planned_budget || 0);
    byChannel[ch].spent += Number(item.actual_spend || 0);
  });
  return Object.values(byChannel).sort((a, b) => b.planned - a.planned);
}

function PieChart({ data, total }: { data: { channel: string; planned: number }[]; total: number }) {
  if (total === 0 || data.length === 0) {
    return <Text style={pieStyles.empty}>אין נתוני הקצאה</Text>;
  }

  let cumulativeAngle = 0;
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 72;
  const innerR = 44;

  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
  };

  const slices = data.map((d, i) => {
    const pct = d.planned / total;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + pct * 360;
    cumulativeAngle = endAngle;
    let pathD: string;
    if (endAngle - startAngle >= 359.9) {
      const p1 = polarToCartesian(cx, cy, r, 0);
      const p2 = polarToCartesian(cx, cy, r, 180);
      pathD = `M ${p1.x} ${p1.y} A ${r} ${r} 0 1 0 ${p2.x} ${p2.y} A ${r} ${r} 0 1 0 ${p1.x} ${p1.y} Z`;
    } else {
      pathD = describeArc(cx, cy, r, startAngle, endAngle);
    }
    return { ...d, pct, color: PIE_COLORS[i % PIE_COLORS.length], pathD };
  });

  return (
    <View style={pieStyles.container}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => {
          if (s.pct < 0.005) return null;
          return <Path key={i} d={s.pathD} fill={s.color} stroke="#fff" strokeWidth={2} />;
        })}
        <Circle cx={cx} cy={cy} r={innerR} fill={Colors.light.background} />
        <SvgText x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill={Colors.light.textSecondary}>תקציב</SvgText>
        <SvgText x={cx} y={cy + 12} textAnchor="middle" fontSize={12} fontWeight="bold" fill={Colors.light.text}>{fmt(total)}</SvgText>
      </Svg>

      <View style={pieStyles.legend}>
        {slices.map((s, i) => (
          <View key={i} style={pieStyles.legendRow}>
            <View style={[pieStyles.legendDot, { backgroundColor: s.color }]} />
            <Text style={pieStyles.legendLabel} numberOfLines={1}>{s.channel}</Text>
            <Text style={pieStyles.legendPct}>{(s.pct * 100).toFixed(0)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const pieStyles = StyleSheet.create({
  container: { flexDirection: "row", gap: 16, alignItems: "center" },
  legend: { flex: 1, gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.text, textAlign: "right" },
  legendPct: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, width: 30, textAlign: "right" },
  empty: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "center", paddingVertical: 16 },
});

function MarketingBudgetScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const { data: items, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["marketing-budget"],
    queryFn: api.getMarketingBudget,
  });

  const { data: stats } = useQuery({
    queryKey: ["marketing-budget-stats"],
    queryFn: api.getMarketingBudgetStats,
  });

  const list: BudgetItem[] = (items as BudgetItem[] | null | undefined) || [];

  const filtered = useMemo(() => {
    return list.filter((item) => {
      return (
        !search ||
        (item.budget_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (item.channel || "").includes(search)
      );
    });
  }, [list, search]);

  const channelBreakdown = useMemo(() => buildChannelBreakdown(list), [list]);
  const maxPlanned = Math.max(...channelBreakdown.map((c) => c.planned), 1);

  const totalBudget = Number(stats?.total_budget || 0);
  const totalSpent = Number(stats?.total_spent || 0);
  const totalRemaining = Number(stats?.total_remaining || 0);
  const overallRoi = Number(stats?.overall_roi || 0);
  const utilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>תקציב שיווק</Text>
        <View style={{ width: 32 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListHeaderComponent={
            <>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>סיכום תקציב</Text>
                <View style={styles.summaryRow}>
                  <SummaryItem label="תקציב כולל" value={fmt(totalBudget)} color={Colors.light.info} />
                  <SummaryItem label="נוצל" value={fmt(totalSpent)} color={Colors.light.warning} />
                  <SummaryItem label="יתרה" value={fmt(totalRemaining)} color={Colors.light.success} />
                  <SummaryItem label="ROI" value={`${fmtNum(overallRoi)}%`} color={overallRoi >= 0 ? Colors.light.success : Colors.light.danger} />
                </View>
                <View style={styles.usageBarContainer}>
                  <View style={styles.usageBarLabels}>
                    <Text style={styles.usageLabel}>ניצול תקציב</Text>
                    <Text style={[styles.usageValue, { color: utilization > 90 ? Colors.light.danger : Colors.light.success }]}>
                      {utilization.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.usageBarTrack}>
                    <View
                      style={[
                        styles.usageBar,
                        {
                          width: `${Math.min(utilization, 100)}%` as DimensionValue,
                          backgroundColor: utilization > 90 ? Colors.light.danger : utilization > 70 ? Colors.light.warning : Colors.light.success,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>

              {channelBreakdown.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>הקצאת תקציב לפי ערוץ</Text>
                  <View style={styles.chartCard}>
                    <PieChart
                      data={channelBreakdown}
                      total={channelBreakdown.reduce((s, c) => s + c.planned, 0)}
                    />
                  </View>
                </View>
              )}

              {channelBreakdown.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>ביצוע בפועל לפי ערוץ</Text>
                  <View style={styles.chartCard}>
                    {channelBreakdown.map((ch, i) => {
                      const spentPct = ch.planned > 0 ? (ch.spent / ch.planned) * 100 : 0;
                      return (
                        <View key={i} style={styles.channelRow}>
                          <Text style={styles.channelName} numberOfLines={1}>{ch.channel}</Text>
                          <View style={styles.channelBars}>
                            <View style={styles.channelBarOuter}>
                              <View
                                style={[
                                  styles.channelBarInner,
                                  {
                                    width: `${(ch.planned / maxPlanned) * 100}%` as DimensionValue,
                                    backgroundColor: Colors.light.primary + "40",
                                  },
                                ]}
                              />
                              <View
                                style={[
                                  styles.channelBarInner,
                                  {
                                    position: "absolute",
                                    left: 0,
                                    width: `${(ch.spent / maxPlanned) * 100}%` as DimensionValue,
                                    backgroundColor: Colors.light.primary,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.channelPct}>{Math.round(spentPct)}%</Text>
                          </View>
                          <Text style={styles.channelValue}>{fmt(ch.spent)}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.searchWrapper}>
                <Feather name="search" size={18} color={Colors.light.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="חיפוש שורות תקציב..."
                  placeholderTextColor={Colors.light.textMuted}
                  textAlign="right"
                />
                {!!search && (
                  <Pressable onPress={() => setSearch("")} hitSlop={8}>
                    <Feather name="x" size={16} color={Colors.light.textMuted} />
                  </Pressable>
                )}
              </View>

              <Text style={styles.sectionTitle}>פירוט תקציב</Text>
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="pie-chart" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין נתוני תקציב</Text>
            </View>
          }
          renderItem={({ item }) => {
            const planned = Number(item.planned_budget || 0);
            const spent = Number(item.actual_spend || 0);
            const pct = planned > 0 ? (spent / planned) * 100 : 0;
            const remaining = Number(item.remaining || (planned - spent));
            const roi = Number(item.roi || 0);

            return (
              <View style={styles.budgetCard}>
                <View style={styles.budgetCardHeader}>
                  <View style={styles.budgetInfo}>
                    <Text style={styles.budgetName} numberOfLines={1}>{item.budget_name || "—"}</Text>
                    <View style={styles.budgetMeta}>
                      {item.channel && (
                        <View style={styles.channelTag}>
                          <Text style={styles.channelTagText}>{item.channel}</Text>
                        </View>
                      )}
                      {(item.month || item.year) && (
                        <Text style={styles.periodText}>{item.month} {item.year}</Text>
                      )}
                    </View>
                  </View>
                  {item.status && (
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: item.status === "פעיל" ? Colors.light.success + "18" : Colors.light.inputBg },
                    ]}>
                      <Text style={[
                        styles.statusText,
                        { color: item.status === "פעיל" ? Colors.light.success : Colors.light.textMuted },
                      ]}>
                        {item.status}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.budgetNumbers}>
                  <BudgetNum label="תקציב" value={fmt(planned)} color={Colors.light.info} />
                  <BudgetNum label="ביצוע" value={fmt(spent)} color={Colors.light.warning} />
                  <BudgetNum label="יתרה" value={fmt(remaining)} color={remaining >= 0 ? Colors.light.success : Colors.light.danger} />
                  <BudgetNum label="ROI" value={`${roi.toFixed(0)}%`} color={roi >= 0 ? Colors.light.success : Colors.light.danger} />
                </View>

                <View style={styles.progressContainer}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${Math.min(pct, 100)}%` as DimensionValue,
                          backgroundColor: pct > 100 ? Colors.light.danger : pct > 80 ? Colors.light.warning : Colors.light.success,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>{Math.round(pct)}%</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function BudgetNum({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.budgetNum}>
      <Text style={[styles.budgetNumValue, { color }]}>{value}</Text>
      <Text style={styles.budgetNumLabel}>{label}</Text>
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
  summaryCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginTop: 8,
  },
  summaryTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 12,
  },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  summaryItem: { flex: 1, alignItems: "center", gap: 3 },
  summaryValue: { fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "center" },
  summaryLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "center" },
  usageBarContainer: { gap: 6 },
  usageBarLabels: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  usageLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  usageValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  usageBarTrack: {
    height: 12,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 6,
    overflow: "hidden",
  },
  usageBar: { height: "100%" as DimensionValue, borderRadius: 6 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 12,
  },
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
  channelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  channelName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    width: 64,
    textAlign: "right",
  },
  channelBars: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  channelBarOuter: {
    flex: 1,
    height: 12,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 6,
    overflow: "hidden",
    position: "relative",
  },
  channelBarInner: { height: "100%" as DimensionValue, borderRadius: 6 },
  channelPct: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, width: 30, textAlign: "right" },
  channelValue: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.text, width: 68, textAlign: "right" },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  budgetCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  budgetCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  budgetInfo: { flex: 1 },
  budgetName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right", marginBottom: 4 },
  budgetMeta: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "flex-end" },
  channelTag: {
    backgroundColor: Colors.light.primary + "18",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  channelTagText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  periodText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  budgetNumbers: { flexDirection: "row", gap: 6, marginBottom: 12 },
  budgetNum: {
    flex: 1,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
    gap: 2,
  },
  budgetNumValue: { fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "center" },
  budgetNumLabel: { fontSize: 9, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  progressContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: { height: "100%" as DimensionValue, borderRadius: 4 },
  progressText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, width: 32, textAlign: "right" },
});
