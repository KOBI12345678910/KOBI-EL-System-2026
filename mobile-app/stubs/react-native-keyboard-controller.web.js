import React from "react";
import { ScrollView, View } from "react-native";

export const KeyboardProvider = ({ children }) => children;
export const KeyboardAwareScrollView = ({ children, ...props }) =>
  React.createElement(ScrollView, props, children);
export const KeyboardStickyView = ({ children, ...props }) =>
  React.createElement(View, props, children);
export const useKeyboardContext = () => ({});
export const useKeyboardHandler = () => {};
export const useReanimatedKeyboardAnimation = () => ({
  height: { value: 0 },
  progress: { value: 0 },
});
export default { KeyboardProvider };
