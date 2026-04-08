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

const SHORT_PICK_REASONS = [
  "חסר במלאי",
  "פריט פגום",
  "מיקום שגוי",
  "פריט נעדר",
  "מחסן סגור",
];

type PickPhase = "select_list" | "scan_location" | "scan_item" | "confirm_qty" | "complete";

interface PickItem {
  id: number;
  itemDescription: string;
  itemCode: string;
  barcode: string;
  locationCode: string;
  zoneName: string;
  requiredQuantity: number;
  pickedQuantity: number;
  unit: string;
  status: "pending" | "partial" | "picked" | "short";
  shortReason?: string;
  substitutionBarcode?: string;
  substitutionItemCode?: string;
  substitutionItemDescription?: string;
  substitutionQuantity?: number;
}

interface PickList {
  id: number;
  listNumber: string;
  orderId: number;
  orderNumber: string;
  customerName: string;
  priority: "high" | "normal" | "low";
  items: PickItem[];
  dueTime?: string;
}

function getPickListsFromOffline(data: Record<string, unknown>[]): PickList[] {
  return data.map((r) => {
    const str = (key: string, fallback = "") => String(r[key] ?? fallback);
    const num = (key: string, fallback = 0) => Number(r[key] ?? fallback);
    const dataJson = typeof r.data_json === "string" ? JSON.parse(r.data_json) : null;
    return {
      id: num("id"),
      listNumber: str("list_number") || str("listNumber") || `PL-${num("id")}`,
      orderId: num("order_id") || num("orderId"),
      orderNumber: str("order_number") || str("orderNumber"),
      customerName: str("customer_name") || str("customerName"),
      priority: (str("priority") || "normal") as PickList["priority"],
      items: Array.isArray(r.items) ? (r.items as PickItem[]) : (dataJson?.items ?? []),
      dueTime: str("due_time") || str("dueTime") || undefined,
    };
  });
}

