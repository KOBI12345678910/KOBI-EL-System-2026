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

export default function RawMaterialsWrapper() {
  return (
    <AuthGuard>
      <RawMaterialsScreen />
    </AuthGuard>
  );
}

function RawMaterialsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const { isConnected, searchOffline } = useNetwork();
  const [offlineData, setOfflineData] = useState<Record<string, unknown>[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const { data, isLoading, refetch, isRefetching, isError } = useQuery({
    queryKey: ["raw-materials"],
    queryFn: () => api.getRawMaterials(),
  });

  const { data: alerts } = useQuery({
    queryKey: ["inventory-alerts"],
    queryFn: api.getInventoryAlerts,
  });

  useEffect(() => {
    if ((!isConnected || isError) && Platform.OS !== "web") {
      setIsOfflineMode(true);
      searchOffline("inventory", "").then(setOfflineData).catch(() => {});
    } else if (isConnected && !isError) {
      setIsOfflineMode(false);
    }
  }, [isConnected, isError, searchOffline]);

  const onlineMaterials = Array.isArray(data) ? data : [];
  const materials: Record<string, unknown>[] = isOfflineMode ? offlineData : onlineMaterials;
  const alertList = Array.isArray(alerts) ? alerts : [];
  const activeAlerts = alertList.filter((a: Record<string, unknown>) => a.status !== "resolved" && a.status !== "acknowledged");

  const filtered = materials.filter((m: Record<string, unknown>) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      String(m.materialName || m.item_name || m.name || "").toLowerCase().includes(term) ||
      String(m.sku || m.item_number || m.code || "").toLowerCase().includes(term) ||
      String(m.category || "").toLowerCase().includes(term)
    );
  });

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>חומרי גלם ומלאי</Text>
          <Text style={styles.subtitle}>{filtered.length} פריטים</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {isOfflineMode && (
        <View style={styles.offlineBanner}>
          <Feather name="wifi-off" size={14} color={Colors.light.warning} />
          <Text style={styles.offlineBannerText}>מצב לא מקוון - נתונים מקומיים</Text>
        </View>
      )}

      {activeAlerts.length > 0 && (
        <View style={styles.alertBanner}>
          <Feather name="alert-triangle" size={16} color={Colors.light.warning} />
          <Text style={styles.alertText}>{activeAlerts.length} התראות מלאי פעילות</Text>
        </View>
      )}

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש חומרים..."
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
          renderItem={({ item }) => <MaterialRow material={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="package" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין חומרי גלם</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function MaterialRow({ material }: { material: any }) {
  const currentQty = Number(material.currentStock || material.current_stock || material.quantity || 0);
  const minQty = Number(material.minimumStock || material.minimum_stock || material.reorderPoint || 0);
  const isLow = minQty > 0 && currentQty <= minQty;
  const stockColor = isLow ? Colors.light.danger : Colors.light.success;

  return (
    <View style={styles.materialCard}>
      <View style={[styles.materialIcon, { backgroundColor: isLow ? Colors.light.danger + "15" : Colors.light.primary + "15" }]}>
        <Feather name="package" size={20} color={isLow ? Colors.light.danger : Colors.light.primary} />
      </View>
      <View style={styles.materialInfo}>
        <Text style={styles.materialName}>{material.materialName || material.name || "—"}</Text>
        {(material.materialNumber || material.sku) && <Text style={styles.materialSku}>{material.materialNumber || material.sku}</Text>}
        {material.category && <Text style={styles.materialCategory}>{material.category}</Text>}
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[styles.qty, { color: stockColor }]}>
          {currentQty} {material.unit || ""}
        </Text>
        {minQty > 0 && (
          <Text style={styles.minQty}>מינ׳: {minQty}</Text>
        )}
        {isLow && (
          <View style={styles.lowBadge}>
            <Text style={styles.lowText}>מלאי נמוך</Text>
          </View>
        )}
      </View>
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center" },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.warning + "18",
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  alertText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.warning },
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
  materialCard: {
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
  materialIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  materialInfo: { flex: 1 },
  materialName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  materialSku: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  materialCategory: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  qty: { fontSize: 16, fontFamily: "Inter_700Bold" },
  minQty: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  lowBadge: { backgroundColor: Colors.light.danger + "15", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lowText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: Colors.light.danger },
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
