import React from "react";
import { View, Text, StyleSheet } from "react-native";

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

export function MiniBarChart({
  data,
  height = 120,
  color,
  showLabels = true,
  title,
}: MiniBarChartProps) {
  const { colors } = useTheme();
  const barColor = color || colors.primary;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const innerHeight = height - (showLabels ? 18 : 0);

  return (
    <View>
      {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
      <View style={[styles.barContainer, { height }]}>
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.value / maxVal) * innerHeight));
          return (
            <View key={i} style={styles.barCol}>
              <View style={[styles.barTrack, { height: innerHeight }]}>
                <View
                  style={[
                    styles.barFill,
                    { height: barH, backgroundColor: barColor },
                  ]}
                />
              </View>
              {showLabels && (
                <Text
                  style={[styles.barLabel, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {d.label}
                </Text>
              )}
            </View>
          );
        })}
      </View>
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
  const maxVal = Math.max(...data, 1);
  const innerHeight = height - (labels ? 18 : 0);

  return (
    <View>
      {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
      <View style={[styles.barContainer, { height }]}>
        {data.map((v, i) => {
          const barH = Math.max(2, Math.round((v / maxVal) * innerHeight));
          return (
            <View key={i} style={styles.barCol}>
              <View style={[styles.barTrack, { height: innerHeight }]}>
                <View
                  style={[
                    styles.barFill,
                    { height: barH, backgroundColor: lineColor },
                  ]}
                />
              </View>
              {labels && (
                <Text
                  style={[styles.barLabel, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {labels[i]}
                </Text>
              )}
            </View>
          );
        })}
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
  barContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    overflow: "hidden",
  },
  barCol: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barTrack: {
    width: "100%",
    justifyContent: "flex-end",
  },
  barFill: {
    width: "100%",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    textAlign: "center",
  },
});
