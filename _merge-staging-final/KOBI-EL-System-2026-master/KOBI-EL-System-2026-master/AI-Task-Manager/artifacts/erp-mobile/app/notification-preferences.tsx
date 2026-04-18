import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import { usePushNotifications, type NotificationCategory, type NotificationPreferences } from "@/contexts/NotificationsContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function NotificationPreferencesScreenWrapper() {
  return (
    <AuthGuard>
      <NotificationPreferencesScreen />
    </AuthGuard>
  );
}

const CATEGORY_CONFIG: {
  key: NotificationCategory;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    key: "approvals",
    icon: "check-circle",
    label: "אישורים",
    description: "בקשות אישור חדשות הממתינות לטיפולך",
    color: "#F4A261",
  },
  {
    key: "production",
    icon: "tool",
    label: "ייצור",
    description: "התראות מפקודות עבודה, עיכובים וחריגות",
    color: "#2D6A4F",
  },
  {
    key: "delivery",
    icon: "truck",
    label: "משלוחים",
    description: "עדכוני הגעה, מסירה והזמנות רכש",
    color: "#1A535C",
  },
  {
    key: "kpi",
    icon: "trending-up",
    label: "חריגות KPI",
    description: "כאשר מדד קריטי חורג מהסף שנקבע",
    color: "#E07A5F",
  },
  {
    key: "finance",
    icon: "dollar-sign",
    label: "כספים",
    description: "חשבוניות, תשלומים וגבייה",
    color: "#40916C",
  },
  {
    key: "hr",
    icon: "users",
    label: "משאבי אנוש",
    description: "בקשות חופשה, נוכחות וכוח אדם",
    color: "#7B5EA7",
  },
  {
    key: "system",
    icon: "monitor",
    label: "מערכת",
    description: "עדכוני מערכת, סנכרון וגיבויים",
    color: "#3D405B",
  },
];

function NotificationPreferencesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { preferences, updatePreferences, hasPermission, requestPermission } = usePushNotifications();

  const allEnabled = Object.values(preferences).every(Boolean);

  const toggleAll = async () => {
    const newVal = !allEnabled;
    const updated: Partial<NotificationPreferences> = {};
    for (const key of Object.keys(preferences) as NotificationCategory[]) {
      updated[key] = newVal;
    }
    await updatePreferences(updated);
  };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.text }]}>העדפות התראות</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!hasPermission && (
          <Pressable
            style={[styles.permissionBanner, { backgroundColor: colors.warning + "18", borderColor: colors.warning + "40" }]}
            onPress={requestPermission}
          >
            <Feather name="bell-off" size={20} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.permissionTitle, { color: colors.text }]}>התראות לא מופעלות</Text>
              <Text style={[styles.permissionDesc, { color: colors.textSecondary }]}>
                הקש כאן להפעלת התראות push עבור האפליקציה
              </Text>
            </View>
            <Feather name="chevron-left" size={18} color={colors.textMuted} />
          </Pressable>
        )}

        <View style={[styles.card, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <View style={styles.toggleAllRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleAllTitle, { color: colors.text }]}>כל ההתראות</Text>
              <Text style={[styles.toggleAllDesc, { color: colors.textSecondary }]}>
                הפעל או כבה את כל קטגוריות ההתראות
              </Text>
            </View>
            <Switch
              value={allEnabled}
              onValueChange={toggleAll}
              trackColor={{ false: colors.border, true: colors.primary + "80" }}
              thumbColor={allEnabled ? colors.primary : colors.textMuted}
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>קטגוריות</Text>

        <View style={[styles.card, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          {CATEGORY_CONFIG.map((cat, idx) => (
            <View key={cat.key}>
              <View style={styles.categoryRow}>
                <View style={[styles.categoryIcon, { backgroundColor: cat.color + "18" }]}>
                  <Feather name={cat.icon} size={18} color={cat.color} />
                </View>
                <View style={styles.categoryInfo}>
                  <Text style={[styles.categoryLabel, { color: colors.text }]}>{cat.label}</Text>
                  <Text style={[styles.categoryDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                    {cat.description}
                  </Text>
                </View>
                <Switch
                  value={preferences[cat.key] ?? true}
                  onValueChange={(val) => updatePreferences({ [cat.key]: val })}
                  trackColor={{ false: colors.border, true: cat.color + "80" }}
                  thumbColor={preferences[cat.key] ? cat.color : colors.textMuted}
                />
              </View>
              {idx < CATEGORY_CONFIG.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))}
        </View>

        <View style={[styles.infoBox, { backgroundColor: colors.primary + "08", borderColor: colors.primary + "20" }]}>
          <Feather name="info" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            ניתן לשנות הגדרות אלו בכל עת. התראות קריטיות ייתכן שיישלחו גם אם הקטגוריה כבויה.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 60,
    gap: 16,
  },
  permissionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  permissionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  permissionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 2,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  toggleAllRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  toggleAllTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  toggleAllDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: -8,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryInfo: {
    flex: 1,
    gap: 2,
  },
  categoryLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  categoryDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 16,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 18,
  },
});
