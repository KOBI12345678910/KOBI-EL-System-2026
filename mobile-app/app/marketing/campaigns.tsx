import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

function fmtNum(n: number | string | null | undefined): string {
  return new Intl.NumberFormat("he-IL").format(Number(n || 0));
}

export default function CampaignsScreenWrapper() {
  return (
    <AuthGuard>
      <CampaignsScreen />
    </AuthGuard>
  );
}

function CampaignsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);

  const { data: campaigns, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: api.getMarketingCampaigns,
  });

  const { data: stats } = useQuery({
    queryKey: ["marketing-campaigns-stats"],
    queryFn: api.getMarketingCampaignStats,
  });

  const items: any[] = campaigns || [];

  const filtered = items.filter((c) => {
    const term = search.toLowerCase();
    const matchSearch = !term ||
      (c.campaign_name || "").toLowerCase().includes(term) ||
      (c.channel || "").toLowerCase().includes(term) ||
      (c.manager || "").toLowerCase().includes(term);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statuses = ["all", "פעיל", "מושהה", "הסתיים", "טיוטה"];

  const channelIcon: Record<string, keyof typeof Feather.glyphMap> = {
    "פייסבוק": "facebook",
    "אינסטגרם": "instagram",
    "גוגל": "search",
    "לינקדאין": "linkedin",
    "אימייל": "mail",
    "SMS": "message-square",
    "יוטיוב": "youtube",
    "טיקטוק": "video",
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>קמפיינים שיווקיים</Text>
        <View style={{ width: 32 }} />
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{fmtNum(stats.active)}</Text>
            <Text style={styles.statLabel}>פעילים</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.success }]}>{fmtNum(stats.avg_roi)}%</Text>
            <Text style={styles.statLabel}>ROI ממוצע</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.primary }]}>{fmt(stats.total_spend)}</Text>
            <Text style={styles.statLabel}>הוצאות</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.warning }]}>{fmtNum(stats.total_leads)}</Text>
            <Text style={styles.statLabel}>לידים</Text>
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
          returnKeyType="search"
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
          renderItem={({ item }) => (
            <CampaignCard
              campaign={item}
              channelIcon={channelIcon}
              onPress={() => setSelectedCampaign(item)}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.light.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="target" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין קמפיינים</Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={styles.countText}>{filtered.length} קמפיינים</Text>
          }
        />
      )}

      {selectedCampaign && (
        <CampaignDetailModal
          campaign={selectedCampaign}
          channelIcon={channelIcon}
          onClose={() => setSelectedCampaign(null)}
        />
      )}
    </View>
  );
}

function CampaignCard({
  campaign,
  channelIcon,
  onPress,
}: {
  campaign: any;
  channelIcon: Record<string, keyof typeof Feather.glyphMap>;
  onPress: () => void;
}) {
  const statusColor =
    campaign.status === "פעיל" ? Colors.light.success :
    campaign.status === "מושהה" ? Colors.light.warning :
    campaign.status === "הסתיים" ? Colors.light.textMuted :
    Colors.light.info;

  const icon: keyof typeof Feather.glyphMap = channelIcon[campaign.channel] || "megaphone";
  const roi = Number(campaign.roi || 0);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{campaign.status || ""}</Text>
        </View>
        <View style={styles.channelBadge}>
          <Feather name={icon} size={13} color="#7B5EA7" />
          <Text style={styles.channelText}>{campaign.channel || "—"}</Text>
        </View>
      </View>

      <Text style={styles.campaignName} numberOfLines={1}>{campaign.campaign_name || `קמפיין #${campaign.id}`}</Text>

      {campaign.description && (
        <Text style={styles.description} numberOfLines={2}>{campaign.description}</Text>
      )}

      <View style={styles.metricsRow}>
        <MetricBox label="תקציב" value={fmt(campaign.budget)} />
        <MetricBox label="הוצאה" value={fmt(campaign.actual_spend)} />
        <MetricBox label="לידים" value={fmtNum(campaign.leads_count)} />
        <MetricBox label="ROI" value={`${roi}%`} valueColor={roi > 0 ? Colors.light.success : Colors.light.danger} />
      </View>

      {(campaign.start_date || campaign.end_date) && (
        <View style={styles.cardFooter}>
          <View style={styles.dateRow}>
            <Feather name="calendar" size={12} color={Colors.light.textMuted} />
            <Text style={styles.dateText}>
              {campaign.start_date ? new Date(campaign.start_date).toLocaleDateString("he-IL") : ""}{" "}
              {campaign.end_date ? `— ${new Date(campaign.end_date).toLocaleDateString("he-IL")}` : ""}
            </Text>
          </View>
          <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
        </View>
      )}
    </Pressable>
  );
}

