import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
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

const MOCK_FINANCE = {
  revenue: 285000,
  expenses: 178000,
  netProfit: 107000,
  invoices: [
    { id: 'INV-001', client: 'עיריית תל אביב', amount: 85000, status: 'paid', date: '2026-04-01' },
    { id: 'INV-002', client: 'קובי אלקיים נדל"ן', amount: 120000, status: 'issued', date: '2026-04-10' },
    { id: 'INV-003', client: 'ועד הבית נחלת גנים', amount: 35000, status: 'draft', date: '2026-04-14' },
    { id: 'INV-004', client: 'משפחת לוי', amount: 45000, status: 'overdue', date: '2026-03-20' },
    { id: 'INV-005', client: 'עיריית חיפה', amount: 200000, status: 'approved', date: '2026-04-16' },
    { id: 'INV-006', client: 'חברת ABC', amount: 22000, status: 'paid', date: '2026-04-05' },
    { id: 'INV-007', client: 'דניה סיבוס', amount: 67000, status: 'issued', date: '2026-04-12' },
    { id: 'INV-008', client: 'פרטי - כהן', amount: 18500, status: 'paid', date: '2026-04-08' },
    { id: 'INV-009', client: 'חברת מגדל', amount: 53000, status: 'draft', date: '2026-04-15' },
    { id: 'INV-010', client: 'עיריית נתניה', amount: 78000, status: 'overdue', date: '2026-03-25' },
  ],
};

function KpiCard({
  title,
  value,
  icon,
  color,
  trend,
}: {
  title: string;
  value: number;
  icon: any;
  color: string;
  trend?: string;
}) {
  return (
    <View style={[kpiStyles.card, { borderTopColor: color }]}>
      <View style={[kpiStyles.iconContainer, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={kpiStyles.value}>{'₪' + value.toLocaleString('he-IL')}</Text>
      <Text style={kpiStyles.title}>{title}</Text>
      {trend && <Text style={[kpiStyles.trend, { color }]}>{trend}</Text>}
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 3,
    ...shadow.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    textAlign: 'right',
  },
  title: {
    fontSize: fontSize.xs,
    color: colors.textDim,
    marginTop: 2,
    textAlign: 'right',
  },
  trend: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginTop: spacing.xs,
  },
});

export default function FinanceScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['finance'],
    queryFn: () => api.getFinanceSummary(),
    initialData: MOCK_FINANCE,
    retry: 1,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const finance: typeof MOCK_FINANCE = (data as any) || MOCK_FINANCE;

  const profitMargin =
    finance.revenue > 0
      ? ((finance.netProfit / finance.revenue) * 100).toFixed(1)
      : '0';

  const renderInvoice = ({ item }: { item: any }) => (
    <View style={styles.invoiceRow}>
      <View style={styles.invoiceRight}>
        <StatusBadge status={item.status} size="sm" />
      </View>
      <View style={styles.invoiceInfo}>
        <Text style={styles.invoiceId}>{item.id}</Text>
        <Text style={styles.invoiceClient} numberOfLines={1}>
          {item.client}
        </Text>
        <Text style={styles.invoiceDate}>{item.date}</Text>
      </View>
      <Text style={styles.invoiceAmount}>
        {'₪' + item.amount.toLocaleString('he-IL')}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header title="פיננסים" showNotifications />
      <FlatList
        data={finance.invoices?.slice(0, 10)}
        keyExtractor={(item) => item.id}
        renderItem={renderInvoice}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          <View>
            {/* KPI Cards */}
            <View style={styles.kpiRow}>
              <KpiCard
                title="הכנסות החודש"
                value={finance.revenue}
                icon="trending-up-outline"
                color={colors.success}
                trend="+12%"
              />
              <View style={{ width: spacing.sm }} />
              <KpiCard
                title="הוצאות"
                value={finance.expenses}
                icon="trending-down-outline"
                color={colors.danger}
              />
            </View>
            <View style={styles.kpiSingle}>
              <KpiCard
                title="רווח נקי"
                value={finance.netProfit}
                icon="stats-chart-outline"
                color={colors.gold}
                trend={`שולי רווח ${profitMargin}%`}
              />
            </View>

            {/* Invoices Header */}
            <Text style={styles.invoicesTitle}>חשבוניות אחרונות</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={colors.textDim} />
            <Text style={styles.emptyText}>אין חשבוניות</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  kpiRow: { flexDirection: 'row', marginBottom: spacing.sm },
  kpiSingle: { marginBottom: spacing.lg },
  invoicesTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: spacing.sm,
  },
  invoiceRow: {
    backgroundColor: colors.panel,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  invoiceRight: { alignItems: 'flex-end' },
  invoiceInfo: { flex: 1 },
  invoiceId: {
    fontSize: fontSize.sm,
    color: colors.accent,
    textAlign: 'right',
    fontWeight: fontWeight.medium,
  },
  invoiceClient: {
    fontSize: fontSize.md,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  invoiceDate: { fontSize: fontSize.xs, color: colors.textDim, textAlign: 'right' },
  invoiceAmount: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.text,
    minWidth: 80,
    textAlign: 'left',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: { color: colors.textDim, fontSize: fontSize.md },
});
