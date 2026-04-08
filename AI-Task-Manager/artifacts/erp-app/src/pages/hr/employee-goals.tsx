import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Target, Search, Plus, Edit2, Trash2, X, Save, TrendingUp,
  CheckCircle2, Clock, AlertTriangle, Users, BarChart3,
  Download, Filter, Calendar, Star, Award, ChevronLeft,
  ChevronRight, ArrowUpDown, Flag, Percent
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "\u05D8\u05D9\u05D5\u05D8\u05D4", color: "bg-gray-100 text-gray-800", icon: Clock },
  active: { label: "\u05E4\u05E2\u05D9\u05DC", color: "bg-blue-100 text-blue-800", icon: Target },
  in_progress: { label: "\u05D1\u05D1\u05D9\u05E6\u05D5\u05E2", color: "bg-indigo-100 text-indigo-800", icon: TrendingUp },
  completed: { label: "\u05D4\u05D5\u05E9\u05DC\u05DD", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  cancelled: { label: "\u05D1\u05D5\u05D8\u05DC", color: "bg-red-100 text-red-800", icon: X },
  overdue: { label: "\u05D1\u05D0\u05D9\u05D7\u05D5\u05E8", color: "bg-orange-100 text-orange-800", icon: AlertTriangle },
};
const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: "\u05E0\u05DE\u05D5\u05DA", color: "bg-blue-100 text-blue-800" },
  medium: { label: "\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9", color: "bg-yellow-100 text-yellow-800" },
  high: { label: "\u05D2\u05D1\u05D5\u05D4", color: "bg-orange-100 text-orange-800" },
  critical: { label: "\u05E7\u05E8\u05D9\u05D8\u05D9", color: "bg-red-100 text-red-800" },
};
const goalCategories = [
  { value: "performance", label: "\u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD" },
  { value: "development", label: "\u05E4\u05D9\u05EA\u05D5\u05D7" },
  { value: "leadership", label: "\u05DE\u05E0\u05D4\u05D9\u05D2\u05D5\u05EA" },
  { value: "innovation", label: "\u05D7\u05D3\u05E9\u05E0\u05D5\u05EA" },
  { value: "teamwork", label: "\u05E2\u05D1\u05D5\u05D3\u05EA \u05E6\u05D5\u05D5\u05EA" },
  { value: "customer", label: "\u05DC\u05E7\u05D5\u05D7\u05D5\u05EA" },
];

