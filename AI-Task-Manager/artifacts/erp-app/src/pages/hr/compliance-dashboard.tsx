import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Shield, AlertTriangle, CheckCircle, Clock, ChevronLeft,
  RefreshCw, User, Building2, Calendar, Filter, Search,
  FileWarning, Activity, Bell, ChevronDown, ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authJson, authFetch } from "@/lib/utils";

const API = "/api";

const ALERT_TYPE_LABELS: Record<string, string> = {
  work_permit: "היתר עבודה",
  visa: "ויזה",
  residence_permit: "היתר שהייה",
  safety_training: "הכשרת בטיחות",
  forklift_license: "רישיון מלגזה",
  crane_license: "רישיון עגורן",
  welding_cert: "תעודת ריתוך",
  heights_cert: "עבודה בגובה",
  first_aid: "עזרה ראשונה",
  medical_exam: "בדיקה רפואית",
  professional_license: "רישיון מקצועי",
  passport: "דרכון",
};

const ALERT_TYPE_GROUPS: Record<string, string[]> = {
  "היתרי עבודה ושהייה": ["work_permit", "visa", "residence_permit", "passport"],
  "בטיחות": ["safety_training", "forklift_license", "crane_license", "welding_cert", "heights_cert", "first_aid"],
  "רפואה": ["medical_exam"],
  "רישיונות מקצועיים": ["professional_license"],
};

