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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/ThemeContext";
import * as api from "@/lib/api";

const WMS_SHORTCUTS = [
  { label: "קבלת סחורה", icon: "download-cloud" as const, route: "/warehouse/scan-receipt", color: "#7c3aed" },
  { label: "ליקוט", icon: "list" as const, route: "/warehouse/pick", color: "#1d4ed8" },
  { label: "העברה", icon: "repeat" as const, route: "/warehouse/transfer", color: "#059669" },
  { label: "ספירה", icon: "layers" as const, route: "/warehouse/count", color: "#0ea5e9" },
  { label: "אחסון", icon: "archive" as const, route: "/warehouse/putaway", color: "#d97706" },
];

const MODULE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  crm: "users",
  hr: "briefcase",
  finance: "dollar-sign",
  procurement: "shopping-cart",
  inventory: "package",
  production: "tool",
  maintenance: "settings",
  projects: "clipboard",
  logistics: "truck",
  imports: "globe",
  compliance: "shield",
  reports: "bar-chart-2",
  default: "layers",
};

interface ErmModule {
  id: number | string;
  name?: string;
  nameHe?: string;
  description?: string;
  slug?: string;
  status?: string;
  icon?: string;
  category?: string;
  entities?: unknown[];
  [key: string]: unknown;
}

function getModuleIcon(slug: string): keyof typeof Feather.glyphMap {
  const lower = (slug || "").toLowerCase();
  for (const [key, icon] of Object.entries(MODULE_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return MODULE_ICONS.default;
}

const MODULE_COLORS = [
  "#1B4332", "#2D6A4F", "#40916C", "#52B788",
  "#1A535C", "#4ECDC4", "#3D405B", "#E07A5F",
  "#264653", "#2A9D8F", "#E76F51", "#F4A261",
];

export default function ModulesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");

  const { data: modules, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["modules"],
    queryFn: api.getModules,
  });

  const filtered = ((modules || []) as ErmModule[]).filter((m) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (m.name || "").toLowerCase().includes(term) ||
      (m.nameHe || "").toLowerCase().includes(term) ||
      (m.description || "").toLowerCase().includes(term)
    );
  });

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>מודולים</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{filtered.length} מודולים זמינים</Text>
      </View>

      <View style={[styles.searchWrapper, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש מודולים..."
          placeholderTextColor={colors.textMuted}
          textAlign="right"
        />
        {!!search && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        >
          <View style={[styles.wmsSection, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
            <Pressable style={styles.wmsSectionHeader} onPress={() => router.push("/warehouse" as never)}>
              <Feather name="package" size={18} color="#d97706" />
              <Text style={[styles.wmsSectionTitle, { color: colors.text }]}>מחסן (WMS)</Text>
              <Feather name="chevron-left" size={16} color={colors.textMuted} />
            </Pressable>
            <View style={styles.wmsGrid}>
              {WMS_SHORTCUTS.map((item) => (
                <Pressable key={item.route} style={[styles.wmsChip, { backgroundColor: item.color + "18" }]}
                  onPress={() => router.push(item.route as never)}>
                  <Feather name={item.icon} size={16} color={item.color} />
                  <Text style={[styles.wmsChipLabel, { color: item.color }]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="inbox" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>אין מודולים זמינים</Text>
            </View>
          ) : (
            <View style={[styles.listContent, { paddingBottom: 100 }]}>
              {filtered.map((item, index) => (
                <ModuleItem key={String(item.id)} module={item} index={index} colors={colors} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

type Colors = ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];

function ModuleItem({ module: mod, index, colors }: { module: ErmModule; index: number; colors: Colors }) {
  const color = MODULE_COLORS[index % MODULE_COLORS.length];
  const entitiesCount = mod.entities?.length || 0;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.moduleCard,
        { backgroundColor: colors.surfaceCard },
        pressed && styles.moduleCardPressed,
      ]}
      onPress={() =>
        router.push({ pathname: "/module/[id]", params: { id: String(mod.id) } })
      }
    >
      <View style={[styles.moduleIconWrap, { backgroundColor: color + "15" }]}>
        <Feather name={getModuleIcon(mod.slug || mod.name || "")} size={22} color={color} />
      </View>
      <View style={styles.moduleInfo}>
        <Text style={[styles.moduleName, { color: colors.text }]} numberOfLines={1}>
          {String(mod.nameHe || mod.name || "")}
        </Text>
        <Text style={[styles.moduleDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {String(mod.description || mod.category || "")}
        </Text>
        {entitiesCount > 0 && (
          <Text style={[styles.moduleCount, { color: colors.accent }]}>{entitiesCount} ישויות</Text>
        )}
      </View>
      <Feather name="chevron-left" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 2,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    marginHorizontal: 20,
    marginVertical: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  moduleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  moduleCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  moduleIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleInfo: {
    flex: 1,
    gap: 2,
  },
  moduleName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  moduleDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  moduleCount: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  wmsSection: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  wmsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  wmsSectionTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
  wmsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  wmsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  wmsChipLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
});