export default function EmployeeGoalsPage() {
  const { data: employeegoalsData } = useQuery({
    queryKey: ["employee-goals"],
    queryFn: () => authFetch("/api/hr/employee_goals"),
    staleTime: 5 * 60 * 1000,
  });

  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const [form, setForm] = useState({
    employee_name: "", goal_title: "", description: "", category: "performance",
    priority: "medium", status: "draft", progress: 0, start_date: "",
    due_date: "", key_results: "", weight: 0, manager_name: "",
    department: "", review_period: "", notes: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const [listRes, statsRes] = await Promise.all([
        fetch(`${API}/hr-sap/employee_goals?${params}`, { headers: headers() }),
        fetch(`${API}/hr-sap/employee_goals/stats`, { headers: headers() }),
      ]);
      const listData = await listRes.json();
      setItems(safeArray(listData));
      setTotalPages(listData.totalPages || 1);
      setStats(await statsRes.json());
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, search, statusFilter]);

  const handleSave = async () => {
    const method = editItem ? "PUT" : "POST";
    const url = editItem ? `${API}/hr-sap/employee_goals/${editItem.id}` : `${API}/hr-sap/employee_goals`;
    await fetch(url, { method, headers: headers(), body: JSON.stringify(form) });
    setShowForm(false); setEditItem(null);
    setForm({ employee_name: "", goal_title: "", description: "", category: "performance", priority: "medium", status: "draft", progress: 0, start_date: "", due_date: "", key_results: "", weight: 0, manager_name: "", department: "", review_period: "", notes: "" });
    fetchData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7?")) return;
    await fetch(`${API}/hr-sap/employee_goals/${id}`, { method: "DELETE", headers: headers() });
    fetchData();
  };

  const openEdit = (item: any) => { setEditItem(item); setForm({ ...item }); setShowForm(true); };

  const filteredItems = priorityFilter ? items.filter(i => i.priority === priorityFilter) : items;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">\u05D9\u05E2\u05D3\u05D9\u05DD \u05D5-OKRs</h1>
          <p className="text-gray-500">\u05E0\u05D9\u05D4\u05D5\u05DC \u05D9\u05E2\u05D3\u05D9\u05DD \u05D0\u05D9\u05E9\u05D9\u05D9\u05DD \u05D5\u05D0\u05E8\u05D2\u05D5\u05E0\u05D9\u05D9\u05DD</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`${API}/hr-sap/employee_goals/export?format=csv`)}>
            <Download className="w-4 h-4 ml-1" />\u05D9\u05D9\u05E6\u05D5\u05D0
          </Button>
          <Button onClick={() => { setEditItem(null); setForm({ employee_name: "", goal_title: "", description: "", category: "performance", priority: "medium", status: "draft", progress: 0, start_date: "", due_date: "", key_results: "", weight: 0, manager_name: "", department: "", review_period: "", notes: "" }); setShowForm(true); }}>
            <Plus className="w-4 h-4 ml-1" />\u05D9\u05E2\u05D3 \u05D7\u05D3\u05E9
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05E1\u05D4"\u05DB \u05D9\u05E2\u05D3\u05D9\u05DD</p><p className="text-2xl font-bold">{fmt(stats.total)}</p></div>
            <Target className="w-8 h-8 text-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05D4\u05D5\u05E9\u05DC\u05DE\u05D5</p><p className="text-2xl font-bold text-green-600">{stats.byStatus?.find((s: any) => s.status === "completed")?.count || 0}</p></div>
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05D1\u05D1\u05D9\u05E6\u05D5\u05E2</p><p className="text-2xl font-bold text-blue-600">{stats.byStatus?.find((s: any) => s.status === "in_progress")?.count || 0}</p></div>
            <TrendingUp className="w-8 h-8 text-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05D1\u05D0\u05D9\u05D7\u05D5\u05E8</p><p className="text-2xl font-bold text-orange-600">{stats.byStatus?.find((s: any) => s.status === "overdue")?.count || 0}</p></div>
            <AlertTriangle className="w-8 h-8 text-orange-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05D7\u05D3\u05E9\u05D9\u05DD \u05D4\u05D7\u05D5\u05D3\u05E9</p><p className="text-2xl font-bold">{fmt(stats.recentCount)}</p></div>
            <Star className="w-8 h-8 text-yellow-500" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D9\u05E2\u05D3\u05D9\u05DD..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9" />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">\u05DB\u05DC \u05D4\u05E1\u05D8\u05D8\u05D5\u05E1\u05D9\u05DD</option>
              {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="border rounded-md px-3 py-2 text-sm" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              <option value="">\u05DB\u05DC \u05D4\u05E2\u05D3\u05D9\u05E4\u05D5\u05D9\u05D5\u05EA</option>
              {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Goals List */}
      <div className="space-y-3">
        {loading ? (
          <Card><CardContent className="p-8 text-center text-gray-400">\u05D8\u05D5\u05E2\u05DF...</CardContent></Card>
        ) : filteredItems.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-gray-400">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05D9\u05E2\u05D3\u05D9\u05DD</CardContent></Card>
        ) : filteredItems.map(item => {
          const sc = statusConfig[item.status] || statusConfig.draft;
          const pc = priorityConfig[item.priority] || priorityConfig.medium;
          const progress = Math.min(100, Math.max(0, item.progress || 0));
          return (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{item.goal_title}</h3>
                      <Badge className={sc.color}>{sc.label}</Badge>
                      <Badge className={pc.color}>{pc.label}</Badge>
                      {item.category && <Badge variant="outline">{goalCategories.find(c => c.value === item.category)?.label || item.category}</Badge>}
                    </div>
                    <p className="text-sm text-gray-500">{item.description}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      {item.employee_name && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{item.employee_name}</span>}
                      {item.department && <span>{item.department}</span>}
                      {item.due_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(item.due_date).toLocaleDateString("he-IL")}</span>}
                      {item.weight > 0 && <span>\u05DE\u05E9\u05E7\u05DC: {item.weight}%</span>}
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${progress >= 100 ? "bg-green-500" : progress >= 60 ? "bg-blue-500" : progress >= 30 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-left">{progress}%</span>
                    </div>

                    {/* Key Results */}
                    {item.key_results && (
                      <div className="text-sm">
                        <span className="font-medium">\u05EA\u05D5\u05E6\u05D0\u05D5\u05EA \u05DE\u05E4\u05EA\u05D7: </span>
                        <span className="text-gray-600">{item.key_results}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit2 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">\u05E2\u05DE\u05D5\u05D3 {page} \u05DE\u05EA\u05D5\u05DA {totalPages}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{editItem ? "\u05E2\u05E8\u05D9\u05DB\u05EA \u05D9\u05E2\u05D3" : "\u05D9\u05E2\u05D3 \u05D7\u05D3\u05E9"}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditItem(null); }}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">\u05E9\u05DD \u05E2\u05D5\u05D1\u05D3 *</label><Input className="mt-1" value={form.employee_name} onChange={e => setForm({ ...form, employee_name: e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05DE\u05D7\u05DC\u05E7\u05D4</label><Input className="mt-1" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
              </div>
              <div><label className="text-sm font-medium">\u05DB\u05D5\u05EA\u05E8\u05EA \u05D9\u05E2\u05D3 *</label><Input className="mt-1" value={form.goal_title} onChange={e => setForm({ ...form, goal_title: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05EA\u05D9\u05D0\u05D5\u05E8</label><textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="text-sm font-medium">\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {goalCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium">\u05E2\u05D3\u05D9\u05E4\u05D5\u05EA</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                    {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium">\u05E1\u05D8\u05D8\u05D5\u05E1</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="text-sm font-medium">\u05D4\u05EA\u05E7\u05D3\u05DE\u05D5\u05EA (%)</label><Input type="number" min={0} max={100} className="mt-1" value={form.progress} onChange={e => setForm({ ...form, progress: +e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05EA\u05D0\u05E8\u05D9\u05DA \u05D4\u05EA\u05D7\u05DC\u05D4</label><Input type="date" className="mt-1" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05EA\u05D0\u05E8\u05D9\u05DA \u05D9\u05E2\u05D3</label><Input type="date" className="mt-1" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
              </div>
              <div><label className="text-sm font-medium">\u05EA\u05D5\u05E6\u05D0\u05D5\u05EA \u05DE\u05E4\u05EA\u05D7 (Key Results)</label><textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1" rows={3} value={form.key_results} onChange={e => setForm({ ...form, key_results: e.target.value })} placeholder="\u05EA\u05D5\u05E6\u05D0\u05D4 1\n\u05EA\u05D5\u05E6\u05D0\u05D4 2\n\u05EA\u05D5\u05E6\u05D0\u05D4 3" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">\u05DE\u05E9\u05E7\u05DC (%)</label><Input type="number" min={0} max={100} className="mt-1" value={form.weight} onChange={e => setForm({ ...form, weight: +e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05DE\u05E0\u05D4\u05DC</label><Input className="mt-1" value={form.manager_name} onChange={e => setForm({ ...form, manager_name: e.target.value })} /></div>
              </div>
              <div><label className="text-sm font-medium">\u05D4\u05E2\u05E8\u05D5\u05EA</label><textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowForm(false); setEditItem(null); }}>\u05D1\u05D9\u05D8\u05D5\u05DC</Button>
                <Button onClick={handleSave}><Save className="w-4 h-4 ml-1" />{editItem ? "\u05E2\u05D3\u05DB\u05D5\u05DF" : "\u05E9\u05DE\u05D9\u05E8\u05D4"}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
