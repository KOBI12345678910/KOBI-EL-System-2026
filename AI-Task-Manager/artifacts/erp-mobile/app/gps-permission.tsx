import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";

export const GPS_PERMISSION_SHOWN_KEY = "@erp_gps_permission_shown";

export default function GpsPermissionScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  const handleAllow = async () => {
    setLoading(true);
    try {
      const { status: foreground } = await Location.requestForegroundPermissionsAsync();
      if (foreground === "granted") {
        await Location.requestBackgroundPermissionsAsync();
      }
    } catch {
    } finally {
      await AsyncStorage.setItem(GPS_PERMISSION_SHOWN_KEY, "true");
      setLoading(false);
      router.replace("/(tabs)");
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(GPS_PERMISSION_SHOWN_KEY, "true");
    setDenied(true);
    router.replace("/(tabs)");
  };

  if (Platform.OS === "web") {
    router.replace("/(tabs)");
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.iconContainer}>
        <View style={styles.iconCircle}>
          <Feather name="map-pin" size={52} color={Colors.light.primary} />
        </View>
      </View>

      <Text style={styles.title}>מעקב מיקום GPS</Text>

      <Text style={styles.description}>
        מערכת ERP עוקבת אחר המיקום שלך בזמן עבודת שטח כדי לאמת נוכחות, לאפשר ניהול זמן מדויק ולספק תמיכה בעת הצורך.
      </Text>

      <View style={styles.featuresList}>
        <View style={styles.featureRow}>
          <View style={styles.featureDot} />
          <Text style={styles.featureText}>אימות כניסה ויציאה ממשמרת</Text>
        </View>
        <View style={styles.featureRow}>
          <View style={styles.featureDot} />
          <Text style={styles.featureText}>תיעוד ביקורי לקוחות בשטח</Text>
        </View>
        <View style={styles.featureRow}>
          <View style={styles.featureDot} />
          <Text style={styles.featureText}>מעקב רקע אוטומטי חוסך בסוללה</Text>
        </View>
        <View style={styles.featureRow}>
          <View style={styles.featureDot} />
          <Text style={styles.featureText}>נתונים נשמרים גם ללא חיבור לאינטרנט</Text>
        </View>
      </View>

      <View style={styles.noteBox}>
        <Feather name="shield" size={16} color={Colors.light.textSecondary} />
        <Text style={styles.noteText}>
          נתוני המיקום משמשים לצרכי עבודה בלבד ומאובטחים בהתאם למדיניות החברה
        </Text>
      </View>

      {denied ? null : (
        <>
          <Pressable
            style={[styles.btn, styles.allowBtn]}
            onPress={handleAllow}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="check-circle" size={20} color="#fff" />
                <Text style={styles.allowBtnText}>אפשר גישה למיקום</Text>
              </>
            )}
          </Pressable>

          <Pressable style={styles.skipBtn} onPress={handleSkip} disabled={loading}>
            <Text style={styles.skipBtnText}>דלג — הגדר מאוחר יותר בהגדרות</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    marginBottom: 28,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.light.primary + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  featuresList: {
    width: "100%",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "flex-end",
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.primary,
  },
  featureText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
    flex: 1,
    textAlign: "right",
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.light.border + "66",
    borderRadius: 12,
    padding: 12,
    marginBottom: 32,
    width: "100%",
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "right",
    lineHeight: 18,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    paddingVertical: 16,
    width: "100%",
    marginBottom: 12,
  },
  allowBtn: {
    backgroundColor: Colors.light.primary,
  },
  allowBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  skipBtn: {
    paddingVertical: 10,
  },
  skipBtnText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "center",
  },
});
