import { useState, useEffect } from "react";
import {
  Users, Search, Plus, Edit2, Trash2, X, Save, TrendingUp,
  DollarSign, Building2, Download, Filter, BarChart3,
  Calendar, Target, ChevronLeft, ChevronRight, ArrowUpDown,
  Briefcase, UserPlus, AlertTriangle, CheckCircle2, Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => "\u20AA" + Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  active: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
};
const statusLabels: Record<string, string> = {
  draft: "\u05D8\u05D9\u05D5\u05D8\u05D4", pending: "\u05DE\u05DE\u05EA\u05D9\u05DF \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8",
  approved: "\u05DE\u05D0\u05D5\u05E9\u05E8", rejected: "\u05E0\u05D3\u05D7\u05D4",
  active: "\u05E4\u05E2\u05D9\u05DC", completed: "\u05D4\u05D5\u05E9\u05DC\u05DD",
};
const priorityColors: Record<string, string> = {
  low: "bg-blue-100 text-blue-800", medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800", critical: "bg-red-100 text-red-800",
};
const departments = ["\u05D4\u05E0\u05D4\u05DC\u05D4", "\u05DE\u05DB\u05D9\u05E8\u05D5\u05EA", "\u05E9\u05D9\u05D5\u05D5\u05E7", "\u05DB\u05E1\u05E4\u05D9\u05DD", "\u05DE\u05E9\u05D0\u05D1\u05D9 \u05D0\u05E0\u05D5\u05E9", "\u05D8\u05DB\u05E0\u05D5\u05DC\u05D5\u05D2\u05D9\u05D4", "\u05D9\u05D9\u05E6\u05D5\u05E8", "\u05DC\u05D5\u05D2\u05D9\u05E1\u05D8\u05D9\u05E7\u05D4", "\u05D0\u05D9\u05DB\u05D5\u05EA", "\u05DE\u05D7\u05E7\u05E8 \u05D5\u05E4\u05D9\u05EA\u05D5\u05D7"];

