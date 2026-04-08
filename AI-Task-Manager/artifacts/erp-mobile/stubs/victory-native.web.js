import React from "react";
import { View } from "react-native";

const noop = () => null;
const noopHook = () => ({ state: {}, isActive: false });

export const CartesianChart = noop;
export const Bar = noop;
export const Line = noop;
export const Area = noop;
export const Scatter = noop;
export const Pie = noop;
export const PolarChart = noop;
export function useChartPressState() {
  return {
    state: { x: { value: { value: 0 } }, y: { value: { value: { value: 0 } } } },
    isActive: false,
  };
}
export const useChartTransformState = noopHook;
export const LinePath = noop;
export const BarGroup = noop;
export const BarRound = noop;

export default {
  CartesianChart,
  Bar,
  Line,
  useChartPressState,
};
