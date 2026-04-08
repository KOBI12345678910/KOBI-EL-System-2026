import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

interface ReportDefinition {
  id: string;
  nameHe: string;
  category: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

const REPORT_CATEGORIES = [
  { id: "all", label: "הכל", icon: "grid" as keyof typeof Feather.glyphMap },
  { id: "finance", label: "כספים", icon: "dollar-sign" as keyof typeof Feather.glyphMap },
  { id: "sales", label: "מכירות", icon: "trending-up" as keyof typeof Feather.glyphMap },
  { id: "production", label: "תפעול", icon: "tool" as keyof typeof Feather.glyphMap },
];

const AVAILABLE_REPORTS: ReportDefinition[] = [
  { id: "hub", nameHe: "מרכז דוחות", category: "all", icon: "layers", color: "#6366F1" },
  { id: "financial", nameHe: "דוח פיננסי מקיף", category: "finance", icon: "dollar-sign", color: "#10B981" },
  { id: "risks", nameHe: "ניתוח סיכונים", category: "finance", icon: "alert-triangle", color: "#EF4444" },
  { id: "kpis", nameHe: "מדדי ביצוע (KPI)", category: "finance", icon: "activity", color: "#8B5CF6" },
  { id: "cross-module-summary", nameHe: "סיכום כלל-מערכתי", category: "all", icon: "grid", color: "#3B82F6" },
  { id: "funnel", nameHe: "משפך מכירות", category: "sales", icon: "trending-up", color: "#059669" },
  { id: "operational", nameHe: "דוח תפעולי", category: "production", icon: "tool", color: "#D97706" },
  { id: "executive-dashboard", nameHe: "לוח מנהלים", category: "all", icon: "briefcase", color: "#7C3AED" },
];

export default function ReportsScreenWrapper() {
  return (
    <AuthGuard>
      <ReportsScreen />
    </AuthGuard>
  );
}

function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(null);
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("year");

  const filteredReports =
    selectedCategory === "all"
      ? AVAILABLE_REPORTS
      : AVAILABLE_REPORTS.filter((r) => r.category === selectedCategory);

  if (selectedReport) {
    return (
      <ReportDetailScreen
        report={selectedReport}
        period={period}
        onPeriodChange={setPeriod}
        onBack={() => setSelectedReport(null)}
        insets={insets}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>דוחות</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryBar}
        contentContainerStyle={styles.categoryBarContent}
      >
        {REPORT_CATEGORIES.map((cat) => (
          <Pressable
            key={cat.id}
            style={[styles.categoryChip, selectedCategory === cat.id && styles.categoryChipActive]}
            onPress={() => setSelectedCategory(cat.id)}
          >
            <Feather
              name={cat.icon}
              size={14}
              color={selectedCategory === cat.id ? "#fff" : Colors.light.textSecondary}
            />
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === cat.id && styles.categoryChipTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList<ReportDefinition>
        data={filteredReports}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ReportCard report={item} onPress={() => setSelectedReport(item)} />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="bar-chart-2" size={48} color={Colors.light.textMuted} />
            <Text style={styles.emptyText}>אין דוחות זמינים</Text>
          </View>
        }
      />
    </View>
  );
}

function ReportDetailScreen({
  report,
  period,
  onPeriodChange,
  onBack,
  insets,
}: {
  report: ReportDefinition;
  period: "month" | "quarter" | "year";
  onPeriodChange: (p: "month" | "quarter" | "year") => void;
  onBack: () => void;
  insets: ReturnType<typeof import("react-native-safe-area-context").useSafeAreaInsets>;
}) {
  const { data: reportData, isLoading, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ["report-data", report.id, period],
    queryFn: () => api.getReportData(report.id, { period }),
  });

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.iconBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {report.nameHe}
        </Text>
        <View style={styles.periodSelector}>
          {(["month", "quarter", "year"] as const).map((p) => (
            <Pressable
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => onPeriodChange(p)}
            >
              <Text
                style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}
              >
                {p === "month" ? "חודש" : p === "quarter" ? "רבעון" : "שנה"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>טוען דוח...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.reportContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={Colors.light.primary}
            />
          }
        >
          <ReportContent report={report} data={reportData ?? null} />
        </ScrollView>
      )}
    </View>
  );
}

function ReportCard({ report, onPress }: { report: ReportDefinition; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.reportCard, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View style={[styles.reportIconWrap, { backgroundColor: report.color + "18" }]}>
        <Feather name={report.icon} size={24} color={report.color} />
      </View>
      <Text style={styles.reportName} numberOfLines={2}>
        {report.nameHe}
      </Text>
      <View style={styles.reportFooter}>
        <Feather name="chevron-left" size={14} color={Colors.light.textMuted} />
        <Text style={styles.viewText}>צפה</Text>
      </View>
    </Pressable>
  );
}

