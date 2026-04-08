import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { authFetch } from "@/lib/utils";
import {
  Brain, TrendingUp, TrendingDown, Users, Target, AlertTriangle,
  Zap, DollarSign, Shield, Heart, Star, ArrowUpRight, ArrowDownRight,
  Lightbulb, RefreshCw, Eye, ChevronRight, BarChart3, Activity,
  Crown, Skull, Flame, Clock, Search, Filter, Download,
  GitCompare, Layers, Sigma, Hash, CheckCircle, XCircle,
  Percent, Award, UserCheck, Banknote, Globe, Phone, Mail,
  MessageSquare, Calendar, FileText, ShoppingCart, Building2
} from "lucide-react";
import { useLocation } from "wouter";

// ============================================================
// TYPES
// ============================================================
interface CustomerIntel {
  id: number;
  name: string;
  segment: string;
  industry: string;
  tier: "platinum" | "gold" | "silver" | "bronze" | "at_risk" | "churned";
  owner: string;

  // 9 Core AI Models
  ltv: number;
  ltvTrend: number; // % change
  probabilityToClose: number;
  probabilityToChurn: number;
  expectedRevenueFuture: number;
  riskScore: number;
  paymentBehaviorScore: number;
  engagementScore: number;
  influenceScore: number;
  referralPotentialScore: number;

  // Behavioral Signals
  interestLevel: number;
  hesitationLevel: number;
  urgencyLevel: number;
  buyingIntentScore: number;

  // Health Composite
  healthScore: number;
  healthTrend: "improving" | "stable" | "declining";
  npsScore: number;

  // Financial
  totalRevenue: number;
  revenueYTD: number;
  openBalance: number;
  overdue: number;
  avgPaymentDays: number;
  creditLimit: number;
  profitMargin: number;

  // AI Outputs
  nextBestAction: string;
  nextBestActionUrgency: "immediate" | "this_week" | "this_month";
  nextBestOffer: string;
  riskAlerts: string[];
  upsellOpportunities: { name: string; value: number; probability: number }[];
  crossSellOpportunities: { name: string; value: number; probability: number }[];

  // Activity
  lastContact: string;
  daysSinceContact: number;
  totalInteractions30d: number;
  openDeals: number;
  openDealsValue: number;

  // Prediction
  revenue30d: number;
  revenue60d: number;
  revenue90d: number;

  // Model Confidence
  modelConfidence: number;
  lastComputedAt: string;
}

