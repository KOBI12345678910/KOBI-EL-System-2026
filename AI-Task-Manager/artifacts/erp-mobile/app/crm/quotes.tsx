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

function fmt(n: number | string | null | undefined): string {
  const num = Number(n || 0);
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export default function QuotesScreenWrapper() {
  return (
    <AuthGuard>
      <QuotesScreen />
    </AuthGuard>
  );
}

function QuotesScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: recordsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["crm-quotes"],
    queryFn: () => api.getEntityRecords(26, { limit: 100 }),
  });

  const records: any[] = recordsData?.records || (Array.isArray(recordsData) ? recordsData : []);

  const filtered = records.filter((r) => {
    const data = r.data || {};
    const term = search.toLowerCase();
    const matchSearch = !term ||
      (data.quote_number || "").toLowerCase().includes(term) ||
      (data.customer_name || "").toLowerCase().includes(term) ||
      (data.description || "").toLowerCase().includes(term);
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statuses = ["all", "draft", "pending", "approved", "rejected"];
  const statusLabels: Record<string, string> = {
    all: "הכל",
    draft: "טיוטה",
    pending: "ממתין",
    approved: "מאושר",
    rejected: "נדחה",
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>הצעות מחיר</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש הצעות..."
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

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <QuoteCard quote={item} />}
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
              <Feather name="file-text" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין הצעות מחיר</Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={styles.countText}>{filtered.length} הצעות</Text>
          }
        />
      )}
    </View>
  );
}

function QuoteCard({ quote }: { quote: any }) {
  const data = quote.data || {};
  const customer = data.customer_name || data.client_name || "";
  const quoteNum = data.quote_number || `#${quote.id}`;
  const amount = data.total_amount || data.amount || 0;
  const validUntil = data.valid_until || data.expiry_date;

  const statusColor =
    quote.status === "approved" ? Colors.light.success :
    quote.status === "rejected" ? Colors.light.danger :
    quote.status === "pending" ? Colors.light.warning :
    Colors.light.textMuted;

  const statusLabel: Record<string, string> = {
    draft: "טיוטה",
    pending: "ממתין",
    approved: "מאושר",
    rejected: "נדחה",
    expired: "פג תוקף",
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: "/record/[entityId]/[id]",
          params: { entityId: "26", id: String(quote.id) },
        })
      }
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel[quote.status] || quote.status || ""}
          </Text>
        </View>
        <Text style={styles.quoteNumber}>{quoteNum}</Text>
      </View>

      <Text style={styles.customerName} numberOfLines={1}>{customer || "—"}</Text>

      {data.description && (
        <Text style={styles.description} numberOfLines={2}>{data.description}</Text>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.amount}>{fmt(amount)}</Text>
        {validUntil && (
          <View style={styles.dateRow}>
            <Feather name="clock" size={12} color={Colors.light.textMuted} />
            <Text style={styles.dateText}>
              עד {new Date(validUntil).toLocaleDateString("he-IL")}
            </Text>
          </View>
        )}
      </View>
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
    gap: 8,
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
  quoteNumber: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  customerName: {
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
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  amount: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.primary },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
