import { Link, useLocation } from "wouter";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import { lazy, Suspense, type ComponentType, type ReactNode, createContext, useContext } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { KobiWindowInstance } from "@/components/ai/kobi-chat-window";
import { AlertToastContainer } from "@/components/notifications/alert-toast";
import { useGlobalKeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { EnhancedToastContainer } from "@/components/ui/enhanced-toast";
import { ThemeToggle } from "@/components/theme-toggle";

function ChunkLoadErrorFallback() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "16px", padding: "32px", textAlign: "center", direction: "rtl" }}>
      <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>⚠️</div>
      <div>
        <p style={{ fontWeight: 600, marginBottom: "4px" }}>שגיאה בטעינת הדף</p>
        <p style={{ fontSize: "14px", color: "#6b7280", maxWidth: "300px" }}>לא ניתן היה לטעון חלק מהאפליקציה. ייתכן שיש בעיית רשת.</p>
      </div>
      <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
        🔄 נסה שוב
      </button>
    </div>
  );
}

interface BreadcrumbCtx {
  label: string | null;
  setLabel: (label: string | null) => void;
}
const BreadcrumbContext = createContext<BreadcrumbCtx>({ label: null, setLabel: () => {} });

export function useBreadcrumbLabel() {
  return useContext(BreadcrumbContext);
}

function lazyRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3
): React.LazyExoticComponent<T> {
  return lazy(() => {
    const attempt = (remaining: number): Promise<{ default: T }> =>
      factory().catch((err: unknown) => {
        if (remaining <= 0) {
          console.warn("[lazyRetry] All retries exhausted, showing error fallback");
          const Fallback = ChunkLoadErrorFallback as unknown as T;
          return { default: Fallback };
        }
        return new Promise<{ default: T }>((resolve) =>
          setTimeout(() => resolve(attempt(remaining - 1)), 800)
        );
      });
    return attempt(retries);
  });
}

const KobiChatWindow = lazyRetry(() => import("@/components/ai/kobi-chat-window"));
const QuickAddFAB = lazyRetry(() => import("@/components/quick-add-fab"));
const CommandPalette = lazyRetry(() => import("@/components/command-palette").then(m => ({ default: m.CommandPalette })));
const KeyboardShortcutCheatSheet = lazyRetry(() => import("@/components/keyboard-shortcuts").then(m => ({ default: m.KeyboardShortcutCheatSheet })));
import { 
  LayoutDashboard, 
  Blocks,
  Package,
  Database,
  TextCursorInput,
  Link2,
  FormInput,
  Table2,
  CreditCard,
  FolderTree,
  CircleDot,
  MousePointerClick,
  Zap,
  Shield,
  MenuSquare,
  BarChart3,
  LayoutGrid,
  GitBranch,
  GitCompare,
  Bot,
  Copy,
  Upload,
  LogOut,
  Bell,
  Menu,
  X,
  Check,
  CheckCheck,
  FileText,
  Plug,
  Brain,
  Truck,
  Boxes,
  ClipboardList,
  CheckSquare,
  ShoppingCart,
  PackageCheck,
  TrendingUp,
  Gauge,
  Sparkles,
  MessageSquare,
  Warehouse,
  ArrowLeftRight,
  DollarSign,
  Receipt,
  Scale,
  FolderKanban,
  Wallet,
  Building2,
  Landmark,
  Banknote,
  PiggyBank,
  Key,
  Cpu,
  Server,
  SearchCode,
  Lightbulb,
  MessageCircle,
  Activity,
  Network,
  FileCode,
  Settings,
  Briefcase,
  MapPin,
  Ship,
  Ruler,
  ShieldCheck,
  ClipboardCheck,
  Award,
  RotateCcw,
  TrendingDown,
  PenTool,
  Factory,
  HardDrive,
  PieChart,
  Wrench,
  List,
  AlertCircle,
  Globe,
  FileCheck,
  Calculator,
  Target,
  Map as MapIcon,
  Megaphone,
  CalendarDays,
  ShieldAlert,
  Users,
  User,
  Funnel,
  Puzzle,
  CheckCircle2,
  ArrowUpDown,
  BookOpen,
  GraduationCap,
  Calendar,
  AlertTriangle,
  FileBarChart,
  Headphones,
  Share2,
  Mail,
  Flag,
  Clock,
  Send,
  MousePointer,
  Heart,
  UserPlus,
  Beaker,
  TestTube,
  ThumbsUp,
  Cog,
  Star,
  Layers,
  Percent,
  Archive,
  FolderArchive,
  LayoutTemplate,
  Image,
  Phone,
  History,
  Smartphone,
  Search,
  Users2,
  LayoutList,
  BellRing,
  FolderCog,
  Eye,
  LogIn,
  Moon,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  Leaf,
  Hammer,
  FileSignature,
  Microscope,
  ScanLine,
  Route,
  Container,
  Radiation,
  Recycle,
  FlaskConical,
  ScrollText,
  Handshake,
  Medal,
  Thermometer,
  HardHat,
  Fuel,
  Anchor,
  FileSearch,
  Gem,
  BookMarked,
  FileBadge,
  Siren,
  ShieldQuestion,
  Timer,
  Combine,
  Presentation,
  Gavel,
  FolderOpen,
  Lock,
  QrCode,
  GitMerge,
  Trash2, Cloud,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback, startTransition } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/utils";
const ChatPanel = lazyRetry(() => import("@/components/chat/chat-panel").then(m => ({ default: m.ChatPanel })));
const ChatBadge = lazyRetry(() => import("@/components/chat/chat-panel").then(m => ({ default: m.ChatBadge })));
import { OfflineBanner, SyncStatusIndicator } from "@/components/offline-banner";
const PWAInstallPrompt = lazyRetry(() => import("@/components/pwa-install-prompt").then(m => ({ default: m.PWAInstallPrompt })));

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowLeftRight, ArrowUpDown, Award,
  Banknote, BarChart3, Beaker, Bell, BellRing, Blocks, BookOpen, Bot, Boxes, Brain, Briefcase, Building2,
  Calculator, Calendar, CalendarDays, Check, CheckCheck, CheckCircle2, CheckSquare, ChevronDown,
  CircleDot, ClipboardCheck, ClipboardList, Clock, Cog, Copy, Cpu, CreditCard,
  Database, DollarSign, Eye, Factory, FileBarChart, FileCheck, FileCode, FileText, Flag,
  FolderArchive, FolderCog, FolderKanban, FolderOpen, FolderTree, FormInput, Funnel, Gauge, GitBranch, GitCompare, Globe,
  GraduationCap, Headphones, Heart, History, Image, Key, Landmark, Layers, LayoutDashboard, LayoutGrid,
  LayoutList, LayoutTemplate, Lightbulb, Link2, List, Lock, LogIn, LogOut,
  Mail, Map: MapIcon, MapPin, Megaphone, Menu, MenuSquare, MessageCircle, MessageSquare, Moon,
  MousePointer, MousePointerClick, Package, PackageCheck, PenTool, Percent, Phone, PiggyBank, Plug, Puzzle,
  Receipt, RotateCcw, Ruler, Scale, Search, SearchCode, Send, Server, Settings, Share2,
  Shield, ShieldAlert, ShieldCheck, Ship, ShoppingCart, Smartphone, Sparkles, Star,
  Table2, Target, TestTube, TextCursorInput, ThumbsUp, TrendingDown, TrendingUp, Truck,
  Upload, User, UserPlus, Users, Users2, Wallet, Warehouse, Wrench, X, Zap,
  Anchor, BookMarked, Combine, Compass, Container, FileBadge, FileSignature, FlaskConical,
  Fuel, Gavel, Gem, Hammer, Handshake, HardHat, Leaf, Medal, Microscope, Presentation,
  Radiation, Recycle, Route, ScanLine, ScrollText, ShieldQuestion, Siren, Thermometer, Timer,
  QrCode, GitMerge, Trash2, Cloud,
};

function getLucideIcon(iconName: string): React.ComponentType<{ className?: string }> {
  return ICON_MAP[iconName] || Database;
}

interface NavItem {
  href?: string;
  entitySlug?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
  subSection?: string;
  badge?: string;
  badgeTooltip?: string;
}

