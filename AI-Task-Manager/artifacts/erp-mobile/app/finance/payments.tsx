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
import MobileEmptyState from "@/components/MobileEmptyState";
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

export default function PaymentsScreenWrapper() {
  return (
    <AuthGuard>
      <PaymentsScreen />
    </AuthGuard>
  );
}

function PaymentsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"receivable" | "payable">("receivable");
  const [statusFilter, setStatusFilter] = useState("all");

  const table = activeTab === "receivable" ? "accounts_receivable" : "accounts_payable";

  const { data: invoicesData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["finance-payments", table],
    queryFn: () => api.getFinanceTable(table, { limit: 200 }),
  });

  const { data: dashData } = useQuery({
    queryKey: ["finance-dashboard"],
    queryFn: api.getFinanceDashboard,
  });

  const allItems: any[] = Array.isArray(invoicesData)
    ? invoicesData
    : invoicesData?.data || invoicesData?.items || [];

  const filtered = allItems.filter((inv: any) => {
    const term = search.toLowerCase();
    const matchSearch = !term ||
      (inv.invoice_number || "").toLowerCase().includes(term) ||
      (inv.customer_name || "").toLowerCase().includes(term) ||
      (inv.supplier_name || "").toLowerCase().includes(term);
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const ap = dashData?.accountsPayable || {};
  const ar = dashData?.accountsReceivable || {};

  const statuses = ["all", "open", "partial", "paid", "overdue", "cancelled"];
  const statusLabels: Record<string, string> = {
    all: "הכל",
    open: "פתוח",
    partial: "חלקי",
    paid: "שולם",
    overdue: "פגה",
    cancelled: "מבוטל",
  };

  const statusCounts = statuses.reduce((acc, s) => {
    if (s === "all") acc[s] = allItems.length;
    else acc[s] = allItems.filter((i) => i.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>תשלומים וגבייה</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard
          label="פגויות לגבייה"
          value={fmt(ar.overdue_amount)}
          count={ar.overdue_count || 0}
          color={Colors.light.danger}
          onPress={() => { setActiveTab("receivable"); setStatusFilter("overdue"); }}
        />
        <SummaryCard
          label="לגבייה (כלל)"
          value={fmt(ar.total_outstanding)}
          count={ar.count || 0}
          color={Colors.light.success}
          onPress={() => { setActiveTab("receivable"); setStatusFilter("open"); }}
        />
        <SummaryCard
          label="פגויות לתשלום"
          value={fmt(ap.overdue_amount)}
          count={ap.overdue_count || 0}
          color={Colors.light.warning}
          onPress={() => { setActiveTab("payable"); setStatusFilter("overdue"); }}
        />
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === "receivable" && styles.tabActive]}
          onPress={() => setActiveTab("receivable")}
        >
          <Text style={[styles.tabText, activeTab === "receivable" && styles.tabTextActive]}>
            גבייה
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "payable" && styles.tabActive]}
          onPress={() => setActiveTab("payable")}
        >
          <Text style={[styles.tabText, activeTab === "payable" && styles.tabTextActive]}>
            תשלום
          </Text>
        </Pressable>
      </View>

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

      <View style={styles.statusFilters}>
        {statuses.map((s) => {
          const count = statusCounts[s] || 0;
          const statusColor =
            s === "overdue" ? Colors.light.danger :
            s === "paid" ? Colors.light.success :
            s === "partial" ? Colors.light.warning :
            s === "open" ? Colors.light.info :
            undefined;
          return (
            <Pressable
              key={s}
              style={[styles.chip, statusFilter === s && styles.chipActive, statusFilter === s && statusColor ? { backgroundColor: statusColor, borderColor: statusColor } : undefined]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>
                {statusLabels[s]}
                {count > 0 && s !== "all" ? ` (${count})` : ""}
              </Text>
            </Pressable>
          );
        })}
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
            <PaymentCard item={item} type={activeTab} />
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
          ListHeaderComponent={
            <Text style={styles.countText}>{filtered.length} רשומות</Text>
          }
          ListEmptyComponent={
            <MobileEmptyState
              icon={statusFilter === "overdue" ? "check-circle" : "credit-card"}
              title={statusFilter === "overdue" ? "אין פגויות" : "אין רשומות"}
              description={
                statusFilter === "overdue"
                  ? "כל החשבוניות מעודכנות ואין פגויות לטיפול."
                  : "לא נמצאו רשומות תואמות לסינון הנוכחי."
              }
            />
          }
        />
      )}
    </View>
  );
}

