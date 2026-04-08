import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Clock, Package, ShieldAlert, CheckCircle2,
  XCircle, ArrowDown, Warehouse, Calendar, Search, Filter,
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";

type TabKey = "expiry" | "low-stock";

const STATUS_CONFIG = {
  out_of_stock: { label: "אזל מהמלאי", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: XCircle },
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: ShieldAlert },
  low: { label: "נמוך", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: ArrowDown },
  reorder: { label: "נקודת הזמנה", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: Package },
};

export default function ExpiryAlertsPage() {
  const [tab, setTab] = useState<TabKey>("expiry");
  const [search, setSearch] = useState("");

  const { data: expiryData, isLoading: expiryLoading } = useQuery({
    queryKey: ["expiry-alerts"],
    queryFn: async () => {
      const r = await authFetch(`${API}/raw-materials/expiry-alerts`);
      if (!r.ok) return { expired: [], expiringSoon: [], ok: [], summary: { totalTracked: 0, expiredCount: 0, expiringSoonCount: 0, okCount: 0 } };
      return r.json();
    },
  });

  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ["low-stock-alerts"],
    queryFn: async () => {
      const r = await authFetch(`${API}/raw-materials/low-stock-alerts`);
      if (!r.ok) return { items: [], summary: { totalAlerts: 0, outOfStockCount: 0, criticalCount: 0, lowCount: 0, reorderCount: 0 } };
      return r.json();
    },
  });

  const loading = tab === "expiry" ? expiryLoading : stockLoading;

  const filterItems = (items: any[]) => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter((i: any) =>
      (i.material_name || "").toLowerCase().includes(s) ||
      (i.material_number || "").toLowerCase().includes(s) ||
      (i.sku || "").toLowerCase().includes(s) ||
      (i.category || "").toLowerCase().includes(s)
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">התראות מלאי</h1>
            <p className="text-sm text-muted-foreground">שימות פגות תוקף ומלאי נמוך — ניטור בזמן אמת</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex bg-card border border-border/50 rounded-lg overflow-hidden">
          <button onClick={() => setTab("expiry")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${tab === "expiry" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-card/5"}`}>
            <Clock size={15} /> שימות פגות תוקף
            {expiryData?.summary?.expiredCount > 0 && (
              <span className="bg-red-500 text-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{expiryData.summary.expiredCount}</span>
            )}
          </button>
          <button onClick={() => setTab("low-stock")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${tab === "low-stock" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-card/5"}`}>
            <ArrowDown size={15} /> מלאי נמוך
            {stockData?.summary?.totalAlerts > 0 && (
              <span className="bg-amber-500 text-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{stockData.summary.totalAlerts}</span>
            )}
          </button>
        </div>

        <div className="relative mr-4 flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש חומר..."
            className="w-full bg-card border border-border/50 rounded-lg pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {loading && <div className="text-center py-12 text-muted-foreground">טוען נתונים...</div>}

      {!loading && tab === "expiry" && expiryData && <ExpiryView data={expiryData} search={search} filterItems={filterItems} />}
      {!loading && tab === "low-stock" && stockData && <LowStockView data={stockData} search={search} filterItems={filterItems} />}
    </div>
  );
}

function ExpiryView({ data, search, filterItems }: { data: any; search: string; filterItems: (items: any[]) => any[] }) {
  const { summary } = data;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={AlertTriangle} label="סה״כ במעקב" value={summary.totalTracked} color="text-blue-400" bg="bg-blue-500/10" />
        <SummaryCard icon={XCircle} label="פגי תוקף" value={summary.expiredCount} color="text-red-400" bg="bg-red-500/10" />
        <SummaryCard icon={Clock} label="פגים בקרוב (30 יום)" value={summary.expiringSoonCount} color="text-amber-400" bg="bg-amber-500/10" />
        <SummaryCard icon={CheckCircle2} label="תקינים" value={summary.okCount} color="text-emerald-400" bg="bg-emerald-500/10" />
      </div>

      {filterItems(data.expired).length > 0 && (
        <AlertSection
          title="פגי תוקף"
          subtitle="חומרים שתוקפם פג — נדרשת פעולה מיידית"
          items={filterItems(data.expired)}
          borderColor="border-red-500/30"
          badgeColor="bg-red-500/20 text-red-400"
          renderBadge={(item: any) => `פג לפני ${Math.abs(Number(item.days_until_expiry))} ימים`}
        />
      )}

      {filterItems(data.expiringSoon).length > 0 && (
        <AlertSection
          title="פגים בקרוב"
          subtitle="חומרים שתוקפם פג בתוך 30 יום"
          items={filterItems(data.expiringSoon)}
          borderColor="border-amber-500/30"
          badgeColor="bg-amber-500/20 text-amber-400"
          renderBadge={(item: any) => `עוד ${item.days_until_expiry} ימים`}
        />
      )}

      {summary.expiredCount === 0 && summary.expiringSoonCount === 0 && (
        <div className="bg-card border border-emerald-500/20 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-lg font-medium text-emerald-400">אין שימות פגות תוקף</p>
          <p className="text-sm text-muted-foreground mt-1">כל החומרים עם תאריך תוקף בטווח תקין</p>
        </div>
      )}

      {summary.totalTracked === 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-8 text-center">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground">אין חומרים עם ימי תוקף מוגדרים</p>
          <p className="text-xs text-muted-foreground mt-1">הגדר שדה "ימי תוקף" בכרטיס חומר הגלם כדי לעקוב</p>
        </div>
      )}
    </>
  );
}

function LowStockView({ data, search, filterItems }: { data: any; search: string; filterItems: (items: any[]) => any[] }) {
  const { summary } = data;
  const items = filterItems(data.items || []);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={AlertTriangle} label="סה״כ התראות" value={summary.totalAlerts} color="text-amber-400" bg="bg-amber-500/10" />
        <SummaryCard icon={XCircle} label="אזל מהמלאי" value={summary.outOfStockCount} color="text-red-400" bg="bg-red-500/10" />
        <SummaryCard icon={ShieldAlert} label="קריטי" value={summary.criticalCount} color="text-red-400" bg="bg-red-500/10" />
        <SummaryCard icon={ArrowDown} label="נמוך / נקודת הזמנה" value={summary.lowCount + summary.reorderCount} color="text-blue-400" bg="bg-blue-500/10" />
      </div>

      {items.length > 0 ? (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-right">סטטוס</th>
                  <th className="px-3 py-2.5 text-right">מק״ט</th>
                  <th className="px-3 py-2.5 text-right">שם חומר</th>
                  <th className="px-3 py-2.5 text-right">קטגוריה</th>
                  <th className="px-3 py-2.5 text-left">מלאי נוכחי</th>
                  <th className="px-3 py-2.5 text-left">מינימום</th>
                  <th className="px-3 py-2.5 text-left">בטחון</th>
                  <th className="px-3 py-2.5 text-left">נק׳ הזמנה</th>
                  <th className="px-3 py-2.5 text-right">מיקום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {items.map((item: any) => {
                  const cfg = STATUS_CONFIG[item.stock_status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.reorder;
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={item.id} className="hover:bg-card/[0.02]">
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                          <StatusIcon size={12} /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{item.material_number}</td>
                      <td className="px-3 py-2.5 font-medium">{item.material_name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{item.category || "—"}</td>
                      <td className={`px-3 py-2.5 text-left font-bold ${cfg.color}`}>
                        {Number(item.current_stock || 0).toLocaleString("he-IL")} {item.unit || ""}
                      </td>
                      <td className="px-3 py-2.5 text-left text-muted-foreground">{Number(item.minimum_stock || 0).toLocaleString("he-IL")}</td>
                      <td className="px-3 py-2.5 text-left text-muted-foreground">{Number(item.safety_stock || 0).toLocaleString("he-IL")}</td>
                      <td className="px-3 py-2.5 text-left text-muted-foreground">{Number(item.reorder_point || 0).toLocaleString("he-IL")}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{item.warehouse_location || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-emerald-500/20 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-lg font-medium text-emerald-400">כל רמות המלאי תקינות</p>
          <p className="text-sm text-muted-foreground mt-1">אין חומרים מתחת לסף המינימום או נקודת ההזמנה</p>
        </div>
      )}
    </>
  );
}

function SummaryCard({ icon: Icon, label, value, color, bg }: { icon: any; label: string; value: number; color: string; bg: string }) {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg sm:text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function AlertSection({ title, subtitle, items, borderColor, badgeColor, renderBadge }: {
  title: string; subtitle: string; items: any[]; borderColor: string; badgeColor: string; renderBadge: (item: any) => string;
}) {
  return (
    <div className={`bg-card border ${borderColor} rounded-xl overflow-hidden`}>
      <div className="px-5 py-3 border-b border-border/30">
        <h3 className="text-sm font-bold">{title} ({items.length})</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/20 text-xs text-muted-foreground">
              <th className="px-4 py-2 text-right">מצב</th>
              <th className="px-3 py-2 text-right">מק״ט</th>
              <th className="px-3 py-2 text-right">שם חומר</th>
              <th className="px-3 py-2 text-right">קטגוריה</th>
              <th className="px-3 py-2 text-left">מלאי</th>
              <th className="px-3 py-2 text-right">תוקף</th>
              <th className="px-3 py-2 text-right">מיקום</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {items.map((item: any) => (
              <tr key={item.id} className="hover:bg-card/[0.02]">
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}>
                    {renderBadge(item)}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{item.material_number}</td>
                <td className="px-3 py-2 font-medium">{item.material_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.category || "—"}</td>
                <td className="px-3 py-2 text-left font-bold">{Number(item.current_stock || 0).toLocaleString("he-IL")} {item.unit || ""}</td>
                <td className="px-3 py-2">{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString("he-IL") : "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.warehouse_location || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RelatedRecords tabs={[
        { key: "materials", label: "חומרי גלם", endpoint: "/api/raw-materials?limit=10", columns: [{ key: "name", label: "שם" }, { key: "current_stock", label: "מלאי" }] },
      ]} />

      <ActivityLog entityType="expiry-alerts" compact />
    </div>
  );
}