// ============================================================
// FULL CUSTOMER DATA
// ============================================================
const customers: CustomerIntel[] = [
  {
    id: 1, name: "קבוצת אלון", segment: "VIP", industry: "בנייה", tier: "platinum", owner: "דני כהן",
    ltv: 2850000, ltvTrend: 12.5, probabilityToClose: 0.72, probabilityToChurn: 0.05, expectedRevenueFuture: 1200000,
    riskScore: 18, paymentBehaviorScore: 92, engagementScore: 85, influenceScore: 78, referralPotentialScore: 65,
    interestLevel: 82, hesitationLevel: 15, urgencyLevel: 45, buyingIntentScore: 75,
    healthScore: 88, healthTrend: "improving", npsScore: 85,
    totalRevenue: 2850000, revenueYTD: 485000, openBalance: 245000, overdue: 0, avgPaymentDays: 38, creditLimit: 500000, profitMargin: 21.3,
    nextBestAction: "הצע הרחבת חוזה למגדל B — ₪850K פוטנציאל", nextBestActionUrgency: "this_week",
    nextBestOffer: "הנחת נפח 8% על חבילה שנתית (₪3.2M)",
    riskAlerts: [],
    upsellOpportunities: [{ name: "מגדל B - חיפוי", value: 850000, probability: 0.65 }, { name: "שדרוג חלונות premium", value: 120000, probability: 0.80 }],
    crossSellOpportunities: [{ name: "מערכות חשמל חכמות", value: 280000, probability: 0.45 }],
    lastContact: "2026-04-08", daysSinceContact: 0, totalInteractions30d: 12, openDeals: 2, openDealsValue: 1470000,
    revenue30d: 180000, revenue60d: 350000, revenue90d: 550000, modelConfidence: 0.91, lastComputedAt: "2026-04-08 10:30",
  },
  {
    id: 2, name: "שיכון ובינוי", segment: "Enterprise", industry: "בנייה", tier: "gold", owner: "מיכל לוי",
    ltv: 4200000, ltvTrend: -3.2, probabilityToClose: 0.55, probabilityToChurn: 0.12, expectedRevenueFuture: 850000,
    riskScore: 38, paymentBehaviorScore: 68, engagementScore: 58, influenceScore: 90, referralPotentialScore: 82,
    interestLevel: 55, hesitationLevel: 42, urgencyLevel: 65, buyingIntentScore: 48,
    healthScore: 62, healthTrend: "declining", npsScore: 58,
    totalRevenue: 4200000, revenueYTD: 320000, openBalance: 385000, overdue: 128000, avgPaymentDays: 58, creditLimit: 800000, profitMargin: 16.8,
    nextBestAction: "פגישת הנהלה דחופה — סנטימנט שלילי + איחור תשלום", nextBestActionUrgency: "immediate",
    nextBestOffer: "תנאי תשלום גמישים שוטף+90 + פיצוי 2% על העיכוב",
    riskAlerts: ["איחור תשלום 45 ימים - ₪128K", "ירידת engagement ב-22%", "סנטימנט שלילי בשיחה אחרונה"],
    upsellOpportunities: [],
    crossSellOpportunities: [{ name: "שירותי תחזוקה שנתי", value: 180000, probability: 0.35 }],
    lastContact: "2026-04-05", daysSinceContact: 3, totalInteractions30d: 5, openDeals: 1, openDealsValue: 620000,
    revenue30d: 85000, revenue60d: 170000, revenue90d: 280000, modelConfidence: 0.84, lastComputedAt: "2026-04-08 10:30",
  },
  {
    id: 3, name: "אמות השקעות", segment: "Enterprise", industry: 'נדל"ן', tier: "platinum", owner: "דני כהן",
    ltv: 1800000, ltvTrend: 18.5, probabilityToClose: 0.85, probabilityToChurn: 0.03, expectedRevenueFuture: 480000,
    riskScore: 8, paymentBehaviorScore: 96, engagementScore: 92, influenceScore: 72, referralPotentialScore: 55,
    interestLevel: 88, hesitationLevel: 8, urgencyLevel: 35, buyingIntentScore: 90,
    healthScore: 95, healthTrend: "improving", npsScore: 92,
    totalRevenue: 1800000, revenueYTD: 210000, openBalance: 95000, overdue: 0, avgPaymentDays: 28, creditLimit: 400000, profitMargin: 24.5,
    nextBestAction: "שלח חוזה לחתימה — עסקה באישור סופי P(Win)=85%", nextBestActionUrgency: "immediate",
    nextBestOffer: "ביטוח מורחב 3 שנים חינם (שווי ₪45K)",
    riskAlerts: [],
    upsellOpportunities: [{ name: "שדרוג חלונות triple-glass", value: 85000, probability: 0.70 }],
    crossSellOpportunities: [{ name: "מערכות אוורור מרכזי", value: 320000, probability: 0.40 }, { name: "חיפוי פנים premium", value: 150000, probability: 0.55 }],
    lastContact: "2026-04-08", daysSinceContact: 0, totalInteractions30d: 8, openDeals: 1, openDealsValue: 480000,
    revenue30d: 120000, revenue60d: 250000, revenue90d: 380000, modelConfidence: 0.94, lastComputedAt: "2026-04-08 10:30",
  },
  {
    id: 4, name: "עיריית חולון", segment: "Public", industry: "ציבורי", tier: "at_risk", owner: "יוסי אברהם",
    ltv: 650000, ltvTrend: -28.5, probabilityToClose: 0.15, probabilityToChurn: 0.45, expectedRevenueFuture: 120000,
    riskScore: 72, paymentBehaviorScore: 42, engagementScore: 22, influenceScore: 55, referralPotentialScore: 20,
    interestLevel: 18, hesitationLevel: 75, urgencyLevel: 15, buyingIntentScore: 10,
    healthScore: 28, healthTrend: "declining", npsScore: 35,
    totalRevenue: 650000, revenueYTD: 0, openBalance: 95000, overdue: 95000, avgPaymentDays: 92, creditLimit: 200000, profitMargin: 8.2,
    nextBestAction: "פגישת הנהלה בכירה לחידוש קשר — אין פעילות 60 ימים", nextBestActionUrgency: "this_week",
    nextBestOffer: "פיילוט בפרויקט קטן ₪80K להוכחת ערך",
    riskAlerts: ["סיכון נטישה גבוה P(Churn)=45%", "אין פעילות 60 ימים", "איחור תשלום 92 ימים — ₪95K", "ירידת LTV ב-28.5%"],
    upsellOpportunities: [],
    crossSellOpportunities: [],
    lastContact: "2026-02-05", daysSinceContact: 62, totalInteractions30d: 0, openDeals: 0, openDealsValue: 0,
    revenue30d: 0, revenue60d: 0, revenue90d: 40000, modelConfidence: 0.72, lastComputedAt: "2026-04-08 10:30",
  },
  {
    id: 5, name: "סופרגז אנרגיה", segment: "SMB", industry: "אנרגיה", tier: "churned", owner: "—",
    ltv: 380000, ltvTrend: -55.0, probabilityToClose: 0.02, probabilityToChurn: 0.92, expectedRevenueFuture: 0,
    riskScore: 95, paymentBehaviorScore: 12, engagementScore: 5, influenceScore: 30, referralPotentialScore: 0,
    interestLevel: 3, hesitationLevel: 95, urgencyLevel: 5, buyingIntentScore: 0,
    healthScore: 5, healthTrend: "declining", npsScore: 0,
    totalRevenue: 380000, revenueYTD: 0, openBalance: 58000, overdue: 58000, avgPaymentDays: 999, creditLimit: 0, profitMargin: -15.2,
    nextBestAction: "העבר לגבייה משפטית — חשד חדלות פירעון", nextBestActionUrgency: "immediate",
    nextBestOffer: "הסדר תשלומים 6 חודשים (אם יש יכולת)",
    riskAlerts: ["🚨 חשד חדלות פירעון", "חוב פתוח ₪58K — 115 ימים", "P(Churn) = 92%", "Health Score = 5", "אין תקשורת 90+ ימים"],
    upsellOpportunities: [],
    crossSellOpportunities: [],
    lastContact: "2026-01-08", daysSinceContact: 90, totalInteractions30d: 0, openDeals: 0, openDealsValue: 0,
    revenue30d: 0, revenue60d: 0, revenue90d: 0, modelConfidence: 0.88, lastComputedAt: "2026-04-08 10:30",
  },
  {
    id: 6, name: "BIG מרכזי קניות", segment: "Enterprise", industry: "קמעונאות", tier: "silver", owner: "דני כהן",
    ltv: 0, ltvTrend: 0, probabilityToClose: 0.25, probabilityToChurn: 0, expectedRevenueFuture: 1200000,
    riskScore: 35, paymentBehaviorScore: 0, engagementScore: 45, influenceScore: 85, referralPotentialScore: 70,
    interestLevel: 62, hesitationLevel: 38, urgencyLevel: 25, buyingIntentScore: 35,
    healthScore: 55, healthTrend: "improving", npsScore: 0,
    totalRevenue: 0, revenueYTD: 0, openBalance: 0, overdue: 0, avgPaymentDays: 0, creditLimit: 300000, profitMargin: 0,
    nextBestAction: "סיור באתר + הצגת portfolio — ליד חדש ₪1.2M", nextBestActionUrgency: "this_week",
    nextBestOffer: "פגישה עם מנכ\"ל + דוגמאות מפרויקטים דומים",
    riskAlerts: ["ליד חדש — נדרשת תשומת לב מהירה"],
    upsellOpportunities: [],
    crossSellOpportunities: [],
    lastContact: "2026-04-06", daysSinceContact: 2, totalInteractions30d: 2, openDeals: 1, openDealsValue: 1200000,
    revenue30d: 0, revenue60d: 0, revenue90d: 200000, modelConfidence: 0.65, lastComputedAt: "2026-04-08 10:30",
  },
  {
    id: 7, name: "רשת פתאל", segment: "Enterprise", industry: "מלונאות", tier: "bronze", owner: "מיכל לוי",
    ltv: 550000, ltvTrend: -100, probabilityToClose: 0, probabilityToChurn: 0.80, expectedRevenueFuture: 0,
    riskScore: 65, paymentBehaviorScore: 55, engagementScore: 10, influenceScore: 75, referralPotentialScore: 60,
    interestLevel: 5, hesitationLevel: 85, urgencyLevel: 5, buyingIntentScore: 0,
    healthScore: 15, healthTrend: "declining", npsScore: 25,
    totalRevenue: 550000, revenueYTD: 0, openBalance: 0, overdue: 0, avgPaymentDays: 45, creditLimit: 250000, profitMargin: 12.5,
    nextBestAction: "ניתוח הפסד — למה הפסדנו? מה המתחרה הציע?", nextBestActionUrgency: "this_month",
    nextBestOffer: "הצעה חדשה עם שיפור 10% על תנאי המתחרה",
    riskAlerts: ["הפסדנו עסקה ₪550K למתחרה", "P(Churn) = 80%"],
    upsellOpportunities: [],
    crossSellOpportunities: [],
    lastContact: "2026-03-28", daysSinceContact: 11, totalInteractions30d: 1, openDeals: 0, openDealsValue: 0,
    revenue30d: 0, revenue60d: 0, revenue90d: 0, modelConfidence: 0.78, lastComputedAt: "2026-04-08 10:30",
  },
];

