import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ScanReceiptWebScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0a0a0a", padding: 32 }}>
      <Ionicons name="scan-outline" size={64} color="#666" />
      <Text style={{ fontSize: 20, fontWeight: "700", color: "#fff", marginTop: 16, textAlign: "center" }}>
        סריקת קבלת סחורה
      </Text>
      <Text style={{ fontSize: 14, color: "#999", marginTop: 8, textAlign: "center" }}>
        פיצ׳ר זה זמין רק באפליקציית המובייל
      </Text>
      <Pressable
        onPress={() => router.back()}
        style={{ marginTop: 24, backgroundColor: "#3b82f6", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>חזרה</Text>
      </Pressable>
    </SafeAreaView>
  );
}
