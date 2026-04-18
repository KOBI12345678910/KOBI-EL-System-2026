import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Search, Users, TrendingUp, Clock, DollarSign,
  Target, Filter, Eye, Edit2, Download, Plus, CalendarDays,
  Building2, Award, AlertTriangle, CheckCircle2, Loader2
} from "lucide-react";

const FALLBACK_TENDERS = [
  { number: "MKZ-2026-001", project: "חלונות אלומיניום - מגדלי הים", client: "שיכון ובינוי", type: "ציבורי", value: 2850000, deadline: "2026-04-15", status: "בהכנה", team: "צוות א׳ - רונן" },
  { number: "MKZ-2026-002", project: "מעטפת זכוכית - מרכז עזריאלי החדש", client: "קבוצת עזריאלי", type: "פרטי", value: 5400000, deadline: "2026-04-22", status: "פעיל", team: "צוות ב׳ - שירה" },
  { number: "MKZ-2026-003", project: "דלתות זכוכית מאובטחות - משהב״ט", client: "משרד הביטחון", type: "ציבורי", value: 1950000, deadline: "2026-04-10", status: "הוגש", team: "צוות א׳ - רונן" },
  { number: "MKZ-2026-004", project: "חיפוי מתכת - קניון הנגב", client: "ביג מרכזי קניות", type: "פרטי", value: 3200000, deadline: "2026-05-01", status: "פעיל", team: "צוות ג׳ - יוסי" },
  { number: "MKZ-2026-005", project: "מסגרות פלדה - גשר חדש", client: "נתיבי ישראל", type: "ציבורי", value: 7800000, deadline: "2026-04-18", status: "בהכנה", team: "צוות ב׳ - שירה" },
  { number: "MKZ-2026-006", project: "ויטרינות חנויות - פרויקט TLV", client: "אלוני חץ", type: "פרטי", value: 1450000, deadline: "2026-05-12", status: "פעיל", team: "צוות א׳ - רונן" },
  { number: "MKZ-2026-007", project: "תקרות אלומיניום - בי״ח איכילוב", client: "משרד הבריאות", type: "ציבורי", value: 4100000, deadline: "2026-04-28", status: "הוגש", team: "צוות ג׳ - יוסי" },
  { number: "MKZ-2026-008", project: "מעקות זכוכית - פרויקט מגורים", client: "אפריקה ישראל", type: "פרטי", value: 980000, deadline: "2026-05-05", status: "טיוטה", team: "צוות ב׳ - שירה" },
  { number: "MKZ-2026-009", project: "פרגולות מתכת - פארק עירוני", client: "עיריית תל אביב", type: "ציבורי", value: 2300000, deadline: "2026-04-20", status: "פעיל", team: "צוות א׳ - רונן" },
  { number: "MKZ-2026-010", project: "חזיתות זכוכית - מלון חוף", client: "רשת פתאל", type: "פרטי", value: 6200000, deadline: "2026-05-15", status: "בהכנה", team: "צוות ג׳ - יוסי" },
  { number: "MKZ-2026-011", project: "מחיצות אלומיניום - משרדי הייטק", client: "הראל השקעות", type: "פרטי", value: 1750000, deadline: "2026-04-25", status: "הוגש", team: "צוות ב׳ - שירה" },
  { number: "MKZ-2026-012", project: "שערי פלדה - בסיס צבאי", client: "משרד הביטחון", type: "ציבורי", value: 3600000, deadline: "2026-05-08", status: "פעיל", team: "צוות א׳ - רונן" },
];

const statusColors: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-400 border-green-500/30",
  "בהכנה": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "הוגש": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "טיוטה": "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const typeColors: Record<string, string> = {
  "ציבורי": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "פרטי": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

