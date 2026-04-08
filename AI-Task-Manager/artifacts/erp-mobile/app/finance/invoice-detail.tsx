import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

function fmt(n: number | string | null | undefined): string {
  const num = Number(n || 0);
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export default function InvoiceDetailWrapper() {
  return (
    <AuthGuard>
      <InvoiceDetailScreen />
    </AuthGuard>
  );
}

function InvoiceDetailScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    id: string;
    type: string;
    invoiceNumber: string;
    party: string;
    amount: string;
    balanceDue: string;
    status: string;
    dueDate: string;
    invoiceDate: string;
    description: string;
    notes: string;
  }>();
  const [showEdit, setShowEdit] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: any) => {
      const table = params.type === "receivable" ? "accounts_receivable" : "accounts_payable";
      return api.updateFinanceRecord(table, Number(params.id), data);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowEdit(false);
      queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["finance-dashboard"] });
      router.back();
    },
    onError: (err: Error) => {
      Alert.alert("שגיאה", err.message);
    },
  });

  const statusColor =
    params.status === "overdue" ? Colors.light.danger :
    params.status === "paid" ? Colors.light.success :
    params.status === "partial" ? Colors.light.warning :
    params.status === "cancelled" ? Colors.light.textMuted :
    Colors.light.info;

  const statusLabel: Record<string, string> = {
    open: "פתוח",
    paid: "שולם",
    partial: "חלקי",
    overdue: "פגה",
    cancelled: "מבוטל",
    draft: "טיוטה",
  };

  const isReceivable = params.type === "receivable";
  const partyLabel = isReceivable ? "לקוח" : "ספק";

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>פרטי חשבונית</Text>
        <Pressable onPress={() => setShowEdit(true)} style={styles.editBtn} hitSlop={8}>
          <Feather name="edit-2" size={20} color={Colors.light.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel[params.status || ""] || params.status || ""}
              </Text>
            </View>
            <Text style={styles.invoiceNumber}>{params.invoiceNumber}</Text>
          </View>

          <Text style={styles.partyName}>{params.party || "—"}</Text>
          <Text style={styles.partyType}>{partyLabel}</Text>

          <View style={styles.amountsRow}>
            <View style={styles.amountBlock}>
              <Text style={styles.amountLabelHero}>יתרה לתשלום</Text>
              <Text style={[styles.amountHero, { color: statusColor }]}>
                {fmt(params.balanceDue)}
              </Text>
            </View>
            <View style={styles.dividerV} />
            <View style={styles.amountBlock}>
              <Text style={styles.amountLabelHero}>סה"כ חשבונית</Text>
              <Text style={styles.totalHero}>{fmt(params.amount)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailCard}>
          <DetailRow
            label="מספר חשבונית"
            value={params.invoiceNumber || "—"}
            icon="hash"
          />
          <View style={styles.divider} />
          <DetailRow
            label={partyLabel}
            value={params.party || "—"}
            icon="user"
          />
          {params.invoiceDate && (
            <>
              <View style={styles.divider} />
              <DetailRow
                label="תאריך חשבונית"
                value={new Date(params.invoiceDate).toLocaleDateString("he-IL")}
                icon="calendar"
              />
            </>
          )}
          {params.dueDate && (
            <>
              <View style={styles.divider} />
              <DetailRow
                label="תאריך פירעון"
                value={new Date(params.dueDate).toLocaleDateString("he-IL")}
                icon="clock"
              />
            </>
          )}
          {params.description && (
            <>
              <View style={styles.divider} />
              <DetailRow
                label="תיאור"
                value={params.description}
                icon="file-text"
              />
            </>
          )}
          {params.notes && (
            <>
              <View style={styles.divider} />
              <DetailRow
                label="הערות"
                value={params.notes}
                icon="message-square"
              />
            </>
          )}
        </View>

        <View style={styles.paymentBreakdown}>
          <Text style={styles.breakdownTitle}>פירוט תשלום</Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>סכום מקורי</Text>
            <Text style={styles.breakdownValue}>{fmt(params.amount)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>שולם</Text>
            <Text style={[styles.breakdownValue, { color: Colors.light.success }]}>
              {fmt(Number(params.amount || 0) - Number(params.balanceDue || 0))}
            </Text>
          </View>
          <View style={[styles.breakdownRow, styles.breakdownRowTotal]}>
            <Text style={styles.breakdownLabelTotal}>יתרה</Text>
            <Text style={[styles.breakdownValueTotal, { color: statusColor }]}>
              {fmt(params.balanceDue)}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.editActionBtn}
          onPress={() => setShowEdit(true)}
        >
          <Feather name="edit-2" size={18} color={Colors.light.primary} />
          <Text style={styles.editActionText}>ערוך חשבונית</Text>
        </Pressable>
      </ScrollView>

      <EditInvoiceModal
        visible={showEdit}
        params={params}
        isReceivable={isReceivable}
        onClose={() => setShowEdit(false)}
        onSave={(data) => updateMutation.mutate(data)}
        isSaving={updateMutation.isPending}
      />
    </View>
  );
}

