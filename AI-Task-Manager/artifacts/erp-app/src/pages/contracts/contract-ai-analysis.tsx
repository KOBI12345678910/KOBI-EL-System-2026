import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Upload, FileText, AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck,
  Loader2, ChevronDown, ChevronUp, Eye, Trash2, RefreshCw, X, Clock,
  Users, DollarSign, CalendarClock, Scale, Sparkles, AlertCircle,
  BarChart3, TrendingUp, ScrollText, ListChecks, Info, ExternalLink,
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

type RiskLevel = "low" | "medium" | "high" | "critical";

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string; badge: string }> = {
  low: { label: "נמוך", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", badge: "bg-emerald-500/20 text-emerald-300" },
  medium: { label: "בינוני", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", badge: "bg-yellow-500/20 text-yellow-300" },
  high: { label: "גבוה", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", badge: "bg-orange-500/20 text-orange-300" },
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", badge: "bg-red-500/20 text-red-300" },
};

const SEVERITY_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  critical: { color: "text-red-400", icon: <AlertTriangle className="w-4 h-4 text-red-400" /> },
  high: { color: "text-orange-400", icon: <AlertCircle className="w-4 h-4 text-orange-400" /> },
  medium: { color: "text-yellow-400", icon: <AlertCircle className="w-4 h-4 text-yellow-400" /> },
  low: { color: "text-blue-400", icon: <Info className="w-4 h-4 text-blue-400" /> },
};

function RiskMeter({ score, level }: { score: number; level: RiskLevel }) {
  const cfg = RISK_CONFIG[level] || RISK_CONFIG.low;
  const width = `${Math.min(100, score)}%`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-bold ${cfg.color}`}>{score}/100</span>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${cfg.badge}`}>{cfg.label}</span>
      </div>
      <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${level === "critical" ? "bg-red-500" : level === "high" ? "bg-orange-500" : level === "medium" ? "bg-yellow-500" : "bg-emerald-500"}`}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0 — בטוח</span>
        <span>100 — קריטי</span>
      </div>
    </div>
  );
}

function FlagCard({ flag, index }: { flag: any; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_CONFIG[flag.severity] || SEVERITY_CONFIG.medium;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`border rounded-xl overflow-hidden ${flag.severity === "critical" ? "border-red-500/30 bg-red-500/5" : flag.severity === "high" ? "border-orange-500/30 bg-orange-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-3 text-right"
      >
        <div className="mt-0.5 shrink-0">{sev.icon}</div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold text-sm ${sev.color}`}>{flag.label}</div>
          {!expanded && <div className="text-xs text-muted-foreground mt-0.5 truncate">{flag.description}</div>}
        </div>
        {flag.clause && <span className="text-[10px] bg-muted/30 px-2 py-0.5 rounded text-muted-foreground shrink-0">{flag.clause}</span>}
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2">
              <p className="text-sm text-muted-foreground">{flag.description}</p>
              {flag.recommendation && (
                <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg p-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{flag.recommendation}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AnalysisDetail({ analysis, onClose }: { analysis: any; onClose: () => void }) {
  const [tab, setTab] = useState("overview");
  const extracted = typeof analysis.extracted_data === "string" ? JSON.parse(analysis.extracted_data) : (analysis.extracted_data || {});
  const flags = typeof analysis.risk_flags === "string" ? JSON.parse(analysis.risk_flags) : (analysis.risk_flags || []);
  const missing = typeof analysis.missing_protections === "string" ? JSON.parse(analysis.missing_protections) : (analysis.missing_protections || []);
  const obligations = typeof analysis.obligations === "string" ? JSON.parse(analysis.obligations) : (analysis.obligations || []);
  const parties = typeof analysis.parties === "string" ? JSON.parse(analysis.parties) : (analysis.parties || []);
  const financials = typeof analysis.financial_commitments === "string" ? JSON.parse(analysis.financial_commitments) : (analysis.financial_commitments || []);
  const keyTerms = typeof analysis.key_terms === "string" ? JSON.parse(analysis.key_terms) : (analysis.key_terms || {});

  const riskLevel = (analysis.risk_level || "low") as RiskLevel;
  const cfg = RISK_CONFIG[riskLevel] || RISK_CONFIG.low;

  const tabs = [
    { key: "overview", label: "סקירה כללית" },
    { key: "risks", label: `סיכונים (${flags.length + missing.length})` },
    { key: "obligations", label: `התחייבויות (${obligations.length})` },
    { key: "parties", label: `צדדים (${parties.length})` },
    { key: "financial", label: "פיננסי" },
    { key: "terms", label: "תנאים מרכזיים" },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-violet-400" />
            <div>
              <h2 className="text-lg font-bold text-foreground">{extracted.contractTitle || analysis.file_name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                <span className="text-xs text-muted-foreground">{analysis.risk_score}/100</span>
                {extracted.language && <span className="text-xs text-muted-foreground">• {extracted.language === "he" ? "עברית" : extracted.language === "en" ? "English" : "מעורב"}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted/30 rounded-lg"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="flex border-b border-border overflow-x-auto shrink-0">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? "border-violet-500 text-violet-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {tab === "overview" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className={`border ${cfg.border} ${cfg.bg} rounded-xl p-4`}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">ציון סיכון</p>
                  <RiskMeter score={analysis.risk_score || 0} level={riskLevel} />
                </div>
                <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">פרטי חוזה</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {extracted.contractType && <div><span className="text-muted-foreground text-xs">סוג</span><div className="font-medium text-foreground">{extracted.contractType}</div></div>}
                    {extracted.totalContractValue > 0 && <div><span className="text-muted-foreground text-xs">שווי כולל</span><div className="font-medium text-emerald-400">{new Intl.NumberFormat("he-IL", { style: "currency", currency: extracted.currency || "ILS" }).format(extracted.totalContractValue)}</div></div>}
                    {extracted.dates?.startDate && <div><span className="text-muted-foreground text-xs">התחלה</span><div className="font-medium text-foreground">{extracted.dates.startDate}</div></div>}
                    {extracted.dates?.endDate && <div><span className="text-muted-foreground text-xs">סיום</span><div className="font-medium text-foreground">{extracted.dates.endDate}</div></div>}
                    {extracted.paymentTerms && <div className="col-span-2"><span className="text-muted-foreground text-xs">תנאי תשלום</span><div className="font-medium text-foreground">{extracted.paymentTerms}</div></div>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card border border-border/50 rounded-xl p-3 text-center">
                  <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${flags.length > 0 ? "text-orange-400" : "text-muted-foreground"}`} />
                  <div className={`text-xl font-bold ${flags.length > 0 ? "text-orange-400" : "text-foreground"}`}>{flags.length}</div>
                  <div className="text-xs text-muted-foreground">סיכונים</div>
                </div>
                <div className="bg-card border border-border/50 rounded-xl p-3 text-center">
                  <ShieldAlert className={`w-5 h-5 mx-auto mb-1 ${missing.length > 0 ? "text-red-400" : "text-muted-foreground"}`} />
                  <div className={`text-xl font-bold ${missing.length > 0 ? "text-red-400" : "text-foreground"}`}>{missing.length}</div>
                  <div className="text-xs text-muted-foreground">הגנות חסרות</div>
                </div>
                <div className="bg-card border border-border/50 rounded-xl p-3 text-center">
                  <ScrollText className="w-5 h-5 mx-auto mb-1 text-blue-400" />
                  <div className="text-xl font-bold text-foreground">{obligations.length}</div>
                  <div className="text-xs text-muted-foreground">התחייבויות</div>
                </div>
              </div>

              {extracted.notes && (
                <div className="bg-muted/10 border border-border/30 rounded-xl p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">הערות AI</p>
                  <p className="text-sm text-muted-foreground">{extracted.notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === "risks" && (
            <div className="space-y-4">
              {flags.length === 0 && missing.length === 0 ? (
                <div className="text-center py-10">
                  <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-emerald-400/50" />
                  <p className="text-muted-foreground">לא זוהו סיכונים משמעותיים</p>
                </div>
              ) : (
                <>
                  {flags.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-orange-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> סיכונים שזוהו ({flags.length})
                      </h3>
                      {flags.map((flag: any, i: number) => <FlagCard key={i} flag={flag} index={i} />)}
                    </div>
                  )}
                  {missing.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" /> הגנות חסרות ({missing.length})
                      </h3>
                      {missing.map((mp: any, i: number) => <FlagCard key={i} flag={{ ...mp, clause: null }} index={i} />)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "obligations" && (
            <div className="space-y-3">
              {obligations.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <ListChecks className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>לא זוהו התחייבויות ספציפיות</p>
                </div>
              ) : obligations.map((ob: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border/50 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-foreground">{ob.title}</div>
                      {ob.description && <div className="text-xs text-muted-foreground mt-1">{ob.description}</div>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {ob.type && <span className="text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded">{ob.type}</span>}
                        {ob.responsibleParty && <span className="text-[10px] bg-muted/20 text-muted-foreground px-2 py-0.5 rounded flex items-center gap-1"><Users className="w-2.5 h-2.5" />{ob.responsibleParty}</span>}
                        {ob.dueDate && <span className="text-[10px] bg-orange-500/10 text-orange-300 px-2 py-0.5 rounded flex items-center gap-1"><CalendarClock className="w-2.5 h-2.5" />{ob.dueDate}</span>}
                      </div>
                    </div>
                    {ob.amount > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-emerald-400">{new Intl.NumberFormat("he-IL", { style: "currency", currency: ob.currency || "ILS" }).format(ob.amount)}</div>
                        {ob.frequency && <div className="text-[10px] text-muted-foreground">{ob.frequency}</div>}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {tab === "parties" && (
            <div className="space-y-3">
              {parties.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>לא זוהו צדדים</p>
                </div>
              ) : parties.map((p: any, i: number) => (
                <div key={i} className="bg-card border border-border/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-violet-400" />
                    <span className="font-semibold text-foreground">{p.name}</span>
                    {p.role && <span className="text-xs bg-violet-500/10 text-violet-300 px-2 py-0.5 rounded">{p.role}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {p.taxId && <div><span className="text-xs text-muted-foreground">ח.פ. / ע.מ.</span><div className="font-mono text-foreground">{p.taxId}</div></div>}
                    {p.contactPerson && <div><span className="text-xs text-muted-foreground">איש קשר</span><div className="text-foreground">{p.contactPerson}</div></div>}
                    {p.email && <div><span className="text-xs text-muted-foreground">אימייל</span><div className="text-blue-400">{p.email}</div></div>}
                    {p.phone && <div><span className="text-xs text-muted-foreground">טלפון</span><div className="text-foreground">{p.phone}</div></div>}
                    {p.address && <div className="col-span-2"><span className="text-xs text-muted-foreground">כתובת</span><div className="text-foreground">{p.address}</div></div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "financial" && (
            <div className="space-y-3">
              {extracted.totalContractValue > 0 && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    <span className="font-semibold text-foreground">שווי חוזה כולל</span>
                  </div>
                  <div className="text-xl font-bold text-emerald-400">{new Intl.NumberFormat("he-IL", { style: "currency", currency: extracted.currency || "ILS" }).format(extracted.totalContractValue)}</div>
                </div>
              )}
              {financials.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">לא זוהו התחייבויות פיננסיות ספציפיות</p>
                </div>
              ) : financials.map((fc: any, i: number) => (
                <div key={i} className="bg-card border border-border/50 rounded-xl p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm text-foreground">{fc.description}</div>
                    <div className="flex gap-2 mt-1.5">
                      {fc.type && <span className="text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded">{fc.type}</span>}
                      {fc.frequency && <span className="text-[10px] bg-muted/20 text-muted-foreground px-2 py-0.5 rounded">{fc.frequency}</span>}
                      {fc.dueDate && <span className="text-[10px] bg-orange-500/10 text-orange-300 px-2 py-0.5 rounded">{fc.dueDate}</span>}
                    </div>
                  </div>
                  {fc.amount > 0 && (
                    <div className="text-lg font-bold text-emerald-400 shrink-0">
                      {new Intl.NumberFormat("he-IL", { style: "currency", currency: fc.currency || "ILS" }).format(fc.amount)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "terms" && (
            <div className="space-y-2">
              {Object.entries(keyTerms).filter(([, v]) => v && v !== "null").map(([key, value]) => {
                const labels: Record<string, string> = {
                  liabilityCap: "מגבלת אחריות", liabilityCapAmount: "סכום מגבלת אחריות",
                  indemnification: "שיפוי", confidentiality: "סודיות",
                  intellectualProperty: "קניין רוחני", disputeResolution: "יישוב סכסוכים",
                  governingLaw: "דין חל", exclusivity: "בלעדיות",
                  nonCompete: "אי תחרות", forceMajeure: "כוח עליון",
                  warrantyTerms: "אחריות ואחריות", penaltyClause: "קנסות",
                  terminationRights: "זכויות סיום", changeOrderProcess: "תהליך שינויים",
                };
                return (
                  <div key={key} className="bg-card border border-border/50 rounded-xl p-3">
                    <div className="text-xs text-muted-foreground mb-1">{labels[key] || key}</div>
                    <div className="text-sm text-foreground">{String(value)}</div>
                  </div>
                );
              })}
              {Object.entries(keyTerms).filter(([, v]) => v && v !== "null").length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                  <Scale className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">לא חולצו תנאים מרכזיים</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function DashboardTab() {
  const [drillAnalysis, setDrillAnalysis] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["contract-ai-dashboard"],
    queryFn: async () => {
      const r = await authFetch(`${API}/contract-ai/risk-dashboard`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 30000,
  });

  const openAnalysis = async (id: number) => {
    try {
      const r = await authFetch(`${API}/contract-ai/analysis/${id}`);
      if (r.ok) {
        const row = await r.json();
        setDrillAnalysis(row);
      }
    } catch {}
  };

  const dist = data?.distribution || [];
  const recent = data?.recentAnalyses || [];
  const topRisk = data?.topRiskContracts || [];

  const total = dist.reduce((s: number, d: any) => s + Number(d.count), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["critical", "high", "medium", "low"] as RiskLevel[]).map(level => {
          const cfg = RISK_CONFIG[level];
          const count = dist.find((d: any) => d.risk_level === level)?.count || 0;
          return (
            <div key={level} className={`border ${cfg.border} ${cfg.bg} rounded-xl p-4`}>
              <div className={`text-2xl font-bold ${cfg.color}`}>{isLoading ? "—" : count}</div>
              <div className={`text-xs mt-1 ${cfg.color}`}>{cfg.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> ציון סיכון ממוצע
          </h3>
          {isLoading ? (
            <div className="h-8 bg-muted/20 rounded animate-pulse" />
          ) : (
            <div className="flex items-end gap-2">
              <div className="text-4xl font-bold text-foreground">{Math.round(data?.avgRiskScore || 0)}</div>
              <div className="text-muted-foreground pb-1">/100</div>
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground">סה"כ {total} חוזים נותחו</div>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> התפלגות סיכונים
          </h3>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-5 bg-muted/20 rounded animate-pulse" />)}</div>
          ) : (
            <div className="space-y-2">
              {(["critical", "high", "medium", "low"] as RiskLevel[]).map(level => {
                const cfg = RISK_CONFIG[level];
                const count = Number(dist.find((d: any) => d.risk_level === level)?.count || 0);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={level} className="flex items-center gap-2 text-xs">
                    <span className={`w-12 text-right ${cfg.color}`}>{cfg.label}</span>
                    <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${level === "critical" ? "bg-red-500" : level === "high" ? "bg-orange-500" : level === "medium" ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-muted-foreground w-8">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-400" /> חוזים בסיכון גבוה
        </h3>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted/10 rounded-lg animate-pulse" />)}</div>
        ) : topRisk.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">אין חוזים בסיכון גבוה</p>
        ) : (
          <div className="space-y-2">
            {topRisk.slice(0, 8).map((c: any) => {
              const level = c.risk_level as RiskLevel;
              const cfg = RISK_CONFIG[level] || RISK_CONFIG.low;
              return (
                <button key={c.id} onClick={() => openAnalysis(c.id)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/10 text-right transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${cfg.bg} ${cfg.color}`}>{c.risk_score}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground truncate">{c.file_name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("he-IL")}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>{cfg.label}</span>
                  <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" /> ניתוחים אחרונים
        </h3>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted/10 rounded-lg animate-pulse" />)}</div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">טרם בוצעו ניתוחים</p>
        ) : (
          <div className="space-y-1">
            {recent.map((c: any) => {
              const level = c.risk_level as RiskLevel;
              const cfg = RISK_CONFIG[level] || RISK_CONFIG.low;
              return (
                <button key={c.id} onClick={() => c.status === "completed" && openAnalysis(c.id)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/10 text-right transition-colors">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0 text-sm text-foreground truncate">{c.file_name}</div>
                  {c.risk_level && <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>}
                  <span className={`text-[10px] ${c.status === "completed" ? "text-emerald-400" : c.status === "failed" ? "text-red-400" : "text-blue-400"}`}>
                    {c.status === "completed" ? "הושלם" : c.status === "failed" ? "נכשל" : "בעיבוד"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {drillAnalysis && (
          <AnalysisDetail analysis={drillAnalysis} onClose={() => setDrillAnalysis(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function ObligationReviewPanel({ obligations, analysisId, onDone }: { obligations: any[]; analysisId: number; onDone: () => void }) {
  const { toast } = useToast();
  const [dismissing, setDismissing] = useState<Record<number, boolean>>({});

  const handleDismiss = async (i: number, obligationId?: number) => {
    if (!obligationId) { onDone(); return; }
    setDismissing(prev => ({ ...prev, [i]: true }));
    try {
      await authFetch(`${API}/contract-ai/obligations/${obligationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "בוטל" }),
      });
      toast({ title: "התחייבות בוטלה" });
    } catch {
      toast({ title: "שגיאה בביטול", variant: "destructive" });
    } finally {
      setDismissing(prev => ({ ...prev, [i]: false }));
    }
  };

  if (obligations.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-violet-500/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-violet-400" />
          התחייבויות שנוצרו אוטומטית ({obligations.length})
        </h3>
        <button
          onClick={onDone}
          className="text-xs px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-foreground rounded-lg flex items-center gap-1.5 transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          סגור
        </button>
      </div>
      <p className="text-xs text-muted-foreground">כל ההתחייבויות שהתגלו על ידי ה-AI נוצרו אוטומטית. ניתן לבטל כל פריט שאינו רלוונטי.</p>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {obligations.map((ob: any, i: number) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{ob.title || ob.obligation_text}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {(ob.type || ob.obligation_type) && <span className="text-[10px] bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded">{ob.type || ob.obligation_type}</span>}
                {(ob.dueDate || ob.due_date) && <span className="text-[10px] bg-orange-500/10 text-orange-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><CalendarClock className="w-2.5 h-2.5" />{ob.dueDate || ob.due_date}</span>}
                {Number(ob.amount) > 0 && <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded">{new Intl.NumberFormat("he-IL", { style: "currency", currency: ob.currency || "ILS" }).format(Number(ob.amount))}</span>}
              </div>
            </div>
            <button
              onClick={() => handleDismiss(i, ob.id)}
              disabled={dismissing[i]}
              className="p-1.5 rounded-lg hover:bg-muted/30 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
              title="בטל התחייבות"
            >
              {dismissing[i] ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function AnalyzeTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<any>(null);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [pendingReview, setPendingReview] = useState<{ obligations: any[]; analysisId: number } | null>(null);

  const { data: clmContracts } = useQuery({
    queryKey: ["clm-contracts-list"],
    queryFn: async () => {
      const r = await authFetch(`${API}/clm/contracts?limit=100`);
      if (!r.ok) return { contracts: [] };
      return r.json();
    },
    staleTime: 60000,
  });

  const { data: analyses, isLoading } = useQuery({
    queryKey: ["contract-ai-analyses"],
    queryFn: async () => {
      const r = await authFetch(`${API}/contract-ai/analyses`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 15000,
  });

  const analyzeMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      if (selectedContractId) form.append("contractId", selectedContractId);
      const r = await authFetch(`${API}/contract-ai/analyze`, { method: "POST", body: form });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "ניתוח נכשל"); }
      return r.json();
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["contract-ai-analyses"] });
      queryClient.invalidateQueries({ queryKey: ["contract-ai-dashboard"] });
      const normalized = {
        id: result.analysisId,
        contract_id: result.contractId,
        status: result.status,
        risk_score: result.risk?.score,
        risk_level: result.risk?.level,
        risk_flags: result.risk?.flags,
        missing_protections: result.risk?.missingProtections,
        extracted_data: result.extracted,
        parties: result.extracted?.parties,
        financial_commitments: result.extracted?.financialCommitments,
        obligations: result.extracted?.obligations,
        key_terms: result.extracted?.keyTerms,
        language: result.extracted?.language,
        file_name: result.extracted?.contractTitle,
      };
      setActiveAnalysis(normalized);
      const obligationsMsg = result.obligationsCreated > 0 ? ` · ${result.obligationsCreated} התחייבויות נוצרו` : "";
      toast({ title: "ניתוח הושלם!", description: `ציון סיכון: ${result.risk?.score}/100 (${RISK_CONFIG[result.risk?.level as RiskLevel]?.label || ""})${obligationsMsg}` });
      if (result.obligationsCreated > 0) {
        const obRes = await authFetch(`${API}/contract-ai/obligations?analysisId=${result.analysisId}`);
        if (obRes.ok) {
          const obData = await obRes.json();
          const createdObs: unknown[] = obData.obligations || [];
          if (createdObs.length > 0) setPendingReview({ obligations: createdObs, analysisId: result.analysisId });
        }
      }
    },
    onError: (err: Error) => toast({ title: "שגיאה בניתוח", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/contract-ai/analysis/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-ai-analyses"] });
      queryClient.invalidateQueries({ queryKey: ["contract-ai-dashboard"] });
    },
  });

  const handleFiles = useCallback((files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;
    analyzeMutation.mutate(file);
  }, [analyzeMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const contracts = clmContracts?.contracts || clmContracts?.data || [];
  const analysisList = analyses?.analyses || [];

  return (
    <div className="space-y-5">
      {contracts.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <label className="text-xs font-semibold text-muted-foreground block mb-2">קשר ניתוח לחוזה קיים (אופציונלי)</label>
          <select
            value={selectedContractId}
            onChange={e => setSelectedContractId(e.target.value)}
            className="w-full bg-muted/20 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-violet-500/50"
          >
            <option value="">— ניתוח עצמאי (ללא קשר לחוזה קיים) —</option>
            {contracts.map((c: any) => (
              <option key={c.id} value={c.id}>{c.contract_number} — {c.title}</option>
            ))}
          </select>
          {selectedContractId && (
            <p className="text-xs text-violet-400 mt-1.5">נתוני החוזה שנחלצו יעדכנו אוטומטית את רשומת החוזה הנבחרת</p>
          )}
        </div>
      )}

      <div
        ref={dropRef}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !analyzeMutation.isPending && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${isDragging ? "border-violet-500 bg-violet-500/10" : analyzeMutation.isPending ? "border-muted/30 bg-muted/5 cursor-not-allowed" : "border-muted/30 bg-card/30 hover:border-violet-500/50 hover:bg-violet-500/5"}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
        <AnimatePresence mode="wait">
          {analyzeMutation.isPending ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-violet-400 animate-spin" />
              <p className="text-lg font-semibold text-foreground">מנתח חוזה עם AI...</p>
              <p className="text-sm text-muted-foreground mt-1">חולץ תנאים, מזהה סיכונים וממפה התחייבויות</p>
            </motion.div>
          ) : (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="relative mx-auto w-16 h-16 mb-4">
                <Upload className="w-16 h-16 text-muted-foreground/50" />
                <Sparkles className="w-5 h-5 text-violet-400 absolute -top-1 -right-1" />
              </div>
              <p className="text-lg font-semibold text-foreground">גרור קובץ חוזה לכאן</p>
              <p className="text-sm text-muted-foreground mt-1">PDF, Word, תמונות — עברית ואנגלית</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                {(["PDF", "DOCX", "JPG", "PNG"] as const).map(t => (
                  <span key={t} className="text-[10px] bg-muted/20 text-muted-foreground px-2 py-0.5 rounded">{t}</span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {pendingReview && (
        <ObligationReviewPanel
          obligations={pendingReview.obligations}
          analysisId={pendingReview.analysisId}
          onDone={() => setPendingReview(null)}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-muted/10 rounded-xl animate-pulse" />)}
        </div>
      ) : analysisList.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">ניתוחים קיימים ({analysisList.length})</h3>
          {analysisList.map((a: any) => {
            const level = a.risk_level as RiskLevel;
            const cfg = RISK_CONFIG[level] || RISK_CONFIG.low;
            return (
              <div key={a.id} className={`flex items-center gap-3 p-3 border rounded-xl ${a.status === "completed" ? "border-border/50 bg-card/50" : "border-border/30 bg-muted/5"}`}>
                <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{a.file_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
                {a.status === "completed" && (
                  <>
                    <div className={`text-sm font-bold ${cfg.color}`}>{a.risk_score}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                    <button onClick={() => setActiveAnalysis(a)} className="p-1.5 hover:bg-muted/30 rounded-lg" title="צפייה">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </>
                )}
                {a.status === "processing" && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                {a.status === "failed" && <AlertCircle className="w-4 h-4 text-red-400" />}
                <button onClick={() => deleteMutation.mutate(a.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg" title="מחיקה">
                  <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {activeAnalysis && (
          <AnalysisDetail
            analysis={activeAnalysis}
            onClose={() => setActiveAnalysis(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ContractAIAnalysisPage() {
  const [tab, setTab] = useState<"analyze" | "dashboard">("analyze");

  return (
    <div className="p-5 md:p-6 max-w-5xl mx-auto space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-violet-400" />
            ניתוח חוזים AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            חילוץ תנאים, דירוג סיכונים וזיהוי התחייבויות אוטומטי מחוזים בעברית ואנגלית
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/contracts/risk-scoring" className="text-xs px-3 py-2 bg-muted/20 text-muted-foreground rounded-lg flex items-center gap-1.5 hover:bg-muted/30">
            <ExternalLink className="w-3.5 h-3.5" /> דשבורד סיכונים
          </a>
        </div>
      </div>

      <div className="flex gap-1 bg-muted/10 border border-border/30 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab("analyze")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "analyze" ? "bg-violet-500 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          ניתוח חוזה
        </button>
        <button
          onClick={() => setTab("dashboard")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "dashboard" ? "bg-violet-500 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          דשבורד סיכונים
        </button>
      </div>

      {tab === "analyze" ? <AnalyzeTab /> : <DashboardTab />}
    </div>
  );
}
