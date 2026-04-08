import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
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
import MobileEmptyState from "@/components/MobileEmptyState";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

export default function EntityRecordsScreenWrapper() {
  return (
    <AuthGuard>
      <EntityRecordsScreen />
    </AuthGuard>
  );
}

function EntityRecordsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const entityId = Number(id);

  const { data: fields } = useQuery({
    queryKey: ["entity-fields", entityId],
    queryFn: () => api.getEntityFields(entityId),
    enabled: !!entityId,
  });

  const { data: recordsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["entity-records", entityId, search],
    queryFn: () =>
      api.getEntityRecords(entityId, {
        limit: 50,
        search: search || undefined,
      }),
    enabled: !!entityId,
  });

  const records = recordsData?.records || (Array.isArray(recordsData) ? recordsData : []);
  const entityName = records[0]?.entityName || "רשומות";

  const displayFields = (fields || [])
    .filter((f: any) => f.showInList !== false && f.fieldType !== "system")
    .slice(0, 3);

  function getRecordTitle(record: any): string {
    const data = record.data || {};
    for (const key of ["name", "title", "שם", "כותרת", "fullName", "companyName"]) {
      if (data[key]) return String(data[key]);
    }
    const firstField = displayFields[0];
    if (firstField && data[firstField.fieldKey]) {
      return String(data[firstField.fieldKey]);
    }
    return `רשומה #${record.id}`;
  }

  function getRecordSubtitle(record: any): string {
    const data = record.data || {};
    const parts: string[] = [];
    for (const field of displayFields.slice(1)) {
      const val = data[field.fieldKey];
      if (val) parts.push(String(val));
    }
    return parts.join(" · ") || record.status || "";
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {entityName}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש רשומות..."
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

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <RecordItem
              record={item}
              entityId={entityId}
              title={getRecordTitle(item)}
              subtitle={getRecordSubtitle(item)}
            />
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
            <MobileEmptyState
              icon="file-text"
              title="אין רשומות"
              description="לא נמצאו רשומות עבור ישות זו."
            />
          }
          scrollEnabled={records.length > 0}
        />
      )}
    </View>
  );
}

function RecordItem({
  record,
  entityId,
  title,
  subtitle,
}: {
  record: any;
  entityId: number;
  title: string;
  subtitle: string;
}) {
  const statusColor =
    record.status === "active" || record.status === "פעיל"
      ? Colors.light.success
      : record.status === "draft" || record.status === "טיוטה"
        ? Colors.light.warning
        : Colors.light.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.recordCard, pressed && styles.recordCardPressed]}
      onPress={() =>
        router.push({
          pathname: "/record/[entityId]/[id]",
          params: { entityId: String(entityId), id: String(record.id) },
        })
      }
    >
      <View style={styles.recordContent}>
        <Text style={styles.recordTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.recordSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {record.status && (
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "15" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {record.status}
          </Text>
        </View>
      )}
      <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
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
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  recordCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  recordCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  recordContent: {
    flex: 1,
    gap: 3,
  },
  recordTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  recordSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "right",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
