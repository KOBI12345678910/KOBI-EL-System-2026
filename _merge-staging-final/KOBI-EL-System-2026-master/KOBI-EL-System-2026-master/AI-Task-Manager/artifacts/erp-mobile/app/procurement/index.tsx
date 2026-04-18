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


export default function ProcurementDashboardWrapper() {
  return (
    <AuthGuard>
      <ProcurementDashboard />
    </AuthGuard>
  );
}

function ProcurementDashboard() {
  const insets = useSafeAreaInsets();

  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => api.getPurchaseOrders(),
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.getSuppliers(),
  });

  const orderList = Array.isArray(orders) ? orders : [];
  const supplierList = Array.isArray(suppliers) ? suppliers : [];

  const pendingOrders = orderList.filter((o: any) => ["pending", "draft", "sent"].includes(o.status || ""));
  const activeSuppliers = supplierList.filter((s: any) => s.status === "active" || !s.status);

  const recentOrders = orderList.slice(0, 5);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>רכש</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
          </View>
        ) : (
          <>
            <View style={styles.kpiRow}>
              <KPICard icon="shopping-cart" label="ממתינות לאישור" value={String(pendingOrders.length)} color={Colors.light.warning} />
              <KPICard icon="users" label="ספקים פעילים" value={String(activeSuppliers.length)} color={Colors.light.primary} />
              <KPICard icon="layers" label="סה״כ הזמנות" value={String(orderList.length)} color={Colors.light.info} />
            </View>

            <View style={styles.actionsSection}>
              <Text style={styles.sectionTitle}>ניהול</Text>
              <View style={styles.actionGrid}>
                <ActionCard icon="shopping-cart" label="הזמנות רכש" color="#1B4332" onPress={() => router.push("/procurement/orders")} />
                <ActionCard icon="users" label="ספקים" color="#2D6A4F" onPress={() => router.push("/procurement/suppliers")} />
                <ActionCard icon="package" label="חומרי גלם" color="#40916C" onPress={() => router.push("/procurement/raw-materials")} />
                <ActionCard icon="alert-triangle" label="התראות מלאי" color="#E07A5F" onPress={() => router.push("/procurement/raw-materials")} />
              </View>
            </View>

            {recentOrders.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>הזמנות אחרונות</Text>
                  <Pressable onPress={() => router.push("/procurement/orders")}>
                    <Text style={styles.seeAll}>הכל</Text>
                  </Pressable>
                </View>
                {recentOrders.map((order: any) => (
                  <OrderMiniRow key={order.id} order={order} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function KPICard({ icon, label, value, color }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; color: string }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function ActionCard({ icon, label, color, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={22} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function OrderMiniRow({ order }: { order: any }) {
  const statusColors: Record<string, string> = {
    draft: Colors.light.textMuted,
    pending: Colors.light.warning,
    sent: Colors.light.info,
    approved: Colors.light.success,
    received: Colors.light.success,
    cancelled: Colors.light.danger,
  };
  const statusLabels: Record<string, string> = {
    draft: "טיוטה",
    pending: "ממתין",
    sent: "נשלח",
    approved: "אושר",
    received: "התקבל",
    cancelled: "בוטל",
  };
  const status = order.status || "pending";
  const color = statusColors[status] || Colors.light.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.miniRow, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/procurement/order/[id]", params: { id: String(order.id) } })}
    >
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <View style={styles.miniInfo}>
        <Text style={styles.miniTitle}>{order.orderNumber || order.order_number || `#${order.id}`}</Text>
        <Text style={styles.miniSub}>
          {order.totalAmount ? `₪${Number(order.totalAmount).toLocaleString()}` : "—"}
        </Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: color + "18" }]}>
        <Text style={[styles.statusText, { color }]}>{statusLabels[status] || status}</Text>
      </View>
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  loadingContainer: { paddingTop: 80, alignItems: "center" },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  kpiLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, textAlign: "center" },
  actionsSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginBottom: 12, textAlign: "right" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionCard: {
    width: "47%" as DimensionValue,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  pressed: { opacity: 0.85 },
  recentSection: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  seeAll: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  miniRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  miniInfo: { flex: 1 },
  miniTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  miniSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
