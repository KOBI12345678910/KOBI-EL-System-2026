import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import { api } from '../services/api';
import {
  colors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  shadow,
} from '../constants/theme';

const MOCK_WO = [
  {
    id: 'WO-001', number: 'WO-001', projectName: 'שערים מגדל המים',
    status: 'in_progress', assignee: 'שמואל כהן', date: '2026-04-15',
    description: 'התקנת שער כניסה ראשי'
  },
  {
    id: 'WO-002', number: 'WO-002', projectName: 'מעקות פנטהאוז',
    status: 'open', assignee: 'יוסי לוי', date: '2026-04-16',
    description: 'ייצור מעקות נירוסטה'
  },
  {
    id: 'WO-003', number: 'WO-003', projectName: 'גדר פנימית',
    status: 'done', assignee: 'דוד מזרחי', date: '2026-04-14',
    description: 'התקנת גדר רשת 50 מ"ר'
  },
  {
    id: 'WO-004', number: 'WO-004', projectName: 'פרגולה גן עדן',
    status: 'qa', assignee: 'אמיר בן-דוד', date: '2026-04-17',
    description: 'בדיקה סופית פרגולה אלומיניום'
  },
  {
    id: 'WO-005', number: 'WO-005', projectName: 'מעקות גשר שיר',
    status: 'pending', assignee: 'ניר שלום', date: '2026-04-18',
    description: 'הכנת חומרים לביצוע'
  },
];

export default function WorkOrdersScreen() {
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: () => api.getWorkOrders(),
    initialData: MOCK_WO,
    retry: 1,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const workOrders: any[] = (data as any) || MOCK_WO;

  const filtered = workOrders.filter(
    (wo) =>
      wo.number?.toLowerCase().includes(search.toLowerCase()) ||
      wo.projectName?.includes(search) ||
      wo.assignee?.includes(search)
  );

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('WorkOrderDetail', { id: item.id, workOrder: item })}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <StatusBadge status={item.status} size="sm" />
        <View style={styles.cardHeader}>
          <Text style={styles.woNumber}>{item.number}</Text>
          <Text style={styles.projectName} numberOfLines={1}>
            {item.projectName}
          </Text>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={13} color={colors.textDim} />
          <Text style={styles.metaText}>{item.date}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="person-outline" size={13} color={colors.textDim} />
          <Text style={styles.metaText}>{item.assignee}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header title="הזמנות עבודה" showNotifications />

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={16} color={colors.textDim} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="חיפוש..."
            placeholderTextColor={colors.textDim}
            textAlign="right"
            writingDirection="rtl"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.textDim} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading && !refreshing ? (
        <LoadingSpinner message="טוען הזמנות..." />
      ) : (
        <FlatList
          data={filtered}
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
              <Ionicons name="document-text-outline" size={48} color={colors.textDim} />
              <Text style={styles.emptyText}>לא נמצאו הזמנות עבודה</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => Alert.alert('יצירת הזמנה', 'פתיחת טופס הזמנת עבודה חדשה')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    paddingVertical: spacing.sm,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.panel,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardTop: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardHeader: { flex: 1, alignItems: 'flex-end', marginLeft: spacing.sm },
  woNumber: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
  projectName: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: fontWeight.medium,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  cardBottom: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  metaItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.textDim,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: fontSize.md,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
  },
});
