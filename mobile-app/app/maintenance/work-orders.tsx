import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import { useNetwork } from "@/contexts/NetworkContext";
import * as api from "@/lib/api";

const STATUS_FILTERS = [
  { key: "all", label: "הכל" },
  { key: "open", label: "פתוחות" },
  { key: "in_progress", label: "בביצוע" },
  { key: "completed", label: "הושלמו" },
];

const STATUS_COLORS: Record<string, string> = {
  open: Colors.light.info,
  in_progress: Colors.light.warning,
  completed: Colors.light.success,
  cancelled: Colors.light.textMuted,
};

const STATUS_LABELS: Record<string, string> = {
  open: "פתוחה",
  in_progress: "בביצוע",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

const PRIORITY_COLORS: Record<number, string> = {
  1: Colors.light.danger,
  2: "#FF8C00",
  3: Colors.light.warning,
  4: Colors.light.info,
  5: Colors.light.textMuted,
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "דחוף",
  2: "גבוהה",
  3: "בינונית",
  4: "נמוכה",
  5: "נמוכה מאוד",
};

export default function MaintenanceWorkOrdersWrapper() {
  return (
    <AuthGuard>
      <MaintenanceWorkOrdersScreen />
    </AuthGuard>
  );
}

const PRIORITY_FILTERS = [
  { key: "all", label: "הכל" },
  { key: "1", label: "דחוף" },
  { key: "2", label: "גבוהה" },
  { key: "3", label: "בינונית" },
  { key: "45", label: "נמוכה" },
];

function MaintenanceWorkOrdersScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["maintenance-orders", statusFilter],
    queryFn: () => api.getMaintenanceOrders({ status: statusFilter === "all" ? undefined : statusFilter }),
  });

  const allOrders = data?.orders || [];
  const orders = priorityFilter === "all"
    ? allOrders
    : allOrders.filter((o: Record<string, unknown>) => {
        const p = Number(o.priority_level);
        if (priorityFilter === "45") return p >= 4;
        return p === Number(priorityFilter);
      });

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>הזמנות תחזוקה</Text>
          <Text style={styles.subtitle}>{orders.length} הזמנות</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pressable key={f.key} style={[styles.filterBtn, statusFilter === f.key && styles.filterBtnActive]} onPress={() => setStatusFilter(f.key)}>
            <Text style={[styles.filterText, statusFilter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.filterRow, { marginTop: -4 }]}>
        {PRIORITY_FILTERS.map((f) => (
          <Pressable key={f.key} style={[styles.filterBtn, priorityFilter === f.key && styles.filterBtnActive]} onPress={() => setPriorityFilter(f.key)}>
            <Text style={[styles.filterText, priorityFilter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item: Record<string, unknown>) => String(item.id)}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }: { item: Record<string, unknown> }) => {
            const status = String(item.status || "open");
            const priority = Number(item.priority_level) || 3;
            const statusColor = STATUS_COLORS[status] || Colors.light.textMuted;
            const priorityColor = PRIORITY_COLORS[priority] || Colors.light.textMuted;

            return (
              <Pressable
                style={({ pressed }) => [styles.orderCard, pressed && styles.pressed]}
                onPress={() => setSelectedOrder(item)}
              >
                <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />
                <View style={styles.orderInfo}>
                  <View style={styles.orderTopRow}>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
                      <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[status] || status}</Text>
                    </View>
                    <View style={[styles.priorityBadge, { backgroundColor: priorityColor + "18" }]}>
                      <Text style={[styles.priorityText, { color: priorityColor }]}>{PRIORITY_LABELS[priority] || ""}</Text>
                    </View>
                  </View>
                  <Text style={styles.orderTitle}>{String(item.title || "")}</Text>
                  {!!item.asset_name && <Text style={styles.orderMeta}>ציוד: {String(item.asset_name)}</Text>}
                  {!!item.location && <Text style={styles.orderMeta}>מיקום: {String(item.location)}</Text>}
                </View>
                <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
              </Pressable>
            );
          }}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="settings" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין הזמנות תחזוקה</Text>
            </View>
          }
        />
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          queryClient={queryClient}
        />
      )}
    </View>
  );
}

