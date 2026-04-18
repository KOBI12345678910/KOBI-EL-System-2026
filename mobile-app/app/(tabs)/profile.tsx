import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useBiometric } from "@/contexts/BiometricContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const { isBiometricAvailable, isBiometricEnabled, biometricType } = useBiometric();

  const handleLogout = () => {
    Alert.alert("התנתקות", "האם אתה בטוח שברצונך להתנתק?", [
      { text: "ביטול", style: "cancel" },
      {
        text: "התנתק",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const displayName = user?.fullNameHe || user?.fullName || user?.username || "";
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2);

  const getBiometricLabel = () => {
    if (biometricType === "facial") return "Face ID";
    if (biometricType === "fingerprint") return "טביעת אצבע";
    return "ביומטריקה";
  };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
          <Text style={[styles.role, { color: colors.textSecondary }]}>
            {user?.jobTitle || user?.department || "משתמש"}
          </Text>
          {user?.isSuperAdmin && (
            <View style={[styles.adminBadge, { backgroundColor: colors.primary + "12" }]}>
              <Feather name="shield" size={12} color={colors.primary} />
              <Text style={[styles.adminText, { color: colors.primary }]}>מנהל מערכת</Text>
            </View>
          )}
          {isBiometricAvailable && isBiometricEnabled && (
            <View style={[styles.adminBadge, { backgroundColor: colors.success + "15", marginTop: 4 }]}>
              <Feather name="shield" size={12} color={colors.success} />
              <Text style={[styles.adminText, { color: colors.success }]}>{getBiometricLabel()} מופעל</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>פרטים אישיים</Text>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            <InfoRow icon="user" label="שם מלא" value={user?.fullName || ""} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <InfoRow icon="mail" label="אימייל" value={user?.email || ""} colors={colors} />
            {user?.phone && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <InfoRow icon="phone" label="טלפון" value={user.phone} colors={colors} />
              </>
            )}
            {user?.department && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <InfoRow icon="briefcase" label="מחלקה" value={user.department} colors={colors} />
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>AI וכלים</Text>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            <MenuItem icon="cpu" label="צ'אט AI (עוזי)" onPress={() => router.push("/ai-chat")} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem icon="terminal" label="Kimi Terminal" onPress={() => router.push("/kimi-terminal")} colors={colors} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>קיצורים</Text>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            <MenuItem icon="folder" label="מסמכים" onPress={() => router.push("/documents")} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem icon="bar-chart-2" label="דוחות" onPress={() => router.push("/reports")} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem icon="check-square" label="אישורים" onPress={() => router.push("/approvals")} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem icon="message-circle" label="הודעות" onPress={() => router.push("/chat")} colors={colors} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>מערכת</Text>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            <MenuItem icon="settings" label="הגדרות" onPress={() => router.push("/settings")} colors={colors} />
            {user?.isSuperAdmin && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <MenuItem icon="users" label="ניהול משתמשים" onPress={() => router.push("/users-admin")} colors={colors} />
              </>
            )}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.logoutBtn,
            { backgroundColor: colors.danger + "10" },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleLogout}
        >
          <Feather name="log-out" size={18} color={colors.danger} />
          <Text style={[styles.logoutText, { color: colors.danger }]}>התנתק</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

type Colors = ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];

function InfoRow({ icon, label, value, colors }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; colors: Colors }) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={16} color={colors.textMuted} />
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function MenuItem({ icon, label, onPress, colors }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; colors: Colors }) {
  return (
    <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <Feather name={icon} size={18} color={colors.text} />
      <Text style={[styles.menuLabel, { color: colors.text }]}>{label}</Text>
      <Feather name="chevron-left" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
  },
  profileHeader: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 24,
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  name: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  role: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  adminText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
    textAlign: "right",
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  infoValue: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
    marginTop: 1,
  },
  divider: {
    height: 1,
    marginHorizontal: 14,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
