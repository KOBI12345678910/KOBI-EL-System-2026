import React from "react";
import { View } from "react-native";

const MapView = React.forwardRef((props, ref) => {
  return React.createElement(View, { ...props, ref });
});
MapView.displayName = "MapView";

const Marker = (props) => null;
const Callout = (props) => null;
const Circle = (props) => null;
const Polygon = (props) => null;
const Polyline = (props) => null;
const Overlay = (props) => null;
const Heatmap = (props) => null;

export default MapView;
export { Marker, Callout, Circle, Polygon, Polyline, Overlay, Heatmap };
