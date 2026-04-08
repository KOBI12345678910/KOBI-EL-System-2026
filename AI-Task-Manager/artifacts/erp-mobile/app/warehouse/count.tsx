import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from "expo-image-picker";

import { WmsScanner } from "@/components/WmsScanner";
import * as offlineDb from "@/lib/offline-db";
import { apiRequest } from "@/lib/api";

type CountPhase = "select_task" | "scan_location" | "count_items" | "review" | "submitted";

interface CountTask {
  id: number;
  zone: string;
  locationCode: string;
  description: string;
  itemCount: number;
  status: "pending" | "in_progress" | "submitted";
  assignedDate: string;
}

interface CountedItem {
  itemCode: string;
  itemDescription: string;
  barcode: string;
  systemQuantity: number;
  countedQuantity: number;
  unit: string;
  variance: number;
  varianceNote: string;
  locationCode: string;
  variancePhotoUri?: string;
}

function getTasksFromOffline(data: Record<string, unknown>[]): CountTask[] {
  return data.map((r) => {
    const str = (key: string, fallback = "") => String(r[key] ?? fallback);
    const num = (key: string, fallback = 0) => Number(r[key] ?? fallback);
    return {
      id: num("id"),
      zone: str("zone"),
      locationCode: str("location_code") || str("locationCode"),
      description: str("description"),
      itemCount: num("item_count") || num("itemCount"),
      status: (str("status") || "pending") as CountTask["status"],
      assignedDate: str("assigned_date") || str("assignedDate") || new Date().toLocaleDateString("he-IL"),
    };
  });
}