function OrderDetailModal({
  order,
  onClose,
  queryClient,
}: {
  order: Record<string, unknown>;
  onClose: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const insets = useSafeAreaInsets();
  const { isConnected, addToSyncQueue } = useNetwork();
  const [status, setStatus] = useState(String(order.status || "open"));
  const [timeSpent, setTimeSpent] = useState(String(order.time_spent_minutes || "0"));
  const [notes, setNotes] = useState(String(order.notes || ""));
  const [partsUsed, setPartsUsed] = useState("");
  const [photoBefore, setPhotoBefore] = useState(String(order.photo_before || ""));
  const [photoAfter, setPhotoAfter] = useState(String(order.photo_after || ""));
  const [saving, setSaving] = useState(false);

  const statusColor = STATUS_COLORS[status] || Colors.light.textMuted;
  const priority = Number(order.priority_level) || 3;
  const priorityColor = PRIORITY_COLORS[priority] || Colors.light.textMuted;

  const pickPhoto = async (type: "before" | "after") => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      if (type === "before") setPhotoBefore(result.assets[0].uri);
      else setPhotoAfter(result.assets[0].uri);
    }
  };

  const takePhoto = async (type: "before" | "after") => {
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== "granted") {
      Alert.alert("נדרשת הרשאת מצלמה");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      if (type === "before") setPhotoBefore(result.assets[0].uri);
      else setPhotoAfter(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const updateData = {
      status,
      timeSpentMinutes: Number(timeSpent) || 0,
      notes: notes.trim() || undefined,
      partsUsed: partsUsed.trim() ? partsUsed.split(",").map((p) => ({ name: p.trim() })) : undefined,
      photoBefore: photoBefore || undefined,
      photoAfter: photoAfter || undefined,
    };
    if (isConnected) {
      try {
        await api.updateMaintenanceOrder(Number(order.id), updateData);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["maintenance-orders"] });
        onClose();
      } catch (err) {
        Alert.alert("שגיאה", (err as Error).message);
      }
    } else {
      addToSyncQueue({ type: "field:maintenance_update", payload: { id: Number(order.id), data: updateData } });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("נשמר מקומית", "העדכון יסונכרן כשתהיה חיבור לאינטרנט");
      onClose();
    }
    setSaving(false);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>פרטי הזמנה</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={Colors.light.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>{String(order.title || "")}</Text>
            {!!order.description && <Text style={styles.detailDesc}>{String(order.description)}</Text>}
            <View style={styles.detailRow}>
              <View style={[styles.detailBadge, { backgroundColor: priorityColor + "18" }]}>
                <Text style={[styles.detailBadgeText, { color: priorityColor }]}>עדיפות: {PRIORITY_LABELS[priority]}</Text>
              </View>
              {!!order.asset_name && (
                <View style={[styles.detailBadge, { backgroundColor: Colors.light.info + "18" }]}>
                  <Text style={[styles.detailBadgeText, { color: Colors.light.info }]}>{String(order.asset_name)}</Text>
                </View>
              )}
            </View>
            {!!order.location && (
              <View style={styles.detailMeta}>
                <Feather name="map-pin" size={14} color={Colors.light.textMuted} />
                <Text style={styles.detailMetaText}>{String(order.location)}</Text>
              </View>
            )}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>סטטוס</Text>
            <View style={styles.statusSelector}>
              {(["open", "in_progress", "completed"] as const).map((s) => (
                <Pressable
                  key={s}
                  style={[styles.statusSelectorBtn, status === s && { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] }]}
                  onPress={() => setStatus(s)}
                >
                  <Text style={[styles.statusSelectorText, status === s && { color: "#fff" }]}>{STATUS_LABELS[s]}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>זמן שהושקע (דקות)</Text>
            <TextInput
              style={styles.fieldInput}
              value={timeSpent}
              onChangeText={setTimeSpent}
              keyboardType="numeric"
              textAlign="right"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>חלקים שנעשה בהם שימוש (מופרדים בפסיק)</Text>
            <TextInput
              style={styles.fieldInput}
              value={partsUsed}
              onChangeText={setPartsUsed}
              placeholder="בורג M8, חותם, מיסב..."
              placeholderTextColor={Colors.light.textMuted}
              textAlign="right"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>הערות</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMulti]}
              value={notes}
              onChangeText={setNotes}
              placeholder="הערות לגבי העבודה שבוצעה..."
              placeholderTextColor={Colors.light.textMuted}
              textAlign="right"
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>תמונה לפני</Text>
            <View style={styles.photoRow}>
              {photoBefore ? (
                <View style={styles.photoThumbLg}>
                  <Feather name="image" size={28} color={Colors.light.success} />
                  <Pressable style={styles.photoRemoveBtn} onPress={() => setPhotoBefore("")}>
                    <Feather name="x" size={14} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <>
                  <Pressable style={styles.photoPickBtn} onPress={() => takePhoto("before")}>
                    <Feather name="camera" size={20} color={Colors.light.primary} />
                    <Text style={styles.photoPickText}>צלם</Text>
                  </Pressable>
                  <Pressable style={styles.photoPickBtn} onPress={() => pickPhoto("before")}>
                    <Feather name="image" size={20} color={Colors.light.primary} />
                    <Text style={styles.photoPickText}>גלריה</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>תמונה אחרי</Text>
            <View style={styles.photoRow}>
              {photoAfter ? (
                <View style={styles.photoThumbLg}>
                  <Feather name="image" size={28} color={Colors.light.success} />
                  <Pressable style={styles.photoRemoveBtn} onPress={() => setPhotoAfter("")}>
                    <Feather name="x" size={14} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <>
                  <Pressable style={styles.photoPickBtn} onPress={() => takePhoto("after")}>
                    <Feather name="camera" size={20} color={Colors.light.primary} />
                    <Text style={styles.photoPickText}>צלם</Text>
                  </Pressable>
                  <Pressable style={styles.photoPickBtn} onPress={() => pickPhoto("after")}>
                    <Feather name="image" size={20} color={Colors.light.primary} />
                    <Text style={styles.photoPickText}>גלריה</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </ScrollView>

        <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>עדכן הזמנה</Text>}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center" },
  filterRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.light.surfaceCard, borderWidth: 1, borderColor: Colors.light.border,
  },
  filterBtnActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  filterTextActive: { color: "#fff" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, gap: 10 },
  orderCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14, padding: 14, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  pressed: { opacity: 0.85 },
  priorityBar: { width: 4, height: 60, borderRadius: 2 },
  orderInfo: { flex: 1, gap: 4 },
  orderTopRow: { flexDirection: "row", gap: 8 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  priorityBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  priorityText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  orderTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  orderMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  modalContainer: { flex: 1, backgroundColor: Colors.light.background, paddingHorizontal: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  modalScroll: { flex: 1 },
  detailCard: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 16, padding: 20, gap: 10, marginBottom: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  detailTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "right" },
  detailDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right", lineHeight: 22 },
  detailRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  detailBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  detailBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  detailMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailMetaText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginBottom: 8, textAlign: "right" },
  fieldInput: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 12, paddingHorizontal: 14, height: 48,
    fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border,
  },
  fieldInputMulti: { height: 100, paddingTop: 12, textAlignVertical: "top" },
  statusSelector: { flexDirection: "row", gap: 8 },
  statusSelectorBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center",
    backgroundColor: Colors.light.surfaceCard, borderWidth: 1, borderColor: Colors.light.border,
  },
  statusSelectorText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  photoRow: { flexDirection: "row", gap: 12 },
  photoThumbLg: {
    width: 80, height: 80, borderRadius: 14, backgroundColor: Colors.light.success + "12",
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  photoRemoveBtn: {
    position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.light.danger, alignItems: "center", justifyContent: "center",
  },
  photoPickBtn: {
    width: 80, height: 80, borderRadius: 14, borderWidth: 2, borderColor: Colors.light.border,
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4,
  },
  photoPickText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  saveBtn: { backgroundColor: Colors.light.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
