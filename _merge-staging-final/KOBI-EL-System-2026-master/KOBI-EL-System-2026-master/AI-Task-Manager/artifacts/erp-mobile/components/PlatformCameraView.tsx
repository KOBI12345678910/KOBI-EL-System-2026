import React from "react";
import { Platform, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { BarcodeScanningResult, PermissionResponse } from "expo-camera";

export type { BarcodeScanningResult };

type CameraFacing = "front" | "back";

type BarcodeScannerSettings = {
  barcodeTypes?: string[];
};

type PlatformCameraViewProps = {
  style?: object;
  facing?: CameraFacing;
  barcodeScannerSettings?: BarcodeScannerSettings;
  onBarcodeScanned?: (result: BarcodeScanningResult) => void;
  children?: React.ReactNode;
};

type UseCameraPermissionsReturn = [
  PermissionResponse | null,
  () => Promise<PermissionResponse>
];

let NativeCameraView: React.ComponentType<PlatformCameraViewProps> | null = null;
let nativeUseCameraPermissions: (() => UseCameraPermissionsReturn) | null = null;

if (Platform.OS !== "web") {
  const cam = require("expo-camera");
  NativeCameraView = cam.CameraView;
  nativeUseCameraPermissions = cam.useCameraPermissions;
}

export function usePlatformCameraPermissions(): UseCameraPermissionsReturn {
  if (Platform.OS === "web" || !nativeUseCameraPermissions) {
    const fakePermission: PermissionResponse = {
      granted: false,
      canAskAgain: false,
      expires: "never",
      status: "denied" as PermissionResponse["status"],
    };
    return [fakePermission, async () => fakePermission];
  }
  return nativeUseCameraPermissions();
}

export function PlatformCameraView(props: PlatformCameraViewProps) {
  if (Platform.OS === "web" || !NativeCameraView) {
    return (
      <View style={[styles.fallback, props.style]}>
        <Text style={styles.fallbackIcon}>📷</Text>
        <Text style={styles.fallbackTitle}>מצלמה אינה זמינה בסימולטור</Text>
        <Text style={styles.fallbackSub}>
          יש להשתמש במכשיר נייד (iOS / Android) לסריקת ברקוד
        </Text>
      </View>
    );
  }

  const CameraComponent = NativeCameraView;
  return <CameraComponent {...props} />;
}

export function WebCameraUnavailablePlaceholder({
  onManualEntry,
}: {
  onManualEntry?: () => void;
}) {
  return (
    <View style={styles.fullFallback}>
      <Text style={styles.fallbackIcon}>📷</Text>
      <Text style={styles.fallbackTitle}>מצלמה אינה זמינה בסימולטור</Text>
      <Text style={styles.fallbackSub}>
        יש להשתמש במכשיר נייד (iOS / Android) לסריקת ברקוד
      </Text>
      {onManualEntry && (
        <TouchableOpacity style={styles.manualButton} onPress={onManualEntry}>
          <Text style={styles.manualButtonText}>הזנה ידנית</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 32,
  },
  fullFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a2e",
    padding: 32,
  },
  fallbackIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  fallbackTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e5e7eb",
    marginBottom: 6,
    textAlign: "center",
  },
  fallbackSub: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },
  manualButton: {
    marginTop: 20,
    backgroundColor: "#6366f1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  manualButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
