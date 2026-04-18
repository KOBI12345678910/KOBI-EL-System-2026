import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
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

interface LocationPing {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  created_at: string;
}

interface TrackingStats {
  savedLocationsCount: number;
  activeSharesCount: number;
  todayPingsCount: number;
  totalDistanceKm: number;
  activeFieldWorkers: number;
  isManager: boolean;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function GpsTrackingScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");

  const { data: statsData, isLoading: statsLoading } = useQuery<TrackingStats>({
    queryKey: ["gps-tracking-stats-web"],
    queryFn: async () => {
      const res = await api.authFetch("/api/field-ops/gps/tracking-stats");
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: pingsData, isLoading: pingsLoading } = useQuery<{ pings: LocationPing[] }>({
    queryKey: ["gps-pings-web"],
    queryFn: async () => {
      const res = await api.authFetch("/api/field-ops/location-pings?limit=50");
      if (!res.ok) throw new Error("Failed to load pings");
      return res.json();
    },
    enabled: activeTab === "history",
  });

  const stats = statsData;
  const pings = pingsData?.pings || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-right" size={20} color={Colors.light.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>מעקב GPS</Text>
            <Text style={styles.headerSubtitle}>סטטיסטיקות והיסטוריה</Text>
          </View>
          <Feather name="map-pin" size={24} color={Colors.light.primary} />
        </View>
      </View>

      <View style={styles.tabBar}>
        <Pressable onPress={() => setActiveTab("overview")} style={[styles.tab, activeTab === "overview" && styles.tabActive]}>
          <Feather name="bar-chart-2" size={16} color={activeTab === "overview" ? Colors.light.primary : Colors.light.textMuted} />
          <Text style={[styles.tabText, activeTab === "overview" && styles.tabTextActive]}>סקירה</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab("history")} style={[styles.tab, activeTab === "history" && styles.tabActive]}>
          <Feather name="clock" size={16} color={activeTab === "history" ? Colors.light.primary : Colors.light.textMuted} />
          <Text style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>היסטוריה</Text>
        </Pressable>
      </View>

      {activeTab === "overview" ? (
        <ScrollView style={styles.content} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {statsLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
              <Text style={styles.loadingText}>טוען סטטיסטיקות...</Text>
            </View>
          ) : stats ? (
            <>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { borderLeftColor: "#3b82f6" }]}>
                  <Feather name="navigation" size={20} color="#3b82f6" />
                  <Text style={styles.statValue}>{stats.totalDistanceKm} ק״מ</Text>
                  <Text style={styles.statLabel}>מרחק היום</Text>
                </View>
                <View style={[styles.statCard, { borderLeftColor: "#10b981" }]}>
                  <Feather name="bookmark" size={20} color="#10b981" />
                  <Text style={styles.statValue}>{stats.savedLocationsCount}</Text>
                  <Text style={styles.statLabel}>מיקומים שמורים</Text>
                </View>
              </View>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { borderLeftColor: "#8b5cf6" }]}>
                  <Feather name="share-2" size={20} color="#8b5cf6" />
                  <Text style={styles.statValue}>{stats.activeSharesCount}</Text>
                  <Text style={styles.statLabel}>שיתופים פעילים</Text>
                </View>
                <View style={[styles.statCard, { borderLeftColor: "#f59e0b" }]}>
                  <Feather name="map-pin" size={20} color="#f59e0b" />
                  <Text style={styles.statValue}>{stats.todayPingsCount}</Text>
                  <Text style={styles.statLabel}>נקודות מעקב</Text>
                </View>
              </View>
              {stats.isManager && (
                <View style={[styles.statCardWide, { borderLeftColor: "#ef4444" }]}>
                  <Feather name="users" size={20} color="#ef4444" />
                  <View style={{ marginRight: 12 }}>
                    <Text style={styles.statValue}>{stats.activeFieldWorkers}</Text>
                    <Text style={styles.statLabel}>עובדי שטח פעילים</Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Feather name="alert-circle" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>לא ניתן לטעון סטטיסטיקות</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.content}>
          {pingsLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
              <Text style={styles.loadingText}>טוען היסטוריה...</Text>
            </View>
          ) : pings.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="clock" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין היסטוריית מעקב</Text>
              <Text style={styles.emptySubtext}>נתוני מעקב GPS יופיעו כאן</Text>
            </View>
          ) : (
            <FlatList
              data={pings}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => Linking.openURL(`https://www.google.com/maps?q=${item.latitude},${item.longitude}`)}
                  style={styles.pingItem}>
                  <View style={styles.pingDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pingCoords}>{Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}</Text>
                    <Text style={styles.pingTime}>{formatDate(item.created_at)} {formatTime(item.created_at)}</Text>
                    {item.accuracy != null && (
                      <Text style={styles.pingAccuracy}>דיוק: {Math.round(item.accuracy)} מ׳</Text>
                    )}
                  </View>
                  <Feather name="external-link" size={16} color={Colors.light.textMuted} />
                </Pressable>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.light.card, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.light.text, textAlign: "right" },
  headerSubtitle: { fontSize: 12, color: Colors.light.textMuted, textAlign: "right", marginTop: 2 },
  tabBar: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.card },
  tab: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.light.primary },
  tabText: { fontSize: 13, color: Colors.light.textMuted, fontWeight: "500" },
  tabTextActive: { color: Colors.light.primary, fontWeight: "600" },
  content: { flex: 1 },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 14, color: Colors.light.textMuted },
  statsGrid: { flexDirection: "row-reverse", gap: 12 },
  statCard: { flex: 1, backgroundColor: Colors.light.card, borderRadius: 12, padding: 16, borderLeftWidth: 3, alignItems: "flex-end" },
  statCardWide: { backgroundColor: Colors.light.card, borderRadius: 12, padding: 16, borderLeftWidth: 3, flexDirection: "row-reverse", alignItems: "center" },
  statValue: { fontSize: 24, fontWeight: "700", color: Colors.light.text, marginTop: 8 },
  statLabel: { fontSize: 11, color: Colors.light.textMuted, marginTop: 2 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 16, color: Colors.light.textMuted, fontWeight: "600" },
  emptySubtext: { fontSize: 13, color: Colors.light.textMuted },
  pingItem: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 4, backgroundColor: Colors.light.card, borderRadius: 10 },
  pingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3b82f6" },
  pingCoords: { fontSize: 12, fontFamily: Platform.OS === "web" ? "monospace" : undefined, color: Colors.light.text, textAlign: "right" },
  pingTime: { fontSize: 11, color: Colors.light.textMuted, textAlign: "right", marginTop: 2 },
  pingAccuracy: { fontSize: 10, color: Colors.light.textMuted, textAlign: "right", marginTop: 1 },
});

export default function GpsTrackingWrapper() {
  return (
    <AuthGuard>
      <GpsTrackingScreen />
    </AuthGuard>
  );
}