function urgencyBand(days: number): { label: string; color: string; bg: string; border: string } {
  if (days < 0) return { label: "פג תוקף", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" };
  if (days <= 30) return { label: `${days} ימים`, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" };
  if (days <= 60) return { label: `${days} ימים`, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" };
  return { label: `${days} ימים`, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" };
}

interface Alert {
  id: number;
  employee_id: number;
  employee_name: string;
  department: string;
  alert_type: string;
  item_name: string;
  expiry_date: string;
  days_until_expiry: number | string;
  status: string;
}

export default function ComplianceDashboardPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["compliance-dashboard"],
    queryFn: () => authJson(`${API}/compliance-alerts/dashboard`),
  });

  const scanMutation = useMutation({
    mutationFn: () => authFetch(`${API}/compliance-scan`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => {
      setTimeout(() => refetch(), 2000);
    }
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/compliance-alerts/resolve/${id}`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compliance-dashboard"] }),
  });

  const summary = data?.summary || { total: 0, expired: 0, within30: 0, within60: 0, within90: 0 };
  const allAlerts: Alert[] = data?.alerts || [];

  const filtered = allAlerts.filter(a => {
    const days = parseInt(String(a.days_until_expiry));
    if (filterType === "expired") return days < 0;
    if (filterType === "30") return days >= 0 && days <= 30;
    if (filterType === "60") return days > 30 && days <= 60;
    if (filterType === "90") return days > 60 && days <= 90;
    const q = search.toLowerCase();
    if (search && !a.employee_name?.toLowerCase().includes(q) && !a.item_name?.toLowerCase().includes(q) && !a.department?.toLowerCase().includes(q)) return false;
    return true;
  }).filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.employee_name?.toLowerCase().includes(q) || a.item_name?.toLowerCase().includes(q) || a.department?.toLowerCase().includes(q);
  });

  const byType = data?.byType || {};

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/hr" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          משאבי אנוש
        </Link>
        <span>/</span>
        <span className="text-foreground">דשבורד ציות</span>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-3">
            <Shield className="w-7 h-7 text-orange-400" />
            דשבורד ציות ורגולציה
          </h1>
          <p className="text-muted-foreground mt-1">מעקב תוקף מסמכים, רישיונות ואישורים</p>
        </div>
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${scanMutation.isPending ? "animate-spin" : ""}`} />
          {scanMutation.isPending ? "סורק..." : "סרוק עכשיו"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "פג תוקף", value: summary.expired, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", filter: "expired" },
          { label: "עד 30 יום", value: summary.within30, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", filter: "30" },
          { label: "31–60 יום", value: summary.within60, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", filter: "60" },
          { label: "61–90 יום", value: summary.within90, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", filter: "90" },
        ].map((kpi, i) => (
          <button
            key={i}
            onClick={() => setFilterType(filterType === kpi.filter ? "" : kpi.filter)}
            className={`${kpi.bg} border ${filterType === kpi.filter ? "ring-2 ring-primary" : kpi.border} rounded-2xl p-4 text-right transition-all hover:ring-1 hover:ring-primary/50`}
          >
            <div className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{kpi.label}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי עובד, מסמך, מחלקה..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {filterType && (
          <button onClick={() => setFilterType("")} className="flex items-center gap-1.5 px-3 py-2 bg-primary/20 text-primary rounded-xl text-sm">
            <Filter className="w-3.5 h-3.5" />
            ניקוי סינון
          </button>
        )}
        <span className="text-sm text-muted-foreground">{filtered.length} התראות</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400 opacity-50" />
          <p className="text-lg font-medium">אין התראות ציות</p>
          <p className="text-sm mt-1">כל המסמכים בתוקף</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(ALERT_TYPE_GROUPS).map(([groupName, types]) => {
            const groupAlerts = filtered.filter(a => types.includes(a.alert_type));
            if (!groupAlerts.length) return null;
            const isExpanded = expandedGroup === groupName || expandedGroup === null;

            return (
              <Card key={groupName} className="border-border/50">
                <button
                  onClick={() => setExpandedGroup(expandedGroup === groupName ? null : groupName)}
                  className="w-full"
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" />
                        {groupName}
                        <Badge className="bg-primary/20 text-primary text-[10px]">{groupAlerts.length}</Badge>
                      </div>
                      {expandedGroup === groupName
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      }
                    </CardTitle>
                  </CardHeader>
                </button>

                {(expandedGroup === groupName || expandedGroup === null) && (
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {groupAlerts.map(alert => {
                        const days = parseInt(String(alert.days_until_expiry));
                        const band = urgencyBand(days);
                        return (
                          <div
                            key={alert.id}
                            className={`flex items-center gap-4 p-3 rounded-xl border ${band.border} ${band.bg} transition-all`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-foreground text-sm">{alert.employee_name}</span>
                                {alert.department && (
                                  <Badge className="bg-muted/20 text-muted-foreground text-[10px]">{alert.department}</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                <FileWarning className="w-3 h-3" />
                                <span>{alert.item_name}</span>
                                <span>•</span>
                                <Calendar className="w-3 h-3" />
                                <span dir="ltr">{alert.expiry_date?.slice(0, 10)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={`text-sm font-bold ${band.color}`}>{band.label}</span>
                              <button
                                onClick={() => resolveMutation.mutate(alert.id)}
                                className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-green-500/50 transition-colors"
                              >
                                סמן כטופל
                              </button>
                              <Link
                                href={`/hr/employees/${alert.employee_id}`}
                                className="p-1.5 hover:bg-muted rounded-lg"
                                title="תיק עובד"
                              >
                                <User className="w-3.5 h-3.5 text-muted-foreground" />
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {filtered.some(a => !Object.values(ALERT_TYPE_GROUPS).flat().includes(a.alert_type)) && (
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  אחר
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {filtered
                  .filter(a => !Object.values(ALERT_TYPE_GROUPS).flat().includes(a.alert_type))
                  .map(alert => {
                    const days = parseInt(String(alert.days_until_expiry));
                    const band = urgencyBand(days);
                    return (
                      <div key={alert.id} className={`flex items-center gap-4 p-3 rounded-xl border ${band.border} ${band.bg}`}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground text-sm">{alert.employee_name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{alert.item_name} • {alert.expiry_date?.slice(0, 10)}</div>
                        </div>
                        <span className={`text-sm font-bold ${band.color}`}>{band.label}</span>
                        <button onClick={() => resolveMutation.mutate(alert.id)} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs">סמן כטופל</button>
                      </div>
                    );
                  })
                }
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
