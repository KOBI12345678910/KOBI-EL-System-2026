import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import { useBiometric } from "@/contexts/BiometricContext";
import { useNetwork } from "@/contexts/NetworkContext";
import { usePushNotifications } from "@/contexts/NotificationsContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTablet } from "@/hooks/useTablet";
import * as api from "@/lib/api";

export default function ApprovalsScreenWrapper() {
  return (
    <AuthGuard>
      <ApprovalsScreen />
    </AuthGuard>
  );
}

type Colors = ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];

type ApprovalType = "all" | "po" | "invoice" | "leave" | "production";
type StatusFilter = "pending" | "approved" | "rejected" | "all";

interface Approval {
  id: number;
  title?: string;
  description?: string;
  status: string;
  requestedBy?: string;
  createdAt: string;
  amount?: string | number;
  type?: string;
}

interface TabletApprovalsLayoutProps {
  approvals: Approval[];
  allApprovals: Approval[];
  statusFilter: StatusFilter;
  setStatusFilter: (f: StatusFilter) => void;
  typeFilter: ApprovalType;
  setTypeFilter: (f: ApprovalType) => void;
  batchMode: boolean;
  setBatchMode: (v: boolean) => void;
  selectedIds: Set<number>;
  toggleBatchSelect: (id: number) => void;
  handleBatchAction: (action: "approve" | "reject") => void;
  handleAction: (id: number, type: "approve" | "reject") => void;
  getStatusColor: (s: string) => string;
  isLoading: boolean;
  isRefetching: boolean;
  refetch: () => void;
  colors: Colors;
  contentPadding: number;
  insets: { top: number; bottom: number; left: number; right: number };
  pendingCount: number;
  actionType: "approve" | "reject" | null;
  setActionType: (v: "approve" | "reject" | null) => void;
  selectedId: number | null;
  setSelectedId: (v: number | null) => void;
  comments: string;
  setComments: (v: string) => void;
  confirmAction: () => void;
  approveMutation: { isPending: boolean };
  rejectMutation: { isPending: boolean };
  batchAction: "approve" | "reject" | null;
  setBatchAction: (v: "approve" | "reject" | null) => void;
  confirmBatchAction: () => void;
}

const TYPE_LABELS: Record<ApprovalType, string> = {
  all: "הכל",
  po: "הזמנות רכש",
  invoice: "חשבוניות",
  leave: "חופשות",
  production: "פקודות ייצור",
};

const TYPE_ICONS: Record<ApprovalType, keyof typeof Feather.glyphMap> = {
  all: "list",
  po: "shopping-cart",
  invoice: "file-text",
  leave: "calendar",
  production: "tool",
};

function ApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isTablet, contentPadding } = useTablet();
  const queryClient = useQueryClient();
  const { isBiometricEnabled, isBiometricAvailable, authenticateWithBiometric } = useBiometric();
  const { isConnected, addToSyncQueue, registerSyncHandler, getCachedData, setCachedData } = useNetwork();
  const { notifyApprovalPending } = usePushNotifications();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [typeFilter, setTypeFilter] = useState<ApprovalType>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [comments, setComments] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchAction, setBatchAction] = useState<"approve" | "reject" | null>(null);

  const cachedApprovals = getCachedData<unknown[]>(`approvals:${statusFilter}`);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["approvals", statusFilter],
    queryFn: async () => {
      const result = await api.getApprovalRequests({ status: statusFilter !== "all" ? statusFilter : undefined });
      setCachedData(`approvals:${statusFilter}`, result);
      return result;
    },
    initialData: cachedApprovals ?? undefined,
    enabled: isConnected,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, comments }: { id: number; comments?: string }) =>
      api.approveRequest(id, comments),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setSelectedId(null);
      setActionType(null);
      setComments("");
    },
    onError: (err: Error) => Alert.alert("שגיאה", err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comments }: { id: number; comments?: string }) =>
      api.rejectRequest(id, comments),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setSelectedId(null);
      setActionType(null);
      setComments("");
    },
    onError: (err: Error) => Alert.alert("שגיאה", err.message),
  });

  useEffect(() => {
    registerSyncHandler("approval:approve", async (action) => {
      const { id, comments } = action.payload as { id: number; comments?: string };
      await api.approveRequest(id, typeof comments === "string" ? comments : undefined);
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    });
    registerSyncHandler("approval:reject", async (action) => {
      const { id, comments } = action.payload as { id: number; comments?: string };
      await api.rejectRequest(id, typeof comments === "string" ? comments : undefined);
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    });
  }, [registerSyncHandler, queryClient]);

  const lastNotifiedCount = useRef<number | null>(null);
  useEffect(() => {
    if (statusFilter === "pending" && Array.isArray(data) && data.length > 0) {
      if (lastNotifiedCount.current !== data.length) {
        lastNotifiedCount.current = data.length;
        notifyApprovalPending(data.length);
      }
    }
  }, [data, statusFilter, notifyApprovalPending]);

  const allApprovals: Approval[] = Array.isArray(data) ? (data as Approval[]) : [];

  const approvals = allApprovals.filter((item: Approval) => {
    if (typeFilter === "all") return true;
    const title = (item.title || "").toLowerCase();
    const type = (item.type || "").toLowerCase();
    if (typeFilter === "po") return title.includes("רכש") || title.includes("purchase") || type.includes("po") || type.includes("purchase");
    if (typeFilter === "invoice") return title.includes("חשבונית") || title.includes("invoice") || type.includes("invoice");
    if (typeFilter === "leave") return title.includes("חופשה") || title.includes("leave") || type.includes("leave");
    if (typeFilter === "production") return title.includes("ייצור") || title.includes("production") || type.includes("production") || type.includes("work_order");
    return true;
  });

  const handleAction = (id: number, type: "approve" | "reject") => {
    setSelectedId(id);
    setActionType(type);
    setComments("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const confirmAction = async () => {
    if (!selectedId || !actionType) return;

    if (isBiometricAvailable && isBiometricEnabled && Platform.OS !== "web") {
      const authenticated = await authenticateWithBiometric(
        actionType === "approve" ? "אמת את זהותך לאישור הבקשה" : "אמת את זהותך לדחיית הבקשה"
      );
      if (!authenticated) {
        Alert.alert("אימות נדרש", "לא ניתן לבצע פעולה ללא אימות ביומטרי");
        return;
      }
    }

    if (!isConnected) {
      addToSyncQueue({
        type: actionType === "approve" ? "approval:approve" : "approval:reject",
        payload: { id: selectedId, comments: comments || "" },
      });
      Alert.alert("נשמר לסנכרון", "הפעולה תבוצע כאשר החיבור יחזור");
      setSelectedId(null);
      setActionType(null);
      setComments("");
      return;
    }

    if (actionType === "approve") {
      approveMutation.mutate({ id: selectedId, comments: comments || undefined });
    } else {
      rejectMutation.mutate({ id: selectedId, comments: comments || undefined });
    }
  };

  const toggleBatchSelect = useCallback((id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBatchAction = async (action: "approve" | "reject") => {
    if (selectedIds.size === 0) return;

    if (isBiometricAvailable && isBiometricEnabled && Platform.OS !== "web") {
      const authenticated = await authenticateWithBiometric(
        action === "approve"
          ? `אמת את זהותך לאישור ${selectedIds.size} בקשות`
          : `אמת את זהותך לדחיית ${selectedIds.size} בקשות`
      );
      if (!authenticated) {
        Alert.alert("אימות נדרש", "לא ניתן לבצע פעולה ללא אימות ביומטרי");
        return;
      }
    }

    setBatchAction(action);
  };

  const confirmBatchAction = async () => {
    if (!batchAction || selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    let successCount = 0;

    for (const id of ids) {
      try {
        if (!isConnected) {
          addToSyncQueue({
            type: batchAction === "approve" ? "approval:approve" : "approval:reject",
            payload: { id, comments: "" },
          });
          successCount++;
        } else if (batchAction === "approve") {
          await api.approveRequest(id);
          successCount++;
        } else {
          await api.rejectRequest(id);
          successCount++;
        }
      } catch {
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "הושלם",
      isConnected
        ? `${successCount} מתוך ${ids.length} בקשות טופלו בהצלחה`
        : `${successCount} בקשות נשמרו לסנכרון`
    );

    queryClient.invalidateQueries({ queryKey: ["approvals"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    setBatchMode(false);
    setSelectedIds(new Set());
    setBatchAction(null);
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case "pending": return colors.warning;
      case "approved": return colors.success;
      case "rejected": return colors.danger;
      default: return colors.textMuted;
    }
  };

  const pendingCount = allApprovals.filter((a: Approval) => a.status === "pending").length;

  if (isTablet) {
    return (
      <TabletApprovalsLayout
        approvals={approvals}
        allApprovals={allApprovals}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        batchMode={batchMode}
        setBatchMode={setBatchMode}
        selectedIds={selectedIds}
        toggleBatchSelect={toggleBatchSelect}
        handleBatchAction={handleBatchAction}
        handleAction={handleAction}
        getStatusColor={getStatusColor}
        isLoading={isLoading}
        isRefetching={isRefetching}
        refetch={refetch}
        colors={colors}
        contentPadding={contentPadding}
        insets={insets}
        pendingCount={pendingCount}
        actionType={actionType}
        setActionType={setActionType}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        comments={comments}
        setComments={setComments}
        confirmAction={confirmAction}
        approveMutation={approveMutation}
        rejectMutation={rejectMutation}
        batchAction={batchAction}
        setBatchAction={setBatchAction}
        confirmBatchAction={confirmBatchAction}
      />
    );
  }

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[styles.topTitle, { color: colors.text }]}>אישורים</Text>
          {pendingCount > 0 && (
            <View style={[styles.pendingBadge, { backgroundColor: colors.warning }]}>
              <Text style={styles.pendingBadgeText}>{pendingCount} ממתינים</Text>
            </View>
          )}
        </View>
        <Pressable
          style={[
            styles.batchBtn,
            { backgroundColor: batchMode ? colors.primary : colors.surfaceCard, borderColor: colors.border },
          ]}
          onPress={() => {
            setBatchMode(!batchMode);
            setSelectedIds(new Set());
          }}
        >
          <Feather name="check-square" size={18} color={batchMode ? "#fff" : colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeFilterScroll} contentContainerStyle={styles.typeFilterContent}>
        {(Object.keys(TYPE_LABELS) as ApprovalType[]).map((t) => (
          <Pressable
            key={t}
            style={[
              styles.typeChip,
              { backgroundColor: typeFilter === t ? colors.primary : colors.surfaceCard, borderColor: typeFilter === t ? colors.primary : colors.border },
            ]}
            onPress={() => setTypeFilter(t)}
          >
            <Feather name={TYPE_ICONS[t]} size={13} color={typeFilter === t ? "#fff" : colors.textSecondary} />
            <Text style={[styles.typeChipText, { color: typeFilter === t ? "#fff" : colors.textSecondary }]}>
              {TYPE_LABELS[t]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.filterRow}>
        {(["pending", "approved", "rejected", "all"] as StatusFilter[]).map((f) => (
          <FilterChip
            key={f}
            label={getFilterLabel(f)}
            active={statusFilter === f}
            onPress={() => setStatusFilter(f)}
            colors={colors}
          />
        ))}
      </View>

      {batchMode && selectedIds.size > 0 && (
        <View style={[styles.batchActions, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <Text style={[styles.batchCount, { color: colors.text }]}>{selectedIds.size} נבחרו</Text>
          <View style={styles.batchBtns}>
            <Pressable
              style={[styles.batchRejectBtn, { borderColor: colors.danger + "50", backgroundColor: colors.danger + "10" }]}
              onPress={() => handleBatchAction("reject")}
            >
              <Feather name="x" size={15} color={colors.danger} />
              <Text style={[styles.batchBtnText, { color: colors.danger }]}>דחה הכל</Text>
            </Pressable>
            <Pressable
              style={[styles.batchApproveBtn, { backgroundColor: colors.success }]}
              onPress={() => handleBatchAction("approve")}
            >
              <Feather name="check" size={15} color="#fff" />
              <Text style={[styles.batchBtnText, { color: "#fff" }]}>אשר הכל</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={approvals}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ApprovalCard
              approval={item}
              onApprove={() => handleAction(item.id, "approve")}
              onReject={() => handleAction(item.id, "reject")}
              colors={colors}
              getStatusColor={getStatusColor}
              batchMode={batchMode}
              isSelected={selectedIds.has(item.id)}
              onToggleSelect={() => toggleBatchSelect(item.id)}
              isTablet={false}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="check-circle" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>אין בקשות אישור</Text>
            </View>
          }
        />
      )}

      <ActionModal
        actionType={actionType}
        comments={comments}
        setComments={setComments}
        onCancel={() => { setActionType(null); setSelectedId(null); }}
        onConfirm={confirmAction}
        isPending={approveMutation.isPending || rejectMutation.isPending}
        colors={colors}
      />

      <BatchConfirmModal
        batchAction={batchAction}
        count={selectedIds.size}
        onCancel={() => setBatchAction(null)}
        onConfirm={confirmBatchAction}
        colors={colors}
      />
    </View>
  );
}

function TabletApprovalsLayout({
  approvals, allApprovals, statusFilter, setStatusFilter, typeFilter, setTypeFilter,
  batchMode, setBatchMode, selectedIds, toggleBatchSelect, handleBatchAction,
  handleAction, getStatusColor, isLoading, isRefetching, refetch, colors, contentPadding,
  insets, pendingCount, actionType, setActionType, selectedId, setSelectedId,
  comments, setComments, confirmAction, approveMutation, rejectMutation,
  batchAction, setBatchAction, confirmBatchAction,
}: TabletApprovalsLayoutProps) {
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background, flexDirection: "row" }, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={[styles.tabletSidebar, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <View style={styles.tabletSidebarHeader}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Feather name="chevron-right" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.topTitle, { color: colors.text, flex: 1, textAlign: "center" }]}>אישורים</Text>
          <Pressable
            style={[
              styles.batchBtn,
              { backgroundColor: batchMode ? colors.primary : colors.surface, borderColor: colors.border },
            ]}
            onPress={() => { setBatchMode(!batchMode); }}
          >
            <Feather name="check-square" size={16} color={batchMode ? "#fff" : colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12 }}>
            {(Object.keys(TYPE_LABELS) as ApprovalType[]).map((t) => (
              <Pressable
                key={t}
                style={[
                  styles.typeChip,
                  { backgroundColor: typeFilter === t ? colors.primary : colors.background, borderColor: typeFilter === t ? colors.primary : colors.border },
                ]}
                onPress={() => setTypeFilter(t)}
              >
                <Feather name={TYPE_ICONS[t]} size={12} color={typeFilter === t ? "#fff" : colors.textSecondary} />
                <Text style={[styles.typeChipText, { color: typeFilter === t ? "#fff" : colors.textSecondary, fontSize: 12 }]}>
                  {TYPE_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={[styles.filterRow, { paddingHorizontal: 12 }]}>
          {(["pending", "approved", "rejected", "all"] as StatusFilter[]).map((f) => (
            <FilterChip key={f} label={getFilterLabel(f)} active={statusFilter === f} onPress={() => setStatusFilter(f)} colors={colors} />
          ))}
        </View>

        {batchMode && selectedIds.size > 0 && (
          <View style={[styles.batchActions, { backgroundColor: colors.background, borderColor: colors.border, marginHorizontal: 12 }]}>
            <Text style={[styles.batchCount, { color: colors.text }]}>{selectedIds.size} נבחרו</Text>
            <View style={styles.batchBtns}>
              <Pressable style={[styles.batchRejectBtn, { borderColor: colors.danger + "50", backgroundColor: colors.danger + "10" }]} onPress={() => handleBatchAction("reject")}>
                <Feather name="x" size={13} color={colors.danger} />
                <Text style={[styles.batchBtnText, { color: colors.danger }]}>דחה</Text>
              </Pressable>
              <Pressable style={[styles.batchApproveBtn, { backgroundColor: colors.success }]} onPress={() => handleBatchAction("approve")}>
                <Feather name="check" size={13} color="#fff" />
                <Text style={[styles.batchBtnText, { color: "#fff" }]}>אשר</Text>
              </Pressable>
            </View>
          </View>
        )}

        {isLoading ? (
          <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
            data={approvals}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <Pressable onPress={() => setSelectedApproval(item)}>
                <ApprovalCard
                  approval={item}
                  onApprove={() => handleAction(item.id, "approve")}
                  onReject={() => handleAction(item.id, "reject")}
                  colors={colors}
                  getStatusColor={getStatusColor}
                  batchMode={batchMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleBatchSelect(item.id)}
                  isTablet
                  isHighlighted={selectedApproval?.id === item.id}
                />
              </Pressable>
            )}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40, gap: 8 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Feather name="check-circle" size={36} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>אין בקשות</Text>
              </View>
            }
          />
        )}
      </View>

      <View style={[styles.tabletDetail, { backgroundColor: colors.background }]}>
        {selectedApproval ? (
          <ApprovalDetailPane
            approval={selectedApproval}
            colors={colors}
            getStatusColor={getStatusColor}
            onApprove={() => handleAction(selectedApproval.id, "approve")}
            onReject={() => handleAction(selectedApproval.id, "reject")}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Feather name="check-circle" size={64} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted, marginTop: 16 }]}>בחר בקשה לצפייה</Text>
          </View>
        )}
      </View>

      <ActionModal actionType={actionType} comments={comments} setComments={setComments}
        onCancel={() => { setActionType(null); setSelectedId(null); }} onConfirm={confirmAction}
        isPending={approveMutation.isPending || rejectMutation.isPending} colors={colors} />

      <BatchConfirmModal batchAction={batchAction} count={selectedIds.size}
        onCancel={() => setBatchAction(null)} onConfirm={confirmBatchAction} colors={colors} />
    </View>
  );
}

interface ApprovalDetailPaneProps {
  approval: Approval;
  colors: Colors;
  getStatusColor: (s: string) => string;
  onApprove: () => void;
  onReject: () => void;
}

function ApprovalDetailPane({ approval, colors, getStatusColor, onApprove, onReject }: ApprovalDetailPaneProps) {
  const isPending = approval.status === "pending";
  const statusColor = getStatusColor(approval.status);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 32, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={[styles.approvalStatusBadge, { backgroundColor: statusColor + "15" }]}>
          <Text style={[styles.approvalStatusText, { color: statusColor }]}>{getStatusLabel(approval.status)}</Text>
        </View>
        <Text style={[styles.approvalId, { color: colors.textMuted, fontSize: 15 }]}>#{approval.id}</Text>
      </View>

      {approval.title && (
        <Text style={[{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "right" }]}>
          {approval.title}
        </Text>
      )}

      {approval.description && (
        <Text style={[{ fontSize: 16, fontFamily: "Inter_400Regular", color: colors.textSecondary, textAlign: "right", lineHeight: 24 }]}>
          {approval.description}
        </Text>
      )}

      <View style={[{ backgroundColor: colors.surfaceCard, borderRadius: 16, padding: 20, gap: 12, borderWidth: 1, borderColor: colors.border }]}>
        {approval.requestedBy && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="user" size={16} color={colors.textMuted} />
            <Text style={[{ fontSize: 15, color: colors.text, fontFamily: "Inter_500Medium" }]}>{approval.requestedBy}</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="clock" size={16} color={colors.textMuted} />
          <Text style={[{ fontSize: 15, color: colors.textSecondary, fontFamily: "Inter_400Regular" }]}>
            {new Date(approval.createdAt).toLocaleDateString("he-IL")}
          </Text>
        </View>
        {approval.amount && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="dollar-sign" size={16} color={colors.textMuted} />
            <Text style={[{ fontSize: 15, color: colors.text, fontFamily: "Inter_600SemiBold" }]}>
              ₪{Number(approval.amount).toLocaleString("he-IL")}
            </Text>
          </View>
        )}
      </View>

      {isPending && (
        <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
          <Pressable
            style={({ pressed }) => [styles.rejectBtn, { flex: 1, borderColor: colors.danger + "40", backgroundColor: colors.danger + "08", paddingVertical: 18 }, pressed && { opacity: 0.8 }]}
            onPress={onReject}
          >
            <Feather name="x" size={20} color={colors.danger} />
            <Text style={[styles.rejectBtnText, { color: colors.danger, fontSize: 16 }]}>דחה</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.approveBtn, { flex: 1, backgroundColor: colors.success, paddingVertical: 18 }, pressed && { opacity: 0.9 }]}
            onPress={onApprove}
          >
            <Feather name="check" size={20} color="#fff" />
            <Text style={[styles.approveBtnText, { fontSize: 16 }]}>אשר</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function ActionModal({ actionType, comments, setComments, onCancel, onConfirm, isPending, colors }: {
  actionType: "approve" | "reject" | null;
  comments: string;
  setComments: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
  colors: Colors;
}) {
  return (
    <Modal visible={!!actionType} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surfaceCard }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {actionType === "approve" ? "אישור בקשה" : "דחיית בקשה"}
          </Text>
          <TextInput
            style={[styles.commentInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
            value={comments}
            onChangeText={setComments}
            placeholder="הערות (אופציונלי)..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlign="right"
          />
          <View style={styles.modalBtns}>
            <Pressable style={({ pressed }) => [styles.modalCancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.8 }]} onPress={onCancel}>
              <Text style={[styles.modalCancelText, { color: colors.text }]}>ביטול</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalConfirmBtn, { backgroundColor: actionType === "reject" ? colors.danger : colors.success }, pressed && { opacity: 0.9 }]}
              onPress={onConfirm}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalConfirmText}>{actionType === "approve" ? "אשר" : "דחה"}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BatchConfirmModal({ batchAction, count, onCancel, onConfirm, colors }: {
  batchAction: "approve" | "reject" | null;
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
  colors: Colors;
}) {
  return (
    <Modal visible={!!batchAction} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surfaceCard }]}>
          <View style={[styles.batchModalIcon, { backgroundColor: batchAction === "approve" ? colors.success + "15" : colors.danger + "15" }]}>
            <Feather
              name={batchAction === "approve" ? "check-circle" : "x-circle"}
              size={32}
              color={batchAction === "approve" ? colors.success : colors.danger}
            />
          </View>
          <Text style={[styles.modalTitle, { color: colors.text, marginTop: 12 }]}>
            {batchAction === "approve" ? `אישור ${count} בקשות` : `דחיית ${count} בקשות`}
          </Text>
          <Text style={[styles.batchModalDesc, { color: colors.textSecondary }]}>
            {batchAction === "approve"
              ? `האם אתה בטוח שברצונך לאשר את כל ${count} הבקשות הנבחרות?`
              : `האם אתה בטוח שברצונך לדחות את כל ${count} הבקשות הנבחרות?`}
          </Text>
          <View style={styles.modalBtns}>
            <Pressable style={({ pressed }) => [styles.modalCancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.8 }]} onPress={onCancel}>
              <Text style={[styles.modalCancelText, { color: colors.text }]}>ביטול</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalConfirmBtn, { backgroundColor: batchAction === "reject" ? colors.danger : colors.success }, pressed && { opacity: 0.9 }]}
              onPress={onConfirm}
            >
              <Text style={styles.modalConfirmText}>{batchAction === "approve" ? "אשר הכל" : "דחה הכל"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterChip({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: Colors }) {
  return (
    <Pressable
      style={[
        styles.chip,
        { backgroundColor: colors.surfaceCard, borderColor: colors.border },
        active && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color: colors.textSecondary }, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

interface ApprovalCardProps {
  approval: Approval;
  onApprove: () => void;
  onReject: () => void;
  colors: Colors;
  getStatusColor: (s: string) => string;
  batchMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  isTablet: boolean;
  isHighlighted?: boolean;
}

function ApprovalCard({
  approval,
  onApprove,
  onReject,
  colors,
  getStatusColor,
  batchMode,
  isSelected,
  onToggleSelect,
  isTablet,
  isHighlighted,
}: ApprovalCardProps) {
  const isPending = approval.status === "pending";
  const statusColor = getStatusColor(approval.status);

  return (
    <Pressable
      style={[
        styles.approvalCard,
        isTablet && styles.approvalCardTablet,
        { backgroundColor: colors.surfaceCard },
        isHighlighted && { borderWidth: 2, borderColor: colors.primary },
        isSelected && { borderWidth: 2, borderColor: colors.info },
      ]}
      onPress={batchMode && isPending ? onToggleSelect : undefined}
      onLongPress={() => { if (isPending) onToggleSelect(); }}
    >
      <View style={styles.approvalHeader}>
        <View style={styles.approvalHeaderLeft}>
          {batchMode && isPending && (
            <View style={[
              styles.checkBox,
              { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : "transparent" },
            ]}>
              {isSelected && <Feather name="check" size={12} color="#fff" />}
            </View>
          )}
          <View style={[styles.approvalStatusBadge, { backgroundColor: statusColor + "15" }]}>
            <Text style={[styles.approvalStatusText, { color: statusColor }]}>
              {getStatusLabel(approval.status)}
            </Text>
          </View>
        </View>
        <Text style={[styles.approvalId, { color: colors.textMuted }]}>#{approval.id}</Text>
      </View>

      {approval.title && (
        <Text style={[styles.approvalTitle, { color: colors.text, fontSize: isTablet ? 15 : 16 }]} numberOfLines={isTablet ? 1 : 2}>
          {approval.title}
        </Text>
      )}

      {!isTablet && approval.description && (
        <Text style={[styles.approvalDesc, { color: colors.textSecondary }]} numberOfLines={3}>
          {approval.description}
        </Text>
      )}

      <View style={styles.approvalMeta}>
        {approval.requestedBy && (
          <View style={styles.metaItem}>
            <Feather name="user" size={12} color={colors.textMuted} />
            <Text style={[styles.metaText, { color: colors.textMuted }]}>{approval.requestedBy}</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Feather name="clock" size={12} color={colors.textMuted} />
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            {new Date(approval.createdAt).toLocaleDateString("he-IL")}
          </Text>
        </View>
      </View>

      {isPending && !batchMode && (
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.rejectBtn, { borderColor: colors.danger + "40", backgroundColor: colors.danger + "08" }, pressed && { opacity: 0.8 }]}
            onPress={onReject}
          >
            <Feather name="x" size={16} color={colors.danger} />
            <Text style={[styles.rejectBtnText, { color: colors.danger }]}>דחה</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.approveBtn, { backgroundColor: colors.success }, pressed && { opacity: 0.9 }]}
            onPress={onApprove}
          >
            <Feather name="check" size={16} color="#fff" />
            <Text style={styles.approveBtnText}>אשר</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

function getFilterLabel(f: string): string {
  switch (f) {
    case "pending": return "ממתין";
    case "approved": return "אושר";
    case "rejected": return "נדחה";
    case "all": return "הכל";
    default: return f;
  }
}

function getStatusLabel(s: string): string {
  switch (s) {
    case "pending": return "ממתין";
    case "approved": return "אושר";
    case "rejected": return "נדחה";
    default: return s;
  }
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 2,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  batchBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  typeFilterScroll: {
    flexGrow: 0,
    marginBottom: 4,
  },
  typeFilterContent: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  batchActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  batchCount: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  batchBtns: {
    flexDirection: "row",
    gap: 8,
  },
  batchRejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  batchApproveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  batchBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  approvalCard: {
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  approvalCardTablet: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  approvalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  approvalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  approvalStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  approvalStatusText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  approvalId: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  approvalTitle: {
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  approvalDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 20,
  },
  approvalMeta: {
    flexDirection: "row",
    gap: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  rejectBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  approveBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  batchModalIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  batchModalDesc: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  commentInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minHeight: 80,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlignVertical: "top",
  },
  modalBtns: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  modalConfirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  tabletSidebar: {
    width: 340,
    borderRightWidth: 1,
    paddingTop: 12,
  },
  tabletSidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  tabletDetail: {
    flex: 1,
  },
});
