import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  Modal,
  Linking,
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

const MOCK_EMPLOYEES = [
  {
    id: '1', name: 'שמואל כהן', role: 'ראש צוות', phone: '050-1234567',
    status: 'field', assignment: 'שערים מגדל המים'
  },
  {
    id: '2', name: 'יוסי לוי', role: 'פועל מתכת', phone: '052-2345678',
    status: 'field', assignment: 'מעקות פנטהאוז'
  },
  {
    id: '3', name: 'דוד מזרחי', role: 'מרתך', phone: '054-3456789',
    status: 'office', assignment: 'משרד'
  },
  {
    id: '4', name: 'אמיר בן-דוד', role: 'מנהל עבודה', phone: '050-4567890',
    status: 'field', assignment: 'פרגולה גן עדן'
  },
  {
    id: '5', name: 'ניר שלום', role: 'פועל כללי', phone: '053-5678901',
    status: 'leave', assignment: 'חופשה'
  },
  {
    id: '6', name: 'רחל כהן', role: 'מנהלת חשבונות', phone: '052-6789012',
    status: 'office', assignment: 'משרד'
  },
  {
    id: '7', name: 'מושה אברהם', role: 'נהג', phone: '054-7890123',
    status: 'field', assignment: 'הובלות'
  },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  field: { label: 'בשטח', color: colors.success },
  office: { label: 'במשרד', color: colors.accent },
  leave: { label: 'חופשה', color: colors.warning },
};

export default function EmployeesScreen() {
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.getEmployees(),
    initialData: MOCK_EMPLOYEES,
    retry: 1,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const employees: any[] = (data as any) || MOCK_EMPLOYEES;
  const filtered = employees.filter(
    (e) =>
      e.name?.includes(search) ||
      e.role?.includes(search) ||
      e.assignment?.includes(search)
  );

  const getInitials = (name: string) =>
    name
      .split(' ')
      .slice(0, 2)
      .map((n) => n.charAt(0))
      .join('');

  const renderItem = ({ item }: { item: any }) => {
    const sc = statusConfig[item.status] || statusConfig.office;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setSelectedEmployee(item)}
        activeOpacity={0.8}
      >
        <View style={styles.cardContent}>
          <View style={styles.infoSection}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.role}>{item.role}</Text>
            <View style={styles.assignmentRow}>
              <Ionicons name="location-outline" size={12} color={colors.textDim} />
              <Text style={styles.assignment}>{item.assignment}</Text>
            </View>
          </View>
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: sc.color }]} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="עובדים" showNotifications />

      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={16} color={colors.textDim} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="חיפוש לפי שם..."
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

      {/* Status legend */}
      <View style={styles.legend}>
        {Object.entries(statusConfig).map(([key, val]) => (
          <View key={key} style={styles.legendItem}>
            <Text style={styles.legendLabel}>{val.label}</Text>
            <View style={[styles.legendDot, { backgroundColor: val.color }]} />
          </View>
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
            <Ionicons name="people-outline" size={48} color={colors.textDim} />
            <Text style={styles.emptyText}>לא נמצאו עובדים</Text>
          </View>
        }
      />

      {/* Employee Detail Modal */}
      <Modal
        visible={!!selectedEmployee}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEmployee(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setSelectedEmployee(null)}
            >
              <Ionicons name="close" size={22} color={colors.textDim} />
            </TouchableOpacity>
            {selectedEmployee && (
              <>
                <View style={styles.modalAvatar}>
                  <Text style={styles.modalAvatarText}>
                    {getInitials(selectedEmployee.name)}
                  </Text>
                </View>
                <Text style={styles.modalName}>{selectedEmployee.name}</Text>
                <Text style={styles.modalRole}>{selectedEmployee.role}</Text>
                <View
                  style={[
                    styles.modalStatus,
                    {
                      backgroundColor:
                        (statusConfig[selectedEmployee.status]?.color || colors.accent) + '22',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: statusConfig[selectedEmployee.status]?.color || colors.accent,
                      fontWeight: fontWeight.medium,
                    }}
                  >
                    {statusConfig[selectedEmployee.status]?.label || selectedEmployee.status}
                  </Text>
                </View>
                <View style={styles.modalInfo}>
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoValue}>{selectedEmployee.assignment}</Text>
                    <Text style={styles.modalInfoLabel}>משימה נוכחית</Text>
                  </View>
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoValue}>{selectedEmployee.phone}</Text>
                    <Text style={styles.modalInfoLabel}>טלפון</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.callButton}
                  onPress={() => Linking.openURL(`tel:${selectedEmployee.phone}`)}
                >
                  <Ionicons name="call-outline" size={18} color={colors.white} />
                  <Text style={styles.callButtonText}>התקשר</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  legend: {
    flexDirection: 'row-reverse',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  legendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: fontSize.xs, color: colors.textDim },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.panel,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardContent: { flexDirection: 'row-reverse', alignItems: 'center' },
  infoSection: { flex: 1 },
  name: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  role: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    marginTop: 2,
    textAlign: 'right',
  },
  assignmentRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  assignment: { fontSize: fontSize.xs, color: colors.textDim },
  avatarSection: { alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accent,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: { color: colors.textDim, fontSize: fontSize.md },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  modalClose: { position: 'absolute', top: spacing.md, left: spacing.md },
  modalAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent + '33',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalAvatarText: { color: colors.accent, fontWeight: fontWeight.bold, fontSize: fontSize.xl },
  modalName: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  modalRole: { fontSize: fontSize.md, color: colors.textDim, marginBottom: spacing.md },
  modalStatus: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.lg,
  },
  modalInfo: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  modalInfoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalInfoLabel: { color: colors.textDim, fontSize: fontSize.sm },
  modalInfoValue: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  callButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    ...shadow.sm,
  },
  callButtonText: {
    color: colors.white,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.md,
  },
});
