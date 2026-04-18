import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";

interface WMSAction {
  title: string;
  titleEn: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
}

const WMS_ACTIONS: WMSAction[] = [
  {
    title: "קבלת סחורה",
    titleEn: "Goods Receiving",
    description: "סרוק הזמנת רכש וקבל פריטים",
    icon: "download",
    route: "/warehouse/scan-receipt",
    color: "#7c3aed",
  },
  {
    title: "ליקוט",
    titleEn: "Picking",
    description: "ליקוט פריטים לפי רשימת ליקוט",
    icon: "hand-right",
    route: "/warehouse/pick",
    color: "#1d4ed8",
  },
  {
    title: "העברת מלאי",
    titleEn: "Stock Transfer",
    description: "העבר מלאי בין מחסנים",
    icon: "swap-horizontal",
    route: "/warehouse/transfer",
    color: "#059669",
  },
  {
    title: "ספירת מחזור",
    titleEn: "Cycle Count",
    description: "ספור מלאי ובדוק פערים",
    icon: "calculator",
    route: "/warehouse/count",
    color: "#0ea5e9",
  },
  {
    title: "אחסון",
    titleEn: "Putaway",
    description: "אחסן פריטים שהתקבלו",
    icon: "cube",
    route: "/warehouse/putaway",
    color: "#d97706",
  },
];

export default function WarehouseIndexScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>מחסן</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>פעולות מחסן</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="business" size={28} color={colors.primary} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {Platform.OS !== "web" && (
          <View style={[styles.offlineBadge, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
            <Ionicons name="wifi" size={14} color={colors.success || "#10b981"} />
            <Text style={[styles.offlineBadgeText, { color: colors.textSecondary }]}>
              כל הפעולות זמינות אופליין עם סנכרון אוטומטי
            </Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>בחר פעולה</Text>

        <View style={styles.actionsGrid}>
          {WMS_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.route}
              style={[styles.actionCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
              onPress={() => router.push(action.route as never)}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconBox, { backgroundColor: action.color + "18" }]}>
                <Ionicons name={action.icon} size={28} color={action.color} />
              </View>
              <View style={styles.actionText}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>{action.title}</Text>
                <Text style={[styles.actionTitleEn, { color: action.color }]}>{action.titleEn}</Text>
                <Text style={[styles.actionDesc, { color: colors.textSecondary }]}>{action.description}</Text>
              </View>
              <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {Platform.OS === "web" && (
          <View style={[styles.webNote, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
            <Ionicons name="information-circle" size={18} color={colors.textMuted} />
            <Text style={[styles.webNoteText, { color: colors.textSecondary }]}>
              סריקת ברקוד זמינה באפליקציה הנייטיבית בלבד. ניתן להשתמש בהזנה ידנית.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: { padding: 4 },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "right" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "right" },
  headerIcon: { padding: 4 },
  content: { padding: 16, gap: 12 },
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  offlineBadgeText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, textAlign: "right" },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "right", marginBottom: 4 },
  actionsGrid: { gap: 10 },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { flex: 1 },
  actionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "right" },
  actionTitleEn: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "right", marginBottom: 2 },
  actionDesc: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "right" },
  webNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  webNoteText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, textAlign: "right" },
});
