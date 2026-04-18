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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

const STATUS_FILTERS = [
  { key: "all", label: "הכל" },
  { key: "pending", label: "ממתין" },
  { key: "approved", label: "אושר" },
  { key: "received", label: "התקבל" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: Colors.light.textMuted,
  pending: Colors.light.warning,
  sent: Colors.light.info,
  approved: Colors.light.success,
  received: "#52B788",
  cancelled: Colors.light.danger,
};
const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  pending: "ממתין",
  sent: "נשלח",
  approved: "אושר",
  received: "התקבל",
  cancelled: "בוטל",
};

export default function ProcurementOrdersWrapper() {
  return (
    <AuthGuard>
      <ProcurementOrdersScreen />
    </AuthGuard>
  );
}

function ProcurementOrdersScreen() {
  const insets = useSafeAreaInsets();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => api.getPurchaseOrders(),
  });

  const orders = Array.isArray(data) ? data : [];
  const filtered = statusFilter === "all" ? orders : orders.filter((o: any) => o.status === statusFilter);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>הזמנות רכש</Text>
          <Text style={styles.subtitle}>{filtered.length} הזמנות</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterBtn, statusFilter === f.key && styles.filterBtnActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterText, statusFilter === f.key && styles.filterTextActive]}>
              {f.label}
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
          renderItem={({ item }) => <OrderRow order={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="shopping-cart" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין הזמנות רכש</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function OrderRow({ order }: { order: any }) {
  const status = order.status || "pending";
  const color = STATUS_COLORS[status] || Colors.light.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.orderCard, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/procurement/order/[id]", params: { id: String(order.id) } })}
    >
      <View style={[styles.statusBar, { backgroundColor: color }]} />
      <View style={styles.orderInfo}>
        <View style={styles.orderTopRow}>
          <View style={[styles.statusBadge, { backgroundColor: color + "18" }]}>
            <Text style={[styles.statusText, { color }]}>{STATUS_LABELS[status] || status}</Text>
          </View>
          <Text style={styles.orderNumber}>{order.orderNumber || order.order_number || `#${order.id}`}</Text>
        </View>
        {order.supplierName && (
          <Text style={styles.supplierName}>{order.supplierName}</Text>
        )}
        {order.totalAmount && (
          <Text style={styles.orderAmount}>₪{Number(order.totalAmount).toLocaleString()}</Text>
        )}
        {order.orderDate && (
          <Text style={styles.orderDate}>{order.orderDate}</Text>
        )}
      </View>
      <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center" },
  filterRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.light.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  filterBtnActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  filterTextActive: { color: "#fff" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, gap: 10 },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  pressed: { opacity: 0.85 },
  statusBar: { width: 4, height: 70, borderRadius: 2 },
  orderInfo: { flex: 1, gap: 2 },
  orderTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNumber: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  supplierName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  orderAmount: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.primary, textAlign: "right" },
  orderDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
