import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import { logout } from '../services/auth';
import { useAppStore } from '../store/useAppStore';
import {
  colors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  shadow,
} from '../constants/theme';

function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: any;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Ionicons
        name="chevron-back"
        size={16}
        color={onPress ? colors.textDim : 'transparent'}
      />
      <View style={styles.settingContent}>
        {value && <Text style={styles.settingValue}>{value}</Text>}
        <Text style={[styles.settingLabel, danger && styles.dangerText]}>{label}</Text>
      </View>
      <View style={[styles.settingIcon, { backgroundColor: (danger ? colors.danger : colors.accent) + '22' }]}>
        <Ionicons
          name={icon}
          size={18}
          color={danger ? colors.danger : colors.accent}
        />
      </View>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const user = useAppStore((s) => s.user);

  const handleLogout = () => {
    Alert.alert('יציאה מהמערכת', 'האם אתה בטוח שברצונך להתנתק?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'התנתק',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .slice(0, 2)
        .map((n) => n.charAt(0))
        .join('')
    : '??';

  return (
    <View style={styles.container}>
      <Header title="פרופיל" showNotifications={false} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user?.name || user?.username || 'משתמש'}</Text>
          <Text style={styles.role}>{user?.role || 'מנהל'}</Text>
          {user?.email && <Text style={styles.email}>{user.email}</Text>}
        </View>

        {/* Company info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>פרטי חברה</Text>
          <SettingRow
            icon="business-outline"
            label="שם חברה"
            value="טכנו כל עוזי בע"מ"
          />
          <SettingRow
            icon="location-outline"
            label="מיקום"
            value="ישראל"
          />
          <SettingRow
            icon="people-outline"
            label="מספר עובדים"
            value="30"
          />
        </View>

        {/* System info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>מערכת</Text>
          <SettingRow
            icon="server-outline"
            label="שרת Procurement"
            value="localhost:3100"
          />
          <SettingRow
            icon="cog-outline"
            label="שרת Operations"
            value="localhost:3200"
          />
          <SettingRow
            icon="phone-portrait-outline"
            label="גרסת אפליקציה"
            value="1.0.0"
          />
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>פעולות</Text>
          <SettingRow
            icon="notifications-outline"
            label="הגדרות התראות"
            onPress={() => Alert.alert('בקרוב', 'הגדרות התראות בפיתוח')}
          />
          <SettingRow
            icon="language-outline"
            label="שפה — עברית"
            onPress={() => {}}
          />
          <SettingRow
            icon="moon-outline"
            label="ערכת צבעים — Palantir Dark"
          />
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <SettingRow
            icon="log-out-outline"
            label="יציאה מהמערכת"
            onPress={handleLogout}
            danger
          />
        </View>

        <Text style={styles.footer}>
          KOBI-EL Systems © 2026{'\n'}
          Techno Kol Uzi Ltd. | Kobi Elkayam Real Estate
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent + '33',
    borderWidth: 3,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadow.md,
  },
  avatarText: {
    color: colors.accent,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  role: {
    fontSize: fontSize.md,
    color: colors.textDim,
    marginBottom: spacing.xs,
  },
  email: { fontSize: fontSize.sm, color: colors.accent },
  section: {
    backgroundColor: colors.panel,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadow.sm,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    fontWeight: fontWeight.semibold,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  settingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: { flex: 1, alignItems: 'flex-end' },
  settingLabel: {
    fontSize: fontSize.md,
    color: colors.text,
    textAlign: 'right',
  },
  dangerText: { color: colors.danger },
  settingValue: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    textAlign: 'right',
    marginBottom: 2,
  },
  footer: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textDim,
    lineHeight: 20,
    marginTop: spacing.md,
  },
});
