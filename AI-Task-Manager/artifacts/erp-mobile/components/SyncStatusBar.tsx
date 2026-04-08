import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { type SyncProgress, subscribeSyncProgress } from "@/lib/data-sync-manager";

interface SyncStatusBarProps {
  onPress?: () => void;
}

export default function SyncStatusBar({ onPress }: SyncStatusBarProps) {
  const [progress, setProgress] = useState<SyncProgress>({
    currentProfile: "",
    currentLabel: "",
    totalProfiles: 0,
    completedProfiles: 0,
    status: "idle",
    conflictsDetected: 0,
    failedProfiles: [],
  });

  useEffect(() => {
    const unsub = subscribeSyncProgress(setProgress);
    return unsub;
  }, []);

  if (progress.status === "idle") return null;

  const pct = progress.totalProfiles > 0
    ? Math.round((progress.completedProfiles / progress.totalProfiles) * 100)
    : 0;

  return (
    <Pressable style={styles.container} onPress={onPress}>
      {progress.status === "syncing" && (
        <>
          <ActivityIndicator size="small" color="#60a5fa" />
          <View style={styles.textContainer}>
            <Text style={styles.label}>
              מסנכרן: {progress.currentLabel}
            </Text>
            <Text style={styles.pct}>{pct}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        </>
      )}
      {progress.status === "complete" && (
        <View style={styles.completeRow}>
          <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
          <Text style={styles.completeText}>סנכרון הושלם</Text>
        </View>
      )}
      {progress.status === "error" && (
        <View style={styles.completeRow}>
          <Ionicons name="alert-circle" size={18} color="#ef4444" />
          <Text style={styles.errorText}>שגיאה בסנכרון</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  textContainer: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 4,
  },
  label: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "right",
  },
  pct: {
    color: "#60a5fa",
    fontSize: 13,
    fontWeight: "600",
  },
  progressBar: {
    height: 4,
    backgroundColor: "#334155",
    borderRadius: 2,
    marginTop: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    backgroundColor: "#3b82f6",
    borderRadius: 2,
  },
  completeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  completeText: {
    color: "#22c55e",
    fontSize: 13,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 13,
  },
});
