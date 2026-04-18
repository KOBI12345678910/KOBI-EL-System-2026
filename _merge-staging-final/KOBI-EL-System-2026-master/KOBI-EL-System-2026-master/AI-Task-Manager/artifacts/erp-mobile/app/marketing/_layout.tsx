import { Stack } from "expo-router";

export default function MarketingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="campaigns" />
      <Stack.Screen name="analytics" />
      <Stack.Screen name="content-calendar" />
      <Stack.Screen name="email-campaigns" />
      <Stack.Screen name="social-media" />
      <Stack.Screen name="budget" />
    </Stack>
  );
}