export default function CountScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<CountPhase>("select_task");
  const [tasks, setTasks] = useState<CountTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<CountTask | null>(null);
  const [countedItems, setCountedItems] = useState<CountedItem[]>([]);
  const [currentItem, setCurrentItem] = useState<CountedItem | null>(null);
  const [countQty, setCountQty] = useState("0");
  const [varianceNote, setVarianceNote] = useState("");
  const [variancePhotoUri, setVariancePhotoUri] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  function showFeedback(message: string, type: "success" | "error" | "info") {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
    if (type === "success") Vibration.vibrate(100);
    if (type === "error") Vibration.vibrate([0, 100, 100, 100]);
  }

  async function fetchTasks() {
    setLoading(true);
    try {
      const data = await apiRequest<Record<string, unknown>>("/warehouse-intelligence/count-tasks");
      setTasks((data.tasks as CountTask[] | undefined) || (data as unknown as CountTask[]) || []);
      setIsOffline(false);
    } catch {
      try {
        const offline = await offlineDb.getOfflineWmsCountTasks("pending");
        if (offline.length > 0) {
          setTasks(getTasksFromOffline(offline));
          setIsOffline(true);
          showFeedback("מציג משימות שמורות מקומית", "info");
        } else {
          setTasks([]);
          setIsOffline(true);
          showFeedback("אין משימות ספירה זמינות — בדוק חיבור לרשת", "error");
        }
      } catch {
        setTasks([]);
        setIsOffline(true);
        showFeedback("שגיאה בטעינת משימות — בדוק חיבור לרשת", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchTasks(); }, []);

  async function handleScan(code: string) {
    if (phase === "scan_location") {
      handleLocationScan(code);
    } else if (phase === "count_items") {
      await handleItemScan(code);
    }
  }

  function handleLocationScan(code: string) {
    if (!selectedTask) return;
    if (code === selectedTask.locationCode || code.includes(selectedTask.locationCode)) {
      setPhase("count_items");
      showFeedback(`מיקום ${selectedTask.locationCode} אושר`, "success");
    } else {
      showFeedback(`מיקום שגוי! צפוי: ${selectedTask.locationCode}`, "error");
    }
  }

  async function handleItemScan(barcode: string) {
    if (!selectedTask) return;
    setScanLoading(true);
    try {
      const mat = await apiRequest<Record<string, unknown>>(
        `/warehouse-intelligence/scan-material/${encodeURIComponent(barcode)}`
      );
      const existing = countedItems.find(i => i.barcode === barcode || i.itemCode === String(mat.material_number || ""));
      if (existing) {
        setCurrentItem({ ...existing });
        setCountQty(String(existing.countedQuantity));
        setVarianceNote(existing.varianceNote);
        showFeedback(`עדכן: ${String(mat.material_name)}`, "info");
        return;
      }
      setCurrentItem({
        itemCode: String(mat.material_number || barcode),
        itemDescription: String(mat.material_name || "פריט לא מזוהה"),
        barcode,
        systemQuantity: Number(mat.quantity_on_hand ?? mat.quantity ?? 0),
        countedQuantity: 0,
        unit: String(mat.unit || "יח׳"),
        variance: 0,
        varianceNote: "",
        locationCode: selectedTask.locationCode,
      });
      setCountQty("0");
      setVarianceNote("");
      Vibration.vibrate(100);
    } catch {
      const offline = await offlineDb.searchOfflineInventory(barcode).catch(() => []);
      const found: Record<string, unknown> | undefined = offline[0];
      const existing = countedItems.find(i => i.barcode === barcode);
      if (existing) {
        setCurrentItem({ ...existing });
        setCountQty(String(existing.countedQuantity));
        return;
      }
      setCurrentItem({
        itemCode: String(found?.item_number ?? barcode),
        itemDescription: String(found?.item_name ?? "פריט לא מזוהה"),
        barcode,
        systemQuantity: Number(found?.quantity_on_hand ?? 0),
        countedQuantity: 0,
        unit: String(found?.unit ?? "יח׳"),
        variance: 0,
        varianceNote: "",
        locationCode: selectedTask.locationCode,
      });
      setCountQty("0");
      setVarianceNote("");
      showFeedback("פריט לא נמצא בשרת — ניתן לספור ידנית", "info");
    } finally {
      setScanLoading(false);
    }
  }

  async function captureVariancePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { showFeedback("נדרשת הרשאת מצלמה", "error"); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.6, base64: false });
    if (!result.canceled && result.assets[0]) {
      setVariancePhotoUri(result.assets[0].uri);
      showFeedback("תמונת פער נשמרה", "success");
    }
  }

  async function pickVariancePhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showFeedback("נדרשת הרשאת גלריה", "error"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.6, base64: false });
    if (!result.canceled && result.assets[0]) {
      setVariancePhotoUri(result.assets[0].uri);
      showFeedback("תמונת פער נבחרה", "success");
    }
  }

  function confirmCount() {
    if (!currentItem) return;
    const qty = parseFloat(countQty || "0");
    if (isNaN(qty) || qty < 0) { showFeedback("כמות לא תקינה", "error"); return; }
    const variance = qty - currentItem.systemQuantity;
    const updatedItem: CountedItem = { ...currentItem, countedQuantity: qty, variance, varianceNote, variancePhotoUri };
    setCountedItems(prev => {
      const idx = prev.findIndex(i => i.barcode === currentItem.barcode);
      return idx >= 0 ? prev.map((i, j) => j === idx ? updatedItem : i) : [...prev, updatedItem];
    });
    showFeedback(`נספר: ${qty} ${currentItem.unit}${Math.abs(variance) > 0 ? ` (פער: ${variance > 0 ? "+" : ""}${variance})` : ""}`, variance === 0 ? "success" : "info");
    setCurrentItem(null);
    setCountQty("0");
    setVarianceNote("");
    setVariancePhotoUri(undefined);
  }

  async function submitCount() {
    if (!selectedTask) return;
    setSubmitting(true);
    const payload = {
      taskId: selectedTask.id,
      locationCode: selectedTask.locationCode,
      zone: selectedTask.zone,
      items: countedItems.map(i => ({
        itemCode: i.itemCode,
        itemDescription: i.itemDescription,
        systemQuantity: i.systemQuantity,
        countedQuantity: i.countedQuantity,
        variance: i.variance,
        varianceNote: i.varianceNote,
        variancePhotoUri: i.variancePhotoUri || null,
        unit: i.unit,
      })),
    };
    try {
      await apiRequest("/warehouse-intelligence/count-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setPhase("submitted");
    } catch {
      await offlineDb.addPendingMutation("cycle_count", "/warehouse-intelligence/count-submit", "POST", payload);
      Alert.alert("שמור אופליין", "הספירה תשוגר בחיבור הבא", [{ text: "אישור", onPress: () => setPhase("submitted") }]);
    } finally {
      setSubmitting(false);
    }
  }

  const totalVariance = countedItems.reduce((sum, i) => sum + Math.abs(i.variance), 0);
  const varianceItems = countedItems.filter(i => i.variance !== 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle}>ספירת מחזור</Text>
        {isOffline && <Ionicons name="cloud-offline-outline" size={18} color="#f59e0b" />}
        {selectedTask && (
          <TouchableOpacity onPress={() => { setSelectedTask(null); setPhase("select_task"); setCountedItems([]); setCurrentItem(null); }} style={styles.iconButton}>
            <Ionicons name="refresh" size={20} color="#f59e0b" />
          </TouchableOpacity>
        )}
      </View>

      {feedback && (
        <View style={[styles.feedback, feedback.type === "success" ? styles.fbSuccess : feedback.type === "error" ? styles.fbError : styles.fbInfo]}>
          <Ionicons name={feedback.type === "success" ? "checkmark-circle" : feedback.type === "error" ? "alert-circle" : "information-circle"} size={18} color="#fff" />
          <Text style={styles.feedbackText}>{feedback.message}</Text>
        </View>
      )}

      {phase === "select_task" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          <Text style={styles.sectionTitle}>משימות ספירה</Text>
          {loading ? <ActivityIndicator color="#0ea5e9" style={{ marginTop: 40 }} /> : tasks.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-done-outline" size={48} color="#6b7280" />
              <Text style={styles.emptyText}>אין משימות ספירה ממתינות</Text>
            </View>
          ) : tasks.map(task => (
            <TouchableOpacity key={task.id} style={styles.taskCard} onPress={() => { setSelectedTask(task); setCountedItems([]); setPhase("scan_location"); }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.taskZone}>{task.zone}</Text>
                <Text style={styles.taskDate}>{task.assignedDate}</Text>
              </View>
              <Text style={styles.taskLocation}>{task.locationCode} — {task.description}</Text>
              <Text style={styles.taskCount}>{task.itemCount} פריטים למניין</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {phase === "scan_location" && selectedTask && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.infoBox}>
            <Ionicons name="location" size={20} color="#0ea5e9" />
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.infoTitle}>סרוק מיקום ספירה</Text>
              <Text style={styles.infoSub}>{selectedTask.locationCode} — {selectedTask.description}</Text>
            </View>
          </View>
          <WmsScanner onScan={handleScan} color="#0ea5e9" hint="כוון לברקוד המיקום" placeholder="קוד מיקום ידני..." />
        </View>
      )}

      {phase === "count_items" && selectedTask && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.infoBox}>
            <Ionicons name="barcode" size={20} color="#0ea5e9" />
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.infoTitle}>סרוק פריט לספירה</Text>
              <Text style={styles.infoSub}>{selectedTask.locationCode} · {countedItems.length} פריטים נספרו</Text>
            </View>
            <TouchableOpacity style={styles.reviewBtn} onPress={() => setPhase("review")}>
              <Text style={styles.reviewBtnText}>סיים</Text>
            </TouchableOpacity>
          </View>

          <WmsScanner onScan={handleScan} color="#0ea5e9" hint="כוון לברקוד הפריט" isLoading={scanLoading} placeholder="ברקוד פריט ידני..." />

          {currentItem && (
            <View style={styles.countCard}>
              <Text style={styles.countTitle}>{currentItem.itemDescription}</Text>
              <Text style={styles.countSub}>{currentItem.itemCode} · כמות מערכת: {currentItem.systemQuantity} {currentItem.unit}</Text>
              <Text style={styles.countLabel}>כמות שנספרה:</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => setCountQty(q => String(Math.max(0, parseFloat(q || "1") - 1)))}>
                  <Ionicons name="remove" size={20} color="#fff" />
                </TouchableOpacity>
                <TextInput style={styles.qtyInput} value={countQty} onChangeText={setCountQty} keyboardType="decimal-pad" textAlign="center" />
                <TouchableOpacity style={styles.qtyBtn} onPress={() => setCountQty(q => String(parseFloat(q || "0") + 1))}>
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.noteInput}
                value={varianceNote}
                onChangeText={setVarianceNote}
                placeholder="הערת פער (אופציונלי)..."
                placeholderTextColor="#64748b"
                textAlign="right"
                multiline
              />
              <View style={styles.photoRow}>
                <TouchableOpacity style={styles.photoBtn} onPress={captureVariancePhoto}>
                  <Ionicons name="camera" size={16} color="#fff" />
                  <Text style={styles.photoBtnText}>צלם פער</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={pickVariancePhoto}>
                  <Ionicons name="image" size={16} color="#fff" />
                  <Text style={styles.photoBtnText}>בחר מגלריה</Text>
                </TouchableOpacity>
              </View>
              {variancePhotoUri ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: variancePhotoUri }} style={styles.photoThumb} />
                  <TouchableOpacity onPress={() => setVariancePhotoUri(undefined)} style={styles.removePhoto}>
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity style={styles.confirmBtn} onPress={confirmCount}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.confirmBtnText}>אשר ספירה</Text>
              </TouchableOpacity>
            </View>
          )}

          {countedItems.length > 0 && (
            <ScrollView style={{ maxHeight: 160 }}>
              {countedItems.map((item, idx) => (
                <View key={idx} style={styles.countedRow}>
                  <Ionicons name={item.variance === 0 ? "checkmark-circle" : "alert-circle"} size={16} color={item.variance === 0 ? "#10b981" : "#f59e0b"} />
                  <Text style={styles.countedName}>{item.itemDescription}</Text>
                  <Text style={styles.countedQty}>{item.countedQuantity} {item.unit}</Text>
                  {item.variance !== 0 && <Text style={styles.countedVariance}>{item.variance > 0 ? "+" : ""}{item.variance}</Text>}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {phase === "review" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          <Text style={styles.sectionTitle}>סיכום ספירה — {selectedTask?.locationCode}</Text>
          <View style={[styles.summaryCard, { marginBottom: 12 }]}>
            <Text style={styles.summaryRow}>{countedItems.length} פריטים נספרו</Text>
            <Text style={[styles.summaryRow, totalVariance > 0 && { color: "#f59e0b" }]}>סה"כ פערים: {totalVariance}</Text>
            {varianceItems.length > 0 && <Text style={styles.summaryRow}>{varianceItems.length} פריטים עם פער</Text>}
          </View>
          {countedItems.map((item, idx) => (
            <View key={idx} style={styles.reviewRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewName}>{item.itemDescription}</Text>
                <Text style={styles.reviewCode}>{item.itemCode}</Text>
                {item.varianceNote ? <Text style={styles.reviewNote}>{item.varianceNote}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.reviewQty}>{item.countedQuantity} {item.unit}</Text>
                <Text style={[styles.reviewVariance, item.variance > 0 ? { color: "#f59e0b" } : item.variance < 0 ? { color: "#ef4444" } : { color: "#10b981" }]}>
                  {item.variance > 0 ? "+" : ""}{item.variance}
                </Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.5 }]} onPress={submitCount} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>שלח ספירה</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.backCountBtn} onPress={() => setPhase("count_items")}>
            <Text style={styles.backCountBtnText}>חזור לסריקה</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {phase === "submitted" && (
        <View style={styles.completeBox}>
          <Ionicons name="checkmark-done-circle" size={72} color="#10b981" />
          <Text style={styles.completeTitle}>ספירה הושלמה!</Text>
          <Text style={styles.completeSub}>{countedItems.length} פריטים · {varianceItems.length} פערים</Text>
          {isOffline && <Text style={[styles.completeSub, { color: "#f59e0b" }]}>ישוגר בחיבור הבא</Text>}
          <TouchableOpacity style={styles.submitBtn} onPress={() => router.back()}>
            <Text style={styles.submitBtnText}>סיים</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#0c4a6e", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  backButton: { padding: 4 },
  iconButton: { marginRight: 8, padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "right" },
  feedback: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  fbSuccess: { backgroundColor: "#065f46" },
  fbError: { backgroundColor: "#991b1b" },
  fbInfo: { backgroundColor: "#1e3a5f" },
  feedbackText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#e2e8f0", textAlign: "right", marginBottom: 12 },
  taskCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 10 },
  taskZone: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#38bdf8" },
  taskDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#64748b" },
  taskLocation: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#f1f5f9", textAlign: "right", marginTop: 4 },
  taskCount: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#64748b", textAlign: "right", marginTop: 2 },
  emptyBox: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: "#6b7280", fontFamily: "Inter_400Regular" },
  infoBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 14, gap: 12 },
  infoTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#f1f5f9", textAlign: "right" },
  infoSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#94a3b8", textAlign: "right" },
  reviewBtn: { backgroundColor: "#0ea5e9", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  reviewBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  countCard: { backgroundColor: "#1e293b", borderRadius: 14, padding: 16, marginTop: 12 },
  countTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#f1f5f9", textAlign: "right" },
  countSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#94a3b8", textAlign: "right", marginBottom: 12 },
  countLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#94a3b8", textAlign: "right", marginBottom: 8 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 10 },
  qtyBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#0ea5e9", alignItems: "center", justifyContent: "center" },
  qtyInput: { flex: 1, height: 48, backgroundColor: "#0f172a", borderRadius: 10, fontSize: 22, fontFamily: "Inter_700Bold", color: "#f1f5f9" },
  noteInput: { backgroundColor: "#0f172a", borderRadius: 10, padding: 10, fontSize: 13, color: "#f1f5f9", marginBottom: 10, minHeight: 48 },
  photoRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  photoBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#1e3a5f", paddingVertical: 8, borderRadius: 8 },
  photoBtnText: { color: "#93c5fd", fontSize: 12, fontFamily: "Inter_500Medium" },
  photoPreview: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  photoThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: "#1e293b" },
  removePhoto: { padding: 4 },
  confirmBtn: { backgroundColor: "#0ea5e9", paddingVertical: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  confirmBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  countedRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1e293b" },
  countedName: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#e2e8f0", textAlign: "right" },
  countedQty: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#93c5fd" },
  countedVariance: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#f59e0b", minWidth: 28, textAlign: "center" },
  summaryCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, gap: 4 },
  summaryRow: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#f1f5f9", textAlign: "right" },
  reviewRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 10, padding: 12, marginBottom: 6 },
  reviewName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#f1f5f9", textAlign: "right" },
  reviewCode: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#64748b", textAlign: "right" },
  reviewNote: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#94a3b8", textAlign: "right" },
  reviewQty: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#93c5fd" },
  reviewVariance: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  submitBtn: { backgroundColor: "#0ea5e9", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 16 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  backCountBtn: { paddingVertical: 12, alignItems: "center", marginTop: 6 },
  backCountBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#94a3b8" },
  completeBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  completeTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#f1f5f9" },
  completeSub: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#94a3b8" },
});
