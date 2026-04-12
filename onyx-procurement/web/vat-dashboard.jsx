import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════
// VAT DASHBOARD — ONYX Procurement
// Single-file React component (<VatDashboard />)
// Hebrew RTL, Palantir dark theme
// ═══════════════════════════════════════════

// Dynamic API base — mirrors onyx-dashboard.jsx conventions
const API = (() => {
  if (typeof window === "undefined") return "http://localhost:3100";
  if (import.meta?.env?.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (window.ONYX_API_URL) return window.ONYX_API_URL;
  const { protocol, host, hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:3100";
  return `${protocol}//${host}`;
})();

const API_KEY = (() => {
  if (typeof window === "undefined") return "";
  if (import.meta?.env?.VITE_API_KEY) return import.meta.env.VITE_API_KEY;
  return (typeof localStorage !== "undefined" && localStorage.getItem("onyx_api_key")) || "";
})();

// ═══ API Helper ═══
async function api(path, method = "GET", body = null) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (API_KEY) headers["X-API-Key"] = API_KEY;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    if (res.status === 401) return { error: "לא מאומת — חסר X-API-Key (Unauthenticated — missing X-API-Key)" };
    if (res.status === 429) return { error: "יותר מדי בקשות (Too many requests)" };
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

// Download binary/text file (for PCN836 export)
async function apiDownload(path, filename) {
  try {
    const headers = {};
    if (API_KEY) headers["X-API-Key"] = API_KEY;
    const res = await fetch(`${API}${path}`, { method: "GET", headers });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "pcn836.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

export default function VatDashboard() {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, pr, inv] = await Promise.all([
      api("/api/vat/profile"),
      api("/api/vat/periods"),
      api("/api/vat/invoices"),
    ]);
    setProfile(p && !p.error ? (p.profile || p) : null);
    const prList = pr?.periods || (Array.isArray(pr) ? pr : []);
    setPeriods(prList);
    // Derive submissions history from closed/submitted periods
    setSubmissions(prList.filter(x => x.status && x.status !== "open"));
    setInvoices(inv?.invoices || (Array.isArray(inv) ? inv : []));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); const i = setInterval(refresh, 60000); return () => clearInterval(i); }, [refresh]);

  const tabs = [
    { id: "profile", label: "פרופיל מע״מ", en: "Profile", icon: "🧾" },
    { id: "periods", label: "תקופות", en: "Periods", icon: "📅" },
    { id: "invoices", label: "חשבוניות", en: "Invoices", icon: "📄" },
    { id: "submissions", label: "הגשות", en: "Submissions", icon: "📤" },
  ];

  return (
    <div style={styles.app}>
      {toast && (
        <div style={{ ...styles.toast, background: toast.type === "error" ? "#dc2626" : "#059669" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>V</div>
          <div>
            <div style={styles.headerTitle}>ONYX · VAT</div>
            <div style={styles.headerSub}>ניהול מע״מ • VAT Management</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <span style={{ ...styles.statusDot, background: profile ? "#34d399" : "#f87171" }} />
          <span style={styles.statusText}>{profile ? "מחובר" : "לא מחובר"}</span>
          <button onClick={refresh} style={styles.refreshBtn}>🔄</button>
        </div>
      </header>

      {/* Tabs */}
      <nav style={styles.nav}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }}
          >
            <span>{t.icon}</span> {t.label} <span style={styles.tabEn}>({t.en})</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={styles.main}>
        {loading && <div style={styles.loading}>טוען... (Loading)</div>}

        {tab === "profile" && <ProfileTab profile={profile} onRefresh={refresh} showToast={showToast} />}
        {tab === "periods" && <PeriodsTab periods={periods} onRefresh={refresh} showToast={showToast} />}
        {tab === "invoices" && <InvoicesTab invoices={invoices} periods={periods} onRefresh={refresh} showToast={showToast} />}
        {tab === "submissions" && <SubmissionsTab submissions={submissions} />}
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
// PROFILE TAB — GET/PUT /api/vat/profile
// ═══════════════════════════════════════════

function ProfileTab({ profile, onRefresh, showToast }) {
  const [form, setForm] = useState({
    vat_file_number: "",
    tax_file_number: "",
    reporting_frequency: "monthly",
    accounting_method: "accrual",
    authorized_dealer: "regular",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        vat_file_number: profile.vat_file_number || "",
        tax_file_number: profile.tax_file_number || "",
        reporting_frequency: profile.reporting_frequency || "monthly",
        accounting_method: profile.accounting_method || "accrual",
        authorized_dealer: profile.authorized_dealer || "regular",
      });
    }
  }, [profile]);

  const save = async () => {
    setSaving(true);
    const res = await api("/api/vat/profile", "PUT", form);
    setSaving(false);
    if (res.error) return showToast(res.error, "error");
    showToast("✅ פרופיל נשמר (Profile saved)");
    onRefresh();
  };

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>🧾 פרופיל מע״מ <span style={styles.enTitle}>(VAT Profile)</span></h2>
      </div>

      <div style={styles.formCard}>
        <div style={styles.grid2}>
          <Input
            label='מס׳ תיק מע״מ (VAT File #)'
            value={form.vat_file_number}
            onChange={v => setForm({ ...form, vat_file_number: v })}
            placeholder="123456789"
          />
          <Input
            label="מס׳ תיק מס הכנסה (Tax File #)"
            value={form.tax_file_number}
            onChange={v => setForm({ ...form, tax_file_number: v })}
            placeholder="987654321"
          />
          <Select
            label="תדירות דיווח (Reporting Frequency)"
            value={form.reporting_frequency}
            onChange={v => setForm({ ...form, reporting_frequency: v })}
            options={[
              ["monthly", "חודשי (Monthly)"],
              ["bimonthly", "דו־חודשי (Bi-Monthly)"],
            ]}
          />
          <Select
            label="שיטת חשבונאות (Accounting Method)"
            value={form.accounting_method}
            onChange={v => setForm({ ...form, accounting_method: v })}
            options={[
              ["accrual", "מצטבר (Accrual)"],
              ["cash", "מזומן (Cash)"],
            ]}
          />
          <Select
            label="סוג עוסק (Authorized Dealer)"
            value={form.authorized_dealer}
            onChange={v => setForm({ ...form, authorized_dealer: v })}
            options={[
              ["regular", "עוסק מורשה (Regular)"],
              ["exempt", "עוסק פטור (Exempt)"],
              ["small", "עוסק זעיר (Small)"],
            ]}
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          style={{ ...styles.primaryBtn, marginTop: 16, width: "100%", fontSize: 15, padding: "12px 0" }}
        >
          {saving ? "שומר... (Saving)" : "💾 שמור (Save)"}
        </button>
      </div>

      {profile && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>מצב נוכחי (Current State)</h3>
          <div style={styles.grid2}>
            <MiniStat label="תיק מע״מ" value={profile.vat_file_number || "—"} />
            <MiniStat label="תדירות" value={profile.reporting_frequency || "—"} />
            <MiniStat label="שיטה" value={profile.accounting_method || "—"} />
            <MiniStat label="סוג עוסק" value={profile.authorized_dealer || "—"} />
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// PERIODS TAB
// ═══════════════════════════════════════════

function PeriodsTab({ periods, onRefresh, showToast }) {
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [confirmClose, setConfirmClose] = useState(null);

  const createPeriod = async () => {
    const res = await api("/api/vat/periods", "POST", {
      year: parseInt(newForm.year),
      month: parseInt(newForm.month),
    });
    if (res.error) return showToast(res.error, "error");
    showToast("✅ תקופה חדשה נוצרה (New period created)");
    setShowNew(false);
    onRefresh();
  };

  const closePeriod = async () => {
    if (!confirmClose) return;
    const res = await api(`/api/vat/periods/${confirmClose}/close`, "POST");
    setConfirmClose(null);
    if (res.error) return showToast(res.error, "error");
    showToast("✅ תקופה נסגרה (Period closed)");
    onRefresh();
  };

  const submitPeriod = async (id) => {
    const res = await api(`/api/vat/periods/${id}/submit`, "POST");
    if (res.error) return showToast(res.error, "error");
    showToast("✅ תקופה הוגשה (Period submitted)");
    onRefresh();
  };

  const downloadPcn836 = async (id, label) => {
    const res = await apiDownload(`/api/vat/periods/${id}/pcn836`, `pcn836_${label || id}.txt`);
    if (res.error) return showToast(res.error, "error");
    showToast("📥 קובץ PCN836 הורד (PCN836 downloaded)");
  };

  const statusColors = {
    open: "#f59e0b",
    closed: "#2563eb",
    submitted: "#059669",
    accepted: "#34d399",
    rejected: "#dc2626",
  };

  const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>
          📅 תקופות מע״מ <span style={styles.enTitle}>(VAT Periods)</span> · {periods.length}
        </h2>
        <button onClick={() => setShowNew(!showNew)} style={styles.primaryBtn}>
          {showNew ? "ביטול (Cancel)" : "+ תקופה חדשה (New period)"}
        </button>
      </div>

      {showNew && (
        <div style={styles.formCard}>
          <div style={styles.grid3}>
            <Select
              label="שנה (Year)"
              value={newForm.year}
              onChange={v => setNewForm({ ...newForm, year: v })}
              options={years.map(y => [String(y), String(y)])}
            />
            <Select
              label="חודש (Month)"
              value={newForm.month}
              onChange={v => setNewForm({ ...newForm, month: v })}
              options={Array.from({ length: 12 }, (_, i) => [String(i + 1), String(i + 1).padStart(2, "0")])}
            />
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button onClick={createPeriod} style={{ ...styles.primaryBtn, width: "100%" }}>
                צור (Create)
              </button>
            </div>
          </div>
        </div>
      )}

      {periods.map(p => {
        const label = p.label || `${p.year}-${String(p.month || "").padStart(2, "0")}`;
        const status = p.status || "open";
        return (
          <div key={p.id} style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={styles.listTitle}>{label}</div>
                <div style={styles.listSub}>
                  תחילה: {p.start_date || "—"} · סיום: {p.end_date || "—"}
                </div>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ ...styles.badge, background: statusColors[status] || "#71717a" }}>{status}</div>
                <div style={styles.listAmount}>
                  ₪{(p.total_vat || p.vat_due || 0).toLocaleString()}
                </div>
              </div>
            </div>
            <div style={{ ...styles.grid4Small, marginTop: 10 }}>
              <MiniStat label="מע״מ עסקאות" value={`₪${(p.output_vat || 0).toLocaleString()}`} />
              <MiniStat label="מע״מ תשומות" value={`₪${(p.input_vat || 0).toLocaleString()}`} />
              <MiniStat label="לתשלום" value={`₪${(p.vat_due || 0).toLocaleString()}`} />
              <MiniStat label="חשבוניות" value={p.invoice_count || 0} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {status === "open" && (
                <button onClick={() => setConfirmClose(p.id)} style={styles.smallBtn}>
                  🔒 סגור (Close)
                </button>
              )}
              {status === "closed" && (
                <button
                  onClick={() => submitPeriod(p.id)}
                  style={{ ...styles.smallBtn, background: "#2563eb" }}
                >
                  📤 הגש (Submit)
                </button>
              )}
              <button
                onClick={() => downloadPcn836(p.id, label)}
                style={{ ...styles.smallBtn, background: "#8b5cf6" }}
              >
                📥 הורד PCN836 (Download)
              </button>
            </div>
          </div>
        );
      })}

      {periods.length === 0 && <div style={styles.empty}>אין תקופות עדיין (No periods yet)</div>}

      {/* Confirm Close Dialog */}
      {confirmClose && (
        <div style={styles.modalOverlay} onClick={() => setConfirmClose(null)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <h3 style={{ ...styles.cardTitle, color: "#f59e0b" }}>
              ⚠️ אישור סגירת תקופה (Confirm Close Period)
            </h3>
            <p style={{ color: "#94a3b8", fontSize: 13, margin: "8px 0 16px" }}>
              לאחר סגירה לא ניתן יהיה להוסיף חשבוניות לתקופה זו.<br />
              <em>After closing, no more invoices can be added to this period.</em>
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmClose(null)} style={styles.secondaryBtn}>
                ביטול (Cancel)
              </button>
              <button onClick={closePeriod} style={{ ...styles.primaryBtn, background: "linear-gradient(135deg, #dc2626, #f59e0b)" }}>
                🔒 סגור (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// INVOICES TAB
// ═══════════════════════════════════════════

function InvoicesTab({ invoices, periods, onRefresh, showToast }) {
  const [filterDirection, setFilterDirection] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    direction: "input",
    period_id: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    vendor_id: "",
    vendor_name: "",
    net_amount: "",
    vat_amount: "",
    total_amount: "",
  });

  const add = async () => {
    if (!form.invoice_number || !form.net_amount) {
      return showToast("מס׳ חשבונית וסכום נטו חובה (Invoice # and net amount required)", "error");
    }
    const payload = {
      ...form,
      net_amount: parseFloat(form.net_amount),
      vat_amount: parseFloat(form.vat_amount || 0),
      total_amount: parseFloat(form.total_amount || form.net_amount) + parseFloat(form.vat_amount || 0),
    };
    const res = await api("/api/vat/invoices", "POST", payload);
    if (res.error) return showToast(res.error, "error");
    showToast("✅ חשבונית נוספה (Invoice added)");
    setShowAdd(false);
    setForm({
      direction: "input",
      period_id: "",
      invoice_number: "",
      invoice_date: new Date().toISOString().slice(0, 10),
      vendor_id: "",
      vendor_name: "",
      net_amount: "",
      vat_amount: "",
      total_amount: "",
    });
    onRefresh();
  };

  const filtered = invoices.filter(inv => {
    if (filterDirection !== "all" && inv.direction !== filterDirection) return false;
    if (filterPeriod !== "all" && String(inv.period_id) !== String(filterPeriod)) return false;
    return true;
  });

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>
          📄 חשבוניות <span style={styles.enTitle}>(Invoices)</span> · {filtered.length}
        </h2>
        <button onClick={() => setShowAdd(!showAdd)} style={styles.primaryBtn}>
          {showAdd ? "ביטול (Cancel)" : "+ חשבונית (Add invoice)"}
        </button>
      </div>

      {/* Filters */}
      <div style={styles.formCard}>
        <div style={styles.grid2}>
          <Select
            label="כיוון (Direction)"
            value={filterDirection}
            onChange={setFilterDirection}
            options={[
              ["all", "הכל (All)"],
              ["input", "תשומות (Input)"],
              ["output", "עסקאות (Output)"],
            ]}
          />
          <Select
            label="תקופה (Period)"
            value={filterPeriod}
            onChange={setFilterPeriod}
            options={[
              ["all", "הכל (All)"],
              ...(periods || []).map(p => [
                String(p.id),
                p.label || `${p.year}-${String(p.month || "").padStart(2, "0")}`,
              ]),
            ]}
          />
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={styles.formCard}>
          <h3 style={styles.cardTitle}>➕ חשבונית חדשה (New Invoice)</h3>
          <div style={styles.grid3}>
            <Select
              label="כיוון (Direction)"
              value={form.direction}
              onChange={v => setForm({ ...form, direction: v })}
              options={[
                ["input", "תשומות (Input)"],
                ["output", "עסקאות (Output)"],
              ]}
            />
            <Select
              label="תקופה (Period)"
              value={form.period_id}
              onChange={v => setForm({ ...form, period_id: v })}
              options={[
                ["", "— בחר (select) —"],
                ...(periods || []).map(p => [
                  String(p.id),
                  p.label || `${p.year}-${String(p.month || "").padStart(2, "0")}`,
                ]),
              ]}
            />
            <Input
              label="מס׳ חשבונית (Invoice #)"
              value={form.invoice_number}
              onChange={v => setForm({ ...form, invoice_number: v })}
            />
            <Input
              label="תאריך (Date)"
              type="date"
              value={form.invoice_date}
              onChange={v => setForm({ ...form, invoice_date: v })}
            />
            <Input
              label="שם ספק/לקוח (Vendor/Customer)"
              value={form.vendor_name}
              onChange={v => setForm({ ...form, vendor_name: v })}
            />
            <Input
              label='ח.פ / ע.מ (Tax ID)'
              value={form.vendor_id}
              onChange={v => setForm({ ...form, vendor_id: v })}
            />
            <Input
              label="סכום נטו (Net)"
              type="number"
              value={form.net_amount}
              onChange={v => setForm({ ...form, net_amount: v })}
            />
            <Input
              label="מע״מ (VAT)"
              type="number"
              value={form.vat_amount}
              onChange={v => setForm({ ...form, vat_amount: v })}
            />
            <Input
              label="סה״כ (Total)"
              type="number"
              value={form.total_amount}
              onChange={v => setForm({ ...form, total_amount: v })}
            />
          </div>
          <button onClick={add} style={{ ...styles.primaryBtn, marginTop: 12, width: "100%" }}>
            💾 שמור חשבונית (Save Invoice)
          </button>
        </div>
      )}

      {/* List */}
      {filtered.map(inv => (
        <div key={inv.id || inv.invoice_number} style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={styles.listTitle}>
                #{inv.invoice_number} · {inv.vendor_name || inv.customer_name || "—"}
              </div>
              <div style={styles.listSub}>
                {inv.invoice_date || "—"} · {inv.direction === "input" ? "תשומות (Input)" : "עסקאות (Output)"}
              </div>
            </div>
            <div style={{ textAlign: "left" }}>
              <div
                style={{
                  ...styles.badge,
                  background: inv.direction === "input" ? "#2563eb" : "#059669",
                }}
              >
                {inv.direction || "—"}
              </div>
              <div style={styles.listAmount}>
                ₪{(inv.total_amount || 0).toLocaleString()}
              </div>
              <div style={styles.listSub}>
                מע״מ: ₪{(inv.vat_amount || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div style={styles.empty}>אין חשבוניות (No invoices)</div>}
    </div>
  );
}

// ═══════════════════════════════════════════
// SUBMISSIONS TAB — historical
// ═══════════════════════════════════════════

function SubmissionsTab({ submissions }) {
  const statusColors = {
    closed: "#2563eb",
    submitted: "#059669",
    accepted: "#34d399",
    rejected: "#dc2626",
    pending: "#f59e0b",
  };
  const statusHe = {
    closed: "סגורה",
    submitted: "הוגשה",
    accepted: "התקבלה",
    rejected: "נדחתה",
    pending: "ממתינה",
  };

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>
          📤 הגשות היסטוריות <span style={styles.enTitle}>(Submissions History)</span> · {submissions.length}
        </h2>
      </div>

      {submissions.map(s => {
        const label = s.label || `${s.year}-${String(s.month || "").padStart(2, "0")}`;
        const status = s.status || "pending";
        return (
          <div key={s.id} style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={styles.listTitle}>{label}</div>
                <div style={styles.listSub}>
                  הוגש: {s.submitted_at ? new Date(s.submitted_at).toLocaleString("he-IL") : "—"}
                </div>
                {s.confirmation_number && (
                  <div style={styles.listSub}>אישור: {s.confirmation_number}</div>
                )}
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ ...styles.badge, background: statusColors[status] || "#71717a" }}>
                  {statusHe[status] || status} ({status})
                </div>
                <div style={styles.listAmount}>
                  ₪{(s.vat_due || s.total_vat || 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {submissions.length === 0 && (
        <div style={styles.empty}>אין הגשות עדיין (No submissions yet)</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════

function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div style={styles.fieldWrap}>
      {label && <label style={styles.label}>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={styles.input}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={styles.fieldWrap}>
      {label && <label style={styles.label}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} style={styles.input}>
        {options.map(([val, text]) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
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
// STYLES — mirrors onyx-dashboard.jsx palette
// ═══════════════════════════════════════════

const styles = {
  app: {
    minHeight: "100vh",
    background: "#0c0f1a",
    color: "#e2e8f0",
    fontFamily: "'Rubik', sans-serif",
    direction: "rtl",
  },

  // Header
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    background: "linear-gradient(180deg, #111827 0%, #0c0f1a 100%)",
    borderBottom: "1px solid #1e293b",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 12,
    background: "linear-gradient(135deg, #f59e0b, #ef4444)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 900,
    color: "#0c0f1a",
  },
  headerTitle: { fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "#f59e0b" },
  headerSub: { fontSize: 11, color: "#64748b" },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
  statusText: { fontSize: 12, color: "#94a3b8" },
  refreshBtn: {
    background: "none",
    border: "1px solid #1e293b",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 14,
    color: "#e2e8f0",
  },

  // Nav
  nav: {
    display: "flex",
    gap: 2,
    padding: "8px 16px",
    overflowX: "auto",
    background: "#0c0f1a",
    borderBottom: "1px solid #1e293b",
  },
  tab: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "#64748b",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "'Rubik', sans-serif",
  },
  tabActive: {
    background: "rgba(245,158,11,0.12)",
    color: "#f59e0b",
    borderBottom: "2px solid #f59e0b",
  },
  tabEn: { fontSize: 10, color: "#475569", fontWeight: 500 },

  // Main
  main: { padding: 16, maxWidth: 900, margin: "0 auto" },
  loading: { textAlign: "center", padding: 40, color: "#64748b" },

  // Cards
  card: {
    background: "rgba(30,41,59,0.4)",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  formCard: {
    background: "rgba(30,41,59,0.5)",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12 },

  // Grids
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  grid4Small: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 },

  // Lists
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid #1e293b15",
  },
  listTitle: { fontSize: 14, fontWeight: 600, color: "#e2e8f0" },
  listSub: { fontSize: 11, color: "#64748b" },
  listAmount: { fontSize: 15, fontWeight: 700, color: "#f59e0b" },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    color: "#fff",
    textTransform: "uppercase",
  },
  empty: { textAlign: "center", padding: 30, color: "#475569" },

  // Section
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    flexWrap: "wrap",
    gap: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: 800, color: "#e2e8f0" },
  enTitle: { fontSize: 12, color: "#64748b", fontWeight: 500 },

  // Mini stat
  miniStat: {
    background: "rgba(15,23,42,0.4)",
    borderRadius: 8,
    padding: "6px 10px",
    textAlign: "center",
  },
  miniStatLabel: { fontSize: 9, color: "#475569" },
  miniStatValue: { fontSize: 13, fontWeight: 700, color: "#e2e8f0" },

  // Forms
  fieldWrap: { marginBottom: 6 },
  label: { display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 },
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #1e293b",
    background: "#0f172a",
    color: "#e2e8f0",
    fontSize: 13,
    fontFamily: "'Rubik', sans-serif",
    outline: "none",
  },

  // Buttons
  primaryBtn: {
    padding: "10px 20px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #f59e0b, #ef4444)",
    color: "#0c0f1a",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
  },
  secondaryBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #1e293b",
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },
  smallBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "none",
    background: "#059669",
    color: "#fff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },

  // Toast
  toast: {
    position: "fixed",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 24px",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    zIndex: 9999,
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
  },

  // Modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    padding: 16,
  },
  modalCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: 20,
    maxWidth: 420,
    width: "100%",
    direction: "rtl",
  },
};
