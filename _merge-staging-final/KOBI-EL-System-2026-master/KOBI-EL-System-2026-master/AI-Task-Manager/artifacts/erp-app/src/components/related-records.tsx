import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ExternalLink, ChevronLeft, Package, FileText, Users, ShoppingCart, Wrench, DollarSign, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

interface RelatedTab {
  key: string;
  label: string;
  icon?: any;
  endpoint: string;
  columns: { key: string; label: string; render?: (val: any, row: any) => React.ReactNode }[];
  badge?: (row: any) => { label: string; color: string } | null;
  onRowClick?: (row: any) => void;
  emptyMessage?: string;
}

interface RelatedRecordsProps {
  tabs?: RelatedTab[];
  className?: string;
  [key: string]: any;
}

const iconMap: Record<string, any> = {
  products: Package, documents: FileText, contacts: Users, orders: ShoppingCart,
  maintenance: Wrench, payments: DollarSign, tasks: ClipboardList,
};

export default function RelatedRecords({ tabs, className = "" }: RelatedRecordsProps) {
  const safeTabs = Array.isArray(tabs) && tabs.length > 0 ? tabs : [];
  const [activeTab, setActiveTab] = useState(safeTabs[0]?.key || "");
  const [data, setData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});

  const loadTab = useCallback(async (tab: RelatedTab) => {
    if (data[tab.key]) return;
    setLoading(prev => ({ ...prev, [tab.key]: true }));
    try {
      const res = await authFetch(tab.endpoint);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : json?.data || json?.items || [];
        setData(prev => ({ ...prev, [tab.key]: items }));
        setCounts(prev => ({ ...prev, [tab.key]: items.length }));
      }
    } catch {}
    setLoading(prev => ({ ...prev, [tab.key]: false }));
  }, [data]);

  useEffect(() => {
    if (safeTabs.length === 0) return;
    const tab = safeTabs.find(t => t.key === activeTab);
    if (tab) loadTab(tab);
  }, [activeTab, safeTabs.length]);

  if (safeTabs.length === 0) return null;

  const currentTab = safeTabs.find(t => t.key === activeTab);
  const currentData = data[activeTab] || [];
  const isLoading = loading[activeTab];

  return (
    <div className={`bg-card border border-border/50 rounded-2xl overflow-hidden ${className}`}>
      <div className="border-b border-border/50 flex overflow-x-auto scrollbar-hide">
        {safeTabs.map(tab => {
          const Icon = (typeof tab.icon === "string" ? iconMap[tab.icon] : tab.icon) || iconMap[tab.key] || FileText;
          const count = counts[tab.key] || 0;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}>
              <Icon className="w-4 h-4" />
              {tab.label}
              {count > 0 && <Badge className="bg-muted text-muted-foreground text-xs h-5 min-w-5 flex items-center justify-center">{count}</Badge>}
            </button>
          );
        })}
      </div>
      <div className="p-0">
        {isLoading ? (
          <div className="p-8 text-center"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : currentData.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{currentTab?.emptyMessage || "אין רשומות קשורות"}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  {currentTab?.columns.map(col => (
                    <th key={col.key} className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{col.label}</th>
                  ))}
                  {currentTab?.badge && <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">סטטוס</th>}
                  <th className="px-2 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {currentData.slice(0, 10).map((row: any, i: number) => (
                  <motion.tr key={row.id || i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => currentTab?.onRowClick?.(row)}>
                    {currentTab?.columns.map(col => (
                      <td key={col.key} className="px-4 py-2.5 text-foreground/80">{col.render ? col.render(row[col.key], row) : (row[col.key] != null && typeof row[col.key] === "object" ? JSON.stringify(row[col.key]) : (row[col.key] ?? "—"))}</td>
                    ))}
                    {currentTab?.badge && (() => {
                      const b = currentTab.badge!(row);
                      return <td className="px-4 py-2.5">{b && <Badge className={`${b.color} text-xs`}>{b.label}</Badge>}</td>;
                    })()}
                    <td className="px-2 py-2.5"><ChevronLeft className="w-4 h-4 text-muted-foreground" /></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {currentData.length > 10 && <div className="p-2.5 text-center text-xs text-muted-foreground border-t border-border/30">מוצגות 10 מתוך {currentData.length} רשומות</div>}
          </div>
        )}
      </div>
    </div>
  );
}
