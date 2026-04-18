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

export default function LeadsScreenWrapper() {
  return (
    <AuthGuard>
      <LeadsScreen />
    </AuthGuard>
  );
}

function LeadsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"leads" | "opportunities">("leads");

  const { data: leadsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["crm-leads"],
    queryFn: api.getCrmLeads,
  });

  const { data: slugMap } = useQuery({
    queryKey: ["entity-slug-map"],
    queryFn: api.getEntitySlugMap,
    staleTime: 5 * 60 * 1000,
  });

  const leads: any[] = Array.isArray(leadsData)
    ? leadsData
    : (leadsData?.leads || []);

  const stats = leadsData?.stats || {};

  const leadsEntityId = slugMap?.["leads"] || null;
  const opportunitiesEntityId = slugMap?.["opportunities"] || slugMap?.["crm-opportunities"] || null;

  const { data: opportunitiesData, isLoading: opLoading } = useQuery({
    queryKey: ["crm-opportunities", opportunitiesEntityId],
    queryFn: () => opportunitiesEntityId
      ? api.getEntityRecords(opportunitiesEntityId, { limit: 100 })
      : Promise.resolve({ records: [] }),
    enabled: !!opportunitiesEntityId && activeTab === "opportunities",
  });

  const opportunities: any[] = opportunitiesData?.records || (Array.isArray(opportunitiesData) ? opportunitiesData : []);

  const currentItems = activeTab === "leads" ? leads : opportunities;
  const currentEntityId = activeTab === "leads" ? leadsEntityId : opportunitiesEntityId;

  const filtered = currentItems.filter((item) => {
    const data = item.data || {};
    const term = search.toLowerCase();
    const matchSearch = !term ||
      (data.name || "").toLowerCase().includes(term) ||
      (data.fullName || "").toLowerCase().includes(term) ||
      (data.email || "").toLowerCase().includes(term) ||
      (data.company || "").toLowerCase().includes(term) ||
      (data.company_name || "").toLowerCase().includes(term);
    const matchStatus = statusFilter === "all" || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statuses = ["all", "new", "open", "active", "qualified", "converted", "lost", "closed"];
  const statusLabels: Record<string, string> = {
    all: "הכל",
    new: "חדש",
    open: "פתוח",
    active: "פעיל",
    qualified: "מוסמך",
    converted: "הומר",
    lost: "אבוד",
    closed: "סגור",
  };

  const loading = activeTab === "leads" ? isLoading : opLoading;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>לידים והזדמנויות</Text>
        <View style={{ width: 32 }} />
      </View>

      {activeTab === "leads" && stats.total != null && (
        <View style={styles.statsRow}>
          <StatChip label="סה״כ" value={stats.total} color={Colors.light.primary} />
          <StatChip label="חדשים" value={stats.new_leads} color={Colors.light.info} />
          <StatChip label="מוסמכים" value={stats.qualified} color={Colors.light.warning} />
          <StatChip label="הומרו" value={stats.converted} color={Colors.light.success} />
        </View>
      )}

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === "leads" && styles.tabActive]}
          onPress={() => setActiveTab("leads")}
        >
          <Text style={[styles.tabText, activeTab === "leads" && styles.tabTextActive]}>
            לידים
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "opportunities" && styles.tabActive]}
          onPress={() => setActiveTab("opportunities")}
        >
          <Text style={[styles.tabText, activeTab === "opportunities" && styles.tabTextActive]}>
            הזדמנויות
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={activeTab === "leads" ? "חיפוש לידים..." : "חיפוש הזדמנויות..."}
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
              {statusLabels[s]}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <LeadCard
              item={item}
              entityId={currentEntityId}
              isOpportunity={activeTab === "opportunities"}
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
              <Feather name={activeTab === "leads" ? "user-x" : "briefcase"} size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>
                {activeTab === "leads" ? "אין לידים" : "אין הזדמנויות"}
              </Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={styles.countText}>{filtered.length} פריטים</Text>
          }
        />
      )}
    </View>
  );
}

function StatChip({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={[styles.statChip, { backgroundColor: color + "15" }]}>
      <Text style={[styles.statValue, { color }]}>{value || 0}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LeadCard({
  item,
  entityId,
  isOpportunity,
}: {
  item: any;
  entityId: number | null;
  isOpportunity: boolean;
}) {
  const data = item.data || {};
  const name = data.name || data.fullName || data.title || `${isOpportunity ? "הזדמנות" : "ליד"} #${item.id}`;
  const email = data.email || "";
  const company = data.company || data.company_name || data.organization || "";
  const score = data.lead_score || data.score;
  const value = data.value || data.estimated_value || data.deal_value;

  const statusColor =
    item.status === "active" || item.status === "פעיל" ? Colors.light.success :
    item.status === "converted" ? Colors.light.primary :
    item.status === "qualified" ? Colors.light.info :
    item.status === "lost" || item.status === "closed" ? Colors.light.textMuted :
    Colors.light.warning;

  const statusLabel: Record<string, string> = {
    open: "פתוח",
    active: "פעיל",
    closed: "סגור",
    converted: "הומר",
    draft: "טיוטה",
    new: "חדש",
    qualified: "מוסמך",
    lost: "אבוד",
  };

  const handlePress = () => {
    if (!entityId) return;
    router.push({
      pathname: "/record/[entityId]/[id]",
      params: { entityId: String(entityId), id: String(item.id) },
    });
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={handlePress}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel[item.status] || item.status || ""}
          </Text>
        </View>
        {score != null && (
          <View style={styles.scoreBadge}>
            <Feather name="star" size={11} color="#E07A5F" />
            <Text style={styles.scoreText}>{score}</Text>
          </View>
        )}
      </View>

      <Text style={styles.leadName} numberOfLines={1}>{name}</Text>
      {!!company && (
        <Text style={styles.leadMeta} numberOfLines={1}>
          <Feather name="briefcase" size={11} color={Colors.light.textMuted} /> {company}
        </Text>
      )}
      {!!email && (
        <Text style={styles.leadMeta} numberOfLines={1}>
          <Feather name="mail" size={11} color={Colors.light.textMuted} /> {email}
        </Text>
      )}
      {value != null && Number(value) > 0 && (
        <View style={styles.valueRow}>
          <Feather name="dollar-sign" size={13} color={Colors.light.success} />
          <Text style={styles.valueText}>
            {new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(value))}
          </Text>
        </View>
      )}

      {entityId && (
        <View style={styles.cardFooter}>
          <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
        </View>
      )}
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
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
  },
  statChip: {
    flex: 1,
    borderRadius: 12,
    padding: 8,
    alignItems: "center",
    gap: 2,
  },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  tabActive: {
    backgroundColor: Colors.light.surfaceCard,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  tabTextActive: { color: Colors.light.primary, fontFamily: "Inter_600SemiBold" },
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
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
  scoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#E07A5F18",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scoreText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#E07A5F" },
  leadName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  leadMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    justifyContent: "flex-end",
  },
  valueText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.success,
  },
  cardFooter: { flexDirection: "row", justifyContent: "flex-start", alignItems: "center", marginTop: 2 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
