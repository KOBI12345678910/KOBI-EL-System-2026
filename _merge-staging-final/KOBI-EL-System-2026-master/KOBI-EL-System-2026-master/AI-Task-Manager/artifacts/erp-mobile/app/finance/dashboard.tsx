import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

const SCREEN_WIDTH = Dimensions.get("window").width;

function fmt(n: number | string | null | undefined): string {
  const num = Number(n || 0);
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function fmtShort(n: number | string | null | undefined): string {
  const num = Number(n || 0);
  if (num >= 1000000) return `₪${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `₪${(num / 1000).toFixed(0)}K`;
  return `₪${num.toFixed(0)}`;
}

export default function FinanceDashboardWrapper() {
  return (
    <AuthGuard>
      <FinanceDashboard />
    </AuthGuard>
  );
}

function FinanceDashboard() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["finance-dashboard"],
    queryFn: api.getFinanceDashboard,
  });

  const ap = data?.accountsPayable || {};
  const ar = data?.accountsReceivable || {};
  const cash = data?.cash || {};
  const recentAR = data?.recentReceivables || [];
  const recentAP = data?.recentPayables || [];
  const monthlyExpenses: any[] = data?.monthlyExpenses || [];
  const bankAccounts: any[] = data?.bankAccounts || [];

  const chartData = buildMonthlyChart(monthlyExpenses, ar);
  const totalIncome = Number(ar.total_amount || 0);
  const totalExpenses = Number(ap.total_amount || 0);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>דשבורד כספים</Text>
        <View style={{ width: 32 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.light.primary}
            />
          }
        >
          <View style={styles.kpiGrid}>
            <KPICard
              label="יתרת מזומן"
              value={fmt(cash.total_cash)}
              icon="credit-card"
              color={Colors.light.primary}
              onPress={() => router.push("/finance/payments")}
            />
            <KPICard
              label="חייבים"
              value={fmt(ar.total_outstanding)}
              icon="trending-up"
              color={Colors.light.success}
              onPress={() => router.push("/finance/invoices?type=receivable")}
            />
            <KPICard
              label="זכאים"
              value={fmt(ap.total_outstanding)}
              icon="trending-down"
              color={Colors.light.warning}
              onPress={() => router.push("/finance/invoices?type=payable")}
            />
            <KPICard
              label="פגויות"
              value={String(Number(ar.overdue_count || 0) + Number(ap.overdue_count || 0))}
              icon="alert-circle"
              color={Colors.light.danger}
              onPress={() => router.push("/finance/payments")}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>הכנסות מול הוצאות</Text>
            <View style={styles.chartCard}>
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.light.success }]} />
                  <Text style={styles.legendText}>הכנסות {fmtShort(totalIncome)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.light.danger }]} />
                  <Text style={styles.legendText}>הוצאות {fmtShort(totalExpenses)}</Text>
                </View>
              </View>

              <View style={styles.compareBar}>
                <View style={styles.compareBarLabel}>
                  <Text style={styles.compareBarText}>הכנסות</Text>
                </View>
                <View style={styles.compareBarTrack}>
                  <View
                    style={[
                      styles.compareBarFill,
                      {
                        width: `${totalIncome > 0 ? 100 : 0}%` as any,
                        backgroundColor: Colors.light.success,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.compareBarValue}>{fmtShort(totalIncome)}</Text>
              </View>

              <View style={styles.compareBar}>
                <View style={styles.compareBarLabel}>
                  <Text style={styles.compareBarText}>הוצאות</Text>
                </View>
                <View style={styles.compareBarTrack}>
                  <View
                    style={[
                      styles.compareBarFill,
                      {
                        width: `${totalIncome > 0 ? Math.min((totalExpenses / totalIncome) * 100, 100) : 0}%` as any,
                        backgroundColor: Colors.light.danger,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.compareBarValue}>{fmtShort(totalExpenses)}</Text>
              </View>

              <View style={styles.netRow}>
                <Text style={styles.netLabel}>רווח נקי</Text>
                <Text style={[
                  styles.netValue,
                  { color: totalIncome - totalExpenses >= 0 ? Colors.light.success : Colors.light.danger },
                ]}>
                  {fmt(totalIncome - totalExpenses)}
                </Text>
              </View>
            </View>
          </View>

          {chartData.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>הוצאות חודשיות</Text>
              <View style={styles.chartCard}>
                <BarChart data={chartData} />
              </View>
            </View>
          )}

          {bankAccounts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>חשבונות בנק</Text>
              {bankAccounts.map((acc: any) => (
                <View key={acc.id} style={styles.bankRow}>
                  <View style={styles.bankIcon}>
                    <Feather name="credit-card" size={18} color={Colors.light.primary} />
                  </View>
                  <View style={styles.bankInfo}>
                    <Text style={styles.bankName}>{acc.bank_name || "בנק"}</Text>
                    <Text style={styles.bankAccount}>{acc.account_number || ""}</Text>
                  </View>
                  <Text style={styles.bankBalance}>{fmt(acc.current_balance)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.quickActions}>
            <Text style={styles.sectionTitle}>פעולות מהירות</Text>
            <View style={styles.actionRow}>
              <QuickAction icon="file-plus" label="חשבונית חדשה" onPress={() => router.push("/finance/invoices")} color="#2D6A4F" />
              <QuickAction icon="dollar-sign" label="גבייה" onPress={() => router.push("/finance/payments")} color="#1A535C" />
              <QuickAction icon="list" label="חשבוניות" onPress={() => router.push("/finance/invoices")} color="#3D405B" />
              <QuickAction icon="alert-circle" label="פגויות" onPress={() => router.push("/finance/payments")} color="#E07A5F" />
            </View>
          </View>

          {recentAR.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>חשבוניות אחרונות</Text>
                <Pressable onPress={() => router.push("/finance/invoices?type=receivable")} hitSlop={8}>
                  <Text style={styles.seeAll}>הכל</Text>
                </Pressable>
              </View>
              {recentAR.slice(0, 5).map((inv: any) => (
                <InvoiceRow key={inv.id} invoice={inv} type="receivable" />
              ))}
            </View>
          )}

          {recentAP.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>חשבוניות ספקים</Text>
                <Pressable onPress={() => router.push("/finance/invoices?type=payable")} hitSlop={8}>
                  <Text style={styles.seeAll}>הכל</Text>
                </Pressable>
              </View>
              {recentAP.slice(0, 5).map((inv: any) => (
                <InvoiceRow key={inv.id} invoice={inv} type="payable" />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function buildMonthlyChart(monthlyExpenses: any[], ar: any): { month: string; value: number }[] {
  const byMonth: Record<string, number> = {};
  for (const row of monthlyExpenses) {
    const m = row.month || "";
    byMonth[m] = (byMonth[m] || 0) + Number(row.total || 0);
  }
  const sorted = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, value]) => ({
      month: month.slice(5),
      value,
    }));
  return sorted;
}

function BarChart({ data }: { data: { month: string; value: number }[] }) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const BAR_HEIGHT = 100;

  return (
    <View style={styles.barChart}>
      {data.map((d, i) => (
        <View key={i} style={styles.barGroup}>
          <Text style={styles.barValue}>{d.value > 0 ? fmtShort(d.value) : ""}</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.bar,
                {
                  height: Math.max((d.value / maxVal) * BAR_HEIGHT, 4),
                  backgroundColor: Colors.light.primary + "CC",
                },
              ]}
            />
          </View>
          <Text style={styles.barLabel}>{d.month}</Text>
        </View>
      ))}
    </View>
  );
}

function KPICard({
  label,
  value,
  icon,
  color,
  onPress,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.kpiCard, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={[styles.kpiIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </Pressable>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  color,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function InvoiceRow({ invoice, type }: { invoice: any; type: "receivable" | "payable" }) {
  const statusColor =
    invoice.status === "overdue" ? Colors.light.danger :
    invoice.status === "paid" ? Colors.light.success :
    invoice.status === "partial" ? Colors.light.warning :
    Colors.light.textMuted;

  const statusLabel: Record<string, string> = {
    paid: "שולם",
    overdue: "פגה",
    partial: "חלקי",
    open: "פתוח",
  };

  const party = type === "receivable"
    ? invoice.customer_name
    : invoice.supplier_name;

  const handlePress = () => {
    router.push({
      pathname: "/finance/invoice-detail",
      params: {
        id: String(invoice.id),
        type,
        invoiceNumber: invoice.invoice_number || `#${invoice.id}`,
        party: party || "",
        amount: String(invoice.amount || 0),
        balanceDue: String(invoice.balance_due || 0),
        status: invoice.status || "",
        dueDate: invoice.due_date || "",
        invoiceDate: invoice.invoice_date || "",
        description: invoice.description || "",
        notes: invoice.notes || "",
      },
    });
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.invoiceRow, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={styles.invoiceInfo}>
        <Text style={styles.invoiceName} numberOfLines={1}>{party || invoice.invoice_number || `#${invoice.id}`}</Text>
        <Text style={styles.invoiceSub}>{invoice.invoice_number || ""}</Text>
      </View>
      <View style={styles.invoiceRight}>
        <Text style={styles.invoiceAmount}>{fmt(invoice.balance_due || invoice.amount)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel[invoice.status] || invoice.status || ""}
          </Text>
        </View>
      </View>
      <Feather name="chevron-left" size={14} color={Colors.light.textMuted} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  topTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
  },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  kpiCard: {
    width: "47%" as any,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    alignItems: "flex-end",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    textAlign: "right",
  },
  kpiLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    textAlign: "right",
  },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 12,
  },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.accent },
  chartCard: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  chartLegend: { flexDirection: "row", gap: 16, marginBottom: 16, justifyContent: "flex-end" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  compareBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  compareBarLabel: { width: 48, alignItems: "flex-end" },
  compareBarText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  compareBarTrack: {
    flex: 1,
    height: 12,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 6,
    overflow: "hidden",
  },
  compareBarFill: {
    height: "100%" as any,
    borderRadius: 6,
  },
  compareBarValue: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.light.text, width: 52 },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  netLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  netValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  barChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    height: 140,
    paddingTop: 20,
  },
  barGroup: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  barValue: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "center",
  },
  barTrack: {
    width: 24,
    height: 100,
    justifyContent: "flex-end",
    backgroundColor: Colors.light.inputBg,
    borderRadius: 6,
    overflow: "hidden",
  },
  bar: {
    width: "100%" as any,
    borderRadius: 6,
  },
  barLabel: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "center",
  },
  bankRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  bankIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.light.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  bankInfo: { flex: 1 },
  bankName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  bankAccount: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  bankBalance: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.light.primary },
  quickActions: { marginBottom: 24 },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
    textAlign: "center",
  },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  invoiceInfo: { flex: 1 },
  invoiceName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  invoiceSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
    marginTop: 2,
  },
  invoiceRight: { alignItems: "flex-end", gap: 4 },
  invoiceAmount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
