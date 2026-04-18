import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
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

export default function SupplierDetailWrapper() {
  return (
    <AuthGuard>
      <SupplierDetail />
    </AuthGuard>
  );
}

function SupplierDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: supplier, isLoading } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => api.getSupplier(Number(id)),
    enabled: !!id,
  });

  const isActive = supplier?.status === "active" || !supplier?.status;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>פרטי ספק</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : !supplier ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>הספק לא נמצא</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileCard}>
            <View style={styles.supplierIcon}>
              <Feather name="truck" size={32} color={Colors.light.primary} />
            </View>
            <Text style={styles.supplierName}>{supplier.supplierName || supplier.name || "—"}</Text>
            {supplier.category && <Text style={styles.category}>{supplier.category}</Text>}
            <View style={[styles.statusBadge, { backgroundColor: isActive ? Colors.light.success + "18" : Colors.light.textMuted + "18" }]}>
              <Text style={[styles.statusText, { color: isActive ? Colors.light.success : Colors.light.textMuted }]}>
                {isActive ? "פעיל" : "לא פעיל"}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>פרטי קשר</Text>
            <InfoRow label="איש קשר" value={supplier.contactPerson || supplier.contact_person || "—"} />
            <InfoRow label="טלפון" value={supplier.phone || "—"} />
            <InfoRow label="דוא״ל" value={supplier.email || "—"} />
            <InfoRow label="כתובת" value={supplier.address || "—"} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>פרטי עסק</Text>
            <InfoRow label="ח.פ / עוסק" value={supplier.taxId || supplier.tax_id || "—"} />
            <InfoRow label="תנאי תשלום" value={supplier.paymentTerms || supplier.payment_terms || "—"} />
            <InfoRow label="מטבע" value={supplier.currency || "ILS"} />
            <InfoRow label="מדינה" value={supplier.country || "—"} />
          </View>

          {supplier.notes && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>הערות</Text>
              <Text style={styles.notesText}>{supplier.notes}</Text>
            </View>
          )}
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
  profileCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  supplierIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.light.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  supplierName: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
  category: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  statusBadge: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
  notesText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.text, textAlign: "right", lineHeight: 22 },
});
