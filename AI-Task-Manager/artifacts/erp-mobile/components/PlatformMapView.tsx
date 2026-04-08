import React from "react";
import { Platform, View, Text, StyleSheet } from "react-native";

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MarkerData = {
  user_id: string | number;
  latitude: number | string;
  longitude: number | string;
  full_name?: string;
  department?: string;
  created_at?: string;
};

type PlatformMapViewProps = {
  style?: object;
  initialRegion?: MapRegion;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  children?: React.ReactNode;
};

let NativeMapView: React.ComponentType<PlatformMapViewProps> | null = null;
let NativeMarker: React.ComponentType<unknown> | null = null;
let NativeCallout: React.ComponentType<unknown> | null = null;

if (Platform.OS !== "web") {
  const maps = require("react-native-maps");
  NativeMapView = maps.default;
  NativeMarker = maps.Marker;
  NativeCallout = maps.Callout;
}

export function PlatformMapView(props: PlatformMapViewProps) {
  if (Platform.OS === "web" || !NativeMapView) {
    return (
      <View style={[styles.fallback, props.style]}>
        <Text style={styles.fallbackIcon}>🗺️</Text>
        <Text style={styles.fallbackTitle}>מפה אינה זמינה בסימולטור</Text>
        <Text style={styles.fallbackSub}>
          המפה זמינה בלבד על גבי מכשיר נייד (iOS / Android)
        </Text>
      </View>
    );
  }

  const MapViewComponent = NativeMapView;
  return <MapViewComponent {...props} />;
}

export function PlatformMarker(props: Record<string, unknown>) {
  if (Platform.OS === "web" || !NativeMarker) return null;
  const MarkerComponent = NativeMarker as React.ComponentType<Record<string, unknown>>;
  return <MarkerComponent {...props} />;
}

export function PlatformCallout(props: Record<string, unknown>) {
  if (Platform.OS === "web" || !NativeCallout) return null;
  const CalloutComponent = NativeCallout as React.ComponentType<Record<string, unknown>>;
  return <CalloutComponent {...props} />;
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f4f8",
    borderRadius: 12,
    padding: 32,
  },
  fallbackIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  fallbackTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    textAlign: "center",
  },
  fallbackSub: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
  },
});
