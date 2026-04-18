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

interface ContentItem {
  id?: number | string;
  content_title?: string;
  channel?: string;
  status?: string;
  planned_date?: string;
  content_type?: string;
  assignee?: string;
  notes?: string;
}

export default function ContentCalendarWrapper() {
  return (
    <AuthGuard>
      <ContentCalendarScreen />
    </AuthGuard>
  );
}

function ContentCalendarScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: items, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["marketing-content-calendar"],
    queryFn: api.getMarketingContentCalendar,
  });

  const { data: stats } = useQuery({
    queryKey: ["marketing-content-calendar-stats"],
    queryFn: api.getMarketingContentCalendarStats,
  });

  const list: ContentItem[] = (items as ContentItem[] | null | undefined) || [];

  const filtered = useMemo(() => {
    return list.filter((item) => {
      const matchStatus = statusFilter === "all" || item.status === statusFilter;
      const matchSearch =
        !search ||
        (item.content_title || "").toLowerCase().includes(search.toLowerCase()) ||
        (item.channel || "").includes(search);
      return matchStatus && matchSearch;
    });
  }, [list, search, statusFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, ContentItem[]> = {};
    filtered.forEach((item) => {
      const date = item.planned_date || "ללא תאריך";
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const statuses = ["all", "מתוכנן", "בהכנה", "פורסם", "בוטל"];

  const statusColor = (s: string) => {
    if (s === "פורסם") return Colors.light.success;
    if (s === "בוטל") return Colors.light.danger;
    if (s === "בהכנה") return Colors.light.warning;
    return Colors.light.info;
  };

  const sections = grouped.map(([date, dateItems]) => ({ date, items: dateItems }));

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>יומן תוכן</Text>
        <View style={{ width: 32 }} />
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.published_this_month || 0}</Text>
            <Text style={styles.statLabel}>פורסמו החודש</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.info }]}>{stats.planned || 0}</Text>
            <Text style={styles.statLabel}>מתוכננים</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: "#6366F1" }]}>{stats.active_channels || 0}</Text>
            <Text style={styles.statLabel}>ערוצים</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.warning }]}>{stats.total || 0}</Text>
            <Text style={styles.statLabel}>סה"כ</Text>
          </View>
        </View>
      )}

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש תוכן..."
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
      ) : sections.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="calendar" size={48} color={Colors.light.textMuted} />
          <Text style={styles.emptyText}>אין תכנים</Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.date}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          renderItem={({ item: section }) => (
            <View style={styles.dateGroup}>
              <View style={styles.dateHeader}>
                <Feather name="calendar" size={13} color="#6366F1" />
                <Text style={styles.dateHeaderText}>{section.date}</Text>
              </View>
              {section.items.map((item: ContentItem, i: number) => {
                const sc = statusColor(item.status || "");
                return (
                  <View key={item.id || i} style={styles.contentCard}>
                    <View style={styles.contentCardTop}>
                      <View style={[styles.statusBadge, { backgroundColor: sc + "18" }]}>
                        <View style={[styles.statusDot, { backgroundColor: sc }]} />
                        <Text style={[styles.statusText, { color: sc }]}>{item.status}</Text>
                      </View>
                      <View style={styles.tagRow}>
                        {item.content_type && (
                          <View style={styles.tag}>
                            <Text style={styles.tagText}>{item.content_type}</Text>
                          </View>
                        )}
                        {item.channel && (
                          <View style={[styles.tag, { backgroundColor: "#6366F118" }]}>
                            <Text style={[styles.tagText, { color: "#6366F1" }]}>{item.channel}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={styles.contentTitle}>{item.content_title || "—"}</Text>
                    {item.assignee && (
                      <View style={styles.assigneeRow}>
                        <Feather name="user" size={12} color={Colors.light.textMuted} />
                        <Text style={styles.assigneeText}>{item.assignee}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        />
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
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.light.text },
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
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  statusFilters: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.light.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  chipActive: { backgroundColor: "#6366F1", borderColor: "#6366F1" },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  chipTextActive: { color: "#fff" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  dateGroup: { marginBottom: 16 },
  dateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 6,
    marginBottom: 6,
  },
  dateHeaderText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#6366F1" },
  contentCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  contentCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
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
  tagRow: { flexDirection: "row", gap: 6 },
  tag: {
    backgroundColor: Colors.light.primary + "18",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  contentTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 4,
  },
  assigneeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  assigneeText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
});
