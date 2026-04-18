import React from "react";
import { View } from "react-native";
import Svg, { Polyline, Circle } from "react-native-svg";

interface SparklineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  showDot?: boolean;
}

export function SparklineChart({
  data,
  width = 80,
  height = 32,
  color = "#40916C",
  strokeWidth = 2,
  showDot = true,
}: SparklineChartProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = strokeWidth;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + ((max - v) / range) * (height - pad * 2);
    return `${x},${y}`;
  });

  const lastIdx = data.length - 1;
  const lastX = pad + (lastIdx / (data.length - 1)) * (width - pad * 2);
  const lastY = pad + ((max - data[lastIdx]) / range) * (height - pad * 2);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Polyline
          points={points.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {showDot && (
          <Circle
            cx={lastX}
            cy={lastY}
            r={3}
            fill={color}
          />
        )}
      </Svg>
    </View>
  );
}
