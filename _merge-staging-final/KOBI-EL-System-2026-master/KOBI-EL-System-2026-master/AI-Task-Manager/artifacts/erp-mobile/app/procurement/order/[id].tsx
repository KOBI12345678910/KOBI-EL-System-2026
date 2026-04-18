import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

const STATUS_OPTIONS = [
  { key: "draft", label: "טיוטה", color: "#9CA89F" },
  { key: "pending", label: "ממתין לאישור", color: Colors.light.warning },
  { key: "approved", label: "אושר", color: Colors.light.success },
  { key: "sent", label: "נשלח לספק", color: Colors.light.info },
  { key: "received", label: "התקבל", color: "#40916C" },
  { key: "cancelled", label: "בוטל", color: Colors.light.danger },
];

export default function OrderDetailWrapper() {
  return (
    <AuthGuard>
      <OrderDetail />
    </AuthGuard>
  );
}

function OrderDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => api.getPurchaseOrder(Number(id)),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (newStatus: string) =>
      api.updatePurchaseOrder(Number(id), { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
    },
    onError: (err: any) => {
      Alert.alert("שגיאה", err.message || "שגיאה בעדכון");
    },
  });

  const currentStatus = STATUS_OPTIONS.find((s) => s.key === order?.status) || STATUS_OPTIONS[1];

  const items = Array.isArray(order?.items) ? order.items : [];

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>הזמנת רכש</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : !order ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>הזמנה לא נמצאה</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryCard}>
            <Text style={styles.orderNumber}>{order.orderNumber || order.order_number || `#${order.id}`}</Text>
            {order.supplierName && <Text style={styles.supplierName}>{order.supplierName}</Text>}
            <View style={[styles.statusBadge, { backgroundColor: currentStatus.color + "20" }]}>
              <View style={[styles.statusDot, { backgroundColor: currentStatus.color }]} />
              <Text style={[styles.statusText, { color: currentStatus.color }]}>{currentStatus.label}</Text>
            </View>
            {order.totalAmount && (
              <Text style={styles.totalAmount}>₪{Number(order.totalAmount).toLocaleString()}</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>פרטי הזמנה</Text>
            <InfoRow label="תאריך" value={order.orderDate || order.order_date || "—"} />
            <InfoRow label="אספקה משוערת" value={order.expectedDelivery || "—"} />
            <InfoRow label="תנאי תשלום" value={order.paymentTerms || "—"} />
            <InfoRow label="מטבע" value={order.currency || "ILS"} />
            {order.notes && <InfoRow label="הערות" value={order.notes} />}
          </View>

          {items.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>פריטים ({items.length})</Text>
              {items.map((item: any, idx: number) => (
                <View key={idx} style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.description || item.productName || `פריט ${idx + 1}`}</Text>
                    <Text style={styles.itemDetail}>כמות: {item.quantity} | מחיר: ₪{Number(item.unitPrice || 0).toLocaleString()}</Text>
                  </View>
                  <Text style={styles.itemTotal}>₪{Number(item.totalPrice || (item.quantity * (item.unitPrice || 0))).toLocaleString()}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.statusSection}>
            <Text style={styles.sectionTitle}>עדכון סטטוס</Text>
            <View style={styles.statusGrid}>
              {STATUS_OPTIONS.map((s) => (
                <Pressable
                  key={s.key}
                  style={({ pressed }) => [
                    styles.statusOption,
                    order.status === s.key && { borderColor: s.color, borderWidth: 2 },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    if (order.status !== s.key) {
                      updateMutation.mutate(s.key);
                    }
                  }}
                  disabled={updateMutation.isPending}
                >
                  <View style={[styles.statusOptionDot, { backgroundColor: s.color }]} />
                  <Text style={[styles.statusOptionText, order.status === s.key && { color: s.color, fontFamily: "Inter_700Bold" }]}>
                    {s.label}
                  </Text>
                  {order.status === s.key && <Feather name="check" size={14} color={s.color} />}
                </Pressable>
              ))}
            </View>
            {updateMutation.isPending && (
              <ActivityIndicator size="small" color={Colors.light.primary} style={{ marginTop: 8 }} />
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
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
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 16, color: Colors.light.textSecondary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  summaryCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  orderNumber: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  supplierName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  totalAmount: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.primary },
  section: { backgroundColor: Colors.light.surfaceCard, borderRadius: 16, padding: 16, gap: 4 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right", marginBottom: 8 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  infoValue: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text, textAlign: "right", flex: 1 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    gap: 8,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  itemDetail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  itemTotal: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.light.primary },
  statusSection: { backgroundColor: Colors.light.surfaceCard, borderRadius: 16, padding: 16 },
  statusGrid: { gap: 8 },
  statusOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  statusOptionDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text, textAlign: "right" },
  pressed: { opacity: 0.85 },
});
