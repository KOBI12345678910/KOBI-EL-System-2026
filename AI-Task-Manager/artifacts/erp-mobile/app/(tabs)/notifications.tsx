import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/ThemeContext";
import * as api from "@/lib/api";

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  approval: "check-circle",
  system: "monitor",
  alert: "alert-triangle",
  message: "message-circle",
  reminder: "clock",
  default: "bell",
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["notifications", filter],
    queryFn: () =>
      api.getNotifications({
        limit: 50,
        isRead: filter === "unread" ? "false" : undefined,
      }),
  });

  const markAllRead = useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const notifications = data?.notifications || (Array.isArray(data) ? data : []);

  const PRIORITY_COLORS: Record<string, string> = {
    critical: colors.danger,
    high: "#E07A5F",
    medium: colors.warning,
    low: colors.info,
  };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]}>התראות</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {notifications.length > 0 && (
              <Pressable
                onPress={() => markAllRead.mutate()}
                style={({ pressed }) => [styles.markAllBtn, pressed && { opacity: 0.7 }]}
              >
                <Feather name="check" size={16} color={colors.primary} />
                <Text style={[styles.markAllText, { color: colors.primary }]}>סמן הכל כנקרא</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push("/notification-preferences")}
              style={({ pressed }) => [styles.settingsBtn, { backgroundColor: colors.surfaceCard, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <Feather name="settings" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>
        <View style={styles.filterRow}>
          <FilterChip label="הכל" active={filter === "all"} onPress={() => setFilter("all")} colors={colors} />
          <FilterChip label="לא נקראו" active={filter === "unread"} onPress={() => setFilter("unread")} colors={colors} />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <NotificationItem
              notification={item}
              onMarkRead={() => markRead.mutate(item.id)}
              colors={colors}
              priorityColors={PRIORITY_COLORS}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="bell-off" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>אין התראות</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>אתה מעודכן!</Text>
            </View>
          }
          scrollEnabled={notifications.length > 0}
        />
      )}
    </View>
  );
}

type Colors = ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];

function FilterChip({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: Colors }) {
  return (
    <Pressable
      style={[
        styles.chip,
        { backgroundColor: colors.surfaceCard, borderColor: colors.border },
        active && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color: colors.textSecondary }, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

function NotificationItem({
  notification,
  onMarkRead,
  colors,
  priorityColors,
}: {
  notification: any;
  onMarkRead: () => void;
  colors: Colors;
  priorityColors: Record<string, string>;
}) {
  const iconName = CATEGORY_ICONS[notification.category] || CATEGORY_ICONS.default;
  const priorityColor = priorityColors[notification.priority] || colors.textMuted;
  const isUnread = !notification.isRead;
  const timeAgo = getTimeAgo(notification.createdAt);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.notifCard,
        { backgroundColor: colors.surfaceCard },
        isUnread && { borderWidth: 1, borderColor: colors.primary + "30", backgroundColor: colors.primary + "05" },
        pressed && { opacity: 0.9 },
      ]}
      onPress={onMarkRead}
    >
      <View style={[styles.notifIconWrap, { backgroundColor: priorityColor + "15" }]}>
        <Feather name={iconName} size={18} color={priorityColor} />
      </View>
      <View style={styles.notifContent}>
        <View style={styles.notifTitleRow}>
          <Text
            style={[styles.notifTitle, { color: colors.text }, isUnread && { fontFamily: "Inter_600SemiBold" }]}
            numberOfLines={1}
          >
            {notification.title}
          </Text>
          {isUnread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
        </View>
        <Text style={[styles.notifMessage, { color: colors.textSecondary }]} numberOfLines={2}>
          {notification.message}
        </Text>
        <Text style={[styles.notifTime, { color: colors.textMuted }]}>{timeAgo}</Text>
      </View>
    </Pressable>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return new Date(dateStr).toLocaleDateString("he-IL");
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  markAllText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 8,
  },
  notifCard: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  notifIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  notifContent: {
    flex: 1,
    gap: 3,
  },
  notifTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  notifTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notifMessage: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 18,
  },
  notifTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
