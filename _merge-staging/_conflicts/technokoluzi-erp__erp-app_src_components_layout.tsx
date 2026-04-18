import { Link, useLocation } from "wouter";
import AICopilot from "@/components/ai/ai-copilot";
import KobiAgentPanel from "@/components/ai/kobi-agent-panel";
import AISmartSearch from "@/components/ai/ai-smart-search";
import { AlertToastContainer } from "@/components/notifications/alert-toast";
import QuickAddFAB from "@/components/quick-add-fab";
import { CommandPalette } from "@/components/command-palette";
import { useGlobalKeyboardShortcuts, KeyboardShortcutCheatSheet } from "@/components/keyboard-shortcuts";
import { EnhancedToastContainer } from "@/components/ui/enhanced-toast";
import { ThemeToggle } from "@/components/theme-toggle";
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
  Filter,
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
} from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/utils";
import { ChatPanel, ChatBadge } from "@/components/chat/chat-panel";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowLeftRight, ArrowUpDown, Award,
  Banknote, BarChart3, Beaker, Bell, BellRing, Blocks, BookOpen, Bot, Boxes, Brain, Briefcase, Building2,
  Calculator, Calendar, CalendarDays, Check, CheckCheck, CheckCircle2, CheckSquare, ChevronDown,
  CircleDot, ClipboardCheck, ClipboardList, Clock, Cog, Copy, Cpu, CreditCard,
  Database, DollarSign, Eye, Factory, FileBarChart, FileCheck, FileCode, FileText, Flag,
  FolderArchive, FolderCog, FolderKanban, FolderTree, FormInput, Filter, Gauge, GitBranch, Globe,
  GraduationCap, Headphones, Heart, History, Image, Key, Landmark, Layers, LayoutDashboard, LayoutGrid,
  LayoutList, LayoutTemplate, Lightbulb, Link2, List, LogIn, LogOut,
  Mail, Map, MapPin, Megaphone, Menu, MenuSquare, MessageCircle, MessageSquare, Moon,
  MousePointer, MousePointerClick, Package, PackageCheck, PenTool, Percent, Phone, PiggyBank, Plug, Puzzle,
  Receipt, RotateCcw, Ruler, Scale, Search, SearchCode, Send, Server, Settings, Share2,
  Shield, ShieldAlert, ShieldCheck, Ship, ShoppingCart, Smartphone, Sparkles, Star,
  Table2, Target, TestTube, TextCursorInput, ThumbsUp, TrendingDown, TrendingUp, Truck,
  Upload, User, UserPlus, Users, Users2, Wallet, Warehouse, Wrench, X, Zap,
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
}