function ReportContent({ report, data }: { report: ReportDefinition; data: Record<string, unknown> | null }) {
  if (!data) {
    return (
      <View style={styles.noDataContainer}>
        <Feather name="bar-chart-2" size={48} color={Colors.light.textMuted} />
        <Text style={styles.noDataText}>לא ניתן לטעון את הדוח</Text>
        <Text style={styles.noDataSubtext}>ייתכן שאין מספיק נתונים</Text>
      </View>
    );
  }

  const scalarEntries = Object.entries(data).filter(
    ([k, v]) => k !== "periodLabel" && k !== "startDate" && k !== "endDate" && typeof v !== "object"
  ) as [string, string | number | boolean][];

  const arrayEntries = Object.entries(data).filter(
    ([, v]) => Array.isArray(v)
  ) as [string, Record<string, unknown>[]][];

  const objectEntries = Object.entries(data).filter(
    ([, v]) => v !== null && typeof v === "object" && !Array.isArray(v)
  ) as [string, Record<string, unknown>][];

  return (
    <View style={styles.reportDataContainer}>
      {typeof data.periodLabel === "string" && (
        <View style={styles.periodBadge}>
          <Feather name="calendar" size={14} color={Colors.light.primary} />
          <Text style={styles.periodBadgeText}>{data.periodLabel}</Text>
        </View>
      )}

      {scalarEntries.length > 0 && (
        <View style={styles.dataGrid}>
          {scalarEntries.map(([key, value]) => (
            <View key={key} style={styles.dataCell}>
              <Text style={styles.dataCellValue}>
                {typeof value === "number" ? value.toLocaleString("he-IL") : String(value)}
              </Text>
              <Text style={styles.dataCellLabel}>{formatKey(key)}</Text>
            </View>
          ))}
        </View>
      )}

      {objectEntries.map(([key, obj]) => {
        const objScalars = Object.entries(obj).filter(
          ([, v]) => typeof v !== "object"
        ) as [string, string | number][];
        if (objScalars.length === 0) return null;
        return (
          <View key={key} style={styles.tableContainer}>
            <Text style={styles.tableTitle}>{formatKey(key)}</Text>
            <View style={styles.dataGrid}>
              {objScalars.map(([k, v]) => (
                <View key={k} style={styles.dataCell}>
                  <Text style={styles.dataCellValue}>
                    {typeof v === "number" ? v.toLocaleString("he-IL") : String(v)}
                  </Text>
                  <Text style={styles.dataCellLabel}>{formatKey(k)}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {arrayEntries.map(([key, arr]) => (
        <View key={key} style={styles.tableContainer}>
          <Text style={styles.tableTitle}>{formatKey(key)}</Text>
          {arr.slice(0, 10).map((row, idx) => (
            <View key={idx} style={styles.tableRow}>
              {Object.entries(row)
                .filter(([, v]) => typeof v !== "object")
                .slice(0, 3)
                .map(([k, v]) => (
                  <View key={k} style={styles.tableCell}>
                    <Text style={styles.tableCellLabel}>{formatKey(k)}</Text>
                    <Text style={styles.tableCellValue} numberOfLines={1}>
                      {String(v)}
                    </Text>
                  </View>
                ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function formatKey(key: string): string {
  const map: Record<string, string> = {
    totalRevenue: "סה\"כ הכנסות",
    totalExpenses: "סה\"כ הוצאות",
    netProfit: "רווח נקי",
    totalOrders: "סה\"כ הזמנות",
    pendingOrders: "הזמנות פתוחות",
    totalSuppliers: "ספקים",
    totalEmployees: "עובדים",
    totalPayroll: "סה\"כ שכר",
    totalItems: "פריטים",
    lowStockItems: "מלאי נמוך",
    outstandingAP: "חוב ספקים",
    outstandingAR: "חוב לקוחות",
    cashBalance: "יתרת מזומן",
    invoices: "חשבוניות",
    expenses: "הוצאות",
    customers: "לקוחות",
    employees: "עובדים",
    openTasks: "משימות פתוחות",
    recentActivity: "פעילות אחרונה",
    stats: "נתונים",
    count: "סה\"כ",
    income: "הכנסות",
    name: "שם",
    value: "ערך",
    month: "חודש",
  };
  return map[key] || key.replace(/([A-Z])/g, " $1").trim();
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
  periodSelector: {
    flexDirection: "row",
    gap: 4,
  },
  periodBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.light.inputBg,
  },
  periodBtnActive: {
    backgroundColor: Colors.light.primary,
  },
  periodBtnText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  periodBtnTextActive: {
    color: "#fff",
  },
  categoryBar: {
    backgroundColor: Colors.light.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    maxHeight: 52,
  },
  categoryBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.light.inputBg,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  categoryChipActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  categoryChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  categoryChipTextActive: {
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  reportCard: {
    width: "48%" as const,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  reportIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  reportName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    lineHeight: 20,
  },
  reportFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  viewText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textMuted,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  reportContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  noDataContainer: {
    paddingTop: 80,
    alignItems: "center",
    gap: 12,
  },
  noDataText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
  noDataSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  reportDataContainer: {
    gap: 16,
  },
  periodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.light.primary + "10",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "flex-end",
  },
  periodBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.primary,
  },
  dataGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  dataCell: {
    width: "47%" as const,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 16,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  dataCellValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    textAlign: "right",
  },
  dataCellLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  tableContainer: {
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  tableTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingTop: 8,
    gap: 8,
  },
  tableCell: {
    flex: 1,
  },
  tableCellLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  tableCellValue: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
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
});
