import React from "react";
import { View, Text, StyleSheet } from "react-native";

export const CameraView = React.forwardRef((props, ref) => {
  return React.createElement(
    View,
    { style: [styles.placeholder, props.style], ref },
    React.createElement(Text, { style: styles.text }, "Camera not available on web")
  );
});
CameraView.displayName = "CameraView";

export function useCameraPermissions() {
  return [{ granted: false, canAskAgain: false, status: "denied" }, async () => {}];
}

export const Camera = CameraView;

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  text: {
    color: "#aaa",
    fontSize: 14,
  },
});
