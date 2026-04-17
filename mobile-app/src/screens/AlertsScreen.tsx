import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import { api } from '../services/api';
import {
  colors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  shadow,
} from '../constants/theme';

const MOCK_ALERTS = [
  {
    id: '1', message: 'פועל שמואל לא דיווח על כניסה לאתר', severity: 'critical',
    time: 'לפני 10 דקות', category: 'עובדים', acknowledged: false,
  },
  {
    id: '2', message: 'מחסן ברזל מרובע 40×40 — נמוך מסף מינימום', severity: 'high',
    time: 'לפני 25 דקות', category: 'מחסן', acknowledged: false,
  },
  {
    id: '3', message: 'חשבונית INV-010 עומדת לעבור תאריך פירעון', severity: 'high',
    time: 'לפני שעה', category: 'פיננסים', acknowledged: false,
  },
  {
    id: '4', message: 'עדכון סטטוס WO-004 לבדיקת איכות', severity: 'medium',
    time: 'לפני 2 שעות', category: 'עבודה', acknowledged: false,
  },
  {
    id: '5', message: 'כבל נירוסטה 8mm — אזל מהמחסן', severity: 'critical',
    time: 'לפני 3 שעות', category: 'מחסן', acknowledged: false,
  },
  {
    id: '6', message: 'פגישה עם לקוח חדש ב-14:00', severity: 'low',
    time: 'לפני 4 שעות', category: 'כללי', acknowledged: true,
  },
  {
    id: '7', message: 'גיבוי מערכת הושלם בהצלחה', severity: 'low',
    time: 'לפני 6 שעות', category: 'מערכת', acknowledged: true,
  },
];

const severityConfig: Record<string, { color: string; icon: string; label: string }> = {
  critical: { color: colors.danger, icon: 'alert-circle', label: 'קריטי' },
  high: { color: colors.warning, icon: 'warning', label: 'גבוה' },
  medium: { color: colors.gold, icon: 'information-circle', label: 'בינוני' },
  low: { color: colors.success, icon: 'checkmark-circle', label: 'נמוך' },
};

function AlertItem({
  item,
  onAcknowledge,
}: {
  item: any;
  onAcknowledge: (id: string) => void;
}) {
  const sc = severityConfig[item.severity] || severityConfig.low;
  return (
    <View
      style={[
        styles.alertCard,
        { borderRightColor: sc.color, opacity: item.acknowledged ? 0.6 : 1 },
      ]}
    >
      <View style={styles.alertContent}>
        <View style={styles.alertHeader}>
          <Text style={styles.alertTime}>{item.time}</Text>
          <View style={[styles.severityChip, { backgroundColor: sc.color + '22' }]}>
            <Ionicons name={sc.icon as any} size={12} color={sc.color} />
            <Text style={[styles.severityLabel, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>
        <Text style={styles.alertMessage}>{item.message}</Text>
        <View style={styles.alertFooter}>
          {!item.acknowledged && (
            <TouchableOpacity
              style={styles.ackBtn}
              onPress={() => onAcknowledge(item.id)}
            >
              <Ionicons name="checkmark-outline" size={14} color={colors.accent} />
              <Text style={styles.ackBtnText}>אישור קריאה</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.categoryChip]}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function AlertsScreen() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { refetch } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.getAlerts(),
    retry: 1,
    onSuccess: (data: any) => {
      if (Array.isArray(data)) setAlerts(data);
    },
  } as any);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleAcknowledge = async (id: string) => {
    try {
      await api.acknowledgeAlert(id);
    } catch {
      // update locally anyway
    }
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
  };

  const filtered =
    filter === 'unread' ? alerts.filter((a) => !a.acknowledged) : alerts;

  const sorted = [...filtered].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4);
  });

  const unreadCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <View style={styles.container}>
      <Header title="התראות" showNotifications />

      {/* Summary row */}
      <View style={styles.summaryRow}>
        {Object.entries(severityConfig).map(([key, val]) => {
          const count = alerts.filter((a) => a.severity === key && !a.acknowledged).length;
          return (
            <View key={key} style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: val.color }]}>{count}</Text>
              <Text style={styles.summaryLabel}>{val.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'unread' && styles.filterBtnActive]}
          onPress={() => setFilter('unread')}
        >
          <Text
            style={[styles.filterBtnText, filter === 'unread' && styles.filterBtnTextActive]}
          >
            לא נקראו ({unreadCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[styles.filterBtnText, filter === 'all' && styles.filterBtnTextActive]}
          >
            הכל
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AlertItem item={item} onAcknowledge={handleAcknowledge} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.textDim} />
            <Text style={styles.emptyText}>אין התראות</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  summaryRow: {
    flexDirection: 'row-reverse',
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryCount: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textDim },
  filterRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterBtnText: { fontSize: fontSize.sm, color: colors.textDim },
  filterBtnTextActive: { color: colors.white, fontWeight: fontWeight.medium },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  alertCard: {
    backgroundColor: colors.panel,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRightWidth: 4,
    overflow: 'hidden',
    ...shadow.sm,
  },
  alertContent: { padding: spacing.md },
  alertHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  severityChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  severityLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  alertTime: { fontSize: fontSize.xs, color: colors.textDim },
  alertMessage: {
    fontSize: fontSize.md,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  alertFooter: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ackBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  ackBtnText: { fontSize: fontSize.sm, color: colors.accent },
  categoryChip: {
    backgroundColor: colors.panel2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  categoryText: { fontSize: fontSize.xs, color: colors.textDim },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: { color: colors.textDim, fontSize: fontSize.md },
});
