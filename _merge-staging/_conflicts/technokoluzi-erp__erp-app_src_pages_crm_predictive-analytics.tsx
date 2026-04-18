import { useState } from "react";
import { TrendingUp, TrendingDown, BarChart3, Target, AlertTriangle, DollarSign, Users, Calendar } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

const REVENUE_FORECAST = [
  { month: "ינו׳", actual: 380000, forecast: 0 },
  { month: "פבר׳", actual: 410000, forecast: 0 },
  { month: "מרץ", actual: 445000, forecast: 0 },
  { month: "אפר׳", actual: 0, forecast: 470000 },
  { month: "מאי", actual: 0, forecast: 510000 },
  { month: "יוני", actual: 0, forecast: 545000 },
];

const LEAD_TRENDS = [
  { week: "שבוע 1", new: 12, converted: 4 },
  { week: "שבוע 2", new: 18, converted: 6 },
  { week: "שבוע 3", new: 15, converted: 7 },
  { week: "שבוע 4", new: 22, converted: 9 },
  { week: "שבוע 5", new: 19, converted: 8 },
  { week: "שבוע 6", new: 25, converted: 11 },
];

const CHURN_RISKS = [
  { name: "דוד כהן — Tech Corp", risk: 72, lastPurchase: "4 חודשים", value: 85000, reason: "אי-פעילות ממושכת" },
  { name: "רחל לוי — Build Co", risk: 45, lastPurchase: "2 חודשים", value: 120000, reason: "ירידה בנפח הזמנות" },
  { name: "משה ישראלי — Construct", risk: 28, lastPurchase: "1 חודש", value: 200000, reason: "תלונות שירות פתוחות" },
  { name: "שרה גולדברג — Arch Studio", risk: 15, lastPurchase: "2 שבועות", value: 65000, reason: "מתחרה ביצע פנייה" },
];

const DEAL_SCORES = [
  { name: "חלונות אלומיניום — Tech Corp", score: 85, value: 320000, close: "15 אפריל" },
  { name: "מערכת זגוגית — Build Co", score: 72, value: 180000, close: "28 אפריל" },
  { name: "חיפוי חזית — Construct Ltd", score: 61, value: 450000, close: "10 מאי" },
  { name: "שיפוץ משרדים — Alpha Ltd", score: 44, value: 95000, close: "20 מאי" },
];

const maxRevenue = Math.max(...REVENUE_FORECAST.map(r => Math.max(r.actual, r.forecast)));
const maxLeads = Math.max(...LEAD_TRENDS.map(l => l.new));

