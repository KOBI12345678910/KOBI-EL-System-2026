import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import { api } from '../services/api';
import {
  colors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  shadow,
} from '../constants/theme';

const MOCK_PROJECTS = [
  {
    id: '1', name: 'שערים מגדל המים', client: 'עיריית תל אביב',
    status: 'active', progress: 65,
    budget: 85000, actual: 52000,
    startDate: '2026-03-01', endDate: '2026-04-30',
  },
  {
    id: '2', name: 'מעקות פנטהאוז רמת גן', client: 'קובי אלקיים נדל"ן',
    status: 'in_progress', progress: 40,
    budget: 120000, actual: 48000,
    startDate: '2026-03-15', endDate: '2026-05-15',
  },
  {
    id: '3', name: 'גדר פנימית נחלת גנים', client: 'ועד הבית',
    status: 'pending', progress: 10,
    budget: 35000, actual: 3500,
    startDate: '2026-04-10', endDate: '2026-04-25',
  },
  {
    id: '4', name: 'פרגולה גן עדן', client: 'משפחת לוי',
    status: 'done', progress: 100,
    budget: 45000, actual: 43200,
    startDate: '2026-02-01', endDate: '2026-03-20',
  },
  {
    id: '5', name: 'מעקות גשר שיר', client: 'עיריית חיפה',
    status: 'approved', progress: 0,
    budget: 200000, actual: 0,
    startDate: '2026-05-01', endDate: '2026-07-31',
  },
];

function ProgressBar({ value, color = colors.accent }: { value: number; color?: string }) {
  return (
    <View style={pbStyles.track}>
      <View
        style={[pbStyles.fill, { width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }]}
      />
    </View>
  );
}

const pbStyles = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: colors.panel2,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});

function formatCurrency(n: number): string {
  return '₪' + n.toLocaleString('he-IL');
}

export default function ProjectsScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
    initialData: MOCK_PROJECTS,
    retry: 1,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const projects: any[] = (data as any) || MOCK_PROJECTS;

  const progressColor = (p: number) => {
    if (p >= 90) return colors.success;
    if (p >= 50) return colors.accent;
    if (p >= 20) return colors.warning;
    return colors.danger;
  };

  const renderItem = ({ item }: { item: any }) => {
    const pct = item.progress || 0;
    const budgetUsedPct = item.budget > 0 ? (item.actual / item.budget) * 100 : 0;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <StatusBadge status={item.status} size="sm" />
          <Text style={styles.projectName} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <Text style={styles.client}>{item.client}</Text>

        {/* Progress */}
        <View style={styles.progressSection}>
          <View style={styles.progressRow}>
            <Text style={styles.progressValue}>{pct}%</Text>
            <Text style={styles.progressLabel}>התקדמות</Text>
          </View>
          <ProgressBar value={pct} color={progressColor(pct)} />
        </View>

        {/* Budget */}
        <View style={styles.budgetRow}>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetValue}>{formatCurrency(item.actual)}</Text>
            <Text style={styles.budgetLabel}>בפועל</Text>
          </View>
          <View style={styles.budgetDivider} />
          <View style={styles.budgetItem}>
            <Text style={styles.budgetValue}>{formatCurrency(item.budget)}</Text>
            <Text style={styles.budgetLabel}>תקציב</Text>
          </View>
        </View>
        <ProgressBar
          value={budgetUsedPct}
          color={budgetUsedPct > 90 ? colors.danger : colors.gold}
        />

        {/* Dates */}
        <View style={styles.datesRow}>
          <View style={styles.dateItem}>
            <Ionicons name="flag-outline" size={12} color={colors.textDim} />
            <Text style={styles.dateText}>{item.endDate}</Text>
          </View>
          <View style={styles.dateItem}>
            <Ionicons name="calendar-outline" size={12} color={colors.textDim} />
            <Text style={styles.dateText}>{item.startDate}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="פרויקטים" showNotifications />
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
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
            <Ionicons name="business-outline" size={48} color={colors.textDim} />
            <Text style={styles.emptyText}>אין פרויקטים פעילים</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.panel,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  projectName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginLeft: spacing.sm,
  },
  client: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    textAlign: 'right',
    marginBottom: spacing.md,
  },
  progressSection: { marginBottom: spacing.sm },
  progressRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  progressLabel: { fontSize: fontSize.sm, color: colors.textDim },
  progressValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.semibold },
  budgetRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  budgetItem: { flex: 1, alignItems: 'center' },
  budgetDivider: { width: 1, height: 30, backgroundColor: colors.border },
  budgetValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  budgetLabel: { fontSize: fontSize.xs, color: colors.textDim, marginTop: 2 },
  datesRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  dateItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  dateText: { fontSize: fontSize.xs, color: colors.textDim },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: { color: colors.textDim, fontSize: fontSize.md },
});
