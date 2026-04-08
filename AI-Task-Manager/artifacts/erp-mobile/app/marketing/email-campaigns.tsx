import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
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

interface EmailCampaign {
  id?: number | string;
  campaign_name?: string;
  status?: string;
  send_date?: string;
  recipients?: number | string;
  sent?: number | string;
  open_rate?: number | string;
  click_rate?: number | string;
  subject?: string;
  list_name?: string;
}

function fmtNum(n: number | string | null | undefined): string {
  return new Intl.NumberFormat("he-IL").format(Number(n || 0));
}

export default function EmailCampaignsWrapper() {
  return (
    <AuthGuard>
      <EmailCampaignsScreen />
    </AuthGuard>
  );
}

function EmailCampaignsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: items, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["marketing-email-campaigns"],
    queryFn: api.getMarketingEmailCampaigns,
  });

  const { data: stats } = useQuery({
    queryKey: ["marketing-email-stats"],
    queryFn: api.getMarketingEmailStats,
  });

  const list: EmailCampaign[] = (items as EmailCampaign[] | null | undefined) || [];

  const filtered = useMemo(() => {
    return list.filter((item) => {
      const matchStatus = statusFilter === "all" || item.status === statusFilter;
      const matchSearch =
        !search ||
        (item.campaign_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (item.subject || "").toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [list, search, statusFilter]);

  const statuses = ["all", "טיוטה", "מתוכנן", "נשלח", "פעיל", "הסתיים"];

  const statusColor = (s: string) => {
    if (s === "נשלח") return Colors.light.success;
    if (s === "טיוטה") return Colors.light.textMuted;
    if (s === "פעיל") return Colors.light.info;
    if (s === "הסתיים") return Colors.light.textMuted;
    return Colors.light.warning;
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>קמפיינים בדוא"ל</Text>
        <View style={{ width: 32 }} />
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.info }]}>{fmtNum(stats.sent_this_month)}</Text>
            <Text style={styles.statLabel}>נשלחו החודש</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.success }]}>{fmtNum(stats.avg_open_rate)}%</Text>
            <Text style={styles.statLabel}>שיעור פתיחה</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: "#7B5EA7" }]}>{fmtNum(stats.avg_click_rate)}%</Text>
            <Text style={styles.statLabel}>שיעור קליקים</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.warning }]}>{fmtNum(stats.total_subscribers)}</Text>
            <Text style={styles.statLabel}>מנויים</Text>
          </View>
        </View>
      )}

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש קמפיינים..."
          placeholderTextColor={Colors.light.textMuted}
          textAlign="right"
        />
        {!!search && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={16} color={Colors.light.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.statusFilters}>
        {statuses.map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, statusFilter === s && styles.chipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>
              {s === "all" ? "הכל" : s}
            </Text>
          </Pressable>
        ))}
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
            <Text style={styles.countText}>{filtered.length} קמפיינים</Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="mail" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין קמפיינים</Text>
            </View>
          }
          renderItem={({ item }) => {
            const sc = statusColor(item.status || "");
            const openRate = Number(item.open_rate || 0);
            const clickRate = Number(item.click_rate || 0);
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: sc + "18" }]}>
                    <View style={[styles.statusDot, { backgroundColor: sc }]} />
                    <Text style={[styles.statusText, { color: sc }]}>{item.status || "—"}</Text>
                  </View>
                  {item.send_date && (
                    <View style={styles.dateRow}>
                      <Feather name="calendar" size={11} color={Colors.light.textMuted} />
                      <Text style={styles.dateText}>{item.send_date}</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.campaignName} numberOfLines={1}>
                  {item.campaign_name || `קמפיין #${item.id}`}
                </Text>
                {item.subject && (
                  <Text style={styles.subject} numberOfLines={1}>{item.subject}</Text>
                )}

                <View style={styles.metricsRow}>
                  <MetricBox label="נמענים" value={fmtNum(item.recipients)} />
                  <MetricBox label="נשלחו" value={fmtNum(item.sent)} />
                  <MetricBox label="פתיחות" value={`${openRate.toFixed(1)}%`} valueColor={openRate > 20 ? Colors.light.success : Colors.light.warning} />
                  <MetricBox label="קליקים" value={`${clickRate.toFixed(1)}%`} valueColor={clickRate > 5 ? Colors.light.success : Colors.light.info} />
                </View>

                {item.list_name && (
                  <View style={styles.listRow}>
                    <Feather name="users" size={12} color={Colors.light.textMuted} />
                    <Text style={styles.listText}>{item.list_name}</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function MetricBox({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={[styles.metricValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
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
  statsRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.light.text },
  statLabel: { fontSize: 9, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "center" },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text },
  statusFilters: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.light.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  chipActive: { backgroundColor: "#0D9488", borderColor: "#0D9488" },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  chipTextActive: { color: "#fff" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  countText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textMuted, textAlign: "right", marginBottom: 10 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  card: {
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dateText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  campaignName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right", marginBottom: 2 },
  subject: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right", marginBottom: 10 },
  metricsRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  metricBox: {
    flex: 1,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
    gap: 2,
  },
  metricValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.light.text },
  metricLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  listRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  listText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
});
