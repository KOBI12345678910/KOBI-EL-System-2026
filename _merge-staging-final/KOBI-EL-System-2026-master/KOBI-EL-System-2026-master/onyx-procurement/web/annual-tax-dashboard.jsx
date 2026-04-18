import { useState, useEffect, useCallback } from "react";

// Dynamic API base — uses env var, then current host, falls back to localhost:3100
const API = (() => {
  if (typeof window === 'undefined') return 'http://localhost:3100';
  if (import.meta?.env?.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (window.ONYX_API_URL) return window.ONYX_API_URL;
  const { protocol, host, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3100';
  return `${protocol}//${host}`;
})();

const API_KEY = (() => {
  if (typeof window === 'undefined') return '';
  if (import.meta?.env?.VITE_API_KEY) return import.meta.env.VITE_API_KEY;
  return localStorage.getItem('onyx_api_key') || '';
})();

// ═══ API Helper ═══
async function api(path, method = "GET", body = null) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (API_KEY) headers["X-API-Key"] = API_KEY;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    if (res.status === 401) return { error: 'לא מאומת — חסר X-API-Key.' };
    if (res.status === 429) return { error: 'יותר מדי בקשות — חרגת ממגבלת הקצב.' };
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

const fmtMoney = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
const fmtPct = (n) => `${Number(n || 0).toFixed(2)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('he-IL') : '-';

// ═══ Main App ═══
export default function AnnualTaxDashboard() {
  const [tab, setTab] = useState("projects");
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [fiscalYears, setFiscalYears] = useState([]);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, c, i, pay, fy] = await Promise.all([
      api("/api/projects"),
      api("/api/customers"),
      api("/api/customer-invoices"),
      api("/api/customer-payments"),
      api("/api/fiscal-years"),
    ]);
    setProjects(p.projects || p || []);
    setCustomers(c.customers || c || []);
    setInvoices(i.invoices || i || []);
    setPayments(pay.payments || pay || []);
    setFiscalYears(fy.fiscal_years || fy || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const tabs = [
    { id: "projects", label: "פרויקטים", icon: "🏗️" },
    { id: "customers", label: "לקוחות", icon: "👥" },
    { id: "invoices", label: "חשבוניות", icon: "🧾" },
    { id: "payments", label: "תקבולים", icon: "💳" },
    { id: "fiscal", label: "שנת מס", icon: "📅" },
    { id: "forms", label: "טפסים", icon: "📄" },
  ];

  return (
    <div style={styles.app}>
      {toast && <div style={{ ...styles.toast, background: toast.type === "error" ? "#dc2626" : "#059669" }}>{toast.msg}</div>}

      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>מס</div>
          <div>
            <div style={styles.headerTitle}>ANNUAL TAX</div>
            <div style={styles.headerSub}>מערכת מס הכנסה שנתי • טכנו כל עוזי 2026</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.statusText}>מס חברות 23%</span>
          <button onClick={refresh} style={styles.refreshBtn}>🔄</button>
        </div>
      </header>

      <nav style={styles.nav}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {loading && <div style={styles.loading}>טוען...</div>}
        {tab === "projects" && <ProjectsTab projects={projects} customers={customers} onRefresh={refresh} showToast={showToast} />}
        {tab === "customers" && <CustomersTab customers={customers} onRefresh={refresh} showToast={showToast} />}
        {tab === "invoices" && <InvoicesTab invoices={invoices} customers={customers} onRefresh={refresh} showToast={showToast} />}
        {tab === "payments" && <PaymentsTab payments={payments} invoices={invoices} onRefresh={refresh} showToast={showToast} />}
        {tab === "fiscal" && <FiscalYearTab fiscalYears={fiscalYears} onRefresh={refresh} showToast={showToast} />}
        {tab === "forms" && <FormsTab forms={forms} setForms={setForms} showToast={showToast} />}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0c0f1a; }
        input, select, textarea, button { font-family: 'Rubik', sans-serif; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════
// PROJECTS TAB — CRUD
// ═══════════════════════════════════════════

function ProjectsTab({ projects, customers, onRefresh, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    project_code: "", client_id: "", contract_value: "",
    completion_percent: "0", fiscal_year: "2026", revenue_recognition: "percentage_of_completion"
  });

  const resetForm = () => {
    setForm({ project_code: "", client_id: "", contract_value: "", completion_percent: "0", fiscal_year: "2026", revenue_recognition: "percentage_of_completion" });
    setEditing(null);
    setShowForm(false);
  };

  const save = async () => {
    if (!form.project_code || !form.client_id) {
      showToast("חובה קוד פרויקט ולקוח", "error");
      return;
    }
    const body = {
      project_code: form.project_code,
      client_id: form.client_id,
      contract_value: Number(form.contract_value) || 0,
      completion_percent: Number(form.completion_percent) || 0,
      fiscal_year: Number(form.fiscal_year) || 2026,
      revenue_recognition: form.revenue_recognition,
    };
    const res = editing
      ? await api(`/api/projects/${editing}`, "PUT", body)
      : await api("/api/projects", "POST", body);
    if (res.error) { showToast(res.error, "error"); return; }
    showToast(editing ? "פרויקט עודכן" : "פרויקט נוצר");
    resetForm();
    onRefresh();
  };

  const edit = (p) => {
    setEditing(p.id);
    setForm({
      project_code: p.project_code || "",
      client_id: String(p.client_id || ""),
      contract_value: String(p.contract_value || ""),
      completion_percent: String(p.completion_percent || "0"),
      fiscal_year: String(p.fiscal_year || "2026"),
      revenue_recognition: p.revenue_recognition || "percentage_of_completion",
    });
    setShowForm(true);
  };

  const remove = async (id) => {
    if (!confirm("למחוק פרויקט?")) return;
    const res = await api(`/api/projects/${id}`, "DELETE");
    if (res.error) { showToast(res.error, "error"); return; }
    showToast("פרויקט נמחק");
    onRefresh();
  };

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>🏗️ פרויקטים ({projects.length})</h2>
        <button style={styles.primaryBtn} onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? "✕ סגור" : "+ פרויקט חדש"}
        </button>
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.cardTitle}>{editing ? "עריכת פרויקט" : "פרויקט חדש"}</h3>
          <div style={styles.grid2}>
            <Input label="קוד פרויקט" value={form.project_code} onChange={v => setForm({ ...form, project_code: v })} />
            <Select label="לקוח" value={form.client_id} onChange={v => setForm({ ...form, client_id: v })}
              options={[["", "— בחר —"], ...customers.map(c => [String(c.id), c.name || c.tax_id])]} />
            <Input label="סכום חוזה (₪)" type="number" value={form.contract_value} onChange={v => setForm({ ...form, contract_value: v })} />
            <Input label="% השלמה" type="number" value={form.completion_percent} onChange={v => setForm({ ...form, completion_percent: v })} />
            <Input label="שנת מס" type="number" value={form.fiscal_year} onChange={v => setForm({ ...form, fiscal_year: v })} />
            <Select label="הכרה בהכנסה" value={form.revenue_recognition} onChange={v => setForm({ ...form, revenue_recognition: v })}
              options={[
                ["percentage_of_completion", "אחוז ביצוע"],
                ["completed_contract", "חוזה מושלם"],
                ["accrual", "מצטבר"],
              ]} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={styles.primaryBtn} onClick={save}>💾 שמור</button>
            <button style={styles.secondaryBtn} onClick={resetForm}>ביטול</button>
          </div>
        </div>
      )}

      {projects.length === 0 && !showForm && <div style={styles.empty}>אין פרויקטים עדיין</div>}

      {projects.map(p => {
        const client = customers.find(c => String(c.id) === String(p.client_id));
        return (
          <div key={p.id} style={styles.supplierCard}>
            <div style={styles.supplierHeader}>
              <div>
                <div style={styles.supplierName}>{p.project_code}</div>
                <div style={styles.supplierSub}>{client?.name || `לקוח #${p.client_id}`} • שנת מס {p.fiscal_year}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={styles.smallBtn} onClick={() => edit(p)}>✏️</button>
                <button style={styles.removeBtn} onClick={() => remove(p.id)}>🗑️</button>
              </div>
            </div>
            <div style={styles.grid4Small}>
              <MiniStat label="חוזה" value={fmtMoney(p.contract_value)} />
              <MiniStat label="השלמה" value={fmtPct(p.completion_percent)} />
              <MiniStat label="הכרה" value={p.revenue_recognition === "percentage_of_completion" ? "אחוז ביצוע" : p.revenue_recognition || "-"} />
              <MiniStat label="מזוהה" value={fmtMoney((p.contract_value || 0) * (p.completion_percent || 0) / 100)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════
// CUSTOMERS TAB — CRUD
// ═══════════════════════════════════════════

function CustomersTab({ customers, onRefresh, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", tax_id: "", tax_id_type: "company", is_related_party: false });

  const resetForm = () => {
    setForm({ name: "", tax_id: "", tax_id_type: "company", is_related_party: false });
    setEditing(null);
    setShowForm(false);
  };

  const save = async () => {
    if (!form.name || !form.tax_id) { showToast("חובה שם ומזהה מס", "error"); return; }
    const res = editing
      ? await api(`/api/customers/${editing}`, "PUT", form)
      : await api("/api/customers", "POST", form);
    if (res.error) { showToast(res.error, "error"); return; }
    showToast(editing ? "לקוח עודכן" : "לקוח נוצר");
    resetForm();
    onRefresh();
  };

  const edit = (c) => {
    setEditing(c.id);
    setForm({
      name: c.name || "",
      tax_id: c.tax_id || "",
      tax_id_type: c.tax_id_type || "company",
      is_related_party: !!c.is_related_party,
    });
    setShowForm(true);
  };

  const remove = async (id) => {
    if (!confirm("למחוק לקוח?")) return;
    const res = await api(`/api/customers/${id}`, "DELETE");
    if (res.error) { showToast(res.error, "error"); return; }
    showToast("לקוח נמחק");
    onRefresh();
  };

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>👥 לקוחות ({customers.length})</h2>
        <button style={styles.primaryBtn} onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? "✕ סגור" : "+ לקוח חדש"}
        </button>
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.cardTitle}>{editing ? "עריכת לקוח" : "לקוח חדש"}</h3>
          <div style={styles.grid2}>
            <Input label="שם" value={form.name} onChange={v => setForm({ ...form, name: v })} />
            <Input label="מזהה מס" value={form.tax_id} onChange={v => setForm({ ...form, tax_id: v })} />
            <Select label="סוג מזהה" value={form.tax_id_type} onChange={v => setForm({ ...form, tax_id_type: v })}
              options={[
                ["company", "ח.פ. חברה"],
                ["individual", "ת.ז. יחיד"],
                ["partnership", "שותפות"],
                ["nonprofit", "עמותה"],
              ]} />
            <div style={styles.fieldWrap}>
              <label style={styles.label}>צד קשור</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.is_related_party} onChange={e => setForm({ ...form, is_related_party: e.target.checked })} />
                <span style={{ fontSize: 13, color: "#e2e8f0" }}>לקוח קשור (Related Party)</span>
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={styles.primaryBtn} onClick={save}>💾 שמור</button>
            <button style={styles.secondaryBtn} onClick={resetForm}>ביטול</button>
          </div>
        </div>
      )}

      {customers.length === 0 && !showForm && <div style={styles.empty}>אין לקוחות עדיין</div>}

      {customers.map(c => (
        <div key={c.id} style={styles.supplierCard}>
          <div style={styles.supplierHeader}>
            <div>
              <div style={styles.supplierName}>
                {c.name}
                {c.is_related_party && <span style={{ ...styles.badge, background: "#a78bfa", marginRight: 8 }}>צד קשור</span>}
              </div>
              <div style={styles.supplierSub}>{c.tax_id_type === "individual" ? "ת.ז." : "ח.פ."} {c.tax_id}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={styles.smallBtn} onClick={() => edit(c)}>✏️</button>
              <button style={styles.removeBtn} onClick={() => remove(c.id)}>🗑️</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// INVOICES TAB
// ═══════════════════════════════════════════

function InvoicesTab({ invoices, customers, onRefresh, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    invoice_number: "", customer_id: "", amount: "", vat: "",
    allocation_number: "", invoice_date: new Date().toISOString().slice(0, 10), status: "issued"
  });

  const resetForm = () => {
    setForm({ invoice_number: "", customer_id: "", amount: "", vat: "", allocation_number: "", invoice_date: new Date().toISOString().slice(0, 10), status: "issued" });
    setShowForm(false);
  };

  const save = async () => {
    if (!form.invoice_number || !form.customer_id) { showToast("חובה מספר חשבונית ולקוח", "error"); return; }
    const res = await api("/api/customer-invoices", "POST", {
      ...form,
      amount: Number(form.amount) || 0,
      vat: Number(form.vat) || 0,
    });
    if (res.error) { showToast(res.error, "error"); return; }
    showToast("חשבונית נוצרה");
    resetForm();
    onRefresh();
  };

  const statusColors = { issued: "#2563eb", paid: "#059669", partial: "#f59e0b", cancelled: "#dc2626", draft: "#71717a" };
  const statusLabels = { issued: "הוצאה", paid: "שולמה", partial: "חלקית", cancelled: "בוטלה", draft: "טיוטה" };

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>🧾 חשבוניות ({invoices.length})</h2>
        <button style={styles.primaryBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ סגור" : "+ חשבונית חדשה"}
        </button>
      </div>

      <div style={styles.card}>
        <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: "#a78bfa", color: "#0c0f1a", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>Invoice Reform 2024</span>
          <span>כל חשבונית דורשת Allocation Number (מספר הקצאה) ממס הכנסה</span>
        </div>
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.cardTitle}>חשבונית חדשה</h3>
          <div style={styles.grid2}>
            <Input label="מספר חשבונית" value={form.invoice_number} onChange={v => setForm({ ...form, invoice_number: v })} />
            <Select label="לקוח" value={form.customer_id} onChange={v => setForm({ ...form, customer_id: v })}
              options={[["", "— בחר —"], ...customers.map(c => [String(c.id), c.name])]} />
            <Input label="סכום (₪)" type="number" value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
            <Input label="מע״מ (₪)" type="number" value={form.vat} onChange={v => setForm({ ...form, vat: v })} />
            <Input label="מספר הקצאה (Allocation)" value={form.allocation_number} onChange={v => setForm({ ...form, allocation_number: v })} placeholder="Invoice Reform 2024" />
            <Input label="תאריך" type="date" value={form.invoice_date} onChange={v => setForm({ ...form, invoice_date: v })} />
            <Select label="סטטוס" value={form.status} onChange={v => setForm({ ...form, status: v })}
              options={[
                ["draft", "טיוטה"],
                ["issued", "הוצאה"],
                ["paid", "שולמה"],
                ["partial", "חלקית"],
                ["cancelled", "בוטלה"],
              ]} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={styles.primaryBtn} onClick={save}>💾 שמור</button>
            <button style={styles.secondaryBtn} onClick={resetForm}>ביטול</button>
          </div>
        </div>
      )}

      {invoices.length === 0 && <div style={styles.empty}>אין חשבוניות עדיין</div>}

      {invoices.map(inv => {
        const cust = customers.find(c => String(c.id) === String(inv.customer_id));
        return (
          <div key={inv.id} style={styles.supplierCard}>
            <div style={styles.supplierHeader}>
              <div>
                <div style={styles.supplierName}>חשבונית #{inv.invoice_number}</div>
                <div style={styles.supplierSub}>
                  {cust?.name || `לקוח #${inv.customer_id}`} • {fmtDate(inv.invoice_date)}
                  {inv.allocation_number && <> • 🔖 הקצאה: {inv.allocation_number}</>}
                </div>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ ...styles.badge, background: statusColors[inv.status] || "#71717a" }}>
                  {statusLabels[inv.status] || inv.status}
                </div>
                <div style={styles.listAmount}>{fmtMoney(inv.amount)}</div>
                {inv.vat > 0 && <div style={{ fontSize: 10, color: "#64748b" }}>מע״מ: {fmtMoney(inv.vat)}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════
// PAYMENTS TAB
// ═══════════════════════════════════════════

function PaymentsTab({ payments, invoices, onRefresh, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ invoice_id: "", amount: "", payment_date: new Date().toISOString().slice(0, 10), method: "bank_transfer", reference: "" });

  const resetForm = () => {
    setForm({ invoice_id: "", amount: "", payment_date: new Date().toISOString().slice(0, 10), method: "bank_transfer", reference: "" });
    setShowForm(false);
  };

  const save = async () => {
    if (!form.invoice_id || !form.amount) { showToast("חובה חשבונית וסכום", "error"); return; }
    const res = await api("/api/customer-payments", "POST", { ...form, amount: Number(form.amount) });
    if (res.error) { showToast(res.error, "error"); return; }
    showToast("תקבול נרשם");
    resetForm();
    onRefresh();
  };

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>💳 תקבולים ({payments.length})</h2>
        <button style={styles.primaryBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ סגור" : "+ תקבול חדש"}
        </button>
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.cardTitle}>תקבול חדש</h3>
          <div style={styles.grid2}>
            <Select label="חשבונית" value={form.invoice_id} onChange={v => setForm({ ...form, invoice_id: v })}
              options={[["", "— בחר —"], ...invoices.map(i => [String(i.id), `#${i.invoice_number} — ${fmtMoney(i.amount)}`])]} />
            <Input label="סכום (₪)" type="number" value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
            <Input label="תאריך" type="date" value={form.payment_date} onChange={v => setForm({ ...form, payment_date: v })} />
            <Select label="אמצעי" value={form.method} onChange={v => setForm({ ...form, method: v })}
              options={[
                ["bank_transfer", "העברה בנקאית"],
                ["check", "צ׳ק"],
                ["cash", "מזומן"],
                ["credit_card", "כרטיס אשראי"],
              ]} />
            <Input label="אסמכתא" value={form.reference} onChange={v => setForm({ ...form, reference: v })} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={styles.primaryBtn} onClick={save}>💾 שמור</button>
            <button style={styles.secondaryBtn} onClick={resetForm}>ביטול</button>
          </div>
        </div>
      )}

      {payments.length === 0 && <div style={styles.empty}>אין תקבולים עדיין</div>}

      {payments.map(p => {
        const inv = invoices.find(i => String(i.id) === String(p.invoice_id));
        const reconciled = !!p.reconciled;
        return (
          <div key={p.id} style={styles.listItem}>
            <div>
              <div style={styles.listTitle}>
                {reconciled ? "✅" : "⏳"} {inv ? `חשבונית #${inv.invoice_number}` : `תקבול #${p.id}`}
              </div>
              <div style={styles.listSub}>
                {fmtDate(p.payment_date)} • {p.method || "-"} {p.reference ? `• ${p.reference}` : ""}
                {reconciled ? " • הותאם" : " • ממתין להתאמה"}
              </div>
            </div>
            <div style={styles.listAmount}>{fmtMoney(p.amount)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════
// FISCAL YEAR TAB
// ═══════════════════════════════════════════

function FiscalYearTab({ fiscalYears, onRefresh, showToast }) {
  const [year, setYear] = useState("2026");
  const [computing, setComputing] = useState(false);
  const [result, setResult] = useState(null);

  const compute = async () => {
    setComputing(true);
    setResult(null);
    const res = await api(`/api/fiscal-years/${year}/compute`, "POST");
    setComputing(false);
    if (res.error) { showToast(res.error, "error"); return; }
    setResult(res);
    showToast(`חושב לשנת ${year}`);
    onRefresh();
  };

  const TAX_RATE = 0.23;
  const totals = result || {};
  const revenue = totals.revenue || totals.total_revenue || 0;
  const cogs = totals.cogs || totals.cost_of_goods_sold || 0;
  const grossProfit = totals.gross_profit != null ? totals.gross_profit : revenue - cogs;
  const opex = totals.operating_expenses || totals.opex || 0;
  const netBeforeTax = totals.net_profit_before_tax != null ? totals.net_profit_before_tax : grossProfit - opex;
  const tax = totals.income_tax != null ? totals.income_tax : Math.max(0, netBeforeTax * TAX_RATE);
  const netAfterTax = totals.net_profit_after_tax != null ? totals.net_profit_after_tax : netBeforeTax - tax;

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>📅 שנת מס</h2>
      </div>

      <div style={styles.formCard}>
        <h3 style={styles.cardTitle}>חישוב שנת מס</h3>
        <div style={styles.grid2}>
          <Input label="שנה" type="number" value={year} onChange={setYear} />
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button style={styles.primaryBtn} onClick={compute} disabled={computing}>
              {computing ? "⏳ מחשב..." : "🧮 Compute"}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>💼 דוח רווח והפסד — שנת {year}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>הכנסות (Revenue)</div>
              <div style={styles.statValue}>{fmtMoney(revenue)}</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>עלות המכר (COGS)</div>
              <div style={{ ...styles.statValue, color: "#f87171" }}>{fmtMoney(cogs)}</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>רווח גולמי</div>
              <div style={{ ...styles.statValue, color: "#34d399" }}>{fmtMoney(grossProfit)}</div>
              <div style={styles.statSub}>{revenue > 0 ? fmtPct((grossProfit / revenue) * 100) : "-"}</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>רווח לפני מס</div>
              <div style={styles.statValue}>{fmtMoney(netBeforeTax)}</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>מס חברות (23%)</div>
              <div style={{ ...styles.statValue, color: "#f87171" }}>{fmtMoney(tax)}</div>
            </div>
            <div style={{ ...styles.statBox, background: "rgba(5,150,105,0.15)", border: "1px solid #059669" }}>
              <div style={styles.statLabel}>רווח נקי אחרי מס</div>
              <div style={{ ...styles.statValue, color: "#34d399" }}>{fmtMoney(netAfterTax)}</div>
            </div>
          </div>
        </div>
      )}

      {fiscalYears.length > 0 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>📚 שנות מס קודמות</h3>
          {fiscalYears.map(fy => (
            <div key={fy.id || fy.year} style={styles.listItem}>
              <div>
                <div style={styles.listTitle}>שנת {fy.year}</div>
                <div style={styles.listSub}>סטטוס: {fy.status || "פתוחה"}</div>
              </div>
              <div style={styles.listAmount}>{fmtMoney(fy.net_profit_after_tax || fy.net_profit || 0)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// FORMS TAB
// ═══════════════════════════════════════════

function FormsTab({ forms, setForms, showToast }) {
  const [year, setYear] = useState("2026");
  const [generating, setGenerating] = useState(null);

  const formTypes = [
    { id: "1301", label: "טופס 1301", desc: "דוח שנתי ליחיד (Individual)", color: "#38bdf8", icon: "👤" },
    { id: "1320", label: "טופס 1320", desc: "דוח שנתי לחברה (Company)", color: "#f59e0b", icon: "🏢" },
    { id: "6111", label: "טופס 6111", desc: "דוח מס על דוחות כספיים (Financial Statement)", color: "#a78bfa", icon: "📊" },
    { id: "30a", label: "טופס 30א", desc: "דוח יצרן (Manufacturer)", color: "#34d399", icon: "🏭" },
  ];

  const generate = async (type) => {
    setGenerating(type);
    const res = await api(`/api/annual-tax/${year}/forms/${type}/generate`, "POST");
    setGenerating(null);
    if (res.error) { showToast(res.error, "error"); return; }
    const report = {
      id: res.id || `${type}-${year}-${Date.now()}`,
      type, year,
      generated_at: res.generated_at || new Date().toISOString(),
      download_url: res.download_url || res.url || res.file_path || `#${type}-${year}`,
      status: res.status || "generated",
    };
    setForms(prev => [report, ...prev]);
    showToast(`טופס ${type} נוצר בהצלחה לשנת ${year}`);
  };

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>📄 טפסי מס הכנסה</h2>
      </div>

      <div style={styles.formCard}>
        <h3 style={styles.cardTitle}>שנת מס לטפסים</h3>
        <Input label="שנה" type="number" value={year} onChange={setYear} />
      </div>

      <div style={styles.grid2}>
        {formTypes.map(ft => (
          <div key={ft.id} style={styles.supplierCard}>
            <div style={styles.supplierHeader}>
              <div>
                <div style={styles.supplierName}>{ft.icon} {ft.label}</div>
                <div style={styles.supplierSub}>{ft.desc}</div>
              </div>
            </div>
            <button
              style={{ ...styles.primaryBtn, width: "100%", marginTop: 8, background: `linear-gradient(135deg, ${ft.color}, ${ft.color}dd)` }}
              onClick={() => generate(ft.id)}
              disabled={generating === ft.id}
            >
              {generating === ft.id ? "⏳ מייצר..." : `🚀 הפק ${ft.label}`}
            </button>
          </div>
        ))}
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>📥 טפסים שהופקו ({forms.length})</h3>
        {forms.length === 0 && <div style={styles.empty}>עדיין לא הופקו טפסים</div>}
        {forms.map(f => (
          <div key={f.id} style={styles.listItem}>
            <div>
              <div style={styles.listTitle}>טופס {f.type} — שנת {f.year}</div>
              <div style={styles.listSub}>הופק: {fmtDate(f.generated_at)} • סטטוס: {f.status}</div>
            </div>
            <a href={f.download_url} download style={{ ...styles.smallBtn, textDecoration: "none", display: "inline-block" }}>
              ⬇️ הורד
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════

function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div style={styles.fieldWrap}>
      {label && <label style={styles.label}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={styles.input} />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={styles.fieldWrap}>
      {label && <label style={styles.label}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} style={styles.input}>
        {options.map(([val, text]) => <option key={val} value={val}>{text}</option>)}
      </select>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={styles.miniStat}>
      <div style={styles.miniStatLabel}>{label}</div>
      <div style={styles.miniStatValue}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════
// STYLES — Palantir dark, Hebrew RTL
// ═══════════════════════════════════════════

const styles = {
  app: { minHeight: "100vh", background: "#0c0f1a", color: "#e2e8f0", fontFamily: "'Rubik', sans-serif", direction: "rtl" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "linear-gradient(180deg, #111827 0%, #0c0f1a 100%)", borderBottom: "1px solid #1e293b" },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logo: { width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, #38bdf8, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#0c0f1a" },
  headerTitle: { fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "#38bdf8" },
  headerSub: { fontSize: 11, color: "#64748b" },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  statusText: { fontSize: 12, color: "#94a3b8", padding: "4px 10px", background: "rgba(56,189,248,0.1)", borderRadius: 6, border: "1px solid #1e293b" },
  refreshBtn: { background: "none", border: "1px solid #1e293b", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 14 },

  nav: { display: "flex", gap: 2, padding: "8px 16px", overflowX: "auto", background: "#0c0f1a", borderBottom: "1px solid #1e293b" },
  tab: { padding: "8px 14px", borderRadius: 8, border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Rubik', sans-serif" },
  tabActive: { background: "rgba(56,189,248,0.12)", color: "#38bdf8", borderBottom: "2px solid #38bdf8" },

  main: { padding: 16, maxWidth: 1000, margin: "0 auto" },
  loading: { textAlign: "center", padding: 40, color: "#64748b" },

  card: { background: "rgba(30,41,59,0.4)", border: "1px solid #1e293b", borderRadius: 14, padding: 16, marginBottom: 14 },
  formCard: { background: "rgba(30,41,59,0.5)", border: "1px solid #1e293b", borderRadius: 14, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12 },

  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  grid4Small: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 },

  statBox: { background: "rgba(15,23,42,0.5)", borderRadius: 10, padding: 12, textAlign: "center" },
  statLabel: { fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: 800, color: "#38bdf8", marginTop: 4 },
  statSub: { fontSize: 11, color: "#475569", marginTop: 2 },

  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1e293b50" },
  listTitle: { fontSize: 14, fontWeight: 600, color: "#e2e8f0" },
  listSub: { fontSize: 11, color: "#64748b" },
  listAmount: { fontSize: 15, fontWeight: 700, color: "#38bdf8" },
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase" },
  empty: { textAlign: "center", padding: 30, color: "#475569" },

  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: 800, color: "#e2e8f0" },
  supplierCard: { background: "rgba(30,41,59,0.4)", border: "1px solid #1e293b", borderRadius: 14, padding: 16, marginBottom: 10 },
  supplierHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  supplierName: { fontSize: 16, fontWeight: 700, color: "#e2e8f0" },
  supplierSub: { fontSize: 12, color: "#64748b" },
  miniStat: { background: "rgba(15,23,42,0.4)", borderRadius: 8, padding: "6px 10px", textAlign: "center" },
  miniStatLabel: { fontSize: 9, color: "#475569" },
  miniStatValue: { fontSize: 13, fontWeight: 700, color: "#e2e8f0" },

  fieldWrap: { marginBottom: 6 },
  label: { display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 },
  input: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #1e293b", background: "#0f172a", color: "#e2e8f0", fontSize: 13, fontFamily: "'Rubik', sans-serif", outline: "none" },

  primaryBtn: { padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #38bdf8, #a78bfa)", color: "#0c0f1a", cursor: "pointer", fontSize: 13, fontWeight: 700 },
  secondaryBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  smallBtn: { padding: "6px 14px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  removeBtn: { padding: "6px 10px", borderRadius: 6, border: "1px solid #dc262630", background: "transparent", color: "#dc2626", cursor: "pointer", fontSize: 14 },

  toast: { position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", padding: "10px 24px", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)" },
};
