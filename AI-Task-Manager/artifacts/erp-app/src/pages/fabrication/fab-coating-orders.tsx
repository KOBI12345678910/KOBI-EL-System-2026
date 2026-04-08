import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Download, Eye, Edit2, ChevronRight, ChevronLeft, AlertCircle } from "lucide-react";

const STATUSES = ["ממתינה", "בציפוי", "מוכנה", "נשלחה"] as const;
const SC: Record<string, string> = { "ממתינה": "bg-green-500/20 text-green-300", "בציפוי": "bg-blue-500/20 text-blue-300", "מוכנה": "bg-yellow-500/20 text-yellow-300", "נשלחה": "bg-purple-500/20 text-purple-300" };
const COLS = [
    { key: "order", label: "הזמנה" },
    { key: "type", label: "סוג ציפוי" },
    { key: "color", label: "צבע" },
    { key: "qty", label: "כמות" },
    { key: "status", label: "סטטוס" }
];

export default function FabCoatingOrders() {
  const [data] = useState<Record<string, string>[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search && !Object.values(r).some(v => String(v).includes(search))) return false;
      return true;
    });
  }, [data, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">הזמנות ציפוי</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />הוספה</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATUSES.map(s => (
          <Card key={s} className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{data.filter(r => r.status === s).length}</div>
              <Badge className={SC[s] + " mt-1"}>{s}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {pageData.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין נתונים להצגה</p>
              <p className="text-sm mt-1">לחץ על הוספה כדי להתחיל</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border/50">
                  {COLS.map(c => <th key={c.key} className="text-right p-3 text-muted-foreground font-medium">{c.label}</th>)}
                  <th className="text-center p-3 text-muted-foreground font-medium w-24">פעולות</th>
                </tr></thead>
                <tbody>{pageData.map((row, idx) => (
                  <tr key={idx} className="border-b border-border/30 hover:bg-card/30">
                    {COLS.map(c => <td key={c.key} className="p-3 text-foreground">{c.key === "status" ? <Badge className={SC[row[c.key]] || ""}>{row[c.key]}</Badge> : row[c.key]}</td>)}
                    <td className="p-3 text-center"><div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm"><Edit2 className="w-3.5 h-3.5" /></Button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>מציג {Math.min(filtered.length,(page-1)*perPage+1)}-{Math.min(filtered.length,page*perPage)} מתוך {filtered.length}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}><ChevronRight className="w-4 h-4" /></Button>
              <span className="px-3 py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
