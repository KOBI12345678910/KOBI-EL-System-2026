import React from "react";

const noop = () => null;
const noopHook = () => ({});

export const Canvas = noop;
export const Path = noop;
export const Circle = noop;
export const Rect = noop;
export const Group = noop;
export const Text = noop;
export const Image = noop;
export const Paint = noop;
export const Fill = noop;
export const Skia = {
  Path: { Make: () => ({}) },
  Paint: () => ({}),
  Image: { MakeFromEncoded: () => null },
};
export const useImage = () => null;
export const usePaint = noopHook;
export const useFont = () => null;
export const useValue = (v) => ({ current: v });
export const useTiming = () => ({ current: 0 });
export const useSharedValueEffect = noop;
export const runTiming = noop;
export const runSpring = noop;
export default Skia;
