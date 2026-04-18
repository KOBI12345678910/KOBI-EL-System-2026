import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/ThemeContext";
import * as api from "@/lib/api";

type FeatherIconName = keyof typeof Feather.glyphMap;

interface SearchResult {
  id: number;
  type: "employee" | "customer" | "supplier" | "order" | "document" | "module";
  title: string;
  subtitle: string;
  icon: FeatherIconName;
  route: string;
}

interface GlobalSearchProps {
  visible: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<SearchResult["type"], string> = {
  employee: "עובד",
  customer: "לקוח",
  supplier: "ספק",
  order: "הזמנה",
  document: "מסמך",
  module: "מודול",
};

const TYPE_COLORS: Record<SearchResult["type"], string> = {
  employee: "#3B82F6",
  customer: "#E07A5F",
  supplier: "#10B981",
  order: "#F59E0B",
  document: "#8B5CF6",
  module: "#6366F1",
};

const TYPE_ICONS: Record<SearchResult["type"], FeatherIconName> = {
  employee: "user",
  customer: "users",
  supplier: "briefcase",
  order: "shopping-bag",
  document: "file-text",
  module: "layers",
};

const VALID_ROUTES = [
  "/hr/employees",
  "/crm/customers",
  "/procurement/suppliers",
  "/procurement/orders",
  "/modules",
  "/documents",
] as const;
type ValidRoute = (typeof VALID_ROUTES)[number];

function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    for (const key of ["employees", "customers", "suppliers", "orders", "files", "data", "items"]) {
      const sub = (v as Record<string, unknown>)[key];
      if (Array.isArray(sub)) return sub as T[];
    }
  }
  return [];
}

function matches(text: string | null | undefined, q: string): boolean {
  return !!(text && text.toLowerCase().includes(q.toLowerCase()));
}

