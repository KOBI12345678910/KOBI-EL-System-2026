import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, User, FileText, Edit2, Trash2, Plus, CheckCircle2, ArrowRight, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

interface ActivityEntry {
  id: number;
  action: string;
  entityType: string;
  entity_type?: string;
  entityId: number;
  entity_id?: number;
  userId?: number;
  user_id?: number;
  userName?: string;
  user_name?: string;
  details?: string | Record<string, any>;
  description?: string;
  oldValue?: string;
  newValue?: string;
  fieldName?: string;
  ipAddress?: string;
  ip_address?: string;
  createdAt: string;
  created_at?: string;
}

const actionMap: Record<string, { label: string; icon: any; color: string }> = {
  create: { label: "נוצר", icon: Plus, color: "bg-green-500/20 text-green-400" },
  update: { label: "עודכן", icon: Edit2, color: "bg-blue-500/20 text-blue-400" },
  delete: { label: "נמחק", icon: Trash2, color: "bg-red-500/20 text-red-400" },
  status_change: { label: "שינוי סטטוס", icon: ArrowRight, color: "bg-amber-500/20 text-amber-400" },
  approve: { label: "אושר", icon: CheckCircle2, color: "bg-emerald-500/20 text-emerald-400" },
  view: { label: "נצפה", icon: FileText, color: "bg-slate-500/20 text-muted-foreground" },
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return d; }
}

interface ActivityLogProps {
  entityType: string;
  entityId?: number;
  apiEndpoint?: string;
  limit?: number;
  showHeader?: boolean;
  compact?: boolean;
}

export default function ActivityLog({ entityType, entityId, apiEndpoint, limit = 20, showHeader = true, compact = false }: ActivityLogProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!compact);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const url = apiEndpoint || `/api/audit-logs?entityType=${entityType}${entityId ? `&entityId=${entityId}` : ""}&limit=${limit}`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : data?.data || data?.items || data?.logs || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [entityType, entityId]);

  const visible = showAll ? entries : entries.slice(0, 5);

  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
      {showHeader && (
        <div className="p-4 border-b border-border/50 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">היסטוריית פעילות</h3>
            <Badge className="bg-muted text-muted-foreground text-xs">{entries.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); load(); }} className="p-1 hover:bg-muted rounded-lg"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
            {compact && (expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
          </div>
        </div>
      )}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            {loading ? (
              <div className="p-6 text-center"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
            ) : entries.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">אין פעילות עדיין</div>
            ) : (
              <div className="divide-y divide-border/30">
                {visible.map((entry, i) => {
                  const act = actionMap[entry.action] || actionMap.update;
                  const Icon = act.icon;
                  const rawName = entry.userName || entry.user_name;
                  const displayName = typeof rawName === "string" ? rawName : (rawName != null ? String(rawName) : "");
                  const displayDate = entry.createdAt || entry.created_at || "";
                  const rawDesc = entry.description;
                  const detailsText = (typeof rawDesc === "string" ? rawDesc : rawDesc && typeof rawDesc === "object" ? JSON.stringify(rawDesc) : "") || (
                    typeof entry.details === "string" ? entry.details
                    : entry.details && typeof entry.details === "object" ? Object.entries(entry.details).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}`).join(", ")
                    : ""
                  );
                  return (
                    <motion.div key={entry.id || i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                      <div className={`p-1.5 rounded-lg ${act.color} mt-0.5`}><Icon className="w-3.5 h-3.5" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`${act.color} text-xs`}>{act.label}</Badge>
                          {displayName && <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />{displayName}</span>}
                        </div>
                        {detailsText && <p className="text-xs text-foreground/70 mt-1 truncate">{detailsText}</p>}
                        {entry.fieldName && entry.oldValue && entry.newValue && (
                          <p className="text-xs text-muted-foreground mt-1">{String(entry.fieldName)}: <span className="line-through text-red-400/60">{typeof entry.oldValue === "object" ? JSON.stringify(entry.oldValue) : String(entry.oldValue)}</span> → <span className="text-green-400">{typeof entry.newValue === "object" ? JSON.stringify(entry.newValue) : String(entry.newValue)}</span></p>
                        )}
                        <span className="text-xs text-muted-foreground/60 mt-1 block">{formatDate(displayDate)}</span>
                      </div>
                    </motion.div>
                  );
                })}
                {entries.length > 5 && (
                  <button onClick={() => setShowAll(!showAll)} className="w-full p-2.5 text-center text-xs text-primary hover:bg-muted/30 transition-colors">
                    {showAll ? "הצג פחות" : `הצג עוד ${entries.length - 5} רשומות`}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
