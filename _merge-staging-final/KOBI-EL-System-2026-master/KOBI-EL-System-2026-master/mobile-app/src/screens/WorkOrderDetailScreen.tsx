import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
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

const STATUSES = [
  { key: 'open', label: 'פתוח' },
  { key: 'assigned', label: 'הוקצה' },
  { key: 'in_progress', label: 'בביצוע' },
  { key: 'qa', label: 'בדיקת איכות' },
  { key: 'done', label: 'הושלם' },
];

const MOCK_DETAIL = {
  id: 'WO-001',
  number: 'WO-001',
  projectName: 'שערים מגדל המים',
  status: 'in_progress',
  description: 'התקנת שער כניסה ראשי מנירוסטה 304, ממד 3×2 מ"ר, עם מנוע אוטומטי',
  assignee: 'שמואל כהן',
  date: '2026-04-15',
  dueDate: '2026-04-20',
  employees: [
    { id: '1', name: 'שמואל כהן', role: 'ראש צוות' },
    { id: '2', name: 'יוסי לוי', role: 'פועל' },
  ],
  materials: [
    { id: '1', name: 'פרופיל נירוסטה 50×50', quantity: 20, unit: 'מ"א' },
    { id: '2', name: 'מנוע שער FAAC', quantity: 1, unit: 'יח' },
    { id: '3', name: 'שרשרת נירוסטה', quantity: 5, unit: 'מ"א' },
  ],
  notes: '',
};

export default function WorkOrderDetailScreen() {
  const route = useRoute<any>();
  const workOrder = route.params?.workOrder || MOCK_DETAIL;
  const [notes, setNotes] = useState(workOrder.notes || '');
  const [currentStatus, setCurrentStatus] = useState(workOrder.status);
  const [saving, setSaving] = useState(false);

  const currentIdx = STATUSES.findIndex((s) => s.key === currentStatus);

  const handleStatusAction = async (newStatus: string) => {
    try {
      setSaving(true);
      await api.updateWorkOrderStatus(workOrder.id, newStatus);
      setCurrentStatus(newStatus);
      Alert.alert('עודכן', 'סטטוס הזמנת העבודה עודכן בהצלחה');
    } catch {
      // Use local update even if API fails
      setCurrentStatus(newStatus);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title={workOrder.number} showBack />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Title + Status */}
        <View style={styles.titleRow}>
          <StatusBadge status={currentStatus} />
          <Text style={styles.projectName}>{workOrder.projectName}</Text>
        </View>
        <Text style={styles.description}>{workOrder.description}</Text>

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>{workOrder.dueDate || '—'}</Text>
            <Text style={styles.metaLabel}>תאריך יעד</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>{workOrder.date}</Text>
            <Text style={styles.metaLabel}>תאריך פתיחה</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>{workOrder.assignee}</Text>
            <Text style={styles.metaLabel}>אחראי</Text>
          </View>
        </View>

        {/* Status Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>מהלך ביצוע</Text>
          <View style={styles.timeline}>
            {STATUSES.map((step, idx) => {
              const done = idx < currentIdx;
              const active = idx === currentIdx;
              const future = idx > currentIdx;
              return (
                <View key={step.key} style={styles.timelineStep}>
                  <View style={styles.timelineLeft}>
                    <View
                      style={[
                        styles.timelineDot,
                        done && styles.timelineDotDone,
                        active && styles.timelineDotActive,
                        future && styles.timelineDotFuture,
                      ]}
                    >
                      {done && (
                        <Ionicons name="checkmark" size={10} color={colors.white} />
                      )}
                    </View>
                    {idx < STATUSES.length - 1 && (
                      <View
                        style={[
                          styles.timelineLine,
                          done && styles.timelineLineDone,
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.timelineLabel,
                      active && styles.timelineLabelActive,
                      future && styles.timelineLabelFuture,
                    ]}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Employees */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>עובדים מוקצים</Text>
          {workOrder.employees?.map((emp: any) => (
            <View key={emp.id} style={styles.empRow}>
              <View style={styles.empAvatar}>
                <Text style={styles.empInitial}>{emp.name.charAt(0)}</Text>
              </View>
              <View style={styles.empInfo}>
                <Text style={styles.empName}>{emp.name}</Text>
                <Text style={styles.empRole}>{emp.role}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Materials */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>חומרים</Text>
          {workOrder.materials?.map((mat: any) => (
            <View key={mat.id} style={styles.matRow}>
              <Text style={styles.matQty}>{mat.quantity} {mat.unit}</Text>
              <Text style={styles.matName}>{mat.name}</Text>
            </View>
          ))}
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>הערות</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="הוסף הערה..."
            placeholderTextColor={colors.textDim}
            multiline
            textAlignVertical="top"
            textAlign="right"
            writingDirection="rtl"
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          {currentStatus === 'open' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.accent }]}
              onPress={() => handleStatusAction('assigned')}
              disabled={saving}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.white} />
              <Text style={styles.actionBtnText}>הקצה</Text>
            </TouchableOpacity>
          )}
          {currentStatus === 'assigned' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.warning }]}
              onPress={() => handleStatusAction('in_progress')}
              disabled={saving}
            >
              <Ionicons name="play-outline" size={18} color={colors.white} />
              <Text style={styles.actionBtnText}>התחל</Text>
            </TouchableOpacity>
          )}
          {currentStatus === 'in_progress' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.gold }]}
              onPress={() => handleStatusAction('qa')}
              disabled={saving}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.white} />
              <Text style={styles.actionBtnText}>בדיקת איכות</Text>
            </TouchableOpacity>
          )}
          {currentStatus === 'qa' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.success }]}
              onPress={() => handleStatusAction('done')}
              disabled={saving}
            >
              <Ionicons name="checkmark-done-outline" size={18} color={colors.white} />
              <Text style={styles.actionBtnText}>סיים</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  projectName: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginLeft: spacing.sm,
  },
  description: {
    fontSize: fontSize.md,
    color: colors.textDim,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  metaRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaItem: { alignItems: 'center' },
  metaValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  metaLabel: { fontSize: fontSize.xs, color: colors.textDim, marginTop: 2 },
  section: {
    backgroundColor: colors.panel,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: spacing.md,
  },
  timeline: { gap: 0 },
  timelineStep: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  timelineLeft: { alignItems: 'center', width: 20 },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.panel2,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  timelineDotActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  timelineDotFuture: { backgroundColor: colors.panel2, borderColor: colors.border },
  timelineLine: {
    width: 2,
    height: 24,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  timelineLineDone: { backgroundColor: colors.success },
  timelineLabel: {
    fontSize: fontSize.md,
    color: colors.text,
    paddingBottom: spacing.lg,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  timelineLabelActive: { color: colors.accent, fontWeight: fontWeight.semibold },
  timelineLabelFuture: { color: colors.textDim },
  empRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  empAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empInitial: { color: colors.accent, fontWeight: fontWeight.bold, fontSize: fontSize.md },
  empInfo: { flex: 1, alignItems: 'flex-end' },
  empName: { fontSize: fontSize.md, color: colors.text, textAlign: 'right' },
  empRole: { fontSize: fontSize.sm, color: colors.textDim },
  matRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  matName: { fontSize: fontSize.md, color: colors.text, textAlign: 'right' },
  matQty: { fontSize: fontSize.md, color: colors.accent },
  notesInput: {
    backgroundColor: colors.panel2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    color: colors.text,
    fontSize: fontSize.md,
    minHeight: 80,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  actions: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
    ...shadow.sm,
  },
  actionBtnText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
});
