import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";

export default function ScannerWebWrapper() {
  return (
    <AuthGuard>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.light.background, padding: 32 }}>
        <Feather name="camera" size={64} color={Colors.light.textMuted} />
        <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.light.text, marginTop: 16, textAlign: "center" }}>
          סורק ברקוד
        </Text>
        <Text style={{ fontSize: 14, color: Colors.light.textMuted, marginTop: 8, textAlign: "center" }}>
          פיצ׳ר זה זמין רק באפליקציית המובייל
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{ marginTop: 24, backgroundColor: Colors.light.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>חזרה</Text>
        </Pressable>
      </View>
    </AuthGuard>
  );
}
