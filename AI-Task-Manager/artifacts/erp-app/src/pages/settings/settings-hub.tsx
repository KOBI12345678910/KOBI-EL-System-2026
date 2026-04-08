import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Settings, Server, Blocks, Users, Bot, Link2, Puzzle, CreditCard,
  Package, Database, TextCursorInput, FormInput, Table2, CircleDot,
  MousePointerClick, Zap, BarChart3, LayoutGrid, GitBranch, Copy, Upload,
  Shield, MenuSquare, FileBarChart, FileText, Plug, Brain, Key, Cpu,
  Activity, FileCode, ChevronLeft, FileCheck, Palette, User,
  Mail, Phone, Building2, Globe, MapPin, Hash, Calendar,
  Webhook, Search, RefreshCw, Smartphone, MessageSquare, Facebook,
  Chrome, FileSpreadsheet, Printer, Clock, Signature, QrCode,
  BarChart, TrendingUp, Layers, SlidersHorizontal,
  Workflow, Flag, BookOpen, Share2, KeyRound, UsersRound, Download,
  Code2, ClipboardList, LayoutTemplate, AlertTriangle, Cog
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import UserProfileSection from "./sections/user-profile";
import CompanyProfileSection from "./sections/company-profile";
import GeneralSettingsSection from "./sections/general-settings";
import SecuritySettingsSection from "./sections/security-settings";
import SystemSettingsSection from "./sections/system-settings";
import ModulesFieldsSection from "./sections/modules-fields";
import UserManagementSection from "./sections/user-management";
import AutomationSection from "./sections/automation";
import IntegrationsSection from "./sections/integrations";
import IntegrationHubSection from "./sections/integration-hub";
import PluginsSection from "./sections/plugins";
import LanguagesSettingsSection from "./sections/languages-settings";
import N8NIntegrationsSection from "./sections/n8n-integrations";
import FeatureFlagsSection from "./sections/feature-flags";
import PaymentServicesSection from "./sections/payment-services";
import AdvancedAnalyticsSection from "./sections/advanced-analytics";
import OnboardingCenterSection from "./sections/onboarding-center";
import FieldLevelSecuritySection from "./sections/field-level-security";
import RecordSharingSection from "./sections/record-sharing";
import AccessRequestsSection from "./sections/access-requests";
import TeamCollaborationSection from "./sections/team-collaboration";
import ImportExportSection from "./sections/import-export";
import ApiConnectionsSection from "./sections/api-connections";
import AuditLogSection from "./sections/audit-log";
import TemplateManagementSection from "./sections/template-management";
import EscalationChannelsSection from "./sections/escalation-channels";
import CommunicationIntegrationsSection from "./sections/communication-integrations";
import MfaSettingsSection from "./sections/mfa-settings";
import SsoSettingsSection from "./sections/sso-settings";
import SessionManagementSection from "./sections/session-management";

interface SettingsCategory {
  id: string;
  label: string;
  icon: any;
  group?: string;
}

const GROUP_LABELS: Record<string, { label: string; color: string }> = {
  general: { label: "כללי", color: "text-blue-400" },
  advanced: { label: "מתקדם", color: "text-violet-400" },
  security: { label: "אבטחה", color: "text-amber-400" },
  collaboration: { label: "שיתוף", color: "text-green-400" },
  data: { label: "נתונים", color: "text-cyan-400" },
  finance: { label: "פיננסי", color: "text-emerald-400" },
};

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: "company-profile", label: "פרופיל חברה", icon: Building2, group: "general" },
  { id: "general-settings", label: "הגדרות כלליות", icon: Settings, group: "general" },
  { id: "security-settings", label: "אבטחה", icon: Shield, group: "security" },
  { id: "profile", label: "עריכת משתמש", icon: User, group: "general" },
  { id: "system", label: "הגדרות מערכת", icon: Server, group: "general" },
  { id: "modules", label: "מודולים ושדות", icon: Blocks, group: "general" },
  { id: "users", label: "ניהול משתמשים", icon: Users, group: "general" },
  { id: "automation", label: "אוטומציה", icon: Bot, group: "general" },
  { id: "languages", label: "שפות", icon: Globe, group: "general" },
  { id: "integrations", label: "אינטגרציות", icon: Plug, group: "general" },
  { id: "messaging-hub", label: "הודעות", icon: MessageSquare, group: "general" },
  { id: "communication-integrations", label: "ערוצי תקשורת", icon: Phone, group: "general" },
  { id: "plugins", label: "תוספים", icon: Puzzle, group: "general" },
  { id: "n8n", label: "N8N Integrations", icon: Workflow, group: "advanced" },
  { id: "feature-flags", label: "דגלי תכונה", icon: Flag, group: "advanced" },
  { id: "payment-services", label: "שרותי תשלום", icon: CreditCard, group: "advanced" },
  { id: "advanced-analytics", label: "Advanced Analytics", icon: BarChart3, group: "advanced" },
  { id: "onboarding", label: "Onboarding Center", icon: BookOpen, group: "advanced" },
  { id: "field-security", label: "Field Level Security", icon: Shield, group: "security" },
  { id: "record-sharing", label: "Record Sharing", icon: Share2, group: "security" },
  { id: "access-requests", label: "Access Requests", icon: KeyRound, group: "security" },
  { id: "mfa-settings", label: "אימות דו-שלבי (MFA)", icon: QrCode, group: "security" },
  { id: "sso-settings", label: "SSO — כניסה ארגונית", icon: Link2, group: "security" },
  { id: "session-management", label: "ניהול חיבורים", icon: Clock, group: "security" },
  { id: "team-collaboration", label: "Team Collaboration", icon: UsersRound, group: "collaboration" },
  { id: "import-export", label: "Import / Export", icon: Download, group: "data" },
  { id: "api-connections", label: "API וחיבורים", icon: Code2, group: "data" },
  { id: "api-keys", label: "מפתחות API ושער", icon: Key, group: "data" },
  { id: "audit-log", label: "יומן ביקורת", icon: ClipboardList, group: "data" },
  { id: "templates", label: "תבניות וחבילות", icon: LayoutTemplate, group: "data" },
  { id: "escalation-channels", label: "ערוצי אסקלציה", icon: AlertTriangle, group: "finance" },
];

