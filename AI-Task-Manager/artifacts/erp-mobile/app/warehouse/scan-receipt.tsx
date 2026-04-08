import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Vibration,
  useWindowDimensions,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { WmsScanner } from "@/components/WmsScanner";
import { apiRequest } from "@/lib/api";
import * as offlineDb from "@/lib/offline-db";
import * as ImagePicker from "expo-image-picker";

type ScanPhase = "scan_po" | "scan_items" | "confirm";

interface POItem {
  id: number;
  materialId: number | null;
  materialName: string;
  materialNumber: string;
  barcode: string | null;
  itemCode: string | null;
  itemDescription: string;
  quantity: string;
  receivedQuantity: string;
  unit: string;
}

interface ScannedItem {
  poItemId: number | null;
  materialId: number | null;
  itemDescription: string;
  itemCode: string;
  scannedQuantity: number;
  expectedQuantity: number;
  unit: string;
  barcode: string;
  lotNumber?: string;
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  damageNotes?: string;
  damagePhotoUri?: string;
  varianceNote?: string;
  storageLocation?: string;
}

interface PurchaseOrder {
  id: number;
  order_number: string;
  supplier_id: number;
  supplier_name: string;
  status: string;
  items: POItem[];
}

export default function ScanReceiptScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const [phase, setPhase] = useState<ScanPhase>("scan_po");
  const [poData, setPoData] = useState<PurchaseOrder | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentScanTarget, setCurrentScanTarget] = useState<ScannedItem | null>(null);
  const [manualQty, setManualQty] = useState("1");
  const [itemLot, setItemLot] = useState("");
  const [itemBatch, setItemBatch] = useState("");
  const [itemSerial, setItemSerial] = useState("");
  const [itemExpiry, setItemExpiry] = useState("");
  const [itemDamage, setItemDamage] = useState("");
  const [itemDamagePhotoUri, setItemDamagePhotoUri] = useState<string | undefined>(undefined);
  const [itemVarianceNote, setItemVarianceNote] = useState("");
  const [itemLocation, setItemLocation] = useState("");

  function showFeedback(message: string, type: "success" | "error" | "info") {
    setScanFeedback({ message, type });
    setTimeout(() => setScanFeedback(null), 3000);
    if (type === "success") Vibration.vibrate(100);
    if (type === "error") Vibration.vibrate([0, 100, 100, 100]);
  }

  async function handlePOScan(code: string) {
    if (!code.trim()) return;
    setLoading(true);
    try {
      let po: PurchaseOrder;
      try {
        po = await apiRequest<PurchaseOrder>(
          `/warehouse-intelligence/scan-po/${encodeURIComponent(code.trim())}`
        );
        offlineDb.upsertPurchaseOrders([po as unknown as Record<string, unknown>]).catch(() => {});
      } catch {
        const localResults = await offlineDb.searchOfflinePurchaseOrders(code.trim());
        const match = localResults.find(
          (r) => String(r.order_number) === code.trim() || String(r.orderNumber) === code.trim()
        ) ?? localResults[0];
        if (!match) throw new Error("הזמנת רכש לא נמצאה (גם לא במאגר המקומי)");
        po = match as unknown as PurchaseOrder;
        showFeedback("מצב לא מקוון — נטען ממאגר מקומי", "info");
      }
      setPoData(po);
      const initialItems: ScannedItem[] = (po.items || []).map(item => ({
        poItemId: item.id,
        materialId: item.materialId,
        itemDescription: item.materialName || item.itemDescription,
        itemCode: item.materialNumber || item.itemCode || "",
        scannedQuantity: 0,
        expectedQuantity: parseFloat(item.quantity || "0"),
        unit: item.unit,
        barcode: item.barcode || item.materialNumber || "",
      }));
      setScannedItems(initialItems);
      setPhase("scan_items");
      showFeedback(`נמצאה הזמנה ${po.order_number} עם ${po.items?.length || 0} פריטים`, "success");
    } catch (e: unknown) {
      showFeedback(e instanceof Error ? e.message : "הזמנת רכש לא נמצאה", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleItemScan(barcode: string) {
    if (!barcode.trim()) return;

    const found = scannedItems.find(
      item => item.barcode === barcode.trim() || item.itemCode === barcode.trim()
    );

    if (found) {
      setCurrentScanTarget(found);
      setManualQty("1");
      showFeedback(`נסרק: ${found.itemDescription}`, "success");
      return;
    }

    let mat: Record<string, unknown> | null = null;
    try {
      mat = await apiRequest<Record<string, unknown>>(
        `/warehouse-intelligence/scan-material/${encodeURIComponent(barcode.trim())}`
      );
    } catch {
      const inventoryResults = await offlineDb.searchOfflineInventory(barcode.trim()).catch(() => []);
      const inventoryMatch = inventoryResults.find(
        (r) => String(r.barcode) === barcode.trim() || String(r.item_number) === barcode.trim()
      ) ?? inventoryResults[0];
      if (inventoryMatch) {
        mat = {
          id: inventoryMatch.id,
          material_name: inventoryMatch.item_name ?? inventoryMatch.itemName,
          material_number: inventoryMatch.item_number ?? inventoryMatch.itemNumber,
          unit: inventoryMatch.unit,
        };
      }
    }

    if (mat) {
      const newItem: ScannedItem = {
        poItemId: null,
        materialId: mat.id as number | null,
        itemDescription: String(mat.material_name || ""),
        itemCode: String(mat.material_number || ""),
        scannedQuantity: 0,
        expectedQuantity: 0,
        unit: String(mat.unit || ""),
        barcode: barcode.trim(),
      };
      setCurrentScanTarget(newItem);
      setManualQty("1");
      showFeedback(`נמצא חומר: ${String(mat.material_name)} (לא בהזמנה)`, "info");
    } else {
      showFeedback("ברקוד לא נמצא בהזמנה ובמאגר החומרים", "error");
    }
  }


  async function submitReceipt() {
    if (!poData) return;
    const itemsWithQty = scannedItems.filter(i => i.scannedQuantity > 0);
    if (itemsWithQty.length === 0) {
      Alert.alert("שגיאה", "לא נסרק אף פריט");
      return;
    }

    setSubmitting(true);
    const payload = {
      orderId: poData.id,
      supplierId: poData.supplier_id,
      orderNumber: poData.order_number,
      receivedBy: "סריקה מובייל",
      notes: `קבלה מסריקת ברקוד — הזמנה ${poData.order_number}`,
      items: itemsWithQty.map(item => ({
        poItemId: item.poItemId,
        materialId: item.materialId,
        itemCode: item.itemCode,
        itemDescription: item.itemDescription,
        expectedQuantity: item.expectedQuantity,
        scannedQuantity: item.scannedQuantity,
        unit: item.unit,
        barcode: item.barcode,
        lotNumber: item.lotNumber || null,
        batchNumber: item.batchNumber || null,
        serialNumber: item.serialNumber || null,
        expiryDate: item.expiryDate || null,
        damageNotes: item.damageNotes || null,
        damagePhotoUri: item.damagePhotoUri || null,
        varianceNote: item.varianceNote || null,
        storageLocation: item.storageLocation || null,
      })),
    };
    try {
      const result = await apiRequest<Record<string, unknown>>("/warehouse-intelligence/mobile-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (result.hasDiscrepancy && Array.isArray(result.discrepancies) && result.discrepancies.length > 0) {
        interface Discrepancy { itemDescription: string; expectedQuantity: number; scannedQuantity: number; difference: number; }
        const discMsg = (result.discrepancies as Discrepancy[])
          .map((d) => `• ${d.itemDescription}: צפוי ${d.expectedQuantity}, התקבל ${d.scannedQuantity} (${d.difference > 0 ? "+" : ""}${d.difference})`)
          .join("\n");
        Alert.alert(
          "קבלה נשמרה — יש אי-התאמות",
          `קבלה ${result.receiptNumber} נשמרה כחלקית.\n\nאי-התאמות:\n${discMsg}\n\nהמשרד ידרש לבדוק ולאשר.`,
          [{ text: "אישור", onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          "קבלה נוצרה בהצלחה",
          `קבלה מספר ${result.receiptNumber} עם ${itemsWithQty.length} פריטים נשמרה\nמלאי עודכן אוטומטית`,
          [{ text: "אישור", onPress: () => router.back() }]
        );
      }
    } catch (e: unknown) {
      await offlineDb.addPendingMutation("mobile_receipt", "/warehouse-intelligence/mobile-receipt", "POST", payload);
      Alert.alert(
        "שמור אופליין",
        `קבלת סחורה עבור ${poData.order_number} נשמרה מקומית ותשוגר לשרת כשהחיבור יחודש.`,
        [{ text: "אישור", onPress: () => router.back() }]
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resetScan() {
    setPhase("scan_po");
    setPoData(null);
    setScannedItems([]);
    setCurrentScanTarget(null);
    setManualQty("1");
  }

  const completionRate = scannedItems.filter(i => i.expectedQuantity > 0).length > 0
    ? Math.round(
        (scannedItems.filter(i => i.scannedQuantity >= i.expectedQuantity && i.expectedQuantity > 0).length /
          scannedItems.filter(i => i.expectedQuantity > 0).length) * 100
      )
    : 0;

  if ((Platform.OS as string) === "web") {
    return (
      <SafeAreaView style={webStyles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>סריקת קבלת סחורה</Text>
        </View>
        <View style={webStyles.notAvailable}>
          <Ionicons name="camera-outline" size={64} color="#6b7280" />
          <Text style={webStyles.notAvailableTitle}>תכונה זו אינה זמינה בדפדפן</Text>
          <Text style={webStyles.notAvailableDesc}>
            סריקת קבלת סחורה מצריכה מצלמה ופועלת באפליקציה הנייטיבית בלבד.
          </Text>
          <TouchableOpacity style={webStyles.backBtn} onPress={() => router.back()}>
            <Text style={webStyles.backBtnText}>חזרה</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const showCamera = !currentScanTarget;

  const headerBar = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>סריקת קבלת סחורה</Text>
      {phase !== "scan_po" && (
        <TouchableOpacity onPress={resetScan} style={styles.iconButton}>
          <Ionicons name="refresh" size={20} color="#f59e0b" />
        </TouchableOpacity>
      )}
    </View>
  );

  const feedbackBar = scanFeedback ? (
    <View style={[styles.feedback, scanFeedback.type === "success" ? styles.feedbackSuccess : scanFeedback.type === "error" ? styles.feedbackError : styles.feedbackInfo]}>
      <Ionicons
        name={scanFeedback.type === "success" ? "checkmark-circle" : scanFeedback.type === "error" ? "alert-circle" : "information-circle"}
        size={18} color="#fff"
      />
      <Text style={styles.feedbackText}>{scanFeedback.message}</Text>
    </View>
  ) : null;

  const phaseRow = (
    <View style={styles.phaseRow}>
      {(["scan_po", "scan_items", "confirm"] as ScanPhase[]).map((p, i) => (
        <View key={p} style={styles.phaseItem}>
          <View style={[styles.phaseCircle, phase === p ? styles.phaseActive : (["scan_items", "confirm"].indexOf(phase) > i) ? styles.phaseDone : styles.phaseInactive]}>
            <Ionicons name={(["barcode", "cube", "checkmark-done"] as const)[i]} size={14} color="#fff" />
          </View>
          <Text style={[styles.phaseLabel, phase === p ? styles.phaseLabelActive : styles.phaseLabelDim]}>
            {["PO", "פריטים", "אישור"][i]}
          </Text>
        </View>
      ))}
    </View>
  );

  const cameraPanel = (
    <WmsScanner
      onScan={handlePOScan}
      hint="סרוק ברקוד הזמנת רכש"
      color="#7c3aed"
      disabled={loading}
      isLoading={loading}
      placeholder="הכנס מספר הזמנה ידנית..."
    />
  );

  const itemsScanCamera = showCamera ? (
    <View style={[styles.itemCameraContainer, isTablet && styles.itemCameraContainerTablet]}>
      <WmsScanner
        onScan={handleItemScan}
        hint="סרוק ברקוד פריט לקבלה"
        color="#7c3aed"
        disabled={loading}
        isLoading={loading}
        placeholder="הכנס ברקוד פריט ידנית..."
      />
    </View>
  ) : null;

  async function captureDamagePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { showFeedback("נדרשת הרשאת מצלמה", "error"); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.6, base64: false });
    if (!result.canceled && result.assets[0]) {
      setItemDamagePhotoUri(result.assets[0].uri);
      showFeedback("תמונת נזק נשמרה", "success");
    }
  }

  async function pickDamagePhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showFeedback("נדרשת הרשאת גלריה", "error"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.6, base64: false });
    if (!result.canceled && result.assets[0]) {
      setItemDamagePhotoUri(result.assets[0].uri);
      showFeedback("תמונת נזק נבחרה", "success");
    }
  }

  function confirmItemQuantity() {
    if (!currentScanTarget) return;
    const qty = parseFloat(manualQty || "1");
    if (isNaN(qty) || qty <= 0) {
      showFeedback("כמות לא תקינה", "error");
      return;
    }
    const enriched: ScannedItem = {
      ...currentScanTarget,
      lotNumber: itemLot || undefined,
      batchNumber: itemBatch || undefined,
      serialNumber: itemSerial || undefined,
      expiryDate: itemExpiry || undefined,
      damageNotes: itemDamage || undefined,
      damagePhotoUri: itemDamagePhotoUri || undefined,
      varianceNote: itemVarianceNote || undefined,
      storageLocation: itemLocation || undefined,
    };
    setScannedItems(prev => {
      const existing = prev.find(i => i.barcode === currentScanTarget.barcode || (i.materialId && i.materialId === currentScanTarget.materialId));
      if (existing) {
        return prev.map(i =>
          (i.barcode === currentScanTarget.barcode || (i.materialId && i.materialId === currentScanTarget.materialId))
            ? { ...enriched, scannedQuantity: i.scannedQuantity + qty }
            : i
        );
      }
      return [...prev, { ...enriched, scannedQuantity: qty }];
    });
    showFeedback(`+${qty} ${currentScanTarget.unit} — ${currentScanTarget.itemDescription}`, "success");
    setCurrentScanTarget(null);
    setManualQty("1");
    setItemLot(""); setItemBatch(""); setItemSerial(""); setItemExpiry(""); setItemDamage(""); setItemDamagePhotoUri(undefined); setItemVarianceNote(""); setItemLocation("");
  }

  const qtyCard = currentScanTarget ? (
    <ScrollView style={styles.qtyCard} contentContainerStyle={{ paddingBottom: 16 }}>
      <Text style={styles.qtyTitle}>{currentScanTarget.itemDescription}</Text>
      <Text style={styles.qtySub}>{currentScanTarget.itemCode} · {currentScanTarget.unit}</Text>
      <View style={styles.qtyRow}>
        <TouchableOpacity style={styles.qtyBtn} onPress={() => setManualQty(q => String(Math.max(0.01, parseFloat(q || "1") - 1)))}>
          <Ionicons name="remove" size={20} color="#fff" />
        </TouchableOpacity>
        <TextInput style={styles.qtyInput} value={manualQty} onChangeText={setManualQty} keyboardType="decimal-pad" textAlign="center" />
        <TouchableOpacity style={styles.qtyBtn} onPress={() => setManualQty(q => String(parseFloat(q || "0") + 1))}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      {currentScanTarget.expectedQuantity > 0 && (
        <TouchableOpacity onPress={() => setManualQty(String(currentScanTarget.expectedQuantity))} style={styles.setExpected}>
          <Text style={styles.setExpectedText}>הגדר לכמות צפויה ({currentScanTarget.expectedQuantity})</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.receiptFieldLabel}>מספר לוט (אופציונלי)</Text>
      <TextInput style={styles.receiptFieldInput} value={itemLot} onChangeText={setItemLot} placeholder="לדוגמה: LOT-2024-001" placeholderTextColor="#64748b" textAlign="right" />
      <Text style={styles.receiptFieldLabel}>מספר אצווה (אופציונלי)</Text>
      <TextInput style={styles.receiptFieldInput} value={itemBatch} onChangeText={setItemBatch} placeholder="לדוגמה: BATCH-001" placeholderTextColor="#64748b" textAlign="right" />
      <Text style={styles.receiptFieldLabel}>מספר סדרתי (אופציונלי)</Text>
      <TextInput style={styles.receiptFieldInput} value={itemSerial} onChangeText={setItemSerial} placeholder="לדוגמה: SN-12345" placeholderTextColor="#64748b" textAlign="right" />
      <Text style={styles.receiptFieldLabel}>תאריך תפוגה (אופציונלי)</Text>
      <TextInput style={styles.receiptFieldInput} value={itemExpiry} onChangeText={setItemExpiry} placeholder="DD/MM/YYYY" placeholderTextColor="#64748b" textAlign="right" keyboardType="numeric" />
      <Text style={styles.receiptFieldLabel}>הערות נזק / מצב פריט</Text>
      <TextInput style={[styles.receiptFieldInput, { minHeight: 52 }]} value={itemDamage} onChangeText={setItemDamage} placeholder="תאר נזק, פגם או הערה לגבי מצב הפריט..." placeholderTextColor="#64748b" textAlign="right" multiline />
      <View style={styles.receiptPhotoRow}>
        <TouchableOpacity style={styles.receiptPhotoBtn} onPress={captureDamagePhoto}>
          <Ionicons name="camera" size={15} color="#fff" />
          <Text style={styles.receiptPhotoBtnText}>צלם נזק</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.receiptPhotoBtn} onPress={pickDamagePhoto}>
          <Ionicons name="image" size={15} color="#fff" />
          <Text style={styles.receiptPhotoBtnText}>בחר מגלריה</Text>
        </TouchableOpacity>
      </View>
      {itemDamagePhotoUri ? (
        <View style={styles.receiptPhotoPreview}>
          <Image source={{ uri: itemDamagePhotoUri }} style={styles.receiptPhotoThumb} />
          <TouchableOpacity onPress={() => setItemDamagePhotoUri(undefined)} style={{ padding: 4 }}>
            <Ionicons name="close-circle" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={styles.receiptFieldLabel}>הערת פער כמות</Text>
      <TextInput style={styles.receiptFieldInput} value={itemVarianceNote} onChangeText={setItemVarianceNote} placeholder="נא לציין סיבה לפער..." placeholderTextColor="#64748b" textAlign="right" />
      <Text style={styles.receiptFieldLabel}>מיקום אחסון</Text>
      <TextInput style={styles.receiptFieldInput} value={itemLocation} onChangeText={setItemLocation} placeholder="לדוגמה: A-01-03" placeholderTextColor="#64748b" textAlign="right" />
      <View style={styles.qtyActions}>
        <TouchableOpacity onPress={() => { setCurrentScanTarget(null); setItemLot(""); setItemBatch(""); setItemSerial(""); setItemExpiry(""); setItemDamage(""); setItemDamagePhotoUri(undefined); setItemVarianceNote(""); setItemLocation(""); }} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>ביטול</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmItemQuantity} style={styles.confirmBtn}>
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.confirmBtnText}>אשר קבלה</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  ) : null;

  const itemsList = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
      <Text style={styles.sectionTitle}>פריטים בהזמנה</Text>
      {scannedItems.map((item, idx) => (
        <View key={idx} style={styles.itemCard}>
          <View style={styles.itemRow}>
            <Ionicons
              name={item.scannedQuantity >= item.expectedQuantity && item.expectedQuantity > 0 ? "checkmark-circle" : item.scannedQuantity > 0 ? "time" : "ellipse-outline"}
              size={18}
              color={item.scannedQuantity >= item.expectedQuantity && item.expectedQuantity > 0 ? "#10b981" : item.scannedQuantity > 0 ? "#f59e0b" : "#6b7280"}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.itemDescription}</Text>
              <Text style={styles.itemCode}>{item.itemCode}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.itemQtyText, item.scannedQuantity > 0 ? styles.qtyGreen : styles.qtyGray]}>
                {item.scannedQuantity.toFixed(1)}
              </Text>
              {item.expectedQuantity > 0 && (
                <Text style={styles.itemQtyExp}>/ {item.expectedQuantity.toFixed(1)} {item.unit}</Text>
              )}
            </View>
          </View>
        </View>
      ))}
      <TouchableOpacity style={styles.nextButton} onPress={() => setPhase("confirm")}>
        <Ionicons name="arrow-forward" size={18} color="#0891b2" />
        <Text style={styles.nextButtonText}>לאישור קבלה</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const confirmPanel = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>סיכום קבלה</Text>
        <Text style={styles.summaryPO}>הזמנה: {poData?.order_number}</Text>
        <View style={styles.summaryStats}>
          {[
            { label: "פריטים", value: scannedItems.filter(i => i.scannedQuantity > 0).length, color: "#fff" },
            { label: "תואם", value: scannedItems.filter(i => i.scannedQuantity >= i.expectedQuantity && i.expectedQuantity > 0).length, color: "#10b981" },
            { label: "אי-התאמות", value: scannedItems.filter(i => i.scannedQuantity !== i.expectedQuantity && i.expectedQuantity > 0 && i.scannedQuantity > 0).length, color: "#ef4444" },
          ].map(stat => (
            <View key={stat.label} style={{ alignItems: "center" }}>
              <Text style={[styles.summaryStatValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={styles.summaryStatLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.sectionTitle}>פרטי פריטים שנסרקו</Text>
      {scannedItems.filter(i => i.scannedQuantity > 0 || i.expectedQuantity > 0).map((item, idx) => (
        <View key={idx} style={styles.itemCard}>
          <View style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.itemDescription}</Text>
              <Text style={styles.itemCode}>{item.itemCode}</Text>
            </View>
            <Text style={[styles.itemQtyText, item.scannedQuantity > 0 ? styles.qtyGreen : styles.qtyGray]}>
              {item.scannedQuantity.toFixed(1)} {item.unit}
            </Text>
          </View>
        </View>
      ))}
      <View style={styles.confirmActions}>
        <TouchableOpacity onPress={() => setPhase("scan_items")} style={styles.backBtn2}>
          <Ionicons name="arrow-back" size={16} color="#6b7280" />
          <Text style={styles.backBtn2Text}>חזרה</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={submitReceipt}
          disabled={submitting}
          style={[styles.submitButton, submitting && styles.buttonDisabled]}
        >
          {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="checkmark-done" size={20} color="#fff" />}
          <Text style={styles.submitButtonText}>{submitting ? "שומר..." : "אשר וקלוט קבלה"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (isTablet && phase === "scan_items" && poData) {
    return (
      <SafeAreaView style={styles.container}>
        {headerBar}
        {feedbackBar}
        {phaseRow}
        <View style={styles.tabletScanLayout}>
          <View style={styles.tabletCameraPane}>
            <View style={styles.poCard}>
              <Text style={styles.poTitle}>הזמנה: {poData.order_number}</Text>
              <Text style={styles.poSub}>{poData.supplier_name} · {scannedItems.filter(i => i.expectedQuantity > 0).length} פריטים</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${completionRate}%` }]} />
              </View>
              <Text style={styles.progressText}>{completionRate}% הושלם</Text>
            </View>
            {itemsScanCamera}
            {qtyCard}
          </View>
          <View style={styles.tabletItemsPane}>
            {itemsList}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {headerBar}
      {feedbackBar}
      {phaseRow}

      {phase === "scan_po" && (
        <View style={styles.fullCenter}>
          {cameraPanel}
        </View>
      )}

      {phase === "scan_items" && poData && (
        <View style={{ flex: 1 }}>
          <View style={styles.poCard}>
            <Text style={styles.poTitle}>הזמנה: {poData.order_number}</Text>
            <Text style={styles.poSub}>{poData.supplier_name} · {scannedItems.filter(i => i.expectedQuantity > 0).length} פריטים</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${completionRate}%` }]} />
            </View>
            <Text style={styles.progressText}>{completionRate}% הושלם</Text>
          </View>
          {itemsScanCamera}
          {qtyCard}
          {itemsList}
        </View>
      )}

      {phase === "confirm" && confirmPanel}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0e1a" },
  tabletScanLayout: { flex: 1, flexDirection: "row" },
  tabletCameraPane: { width: 380, borderRightWidth: 1, borderRightColor: "#1f2937" },
  tabletItemsPane: { flex: 1 },
  itemCameraContainerTablet: { height: 260 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1f2937", gap: 8 },
  backButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#1f2937", alignItems: "center", justifyContent: "center" },
  iconButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#1f2937", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#fff", textAlign: "right" },
  feedback: { marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  feedbackSuccess: { backgroundColor: "#065f46" },
  feedbackError: { backgroundColor: "#7f1d1d" },
  feedbackInfo: { backgroundColor: "#1e3a5f" },
  feedbackText: { color: "#fff", fontSize: 13, flex: 1 },
  phaseRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, paddingVertical: 12, paddingHorizontal: 16 },
  phaseItem: { alignItems: "center", gap: 4 },
  phaseCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  phaseActive: { backgroundColor: "#7c3aed" },
  phaseDone: { backgroundColor: "#059669" },
  phaseInactive: { backgroundColor: "#374151" },
  phaseLabel: { fontSize: 10 },
  phaseLabelActive: { color: "#a78bfa", fontWeight: "600" },
  phaseLabelDim: { color: "#6b7280" },
  fullCenter: { flex: 1 },
  permBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  permTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  permSub: { fontSize: 14, color: "#9ca3af", textAlign: "center" },
  permButton: { marginTop: 8, backgroundColor: "#7c3aed", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  permButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  scanFrame: { width: 240, height: 150, borderWidth: 2, borderColor: "#7c3aed", borderRadius: 12, backgroundColor: "transparent" },
  cameraHint: { color: "#fff", fontSize: 14, fontWeight: "500", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  manualRow: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#0a0e1a" },
  manualInput: { flex: 1, backgroundColor: "#1f2937", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", textAlign: "right", fontSize: 14 },
  manualButton: { width: 44, backgroundColor: "#7c3aed", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  buttonDisabled: { opacity: 0.5 },
  poCard: { backgroundColor: "#1a1d23", margin: 12, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#374151" },
  poTitle: { fontSize: 15, fontWeight: "700", color: "#0891b2" },
  poSub: { fontSize: 12, color: "#9ca3af", marginBottom: 8 },
  progressBar: { height: 5, backgroundColor: "#374151", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#10b981", borderRadius: 3 },
  progressText: { fontSize: 11, color: "#9ca3af", marginTop: 3 },
  itemCameraContainer: { height: 180, marginHorizontal: 12, borderRadius: 12, overflow: "hidden" },
  itemCamera: { flex: 1 },
  itemCameraOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  itemScanFrame: { width: 200, height: 80, borderWidth: 2, borderColor: "#0891b2", borderRadius: 8 },
  qtyCard: { backgroundColor: "#1f2937", marginHorizontal: 12, marginTop: 8, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#7c3aed" },
  qtyTitle: { fontSize: 15, fontWeight: "700", color: "#fff", textAlign: "right", marginBottom: 2 },
  qtySub: { fontSize: 12, color: "#9ca3af", textAlign: "right", marginBottom: 12 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  qtyBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#374151", alignItems: "center", justifyContent: "center" },
  qtyInput: { flex: 1, backgroundColor: "#0d0f14", borderWidth: 1, borderColor: "#4b5563", borderRadius: 10, padding: 8, color: "#fff", fontSize: 22, fontWeight: "bold" },
  setExpected: { alignItems: "center", marginBottom: 10 },
  setExpectedText: { color: "#6b7280", fontSize: 12 },
  qtyActions: { flexDirection: "row", gap: 8 },
  cancelBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#374151" },
  cancelBtnText: { color: "#9ca3af", fontSize: 13 },
  confirmBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#059669", paddingVertical: 10, borderRadius: 10 },
  confirmBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  receiptFieldLabel: { color: "#9ca3af", fontSize: 11, fontWeight: "600", textAlign: "right", marginTop: 8, marginBottom: 3 },
  receiptFieldInput: { backgroundColor: "#0d0f14", borderWidth: 1, borderColor: "#374151", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, color: "#fff", fontSize: 13, textAlign: "right" },
  receiptPhotoRow: { flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 4 },
  receiptPhotoBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "#1e3a5f", paddingVertical: 7, borderRadius: 8 },
  receiptPhotoBtnText: { color: "#93c5fd", fontSize: 11 },
  receiptPhotoPreview: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  receiptPhotoThumb: { width: 68, height: 68, borderRadius: 8, backgroundColor: "#1e293b" },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: "#9ca3af", marginBottom: 8 },
  itemCard: { backgroundColor: "#1a1d23", borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#1f2937" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemName: { fontSize: 13, fontWeight: "500", color: "#fff", textAlign: "right" },
  itemCode: { fontSize: 11, color: "#6b7280", textAlign: "right" },
  itemQtyText: { fontSize: 17, fontWeight: "700", fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },
  qtyGreen: { color: "#10b981" },
  qtyGray: { color: "#4b5563" },
  itemQtyExp: { fontSize: 11, color: "#6b7280" },
  nextButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#0891b2", paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  nextButtonText: { color: "#0891b2", fontSize: 15, fontWeight: "600" },
  summaryCard: { backgroundColor: "#1a1d23", borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: "#374151" },
  summaryTitle: { fontSize: 20, fontWeight: "700", color: "#fff", textAlign: "center", marginBottom: 4 },
  summaryPO: { fontSize: 13, color: "#0891b2", textAlign: "center", marginBottom: 16 },
  summaryStats: { flexDirection: "row", justifyContent: "space-around" },
  summaryStatValue: { fontSize: 28, fontWeight: "700", textAlign: "center" },
  summaryStatLabel: { fontSize: 11, color: "#9ca3af", marginTop: 2, textAlign: "center" },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  backBtn2: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: "#374151", paddingVertical: 14, borderRadius: 12 },
  backBtn2Text: { color: "#9ca3af", fontSize: 14 },
  submitButton: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#059669", paddingVertical: 14, borderRadius: 12 },
  submitButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});

const webStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d0f14" },
  notAvailable: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 40 },
  notAvailableTitle: { fontSize: 20, fontWeight: "700", color: "#fff", textAlign: "center" },
  notAvailableDesc: { fontSize: 14, color: "#9ca3af", textAlign: "center", lineHeight: 22 },
  backBtn: { backgroundColor: "#0891b2", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  backBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
