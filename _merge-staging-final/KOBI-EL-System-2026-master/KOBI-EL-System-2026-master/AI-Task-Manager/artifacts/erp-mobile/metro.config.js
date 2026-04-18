const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-maps") {
    return {
      filePath: path.resolve(__dirname, "stubs/react-native-maps.web.js"),
      type: "sourceFile",
    };
  }
  if (platform === "web" && moduleName === "react-native-keyboard-controller") {
    return {
      filePath: path.resolve(__dirname, "stubs/react-native-keyboard-controller.web.js"),
      type: "sourceFile",
    };
  }
  if (
    platform === "web" &&
    (moduleName === "@shopify/react-native-skia" || moduleName === "react-native-skia")
  ) {
    return {
      filePath: path.resolve(__dirname, "stubs/react-native-skia.web.js"),
      type: "sourceFile",
    };
  }
  if (platform === "web" && (moduleName === "victory-native" || moduleName === "victory-native/src")) {
    return {
      filePath: path.resolve(__dirname, "stubs/victory-native.web.js"),
      type: "sourceFile",
    };
  }
  if (platform === "web" && moduleName === "expo-camera") {
    return {
      filePath: path.resolve(__dirname, "stubs/expo-camera.web.js"),
      type: "sourceFile",
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
