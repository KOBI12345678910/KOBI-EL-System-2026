import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
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

export default function InvoicesScreenWrapper() {
  return (
    <AuthGuard>
      <InvoicesScreen />
    </AuthGuard>
  );
}

function InvoicesScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"receivable" | "payable">(
    type === "payable" ? "payable" : "receivable"
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);

  const table = activeTab === "receivable" ? "accounts_receivable" : "accounts_payable";

  const { data: invoicesData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["finance-invoices", table],
    queryFn: () => api.getFinanceTable(table, { limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createFinanceRecord(table, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["finance-invoices", table] });
      queryClient.invalidateQueries({ queryKey: ["finance-dashboard"] });
    },
    onError: (err: Error) => {
      Alert.alert("שגיאה", err.message);
    },
  });

  const invoices: any[] = Array.isArray(invoicesData)
    ? invoicesData
    : invoicesData?.data || invoicesData?.items || [];

  const filtered = invoices.filter((inv) => {
    const term = search.toLowerCase();
    const matchSearch = !term ||
      (inv.invoice_number || "").toLowerCase().includes(term) ||
      (inv.customer_name || "").toLowerCase().includes(term) ||
      (inv.supplier_name || "").toLowerCase().includes(term);
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statuses = ["all", "open", "partial", "paid", "overdue", "cancelled"];
  const statusLabels: Record<string, string> = {
    all: "הכל",
    open: "פתוח",
    partial: "חלקי",
    paid: "שולם",
    overdue: "פגה",
    cancelled: "מבוטל",
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>חשבוניות</Text>
        <Pressable onPress={() => setShowCreate(true)} style={styles.addBtn} hitSlop={8}>
          <Feather name="plus" size={22} color={Colors.light.primary} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === "receivable" && styles.tabActive]}
          onPress={() => setActiveTab("receivable")}
        >
          <Text style={[styles.tabText, activeTab === "receivable" && styles.tabTextActive]}>
            חייבים
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "payable" && styles.tabActive]}
          onPress={() => setActiveTab("payable")}
        >
          <Text style={[styles.tabText, activeTab === "payable" && styles.tabTextActive]}>
            זכאים
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש חשבוניות..."
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
        {statuses.map((s) => (
          <Pressable
            key={s}
            style={[styles.statusChip, statusFilter === s && styles.statusChipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.statusChipText, statusFilter === s && styles.statusChipTextActive]}>
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
          renderItem={({ item }) => (
            <InvoiceCard invoice={item} type={activeTab} />
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
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="file-text" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין חשבוניות</Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={styles.countText}>{filtered.length} חשבוניות</Text>
          }
        />
      )}

      <CreateInvoiceModal
        visible={showCreate}
        type={activeTab}
        onClose={() => setShowCreate(false)}
        onSave={(data) => createMutation.mutate(data)}
        isSaving={createMutation.isPending}
      />
    </View>
  );
}

function InvoiceCard({ invoice, type }: { invoice: any; type: "receivable" | "payable" }) {
  const party = type === "receivable" ? invoice.customer_name : invoice.supplier_name;
  const statusColor =
    invoice.status === "overdue" ? Colors.light.danger :
    invoice.status === "paid" ? Colors.light.success :
    invoice.status === "partial" ? Colors.light.warning :
    invoice.status === "cancelled" ? Colors.light.textMuted :
    Colors.light.info;

  const statusLabel: Record<string, string> = {
    open: "פתוח",
    paid: "שולם",
    partial: "חלקי",
    overdue: "פגה",
    cancelled: "מבוטל",
    draft: "טיוטה",
  };

  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString("he-IL")
    : null;

  const handlePress = () => {
    router.push({
      pathname: "/finance/invoice-detail",
      params: {
        id: String(invoice.id),
        type,
        invoiceNumber: invoice.invoice_number || `#${invoice.id}`,
        party: party || "",
        amount: String(invoice.amount || 0),
        balanceDue: String(invoice.balance_due || 0),
        status: invoice.status || "",
        dueDate: invoice.due_date || "",
        invoiceDate: invoice.invoice_date || "",
        description: invoice.description || "",
        notes: invoice.notes || "",
      },
    });
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={handlePress}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel[invoice.status] || invoice.status || ""}
          </Text>
        </View>
        <Text style={styles.invoiceNumber}>{invoice.invoice_number || `#${invoice.id}`}</Text>
      </View>

      <Text style={styles.partyName} numberOfLines={1}>{party || "—"}</Text>

      <View style={styles.cardFooter}>
        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>יתרה לתשלום</Text>
          <Text style={styles.amount}>{fmt(invoice.balance_due)}</Text>
        </View>
        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>סה"כ</Text>
          <Text style={styles.totalAmount}>{fmt(invoice.amount)}</Text>
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

function CreateInvoiceModal({
  visible,
  type,
  onClose,
  onSave,
  isSaving,
}: {
  visible: boolean;
  type: "receivable" | "payable";
  onClose: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    invoice_number: "",
    customer_name: "",
    supplier_name: "",
    amount: "",
    due_date: "",
    invoice_date: new Date().toISOString().split("T")[0],
    description: "",
    status: "open",
    currency: "ILS",
  });

  const setField = (key: string, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (type === "receivable" && !form.customer_name) {
      Alert.alert("שגיאה", "שם לקוח נדרש");
      return;
    }
    if (type === "payable" && !form.supplier_name) {
      Alert.alert("שגיאה", "שם ספק נדרש");
      return;
    }
    if (!form.amount || isNaN(Number(form.amount))) {
      Alert.alert("שגיאה", "סכום נדרש");
      return;
    }
    const data: any = {
      ...form,
      amount: Number(form.amount),
      paid_amount: 0,
      balance_due: Number(form.amount),
    };
    onSave(data);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {type === "receivable" ? "חשבונית חדשה ללקוח" : "חשבונית חדשה לספק"}
          </Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={Colors.light.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <FieldInput
            label="מספר חשבונית"
            value={form.invoice_number}
            onChangeText={(v) => setField("invoice_number", v)}
            placeholder="INV-001"
          />
          {type === "receivable" ? (
            <FieldInput
              label="שם לקוח *"
              value={form.customer_name}
              onChangeText={(v) => setField("customer_name", v)}
              placeholder="שם הלקוח"
            />
          ) : (
            <FieldInput
              label="שם ספק *"
              value={form.supplier_name}
              onChangeText={(v) => setField("supplier_name", v)}
              placeholder="שם הספק"
            />
          )}
          <FieldInput
            label="סכום *"
            value={form.amount}
            onChangeText={(v) => setField("amount", v)}
            placeholder="0"
            keyboardType="numeric"
          />
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
        </ScrollView>

        <Pressable
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>שמור חשבונית</Text>
          )}
        </Pressable>
      </View>
    </Modal>
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
  addBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  topTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
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
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.light.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  statusChipActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  statusChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  statusChipTextActive: { color: "#fff" },
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
  invoiceNumber: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  partyName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 12 },
  amountBlock: { flex: 1, alignItems: "flex-end" },
  amountLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  amount: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.primary },
  totalAmount: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  dateBlock: { flexDirection: "row", alignItems: "center", gap: 4 },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
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