export default function SettingsHub() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const validTabs = SETTINGS_CATEGORIES.map(c => c.id);

  const getTabFromUrl = () => {
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    return urlTab && validTabs.includes(urlTab) ? urlTab : "company-profile";
  };

  const [activeCategory, setActiveCategoryState] = useState<string>(getTabFromUrl());

  const setActiveCategory = (catId: string) => {
    setActiveCategoryState(catId);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", catId);
    window.history.replaceState({}, "", url.toString());
  };

  useEffect(() => {
    const handleUrlChange = () => {
      const newTab = getTabFromUrl();
      setActiveCategoryState(newTab);
    };
    window.addEventListener("popstate", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
    };
  }, []);

  const filteredCategories = SETTINGS_CATEGORIES.filter(cat => {
    if (filterGroup !== "all" && cat.group !== filterGroup) return false;
    if (searchTerm && !cat.label.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const renderSection = () => {
    switch (activeCategory) {
      case "company-profile": return <CompanyProfileSection />;
      case "general-settings": return <GeneralSettingsSection />;
      case "security-settings": return <SecuritySettingsSection />;
      case "profile": return <UserProfileSection />;
      case "system": return <SystemSettingsSection />;
      case "modules": return <ModulesFieldsSection />;
      case "users": return <UserManagementSection />;
      case "automation": return <AutomationSection />;
      case "integrations": return <IntegrationsSection />;
      case "messaging-hub": return <IntegrationHubSection />;
      case "communication-integrations": return <CommunicationIntegrationsSection />;
      case "languages": return <LanguagesSettingsSection />;
      case "plugins": return <PluginsSection />;
      case "n8n": return <N8NIntegrationsSection />;
      case "feature-flags": return <FeatureFlagsSection />;
      case "payment-services": return <PaymentServicesSection />;
      case "advanced-analytics": return <AdvancedAnalyticsSection />;
      case "onboarding": return <OnboardingCenterSection />;
      case "field-security": return <FieldLevelSecuritySection />;
      case "record-sharing": return <RecordSharingSection />;
      case "access-requests": return <AccessRequestsSection />;
      case "team-collaboration": return <TeamCollaborationSection />;
      case "import-export": return <ImportExportSection />;
      case "api-connections": return <ApiConnectionsSection />;
      case "api-keys": {
        window.location.href = "/settings/api-keys";
        return <div className="text-center text-slate-400 py-8">מפנה לדף מפתחות API...</div>;
      }
      case "audit-log": return <AuditLogSection />;
      case "templates": return <TemplateManagementSection />;
      case "escalation-channels": return <EscalationChannelsSection />;
      case "mfa-settings": return <MfaSettingsSection />;
      case "sso-settings": return <SsoSettingsSection />;
      case "session-management": return <SessionManagementSection />;
      default: return <UserProfileSection />;
    }
  };

  return (
    <div dir="rtl">
      <div className="flex items-center gap-3 mb-4 p-4 md:p-6 pb-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
          <Cog className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">הגדרות</h1>
          <p className="text-xs text-muted-foreground">ניהול הגדרות המערכת, משתמשים, אוטומציה ואינטגרציות</p>
        </div>
        <div className="relative hidden sm:block">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="חיפוש הגדרה..."
            className="w-48 pr-9 pl-3 py-1.5 bg-card border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 border-b border-border scrollbar-thin px-4 md:px-6">
        {filteredCategories.map((cat) => {
          const isActive = cat.id === activeCategory;
          const groupInfo = GROUP_LABELS[cat.group || "general"];
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
                isActive
                  ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                  : "text-muted-foreground hover:bg-card/5 hover:text-foreground border border-transparent"
              }`}
            >
              <cat.icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.15 }}
        >
          {renderSection()}
        </motion.div>
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="settings" />
        <RelatedRecords entityType="settings" />
      </div>
    </div>
  );
}
