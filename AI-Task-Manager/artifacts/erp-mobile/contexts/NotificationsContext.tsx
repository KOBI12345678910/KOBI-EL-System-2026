import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import * as api from "@/lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NotificationCategory =
  | "approvals"
  | "production"
  | "delivery"
  | "kpi"
  | "system"
  | "hr"
  | "finance";

export interface NotificationPreferences {
  approvals: boolean;
  production: boolean;
  delivery: boolean;
  kpi: boolean;
  system: boolean;
  hr: boolean;
  finance: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  approvals: true,
  production: true,
  delivery: true,
  kpi: true,
  system: true,
  hr: true,
  finance: true,
};

const PREFS_KEY = "@erp_notification_prefs";

interface NotificationsContextType {
  expoPushToken: string | null;
  hasPermission: boolean;
  preferences: NotificationPreferences;
  requestPermission: () => Promise<boolean>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  notifyApprovalPending: (count: number) => Promise<void>;
  notifySyncComplete: (successCount: number) => Promise<void>;
  notifySystemUpdate: (title: string, body: string) => Promise<void>;
  notifyProductionAlert: (title: string, body: string, workOrderId?: number) => Promise<void>;
  notifyDeliveryUpdate: (title: string, body: string, orderId?: number) => Promise<void>;
  notifyKpiThreshold: (metric: string, value: string, threshold: string) => Promise<void>;
  notifyHRAlert: (title: string, body: string) => Promise<void>;
  notifyFinanceAlert: (title: string, body: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType>({
  expoPushToken: null,
  hasPermission: false,
  preferences: DEFAULT_PREFERENCES,
  requestPermission: async () => false,
  updatePreferences: async () => {},
  notifyApprovalPending: async () => {},
  notifySyncComplete: async () => {},
  notifySystemUpdate: async () => {},
  notifyProductionAlert: async () => {},
  notifyDeliveryUpdate: async () => {},
  notifyKpiThreshold: async () => {},
  notifyHRAlert: async () => {},
  notifyFinanceAlert: async () => {},
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          setPreferences({ ...DEFAULT_PREFERENCES, ...saved });
        } catch {}
      }
    });
  }, []);

  const updatePreferences = useCallback(async (prefs: Partial<NotificationPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...prefs };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") return false;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      setHasPermission(false);
      return false;
    }

    setHasPermission(true);

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PUBLIC_REPL_ID || undefined,
      });
      const token = tokenData.data;
      setExpoPushToken(token);

      try {
        await api.apiRequest("/api/push-tokens", {
          method: "POST",
          body: JSON.stringify({ token, platform: Platform.OS }),
        });
      } catch {}
    } catch {}

    return true;
  }, []);

  const canNotify = useCallback((category: NotificationCategory): boolean => {
    if (Platform.OS === "web" || !hasPermission) return false;
    return preferences[category] ?? true;
  }, [hasPermission, preferences]);

  const scheduleNotification = useCallback(async (
    title: string,
    body: string,
    data: Record<string, unknown>,
    sound = true
  ) => {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound },
      trigger: null,
    });
  }, []);

  const notifyApprovalPending = useCallback(async (count: number) => {
    if (!canNotify("approvals") || count === 0) return;
    await scheduleNotification(
      "אישורים ממתינים",
      count === 1
        ? "יש לך בקשת אישור אחת הממתינה לטיפולך"
        : `יש לך ${count} בקשות אישור הממתינות לטיפולך`,
      { screen: "approvals", type: "approvals" }
    );
  }, [canNotify, scheduleNotification]);

  const notifySyncComplete = useCallback(async (successCount: number) => {
    if (!canNotify("system") || successCount === 0) return;
    await scheduleNotification(
      "סנכרון הושלם",
      `${successCount} פעולות סונכרנו בהצלחה`,
      { screen: "notifications", type: "system" },
      false
    );
  }, [canNotify, scheduleNotification]);

  const notifySystemUpdate = useCallback(async (title: string, body: string) => {
    if (!canNotify("system")) return;
    await scheduleNotification(title, body, { screen: "notifications", type: "system" });
  }, [canNotify, scheduleNotification]);

  const dispatchServerPush = useCallback(async (
    category: NotificationCategory,
    title: string,
    body: string,
    data: Record<string, unknown>
  ) => {
    try {
      await api.apiRequest("/push/dispatch", {
        method: "POST",
        body: JSON.stringify({ category, title, body, data, channel: "expo" }),
      });
    } catch {
    }
  }, []);

  const notifyProductionAlert = useCallback(async (title: string, body: string, workOrderId?: number) => {
    if (!canNotify("production")) return;
    const screen = workOrderId ? `production/work-order/${workOrderId}` : "production";
    await scheduleNotification(title, body, { screen, type: "production", workOrderId });
    await dispatchServerPush("production", title, body, { screen, workOrderId });
  }, [canNotify, scheduleNotification, dispatchServerPush]);

  const notifyDeliveryUpdate = useCallback(async (title: string, body: string, orderId?: number) => {
    if (!canNotify("delivery")) return;
    const screen = orderId ? `procurement/order/${orderId}` : "procurement/orders";
    await scheduleNotification(title, body, { screen, type: "delivery", orderId });
    await dispatchServerPush("delivery", title, body, { screen, orderId });
  }, [canNotify, scheduleNotification, dispatchServerPush]);

  const notifyKpiThreshold = useCallback(async (metric: string, value: string, threshold: string) => {
    if (!canNotify("kpi")) return;
    const title = `⚠️ חריגה ב-KPI: ${metric}`;
    const body = `הערך הנוכחי ${value} חרג מהסף ${threshold}`;
    await scheduleNotification(title, body, { screen: "dashboard", type: "kpi", metric });
    await dispatchServerPush("kpi", title, body, { screen: "dashboard", metric });
  }, [canNotify, scheduleNotification, dispatchServerPush]);

  const notifyHRAlert = useCallback(async (title: string, body: string) => {
    if (!canNotify("hr")) return;
    await scheduleNotification(title, body, { screen: "hr", type: "hr" });
    await dispatchServerPush("hr", title, body, { screen: "hr" });
  }, [canNotify, scheduleNotification, dispatchServerPush]);

  const notifyFinanceAlert = useCallback(async (title: string, body: string) => {
    if (!canNotify("finance")) return;
    await scheduleNotification(title, body, { screen: "finance/dashboard", type: "finance" });
    await dispatchServerPush("finance", title, body, { screen: "finance/dashboard" });
  }, [canNotify, scheduleNotification, dispatchServerPush]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === "granted") {
        setHasPermission(true);
        requestPermission();
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data;
        if (data?.badge !== undefined && typeof data.badge === "number") {
          Notifications.setBadgeCountAsync(data.badge).catch(() => {});
        }
      }
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.screen) {
          const screen = data.screen as string;
          handleDeepLink(screen);
        }
      }
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [requestPermission]);

  return (
    <NotificationsContext.Provider
      value={{
        expoPushToken,
        hasPermission,
        preferences,
        requestPermission,
        updatePreferences,
        notifyApprovalPending,
        notifySyncComplete,
        notifySystemUpdate,
        notifyProductionAlert,
        notifyDeliveryUpdate,
        notifyKpiThreshold,
        notifyHRAlert,
        notifyFinanceAlert,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

function handleDeepLink(screen: string) {
  try {
    if (screen === "approvals") {
      router.push("/approvals");
    } else if (screen === "notifications") {
      router.push("/(tabs)/notifications");
    } else if (screen === "dashboard") {
      router.push("/(tabs)");
    } else if (screen === "hr") {
      router.push("/hr");
    } else if (screen === "finance/dashboard") {
      router.push("/finance/dashboard");
    } else if (screen === "production") {
      router.push("/production");
    } else if (screen === "procurement/orders") {
      router.push("/procurement/orders");
    } else if (screen.startsWith("production/work-order/")) {
      const id = screen.split("/").pop();
      if (id) router.push({ pathname: "/production/work-order/[id]", params: { id } });
    } else if (screen.startsWith("procurement/order/")) {
      const id = screen.split("/").pop();
      if (id) router.push({ pathname: "/procurement/order/[id]", params: { id } });
    } else if (screen === "maintenance" || screen === "work-orders") {
      router.push("/maintenance/work-orders");
    }
  } catch {}
}

export function usePushNotifications() {
  return useContext(NotificationsContext);
}
