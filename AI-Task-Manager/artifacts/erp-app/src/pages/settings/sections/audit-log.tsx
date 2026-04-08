import { useState } from "react";
import { Button, Card } from "@/components/ui-components";
import { ClipboardList, Search, Download, User, Activity } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const AUDIT_LOGS = [
  { id: 1, user: "מנהל מערכת", action: "עדכון", module: "לקוחות", record: "חברת ABC", details: "עדכון שדה 'טלפון'", ip: "192.168.1.1", date: "2026-03-17", time: "10:42" },
  { id: 2, user: "דוד כהן", action: "יצירה", module: "הזמנות", record: "הזמנה #1042", details: "הזמנה חדשה — ₪5,400", ip: "192.168.1.15", date: "2026-03-17", time: "10:30" },
  { id: 3, user: "מיכל לוי", action: "מחיקה", module: "ספקים", record: "ספק X", details: "מחיקת ספק לא פעיל", ip: "192.168.1.22", date: "2026-03-17", time: "09:55" },
  { id: 4, user: "יוסי אברהם", action: "כניסה", module: "מערכת", record: "—", details: "כניסה מוצלחת", ip: "10.0.0.5", date: "2026-03-17", time: "09:00" },
  { id: 5, user: "שרה גולן", action: "ייצוא", module: "חשבוניות", record: "—", details: "ייצוא 45 חשבוניות ל-Excel", ip: "192.168.1.8", date: "2026-03-16", time: "16:30" },
  { id: 6, user: "מנהל מערכת", action: "הגדרות", module: "הגדרות מערכת", record: "—", details: "שינוי מדיניות סיסמאות", ip: "192.168.1.1", date: "2026-03-16", time: "14:15" },
  { id: 7, user: "אלי ברון", action: "עדכון", module: "מוצרים", record: "מוצר #42", details: "עדכון מחיר מ-₪100 ל-₪120", ip: "192.168.1.30", date: "2026-03-15", time: "11:00" },
  { id: 8, user: "ריבה ניר", action: "יצירה", module: "משתמשים", record: "user: eyal@company.com", details: "יצירת משתמש חדש", ip: "192.168.1.1", date: "2026-03-15", time: "10:00" },
];

const ACTION_COLORS: Record<string, string> = {
  "יצירה": "bg-green-500/10 text-green-400",
  "עדכון": "bg-blue-500/10 text-blue-400",
  "מחיקה": "bg-red-500/10 text-red-400",
  "כניסה": "bg-violet-500/10 text-violet-400",
  "ייצוא": "bg-cyan-500/10 text-cyan-400",
  "הגדרות": "bg-orange-500/10 text-orange-400",
};

export default function AuditLogSection() {
  const [search, setSearch] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = AUDIT_LOGS.filter(log => {
    if (filterUser && !log.user.toLowerCase().includes(filterUser.toLowerCase())) return false;
    if (filterAction && log.action !== filterAction) return false;
    if (filterModule && log.module !== filterModule) return false;
    if (dateFrom && log.date < dateFrom) return false;
    if (dateTo && log.date > dateTo) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        log.user.toLowerCase().includes(q) ||
        log.module.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.record.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const uniqueUsers = [...new Set(AUDIT_LOGS.map(l => l.user))];
  const uniqueActions = [...new Set(AUDIT_LOGS.map(l => l.action))];
  const uniqueModules = [...new Set(AUDIT_LOGS.map(l => l.module))];

  const hasFilters = filterUser || filterAction || filterModule || search || dateFrom || dateTo;

  const clearFilters = () => {
    setFilterUser("");
    setFilterAction("");
    setFilterModule("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500/20 to-zinc-500/20 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">יומן ביקורת (Audit Log)</h1>
            <p className="text-sm text-muted-foreground">כל הפעולות במערכת — מי, מה, מתי, מאיפה</p>
          </div>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          ייצא לוג
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6">
        {[
          { label: "סה\"כ פעולות", value: AUDIT_LOGS.length.toString(), color: "text-primary" },
          { label: "יצירות", value: AUDIT_LOGS.filter(l => l.action === "יצירה").length.toString(), color: "text-green-400" },
          { label: "עדכונים", value: AUDIT_LOGS.filter(l => l.action === "עדכון").length.toString(), color: "text-blue-400" },
          { label: "מחיקות", value: AUDIT_LOGS.filter(l => l.action === "מחיקה").length.toString(), color: "text-red-400" },
        ].map((stat, i) => (
          <Card key={i} className="p-4">
            <p className={`text-lg sm:text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 flex-1 max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חפש בלוג..."
            className="bg-transparent text-sm outline-none flex-1"
          />
        </div>
        <select
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
        >
          <option value="">כל המשתמשים</option>
          {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
        >
          <option value="">כל הפעולות</option>
          {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
          value={filterModule}
          onChange={(e) => setFilterModule(e.target.value)}
        >
          <option value="">כל המודולים</option>
          {uniqueModules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">מתאריך:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">עד תאריך:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 bg-muted/30 rounded"
          >
            נקה סינון
          </button>
        )}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">תאריך ושעה</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">משתמש</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">פעולה</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">מודול</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">רשומה</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">פרטים</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">IP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log) => (
              <tr key={log.id} className="border-b border-border hover:bg-muted/20">
                <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{log.date} {log.time}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm">{log.user}</span>
                  </div>
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] || "bg-muted text-muted-foreground"}`}>
                    {log.action}
                  </span>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{log.module}</td>
                <td className="p-3 text-xs">{log.record}</td>
                <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">{log.details}</td>
                <td className="p-3 text-xs font-mono text-muted-foreground">{log.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>אין רשומות תואמות לסינון</p>
          </div>
        )}
      </Card>

      <div className="mt-3 text-xs text-muted-foreground">
        מוצגות {filtered.length} מתוך {AUDIT_LOGS.length} רשומות
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="audit-log" />
        <RelatedRecords entityType="audit-log" />
      </div>
    </div>
  );
}