export default function PredictiveAnalyticsPage() {
  const [activeTab, setActiveTab] = useState("revenue");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6 text-cyan-400" />Predictive Analytics</h1>
          <p className="text-sm text-muted-foreground">ניתוח חזוי — תחזית הכנסות, churn, מגמות ועוד</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1.5">
          <Calendar className="w-4 h-4" />
          מעודכן: 17 מרץ 2026
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-xl p-4">
          <DollarSign className="w-6 h-6 text-green-400 mb-2" />
          <div className="text-xl font-bold">{fmtC(510000)}</div>
          <div className="text-xs text-muted-foreground">תחזית מאי 2026</div>
          <div className="text-xs text-green-400 flex items-center gap-1 mt-1"><TrendingUp className="w-3 h-3" />+8.5% ממרץ</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl p-4">
          <Users className="w-6 h-6 text-blue-400 mb-2" />
          <div className="text-xl font-bold">25</div>
          <div className="text-xs text-muted-foreground">לידים חדשים שבוע זה</div>
          <div className="text-xs text-blue-400 flex items-center gap-1 mt-1"><TrendingUp className="w-3 h-3" />+32% משבוע שעבר</div>
        </div>
        <div className="bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 rounded-xl p-4">
          <AlertTriangle className="w-6 h-6 text-red-400 mb-2" />
          <div className="text-xl font-bold">{CHURN_RISKS.filter(c => c.risk >= 40).length}</div>
          <div className="text-xs text-muted-foreground">לקוחות בסיכון עזיבה</div>
          <div className="text-xs text-red-400 flex items-center gap-1 mt-1"><TrendingDown className="w-3 h-3" />דורשים טיפול</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-xl p-4">
          <Target className="w-6 h-6 text-purple-400 mb-2" />
          <div className="text-xl font-bold">{fmtC(DEAL_SCORES.reduce((s, d) => s + d.value * d.score / 100, 0))}</div>
          <div className="text-xs text-muted-foreground">ערך צנרת משוקלל</div>
          <div className="text-xs text-purple-400 flex items-center gap-1 mt-1"><BarChart3 className="w-3 h-3" />{DEAL_SCORES.length} עסקאות</div>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {[
          { id: "revenue", label: "תחזית הכנסות" },
          { id: "leads", label: "מגמות לידים" },
          { id: "churn", label: "חיזוי Churn" },
          { id: "deals", label: "ציון הצלחת עסקאות" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === "revenue" && (
        <div className="bg-card border rounded-xl p-5">
          <h3 className="font-bold mb-6">תחזית הכנסות — 6 חודשים</h3>
          <div className="flex items-end gap-3 h-48 mb-4">
            {REVENUE_FORECAST.map((r, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-1 h-40">
                  {r.actual > 0 && <div className="flex-1 bg-blue-500/70 rounded-t" style={{ height: `${(r.actual / maxRevenue) * 100}%` }} title={fmtC(r.actual)} />}
                  {r.forecast > 0 && <div className="flex-1 bg-blue-500/30 border border-blue-500/50 rounded-t border-dashed" style={{ height: `${(r.forecast / maxRevenue) * 100}%` }} title={fmtC(r.forecast)} />}
                </div>
                <div className="text-xs text-muted-foreground">{r.month}</div>
                <div className="text-xs font-bold">{fmtC(r.actual || r.forecast)}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500/70 rounded" />בפועל</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500/30 border border-blue-500/50 rounded border-dashed" />תחזית</div>
          </div>
        </div>
      )}

      {activeTab === "leads" && (
        <div className="bg-card border rounded-xl p-5">
          <h3 className="font-bold mb-6">מגמות לידים — 6 שבועות אחרונים</h3>
          <div className="flex items-end gap-4 h-48 mb-4">
            {LEAD_TRENDS.map((l, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-1 h-40">
                  <div className="flex-1 bg-cyan-500/70 rounded-t" style={{ height: `${(l.new / maxLeads) * 100}%` }} title={`${l.new} חדשים`} />
                  <div className="flex-1 bg-green-500/70 rounded-t" style={{ height: `${(l.converted / maxLeads) * 100}%` }} title={`${l.converted} הומרו`} />
                </div>
                <div className="text-xs text-muted-foreground">{l.week}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground mb-4">
            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-cyan-500/70 rounded" />לידים חדשים</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500/70 rounded" />הומרו</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-cyan-400">{LEAD_TRENDS.reduce((s, l) => s + l.new, 0)}</div>
              <div className="text-xs text-muted-foreground">סה"כ לידים</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-green-400">{LEAD_TRENDS.reduce((s, l) => s + l.converted, 0)}</div>
              <div className="text-xs text-muted-foreground">הומרו</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-purple-400">{Math.round(LEAD_TRENDS.reduce((s, l) => s + l.converted, 0) / LEAD_TRENDS.reduce((s, l) => s + l.new, 0) * 100)}%</div>
              <div className="text-xs text-muted-foreground">אחוז המרה</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "churn" && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">חיזוי עזיבת לקוחות — מסודר לפי רמת סיכון</div>
          {CHURN_RISKS.sort((a, b) => b.risk - a.risk).map((c, i) => (
            <div key={i} className={`border rounded-xl p-4 bg-card ${c.risk >= 60 ? "border-red-500/30" : c.risk >= 40 ? "border-amber-500/30" : "border-border"}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">סיבה: {c.reason} • רכישה אחרונה לפני {c.lastPurchase}</div>
                </div>
                <div className="text-right">
                  <div className={`text-lg sm:text-2xl font-bold ${c.risk >= 60 ? "text-red-400" : c.risk >= 40 ? "text-amber-400" : "text-green-400"}`}>{c.risk}%</div>
                  <div className="text-xs text-muted-foreground">סיכון עזיבה</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-muted/30 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-full rounded-full ${c.risk >= 60 ? "bg-red-500" : c.risk >= 40 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${c.risk}%` }} />
                </div>
                <div className="text-xs text-muted-foreground">שווי: {fmtC(c.value)}</div>
                <button className="btn btn-outline btn-xs">צור קשר</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "deals" && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">ציון הצלחה חזוי לכל עסקה פעילה</div>
          {DEAL_SCORES.sort((a, b) => b.score - a.score).map((d, i) => (
            <div key={i} className="border rounded-xl p-4 bg-card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">סגירה צפויה: {d.close}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg sm:text-2xl font-bold">{fmtC(d.value)}</div>
                  <div className="text-xs text-muted-foreground">ערך עסקה</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">ציון הצלחה:</span>
                <div className="flex-1 bg-muted/30 rounded-full h-3 overflow-hidden">
                  <div className={`h-full rounded-full ${d.score >= 70 ? "bg-green-500" : d.score >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${d.score}%` }} />
                </div>
                <span className={`text-sm font-bold ${d.score >= 70 ? "text-green-400" : d.score >= 50 ? "text-amber-400" : "text-red-400"}`}>{d.score}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="predictive-analytics" entityId="dashboard" />
        <RelatedRecords entityType="predictive-analytics" entityId="dashboard" />
      </div>
    </div>
  );
}
