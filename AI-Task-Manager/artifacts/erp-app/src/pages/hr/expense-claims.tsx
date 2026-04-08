import { useState, useEffect } from "react";
import {
  Receipt, Search, Plus, Edit2, Trash2, X, Save, DollarSign,
  Clock, CheckCircle2, AlertTriangle, Users, Download, Filter,
  Calendar, Send, Eye, TrendingUp, CreditCard, Car, Plane,
  Coffee, Hotel, Phone, Briefcase, ChevronLeft, ChevronRight,
  ArrowUpDown, FileText, XCircle
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

// 10 expense types
const expenseTypes = [
  { value: "travel", label: "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA", icon: Plane },
  { value: "accommodation", label: "\u05DC\u05D9\u05E0\u05D4", icon: Hotel },
  { value: "meals", label: "\u05D0\u05E8\u05D5\u05D7\u05D5\u05EA", icon: Coffee },
  { value: "transport", label: "\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4", icon: Car },
  { value: "fuel", label: "\u05D3\u05DC\u05E7", icon: Car },
  { value: "phone", label: "\u05D8\u05DC\u05E4\u05D5\u05DF", icon: Phone },
  { value: "office_supplies", label: "\u05E6\u05D9\u05D5\u05D3 \u05DE\u05E9\u05E8\u05D3\u05D9", icon: Briefcase },
  { value: "training", label: "\u05D4\u05DB\u05E9\u05E8\u05D4", icon: FileText },
  { value: "entertainment", label: "\u05D0\u05D9\u05E8\u05D5\u05D7", icon: Coffee },
  { value: "other", label: "\u05D0\u05D7\u05E8", icon: Receipt },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "\u05D8\u05D9\u05D5\u05D8\u05D4", color: "bg-gray-100 text-gray-800" },
  submitted: { label: "\u05D4\u05D5\u05D2\u05E9", color: "bg-blue-100 text-blue-800" },
  pending: { label: "\u05DE\u05DE\u05EA\u05D9\u05DF \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8", color: "bg-yellow-100 text-yellow-800" },
  approved: { label: "\u05DE\u05D0\u05D5\u05E9\u05E8", color: "bg-green-100 text-green-800" },
  rejected: { label: "\u05E0\u05D3\u05D7\u05D4", color: "bg-red-100 text-red-800" },
  paid: { label: "\u05E9\u05D5\u05DC\u05DD", color: "bg-emerald-100 text-emerald-800" },
};

const paymentMethods = [
  { value: "company_card", label: "\u05DB\u05E8\u05D8\u05D9\u05E1 \u05D7\u05D1\u05E8\u05D4" },
  { value: "personal_card", label: "\u05DB\u05E8\u05D8\u05D9\u05E1 \u05D0\u05D9\u05E9\u05D9" },
  { value: "cash", label: "\u05DE\u05D6\u05D5\u05DE\u05DF" },
  { value: "bank_transfer", label: "\u05D4\u05E2\u05D1\u05E8\u05D4 \u05D1\u05E0\u05E7\u05D0\u05D9\u05EA" },
  { value: "petty_cash", label: "\u05E7\u05D5\u05E4\u05D4 \u05E7\u05D8\u05E0\u05D4" },
];

