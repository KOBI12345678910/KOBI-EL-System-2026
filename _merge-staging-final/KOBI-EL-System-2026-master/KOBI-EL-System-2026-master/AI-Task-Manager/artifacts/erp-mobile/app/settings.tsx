import { Feather } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useBiometric } from "@/contexts/BiometricContext";
import { usePushNotifications } from "@/contexts/NotificationsContext";
import { useTheme } from "@/contexts/ThemeContext";
import * as api from "@/lib/api";
import { GPS_PERMISSION_SHOWN_KEY } from "@/app/gps-permission";

export default function SettingsScreenWrapper() {
  return (
    <AuthGuard>
      <SettingsScreen />
    </AuthGuard>
  );
}

function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { colors, themeMode, setThemeMode, isDark } = useTheme();
  const {
    isBiometricAvailable,
    isBiometricEnabled,
    biometricType,
    enableBiometric,
    disableBiometric,
  } = useBiometric();
  const { hasPermission: hasPushPermission, requestPermission: requestPushPermission } = usePushNotifications();

  const [notifications, setNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [gpsPermissionStatus, setGpsPermissionStatus] = useState<"unknown" | "granted" | "denied">("unknown");

  React.useEffect(() => {
    if (Platform.OS === "web") return;
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => setGpsPermissionStatus(status === "granted" ? "granted" : "denied"))
      .catch(() => setGpsPermissionStatus("unknown"));
  }, []);

  const handleRequestGpsPermission = async () => {
    if (Platform.OS === "web") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg === "granted") {
        await Location.requestBackgroundPermissionsAsync();
        setGpsPermissionStatus("granted");
        await AsyncStorage.setItem(GPS_PERMISSION_SHOWN_KEY, "true");
        Alert.alert("הצלחה", "הרשאת מיקום אושרה");
      } else {
        setGpsPermissionStatus("denied");
        Alert.alert("נדחה", "יש לאפשר גישה למיקום בהגדרות המכשיר");
      }
    } catch {
      Alert.alert("שגיאה", "לא ניתן לבקש הרשאת מיקום");
    }
  };
  const [editName, setEditName] = useState(user?.fullName || "");
  const [editEmail, setEditEmail] = useState(user?.email || "");
  const [editPhone, setEditPhone] = useState(user?.phone || "");

  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const updateProfileMutation = useMutation({
    mutationFn: (data: { fullName?: string; email?: string; phone?: string }) =>
      api.updateCurrentUser(data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingProfile(false);
      refreshUser();
      Alert.alert("הצלחה", "הפרופיל עודכן בהצלחה");
    },
    onError: (err: Error) => {
      Alert.alert("שגיאה", err.message || "לא ניתן לעדכן את הפרופיל");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.changePassword(data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("הצלחה", "הסיסמה שונתה בהצלחה");
    },
    onError: (err: Error) => {
      Alert.alert("שגיאה", err.message || "לא ניתן לשנות את הסיסמה");
    },
  });

  const handleSaveProfile = () => {
    if (!editName.trim()) {
      Alert.alert("שגיאה", "שם מלא הוא שדה חובה");
      return;
    }
    updateProfileMutation.mutate({
      fullName: editName.trim(),
      email: editEmail.trim() || undefined,
      phone: editPhone.trim() || undefined,
    });
  };

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("שגיאה", "יש למלא את כל השדות");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("שגיאה", "הסיסמה החדשה אינה תואמת לאישור");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("שגיאה", "הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const handleToggleBiometric = async () => {
    if (isBiometricEnabled) {
      Alert.alert(
        "כיבוי ביומטריקה",
        "האם להפסיק את הכניסה הביומטרית?",
        [
          { text: "ביטול", style: "cancel" },
          {
            text: "כבה",
            style: "destructive",
            onPress: () => {
              disableBiometric();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            },
          },
        ]
      );
    } else {
      const success = await enableBiometric();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("הצלחה", "כניסה ביומטרית הופעלה");
      }
    }
  };

  const getBiometricLabel = () => {
    if (biometricType === "facial") return "Face ID";
    if (biometricType === "fingerprint") return "טביעת אצבע";
    if (biometricType === "iris") return "זיהוי עיניים";
    return "ביומטריקה";
  };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={[styles.topBar, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.text }]}>הגדרות</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Section title="פרטי חשבון" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            {editingProfile ? (
              <>
                <LabeledInput label="שם מלא" value={editName} onChangeText={setEditName} placeholder="שם מלא" colors={colors} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <LabeledInput label="אימייל" value={editEmail} onChangeText={setEditEmail} placeholder="כתובת אימייל" keyboardType="email-address" autoCapitalize="none" colors={colors} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <LabeledInput label="טלפון" value={editPhone} onChangeText={setEditPhone} placeholder="מספר טלפון" keyboardType="phone-pad" colors={colors} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.editActions}>
                  <Pressable
                    style={[styles.cancelBtn, { backgroundColor: colors.inputBg }]}
                    onPress={() => { setEditingProfile(false); setEditName(user?.fullName || ""); setEditEmail(user?.email || ""); setEditPhone(user?.phone || ""); }}
                    disabled={updateProfileMutation.isPending}
                  >
                    <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>ביטול</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.saveBtn, { backgroundColor: colors.primary }, updateProfileMutation.isPending && { opacity: 0.6 }]}
                    onPress={handleSaveProfile}
                    disabled={updateProfileMutation.isPending}
                  >
                    {updateProfileMutation.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.saveBtnText}>שמור</Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <InfoRow icon="user" label="שם מלא" value={user?.fullName || "-"} colors={colors} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <InfoRow icon="mail" label="אימייל" value={user?.email || "-"} colors={colors} />
                {user?.department && (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <InfoRow icon="briefcase" label="מחלקה" value={user.department} colors={colors} />
                  </>
                )}
                {user?.phone && (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <InfoRow icon="phone" label="טלפון" value={user.phone} colors={colors} />
                  </>
                )}
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Pressable style={styles.menuItem} onPress={() => setEditingProfile(true)}>
                  <Feather name="edit-2" size={18} color={colors.primary} />
                  <Text style={[styles.menuLabel, { color: colors.primary }]}>ערוך פרטים</Text>
                  <Feather name="chevron-left" size={16} color={colors.textMuted} />
                </Pressable>
              </>
            )}
          </View>
        </Section>

        <Section title="שינוי סיסמה" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            {changingPassword ? (
              <>
                <LabeledInput label="סיסמה נוכחית" value={currentPassword} onChangeText={setCurrentPassword} placeholder="הסיסמה הנוכחית שלך" secureTextEntry colors={colors} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <LabeledInput label="סיסמה חדשה" value={newPassword} onChangeText={setNewPassword} placeholder="לפחות 8 תווים" secureTextEntry colors={colors} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <LabeledInput label="אישור סיסמה" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="חזור על הסיסמה החדשה" secureTextEntry colors={colors} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.editActions}>
                  <Pressable
                    style={[styles.cancelBtn, { backgroundColor: colors.inputBg }]}
                    onPress={() => { setChangingPassword(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}
                    disabled={changePasswordMutation.isPending}
                  >
                    <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>ביטול</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.saveBtn, { backgroundColor: colors.primary }, changePasswordMutation.isPending && { opacity: 0.6 }]}
                    onPress={handleChangePassword}
                    disabled={changePasswordMutation.isPending}
                  >
                    {changePasswordMutation.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.saveBtnText}>שנה סיסמה</Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable style={styles.menuItem} onPress={() => setChangingPassword(true)}>
                <Feather name="lock" size={18} color={colors.text} />
                <Text style={[styles.menuLabel, { color: colors.text }]}>שנה סיסמה</Text>
                <Feather name="chevron-left" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </Section>

        {user?.isSuperAdmin && (
          <Section title="ניהול" colors={colors}>
            <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
              <MenuItem icon="users" label="ניהול משתמשים" onPress={() => router.push("/users-admin")} colors={colors} />
            </View>
          </Section>
        )}

        <Section title="אבטחה" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            {isBiometricAvailable ? (
              <ToggleRow
                icon={biometricType === "facial" ? "eye" : "lock"}
                label={`כניסה עם ${getBiometricLabel()}`}
                value={isBiometricEnabled}
                onToggle={handleToggleBiometric}
                colors={colors}
              />
            ) : (
              <InfoRow icon="shield" label="ביומטריקה" value="לא זמין במכשיר זה" colors={colors} />
            )}
          </View>
        </Section>

        <Section title="התראות" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            <ToggleRow
              icon="bell"
              label="התראות מערכת"
              value={notifications}
              onToggle={(v) => { setNotifications(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              colors={colors}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            {Platform.OS !== "web" && (
              <>
                <ToggleRow
                  icon="smartphone"
                  label="התראות PUSH"
                  value={hasPushPermission}
                  onToggle={async (v) => {
                    if (v && !hasPushPermission) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      await requestPushPermission();
                    }
                  }}
                  colors={colors}
                />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </>
            )}
            <ToggleRow
              icon="mail"
              label="התראות אימייל"
              value={emailNotifications}
              onToggle={(v) => { setEmailNotifications(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              colors={colors}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Pressable
              style={({ pressed }) => [styles.settingRow, pressed && { opacity: 0.7 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/notification-preferences");
              }}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconWrap, { backgroundColor: colors.info + "15" }]}>
                  <Feather name="sliders" size={16} color={colors.info} />
                </View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>העדפות התראות</Text>
              </View>
              <Feather name="chevron-left" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </Section>

        {Platform.OS !== "web" && gpsPermissionStatus !== "granted" && (
          <Section title="מעקב מיקום GPS" colors={colors}>
            <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
              <Pressable
                style={({ pressed }) => [styles.settingRow, pressed && { opacity: 0.7 }]}
                onPress={handleRequestGpsPermission}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIconWrap, { backgroundColor: colors.warning + "20" }]}>
                    <Feather name="map-pin" size={16} color={colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingLabel, { color: colors.text }]}>הרשאת מיקום GPS</Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 2 }}>
                      {gpsPermissionStatus === "denied" ? "הרשאה נדחתה — לחץ לבקשה מחדש" : "לחץ לאפשר גישה למיקום"}
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-left" size={18} color={colors.warning} />
              </Pressable>
            </View>
          </Section>
        )}

        <Section title="מראה" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            <ToggleRow
              icon="moon"
              label="מצב כהה"
              value={isDark}
              onToggle={(v) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setThemeMode(v ? "dark" : "light");
              }}
              colors={colors}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <ToggleRow
              icon="monitor"
              label="עקוב אחר המכשיר"
              value={themeMode === "system"}
              onToggle={(v) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setThemeMode(v ? "system" : isDark ? "dark" : "light");
              }}
              colors={colors}
            />
          </View>
        </Section>

        <Section title="ניווט מהיר" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            <MenuItem icon="cpu" label="צ'אט AI (עוזי)" onPress={() => router.push("/ai-chat")} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem icon="terminal" label="Kimi Terminal" onPress={() => router.push("/kimi-terminal")} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem icon="folder" label="מסמכים" onPress={() => router.push("/documents")} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem icon="bar-chart-2" label="דוחות" onPress={() => router.push("/reports")} colors={colors} />
          </View>
        </Section>

        <Section title="אודות המערכת" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
            <InfoRow icon="info" label="גרסה" value="2026.1.0" colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <InfoRow icon="server" label="מערכת" value="טכנו-כל עוזי ERP" colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <InfoRow icon="shield" label="אבטחה" value="Bearer Token / PBKDF2" colors={colors} />
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

type Colors = ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: Colors }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

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

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  secureTextEntry?: boolean;
  colors: Colors;
}) {
  return (
    <View style={styles.inputRow}>
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.inlineInput, { color: colors.text, borderBottomColor: colors.border }]}
        value={value}
        onChangeText={onChangeText}
        textAlign="right"
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
      />
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

function ToggleRow({
  icon,
  label,
  value,
  onToggle,
  colors,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void | Promise<void>;
  colors: Colors;
}) {
  return (
    <View style={styles.toggleRow}>
      <Feather name={icon} size={18} color={colors.text} />
      <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.primary + "80" }}
        thumbColor={value ? colors.primary : "#f4f3f4"}
      />
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
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    minWidth: 70,
  },
  inlineInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    borderBottomWidth: 1,
    paddingBottom: 4,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    justifyContent: "flex-end",
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 80,
    alignItems: "center",
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  settingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
