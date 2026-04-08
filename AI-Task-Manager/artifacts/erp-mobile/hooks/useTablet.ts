import { useWindowDimensions } from "react-native";

export const TABLET_BREAKPOINT = 768;
export const LARGE_TABLET_BREAKPOINT = 1024;

export function useTablet() {
  const { width, height } = useWindowDimensions();

  const isTablet = width >= TABLET_BREAKPOINT;
  const isLargeTablet = width >= LARGE_TABLET_BREAKPOINT;
  const isLandscape = width > height;

  const numColumns = isLargeTablet ? 4 : isTablet ? 3 : 2;
  const sidebarWidth = isTablet ? 320 : 0;
  const contentPadding = isTablet ? 32 : 20;
  const cardMinWidth = isTablet ? 200 : 140;

  return {
    isTablet,
    isLargeTablet,
    isLandscape,
    numColumns,
    sidebarWidth,
    contentPadding,
    cardMinWidth,
    width,
    height,
  };
}
