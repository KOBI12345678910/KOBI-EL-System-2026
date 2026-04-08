import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";
import { useDeleteGuard } from "@/hooks/useDeleteGuard";

export default function RecordDetailScreenWrapper() {
  return (
    <AuthGuard>
      <RecordDetailScreen />
    </AuthGuard>
  );
}

function RecordDetailScreen() {
  const { entityId, id } = useLocalSearchParams<{ entityId: string; id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});

  const eId = Number(entityId);
  const rId = Number(id);

  const { data: fields } = useQuery({
    queryKey: ["entity-fields", eId],
    queryFn: () => api.getEntityFields(eId),
    enabled: !!eId,
  });

  const { data: record, isLoading, refetch } = useQuery({
    queryKey: ["record", eId, rId],
    queryFn: () => api.getRecord(eId, rId),
    enabled: !!eId && !!rId,
  });

  const { canDelete } = useDeleteGuard();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.updateRecord(eId, rId, { data }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["entity-records", eId] });
    },
    onError: (err: Error) => {
      Alert.alert("שגיאה", err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteRecord(eId, rId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["entity-records", eId] });
      router.back();
    },
    onError: (err: Error) => {
      Alert.alert("שגיאת מחיקה", err.message);
    },
  });

  const recordTitle = (() => {
    const data = record?.data || {};
    for (const key of ["name", "title", "שם", "כותרת", "fullName"]) {
      if (data[key]) return String(data[key]);
    }
    return `#${rId}`;
  })();

  const handleDelete = () => {
    if (!canDelete) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirmed = () => {
    setShowDeleteModal(false);
    deleteMutation.mutate();
  };

  const editableFields = (fields || []).filter(
    (f: any) => f.fieldType !== "system" && f.fieldType !== "auto_number" && f.fieldKey !== "id"
  );

  const displayFields = (fields || []).filter(
    (f: any) => f.fieldType !== "system"
  );

  const handleStartEdit = () => {
    setEditData({ ...(record?.data || {}) });
    setEditing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = () => {
    updateMutation.mutate(editData);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditData({});
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  const recordData = record?.data || {};

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          פרטי רשומה
        </Text>
        {!editing ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {canDelete && (
              <Pressable onPress={handleDelete} hitSlop={8} style={{ padding: 4 }}>
                <Feather name="trash-2" size={18} color="#ef4444" />
              </Pressable>
            )}
            <Pressable onPress={handleStartEdit} style={styles.editBtn} hitSlop={8}>
              <Feather name="edit-2" size={18} color={Colors.light.primary} />
            </Pressable>
          </View>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      {record?.status && (
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(record.status) + "15" }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(record.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(record.status) }]}>
              {record.status}
            </Text>
          </View>
          <Text style={styles.recordId}>#{record.id}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {displayFields.length > 0 ? (
            displayFields.map((field: any, idx: number) => (
              <React.Fragment key={field.id}>
                {idx > 0 && <View style={styles.divider} />}
                <FieldRow
                  field={field}
                  value={editing ? editData[field.fieldKey] : recordData[field.fieldKey]}
                  editing={editing && editableFields.some((ef: any) => ef.id === field.id)}
                  onChange={(val) =>
                    setEditData((prev) => ({ ...prev, [field.fieldKey]: val }))
                  }
                />
              </React.Fragment>
            ))
          ) : (
            Object.entries(recordData).map(([key, value], idx) => (
              <React.Fragment key={key}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{key}</Text>
                  <Text style={styles.fieldValue}>{String(value ?? "")}</Text>
                </View>
              </React.Fragment>
            ))
          )}
        </View>

        {record?.createdAt && (
          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <Feather name="calendar" size={14} color={Colors.light.textMuted} />
              <Text style={styles.metaLabel}>נוצר</Text>
              <Text style={styles.metaValue}>
                {new Date(record.createdAt).toLocaleDateString("he-IL")}
              </Text>
            </View>
            {record.updatedAt && (
              <View style={styles.metaRow}>
                <Feather name="clock" size={14} color={Colors.light.textMuted} />
                <Text style={styles.metaLabel}>עודכן</Text>
                <Text style={styles.metaValue}>
                  {new Date(record.updatedAt).toLocaleDateString("he-IL")}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {editing && (
        <View style={[styles.editBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 10 }]}>
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.8 }]}
            onPress={handleCancel}
          >
            <Text style={styles.cancelBtnText}>ביטול</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && { opacity: 0.9 },
              updateMutation.isPending && { opacity: 0.6 },
            ]}
            onPress={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>שמור</Text>
            )}
          </Pressable>
        </View>
      )}

      <DeleteConfirmModal
        visible={showDeleteModal}
        itemName={recordTitle}
        entityType="רשומה"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setShowDeleteModal(false)}
      />
    </View>
  );
}

function FieldRow({
  field,
  value,
  editing,
  onChange,
}: {
  field: any;
  value: any;
  editing: boolean;
  onChange: (val: any) => void;
}) {
  const label = field.nameHe || field.name || field.fieldKey;
  const displayValue = value != null ? String(value) : "";

  if (editing) {
    return (
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          style={styles.fieldInput}
          value={displayValue}
          onChangeText={onChange}
          placeholder="הזן ערך..."
          placeholderTextColor={Colors.light.textMuted}
          textAlign="right"
          multiline={field.fieldType === "textarea" || field.fieldType === "rich_text"}
        />
      </View>
    );
  }

  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{displayValue || "-"}</Text>
    </View>
  );
}

function getStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (["active", "פעיל", "approved", "מאושר", "completed", "הושלם"].some((k) => s.includes(k)))
    return Colors.light.success;
  if (["draft", "טיוטה", "pending", "ממתין"].some((k) => s.includes(k)))
    return Colors.light.warning;
  if (["rejected", "נדחה", "cancelled", "מבוטל"].some((k) => s.includes(k)))
    return Colors.light.danger;
  return Colors.light.textMuted;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
  },
  editBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  recordId: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textMuted,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginHorizontal: 16,
  },
  fieldRow: {
    padding: 16,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  fieldValue: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    textAlign: "right",
    lineHeight: 22,
  },
  fieldInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    minHeight: 44,
  },
  metaCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  metaValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    flex: 1,
    textAlign: "left",
  },
  editBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.light.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
