import { CartesianChart, Bar, useChartPressState, Line } from "victory-native";
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from "react-native-reanimated";

import { useTheme } from "@/contexts/ThemeContext";

interface MiniBarChartProps {
  data: Array<{ label: string; value: number }>;
  height?: number;
  color?: string;
  showLabels?: boolean;
  title?: string;
}

interface MiniLineChartProps {
  data: number[];
  labels?: string[];
  height?: number;
  color?: string;
  title?: string;
}

type BarItem = { index: number; value: number };
type LineItem = { x: number; value: number };

export function MiniBarChart({
  data,
  height = 120,
  color,
  showLabels = true,
  title,
}: MiniBarChartProps) {
  const { colors } = useTheme();
  const barColor = color || colors.primary;

  const chartData: BarItem[] = data.map((d, i) => ({ index: i, value: d.value }));
  const { state, isActive } = useChartPressState({ x: 0, y: { value: 0 } });

  const selectedLabel = useDerivedValue(() => {
    if (!isActive) return "";
    return data[state.x.value.value]?.label ?? "";
  });

  const selectedValue = useDerivedValue(() => {
    if (!isActive) return 0;
    return state.y.value.value.value;
  });

  const tooltipStyle = useAnimatedStyle(() => ({
    opacity: isActive ? withTiming(1, { duration: 150 }) : withTiming(0, { duration: 150 }),
  }));

  return (
    <View>
      {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
      <Animated.View
        style={[
          styles.tooltip,
          { backgroundColor: barColor + "18", borderColor: barColor + "40" },
          tooltipStyle,
        ]}
      >
        <Text style={[styles.tooltipText, { color: colors.textSecondary }]}>
          {selectedLabel.value}
        </Text>
        <Text style={[styles.tooltipValue, { color: barColor }]}>
          {Math.round(selectedValue.value)}
        </Text>
      </Animated.View>
      <View style={{ height }}>
        <CartesianChart<BarItem, "index", "value">
          data={chartData}
          xKey="index"
          yKeys={["value"]}
          chartPressState={state}
          domainPadding={{ left: 8, right: 8, top: 16 }}
          axisOptions={{
            formatXLabel: (v) => data[v as number]?.label ?? "",
            formatYLabel: (v) => String(Math.round(v as number)),
            lineColor: colors.border,
            labelColor: showLabels ? colors.textMuted : "transparent",
          }}
        >
          {({ points, chartBounds }) => (
            <Bar
              points={points.value}
              chartBounds={chartBounds}
              color={barColor}
              opacity={0.9}
              roundedCorners={{ topLeft: 4, topRight: 4 }}
              animate={{ type: "timing", duration: 400 }}
            />
          )}
        </CartesianChart>
      </View>
      <Text style={[styles.tapHint, { color: colors.textMuted }]}>לחץ על עמודה לפרטים</Text>
    </View>
  );
}

export function MiniLineChart({
  data,
  labels,
  height = 80,
  color,
  title,
}: MiniLineChartProps) {
  const { colors } = useTheme();
  const lineColor = color || colors.primary;

  const chartData: LineItem[] = data.map((v, i) => ({ x: i, value: v }));
  const { state, isActive } = useChartPressState({ x: 0, y: { value: 0 } });

  const selectedLabel = useDerivedValue(() => {
    if (!isActive || !labels) return "";
    return labels[state.x.value.value] ?? "";
  });

  const selectedValue = useDerivedValue(() => {
    if (!isActive) return 0;
    return state.y.value.value.value;
  });

  const tooltipStyle = useAnimatedStyle(() => ({
    opacity: isActive ? withTiming(1) : withTiming(0),
  }));

  return (
    <View>
      {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
      <Animated.View
        style={[
          styles.tooltip,
          { backgroundColor: lineColor + "18", borderColor: lineColor + "40" },
          tooltipStyle,
        ]}
      >
        <Text style={[styles.tooltipText, { color: colors.textSecondary }]}>
          {selectedLabel.value}
        </Text>
        <Text style={[styles.tooltipValue, { color: lineColor }]}>
          {Math.round(selectedValue.value)}
        </Text>
      </Animated.View>
      <View style={{ height }}>
        <CartesianChart<LineItem, "x", "value">
          data={chartData}
          xKey="x"
          yKeys={["value"]}
          chartPressState={state}
          domainPadding={{ top: 16, left: 8, right: 8 }}
          axisOptions={{
            lineColor: colors.border,
            labelColor: labels ? colors.textMuted : "transparent",
            formatXLabel: (v) => labels?.[v as number] ?? "",
          }}
        >
          {({ points }) => (
            <Line
              points={points.value}
              color={lineColor}
              strokeWidth={2}
              curveType="cardinal"
              animate={{ type: "timing", duration: 400 }}
            />
          )}
        </CartesianChart>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    textAlign: "right",
  },
  tooltip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
    minHeight: 28,
  },
  tooltipText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  tooltipValue: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  tapHint: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 2,
  },
});