function SummaryCard({
  label,
  value,
  count,
  color,
  onPress,
}: {
  label: string;
  value: string;
  count: number;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.summaryCard, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryCount}>{count} חשב׳</Text>
    </Pressable>
  );
}

function PaymentCard({ item, type }: { item: any; type: "receivable" | "payable" }) {
  const party = type === "receivable" ? item.customer_name : item.supplier_name;
  const statusColor =
    item.status === "overdue" ? Colors.light.danger :
    item.status === "paid" ? Colors.light.success :
    item.status === "partial" ? Colors.light.warning :
    item.status === "cancelled" ? Colors.light.textMuted :
    Colors.light.info;

  const statusLabel: Record<string, string> = {
    open: "פתוח",
    paid: "שולם",
    partial: "חלקי",
    overdue: "פגה",
    cancelled: "מבוטל",
    draft: "טיוטה",
  };

  const dueDate = item.due_date ? new Date(item.due_date).toLocaleDateString("he-IL") : null;
  const isOverdue = item.status === "overdue";
  const daysOverdue = dueDate && isOverdue
    ? Math.floor((Date.now() - new Date(item.due_date).getTime()) / 86400000)
    : 0;

  const handlePress = () => {
    router.push({
      pathname: "/finance/invoice-detail",
      params: {
        id: String(item.id),
        type,
        invoiceNumber: item.invoice_number || `#${item.id}`,
        party: party || "",
        amount: String(item.amount || 0),
        balanceDue: String(item.balance_due || 0),
        status: item.status || "",
        dueDate: item.due_date || "",
        invoiceDate: item.invoice_date || "",
        description: item.description || "",
        notes: item.notes || "",
      },
    });
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed, isOverdue && styles.cardOverdue]}
      onPress={handlePress}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel[item.status] || item.status || ""}
          </Text>
        </View>
        {isOverdue && daysOverdue > 0 && (
          <View style={styles.overdueBadge}>
            <Feather name="alert-circle" size={11} color={Colors.light.danger} />
            <Text style={styles.overdueText}>{daysOverdue} ימים</Text>
          </View>
        )}
        <Text style={styles.invoiceNumber}>{item.invoice_number || `#${item.id}`}</Text>
      </View>

      <Text style={styles.partyName} numberOfLines={1}>{party || "—"}</Text>

      <View style={styles.cardFooter}>
        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>יתרה</Text>
          <Text style={[styles.amount, { color: statusColor }]}>{fmt(item.balance_due)}</Text>
        </View>
        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>סה"כ</Text>
          <Text style={styles.totalAmount}>{fmt(item.amount)}</Text>
        </View>
        {dueDate && (
          <View style={styles.dateBlock}>
            <Feather name="calendar" size={12} color={Colors.light.textMuted} />
            <Text style={styles.dateText}>{dueDate}</Text>
          </View>
        )}
        <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
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
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textMuted,
    textAlign: "center",
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  summaryCount: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
  },
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
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.light.danger,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  overdueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.light.danger + "18",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  overdueText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: Colors.light.danger },
  invoiceNumber: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  partyName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 12 },
  amountBlock: { flex: 1, alignItems: "flex-end" },
  amountLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  amount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  totalAmount: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  dateBlock: { flexDirection: "row", alignItems: "center", gap: 4 },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
});
