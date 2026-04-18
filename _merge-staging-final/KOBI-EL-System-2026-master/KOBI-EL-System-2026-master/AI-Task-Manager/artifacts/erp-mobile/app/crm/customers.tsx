import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { useNetwork } from "@/contexts/NetworkContext";
import * as api from "@/lib/api";

const CUSTOMERS_ENTITY_ID = 1;
const CUSTOMERS_SLUG = "customers";

export default function CustomersScreenWrapper() {
  return (
    <AuthGuard>
      <CustomersScreen />
    </AuthGuard>
  );
}

function CustomersScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { isConnected, searchOffline } = useNetwork();
  const [offlineData, setOfflineData] = useState<Record<string, unknown>[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const { data: slugMap } = useQuery({
    queryKey: ["entity-slug-map"],
    queryFn: api.getEntitySlugMap,
    staleTime: 5 * 60 * 1000,
  });

  const customersEntityId = slugMap?.[CUSTOMERS_SLUG] ?? CUSTOMERS_ENTITY_ID;

  const { data: recordsData, isLoading, refetch, isRefetching, isError } = useQuery({
    queryKey: ["crm-customers", customersEntityId],
    queryFn: () => api.getEntityRecords(customersEntityId, { limit: 200 }),
  });

  useEffect(() => {
    if ((!isConnected || isError) && Platform.OS !== "web") {
      setIsOfflineMode(true);
      searchOffline("customers", "").then(setOfflineData).catch(() => {});
    } else if (isConnected && !isError) {
      setIsOfflineMode(false);
    }
  }, [isConnected, isError, searchOffline]);

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      api.createRecord(customersEntityId, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
      queryClient.invalidateQueries({ queryKey: ["crm-dashboard"] });
    },
    onError: (err: Error) => {
      Alert.alert("שגיאה", err.message);
    },
  });

  const onlineRecords: Record<string, unknown>[] = recordsData?.records || (Array.isArray(recordsData) ? recordsData : []);
  const records = isOfflineMode ? offlineData.map((d) => ({ id: d.id, data: d, status: d.status || "active" })) : onlineRecords;

  const filtered = records.filter((item: Record<string, unknown>) => {
    const d = (item.data || item) as Record<string, unknown>;
    const term = search.toLowerCase();
    return !term ||
      String(d.name || "").toLowerCase().includes(term) ||
      String(d.fullName || "").toLowerCase().includes(term) ||
      String(d.email || "").toLowerCase().includes(term) ||
      String(d.company || d.company_name || "").toLowerCase().includes(term) ||
      String(d.phone || "").toLowerCase().includes(term);
  });

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>לקוחות</Text>
        <Pressable onPress={() => setShowCreate(true)} style={styles.addBtn} hitSlop={8}>
          <Feather name="user-plus" size={22} color={Colors.light.primary} />
        </Pressable>
      </View>

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש לקוחות..."
          placeholderTextColor={Colors.light.textMuted}
          textAlign="right"
          returnKeyType="search"
        />
        {!!search && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={16} color={Colors.light.textMuted} />
          </Pressable>
        )}
      </View>

      {isOfflineMode && (
        <View style={styles.offlineBanner}>
          <Feather name="wifi-off" size={14} color={Colors.light.warning} />
          <Text style={styles.offlineBannerText}>מצב לא מקוון - נתונים מקומיים</Text>
        </View>
      )}

      <View style={styles.countRow}>
        <Text style={styles.countText}>{filtered.length} לקוחות</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <CustomerCard customer={item} entityId={customersEntityId} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 80 }]}
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
              <Feather name="users" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין לקוחות</Text>
              <Pressable style={styles.emptyAction} onPress={() => setShowCreate(true)}>
                <Text style={styles.emptyActionText}>הוסף לקוח ראשון</Text>
              </Pressable>
            </View>
          }
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setShowCreate(true)}
      >
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>

      <CreateCustomerModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={(data) => createMutation.mutate(data)}
        isSaving={createMutation.isPending}
      />
    </View>
  );
}

function CustomerCard({ customer, entityId }: { customer: any; entityId: number }) {
  const data = customer.data || {};
  const name = data.name || data.fullName || data.company_name || `לקוח #${customer.id}`;
  const email = data.email || "";
  const phone = data.phone || data.mobile || "";
  const segment = data.customer_segment || data.segment || "";

  const statusColor =
    customer.status === "active" || customer.status === "פעיל"
      ? Colors.light.success
      : customer.status === "inactive"
        ? Colors.light.textMuted
        : Colors.light.accent;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: "/record/[entityId]/[id]",
          params: { entityId: String(entityId), id: String(customer.id) },
        })
      }
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(name || "?")[0]}</Text>
      </View>

      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <Text style={styles.customerName} numberOfLines={1}>{name}</Text>
          {!!segment && (
            <View style={styles.segmentBadge}>
              <Text style={styles.segmentText}>{segment}</Text>
            </View>
          )}
        </View>
        {!!email && (
          <Text style={styles.customerMeta} numberOfLines={1}>
            <Feather name="mail" size={11} color={Colors.light.textMuted} /> {email}
          </Text>
        )}
        {!!phone && (
          <Text style={styles.customerMeta} numberOfLines={1}>
            <Feather name="phone" size={11} color={Colors.light.textMuted} /> {phone}
          </Text>
        )}
      </View>

      <View style={styles.statusDot}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
      </View>

      <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
    </Pressable>
  );
}

function CreateCustomerModal({
  visible,
  onClose,
  onSave,
  isSaving,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    address: "",
    customer_segment: "",
    notes: "",
  });

  const setField = (key: string, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert("שגיאה", "שם לקוח נדרש");
      return;
    }
    onSave({ data: { ...form } });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>לקוח חדש</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={Colors.light.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <FieldInput
            label="שם מלא *"
            value={form.name}
            onChangeText={(v) => setField("name", v)}
            placeholder="שם הלקוח"
          />
          <FieldInput
            label="אימייל"
            value={form.email}
            onChangeText={(v) => setField("email", v)}
            placeholder="customer@example.com"
            keyboardType="email-address"
          />
          <FieldInput
            label="טלפון"
            value={form.phone}
            onChangeText={(v) => setField("phone", v)}
            placeholder="050-0000000"
            keyboardType="phone-pad"
          />
          <FieldInput
            label="חברה"
            value={form.company}
            onChangeText={(v) => setField("company", v)}
            placeholder="שם החברה"
          />
          <FieldInput
            label="כתובת"
            value={form.address}
            onChangeText={(v) => setField("address", v)}
            placeholder="כתובת"
          />
          <FieldInput
            label="סגמנט"
            value={form.customer_segment}
            onChangeText={(v) => setField("customer_segment", v)}
            placeholder="VIP / רגיל / עסקי"
          />
          <FieldInput
            label="הערות"
            value={form.notes}
            onChangeText={(v) => setField("notes", v)}
            placeholder="הערות נוספות"
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
            <Text style={styles.saveBtnText}>שמור לקוח</Text>
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
        autoCapitalize="none"
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
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  countRow: { paddingHorizontal: 20, marginBottom: 8 },
  countText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.light.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.primary,
  },
  cardInfo: { flex: 1, gap: 3 },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    flexWrap: "wrap",
  },
  customerName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    flex: 1,
  },
  customerMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  segmentBadge: {
    backgroundColor: Colors.light.accent + "18",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.accent,
  },
  statusDot: { alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  emptyAction: {
    backgroundColor: Colors.light.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
  },
  emptyActionText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
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
  fab: {
    position: "absolute",
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
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
