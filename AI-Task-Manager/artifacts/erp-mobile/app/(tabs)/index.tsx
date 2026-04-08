import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MiniBarChart } from "@/components/MiniBarChart";
import { SparklineChart } from "@/components/SparklineChart";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useNetwork } from "@/contexts/NetworkContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTablet } from "@/hooks/useTablet";
import * as api from "@/lib/api";

const MODULE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  crm: "users",
  hr: "briefcase",
  finance: "dollar-sign",
  procurement: "shopping-cart",
  inventory: "package",
  production: "tool",
  maintenance: "settings",
  projects: "clipboard",
  logistics: "truck",
  default: "layers",
};

function getModuleIcon(slug: string): keyof typeof Feather.glyphMap {
  const lower = (slug || "").toLowerCase();
  for (const [key, icon] of Object.entries(MODULE_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return MODULE_ICONS.default;
}

const MODULE_COLORS = [
  "#1B4332", "#2D6A4F", "#40916C", "#52B788",
  "#1A535C", "#4ECDC4", "#3D405B", "#E07A5F",
];

const CHART_MONTHS = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני"];

function generateChartData(base: number) {
  return CHART_MONTHS.map((label, i) => ({
    label,
    value: Math.max(1, base + Math.floor(Math.sin(i * 0.8) * base * 0.3) + i * Math.floor(base * 0.1)),
  }));
}

function generateSparkline(base: number, length = 8): number[] {
  return Array.from({ length }, (_, i) =>
    Math.max(1, base + Math.floor(Math.sin(i * 0.9) * base * 0.4) + i * Math.floor(base * 0.05))
  );
}

interface KPIGroup {
  title: string;
  cards: {
    icon: keyof typeof Feather.glyphMap;
    label: string;
    value: string;
    color: string;
    trend: number[];
    trendUp: boolean;
    trendPct: string;
    onPress: () => void;
  }[];
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isConnected, syncQueue, isSyncing, getCachedData, setCachedData } = useNetwork();
  const { colors } = useTheme();
  const { isTablet, contentPadding, numColumns } = useTablet();
  const [searchVisible, setSearchVisible] = useState(false);
  const [kpiPage, setKpiPage] = useState(0);
  const kpiFlatRef = useRef<FlatList>(null);

  const cachedStats = getCachedData<unknown>("dashboard-stats");

  const { data: stats, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const result = await api.getDashboardStats();
      setCachedData("dashboard-stats", result);
      return result;
    },
    initialData: cachedStats as Awaited<ReturnType<typeof api.getDashboardStats>> ?? undefined,
    enabled: isConnected,
  });

  const greeting = getGreeting();
  const displayName = user?.fullNameHe || user?.fullName || user?.username || "";

  const chartData = generateChartData(stats?.pendingApprovals || 5);

  const screenWidth = Dimensions.get("window").width;
  const kpiCardWidth = isTablet ? (screenWidth - contentPadding * 2 - 12 * 2) / 3 : screenWidth - contentPadding * 2 - 32;

  const kpiGroups: KPIGroup[] = [
    {
      title: "סקירה כללית",
      cards: [
        {
          icon: "layers",
          label: "מודולים",
          value: String(stats?.totalModules || 0),
          color: colors.primary,
          trend: generateSparkline(stats?.totalModules || 8),
          trendUp: true,
          trendPct: "+2%",
          onPress: () => router.push("/(tabs)/modules"),
        },
        {
          icon: "check-circle",
          label: "ממתין לאישור",
          value: String(stats?.pendingApprovals || 0),
          color: colors.warning,
          trend: generateSparkline(stats?.pendingApprovals || 5),
          trendUp: false,
          trendPct: "+3",
          onPress: () => router.push("/approvals"),
        },
        {
          icon: "bell",
          label: "התראות חדשות",
          value: String(stats?.unreadNotifications || 0),
          color: colors.info,
          trend: generateSparkline(stats?.unreadNotifications || 4),
          trendUp: false,
          trendPct: "+1",
          onPress: () => router.push("/(tabs)/notifications"),
        },
      ],
    },
    {
      title: "כספים",
      cards: [
        {
          icon: "dollar-sign",
          label: "הכנסות",
          value: "₪2.4M",
          color: "#40916C",
          trend: [120, 145, 132, 178, 165, 190, 185, 210],
          trendUp: true,
          trendPct: "+12%",
          onPress: () => router.push("/finance/dashboard"),
        },
        {
          icon: "file-text",
          label: "חשבוניות פתוחות",
          value: "28",
          color: "#E07A5F",
          trend: [30, 25, 28, 32, 26, 29, 27, 28],
          trendUp: false,
          trendPct: "-4%",
          onPress: () => router.push("/finance/invoices"),
        },
        {
          icon: "credit-card",
          label: "גבייה",
          value: "₪186K",
          color: "#1A535C",
          trend: [100, 120, 115, 140, 135, 160, 170, 186],
          trendUp: true,
          trendPct: "+9%",
          onPress: () => router.push("/finance/payments"),
        },
      ],
    },
    {
      title: "ייצור ומלאי",
      cards: [
        {
          icon: "tool",
          label: "פקודות עבודה",
          value: "14",
          color: "#2D6A4F",
          trend: [8, 10, 12, 9, 11, 13, 12, 14],
          trendUp: true,
          trendPct: "+7%",
          onPress: () => router.push("/production/work-orders"),
        },
        {
          icon: "package",
          label: "מלאי נמוך",
          value: "6",
          color: colors.warning,
          trend: [4, 5, 3, 6, 5, 7, 6, 6],
          trendUp: false,
          trendPct: "+2",
          onPress: () => router.push("/procurement/raw-materials"),
        },
        {
          icon: "users",
          label: "עובדים פעילים",
          value: "42",
          color: "#7B5EA7",
          trend: [38, 39, 40, 38, 41, 42, 41, 42],
          trendUp: true,
          trendPct: "+1",
          onPress: () => router.push("/hr"),
        },
      ],
    },
  ];

  const renderKPIPage = ({ item: group }: { item: KPIGroup }) => (
    <View style={{ width: isTablet ? undefined : screenWidth - contentPadding * 2, paddingRight: isTablet ? 0 : 0 }}>
      <View style={isTablet ? styles.kpiRowTablet : styles.kpiRowPhone}>
        {group.cards.map((card, idx) => (
          <SwipeableKPICard
            key={idx}
            icon={card.icon}
            label={card.label}
            value={card.value}
            color={card.color}
            colors={colors}
            trend={card.trend}
            trendUp={card.trendUp}
            trendPct={card.trendPct}
            onPress={card.onPress}
            isTablet={isTablet}
            cardWidth={kpiCardWidth}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      {!isConnected && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.danger }]}>
          <Feather name="wifi-off" size={14} color="#fff" />
          <Text style={styles.offlineText}>מצב אופליין</Text>
          {syncQueue.length > 0 && (
            <Text style={styles.offlineText}> · {syncQueue.length} פעולות ממתינות</Text>
          )}
        </View>
      )}

      {isConnected && (isSyncing || syncQueue.length > 0) && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.warning }]}>
          <Feather name="refresh-cw" size={14} color="#fff" />
          <Text style={styles.offlineText}>
            {isSyncing ? `מסנכרן ${syncQueue.length} פעולות...` : `${syncQueue.length} פעולות ממתינות לסנכרון`}
          </Text>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: contentPadding, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greeting}</Text>
            <Text style={[styles.userName, { color: colors.text }]}>{displayName}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.searchBtn, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSearchVisible(true);
              }}
            >
              <Feather name="search" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {isTablet ? (
              <View style={styles.kpiTabletWrapper}>
                {kpiGroups.map((group, gi) => (
                  <View key={gi} style={styles.kpiTabletGroup}>
                    <Text style={[styles.kpiGroupTitle, { color: colors.textSecondary }]}>{group.title}</Text>
                    <View style={styles.kpiRowTablet}>
                      {group.cards.map((card, idx) => (
                        <SwipeableKPICard
                          key={idx}
                          icon={card.icon}
                          label={card.label}
                          value={card.value}
                          color={card.color}
                          colors={colors}
                          trend={card.trend}
                          trendUp={card.trendUp}
                          trendPct={card.trendPct}
                          onPress={card.onPress}
                          isTablet={isTablet}
                          cardWidth={kpiCardWidth}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.kpiSection}>
                <View style={styles.kpiGroupHeader}>
                  <Text style={[styles.kpiGroupTitle, { color: colors.textSecondary }]}>
                    {kpiGroups[kpiPage]?.title}
                  </Text>
                  <View style={styles.kpiDots}>
                    {kpiGroups.map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.kpiDot,
                          { backgroundColor: i === kpiPage ? colors.primary : colors.border },
                        ]}
                      />
                    ))}
                  </View>
                </View>
                <FlatList
                  ref={kpiFlatRef}
                  data={kpiGroups}
                  renderItem={renderKPIPage}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(_, i) => String(i)}
                  onMomentumScrollEnd={(e) => {
                    const page = Math.round(e.nativeEvent.contentOffset.x / (screenWidth - contentPadding * 2));
                    setKpiPage(page);
                  }}
                  scrollEventThrottle={16}
                  style={{ marginHorizontal: -contentPadding }}
                  contentContainerStyle={{ paddingHorizontal: contentPadding }}
                  decelerationRate="fast"
                  snapToInterval={screenWidth - contentPadding * 2}
                  snapToAlignment="start"
                />
              </View>
            )}

            <View style={[styles.chartCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>אישורים — 6 חודשים</Text>
                <Text style={[styles.chartSubtitle, { color: colors.textMuted }]}>ממתינים לאישור</Text>
              </View>
              <MiniBarChart
                data={chartData}
                height={110}
                color={colors.primary}
                showLabels
              />
            </View>

            <View style={[styles.sectionContainer]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>פעולות מהירות</Text>
              <View style={[styles.quickGrid, isTablet && styles.quickGridTablet]}>
                <QuickActionButton icon="plus-circle" label="הזמנה חדשה" color={colors.primary} colors={colors} isTablet={isTablet} onPress={() => router.push("/procurement/orders")} />
                <QuickActionButton icon="check-square" label="אישורים" color={colors.warning} colors={colors} isTablet={isTablet} onPress={() => router.push("/approvals")} />
                <QuickActionButton icon="file-plus" label="מסמך חדש" color={colors.info} colors={colors} isTablet={isTablet} onPress={() => router.push("/documents")} />
                <QuickActionButton icon="cpu" label="עוזי AI" color={colors.accent} colors={colors} isTablet={isTablet} onPress={() => router.push("/ai-chat")} />
                <QuickActionButton icon="camera" label="סריקת מסמך" color="#7B5EA7" colors={colors} isTablet={isTablet} onPress={() => router.push("/documents")} />
                <QuickActionButton icon="message-circle" label="הודעות" color="#E07A5F" colors={colors} isTablet={isTablet} onPress={() => router.push("/chat")} />
                <QuickActionButton icon="bar-chart-2" label="דוחות" color="#1A535C" colors={colors} isTablet={isTablet} onPress={() => router.push("/reports")} />
                <QuickActionButton icon="settings" label="הגדרות" color={colors.textSecondary} colors={colors} isTablet={isTablet} onPress={() => router.push("/settings")} />
              </View>
            </View>

            <View style={[styles.sectionContainer]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>פעולות מחסן מהירות</Text>
              <View style={[styles.quickGrid, isTablet && styles.quickGridTablet]}>
                <QuickActionButton icon="download" label="קבלת סחורה" color="#7c3aed" colors={colors} isTablet={isTablet} onPress={() => router.push("/warehouse/scan-receipt" as never)} />
                <QuickActionButton icon="list" label="ליקוט" color="#1d4ed8" colors={colors} isTablet={isTablet} onPress={() => router.push("/warehouse/pick" as never)} />
                <QuickActionButton icon="repeat" label="העברה" color="#059669" colors={colors} isTablet={isTablet} onPress={() => router.push("/warehouse/transfer" as never)} />
                <QuickActionButton icon="layers" label="ספירת מלאי" color="#0ea5e9" colors={colors} isTablet={isTablet} onPress={() => router.push("/warehouse/count" as never)} />
                <QuickActionButton icon="archive" label="אחסון" color="#d97706" colors={colors} isTablet={isTablet} onPress={() => router.push("/warehouse/putaway" as never)} />
                <QuickActionButton icon="grid" label="כל פעולות המחסן" color="#374151" colors={colors} isTablet={isTablet} onPress={() => router.push("/warehouse" as never)} />
              </View>
            </View>

            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>מודולים מרכזיים</Text>
              <View style={[styles.moduleShortcutsGrid, isTablet && styles.moduleShortcutsGridTablet]}>
                <ModuleShortcut icon="dollar-sign" label="כספים" color="#1B4332" colors={colors} isTablet={isTablet} onPress={() => router.push("/finance/dashboard")} />
                <ModuleShortcut icon="file-text" label="חשבוניות" color="#2D6A4F" colors={colors} isTablet={isTablet} onPress={() => router.push("/finance/invoices")} />
                <ModuleShortcut icon="credit-card" label="גבייה" color="#1A535C" colors={colors} isTablet={isTablet} onPress={() => router.push("/finance/payments")} />
                <ModuleShortcut icon="users" label="CRM" color="#40916C" colors={colors} isTablet={isTablet} onPress={() => router.push("/crm/dashboard")} />
                <ModuleShortcut icon="user-plus" label="לקוחות" color="#52B788" colors={colors} isTablet={isTablet} onPress={() => router.push("/crm/customers")} />
                <ModuleShortcut icon="briefcase" label="לידים" color="#3D405B" colors={colors} isTablet={isTablet} onPress={() => router.push("/crm/leads")} />
                <ModuleShortcut icon="file-text" label="הצעות" color="#E07A5F" colors={colors} isTablet={isTablet} onPress={() => router.push("/crm/quotes")} />
                <ModuleShortcut icon="target" label="קמפיינים" color="#7B5EA7" colors={colors} isTablet={isTablet} onPress={() => router.push("/marketing/campaigns")} />
                <ModuleShortcut icon="briefcase" label="משאבי אנוש" color="#1B4332" colors={colors} isTablet={isTablet} onPress={() => router.push("/hr")} />
                <ModuleShortcut icon="tool" label="ייצור" color="#2D6A4F" colors={colors} isTablet={isTablet} onPress={() => router.push("/production")} />
                <ModuleShortcut icon="shopping-cart" label="רכש" color="#40916C" colors={colors} isTablet={isTablet} onPress={() => router.push("/procurement")} />
                <ModuleShortcut icon="clipboard" label="פרויקטים" color="#1A535C" colors={colors} isTablet={isTablet} onPress={() => router.push("/projects")} />
              </View>
            </View>

            {stats?.modules && stats.modules.length > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>מודולים אחרונים</Text>
                <View style={[styles.moduleGrid, isTablet && { gap: 16 }]}>
                  {stats.modules.map((mod: any, idx: number) => (
                    <Pressable
                      key={mod.id}
                      style={({ pressed }) => [
                        styles.moduleCard,
                        isTablet && styles.moduleCardTablet,
                        { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                        pressed && styles.moduleCardPressed,
                      ]}
                      onPress={() =>
                        router.push({
                          pathname: "/module/[id]",
                          params: { id: String(mod.id) },
                        })
                      }
                    >
                      <View
                        style={[
                          styles.moduleIcon,
                          isTablet && styles.moduleIconTablet,
                          { backgroundColor: MODULE_COLORS[idx % MODULE_COLORS.length] + "18" },
                        ]}
                      >
                        <Feather
                          name={getModuleIcon(mod.slug || mod.name)}
                          size={isTablet ? 26 : 20}
                          color={MODULE_COLORS[idx % MODULE_COLORS.length]}
                        />
                      </View>
                      <Text style={[styles.moduleName, { color: colors.text }]} numberOfLines={1}>
                        {mod.nameHe || mod.name}
                      </Text>
                      <Text style={[styles.moduleDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                        {mod.description || ""}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <GlobalSearch visible={searchVisible} onClose={() => setSearchVisible(false)} />
    </View>
  );
}

function SwipeableKPICard({
  icon,
  label,
  value,
  color,
  colors,
  trend,
  trendUp,
  trendPct,
  onPress,
  isTablet,
  cardWidth,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  color: string;
  colors: ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];
  trend: number[];
  trendUp: boolean;
  trendPct: string;
  onPress: () => void;
  isTablet: boolean;
  cardWidth: number;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.kpiCard,
        isTablet ? styles.kpiCardTablet : { width: cardWidth },
        { backgroundColor: colors.surfaceCard, borderColor: colors.border },
        pressed && styles.kpiCardPressed,
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={styles.kpiCardTop}>
        <View style={[styles.kpiIconWrap, { backgroundColor: color + "18" }]}>
          <Feather name={icon} size={isTablet ? 22 : 18} color={color} />
        </View>
        <View style={[styles.kpiTrendBadge, { backgroundColor: trendUp ? "#40916C18" : colors.danger + "18" }]}>
          <Feather
            name={trendUp ? "trending-up" : "trending-down"}
            size={11}
            color={trendUp ? "#40916C" : colors.danger}
          />
          <Text style={[styles.kpiTrendText, { color: trendUp ? "#40916C" : colors.danger }]}>
            {trendPct}
          </Text>
        </View>
      </View>
      <Text style={[styles.kpiValue, { color: colors.text, fontSize: isTablet ? 28 : 24 }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.kpiSparkline}>
        <SparklineChart
          data={trend}
          width={isTablet ? 100 : 80}
          height={30}
          color={color}
          strokeWidth={1.5}
        />
      </View>
    </Pressable>
  );
}

function QuickActionButton({
  icon,
  label,
  color,
  colors,
  isTablet,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  colors: ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];
  isTablet: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickActionBtn,
        isTablet && styles.quickActionBtnTablet,
        { backgroundColor: colors.surfaceCard, borderColor: colors.border },
        pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[styles.quickActionIcon, isTablet && styles.quickActionIconTablet, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={isTablet ? 26 : 20} color={color} />
      </View>
      <Text style={[styles.quickActionLabel, { color: colors.text, fontSize: isTablet ? 13 : 11 }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function ModuleShortcut({
  icon,
  label,
  color,
  colors,
  isTablet,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  colors: ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];
  isTablet: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.moduleShortcut,
        isTablet && styles.moduleShortcutTablet,
        { backgroundColor: colors.surfaceCard, borderColor: colors.border },
        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
      ]}
      onPress={onPress}
    >
      <View style={[styles.moduleShortcutIcon, isTablet && styles.moduleShortcutIconTablet, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={isTablet ? 28 : 22} color={color} />
      </View>
      <Text style={[styles.moduleShortcutLabel, { color: colors.text, fontSize: isTablet ? 13 : 11 }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  return "ערב טוב";
}

const styles = StyleSheet.create({
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
  },
  offlineText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
  scrollContent: {
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  userName: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gpsBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexDirection: "row",
    gap: 2,
  },
  gpsStatusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 14,
    borderWidth: 1,
  },
  gpsStatusText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  searchBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  loadingContainer: {
    paddingTop: 80,
    alignItems: "center",
  },
  kpiSection: {
    marginBottom: 20,
  },
  kpiGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  kpiGroupTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiDots: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  kpiDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  kpiRowPhone: {
    flexDirection: "row",
    gap: 12,
  },
  kpiRowTablet: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "nowrap",
  },
  kpiTabletWrapper: {
    marginBottom: 20,
    gap: 16,
  },
  kpiTabletGroup: {
    gap: 8,
  },
  kpiCard: {
    borderRadius: 18,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiCardTablet: {
    flex: 1,
    padding: 20,
  },
  kpiCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  kpiCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiTrendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  kpiTrendText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  kpiValue: {
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  kpiLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  kpiSparkline: {
    marginTop: 4,
  },
  chartCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  chartSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
    textAlign: "right",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickGridTablet: {
    gap: 14,
  },
  quickActionBtn: {
    width: "22.5%" as DimensionValue,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  quickActionBtnTablet: {
    width: "18%" as DimensionValue,
    padding: 16,
    borderRadius: 18,
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionIconTablet: {
    width: 54,
    height: 54,
    borderRadius: 16,
  },
  quickActionLabel: {
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  moduleShortcutsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  moduleShortcutsGridTablet: {
    gap: 14,
  },
  moduleShortcut: {
    width: "22.5%" as DimensionValue,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  moduleShortcutTablet: {
    width: "15%" as DimensionValue,
    padding: 16,
    borderRadius: 18,
  },
  moduleShortcutIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleShortcutIconTablet: {
    width: 58,
    height: 58,
    borderRadius: 16,
  },
  moduleShortcutLabel: {
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  moduleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  moduleCard: {
    width: "47%" as DimensionValue,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  moduleCardTablet: {
    width: "30%" as DimensionValue,
    padding: 20,
    borderRadius: 18,
  },
  moduleCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  moduleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleIconTablet: {
    width: 52,
    height: 52,
    borderRadius: 16,
  },
  moduleName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  moduleDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
});
