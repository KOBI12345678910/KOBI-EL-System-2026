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

const OVERRIDE_REASONS = [
  "מיקום מלא",
  "מיקום לא מתאים",
  "הוראת מנהל",
  "תנאי אחסון שונים",
  "אחר",
];

type PutawayPhase = "select_assignment" | "scan_item" | "confirm_location" | "complete";

interface PutawayAssignment {
  id: number;
  receiptId: number;
  receiptNumber: string;
  itemCode: string;
  itemDescription: string;
  barcode: string;
  quantity: number;
  unit: string;
  suggestedLocation: string;
  suggestedLocationDesc: string;
  confirmedLocation?: string;
  overrideReason?: string;
  status: "pending" | "placed";
}

function getAssignmentsFromOffline(data: Record<string, unknown>[]): PutawayAssignment[] {
  return data.map((r) => ({
    id: Number(r.id ?? 0),
    receiptId: Number(r.receipt_id ?? r.receiptId ?? 0),
    receiptNumber: String(r.receipt_number ?? r.receiptNumber ?? ""),
    itemCode: String(r.item_code ?? r.itemCode ?? ""),
    itemDescription: String(r.item_description ?? r.itemDescription ?? "פריט"),
    barcode: String(r.barcode ?? ""),
    quantity: Number(r.quantity ?? 0),
    unit: String(r.unit ?? "יח׳"),
    suggestedLocation: String(r.suggested_location ?? r.suggestedLocation ?? ""),
    suggestedLocationDesc: "",
    status: (String(r.status ?? "pending")) as PutawayAssignment["status"],
  }));
}

