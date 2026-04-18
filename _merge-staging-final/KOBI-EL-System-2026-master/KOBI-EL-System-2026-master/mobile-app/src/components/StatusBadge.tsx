import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, fontWeight, borderRadius, spacing } from '../constants/theme';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

function getStatusConfig(status: string): { label: string; color: string; bg: string } {
  const s = status.toLowerCase();

  if (['draft', 'טיוטה'].includes(s)) {
    return { label: 'טיוטה', color: colors.textDim, bg: colors.textDim + '22' };
  }
  if (['active', 'approved', 'פעיל', 'מאושר', 'open', 'פתוח'].includes(s)) {
    return { label: status, color: colors.success, bg: colors.success + '22' };
  }
  if (['pending', 'ממתין', 'in_progress', 'בביצוע', 'assigned', 'הוקצה', 'issued'].includes(s)) {
    return { label: status, color: colors.warning, bg: colors.warning + '22' };
  }
  if (['overdue', 'rejected', 'באיחור', 'נדחה', 'critical', 'קריטי', 'cancelled'].includes(s)) {
    return { label: status, color: colors.danger, bg: colors.danger + '22' };
  }
  if (['done', 'completed', 'paid', 'הושלם', 'שולם', 'closed'].includes(s)) {
    return { label: status, color: colors.accent, bg: colors.accent + '22' };
  }
  if (['qa', 'בדיקת איכות', 'review'].includes(s)) {
    return { label: status, color: colors.gold, bg: colors.gold + '22' };
  }
  if (['low', 'נמוך'].includes(s)) {
    return { label: status, color: colors.success, bg: colors.success + '22' };
  }

  // Default
  return { label: status, color: colors.textDim, bg: colors.textDim + '22' };
}

const hebrewLabels: Record<string, string> = {
  draft: 'טיוטה',
  active: 'פעיל',
  approved: 'מאושר',
  pending: 'ממתין',
  in_progress: 'בביצוע',
  assigned: 'הוקצה',
  open: 'פתוח',
  done: 'הושלם',
  completed: 'הושלם',
  paid: 'שולם',
  issued: 'הונפק',
  overdue: 'באיחור',
  rejected: 'נדחה',
  cancelled: 'בוטל',
  closed: 'סגור',
  qa: 'בדיקת איכות',
  review: 'בסקירה',
  critical: 'קריטי',
  high: 'גבוה',
  medium: 'בינוני',
  low: 'נמוך',
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = getStatusConfig(status);
  const label = hebrewLabels[status.toLowerCase()] || config.label;
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg, borderColor: config.color + '44' },
        isSmall && styles.badgeSm,
      ]}
    >
      <Text style={[styles.text, { color: config.color }, isSmall && styles.textSm]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  textSm: {
    fontSize: fontSize.xs,
  },
});
