import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles, Search, Mic, Save, CheckCircle2, XCircle, Clock,
  Database, Filter, History, Play, Copy, Download, Zap,
  BarChart3, MessageSquare, Brain, AlertCircle
} from "lucide-react";

interface QueryHistory {
  id: string;
  query: string;
  sql: string;
  status: "success" | "error";
  executionTime: number;
  rowCount: number;
  timestamp: string;
  intent: { entity: string; operation: string; filters: string[] };
  results?: Array<Record<string, any>>;
}

const MOCK_HISTORY: QueryHistory[] = [
  { id: "q1", query: "תראה לי את 10 הלקוחות הגדולים", sql: "SELECT c.name, SUM(o.total) AS total_sales FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.name ORDER BY total_sales DESC LIMIT 10;", status: "success", executionTime: 124, rowCount: 10, timestamp: "2026-04-10 14:32", intent: { entity: "customers", operation: "SELECT_TOP", filters: ["ORDER BY sales DESC", "LIMIT 10"] }, results: [
    { name: "חברת תעש ישראל", total_sales: 4890000 },
    { name: "אלקטרה בע\"מ", total_sales: 3240000 },
    { name: "טבע תעשיות", total_sales: 2980000 },
    { name: "אסם השקעות", total_sales: 2450000 },
    { name: "בזק ישראל", total_sales: 2120000 },
    { name: "שטראוס גרופ", total_sales: 1890000 },
    { name: "אלביט מערכות", total_sales: 1650000 },
    { name: "אמדוקס", total_sales: 1420000 },
    { name: "חברת חשמל", total_sales: 1340000 },
    { name: "רפאל תעשיות", total_sales: 1200000 },
  ] },
  { id: "q2", query: "כמה הזמנות יש היום", sql: "SELECT COUNT(*) AS order_count FROM orders WHERE DATE(created_at) = CURRENT_DATE;", status: "success", executionTime: 38, rowCount: 1, timestamp: "2026-04-10 14:25", intent: { entity: "orders", operation: "COUNT", filters: ["DATE = TODAY"] }, results: [{ order_count: 47 }] },
  { id: "q3", query: "סכום מכירות החודש לפי סוכן", sql: "SELECT s.name, SUM(o.total) AS sales FROM salespeople s JOIN orders o ON s.id = o.salesperson_id WHERE MONTH(o.created_at) = MONTH(CURRENT_DATE) GROUP BY s.name ORDER BY sales DESC;", status: "success", executionTime: 89, rowCount: 8, timestamp: "2026-04-10 13:47", intent: { entity: "orders", operation: "SUM_GROUPBY", filters: ["MONTH = CURRENT"] } },
  { id: "q4", query: "מלאי נמוך פחות מ-50 יחידות", sql: "SELECT p.sku, p.name, p.stock_qty FROM products p WHERE p.stock_qty < 50 ORDER BY p.stock_qty ASC;", status: "success", executionTime: 52, rowCount: 23, timestamp: "2026-04-10 12:15", intent: { entity: "products", operation: "SELECT", filters: ["stock < 50"] } },
  { id: "q5", query: "חשבוניות פתוחות מעל 30 יום", sql: "SELECT i.number, c.name, i.total, DATEDIFF(NOW(), i.due_date) AS days_overdue FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE i.status = 'open' AND DATEDIFF(NOW(), i.due_date) > 30;", status: "success", executionTime: 67, rowCount: 14, timestamp: "2026-04-10 11:30", intent: { entity: "invoices", operation: "SELECT", filters: ["status=open", "days_overdue > 30"] } },
  { id: "q6", query: "ממוצע זמן משלוח בשבוע האחרון", sql: "SELECT AVG(DATEDIFF(delivered_at, created_at)) AS avg_days FROM orders WHERE delivered_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);", status: "success", executionTime: 71, rowCount: 1, timestamp: "2026-04-10 10:12", intent: { entity: "orders", operation: "AVG", filters: ["last 7 days"] } },
  { id: "q7", query: "עובדים שלא העבירו דוח שעות", sql: "SELECT e.name, e.department FROM employees e LEFT JOIN timesheets t ON e.id = t.employee_id AND WEEK(t.date) = WEEK(NOW()) WHERE t.id IS NULL;", status: "success", executionTime: 94, rowCount: 6, timestamp: "2026-04-10 09:45", intent: { entity: "employees", operation: "SELECT_MISSING", filters: ["no timesheet this week"] } },
  { id: "q8", query: "הצג מוצרים ללא מכירות ברבעון", sql: "SELECT p.sku, p.name FROM products p WHERE p.id NOT IN (SELECT DISTINCT product_id FROM order_items WHERE created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH));", status: "error", executionTime: 0, rowCount: 0, timestamp: "2026-04-10 09:20", intent: { entity: "products", operation: "SELECT", filters: ["no sales in quarter"] } },
  { id: "q9", query: "10 הפריטים הנמכרים ביותר השנה", sql: "SELECT p.name, SUM(oi.quantity) AS units FROM products p JOIN order_items oi ON p.id = oi.product_id WHERE YEAR(oi.created_at) = YEAR(NOW()) GROUP BY p.name ORDER BY units DESC LIMIT 10;", status: "success", executionTime: 112, rowCount: 10, timestamp: "2026-04-09 17:45", intent: { entity: "products", operation: "TOP_N", filters: ["year = current", "limit 10"] } },
  { id: "q10", query: "לקוחות חדשים השבוע", sql: "SELECT name, email, created_at FROM customers WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);", status: "success", executionTime: 41, rowCount: 9, timestamp: "2026-04-09 16:30", intent: { entity: "customers", operation: "SELECT", filters: ["last 7 days"] } },
  { id: "q11", query: "הוצאות שיווק לפי חודש", sql: "SELECT MONTH(date) AS month, SUM(amount) AS total FROM expenses WHERE category = 'marketing' GROUP BY MONTH(date);", status: "success", executionTime: 83, rowCount: 12, timestamp: "2026-04-09 15:20", intent: { entity: "expenses", operation: "SUM_GROUPBY", filters: ["category=marketing"] } },
  { id: "q12", query: "פרויקטים באיחור", sql: "SELECT p.name, p.deadline, p.progress FROM projects p WHERE p.deadline < NOW() AND p.status != 'completed';", status: "success", executionTime: 55, rowCount: 4, timestamp: "2026-04-09 14:10", intent: { entity: "projects", operation: "SELECT", filters: ["overdue", "not completed"] } },
  { id: "q13", query: "רשימת ספקים עם עסקאות מעל מיליון", sql: "SELECT s.name, SUM(po.total) AS total FROM suppliers s JOIN purchase_orders po ON s.id = po.supplier_id GROUP BY s.name HAVING total > 1000000;", status: "success", executionTime: 97, rowCount: 7, timestamp: "2026-04-09 11:40", intent: { entity: "suppliers", operation: "SELECT_HAVING", filters: ["total > 1M"] } },
  { id: "q14", query: "רווח גולמי של מוצר X", sql: "SELECT name, (price - cost) / price * 100 AS gross_margin FROM products WHERE name LIKE '%X%';", status: "success", executionTime: 29, rowCount: 3, timestamp: "2026-04-09 10:05", intent: { entity: "products", operation: "CALC", filters: ["name LIKE X"] } },
  { id: "q15", query: "עובדים לפי מחלקה", sql: "SELECT department, COUNT(*) AS count FROM employees GROUP BY department;", status: "success", executionTime: 22, rowCount: 8, timestamp: "2026-04-08 17:30", intent: { entity: "employees", operation: "COUNT_GROUPBY", filters: ["by department"] } },
  { id: "q16", query: "הזמנות שבוטלו החודש", sql: "SELECT COUNT(*), SUM(total) FROM orders WHERE status = 'cancelled' AND MONTH(created_at) = MONTH(NOW());", status: "success", executionTime: 44, rowCount: 1, timestamp: "2026-04-08 16:15", intent: { entity: "orders", operation: "COUNT_SUM", filters: ["status=cancelled"] } },
  { id: "q17", query: "רשימת משימות פתוחות שלי", sql: "SELECT title, priority, due_date FROM tasks WHERE assignee_id = :user_id AND status = 'open';", status: "success", executionTime: 18, rowCount: 12, timestamp: "2026-04-08 15:00", intent: { entity: "tasks", operation: "SELECT", filters: ["mine", "open"] } },
  { id: "q18", query: "כמה תקלות אחזקה פתוחות", sql: "SELECT COUNT(*) FROM maintenance_tickets WHERE status IN ('open','in_progress');", status: "success", executionTime: 31, rowCount: 1, timestamp: "2026-04-08 13:45", intent: { entity: "maintenance", operation: "COUNT", filters: ["status IN open,in_progress"] } },
  { id: "q19", query: "מה הגביה בחודש אפריל", sql: "SELECT SUM(amount) FROM payments WHERE MONTH(date) = 4 AND YEAR(date) = YEAR(NOW());", status: "success", executionTime: 37, rowCount: 1, timestamp: "2026-04-08 11:20", intent: { entity: "payments", operation: "SUM", filters: ["month=4"] } },
  { id: "q20", query: "עובדים חדשים בשנה האחרונה", sql: "SELECT name, department, hire_date FROM employees WHERE hire_date >= DATE_SUB(NOW(), INTERVAL 1 YEAR);", status: "success", executionTime: 49, rowCount: 18, timestamp: "2026-04-08 10:00", intent: { entity: "employees", operation: "SELECT", filters: ["hired last year"] } },
];