// ============================================================
// PORTFOLIO ANALYTICS
// ============================================================
const portfolio = useMemo_static(() => {
  const active = customers.filter(c => c.tier !== "churned");
  const totalLtv = active.reduce((s, c) => s + c.ltv, 0);
  const totalExpected = active.reduce((s, c) => s + c.expectedRevenueFuture * c.probabilityToClose, 0);
  const avgHealth = Math.round(active.reduce((s, c) => s + c.healthScore, 0) / active.length);
  const avgRisk = Math.round(active.reduce((s, c) => s + c.riskScore, 0) / active.length);
  const churnRisk = customers.filter(c => c.probabilityToChurn > 0.3);
  const churnValue = churnRisk.reduce((s, c) => s + c.ltv, 0);
  const top3Revenue = [...customers].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 3);
  const concentration = top3Revenue.reduce((s, c) => s + c.totalRevenue, 0) / Math.max(1, customers.reduce((s, c) => s + c.totalRevenue, 0)) * 100;
  const totalUpsell = customers.reduce((s, c) => s + c.upsellOpportunities.reduce((ss, o) => ss + o.value * o.probability, 0), 0);
  const totalCrossSell = customers.reduce((s, c) => s + c.crossSellOpportunities.reduce((ss, o) => ss + o.value * o.probability, 0), 0);
  const revenue30d = active.reduce((s, c) => s + c.revenue30d, 0);
  const revenue90d = active.reduce((s, c) => s + c.revenue90d, 0);
  const totalOverdue = customers.reduce((s, c) => s + c.overdue, 0);
  const platinum = customers.filter(c => c.tier === "platinum").length;
  const atRisk = customers.filter(c => c.tier === "at_risk" || c.tier === "churned").length;

  return { totalLtv, totalExpected, avgHealth, avgRisk, churnRisk: churnRisk.length, churnValue, concentration, totalUpsell, totalCrossSell, revenue30d, revenue90d, totalOverdue, platinum, atRisk, totalCustomers: customers.length };
});