export default function PutawayScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<PutawayPhase>("select_assignment");
  const [assignments, setAssignments] = useState<PutawayAssignment[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<PutawayAssignment | null>(null);
  const [overrideLocation, setOverrideLocation] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [itemScanned, setItemScanned] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  function showFeedback(message: string, type: "success" | "error" | "info") {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
    if (type === "success") Vibration.vibrate(100);
    if (type === "error") Vibration.vibrate([0, 100, 100, 100]);
  }

  async function fetchAssignments() {
    setLoading(true);
    try {
      const data = await apiRequest<Record<string, unknown>>("/warehouse-intelligence/putaway-assignments");
      setAssignments((data.assignments as PutawayAssignment[] | undefined) || (data as unknown as PutawayAssignment[]) || []);
      setIsOffline(false);
    } catch {
      try {
        const offline = await offlineDb.getOfflineWmsPutaway("pending");
        if (offline.length > 0) {
          setAssignments(getAssignmentsFromOffline(offline));
          setIsOffline(true);
          showFeedback("מציג משימות אחסון מקומיות", "info");
        } else {
          setAssignments([]);
          setIsOffline(true);
          showFeedback("אין משימות אחסון זמינות — בדוק חיבור לרשת", "error");
        }
      } catch {
        setAssignments([]);
        setIsOffline(true);
        showFeedback("שגיאה בטעינת משימות — בדוק חיבור לרשת", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchAssignments(); }, []);

  function handleScan(code: string) {
    if (!currentAssignment) return;
    if (!itemScanned) {
      if (code === currentAssignment.barcode || code === currentAssignment.itemCode) {
        setItemScanned(true);
        showFeedback(`פריט אושר: ${currentAssignment.itemDescription}`, "success");
      } else {
        showFeedback("ברקוד לא תואם לפריט הנוכחי", "error");
      }
    } else {
      if (code === currentAssignment.suggestedLocation || code.includes(currentAssignment.suggestedLocation)) {
        confirmPutaway(code, "");
      } else {
        showFeedback("מיקום שגוי — השתמש בעקיפה אם נדרש", "error");
        setShowOverride(true);
        setOverrideLocation(code);
      }
    }
  }

  async function confirmPutaway(location: string, reason: string) {
    if (!currentAssignment) return;
    setSubmitting(true);
    const payload = {
      assignmentId: currentAssignment.id,
      receiptId: currentAssignment.receiptId,
      itemCode: currentAssignment.itemCode,
      quantity: currentAssignment.quantity,
      confirmedLocation: location,
      suggestedLocation: currentAssignment.suggestedLocation,
      overrideReason: reason || null,
    };
    try {
      await apiRequest("/warehouse-intelligence/putaway-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setAssignments(prev => prev.map(a => a.id === currentAssignment.id ? { ...a, status: "placed", confirmedLocation: location, overrideReason: reason } : a));
      showFeedback(`${currentAssignment.itemDescription} — אוחסן ב${location}`, "success");
    } catch {
      await offlineDb.addPendingMutation("putaway_confirm", "/warehouse-intelligence/putaway-confirm", "POST", payload);
      setAssignments(prev => prev.map(a => a.id === currentAssignment.id ? { ...a, status: "placed" } : a));
      showFeedback("נשמר אופליין — יסונכרן בחיבור הבא", "info");
    } finally {
      setSubmitting(false);
      setCurrentAssignment(null);
      setItemScanned(false);
      setShowOverride(false);
      setOverrideLocation("");
      setOverrideReason("");
      setPhase("select_assignment");
    }
  }

  const pendingCount = assignments.filter(a => a.status === "pending").length;
  const placedCount = assignments.filter(a => a.status === "placed").length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>אחסון (Putaway)</Text>
        {isOffline && <Ionicons name="cloud-offline-outline" size={18} color="#f59e0b" />}
      </View>

      {feedback && (
        <View style={[styles.feedback, feedback.type === "success" ? styles.fbSuccess : feedback.type === "error" ? styles.fbError : styles.fbInfo]}>
          <Ionicons name={feedback.type === "success" ? "checkmark-circle" : feedback.type === "error" ? "alert-circle" : "information-circle"} size={18} color="#fff" />
          <Text style={styles.feedbackText}>{feedback.message}</Text>
        </View>
      )}

      {phase === "select_assignment" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryBadge}>{pendingCount} ממתינות</Text>
            <Text style={styles.summaryBadgeDone}>{placedCount} הושלמו</Text>
          </View>
          {loading ? <ActivityIndicator color="#d97706" style={{ marginTop: 40 }} /> : assignments.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="archive" size={48} color="#6b7280" />
              <Text style={styles.emptyText}>אין משימות אחסון ממתינות</Text>
            </View>
          ) : assignments.map(a => (
            <TouchableOpacity
              key={a.id}
              style={[styles.assignCard, a.status === "placed" && styles.assignCardDone]}
              onPress={() => { if (a.status !== "placed") { setCurrentAssignment(a); setItemScanned(false); setPhase("scan_item"); } }}
              disabled={a.status === "placed"}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.assignName}>{a.itemDescription}</Text>
                <Ionicons name={a.status === "placed" ? "checkmark-circle" : "archive-outline"} size={20} color={a.status === "placed" ? "#10b981" : "#d97706"} />
              </View>
              <Text style={styles.assignCode}>{a.itemCode} · {a.receiptNumber}</Text>
              <Text style={styles.assignLocation}>מיקום מוצע: {a.suggestedLocation}</Text>
              <Text style={styles.assignQty}>{a.quantity} {a.unit}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {(phase === "scan_item" || phase === "confirm_location") && currentAssignment && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.assignmentCard}>
            <Text style={styles.assignmentTitle}>{currentAssignment.itemDescription}</Text>
            <Text style={styles.assignmentSub}>{currentAssignment.itemCode} · {currentAssignment.quantity} {currentAssignment.unit}</Text>
            <Text style={styles.locationSuggested}>מיקום מוצע: {currentAssignment.suggestedLocation}</Text>
          </View>

          <View style={styles.stepsRow}>
            <View style={[styles.step, itemScanned && styles.stepDone]}>
              <Ionicons name={itemScanned ? "checkmark-circle" : "barcode-outline"} size={18} color={itemScanned ? "#10b981" : "#d97706"} />
              <Text style={styles.stepText}>סרוק פריט</Text>
            </View>
            <View style={[styles.step, !itemScanned && styles.stepInactive]}>
              <Ionicons name="location-outline" size={18} color={itemScanned ? "#d97706" : "#64748b"} />
              <Text style={[styles.stepText, !itemScanned && { color: "#64748b" }]}>סרוק מיקום</Text>
            </View>
          </View>

          <WmsScanner
            onScan={handleScan}
            color="#d97706"
            hint={itemScanned ? "כוון לברקוד מיקום האחסון" : "כוון לברקוד הפריט"}
            placeholder={itemScanned ? "קוד מיקום ידני..." : "ברקוד פריט ידני..."}
            isLoading={submitting}
          />

          {itemScanned && (
            <TouchableOpacity style={styles.overrideBtn} onPress={() => { setShowOverride(true); }}>
              <Ionicons name="swap-horizontal-outline" size={16} color="#d97706" />
              <Text style={styles.overrideBtnText}>שנה מיקום אחסון</Text>
            </TouchableOpacity>
          )}

          {showOverride && (
            <View style={styles.overrideBox}>
              <Text style={styles.overrideTitle}>מיקום אחסון חלופי</Text>
              <TextInput
                style={styles.overrideInput}
                value={overrideLocation}
                onChangeText={setOverrideLocation}
                placeholder="קוד מיקום חלופי..."
                placeholderTextColor="#64748b"
                textAlign="right"
              />
              <Text style={styles.overrideTitle}>סיבת עקיפה</Text>
              <View style={styles.overrideReasons}>
                {OVERRIDE_REASONS.map(r => (
                  <TouchableOpacity key={r} style={[styles.reasonChip, overrideReason === r && styles.reasonChipSelected]} onPress={() => setOverrideReason(r)}>
                    <Text style={[styles.reasonChipText, overrideReason === r && { color: "#d97706" }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.confirmOverrideBtn, submitting && { opacity: 0.5 }]}
                onPress={() => confirmPutaway(overrideLocation || currentAssignment.suggestedLocation, overrideReason)}
                disabled={submitting || !overrideLocation.trim()}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmOverrideBtnText}>אשר אחסון</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {phase === "complete" && (
        <View style={styles.completeBox}>
          <Ionicons name="checkmark-done-circle" size={72} color="#10b981" />
          <Text style={styles.completeTitle}>אחסון הושלם!</Text>
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
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#78350f", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "right" },
  feedback: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  fbSuccess: { backgroundColor: "#065f46" },
  fbError: { backgroundColor: "#991b1b" },
  fbInfo: { backgroundColor: "#1e3a5f" },
  feedbackText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  summaryBadge: { backgroundColor: "#78350f", color: "#fde68a", fontFamily: "Inter_600SemiBold", fontSize: 13, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  summaryBadgeDone: { backgroundColor: "#052e16", color: "#6ee7b7", fontFamily: "Inter_600SemiBold", fontSize: 13, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  emptyBox: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: "#6b7280", fontFamily: "Inter_400Regular" },
  assignCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 10 },
  assignCardDone: { opacity: 0.5 },
  assignName: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#f1f5f9", flex: 1, textAlign: "right" },
  assignCode: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#64748b", textAlign: "right", marginTop: 4 },
  assignLocation: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#d97706", textAlign: "right", marginTop: 4 },
  assignQty: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#94a3b8", textAlign: "right", marginTop: 2 },
  assignmentCard: { backgroundColor: "#1e293b", borderRadius: 14, padding: 16, marginBottom: 14 },
  assignmentTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#f1f5f9", textAlign: "right" },
  assignmentSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#94a3b8", textAlign: "right", marginTop: 4 },
  locationSuggested: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#d97706", textAlign: "right", marginTop: 6 },
  stepsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  step: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#1e293b", borderRadius: 10, paddingVertical: 8 },
  stepDone: { backgroundColor: "#052e16" },
  stepInactive: { backgroundColor: "#0f172a" },
  stepText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#d97706" },
  overrideBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  overrideBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#d97706" },
  overrideBox: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, marginTop: 10 },
  overrideTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#94a3b8", textAlign: "right", marginBottom: 8 },
  overrideInput: { backgroundColor: "#0f172a", borderRadius: 10, padding: 12, fontSize: 14, color: "#f1f5f9", marginBottom: 10 },
  overrideReasons: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  reasonChip: { backgroundColor: "#0f172a", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  reasonChipSelected: { backgroundColor: "#78350f" },
  reasonChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#94a3b8" },
  confirmOverrideBtn: { backgroundColor: "#d97706", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  confirmOverrideBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  primaryBtn: { backgroundColor: "#d97706", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 16 },
  primaryBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  completeBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  completeTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#f1f5f9" },
});