// מדיניות שפה: מונחים טכניים ותעשייתיים מוכרים נשארים באנגלית בכל הממשק.
// כולל: SCADA, MES, BlackRock, RFM, Customer 360, AI, ERP, CRM, KPI, NLP, ML, API, PDF, CSV, Excel.
// כל שאר התוכן מוצג בעברית.
export const NAV_ITEMS: NavItem[] = [
    // ═══════════════ 1. ראשי ═══════════════
    { href: "/", label: "דשבורד מנהלים", icon: LayoutDashboard, section: "ראשי" },
    { href: "/platform", label: "סקירת פלטפורמה", icon: LayoutGrid, section: "ראשי" },
    { href: "/operations-control-center", label: "מרכז בקרה ותפעול", icon: Activity, section: "ראשי" },
    { href: "/alert-terminal", label: "טרמינל התראות", icon: Bell, section: "ראשי" },
    { href: "/analytics", label: "אנליטיקה מתקדמת", icon: BarChart3, section: "ראשי" },
    { href: "/calendar", label: "יומן אישי", icon: CalendarDays, section: "ראשי" },
    // ─── ראשי ───
    { href: "/chat", label: "צ'אט ארגוני", icon: MessageCircle, section: "ראשי" },
    { href: "/claude-chat", label: "עוזי AI צ'אט", icon: MessageSquare, section: "ראשי" },
    { href: "/meetings", label: "פגישות", icon: CalendarDays, section: "ראשי" },
    { href: "/crm/whatsapp-sms", label: "WhatsApp / מסרונים", icon: MessageSquare, section: "ראשי" },
    { href: "/crm/communications", label: "מרכז תקשורת", icon: MessageSquare, section: "ראשי" },
    { href: "/crm/email-sync", label: "סנכרון דואר אלקטרוני", icon: Mail, section: "ראשי" },

    // ═══════════════ 3. מנוע בינה מלאכותית — AI ═══════════════
    { href: "/ai-engine", label: "מרכז מנוע AI", icon: Brain, section: "מנוע בינה מלאכותית — AI" },
    { href: "/ai-engine/kobi", label: "קובי — סוכן AI", icon: Bot, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/super-agent", label: "סופר-אייג'נט", icon: Sparkles, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/chatbot", label: "צ'אטבוט AI", icon: MessageCircle, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/kimi-terminal", label: "Kimi — טרמינל", icon: Moon, section: "מנוע בינה מלאכותית — AI", subSection: "Kimi" },
    { href: "/ai-engine/kimi", label: "Kimi — בינה מלאכותית", icon: Brain, section: "מנוע בינה מלאכותית — AI", subSection: "Kimi" },
    { href: "/ai-document-processor", label: "עיבוד מסמכים AI", icon: Sparkles, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/predictive", label: "אנליטיקה חזויה", icon: TrendingUp, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/nl-query", label: "שאילתות שפה טבעית", icon: MessageSquare, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai/models", label: "מודלי AI", icon: Cpu, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול" },
    { href: "/ai/providers", label: "ספקי AI", icon: Plug, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול" },
    { href: "/ai/prompt-templates", label: "תבניות פרומפט", icon: FileText, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול" },
    { href: "/ai-engine/admin-settings", label: "הגדרות מנוע AI", icon: Settings, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול" },
    { href: "/ai-engine/ai-audit-log", label: "יומן ביקורת AI", icon: Shield, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול" },

    // ─── ראשי ───
    { href: "/executive/ceo-dashboard", label: "דשבורד מנכ\"ל", icon: LayoutDashboard, section: "ראשי" },
    { href: "/executive/kpi-board", label: "דשבורד KPI", icon: Target, section: "ראשי" },
    { href: "/executive/scorecard", label: "כרטיס ניקוד", icon: Presentation, section: "ראשי" },
    { href: "/executive/financial-risk", label: "ניטור סיכון פיננסי", icon: AlertTriangle, section: "ראשי" },
    { href: "/executive/live-alerts", label: "התראות בזמן אמת", icon: Bell, section: "ראשי" },
    { href: "/executive/company-health", label: "בריאות הארגון", icon: Activity, section: "ראשי" },
    { href: "/executive/profitability", label: "רווחיות ניהולית", icon: TrendingUp, section: "ראשי" },
    { href: "/executive/war-room", label: "חדר מצב", icon: Scale, section: "ראשי" },

    // ═══════════════ 5. לקוחות ומכירות ═══════════════
    { href: "/crm", label: "דשבורד לקוחות", icon: Users, section: "לקוחות ומכירות" },
    { href: "/crm/leads", label: "לידים", icon: Target, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/customers", label: "ניהול לקוחות", icon: Users, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/quotations", label: "הצעות מחיר", icon: FileText, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/orders", label: "הזמנות מכירה", icon: ShoppingCart, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/pipeline", label: "צינור מכירות", icon: FolderKanban, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/forecast", label: "תחזית מכירות", icon: TrendingUp, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/segmentation", label: "פילוח לקוחות", icon: Funnel, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/contacts", label: "אנשי קשר", icon: Users, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/pipeline", label: "פייפליין", icon: FolderKanban, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/support/tickets", label: "כרטיסי תמיכה", icon: Headphones, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/crm/sla", label: "הסכמי רמת שירות", icon: Clock, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/crm/pricing", label: "תמחור מתקדם", icon: Calculator, section: "לקוחות ומכירות", subSection: "תמחור" },
    { href: "/crm/collections", label: "גבייה", icon: CreditCard, section: "לקוחות ומכירות", subSection: "תמחור" },

    // ═══════════════ 6. כספים ═══════════════
    { href: "/finance", label: "דשבורד כספים", icon: DollarSign, section: "כספים" },
    { href: "/finance/invoices", label: "חשבוניות", icon: Receipt, section: "כספים", subSection: "חייבים" },
    { href: "/finance/receipts", label: "קבלות", icon: Receipt, section: "כספים", subSection: "חייבים" },
    { href: "/finance/credit-notes", label: "זיכויים", icon: FileText, section: "כספים", subSection: "חייבים" },
    { href: "/finance/customer-aging", label: "גיול לקוחות", icon: Clock, section: "כספים", subSection: "חייבים" },
    { href: "/finance/income", label: "הכנסות", icon: TrendingUp, section: "כספים", subSection: "חייבים" },
    { href: "/finance/suppliers/invoices", label: "חשבוניות ספקים", icon: FileText, section: "כספים", subSection: "זכאים" },
    { href: "/finance/suppliers/payments", label: "תשלומים לספקים", icon: Banknote, section: "כספים", subSection: "זכאים" },
    { href: "/finance/supplier-aging", label: "גיול זכאים", icon: Clock, section: "כספים", subSection: "זכאים" },
    { href: "/finance/payment-runs", label: "ריצות תשלום", icon: Zap, section: "כספים", subSection: "זכאים" },
    { href: "/finance/bank-reconciliation", label: "התאמות בנק", icon: Landmark, section: "כספים", subSection: "בנק וקופה" },
    { href: "/finance/cash-flow", label: "תזרים מזומנים", icon: TrendingUp, section: "כספים", subSection: "בנק וקופה" },
    { href: "/finance/petty-cash", label: "קופה קטנה", icon: Wallet, section: "כספים", subSection: "בנק וקופה" },
    { href: "/finance/journal-entries", label: "יומן תנועות", icon: BookOpen, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/chart-of-accounts", label: "עץ חשבונות", icon: FolderTree, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/trial-balance", label: "מאזן בוחן", icon: Scale, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/general-ledger", label: "ספר חשבונות", icon: BookOpen, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/fixed-assets", label: "רכוש קבוע", icon: Building2, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/vat-report", label: "דוח מע\"מ", icon: Percent, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/profit-loss", label: "רווח והפסד", icon: TrendingUp, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/balance-sheet", label: "מאזן", icon: Scale, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/withholding-tax", label: "ניכויים במקור", icon: FileText, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/budgets", label: "תקציב שנתי", icon: PiggyBank, section: "כספים", subSection: "תקציב" },
    { href: "/finance/budget-vs-actual", label: "ביצוע מול תקציב", icon: Target, section: "כספים", subSection: "תקציב" },
    { href: "/finance/expense-reports", label: "הוצאות", icon: Receipt, section: "כספים", subSection: "תקציב" },
    { href: "/pricing/cost-calculator", label: "תמחור מוצרים", icon: Calculator, section: "כספים", subSection: "תמחור" },
    { href: "/pricing/price-lists", label: "מחירונים", icon: List, section: "כספים", subSection: "תמחור" },
    { href: "/pricing/collection-management", label: "גבייה", icon: CreditCard, section: "כספים", subSection: "תמחור" },

    // ─── תפעול ───
    { href: "/procurement-dashboard", label: "דשבורד רכש", icon: Gauge, section: "תפעול" },
    { href: "/purchase-requests", label: "בקשות רכש", icon: ClipboardList, section: "תפעול", subSection: "הזמנות" },
    { href: "/purchase-orders", label: "הזמנות רכש", icon: ShoppingCart, section: "תפעול", subSection: "הזמנות" },
    { href: "/goods-receipt", label: "קבלת סחורה", icon: PackageCheck, section: "תפעול", subSection: "הזמנות" },
    { href: "/purchase-approvals", label: "אישורי רכש", icon: ShieldCheck, section: "תפעול", subSection: "הזמנות" },
    { href: "/procurement/three-way-matching", label: "התאמה תלת-כיוונית", icon: GitCompare, section: "תפעול", subSection: "הזמנות" },
    { href: "/suppliers", label: "ספקים מקומיים", icon: Truck, section: "תפעול", subSection: "ספקים" },
    { href: "/foreign-suppliers", label: "ספקים בחו\"ל", icon: Globe, section: "תפעול", subSection: "ספקים" },
    { href: "/supplier-evaluations", label: "דירוג ספקים", icon: Star, section: "תפעול", subSection: "ספקים" },
    { href: "/import-dashboard", label: "דשבורד ייבוא", icon: Gauge, section: "תפעול", subSection: "ייבוא" },
    { href: "/shipment-tracking", label: "מעקב משלוחים", icon: Ship, section: "תפעול", subSection: "ייבוא" },
    { href: "/customs-clearance", label: "שחרור מכס", icon: FileCheck, section: "תפעול", subSection: "ייבוא" },
    { href: "/exchange-rates", label: "שערי חליפין", icon: ArrowUpDown, section: "תפעול", subSection: "ייבוא" },
    { href: "/tenders", label: "ניהול מכרזים", icon: Gavel, section: "תפעול", subSection: "מכרזים" },

    // ─── תפעול ───
    { href: "/inventory/dashboard", label: "דשבורד מלאי", icon: Package, section: "תפעול" },
    { href: "/inventory", label: "ניהול מלאי", icon: Package, section: "תפעול", subSection: "מלאי" },
    { href: "/inventory/raw-material-stock", label: "מלאי חומרי גלם", icon: Boxes, section: "תפעול", subSection: "מלאי" },
    { href: "/inventory/finished-goods-stock", label: "מוצרים מוגמרים", icon: PackageCheck, section: "תפעול", subSection: "מלאי" },
    { href: "/inventory/warehouses", label: "מחסנים", icon: Warehouse, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/stock-counts", label: "ספירות מלאי", icon: ClipboardCheck, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/stock-movements", label: "תנועות מלאי", icon: ArrowLeftRight, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-barcode", label: "ברקוד ו-QR", icon: QrCode, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/expiry-alerts", label: "התראות תפוגה", icon: AlertTriangle, section: "תפעול", subSection: "מחסנים" },
    { href: "/logistics", label: "דשבורד לוגיסטיקה", icon: Compass, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/fleet", label: "צי רכב", icon: Truck, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/routes", label: "תכנון מסלולים", icon: Route, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/delivery-scheduling", label: "תזמון משלוחים", icon: CalendarDays, section: "תפעול", subSection: "לוגיסטיקה" },

    // ─── ייצור ופרויקטים ───
    { href: "/production/dashboard", label: "דשבורד ייצור", icon: Factory, section: "ייצור ופרויקטים" },
    { href: "/production/mes", label: "מערכת הנהלת ייצור (MES)", icon: Activity, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/production-planning", label: "תכנון ייצור", icon: CalendarDays, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/kanban", label: "לוח קנבן", icon: FolderKanban, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/quality-control", label: "בקרת איכות", icon: ShieldCheck, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/maintenance", label: "תחזוקה", icon: Wrench, section: "ייצור ופרויקטים", subSection: "תחזוקה" },
    { href: "/production/cmms", label: "ניהול תחזוקה ממוחשב (CMMS)", icon: Gauge, section: "ייצור ופרויקטים", subSection: "תחזוקה" },
    { href: "/production/reports", label: "דוחות ייצור", icon: FileBarChart, section: "ייצור ופרויקטים", subSection: "דוחות" },
    { href: "/production/oee-dashboard", label: "דשבורד OEE", icon: Gauge, section: "ייצור ופרויקטים", subSection: "דוחות" },
    { href: "/installations/calendar", label: "יומן התקנות", icon: CalendarDays, section: "ייצור ופרויקטים", subSection: "התקנות" },
    { href: "/installations/facilities", label: "ניהול מתקנים", icon: Building2, section: "ייצור ופרויקטים", subSection: "התקנות" },
    { href: "/installations/work", label: "עבודות התקנה", icon: Wrench, section: "ייצור ופרויקטים", subSection: "התקנות" },
    { href: "/assets", label: "ניהול נכסים", icon: Gem, section: "ייצור ופרויקטים", subSection: "נכסים" },
    { href: "/assets/tools-dies", label: "כלים ותבניות", icon: Hammer, section: "ייצור ופרויקטים", subSection: "נכסים" },

    // ─── ייצור ופרויקטים ───
    { href: "/projects/dashboard", label: "דשבורד פרויקטים", icon: Briefcase, section: "ייצור ופרויקטים" },
    { href: "/projects", label: "פרויקטים", icon: FolderKanban, section: "ייצור ופרויקטים" },
    { href: "/projects/gantt", label: "גאנט", icon: CalendarDays, section: "ייצור ופרויקטים" },
    { href: "/projects/tasks", label: "משימות", icon: CheckSquare, section: "ייצור ופרויקטים" },
    { href: "/projects/milestones", label: "אבני דרך", icon: Flag, section: "ייצור ופרויקטים" },
    { href: "/projects/resources", label: "משאבים", icon: Users, section: "ייצור ופרויקטים" },
    { href: "/projects/budget", label: "תקציב פרויקט", icon: DollarSign, section: "ייצור ופרויקטים" },
    { href: "/projects/risks", label: "סיכונים", icon: AlertCircle, section: "ייצור ופרויקטים" },
    { href: "/projects/timesheets", label: "דיווחי שעות", icon: Clock, section: "ייצור ופרויקטים" },
    { href: "/projects/portfolio", label: "תיק פרויקטים", icon: BarChart3, section: "ייצור ופרויקטים" },

    // ═══════════════ 11. משאבי אנוש ═══════════════
    { href: "/hr", label: "דשבורד משאבי אנוש", icon: Users, section: "משאבי אנוש" },
    { href: "/hr/employees", label: "עובדים", icon: Building2, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/org-chart", label: "מבנה ארגוני", icon: Network, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/payroll", label: "שכר", icon: DollarSign, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/payroll-engine", label: "מנוע שכר", icon: Calculator, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/payslips", label: "תלושי שכר", icon: Receipt, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/bonuses", label: "בונוסים", icon: Award, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/attendance", label: "נוכחות", icon: Clock, section: "משאבי אנוש", subSection: "נוכחות" },
    { href: "/hr/leaves", label: "חופשות", icon: CalendarDays, section: "משאבי אנוש", subSection: "נוכחות" },
    { href: "/hr/shifts", label: "משמרות", icon: Timer, section: "משאבי אנוש", subSection: "נוכחות" },
    { href: "/hr/recruitment", label: "גיוס עובדים", icon: Briefcase, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/onboarding", label: "קליטת עובד", icon: UserPlus, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/training", label: "הדרכות", icon: GraduationCap, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/performance-reviews", label: "הערכות ביצוע", icon: Star, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },

    // ─── איכות, מסמכים ודוחות ───
    { href: "/quality", label: "דשבורד איכות", icon: Award, section: "איכות, מסמכים ודוחות" },
    { href: "/quality/iso", label: "ניהול ISO", icon: FileBadge, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/quality/capa", label: "תיקון ומניעה (CAPA)", icon: ShieldCheck, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/quality/internal-audit", label: "ביקורת פנימית", icon: ClipboardCheck, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/quality/testing-lab", label: "מעבדת בדיקות", icon: FlaskConical, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/ehs", label: "בטיחות וסביבה (EHS)", icon: ShieldAlert, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/incidents", label: "אירועי בטיחות", icon: Siren, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/risk-assessment", label: "הערכת סיכונים", icon: AlertTriangle, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/hazardous-materials", label: "חומרים מסוכנים", icon: Radiation, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/safety/training", label: "הדרכות בטיחות", icon: GraduationCap, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },

    // ─── איכות, מסמכים ודוחות ───
    { href: "/documents", label: "ספריית מסמכים", icon: FolderKanban, section: "איכות, מסמכים ודוחות" },
    { href: "/documents/upload", label: "העלאת מסמכים", icon: Upload, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },
    { href: "/documents/templates", label: "תבניות", icon: LayoutTemplate, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },
    { href: "/contracts/ai-analysis", label: "ניתוח חוזים AI", icon: Brain, section: "איכות, מסמכים ודוחות", subSection: "חוזים" },
    { href: "/knowledge", label: "בסיס ידע", icon: BookMarked, section: "איכות, מסמכים ודוחות", subSection: "ידע" },
    { href: "/knowledge/sop", label: "נהלי עבודה (SOP)", icon: ScrollText, section: "איכות, מסמכים ודוחות", subSection: "ידע" },

    // ─── איכות, מסמכים ודוחות ───
    { href: "/reports", label: "מרכז דוחות", icon: BarChart3, section: "איכות, מסמכים ודוחות" },
    { href: "/reports/financial", label: "דוחות פיננסיים", icon: DollarSign, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/operational", label: "דוחות תפעוליים", icon: Activity, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/kpis", label: "דשבורד KPI", icon: Target, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/bi", label: "מרכז BI", icon: PieChart, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/bi/custom-dashboards", label: "דשבורדים מותאמים", icon: Presentation, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/bi/data-explorer", label: "חוקר נתונים", icon: SearchCode, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/bi/scheduled-reports", label: "דוחות מתוזמנים", icon: FileBarChart, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/marketing", label: "דשבורד שיווק", icon: Megaphone, section: "איכות, מסמכים ודוחות", subSection: "שיווק" },
    { href: "/marketing/campaigns", label: "קמפיינים", icon: Megaphone, section: "איכות, מסמכים ודוחות", subSection: "שיווק" },
    { href: "/strategy/planning", label: "תכנון אסטרטגי", icon: Target, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
    { href: "/strategy/okrs", label: "יעדים ותוצאות (OKR)", icon: CheckSquare, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },

    // ─── מנהלת מערכת ───
    { href: "/builder", label: "דשבורד בונה", icon: Blocks, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/modules", label: "מודולים", icon: Blocks, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/entities", label: "ישויות", icon: Database, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/fields", label: "שדות", icon: TextCursorInput, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/forms", label: "טפסים", icon: FormInput, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/automations", label: "אוטומציות", icon: Sparkles, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/workflows", label: "תהליכים", icon: Zap, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/permissions", label: "הרשאות ותפקידים", icon: Shield, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/report-builder", label: "בונה דוחות", icon: BarChart3, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/ai-builder", label: "בונה AI", icon: Brain, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/audit-log", label: "יומן ביקורת", icon: SearchCode, section: "מנהלת מערכת", subSection: "כלים" },

    // ─── מנהלת מערכת ───
    { href: "/settings", label: "הגדרות כלליות", icon: Settings, section: "מנהלת מערכת", subSection: "כלליות" },
    { href: "/settings?tab=users", label: "משתמשים", icon: Users, section: "מנהלת מערכת", subSection: "כלליות" },
    { href: "/permissions", label: "הרשאות", icon: Shield, section: "מנהלת מערכת", subSection: "כלליות" },
    { href: "/settings/roles", label: "תפקידים", icon: Briefcase, section: "מנהלת מערכת", subSection: "כלליות" },
    { href: "/integrations-hub", label: "אינטגרציות", icon: Plug, section: "מנהלת מערכת", subSection: "אינטגרציות" },
    { href: "/settings/webhooks", label: "התראות אוטומטיות (Webhooks)", icon: Globe, section: "מנהלת מערכת", subSection: "אינטגרציות" },
    { href: "/settings/api-keys", label: "מפתחות API", icon: Key, section: "מנהלת מערכת", subSection: "אינטגרציות" },
    { href: "/settings/api-connection-hub", label: "Smart API Connection Hub", icon: Plug, section: "מנהלת מערכת", subSection: "אינטגרציות" },
    { href: "/settings/integration-hub", label: "Smart Integration Hub", icon: Bot, section: "מנהלת מערכת", subSection: "אינטגרציות" },
    { href: "/settings/api-hub", label: "API Hub — מרכז בקרה", icon: Activity, section: "מנהלת מערכת", subSection: "אינטגרציות" },
    { href: "/notification-preferences", label: "הגדרות התראות", icon: Mail, section: "מנהלת מערכת", subSection: "התראות" },
    { href: "/security", label: "מרכז אבטחה", icon: ShieldCheck, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/portal-management", label: "ניהול פורטל", icon: Globe, section: "מנהלת מערכת", subSection: "פורטלים" },
    { href: "/portal/supplier", label: "פורטל ספקים", icon: Truck, section: "מנהלת מערכת", subSection: "פורטלים" },
    { href: "/portal/employee", label: "פורטל עובדים", icon: Users, section: "מנהלת מערכת", subSection: "פורטלים" },

    // ─── מנהלת מערכת — הגדרות נוספות ───
    { href: "/settings/departments", label: "מחלקות", icon: Building2, section: "מנהלת מערכת", subSection: "כלליות" },
    { href: "/settings/triggers", label: "טריגרים", icon: Zap, section: "מנהלת מערכת", subSection: "אינטגרציות" },
    { href: "/settings/israeli-integrations", label: "אינטגרציות ישראליות", icon: Plug, section: "מנהלת מערכת", subSection: "אינטגרציות" },

    // ─── מרכז אינטגרציות (Integration Hub) ───
    { href: "/integrations/dashboard", label: "דשבורד אינטגרציות", icon: Activity, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/connectors", label: "חיבורים חיצוניים", icon: Plug, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/api-gateway", label: "API Gateway", icon: Server, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/webhooks", label: "Webhook Gateway", icon: Globe, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/event-bus", label: "Event Bus", icon: Zap, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/mcp-hub", label: "MCP Hub", icon: Bot, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/sync-jobs", label: "עבודות סנכרון", icon: Database, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/credentials", label: "כספת סודות", icon: Lock, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/auth-tokens", label: "טוקנים ומפתחות", icon: Key, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/rate-limits", label: "הגבלות קצב", icon: Gauge, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/retries-dlq", label: "ניסיונות חוזרים ו-DLQ", icon: Shield, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/transformation", label: "מנוע מיפוי", icon: GitMerge, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/payload-validation", label: "אימות Payload", icon: ShieldCheck, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/audit", label: "ביקורת אינטגרציות", icon: SearchCode, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/alerts", label: "התראות אינטגרציות", icon: Bell, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },
    { href: "/integrations/settings", label: "הגדרות אינטגרציות", icon: Settings, section: "מנהלת מערכת", subSection: "מרכז אינטגרציות" },

    { href: "/settings/import-export", label: "ייבוא/ייצוא נתונים", icon: ArrowUpDown, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/settings/backups", label: "גיבויים", icon: Shield, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/governance", label: "ממשל תאגידי", icon: Scale, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/gdpr", label: "GDPR", icon: Shield, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/retention", label: "שמירת נתונים", icon: Database, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/compliance-reports", label: "דוחות ציות", icon: FileCheck, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/encryption", label: "הצפנה", icon: ShieldCheck, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/backups", label: "גיבוי ושחזור", icon: Shield, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/api-keys", label: "מפתחות API (אבטחה)", icon: Key, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/notification-routing", label: "ניתוב התראות", icon: Bell, section: "מנהלת מערכת", subSection: "התראות" },
    { href: "/notification-settings/email-templates", label: "תבניות דוא\"ל", icon: Mail, section: "מנהלת מערכת", subSection: "התראות" },
    { href: "/notification-settings/delivery-dashboard", label: "דוח מסירות", icon: BarChart3, section: "מנהלת מערכת", subSection: "התראות" },
    { href: "/system/audit-log", label: "יומן ביקורת מערכת", icon: SearchCode, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/system/model-catalog", label: "קטלוג מודלים", icon: Cpu, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/relations", label: "קשרים", icon: GitMerge, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/views", label: "תצוגות", icon: LayoutGrid, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/details", label: "דפי פירוט", icon: FileText, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/categories", label: "קטגוריות", icon: FolderKanban, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/statuses", label: "סטטוסים", icon: CheckSquare, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/buttons", label: "כפתורים", icon: Blocks, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/actions", label: "פעולות", icon: Zap, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/validations", label: "ולידציות", icon: ShieldCheck, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/menus", label: "תפריטים", icon: List, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/dashboards", label: "דשבורדים", icon: LayoutDashboard, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/widgets", label: "ווידג'טים", icon: Blocks, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/automation-dashboard", label: "דשבורד אוטומציות", icon: Activity, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/business-rules", label: "כללי עסק", icon: Scale, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/webhook-management", label: "ניהול Webhooks", icon: Globe, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/scheduled-tasks", label: "משימות מתוזמנות", icon: Clock, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/templates", label: "תבניות", icon: LayoutTemplate, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/tools", label: "כלים", icon: Hammer, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/contexts", label: "הקשרים", icon: Brain, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/builder/publish", label: "פרסום גרסה", icon: Upload, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/menu-builder", label: "בונה תפריטים", icon: List, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/document-builder", label: "בונה מסמכים", icon: FileText, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/integration-builder", label: "בונה אינטגרציות", icon: Plug, section: "מנהלת מערכת", subSection: "אינטגרציות" },
    { href: "/platform/data-flow-automations", label: "אוטומציות זרימת נתונים", icon: GitMerge, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/platform/approval-chains", label: "שרשראות אישור", icon: ShieldCheck, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/platform/sla-dashboard", label: "דשבורד SLA", icon: Gauge, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/platform/recycle-bin", label: "סל מחזור", icon: Trash2, section: "מנהלת מערכת", subSection: "כלים" },

    // ─── מנוע בינה מלאכותית — AI נוסף ───
    { href: "/ai-engine/lead-scoring", label: "ניקוד לידים AI", icon: Target, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/call-nlp", label: "ניתוח שיחות NLP", icon: MessageSquare, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/predictive-analytics", label: "אנליטיקה חזויה", icon: TrendingUp, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/chatbot-settings", label: "הגדרות צ'אטבוט", icon: Settings, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/kobi-ide", label: "קובי IDE", icon: Bot, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/kobi-prompts", label: "פרומפטים של קובי", icon: FileText, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/cross-module", label: "עסקאות בין-מודולאריות", icon: GitMerge, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/kimi-challenges", label: "אתגרי Kimi", icon: Moon, section: "מנוע בינה מלאכותית — AI", subSection: "Kimi" },
    { href: "/ai-engine/ml-pipeline", label: "צינור ML", icon: Activity, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/employee-chatbot", label: "צ'אטבוט עובדים", icon: MessageCircle, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/sentiment-analysis", label: "ניתוח סנטימנט", icon: Brain, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/recommendations", label: "המלצות AI", icon: Sparkles, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/automated-reports", label: "דוחות אוטומטיים", icon: FileBarChart, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/anomaly-detection", label: "זיהוי חריגות", icon: AlertTriangle, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/customer-service", label: "שירות לקוחות AI", icon: Headphones, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/customer-service-pro", label: "שירות לקוחות Pro", icon: Headphones, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/executive-insights", label: "תובנות מנהלים", icon: LayoutDashboard, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/follow-up", label: "מעקב אוטומטי", icon: Bell, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/lead-scoring-pro", label: "ניקוד לידים Pro", icon: Target, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/procurement-optimizer", label: "אופטימיזציית רכש", icon: ShoppingCart, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/production-insights", label: "תובנות ייצור", icon: Factory, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai-engine/quotation-assistant", label: "עוזר הצעות מחיר", icon: FileText, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-engine/sales-assistant", label: "עוזר מכירות", icon: TrendingUp, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai-settings", label: "הגדרות AI", icon: Settings, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול" },
    { href: "/ai/api-keys", label: "מפתחות API של AI", icon: Key, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול" },
    { href: "/ai/queries", label: "שאילתות AI", icon: SearchCode, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול" },
    { href: "/ai/responses", label: "תגובות AI", icon: MessageSquare, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול" },
    { href: "/ai/usage-logs", label: "יומן שימוש AI", icon: FileBarChart, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול" },
    { href: "/ai/sales-assistant", label: "עוזר מכירות AI", icon: TrendingUp, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai/lead-scoring", label: "ניקוד לידים AI", icon: Target, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/hi-tech-dashboard", label: "דשבורד Hi-Tech", icon: Cpu, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/project-analyses", label: "ניתוחי פרויקטים", icon: BarChart3, section: "ייצור ופרויקטים", subSection: "דוחות" },

    // ─── כספים נוסף ───
    { href: "/finance/expenses", label: "הוצאות", icon: Receipt, section: "כספים", subSection: "תקציב" },
    { href: "/finance/expense-items", label: "פריטי הוצאות", icon: Receipt, section: "כספים", subSection: "תקציב" },
    { href: "/finance/expense-upload", label: "העלאת הוצאות", icon: Upload, section: "כספים", subSection: "תקציב" },
    { href: "/finance/expense-filing", label: "תיוק הוצאות", icon: FileText, section: "כספים", subSection: "תקציב" },
    { href: "/finance/expense-files", label: "קבצי הוצאות", icon: FileText, section: "כספים", subSection: "תקציב" },
    { href: "/finance/blackrock-2026", label: "BlackRock 2026", icon: BarChart3, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/blackrock-monte-carlo", label: "BlackRock Monte Carlo", icon: Activity, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/blackrock-var", label: "BlackRock VaR", icon: AlertTriangle, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/blackrock-risk-matrix", label: "BlackRock מטריצת סיכון", icon: Scale, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/blackrock-hedging", label: "BlackRock גידור", icon: ShieldCheck, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/blackrock-ai", label: "BlackRock AI", icon: Brain, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/payment-anomalies", label: "חריגות תשלום", icon: AlertTriangle, section: "כספים", subSection: "זכאים" },
    { href: "/finance/credit-card-processing", label: "עיבוד כרטיסי אשראי", icon: CreditCard, section: "כספים", subSection: "בנק וקופה" },
    { href: "/finance/accounting-portal", label: "פורטל הנהלת חשבונות", icon: BookOpen, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/reports", label: "דוחות כספיים", icon: FileBarChart, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/income-expenses-report", label: "דוח הכנסות והוצאות", icon: TrendingUp, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/accounting-reports", label: "דוחות חשבונאות", icon: FileBarChart, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/debtors-balances", label: "יתרות חייבים", icon: DollarSign, section: "כספים", subSection: "חייבים" },
    { href: "/finance/operational-profit", label: "רווח תפעולי", icon: TrendingUp, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/accounting-settings", label: "הגדרות חשבונאות", icon: Settings, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/standing-orders", label: "הוראות קבע", icon: Clock, section: "כספים", subSection: "בנק וקופה" },
    { href: "/finance/journal", label: "יומן", icon: BookOpen, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/tax-management", label: "ניהול מס", icon: Percent, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/israeli-integrations", label: "אינטגרציות ישראליות", icon: Plug, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/journal-transactions", label: "תנועות יומן", icon: BookOpen, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/journal-report", label: "דוח יומן", icon: FileBarChart, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/audit-control", label: "בקרת ביקורת", icon: ShieldCheck, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/working-files", label: "קבצי עבודה", icon: FileText, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/annual-report", label: "דוח שנתי", icon: FileBarChart, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/accounting-inventory", label: "מלאי חשבונאי", icon: Package, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/accounting-export", label: "ייצוא חשבונאי", icon: Upload, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/cost-centers", label: "מרכזי עלות", icon: DollarSign, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/customers/invoices", label: "חשבוניות לקוחות", icon: Receipt, section: "כספים", subSection: "חייבים" },
    { href: "/finance/customers/refunds", label: "החזרים ללקוחות", icon: ArrowUpDown, section: "כספים", subSection: "חייבים" },
    { href: "/finance/customers/payments", label: "תשלומי לקוחות", icon: CreditCard, section: "כספים", subSection: "חייבים" },
    { href: "/finance/customers/products", label: "מוצרי לקוחות", icon: Package, section: "כספים", subSection: "חייבים" },
    { href: "/finance/suppliers/credit-notes", label: "זיכויי ספקים", icon: FileText, section: "כספים", subSection: "זכאים" },
    { href: "/finance/suppliers/products", label: "מוצרי ספקים", icon: Package, section: "כספים", subSection: "זכאים" },
    { href: "/company-financials", label: "פיננסים חברה", icon: Building2, section: "כספים", subSection: "מס ודיווח" },

    // ─── לקוחות ומכירות נוסף ───
    { href: "/sales/invoices", label: "חשבוניות מכירה", icon: Receipt, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/territories", label: "אזורי מכירה", icon: MapIcon, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/commissions", label: "עמלות", icon: DollarSign, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/analytics", label: "אנליטיקת מכירות", icon: BarChart3, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/scoring", label: "ניקוד מכירות", icon: Target, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/delivery-notes", label: "תעודות משלוח", icon: Truck, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/returns", label: "החזרות מכירה", icon: ArrowUpDown, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/service", label: "שירות לקוחות", icon: Headphones, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/sales/customer-service", label: "שירות לקוחות (מכירות)", icon: Headphones, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/sales/customer-portal", label: "פורטל לקוחות", icon: Users, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/product-catalog", label: "קטלוג מוצרים", icon: Package, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/field-agents", label: "סוכני שטח", icon: Users, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/profitability", label: "רווחיות לקוחות", icon: TrendingUp, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/smart-routing", label: "ניתוב חכם", icon: Route, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/crm/automations", label: "אוטומציות CRM", icon: Zap, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/contractor-decision", label: "החלטת קבלן", icon: Scale, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/crm/ai/lead-scoring", label: "ניקוד לידים AI", icon: Target, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/ai/next-action", label: "הפעולה הבאה AI", icon: Sparkles, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/ai/predictive", label: "ניתוח חזוי CRM", icon: TrendingUp, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/ai/anomaly", label: "זיהוי חריגות CRM", icon: AlertTriangle, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/security/audit", label: "מסלול ביקורת", icon: Shield, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/security/row-security", label: "אבטחת שורות", icon: ShieldCheck, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/security/encryption", label: "הצפנת CRM", icon: Shield, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/security/sso", label: "SSO", icon: ShieldCheck, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/realtime/feeds", label: "עדכונים בזמן אמת", icon: Activity, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/realtime/notifications", label: "התראות CRM", icon: Bell, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/realtime/triggers", label: "טריגרים CRM", icon: Zap, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/realtime/sync", label: "סנכרון CRM", icon: ArrowUpDown, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/analytics/custom-reports", label: "דוחות מותאמים", icon: FileBarChart, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/analytics/trends", label: "מגמות", icon: TrendingUp, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/analytics/cohort", label: "ניתוח קבוצות", icon: Users, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/analytics/filters", label: "מסננים", icon: Funnel, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/integrations/rest-api", label: "API REST", icon: Plug, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/integrations/mobile", label: "סנכרון מובייל", icon: Smartphone, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/integrations/cloud", label: "אחסון ענן", icon: Cloud, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/integrations/webhooks", label: "Webhooks CRM", icon: Globe, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/ai-insights", label: "תובנות AI CRM", icon: Brain, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/predictive-analytics", label: "אנליטיקה חזויה CRM", icon: TrendingUp, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/lead-quality", label: "איכות לידים", icon: Target, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/realtime-feed", label: "עדכונים חיים", icon: Activity, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/advanced-search", label: "חיפוש מתקדם", icon: SearchCode, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/collaboration", label: "שיתוף פעולה", icon: Users, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/territory-management", label: "ניהול אזורים", icon: MapIcon, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/nurture", label: "סדרות ליבוי", icon: TrendingUp, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/activities", label: "פעילויות CRM", icon: Activity, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/service", label: "שירות CRM", icon: Headphones, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/crm/meetings", label: "פגישות CRM", icon: CalendarDays, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/messaging", label: "הודעות CRM", icon: MessageSquare, section: "לקוחות ומכירות", subSection: "ניהול לקוחות" },
    { href: "/crm/portal", label: "פורטל CRM", icon: Globe, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/lead-scoring", label: "ניקוד לידים", icon: Target, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/customer-service", label: "שירות לקוחות", icon: Headphones, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/ai-customer-service", label: "שירות לקוחות AI", icon: Brain, section: "לקוחות ומכירות", subSection: "שירות" },

    // ─── תפעול נוסף ───
    { href: "/price-quotes", label: "הצעות מחיר לספקים", icon: FileText, section: "תפעול", subSection: "הזמנות" },
    { href: "/price-comparison", label: "השוואת מחירים", icon: Scale, section: "תפעול", subSection: "הזמנות" },
    { href: "/purchase-returns", label: "החזרות רכש", icon: ArrowUpDown, section: "תפעול", subSection: "הזמנות" },
    { href: "/supplier-contracts", label: "חוזי ספקים", icon: FileText, section: "תפעול", subSection: "ספקים" },
    { href: "/supply-chain/edi", label: "EDI", icon: ArrowLeftRight, section: "תפעול", subSection: "ספקים" },
    { href: "/supply-chain/edi-monitor", label: "ניטור EDI", icon: Activity, section: "תפעול", subSection: "ספקים" },

    // ─── שרשרת אספקה + BOM ───
    { href: "/supply-chain/command-center", label: "מרכז פיקוד שרשרת אספקה", icon: Activity, section: "תפעול", subSection: "שרשרת אספקה" },
    { href: "/supply-chain/demand-planning", label: "תכנון ביקוש", icon: TrendingUp, section: "תפעול", subSection: "שרשרת אספקה" },
    { href: "/supply-chain/visibility", label: "נראות שרשרת אספקה", icon: Eye, section: "תפעול", subSection: "שרשרת אספקה" },
    { href: "/supply-chain/lead-times", label: "ניהול Lead Time", icon: Clock, section: "תפעול", subSection: "שרשרת אספקה" },
    { href: "/supply-chain/analytics", label: "אנליטיקת שרשרת", icon: BarChart3, section: "תפעול", subSection: "שרשרת אספקה" },
    { href: "/supply-chain/alerts", label: "התראות שרשרת אספקה", icon: Bell, section: "תפעול", subSection: "שרשרת אספקה" },
    { href: "/supply-chain/settings", label: "הגדרות שרשרת אספקה", icon: Settings, section: "תפעול", subSection: "שרשרת אספקה" },
    { href: "/supply-chain/bom-center", label: "מרכז BOM", icon: Layers, section: "תפעול", subSection: "מערכת BOM" },
    { href: "/supply-chain/bom-versions", label: "גרסאות BOM", icon: GitMerge, section: "תפעול", subSection: "מערכת BOM" },
    { href: "/supply-chain/bom-cost-rollup", label: "גלגול עלויות BOM", icon: Calculator, section: "תפעול", subSection: "מערכת BOM" },
    { href: "/supply-chain/bom-where-used", label: "Where-Used", icon: Search, section: "תפעול", subSection: "מערכת BOM" },
    { href: "/supply-chain/bom-comparison", label: "השוואת BOM", icon: Combine, section: "תפעול", subSection: "מערכת BOM" },
    { href: "/supply-chain/bom-templates", label: "תבניות BOM", icon: LayoutTemplate, section: "תפעול", subSection: "מערכת BOM" },
    { href: "/supply-chain/eco", label: "הזמנות שינוי הנדסי", icon: FileSignature, section: "תפעול", subSection: "מערכת BOM" },

    // ─── לשכת מהנדסים ───
    { href: "/engineering/command-center", label: "מרכז פיקוד הנדסה", icon: Activity, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/drawings", label: "ניהול שרטוטים", icon: FileText, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/materials", label: "מפרטי חומרים", icon: Layers, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/standards", label: "תקנים ותקינה", icon: ShieldCheck, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/calculations", label: "חישובים הנדסיים", icon: Calculator, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/product-catalog", label: "קטלוג מוצרים", icon: Blocks, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/projects", label: "פרויקטים הנדסיים", icon: FolderKanban, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/prototypes", label: "אבות טיפוס ובדיקות", icon: FlaskConical, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/design-reviews", label: "סקירות עיצוב", icon: Eye, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/documents", label: "מסמכים הנדסיים", icon: FileText, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/analytics", label: "אנליטיקת הנדסה", icon: BarChart3, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/alerts", label: "התראות הנדסה", icon: Bell, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },
    { href: "/engineering/settings", label: "הגדרות הנדסה", icon: Settings, section: "ייצור ופרויקטים", subSection: "לשכת מהנדסים" },

    // ─── מכרזים (הרחבה) ───
    { href: "/tenders/submissions", label: "הגשות מכרזים", icon: Send, section: "ייצור ופרויקטים", subSection: "מכרזים" },
    { href: "/tenders/evaluation", label: "הערכת מכרזים", icon: Scale, section: "ייצור ופרויקטים", subSection: "מכרזים" },
    { href: "/tenders/documents", label: "מסמכי מכרז", icon: FileText, section: "ייצור ופרויקטים", subSection: "מכרזים" },
    { href: "/tenders/pricing", label: "תמחור מכרזים", icon: Calculator, section: "ייצור ופרויקטים", subSection: "מכרזים" },
    { href: "/tenders/timeline", label: "לוח זמנים מכרזים", icon: Clock, section: "ייצור ופרויקטים", subSection: "מכרזים" },
    { href: "/tenders/competitors", label: "מתחרים", icon: Users, section: "ייצור ופרויקטים", subSection: "מכרזים" },
    { href: "/tenders/analytics", label: "אנליטיקת מכרזים", icon: BarChart3, section: "ייצור ופרויקטים", subSection: "מכרזים" },
    { href: "/tenders/alerts", label: "התראות מכרזים", icon: Bell, section: "ייצור ופרויקטים", subSection: "מכרזים" },

    // ─── פיתוח מוצר (הרחבה) ───
    { href: "/product-dev/command-center", label: "מרכז פיקוד מו\"פ", icon: Activity, section: "ייצור ופרויקטים", subSection: "פיתוח מוצר" },
    { href: "/product-dev/design", label: "עיצוב מוצר", icon: Presentation, section: "ייצור ופרויקטים", subSection: "פיתוח מוצר" },
    { href: "/product-dev/certifications", label: "הסמכות מוצר", icon: Medal, section: "ייצור ופרויקטים", subSection: "פיתוח מוצר" },
    { href: "/product-dev/launches", label: "השקות מוצרים", icon: Zap, section: "ייצור ופרויקטים", subSection: "פיתוח מוצר" },
    { href: "/import-orders", label: "הזמנות ייבוא", icon: Ship, section: "תפעול", subSection: "ייבוא" },
    { href: "/letters-of-credit", label: "אשראי דוקומנטרי", icon: FileText, section: "תפעול", subSection: "ייבוא" },
    { href: "/import-cost-calculator", label: "מחשבון עלות ייבוא", icon: Calculator, section: "תפעול", subSection: "ייבוא" },
    { href: "/compliance-certificates", label: "תעודות ציות", icon: FileBadge, section: "תפעול", subSection: "ייבוא" },
    { href: "/procurement-ai", label: "AI רכש", icon: Brain, section: "תפעול", subSection: "הזמנות" },
    { href: "/procurement/profitability", label: "רווחיות רכש", icon: TrendingUp, section: "תפעול", subSection: "הזמנות" },
    { href: "/procurement/competitors", label: "מתחרים", icon: Users, section: "תפעול", subSection: "הזמנות" },
    { href: "/procurement/risk-hedging", label: "גידור סיכון", icon: ShieldAlert, section: "תפעול", subSection: "הזמנות" },
    { href: "/procurement/rfq-management", label: "ניהול בקשות הצעות", icon: ClipboardList, section: "תפעול", subSection: "הזמנות" },
    { href: "/procurement/landed-cost", label: "עלות נחיתה", icon: DollarSign, section: "תפעול", subSection: "ייבוא" },
    { href: "/procurement/po-approval-workflow", label: "תהליך אישור הזמנות", icon: ShieldCheck, section: "תפעול", subSection: "הזמנות" },
    { href: "/procurement/requisitions", label: "דרישות רכש", icon: ClipboardList, section: "תפעול", subSection: "הזמנות" },
    { href: "/procurement/spend-analysis", label: "ניתוח הוצאות", icon: BarChart3, section: "תפעול", subSection: "הזמנות" },
    { href: "/procurement/vendor-evaluation", label: "הערכת ספקים", icon: Star, section: "תפעול", subSection: "ספקים" },
    { href: "/procurement/po-approvals", label: "אישורי הזמנות", icon: ShieldCheck, section: "תפעול", subSection: "הזמנות" },
    { href: "/import/cost-calculator", label: "מחשבון עלויות ייבוא", icon: Calculator, section: "תפעול", subSection: "ייבוא" },
    { href: "/import/insurance", label: "ביטוח ייבוא", icon: Shield, section: "תפעול", subSection: "ייבוא" },
    { href: "/supplier-communications", label: "תקשורת ספקים", icon: MessageSquare, section: "תפעול", subSection: "ספקים" },
    { href: "/supplier-mgmt/scorecards", label: "כרטיסי ניקוד ספקים", icon: Star, section: "תפעול", subSection: "ספקים" },
    { href: "/supplier-mgmt/development", label: "פיתוח ספקים", icon: TrendingUp, section: "תפעול", subSection: "ספקים" },
    { href: "/supplier-mgmt/compliance", label: "ציות ספקים", icon: ShieldCheck, section: "תפעול", subSection: "ספקים" },
    { href: "/supplier-mgmt/risk", label: "סיכון שרשרת אספקה", icon: AlertTriangle, section: "תפעול", subSection: "ספקים" },
    { href: "/import-management", label: "ניהול ייבוא", icon: Ship, section: "תפעול", subSection: "ייבוא" },
    { href: "/tenders/bid-analysis", label: "ניתוח הצעות", icon: Scale, section: "תפעול", subSection: "מכרזים" },
    { href: "/inventory/reorder-intelligence", label: "בינה להזמנה מחדש", icon: Brain, section: "תפעול", subSection: "מלאי" },
    { href: "/inventory/vmi-management", label: "ניהול VMI", icon: Package, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/warehouse-locations", label: "מיקומי מחסן", icon: Warehouse, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-location-hierarchy", label: "היררכיית מיקומים", icon: FolderTree, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-stock-inquiry", label: "בירור מלאי", icon: SearchCode, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-valuation", label: "הערכת שווי מלאי", icon: DollarSign, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-lot-traceability", label: "מעקב לוטים", icon: QrCode, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-expiry-dashboard", label: "דשבורד תפוגה", icon: AlertTriangle, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-analytics", label: "אנליטיקת מחסן", icon: BarChart3, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-cycle-counting", label: "ספירה מחזורית", icon: ClipboardCheck, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-pick-pack-ship", label: "איסוף, אריזה ומשלוח", icon: PackageCheck, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-putaway-rules", label: "כללי הכנסה למחסן", icon: Warehouse, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-transfer-orders", label: "הזמנות העברה", icon: ArrowLeftRight, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-kits", label: "ערכות", icon: Boxes, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-consignment", label: "קונסיגנציה", icon: Package, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/wms-cross-docking", label: "Cross Docking", icon: ArrowLeftRight, section: "תפעול", subSection: "מחסנים" },
    { href: "/inventory/vmi-supplier-portal", label: "פורטל ספקים VMI", icon: Truck, section: "תפעול", subSection: "מחסנים" },
    { href: "/data-migration", label: "העברת נתונים", icon: ArrowUpDown, section: "מנהלת מערכת", subSection: "כלים" },

    // ─── ייצור ופרויקטים נוסף ───
    { href: "/production/scada", label: "מערכת SCADA", icon: Activity, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/gantt", label: "גאנט ייצור", icon: CalendarDays, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/work-orders", label: "הוראות עבודה", icon: ClipboardList, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/bom", label: "מפרט חומרים (BOM)", icon: FolderTree, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/quality-inspections", label: "בדיקות איכות", icon: ShieldCheck, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/safety", label: "בטיחות ייצור", icon: ShieldAlert, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/bom-tree", label: "עץ BOM", icon: FolderTree, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/quality-control-ent", label: "בקרת איכות ארגונית", icon: ShieldCheck, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/work-instructions-ent", label: "הוראות עבודה ארגוניות", icon: ScrollText, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/production-lines", label: "קווי ייצור", icon: Activity, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/ncr-reports", label: "דוחות NCR", icon: AlertTriangle, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/equipment", label: "ניהול ציוד", icon: Wrench, section: "ייצור ופרויקטים", subSection: "תחזוקה" },
    { href: "/production/installers", label: "מתקינים", icon: Hammer, section: "ייצור ופרויקטים", subSection: "התקנות" },
    { href: "/production/installations", label: "התקנות", icon: Wrench, section: "ייצור ופרויקטים", subSection: "התקנות" },
    { href: "/production/quality-checklists", label: "רשימות איכות", icon: ClipboardCheck, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/corrective-actions", label: "פעולות מתקנות", icon: ShieldCheck, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/product-design", label: "עיצוב מוצר", icon: Lightbulb, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/product-testing", label: "בדיקות מוצר", icon: FlaskConical, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/prototypes", label: "אבות טיפוס", icon: Lightbulb, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/output-report", label: "דוח תפוקה", icon: FileBarChart, section: "ייצור ופרויקטים", subSection: "דוחות" },
    { href: "/production/efficiency-report", label: "דוח יעילות", icon: TrendingUp, section: "ייצור ופרויקטים", subSection: "דוחות" },
    { href: "/production/waste-report", label: "דוח פסולת", icon: Trash2, section: "ייצור ופרויקטים", subSection: "דוחות" },
    { href: "/production/cost-report", label: "דוח עלויות", icon: DollarSign, section: "ייצור ופרויקטים", subSection: "דוחות" },
    { href: "/production/batch-serial-tracking", label: "מעקב אצווה/סידורי", icon: QrCode, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/mrp-planning", label: "תכנון MRP", icon: CalendarDays, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/tool-management", label: "ניהול כלים", icon: Hammer, section: "ייצור ופרויקטים", subSection: "תחזוקה" },
    { href: "/production/machine-maintenance", label: "תחזוקת מכונות", icon: Wrench, section: "ייצור ופרויקטים", subSection: "תחזוקה" },
    { href: "/field-measurements", label: "מדידות שטח", icon: Compass, section: "ייצור ופרויקטים", subSection: "התקנות" },
    { href: "/installation/installers", label: "מתקינים", icon: Hammer, section: "ייצור ופרויקטים", subSection: "התקנות" },
    { href: "/installation/field", label: "שטח", icon: Compass, section: "ייצור ופרויקטים", subSection: "התקנות" },
    { href: "/installation/measurements", label: "מדידות", icon: Compass, section: "ייצור ופרויקטים", subSection: "התקנות" },
    { href: "/document-control", label: "בקרת מסמכים", icon: FileCheck, section: "ייצור ופרויקטים", subSection: "דוחות" },
    { href: "/bom-products", label: "מוצרי BOM", icon: Package, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/installations/assets", label: "נכסי התקנה", icon: Gem, section: "ייצור ופרויקטים", subSection: "נכסים" },
    { href: "/installations/gps-map", label: "מפת GPS", icon: MapPin, section: "ייצור ופרויקטים", subSection: "התקנות" },
    { href: "/fabrication/profiles", label: "פרופילים", icon: Package, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/systems", label: "מערכות", icon: Blocks, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/glass-catalog", label: "קטלוג זכוכית", icon: Package, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/finishes-colors", label: "גמרים וצבעים", icon: Package, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/accessories", label: "אביזרים", icon: Package, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/cutting-lists", label: "רשימות חיתוך", icon: ClipboardList, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/assembly-orders", label: "הוראות הרכבה", icon: ClipboardList, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/welding-orders", label: "הוראות ריתוך", icon: ClipboardList, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/coating-orders", label: "הוראות ציפוי", icon: ClipboardList, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/glazing-orders", label: "הוראות זיגוג", icon: ClipboardList, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/packing-lists", label: "רשימות אריזה", icon: PackageCheck, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/transport-orders", label: "הוראות הובלה", icon: Truck, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/installation-orders", label: "הוראות התקנה", icon: Wrench, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/service-tickets", label: "כרטיסי שירות", icon: Headphones, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/fabrication/workflow-tracker", label: "מעקב תהליך", icon: Activity, section: "ייצור ופרויקטים", subSection: "ייצור" },
    { href: "/projects/subcontractors", label: "קבלני משנה", icon: Users, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/real-estate/kiryati10", label: "קריית יובל 10", icon: Building2, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/real-estate/units", label: "יחידות נדל\"ן", icon: Building2, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/real-estate/permits", label: "היתרים", icon: FileCheck, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/real-estate/contractors", label: "קבלנים", icon: Users, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/risk-dashboard", label: "דשבורד סיכונים", icon: AlertCircle, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/change-orders", label: "הוראות שינוי", icon: ArrowUpDown, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/documents", label: "מסמכי פרויקט", icon: FileText, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/templates", label: "תבניות פרויקט", icon: LayoutTemplate, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/portal", label: "פורטל פרויקטים", icon: Globe, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/earned-value", label: "ערך מוגשם", icon: TrendingUp, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/resource-planning", label: "תכנון משאבים", icon: Users, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/risk-register", label: "רשם סיכונים", icon: AlertCircle, section: "ייצור ופרויקטים", subSection: "פרויקטים" },
    { href: "/projects/customer-portal", label: "פורטל לקוח - פרויקטים", icon: Users, section: "ייצור ופרויקטים", subSection: "פרויקטים" },

    // ─── משאבי אנוש נוסף ───
    { href: "/hr/employee-portfolio", label: "תיק עובד", icon: Users, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/payroll-center", label: "מרכז שכר", icon: DollarSign, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/employee-value", label: "ערך עובד", icon: TrendingUp, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/contractors", label: "קבלנים", icon: Users, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/leave-management", label: "ניהול חופשות", icon: CalendarDays, section: "משאבי אנוש", subSection: "נוכחות" },
    { href: "/hr/skills-matrix", label: "מטריצת מיומנויות", icon: Network, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/compliance-dashboard", label: "דשבורד ציות", icon: ShieldCheck, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/benefits", label: "הטבות", icon: Award, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/talent-management", label: "ניהול כישרונות", icon: Star, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/training-management", label: "ניהול הכשרות", icon: GraduationCap, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/workforce-planning", label: "תכנון כוח אדם", icon: Users, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/self-service", label: "שירות עצמי לעובד", icon: UserPlus, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/ats", label: "מערכת גיוס ATS", icon: Briefcase, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/departments", label: "מחלקות", icon: Building2, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/meetings", label: "פגישות HR", icon: CalendarDays, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/policies", label: "נהלים", icon: ScrollText, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/employer-cost", label: "עלות מעסיק", icon: DollarSign, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/labor-cost-allocation", label: "הקצאת עלות עבודה", icon: Calculator, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/open-positions", label: "משרות פתוחות", icon: Briefcase, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/candidates", label: "מועמדים", icon: Users, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/interviews", label: "ראיונות", icon: MessageSquare, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/contractor-contracts", label: "חוזי קבלנים", icon: FileText, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/contractor-insurance", label: "ביטוח קבלנים", icon: Shield, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/contractor-payments", label: "תשלומי קבלנים", icon: DollarSign, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/employee-card", label: "כרטיס עובד", icon: Users, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/employee-goals", label: "יעדי עובד", icon: Target, section: "משאבי אנוש", subSection: "גיוס ופיתוח" },
    { href: "/hr/employment-history", label: "היסטוריית העסקה", icon: Clock, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/health-safety", label: "בריאות ובטיחות", icon: ShieldAlert, section: "משאבי אנוש", subSection: "ניהול עובדים" },
    { href: "/hr/expense-claims", label: "תביעות הוצאות", icon: Receipt, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/workforce-analysis", label: "ניתוח כוח אדם", icon: BarChart3, section: "משאבי אנוש", subSection: "ניהול עובדים" },

    // ─── איכות, מסמכים ודוחות נוסף ───
    { href: "/quality/document-control", label: "בקרת מסמכי איכות", icon: FileCheck, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/safety", label: "ניהול בטיחות", icon: ShieldAlert, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/safety/procedures", label: "נהלי בטיחות", icon: ScrollText, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/safety/accident-reports", label: "דוחות תאונות", icon: AlertTriangle, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/documents/digital-archive", label: "ארכיון דיגיטלי", icon: FolderKanban, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },
    { href: "/documents/digital-signatures", label: "חתימות דיגיטליות", icon: FileCheck, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },
    { href: "/documents/quality-docs", label: "מסמכי איכות", icon: FileBadge, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },
    { href: "/documents/checklists", label: "רשימות תיוג", icon: ClipboardCheck, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },
    { href: "/documents/system-spec", label: "מפרט מערכת", icon: FileText, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },
    { href: "/documents/archive-files", label: "קבצי ארכיון", icon: FolderKanban, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },
    { href: "/documents/company-report", label: "דוח חברה", icon: FileBarChart, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },
    { href: "/documents/dms", label: "מאגר DMS", icon: Database, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },
    { href: "/knowledge/lessons", label: "לקחים שנלמדו", icon: BookMarked, section: "איכות, מסמכים ודוחות", subSection: "ידע" },
    { href: "/bi/comparative-analytics", label: "אנליטיקה השוואתית", icon: BarChart3, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/reports/risks", label: "ניתוח סיכונים", icon: AlertTriangle, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/funnel", label: "ניתוח משפך", icon: Funnel, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/bi-dashboard", label: "דשבורד BI", icon: PieChart, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/reports/bi/financial-statements", label: "דוחות כספיים BI", icon: DollarSign, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/reports/bi/sales", label: "מכירות BI", icon: TrendingUp, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/reports/bi/production", label: "ייצור BI", icon: Factory, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/reports/bi/inventory", label: "מלאי BI", icon: Package, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/reports/bi/hr", label: "משאבי אנוש BI", icon: Users, section: "איכות, מסמכים ודוחות", subSection: "BI" },
    { href: "/reports/financial/customer-vendor-ledger", label: "ספר חייבים/זכאים", icon: BookOpen, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/financial/customer-aging", label: "גיול לקוחות", icon: Clock, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/financial/vendor-aging", label: "גיול ספקים", icon: Clock, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/financial/fiscal-report", label: "דוח פיסקלי", icon: FileBarChart, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/financial/invoice-analysis", label: "ניתוח חשבוניות", icon: Receipt, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/financial/analytics", label: "אנליטיקה פיננסית", icon: BarChart3, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/financial/executive-summary", label: "סיכום מנהלים", icon: LayoutDashboard, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/reports/financial/vat-report", label: "דוח מע\"מ", icon: Percent, section: "איכות, מסמכים ודוחות", subSection: "דוחות" },
    { href: "/marketing/hub", label: "מרכז שיווק", icon: Megaphone, section: "איכות, מסמכים ודוחות", subSection: "שיווק" },
    { href: "/marketing/integrations", label: "אינטגרציות שיווק", icon: Plug, section: "איכות, מסמכים ודוחות", subSection: "שיווק" },
    { href: "/marketing/analytics", label: "אנליטיקת שיווק", icon: BarChart3, section: "איכות, מסמכים ודוחות", subSection: "שיווק" },
    { href: "/marketing/content-calendar", label: "לוח תוכן", icon: CalendarDays, section: "איכות, מסמכים ודוחות", subSection: "שיווק" },
    { href: "/marketing/social-media", label: "רשתות חברתיות", icon: MessageCircle, section: "איכות, מסמכים ודוחות", subSection: "שיווק" },
    { href: "/marketing/email-campaigns", label: "קמפיינים בדוא\"ל", icon: Mail, section: "איכות, מסמכים ודוחות", subSection: "שיווק" },
    { href: "/marketing/budget", label: "תקציב שיווק", icon: DollarSign, section: "איכות, מסמכים ודוחות", subSection: "שיווק" },
    { href: "/strategy/goals", label: "יעדים אסטרטגיים", icon: Target, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
    { href: "/strategy/swot", label: "SWOT", icon: Scale, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
    { href: "/strategy/market-analysis", label: "ניתוח שוק", icon: TrendingUp, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
    { href: "/strategy/balanced-scorecard", label: "כרטיס ניקוד מאוזן", icon: Scale, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
    { href: "/strategy/competitive-analysis", label: "ניתוח תחרותי", icon: Users, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
    { href: "/strategy/business-plan", label: "תכנית עסקית", icon: Briefcase, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },

    // ─── ראשי נוסף ───
    { href: "/executive/live-ops", label: "Live Ops", icon: Activity, section: "ראשי" },
    { href: "/executive/order-lifecycle", label: "מחזור חיי הזמנה", icon: ArrowLeftRight, section: "ראשי" },
    { href: "/executive/operational-bottlenecks", label: "צווארי בקבוק תפעוליים", icon: AlertTriangle, section: "ראשי" },
    { href: "/executive/delayed-projects", label: "פרויקטים מאוחרים", icon: Clock, section: "ראשי" },
    { href: "/executive/procurement-risk", label: "סיכון רכש", icon: ShieldAlert, section: "ראשי" },
    { href: "/executive/production-efficiency", label: "יעילות ייצור", icon: Activity, section: "ראשי" },
    { href: "/executive/workforce-status", label: "מצב כוח אדם", icon: Users, section: "ראשי" },
    { href: "/data-flow", label: "זרימת נתונים", icon: GitMerge, section: "ראשי" },
    { href: "/whatsapp-ai", label: "WhatsApp AI", icon: MessageSquare, section: "ראשי" },
    { href: "/notifications", label: "התראות", icon: Bell, section: "ראשי" },

    // ─── תמחור ─── (price-* routes)
    { href: "/pricing/price-lists-ent", label: "מחירונים ארגוניים", icon: List, section: "כספים", subSection: "תמחור" },
    { href: "/pricing/cost-calculations", label: "חישובי עלות", icon: Calculator, section: "כספים", subSection: "תמחור" },
    { href: "/pricing/collections-manager", label: "ניהול גבייה", icon: CreditCard, section: "כספים", subSection: "תמחור" },
    { href: "/pricing/price-lists-manager", label: "ניהול מחירונים", icon: List, section: "כספים", subSection: "תמחור" },
    { href: "/pricing/price-history", label: "היסטוריית מחירים", icon: Clock, section: "כספים", subSection: "תמחור" },
    { href: "/pricing/cost-calc-detailed", label: "תמחור מפורט", icon: Calculator, section: "כספים", subSection: "תמחור" },
    { href: "/pricing/cost-calc", label: "תמחור מהיר", icon: Calculator, section: "כספים", subSection: "תמחור" },
    { href: "/pricing/dynamic", label: "תמחור דינמי", icon: TrendingUp, section: "כספים", subSection: "תמחור" },
    { href: "/pricing/daily-profit", label: "רווחיות יומית", icon: TrendingUp, section: "כספים", subSection: "תמחור" },

    // ─── מוצרים ופיתוח ─── 
    { href: "/product-dev/roadmap", label: "מפת דרכים", icon: MapIcon, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/product-dev/rd-projects", label: "פרויקטי מו\"פ", icon: FlaskConical, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/product-dev/feature-requests", label: "בקשות פיצ'ר", icon: Lightbulb, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/product-dev/qa-testing", label: "בדיקות QA", icon: FlaskConical, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },

    // ─── שונות ───
    { href: "/maintenance", label: "ניהול תחזוקה", icon: Wrench, section: "ייצור ופרויקטים", subSection: "תחזוקה" },
    { href: "/assets/insurance", label: "ביטוח נכסים", icon: Shield, section: "ייצור ופרויקטים", subSection: "נכסים" },

    // ─── כספים — שלמות ───
    { href: "/finance/accounts-payable", label: "חשבונות לתשלום", icon: CreditCard, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/accounts-receivable", label: "חשבונות לגבייה", icon: CreditCard, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/adjusting-entries", label: "הזנות מתאימות", icon: FileText, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/aging-report", label: "דוח גיול", icon: Clock, section: "כספים", subSection: "דוחות" },
    { href: "/finance/analytical-reports", label: "דוחות אנליטיים", icon: BarChart3, section: "כספים", subSection: "דוחות" },
    { href: "/finance/analytics", label: "אנליטיקה פיננסית", icon: BarChart3, section: "כספים", subSection: "דוחות" },
    { href: "/finance/bank-accounts", label: "חשבונות בנק", icon: Landmark, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/budget-departments", label: "תקציבי מחלקות", icon: DollarSign, section: "כספים", subSection: "תקציב" },
    { href: "/finance/change-tracking", label: "מעקב שינויים", icon: Activity, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/checks", label: "שיקים", icon: FileText, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/checks-management", label: "ניהול שיקים", icon: FileText, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/consolidated-reports", label: "דוחות מאוחדים", icon: FileBarChart, section: "כספים", subSection: "דוחות" },
    { href: "/finance/contractor-payment-decision", label: "החלטת תשלום קבלנים", icon: DollarSign, section: "כספים", subSection: "תשלומים" },
    { href: "/finance/control-center", label: "מרכז בקרה פיננסי", icon: LayoutDashboard, section: "כספים", subSection: "דוחות" },
    { href: "/finance/credit-management", label: "ניהול אשראי", icon: CreditCard, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/currencies", label: "מטבעות", icon: DollarSign, section: "כספים", subSection: "הגדרות" },
    { href: "/finance/customer-profitability", label: "רווחיות לקוחות", icon: TrendingUp, section: "כספים", subSection: "דוחות" },
    { href: "/finance/customer-vendor-ledger", label: "ספר לקוחות/ספקים", icon: BookOpen, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/debit-notes", label: "הזמנות חיוב", icon: FileText, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/deferred-expenses", label: "הוצאות נדחות", icon: Clock, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/deferred-revenue", label: "הכנסות נדחות", icon: Clock, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/depreciation-schedule", label: "לוח פחת", icon: TrendingDown, section: "כספים", subSection: "נכסים" },
    { href: "/finance/entity-ledger", label: "ספר גורמים", icon: BookOpen, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/executive-summary", label: "סיכום מנהלים", icon: LayoutDashboard, section: "כספים", subSection: "דוחות" },
    { href: "/finance/expense-breakdown", label: "פירוט הוצאות", icon: Receipt, section: "כספים", subSection: "תקציב" },
    { href: "/finance/expense-claims", label: "תביעות הוצאות", icon: Receipt, section: "כספים", subSection: "תקציב" },
    { href: "/finance/finance-control-center", label: "מרכז בקרה", icon: LayoutDashboard, section: "כספים", subSection: "דוחות" },
    { href: "/finance/financial-reports", label: "דוחות פיננסיים", icon: FileBarChart, section: "כספים", subSection: "דוחות" },
    { href: "/finance/financial-reports-alt", label: "דוחות פיננסיים — חלופה", icon: FileBarChart, section: "כספים", subSection: "דוחות" },
    { href: "/finance/fiscal-report", label: "דוח פיסקלי", icon: FileBarChart, section: "כספים", subSection: "דוחות" },
    { href: "/finance/fixed-assets-alt", label: "רכוש קבוע — חלופה", icon: Building2, section: "כספים", subSection: "נכסים" },
    { href: "/finance/invoice-analysis", label: "ניתוח חשבוניות", icon: Receipt, section: "כספים", subSection: "דוחות" },
    { href: "/finance/loan-analysis", label: "ניתוח הלוואות", icon: DollarSign, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/management-reporting", label: "דיווח ניהולי", icon: FileBarChart, section: "כספים", subSection: "דוחות" },
    { href: "/finance/payment-reminders", label: "תזכורות תשלום", icon: Bell, section: "כספים", subSection: "תשלומים" },
    { href: "/finance/payments", label: "תשלומים", icon: CreditCard, section: "כספים", subSection: "תשלומים" },
    { href: "/finance/payment-terms", label: "תנאי תשלום", icon: FileText, section: "כספים", subSection: "הגדרות" },
    { href: "/finance/period-close", label: "סגירת תקופה", icon: CheckSquare, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/profit-centers", label: "מרכזי רווח", icon: TrendingUp, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/project-profitability", label: "רווחיות פרויקטים", icon: TrendingUp, section: "כספים", subSection: "דוחות" },
    { href: "/finance/registrations", label: "רישומים", icon: FileText, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/revenues", label: "הכנסות", icon: TrendingUp, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/revenue-tracking", label: "מעקב הכנסות", icon: TrendingUp, section: "כספים", subSection: "דוחות" },
    { href: "/finance/settings", label: "הגדרות פיננסיות", icon: Settings, section: "כספים", subSection: "הגדרות" },
    { href: "/finance/supplier-cost-analysis", label: "ניתוח עלויות ספקים", icon: BarChart3, section: "כספים", subSection: "דוחות" },
    { href: "/finance/treasury-management", label: "ניהול אוצר", icon: DollarSign, section: "כספים", subSection: "חשבונאות" },
    { href: "/finance/vendor-aging", label: "גיול ספקים", icon: Clock, section: "כספים", subSection: "דוחות" },

    // ─── AI — שלמות ───
    { href: "/ai/anomaly-detection", label: "זיהוי חריגות AI", icon: ShieldAlert, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai/customer-service-pro", label: "שירות לקוחות Pro AI", icon: Headphones, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai/executive-insights", label: "תובנות מנהלים AI", icon: Brain, section: "מנוע בינה מלאכותית — AI", subSection: "תובנות" },
    { href: "/ai/follow-up", label: "מעקב AI", icon: Bell, section: "מנוע בינה מלאכותית — AI", subSection: "סוכנים" },
    { href: "/ai/procurement-optimizer", label: "אופטימיזציית רכש AI", icon: ShoppingCart, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai/production-insights", label: "תובנות ייצור AI", icon: Factory, section: "מנוע בינה מלאכותית — AI", subSection: "תובנות" },
    { href: "/ai/quotation-assistant", label: "עוזר ציטוטים AI", icon: FileText, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },
    { href: "/ai/recommendations", label: "המלצות AI", icon: Lightbulb, section: "מנוע בינה מלאכותית — AI", subSection: "כלים" },

    // ─── נכסים — שלמות ───
    { href: "/assets/leasing", label: "ליסינג", icon: Building2, section: "כספים", subSection: "נכסים" },
    { href: "/assets/management", label: "ניהול נכסים", icon: Building2, section: "כספים", subSection: "נכסים" },

    // ─── ראשי — שלמות ───
    { href: "/budget-tracking", label: "מעקב תקציב", icon: DollarSign, section: "כספים", subSection: "תקציב" },
    { href: "/chat/chat-page", label: "צ'אט", icon: MessageSquare, section: "ראשי" },

    // ─── חוזים — שלמות ───
    { href: "/contracts", label: "ניהול חוזים", icon: FileText, section: "איכות, מסמכים ודוחות", subSection: "חוזים" },
    { href: "/contracts/analytics", label: "אנליטיקת חוזים", icon: BarChart3, section: "איכות, מסמכים ודוחות", subSection: "חוזים" },
    { href: "/contracts/nda", label: "הסכמי סודיות", icon: Shield, section: "איכות, מסמכים ודוחות", subSection: "חוזים" },
    { href: "/contracts/risk-scoring", label: "ניקוד סיכון חוזים", icon: ShieldAlert, section: "איכות, מסמכים ודוחות", subSection: "חוזים" },
    { href: "/contracts/service-agreements", label: "הסכמי שירות", icon: Handshake, section: "איכות, מסמכים ודוחות", subSection: "חוזים" },
    { href: "/contracts/templates", label: "תבניות חוזים", icon: FileText, section: "איכות, מסמכים ודוחות", subSection: "חוזים" },

    // ─── CRM — שלמות ───
    { href: "/crm/agent-control-tower", label: "מגדל שליטה סוכנים", icon: Building2, section: "לקוחות ומכירות", subSection: "CRM" },
    { href: "/crm/automation", label: "אוטומציית CRM", icon: Zap, section: "לקוחות ומכירות", subSection: "CRM" },
    { href: "/crm/campaign-analytics", label: "אנליטיקת קמפיינים", icon: BarChart3, section: "לקוחות ומכירות", subSection: "שיווק" },
    { href: "/crm/commission-management", label: "ניהול עמלות", icon: DollarSign, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/crm/contract-management", label: "ניהול חוזי לקוחות", icon: FileText, section: "לקוחות ומכירות", subSection: "CRM" },
    { href: "/crm/crm-ultimate-dashboard", label: "דשבורד CRM אולטימטי", icon: LayoutDashboard, section: "לקוחות ומכירות", subSection: "CRM" },
    { href: "/crm/lead-profile", label: "פרופיל ליד", icon: User, section: "לקוחות ומכירות", subSection: "CRM" },
    { href: "/crm/leads-ultimate", label: "לידים אולטימטי", icon: Users, section: "לקוחות ומכירות", subSection: "CRM" },
    { href: "/crm/real-time", label: "מעקב CRM בזמן אמת", icon: Activity, section: "לקוחות ומכירות", subSection: "CRM" },
    { href: "/crm/search", label: "חיפוש CRM", icon: Search, section: "לקוחות ומכירות", subSection: "CRM" },

    // ─── שירות לקוחות — שלמות ───
    { href: "/customer-service/complaints", label: "תלונות", icon: AlertCircle, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/customer-service/rma", label: "RMA", icon: Package, section: "לקוחות ומכירות", subSection: "שירות" },
    { href: "/customer-service/warranty", label: "אחריות", icon: ShieldCheck, section: "לקוחות ומכירות", subSection: "שירות" },

    // ─── מסמכים — שלמות ───
    { href: "/documents/contracts", label: "מסמכי חוזים", icon: FileText, section: "איכות, מסמכים ודוחות", subSection: "מסמכים" },

    // ─── EHS — שלמות ───
    { href: "/ehs/annual-report", label: "דוח שנתי EHS", icon: FileBarChart, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/emergency-preparedness", label: "מוכנות לחירום", icon: Siren, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/energy", label: "ניהול אנרגיה", icon: Zap, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/environmental-permits", label: "היתרי סביבה", icon: Leaf, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/israeli-regulatory", label: "רגולציה ישראלית EHS", icon: Shield, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/ppe", label: "ציוד מגן אישי", icon: HardHat, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/safety-inspections", label: "בדיקות בטיחות", icon: ShieldCheck, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/safety-training-certs", label: "הדרכות ואישורי בטיחות", icon: Award, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/waste", label: "ניהול פסולת", icon: Trash2, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },
    { href: "/ehs/work-permits", label: "היתרי עבודה", icon: ClipboardCheck, section: "איכות, מסמכים ודוחות", subSection: "בטיחות" },

    // ─── מלאי — שלמות ───
    { href: "/inventory-management", label: "ניהול מלאי", icon: Package, section: "תפעול", subSection: "מחסנים" },

    // ─── לוגיסטיקה — שלמות ───
    { href: "/logistics/barcode-rfid", label: "ברקוד ו-RFID", icon: ScanLine, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/cross-border", label: "מסחר חוצה גבולות", icon: Globe, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/customer-tracking-portal", label: "פורטל מעקב לקוחות", icon: MapIcon, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/freight", label: "משלוחים", icon: Truck, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/freight-audit", label: "ביקורת משלוחים", icon: ClipboardCheck, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/loading-dock", label: "מזח טעינה", icon: Warehouse, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/packaging", label: "אריזה", icon: Package, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/proof-of-delivery", label: "אישור מסירה", icon: CheckCircle2, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/returns", label: "החזרות", icon: ArrowUpDown, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/reverse-logistics", label: "לוגיסטיקה הפוכה", icon: RotateCcw, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/shipment-tracking-live", label: "מעקב משלוח חי", icon: Activity, section: "תפעול", subSection: "לוגיסטיקה" },
    { href: "/logistics/tracking", label: "מעקב לוגיסטי", icon: MapIcon, section: "תפעול", subSection: "לוגיסטיקה" },

    // ─── תפעול — שלמות ───
    { href: "/operations/cost-per-unit", label: "עלות ליחידה", icon: Calculator, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/operations/data-sender", label: "שולח נתונים", icon: ArrowLeftRight, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/operations/downtime", label: "זמן השבתה", icon: AlertTriangle, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/operations/media-library", label: "ספריית מדיה", icon: FolderKanban, section: "מנהלת מערכת", subSection: "כלים" },
    { href: "/operations/oee", label: "OEE", icon: Activity, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/operations/shift-handover", label: "מסירת משמרת", icon: Users, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },

    // ─── רכש — שלמות ───
    { href: "/procurement/competitor-analysis", label: "ניתוח מתחרים", icon: BarChart3, section: "תפעול", subSection: "ספקים" },
    { href: "/procurement/profitability-analysis", label: "ניתוח רווחיות רכש", icon: TrendingUp, section: "תפעול", subSection: "ספקים" },
    { href: "/procurement/rfq", label: "בקשת הצעת מחיר", icon: FileText, section: "תפעול", subSection: "הזמנות" },
    { href: "/procurement/risk-hedging-analysis", label: "ניתוח גידור סיכונים", icon: ShieldAlert, section: "תפעול", subSection: "ספקים" },
    { href: "/procurement/stock-count", label: "ספירת מלאי", icon: Package, section: "תפעול", subSection: "מחסנים" },
    { href: "/procurement/stock-movements", label: "תנועות מלאי", icon: ArrowUpDown, section: "תפעול", subSection: "מחסנים" },

    // ─── ייצור — שלמות ───
    { href: "/production", label: "ניהול ייצור", icon: Factory, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/bom-manager", label: "מנהל BOM", icon: GitMerge, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/planning", label: "תכנון ייצור", icon: CalendarDays, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/production-reports", label: "דוחות ייצור", icon: FileBarChart, section: "ייצור ופרויקטים", subSection: "דוחות" },
    { href: "/production/qc-inspections", label: "בדיקות QC", icon: FlaskConical, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },
    { href: "/production/work-orders-mgmt", label: "ניהול הוראות עבודה", icon: ClipboardCheck, section: "ייצור ופרויקטים", subSection: "ניהול ייצור" },

    // ─── איכות — שלמות ───
    { href: "/quality/calibration", label: "כיול", icon: Settings, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/quality/complaints", label: "תלונות איכות", icon: AlertCircle, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/quality/documents", label: "מסמכי איכות", icon: FileText, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/quality/material-certs", label: "תעודות חומרים", icon: FileBadge, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/quality/spc", label: "SPC", icon: Activity, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/quality/supplier-quality", label: "איכות ספקים", icon: Truck, section: "איכות, מסמכים ודוחות", subSection: "איכות" },
    { href: "/quality/test-certificates", label: "תעודות בדיקה", icon: FileBadge, section: "איכות, מסמכים ודוחות", subSection: "איכות" },

    // ─── חומרי גלם ───
    { href: "/raw-materials", label: "חומרי גלם", icon: Package, section: "תפעול", subSection: "מחסנים" },

    // ─── ניהול סיכונים ───
    { href: "/risk-management", label: "ניהול סיכונים", icon: ShieldAlert, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },

    // ─── מכירות — שלמות ───
    { href: "/sales/quotes", label: "הצעות מחיר מכירות", icon: FileText, section: "לקוחות ומכירות", subSection: "מכירות" },

    // ─── אבטחה — שלמות ───
    { href: "/security/cors", label: "הגדרות CORS", icon: Shield, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/geo-blocking", label: "חסימה גיאוגרפית", icon: Globe, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/ip-management", label: "ניהול IP", icon: Shield, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/rate-limiting", label: "הגבלת קצב", icon: Shield, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/vulnerabilities", label: "פגיעויות אבטחה", icon: ShieldAlert, section: "מנהלת מערכת", subSection: "אבטחה" },
    { href: "/security/webhook-secrets", label: "סודות Webhook", icon: Shield, section: "מנהלת מערכת", subSection: "אבטחה" },

    // ─── ספקים ───
    { href: "/suppliers/communications", label: "תקשורת ספקים", icon: MessageSquare, section: "תפעול", subSection: "ספקים" },
    { href: "/supply-chain/edi-admin", label: "ניהול EDI", icon: ArrowLeftRight, section: "תפעול", subSection: "ספקים" },
    { href: "/supply-chain/edi-dashboard", label: "דשבורד EDI", icon: BarChart3, section: "תפעול", subSection: "ספקים" },
    { href: "/supplier-mgmt/portal", label: "פורטל ספקים", icon: Globe, section: "תפעול", subSection: "ספקים" },

    // ─── תפעול ───
    { href: "/operations/downtime-tracking", label: "מעקב השבתות", icon: Clock, section: "ייצור ופרויקטים", subSection: "תפעול" },

    // ─── כספים נוספים ───
    { href: "/finance/projects", label: "פרויקטים פיננסיים", icon: Briefcase, section: "כספים", subSection: "ניהול פרויקטים" },

    // ─── נוספים ───
    { href: "/payroll", label: "שכר כללי", icon: Banknote, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/integrations-hub-data", label: "נתוני אינטגרציות", icon: Plug, section: "מנהלת מערכת", subSection: "אינטגרציות" },
    { href: "/pricing/pricing-price-lists", label: "מחירונים מורחבים", icon: ClipboardList, section: "כספים", subSection: "תמחור" },
    { href: "/portal/contractor", label: "פורטל קבלנים", icon: HardHat, section: "מנהלת מערכת", subSection: "פורטלים" },
    { href: "/portal/customer/dashboard", label: "דשבורד לקוח", icon: LayoutDashboard, section: "מנהלת מערכת", subSection: "פורטלים" },
    ];
  
const SECTION_DASHBOARD_HREFS: Record<string, string> = {
  "ראשי": "/",
  "מנוע בינה מלאכותית — AI": "/ai-engine",
  "לקוחות ומכירות": "/crm",
  "כספים": "/finance",
  "תפעול": "/procurement-dashboard",
  "ייצור ופרויקטים": "/production/dashboard",
  "משאבי אנוש": "/hr",
  "איכות, מסמכים ודוחות": "/quality",
  "מנהלת מערכת": "/settings",
};

const STRATEGY_NAV_ITEMS: { entitySlug: string; label: string; icon: React.ComponentType<{ className?: string }>; section: string; subSection?: string }[] = [
  { entitySlug: "strategic_goal", label: "יעדים אסטרטגיים", icon: Target, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
  { entitySlug: "strategy_plan", label: "תוכניות אסטרטגיות", icon: MapIcon, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
  { entitySlug: "market_entry_plan", label: "כניסה לשווקים", icon: Globe, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
  { entitySlug: "competitor_profile", label: "פרופילי מתחרים", icon: Users, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
  { entitySlug: "market_trend", label: "מגמות שוק", icon: TrendingUp, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
  { entitySlug: "marketing_campaign", label: "קמפיינים", icon: Megaphone, section: "לקוחות ומכירות", subSection: "שיווק" },
  { entitySlug: "content_calendar", label: "לוח שנה תוכן", icon: CalendarDays, section: "לקוחות ומכירות", subSection: "שיווק" },
  { entitySlug: "lead_source", label: "מקורות לידים", icon: BarChart3, section: "לקוחות ומכירות", subSection: "שיווק" },
  { entitySlug: "cost_analysis", label: "ניתוחי עלויות", icon: TrendingUp, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
  { entitySlug: "crisis_scenario", label: "תרחישי משבר", icon: ShieldAlert, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },
  { entitySlug: "product_concept", label: "מוצרים בפיתוח", icon: Lightbulb, section: "איכות, מסמכים ודוחות", subSection: "אסטרטגיה" },

];

const API_BASE = "/api";

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  userId: number | null;
  priority: string;
  category: string;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  moduleId: number | null;
  recordId: number | null;
  isRead: boolean;
  createdAt: string;
  archivedAt: string | null;
}

const DROPDOWN_CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  anomaly: AlertTriangle,
  task: ClipboardList,
  approval: ShieldCheck,
  system: Settings,
  workflow: GitBranch,
};

const DROPDOWN_CATEGORY_COLORS: Record<string, string> = {
  anomaly: "text-amber-400",
  task: "text-blue-400",
  approval: "text-purple-400",
  system: "text-muted-foreground",
  workflow: "text-emerald-400",
};

const DROPDOWN_PRIORITY_BORDER: Record<string, string> = {
  critical: "border-r-2 border-r-red-500",
  high: "border-r-2 border-r-orange-500",
  normal: "",
  low: "",
};

function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: notifData } = useQuery<{ notifications: NotificationItem[]; total: number }>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/notifications?limit=15&archived=false`);
      if (!r.ok) throw new Error("Failed to fetch notifications");
      return r.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const notifications = notifData?.notifications || [];

  const { data: unreadData } = useQuery<{ count: number; critical: number }>({
    queryKey: ["notifications-unread-count"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/notifications/unread-count`);
      if (!r.ok) throw new Error("Failed to fetch unread count");
      return r.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/notifications/${id}/read`, { method: "PATCH" });
      if (!r.ok) throw new Error("Failed to mark notification as read");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API_BASE}/notifications/mark-all-read`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error("Failed to mark all as read");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = unreadData?.count || 0;
  const criticalCount = unreadData?.critical || 0;

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "עכשיו";
    if (minutes < 60) return `לפני ${minutes} דקות`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `לפני ${hours} שעות`;
    const days = Math.floor(hours / 24);
    return `לפני ${days} ימים`;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-muted-foreground hover:bg-card/5 rounded-full transition-colors"
        title={unreadCount > 0 ? `${unreadCount} התראות שלא נקראו` : "אין התראות חדשות"}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1 ${
            criticalCount > 0 ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"
          }`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 w-96 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">התראות</h3>
                {criticalCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    {criticalCount} קריטיות
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllReadMutation.mutate()}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>סמן הכל</span>
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>אין התראות</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const CatIcon = DROPDOWN_CATEGORY_ICONS[notification.category] || Settings;
                  const catColor = DROPDOWN_CATEGORY_COLORS[notification.category] || "text-muted-foreground";
                  const prioBorder = DROPDOWN_PRIORITY_BORDER[notification.priority] || "";

                  return (
                    <div
                      key={notification.id}
                      className={`px-4 py-3 border-b border-border/30 hover:bg-card/[0.02] transition-colors cursor-pointer ${prioBorder} ${
                        !notification.isRead ? "bg-primary/5" : ""
                      }`}
                      onClick={() => {
                        if (!notification.isRead) {
                          markReadMutation.mutate(notification.id);
                        }
                        if (notification.actionUrl) {
                          setIsOpen(false);
                          window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}${notification.actionUrl}`;
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 p-1 rounded-md bg-card/5 flex-shrink-0`}>
                          <CatIcon className={`w-3.5 h-3.5 ${catColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm ${notification.isRead ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                              {notification.title}
                            </p>
                            {notification.priority === "critical" && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                                קריטי
                              </span>
                            )}
                            {notification.priority === "high" && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                גבוה
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            {formatTime(notification.createdAt)}
                          </p>
                        </div>
                        {!notification.isRead && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markReadMutation.mutate(notification.id);
                            }}
                            className="p-1 rounded hover:bg-card/5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                            title="סמן כנקרא"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2.5 text-center text-xs text-primary hover:bg-card/[0.02] border-t border-border/50 transition-colors"
            >
              הצג את כל ההתראות
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface PlatformModule {
  id: number;
  name: string;
  slug: string;
  icon: string;
  status: string;
}

interface PlatformEntity {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
}

function DynamicModulesSection({ location }: { location: string }) {
  const { modules } = usePlatformModules();

  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());

  const HARDCODED_SLUGS = new Set(["inventory", "suppliers", "procurement", "customers", "sales", "finance", "hr", "production", "installers", "documents", "builder", "settings", "imports", "approvals", "projects", "field-measurements", "crm-advanced", "strategy", "market-analysis", "marketing", "cost-reduction", "crisis-management", "product-development", "meetings"]);
  const filteredModules = modules.filter(m => !HARDCODED_SLUGS.has(m.slug));

  if (filteredModules.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 tracking-wider">מודולים שנבנו</div>
      {filteredModules.map((mod) => {
        const ModIcon = getLucideIcon(mod.icon || "FileText");
        const isExpanded = expandedModules.has(mod.id);
        return (
          <DynamicModuleItem
            key={mod.id}
            mod={mod}
            ModIcon={ModIcon}
            isExpanded={isExpanded}
            location={location}
            onToggle={() => {
              setExpandedModules(prev => {
                const next = new Set(prev);
                if (next.has(mod.id)) next.delete(mod.id);
                else next.add(mod.id);
                return next;
              });
            }}
          />
        );
      })}
    </div>
  );
}

function isPathActive(currentPath: string, itemPath: string): boolean {
  if (currentPath === itemPath) return true;
  if (itemPath === "/") return false;
  return currentPath.startsWith(itemPath + "/");
}

function DynamicModuleItem({ mod, ModIcon, isExpanded, location, onToggle }: {
  mod: PlatformModule;
  ModIcon: React.ComponentType<{ className?: string }>;
  isExpanded: boolean;
  location: string;
  onToggle: () => void;
}) {
  const { data: entities = [] } = useQuery<PlatformEntity[]>({
    queryKey: ["platform-module-entities-nav", mod.id],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/modules/${mod.id}/entities`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 10 * 60 * 1000,
    enabled: isExpanded,
  });

  const isModuleActive = isPathActive(location, `/module/${mod.slug}`);


  return (
    <div>
      <button
        onClick={onToggle}
        className={`flex items-center gap-3 px-3 py-2.5 w-full rounded-xl transition-all duration-200 group ${
          isModuleActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-card/5 hover:text-foreground"
        }`}
      >
        <ModIcon className={`w-5 h-5 transition-colors ${isModuleActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
        <span className="flex-1 text-right">{mod.name}</span>
        {mod.status === "published" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
      </button>
      {isExpanded && entities.length > 0 && (
        <div className="mr-4 mt-1 space-y-0.5">
          {entities.map((entity) => {
            const entityHref = `/module/${entity.id}`;
            const isEntityActive = location === entityHref;
            const EntIcon = getLucideIcon(entity.icon || "FileText");
            return (
              <Link
                key={entity.id}
                href={entityHref}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 text-sm group ${
                  isEntityActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-card/5 hover:text-foreground"
                }`}
              >
                <EntIcon className={`w-4 h-4 ${isEntityActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                <span>{entity.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DynamicMenuItemsSection({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  const { data: menuItems = [] } = useQuery<any[]>({
    queryKey: ["platform-menu-items"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/menu-items`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : (data.items || []);
    },
    staleTime: 10 * 60 * 1000,
  });

  const activeItems = menuItems.filter((item: any) => item.isActive !== false);
  if (activeItems.length === 0) return null;

  const topLevel = activeItems
    .filter((item: any) => !item.parentId)
    .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const childrenMap = new Map<number, any[]>();
  activeItems
    .filter((item: any) => item.parentId)
    .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .forEach((item: any) => {
      const existing = childrenMap.get(item.parentId) || [];
      existing.push(item);
      childrenMap.set(item.parentId, existing);
    });

  const sections = new Map<string, any[]>();
  topLevel.forEach((item: any) => {
    const section = item.section || "תפריט דינמי";
    const existing = sections.get(section) || [];
    existing.push(item);
    sections.set(section, existing);
  });

  return (
    <>
      {Array.from(sections.entries()).map(([sectionName, items]) => (
        <DynamicMenuSection
          key={sectionName}
          title={sectionName}
          items={items}
          childrenMap={childrenMap}
          location={location}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

function DynamicMenuSection({ title, items, childrenMap, location, onNavigate }: {
  title: string;
  items: any[];
  childrenMap: Map<number, any[]>;
  location: string;
  onNavigate?: () => void;
}) {
  const hasActiveItem = items.some(item => {
    const href = item.path || item.href;
    if (!href) return false;
    return isPathActive(location, href);
  });
  const [isOpen, setIsOpen] = useState(true);


  useEffect(() => {
    if (hasActiveItem && !isOpen) setIsOpen(true);
  }, [hasActiveItem]);

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors tracking-wider"
      >
        <span>{title}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="space-y-0.5 mt-0.5">
          {items.map((item: any) => (
            <DynamicMenuItem key={item.id} item={item} childrenMap={childrenMap} location={location} onNavigate={onNavigate} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function DynamicMenuItem({ item, childrenMap, location, onNavigate, depth }: {
  item: any;
  childrenMap: Map<number, any[]>;
  location: string;
  onNavigate?: () => void;
  depth: number;
}) {
  const children = childrenMap.get(item.id) || [];
  const hasChildren = children.length > 0;
  const href = item.path || item.href;
  const label = item.labelHe || item.label || item.name;
  const Icon = getLucideIcon(item.icon || "FileText");
  const isActive = href && isPathActive(location, href);
  const [isExpanded, setIsExpanded] = useState(false);


  useEffect(() => {
    if (hasChildren) {
      const childActive = children.some((child: any) => {
        const childHref = child.path || child.href;
        return childHref && isPathActive(location, childHref);
      });
      if (childActive && !isExpanded) setIsExpanded(true);
    }
  }, [location, hasChildren]);

  if (hasChildren) {
    return (
      <div style={{ paddingRight: depth > 0 ? `${depth * 12}px` : undefined }}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-2.5 px-3 py-2 w-full rounded-lg transition-all duration-200 group text-sm ${
            isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-card/5 hover:text-foreground"
          }`}
        >
          <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
          <span className="flex-1 min-w-0 truncate text-right">{label}</span>
          {item.badge && <span className="px-1.5 py-0.5 bg-primary/20 text-primary rounded-md text-[10px] font-medium">{item.badge}</span>}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
        </button>
        {isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {children.map((child: any) => (
              <DynamicMenuItem key={child.id} item={child} childrenMap={childrenMap} location={location} onNavigate={onNavigate} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!href) return null;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      style={{ paddingRight: depth > 0 ? `${depth * 12 + 12}px` : undefined }}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 group text-sm ${
        isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-card/5 hover:text-foreground"
      }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {item.badge && <span className="px-1.5 py-0.5 bg-primary/20 text-primary rounded-md text-[10px] font-medium">{item.badge}</span>}
      {isActive && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-l-full" />}
    </Link>
  );
}

const BUILDER_SECTIONS: string[] = [];

const ADMIN_ROLES = ["admin", "super-admin", "general-manager", "director"];

const SECTION_ROLES_MAP: Record<string, string[]> = {
  "ראשי": [],
  "מנוע בינה מלאכותית — AI": [...ADMIN_ROLES, "developer", "manager", "team-leader"],
  "לקוחות ומכירות": [...ADMIN_ROLES, "manager", "sales", "sales-manager", "crm", "account-manager", "team-leader"],
  "כספים": [...ADMIN_ROLES, "accountant", "finance-manager", "cfo", "controller"],
  "תפעול": [...ADMIN_ROLES, "manager", "procurement", "logistics", "warehouse", "supply-chain", "operations", "team-leader"],
  "שרשרת אספקה": [...ADMIN_ROLES, "manager", "procurement", "logistics", "warehouse", "supply-chain", "operations", "production"],
  "מערכת BOM": [...ADMIN_ROLES, "manager", "procurement", "production", "engineering", "supply-chain", "operations"],
  "לשכת מהנדסים": [...ADMIN_ROLES, "manager", "engineering", "production", "quality"],
  "מכרזים": [...ADMIN_ROLES, "manager", "sales", "engineering", "finance-manager", "director"],
  "פיתוח מוצר": [...ADMIN_ROLES, "manager", "engineering", "production", "quality", "rd"],
  "ייצור ופרויקטים": [...ADMIN_ROLES, "manager", "production", "project-manager", "engineer", "team-leader"],
  "משאבי אנוש": [...ADMIN_ROLES, "hr", "hr-manager", "manager", "payroll"],
  "איכות, מסמכים ודוחות": [...ADMIN_ROLES, "manager", "quality", "safety", "analyst", "team-leader"],
  "מנהלת מערכת": ["admin", "super-admin", "developer", "builder"],
};

const SECTION_MODULE_MAP: Record<string, string[]> = {
  "ראשי": [],
  "מנוע בינה מלאכותית — AI": ["__role_only__"],
  "לקוחות ומכירות": ["customers-sales", "pricing-billing"],
  "כספים": ["finance", "accounting", "pricing-billing"],
  "תפעול": ["procurement-inventory", "import-operations"],
  "ייצור ופרויקטים": ["production", "projects"],
  "משאבי אנוש": ["hr"],
  "איכות, מסמכים ודוחות": ["production", "documents", "reports", "strategy"],
  "מנהלת מערכת": ["__admin_only__"],
};

const SUBSECTION_ROLES_MAP: Record<string, string[]> = {
  "BI": [...ADMIN_ROLES, "manager", "analyst", "director"],
  "אסטרטגיה": [...ADMIN_ROLES, "manager", "analyst", "director"],
  "Kimi": [...ADMIN_ROLES, "developer", "manager"],
  "סוכנים": [...ADMIN_ROLES, "developer", "manager"],
  "שכר ותגמול": [...ADMIN_ROLES, "hr", "hr-manager", "hr-admin", "payroll"],
  "גיוס ופיתוח": [...ADMIN_ROLES, "hr", "hr-manager", "hr-admin", "manager"],
  "מס ודיווח": [...ADMIN_ROLES, "accountant", "finance-manager", "finance-clerk", "cfo", "controller"],
  "תקציב": [...ADMIN_ROLES, "accountant", "finance-manager", "finance-clerk", "cfo", "controller", "manager", "director"],
  "אבטחה": ["admin", "super-admin"],
  "פורטלים": ["admin", "super-admin", "developer"],
  "אינטגרציות": [...ADMIN_ROLES, "developer"],
  "מרכז אינטגרציות": [...ADMIN_ROLES, "developer"],
};



const STRATEGY_MODULE_SLUGS = ["strategy", "market-analysis", "marketing", "cost-reduction", "crisis-management", "product-development"];

function useStrategyNavItems() {
  const { modules } = usePlatformModules();

  const strategyModuleIds = (modules || [])
    .filter(m => STRATEGY_MODULE_SLUGS.includes(m.slug))
    .map(m => m.id);

  const { data: entities } = useQuery<{ id: number; slug: string }[]>({
    queryKey: ["strategy-entities-nav", strategyModuleIds],
    queryFn: async () => {
      const results: { id: number; slug: string }[] = [];
      for (const moduleId of strategyModuleIds) {
        const r = await authFetch(`${API_BASE}/platform/modules/${moduleId}/entities`);
        if (!r.ok) continue;
        const data = await r.json();
        for (const entity of data) {
          results.push({ id: entity.id, slug: entity.slug });
        }
      }
      return results;
    },
    staleTime: 5 * 60 * 1000,
    enabled: strategyModuleIds.length > 0,
  });

  if (!entities || entities.length === 0) return [];

  const slugToId = new Map(entities.map(e => [e.slug, e.id]));
  return STRATEGY_NAV_ITEMS
    .filter(item => slugToId.has(item.entitySlug))
    .map(item => ({
      href: `/builder/data/${slugToId.get(item.entitySlug)}`,
      label: item.label,
      icon: item.icon,
      section: item.section,
    }));
}

function NavLink({ item, location, siblingHrefs, onNavigate }: { item: NavItem & { href: string }; location: string; siblingHrefs?: string[]; onNavigate?: () => void }) {
  const [, navigate] = useLocation();
  const [optimisticActive, setOptimisticActive] = useState(false);
  const hasExactSiblingMatch = siblingHrefs ? siblingHrefs.some(h => h === location) : false;
  const isActive = optimisticActive || (hasExactSiblingMatch ? location === item.href : isPathActive(location, item.href));

  useEffect(() => {
    setOptimisticActive(false);
  }, [location]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setOptimisticActive(true);
    startTransition(() => {
      navigate(item.href);
    });
    onNavigate?.();
  }, [item.href, navigate, onNavigate]);

  return (
    <a
      href={item.href}
      onClick={handleClick}
      style={{ touchAction: "manipulation" }}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 group text-sm cursor-pointer ${
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-card/5 hover:text-foreground"
      }`}
    >
      <item.icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
      <span className="flex-1 min-w-0 truncate">{item.label}</span>
      {item.badge !== undefined && (
        <span
          title={item.badgeTooltip || ""}
          className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
            Number(item.badge) > 0
              ? "bg-red-500/25 text-red-400 border-red-500/40"
              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          }`}
        >
          {item.badge}
        </span>
      )}
      {isActive && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-l-full" />
      )}
    </a>
  );
}

function SubSectionGroup({ title, items, allSectionHrefs, location, onNavigate }: {
  title: string;
  items: (NavItem & { href: string })[];
  allSectionHrefs?: string[];
  location: string;
  onNavigate?: () => void;
}) {
  const hasActiveItem = items.some(item => isPathActive(location, item.href));
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    if (hasActiveItem && !isOpen) setIsOpen(true);
  }, [hasActiveItem]);

  const siblingHrefs = allSectionHrefs ?? items.map(i => i.href);

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 w-full px-3 py-1 text-[11px] font-medium text-blue-400/80 hover:text-blue-300 transition-colors"
      >
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : "-rotate-90"}`} />
        <span>{title}</span>
      </button>
      <div className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="space-y-0.5 pr-1">
          {items.map((item, idx) => (
            <NavLink key={`${item.href}-${idx}`} item={item} location={location} siblingHrefs={siblingHrefs} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, items, location, isFirstSection, defaultOpen, onNavigate, sectionHref }: {
  title: string;
  items: (NavItem & { href: string })[];
  location: string;
  isFirstSection?: boolean;
  defaultOpen?: boolean;
  onNavigate?: () => void;
  sectionHref?: string;
}) {
  const hasActiveItem = items.some(item => isPathActive(location, item.href));
  const [isOpen, setIsOpen] = useState(defaultOpen || hasActiveItem);

  useEffect(() => {
    if (hasActiveItem && !isOpen) setIsOpen(true);
  }, [hasActiveItem]);

  const hasSubSections = items.some(item => item.subSection);

  const subSectionOrder: string[] = [];
  const subSectionMap = new Map<string, (NavItem & { href: string })[]>();
  const noSubItems: (NavItem & { href: string })[] = [];

  if (hasSubSections) {
    items.forEach(item => {
      if (item.subSection) {
        if (!subSectionMap.has(item.subSection)) {
          subSectionOrder.push(item.subSection);
          subSectionMap.set(item.subSection, []);
        }
        subSectionMap.get(item.subSection)!.push(item);
      } else {
        noSubItems.push(item);
      }
    });
  }

  const sectionTourMap: Record<string, string> = {
    "כספים": "finance",
    "לקוחות ומכירות": "crm",
    "משאבי אנוש": "hr",
    "ייצור ופרויקטים": "production",
    "תפעול": "inventory",
    "מנהלת מערכת": "settings",
    "ראשי": "dashboard",
  };

  const titleHref = sectionHref || items[0]?.href;

  return (
    <div className="mb-1" data-tour={sectionTourMap[title] || undefined}>
      <div className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground tracking-wider group">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isOpen ? "סגור קטגוריה" : "פתח קטגוריה"}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ease-in-out ${isOpen ? "" : "-rotate-90"}`} />
          </button>
          {titleHref ? (
            <Link
              href={titleHref}
              onClick={onNavigate}
              className="truncate hover:text-foreground transition-colors cursor-pointer"
            >
              {title}
            </Link>
          ) : (
            <span className="truncate">{title}</span>
          )}
        </div>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="text-[10px] font-medium bg-muted/60 text-muted-foreground rounded-full px-1.5 py-0.5 leading-none cursor-default flex-shrink-0"
              >
                {items.length}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" dir="rtl" className="text-xs">
              {items.length} עמודים בקטגוריה
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="space-y-0.5 mt-0.5">
          {hasSubSections ? (
            <>
              {noSubItems.map((item, idx) => (
                <NavLink key={`${item.href}-${idx}`} item={item} location={location} siblingHrefs={items.map(i => i.href)} onNavigate={onNavigate} />
              ))}
              {subSectionOrder.map(subTitle => (
                <SubSectionGroup
                  key={subTitle}
                  title={subTitle}
                  items={subSectionMap.get(subTitle)!}
                  allSectionHrefs={items.map(i => i.href)}
                  location={location}
                  onNavigate={onNavigate}
                />
              ))}
            </>
          ) : (
            items.map((item, idx) => (
              <NavLink key={`${item.href}-${idx}`} item={item} location={location} siblingHrefs={items.map(i => i.href)} onNavigate={onNavigate} />
            ))
          )}
          {isFirstSection && <DynamicModulesSection location={location} />}
        </div>
      </div>
    </div>
  );
}

function canAccessSection(
  section: string,
  permissions: {
    isSuperAdmin: boolean;
    roles: string[];
    department: string | null;
    modules: Record<string, { view: boolean; manage: boolean }>;
  },
  slugMap: Record<string, number>
): boolean {
  if (permissions.isSuperAdmin) return true;

  const isAdmin = permissions.roles.some(r => ["admin", "super-admin"].includes(r));
  if (isAdmin) return true;

  const allowedRoles = SECTION_ROLES_MAP[section];
  const roleGrant = allowedRoles !== undefined && allowedRoles.length > 0
    ? permissions.roles.some(r => allowedRoles.includes(r))
    : false;

  if (roleGrant) return true;

  const sectionModules = SECTION_MODULE_MAP[section];
  if (sectionModules !== undefined) {
    if (sectionModules.length === 0) return true;
    for (const modSlug of sectionModules) {
      if (modSlug === "__admin_only__") {
        return isAdmin;
      }
      if (modSlug === "__role_only__") {
        return false;
      }
      const mpBySlug = permissions.modules[modSlug];
      if (mpBySlug && (mpBySlug.view || mpBySlug.manage)) return true;

      const modId = slugMap[modSlug];
      if (modId) {
        const mpById = permissions.modules[String(modId)];
        if (mpById && (mpById.view || mpById.manage)) return true;
      }
    }
    return false;
  }

  return false;
}

const ROUTE_MODULE_MAP: Record<string, string[]> = {
  "/crm": ["customers-sales"],
  "/crm/field-agents": ["customers-sales"],
  "/crm/leads": ["customers-sales"],
  "/crm/email-sync": ["customers-sales"],
  "/crm/whatsapp-sms": ["customers-sales"],
  "/crm/communications": ["customers-sales"],
  "/crm/ai-insights": ["customers-sales"],
  "/crm/predictive-analytics": ["customers-sales"],
  "/crm/lead-quality": ["customers-sales"],
  "/crm/realtime-feed": ["customers-sales"],
  "/crm/advanced-search": ["customers-sales"],
  "/crm/collaboration": ["customers-sales"],
  "/crm/ai/lead-scoring": ["customers-sales"],
  "/crm/ai/next-action": ["customers-sales"],
  "/crm/ai/predictive": ["customers-sales"],
  "/crm/ai/anomaly": ["customers-sales"],
  "/crm/security/sso": ["customers-sales"],
  "/crm/security/encryption": ["customers-sales"],
  "/crm/security/row-security": ["customers-sales"],
  "/crm/security/audit": ["customers-sales"],
  "/crm/realtime/feeds": ["customers-sales"],
  "/crm/realtime/notifications": ["customers-sales"],
  "/crm/realtime/triggers": ["customers-sales"],
  "/crm/realtime/sync": ["customers-sales"],
  "/crm/analytics/custom-reports": ["customers-sales"],
  "/crm/analytics/trends": ["customers-sales"],
  "/crm/analytics/cohort": ["customers-sales"],
  "/crm/analytics/filters": ["customers-sales"],
  "/crm/integrations/rest-api": ["customers-sales"],
  "/crm/integrations/mobile": ["customers-sales"],
  "/crm/integrations/cloud": ["customers-sales"],
  "/crm/integrations/webhooks": ["customers-sales"],
  "/crm/pricing": ["pricing-billing"],
  "/crm/collections": ["pricing-billing"],
  "/crm/profitability": ["pricing-billing"],
  "/crm/segmentation": ["customers-sales"],
  "/crm/contractor-decision": ["customers-sales"],
  "/crm/sla": ["customers-sales"],
  "/crm/smart-routing": ["customers-sales"],
  "/crm/automations": ["customers-sales"],
  "/suppliers": ["procurement-inventory"],
  "/procurement-dashboard": ["procurement-inventory"],
  "/purchase-orders": ["procurement-inventory"],
  "/goods-receipt": ["procurement-inventory"],
  "/purchase-requests": ["procurement-inventory"],
  "/purchase-approvals": ["procurement-inventory"],
  "/price-quotes": ["procurement-inventory"],
  "/price-comparison": ["procurement-inventory"],
  "/inventory": ["procurement-inventory"],
  "/inventory-management": ["procurement-inventory"],
  "/supplier-evaluations": ["procurement-inventory"],
  "/suppliers/communications": ["procurement-inventory"],
  "/procurement/profitability": ["business-analytics"],
  "/procurement/competitors": ["business-analytics"],
  "/procurement/risk-hedging": ["business-analytics"],
  "/purchase-returns": ["procurement-inventory"],
  "/supplier-contracts": ["procurement-inventory"],
  "/budget-tracking": ["procurement-inventory"],
  "/import-dashboard": ["import-operations"],
  "/import-orders": ["import-operations"],
  "/customs-clearance": ["import-operations"],
  "/shipment-tracking": ["import-operations"],
  "/foreign-suppliers": ["import-operations"],
  "/letters-of-credit": ["import-operations"],
  "/import-cost-calculator": ["import-operations"],
  "/compliance-certificates": ["import-operations"],
  "/exchange-rates": ["import-operations"],
  "/production": ["production"],
  "/production/quality-control": ["production"],
  "/production/work-orders": ["production"],
  "/production/planning": ["production"],
  "/production/bom": ["production"],
  "/production/maintenance": ["production"],
  "/production/cmms": ["production"],
  "/production/reports": ["production"],
  "/production/work-instructions": ["production"],
  "/production/qc-inspections": ["production"],
  "/projects": ["projects"],
  "/projects/dashboard": ["projects"],
  "/projects/tasks": ["projects"],
  "/projects/milestones": ["projects"],
  "/projects/resources": ["projects"],
  "/projects/budget": ["projects"],
  "/projects/risks": ["projects"],
  "/projects/risk-dashboard": ["projects"],
  "/projects/change-orders": ["projects"],
  "/projects/documents": ["projects"],
  "/projects/templates": ["projects"],
  "/projects/timesheets": ["projects"],
  "/projects/portfolio": ["projects"],
  "/projects/portal": ["projects"],
  "/documents": ["documents"],
  "/documents/upload": ["documents"],
  "/documents/templates": ["documents"],
  "/documents/archive": ["documents"],
  "/documents/quality": ["documents"],
  "/documents/digital-archive": ["documents"],
  "/finance": ["finance", "accounting"],
  "/finance/balance-sheet": ["accounting"],
  "/finance/income": ["finance"],
  "/finance/expenses": ["finance"],
  "/finance/credit-card-processing": ["finance"],
  "/finance/accounting-portal": ["accounting"],
  "/finance/reports": ["accounting", "finance"],
  "/finance/income-expenses-report": ["accounting", "finance"],
  "/finance/accounting-reports": ["accounting", "finance"],
  "/finance/accounting-settings": ["accounting"],
  "/finance/settings": ["accounting"],
  "/finance/standing-orders": ["finance"],
  "/finance/journal-entries": ["accounting"],
  "/finance/bank-reconciliation": ["accounting"],
  "/finance/cash-flow": ["finance"],
  "/finance/tax-management": ["finance", "accounting"],
  "/hr": ["hr"],
  "/hr/employees": ["hr"],
  "/hr/payroll-center": ["hr"],
  "/hr/payroll": ["hr"],
  "/hr/employee-value": ["hr"],
  "/hr/attendance": ["hr"],
  "/hr/shifts": ["hr"],
  "/hr/contractors": ["hr"],
  "/hr/leave-management": ["hr"],
  "/hr/training": ["hr"],
  "/hr/onboarding": ["hr"],
  "/support/tickets": ["customers-sales"],
  "/meetings": ["meetings-calendar"],
  "/reports": ["reports"],
  "/reports/financial": ["reports"],
  "/reports/risks": ["reports"],
  "/reports/kpis": ["reports"],
  "/reports/funnel": ["reports"],
  "/reports/operational": ["reports"],
  "/permissions": ["__admin_only__"],
  "/governance": ["__admin_only__"],
};

const OPEN_ROUTE_PREFIXES = [
  "/",
  "/settings",
  "/builder",
  "/notifications",
  "/notification-preferences",
  "/audit-log",
  "/menu-builder",
  "/report-builder",
  "/document-builder",
  "/integration-builder",
  "/integrations-hub",
  "/integrations/",
  "/supply-chain/",
  "/engineering/",
  "/tenders/",
  "/product-dev/",
  "/ai-builder",
  "/module/",
  "/ai/",
  "/claude-chat",
  "/hi-tech-dashboard",
  "/chat",
  "/ai-settings",
  "/project-analyses",
  "/project-analysis/",
  "/procurement-ai",
  "/procurement/",
];

function matchRouteModules(path: string): string[] | null {
  if (ROUTE_MODULE_MAP[path]) return ROUTE_MODULE_MAP[path];
  const sorted = Object.keys(ROUTE_MODULE_MAP).sort((a, b) => b.length - a.length);
  for (const route of sorted) {
    if (path.startsWith(route + "/")) return ROUTE_MODULE_MAP[route];
  }
  return null;
}

function isOpenRoute(path: string): boolean {
  if (path === "/") return true;
  for (const prefix of OPEN_ROUTE_PREFIXES) {
    if (prefix === "/") continue;
    if (path === prefix) return true;
    if (path.startsWith(prefix + "/")) return true;
    if (prefix.endsWith("/") && path.startsWith(prefix)) return true;
  }
  return false;
}

function RouteGuard({
  path,
  permissions,
  moduleSlugMap,
  children,
}: {
  path: string;
  permissions: { isSuperAdmin: boolean; builderAccess?: boolean; roles: string[]; modules: Record<string, { view: boolean; manage: boolean }> };
  moduleSlugMap: Record<string, number>;
  children: React.ReactNode;
}) {
  if (permissions.isSuperAdmin) return <>{children}</>;

  if (permissions.roles.includes("__dev__")) return <>{children}</>;

  const hasNoRoles = permissions.roles.length === 0 && Object.keys(permissions.modules).length === 0;
  const adminOnlyPaths = ["/permissions", "/governance"];
  const builderPrefixes = ["/builder", "/menu-builder", "/report-builder", "/document-builder", "/integration-builder", "/ai-builder"];

  if (hasNoRoles) {
    const isAdminOnly = adminOnlyPaths.some(p => path === p || path.startsWith(p + "/"));
    const isBuilderOnly = builderPrefixes.some(p => path === p || path.startsWith(p + "/"));
    if (isAdminOnly || isBuilderOnly) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <Shield className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground">אין הרשאה</h2>
            <p className="text-muted-foreground max-w-md">עמוד זה מיועד למנהלים בלבד. פנה למנהל המערכת.</p>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  const isBuilderRoute = builderPrefixes.some(p => path === p || path.startsWith(p + "/"));
  if (isBuilderRoute && !permissions.builderAccess) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground">אין הרשאה</h2>
          <p className="text-muted-foreground max-w-md">גישה לבניית מערכת דורשת הרשאת מנהל. פנה למנהל המערכת.</p>
        </div>
      </div>
    );
  }

  const requiredModules = matchRouteModules(path);
  if (!requiredModules) {
    if (isOpenRoute(path)) return <>{children}</>;
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground">אין הרשאה</h2>
          <p className="text-muted-foreground max-w-md">אין לך הרשאה לגשת לעמוד זה. פנה למנהל המערכת לקבלת גישה.</p>
        </div>
      </div>
    );
  }

  if (requiredModules.includes("__admin_only__")) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground">אין הרשאה</h2>
          <p className="text-muted-foreground max-w-md">אין לך הרשאה לגשת לעמוד זה. פנה למנהל המערכת לקבלת גישה.</p>
        </div>
      </div>
    );
  }

  if (requiredModules.includes("__admin_or_manager__")) {
    const MANAGER_ROLE_SLUGS = ["manager", "department-manager", "department_manager", "hr-manager", "hr_manager", "director", "general-manager", "production-manager", "project-manager", "super-admin"];
    const isManager = MANAGER_ROLE_SLUGS.some(slug => permissions.roles.includes(slug));
    if (!isManager) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <Shield className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground">אין הרשאה</h2>
            <p className="text-muted-foreground max-w-md">עמוד זה מיועד למנהלים ומנהלי מערכת בלבד.</p>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  for (const modSlug of requiredModules) {
    const mpBySlug = permissions.modules[modSlug];
    if (mpBySlug && (mpBySlug.view || mpBySlug.manage)) return <>{children}</>;
    const modId = moduleSlugMap[modSlug];
    if (modId) {
      const mpById = permissions.modules[String(modId)];
      if (mpById && (mpById.view || mpById.manage)) return <>{children}</>;
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <Shield className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground">אין הרשאה</h2>
        <p className="text-muted-foreground max-w-md">אין לך הרשאה לגשת לעמוד זה. פנה למנהל המערכת לקבלת גישה.</p>
      </div>
    </div>
  );
}

function Breadcrumbs({ navItems }: { navItems: NavItem[] }) {
  const [location] = useLocation();
  const { label: contextLabel } = useContext(BreadcrumbContext);
  const segments = location.split("/").filter(Boolean);

  const currentItem = useMemo(() => {
    const builderDataMatch = location.match(/^\/builder\/data\/(\d+)(?:\/.*)?$/);
    if (builderDataMatch) {
      const entityId = builderDataMatch[1];
      const exact = navItems.find(i => i.href && i.href === `/builder/data/${entityId}`);
      if (exact) return exact;
    }
    const exactMatch = navItems.find(i => i.href === location);
    if (exactMatch) return exactMatch;
    const prefixMatches = navItems.filter(
      i => i.href && i.href !== "/" && i.href !== location && location.startsWith(i.href + "/")
    );
    if (prefixMatches.length > 0) {
      return prefixMatches.reduce((a, b) => (a.href!.length >= b.href!.length ? a : b));
    }
    return undefined;
  }, [location, navItems]);

  if (segments.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        <LayoutDashboard className="w-4 h-4 text-primary/70 hidden md:block" />
        <h2 className="text-sm md:text-base font-semibold text-foreground truncate max-w-[200px] md:max-w-none">
          {currentItem?.label || "דשבורד"}
        </h2>
      </div>
    );
  }

  const sectionName = currentItem?.section;
  const subSectionName = currentItem?.subSection;
  const sectionFirstItem = sectionName ? navItems.find(i => i.section === sectionName && i.href) : undefined;
  const subSectionFirstItem = subSectionName ? navItems.find(i => i.section === sectionName && i.subSection === subSectionName && i.href) : undefined;

  const isDetailPage = currentItem && location !== currentItem.href;

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0" aria-label="breadcrumb">
      <Link href="/" className="text-muted-foreground/50 hover:text-muted-foreground transition-colors hidden md:block">
        <LayoutDashboard className="w-3.5 h-3.5" />
      </Link>
      {sectionName && (
        <>
          <ChevronRight className="w-3 h-3 text-muted-foreground/30 hidden md:block" />
          {sectionFirstItem?.href ? (
            <Link href={sectionFirstItem.href} className="text-muted-foreground/60 hover:text-foreground transition-colors hidden md:block truncate max-w-[120px]">
              {sectionName}
            </Link>
          ) : (
            <span className="text-muted-foreground/60 hidden md:block truncate max-w-[120px]">{sectionName}</span>
          )}
        </>
      )}
      {subSectionName && (
        <>
          <ChevronRight className="w-3 h-3 text-muted-foreground/30 hidden lg:block" />
          {subSectionFirstItem?.href ? (
            <Link href={subSectionFirstItem.href} className="text-muted-foreground/50 hover:text-foreground transition-colors hidden lg:block truncate max-w-[100px] text-xs">
              {subSectionName}
            </Link>
          ) : (
            <span className="text-muted-foreground/50 hidden lg:block truncate max-w-[100px] text-xs">{subSectionName}</span>
          )}
        </>
      )}
      {isDetailPage && currentItem?.href ? (
        <>
          <ChevronRight className="w-3 h-3 text-muted-foreground/30 hidden md:block" />
          <Link href={currentItem.href} className="text-muted-foreground/60 hover:text-foreground transition-colors hidden md:block truncate max-w-[120px]">
            {currentItem.label}
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/30 hidden md:block" />
          <span className="font-semibold text-foreground truncate max-w-[150px] md:max-w-xs">
            {contextLabel || segments[segments.length - 1]}
          </span>
        </>
      ) : (
        <>
          <ChevronRight className="w-3 h-3 text-muted-foreground/30 hidden md:block" />
          <span className="font-semibold text-foreground truncate max-w-[150px] md:max-w-xs">
            {contextLabel || currentItem?.label || segments[segments.length - 1]}
          </span>
        </>
      )}
    </nav>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [breadcrumbLabel, setBreadcrumbLabel] = useState<string | null>(null);
  useEffect(() => { setBreadcrumbLabel(null); }, [location]);
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [kobiWindows, setKobiWindows] = useState<KobiWindowInstance[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });
  const { hasBuilderAccess, permissions } = usePermissions();
  const { user: authUser, logout: handleLogout } = useAuth();
  const strategyNavItems = useStrategyNavItems();

  const { showCheatSheet, setShowCheatSheet, shortcuts } = useGlobalKeyboardShortcuts();

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          localStorage.setItem("sidebar-collapsed", String(next));
        }
      } catch (err) {
        console.warn("[sidebar] localStorage error:", err);
      }
      return next;
    });
  }, []);

  const { data: slugMap = {} } = useQuery<Record<string, number>>({
    queryKey: ["entity-slug-map"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/entities/slug-map`);
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 60000,
  });

  const { modules: _navModules } = usePlatformModules();
  const moduleSlugMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const mod of _navModules) {
      if (mod.slug) map[mod.slug] = mod.id;
    }
    return map;
  }, [_navModules]);

  const { data: anomalyStats } = useQuery<{ open_count?: number; critical_count?: number }>({
    queryKey: ["payment-anomalies-nav-badge"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/payment-anomalies/stats`);
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 120000,
    refetchInterval: 300000,
  });
  const anomalyOpenCount = Number(anomalyStats?.open_count || 0);

  const { data: liveOpsData } = useQuery<{ events: Array<{ id: string }>; connectedClients: number }>({
    queryKey: ["live-ops-nav-badge"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/live-ops/history`);
      if (!r.ok) return { events: [], connectedClients: 0 };
      return r.json();
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });
  const liveOpsEventCount = liveOpsData?.events?.length || 0;

  const allNavItems = [...NAV_ITEMS.slice(0, -1), ...strategyNavItems, NAV_ITEMS[NAV_ITEMS.length - 1]];

  const resolvedNavItems = useMemo(() => {
    return allNavItems.map(item => {
      if ("entitySlug" in item && item.entitySlug) {
        const entityId = slugMap[item.entitySlug];
        return { ...item, href: entityId ? `/builder/data/${entityId}` : undefined };
      }
      if (item.href === "/finance/payment-anomalies") {
        const tooltip = anomalyOpenCount > 0
          ? `${anomalyOpenCount} חריגות תשלום פתוחות הדורשות טיפול`
          : "אין חריגות תשלום פתוחות";
        return { ...item, badge: String(anomalyOpenCount), badgeTooltip: tooltip };
      }
      if (item.href === "/executive/live-ops") {
        const count = liveOpsEventCount > 99 ? "99+" : String(liveOpsEventCount);
        const tooltip = liveOpsEventCount > 0
          ? `${liveOpsEventCount} אירועי Live Ops פעילים`
          : "אין אירועי Live Ops פעילים";
        return { ...item, badge: count, badgeTooltip: tooltip };
      }
      return item;
    }).filter(item => item.href) as (NavItem & { href: string; badge?: string; badgeTooltip?: string })[];
  }, [slugMap, strategyNavItems, anomalyOpenCount, liveOpsEventCount]);

  const isDevMode = permissions.roles.includes("__dev__");
  const hasAnyPermissions = permissions.roles.length > 0 || Object.keys(permissions.modules).length > 0;
  const shouldFilterByPermissions = !permissions.isSuperAdmin && !isDevMode && hasAnyPermissions;

  const ADMIN_ONLY_NAV_HREFS = ["/permissions", "/governance"];

  const filteredNavItems = resolvedNavItems.filter(item => {
    if (BUILDER_SECTIONS.length > 0 && BUILDER_SECTIONS.includes(item.section) && !hasBuilderAccess()) {
      return false;
    }
    if (item.section === "מנהלת מערכת" && item.subSection === "כלים" && !hasBuilderAccess()) {
      return false;
    }
    if (item.href === "/builder" && !hasBuilderAccess()) {
      return false;
    }
    if (ADMIN_ONLY_NAV_HREFS.includes(item.href) && !permissions.isSuperAdmin && !permissions.roles.includes("__dev__")) {
      return false;
    }

    if (shouldFilterByPermissions) {
      if (!canAccessSection(item.section, permissions, moduleSlugMap)) {
        return false;
      }
      if (item.subSection) {
        const subRoles = SUBSECTION_ROLES_MAP[item.subSection];
        if (subRoles) {
          const isAdmin = permissions.roles.some(r => ["admin", "super-admin"].includes(r));
          if (!isAdmin) {
            const hasSubRole = permissions.roles.some(r => subRoles.includes(r));
            const sectionMods = SECTION_MODULE_MAP[item.section] || [];
            const hasModuleAccess = sectionMods.length > 0 && sectionMods.some(slug => {
              if (slug === "__admin_only__" || slug === "__role_only__") return false;
              const bySlug = permissions.modules[slug];
              if (bySlug && (bySlug.view || bySlug.manage)) return true;
              const modId = moduleSlugMap[slug];
              if (modId) {
                const byId = permissions.modules[String(modId)];
                return byId && (byId.view || byId.manage);
              }
              return false;
            });
            if (!hasSubRole && !hasModuleAccess) return false;
          }
        }
      }
    }
    return true;
  });

  const SECTION_ORDER = [
      "ראשי",
      "מנוע בינה מלאכותית — AI",
      "לקוחות ומכירות",
      "כספים",
      "תפעול",
      "ייצור ופרויקטים",
      "משאבי אנוש",
      "איכות, מסמכים ודוחות",
      "מנהלת מערכת",
    ];
  const searchFilteredNavItems = useMemo(() => {
    if (!sidebarSearch.trim()) return filteredNavItems;
    const q = sidebarSearch.trim().toLowerCase();
    return filteredNavItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.section.toLowerCase().includes(q) ||
      (item.subSection && item.subSection.toLowerCase().includes(q))
    );
  }, [filteredNavItems, sidebarSearch]);

  const sections = useMemo(() => {
    const uniqueSections = [...new Set(searchFilteredNavItems.map(i => i.section))];
    return uniqueSections.sort((a, b) => {
      const idxA = SECTION_ORDER.indexOf(a);
      const idxB = SECTION_ORDER.indexOf(b);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  }, [searchFilteredNavItems]);
  const ALWAYS_OPEN_SECTIONS = new Set(["ראשי"]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ label: breadcrumbLabel, setLabel: setBreadcrumbLabel }}>
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      <aside data-tour="sidebar" className={`flex flex-col h-full border-l border-border bg-card/50 backdrop-blur-xl flex-shrink-0 fixed lg:relative z-40 lg:z-20 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? "lg:w-[68px] w-72" : "w-72"} ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"} right-0 lg:right-auto`}>
        <div className={`p-3 md:p-4 flex items-center border-b border-border/50 ${isSidebarCollapsed ? "justify-center" : "gap-2 md:gap-3"}`}>
          <div className="w-8 md:w-9 h-8 md:h-9 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20 flex-shrink-0">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-4 md:w-5 h-4 md:h-5 object-contain" />
          </div>
          {!isSidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="font-bold text-sm md:text-base leading-tight text-foreground truncate">טכנו-כל עוזי</h1>
              <p className="text-[10px] text-muted-foreground">ERP 2026</p>
            </div>
          )}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 hover:bg-card/5 rounded-lg text-muted-foreground hover:text-foreground transition-colors lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSidebarCollapsed && !isMobileMenuOpen ? (
          <div className="flex-1 overflow-y-auto py-3 px-1.5 scrollbar-thin" style={{ touchAction: "pan-y" }}>
            {sections.map((section) => {
              const sectionItems = searchFilteredNavItems.filter(i => i.section === section);
              const firstItem = sectionItems[0];
              if (!firstItem) return null;
              const Icon = firstItem.icon || LayoutDashboard;
              const isActive = sectionItems.some(i => isPathActive(location, i.href));
              return (
                <Link
                  key={section}
                  href={firstItem.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  style={{ touchAction: "manipulation" }}
                  className={`flex items-center justify-center w-10 h-10 mx-auto mb-0.5 rounded-xl transition-all duration-200 group relative ${
                    isActive
                      ? "bg-primary/15 text-primary shadow-sm shadow-primary/10"
                      : "text-muted-foreground hover:bg-card/10 hover:text-foreground"
                  }`}
                  title={section}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  <div className="absolute right-full mr-2 px-2.5 py-1.5 rounded-lg bg-popover border border-border text-xs text-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-xl">
                    {section}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <>
            <div className="px-3 py-2 border-b border-border/30">
              <div className="relative">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                <input
                  type="text"
                  placeholder="חיפוש בתפריט..."
                  value={sidebarSearch}
                  onChange={e => setSidebarSearch(e.target.value)}
                  className="w-full bg-card/30 border border-border/40 rounded-lg pr-8 pl-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 focus:bg-card/50 transition-colors"
                />
                {sidebarSearch && (
                  <button
                    onClick={() => setSidebarSearch("")}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-3 px-3 scrollbar-thin" style={{ touchAction: "pan-y" }}>
              {sections.map((section, idx) => {
                const sectionItems = searchFilteredNavItems.filter(i => i.section === section);
                const canonicalFirstHref = filteredNavItems.find(i => i.section === section)?.href;
                const mappedHref = SECTION_DASHBOARD_HREFS[section];
                const isMappedHrefAccessible = mappedHref
                  ? filteredNavItems.some(i => i.section === section && i.href === mappedHref)
                  : false;
                const sectionHref = isMappedHrefAccessible ? mappedHref : canonicalFirstHref;
                return (
                  <CollapsibleSection
                    key={section}
                    title={section}
                    items={sectionItems}
                    location={location}
                    isFirstSection={idx === 0 && !sidebarSearch}
                    defaultOpen={ALWAYS_OPEN_SECTIONS.has(section) || !!sidebarSearch}
                    onNavigate={() => setIsMobileMenuOpen(false)}
                    sectionHref={sectionHref}
                  />
                );
              })}
              {!sidebarSearch && <DynamicMenuItemsSection location={location} />}
              {sidebarSearch && sections.length === 0 && (
                <div className="text-center py-8 text-muted-foreground/50 text-xs">
                  לא נמצאו תוצאות עבור &ldquo;{sidebarSearch}&rdquo;
                </div>
              )}
            </div>
          </>
        )}

        <div className={`p-3 border-t border-border/50 ${isSidebarCollapsed && !isMobileMenuOpen ? "flex flex-col items-center gap-2" : ""}`}>
          {authUser && !(isSidebarCollapsed && !isMobileMenuOpen) && (
            <div className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-lg bg-slate-800/30 text-xs text-muted-foreground">
              <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs flex-shrink-0">
                {String(authUser.fullName || authUser.username || "U").charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="text-slate-200 text-sm truncate">{String(authUser.fullNameHe || authUser.fullName || authUser.username)}</div>
                <div className="text-muted-foreground text-[10px] truncate">{String(authUser.department || authUser.jobTitle || "")}</div>
              </div>
            </div>
          )}
          {authUser && isSidebarCollapsed && !isMobileMenuOpen && (
            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs" title={String(authUser.fullNameHe || authUser.fullName || authUser.username)}>
              {String(authUser.fullName || authUser.username || "U").charAt(0)}
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className={`hidden lg:flex items-center justify-center rounded-lg text-muted-foreground hover:bg-card/10 hover:text-foreground transition-colors ${isSidebarCollapsed && !isMobileMenuOpen ? "w-10 h-10" : "gap-2.5 px-3 py-2 w-full mb-1 text-sm"}`}
            title={isSidebarCollapsed ? "הרחב תפריט" : "כווץ תפריט"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /><span>כווץ תפריט</span></>}
          </button>
          <button onClick={handleLogout} className={`flex items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors ${isSidebarCollapsed && !isMobileMenuOpen ? "justify-center w-10 h-10" : "gap-2.5 px-3 py-2 w-full text-sm"}`} title="התנתק">
            <LogOut className="w-4 h-4" />
            {!(isSidebarCollapsed && !isMobileMenuOpen) && <span>התנתק</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Offline Banner */}
        <OfflineBanner />

        {/* Top Header */}
        <header className="h-14 flex items-center justify-between px-3 md:px-6 border-b border-border/50 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-card/5 rounded-lg text-muted-foreground hover:text-foreground transition-colors lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Breadcrumbs navItems={resolvedNavItems} />
          </div>
          
          <div className="flex items-center gap-1 md:gap-3">
            <div data-tour="search"><Suspense fallback={null}><CommandPalette navItems={filteredNavItems} /></Suspense></div>
            <Link
              to="/chat"
              className="relative p-2 hover:bg-card/5 rounded-lg text-muted-foreground hover:text-foreground transition-colors block min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="צ'אט ארגוני — מסך מלא"
            >
              <MessageSquare className="w-5 h-5" />
              <Suspense fallback={null}><ChatBadge /></Suspense>
            </Link>
            <SyncStatusIndicator />
            <div data-tour="notifications"><NotificationsDropdown /></div>
            <ThemeToggle />
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border-2 border-border shadow-sm hidden md:block" />
          </div>
        </header>

        {/* Page Content */}
        <div className={`flex-1 overflow-hidden relative ${(location === "/claude-chat" || location === "/hi-tech-dashboard" || location === "/chat") ? "" : "overflow-y-auto p-2 sm:p-4 md:p-6"}`}>
          {(location === "/claude-chat" || location === "/hi-tech-dashboard" || location === "/chat") ? (
            children
          ) : (
            <div className="h-full overflow-y-auto">
              <motion.div
                key={location}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="max-w-7xl mx-auto space-y-6"
              >
                <RouteGuard path={location} permissions={permissions} moduleSlugMap={moduleSlugMap}>
                  {children}
                </RouteGuard>
              </motion.div>
            </div>
          )}
        </div>

      </main>

      {location !== "/chat" && (
        <>
          <Suspense fallback={null}><ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} /></Suspense>
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center group hover:scale-105"
            title="צ'אט ארגוני"
          >
            {isChatOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
            {!isChatOpen && <Suspense fallback={null}><ChatBadge /></Suspense>}
          </button>
        </>
      )}
      {kobiWindows.map((win, idx) => (
        <Suspense key={win.id} fallback={null}>
          <KobiChatWindow
            windowId={win.id}
            index={idx}
            minimized={win.minimized}
            onClose={id => setKobiWindows(prev => prev.filter(w => w.id !== id))}
            onMinimize={id => setKobiWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: true } : w))}
            onRestore={id => setKobiWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: false } : w))}
          />
        </Suspense>
      ))}
      <button
        onClick={() => setKobiWindows(prev => [...prev, { id: crypto.randomUUID(), minimized: false }])}
        className="fixed bottom-6 left-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-violet-700 text-white shadow-lg shadow-purple-600/30 hover:shadow-purple-600/50 transition-all flex items-center justify-center hover:scale-105"
        title="קובי AI — סוכן אוטונומי"
      >
        <Cpu className="w-6 h-6" />
      </button>
      <Suspense fallback={null}><QuickAddFAB /></Suspense>
      <Suspense fallback={null}><KeyboardShortcutCheatSheet open={showCheatSheet} onClose={() => setShowCheatSheet(false)} shortcuts={shortcuts} /></Suspense>
      <AlertToastContainer />
      <EnhancedToastContainer />
      <Suspense fallback={null}><PWAInstallPrompt /></Suspense>
    </div>
    </BreadcrumbContext.Provider>
  );
}
