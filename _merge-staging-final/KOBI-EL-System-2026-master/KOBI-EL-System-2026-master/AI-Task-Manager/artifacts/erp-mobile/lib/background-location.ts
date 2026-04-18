import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { API_BASE, getStoredToken } from "./api";
import {
  addPendingGpsPing,
  getPendingGpsPings,
  removePendingGpsPing,
} from "./offline-db";

const BACKGROUND_LOCATION_TASK = "background-location-tracking";

const NORMAL_TIME_INTERVAL = 60000;
const LOW_BATTERY_TIME_INTERVAL = 300000;
const STATIONARY_TIME_INTERVAL = 300000;
const MOVING_TIME_INTERVAL = 30000;

const NORMAL_DISTANCE_INTERVAL = 30;
const LOW_BATTERY_DISTANCE_INTERVAL = 100;
const STATIONARY_DISTANCE_INTERVAL = 50;
const MOVING_DISTANCE_INTERVAL = 10;

const MOVING_SPEED_THRESHOLD = 0.5;

async function sendPingToServer(token: string, ping: {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  battery_level: number | null;
  speed: number | null;
  timestamp: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/field-ops/location-ping`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      latitude: ping.latitude,
      longitude: ping.longitude,
      accuracy: ping.accuracy,
      battery_level: ping.battery_level,
      speed: ping.speed,
      timestamp: ping.timestamp,
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

export async function flushOfflineGpsPings(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const token = await getStoredToken();
    if (!token) return;
    let hasMore = true;
    while (hasMore) {
      const pending = await getPendingGpsPings();
      if (pending.length === 0) {
        hasMore = false;
        break;
      }
      let batchFailed = false;
      for (const ping of pending) {
        try {
          await sendPingToServer(token, {
            latitude: ping.latitude,
            longitude: ping.longitude,
            accuracy: ping.accuracy,
            battery_level: ping.battery_level,
            speed: ping.speed,
            timestamp: ping.timestamp,
          });
          await removePendingGpsPing(ping.id);
        } catch {
          batchFailed = true;
          break;
        }
      }
      if (batchFailed) {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error("[BackgroundLocation] Flush offline pings failed:", err);
  }
}

if (Platform.OS !== "web") {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
    if (error) {
      console.error("[BackgroundLocation] Error:", error.message);
      return;
    }
    if (data?.locations) {
      const { locations } = data;
      const latest = locations[locations.length - 1];
      if (!latest) return;

      let batteryLevel: number | null = null;
      try {
        batteryLevel = await Battery.getBatteryLevelAsync();
      } catch {
        batteryLevel = null;
      }

      const ping = {
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
        accuracy: latest.coords.accuracy ?? null,
        battery_level: batteryLevel,
        speed: latest.coords.speed ?? null,
        timestamp: new Date(latest.timestamp).toISOString(),
      };

      try {
        const token = await getStoredToken();
        if (!token) return;
        await sendPingToServer(token, ping);
      } catch {
        try {
          await addPendingGpsPing(ping);
        } catch (dbErr) {
          console.error("[BackgroundLocation] Failed to cache ping locally:", dbErr);
        }
      }
    }
  });
}

function computeIntervals(isLowBattery: boolean, isMoving: boolean): {
  timeInterval: number;
  distanceInterval: number;
  accuracy: Location.Accuracy;
} {
  if (isLowBattery) {
    return {
      timeInterval: LOW_BATTERY_TIME_INTERVAL,
      distanceInterval: LOW_BATTERY_DISTANCE_INTERVAL,
      accuracy: Location.Accuracy.Low,
    };
  }
  if (isMoving) {
    return {
      timeInterval: MOVING_TIME_INTERVAL,
      distanceInterval: MOVING_DISTANCE_INTERVAL,
      accuracy: Location.Accuracy.Balanced,
    };
  }
  if (!isMoving) {
    return {
      timeInterval: STATIONARY_TIME_INTERVAL,
      distanceInterval: STATIONARY_DISTANCE_INTERVAL,
      accuracy: Location.Accuracy.Low,
    };
  }
  return {
    timeInterval: NORMAL_TIME_INTERVAL,
    distanceInterval: NORMAL_DISTANCE_INTERVAL,
    accuracy: Location.Accuracy.Balanced,
  };
}

export async function startBackgroundTracking(isLowBattery = false, isMoving = true): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const { status: foreground } = await Location.requestForegroundPermissionsAsync();
  if (foreground !== "granted") return false;

  const { status: background } = await Location.requestBackgroundPermissionsAsync();
  if (background !== "granted") return false;

  const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (isStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }

  const { timeInterval, distanceInterval, accuracy } = computeIntervals(isLowBattery, isMoving);

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy,
    timeInterval,
    distanceInterval,
    deferredUpdatesInterval: timeInterval,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: "שירות פעיל",
      notificationBody: "טכנו-כל עוזי",
      notificationColor: "#1B4332",
    },
  });
  return true;
}

export async function stopBackgroundTracking(): Promise<void> {
  if (Platform.OS === "web") return;

  const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (isStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

export { MOVING_SPEED_THRESHOLD };
