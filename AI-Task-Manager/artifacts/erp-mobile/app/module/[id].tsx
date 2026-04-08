import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

export default function ModuleDetailScreenWrapper() {
  return (
    <AuthGuard>
      <ModuleDetailScreen />
    </AuthGuard>
  );
}

function ModuleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { data: module, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["module", id],
    queryFn: () => api.getModule(Number(id)),
    enabled: !!id,
  });

  const entities = module?.entities || [];

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {module?.nameHe || module?.name || "מודול"}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {module?.description && (
        <Text style={styles.description}>{module.description}</Text>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={entities}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <EntityItem entity={item} />}
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
            <View style={styles.emptyContainer}>
              <Feather name="database" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין ישויות במודול זה</Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              ישויות ({entities.length})
            </Text>
          }
          scrollEnabled={entities.length > 0}
        />
      )}
    </View>
  );
}

function EntityItem({ entity }: { entity: any }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.entityCard, pressed && styles.entityCardPressed]}
      onPress={() =>
        router.push({ pathname: "/entity/[id]", params: { id: String(entity.id) } })
      }
    >
      <View style={styles.entityIconWrap}>
        <Feather name="file-text" size={20} color={Colors.light.accent} />
      </View>
      <View style={styles.entityInfo}>
        <Text style={styles.entityName} numberOfLines={1}>
          {entity.nameHe || entity.name}
        </Text>
        {entity.description && (
          <Text style={styles.entityDesc} numberOfLines={1}>
            {entity.description}
          </Text>
        )}
      </View>
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
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "right",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  entityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  entityCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  entityIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.light.accent + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  entityInfo: {
    flex: 1,
    gap: 2,
  },
  entityName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  entityDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "right",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
});
