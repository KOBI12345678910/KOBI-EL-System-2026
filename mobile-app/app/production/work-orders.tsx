import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { useNetwork } from "@/contexts/NetworkContext";
import { useTablet } from "@/hooks/useTablet";
import * as api from "@/lib/api";

const STATUS_FILTERS = [
  { key: "all", label: "הכל" },
  { key: "planned", label: "בתכנון" },
  { key: "in_progress", label: "בביצוע" },
  { key: "quality_check", label: "בקרת איכות" },
  { key: "completed", label: "הושלמו" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: Colors.light.textMuted,
  planned: Colors.light.info,
  in_progress: Colors.light.warning,
  quality_check: Colors.light.primary,
  completed: Colors.light.success,
  cancelled: Colors.light.danger,
  on_hold: "#9CA89F",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  planned: "בתכנון",
  in_progress: "בביצוע",
  quality_check: "בקרת איכות",
  completed: "הושלם",
  cancelled: "בוטל",
  on_hold: "בהמתנה",
};

interface WorkOrder {
  id: number;
  order_number?: string;
  orderNumber?: string;
  title?: string;
  product_name?: string;
  status?: string;
  quantity_ordered?: string | number;
  due_date?: string;
  description?: string;
  priority?: string;
  notes?: string;
}

export default function WorkOrdersWrapper() {
  return (
    <AuthGuard>
      <WorkOrdersScreen />
    </AuthGuard>
  );
}

function WorkOrdersScreen() {
  const insets = useSafeAreaInsets();
  const { isTablet } = useTablet();
  const [statusFilter, setStatusFilter] = useState("all");
  const { isConnected, searchOffline } = useNetwork();
  const [offlineData, setOfflineData] = useState<Record<string, unknown>[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const { data, isLoading, refetch, isRefetching, isError } = useQuery({
    queryKey: ["work-orders"],
    queryFn: () => api.getWorkOrders(),
  });

  useEffect(() => {
    if ((!isConnected || isError) && Platform.OS !== "web") {
      setIsOfflineMode(true);
      searchOffline("work_orders", "").then(setOfflineData).catch(() => {});
    } else if (isConnected && !isError) {
      setIsOfflineMode(false);
    }
  }, [isConnected, isError, searchOffline]);

  const onlineOrders: WorkOrder[] = Array.isArray(data) ? (data as WorkOrder[]) : [];
  const orders: WorkOrder[] = isOfflineMode ? (offlineData as unknown as WorkOrder[]) : onlineOrders;
  const filtered = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  if (isTablet) {
    return (
      <TabletWorkOrdersLayout
        orders={filtered}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        isLoading={isLoading}
        isRefetching={isRefetching}
        refetch={refetch}
        insets={insets}
        isOfflineMode={isOfflineMode}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>הזמנות עבודה</Text>
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

      {isOfflineMode && (
        <View style={styles.offlineBanner}>
          <Feather name="wifi-off" size={14} color={Colors.light.warning} />
          <Text style={styles.offlineBannerText}>מצב לא מקוון - נתונים מקומיים</Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <WorkOrderRow order={item} isHighlighted={false} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="tool" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין הזמנות עבודה</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

interface TabletLayoutProps {
  orders: WorkOrder[];
  statusFilter: string;
  setStatusFilter: (f: string) => void;
  isLoading: boolean;
  isRefetching: boolean;
  refetch: () => void;
  insets: { top: number; bottom: number; left: number; right: number };
  isOfflineMode?: boolean;
}

function TabletWorkOrdersLayout({
  orders,
  statusFilter,
  setStatusFilter,
  isLoading,
  isRefetching,
  refetch,
  insets,
  isOfflineMode,
}: TabletLayoutProps) {
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);

  return (
    <View style={[styles.tabletContainer, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.tabletSidebar}>
        <View style={styles.tabletSidebarHeader}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="chevron-right" size={22} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.title}>הזמנות עבודה</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabletFilterRow}>
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
        </ScrollView>

        {isOfflineMode && (
          <View style={[styles.offlineBanner, { marginHorizontal: 12 }]}>
            <Feather name="wifi-off" size={14} color={Colors.light.warning} />
            <Text style={styles.offlineBannerText}>מצב לא מקוון</Text>
          </View>
        )}

        <Text style={styles.tabletCountLabel}>{orders.length} הזמנות</Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <WorkOrderRow
                order={item}
                isHighlighted={selectedOrder?.id === item.id}
                onPress={() => setSelectedOrder(item)}
              />
            )}
            contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Feather name="tool" size={48} color={Colors.light.textMuted} />
                <Text style={styles.emptyText}>אין הזמנות עבודה</Text>
              </View>
            }
          />
        )}
      </View>

      <View style={styles.tabletDetailPane}>
        {selectedOrder ? (
          <WorkOrderDetailPane
            order={selectedOrder}
            onNavigate={() => router.push({ pathname: "/production/work-order/[id]", params: { id: String(selectedOrder.id) } })}
          />
        ) : (
          <View style={styles.tabletEmptyDetail}>
            <Feather name="tool" size={52} color={Colors.light.textMuted} />
            <Text style={styles.tabletEmptyDetailText}>בחר הזמנת עבודה לצפייה</Text>
          </View>
        )}
      </View>
    </View>
  );
}

