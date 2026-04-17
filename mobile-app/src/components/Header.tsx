import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, fontSize, fontWeight, borderRadius } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  showNotifications?: boolean;
  onNotificationsPress?: () => void;
  rightAction?: React.ReactNode;
}

export default function Header({
  title,
  showBack = false,
  showNotifications = true,
  onNotificationsPress,
  rightAction,
}: HeaderProps) {
  const navigation = useNavigation();
  const notificationsCount = useAppStore((s) => s.notificationsCount);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.panel} />
      <View style={styles.inner}>
        {/* Left side: notifications or back */}
        <View style={styles.leftSection}>
          {showBack ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.iconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : showNotifications ? (
            <TouchableOpacity
              onPress={onNotificationsPress}
              style={styles.iconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
              {notificationsCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {notificationsCount > 99 ? '99+' : notificationsCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        {/* Center: title */}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        {/* Right side: optional action */}
        <View style={styles.rightSection}>
          {rightAction || <View style={styles.iconBtn} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 0,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  leftSection: {
    width: 44,
    alignItems: 'flex-start',
  },
  rightSection: {
    width: 44,
    alignItems: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    writingDirection: 'rtl',
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.danger,
    borderRadius: borderRadius.full,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
});
