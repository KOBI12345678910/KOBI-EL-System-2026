import { useCallback, useEffect, useRef, useState } from "react";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { Platform } from "react-native";
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  isBackgroundTrackingActive,
  MOVING_SPEED_THRESHOLD,
} from "@/lib/background-location";

const LOW_BATTERY_THRESHOLD = 0.2;

export interface GPSTrackingState {
  isTracking: boolean;
  batteryLevel: number | null;
  isLowBattery: boolean;
  isMoving: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface GPSTrackingActions {
  startTracking: () => Promise<boolean>;
  stopTracking: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useGPSTracking(): GPSTrackingState & GPSTrackingActions {
  const [isTracking, setIsTracking] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isMoving, setIsMoving] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const batterySubRef = useRef<ReturnType<typeof Battery.addBatteryLevelListener> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const isTrackingRef = useRef(false);
  const prevLowBatteryRef = useRef<boolean | null>(null);
  const prevMovingRef = useRef<boolean>(true);

  const isLowBattery = batteryLevel !== null && batteryLevel < LOW_BATTERY_THRESHOLD;

  const refreshStatus = useCallback(async () => {
    try {
      const active = await isBackgroundTrackingActive();
      setIsTracking(active);
      isTrackingRef.current = active;
    } catch {
      setIsTracking(false);
      isTrackingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshStatus();

    if (Platform.OS !== "web") {
      Battery.getBatteryLevelAsync()
        .then((level) => setBatteryLevel(level))
        .catch(() => setBatteryLevel(null));

      batterySubRef.current = Battery.addBatteryLevelListener(({ batteryLevel: level }) => {
        setBatteryLevel(level);
      });
    }

    return () => {
      batterySubRef.current?.remove();
      batterySubRef.current = null;
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;

        locationSubRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Low,
            timeInterval: 10000,
            distanceInterval: 5,
          },
          (loc) => {
            if (!mounted) return;
            const speed = loc.coords.speed ?? null;
            const moving = speed !== null ? speed > MOVING_SPEED_THRESHOLD : true;
            setIsMoving(moving);
          }
        );
      } catch {
      }
    })();

    return () => {
      mounted = false;
      locationSubRef.current?.remove();
      locationSubRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (batteryLevel === null) return;
    const lowNow = batteryLevel < LOW_BATTERY_THRESHOLD;
    if (prevLowBatteryRef.current === null) {
      prevLowBatteryRef.current = lowNow;
      return;
    }
    if (lowNow === prevLowBatteryRef.current) return;
    prevLowBatteryRef.current = lowNow;

    if (!isTrackingRef.current) return;

    (async () => {
      try {
        await stopBackgroundTracking();
        const restarted = await startBackgroundTracking(lowNow, prevMovingRef.current);
        setIsTracking(restarted);
        isTrackingRef.current = restarted;
      } catch {
      }
    })();
  }, [batteryLevel]);

  useEffect(() => {
    if (prevMovingRef.current === isMoving) return;
    prevMovingRef.current = isMoving;

    if (!isTrackingRef.current) return;

    const lowBatt = batteryLevel !== null && batteryLevel < LOW_BATTERY_THRESHOLD;

    (async () => {
      try {
        await stopBackgroundTracking();
        const restarted = await startBackgroundTracking(lowBatt, isMoving);
        setIsTracking(restarted);
        isTrackingRef.current = restarted;
      } catch {
      }
    })();
  }, [isMoving, batteryLevel]);

  const startTracking = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const currentBattery = batteryLevel ?? (Platform.OS !== "web" ? await Battery.getBatteryLevelAsync().catch(() => 1) : 1);
      const lowBatt = currentBattery < LOW_BATTERY_THRESHOLD;
      const started = await startBackgroundTracking(lowBatt, prevMovingRef.current);
      setIsTracking(started);
      isTrackingRef.current = started;
      prevLowBatteryRef.current = lowBatt;
      if (!started) {
        setError("לא ניתן להפעיל מעקב GPS — בדוק הרשאות מיקום");
      }
      return started;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "שגיאה בהפעלת מעקב GPS";
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [batteryLevel]);

  const stopTracking = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await stopBackgroundTracking();
      setIsTracking(false);
      isTrackingRef.current = false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "שגיאה בעצירת מעקב GPS";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isTracking,
    batteryLevel,
    isLowBattery,
    isMoving,
    isLoading,
    error,
    startTracking,
    stopTracking,
    refreshStatus,
  };
}
