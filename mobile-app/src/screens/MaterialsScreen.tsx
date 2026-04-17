import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
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

const MOCK_MATERIALS = [
  {
    id: '1', name: 'פרופיל נירוסטה 50×50', unit: 'מ"א',
    stock: 120, minStock: 30, maxStock: 200, category: 'נירוסטה',
  },
  {
    id: '2', name: 'ברזל מרובע 40×40', unit: 'מ"א',
    stock: 18, minStock: 25, maxStock: 150, category: 'ברזל',
  },
  {
    id: '3', name: 'מנוע שער FAAC B614', unit: 'יח',
    stock: 3, minStock: 5, maxStock: 20, category: 'אוטומציה',
  },
  {
    id: '4', name: 'כבל נירוסטה 8mm', unit: 'מ"א',
    stock: 0, minStock: 50, maxStock: 300, category: 'כבלים',
  },
  {
    id: '5', name: 'צינור אלומיניום 60×40', unit: 'מ"א',
    stock: 85, minStock: 20, maxStock: 200, category: 'אלומיניום',
  },
  {
    id: '6', name: 'ברגים M10×50', unit: 'יח',
    stock: 450, minStock: 100, maxStock: 1000, category: 'חומרי חיבור',
  },
  {
    id: '7', name: 'צבע אנטי-חלודה שחור', unit: 'ליטר',
    stock: 12, minStock: 20, maxStock: 60, category: 'צבעים',
  },
  {
    id: '8', name: 'גלגלת שער הזזה', unit: 'יח',
    stock: 8, minStock: 10, maxStock: 50, category: 'חומרי חיבור',
  },
];

function getStockStatus(stock: number, min: number): { color: string; label: string } {
  if (stock === 0) return { color: colors.danger, label: 'אזל' };
  if (stock < min) return { color: colors.warning, label: 'נמוך' };
  return { color: colors.success, label: 'תקין' };
}

function StockBar({ stock, min, max }: { stock: number; min: number; max: number }) {
  const pct = max > 0 ? (stock / max) * 100 : 0;
  const st = getStockStatus(stock, min);
  return (
    <View style={barStyles.track}>
      <View
        style={[
          barStyles.fill,
          { width: `${Math.min(100, pct)}%`, backgroundColor: st.color },
        ]}
      />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: colors.panel2,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fill: { height: '100%', borderRadius: 2 },
});

export default function MaterialsScreen() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['materials'],
    queryFn: () => api.getMaterials(),
    initialData: MOCK_MATERIALS,
    retry: 1,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const materials: any[] = (data as any) || MOCK_MATERIALS;

  const filtered = materials.filter((m) => {
    const matchSearch = m.name?.includes(search) || m.category?.includes(search);
    if (filter === 'out') return matchSearch && m.stock === 0;
    if (filter === 'low') return matchSearch && m.stock > 0 && m.stock < m.minStock;
    return matchSearch;
  });

  const renderItem = ({ item }: { item: any }) => {
    const st = getStockStatus(item.stock, item.minStock);
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.statusChip, { backgroundColor: st.color + '22' }]}>
            <Text style={[styles.statusChipText, { color: st.color }]}>{st.label}</Text>
          </View>
          <View style={styles.nameSection}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.category}>{item.category}</Text>
          </View>
        </View>
        <View style={styles.stockRow}>
          <Text style={styles.stockMin}>מינ: {item.minStock}</Text>
          <Text style={[styles.stockValue, { color: st.color }]}>
            {item.stock} {item.unit}
          </Text>
        </View>
        <StockBar stock={item.stock} min={item.minStock} max={item.maxStock} />
      </View>
    );
  };

  const filterBtns: { key: 'all' | 'low' | 'out'; label: string }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'low', label: 'נמוך' },
    { key: 'out', label: 'אזל' },
  ];

  return (
    <View style={styles.container}>
      <Header title="מחסן חומרים" showNotifications />

      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={16} color={colors.textDim} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="חיפוש חומר..."
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

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {filterBtns.map((btn) => (
          <TouchableOpacity
            key={btn.key}
            style={[styles.filterBtn, filter === btn.key && styles.filterBtnActive]}
            onPress={() => setFilter(btn.key)}
          >
            <Text
              style={[
                styles.filterBtnText,
                filter === btn.key && styles.filterBtnTextActive,
              ]}
            >
              {btn.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
            <Ionicons name="cube-outline" size={48} color={colors.textDim} />
            <Text style={styles.emptyText}>לא נמצאו חומרים</Text>
          </View>
        }
      />
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
  filterBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterBtnText: {
    fontSize: fontSize.sm,
    color: colors.textDim,
  },
  filterBtnTextActive: { color: colors.white, fontWeight: fontWeight.medium },
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
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  statusChipText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  nameSection: { flex: 1 },
  name: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: fontWeight.medium,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  category: { fontSize: fontSize.xs, color: colors.textDim, textAlign: 'right', marginTop: 2 },
  stockRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  stockMin: { fontSize: fontSize.xs, color: colors.textDim },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: { color: colors.textDim, fontSize: fontSize.md },
});
