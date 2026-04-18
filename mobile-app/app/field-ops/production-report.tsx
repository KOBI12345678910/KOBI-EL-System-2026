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
import * as api from "@/lib/api";

const REPORT_TYPES = [
  { key: "production", label: "דיווח כמות", icon: "box" as const, color: Colors.light.success },
  { key: "downtime", label: "זמן השבתה", icon: "pause-circle" as const, color: Colors.light.warning },
  { key: "quality_issue", label: "בעיית איכות", icon: "alert-triangle" as const, color: Colors.light.danger },
];

const DOWNTIME_REASONS = [
  { key: "breakdown", label: "תקלה" },
  { key: "maintenance", label: "תחזוקה מתוכננת" },
  { key: "material_shortage", label: "חוסר חומרים" },
  { key: "setup", label: "הכנת מכונה" },
  { key: "quality_hold", label: "עצירת איכות" },
  { key: "power_outage", label: "הפסקת חשמל" },
  { key: "other", label: "אחר" },
];

const SEVERITY_LEVELS = [
  { key: "low", label: "נמוכה", color: Colors.light.info },
  { key: "medium", label: "בינונית", color: Colors.light.warning },
  { key: "high", label: "גבוהה", color: "#FF8C00" },
  { key: "critical", label: "קריטית", color: Colors.light.danger },
];

export default function ProductionReportWrapper() {
  return (
    <AuthGuard>
      <ProductionReportScreen />
    </AuthGuard>
  );
}

function ProductionReportScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [reportType, setReportType] = useState("production");

  const { data: workOrders } = useQuery({
    queryKey: ["work-orders"],
    queryFn: () => api.getWorkOrders({ status: "in_progress", limit: 50 }),
  });

  const { data: reportsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["field-production-reports"],
    queryFn: () => api.getFieldProductionReports({ limit: 50 }),
  });

  const reports = reportsData?.reports || [];
  const activeOrders = Array.isArray(workOrders) ? workOrders : [];

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>דיווח ייצור</Text>
        <Pressable style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Feather name="plus" size={22} color={Colors.light.primary} />
        </Pressable>
      </View>

      <View style={styles.typeRow}>
        {REPORT_TYPES.map((t) => (
          <Pressable key={t.key} style={[styles.typeCard, reportType === t.key && { borderColor: t.color }]} onPress={() => setReportType(t.key)}>
            <View style={[styles.typeIcon, { backgroundColor: t.color + "18" }]}>
              <Feather name={t.icon} size={18} color={t.color} />
            </View>
            <Text style={[styles.typeLabel, reportType === t.key && { color: t.color }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item: Record<string, unknown>) => String(item.id)}
        refreshing={isRefetching}
        onRefresh={refetch}
        renderItem={({ item }: { item: Record<string, unknown> }) => {
          const type = REPORT_TYPES.find((t) => t.key === String(item.report_type)) || REPORT_TYPES[0];
          return (
            <View style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <View style={[styles.reportTypeIcon, { backgroundColor: type.color + "18" }]}>
                  <Feather name={type.icon} size={16} color={type.color} />
                </View>
                <View style={styles.reportInfo}>
                  <Text style={styles.reportType}>{type.label}</Text>
                  <Text style={styles.reportTime}>
                    {item.created_at ? new Date(String(item.created_at)).toLocaleString("he-IL") : ""}
                  </Text>
                </View>
                {!!item.quantity_produced && Number(item.quantity_produced) > 0 && (
                  <View style={styles.qtyBadge}>
                    <Text style={styles.qtyText}>{String(item.quantity_produced)} יח׳</Text>
                  </View>
                )}
              </View>
              {!!item.description && <Text style={styles.reportDesc}>{String(item.description)}</Text>}
              {!!item.reason_code && (
                <View style={styles.reasonRow}>
                  <Feather name="tag" size={12} color={Colors.light.textMuted} />
                  <Text style={styles.reasonText}>{String(item.reason_text || item.reason_code)}</Text>
                </View>
              )}
              {!!item.severity && (
                <View style={styles.severityRow}>
                  <View style={[styles.severityDot, { backgroundColor: SEVERITY_LEVELS.find((s) => s.key === String(item.severity))?.color || Colors.light.textMuted }]} />
                  <Text style={styles.severityText}>{SEVERITY_LEVELS.find((s) => s.key === String(item.severity))?.label || String(item.severity)}</Text>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Feather name="clipboard" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין דיווחי ייצור</Text>
            </View>
          )
        }
      />

      <Pressable style={[styles.fab, { bottom: insets.bottom + 24 }]} onPress={() => setShowCreate(true)}>
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>

      <CreateReportModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        workOrders={activeOrders}
        queryClient={queryClient}
      />
    </View>
  );
}

function CreateReportModal({
  visible,
  onClose,
  workOrders,
  queryClient,
}: {
  visible: boolean;
  onClose: () => void;
  workOrders: Record<string, unknown>[];
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState("production");
  const [workOrderId, setWorkOrderId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("נדרשת הרשאת מצלמה");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.createProductionReport({
        workOrderId: workOrderId || undefined,
        type,
        quantityProduced: type === "production" ? Number(quantity) || 0 : undefined,
        reasonCode: type === "downtime" ? reasonCode : undefined,
        reasonText: type === "downtime" ? DOWNTIME_REASONS.find((r) => r.key === reasonCode)?.label : undefined,
        severity: type === "quality_issue" ? severity : undefined,
        description: description.trim() || undefined,
        photos,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["field-production-reports"] });
      resetForm();
      onClose();
    } catch (err) {
      Alert.alert("שגיאה", (err as Error).message);
    }
    setSaving(false);
  };

  const resetForm = () => {
    setType("production");
    setWorkOrderId(null);
    setQuantity("");
    setReasonCode("");
    setDescription("");
    setSeverity("medium");
    setPhotos([]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>דיווח חדש</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={Colors.light.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.fieldLabel}>סוג דיווח</Text>
          <View style={styles.typeSelector}>
            {REPORT_TYPES.map((t) => (
              <Pressable key={t.key} style={[styles.typeSelectorBtn, type === t.key && { backgroundColor: t.color, borderColor: t.color }]} onPress={() => setType(t.key)}>
                <Feather name={t.icon} size={16} color={type === t.key ? "#fff" : t.color} />
                <Text style={[styles.typeSelectorText, type === t.key && { color: "#fff" }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {workOrders.length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>הזמנת עבודה</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.woScroll}>
                <Pressable style={[styles.woChip, !workOrderId && styles.woChipActive]} onPress={() => setWorkOrderId(null)}>
                  <Text style={[styles.woChipText, !workOrderId && styles.woChipTextActive]}>ללא</Text>
                </Pressable>
                {workOrders.map((wo) => (
                  <Pressable key={String(wo.id)} style={[styles.woChip, workOrderId === Number(wo.id) && styles.woChipActive]} onPress={() => setWorkOrderId(Number(wo.id))}>
                    <Text style={[styles.woChipText, workOrderId === Number(wo.id) && styles.woChipTextActive]}>
                      {String(wo.order_number || wo.orderNumber || `#${wo.id}`)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {type === "production" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>כמות שיוצרה</Text>
              <TextInput
                style={styles.fieldInput}
                value={quantity}
                onChangeText={setQuantity}
                placeholder="0"
                placeholderTextColor={Colors.light.textMuted}
                keyboardType="numeric"
                textAlign="right"
              />
            </View>
          )}

          {type === "downtime" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>סיבת השבתה</Text>
              <View style={styles.reasonGrid}>
                {DOWNTIME_REASONS.map((r) => (
                  <Pressable key={r.key} style={[styles.reasonChip, reasonCode === r.key && styles.reasonChipActive]} onPress={() => setReasonCode(r.key)}>
                    <Text style={[styles.reasonChipText, reasonCode === r.key && styles.reasonChipTextActive]}>{r.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {type === "quality_issue" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>חומרה</Text>
              <View style={styles.severitySelector}>
                {SEVERITY_LEVELS.map((s) => (
                  <Pressable key={s.key} style={[styles.severityBtn, severity === s.key && { backgroundColor: s.color, borderColor: s.color }]} onPress={() => setSeverity(s.key)}>
                    <Text style={[styles.severityBtnText, severity === s.key && { color: "#fff" }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>תיאור</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMulti]}
              value={description}
              onChangeText={setDescription}
              placeholder="פרטים נוספים..."
              placeholderTextColor={Colors.light.textMuted}
              textAlign="right"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.photoSection}>
            <Text style={styles.fieldLabel}>תמונות</Text>
            <View style={styles.photoGrid}>
              {photos.map((uri, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Feather name="image" size={24} color={Colors.light.primary} />
                  <Pressable style={styles.photoRemove} onPress={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}>
                    <Feather name="x" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addPhotoBtn} onPress={takePhoto}>
                <Feather name="camera" size={20} color={Colors.light.primary} />
              </Pressable>
              <Pressable style={styles.addPhotoBtn} onPress={pickPhoto}>
                <Feather name="image" size={20} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>שלח דיווח</Text>}
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", justifyContent: "center" },
  typeRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  typeCard: {
    flex: 1, backgroundColor: Colors.light.surfaceCard, borderRadius: 14, padding: 12,
    alignItems: "center", gap: 6, borderWidth: 2, borderColor: Colors.light.border,
  },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  typeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "center" },
  listContent: { paddingHorizontal: 20, gap: 10, paddingTop: 8 },
  reportCard: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 14, padding: 14, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  reportHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  reportTypeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  reportInfo: { flex: 1 },
  reportType: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  reportTime: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  qtyBadge: { backgroundColor: Colors.light.success + "18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  qtyText: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.light.success },
  reportDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  reasonText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  severityRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  severityText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  fab: {
    position: "absolute", right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.light.primary, alignItems: "center", justifyContent: "center",
    shadowColor: Colors.light.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  modalContainer: { flex: 1, backgroundColor: Colors.light.background, paddingHorizontal: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  modalScroll: { flex: 1 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginBottom: 8, textAlign: "right" },
  fieldInput: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 12, paddingHorizontal: 14, height: 48,
    fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border,
  },
  fieldInputMulti: { height: 80, paddingTop: 12, textAlignVertical: "top" },
  typeSelector: { flexDirection: "row", gap: 8, marginBottom: 16 },
  typeSelectorBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.light.surfaceCard, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.light.border,
  },
  typeSelectorText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.text },
  woScroll: { flexDirection: "row" },
  woChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.light.surfaceCard,
    borderWidth: 1, borderColor: Colors.light.border, marginRight: 8,
  },
  woChipActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  woChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text },
  woChipTextActive: { color: "#fff" },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.light.surfaceCard,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  reasonChipActive: { backgroundColor: Colors.light.warning, borderColor: Colors.light.warning },
  reasonChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text },
  reasonChipTextActive: { color: "#fff" },
  severitySelector: { flexDirection: "row", gap: 8 },
  severityBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
    backgroundColor: Colors.light.surfaceCard, borderWidth: 1, borderColor: Colors.light.border,
  },
  severityBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  photoSection: { marginBottom: 16 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoThumb: {
    width: 60, height: 60, borderRadius: 10, backgroundColor: Colors.light.primary + "12",
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  photoRemove: {
    position: "absolute", top: -4, right: -4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.light.danger, alignItems: "center", justifyContent: "center",
  },
  addPhotoBtn: {
    width: 60, height: 60, borderRadius: 10, borderWidth: 2, borderColor: Colors.light.border,
    borderStyle: "dashed", alignItems: "center", justifyContent: "center",
  },
  saveBtn: { backgroundColor: Colors.light.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
