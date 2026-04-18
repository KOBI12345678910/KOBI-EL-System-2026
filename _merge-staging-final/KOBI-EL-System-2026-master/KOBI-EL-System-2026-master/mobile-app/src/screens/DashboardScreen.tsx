import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import {
  colors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  shadow,
} from '../constants/theme';

function hebrewDate(): string {
  const now = new Date();
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const months = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
  ];
  return `יום ${days[now.getDay()]}, ${now.getDate()} ב${months[now.getMonth()]} ${now.getFullYear()}`;
}

// Mock fallback data
const MOCK_SNAPSHOT = {
  activeProjects: 12,
  openWorkOrders: 8,
  employeesInField: 18,
  alerts: 3,
  recentProjects: [
    { id: '1', name: 'שערים מגדל המים', status: 'active', client: 'עיריית תל אביב' },
    { id: '2', name: 'מעקות פנטהאוז רמת גן', status: 'in_progress', client: 'קובי אלקיים נדל"ן' },
    { id: '3', name: 'גדר פנימית נחלת גנים', status: 'pending', client: 'ועד הבית' },
    { id: '4', name: 'פרגולה גן עדן', status: 'done', client: 'משפחת לוי' },
    { id: '5', name: 'מעקות גשר שיר', status: 'approved', client: 'עיריית חיפה' },
  ],
  urgentAlerts: [
    { id: '1', message: 'מחסן ברזל מרובע 50×50 — נמוך מ-20 יחידות', severity: 'high' },
    { id: '2', message: 'פועל שמואל לא דיווח על כניסה לאתר', severity: 'critical' },
    { id: '3', message: 'חשבונית #1042 עומדת לעבור תאריך פירעון', severity: 'medium' },
  ],
};

export default function DashboardScreen() {
  const user = useAppStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);

  const { data: snapshot, refetch, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboardSnapshot(),
    initialData: MOCK_SNAPSHOT,
    retry: 1,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const data: typeof MOCK_SNAPSHOT = (snapshot as any) || MOCK_SNAPSHOT;

  const severityColor = (s: string) => {
    if (s === 'critical') return colors.danger;
    if (s === 'high') return colors.warning;
    if (s === 'medium') return colors.gold;
    return colors.success;
  };

  return (
    <View style={styles.container}>
      <Header title="דשבורד" showNotifications />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {/* Greeting */}
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>
            שלום {user?.name || user?.username || 'משתמש'} 👋
          </Text>
          <Text style={styles.dateText}>{hebrewDate()}</Text>
        </View>

        {/* Stat Cards 2x2 grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatCard
              title="פרויקטים פעילים"
              value={data.activeProjects}
              icon="business-outline"
              color={colors.accent}
              trend="up"
              trendValue="+2"
            />
            <View style={{ width: spacing.sm }} />
            <StatCard
              title="הזמנות עבודה פתוחות"
              value={data.openWorkOrders}
              icon="construct-outline"
              color={colors.warning}
            />
          </View>
          <View style={{ height: spacing.sm }} />
          <View style={styles.statsRow}>
            <StatCard
              title="עובדים בשטח"
              value={data.employeesInField}
              icon="people-outline"
              color={colors.success}
            />
            <View style={{ width: spacing.sm }} />
            <StatCard
              title="התראות"
              value={data.alerts}
              icon="alert-circle-outline"
              color={colors.danger}
              trend="down"
              trendValue="-1"
            />
          </View>
        </View>

        {/* Recent Projects */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <TouchableOpacity>
              <Text style={styles.sectionLink}>הכל</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>פרויקטים אחרונים</Text>
          </View>
          {data.recentProjects?.map((project: any) => (
            <View key={project.id} style={styles.projectRow}>
              <StatusBadge status={project.status} size="sm" />
              <View style={styles.projectInfo}>
                <Text style={styles.projectName} numberOfLines={1}>
                  {project.name}
                </Text>
                <Text style={styles.projectClient} numberOfLines={1}>
                  {project.client}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Urgent Alerts */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <TouchableOpacity>
              <Text style={styles.sectionLink}>הכל</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>התראות דחופות</Text>
          </View>
          {data.urgentAlerts?.slice(0, 3).map((alert: any) => (
            <View key={alert.id} style={styles.alertRow}>
              <View
                style={[styles.alertDot, { backgroundColor: severityColor(alert.severity) }]}
              />
              <Text style={styles.alertText} numberOfLines={2}>
                {alert.message}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  greeting: {
    marginBottom: spacing.lg,
    alignItems: 'flex-end',
  },
  greetingText: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  dateText: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  statsGrid: { marginBottom: spacing.lg },
  statsRow: { flexDirection: 'row' },
  section: {
    backgroundColor: colors.panel,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionLink: {
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  projectRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  projectInfo: { flex: 1 },
  projectName: {
    fontSize: fontSize.md,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  projectClient: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    textAlign: 'right',
    marginTop: 2,
  },
  alertRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    flexShrink: 0,
  },
  alertText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
});