export default function ExpenseClaimsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [viewItem, setViewItem] = useState<any>(null);

  const [form, setForm] = useState({
    employee_name: "", department: "", expense_type: "travel", amount: 0,
    expense_date: new Date().toISOString().slice(0, 10), description: "",
    receipt_number: "", project: "", cost_center: "", payment_method: "company_card",
    mileage_km: 0, notes: "", status: "draft",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const [listRes, statsRes] = await Promise.all([
        fetch(`${API}/hr-sap/expense_claims?${params}`, { headers: headers() }),
        fetch(`${API}/hr-sap/expense_claims/stats`, { headers: headers() }),
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
    const url = editItem ? `${API}/hr-sap/expense_claims/${editItem.id}` : `${API}/hr-sap/expense_claims`;
    await fetch(url, { method, headers: headers(), body: JSON.stringify(form) });
    setShowForm(false); setEditItem(null);
    resetForm();
    fetchData();
  };

  const resetForm = () => setForm({
    employee_name: "", department: "", expense_type: "travel", amount: 0,
    expense_date: new Date().toISOString().slice(0, 10), description: "",
    receipt_number: "", project: "", cost_center: "", payment_method: "company_card",
    mileage_km: 0, notes: "", status: "draft",
  });

  const handleDelete = async (id: number) => {
    if (!confirm("\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7?")) return;
    await fetch(`${API}/hr-sap/expense_claims/${id}`, { method: "DELETE", headers: headers() });
    fetchData();
  };

  const handleSubmit = async (id: number) => {
    await fetch(`${API}/hr-sap/expense_claims/${id}`, {
      method: "PUT", headers: headers(),
      body: JSON.stringify({ status: "submitted", submitted_at: new Date().toISOString() }),
    });
    fetchData();
  };

  const handleApprove = async (id: number) => {
    await fetch(`${API}/hr-sap/expense_claims/${id}`, {
      method: "PUT", headers: headers(),
      body: JSON.stringify({ status: "approved", approved_at: new Date().toISOString() }),
    });
    fetchData();
  };

  const handleReject = async (id: number) => {
    const reason = prompt("\u05E1\u05D9\u05D1\u05EA \u05D3\u05D7\u05D9\u05D9\u05D4:");
    if (!reason) return;
    await fetch(`${API}/hr-sap/expense_claims/${id}`, {
      method: "PUT", headers: headers(),
      body: JSON.stringify({ status: "rejected", rejection_reason: reason }),
    });
    fetchData();
  };

  const openEdit = (item: any) => { setEditItem(item); setForm({ ...item }); setShowForm(true); };

  const totalApproved = items.filter(i => i.status === "approved" || i.status === "paid").reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalPending = items.filter(i => i.status === "submitted" || i.status === "pending").reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">\u05D4\u05D7\u05D6\u05E8\u05D9 \u05D4\u05D5\u05E6\u05D0\u05D5\u05EA</h1>
          <p className="text-gray-500">\u05E0\u05D9\u05D4\u05D5\u05DC \u05D4\u05D7\u05D6\u05E8\u05D9 \u05D4\u05D5\u05E6\u05D0\u05D5\u05EA \u05D5\u05D0\u05D9\u05E9\u05D5\u05E8\u05D9\u05DD</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`${API}/hr-sap/expense_claims/export?format=csv`)}>
            <Download className="w-4 h-4 ml-1" />\u05D9\u05D9\u05E6\u05D5\u05D0
          </Button>
          <Button onClick={() => { setEditItem(null); resetForm(); setShowForm(true); }}>
            <Plus className="w-4 h-4 ml-1" />\u05D4\u05D7\u05D6\u05E8 \u05D7\u05D3\u05E9
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05E1\u05D4"\u05DB \u05D4\u05D7\u05D6\u05E8\u05D9\u05DD</p><p className="text-2xl font-bold">{fmt(stats.total)}</p></div>
            <Receipt className="w-8 h-8 text-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05DE\u05DE\u05EA\u05D9\u05E0\u05D9\u05DD \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8</p><p className="text-2xl font-bold text-yellow-600">{stats.byStatus?.find((s: any) => s.status === "submitted")?.count || 0}</p></div>
            <Clock className="w-8 h-8 text-yellow-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05DE\u05D0\u05D5\u05E9\u05E8\u05D9\u05DD</p><p className="text-2xl font-bold text-green-600">{fmtCurrency(totalApproved)}</p></div>
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05D1\u05D4\u05DE\u05EA\u05E0\u05D4</p><p className="text-2xl font-bold text-orange-600">{fmtCurrency(totalPending)}</p></div>
            <DollarSign className="w-8 h-8 text-orange-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05D7\u05D3\u05E9\u05D9\u05DD \u05D4\u05D7\u05D5\u05D3\u05E9</p><p className="text-2xl font-bold">{fmt(stats.recentCount)}</p></div>
            <TrendingUp className="w-8 h-8 text-purple-500" />
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
              {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
                  <th className="p-3 text-right">\u05DE\u05E1\u05E4\u05E8</th>
                  <th className="p-3 text-right">\u05E2\u05D5\u05D1\u05D3</th>
                  <th className="p-3 text-right">\u05E1\u05D5\u05D2</th>
                  <th className="p-3 text-right">\u05E1\u05DB\u05D5\u05DD</th>
                  <th className="p-3 text-right">\u05EA\u05D0\u05E8\u05D9\u05DA</th>
                  <th className="p-3 text-right">\u05EA\u05D9\u05D0\u05D5\u05E8</th>
                  <th className="p-3 text-right">\u05E1\u05D8\u05D8\u05D5\u05E1</th>
                  <th className="p-3 text-right">\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">\u05D8\u05D5\u05E2\u05DF...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05D4\u05D7\u05D6\u05E8\u05D9\u05DD</td></tr>
                ) : items.map(item => {
                  const typeInfo = expenseTypes.find(t => t.value === item.expense_type);
                  const sc = statusConfig[item.status] || statusConfig.draft;
                  return (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-gray-500">{item.claim_number || `#${item.id}`}</td>
                      <td className="p-3 font-medium">{item.employee_name}</td>
                      <td className="p-3"><Badge variant="outline">{typeInfo?.label || item.expense_type}</Badge></td>
                      <td className="p-3 font-medium">{fmtCurrency(item.amount)}</td>
                      <td className="p-3">{item.expense_date ? new Date(item.expense_date).toLocaleDateString("he-IL") : "-"}</td>
                      <td className="p-3 max-w-[150px] truncate">{item.description || "-"}</td>
                      <td className="p-3"><Badge className={sc.color}>{sc.label}</Badge></td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {item.status === "draft" && (
                            <Button variant="ghost" size="sm" title="\u05D4\u05D2\u05E9" onClick={() => handleSubmit(item.id)}><Send className="w-4 h-4 text-blue-500" /></Button>
                          )}
                          {(item.status === "submitted" || item.status === "pending") && (
                            <>
                              <Button variant="ghost" size="sm" title="\u05D0\u05E9\u05E8" onClick={() => handleApprove(item.id)}><CheckCircle2 className="w-4 h-4 text-green-500" /></Button>
                              <Button variant="ghost" size="sm" title="\u05D3\u05D7\u05D4" onClick={() => handleReject(item.id)}><XCircle className="w-4 h-4 text-red-500" /></Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit2 className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
                <CardTitle>{editItem ? "\u05E2\u05E8\u05D9\u05DB\u05EA \u05D4\u05D7\u05D6\u05E8" : "\u05D4\u05D7\u05D6\u05E8 \u05D7\u05D3\u05E9"}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditItem(null); }}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">\u05E9\u05DD \u05E2\u05D5\u05D1\u05D3 *</label><Input className="mt-1" value={form.employee_name} onChange={e => setForm({ ...form, employee_name: e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05DE\u05D7\u05DC\u05E7\u05D4</label><Input className="mt-1" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="text-sm font-medium">\u05E1\u05D5\u05D2 \u05D4\u05D5\u05E6\u05D0\u05D4 *</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={form.expense_type} onChange={e => setForm({ ...form, expense_type: e.target.value })}>
                    {expenseTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium">\u05E1\u05DB\u05D5\u05DD *</label><Input type="number" className="mt-1" value={form.amount} onChange={e => setForm({ ...form, amount: +e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05EA\u05D0\u05E8\u05D9\u05DA *</label><Input type="date" className="mt-1" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} /></div>
              </div>
              <div><label className="text-sm font-medium">\u05EA\u05D9\u05D0\u05D5\u05E8</label><textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="text-sm font-medium">\u05DE\u05E1\u05E4\u05E8 \u05E7\u05D1\u05DC\u05D4</label><Input className="mt-1" value={form.receipt_number} onChange={e => setForm({ ...form, receipt_number: e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05E4\u05E8\u05D5\u05D9\u05E7\u05D8</label><Input className="mt-1" value={form.project} onChange={e => setForm({ ...form, project: e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05DE\u05E8\u05DB\u05D6 \u05E2\u05DC\u05D5\u05EA</label><Input className="mt-1" value={form.cost_center} onChange={e => setForm({ ...form, cost_center: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">\u05D0\u05DE\u05E6\u05E2\u05D9 \u05EA\u05E9\u05DC\u05D5\u05DD</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                    {paymentMethods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium">\u05E7"\u05DE (\u05DC\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA)</label><Input type="number" className="mt-1" value={form.mileage_km} onChange={e => setForm({ ...form, mileage_km: +e.target.value })} /></div>
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