export default function WorkforcePlanningPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState("DESC");

  const [form, setForm] = useState({
    department: "", position_title: "", current_headcount: 0, planned_headcount: 0,
    budget_allocated: 0, fiscal_year: new Date().getFullYear(), quarter: "Q1",
    status: "draft", priority: "medium", justification: "", notes: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25", sort, order });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (deptFilter) params.set("department", deptFilter);

      const [listRes, statsRes] = await Promise.all([
        fetch(`${API}/hr-sap/workforce_planning?${params}`, { headers: headers() }),
        fetch(`${API}/hr-sap/workforce_planning/stats`, { headers: headers() }),
      ]);
      const listData = await listRes.json();
      const statsData = await statsRes.json();
      setItems(safeArray(listData));
      setTotalPages(listData.totalPages || 1);
      setStats(statsData);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, search, statusFilter, deptFilter, sort, order]);

  const handleSave = async () => {
    try {
      const method = editItem ? "PUT" : "POST";
      const url = editItem
        ? `${API}/hr-sap/workforce_planning/${editItem.id}`
        : `${API}/hr-sap/workforce_planning`;
      await fetch(url, { method, headers: headers(), body: JSON.stringify(form) });
      setShowForm(false);
      setEditItem(null);
      setForm({ department: "", position_title: "", current_headcount: 0, planned_headcount: 0, budget_allocated: 0, fiscal_year: new Date().getFullYear(), quarter: "Q1", status: "draft", priority: "medium", justification: "", notes: "" });
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7?")) return;
    await fetch(`${API}/hr-sap/workforce_planning/${id}`, { method: "DELETE", headers: headers() });
    fetchData();
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ ...item });
    setShowForm(true);
  };

  const toggleSort = (field: string) => {
    if (sort === field) setOrder(o => o === "ASC" ? "DESC" : "ASC");
    else { setSort(field); setOrder("DESC"); }
  };

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">\u05EA\u05DB\u05E0\u05D5\u05DF \u05DB\u05D5\u05D7 \u05D0\u05D3\u05DD</h1>
          <p className="text-gray-500">\u05EA\u05DB\u05E0\u05D5\u05DF \u05D0\u05E1\u05D8\u05E8\u05D8\u05D2\u05D9 \u05E9\u05DC \u05DB\u05D5\u05D7 \u05D0\u05D3\u05DD \u05D5\u05EA\u05E7\u05E6\u05D9\u05D1</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`${API}/hr-sap/workforce_planning/export?format=csv`)}>
            <Download className="w-4 h-4 ml-1" />\u05D9\u05D9\u05E6\u05D5\u05D0
          </Button>
          <Button onClick={() => { setEditItem(null); setForm({ department: "", position_title: "", current_headcount: 0, planned_headcount: 0, budget_allocated: 0, fiscal_year: new Date().getFullYear(), quarter: "Q1", status: "draft", priority: "medium", justification: "", notes: "" }); setShowForm(true); }}>
            <Plus className="w-4 h-4 ml-1" />\u05EA\u05D5\u05DB\u05E0\u05D9\u05EA \u05D7\u05D3\u05E9\u05D4
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">\u05E1\u05D4"\u05DB \u05EA\u05D5\u05DB\u05E0\u05D9\u05D5\u05EA</p>
                <p className="text-2xl font-bold">{fmt(stats.total)}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">\u05D7\u05D3\u05E9\u05D9\u05DD \u05D4\u05D7\u05D5\u05D3\u05E9</p>
                <p className="text-2xl font-bold">{fmt(stats.recentCount)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">\u05DE\u05D7\u05DC\u05E7\u05D5\u05EA</p>
                <p className="text-2xl font-bold">{stats.byDepartment?.length || 0}</p>
              </div>
              <Building2 className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">\u05DE\u05DE\u05EA\u05D9\u05E0\u05D9\u05DD \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8</p>
                <p className="text-2xl font-bold">{stats.byStatus?.find((s: any) => s.status === "pending")?.count || 0}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9" />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">\u05DB\u05DC \u05D4\u05E1\u05D8\u05D8\u05D5\u05E1\u05D9\u05DD</option>
              {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="border rounded-md px-3 py-2 text-sm" value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }}>
              <option value="">\u05DB\u05DC \u05D4\u05DE\u05D7\u05DC\u05E7\u05D5\u05EA</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-right cursor-pointer" onClick={() => toggleSort("department")}>
                    <span className="flex items-center gap-1">\u05DE\u05D7\u05DC\u05E7\u05D4 <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="p-3 text-right cursor-pointer" onClick={() => toggleSort("position_title")}>
                    <span className="flex items-center gap-1">\u05EA\u05E4\u05E7\u05D9\u05D3 <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="p-3 text-right">\u05E0\u05D5\u05DB\u05D7\u05D9</th>
                  <th className="p-3 text-right">\u05DE\u05EA\u05D5\u05DB\u05E0\u05DF</th>
                  <th className="p-3 text-right">\u05EA\u05E7\u05E6\u05D9\u05D1</th>
                  <th className="p-3 text-right">\u05E9\u05E0\u05D4</th>
                  <th className="p-3 text-right">\u05E1\u05D8\u05D8\u05D5\u05E1</th>
                  <th className="p-3 text-right">\u05E2\u05D3\u05D9\u05E4\u05D5\u05EA</th>
                  <th className="p-3 text-right">\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="p-8 text-center text-gray-400">\u05D8\u05D5\u05E2\u05DF...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-gray-400">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E8\u05E9\u05D5\u05DE\u05D5\u05EA</td></tr>
                ) : items.map(item => (
                  <tr key={item.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{item.department}</td>
                    <td className="p-3">{item.position_title}</td>
                    <td className="p-3">{fmt(item.current_headcount)}</td>
                    <td className="p-3">{fmt(item.planned_headcount)}</td>
                    <td className="p-3">{fmtCurrency(item.budget_allocated)}</td>
                    <td className="p-3">{item.fiscal_year} {item.quarter}</td>
                    <td className="p-3">
                      <Badge className={statusColors[item.status] || "bg-gray-100"}>{statusLabels[item.status] || item.status}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={priorityColors[item.priority] || "bg-gray-100"}>{item.priority}</Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit2 className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between p-4 border-t">
            <span className="text-sm text-gray-500">\u05E2\u05DE\u05D5\u05D3 {page} \u05DE\u05EA\u05D5\u05DA {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{editItem ? "\u05E2\u05E8\u05D9\u05DB\u05EA \u05EA\u05D5\u05DB\u05E0\u05D9\u05EA" : "\u05EA\u05D5\u05DB\u05E0\u05D9\u05EA \u05D7\u05D3\u05E9\u05D4"}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditItem(null); }}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">\u05DE\u05D7\u05DC\u05E7\u05D4 *</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
                    <option value="">\u05D1\u05D7\u05E8...</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">\u05EA\u05E4\u05E7\u05D9\u05D3 *</label>
                  <Input className="mt-1" value={form.position_title} onChange={e => setForm({ ...form, position_title: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">\u05DB\u05DE\u05D5\u05EA \u05E0\u05D5\u05DB\u05D7\u05D9\u05EA</label>
                  <Input type="number" className="mt-1" value={form.current_headcount} onChange={e => setForm({ ...form, current_headcount: +e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">\u05DB\u05DE\u05D5\u05EA \u05DE\u05EA\u05D5\u05DB\u05E0\u05E0\u05EA</label>
                  <Input type="number" className="mt-1" value={form.planned_headcount} onChange={e => setForm({ ...form, planned_headcount: +e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">\u05EA\u05E7\u05E6\u05D9\u05D1 \u05DE\u05D0\u05D5\u05E9\u05E8</label>
                  <Input type="number" className="mt-1" value={form.budget_allocated} onChange={e => setForm({ ...form, budget_allocated: +e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">\u05E9\u05E0\u05D4 \u05E4\u05D9\u05E1\u05E7\u05DC\u05D9\u05EA</label>
                  <Input type="number" className="mt-1" value={form.fiscal_year} onChange={e => setForm({ ...form, fiscal_year: +e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">\u05E8\u05D1\u05E2\u05D5\u05DF</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={form.quarter} onChange={e => setForm({ ...form, quarter: e.target.value })}>
                    {["Q1", "Q2", "Q3", "Q4"].map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">\u05E1\u05D8\u05D8\u05D5\u05E1</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">\u05E2\u05D3\u05D9\u05E4\u05D5\u05EA</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                    <option value="low">\u05E0\u05DE\u05D5\u05DA</option>
                    <option value="medium">\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9</option>
                    <option value="high">\u05D2\u05D1\u05D5\u05D4</option>
                    <option value="critical">\u05E7\u05E8\u05D9\u05D8\u05D9</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">\u05E0\u05D9\u05DE\u05D5\u05E7</label>
                <textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1" rows={3} value={form.justification} onChange={e => setForm({ ...form, justification: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">\u05D4\u05E2\u05E8\u05D5\u05EA</label>
                <textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
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
