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

interface SocialPost {
  id?: number | string;
  platform?: string;
  account_name?: string;
  followers?: number | string;
  followers_change?: number | string;
  posts?: number | string;
  engagement?: number | string;
  reach?: number | string;
  metric_date?: string;
}

function fmtNum(n: number | string | null | undefined): string {
  return new Intl.NumberFormat("he-IL").format(Number(n || 0));
}

const platformIcon: Record<string, keyof typeof Feather.glyphMap> = {
  "פייסבוק": "facebook",
  "אינסטגרם": "instagram",
  "לינקדאין": "linkedin",
  "יוטיוב": "youtube",
  "טיקטוק": "video",
  "טוויטר/X": "twitter",
};

const PLATFORM_COLORS: Record<string, string> = {
  "פייסבוק": "#1877F2",
  "אינסטגרם": "#E1306C",
  "לינקדאין": "#0A66C2",
  "יוטיוב": "#FF0000",
  "טיקטוק": "#010101",
  "טוויטר/X": "#1DA1F2",
};

export default function SocialMediaWrapper() {
  return (
    <AuthGuard>
      <SocialMediaScreen />
    </AuthGuard>
  );
}

function SocialMediaScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");

  const { data: items, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["marketing-social-media"],
    queryFn: api.getMarketingSocialMedia,
  });

  const { data: stats } = useQuery({
    queryKey: ["marketing-social-media-stats"],
    queryFn: api.getMarketingSocialMediaStats,
  });

  const list: SocialPost[] = (items as SocialPost[] | null | undefined) || [];

  const platforms = useMemo(() => {
    const ps = new Set<string>();
    list.forEach((item) => { if (item.platform) ps.add(item.platform); });
    return ["all", ...Array.from(ps)];
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter((item) => {
      const matchPlatform = platformFilter === "all" || item.platform === platformFilter;
      const matchSearch =
        !search ||
        (item.platform || "").includes(search) ||
        (item.account_name || "").toLowerCase().includes(search.toLowerCase());
      return matchPlatform && matchSearch;
    });
  }, [list, search, platformFilter]);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>רשתות חברתיות</Text>
        <View style={{ width: 32 }} />
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.info }]}>{fmtNum(stats.total_followers)}</Text>
            <Text style={styles.statLabel}>עוקבים</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.success }]}>{fmtNum(stats.avg_engagement)}%</Text>
            <Text style={styles.statLabel}>מעורבות</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: "#7B5EA7" }]}>{fmtNum(stats.total_reach)}</Text>
            <Text style={styles.statLabel}>חשיפה</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: "#EC4899" }]} numberOfLines={1}>{stats.top_platform || "—"}</Text>
            <Text style={styles.statLabel}>מובילה</Text>
          </View>
        </View>
      )}

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש..."
          placeholderTextColor={Colors.light.textMuted}
          textAlign="right"
        />
        {!!search && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={16} color={Colors.light.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.platformFilters}>
        {platforms.map((p) => (
          <Pressable
            key={p}
            style={[styles.chip, platformFilter === p && styles.chipActive]}
            onPress={() => setPlatformFilter(p)}
          >
            <Text style={[styles.chipText, platformFilter === p && styles.chipTextActive]}>
              {p === "all" ? "הכל" : p}
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
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="share-2" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין נתונים</Text>
            </View>
          }
          renderItem={({ item }) => {
            const color = PLATFORM_COLORS[item.platform ?? ""] || Colors.light.primary;
            const icon: keyof typeof Feather.glyphMap = platformIcon[item.platform ?? ""] || "share-2";
            const followersChange = Number(item.followers_change || 0);
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.platformIcon, { backgroundColor: color + "18" }]}>
                    <Feather name={icon} size={20} color={color} />
                  </View>
                  <View style={styles.platformInfo}>
                    <Text style={styles.platformName}>{item.platform}</Text>
                    {item.account_name && (
                      <Text style={styles.accountName}>@{item.account_name}</Text>
                    )}
                  </View>
                  {followersChange !== 0 && (
                    <View style={styles.changeTag}>
                      <Feather
                        name={followersChange > 0 ? "trending-up" : "trending-down"}
                        size={12}
                        color={followersChange > 0 ? Colors.light.success : Colors.light.danger}
                      />
                      <Text style={[
                        styles.changeText,
                        { color: followersChange > 0 ? Colors.light.success : Colors.light.danger },
                      ]}>
                        {followersChange > 0 ? "+" : ""}{fmtNum(followersChange)}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.metricsGrid}>
                  <MetricCell label="עוקבים" value={fmtNum(item.followers)} color={color} />
                  <MetricCell label="פוסטים" value={fmtNum(item.posts)} color={Colors.light.info} />
                  <MetricCell label="מעורבות" value={`${Number(item.engagement || 0).toFixed(1)}%`} color={Colors.light.success} />
                  <MetricCell label="חשיפה" value={fmtNum(item.reach)} color="#7B5EA7" />
                </View>

                {item.metric_date && (
                  <Text style={styles.metricDate}>עדכון: {item.metric_date}</Text>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function MetricCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
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
  statValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
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
  platformFilters: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.light.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  chipActive: { backgroundColor: "#EC4899", borderColor: "#EC4899" },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  chipTextActive: { color: "#fff" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  card: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  platformIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  platformInfo: { flex: 1 },
  platformName: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "right" },
  accountName: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  changeTag: { flexDirection: "row", alignItems: "center", gap: 3 },
  changeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  metricsGrid: { flexDirection: "row", gap: 8 },
  metricCell: {
    flex: 1,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    gap: 3,
  },
  metricValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  metricLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  metricDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
    marginTop: 10,
  },
});