function useMemo_static<T>(fn: () => T): T { return fn(); }

// ============================================================
// HELPERS
// ============================================================
const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(2)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v}`;

const scoreColor = (s: number, inverse = false) => {
  const v = inverse ? 100 - s : s;
  if (v >= 80) return "text-emerald-600";
  if (v >= 60) return "text-blue-600";
  if (v >= 40) return "text-amber-600";
  if (v >= 20) return "text-orange-600";
  return "text-red-600";
};

const scoreBg = (s: number, inverse = false) => {
  const v = inverse ? 100 - s : s;
  if (v >= 80) return "bg-emerald-500";
  if (v >= 60) return "bg-blue-500";
  if (v >= 40) return "bg-amber-500";
  if (v >= 20) return "bg-orange-500";
  return "bg-red-500";
};

const scoreBadgeBg = (s: number, inverse = false) => {
  const v = inverse ? 100 - s : s;
  if (v >= 80) return "bg-emerald-100 text-emerald-700";
  if (v >= 60) return "bg-blue-100 text-blue-700";
  if (v >= 40) return "bg-amber-100 text-amber-700";
  if (v >= 20) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
};

const tierConfig = {
  platinum: { label: "Platinum", color: "bg-violet-100 text-violet-800 border-violet-300", icon: "💎" },
  gold: { label: "Gold", color: "bg-amber-100 text-amber-800 border-amber-300", icon: "🥇" },
  silver: { label: "Silver", color: "bg-gray-100 text-gray-800 border-gray-300", icon: "🥈" },
  bronze: { label: "Bronze", color: "bg-orange-100 text-orange-800 border-orange-300", icon: "🥉" },
  at_risk: { label: "At Risk", color: "bg-red-100 text-red-800 border-red-300", icon: "⚠️" },
  churned: { label: "Churned", color: "bg-red-200 text-red-900 border-red-400", icon: "💀" },
};

const urgencyBadge = (u: string) => {
  switch (u) {
    case "immediate": return <Badge className="bg-red-100 text-red-700 border-red-200 text-[9px] animate-pulse">🔴 מיידי</Badge>;
    case "this_week": return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px]">🟡 השבוע</Badge>;
    default: return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[9px]">🔵 החודש</Badge>;
  }
};

// ============================================================
// SCORE CELL COMPONENT
// ============================================================
function ScoreCell({ value, max = 100, inverse = false, format = "number" }: { value: number; max?: number; inverse?: boolean; format?: "number" | "percent" | "currency" }) {
  const displayValue = format === "percent" ? `${(value * 100).toFixed(0)}%` : format === "currency" ? fmt(value) : value.toFixed(0);
  const normalized = Math.min(100, (value / max) * 100);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          <div className={`w-full h-6 rounded flex items-center justify-center text-[10px] font-bold font-mono text-white ${scoreBg(inverse ? 100 - normalized : normalized)}`}
            style={{ opacity: 0.15 + (normalized / 100) * 0.85 }}>
            {displayValue}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{displayValue} / {max}</TooltipContent>
    </Tooltip>
  );
}

// ============================================================
// HEALTH RING
// ============================================================
function HealthRing({ score, size = 48, trend }: { score: number; size?: number; trend?: string }) {
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#3b82f6" : score >= 40 ? "#f59e0b" : score >= 20 ? "#f97316" : "#ef4444";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44" className="transform -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" stroke="#e5e7eb" strokeWidth="3" />
        <circle cx="22" cy="22" r="18" fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-bold" style={{ color }}>{score}</span>
        {trend && <span className="text-[7px]">{trend === "improving" ? "↑" : trend === "declining" ? "↓" : "→"}</span>}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function IntelligenceEngine() {
  const [, navigate] = useLocation();
  const [sortBy, setSortBy] = useState("healthScore");
  const [filterTier, setFilterTier] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyAlerts, setShowOnlyAlerts] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerIntel | null>(null);

  const filtered = useMemo(() => {
    let result = [...customers];
    if (filterTier !== "all") result = result.filter(c => c.tier === filterTier);
    if (filterRisk === "high") result = result.filter(c => c.riskScore >= 50);
    if (filterRisk === "low") result = result.filter(c => c.riskScore < 30);
    if (showOnlyAlerts) result = result.filter(c => c.riskAlerts.length > 0);
    if (searchTerm) result = result.filter(c => c.name.includes(searchTerm));

    return result.sort((a: any, b: any) => {
      const av = a[sortBy], bv = b[sortBy];
      if (typeof av === "number" && typeof bv === "number") {
        return sortBy === "riskScore" || sortBy === "probabilityToChurn" ? bv - av : bv - av;
      }
      return 0;
    });
  }, [sortBy, filterTier, filterRisk, showOnlyAlerts, searchTerm]);

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" /> Customer Intelligence Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            9 AI Models | Real-time | Portfolio View | {customers.length} Customers | Confidence {(customers.reduce((s, c) => s + c.modelConfidence, 0) / customers.length * 100).toFixed(0)}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            <Clock className="h-3 w-3 ml-1" /> Updated {customers[0]?.lastComputedAt}
          </Badge>
          <Button variant="outline" size="sm"><RefreshCw className="h-3.5 w-3.5 ml-1" /> Recompute All</Button>
          <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 ml-1" /> Export</Button>
        </div>
      </div>

      {/* Portfolio Overview - 2 rows */}
      <div className="grid grid-cols-8 gap-2">
        {[
          { label: "Total LTV", value: fmt(portfolio.totalLtv), icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Weighted Expected", value: fmt(portfolio.totalExpected), icon: Target, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Avg Health", value: `${portfolio.avgHealth}/100`, icon: Heart, color: portfolio.avgHealth >= 60 ? "text-emerald-600" : "text-amber-600", bg: portfolio.avgHealth >= 60 ? "bg-emerald-50" : "bg-amber-50" },
          { label: "Avg Risk", value: `${portfolio.avgRisk}/100`, icon: Shield, color: portfolio.avgRisk <= 30 ? "text-emerald-600" : "text-red-600", bg: portfolio.avgRisk <= 30 ? "bg-emerald-50" : "bg-red-50" },
          { label: "Churn Risk", value: `${portfolio.churnRisk} (${fmt(portfolio.churnValue)})`, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
          { label: "Top 3 Concentration", value: `${portfolio.concentration.toFixed(0)}%`, icon: Layers, color: portfolio.concentration > 50 ? "text-red-600" : "text-blue-600", bg: portfolio.concentration > 50 ? "bg-red-50" : "bg-blue-50" },
          { label: "Upsell Pipeline", value: fmt(portfolio.totalUpsell), icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Overdue", value: fmt(portfolio.totalOverdue), icon: Clock, color: portfolio.totalOverdue > 0 ? "text-red-600" : "text-emerald-600", bg: portfolio.totalOverdue > 0 ? "bg-red-50" : "bg-emerald-50" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-2">
                <Icon className={`h-3.5 w-3.5 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-2.5 pb-2.5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute right-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="חפש לקוח..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-7 text-xs pr-8" />
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px] h-7 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[
                  { value: "healthScore", label: "Health Score" },
                  { value: "ltv", label: "LTV" },
                  { value: "riskScore", label: "Risk Score" },
                  { value: "probabilityToChurn", label: "P(Churn)" },
                  { value: "expectedRevenueFuture", label: "Expected Revenue" },
                  { value: "buyingIntentScore", label: "Buying Intent" },
                  { value: "totalRevenue", label: "Total Revenue" },
                  { value: "profitMargin", label: "Profitability" },
                ].map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterTier} onValueChange={setFilterTier}>
              <SelectTrigger className="w-[120px] h-7 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הטירים</SelectItem>
                {Object.entries(tierConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterRisk} onValueChange={setFilterRisk}>
              <SelectTrigger className="w-[120px] h-7 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסיכונים</SelectItem>
                <SelectItem value="high">סיכון גבוה</SelectItem>
                <SelectItem value="low">סיכון נמוך</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Switch checked={showOnlyAlerts} onCheckedChange={setShowOnlyAlerts} />
              <Label className="text-[10px]">רק התראות</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Intelligence Matrix */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <ScrollArea className="max-h-[calc(100vh-380px)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 sticky top-0 z-10">
                  <TableHead className="text-right text-[9px] font-bold w-[160px] sticky right-0 bg-muted/50 z-20">Customer</TableHead>
                  <TableHead className="text-center text-[9px] font-bold w-12">Health</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">LTV</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">P(Close)</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">P(Churn)</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Risk</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Payment</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Engage</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Intent</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Influence</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Revenue 90d</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Open Deals</TableHead>
                  <TableHead className="text-right text-[9px] font-bold w-[220px]">Next Best Action</TableHead>
                  <TableHead className="text-center text-[9px] font-bold w-10">⚡</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => {
                  const tc = tierConfig[c.tier];
                  return (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer hover:bg-accent transition-colors ${
                        c.riskAlerts.length > 0 && c.tier !== "churned" ? "bg-red-50/20" :
                        c.tier === "churned" ? "bg-gray-50/50 opacity-60" :
                        c.tier === "platinum" ? "bg-violet-50/10" : ""
                      }`}
                      onClick={() => setSelectedCustomer(selectedCustomer?.id === c.id ? null : c)}
                    >
                      {/* Customer */}
                      <TableCell className="sticky right-0 bg-background z-10">
                        <div className="flex items-center gap-2">
                          <HealthRing score={c.healthScore} size={36} trend={c.healthTrend} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-bold truncate">{c.name}</p>
                              <span className="text-[8px]">{tc.icon}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge className={`${tc.color} text-[7px] h-3.5 px-1 border`}>{tc.label}</Badge>
                              <span className="text-[8px] text-muted-foreground">{c.industry}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Health */}
                      <TableCell className="text-center p-1">
                        <div className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center text-[10px] font-bold text-white ${scoreBg(c.healthScore)}`}>
                          {c.healthScore}
                        </div>
                      </TableCell>

                      {/* LTV */}
                      <TableCell className="text-center p-1">
                        <div className="text-[10px] font-mono font-bold">{fmt(c.ltv)}</div>
                        {c.ltvTrend !== 0 && (
                          <span className={`text-[8px] font-mono ${c.ltvTrend > 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {c.ltvTrend > 0 ? "↑" : "↓"}{Math.abs(c.ltvTrend).toFixed(0)}%
                          </span>
                        )}
                      </TableCell>

                      {/* Scores as heatmap cells */}
                      <TableCell className="p-1"><ScoreCell value={c.probabilityToClose} max={1} format="percent" /></TableCell>
                      <TableCell className="p-1"><ScoreCell value={c.probabilityToChurn} max={1} format="percent" inverse /></TableCell>
                      <TableCell className="p-1"><ScoreCell value={c.riskScore} inverse /></TableCell>
                      <TableCell className="p-1"><ScoreCell value={c.paymentBehaviorScore} /></TableCell>
                      <TableCell className="p-1"><ScoreCell value={c.engagementScore} /></TableCell>
                      <TableCell className="p-1"><ScoreCell value={c.buyingIntentScore} /></TableCell>
                      <TableCell className="p-1"><ScoreCell value={c.influenceScore} /></TableCell>

                      {/* Revenue 90d */}
                      <TableCell className="text-center p-1">
                        <span className={`text-[10px] font-mono font-bold ${c.revenue90d > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {fmt(c.revenue90d)}
                        </span>
                      </TableCell>

                      {/* Open Deals */}
                      <TableCell className="text-center p-1">
                        {c.openDeals > 0 ? (
                          <div>
                            <span className="text-[10px] font-bold">{c.openDeals}</span>
                            <span className="text-[8px] text-muted-foreground block">{fmt(c.openDealsValue)}</span>
                          </div>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </TableCell>

                      {/* NBA */}
                      <TableCell className="p-1">
                        <p className="text-[9px] text-primary leading-tight truncate max-w-[200px]" title={c.nextBestAction}>
                          {c.nextBestAction}
                        </p>
                        {c.riskAlerts.length > 0 && (
                          <Badge className="bg-red-100 text-red-700 text-[7px] mt-0.5">
                            {c.riskAlerts.length} alerts
                          </Badge>
                        )}
                      </TableCell>

                      {/* Urgency */}
                      <TableCell className="p-1">
                        {urgencyBadge(c.nextBestActionUrgency)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Expanded Customer Detail */}
      {selectedCustomer && (
        <Card className="border-primary/30 shadow-lg">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HealthRing score={selectedCustomer.healthScore} size={56} trend={selectedCustomer.healthTrend} />
                <div>
                  <CardTitle className="text-base">{selectedCustomer.name}</CardTitle>
                  <CardDescription>
                    {tierConfig[selectedCustomer.tier].icon} {tierConfig[selectedCustomer.tier].label} | {selectedCustomer.industry} | {selectedCustomer.owner} | Confidence: {(selectedCustomer.modelConfidence * 100).toFixed(0)}%
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/crm/customer-360/${selectedCustomer.id}`)}>
                <Eye className="h-3.5 w-3.5 ml-1" /> Full 360
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              {/* Financial */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Financial</h4>
                {[
                  ["Total Revenue", fmt(selectedCustomer.totalRevenue)],
                  ["Revenue YTD", fmt(selectedCustomer.revenueYTD)],
                  ["Open Balance", fmt(selectedCustomer.openBalance)],
                  ["Overdue", fmt(selectedCustomer.overdue), selectedCustomer.overdue > 0 ? "text-red-600" : ""],
                  ["Avg Payment Days", `${selectedCustomer.avgPaymentDays}d`],
                  ["Profit Margin", `${selectedCustomer.profitMargin}%`],
                  ["Credit Limit", fmt(selectedCustomer.creditLimit)],
                ].map(([label, value, cls], i) => (
                  <div key={i} className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-mono font-semibold ${cls || ""}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Predictions */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Predictions</h4>
                {[
                  ["Revenue 30d", fmt(selectedCustomer.revenue30d)],
                  ["Revenue 60d", fmt(selectedCustomer.revenue60d)],
                  ["Revenue 90d", fmt(selectedCustomer.revenue90d)],
                  ["Expected Future", fmt(selectedCustomer.expectedRevenueFuture)],
                  ["P(Close)", `${(selectedCustomer.probabilityToClose * 100).toFixed(0)}%`],
                  ["P(Churn)", `${(selectedCustomer.probabilityToChurn * 100).toFixed(0)}%`, selectedCustomer.probabilityToChurn > 0.3 ? "text-red-600" : ""],
                  ["LTV Trend", `${selectedCustomer.ltvTrend > 0 ? "+" : ""}${selectedCustomer.ltvTrend}%`, selectedCustomer.ltvTrend > 0 ? "text-emerald-600" : "text-red-600"],
                ].map(([label, value, cls], i) => (
                  <div key={i} className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-mono font-semibold ${cls || ""}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Opportunities */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Opportunities</h4>
                {selectedCustomer.upsellOpportunities.length > 0 && selectedCustomer.upsellOpportunities.map((o, i) => (
                  <div key={`u-${i}`} className="p-1.5 rounded bg-emerald-50 border border-emerald-200 text-[9px]">
                    <span className="font-medium">⬆️ {o.name}</span>
                    <span className="block text-emerald-700 font-mono">{fmt(o.value)} ({(o.probability * 100).toFixed(0)}%)</span>
                  </div>
                ))}
                {selectedCustomer.crossSellOpportunities.length > 0 && selectedCustomer.crossSellOpportunities.map((o, i) => (
                  <div key={`c-${i}`} className="p-1.5 rounded bg-blue-50 border border-blue-200 text-[9px]">
                    <span className="font-medium">↔️ {o.name}</span>
                    <span className="block text-blue-700 font-mono">{fmt(o.value)} ({(o.probability * 100).toFixed(0)}%)</span>
                  </div>
                ))}
                {selectedCustomer.upsellOpportunities.length === 0 && selectedCustomer.crossSellOpportunities.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">אין הזדמנויות פתוחות</p>
                )}
              </div>

              {/* Actions & Alerts */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">AI Actions</h4>
                <div className="p-2 rounded bg-primary/5 border border-primary/20">
                  <div className="flex items-start gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <p className="text-[10px] text-primary font-medium">{selectedCustomer.nextBestAction}</p>
                  </div>
                </div>
                {selectedCustomer.nextBestOffer && (
                  <div className="p-2 rounded bg-emerald-50 border border-emerald-200">
                    <div className="flex items-start gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-emerald-700">{selectedCustomer.nextBestOffer}</p>
                    </div>
                  </div>
                )}
                {selectedCustomer.riskAlerts.map((a, i) => (
                  <div key={i} className="p-1.5 rounded bg-red-50 border border-red-200 text-[9px] text-red-700 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{a}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
