import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PlatformMapView, PlatformMarker, PlatformCallout } from "@/components/PlatformMapView";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";
import { useGPSTracking } from "@/hooks/useGPSTracking";
import { useAuth } from "@/contexts/AuthContext";

export default function GpsTrackingWrapper() {
  return (
    <AuthGuard>
      <GpsTrackingScreen />
    </AuthGuard>
  );
}

type TabType = "clock" | "team" | "history" | "pings";

function GpsTrackingScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabType>("clock");
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const gps = useGPSTracking();
  const { user } = useAuth();
  const jobTitleLower = (user?.jobTitle || "").toLowerCase();
  const isAdminOrManager = user?.isSuperAdmin === true || jobTitleLower.includes("manager") || jobTitleLower.includes("מנהל") || jobTitleLower.includes("director");

  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["gps-clock-status"],
    queryFn: api.getFieldGpsClockStatus,
  });

  const { data: historyData } = useQuery({
    queryKey: ["gps-clock-history"],
    queryFn: () => api.getFieldGpsClockHistory({ limit: 50 }),
    enabled: tab === "history",
  });

  const { data: teamData } = useQuery({
    queryKey: ["gps-team-locations"],
    queryFn: api.getFieldTeamLocations,
    enabled: tab === "team",
    refetchInterval: 30000,
  });

  const { data: pingsData } = useQuery({
    queryKey: ["gps-location-pings"],
    queryFn: () => api.getLocationPings({ limit: 100 }),
    enabled: tab === "pings",
    refetchInterval: 30000,
  });

  const clockMutation = useMutation({
    mutationFn: (action: "clock_in" | "clock_out") => {
      return api.fieldGpsClock({
        action,
        latitude: currentLocation?.latitude,
        longitude: currentLocation?.longitude,
        accuracy: currentLocation?.accuracy,
      });
    },
    onSuccess: async (data, action) => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("הצלחה", data.message);
      queryClient.invalidateQueries({ queryKey: ["gps-clock-status"] });
      queryClient.invalidateQueries({ queryKey: ["gps-clock-history"] });
      refetchStatus();

      if (action === "clock_in") {
        await gps.startTracking();
      } else {
        await gps.stopTracking();
      }
    },
    onError: (err: Error) => {
      Alert.alert("שגיאה", err.message);
    },
  });

  const isClockedIn = statusData?.isClockedIn || false;


  const getLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("הרשאת מיקום", "יש לאפשר גישה למיקום כדי להשתמש בשעון GPS");
        setLocationLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCurrentLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy || 0,
      });
    } catch {
      Alert.alert("שגיאה", "לא ניתן לקבל מיקום נוכחי");
    }
    setLocationLoading(false);
  }, []);

  useEffect(() => {
    getLocation();
  }, [getLocation]);

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      locationSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 20, timeInterval: 30000 },
        (loc) => {
          setCurrentLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy || 0,
          });
        }
      );
    };

    if (isClockedIn) {
      startWatching();
    }

    return () => {
      if (locationSubscription) locationSubscription.remove();
    };
  }, [isClockedIn]);

  const handleClock = () => {
    const action = isClockedIn ? "clock_out" : "clock_in";
    clockMutation.mutate(action);
  };

  const records = historyData?.records || [];
  const teamMembers = teamData?.members || [];
  const pings = pingsData?.pings || [];

  const mapRegion = useMemo(() => {
    const points = teamMembers
      .filter((m: Record<string, unknown>) => m.latitude && m.longitude)
      .map((m: Record<string, unknown>) => ({
        latitude: Number(m.latitude),
        longitude: Number(m.longitude),
      }));
    if (currentLocation) {
      points.push({ latitude: currentLocation.latitude, longitude: currentLocation.longitude });
    }
    if (points.length === 0) {
      return { latitude: 32.08, longitude: 34.78, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    }
    const lats = points.map((p) => p.latitude);
    const lngs = points.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.01),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.01),
    };
  }, [teamMembers, currentLocation]);

  const allTabs: { key: TabType; label: string; adminOnly?: boolean }[] = [
    { key: "clock", label: "שעון" },
    { key: "team", label: "מפת צוות", adminOnly: true },
    { key: "pings", label: "מסלול", adminOnly: true },
    { key: "history", label: "היסטוריה", adminOnly: true },
  ];
  const tabs = allTabs.filter(t => !t.adminOnly || isAdminOrManager);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>מעקב GPS</Text>
        {isAdminOrManager ? (
          <Pressable style={styles.refreshBtn} onPress={getLocation}>
            <Feather name="refresh-cw" size={18} color={Colors.light.primary} />
          </Pressable>
        ) : (
          <View style={styles.refreshBtn} />
        )}
      </View>

      <View style={styles.tabRow}>
        {tabs.map((t) => (
          <Pressable key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "clock" && (
        <View style={styles.clockContainer}>
          {statusLoading ? (
            <ActivityIndicator size="large" color={Colors.light.primary} />
          ) : (
            <>
              <View style={styles.statusCard}>
                <View style={[styles.statusIndicator, { backgroundColor: isClockedIn ? Colors.light.success : Colors.light.textMuted }]} />
                <Text style={styles.statusLabel}>{isClockedIn ? "במשמרת" : "לא במשמרת"}</Text>
                {statusData?.lastRecord && (
                  <Text style={styles.lastAction}>
                    {String(statusData.lastRecord.action) === "clock_in" ? "כניסה" : "יציאה"} ב-{" "}
                    {new Date(String(statusData.lastRecord.created_at)).toLocaleTimeString("he-IL")}
                  </Text>
                )}
              </View>

              {isAdminOrManager && (
                currentLocation ? (
                  <View style={styles.locationCard}>
                    <Feather name="map-pin" size={16} color={Colors.light.primary} />
                    <Text style={styles.locationText}>
                      {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
                    </Text>
                    <Text style={styles.accuracyText}>{"דיוק: " + Math.round(currentLocation.accuracy) + "מ׳"}</Text>
                  </View>
                ) : locationLoading ? (
                  <View style={styles.locationCard}>
                    <ActivityIndicator size="small" color={Colors.light.primary} />
                    <Text style={styles.locationText}>מקבל מיקום...</Text>
                  </View>
                ) : (
                  <View style={styles.locationCard}>
                    <Feather name="alert-circle" size={16} color={Colors.light.warning} />
                    <Text style={styles.locationText}>לא זמין מיקום</Text>
                  </View>
                )
              )}

              <Pressable
                style={[styles.clockBtn, isClockedIn ? styles.clockOutBtn : styles.clockInBtn]}
                onPress={handleClock}
                disabled={clockMutation.isPending}
              >
                {clockMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name={isClockedIn ? "log-out" : "log-in"} size={24} color="#fff" />
                    <Text style={styles.clockBtnText}>{isClockedIn ? "יציאה" : "כניסה"}</Text>
                  </>
                )}
              </Pressable>
            </>
          )}
        </View>
      )}

      {tab === "team" && (
        <View style={styles.mapContainer}>
          {Platform.OS === "web" ? (
            <View style={styles.emptyContainer}>
              <Feather name="map" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>מפת צוות אינה זמינה בדפדפן</Text>
              <Text style={[styles.emptyText, { fontSize: 13, color: Colors.light.textMuted }]}>
                השתמש באפליקציה הנייטיבית לצפייה במפה
              </Text>
            </View>
          ) : teamMembers.length > 0 ? (
            <>
              <View style={styles.teamSummary}>
                <Feather name="users" size={16} color={Colors.light.primary} />
                <Text style={styles.teamSummaryText}>{teamMembers.length + " עובדים פעילים בשטח"}</Text>
              </View>
              <PlatformMapView
                style={styles.map}
                initialRegion={mapRegion}
                showsUserLocation
                showsMyLocationButton
              >
                {teamMembers
                  .filter((m: Record<string, unknown>) => m.latitude && m.longitude)
                  .map((member: Record<string, unknown>) => (
                    <PlatformMarker
                      key={String(member.user_id)}
                      coordinate={{
                        latitude: Number(member.latitude),
                        longitude: Number(member.longitude),
                      }}
                      title={String(member.full_name || "עובד")}
                      description={
                        (member.department ? String(member.department) + " | " : "") +
                        (member.created_at ? new Date(String(member.created_at)).toLocaleTimeString("he-IL") : "")
                      }
                      pinColor={Colors.light.primary}
                    >
                      <PlatformCallout>
                        <View style={styles.callout}>
                          <Text style={styles.calloutName}>{String(member.full_name || "עובד")}</Text>
                          {!!member.department && <Text style={styles.calloutDept}>{String(member.department)}</Text>}
                          <Text style={styles.calloutTime}>
                            {"כניסה: " + (member.created_at ? new Date(String(member.created_at)).toLocaleTimeString("he-IL") : "")}
                          </Text>
                        </View>
                      </PlatformCallout>
                    </PlatformMarker>
                  ))}
              </PlatformMapView>
            </>
          ) : (
            <View style={styles.emptyContainer}>
              <Feather name="users" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין חברי צוות פעילים</Text>
            </View>
          )}
        </View>
      )}

      {tab === "pings" && (
        <FlatList
          data={pings}
          keyExtractor={(item: Record<string, unknown>) => String(item.id)}
          renderItem={({ item }: { item: Record<string, unknown> }) => (
            <View style={styles.pingRow}>
              <View style={styles.pingDotContainer}>
                <View style={styles.pingDot} />
                <View style={styles.pingLine} />
              </View>
              <View style={styles.pingInfo}>
                <View style={styles.pingCoordsRow}>
                  <Feather name="map-pin" size={12} color={Colors.light.primary} />
                  <Text style={styles.pingCoords}>
                    {Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}
                  </Text>
                </View>
                <Text style={styles.pingTime}>
                  {item.created_at ? new Date(String(item.created_at)).toLocaleString("he-IL") : ""}
                </Text>
                {!!item.accuracy && (
                  <Text style={styles.pingAccuracy}>{"דיוק: ±" + Math.round(Number(item.accuracy)) + "מ׳"}</Text>
                )}
              </View>
            </View>
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="navigation" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין נתוני מסלול</Text>
              <Text style={styles.emptySubText}>נתוני מיקום יופיעו כאשר מעקב רקע פעיל</Text>
            </View>
          }
        />
      )}

      {tab === "history" && (
        <FlatList
          data={records}
          keyExtractor={(item: Record<string, unknown>) => String(item.id)}
          renderItem={({ item }: { item: Record<string, unknown> }) => (
            <View style={styles.historyRow}>
              <View style={[styles.historyIcon, { backgroundColor: String(item.action) === "clock_in" ? Colors.light.success + "18" : Colors.light.danger + "18" }]}>
                <Feather
                  name={String(item.action) === "clock_in" ? "log-in" : "log-out"}
                  size={16}
                  color={String(item.action) === "clock_in" ? Colors.light.success : Colors.light.danger}
                />
              </View>
              <View style={styles.historyInfo}>
                <Text style={styles.historyAction}>
                  {String(item.action) === "clock_in" ? "כניסה" : "יציאה"}
                </Text>
                <Text style={styles.historyTime}>
                  {item.created_at ? new Date(String(item.created_at)).toLocaleString("he-IL") : ""}
                </Text>
              </View>
              {!!item.latitude && (
                <Text style={styles.historyCoords}>
                  {Number(item.latitude).toFixed(3)},{Number(item.longitude).toFixed(3)}
                </Text>
              )}
            </View>
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="clock" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין היסטוריה</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  refreshBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", paddingHorizontal: 20, gap: 6, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", borderWidth: 1, borderColor: Colors.light.border },
  tabBtnActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  tabText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  tabTextActive: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  clockContainer: { flex: 1, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", gap: 16 },
  statusCard: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 20, padding: 32, alignItems: "center", gap: 8, width: "100%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  statusIndicator: { width: 16, height: 16, borderRadius: 8 },
  statusLabel: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
  lastAction: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  bgTrackingBadge: {
    flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, width: "100%",
  },
  bgTrackingText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  locationCard: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, width: "100%",
  },
  locationText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text, flex: 1 },
  accuracyText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  clockBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    borderRadius: 20, paddingVertical: 20, width: "100%",
  },
  clockInBtn: { backgroundColor: Colors.light.success },
  clockOutBtn: { backgroundColor: Colors.light.danger },
  clockBtnText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  listContent: { paddingHorizontal: 20, gap: 8 },
  mapContainer: { flex: 1, paddingHorizontal: 8 },
  map: { flex: 1, borderRadius: 16, overflow: "hidden" },
  teamSummary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.light.primary + "12", borderRadius: 12,
    paddingVertical: 12, marginBottom: 8, marginHorizontal: 12,
  },
  teamSummaryText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.primary },
  callout: { padding: 8, minWidth: 120, alignItems: "flex-end" },
  calloutName: { fontSize: 14, fontWeight: "bold", color: "#333", textAlign: "right" },
  calloutDept: { fontSize: 12, color: "#666", textAlign: "right" },
  calloutTime: { fontSize: 11, color: "#888", textAlign: "right", marginTop: 4 },
  pingRow: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
  },
  pingDotContainer: { alignItems: "center", width: 20 },
  pingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.light.primary },
  pingLine: { width: 2, flex: 1, backgroundColor: Colors.light.border, minHeight: 30 },
  pingInfo: {
    flex: 1, backgroundColor: Colors.light.surfaceCard, borderRadius: 12, padding: 12, gap: 4,
  },
  pingCoordsRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "flex-end" },
  pingCoords: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text },
  pingTime: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  pingAccuracy: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  historyRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12, padding: 14, gap: 12,
  },
  historyIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  historyInfo: { flex: 1 },
  historyAction: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  historyTime: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  historyCoords: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "center" },
});