export default function PickScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<PickPhase>("select_list");
  const [pickLists, setPickLists] = useState<PickList[]>([]);
  const [selectedList, setSelectedList] = useState<PickList | null>(null);
  const [currentItem, setCurrentItem] = useState<PickItem | null>(null);
  const [pickedQty, setPickedQty] = useState("1");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [showShortPickModal, setShowShortPickModal] = useState(false);
  const [shortPickReason, setShortPickReason] = useState("");
  const [substitutionBarcode, setSubstitutionBarcode] = useState("");
  const [substitutionQty, setSubstitutionQty] = useState("1");
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  function showFeedback(message: string, type: "success" | "error" | "info") {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
    if (type === "success") Vibration.vibrate(100);
    if (type === "error") Vibration.vibrate([0, 100, 100, 100]);
  }

  async function fetchPickLists() {
    setLoading(true);
    try {
      const data = await apiRequest<Record<string, unknown>>("/warehouse-intelligence/pick-lists");
      setPickLists((data.pickLists as PickList[] | undefined) || (data as unknown as PickList[]) || []);
      setIsOffline(false);
    } catch {
      try {
        const offline = await offlineDb.getOfflineWmsPickLists("pending");
        if (offline.length > 0) {
          setPickLists(getPickListsFromOffline(offline));
          setIsOffline(true);
          showFeedback("מציג נתוני רשימות שמורים מקומית", "info");
        } else {
          setPickLists([]);
          setIsOffline(true);
          showFeedback("אין רשימות ליקוט זמינות — בדוק חיבור לרשת", "error");
        }
      } catch {
        setPickLists([]);
        setIsOffline(true);
        showFeedback("שגיאה בטעינת נתונים — בדוק חיבור לרשת", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    fetchPickLists();
  }, []);

  function handleScan(code: string) {
    if (phase === "scan_location") {
      handleLocationScan(code);
    } else if (phase === "scan_item") {
      handleItemScan(code);
    }
  }

  function handleLocationScan(code: string) {
    if (!currentItem) return;
    if (code === currentItem.locationCode || code.includes(currentItem.locationCode)) {
      setLocationConfirmed(true);
      setPhase("scan_item");
      showFeedback(`מיקום אושר: ${currentItem.locationCode}`, "success");
    } else {
      showFeedback(`מיקום שגוי! צפוי: ${currentItem.locationCode}`, "error");
    }
  }

  function handleItemScan(code: string) {
    if (!currentItem) return;
    if (code === currentItem.barcode || code === currentItem.itemCode) {
      setPhase("confirm_qty");
      setPickedQty(String(currentItem.requiredQuantity - currentItem.pickedQuantity));
      showFeedback(`נסרק: ${currentItem.itemDescription}`, "success");
    } else {
      showFeedback("ברקוד לא תואם לפריט הנוכחי", "error");
    }
  }

  function startPickItem(list: PickList, item: PickItem) {
    setSelectedList(list);
    setCurrentItem(item);
    setLocationConfirmed(false);
    setPhase("scan_location");
  }

  function confirmPickQuantity() {
    if (!selectedList || !currentItem) return;
    const qty = parseFloat(pickedQty || "0");
    if (isNaN(qty) || qty < 0) {
      showFeedback("כמות לא תקינה", "error");
      return;
    }
    const remaining = currentItem.requiredQuantity - currentItem.pickedQuantity;
    const newStatus: PickItem["status"] = qty >= remaining ? "picked" : qty > 0 ? "partial" : "pending";
    const currentItemId = currentItem.id;

    const updatedList: PickList = {
      ...selectedList,
      items: selectedList.items.map(i =>
        i.id === currentItemId
          ? { ...i, pickedQuantity: i.pickedQuantity + qty, status: newStatus }
          : i
      ),
    };

    setSelectedList(updatedList);
    showFeedback(`+${qty} ${currentItem.unit} ליקט`, "success");
    setCurrentItem(null);

    const updatedCurrentItem = updatedList.items.find(i => i.id === currentItemId);
    const nextPending = updatedList.items.find(
      i => i.id !== currentItemId && (i.status === "pending" || i.status === "partial")
    );
    const allResolved = updatedList.items.every(i => i.status === "picked" || i.status === "short");

    if (updatedCurrentItem?.status === "partial") {
      setCurrentItem(updatedCurrentItem);
      setPickedQty("");
      showFeedback(`ליקוט חלקי — נדרש עוד ${(updatedCurrentItem.requiredQuantity - updatedCurrentItem.pickedQuantity).toFixed(2)} ${updatedCurrentItem.unit}`, "info");
    } else if (nextPending) {
      setCurrentItem(nextPending);
      setLocationConfirmed(false);
      setPhase("scan_location");
    } else if (allResolved) {
      setPhase("complete");
    } else {
      setPhase("select_list");
    }
  }

  function confirmShortPick(reason: string) {
    if (!selectedList || !currentItem) return;
    const currentItemId = currentItem.id;
    const subBarcode = substitutionBarcode.trim();
    const subQty = parseFloat(substitutionQty || "1") || 1;
    const updatedList: PickList = {
      ...selectedList,
      items: selectedList.items.map(i =>
        i.id === currentItemId
          ? {
              ...i,
              status: "short",
              shortReason: reason,
              substitutionBarcode: subBarcode || undefined,
              substitutionItemCode: subBarcode || undefined,
              substitutionQuantity: subBarcode ? subQty : undefined,
            }
          : i
      ),
    };
    setSelectedList(updatedList);
    setShowShortPickModal(false);
    setSubstitutionBarcode("");
    setSubstitutionQty("1");
    const msg = subBarcode
      ? `ליקוט חסר: ${reason} | תחליף: ${subBarcode} × ${subQty}`
      : `ליקוט חסר: ${reason}`;
    showFeedback(msg, "info");
    setCurrentItem(null);

    const nextPending = updatedList.items.find(i => i.id !== currentItemId && (i.status === "pending" || i.status === "partial"));
    const allResolved = updatedList.items.every(i => i.status === "picked" || i.status === "short");
    if (nextPending) {
      setCurrentItem(nextPending);
      setLocationConfirmed(false);
      setPhase("scan_location");
    } else if (allResolved) {
      setPhase("complete");
    } else {
      setPhase("select_list");
    }
  }

  async function submitPickList() {
    if (!selectedList) return;
    setSubmitting(true);
    const payload = {
      pickListId: selectedList.id,
      listNumber: selectedList.listNumber,
      items: selectedList.items.map(i => ({
        id: i.id,
        itemCode: i.itemCode,
        pickedQuantity: i.pickedQuantity,
        status: i.status,
        shortReason: i.shortReason,
        substitutionBarcode: i.substitutionBarcode || null,
        substitutionItemCode: i.substitutionItemCode || null,
        substitutionQuantity: i.substitutionQuantity || null,
      })),
    };
    try {
      await apiRequest("/warehouse-intelligence/pick-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      Alert.alert("ליקוט הושלם", `רשימת ליקוט ${selectedList.listNumber} הושלמה בהצלחה`, [{ text: "אישור", onPress: () => router.back() }]);
    } catch {
      await offlineDb.addPendingMutation("pick_complete", "/warehouse-intelligence/pick-complete", "POST", payload);
      Alert.alert("שמור אופליין", "רשימת הליקוט נשמרה מקומית ותשוגר בחיבור הבא", [{ text: "אישור", onPress: () => router.back() }]);
    } finally {
      setSubmitting(false);
    }
  }

  const pickedCount = selectedList?.items.filter(i => i.status === "picked").length || 0;
  const totalCount = selectedList?.items.length || 0;
  const shortCount = selectedList?.items.filter(i => i.status === "short").length || 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ליקוט</Text>
        {isOffline && <Ionicons name="cloud-offline-outline" size={18} color="#f59e0b" />}
        {selectedList && (
          <TouchableOpacity onPress={() => { setSelectedList(null); setPhase("select_list"); setCurrentItem(null); }} style={styles.iconButton}>
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

      {phase === "select_list" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {!selectedList ? (
            <>
              <Text style={styles.sectionTitle}>רשימות ליקוט</Text>
              {loading ? (
                <ActivityIndicator color="#1d4ed8" style={{ marginTop: 40 }} />
              ) : pickLists.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="checkmark-done-outline" size={48} color="#6b7280" />
                  <Text style={styles.emptyText}>אין רשימות ליקוט פעילות</Text>
                </View>
              ) : (
                pickLists.map(list => (
                  <TouchableOpacity key={list.id} style={styles.listCard} onPress={() => {
                    const first = list.items.find(i => i.status === "pending" || i.status === "partial");
                    if (first) startPickItem(list, first);
                    else { setSelectedList(list); setPhase("select_list"); }
                  }}>
                    <View style={styles.listCardHeader}>
                      <Text style={styles.listNumber}>{list.listNumber}</Text>
                      <View style={[styles.priorityBadge, list.priority === "high" ? styles.priorityHigh : list.priority === "low" ? styles.priorityLow : styles.priorityNormal]}>
                        <Text style={styles.priorityText}>{list.priority === "high" ? "דחוף" : list.priority === "low" ? "נמוך" : "רגיל"}</Text>
                      </View>
                    </View>
                    <Text style={styles.listOrder}>{list.orderNumber} — {list.customerName}</Text>
                    <Text style={styles.listItems}>{list.items.length} פריטים{list.dueTime ? ` · עד ${list.dueTime}` : ""}</Text>
                  </TouchableOpacity>
                ))
              )}
            </>
          ) : (
            <>
              <View style={styles.progressHeader}>
                <Text style={styles.listNumberLarge}>{selectedList.listNumber}</Text>
                <Text style={styles.progressText}>{pickedCount}/{totalCount} פריטים{shortCount > 0 ? ` · ${shortCount} חסרים` : ""}</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${totalCount > 0 ? (pickedCount / totalCount) * 100 : 0}%` }]} />
              </View>
              <Text style={styles.sectionTitle}>פריטים לליקוט</Text>
              {selectedList.items.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.itemCard, item.status === "picked" ? styles.itemPicked : item.status === "short" ? styles.itemShort : item.status === "partial" ? styles.itemPartial : styles.itemPending]}
                  onPress={() => (item.status === "pending" || item.status === "partial") ? startPickItem(selectedList, item) : undefined}
                  disabled={item.status === "picked"}
                >
                  <Ionicons
                    name={item.status === "picked" ? "checkmark-circle" : item.status === "short" ? "alert-circle" : item.status === "partial" ? "time" : "ellipse-outline"}
                    size={22} color={item.status === "picked" ? "#10b981" : item.status === "short" ? "#ef4444" : item.status === "partial" ? "#f59e0b" : "#6b7280"}
                  />
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={styles.itemName}>{item.itemDescription}</Text>
                    <Text style={styles.itemCode}>{item.itemCode} · {item.locationCode} · {item.zoneName}</Text>
                    {item.shortReason && <Text style={styles.itemShortReason}>סיבה: {item.shortReason}</Text>}
                  </View>
                  <Text style={styles.itemQty}>{item.pickedQuantity}/{item.requiredQuantity} {item.unit}</Text>
                </TouchableOpacity>
              ))}
              {selectedList.items.every(i => i.status === "picked" || i.status === "short") && (
                <TouchableOpacity
                  style={[styles.submitBtn, submitting && styles.btnDisabled]}
                  onPress={submitPickList}
                  disabled={submitting}
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>סיים ליקוט</Text>}
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      )}

      {(phase === "scan_location" || phase === "scan_item") && currentItem && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.scanInstruction}>
            <Ionicons name={phase === "scan_location" ? "location" : "barcode"} size={24} color="#1d4ed8" />
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.scanInstructionTitle}>
                {phase === "scan_location" ? "סרוק מיקום" : "סרוק פריט"}
              </Text>
              <Text style={styles.scanInstructionSub}>
                {phase === "scan_location" ? `מיקום צפוי: ${currentItem.locationCode}` : currentItem.itemDescription}
              </Text>
            </View>
          </View>
          <WmsScanner
            onScan={handleScan}
            color="#1d4ed8"
            hint={phase === "scan_location" ? "סרוק ברקוד מיקום" : "סרוק ברקוד פריט"}
            placeholder={phase === "scan_location" ? "קוד מיקום ידני..." : "ברקוד פריט ידני..."}
          />
          <TouchableOpacity style={styles.shortPickBtn} onPress={() => setShowShortPickModal(true)}>
            <Ionicons name="alert-outline" size={18} color="#f59e0b" />
            <Text style={styles.shortPickText}>דווח על ליקוט חסר</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "confirm_qty" && currentItem && (
        <View style={styles.qtyCard}>
          <Text style={styles.qtyTitle}>{currentItem.itemDescription}</Text>
          <Text style={styles.qtySub}>{currentItem.locationCode} · נדרש: {currentItem.requiredQuantity - currentItem.pickedQuantity} {currentItem.unit}</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => setPickedQty(q => String(Math.max(0, parseFloat(q || "1") - 1)))}>
              <Ionicons name="remove" size={22} color="#fff" />
            </TouchableOpacity>
            <TextInput style={styles.qtyInput} value={pickedQty} onChangeText={setPickedQty} keyboardType="decimal-pad" textAlign="center" />
            <TouchableOpacity style={styles.qtyBtn} onPress={() => setPickedQty(q => String(parseFloat(q || "0") + 1))}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.qtyActions}>
            <TouchableOpacity onPress={() => setShowShortPickModal(true)} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>ליקוט חסר</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmPickQuantity} style={styles.confirmBtn}>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.confirmBtnText}>אשר ליקוט</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {phase === "complete" && (
        <View style={styles.completeBox}>
          <Ionicons name="checkmark-done-circle" size={72} color="#10b981" />
          <Text style={styles.completeTitle}>ליקוט הושלם!</Text>
          <Text style={styles.completeSub}>{pickedCount} פריטים ליקטו{shortCount > 0 ? `, ${shortCount} חסרים` : ""}</Text>
          <TouchableOpacity style={styles.submitBtn} onPress={submitPickList} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>שלח ליקוט</Text>}
          </TouchableOpacity>
        </View>
      )}

      {showShortPickModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>סיבת ליקוט חסר</Text>
            {SHORT_PICK_REASONS.map(reason => (
              <TouchableOpacity
                key={reason}
                style={[styles.reasonOption, shortPickReason === reason && styles.reasonSelected]}
                onPress={() => setShortPickReason(reason)}
              >
                <Text style={[styles.reasonText, shortPickReason === reason && styles.reasonTextSelected]}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.reasonInput}
              value={shortPickReason}
              onChangeText={setShortPickReason}
              placeholder="סיבה אחרת..."
              placeholderTextColor="#9ca3af"
            />
            <Text style={[styles.modalTitle, { fontSize: 14, marginTop: 12 }]}>הצעת תחליף (אופציונלי)</Text>
            <TextInput
              style={styles.reasonInput}
              value={substitutionBarcode}
              onChangeText={setSubstitutionBarcode}
              placeholder="ברקוד / קוד פריט תחליף..."
              placeholderTextColor="#9ca3af"
              textAlign="right"
            />
            {substitutionBarcode.trim() ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Text style={{ color: "#94a3b8", fontSize: 13, fontFamily: "Inter_400Regular" }}>כמות:</Text>
                <TextInput
                  style={[styles.reasonInput, { flex: 1 }]}
                  value={substitutionQty}
                  onChangeText={setSubstitutionQty}
                  keyboardType="decimal-pad"
                  textAlign="right"
                />
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setShowShortPickModal(false); setSubstitutionBarcode(""); setSubstitutionQty("1"); }} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmShortPick(shortPickReason || "לא צוין")} style={styles.confirmBtn}>
                <Text style={styles.confirmBtnText}>אשר</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e3a8a", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  backButton: { padding: 4 },
  iconButton: { marginRight: 8, padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "right" },
  feedback: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  fbSuccess: { backgroundColor: "#065f46" },
  fbError: { backgroundColor: "#991b1b" },
  fbInfo: { backgroundColor: "#1e3a5f" },
  feedbackText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#e2e8f0", textAlign: "right", marginBottom: 12 },
  listCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 10 },
  listCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  listNumber: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#f1f5f9" },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityHigh: { backgroundColor: "#7f1d1d" },
  priorityNormal: { backgroundColor: "#1e3a5f" },
  priorityLow: { backgroundColor: "#1a2e1a" },
  priorityText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#e2e8f0" },
  listOrder: { fontSize: 13, color: "#94a3b8", fontFamily: "Inter_400Regular", textAlign: "right", marginBottom: 4 },
  listItems: { fontSize: 12, color: "#64748b", fontFamily: "Inter_400Regular", textAlign: "right" },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  listNumberLarge: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#f1f5f9" },
  progressText: { fontSize: 13, color: "#94a3b8", fontFamily: "Inter_400Regular" },
  progressBar: { height: 6, backgroundColor: "#334155", borderRadius: 3, marginBottom: 16, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: "#1d4ed8", borderRadius: 3 },
  itemCard: { flexDirection: "row", alignItems: "center", borderRadius: 10, padding: 12, marginBottom: 8 },
  itemPending: { backgroundColor: "#1e293b" },
  itemPicked: { backgroundColor: "#052e16", opacity: 0.8 },
  itemShort: { backgroundColor: "#3b0000" },
  itemPartial: { backgroundColor: "#2d1f00" },
  itemName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#f1f5f9", textAlign: "right" },
  itemCode: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#64748b", textAlign: "right" },
  itemShortReason: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#fca5a5", textAlign: "right" },
  itemQty: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#93c5fd" },
  emptyBox: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: "#6b7280", fontFamily: "Inter_400Regular" },
  scanInstruction: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 14, gap: 12 },
  scanInstructionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#f1f5f9", textAlign: "right" },
  scanInstructionSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#94a3b8", textAlign: "right" },
  shortPickBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, marginTop: 8 },
  shortPickText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#f59e0b" },
  qtyCard: { margin: 16, backgroundColor: "#1e293b", borderRadius: 16, padding: 20 },
  qtyTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#f1f5f9", textAlign: "right", marginBottom: 6 },
  qtySub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#94a3b8", textAlign: "right", marginBottom: 20 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center", marginBottom: 20 },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1d4ed8", alignItems: "center", justifyContent: "center" },
  qtyInput: { flex: 1, height: 56, backgroundColor: "#0f172a", borderRadius: 12, fontSize: 24, fontFamily: "Inter_700Bold", color: "#f1f5f9" },
  qtyActions: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#475569", alignItems: "center" },
  cancelBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#94a3b8" },
  confirmBtn: { flex: 2, backgroundColor: "#1d4ed8", paddingVertical: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  confirmBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  submitBtn: { backgroundColor: "#1d4ed8", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 16 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  btnDisabled: { opacity: 0.5 },
  completeBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  completeTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#f1f5f9" },
  completeSub: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#94a3b8" },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 },
  modal: { backgroundColor: "#1e293b", borderRadius: 16, padding: 20, width: "100%" },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#f1f5f9", textAlign: "right", marginBottom: 12 },
  reasonOption: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 6, backgroundColor: "#0f172a" },
  reasonSelected: { backgroundColor: "#1e3a8a" },
  reasonText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#94a3b8", textAlign: "right" },
  reasonTextSelected: { color: "#93c5fd", fontFamily: "Inter_600SemiBold" },
  reasonInput: { backgroundColor: "#0f172a", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: "#f1f5f9", textAlign: "right", marginTop: 8 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
});