interface WorkOrderDetailPaneProps {
  order: WorkOrder;
  onNavigate: () => void;
}

function WorkOrderDetailPane({ order, onNavigate }: WorkOrderDetailPaneProps) {
  const status = order.status || "planned";
  const color = STATUS_COLORS[status] || Colors.light.textMuted;
  const label = STATUS_LABELS[status] || status;

  return (
    <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
      <View style={styles.detailHeader}>
        <View style={[styles.detailStatusBadge, { backgroundColor: color + "20", borderColor: color }]}>
          <Text style={[styles.detailStatusText, { color }]}>{label}</Text>
        </View>
        <Text style={styles.detailOrderNumber}>
          {order.order_number || order.orderNumber || `#${order.id}`}
        </Text>
      </View>

      <Text style={styles.detailTitle}>{order.title || order.product_name || "—"}</Text>

      {order.description ? (
        <Text style={styles.detailDescription}>{order.description}</Text>
      ) : null}

      <View style={styles.detailGrid}>
        {order.quantity_ordered !== undefined && (
          <View style={styles.detailGridItem}>
            <Text style={styles.detailGridLabel}>כמות</Text>
            <Text style={styles.detailGridValue}>{order.quantity_ordered}</Text>
          </View>
        )}
        {order.due_date && (
          <View style={styles.detailGridItem}>
            <Text style={styles.detailGridLabel}>תאריך יעד</Text>
            <Text style={styles.detailGridValue}>{order.due_date}</Text>
          </View>
        )}
        {order.priority && (
          <View style={styles.detailGridItem}>
            <Text style={styles.detailGridLabel}>עדיפות</Text>
            <Text style={styles.detailGridValue}>{order.priority}</Text>
          </View>
        )}
      </View>

      {order.notes ? (
        <View style={styles.detailNotesBox}>
          <Text style={styles.detailGridLabel}>הערות</Text>
          <Text style={styles.detailNotes}>{order.notes}</Text>
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.detailNavigateBtn, pressed && { opacity: 0.8 }]}
        onPress={onNavigate}
      >
        <Text style={styles.detailNavigateBtnText}>פתח פרטים מלאים</Text>
        <Feather name="external-link" size={16} color="#fff" />
      </Pressable>
    </ScrollView>
  );
}

interface WorkOrderRowProps {
  order: WorkOrder;
  isHighlighted: boolean;
  onPress?: () => void;
}

function WorkOrderRow({ order, isHighlighted, onPress }: WorkOrderRowProps) {
  const status = order.status || "open";
  const color = STATUS_COLORS[status] || Colors.light.textMuted;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push({ pathname: "/production/work-order/[id]", params: { id: String(order.id) } });
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.orderCard,
        isHighlighted && styles.orderCardHighlighted,
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
    >
      <View style={[styles.statusBar, { backgroundColor: color }]} />
      <View style={styles.orderInfo}>
        <View style={styles.orderTopRow}>
          <View style={[styles.statusBadge, { backgroundColor: color + "18" }]}>
            <Text style={[styles.statusText, { color }]}>{STATUS_LABELS[status] || status}</Text>
          </View>
          <Text style={styles.orderNumber}>{order.order_number || order.orderNumber || `#${order.id}`}</Text>
        </View>
        <Text style={styles.productName}>{order.title || order.product_name || "—"}</Text>
        {order.quantity_ordered !== undefined && (
          <Text style={styles.orderDetail}>כמות: {order.quantity_ordered}</Text>
        )}
        {order.due_date && (
          <Text style={styles.orderDetail}>תאריך יעד: {order.due_date}</Text>
        )}
      </View>
      <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  tabletContainer: { flex: 1, backgroundColor: Colors.light.background, flexDirection: "row" },
  tabletSidebar: {
    width: 340,
    backgroundColor: Colors.light.surfaceCard,
    borderRightWidth: 1,
    borderColor: Colors.light.border,
  },
  tabletSidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  tabletCountLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  tabletFilterRow: { paddingHorizontal: 12, gap: 8, paddingBottom: 8 },
  tabletDetailPane: { flex: 1, backgroundColor: Colors.light.background },
  tabletEmptyDetail: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  tabletEmptyDetailText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  detailContent: { padding: 24, gap: 16 },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailStatusBadge: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  detailStatusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  detailOrderNumber: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  detailTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "right" },
  detailDescription: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right", lineHeight: 20 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  detailGridItem: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    minWidth: 120,
    gap: 4,
  },
  detailGridLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.textMuted, textAlign: "right" },
  detailGridValue: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "right" },
  detailNotesBox: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  detailNotes: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  detailNavigateBtn: {
    backgroundColor: Colors.light.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  detailNavigateBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
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
  orderCardHighlighted: {
    borderWidth: 2,
    borderColor: Colors.light.primary,
  },
  pressed: { opacity: 0.85 },
  statusBar: { width: 4, height: 60, borderRadius: 2 },
  orderInfo: { flex: 1, gap: 2 },
  orderTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNumber: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  productName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  orderDetail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.warning + "18",
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  offlineBannerText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.warning },
});
