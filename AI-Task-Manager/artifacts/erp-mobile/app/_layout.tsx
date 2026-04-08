import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { I18nManager, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "@/lib/background-location";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import SyncStatusBar from "@/components/SyncStatusBar";
import VoiceFab from "@/components/VoiceFab";
import { AuthProvider } from "@/contexts/AuthContext";
import { BiometricProvider } from "@/contexts/BiometricContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { startPeriodicSync } from "@/lib/data-sync-manager";

const ConditionalKeyboardProvider = Platform.OS === "web"
  ? ({ children }: { children: React.ReactNode }) => <>{children}</>
  : KeyboardProvider;

if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000,
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="module/[id]"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="entity/[id]"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="record/[entityId]/[id]"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="approvals"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="chat"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="ai-chat"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="kimi-terminal"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="documents"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="reports"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="settings"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="users-admin"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="finance/dashboard"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="finance/invoices"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="finance/payments"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="finance/invoice-detail"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="crm/dashboard"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="crm/customers"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="crm/leads"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="crm/quotes"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="marketing"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="hr/index"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="hr/employees"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="hr/employee/[id]"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="hr/attendance"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="hr/shifts"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="hr/departments"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="production/index"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="production/work-orders"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="production/work-order/[id]"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="production/quality"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="procurement/index"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="procurement/orders"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="procurement/order/[id]"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="procurement/suppliers"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="procurement/supplier/[id]"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="procurement/raw-materials"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="projects/index"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="projects/list"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="projects/tasks"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="projects/task/[id]"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="projects/project/[id]"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="warehouse/index"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="warehouse/scan-receipt"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="warehouse/pick"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="warehouse/transfer"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="warehouse/count"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="warehouse/putaway"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="field-ops/scanner"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="field-ops/gps-tracking"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="field-ops/crm-visits"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="field-ops/production-report"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="maintenance/work-orders"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="notification-preferences"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="sync-status"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="gps-permission"
        options={{ headerShown: false, presentation: "modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [fontTimeout, setFontTimeout] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError || fontTimeout) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, fontTimeout]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      startPeriodicSync();
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setFontTimeout(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded && !fontError && !fontTimeout) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <ConditionalKeyboardProvider>
              <ThemeProvider>
                <NetworkProvider>
                  <AuthProvider>
                    <BiometricProvider>
                      <NotificationsProvider>
                        <RootLayoutNav />
                        {Platform.OS !== "web" && (
                          <>
                            <SyncStatusBar onPress={() => router.push("/sync-status" as never)} />
                            <VoiceFab />
                          </>
                        )}
                      </NotificationsProvider>
                    </BiometricProvider>
                  </AuthProvider>
                </NetworkProvider>
              </ThemeProvider>
            </ConditionalKeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
