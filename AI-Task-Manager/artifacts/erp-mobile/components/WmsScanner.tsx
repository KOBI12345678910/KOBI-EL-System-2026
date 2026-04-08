import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";

import {
  PlatformCameraView,
  usePlatformCameraPermissions,
  type BarcodeScanningResult,
} from "@/components/PlatformCameraView";

let CameraViewWithFlash: React.ComponentType<Record<string, unknown>> | null = null;
if ((Platform.OS as string) !== "web") {
  try {
    CameraViewWithFlash = require("expo-camera").CameraView as React.ComponentType<Record<string, unknown>>;
  } catch {
    CameraViewWithFlash = null;
  }
}

interface WmsScannerProps {
  onScan: (code: string) => void;
  hint?: string;
  color?: string;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

const BARCODE_TYPES: string[] = ["qr", "code128", "code39", "ean13", "ean8", "pdf417", "datamatrix", "aztec"];
const SCAN_COOLDOWN_MS = 2000;

export function WmsScanner({
  onScan,
  hint = "כוון את המצלמה לברקוד",
  color = "#7c3aed",
  disabled = false,
  isLoading = false,
  placeholder = "הזן ברקוד ידנית...",
}: WmsScannerProps) {
  const [permission, requestPermission] = usePlatformCameraPermissions();
  const [manualCode, setManualCode] = useState("");
  const [flashOn, setFlashOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const lastScanRef = useRef<string | null>(null);
  const cooldownRef = useRef(false);
  const isWeb = (Platform.OS as string) === "web";

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (cooldownRef.current || disabled) return;
    const code = result.data?.trim();
    if (!code || code === lastScanRef.current) return;
    lastScanRef.current = code;
    cooldownRef.current = true;
    Vibration.vibrate(80);
    onScan(code);
    setTimeout(() => {
      cooldownRef.current = false;
      lastScanRef.current = null;
    }, SCAN_COOLDOWN_MS);
  }

  function handleManualSubmit() {
    const code = manualCode.trim();
    if (!code || disabled) return;
    onScan(code);
    setManualCode("");
  }

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={color} />
        </View>
      )}

      {isWeb || !permission?.granted ? (
        <View style={[styles.noCamera, { borderColor: color + "33" }]}>
          <Ionicons name="camera-outline" size={36} color="#9ca3af" />
          {isWeb ? (
            <Text style={styles.noCameraText}>סריקה אינה זמינה בדפדפן</Text>
          ) : (
            <>
              <Text style={styles.noCameraText}>נדרשת הרשאת מצלמה</Text>
              <TouchableOpacity onPress={requestPermission} style={[styles.permBtn, { backgroundColor: color }]}>
                <Text style={styles.permBtnText}>אפשר גישה למצלמה</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : cameraActive ? (
        <View style={styles.cameraWrapper}>
          {CameraViewWithFlash ? (
            <CameraViewWithFlash
              style={styles.camera}
              facing="back"
              enableTorch={flashOn}
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={disabled ? undefined : handleBarcodeScanned}
            />
          ) : (
            <PlatformCameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={disabled ? undefined : handleBarcodeScanned}
            />
          )}
          <View style={styles.cameraOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.hintText}>{hint}</Text>
          </View>
          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={[styles.camBtn, flashOn && styles.camBtnActive]}
              onPress={() => setFlashOn((v) => !v)}
            >
              <Ionicons name={flashOn ? "flash" : "flash-outline"} size={20} color={flashOn ? "#fbbf24" : "#fff"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.camBtn} onPress={() => setCameraActive(false)}>
              <Ionicons name="keypad-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={[styles.noCamera, { borderColor: color + "44" }]} onPress={() => setCameraActive(true)}>
          <Ionicons name="camera" size={28} color={color} />
          <Text style={[styles.noCameraText, { color }]}>הקש להפעלת מצלמה</Text>
        </TouchableOpacity>
      )}

      <View style={styles.manualRow}>
        <TextInput
          style={styles.manualInput}
          value={manualCode}
          onChangeText={setManualCode}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          textAlign="right"
          returnKeyType="search"
          onSubmitEditing={handleManualSubmit}
          editable={!disabled}
        />
        <TouchableOpacity
          style={[styles.manualBtn, { backgroundColor: color }, disabled && styles.manualBtnDisabled]}
          onPress={handleManualSubmit}
          disabled={disabled || !manualCode.trim()}
        >
          <Ionicons name="search" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  loadingOverlay: {
    position: "absolute",
    top: 4,
    left: 4,
    zIndex: 10,
  },
  noCamera: {
    height: 140,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
  },
  noCameraText: {
    fontSize: 14,
    color: "#6b7280",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  permBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  permBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  cameraWrapper: {
    height: 220,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  scanFrame: {
    width: 200,
    height: 100,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  hintText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    textAlign: "center",
  },
  cameraControls: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    gap: 8,
  },
  camBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  camBtnActive: {
    backgroundColor: "rgba(251,191,36,0.3)",
  },
  manualRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  manualInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    backgroundColor: "#fff",
    color: "#111827",
  },
  manualBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  manualBtnDisabled: {
    opacity: 0.4,
  },
});
