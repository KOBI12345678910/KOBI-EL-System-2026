import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import * as api from "@/lib/api";

interface AdminUser {
  id: number;
  username: string;
  fullName: string;
  fullNameHe?: string;
  email?: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  isSuperAdmin?: boolean;
  isActive?: boolean;
}

export default function UsersAdminScreenWrapper() {
  return (
    <AuthGuard>
      <UsersAdminScreen />
    </AuthGuard>
  );
}

function UsersAdminScreen() {
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  if (!currentUser?.isSuperAdmin) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Feather name="chevron-right" size={24} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.topTitle}>ניהול משתמשים</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.accessDenied}>
          <Feather name="lock" size={48} color={Colors.light.textMuted} />
          <Text style={styles.accessDeniedText}>גישה מוגבלת למנהלי מערכת</Text>
        </View>
      </View>
    );
  }

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-users", searchQuery],
    queryFn: () => api.getUsers({ search: searchQuery || undefined }),
  });

  const users = (data?.users ?? []) as unknown as AdminUser[];

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.updateUserRole(userId, role),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setSelectedUser(null);
    },
    onError: (err: Error) => {
      Alert.alert("שגיאה", err.message || "לא ניתן לעדכן את ההרשאות");
    },
  });

  if (selectedUser) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => setSelectedUser(null)} style={styles.iconBtn} hitSlop={8}>
            <Feather name="chevron-right" size={24} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.topTitle}>ערוך משתמש</Text>
          <View style={{ width: 32 }} />
        </View>
        <UserEditForm
          user={selectedUser}
          onSave={(role) => {
            Alert.alert("עדכון הרשאות", `האם לשנות את הרשאות ${selectedUser.fullName} ל-${role}?`, [
              { text: "ביטול", style: "cancel" },
              {
                text: "עדכן",
                onPress: () => updateRoleMutation.mutate({ userId: selectedUser.id, role }),
              },
            ]);
          }}
          isSaving={updateRoleMutation.isPending}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>ניהול משתמשים</Text>
        <View style={styles.userCount}>
          <Text style={styles.userCountText}>{users.length}</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <Feather name="search" size={16} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="חפש משתמשים..."
          placeholderTextColor={Colors.light.textMuted}
          textAlign="right"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")}>
            <Feather name="x" size={16} color={Colors.light.textMuted} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <UserRow user={item} currentUserId={currentUser.id} onPress={() => setSelectedUser(item)} />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.light.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="users" size={40} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>לא נמצאו משתמשים</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function UserRow({
  user,
  currentUserId,
  onPress,
}: {
  user: AdminUser;
  currentUserId: number;
  onPress: () => void;
}) {
  const initials = (user.fullName || user.username || "")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isAdmin = user.isSuperAdmin;
  const isSelf = user.id === currentUserId;

  return (
    <Pressable
      style={({ pressed }) => [styles.userRow, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View style={[styles.avatar, { backgroundColor: isAdmin ? Colors.light.primary : Colors.light.accent }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName} numberOfLines={1}>
            {user.fullNameHe || user.fullName || user.username}
          </Text>
          {isSelf && (
            <View style={styles.selfBadge}>
              <Text style={styles.selfBadgeText}>אני</Text>
            </View>
          )}
          {isAdmin && (
            <View style={styles.adminBadge}>
              <Feather name="shield" size={10} color={Colors.light.primary} />
              <Text style={styles.adminBadgeText}>מנהל</Text>
            </View>
          )}
        </View>
        <Text style={styles.userEmail} numberOfLines={1}>
          {user.email}
        </Text>
        {user.department && (
          <Text style={styles.userDept} numberOfLines={1}>
            {user.department}
          </Text>
        )}
      </View>
      <Feather name="chevron-left" size={16} color={Colors.light.textMuted} />
    </Pressable>
  );
}

const ROLES: { id: string; label: string; icon: keyof typeof Feather.glyphMap; isSuperAdmin: boolean }[] = [
  { id: "user", label: "משתמש רגיל", icon: "user", isSuperAdmin: false },
  { id: "admin", label: "מנהל מערכת", icon: "shield", isSuperAdmin: true },
];

function UserEditForm({
  user,
  onSave,
  isSaving,
}: {
  user: AdminUser;
  onSave: (role: string) => void;
  isSaving: boolean;
}) {
  const currentRole = user.isSuperAdmin ? "admin" : "user";
  const [selectedRole, setSelectedRole] = useState(currentRole);

  const initials = (user.fullName || user.username || "")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.editContainer}>
      <View style={styles.editHeader}>
        <View style={[styles.editAvatar, { backgroundColor: Colors.light.primary }]}>
          <Text style={styles.editAvatarText}>{initials}</Text>
        </View>
        <Text style={styles.editName}>{user.fullNameHe || user.fullName || user.username}</Text>
        <Text style={styles.editEmail}>{user.email}</Text>
      </View>

      <View style={styles.infoCard}>
        {user.department && (
          <EditInfoRow icon="briefcase" label="מחלקה" value={user.department} />
        )}
        {user.jobTitle && (
          <>
            <View style={styles.divider} />
            <EditInfoRow icon="tag" label="תפקיד" value={user.jobTitle} />
          </>
        )}
        {user.phone && (
          <>
            <View style={styles.divider} />
            <EditInfoRow icon="phone" label="טלפון" value={user.phone} />
          </>
        )}
      </View>

      <Text style={styles.roleTitle}>הרשאות</Text>
      <View style={styles.rolesCard}>
        {ROLES.map((role, idx) => (
          <React.Fragment key={role.id}>
            {idx > 0 && <View style={styles.divider} />}
            <Pressable
              style={styles.roleRow}
              onPress={() => setSelectedRole(role.id)}
            >
              <View style={[styles.radioOuter, selectedRole === role.id && styles.radioOuterActive]}>
                {selectedRole === role.id && <View style={styles.radioInner} />}
              </View>
              <Feather
                name={role.icon}
                size={18}
                color={selectedRole === role.id ? Colors.light.primary : Colors.light.textSecondary}
              />
              <Text
                style={[
                  styles.roleLabel,
                  selectedRole === role.id && { color: Colors.light.primary, fontFamily: "Inter_600SemiBold" },
                ]}
              >
                {role.label}
              </Text>
            </Pressable>
          </React.Fragment>
        ))}
      </View>

      <Pressable
        style={[styles.saveRoleBtn, isSaving && { opacity: 0.6 }]}
        onPress={() => onSave(selectedRole)}
        disabled={isSaving || selectedRole === currentRole}
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.saveRoleBtnText}>שמור שינויים</Text>
        )}
      </Pressable>
    </View>
  );
}

function EditInfoRow({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.editInfoRow}>
      <Feather name={icon} size={16} color={Colors.light.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={styles.editInfoLabel}>{label}</Text>
        <Text style={styles.editInfoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surfaceCard,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    flex: 1,
    textAlign: "center",
  },
  userCount: {
    backgroundColor: Colors.light.primary + "15",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  userCountText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.primary,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.light.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  userName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  selfBadge: {
    backgroundColor: Colors.light.info + "18",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  selfBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.light.info,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.light.primary + "12",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  adminBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.light.primary,
  },
  userEmail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "right",
  },
  userDept: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  accessDenied: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  accessDeniedText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  editContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  editHeader: {
    alignItems: "center",
    marginBottom: 24,
    gap: 8,
  },
  editAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  editAvatarText: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  editName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  editEmail: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  infoCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  editInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  editInfoLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  editInfoValue: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginHorizontal: 14,
  },
  roleTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textMuted,
    marginBottom: 8,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rolesCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: {
    borderColor: Colors.light.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.light.primary,
  },
  roleLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
    textAlign: "right",
  },
  saveRoleBtn: {
    backgroundColor: Colors.light.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  saveRoleBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
