import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  type SyncProgress,
  getSyncProfiles,
  runFullSync,
  subscribeSyncProgress,
  syncProfile,
} from "@/lib/data-sync-manager";
import * as offlineDb from "@/lib/offline-db";

const DATA_TYPE_ICONS: Record<string, string> = {
  customers: "people",
  products: "cube",
  work_orders: "construct",
  inventory: "layers",
  price_lists: "pricetag",
};

export default function SyncStatusScreen() {
  const [progress, setProgress] = useState<SyncProgress>({
    currentProfile: "",
    currentLabel: "",
    totalProfiles: 0,
    completedProfiles: 0,
    status: "idle",
    conflictsDetected: 0,
    failedProfiles: [],
  });
  const [syncMeta, setSyncMeta] = useState<Record<string, { lastSyncedAt: string | null; lastServerTimestamp: string | null; recordCount: number; sizeBytes: number }>>({});
  const [storageUsage, setStorageUsage] = useState(0);
  const [conflicts, setConflicts] = useState<Record<string, unknown>[]>([]);

  const loadMeta = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const meta = await offlineDb.getSyncMetaAll();
      setSyncMeta(meta);
      const usage = await offlineDb.getStorageUsage();
      setStorageUsage(usage);
      const c = await offlineDb.getUnreviewedConflicts();
      setConflicts(c);
    } catch {}
  }, []);

  useEffect(() => {
    loadMeta();
    const unsub = subscribeSyncProgress((p) => {
      setProgress(p);
      if (p.status === "complete") {
        setTimeout(loadMeta, 500);
      }
    });
    return unsub;
  }, [loadMeta]);

  const handleFullSync = useCallback(() => {
    runFullSync().catch(() => {});
  }, []);

  const handleSyncProfile = useCallback((key: string) => {
    syncProfile(key).catch(() => {});
  }, []);

  const handleClearData = useCallback(() => {
    Alert.alert(
      "מחיקת נתונים מקומיים",
      "האם למחוק את כל הנתונים המאוחסנים במכשיר?",
      [
        { text: "ביטול", style: "cancel" },
        {
          text: "מחק",
          style: "destructive",
          onPress: async () => {
            await offlineDb.clearAllOfflineData();
            loadMeta();
          },
        },
      ]
    );
  }, [loadMeta]);

  const handleReviewConflict = useCallback(async (id: number) => {
    await offlineDb.markConflictReviewed(id);
    loadMeta();
  }, [loadMeta]);

  const profiles = getSyncProfiles();
  const isSyncing = progress.status === "syncing";

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatTime(iso: string | null): string {
    if (!iso) return "לא סונכרן";
    const d = new Date(iso);
    return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-forward" size={24} color="#94a3b8" />
        </Pressable>
        <Text style={styles.headerTitle}>סטטוס סנכרון</Text>
        <Pressable onPress={handleFullSync} disabled={isSyncing}>
          {isSyncing ? (
            <ActivityIndicator size="small" color="#60a5fa" />
          ) : (
            <Ionicons name="sync" size={22} color="#60a5fa" />
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isSyncing && (
          <View style={styles.syncingBanner}>
            <ActivityIndicator size="small" color="#60a5fa" />
            <Text style={styles.syncingText}>
              מסנכרן: {progress.currentLabel} ({progress.completedProfiles}/{progress.totalProfiles})
            </Text>
          </View>
        )}

        <View style={styles.storageCard}>
          <View style={styles.storageHeader}>
            <Ionicons name="hardware-chip-outline" size={20} color="#60a5fa" />
            <Text style={styles.storageTitle}>אחסון מקומי</Text>
          </View>
          <Text style={styles.storageValue}>{formatBytes(storageUsage)}</Text>
          <Pressable onPress={handleClearData} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text style={styles.clearText}>מחק הכל</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>פרופילי סנכרון</Text>
        {profiles.map((p) => {
          const meta = syncMeta[p.key];
          const isActive = isSyncing && progress.currentProfile === p.key;
          return (
            <Pressable key={p.key} style={[styles.profileCard, isActive && styles.profileActive]} onPress={() => handleSyncProfile(p.key)}>
              <View style={styles.profileHeader}>
                <Ionicons name={(DATA_TYPE_ICONS[p.key] || "document") as keyof typeof Ionicons.glyphMap} size={20} color={isActive ? "#60a5fa" : "#94a3b8"} />
                <Text style={styles.profileLabel}>{p.label}</Text>
                {isActive && <ActivityIndicator size="small" color="#60a5fa" />}
              </View>
              <View style={styles.profileMeta}>
                <Text style={styles.metaText}>
                  {meta ? `${meta.recordCount} רשומות` : "לא סונכרן"}
                </Text>
                <Text style={styles.metaText}>
                  {meta ? formatTime(meta.lastSyncedAt) : "—"}
                </Text>
              </View>
              <Text style={styles.intervalText}>
                מרווח: {Math.round(p.intervalMs / 60000)} דקות
              </Text>
            </Pressable>
          );
        })}

        {conflicts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>התנגשויות ({conflicts.length})</Text>
            {conflicts.map((c) => (
              <View key={String(c.id)} style={styles.conflictCard}>
                <View style={styles.conflictHeader}>
                  <Ionicons name="warning" size={18} color="#f59e0b" />
                  <Text style={styles.conflictType}>
                    {String(c.data_type)} #{String(c.record_id)}
                  </Text>
                </View>
                <Text style={styles.conflictRes}>
                  פתרון: {String(c.resolution) === "server_wins" ? "עדכון מהשרת" : String(c.resolution)}
                </Text>
                <Pressable style={styles.reviewBtn} onPress={() => handleReviewConflict(Number(c.id))}>
                  <Text style={styles.reviewText}>סמן כנבדק</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        <Pressable style={styles.fullSyncBtn} onPress={handleFullSync} disabled={isSyncing}>
          <Ionicons name="cloud-download-outline" size={20} color="#fff" />
          <Text style={styles.fullSyncText}>סנכרון מלא</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  backBtn: { padding: 4 },
  headerTitle: { color: "#f1f5f9", fontSize: 18, fontWeight: "700" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  syncingBanner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  syncingText: { color: "#60a5fa", fontSize: 14, textAlign: "right" },
  storageCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  storageHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  storageTitle: { color: "#e2e8f0", fontSize: 15, fontWeight: "600" },
  storageValue: { color: "#60a5fa", fontSize: 24, fontWeight: "700", textAlign: "right" },
  clearBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    alignSelf: "flex-end",
  },
  clearText: { color: "#ef4444", fontSize: 13 },
  sectionTitle: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    marginBottom: 10,
    marginTop: 4,
  },
  profileCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  profileActive: { borderColor: "#3b82f6" },
  profileHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  profileLabel: { color: "#e2e8f0", fontSize: 15, fontWeight: "600", flex: 1, textAlign: "right" },
  profileMeta: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metaText: { color: "#64748b", fontSize: 12 },
  intervalText: { color: "#475569", fontSize: 11, textAlign: "right" },
  conflictCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#f59e0b33",
  },
  conflictHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  conflictType: { color: "#fbbf24", fontSize: 14, fontWeight: "500" },
  conflictRes: { color: "#94a3b8", fontSize: 12, textAlign: "right" },
  reviewBtn: {
    marginTop: 8,
    alignSelf: "flex-end",
    backgroundColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  reviewText: { color: "#60a5fa", fontSize: 12 },
  fullSyncBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  fullSyncText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
