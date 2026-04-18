import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlatformCameraView, usePlatformCameraPermissions, type BarcodeScanningResult } from "@/components/PlatformCameraView";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

const ACTION_OPTIONS = [
  { key: "lookup", label: "חיפוש פריט", icon: "search" as const },
  { key: "goods_receipt", label: "קבלת סחורה", icon: "package" as const },
  { key: "stock_check", label: "בדיקת מלאי", icon: "layers" as const },
  { key: "transfer", label: "העברה", icon: "repeat" as const },
  { key: "ship", label: "משלוח", icon: "truck" as const },
];

export default function ScannerScreenWrapper() {
  return (
    <AuthGuard>
      <ScannerScreen />
    </AuthGuard>
  );
}

function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = usePlatformCameraPermissions();
  const [cameraActive, setCameraActive] = useState(true);
  const [manualInput, setManualInput] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState("lookup");
  const [lookupResult, setLookupResult] = useState<{ found: boolean; source: string | null; item: Record<string, unknown> | null } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const scanCooldownRef = useRef(false);

  const { data: historyData } = useQuery({
    queryKey: ["field-scan-history"],
    queryFn: () => api.getFieldScanHistory({ limit: 50 }),
  });

  const saveScanMutation = useMutation({
    mutationFn: (data: { barcode: string; action: string }) =>
      api.saveFieldScan({ barcode: data.barcode, action: data.action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-scan-history"] });
    },
  });

  const performLookup = useCallback(async (code: string) => {
    setLookupLoading(true);
    try {
      const result = await api.lookupBarcode(code);
      setLookupResult(result);
    } catch {
      setLookupResult({ found: false, source: null, item: null });
    }
    setLookupLoading(false);
  }, []);

  const handleBarcode = useCallback((result: BarcodeScanningResult) => {
    if (scanCooldownRef.current) return;
    scanCooldownRef.current = true;
    setTimeout(() => { scanCooldownRef.current = false; }, 2000);

    const code = result.data;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Vibration.vibrate(100);
    }
    setScannedCode(code);
    setCameraActive(false);
    saveScanMutation.mutate({ barcode: code, action: selectedAction });
    performLookup(code);
  }, [selectedAction, saveScanMutation, performLookup]);

  const handleManualSubmit = () => {
    if (!manualInput.trim()) return;
    const code = manualInput.trim();
    setScannedCode(code);
    setShowManual(false);
    setManualInput("");
    setCameraActive(false);
    saveScanMutation.mutate({ barcode: code, action: selectedAction });
    performLookup(code);
  };

  const resetScan = () => {
    setScannedCode(null);
    setLookupResult(null);
    setCameraActive(true);
  };

  const scans = historyData?.scans || [];

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="chevron-right" size={24} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.title}>סורק ברקוד</Text>
          <View style={styles.historyBtn} />
        </View>
        <View style={styles.permissionBox}>
          <Feather name="camera-off" size={48} color={Colors.light.textMuted} />
          <Text style={styles.permTitle}>
            {Platform.OS === "web" ? "סורק ברקוד אינו זמין בדפדפן" : "נדרשת הרשאת מצלמה"}
          </Text>
          <Text style={styles.permDesc}>
            {Platform.OS === "web"
              ? "תכונה זו זמינה באפליקציה הנייטיבית בלבד. השתמש בהזנה ידנית."
              : "יש לאפשר גישה למצלמה כדי לסרוק ברקודים"}
          </Text>
          {Platform.OS !== "web" && (
            <Pressable style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>אפשר מצלמה</Text>
            </Pressable>
          )}
          <Pressable style={styles.manualBtn} onPress={() => setShowManual(true)}>
            <Text style={styles.manualBtnText}>הזנה ידנית</Text>
          </Pressable>
        </View>
        <Modal visible={showManual} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>הזנה ידנית</Text>
                <Pressable onPress={() => setShowManual(false)} hitSlop={8}>
                  <Feather name="x" size={22} color={Colors.light.text} />
                </Pressable>
              </View>
              <TextInput
                style={styles.modalInput}
                value={manualInput}
                onChangeText={setManualInput}
                placeholder="הזן מספר ברקוד / קוד פריט..."
                placeholderTextColor={Colors.light.textMuted}
                textAlign="right"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleManualSubmit}
              />
              <Pressable style={styles.modalSubmitBtn} onPress={handleManualSubmit}>
                <Text style={styles.modalSubmitText}>חפש</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>סורק ברקוד</Text>
        <Pressable style={styles.historyBtn} onPress={() => setShowHistory(true)}>
          <Feather name="clock" size={20} color={Colors.light.primary} />
        </Pressable>
      </View>

      <View style={styles.actionSelector}>
        {ACTION_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={[styles.actionChip, selectedAction === opt.key && styles.actionChipActive]}
            onPress={() => setSelectedAction(opt.key)}
          >
            <Feather name={opt.icon} size={14} color={selectedAction === opt.key ? "#fff" : Colors.light.primary} />
            <Text style={[styles.actionChipLabel, selectedAction === opt.key && styles.actionChipLabelActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {cameraActive && !scannedCode ? (
        <View style={styles.cameraContainer}>
          <PlatformCameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "code93", "upc_a", "upc_e", "pdf417", "datamatrix"] }}
            onBarcodeScanned={handleBarcode}
          />
          <View style={styles.overlay}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.scanHint}>כוון את המצלמה לברקוד</Text>
          </View>
        </View>
      ) : scannedCode ? (
        <View style={styles.resultContainer}>
          <View style={styles.resultCard}>
            <View style={styles.resultIconBox}>
              <Feather name="check-circle" size={32} color={Colors.light.success} />
            </View>
            <Text style={styles.resultLabel}>קוד שנסרק</Text>
            <Text style={styles.resultCode}>{scannedCode}</Text>
            <View style={styles.resultActionBadge}>
              <Text style={styles.resultActionText}>
                {ACTION_OPTIONS.find((a) => a.key === selectedAction)?.label || selectedAction}
              </Text>
            </View>
          </View>

          {lookupLoading ? (
            <View style={styles.lookupCard}>
              <ActivityIndicator size="small" color={Colors.light.primary} />
              <Text style={styles.lookupLoading}>מחפש פריט...</Text>
            </View>
          ) : lookupResult ? (
            <View style={styles.lookupCard}>
              {lookupResult.found && lookupResult.item ? (
                <>
                  <View style={styles.lookupHeader}>
                    <View style={[styles.lookupBadge, { backgroundColor: Colors.light.success + "18" }]}>
                      <Text style={[styles.lookupBadgeText, { color: Colors.light.success }]}>
                        {lookupResult.source === "inventory" ? "מלאי" : "רכוש קבוע"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.lookupItemName}>
                    {String(lookupResult.item.item_name || lookupResult.item.asset_name || "")}
                  </Text>
                  {lookupResult.source === "inventory" && (
                    <View style={styles.lookupDetails}>
                      <View style={styles.lookupRow}>
                        <Text style={styles.lookupLabel}>קטגוריה</Text>
                        <Text style={styles.lookupValue}>{String(lookupResult.item.category || "-")}</Text>
                      </View>
                      <View style={styles.lookupRow}>
                        <Text style={styles.lookupLabel}>כמות</Text>
                        <Text style={styles.lookupValue}>{String(lookupResult.item.quantity || "0")} {String(lookupResult.item.unit || "")}</Text>
                      </View>
                      <View style={styles.lookupRow}>
                        <Text style={styles.lookupLabel}>מצב</Text>
                        <Text style={styles.lookupValue}>{String(lookupResult.item.status || "-")}</Text>
                      </View>
                    </View>
                  )}
                  {lookupResult.source === "asset" && (
                    <View style={styles.lookupDetails}>
                      <View style={styles.lookupRow}>
                        <Text style={styles.lookupLabel}>קוד</Text>
                        <Text style={styles.lookupValue}>{String(lookupResult.item.asset_code || "-")}</Text>
                      </View>
                      <View style={styles.lookupRow}>
                        <Text style={styles.lookupLabel}>מיקום</Text>
                        <Text style={styles.lookupValue}>{String(lookupResult.item.location || "-")}</Text>
                      </View>
                      <View style={styles.lookupRow}>
                        <Text style={styles.lookupLabel}>מצב</Text>
                        <Text style={styles.lookupValue}>{String(lookupResult.item.status || "-")}</Text>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.lookupNotFound}>
                  <Feather name="alert-circle" size={20} color={Colors.light.warning} />
                  <Text style={styles.lookupNotFoundText}>פריט לא נמצא במערכת</Text>
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.resultActions}>
            <Pressable style={styles.scanAgainBtn} onPress={resetScan}>
              <Feather name="camera" size={18} color="#fff" />
              <Text style={styles.scanAgainText}>סריקה נוספת</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.bottomActions}>
        <Pressable style={styles.manualEntryBtn} onPress={() => setShowManual(true)}>
          <Feather name="edit-3" size={16} color={Colors.light.primary} />
          <Text style={styles.manualEntryText}>הזנה ידנית</Text>
        </Pressable>
      </View>

      <Modal visible={showManual} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>הזנה ידנית</Text>
              <Pressable onPress={() => setShowManual(false)} hitSlop={8}>
                <Feather name="x" size={22} color={Colors.light.text} />
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              value={manualInput}
              onChangeText={setManualInput}
              placeholder="הזן מספר ברקוד / קוד פריט..."
              placeholderTextColor={Colors.light.textMuted}
              textAlign="right"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleManualSubmit}
            />
            <Pressable style={styles.modalSubmitBtn} onPress={handleManualSubmit}>
              <Text style={styles.modalSubmitText}>חפש</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showHistory} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.historyContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>היסטוריית סריקות</Text>
            <Pressable onPress={() => setShowHistory(false)} hitSlop={8}>
              <Feather name="x" size={22} color={Colors.light.text} />
            </Pressable>
          </View>
          <FlatList
            data={scans}
            keyExtractor={(item: Record<string, unknown>) => String(item.id)}
            renderItem={({ item }: { item: Record<string, unknown> }) => (
              <View style={styles.historyRow}>
                <View style={styles.historyIcon}>
                  <Feather name="maximize" size={16} color={Colors.light.primary} />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyBarcode}>{String(item.barcode || "")}</Text>
                  <Text style={styles.historyMeta}>
                    {ACTION_OPTIONS.find((a) => a.key === String(item.action))?.label || String(item.action || "lookup")}
                    {" · "}
                    {item.created_at ? new Date(String(item.created_at)).toLocaleString("he-IL") : ""}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Feather name="maximize" size={48} color={Colors.light.textMuted} />
                <Text style={styles.emptyText}>אין היסטוריית סריקות</Text>
              </View>
            }
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 12 }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  historyBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", justifyContent: "center" },
  actionSelector: { flexDirection: "row", paddingHorizontal: 16, gap: 6, marginBottom: 8, flexWrap: "wrap" },
  actionChip: {
    flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, backgroundColor: Colors.light.surfaceCard, borderWidth: 1, borderColor: Colors.light.border,
  },
  actionChipActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  actionChipLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.text },
  actionChipLabelActive: { color: "#fff" },
  cameraContainer: { flex: 1, position: "relative" },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 260, height: 260, position: "relative" },
  corner: { position: "absolute", width: 40, height: 40, borderColor: Colors.light.primary },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  scanHint: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#fff", marginTop: 20, textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  resultContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  resultCard: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 16, padding: 24,
    alignItems: "center", gap: 8, marginBottom: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  resultIconBox: { marginBottom: 4 },
  resultLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  resultCode: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text, letterSpacing: 1 },
  resultActionBadge: { backgroundColor: Colors.light.primary + "18", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 },
  resultActionText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.primary },
  resultActions: { marginTop: 12 },
  scanAgainBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.light.primary, borderRadius: 14, paddingVertical: 14,
  },
  scanAgainText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  bottomActions: { paddingHorizontal: 20, paddingBottom: 20 },
  manualEntryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.light.surfaceCard, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  manualEntryText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  permissionBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  permTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text },
  permDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center" },
  permBtn: { backgroundColor: Colors.light.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  permBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  manualBtn: { marginTop: 8 },
  manualBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.light.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  modalInput: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 12, paddingHorizontal: 16, height: 48,
    fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border,
  },
  modalSubmitBtn: { backgroundColor: Colors.light.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalSubmitText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  historyContainer: { flex: 1, backgroundColor: Colors.light.background, paddingHorizontal: 20 },
  historyRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12, padding: 14, gap: 12,
  },
  historyIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.light.primary + "18", alignItems: "center", justifyContent: "center" },
  historyInfo: { flex: 1 },
  historyBarcode: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  historyMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  lookupCard: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 14, padding: 16, gap: 8, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  lookupLoading: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, textAlign: "center" },
  lookupHeader: { flexDirection: "row", justifyContent: "flex-end" },
  lookupBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  lookupBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  lookupItemName: { fontSize: 17, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "right" },
  lookupDetails: { gap: 6, marginTop: 4 },
  lookupRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lookupLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  lookupValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  lookupNotFound: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8 },
  lookupNotFoundText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.warning },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
});
