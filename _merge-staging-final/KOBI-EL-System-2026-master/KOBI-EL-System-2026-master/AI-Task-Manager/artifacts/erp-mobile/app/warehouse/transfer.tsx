import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { WmsScanner } from "@/components/WmsScanner";
import * as offlineDb from "@/lib/offline-db";
import { apiRequest } from "@/lib/api";

type TransferPhase = "setup" | "scan_items" | "in_transit" | "destination" | "complete";

interface TransferItem {
  itemDescription: string;
  itemCode: string;
  barcode: string;
  quantity: number;
  unit: string;
  confirmedAtSource: boolean;
  confirmedAtDestination: boolean;
}

export default function TransferScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<TransferPhase>("setup");
  const [sourceWarehouse, setSourceWarehouse] = useState("");
  const [destinationWarehouse, setDestinationWarehouse] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<TransferItem[]>([]);
  const [currentQty, setCurrentQty] = useState("1");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [transferId, setTransferId] = useState<string | number | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  function showFeedback(message: string, type: "success" | "error" | "info") {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
    if (type === "success") Vibration.vibrate(100);
    if (type === "error") Vibration.vibrate([0, 100, 100, 100]);
  }

  async function handleScan(barcode: string) {
    if (phase === "scan_items") {
      await handleItemScan(barcode);
    } else if (phase === "destination") {
      handleDestinationScan(barcode);
    }
  }

  async function handleItemScan(barcode: string) {
    setScanLoading(true);
    try {
      const mat = await apiRequest<Record<string, unknown>>(
        `/warehouse-intelligence/scan-material/${encodeURIComponent(barcode)}`
      );
      const existing = items.find(i => i.barcode === barcode || i.itemCode === String(mat.material_number || ""));
      if (existing) {
        setItems(prev => prev.map(i => i.barcode === barcode ? { ...i, quantity: i.quantity + parseFloat(currentQty || "1") } : i));
        showFeedback(`+${currentQty} — ${String(mat.material_name)}`, "success");
      } else {
        setItems(prev => [...prev, {
          itemDescription: String(mat.material_name || "פריט לא מזוהה"),
          itemCode: String(mat.material_number || barcode),
          barcode,
          quantity: parseFloat(currentQty || "1"),
          unit: String(mat.unit || "יח׳"),
          confirmedAtSource: true,
          confirmedAtDestination: false,
        }]);
        showFeedback(`נוסף: ${String(mat.material_name)}`, "success");
      }
    } catch {
      const offline = await offlineDb.searchOfflineInventory(barcode).catch(() => []);
      const found: Record<string, unknown> | undefined = offline[0];
      const existing = items.find(i => i.barcode === barcode);
      if (existing) {
        setItems(prev => prev.map(i => i.barcode === barcode ? { ...i, quantity: i.quantity + parseFloat(currentQty || "1") } : i));
        showFeedback(`+${currentQty} — ${existing.itemDescription}`, "success");
      } else {
        setItems(prev => [...prev, {
          itemDescription: String(found?.item_name ?? "פריט לא מזוהה"),
          itemCode: String(found?.item_number ?? barcode),
          barcode,
          quantity: parseFloat(currentQty || "1"),
          unit: String(found?.unit ?? "יח׳"),
          confirmedAtSource: true,
          confirmedAtDestination: false,
        }]);
        showFeedback(found ? `נוסף: ${found.item_name}` : "פריט לא מזוהה — נוסף ידנית", "info");
      }
    } finally {
      setScanLoading(false);
    }
  }

  function handleDestinationScan(code: string) {
    const isDestLocation = code === destinationWarehouse || code.includes(destinationWarehouse);
    if (isDestLocation) {
      const nextItem = items.find(i => !i.confirmedAtDestination);
      if (nextItem) {
        setItems(prev => prev.map(i => i.barcode === nextItem.barcode ? { ...i, confirmedAtDestination: true } : i));
        const remaining = items.filter(i => !i.confirmedAtDestination).length - 1;
        if (remaining <= 0) {
          showFeedback("כל הפריטים אושרו ביעד!", "success");
        } else {
          showFeedback(`${nextItem.itemDescription} — אושר ✓ (נשאר ${remaining})`, "success");
        }
      } else {
        showFeedback("כל הפריטים כבר אושרו ביעד", "info");
      }
    } else {
      const matchedItem = items.find(i => i.barcode === code || i.itemCode === code);
      if (matchedItem) {
        if (matchedItem.confirmedAtDestination) {
          showFeedback(`${matchedItem.itemDescription} — כבר אושר`, "info");
        } else {
          setItems(prev => prev.map(i => i.barcode === code || i.itemCode === code ? { ...i, confirmedAtDestination: true } : i));
          const remaining = items.filter(i => !i.confirmedAtDestination).length - 1;
          showFeedback(`${matchedItem.itemDescription} — אושר ✓${remaining > 0 ? ` (נשאר ${remaining})` : ""}`, "success");
        }
      } else {
        showFeedback(`יעד שגוי! צפוי: ${destinationWarehouse} או ברקוד פריט`, "error");
      }
    }
  }

  async function createTransfer() {
    if (!sourceWarehouse.trim() || !destinationWarehouse.trim()) {
      showFeedback("יש למלא מחסן מקור ויעד", "error");
      return;
    }
    setLoading(true);
    const payload = { sourceWarehouse, destinationWarehouse, notes, items };
    try {
      const data = await apiRequest<Record<string, unknown>>("/warehouse-intelligence/stock-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setTransferId((data.transferId ?? data.id ?? null) as string | null);
      setPhase("scan_items");
    } catch {
      await offlineDb.addPendingMutation("stock_transfer_create", "/warehouse-intelligence/stock-transfer", "POST", payload);
      setTransferId(null);
      setPhase("scan_items");
      showFeedback("מצב אופליין — העברה תיצור אוטומטית בחיבור הבא", "info");
    } finally {
      setLoading(false);
    }
  }

  async function confirmTransfer() {
    setLoading(true);
    const payload = { transferId, destinationWarehouse, items };
    try {
      await apiRequest("/warehouse-intelligence/stock-transfer-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setPhase("complete");
    } catch {
      await offlineDb.addPendingMutation("stock_transfer", "/warehouse-intelligence/stock-transfer-confirm", "POST", payload);
      Alert.alert("שמור אופליין", "ההעברה נשמרה ותשוגר בחיבור הבא", [{ text: "אישור", onPress: () => setPhase("complete") }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>העברת מלאי</Text>
        {phase !== "setup" && phase !== "complete" && (
          <View style={styles.phaseBadge}>
            <Text style={styles.phaseText}>{phase === "scan_items" ? "סריקה" : phase === "in_transit" ? "בדרך" : "יעד"}</Text>
          </View>
        )}
      </View>

      {feedback && (
        <View style={[styles.feedback, feedback.type === "success" ? styles.fbSuccess : feedback.type === "error" ? styles.fbError : styles.fbInfo]}>
          <Ionicons name={feedback.type === "success" ? "checkmark-circle" : feedback.type === "error" ? "alert-circle" : "information-circle"} size={18} color="#fff" />
          <Text style={styles.feedbackText}>{feedback.message}</Text>
        </View>
      )}

      {phase === "setup" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          <Text style={styles.sectionTitle}>פרטי העברה</Text>
          <Text style={styles.label}>מחסן מקור</Text>
          <TextInput style={styles.input} value={sourceWarehouse} onChangeText={setSourceWarehouse} placeholder="לדוגמה: מחסן ראשי" placeholderTextColor="#64748b" textAlign="right" />
          <Text style={styles.label}>מחסן יעד</Text>
          <TextInput style={styles.input} value={destinationWarehouse} onChangeText={setDestinationWarehouse} placeholder="לדוגמה: מחסן משנה" placeholderTextColor="#64748b" textAlign="right" />
          <Text style={styles.label}>הערות (אופציונלי)</Text>
          <TextInput style={[styles.input, { height: 80 }]} value={notes} onChangeText={setNotes} placeholder="הערות להעברה..." placeholderTextColor="#64748b" textAlign="right" multiline />
          <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.5 }]} onPress={createTransfer} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>התחל סריקת פריטים</Text>
            </>}
          </TouchableOpacity>
        </ScrollView>
      )}

      {phase === "scan_items" && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.routeRow}>
            <Text style={styles.routeText}>{sourceWarehouse}</Text>
            <Ionicons name="arrow-forward" size={16} color="#94a3b8" />
            <Text style={styles.routeText}>{destinationWarehouse}</Text>
          </View>
          <View style={styles.qtyRow}>
            <Text style={styles.label}>כמות לסריקה:</Text>
            <View style={styles.qtyControl}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setCurrentQty(q => String(Math.max(1, parseFloat(q || "2") - 1)))}>
                <Ionicons name="remove" size={18} color="#fff" />
              </TouchableOpacity>
              <TextInput style={styles.qtyInput} value={currentQty} onChangeText={setCurrentQty} keyboardType="numeric" textAlign="center" />
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setCurrentQty(q => String(parseFloat(q || "0") + 1))}>
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <WmsScanner onScan={handleScan} color="#059669" hint="סרוק פריטים להעברה" isLoading={scanLoading} placeholder="ברקוד פריט ידני..." />

          {items.length > 0 && (
            <ScrollView style={{ flex: 1, marginTop: 12 }}>
              {items.map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                  <View style={{ flex: 1, marginHorizontal: 8 }}>
                    <Text style={styles.itemName}>{item.itemDescription}</Text>
                    <Text style={styles.itemCode}>{item.itemCode}</Text>
                  </View>
                  <Text style={styles.itemQty}>{item.quantity} {item.unit}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {items.length > 0 && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setPhase("in_transit")}>
              <Ionicons name="car" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>העבר למצב בדרך ({items.length} פריטים)</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {phase === "in_transit" && (
        <View style={styles.transitBox}>
          <Ionicons name="car" size={64} color="#059669" />
          <Text style={styles.transitTitle}>הפריטים בדרך</Text>
          <Text style={styles.transitSub}>{items.length} פריטים בדרך ל{destinationWarehouse}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setPhase("destination")}>
            <Text style={styles.primaryBtnText}>הגעה ליעד — אשר קבלה</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "destination" && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.infoBox}>
            <Ionicons name="location" size={20} color="#059669" />
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.infoTitle}>אישור קבלה ביעד</Text>
              <Text style={styles.infoSub}>סרוק ברקוד פריט לאישור בנפרד, או סרוק ברקוד מחסן {destinationWarehouse} לאישור הבא בתור</Text>
            </View>
          </View>
          {(() => {
            const remaining = items.filter(i => !i.confirmedAtDestination).length;
            return remaining > 0 ? (
              <View style={{ backgroundColor: "#064e3b", borderRadius: 10, padding: 10, marginBottom: 10, alignItems: "center" }}>
                <Text style={{ color: "#34d399", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>{remaining} פריטים ממתינים לאישור</Text>
              </View>
            ) : null;
          })()}
          <WmsScanner onScan={handleScan} color="#059669" hint="סרוק ברקוד פריט או מחסן יעד" placeholder="קוד פריט / יעד ידני..." />

          <ScrollView style={{ flex: 1, marginTop: 10 }}>
            {items.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <Ionicons name={item.confirmedAtDestination ? "checkmark-circle" : "ellipse-outline"} size={16} color={item.confirmedAtDestination ? "#10b981" : "#64748b"} />
                <View style={{ flex: 1, marginHorizontal: 8 }}>
                  <Text style={styles.itemName}>{item.itemDescription}</Text>
                </View>
                <Text style={styles.itemQty}>{item.quantity} {item.unit}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.5 }]} onPress={confirmTransfer} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>אשר העברה</Text>}
          </TouchableOpacity>
        </View>
      )}

      {phase === "complete" && (
        <View style={styles.completeBox}>
          <Ionicons name="checkmark-done-circle" size={72} color="#10b981" />
          <Text style={styles.completeTitle}>העברה הושלמה!</Text>
          <Text style={styles.completeSub}>{items.length} פריטים הועברו ל{destinationWarehouse}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>סיים</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#064e3b", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "right" },
  phaseBadge: { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  phaseText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  feedback: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  fbSuccess: { backgroundColor: "#065f46" },
  fbError: { backgroundColor: "#991b1b" },
  fbInfo: { backgroundColor: "#1e3a5f" },
  feedbackText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#e2e8f0", textAlign: "right", marginBottom: 12 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#94a3b8", textAlign: "right", marginBottom: 6 },
  input: { backgroundColor: "#1e293b", borderRadius: 10, padding: 12, fontSize: 15, color: "#f1f5f9", marginBottom: 14, textAlign: "right" },
  primaryBtn: { backgroundColor: "#059669", paddingVertical: 14, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 10 },
  primaryBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  routeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, marginBottom: 8 },
  routeText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#94a3b8" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  qtyControl: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  qtyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#059669", alignItems: "center", justifyContent: "center" },
  qtyInput: { flex: 1, height: 40, backgroundColor: "#1e293b", borderRadius: 8, fontSize: 16, fontFamily: "Inter_700Bold", color: "#f1f5f9" },
  itemRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 10, padding: 12, marginBottom: 6 },
  itemName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#f1f5f9", textAlign: "right" },
  itemCode: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#64748b", textAlign: "right" },
  itemQty: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#34d399" },
  transitBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  transitTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#f1f5f9" },
  transitSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#94a3b8", textAlign: "center" },
  infoBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 14, gap: 12 },
  infoTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#f1f5f9", textAlign: "right" },
  infoSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#94a3b8", textAlign: "right" },
  completeBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  completeTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#f1f5f9" },
  completeSub: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#94a3b8", textAlign: "center" },
});