export default function TendersManagement() {
  const { data: tenders = FALLBACK_TENDERS } = useQuery({
    queryKey: ["tenders-tenders"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tenders-management/tenders");
      if (!res.ok) return FALLBACK_TENDERS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TENDERS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return tenders.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          t.number.toLowerCase().includes(q) ||
          t.project.includes(search) ||
          t.client.includes(search) ||
          t.team.includes(search)
        );
      }
      return true;
    });
  }, [search, statusFilter]);

  const totalValue = tenders.reduce((s, t) => s + t.value, 0);
  const activeCount = tenders.filter((t) => t.status === "פעיל" || t.status === "בהכנה").length;
  const dueSoon = tenders.filter((t) => {
    const diff = (new Date(t.deadline).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 7;
  }).length;
  const avgBid = Math.round(totalValue / tenders.length);
  const teamMembers = new Set(tenders.map((t) => t.team));

  const kpis = [
    { label: "מכרזים פעילים", value: activeCount.toString(), icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "שווי כולל", value: `₪${(totalValue / 1000000).toFixed(1)}M`, icon: DollarSign, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "אחוז זכייה", value: "38%", icon: Target, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "הגשות ב-7 ימים", value: dueSoon.toString(), icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "גודל הצעה ממוצע", value: `₪${(avgBid / 1000).toFixed(0)}K`, icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "ניצולת צוותים", value: `${Math.round((activeCount / (teamMembers.size * 3)) * 100)}%`, icon: Users, color: "text-rose-400", bg: "bg-rose-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-7 w-7 text-emerald-400" />
            ניהול מכרזים - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">סקירת מכרזים פעילים, מעקב הגשות ותיאום צוותים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 ml-1" />מכרז חדש</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/80 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{kpi.label}</p>
                  <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="bg-card/60 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי מספר, פרויקט, לקוח או צוות..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9 bg-background/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground"
              >
                <option value="all">כל הסטטוסים</option>
                <option value="פעיל">פעיל</option>
                <option value="בהכנה">בהכנה</option>
                <option value="הוגש">הוגש</option>
                <option value="טיוטה">טיוטה</option>
              </select>
            </div>
            <Badge variant="outline" className="text-muted-foreground">
              {filtered.length} מכרזים
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Tenders Table */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-400" />
            רשימת מכרזים פעילים
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-right p-3 text-muted-foreground font-medium">מספר</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">פרויקט</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">שווי</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">מועד אחרון</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">צוות אחראי</th>
                  <th className="text-center p-3 text-muted-foreground font-medium w-20">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, idx) => {
                  const daysLeft = Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000);
                  const urgent = daysLeft >= 0 && daysLeft <= 5;
                  return (
                    <tr key={idx} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono text-xs text-foreground">{t.number}</td>
                      <td className="p-3 text-foreground font-medium max-w-[200px] truncate">{t.project}</td>
                      <td className="p-3 text-foreground">
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {t.client}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={typeColors[t.type]}>{t.type}</Badge>
                      </td>
                      <td className="p-3 font-mono font-medium text-foreground">
                        ₪{t.value.toLocaleString()}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className={`h-3.5 w-3.5 ${urgent ? "text-red-400" : "text-muted-foreground"}`} />
                          <span className={urgent ? "text-red-400 font-medium" : "text-foreground"}>
                            {t.deadline}
                          </span>
                          {urgent && daysLeft >= 0 && (
                            <Badge className="bg-red-500/20 text-red-400 text-[10px] px-1">{daysLeft} ימים</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={statusColors[t.status] || "bg-gray-500/20 text-gray-400"}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-foreground text-xs">
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {t.team}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Edit2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Summary Footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              הגשות קרובות
            </h3>
            {tenders
              .filter((t) => {
                const d = (new Date(t.deadline).getTime() - Date.now()) / 86400000;
                return d >= 0 && d <= 7;
              })
              .map((t, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-foreground">{t.project.substring(0, 30)}</span>
                  <span className="text-xs font-mono text-red-400">{t.deadline}</span>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-purple-400" />
              מכרזים שהוגשו
            </h3>
            {tenders
              .filter((t) => t.status === "הוגש")
              .map((t, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-foreground">{t.client}</span>
                  <span className="text-xs font-mono text-purple-400">₪{(t.value / 1000).toFixed(0)}K</span>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1">
              <Loader2 className="h-4 w-4 text-blue-400" />
              עומס צוותים
            </h3>
            {["צוות א׳ - רונן", "צוות ב׳ - שירה", "צוות ג׳ - יוסי"].map((team) => {
              const count = tenders.filter((t) => t.team === team).length;
              const pct = Math.round((count / tenders.length) * 100);
              return (
                <div key={team} className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground">{team}</span>
                    <span className="text-muted-foreground">{count} מכרזים</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