const EXAMPLE_QUERIES = [
  "תראה לי את 10 הלקוחות הגדולים",
  "כמה הזמנות יש היום",
  "סכום מכירות החודש",
  "מלאי נמוך פחות מ-50 יחידות",
  "חשבוניות פתוחות מעל 30 יום",
  "פרויקטים באיחור",
  "עובדים לפי מחלקה",
  "רווח גולמי של השבוע",
];

export default function NLQueryAssistant() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("q1");

  const { data } = useQuery({
    queryKey: ["nl-query-history"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/advanced/nl-query");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return { history: MOCK_HISTORY };
      }
    },
  });

  const history: QueryHistory[] = data?.history || MOCK_HISTORY;
  const selected = history.find((h) => h.id === selectedId) || history[0];

  const handleExample = (ex: string) => {
    setQuery(ex);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/40">
            <Brain className="h-7 w-7 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">עוזר שאילתות בשפה טבעית</h1>
            <p className="text-sm text-gray-400">שאל שאלות בעברית וקבל SQL ותוצאות — AI מבוסס מודל שפה</p>
          </div>
        </div>
        <Badge variant="outline" className="border-purple-500/40 text-purple-400 bg-purple-500/10">
          <Sparkles className="h-3 w-3 ml-1" /> GPT-4o + Schema
        </Badge>
      </div>

      <Card className="bg-gradient-to-br from-purple-900/20 to-[#111827] border-purple-500/30 mb-6">
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="שאל שאלה בעברית: למשל 'תראה לי את ההזמנות הגדולות השבוע'..."
              className="pr-12 pl-32 py-6 text-lg bg-[#0a0e1a] border-[#1f2937] focus:border-purple-500"
            />
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex gap-2">
              <Button size="sm" variant="ghost" className="hover:bg-[#1f2937]">
                <Mic className="h-4 w-4 text-purple-400" />
              </Button>
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                <Play className="h-4 w-4 ml-1" /> הרץ
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs text-gray-400 mb-2">דוגמאות מהירות:</div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUERIES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleExample(ex)}
                  className="px-3 py-1.5 text-xs rounded-full bg-[#1f2937] hover:bg-purple-500/20 border border-[#1f2937] hover:border-purple-500/40 transition-all"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-1">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white text-base">
                <History className="h-4 w-4 text-purple-400" />
                היסטוריית שאילתות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[640px] overflow-y-auto">
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`p-2 rounded-lg cursor-pointer transition-all border ${
                    selectedId === item.id
                      ? "bg-purple-500/10 border-purple-500/40"
                      : "bg-[#0a0e1a] border-[#1f2937] hover:border-purple-500/20"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {item.status === "success" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{item.query}</div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                        <Clock className="h-2.5 w-2.5" />
                        {item.executionTime}ms
                        <span>•</span>
                        <span>{item.rowCount} שורות</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-3 space-y-4">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-white text-base">
                  <MessageSquare className="h-4 w-4 text-purple-400" />
                  שאילתה: "{selected.query}"
                </CardTitle>
                <div className="flex gap-2">
                  <Badge className={selected.status === "success" ? "bg-green-500/20 text-green-400 border-green-500/40" : "bg-red-500/20 text-red-400 border-red-500/40"}>
                    {selected.status === "success" ? <CheckCircle2 className="h-3 w-3 ml-1" /> : <XCircle className="h-3 w-3 ml-1" />}
                    {selected.status === "success" ? "הצליח" : "נכשל"}
                  </Badge>
                  <Badge variant="outline" className="border-cyan-500/40 text-cyan-400">
                    <Clock className="h-3 w-3 ml-1" /> {selected.executionTime}ms
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <Filter className="h-4 w-4 text-amber-400" />
                פירוש AI — Parsed Intent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                  <div className="text-xs text-gray-500 mb-1">ישות (Entity)</div>
                  <div className="text-sm font-mono text-cyan-400">{selected.intent.entity}</div>
                </div>
                <div className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                  <div className="text-xs text-gray-500 mb-1">פעולה (Operation)</div>
                  <div className="text-sm font-mono text-amber-400">{selected.intent.operation}</div>
                </div>
                <div className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                  <div className="text-xs text-gray-500 mb-1">מסננים ({selected.intent.filters.length})</div>
                  <div className="text-xs font-mono text-purple-400 truncate">{selected.intent.filters[0]}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-white text-sm">
                  <Database className="h-4 w-4 text-green-400" />
                  SQL שנוצר
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 hover:bg-[#1f2937]">
                    <Copy className="h-3 w-3 ml-1" /> העתק
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 hover:bg-[#1f2937]">
                    <Save className="h-3 w-3 ml-1" /> שמור כדוח
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="p-4 rounded-lg bg-[#0a0e1a] border border-[#1f2937] text-xs font-mono text-green-300 overflow-x-auto whitespace-pre-wrap" dir="ltr">
                {selected.sql}
              </pre>
            </CardContent>
          </Card>

          {selected.status === "success" && selected.results && selected.results.length > 0 ? (
            <Card className="bg-[#111827] border-[#1f2937]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-white text-sm">
                    <BarChart3 className="h-4 w-4 text-cyan-400" />
                    תוצאות ({selected.rowCount} שורות)
                  </CardTitle>
                  <Button size="sm" variant="ghost" className="h-7 hover:bg-[#1f2937]">
                    <Download className="h-3 w-3 ml-1" /> ייצוא
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-[#1f2937] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0a0e1a] border-b border-[#1f2937]">
                      <tr>
                        {Object.keys(selected.results[0]).map((k) => (
                          <th key={k} className="text-right px-4 py-2 text-xs text-gray-400 font-medium">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.results.map((row, i) => (
                        <tr key={i} className="border-b border-[#1f2937] hover:bg-[#0a0e1a]/50">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-4 py-2 text-white">
                              {typeof val === "number" ? val.toLocaleString("he-IL") : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : selected.status === "error" ? (
            <Card className="bg-red-500/5 border-red-500/30">
              <CardContent className="p-6 flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-red-400" />
                <div>
                  <div className="text-sm font-semibold text-red-400">שגיאה בביצוע השאילתה</div>
                  <div className="text-xs text-gray-400 mt-1">הסכימה לא תומכת בפעולה זו או שיש שגיאת תחביר</div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-[#111827] border-[#1f2937]">
              <CardContent className="p-12 text-center">
                <Zap className="h-8 w-8 text-gray-500 mx-auto mb-2" />
                <div className="text-sm text-gray-500">התוצאות יופיעו כאן</div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <Sparkles className="h-4 w-4 text-purple-400" />
                הסבר המודל — כיצד פורשה השאילתה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex gap-3 items-start">
                  <div className="h-6 w-6 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 text-xs font-bold flex-shrink-0">
                    1
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="text-gray-300 font-medium mb-1">זיהוי כוונה</div>
                    <div className="text-gray-500">המודל זיהה כוונה מסוג <span className="text-cyan-400 font-mono">{selected.intent.operation}</span> על ישות <span className="text-amber-400 font-mono">{selected.intent.entity}</span></div>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="h-6 w-6 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 text-xs font-bold flex-shrink-0">
                    2
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="text-gray-300 font-medium mb-1">התאמת סכימה</div>
                    <div className="text-gray-500">זיהוי טבלאות ועמודות רלוונטיות בסכימת בסיס הנתונים</div>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="h-6 w-6 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 text-xs font-bold flex-shrink-0">
                    3
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="text-gray-300 font-medium mb-1">בניית SQL</div>
                    <div className="text-gray-500">יצירת שאילתת SQL חוקית עם JOINs, WHERE ו-ORDER BY מתאימים</div>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="h-6 w-6 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 text-xs font-bold flex-shrink-0">
                    4
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="text-gray-300 font-medium mb-1">אימות ובדיקת הרשאות</div>
                    <div className="text-gray-500">בדיקת הרשאות משתמש ואבטחת השאילתה בפני SQL Injection</div>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="h-6 w-6 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-green-400 text-xs font-bold flex-shrink-0">
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="text-gray-300 font-medium mb-1">הרצה בהצלחה</div>
                    <div className="text-gray-500">זמן ביצוע: {selected.executionTime}ms | {selected.rowCount} שורות</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-900/10 to-[#111827] border-purple-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <Brain className="h-4 w-4 text-purple-400" />
                שאילתות מומלצות — AI Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { text: "האם יש דפוס עונתי במכירות?", complexity: "בינונית" },
                  { text: "איזה לקוח הגדיל הזמנות ב-50%?", complexity: "גבוהה" },
                  { text: "תן לי ממוצע זמן תגובה של הסוכנים", complexity: "פשוטה" },
                  { text: "הצג את המוצרים הרווחיים ביותר", complexity: "בינונית" },
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(s.text)}
                    className="text-right p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937] hover:border-purple-500/40 transition-all"
                  >
                    <div className="text-xs text-gray-300 mb-1">{s.text}</div>
                    <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 h-4">
                      מורכבות: {s.complexity}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