function CampaignDetailModal({
  campaign,
  channelIcon,
  onClose,
}: {
  campaign: any;
  channelIcon: Record<string, keyof typeof Feather.glyphMap>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const statusColor =
    campaign.status === "פעיל" ? Colors.light.success :
    campaign.status === "מושהה" ? Colors.light.warning :
    campaign.status === "הסתיים" ? Colors.light.textMuted :
    Colors.light.info;

  const icon: keyof typeof Feather.glyphMap = channelIcon[campaign.channel] || "megaphone";
  const roi = Number(campaign.roi || 0);
  const budgetPct = campaign.budget > 0
    ? Math.min((Number(campaign.actual_spend || 0) / Number(campaign.budget)) * 100, 100)
    : 0;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.detailModal, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.detailHeader}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Feather name="x" size={22} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.detailTitle} numberOfLines={1}>
            {campaign.campaign_name || `קמפיין #${campaign.id}`}
          </Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.detailHero}>
            <View style={[styles.detailChannelIcon, { backgroundColor: "#7B5EA718" }]}>
              <Feather name={icon} size={28} color="#7B5EA7" />
            </View>
            <View style={styles.detailHeroInfo}>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + "18", alignSelf: "flex-end" }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>{campaign.status || ""}</Text>
              </View>
              <Text style={styles.detailChannel}>{campaign.channel || ""}</Text>
              {campaign.manager && (
                <Text style={styles.detailManager}>
                  <Feather name="user" size={12} /> {campaign.manager}
                </Text>
              )}
            </View>
          </View>

          {campaign.description && (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>תיאור</Text>
              <Text style={styles.detailDescription}>{campaign.description}</Text>
            </View>
          )}

          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>מדדי ביצוע</Text>
            <View style={styles.kpiRow}>
              <KPIBadge label="תקציב" value={fmt(campaign.budget)} color={Colors.light.primary} />
              <KPIBadge label="הוצאה בפועל" value={fmt(campaign.actual_spend)} color={Colors.light.warning} />
              <KPIBadge label="לידים" value={fmtNum(campaign.leads_count)} color={Colors.light.info} />
              <KPIBadge
                label="ROI"
                value={`${roi}%`}
                color={roi >= 0 ? Colors.light.success : Colors.light.danger}
              />
            </View>
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>ניצול תקציב</Text>
            <View style={styles.budgetCard}>
              <View style={styles.budgetBarTrack}>
                <View
                  style={[
                    styles.budgetBar,
                    {
                      width: `${budgetPct}%` as any,
                      backgroundColor: budgetPct > 90 ? Colors.light.danger : Colors.light.primary,
                    },
                  ]}
                />
              </View>
              <View style={styles.budgetLabels}>
                <Text style={styles.budgetLabel}>{fmt(campaign.actual_spend)} הוצא</Text>
                <Text style={styles.budgetLabel}>{Math.round(budgetPct)}% נוצל</Text>
                <Text style={styles.budgetLabel}>{fmt(campaign.budget)} תקציב</Text>
              </View>
            </View>
          </View>

          {(campaign.start_date || campaign.end_date) && (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>תאריכים</Text>
              <View style={styles.datesCard}>
                {campaign.start_date && (
                  <View style={styles.dateItem}>
                    <Text style={styles.dateItemLabel}>תחילה</Text>
                    <Text style={styles.dateItemValue}>
                      {new Date(campaign.start_date).toLocaleDateString("he-IL")}
                    </Text>
                  </View>
                )}
                {campaign.end_date && (
                  <View style={styles.dateItem}>
                    <Text style={styles.dateItemLabel}>סיום</Text>
                    <Text style={styles.dateItemValue}>
                      {new Date(campaign.end_date).toLocaleDateString("he-IL")}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {(campaign.clicks_count != null || campaign.impressions_count != null || campaign.conversion_rate != null) && (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>נתוני מדיה</Text>
              <View style={styles.kpiRow}>
                {campaign.impressions_count != null && (
                  <KPIBadge label="חשיפות" value={fmtNum(campaign.impressions_count)} color="#9B5DE5" />
                )}
                {campaign.clicks_count != null && (
                  <KPIBadge label="קליקים" value={fmtNum(campaign.clicks_count)} color={Colors.light.info} />
                )}
                {campaign.conversion_rate != null && (
                  <KPIBadge label="המרה" value={`${campaign.conversion_rate}%`} color={Colors.light.success} />
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function KPIBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.kpiBadge, { backgroundColor: color + "12" }]}>
      <Text style={[styles.kpiBadgeValue, { color }]}>{value}</Text>
      <Text style={styles.kpiBadgeLabel}>{label}</Text>
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
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
  },
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
  statValue: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
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
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  statusFilters: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.light.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  chipActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  chipTextActive: { color: "#fff" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, gap: 10 },
  countText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
    marginBottom: 8,
  },
  card: {
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
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  channelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#7B5EA718",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  channelText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#7B5EA7" },
  campaignName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "right",
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 12,
    padding: 12,
  },
  metricBox: { flex: 1, alignItems: "center", gap: 2 },
  metricValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    textAlign: "center",
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "center",
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  detailModal: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 20,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  detailTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
  },
  detailScroll: { flex: 1 },
  detailHero: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
    alignItems: "flex-start",
  },
  detailChannelIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  detailHeroInfo: { flex: 1, gap: 6 },
  detailChannel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#7B5EA7",
    textAlign: "right",
  },
  detailManager: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  detailSection: { marginBottom: 20 },
  detailSectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 10,
  },
  detailDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "right",
    lineHeight: 22,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
  },
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiBadge: {
    flex: 1,
    minWidth: 70,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  kpiBadgeValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  kpiBadgeLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "center",
  },
  budgetCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  budgetBarTrack: {
    height: 16,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 8,
    overflow: "hidden",
  },
  budgetBar: { height: "100%" as any, borderRadius: 8 },
  budgetLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  budgetLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
  },
  datesCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
  },
  dateItem: { flex: 1, alignItems: "center", gap: 4 },
  dateItemLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
  },
  dateItemValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
});
