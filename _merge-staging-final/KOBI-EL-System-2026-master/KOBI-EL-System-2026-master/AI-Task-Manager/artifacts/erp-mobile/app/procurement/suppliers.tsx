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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

export default function SuppliersWrapper() {
  return (
    <AuthGuard>
      <SuppliersScreen />
    </AuthGuard>
  );
}

function SuppliersScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.getSuppliers(),
  });

  const suppliers = Array.isArray(data) ? data : [];
  const filtered = suppliers.filter((s: any) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (s.supplierName || s.name || "").toLowerCase().includes(term) ||
      (s.contactPerson || "").toLowerCase().includes(term) ||
      (s.category || s.activityField || "").toLowerCase().includes(term)
    );
  });

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>ספקים</Text>
          <Text style={styles.subtitle}>{filtered.length} ספקים</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש ספקים..."
          placeholderTextColor={Colors.light.textMuted}
          textAlign="right"
        />
        {!!search && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={16} color={Colors.light.textMuted} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <SupplierRow supplier={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="users" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין ספקים</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function SupplierRow({ supplier }: { supplier: any }) {
  const isActive = supplier.status === "active" || !supplier.status;
  const color = isActive ? Colors.light.success : Colors.light.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.supplierCard, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/procurement/supplier/[id]", params: { id: String(supplier.id) } })}
    >
      <View style={styles.supplierIcon}>
        <Feather name="truck" size={20} color={Colors.light.primary} />
      </View>
      <View style={styles.supplierInfo}>
        <Text style={styles.supplierName}>{supplier.supplierName || supplier.name || "—"}</Text>
        {(supplier.contactPerson || supplier.contact_person) && (
          <Text style={styles.supplierContact}>{supplier.contactPerson || supplier.contact_person}</Text>
        )}
        {supplier.category && (
          <Text style={styles.supplierCategory}>{supplier.category}</Text>
        )}
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <View style={[styles.statusBadge, { backgroundColor: color + "18" }]}>
          <Text style={[styles.statusText, { color }]}>{isActive ? "פעיל" : "לא פעיל"}</Text>
        </View>
        <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center" },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, gap: 10 },
  supplierCard: {
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
  supplierIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  supplierInfo: { flex: 1 },
  supplierName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  supplierContact: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  supplierCategory: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