export function GlobalSearch({ visible, onClose }: GlobalSearchProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      setQuery("");
      setResults([]);
    }
  }, [visible]);

  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const all: SearchResult[] = [];

    try {
      const [empRes, custRes, supRes, ordRes, modRes, docRes] = await Promise.allSettled([
        api.getEmployees({ search: q, limit: 5 }),
        api.getCrmCustomers({ search: q, limit: 5 }),
        api.getSuppliers({ search: q, limit: 5 }),
        api.getPurchaseOrders({ limit: 15 }),
        api.getModules(),
        api.getDocumentFiles({ search: q }),
      ]);

      if (empRes.status === "fulfilled") {
        type Emp = { id: number; fullName?: string; name?: string; department?: string; position?: string };
        toArray<Emp>(empRes.value).slice(0, 4).forEach((e) => {
          all.push({
            id: e.id,
            type: "employee",
            title: e.fullName || e.name || `עובד #${e.id}`,
            subtitle: e.department || e.position || "",
            icon: TYPE_ICONS.employee,
            route: "/hr/employees",
          });
        });
      }

      if (custRes.status === "fulfilled") {
        type Cust = { id: number; name?: string; nameHe?: string; contactName?: string; email?: string; city?: string };
        toArray<Cust>(custRes.value)
          .filter((c) => matches(c.name, q) || matches(c.nameHe, q) || matches(c.contactName, q))
          .slice(0, 4)
          .forEach((c) => {
            all.push({
              id: c.id,
              type: "customer",
              title: c.nameHe || c.name || `לקוח #${c.id}`,
              subtitle: c.contactName || c.city || c.email || "",
              icon: TYPE_ICONS.customer,
              route: "/crm/customers",
            });
          });
      }

      if (supRes.status === "fulfilled") {
        type Sup = { id: number; name?: string; nameHe?: string; city?: string; contactEmail?: string };
        toArray<Sup>(supRes.value)
          .filter((s) => matches(s.name, q) || matches(s.nameHe, q))
          .slice(0, 4)
          .forEach((s) => {
            all.push({
              id: s.id,
              type: "supplier",
              title: s.nameHe || s.name || `ספק #${s.id}`,
              subtitle: s.city || s.contactEmail || "",
              icon: TYPE_ICONS.supplier,
              route: "/procurement/suppliers",
            });
          });
      }

      if (ordRes.status === "fulfilled") {
        type Ord = { id: number; orderNumber?: string; supplierName?: string; status?: string };
        toArray<Ord>(ordRes.value)
          .filter((o) => matches(o.orderNumber, q) || matches(o.supplierName, q) || matches(o.status, q))
          .slice(0, 4)
          .forEach((o) => {
            all.push({
              id: o.id,
              type: "order",
              title: `הזמנה ${o.orderNumber || `#${o.id}`}`,
              subtitle: o.supplierName || o.status || "",
              icon: TYPE_ICONS.order,
              route: "/procurement/orders",
            });
          });
      }

      if (modRes.status === "fulfilled") {
        type Mod = { id: number; name?: string; nameHe?: string; description?: string };
        toArray<Mod>(modRes.value)
          .filter((m) => matches(m.nameHe, q) || matches(m.name, q))
          .slice(0, 3)
          .forEach((m) => {
            all.push({
              id: m.id,
              type: "module",
              title: m.nameHe || m.name || `מודול #${m.id}`,
              subtitle: m.description || "",
              icon: TYPE_ICONS.module,
              route: "/modules",
            });
          });
      }

      if (docRes.status === "fulfilled") {
        type Doc = { id: number; name?: string; originalName?: string; mimeType?: string };
        toArray<Doc>(docRes.value)
          .filter((f) => matches(f.name, q) || matches(f.originalName, q))
          .slice(0, 3)
          .forEach((f) => {
            all.push({
              id: f.id,
              type: "document",
              title: f.originalName || f.name || `קובץ #${f.id}`,
              subtitle: f.mimeType || "",
              icon: TYPE_ICONS.document,
              route: "/documents",
            });
          });
      }
    } catch {
    }

    setResults(all);
    setIsSearching(false);
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => performSearch(text), 350);
  };

  const handleSelect = (result: SearchResult) => {
    onClose();
    const route = VALID_ROUTES.includes(result.route as ValidRoute)
      ? (result.route as ValidRoute)
      : "/modules";
    router.push(route);
  };

  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 16 : insets.top + 8 }]}>
          <View style={styles.searchBar}>
            <Feather name="search" size={18} color={colors.textMuted} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="חפש עובד, ספק, הזמנה, מסמך..."
              placeholderTextColor={colors.textMuted}
              textAlign="right"
              returnKeyType="search"
              onSubmitEditing={() => performSearch(query)}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {isSearching ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : query.length > 0 ? (
              <Pressable onPress={() => { setQuery(""); setResults([]); }} hitSlop={8}>
                <Feather name="x" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {results.length > 0 && (
            <FlatList
              data={results}
              keyExtractor={(item) => `${item.type}-${item.id}`}
              style={styles.resultsList}
              keyboardShouldPersistTaps="always"
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.resultItem, pressed && { opacity: 0.75 }]}
                  onPress={() => handleSelect(item)}
                >
                  <View style={[styles.resultIcon, { backgroundColor: TYPE_COLORS[item.type] + "18" }]}>
                    <Feather name={item.icon} size={16} color={TYPE_COLORS[item.type]} />
                  </View>
                  <View style={styles.resultText}>
                    <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                    {item.subtitle ? (
                      <Text style={styles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.resultBadge, { backgroundColor: TYPE_COLORS[item.type] + "15" }]}>
                    <Text style={[styles.resultBadgeText, { color: TYPE_COLORS[item.type] }]}>
                      {TYPE_LABELS[item.type]}
                    </Text>
                  </View>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}

          {query.length >= 2 && results.length === 0 && !isSearching && (
            <View style={styles.emptyState}>
              <Feather name="search" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>לא נמצאו תוצאות עבור "{query}"</Text>
            </View>
          )}

          {query.length === 0 && (
            <View style={styles.hintContainer}>
              <View style={styles.hintCategories}>
                {(Object.keys(TYPE_LABELS) as SearchResult["type"][]).map((type) => (
                  <View key={type} style={[styles.hintChip, { backgroundColor: TYPE_COLORS[type] + "15" }]}>
                    <Feather name={TYPE_ICONS[type]} size={12} color={TYPE_COLORS[type]} />
                    <Text style={[styles.hintChipText, { color: TYPE_COLORS[type] }]}>{TYPE_LABELS[type]}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.hintText}>חיפוש גלובלי — הקלד לפחות 2 תווים</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"]) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    container: {
      backgroundColor: colors.surfaceCard,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      maxHeight: "80%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 16,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      margin: 12,
      marginBottom: 8,
      backgroundColor: colors.inputBg,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.text,
      padding: 0,
    },
    resultsList: {
      marginBottom: 12,
    },
    resultItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    resultIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    resultText: {
      flex: 1,
    },
    resultTitle: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.text,
      textAlign: "right",
    },
    resultSubtitle: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.textMuted,
      textAlign: "right",
      marginTop: 2,
    },
    resultBadge: {
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    resultBadgeText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
    },
    separator: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 16,
    },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 40,
      gap: 12,
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      textAlign: "center",
    },
    hintContainer: {
      alignItems: "center",
      paddingVertical: 20,
      paddingHorizontal: 16,
      gap: 12,
    },
    hintCategories: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "center",
    },
    hintChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    hintChipText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
    },
    hintText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.textMuted,
      textAlign: "center",
    },
  });
}