const NAV_ITEMS: NavItem[] = [
    // ═══════════════ 1. ראשי ═══════════════
    { href: "/", label: "דשבורד מנהלים", icon: LayoutDashboard, section: "ראשי" },
    { href: "/platform", label: "סקירת פלטפורמה", icon: LayoutGrid, section: "ראשי" },
    { href: "/operations-control-center", label: "מרכז בקרה ותפעול", icon: Activity, section: "ראשי" },
    { href: "/alert-terminal", label: "טרמינל התראות", icon: Activity, section: "ראשי" },
    { href: "/analytics", label: "אנליטיקה מתקדם", icon: BarChart3, section: "ראשי" },
    { href: "/documents/company-report", label: "דוח מצב החברה", icon: FileBarChart, section: "ראשי" },
    { href: "/calendar", label: "יומן אישי", icon: CalendarDays, section: "ראשי", subSection: "כלים" },
    { href: "/ai-settings", label: "הגדרות AI", icon: Settings, section: "ראשי", subSection: "כלים" },
    // ═══════════════ 2. תקשורת ושיתוף פעולה ═══════════════
    { href: "/chat", label: "צ'אט ארגוני", icon: MessageCircle, section: "תקשורת ושיתוף פעולה" },
    { href: "/claude-chat", label: "עוזי AI צ'אט", icon: MessageSquare, section: "תקשורת ושיתוף פעולה" },
    { href: "/meetings", label: "פגישות", icon: CalendarDays, section: "תקשורת ושיתוף פעולה" },
    { href: "/crm/whatsapp-sms", label: "WhatsApp / SMS", icon: MessageSquare, section: "תקשורת ושיתוף פעולה" },
    { href: "/crm/email-sync", label: "Email Sync", icon: Mail, section: "תקשורת ושיתוף פעולה" },
    // ═══════════════ 3. מנוע בינה מלאכותית — AI ═══════════════
    // ── מנוע ראשי ──
    { href: "/ai-engine", label: "AI Engine Hub", icon: Brain, section: "מנוע בינה מלאכותית — AI", subSection: "מנוע ראשי" },
    { href: "/ai-engine/kobi", label: "קובי — סוכן AI", icon: Cpu, section: "מנוע בינה מלאכותית — AI", subSection: "מנוע ראשי" },
    { href: "/ai-engine/super-agent-dashboard", label: "Super Agent — דשבורד", icon: Network, section: "מנוע בינה מלאכותית — AI", subSection: "מנוע ראשי" },
    { href: "/ai-engine/transactions", label: "מעקב עסקאות", icon: Activity, section: "מנוע בינה מלאכותית — AI", subSection: "מנוע ראשי" },
    { href: "/ai-engine/ai-chatbot-settings", label: "AI Chatbot Settings", icon: Bot, section: "מנוע בינה מלאכותית — AI", subSection: "מנוע ראשי" },
    // ── Kimi Terminal ──
    { href: "/ai-engine/kimi-terminal", label: "Kimi 2 Terminal", icon: Moon, section: "מנוע בינה מלאכותית — AI", subSection: "Kimi Terminal" },
    { href: "/ai-engine/kimi-challenges", label: "Kimi מבחני ביצוע", icon: Zap, section: "מנוע בינה מלאכותית — AI", subSection: "Kimi Terminal" },
    // ── אנליטיקס ──
    { href: "/ai-engine/lead-scoring", label: "Lead Scoring AI", icon: Target, section: "מנוע בינה מלאכותית — AI", subSection: "אנליטיקס" },
    { href: "/ai-engine/call-nlp-analysis", label: "Call NLP Analysis", icon: Phone, section: "מנוע בינה מלאכותית — AI", subSection: "אנליטיקס" },
    { href: "/ai-engine/predictive", label: "Predictive Analytics", icon: TrendingUp, section: "מנוע בינה מלאכותית — AI", subSection: "אנליטיקס" },
    // ── כלי AI ──
    { href: "/ai-document-processor", label: "עיבוד מסמכים AI", icon: Sparkles, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
    { href: "/hi-tech-dashboard", label: "דאשבורד הייטק — סוכני AI", icon: Bot, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
    // ── ניהול AI ──
    { href: "/ai/models", label: "מודלי AI", icon: Brain, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול AI" },
    { href: "/ai/providers", label: "ספקי AI", icon: Plug, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול AI" },
    { href: "/ai/prompt-templates", label: "תבניות פרומפט", icon: FileText, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול AI" },
    { href: "/ai/api-keys", label: "מפתחות API", icon: Key, section: "מנוע בינה מלאכותית — AI", subSection: "ניהול AI" },
    // ── נתוני AI ──
    { href: "/ai/queries", label: "שאילתות AI", icon: Search, section: "מנוע בינה מלאכותית — AI", subSection: "נתוני AI" },
    { href: "/ai/recommendations", label: "המלצות AI", icon: Sparkles, section: "מנוע בינה מלאכותית — AI", subSection: "נתוני AI" },
    { href: "/ai/responses", label: "תגובות AI", icon: MessageSquare, section: "מנוע בינה מלאכותית — AI", subSection: "נתוני AI" },
    { href: "/ai/usage-logs", label: "לוגים AI", icon: Activity, section: "מנוע בינה מלאכותית — AI", subSection: "נתוני AI" },
    // ── AI תפעולי — מכירות ──
    { href: "/ai-ops/sales-assistant", label: "עוזר מכירות AI", icon: Sparkles, section: "מנוע בינה מלאכותית — AI", subSection: "AI תפעולי — מכירות" },
    { href: "/ai-ops/lead-scoring", label: "דירוג לידים AI", icon: Target, section: "מנוע בינה מלאכותית — AI", subSection: "AI תפעולי — מכירות" },
    { href: "/ai-ops/customer-service", label: "שירות לקוחות AI", icon: Headphones, section: "מנוע בינה מלאכותית — AI", subSection: "AI תפעולי — מכירות" },
    { href: "/ai-ops/follow-up", label: "מעקב לקוחות AI", icon: Clock, section: "מנוע בינה מלאכותית — AI", subSection: "AI תפעולי — מכירות" },
    { href: "/ai-ops/quotation-assistant", label: "עוזר הצעות מחיר AI", icon: FileText, section: "מנוע בינה מלאכותית — AI", subSection: "AI תפעולי — מכירות" },
    // ── AI תפעולי — תפעול ──
    { href: "/ai-ops/procurement-optimizer", label: "אופטימיזציית רכש AI", icon: Truck, section: "מנוע בינה מלאכותית — AI", subSection: "AI תפעולי — תפעול" },
    { href: "/ai-ops/production-insights", label: "תובנות ייצור AI", icon: Wrench, section: "מנוע בינה מלאכותית — AI", subSection: "AI תפעולי — תפעול" },
    { href: "/ai-ops/anomaly-detection", label: "זיהוי חריגות AI", icon: AlertTriangle, section: "מנוע בינה מלאכותית — AI", subSection: "AI תפעולי — תפעול" },
    { href: "/ai-ops/executive-insights", label: "תובנות מנהלים AI", icon: Brain, section: "מנוע בינה מלאכותית — AI", subSection: "AI תפעולי — תפעול" },
        { href: "/system/model-catalog", label: "קטלוג מודלים", icon: Brain, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
      { href: "/ai-engine/call-nlp", label: "NLP שיחות", icon: Phone, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
      { href: "/ai-engine/chatbot", label: "צ'אטבוט AI", icon: Bot, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
      { href: "/ai-engine/kimi", label: "Kimi AI", icon: Brain, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
      { href: "/ai-engine/kobi-ide", label: "קובי IDE", icon: Bot, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
      { href: "/ai-engine/super-agent", label: "סופר-אייג'נט", icon: Sparkles, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
      { href: "/kobi", label: "קובי ראשי", icon: Bot, section: "מנוע בינה מלאכותית — AI" },
      { href: "/blackrock", label: "BlackRock ניתוח", icon: BarChart3, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
      { href: "/kimi", label: "Kimi 1", icon: Brain, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
      { href: "/kimi2", label: "Kimi 2", icon: Brain, section: "מנוע בינה מלאכותית — AI", subSection: "כלי AI" },
  
    // ═══════════════ 4. שולחן שליטה מנהלי ═══════════════
    // ── דשבורדים ──
    { href: "/executive/ceo-dashboard", label: 'דשבורד מנכ"ל', icon: Award, section: "שולחן שליטה מנהלי", subSection: "דשבורדים" },
    { href: "/executive/live-ops", label: "מרכז פעילות חי", icon: Activity, section: "שולחן שליטה מנהלי", subSection: "דשבורדים" },
    { href: "/executive/company-health", label: "בריאות החברה", icon: Heart, section: "שולחן שליטה מנהלי", subSection: "דשבורדים" },
    { href: "/executive/kpi-board", label: "לוח KPI מנהלי", icon: Gauge, section: "שולחן שליטה מנהלי", subSection: "דשבורדים" },
    { href: "/executive/profitability", label: "דשבורד רווחיות", icon: DollarSign, section: "שולחן שליטה מנהלי", subSection: "דשבורדים" },
    // ── סיכונים ובקרה ──
    { href: "/executive/live-alerts", label: "מרכז התראות חי", icon: AlertTriangle, section: "שולחן שליטה מנהלי", subSection: "סיכונים ובקרה" },
    { href: "/executive/financial-risk", label: "סיכונים פיננסיים", icon: Shield, section: "שולחן שליטה מנהלי", subSection: "סיכונים ובקרה" },
    { href: "/executive/procurement-risk", label: "סיכוני רכש", icon: Truck, section: "שולחן שליטה מנהלי", subSection: "סיכונים ובקרה" },
    // ── ביצועים תפעוליים ──
    { href: "/executive/operational-bottlenecks", label: "צווארי בקבוק", icon: Activity, section: "שולחן שליטה מנהלי", subSection: "ביצועים תפעוליים" },
    { href: "/executive/delayed-projects", label: "פרויקטים באיחור", icon: Clock, section: "שולחן שליטה מנהלי", subSection: "ביצועים תפעוליים" },
    { href: "/executive/production-efficiency", label: "יעילות ייצור", icon: Wrench, section: "שולחן שליטה מנהלי", subSection: "ביצועים תפעוליים" },
    { href: "/executive/workforce-status", label: "סטטוס כוח אדם", icon: Users, section: "שולחן שליטה מנהלי", subSection: "ביצועים תפעוליים" },
    { href: "/data-flow", label: "זרימת נתונים (ארכיטקטורה)", icon: Activity, section: "שולחן שליטה מנהלי", subSection: "ביצועים תפעוליים" },
        { href: "/executive/war-room", label: "חדר מלחמה", icon: AlertCircle, section: "שולחן שליטה מנהלי" },
      { href: "/executive/order-lifecycle", label: "מחזור חיי הזמנה", icon: RotateCcw, section: "שולחן שליטה מנהלי" },
      { href: "/executive/profitability-dashboard", label: "דשבורד רווחיות", icon: DollarSign, section: "שולחן שליטה מנהלי" },
  
    // ═══════════════ 5. לקוחות ומכירות ═══════════════
    // ── CRM ולקוחות ──
    { href: "/crm", label: "דשבורד CRM", icon: Activity, section: "לקוחות ומכירות", subSection: "CRM ולקוחות" },
    { href: "/sales/customers", label: "ניהול לקוחות", icon: Building2, section: "לקוחות ומכירות", subSection: "CRM ולקוחות" },
    { entitySlug: "customer", label: "לקוחות (דינמי)", icon: Building2, section: "לקוחות ומכירות", subSection: "CRM ולקוחות" },
    { entitySlug: "contact-person", label: "אנשי קשר", icon: User, section: "לקוחות ומכירות", subSection: "CRM ולקוחות" },
    { href: "/crm/leads", label: "ניהול לידים", icon: Lightbulb, section: "לקוחות ומכירות", subSection: "CRM ולקוחות" },
    { href: "/crm/field-agents", label: "סוכני שטח", icon: MapPin, section: "לקוחות ומכירות", subSection: "CRM ולקוחות" },
    { href: "/sales/pipeline", label: "צנרת CRM", icon: Target, section: "לקוחות ומכירות", subSection: "CRM ולקוחות" },
    { entitySlug: "crm-activity", label: "פעילויות CRM", icon: Activity, section: "לקוחות ומכירות", subSection: "CRM ולקוחות" },
    // ── מכירות ──
    { href: "/sales/quotations", label: "הצעות מחיר", icon: FileCode, section: "לקוחות ומכירות", subSection: "מכירות" },
    { entitySlug: "quote", label: "הצעות מחיר (דינמי)", icon: FileCode, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/orders", label: "הזמנות מכירה", icon: ShoppingCart, section: "לקוחות ומכירות", subSection: "מכירות" },
    { entitySlug: "sales-order", label: "הזמנות לקוח (דינמי)", icon: ShoppingCart, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/invoicing", label: "חשבוניות מכירה", icon: Receipt, section: "לקוחות ומכירות", subSection: "מכירות" },
    { entitySlug: "invoice", label: "חשבוניות (דינמי)", icon: Receipt, section: "לקוחות ומכירות", subSection: "מכירות" },
    { entitySlug: "delivery-note", label: "תעודות משלוח", icon: Truck, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/delivery-notes", label: "תעודות משלוח (מתקדם)", icon: Truck, section: "לקוחות ומכירות", subSection: "מכירות" },
    { entitySlug: "sales-return", label: "החזרות מכירה", icon: RotateCcw, section: "לקוחות ומכירות", subSection: "מכירות" },
    { href: "/sales/returns", label: "החזרות מכירה (מתקדם)", icon: RotateCcw, section: "לקוחות ומכירות", subSection: "מכירות" },
    // ── שירות ותמיכה ──
    { href: "/sales/service", label: "שירות לקוחות", icon: Headphones, section: "לקוחות ומכירות", subSection: "שירות ותמיכה" },
    { href: "/ai-customer-service", label: "AI שירות לקוחות", icon: Bot, section: "לקוחות ומכירות", subSection: "שירות ותמיכה" },
    { href: "/support/tickets", label: "פניות תמיכה", icon: Headphones, section: "לקוחות ומכירות", subSection: "שירות ותמיכה" },
    { entitySlug: "calls", label: "שיחות", icon: Phone, section: "לקוחות ומכירות", subSection: "שירות ותמיכה" },
    { href: "/sales/customer-portal", label: "פורטל לקוחות", icon: Globe, section: "לקוחות ומכירות", subSection: "שירות ותמיכה" },
    { href: "/crm/sla", label: "ניהול SLA", icon: ShieldCheck, section: "לקוחות ומכירות", subSection: "שירות ותמיכה" },
    { href: "/crm/smart-routing", label: "ניתוב חכם", icon: GitBranch, section: "לקוחות ומכירות", subSection: "שירות ותמיכה" },
    { href: "/crm/automations", label: "אוטומציות CRM", icon: Zap, section: "לקוחות ומכירות", subSection: "שירות ותמיכה" },
    // ── CRM מתקדם ──
    { href: "/crm/ai-insights", label: "AI Insights", icon: Brain, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/predictive-analytics", label: "Predictive Analytics", icon: BarChart3, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/lead-quality", label: "Lead Quality Score", icon: Star, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/realtime-feed", label: "Real-Time Feed", icon: Activity, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/advanced-search", label: "Advanced Search", icon: Search, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/collaboration", label: "Collaboration", icon: Users2, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/ai/lead-scoring", label: "Lead Scoring AI", icon: Sparkles, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/ai/next-action", label: "Next Best Action", icon: Target, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/ai/predictive", label: "Predictive Analytics", icon: TrendingUp, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/ai/anomaly", label: "Anomaly Detection", icon: AlertTriangle, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/realtime/feeds", label: "Live Feeds", icon: Activity, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/realtime/notifications", label: "Instant Notifications", icon: Bell, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/realtime/triggers", label: "Trigger Actions", icon: Zap, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/realtime/sync", label: "Sync Devices", icon: ArrowLeftRight, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/analytics/custom-reports", label: "Custom Reports", icon: BarChart3, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/analytics/trends", label: "Trend Analysis", icon: TrendingUp, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/analytics/cohort", label: "Cohort Analysis", icon: Users, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/analytics/filters", label: "Advanced Filters", icon: Filter, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/integrations/rest-api", label: "REST API", icon: FileCode, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/integrations/mobile", label: "Mobile Sync", icon: Smartphone, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/integrations/cloud", label: "Cloud Storage", icon: Globe, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    { href: "/crm/integrations/webhooks", label: "Webhooks", icon: Plug, section: "לקוחות ומכירות", subSection: "CRM מתקדם" },
    // ── אבטחת CRM ──
    { href: "/crm/security/sso", label: "SSO / SAML", icon: Key, section: "לקוחות ומכירות", subSection: "אבטחת CRM" },
    { href: "/crm/security/encryption", label: "Field Encryption", icon: Shield, section: "לקוחות ומכירות", subSection: "אבטחת CRM" },
    { href: "/crm/security/row-security", label: "Row-Level Security", icon: ShieldCheck, section: "לקוחות ומכירות", subSection: "אבטחת CRM" },
    { href: "/crm/security/audit", label: "Audit Trail", icon: FileText, section: "לקוחות ומכירות", subSection: "אבטחת CRM" },
    // ── ניתוח רווחיות ──
    { href: "/crm/profitability", label: "רווחיות יומית", icon: TrendingUp, section: "לקוחות ומכירות", subSection: "ניתוח רווחיות" },
    { href: "/crm/contractor-decision", label: "מודל קבלת החלטות", icon: Scale, section: "לקוחות ומכירות", subSection: "ניתוח רווחיות" },
        { href: "/customers", label: "לקוחות (כללי)", icon: Users, section: "לקוחות ומכירות" },
      { href: "/products", label: "מוצרים", icon: Package, section: "לקוחות ומכירות" },
      { href: "/invoices", label: "חשבוניות (כללי)", icon: Receipt, section: "לקוחות ומכירות" },
      { href: "/sales-orders", label: "הזמנות מכירה (כללי)", icon: ShoppingCart, section: "לקוחות ומכירות" },
      { href: "/crm/contacts", label: "אנשי קשר", icon: Users, section: "לקוחות ומכירות", subSection: "CRM" },
      { href: "/crm/pipeline", label: "צינור מכירות", icon: Filter, section: "לקוחות ומכירות", subSection: "CRM" },
      { href: "/crm/activities", label: "פעילויות CRM", icon: Activity, section: "לקוחות ומכירות", subSection: "CRM" },
      { href: "/crm/service", label: "שירות לקוחות", icon: Headphones, section: "לקוחות ומכירות", subSection: "שירות ותמיכה" },
      { href: "/crm/meetings", label: "פגישות CRM", icon: Calendar, section: "לקוחות ומכירות", subSection: "CRM" },
      { href: "/crm/messaging", label: "הודעות CRM", icon: MessageSquare, section: "לקוחות ומכירות", subSection: "CRM" },
      { href: "/crm/portal", label: "פורטל CRM", icon: Globe, section: "לקוחות ומכירות", subSection: "שירות ותמיכה" },
      { href: "/crm/automation", label: "אוטומציה CRM", icon: Sparkles, section: "לקוחות ומכירות", subSection: "CRM" },
      { href: "/crm/real-time", label: "בזמן אמת", icon: Activity, section: "לקוחות ומכירות", subSection: "CRM" },
      { href: "/crm/search", label: "חיפוש CRM", icon: Search, section: "לקוחות ומכירות", subSection: "CRM" },
      { href: "/crm/leads-management", label: "ניהול לידים", icon: Target, section: "לקוחות ומכירות", subSection: "CRM" },
      { href: "/crm/customers", label: "לקוחות CRM", icon: Users, section: "לקוחות ומכירות", subSection: "CRM" },
      { href: "/crm/quotations", label: "הצעות מחיר CRM", icon: FileText, section: "לקוחות ומכירות", subSection: "מכירות" },
      { href: "/crm/sales-orders", label: "הזמנות מכירה CRM", icon: ShoppingCart, section: "לקוחות ומכירות", subSection: "מכירות" },
      { href: "/crm/pricing", label: "תמחור", icon: DollarSign, section: "לקוחות ומכירות", subSection: "מכירות" },
      { href: "/crm/collections", label: "גבייה", icon: Wallet, section: "לקוחות ומכירות", subSection: "מכירות" },
      { href: "/sales/quotes", label: "הצעות מחיר", icon: FileText, section: "לקוחות ומכירות", subSection: "מכירות" },
      { href: "/sales/invoices", label: "חשבוניות מכירה", icon: Receipt, section: "לקוחות ומכירות", subSection: "מכירות" },
  
        { href: "/pricing/price-lists", label: "מחירונים", icon: DollarSign, section: "לקוחות ומכירות", subSection: "מכירות" },
      { href: "/pricing/collections", label: "גבייה", icon: Wallet, section: "לקוחות ומכירות", subSection: "מכירות" },
      { href: "/pricing/cost-calculations", label: "חישובי עלות", icon: Calculator, section: "לקוחות ומכירות", subSection: "מכירות" },
      { href: "/pricing/cost-calc", label: "מחשבון עלות", icon: Calculator, section: "לקוחות ומכירות", subSection: "מכירות" },
      { href: "/pricing/dynamic", label: "תמחור דינמי", icon: TrendingUp, section: "לקוחות ומכירות", subSection: "מכירות" },
      { href: "/pricing/daily-profit", label: "רווח יומי", icon: BarChart3, section: "לקוחות ומכירות", subSection: "מכירות" },
  
        { href: "/product-catalog", label: "קטלוג מוצרים", icon: Package, section: "לקוחות ומכירות" },
  
    // ═══════════════ 6. כספים ═══════════════
    // ── חייבים ──
    { href: "/finance/customers/invoices", label: "חשבוניות לקוחות", icon: FileText, section: "כספים", subSection: "חייבים" },
    { href: "/finance/customers/payments", label: "קבלות", icon: CreditCard, section: "כספים", subSection: "חייבים" },
    { href: "/finance/aging-report", label: "גיול חובות", icon: Clock, section: "כספים", subSection: "חייבים" },
    { href: "/finance/debtors-balances", label: "דוח חייבים", icon: Wallet, section: "כספים", subSection: "חייבים" },
    // ── זכאים ──
    { href: "/finance/suppliers/invoices", label: "חשבוניות ספקים", icon: FileText, section: "כספים", subSection: "זכאים" },
    { href: "/finance/suppliers/payments", label: "תשלומים לספקים", icon: Banknote, section: "כספים", subSection: "זכאים" },
    { href: "/finance/supplier-aging", label: "גיול זכאים", icon: Clock, section: "כספים", subSection: "זכאים" },
    { href: "/finance/vendor-aging", label: "דוח זכאים", icon: Users, section: "כספים", subSection: "זכאים" },
    // ── בנקים וקופה ──
    { entitySlug: "finance-bank-accounts", label: "חשבונות בנק", icon: Landmark, section: "כספים", subSection: "בנקים וקופה" },
    { href: "/finance/bank-reconciliation", label: "התאמות בנק", icon: Landmark, section: "כספים", subSection: "בנקים וקופה" },
    { href: "/finance/cash-flow", label: "תזרים מזומנים", icon: TrendingUp, section: "כספים", subSection: "בנקים וקופה" },
    { href: "/finance/checks-management", label: "ניהול צ׳קים", icon: FileCheck, section: "כספים", subSection: "בנקים וקופה" },
    // ── הנהלת חשבונות ──
    { href: "/finance/journal-entries", label: "יומן תנועות", icon: BookOpen, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/trial-balance", label: "מאזן בוחן", icon: Scale, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/chart-of-accounts", label: "עץ חשבונות", icon: FolderTree, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance/customer-vendor-ledger", label: "כרטסת חשבון", icon: BookOpen, section: "כספים", subSection: "הנהלת חשבונות" },
    // ── תמחור וגבייה ──
    { href: "/pricing/price-lists-ent", label: "מחירונים", icon: List, section: "כספים", subSection: "תמחור וגבייה" },
    { href: "/pricing/cost-calculator", label: "תמחור מוצרים", icon: Calculator, section: "כספים", subSection: "תמחור וגבייה" },
    { href: "/pricing/collection-management", label: "גבייה", icon: CreditCard, section: "כספים", subSection: "תמחור וגבייה" },
    { href: "/finance/payment-reminders", label: "תזכורות תשלום", icon: Bell, section: "כספים", subSection: "תמחור וגבייה" },
    // ── מס ודיווח ──
    { href: "/finance/vat-report", label: 'דוחות מע"מ', icon: Percent, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/withholding-tax", label: "ניכויים במקור", icon: FileText, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/profit-loss", label: "דוח רווח והפסד", icon: TrendingUp, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/balance-sheet", label: "מאזן", icon: Scale, section: "כספים", subSection: "מס ודיווח" },
    { href: "/finance/cash-flow", label: "דוח תזרים", icon: Activity, section: "כספים", subSection: "מס ודיווח" },
    // ── תקציבים ──
    { href: "/finance/budgets", label: "תקציב שנתי", icon: PiggyBank, section: "כספים", subSection: "תקציבים" },
    { href: "/finance/budget-departments", label: "תקציב מחלקתי", icon: Layers, section: "כספים", subSection: "תקציבים" },
    { href: "/finance/budget-vs-actual", label: "ביצוע מול תקציב", icon: Target, section: "כספים", subSection: "תקציבים" },
    { href: "/budget-tracking", label: "מעקב תקציבי", icon: DollarSign, section: "כספים", subSection: "תקציבים" },
    // ── הוצאות ──
    { href: "/finance/expense-reports", label: "דוחות הוצאות", icon: Receipt, section: "כספים", subSection: "הוצאות" },
    { href: "/finance/expense-items", label: "קטגוריות הוצאות", icon: FolderTree, section: "כספים", subSection: "הוצאות" },
    { href: "/finance/expense-claims", label: "אישור הוצאות", icon: CheckSquare, section: "כספים", subSection: "הוצאות" },
            { href: "/accounting", label: "חשבונאות (כללי)", icon: Calculator, section: "כספים", subSection: "הנהלת חשבונות" },
    { href: "/finance", label: "דשבורד כספים", icon: DollarSign, section: "כספים" },
      { href: "/finance/cost-centers", label: "מרכזי עלות", icon: Layers, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/invoices", label: "חשבוניות", icon: Receipt, section: "כספים", subSection: "חייבים" },
      { href: "/finance/receipts", label: "קבלות", icon: Receipt, section: "כספים", subSection: "חייבים" },
      { href: "/finance/credit-notes", label: "זיכויים", icon: FileText, section: "כספים", subSection: "חייבים" },
      { href: "/finance/customers/refunds", label: "החזרים ללקוחות", icon: RotateCcw, section: "כספים", subSection: "חייבים" },
      { href: "/finance/customers/products", label: "מוצרי לקוחות", icon: Package, section: "כספים", subSection: "חייבים" },
      { href: "/finance/suppliers/credit-notes", label: "זיכויי ספקים", icon: FileText, section: "כספים", subSection: "זכאים" },
      { href: "/finance/suppliers/products", label: "מוצרי ספקים", icon: Package, section: "כספים", subSection: "זכאים" },
      { href: "/finance/debit-notes", label: "חיובים", icon: FileText, section: "כספים", subSection: "חייבים" },
      { href: "/finance/petty-cash", label: "קופה קטנה", icon: Wallet, section: "כספים", subSection: "בנקים וקופה" },
      { href: "/finance/payment-runs", label: "ריצות תשלום", icon: Zap, section: "כספים", subSection: "זכאים" },
      { href: "/finance/general-ledger", label: "ספר חשבונות ראשי", icon: BookOpen, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/fixed-assets", label: "רכוש קבוע", icon: Building2, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/financial-reports", label: "דוחות פיננסיים", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/control-center", label: "מרכז בקרה", icon: Settings, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/payment-terms", label: "תנאי תשלום", icon: Clock, section: "כספים", subSection: "תמחור וגבייה" },
      { href: "/finance/revenue-tracking", label: "מעקב הכנסות", icon: TrendingUp, section: "כספים", subSection: "חייבים" },
      { href: "/finance/expense-breakdown", label: "פירוט הוצאות", icon: PieChart, section: "כספים", subSection: "הוצאות" },
      { href: "/finance/project-profitability", label: "רווחיות פרויקטים", icon: BarChart3, section: "כספים", subSection: "תמחור וגבייה" },
      { href: "/finance/customer-profitability", label: "רווחיות לקוחות", icon: Users, section: "כספים", subSection: "תמחור וגבייה" },
      { href: "/finance/supplier-cost-analysis", label: "ניתוח עלויות ספקים", icon: Truck, section: "כספים", subSection: "זכאים" },
      { href: "/finance/management-reporting", label: "דוחות הנהלה", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/customer-aging", label: "גיול לקוחות", icon: Clock, section: "כספים", subSection: "חייבים" },
      { href: "/finance/fiscal-report", label: "דוח פיסקלי", icon: FileText, section: "כספים", subSection: "מס ודיווח" },
      { href: "/finance/invoice-analysis", label: "ניתוח חשבוניות", icon: Search, section: "כספים", subSection: "חייבים" },
      { href: "/finance/analytics", label: "אנליטיקס פיננסי", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/executive-summary", label: "סיכום מנהלים", icon: FileText, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/projects", label: "פרויקטים פיננסיים", icon: FolderKanban, section: "כספים", subSection: "תקציבים" },
      { href: "/finance/income", label: "הכנסות", icon: TrendingUp, section: "כספים", subSection: "חייבים" },
      { href: "/finance/expenses", label: "הוצאות", icon: TrendingDown, section: "כספים", subSection: "הוצאות" },
      { href: "/finance/expense-upload", label: "העלאת הוצאות", icon: Upload, section: "כספים", subSection: "הוצאות" },
      { href: "/finance/expense-filing", label: "תיוק הוצאות", icon: FolderArchive, section: "כספים", subSection: "הוצאות" },
      { href: "/finance/expense-files", label: "קבצי הוצאות", icon: FileText, section: "כספים", subSection: "הוצאות" },
      { href: "/finance/blackrock-2026", label: "BlackRock 2026", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/blackrock-monte-carlo", label: "מונטה קרלו", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/blackrock-var", label: "VaR ניתוח", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/blackrock-risk-matrix", label: "מטריצת סיכונים", icon: Shield, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/blackrock-hedging", label: "גידור סיכונים", icon: Shield, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/blackrock-ai", label: "BlackRock AI", icon: Brain, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/payment-anomalies", label: "חריגות תשלום", icon: AlertCircle, section: "כספים", subSection: "בנקים וקופה" },
      { href: "/finance/credit-card-processing", label: "עיבוד כרטיסי אשראי", icon: CreditCard, section: "כספים", subSection: "בנקים וקופה" },
      { href: "/finance/accounting-portal", label: "פורטל חשבונאות", icon: Globe, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/reports", label: "דוחות כספים", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/income-expenses-report", label: "דוח הכנסות/הוצאות", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/accounting-reports", label: "דוחות חשבונאיים", icon: FileText, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/operational-profit", label: "רווח תפעולי", icon: TrendingUp, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/accounting-settings", label: "הגדרות חשבונאות (כפול)", icon: Settings, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/standing-orders", label: "הוראות קבע", icon: RotateCcw, section: "כספים", subSection: "בנקים וקופה" },
      { href: "/finance/journal", label: "יומן חשבונאות", icon: BookOpen, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/tax-management", label: "ניהול מס", icon: Calculator, section: "כספים", subSection: "מס ודיווח" },
      { href: "/finance/journal-transactions", label: "פקודות יומן", icon: FileText, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/journal-report", label: "דוח יומן", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/audit-control", label: "בקרת ביקורת", icon: ShieldCheck, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/working-files", label: "ניירות עבודה", icon: FolderKanban, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/annual-report", label: "דוח שנתי", icon: FileText, section: "כספים", subSection: "מס ודיווח" },
      { href: "/finance/accounting-inventory", label: "מלאי חשבונאי", icon: Package, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/depreciation-schedule", label: "לוח פחת", icon: TrendingDown, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/loan-analysis", label: "ניתוח הלוואות", icon: DollarSign, section: "כספים", subSection: "בנקים וקופה" },
      { href: "/finance/adjusting-entries", label: "פקודות התאמה", icon: FileText, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/deferred-revenue", label: "הכנסות נדחות", icon: Clock, section: "כספים", subSection: "חייבים" },
      { href: "/finance/deferred-expenses", label: "הוצאות נדחות", icon: Clock, section: "כספים", subSection: "הוצאות" },
      { href: "/finance/registrations", label: "רישומים", icon: FileText, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/change-tracking", label: "מעקב שינויים", icon: Activity, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/revenues", label: "הכנסות (כפול)", icon: TrendingUp, section: "כספים", subSection: "חייבים" },
      { href: "/finance/payments", label: "תשלומים", icon: Wallet, section: "כספים", subSection: "בנקים וקופה" },
      { href: "/finance/checks", label: "שיקים", icon: FileCheck, section: "כספים", subSection: "בנקים וקופה" },
      { href: "/finance/currencies", label: "מטבעות", icon: DollarSign, section: "כספים", subSection: "בנקים וקופה" },
      { href: "/finance/analytical-reports", label: "דוחות אנליטיים", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/consolidated-reports", label: "דוחות מאוחדים", icon: BarChart3, section: "כספים", subSection: "הנהלת חשבונות" },
      { href: "/finance/entity-ledger", label: "ספר ישויות", icon: BookOpen, section: "כספים", subSection: "הנהלת חשבונות" },
  
    // ═══════════════ 7. רכש ושרשרת אספקה ═══════════════
    { href: "/procurement", label: "דשבורד רכש", icon: Gauge, section: "רכש ושרשרת אספקה" },
    { href: "/purchase-requests", label: "בקשות רכש", icon: ClipboardList, section: "רכש ושרשרת אספקה" },
    { href: "/purchase-orders", label: "הזמנות רכש", icon: ShoppingCart, section: "רכש ושרשרת אספקה" },
    { href: "/goods-receipt", label: "קבלת סחורה", icon: PackageCheck, section: "רכש ושרשרת אספקה" },
    // ── ניהול ספקים ──
    { href: "/suppliers", label: "ספקים מקומיים", icon: Truck, section: "רכש ושרשרת אספקה", subSection: "ניהול ספקים" },
    { href: "/foreign-suppliers", label: 'ספקים בחו"ל', icon: Globe, section: "רכש ושרשרת אספקה", subSection: "ניהול ספקים" },
    { href: "/supplier-evaluations", label: "דירוג ספקים", icon: Star, section: "רכש ושרשרת אספקה", subSection: "ניהול ספקים" },
    { entitySlug: "supplier-contract", label: "חוזי ספקים", icon: FileCheck, section: "רכש ושרשרת אספקה", subSection: "ניהול ספקים" },
    { href: "/price-quotes", label: "הצעות מחיר ספקים", icon: FileBarChart, section: "רכש ושרשרת אספקה" },
    { href: "/price-comparison", label: "השוואת מחירים", icon: Scale, section: "רכש ושרשרת אספקה" },
    // ── ייבוא ──
    { href: "/import-dashboard", label: "דשבורד ייבוא", icon: Gauge, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
    { entitySlug: "import-order", label: "הזמנות ייבוא", icon: Ship, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
    { href: "/shipment-tracking", label: "מעקב משלוחים", icon: Ship, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
    { href: "/customs-clearance", label: "שחרור מכס", icon: FileCheck, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
    { href: "/compliance-certificates", label: "תעודות תאימות", icon: Shield, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
    { href: "/import-cost-calculator", label: "מחשבון עלויות ייבוא", icon: Calculator, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
    { href: "/exchange-rates", label: "שערי חליפין", icon: ArrowUpDown, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
    { href: "/letters-of-credit", label: "מכתבי אשראי", icon: CreditCard, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
    { href: "/procurement-ai", label: "אופטימיזציית רכש AI", icon: Brain, section: "רכש ושרשרת אספקה" },
    { href: "/product-catalog", label: "קטלוג מוצרים", icon: Layers, section: "רכש ושרשרת אספקה" },
        { href: "/procurement-dashboard", label: "דשבורד רכש", icon: ShoppingCart, section: "רכש ושרשרת אספקה" },
      { href: "/purchase-approvals", label: "אישורי רכש", icon: ShieldCheck, section: "רכש ושרשרת אספקה" },
      { href: "/purchase-returns", label: "החזרות רכש", icon: RotateCcw, section: "רכש ושרשרת אספקה" },
      { href: "/supplier-contracts", label: "חוזי ספקים", icon: FileCheck, section: "רכש ושרשרת אספקה" },
      { href: "/import-orders", label: "הזמנות ייבוא", icon: Globe, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
      { href: "/procurement/profitability", label: "רווחיות רכש", icon: TrendingUp, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/competitors", label: "מתחרים", icon: Users, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/risk-hedging", label: "גידור סיכונים", icon: Shield, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/requisitions", label: "דרישות רכש", icon: FileText, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/rfq", label: "בקשות הצעת מחיר", icon: FileText, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/stock-count", label: "ספירת מלאי", icon: ClipboardList, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/stock-movements", label: "תנועות מלאי", icon: Activity, section: "רכש ושרשרת אספקה" },
      { href: "/import/cost-calculator", label: "מחשבון עלויות ייבוא", icon: Calculator, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
      { href: "/import/insurance", label: "ביטוח ייבוא", icon: Shield, section: "רכש ושרשרת אספקה", subSection: "ייבוא" },
      { href: "/procurement/suppliers", label: "ספקים", icon: Truck, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/purchase-orders", label: "הזמנות רכש", icon: ShoppingCart, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/purchase-requests", label: "בקשות רכש", icon: FileText, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/purchase-approvals", label: "אישורי רכש (כפול)", icon: ShieldCheck, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/goods-receipt", label: "קבלת סחורה", icon: PackageCheck, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/price-quotes", label: "הצעות מחיר ספקים", icon: FileText, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/inventory-management", label: "ניהול מלאי", icon: Package, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/supplier-evaluations", label: "הערכת ספקים", icon: Star, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/supplier-contracts", label: "חוזי ספקים (כפול)", icon: FileCheck, section: "רכש ושרשרת אספקה" },
      { href: "/procurement/purchase-returns", label: "החזרות (כפול)", icon: RotateCcw, section: "רכש ושרשרת אספקה" },
  
    // ═══════════════ 8. מלאי ולוגיסטיקה ═══════════════
    // ── ניהול מלאי ──
    { href: "/inventory/dashboard", label: "דשבורד מלאי", icon: Package, section: "מלאי ולוגיסטיקה", subSection: "ניהול מלאי" },
    { href: "/inventory", label: "ניהול מלאי", icon: Package, section: "מלאי ולוגיסטיקה", subSection: "ניהול מלאי" },
    { href: "/raw-materials", label: "חומרי גלם", icon: Boxes, section: "מלאי ולוגיסטיקה", subSection: "ניהול מלאי" },
    { href: "/inventory/finished-goods-stock", label: "מוצרים מוגמרים", icon: PackageCheck, section: "מלאי ולוגיסטיקה", subSection: "ניהול מלאי" },
    { href: "/product-catalog", label: "קטלוג מוצרים", icon: Layers, section: "מלאי ולוגיסטיקה", subSection: "ניהול מלאי" },
    { entitySlug: "finished-product", label: "מוצרים מוגמרים (דינמי)", icon: PackageCheck, section: "מלאי ולוגיסטיקה", subSection: "ניהול מלאי" },
    { entitySlug: "raw-material-inventory", label: "מלאי חומרי גלם (דינמי)", icon: Boxes, section: "מלאי ולוגיסטיקה", subSection: "ניהול מלאי" },
    // ── מחסנים ותנועות ──
    { href: "/inventory/warehouses", label: "מחסנים", icon: Warehouse, section: "מלאי ולוגיסטיקה", subSection: "מחסנים ותנועות" },
    { href: "/inventory/warehouse-locations", label: "מיקומי מחסן", icon: MapPin, section: "מלאי ולוגיסטיקה", subSection: "מחסנים ותנועות" },
    { href: "/inventory/stock-counts", label: "ספירות מלאי", icon: ClipboardCheck, section: "מלאי ולוגיסטיקה", subSection: "מחסנים ותנועות" },
    { href: "/inventory/stock-movements", label: "תנועות מלאי", icon: ArrowLeftRight, section: "מלאי ולוגיסטיקה", subSection: "מחסנים ותנועות" },
    { href: "/inventory/raw-material-stock", label: "מלאי חומרי גלם", icon: Boxes, section: "מלאי ולוגיסטיקה", subSection: "מחסנים ותנועות" },
    { href: "/inventory/expiry-alerts", label: "התראות תפוגה", icon: AlertTriangle, section: "מלאי ולוגיסטיקה", subSection: "מחסנים ותנועות" },
    { entitySlug: "inventory-transaction", label: "תנועות מלאי (דינמי)", icon: ArrowLeftRight, section: "מלאי ולוגיסטיקה", subSection: "מחסנים ותנועות" },
        { href: "/inventory-management", label: "ניהול מלאי (כללי)", icon: Package, section: "מלאי ולוגיסטיקה" },
      { href: "/inventory/inventory-dashboard", label: "דשבורד מלאי", icon: BarChart3, section: "מלאי ולוגיסטיקה" },
  
    // ═══════════════ 9. ייצור ═══════════════
    // ── ניהול ייצור ──
    { href: "/production/dashboard", label: "מחלקת ייצור", icon: Factory, section: "ייצור", subSection: "ניהול ייצור" },
    { href: "/production/mes", label: "מערכת הנהלת ייצור - MES", icon: Activity, section: "ייצור", subSection: "ניהול ייצור" },
    { href: "/production/scada", label: "בקרה ופיקוח - SCADA", icon: Cpu, section: "ייצור", subSection: "ניהול ייצור" },
    { href: "/production/kanban", label: "Kanban Board", icon: FolderKanban, section: "ייצור", subSection: "ניהול ייצור" },
    { href: "/production/gantt", label: "Gantt Chart", icon: CalendarDays, section: "ייצור", subSection: "ניהול ייצור" },
    { href: "/production/production-planning", label: "תכנון ייצור", icon: CalendarDays, section: "ייצור", subSection: "ניהול ייצור" },
    { entitySlug: "production-line", label: "קווי ייצור", icon: Factory, section: "ייצור", subSection: "ניהול ייצור" },
    // ── הזמנות עבודה והוראות ──
    { entitySlug: "work-order", label: "הזמנות עבודה", icon: ClipboardList, section: "ייצור", subSection: "הזמנות עבודה והוראות" },
    { href: "/production/work-orders", label: "הוראות עבודה Enterprise", icon: ClipboardCheck, section: "ייצור", subSection: "הזמנות עבודה והוראות" },
    { href: "/production/work-orders-mgmt", label: "הזמנות עבודה ייצור", icon: ClipboardList, section: "ייצור", subSection: "הזמנות עבודה והוראות" },
    { href: "/production/work-instructions-ent", label: "הוראות עבודה", icon: FileText, section: "ייצור", subSection: "הזמנות עבודה והוראות" },
    // ── BOM ועצי מוצר ──
    { entitySlug: "bom", label: "עצי מוצר (BOM)", icon: FolderTree, section: "ייצור", subSection: "BOM ועצי מוצר" },
    { href: "/production/bom-tree", label: "עץ מוצר (BOM)", icon: FolderTree, section: "ייצור", subSection: "BOM ועצי מוצר" },
    { href: "/production/bom-manager", label: "ניהול עצי מוצר (BOM)", icon: FolderTree, section: "ייצור", subSection: "BOM ועצי מוצר" },
    // ── בקרת איכות ──
    { href: "/production/quality-checklists", label: "רשימות בדיקה", icon: ClipboardCheck, section: "ייצור", subSection: "בקרת איכות" },
    { href: "/production/qc-inspections", label: "בדיקות", icon: Shield, section: "ייצור", subSection: "בקרת איכות" },
    { entitySlug: "ncr", label: "אי-התאמות", icon: AlertTriangle, section: "ייצור", subSection: "בקרת איכות" },
    { href: "/production/corrective-actions", label: "פעולות מתקנות", icon: CheckSquare, section: "ייצור", subSection: "בקרת איכות" },
    // ── בטיחות ──
    { href: "/safety/procedures", label: "נהלי בטיחות", icon: ShieldAlert, section: "ייצור", subSection: "בטיחות" },
    { href: "/safety/accident-reports", label: "דיווח תאונות", icon: AlertTriangle, section: "ייצור", subSection: "בטיחות" },
    { href: "/safety/training", label: "הדרכות בטיחות", icon: GraduationCap, section: "ייצור", subSection: "בטיחות" },
    // ── תחזוקה ונכסים ──
    { entitySlug: "equipment", label: "מכונות וציוד", icon: Cpu, section: "ייצור", subSection: "תחזוקה ונכסים" },
    { href: "/production/maintenance", label: "ניהול תחזוקה", icon: Wrench, section: "ייצור", subSection: "תחזוקה ונכסים" },
    { href: "/production/machine-maintenance", label: "תחזוקת מכונות", icon: Wrench, section: "ייצור", subSection: "תחזוקה ונכסים" },
    { href: "/production/cmms", label: "CMMS — תחזוקה ממוחשבת", icon: Gauge, section: "ייצור", subSection: "תחזוקה ונכסים" },
    { href: "/assets", label: "ניהול נכסים", icon: Building2, section: "ייצור", subSection: "תחזוקה ונכסים" },
    // ── פיתוח מוצרים ──
    { href: "/production/product-design", label: "תכנון", icon: PenTool, section: "ייצור", subSection: "פיתוח מוצרים" },
    { href: "/production/product-testing", label: "בדיקות", icon: TestTube, section: "ייצור", subSection: "פיתוח מוצרים" },
    { href: "/production/prototypes", label: "אב טיפוס", icon: Beaker, section: "ייצור", subSection: "פיתוח מוצרים" },
    // ═══ Fabrication — מתכת וזכוכית ═══
    { href: "/fabrication/profiles", label: "פרופילים", icon: Layers, section: "ייצור", subSection: "מתכת — קטלוג" },
    { href: "/fabrication/systems", label: "מערכות", icon: Blocks, section: "ייצור", subSection: "מתכת — קטלוג" },
    { href: "/fabrication/glass-catalog", label: "קטלוג זכוכית", icon: Database, section: "ייצור", subSection: "מתכת — קטלוג" },
    { href: "/fabrication/finishes-colors", label: "גימורים וצבעים", icon: PenTool, section: "ייצור", subSection: "מתכת — קטלוג" },
    { href: "/fabrication/accessories", label: "אביזרים ופרזול", icon: Wrench, section: "ייצור", subSection: "מתכת — קטלוג" },
    { href: "/fabrication/cutting-lists", label: "רשימות חיתוך", icon: Ruler, section: "ייצור", subSection: "מתכת — ייצור ועיבוד" },
    { href: "/fabrication/assembly-orders", label: "הוראות הרכבה", icon: Package, section: "ייצור", subSection: "מתכת — ייצור ועיבוד" },
    { href: "/fabrication/welding-orders", label: "הוראות ריתוך", icon: Zap, section: "ייצור", subSection: "מתכת — ייצור ועיבוד" },
    { href: "/fabrication/coating-orders", label: "ציפוי/צביעה", icon: PenTool, section: "ייצור", subSection: "מתכת — ייצור ועיבוד" },
    { href: "/fabrication/glazing-orders", label: "זיגוג", icon: Boxes, section: "ייצור", subSection: "מתכת — ייצור ועיבוד" },
    { href: "/fabrication/packing-lists", label: "אריזה", icon: PackageCheck, section: "ייצור", subSection: "מתכת — לוגיסטיקה" },
    { href: "/fabrication/transport-orders", label: "הובלות", icon: Truck, section: "ייצור", subSection: "מתכת — לוגיסטיקה" },
    { href: "/fabrication/installation-orders", label: "התקנות", icon: ClipboardCheck, section: "ייצור", subSection: "מתכת — לוגיסטיקה" },
    { href: "/fabrication/service-tickets", label: "קריאות שירות", icon: Headphones, section: "ייצור", subSection: "מתכת — לוגיסטיקה" },
    { href: "/fabrication/workflow-tracker", label: "מעקב תהליך", icon: Activity, section: "ייצור", subSection: "מתכת — לוגיסטיקה" },
    // ═══ מתקינים והתקנות ═══
    { entitySlug: "installer", label: "מתקינים", icon: Wrench, section: "ייצור", subSection: "ניהול מתקינים" },
    { href: "/production/installers", label: "ניהול מתקינים (מתקדם)", icon: Wrench, section: "ייצור", subSection: "ניהול מתקינים" },
    { entitySlug: "installation", label: "התקנות שטח", icon: ClipboardList, section: "ייצור", subSection: "התקנות ומדידות" },
    { href: "/production/installations", label: "התקנות שטח (מתקדם)", icon: ClipboardList, section: "ייצור", subSection: "התקנות ומדידות" },
    { entitySlug: "measurement", label: "מדידות", icon: Ruler, section: "ייצור", subSection: "התקנות ומדידות" },
    { entitySlug: "field-measurement", label: "מדידות שטח", icon: Ruler, section: "ייצור", subSection: "התקנות ומדידות" },
    // ── דוחות ייצור ──
    { href: "/production/output-report", label: "תפוקה", icon: BarChart3, section: "ייצור", subSection: "דוחות ייצור" },
    { href: "/production/efficiency-report", label: "יעילות", icon: TrendingUp, section: "ייצור", subSection: "דוחות ייצור" },
    { href: "/production/waste-report", label: "פחת", icon: TrendingDown, section: "ייצור", subSection: "דוחות ייצור" },
    { href: "/production/cost-report", label: "עלויות ייצור", icon: DollarSign, section: "ייצור", subSection: "דוחות ייצור" },
        { href: "/production", label: "דשבורד ייצור", icon: Factory, section: "ייצור" },
      { href: "/manufacturing", label: "Manufacturing", icon: Factory, section: "ייצור" },
      { href: "/work-orders", label: "הזמנות עבודה (כללי)", icon: ClipboardList, section: "ייצור" },
      { href: "/production/quality-control", label: "בקרת איכות (כללי)", icon: ShieldCheck, section: "ייצור", subSection: "בקרת איכות" },
      { href: "/production/planning", label: "תכנון ייצור", icon: Calendar, section: "ייצור" },
      { href: "/production/reports", label: "דוחות ייצור (כללי)", icon: BarChart3, section: "ייצור", subSection: "דוחות ייצור" },
      { href: "/production/production-reports", label: "דוחות ייצור", icon: BarChart3, section: "ייצור", subSection: "דוחות ייצור" },
      { href: "/production/quality-control-ent", label: "בקרת איכות (ישות)", icon: ShieldCheck, section: "ייצור", subSection: "בקרת איכות" },
      { href: "/production/production-lines", label: "קווי ייצור", icon: Activity, section: "ייצור" },
      { href: "/production/ncr-reports", label: "דוחות NCR", icon: AlertCircle, section: "ייצור", subSection: "בקרת איכות" },
      { href: "/production/equipment", label: "ציוד ייצור", icon: Wrench, section: "ייצור", subSection: "תחזוקה ונכסים" },
      { href: "/production/bom", label: "BOM עצי מוצר", icon: GitBranch, section: "ייצור", subSection: "BOM ועצי מוצר" },
      { href: "/production/quality-inspections", label: "בדיקות איכות", icon: Search, section: "ייצור", subSection: "בקרת איכות" },
      { href: "/production/safety", label: "בטיחות (כללי)", icon: Shield, section: "ייצור", subSection: "בטיחות" },
      { href: "/production/field-measurements", label: "מדידות שטח", icon: Ruler, section: "ייצור" },
      { href: "/production/installations-list", label: "רשימת התקנות", icon: Wrench, section: "ייצור" },
      { href: "/safety", label: "בטיחות (ראשי)", icon: Shield, section: "ייצור", subSection: "בטיחות" },
      { href: "/field-measurements", label: "מדידות שטח (כללי)", icon: Ruler, section: "ייצור" },
  
    // ═══════════════ 10. ניהול פרויקטים ═══════════════
    { href: "/projects/dashboard", label: "דשבורד פרויקטים", icon: Briefcase, section: "ניהול פרויקטים" },
    { entitySlug: "project", label: "רשימת פרויקטים", icon: FolderKanban, section: "ניהול פרויקטים" },
    { href: "/projects/milestones", label: "אבני דרך", icon: Flag, section: "ניהול פרויקטים" },
    { href: "/project-analyses", label: "ניתוח פרויקטים", icon: BarChart3, section: "ניהול פרויקטים" },
    { href: "/projects/subcontractors", label: "קבלני משנה", icon: Briefcase, section: "ניהול פרויקטים" },
    // ── נדל"ן ──
    { href: "/projects/real-estate/kiryati10", label: 'קריתי 10 ת"א', icon: Building2, section: "ניהול פרויקטים", subSection: 'נדל"ן' },
    { href: "/projects/real-estate/units", label: "מעקב יחידות", icon: Layers, section: "ניהול פרויקטים", subSection: 'נדל"ן' },
    { href: "/projects/real-estate/permits", label: "היתרים ורישוי", icon: FileCheck, section: "ניהול פרויקטים", subSection: 'נדל"ן' },
    { href: "/projects/real-estate/contractors", label: "ניהול קבלנים", icon: Wrench, section: "ניהול פרויקטים", subSection: 'נדל"ן' },
        { href: "/projects", label: "פרויקטים (כללי)", icon: FolderKanban, section: "ניהול פרויקטים" },
      { href: "/projects/tasks", label: "משימות פרויקט", icon: CheckSquare, section: "ניהול פרויקטים" },
      { href: "/projects/resources", label: "משאבים", icon: Users, section: "ניהול פרויקטים" },
      { href: "/projects/budget", label: "תקציב פרויקט", icon: DollarSign, section: "ניהול פרויקטים" },
      { href: "/projects/risks", label: "סיכונים", icon: AlertCircle, section: "ניהול פרויקטים" },
      { href: "/projects/timesheets", label: "דיווחי שעות", icon: Clock, section: "ניהול פרויקטים" },
  
    // ═══════════════ 11. משאבי אנוש ═══════════════
    { href: "/hr", label: "דשבורד משאבי אנוש", icon: Users, section: "משאבי אנוש" },
    { href: "/hr/employees", label: "ניהול עובדים", icon: Building2, section: "משאבי אנוש" },
    { href: "/hr/org-chart", label: "מבנה ארגוני", icon: Users, section: "משאבי אנוש" },
    { href: "/hr/departments", label: "מחלקות", icon: Layers, section: "משאבי אנוש" },
    { href: "/hr/attendance", label: "נוכחות ושעון", icon: Clock, section: "משאבי אנוש" },
    { href: "/hr/shifts", label: "משמרות", icon: Activity, section: "משאבי אנוש" },
    { href: "/hr/leave-management", label: "חופשות", icon: Calendar, section: "משאבי אנוש" },
    { href: "/hr/policies", label: "מדיניות", icon: FileText, section: "משאבי אנוש" },
    // ── שכר ותגמול ──
    { href: "/hr/payslips", label: "תלושי שכר", icon: Receipt, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/payroll", label: "ריכוז שכר חודשי", icon: DollarSign, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/bonuses", label: "בונוסים", icon: Award, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    { href: "/hr/employer-cost", label: "עלות מעביד", icon: Wallet, section: "משאבי אנוש", subSection: "שכר ותגמול" },
    // ── גיוס וקליטה ──
    { href: "/hr/open-positions", label: "משרות פתוחות", icon: Briefcase, section: "משאבי אנוש", subSection: "גיוס וקליטה" },
    { href: "/hr/candidates", label: "מועמדים", icon: User, section: "משאבי אנוש", subSection: "גיוס וקליטה" },
    { href: "/hr/interviews", label: "ראיונות", icon: MessageSquare, section: "משאבי אנוש", subSection: "גיוס וקליטה" },
    { href: "/hr/onboarding", label: "קליטת עובד חדש", icon: UserPlus, section: "משאבי אנוש", subSection: "גיוס וקליטה" },
    // ── הדרכות ופיתוח ──
    { href: "/hr/training", label: "תוכנית הדרכות", icon: GraduationCap, section: "משאבי אנוש", subSection: "הדרכות ופיתוח" },
    { entitySlug: "training-certification", label: "הסמכות", icon: Award, section: "משאבי אנוש", subSection: "הדרכות ופיתוח" },
    { href: "/hr/performance-reviews", label: "הערכות ביצוע", icon: Star, section: "משאבי אנוש", subSection: "הדרכות ופיתוח" },
    // ── קבלני משנה ──
    { href: "/hr/contractors", label: "פרופילי קבלנים", icon: Briefcase, section: "משאבי אנוש", subSection: "קבלני משנה" },
    { href: "/hr/contractor-contracts", label: "חוזים", icon: FileCheck, section: "משאבי אנוש", subSection: "קבלני משנה" },
    { href: "/hr/contractor-insurance", label: "ביטוחים", icon: Shield, section: "משאבי אנוש", subSection: "קבלני משנה" },
    { href: "/hr/contractor-payments", label: "מעקב תשלומים", icon: Banknote, section: "משאבי אנוש", subSection: "קבלני משנה" },
    { href: "/workforce-analysis", label: "ניתוח כ״א", icon: BarChart3, section: "משאבי אנוש" },
    { entitySlug: "employee-document", label: "מסמכי HR", icon: FileText, section: "משאבי אנוש" },
        { href: "/employees", label: "עובדים (כללי)", icon: Users, section: "משאבי אנוש" },
      { href: "/payroll", label: "שכר (כללי)", icon: DollarSign, section: "משאבי אנוש", subSection: "שכר ותגמול" },
      { href: "/attendance", label: "נוכחות (כללי)", icon: Clock, section: "משאבי אנוש" },
      { href: "/hr/payroll-center", label: "מרכז שכר", icon: Wallet, section: "משאבי אנוש", subSection: "שכר ותגמול" },
      { href: "/hr/employee-value", label: "שווי עובד", icon: BarChart3, section: "משאבי אנוש", subSection: "שכר ותגמול" },
      { href: "/hr/recruitment", label: "גיוס עובדים", icon: Briefcase, section: "משאבי אנוש", subSection: "גיוס וקליטה" },
      { href: "/hr/benefits", label: "הטבות ורווחה", icon: Heart, section: "משאבי אנוש" },
      { href: "/hr/meetings", label: "פגישות AI", icon: Bot, section: "משאבי אנוש" },
      { href: "/hr/leaves", label: "חופשות", icon: Calendar, section: "משאבי אנוש" },
  
    // ═══════════════ 12a. אסטרטגיה וחזון ═══════════════
      { href: "/strategy/planning", label: "תכנון אסטרטגי", icon: Target, section: "אסטרטגיה וחזון" },
      { href: "/strategy/market-analysis", label: "ניתוח שוק", icon: BarChart3, section: "אסטרטגיה וחזון" },
      { href: "/strategy/goals", label: "יעדים שנתיים", icon: Flag, section: "אסטרטגיה וחזון" },
      { href: "/strategy/okrs", label: "OKRs", icon: CheckSquare, section: "אסטרטגיה וחזון" },
      { href: "/strategy/swot", label: "ניתוח SWOT", icon: LayoutGrid, section: "אסטרטגיה וחזון" },
          { href: "/strategy/balanced-scorecard", label: "Balanced Scorecard", icon: BarChart3, section: "אסטרטגיה וחזון" },
      { href: "/strategy/competitive-analysis", label: "ניתוח תחרותי", icon: Users, section: "אסטרטגיה וחזון" },
      { href: "/strategy/business-plan", label: "תוכנית עסקית", icon: FileText, section: "אסטרטגיה וחזון" },
  
        { href: "/product-dev/roadmap", label: "מפת דרכים", icon: MapIcon, section: "אסטרטגיה וחזון" },
      { href: "/product-dev/rd-projects", label: "פרויקטי מו\"פ", icon: Beaker, section: "אסטרטגיה וחזון" },
      { href: "/product-dev/feature-requests", label: "בקשות פיצ'רים", icon: ThumbsUp, section: "אסטרטגיה וחזון" },
      { href: "/product-dev/qa-testing", label: "בדיקות QA", icon: TestTube, section: "אסטרטגיה וחזון" },
  
    // ═══════════════ 12b. שיווק ═══════════════
      { href: "/marketing", label: "דשבורד שיווק", icon: Megaphone, section: "שיווק" },
      { href: "/marketing/analytics", label: "ניתוח שיווקי", icon: BarChart3, section: "שיווק" },
      { href: "/marketing/campaigns", label: "קמפיינים", icon: Megaphone, section: "שיווק" },
      { href: "/marketing/content-calendar", label: "תוכן", icon: CalendarDays, section: "שיווק" },
      { href: "/marketing/social-media", label: "ערוצים", icon: Share2, section: "שיווק" },
      { href: "/marketing/integrations", label: "אינטגרציות", icon: Plug, section: "שיווק" },
          { href: "/marketing/hub", label: "Marketing Hub", icon: BarChart3, section: "שיווק" },
      { href: "/marketing/email-campaigns", label: "קמפייני אימייל", icon: Mail, section: "שיווק" },
      { href: "/marketing/budget", label: "תקציב שיווק", icon: DollarSign, section: "שיווק" },
  
    // ═══════════════ 13. מסמכים וחוזים ═══════════════
      { href: "/documents", label: "ספריית מסמכים", icon: FolderKanban, section: "מסמכים וחוזים" },
      { entitySlug: "contract", label: "חוזים", icon: FileText, section: "מסמכים וחוזים" },
      { href: "/documents/upload", label: "העלאת מסמכים עם AI", icon: Upload, section: "מסמכים וחוזים" },
      { href: "/documents/templates", label: "תבניות מסמכים", icon: LayoutTemplate, section: "מסמכים וחוזים" },
      { href: "/documents/digital-archive", label: "ארכוב דיגיטלי", icon: Archive, section: "מסמכים וחוזים" },
      { href: "/documents/quality-docs", label: "ניהול מסמכי איכות", icon: ShieldCheck, section: "מסמכים וחוזים" },
      { href: "/documents/checklists", label: "רשימות בדיקה", icon: CheckSquare, section: "מסמכים וחוזים" },
      { href: "/documents/system-spec", label: "ספר איפיון מערכת", icon: BookOpen, section: "מסמכים וחוזים" },
      { href: "/documents/digital-signatures", label: "חתימות דיגיטליות", icon: PenTool, section: "מסמכים וחוזים" },
          { href: "/document-control", label: "ניהול מסמכים מבוקר", icon: FileCheck, section: "מסמכים וחוזים" },
      { href: "/documents/archive-files", label: "קובצי ארכיון", icon: FolderArchive, section: "מסמכים וחוזים" },
      { href: "/documents/contracts", label: "חוזים (כללי)", icon: FileText, section: "מסמכים וחוזים" },
  
    // ═══════════════ 13.5 דוחות ═══════════════
      { href: "/reports", label: "מרכז דוחות", icon: BarChart3, section: "דוחות" },
      { href: "/reports/financial", label: "דוחות פיננסיים", icon: DollarSign, section: "דוחות" },
      { href: "/reports/operational", label: "דוחות תפעוליים", icon: Activity, section: "דוחות" },
      { href: "/documents/company-report", label: "דוח מצב חברה", icon: BarChart3, section: "דוחות" },
      { href: "/reports/risks", label: "סיכונים וגידורים", icon: Shield, section: "דוחות" },
      { href: "/reports/kpis", label: "דשבורד KPI", icon: Target, section: "דוחות" },
      { href: "/reports/funnel", label: "משפך המרות", icon: Filter, section: "דוחות" },
    { href: "/reports/bi-dashboard", label: "BI Dashboard", icon: BarChart3, section: "דוחות" },
      // ═══════════════ 16. מתקנים והתקנות ═══════════════
      { href: "/installations/facilities", label: "ניהול מתקנים", icon: Building2, section: "מתקנים והתקנות" },
      { href: "/installations/work", label: "התקנות ומדידות", icon: Wrench, section: "מתקנים והתקנות" },
      { href: "/installations/assets", label: "נכסים וציוד", icon: Package, section: "מתקנים והתקנות" },
      { href: "/installations/calendar", label: "לוח שנה התקנות", icon: CalendarDays, section: "מתקנים והתקנות" },
          { href: "/reports/financial/customer-vendor-ledger", label: "כרטסת לקוח/ספק", icon: BookOpen, section: "דוחות" },
      { href: "/reports/financial/customer-aging", label: "גיול לקוחות", icon: Clock, section: "דוחות" },
      { href: "/reports/financial/vendor-aging", label: "גיול ספקים", icon: Clock, section: "דוחות" },
      { href: "/reports/financial/fiscal-report", label: "דוח פיסקלי", icon: FileText, section: "דוחות" },
      { href: "/reports/financial/invoice-analysis", label: "ניתוח חשבוניות", icon: Search, section: "דוחות" },
      { href: "/reports/financial/analytics", label: "אנליטיקס", icon: BarChart3, section: "דוחות" },
      { href: "/reports/financial/executive-summary", label: "סיכום מנהלים", icon: FileText, section: "דוחות" },
      { href: "/reports/financial/vat-report", label: "דוח מע'מ", icon: Receipt, section: "דוחות" },
  
        { href: "/installation/installers", label: "ניהול מתקינים", icon: Users, section: "מתקנים והתקנות" },
      { href: "/installation/field", label: "עבודות שטח", icon: MapPin, section: "מתקנים והתקנות" },
      { href: "/installation/measurements", label: "מדידות", icon: Ruler, section: "מתקנים והתקנות" },
  
    // ═══════════════ 14. בונה מערכת ═══════════════
    { href: "/builder", label: "דשבורד בונה", icon: Blocks, section: "בונה מערכת", subSection: "ניהול כללי" },
    { href: "/builder/tools", label: "בונה כלים", icon: Cpu, section: "בונה מערכת", subSection: "ניהול כללי" },
    { href: "/builder/contexts", label: "בונה הקשרים", icon: GitBranch, section: "בונה מערכת", subSection: "ניהול כללי" },
    { href: "/builder/workflows", label: "בונה תהליכים", icon: Zap, section: "בונה מערכת", subSection: "ניהול כללי" },
    { href: "/builder/automations", label: "אוטומציות", icon: Sparkles, section: "בונה מערכת", subSection: "ניהול כללי" },
    { href: "/builder/automation-dashboard", label: "מרכז אוטומציות", icon: Activity, section: "בונה מערכת", subSection: "ניהול כללי" },
    { href: "/platform/data-flow-automations", label: "זרימת נתונים ERP", icon: Zap, section: "בונה מערכת", subSection: "ניהול כללי" },
    { href: "/builder/menus", label: "תפריטים", icon: MenuSquare, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/builder/templates", label: "תבניות מסמכים", icon: FileText, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/document-builder", label: "בונה מסמכים", icon: FileText, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/report-builder", label: "בונה דוחות", icon: BarChart3, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/builder/widgets", label: "בונה ווידג׳טים", icon: LayoutGrid, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/builder/dashboards", label: "בונה דשבורדים", icon: LayoutDashboard, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/builder/forms", label: "בונה טפסים", icon: FormInput, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/builder/views", label: "בונה תצוגות", icon: Eye, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/builder/details", label: "תצוגת פרטים", icon: FileText, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/ai-builder", label: "בונה AI", icon: Brain, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/menu-builder", label: "בונה תפריט", icon: LayoutList, section: "בונה מערכת", subSection: "בנייה" },
    { href: "/builder/modules", label: "ניהול מודולים", icon: FolderCog, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    { href: "/builder/entities", label: "ניהול ישויות", icon: Database, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    { href: "/builder/fields", label: "ניהול שדות", icon: TextCursorInput, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    { href: "/builder/statuses", label: "ניהול סטטוסים", icon: CircleDot, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    { href: "/builder/categories", label: "ניהול קטגוריות", icon: FolderTree, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    { href: "/builder/relations", label: "ניהול קשרים", icon: GitBranch, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    { href: "/builder/actions", label: "ניהול פעולות", icon: MousePointerClick, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    { href: "/builder/buttons", label: "ניהול כפתורים", icon: MenuSquare, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    { href: "/builder/validations", label: "ניהול ולידציות", icon: ShieldCheck, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    { href: "/builder/publish", label: "גרסאות ופרסום", icon: Blocks, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    { href: "/audit-log", label: "יומן ביקורת", icon: SearchCode, section: "בונה מערכת", subSection: "ישויות ומבנה" },
    // ═══════════════ 15. הגדרות מערכת ═══════════════
      // ── הגדרות כלליות ──
      { href: "/settings", label: "הגדרות כלליות", icon: Settings, section: "הגדרות מערכת", subSection: "הגדרות כלליות" },
      { href: "/settings?tab=profile", label: "עריכת משתמש", icon: User, section: "הגדרות מערכת", subSection: "הגדרות כלליות" },
      { href: "/settings?tab=system", label: "הגדרות חברה", icon: Server, section: "הגדרות מערכת", subSection: "הגדרות כלליות" },
      { href: "/settings?tab=modules", label: "עריכת מודולים ושדות", icon: Blocks, section: "הגדרות מערכת", subSection: "הגדרות כלליות" },
      { href: "/finance/settings", label: "הגדרות חשבונאות", icon: Receipt, section: "הגדרות מערכת", subSection: "הגדרות כלליות" },
      // ── משתמשים והרשאות ──
      { href: "/settings?tab=users", label: "ניהול משתמשים", icon: Users, section: "הגדרות מערכת", subSection: "משתמשים והרשאות" },
      { href: "/permissions", label: "הרשאות", icon: Shield, section: "הגדרות מערכת", subSection: "משתמשים והרשאות" },
      { href: "/settings/departments", label: "מחלקות", icon: Building2, section: "הגדרות מערכת", subSection: "משתמשים והרשאות" },
      { href: "/settings/roles", label: "תפקידים", icon: Briefcase, section: "הגדרות מערכת", subSection: "משתמשים והרשאות" },
      // ── אוטומציה ──
      { href: "/settings?tab=automation", label: "תהליכי עבודה", icon: Sparkles, section: "הגדרות מערכת", subSection: "אוטומציה" },
      { entitySlug: "approval-request", label: "כללי אישור", icon: ShieldCheck, section: "הגדרות מערכת", subSection: "אוטומציה" },
      { href: "/settings/triggers", label: "טריגרים", icon: Zap, section: "הגדרות מערכת", subSection: "אוטומציה" },
      // ── אינטגרציות ──
      { href: "/integrations-hub", label: "חיבור API", icon: Plug, section: "הגדרות מערכת", subSection: "אינטגרציות" },
      { href: "/settings/webhooks", label: "Webhooks", icon: Globe, section: "הגדרות מערכת", subSection: "אינטגרציות" },
      { href: "/settings?tab=integrations", label: "שירותים חיצוניים", icon: Globe, section: "הגדרות מערכת", subSection: "אינטגרציות" },
      // ── התראות ──
      { href: "/notification-preferences", label: "הגדרות אימייל", icon: Mail, section: "הגדרות מערכת", subSection: "התראות" },
      { href: "/notifications", label: "התראות מערכת", icon: Bell, section: "הגדרות מערכת", subSection: "התראות" },
      { href: "/notification-routing", label: "תבניות הודעות", icon: MessageSquare, section: "הגדרות מערכת", subSection: "התראות" },
      // ── כללי ──
      { href: "/settings/import-export", label: "ייבוא/ייצוא נתונים", icon: Upload, section: "הגדרות מערכת" },
      { href: "/audit-log", label: "יומן ביקורת", icon: SearchCode, section: "הגדרות מערכת" },
      { href: "/settings/backups", label: "גיבויים", icon: HardDrive, section: "הגדרות מערכת" },
          { href: "/builder/permissions", label: "הרשאות ותפקידים (בונה)", icon: Shield, section: "הגדרות מערכת", subSection: "משתמשים והרשאות" },
      { href: "/integration-builder", label: "בונה אינטגרציות", icon: Globe, section: "הגדרות מערכת", subSection: "אינטגרציות" },
      { href: "/governance", label: "ממשל תאגידי", icon: Scale, section: "הגדרות מערכת" },
      { href: "/operations/media-library", label: "מודול מדיה", icon: Image, section: "הגדרות מערכת" },
      { href: "/operations/data-sender", label: "שולח נתונים", icon: Send, section: "הגדרות מערכת" },
      { href: "/suppliers/communications", label: "תקשורת ספקים", icon: MessageSquare, section: "הגדרות מערכת" },
  
    // ── פורטלים ──
      { href: "/portal-management", label: "ניהול פורטל", icon: Globe, section: "הגדרות מערכת", subSection: "פורטלים" },
      { href: "/portal/login", label: "כניסת פורטל", icon: LogIn, section: "הגדרות מערכת", subSection: "פורטלים" },
      { href: "/portal/supplier", label: "פורטל ספקים", icon: Truck, section: "הגדרות מערכת", subSection: "פורטלים" },
      { href: "/portal/contractor", label: "פורטל קבלנים", icon: Wrench, section: "הגדרות מערכת", subSection: "פורטלים" },
      { href: "/portal/employee", label: "פורטל עובדים", icon: Users, section: "הגדרות מערכת", subSection: "פורטלים" },

    // === מנועים מתקדמים חדשים ===
      { href: "/whatsapp-ai", label: "וואטסאפ AI", icon: MessageSquare, section: "תקשורת ושיתוף פעולה", subSection: "בינה מלאכותית" },
      { href: "/customer-service", label: "שירות לקוחות AI", icon: Headphones, section: "לקוחות ומכירות", subSection: "שירות לקוחות" },
      { href: "/crm/lead-scoring", label: "ניקוד לידים וניתוח סוכנים", icon: Target, section: "לקוחות ומכירות", subSection: "ניתוח מכירות" },
      { href: "/hr/payroll-engine", label: "חישוב משכורות", icon: Calculator, section: "משאבי אנוש", subSection: "שכר ותגמול" },
      { href: "/production/bom-products", label: "עץ מוצר ותמכור", icon: Layers, section: "ייצור", subSection: "מוצרים" },
      { href: "/import-management", label: "ניהול יבוא ומכס", icon: Ship, section: "רכש ושרשרת אספקה", subSection: "יבוא" },
      { href: "/risk-management", label: "ניהול סיכונים ומונטה קרלו", icon: ShieldAlert, section: "כספים", subSection: "ניהול סיכונים" },
      { href: "/finance/company-financials", label: "מצב פיננסי בזמן אמת", icon: TrendingUp, section: "כספים", subSection: "דוחות כספיים" },
    ];
  
const STRATEGY_NAV_ITEMS: { entitySlug: string; label: string; icon: React.ComponentType<{ className?: string }>; section: string; subSection?: string }[] = [
  { entitySlug: "strategic_goal", label: "יעדים אסטרטגיים", icon: Target, section: "אסטרטגיה וחזון" },
  { entitySlug: "strategy_plan", label: "תוכניות אסטרטגיות", icon: MapIcon, section: "אסטרטגיה וחזון" },
  { entitySlug: "market_entry_plan", label: "כניסה לשווקים", icon: Globe, section: "אסטרטגיה וחזון" },
  { entitySlug: "competitor_profile", label: "פרופילי מתחרים", icon: Users, section: "אסטרטגיה וחזון" },
  { entitySlug: "market_trend", label: "מגמות שוק", icon: TrendingUp, section: "אסטרטגיה וחזון" },
  { entitySlug: "marketing_campaign", label: "קמפיינים (דינמי)", icon: Megaphone, section: "שיווק" },
  { entitySlug: "content_calendar", label: "לוח שנה תוכן (דינמי)", icon: CalendarDays, section: "שיווק" },
  { entitySlug: "lead_source", label: "מקורות לידים", icon: BarChart3, section: "שיווק" },
  { entitySlug: "cost_analysis", label: "ניתוחי עלויות", icon: TrendingUp, section: "אסטרטגיה וחזון" },
  { entitySlug: "crisis_scenario", label: "תרחישי משבר", icon: ShieldAlert, section: "אסטרטגיה וחזון" },
  { entitySlug: "product_concept", label: "מוצרים בפיתוח", icon: Lightbulb, section: "אסטרטגיה וחזון" },
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
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1 ${
            criticalCount > 0 ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"
          }`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {criticalCount > 0 && unreadCount > criticalCount && (
          <span className="absolute -bottom-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center bg-red-500 text-white text-[8px] font-bold rounded-full px-0.5">
            {criticalCount}
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
  const { data: modules = [] } = useQuery<PlatformModule[]>({
    queryKey: ["platform-modules-nav"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/modules`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());

  const HARDCODED_SLUGS = new Set(["inventory", "suppliers", "procurement", "customers", "sales", "finance", "hr", "production", "installers", "documents", "builder", "settings", "imports", "approvals", "projects", "field-measurements", "crm-advanced", "strategy", "market-analysis", "marketing", "cost-reduction", "crisis-management", "product-development", "meetings"]);
  const filteredModules = modules.filter(m => !HARDCODED_SLUGS.has(m.slug));

  if (filteredModules.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 tracking-wider">מודולים שנבנו</div>
      {filteredModules.map((mod) => {
        const ModIcon = getLucideIcon(mod.icon);
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

  const isModuleActive = location.startsWith(`/module/${mod.slug}`);


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
    return location === href || (href !== "/" && location.startsWith(href));
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
  const isActive = href && (location === href || (href !== "/" && location.startsWith(href)));
  const [isExpanded, setIsExpanded] = useState(false);


  useEffect(() => {
    if (hasChildren) {
      const childActive = children.some((child: any) => {
        const childHref = child.path || child.href;
        return childHref && (location === childHref || (childHref !== "/" && location.startsWith(childHref)));
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

const BUILDER_SECTIONS = ["בונה מערכת"];

const SECTION_MODULE_MAP: Record<string, string[]> = {
  "לקוחות ומכירות": ["customers-sales", "pricing-billing"],
  "רכש ושרשרת אספקה": ["procurement-inventory", "import-operations"],
  "מלאי ולוגיסטיקה": ["procurement-inventory"],
  "ייצור": ["production"],
  "כספים": ["finance", "accounting", "pricing-billing"],
  "משאבי אנוש": ["hr"],
  "ניהול פרויקטים": ["projects"],
  "אסטרטגיה וחזון": ["strategy", "market-analysis", "cost-reduction", "crisis-management", "product-development"],
  "שיווק": ["marketing"],
  "מסמכים ודוחות": ["documents", "reports"],
  "הגדרות מערכת": ["__admin_only__"],
  "תקשורת ושיתוף פעולה": ["meetings-calendar"],
  "מנוע בינה מלאכותית — AI": [],
};


const STRATEGY_MODULE_SLUGS = ["strategy", "market-analysis", "marketing", "cost-reduction", "crisis-management", "product-development"];

function useStrategyNavItems() {
  const { data: modules } = useQuery<{ id: number; slug: string }[]>({
    queryKey: ["platform-modules-list"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/modules`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

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

function NavLink({ item, location, onNavigate }: { item: NavItem & { href: string }; location: string; onNavigate?: () => void }) {
  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 group text-sm ${
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-card/5 hover:text-foreground"
      }`}
    >
      <item.icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
      <span className="flex-1 min-w-0 truncate">{item.label}</span>
      {(item as any).badge && (
        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-md text-[10px] font-bold border border-red-500/30">
          {(item as any).badge}
        </span>
      )}
      {isActive && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-l-full" />
      )}
    </Link>
  );
}

function SubSectionGroup({ title, items, location, onNavigate }: {
  title: string;
  items: (NavItem & { href: string })[];
  location: string;
  onNavigate?: () => void;
}) {
  const hasActiveItem = items.some(item => location === item.href || (item.href !== "/" && location.startsWith(item.href)));
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    if (hasActiveItem && !isOpen) setIsOpen(true);
  }, [hasActiveItem]);

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
            <NavLink key={`${item.href}-${idx}`} item={item} location={location} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, items, location, isFirstSection, defaultOpen, onNavigate }: {
  title: string;
  items: (NavItem & { href: string })[];
  location: string;
  isFirstSection?: boolean;
  defaultOpen?: boolean;
  onNavigate?: () => void;
}) {
  const hasActiveItem = items.some(item => location === item.href || (item.href !== "/" && location.startsWith(item.href)));
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

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors tracking-wider group"
      >
        <span className="flex items-center gap-1.5">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ease-in-out ${isOpen ? "" : "-rotate-90"}`} />
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground/80 transition-colors">{items.length}</span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="space-y-0.5 mt-0.5">
          {hasSubSections ? (
            <>
              {noSubItems.map((item, idx) => (
                <NavLink key={`${item.href}-${idx}`} item={item} location={location} onNavigate={onNavigate} />
              ))}
              {subSectionOrder.map(subTitle => (
                <SubSectionGroup
                  key={subTitle}
                  title={subTitle}
                  items={subSectionMap.get(subTitle)!}
                  location={location}
                  onNavigate={onNavigate}
                />
              ))}
            </>
          ) : (
            items.map((item, idx) => (
              <NavLink key={`${item.href}-${idx}`} item={item} location={location} onNavigate={onNavigate} />
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

  const sectionModules = SECTION_MODULE_MAP[section];
  if (sectionModules) {
    for (const modSlug of sectionModules) {
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

  return true;
}

const ROUTE_MODULE_MAP: Record<string, string[]> = {
  "/crm": ["customers-sales"],
  "/crm/field-agents": ["customers-sales"],
  "/crm/leads": ["customers-sales"],
  "/crm/email-sync": ["customers-sales"],
  "/crm/whatsapp-sms": ["customers-sales"],
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
  "/projects/timesheets": ["projects"],
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
  "/ai-engine",
  "/ai-engine/",
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
        <div className="min-h-[60vh] flex items-center justify-center" dir="rtl">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <Shield className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white">אין הרשאה</h2>
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
      <div className="min-h-[60vh] flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white">אין הרשאה</h2>
          <p className="text-muted-foreground max-w-md">גישה לבניית מערכת דורשת הרשאת מנהל. פנה למנהל המערכת.</p>
        </div>
      </div>
    );
  }

  const requiredModules = matchRouteModules(path);
  if (!requiredModules) {
    if (isOpenRoute(path)) return <>{children}</>;
    return (
      <div className="min-h-[60vh] flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white">אין הרשאה</h2>
          <p className="text-muted-foreground max-w-md">אין לך הרשאה לגשת לעמוד זה. פנה למנהל המערכת לקבלת גישה.</p>
        </div>
      </div>
    );
  }

  if (requiredModules.includes("__admin_only__")) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white">אין הרשאה</h2>
          <p className="text-muted-foreground max-w-md">אין לך הרשאה לגשת לעמוד זה. פנה למנהל המערכת לקבלת גישה.</p>
        </div>
      </div>
    );
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
    <div className="min-h-[60vh] flex items-center justify-center" dir="rtl">
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <Shield className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white">אין הרשאה</h2>
        <p className="text-muted-foreground max-w-md">אין לך הרשאה לגשת לעמוד זה. פנה למנהל המערכת לקבלת גישה.</p>
      </div>
    </div>
  );
}

function Breadcrumbs({ location, navItems }: { location: string; navItems: NavItem[] }) {
  const builderDataMatch = location.match(/^\/builder\/data\/(\d+)$/);
  let currentItem;
  
  if (builderDataMatch) {
    const entityId = builderDataMatch[1];
    currentItem = navItems.find(i => i.href && i.href === `/builder/data/${entityId}`);
  } else {
    currentItem = navItems.find(i => i.href && (i.href === location || (i.href !== "/" && location.startsWith(i.href))));
  }
  
  const segments = location.split("/").filter(Boolean);

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

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0" aria-label="breadcrumb">
      <Link href="/" className="text-muted-foreground/50 hover:text-muted-foreground transition-colors hidden md:block">
        <LayoutDashboard className="w-3.5 h-3.5" />
      </Link>
      {sectionName && (
        <>
          <ChevronLeft className="w-3 h-3 text-muted-foreground/30 hidden md:block" />
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
          <ChevronLeft className="w-3 h-3 text-muted-foreground/30 hidden lg:block" />
          <span className="text-muted-foreground/50 hidden lg:block truncate max-w-[100px] text-xs">{subSectionName}</span>
        </>
      )}
      <ChevronLeft className="w-3 h-3 text-muted-foreground/30 hidden md:block" />
      <span className="font-semibold text-foreground truncate max-w-[150px] md:max-w-xs">
        {currentItem?.label || segments[segments.length - 1]}
      </span>
    </nav>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isKobiOpen, setIsKobiOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
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

  const { data: moduleSlugMap = {} } = useQuery<Record<string, number>>({
    queryKey: ["module-slug-map"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/modules`);
      if (!r.ok) return {};
      const modules = await r.json();
      const map: Record<string, number> = {};
      for (const mod of modules) {
        if (mod.slug) map[mod.slug] = mod.id;
      }
      return map;
    },
    staleTime: 60000,
  });

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
      if (item.href === "/finance/payment-anomalies" && anomalyOpenCount > 0) {
        return { ...item, badge: String(anomalyOpenCount) };
      }
      if (item.href === "/executive/live-ops" && liveOpsEventCount > 0) {
        return { ...item, badge: liveOpsEventCount > 99 ? "99+" : String(liveOpsEventCount) };
      }
      return item;
    }).filter(item => item.href) as (NavItem & { href: string; badge?: string })[];
  }, [slugMap, strategyNavItems, anomalyOpenCount, liveOpsEventCount]);

  const isDevMode = permissions.roles.includes("__dev__");
  const hasAnyPermissions = permissions.roles.length > 0 || Object.keys(permissions.modules).length > 0;
  const shouldFilterByPermissions = !permissions.isSuperAdmin && !isDevMode && hasAnyPermissions;

  const filteredNavItems = resolvedNavItems.filter(item => {
    if (BUILDER_SECTIONS.includes(item.section) && !hasBuilderAccess()) {
      return false;
    }
    if (item.href === "/builder" && !hasBuilderAccess()) {
      return false;
    }
    if (shouldFilterByPermissions) {
      if (!canAccessSection(item.section, permissions, moduleSlugMap)) {
        return false;
      }
    }
    return true;
  });

  const SECTION_ORDER = [
      "ראשי",
      "תקשורת ושיתוף פעולה",
      "מנוע בינה מלאכותית — AI",
      "שולחן שליטה מנהלי",
      "לקוחות ומכירות",
      "כספים",
      "רכש ושרשרת אספקה",
      "מלאי ולוגיסטיקה",
      "ייצור",
      "ניהול פרויקטים",
      "משאבי אנוש",
      "אסטרטגיה וחזון",
      "שיווק",
      "מסמכים וחוזים",
      "דוחות",
      "מתקנים והתקנות",
      "בונה מערכת",
      "הגדרות מערכת",
    ];
  const sections = useMemo(() => {
    const uniqueSections = [...new Set(filteredNavItems.map(i => i.section))];
    return uniqueSections.sort((a, b) => {
      const idxA = SECTION_ORDER.indexOf(a);
      const idxB = SECTION_ORDER.indexOf(b);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  }, [filteredNavItems]);
  const ALWAYS_OPEN_SECTIONS = new Set(["ראשי"]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      <aside className={`flex flex-col h-full border-l border-border bg-card/50 backdrop-blur-xl flex-shrink-0 fixed lg:relative z-40 lg:z-20 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? "lg:w-[68px]" : "w-72"} ${isMobileMenuOpen ? "translate-x-0 w-72" : "translate-x-full lg:translate-x-0"} right-0 lg:right-auto`}>
        <div className={`p-3 md:p-4 flex items-center border-b border-border/50 ${isSidebarCollapsed ? "justify-center" : "gap-2 md:gap-3"}`}>
          <div className="w-8 md:w-9 h-8 md:h-9 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20 flex-shrink-0">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-4 md:w-5 h-4 md:h-5 object-contain" />
          </div>
          {!isSidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="font-bold text-sm md:text-base leading-tight text-white truncate">טכנו-כל עוזי</h1>
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

        {isSidebarCollapsed ? (
          <div className="flex-1 overflow-y-auto py-3 px-1.5 scrollbar-thin">
            {sections.map((section) => {
              const sectionItems = filteredNavItems.filter(i => i.section === section);
              const firstItem = sectionItems[0];
              if (!firstItem) return null;
              const Icon = firstItem.icon || LayoutDashboard;
              const isActive = sectionItems.some(i => location === i.href || (i.href !== "/" && location.startsWith(i.href)));
              return (
                <Link
                  key={section}
                  href={firstItem.href}
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
          <div className="flex-1 overflow-y-auto py-3 px-3 scrollbar-thin">
            {sections.map((section, idx) => (
              <CollapsibleSection
                key={section}
                title={section}
                items={filteredNavItems.filter(i => i.section === section)}
                location={location}
                isFirstSection={idx === 0}
                defaultOpen={ALWAYS_OPEN_SECTIONS.has(section)}
              />
            ))}
            <DynamicMenuItemsSection location={location} />
          </div>
        )}

        <div className={`p-3 border-t border-border/50 ${isSidebarCollapsed ? "flex flex-col items-center gap-2" : ""}`}>
          {authUser && !isSidebarCollapsed && (
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
          {authUser && isSidebarCollapsed && (
            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs" title={String(authUser.fullNameHe || authUser.fullName || authUser.username)}>
              {String(authUser.fullName || authUser.username || "U").charAt(0)}
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className={`hidden lg:flex items-center justify-center rounded-lg text-muted-foreground hover:bg-card/10 hover:text-foreground transition-colors ${isSidebarCollapsed ? "w-10 h-10" : "gap-2.5 px-3 py-2 w-full mb-1 text-sm"}`}
            title={isSidebarCollapsed ? "הרחב תפריט" : "כווץ תפריט"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /><span>כווץ תפריט</span></>}
          </button>
          <button onClick={handleLogout} className={`flex items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors ${isSidebarCollapsed ? "justify-center w-10 h-10" : "gap-2.5 px-3 py-2 w-full text-sm"}`} title="התנתק">
            <LogOut className="w-4 h-4" />
            {!isSidebarCollapsed && <span>התנתק</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header */}
        <header className="h-14 flex items-center justify-between px-3 md:px-6 border-b border-border/50 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-card/5 rounded-lg text-muted-foreground hover:text-foreground transition-colors lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Breadcrumbs location={location} navItems={filteredNavItems} />
          </div>
          
          <div className="flex items-center gap-1 md:gap-3">
            <CommandPalette navItems={filteredNavItems} />
            <AISmartSearch />
            <Link
              to="/chat"
              className="relative p-2 hover:bg-card/5 rounded-lg text-muted-foreground hover:text-foreground transition-colors block min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="צ'אט ארגוני — מסך מלא"
            >
              <MessageSquare className="w-5 h-5" />
              <ChatBadge />
            </Link>
            <NotificationsDropdown />
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
          <ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center group hover:scale-105"
            title="צ'אט ארגוני"
          >
            {isChatOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
            {!isChatOpen && <ChatBadge />}
          </button>
        </>
      )}
      <KobiAgentPanel isOpen={isKobiOpen} onClose={() => setIsKobiOpen(false)} />
      <button
        onClick={() => setIsKobiOpen(!isKobiOpen)}
        className="fixed bottom-6 left-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-violet-700 text-white shadow-lg shadow-purple-600/30 hover:shadow-purple-600/50 transition-all flex items-center justify-center hover:scale-105"
        title="קובי AI — סוכן אוטונומי"
      >
        {isKobiOpen ? <X className="w-6 h-6" /> : <Cpu className="w-6 h-6" />}
      </button>
      <QuickAddFAB />
      <KeyboardShortcutCheatSheet open={showCheatSheet} onClose={() => setShowCheatSheet(false)} shortcuts={shortcuts} />
      <AlertToastContainer />
      <EnhancedToastContainer />
    </div>
  );
}
