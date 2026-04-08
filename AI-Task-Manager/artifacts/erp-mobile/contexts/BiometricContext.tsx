import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";

interface BiometricContextType {
  isBiometricAvailable: boolean;
  isBiometricEnabled: boolean;
  biometricType: "fingerprint" | "facial" | "iris" | "none";
  enableBiometric: () => Promise<boolean>;
  disableBiometric: () => void;
  authenticateWithBiometric: (reason?: string) => Promise<boolean>;
}

const BiometricContext = createContext<BiometricContextType>({
  isBiometricAvailable: false,
  isBiometricEnabled: false,
  biometricType: "none",
  enableBiometric: async () => false,
  disableBiometric: () => {},
  authenticateWithBiometric: async () => false,
});

const BIOMETRIC_KEY = "@erp_biometric_enabled";

export function BiometricProvider({ children }: { children: React.ReactNode }) {
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<"fingerprint" | "facial" | "iris" | "none">("none");

  useEffect(() => {
    if (Platform.OS === "web") return;

    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricAvailable(compatible && enrolled);

      if (compatible && enrolled) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType("facial");
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType("fingerprint");
        } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          setBiometricType("iris");
        }
      }

      const stored = await AsyncStorage.getItem(BIOMETRIC_KEY);
      if (stored === "true" && compatible && enrolled) {
        setIsBiometricEnabled(true);
      }
    })();
  }, []);

  const enableBiometric = useCallback(async (): Promise<boolean> => {
    if (!isBiometricAvailable) {
      Alert.alert("ביומטריקה לא זמינה", "המכשיר לא תומך בהזדהות ביומטרית או לא הוגדרה");
      return false;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "אמת את זהותך להפעלת כניסה ביומטרית",
      cancelLabel: "ביטול",
      disableDeviceFallback: false,
    });

    if (result.success) {
      await AsyncStorage.setItem(BIOMETRIC_KEY, "true");
      setIsBiometricEnabled(true);
      return true;
    }
    return false;
  }, [isBiometricAvailable]);

  const disableBiometric = useCallback(() => {
    AsyncStorage.removeItem(BIOMETRIC_KEY);
    setIsBiometricEnabled(false);
  }, []);

  const authenticateWithBiometric = useCallback(async (reason = "אמת את זהותך להמשך"): Promise<boolean> => {
    if (!isBiometricAvailable || Platform.OS === "web") return true;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "ביטול",
      disableDeviceFallback: false,
    });

    return result.success;
  }, [isBiometricAvailable]);

  return (
    <BiometricContext.Provider
      value={{
        isBiometricAvailable,
        isBiometricEnabled,
        biometricType,
        enableBiometric,
        disableBiometric,
        authenticateWithBiometric,
      }}
    >
      {children}
    </BiometricContext.Provider>
  );
}

export function useBiometric() {
  return useContext(BiometricContext);
}