function EditInvoiceModal({
  visible,
  params,
  isReceivable,
  onClose,
  onSave,
  isSaving,
}: {
  visible: boolean;
  params: any;
  isReceivable: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const insets = useSafeAreaInsets();
  const originalPaidAmount = Number(params.amount || 0) - Number(params.balanceDue || 0);
  const [form, setForm] = useState({
    invoice_number: params.invoiceNumber || "",
    customer_name: isReceivable ? (params.party || "") : "",
    supplier_name: !isReceivable ? (params.party || "") : "",
    amount: params.amount || "",
    paid_amount: String(originalPaidAmount > 0 ? originalPaidAmount : 0),
    due_date: params.dueDate || "",
    invoice_date: params.invoiceDate || "",
    description: params.description || "",
    notes: params.notes || "",
    status: params.status || "open",
  });

  const setField = (key: string, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const statuses = ["open", "partial", "paid", "overdue", "cancelled"];
  const statusLabels: Record<string, string> = {
    open: "פתוח",
    partial: "חלקי",
    paid: "שולם",
    overdue: "פגה",
    cancelled: "מבוטל",
  };

  const handleSave = () => {
    if (!form.amount || isNaN(Number(form.amount))) {
      Alert.alert("שגיאה", "סכום נדרש");
      return;
    }
    const amount = Number(form.amount);
    const paidAmount =
      form.status === "paid" ? amount :
      form.status === "partial" ? Math.min(Number(form.paid_amount || 0), amount) :
      form.status === "cancelled" ? 0 :
      Number(form.paid_amount || 0);
    const balanceDue = Math.max(amount - paidAmount, 0);
    const data: any = {
      ...form,
      amount,
      paid_amount: paidAmount,
      balance_due: balanceDue,
    };
    onSave(data);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>עריכת חשבונית</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={Colors.light.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>סטטוס</Text>
            <View style={styles.statusButtons}>
              {statuses.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.statusBtn, form.status === s && styles.statusBtnActive]}
                  onPress={() => setField("status", s)}
                >
                  <Text style={[styles.statusBtnText, form.status === s && styles.statusBtnTextActive]}>
                    {statusLabels[s]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <FieldInput
            label="מספר חשבונית"
            value={form.invoice_number}
            onChangeText={(v) => setField("invoice_number", v)}
            placeholder="INV-001"
          />
          {isReceivable ? (
            <FieldInput
              label="שם לקוח"
              value={form.customer_name}
              onChangeText={(v) => setField("customer_name", v)}
              placeholder="שם הלקוח"
            />
          ) : (
            <FieldInput
              label="שם ספק"
              value={form.supplier_name}
              onChangeText={(v) => setField("supplier_name", v)}
              placeholder="שם הספק"
            />
          )}
          <FieldInput
            label="סכום"
            value={form.amount}
            onChangeText={(v) => setField("amount", v)}
            placeholder="0"
            keyboardType="numeric"
          />
          {form.status === "partial" && (
            <FieldInput
              label="סכום ששולם"
              value={form.paid_amount}
              onChangeText={(v) => setField("paid_amount", v)}
              placeholder="0"
              keyboardType="numeric"
            />
          )}
          <FieldInput
            label="תאריך חשבונית"
            value={form.invoice_date}
            onChangeText={(v) => setField("invoice_date", v)}
            placeholder="YYYY-MM-DD"
          />
          <FieldInput
            label="תאריך פירעון"
            value={form.due_date}
            onChangeText={(v) => setField("due_date", v)}
            placeholder="YYYY-MM-DD"
          />
          <FieldInput
            label="תיאור"
            value={form.description}
            onChangeText={(v) => setField("description", v)}
            placeholder="תיאור אופציונלי"
            multiline
          />
          <FieldInput
            label="הערות"
            value={form.notes}
            onChangeText={(v) => setField("notes", v)}
            placeholder="הערות"
            multiline
          />
        </ScrollView>

        <Pressable
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>שמור שינויים</Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <View style={styles.detailRow}>
      <Feather name={icon} size={16} color={Colors.light.textMuted} />
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function FieldInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.light.textMuted}
        textAlign="right"
        keyboardType={keyboardType || "default"}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
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
  editBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  topTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  heroCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  invoiceNumber: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  partyName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    textAlign: "right",
    marginTop: 8,
  },
  partyType: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  amountsRow: {
    flexDirection: "row",
    marginTop: 16,
    gap: 12,
  },
  amountBlock: { flex: 1, alignItems: "center" },
  amountLabelHero: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  amountHero: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  totalHero: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
  dividerV: {
    width: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 4,
  },
  detailCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  detailContent: { flex: 1 },
  detailLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
    textAlign: "right",
    lineHeight: 22,
  },
  divider: { height: 1, backgroundColor: Colors.light.border, marginHorizontal: 16 },
  paymentBreakdown: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 16,
  },
  breakdownTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  breakdownValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  breakdownRowTotal: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingTop: 12,
    marginTop: 4,
  },
  breakdownLabelTotal: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  breakdownValueTotal: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  editActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.primary + "12",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.primary + "30",
  },
  editActionText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.primary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  modalScroll: { flex: 1 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    textAlign: "right",
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
    minHeight: 48,
  },
  fieldInputMulti: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  statusButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.light.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  statusBtnActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  statusBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  statusBtnTextActive: { color: "#fff" },
  saveBtn: {
    backgroundColor: Colors.light.primary,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
