import { useState, useEffect, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════
// BANK RECONCILIATION DASHBOARD
// Palantir dark theme — Hebrew RTL
// Sibling of onyx-dashboard.jsx, consumes /api/bank/*
// ═══════════════════════════════════════════

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
  return localStorage.getItem("onyx_api_key") || "";
})();

async function api(path, method = "GET", body = null) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (API_KEY) headers["X-API-Key"] = API_KEY;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    if (res.status === 401) return { error: "לא מאומת — חסר X-API-Key" };
    if (res.status === 429) return { error: "יותר מדי בקשות — חרגת ממגבלת הקצב" };
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ═══ Helpers ═══
const fmtMoney = (n) => `₪${Number(n || 0).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("he-IL") : "—");
const severityColor = (s) => ({
  critical: "#dc2626",
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#64748b",
  info: "#38bdf8",
}[s] || "#64748b");
const severityLabel = (s) => ({
  critical: "קריטי",
  high: "גבוה",
  medium: "בינוני",
  low: "נמוך",
  info: "מידע",
}[s] || s || "—");

// ═══ Main App ═══
export default function BankDashboard() {
  const [tab, setTab] = useState("overview");
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [matches, setMatches] = useState([]);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const [a, t, m, d, s] = await Promise.all([
      api("/api/bank/accounts"),
      api("/api/bank/transactions"),
      api("/api/bank/matches"),
      api("/api/bank/discrepancies"),
      api("/api/bank/summary"),
    ]);
    setAccounts(a?.accounts || []);
    setTransactions(t?.transactions || []);
    setMatches(m?.matches || []);
    setDiscrepancies(d?.discrepancies || []);
    setSummary(s || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 30000);
    return () => clearInterval(i);
  }, [refresh]);

  const tabs = [
    { id: "overview", label: "סקירה", icon: "📊" },
    { id: "accounts", label: "חשבונות", icon: "🏦" },
    { id: "transactions", label: "תנועות", icon: "📋" },
    { id: "reconcile", label: "התאמות", icon: "🔗" },
    { id: "discrepancies", label: "אי התאמות", icon: "⚠️" },
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
          <div style={styles.logo}>₪</div>
          <div>
            <div style={styles.headerTitle}>BANK OPS</div>
            <div style={styles.headerSub}>התאמות בנקאיות • טכנו כל עוזי</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <span style={{ ...styles.statusDot, background: "#34d399" }} />
          <span style={styles.statusText}>{accounts.length} חשבונות פעילים</span>
          <button onClick={refresh} style={styles.refreshBtn}>🔄</button>
        </div>
      </header>

      {/* Tabs */}
      <nav style={styles.nav}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={styles.main}>
        {loading && <div style={styles.loading}>טוען...</div>}
        {tab === "overview" && (
          <OverviewTab summary={summary} transactions={transactions} discrepancies={discrepancies} accounts={accounts} />
        )}
        {tab === "accounts" && (
          <AccountsTab accounts={accounts} onRefresh={refresh} showToast={showToast} />
        )}
        {tab === "transactions" && (
          <TransactionsTab
            accounts={accounts}
            transactions={transactions}
            onRefresh={refresh}
            showToast={showToast}
          />
        )}
        {tab === "reconcile" && (
          <ReconcileTab
            accounts={accounts}
            matches={matches}
            onRefresh={refresh}
            showToast={showToast}
          />
        )}
        {tab === "discrepancies" && <DiscrepanciesTab discrepancies={discrepancies} />}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0c0f1a; }
        input, select, textarea, button { font-family: 'Rubik', sans-serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
        @keyframes fadeIn { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════

function OverviewTab({ summary, transactions, discrepancies, accounts }) {
  const unreconciledTxs = transactions.filter((t) => !t.reconciled && !t.matched);
  const unreconciledCount = summary?.unreconciled_count ?? unreconciledTxs.length;
  const unreconciledTotal =
    summary?.unreconciled_total ??
    unreconciledTxs.reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
  const openDiscrepancies = summary?.open_discrepancies ?? discrepancies.filter((d) => d.status !== "resolved").length;
  const totalBalance =
    summary?.total_balance ??
    accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);

  return (
    <div>
      <div style={styles.grid4}>
        <KPI icon="🏦" label="חשבונות פעילים" value={accounts.length} color="#38bdf8" />
        <KPI icon="📋" label="תנועות לא מותאמות" value={unreconciledCount} color="#f59e0b" />
        <KPI icon="💰" label="סכום לא מותאם" value={fmtMoney(unreconciledTotal)} color="#a78bfa" />
        <KPI icon="⚠️" label="אי התאמות פתוחות" value={openDiscrepancies} color="#ef4444" />
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>💼 יתרה כוללת בכל החשבונות</h3>
        <div style={{ fontSize: 32, fontWeight: 900, color: "#34d399", textAlign: "center", padding: 10 }}>
          {fmtMoney(totalBalance)}
        </div>
      </div>

      <div style={styles.grid2}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>📋 תנועות אחרונות לא מותאמות</h3>
          {unreconciledTxs.slice(0, 5).map((t) => (
            <div key={t.id} style={styles.listItem}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...styles.listTitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.description || t.counterparty || "ללא תיאור"}
                </div>
                <div style={styles.listSub}>{fmtDate(t.posted_at || t.date)}</div>
              </div>
              <div style={{ ...styles.listAmount, color: Number(t.amount) < 0 ? "#ef4444" : "#34d399" }}>
                {fmtMoney(t.amount)}
              </div>
            </div>
          ))}
          {unreconciledTxs.length === 0 && <div style={styles.empty}>אין תנועות לא מותאמות</div>}
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>⚠️ אי התאמות אחרונות</h3>
          {discrepancies.slice(0, 5).map((d) => (
            <div key={d.id} style={styles.listItem}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...styles.listTitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.title || d.type || "אי התאמה"}
                </div>
                <div style={styles.listSub}>{fmtDate(d.detected_at || d.created_at)}</div>
              </div>
              <span style={{ ...styles.badge, background: severityColor(d.severity) }}>
                {severityLabel(d.severity)}
              </span>
            </div>
          ))}
          {discrepancies.length === 0 && <div style={styles.empty}>אין אי התאמות פתוחות</div>}
        </div>
      </div>
    </div>
  );
}

function KPI({ icon, label, value, color }) {
  return (
    <div style={styles.kpiCard}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ ...styles.kpiValue, color }}>{value}</div>
      <div style={styles.kpiLabel}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ACCOUNTS TAB
// ═══════════════════════════════════════════

function AccountsTab({ accounts, onRefresh, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    bank_code: "",
    branch: "",
    account_number: "",
    iban: "",
    purpose: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.bank_code || !form.account_number) {
      showToast("חובה למלא קוד בנק ומספר חשבון", "error");
      return;
    }
    setSubmitting(true);
    const res = await api("/api/bank/accounts", "POST", form);
    setSubmitting(false);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    showToast("החשבון נוסף בהצלחה");
    setForm({ bank_code: "", branch: "", account_number: "", iban: "", purpose: "" });
    setShowForm(false);
    onRefresh();
  };

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>🏦 חשבונות בנק</h2>
        <button onClick={() => setShowForm((v) => !v)} style={styles.primaryBtn}>
          {showForm ? "✕ ביטול" : "+ הוסף חשבון"}
        </button>
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.cardTitle}>חשבון חדש</h3>
          <div style={styles.grid2}>
            <Field label="קוד בנק *">
              <input
                style={styles.input}
                value={form.bank_code}
                onChange={(e) => setForm({ ...form, bank_code: e.target.value })}
                placeholder="לדוגמה: 12 (הפועלים)"
              />
            </Field>
            <Field label="סניף">
              <input
                style={styles.input}
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                placeholder="מספר סניף"
              />
            </Field>
            <Field label="מספר חשבון *">
              <input
                style={styles.input}
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                placeholder="מספר חשבון"
              />
            </Field>
            <Field label="IBAN">
              <input
                style={styles.input}
                value={form.iban}
                onChange={(e) => setForm({ ...form, iban: e.target.value })}
                placeholder="IL00 0000 0000 0000 0000 000"
              />
            </Field>
          </div>
          <Field label="מטרת החשבון">
            <input
              style={styles.input}
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder="לדוגמה: תפעולי, שכר, הוצאות"
            />
          </Field>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button onClick={submit} disabled={submitting} style={styles.primaryBtn}>
              {submitting ? "שומר..." : "💾 שמור חשבון"}
            </button>
            <button onClick={() => setShowForm(false)} style={styles.secondaryBtn}>
              ביטול
            </button>
          </div>
        </div>
      )}

      {accounts.map((a) => (
        <AccountCard key={a.id} account={a} onRefresh={onRefresh} showToast={showToast} />
      ))}
      {accounts.length === 0 && (
        <div style={styles.card}>
          <div style={styles.empty}>אין חשבונות — הוסף חשבון ראשון</div>
        </div>
      )}
    </div>
  );
}

function AccountCard({ account, onRefresh, showToast }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={styles.supplierCard}>
      <div style={styles.supplierHeader}>
        <div>
          <div style={styles.supplierName}>
            🏦 בנק {account.bank_code} • סניף {account.branch || "—"} • חשבון {account.account_number}
          </div>
          <div style={styles.supplierSub}>
            {account.iban ? `IBAN: ${account.iban} • ` : ""}
            {account.purpose || "חשבון תפעולי"}
          </div>
        </div>
        <div style={styles.scoreCircle}>
          <span style={styles.scoreValue}>{account.currency || "₪"}</span>
        </div>
      </div>

      <div style={styles.grid4Small}>
        <div style={styles.miniStat}>
          <div style={styles.miniStatLabel}>יתרה</div>
          <div style={styles.miniStatValue}>{fmtMoney(account.balance)}</div>
        </div>
        <div style={styles.miniStat}>
          <div style={styles.miniStatLabel}>תנועות</div>
          <div style={styles.miniStatValue}>{account.transaction_count || 0}</div>
        </div>
        <div style={styles.miniStat}>
          <div style={styles.miniStatLabel}>לא מותאמות</div>
          <div style={styles.miniStatValue}>{account.unreconciled_count || 0}</div>
        </div>
        <div style={styles.miniStat}>
          <div style={styles.miniStatLabel}>עדכון אחרון</div>
          <div style={styles.miniStatValue}>{fmtDate(account.last_synced_at)}</div>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
        <button onClick={() => setExpanded((v) => !v)} style={styles.secondaryBtn}>
          {expanded ? "▲ הסתר יבוא" : "▼ יבוא תנועות"}
        </button>
        <button
          onClick={async () => {
            const res = await api(`/api/bank/accounts/${account.id}/auto-reconcile`, "POST");
            if (res?.error) showToast(res.error, "error");
            else {
              showToast(`${res.matched || 0} התאמות חדשות נמצאו`);
              onRefresh();
            }
          }}
          style={styles.smallBtn}
        >
          🔗 התאמה אוטומטית
        </button>
      </div>

      {expanded && <ImportPanel account={account} onRefresh={onRefresh} showToast={showToast} />}
    </div>
  );
}

// ═══════════════════════════════════════════
// IMPORT PANEL (inside account card)
// ═══════════════════════════════════════════

function ImportPanel({ account, onRefresh, showToast }) {
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState("auto");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState("");

  const detectFormat = (name, content) => {
    if (!name && !content) return "auto";
    const lower = (name || "").toLowerCase();
    if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "csv";
    if (lower.endsWith(".sta") || lower.endsWith(".mt940")) return "mt940";
    if (content?.includes(":20:") || content?.includes(":61:")) return "mt940";
    if (content?.includes(",") && content?.split("\n").length > 1) return "csv";
    return "auto";
  };

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f);
    const text = await f.text();
    setRaw(text);
    setFormat(detectFormat(f.name, text));

    // Quick client-side preview (first 5 rows CSV or first matching MT940 lines)
    const lines = text.split("\n").filter(Boolean).slice(0, 6);
    setPreview({
      filename: f.name,
      size: f.size,
      line_count: text.split("\n").length,
      sample_lines: lines,
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const confirmImport = async () => {
    if (!raw) {
      showToast("בחר קובץ קודם", "error");
      return;
    }
    setLoading(true);
    const res = await api(`/api/bank/accounts/${account.id}/import`, "POST", {
      format,
      content: raw,
      filename: file?.name,
    });
    setLoading(false);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    showToast(`${res.imported || 0} תנועות יובאו`);
    setFile(null);
    setRaw("");
    setPreview(null);
    onRefresh();
  };

  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        background: "rgba(15,23,42,0.5)",
        borderRadius: 10,
        border: "1px dashed #334155",
      }}
    >
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          border: "2px dashed #334155",
          borderRadius: 10,
          padding: 20,
          textAlign: "center",
          cursor: "pointer",
          background: "rgba(15,23,42,0.3)",
        }}
        onClick={() => document.getElementById(`file-${account.id}`)?.click()}
      >
        <input
          id={`file-${account.id}`}
          type="file"
          accept=".csv,.txt,.sta,.mt940"
          onChange={(e) => handleFile(e.target.files?.[0])}
          style={{ display: "none" }}
        />
        <div style={{ fontSize: 32 }}>📁</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
          {file ? file.name : "גרור קובץ CSV או MT940 לכאן, או לחץ לבחירה"}
        </div>
        {format !== "auto" && (
          <div style={{ fontSize: 11, color: "#38bdf8", marginTop: 4 }}>
            זוהה פורמט: {format.toUpperCase()}
          </div>
        )}
      </div>

      {preview && (
        <div style={{ marginTop: 10 }}>
          <div style={styles.cardTitle}>תצוגה מקדימה</div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
            {preview.filename} • {(preview.size / 1024).toFixed(1)} KB • {preview.line_count} שורות
          </div>
          <pre
            style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 8,
              padding: 8,
              fontSize: 10,
              color: "#94a3b8",
              overflow: "auto",
              maxHeight: 140,
              direction: "ltr",
              textAlign: "left",
              fontFamily: "monospace",
            }}
          >
            {preview.sample_lines.join("\n")}
          </pre>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              style={{ ...styles.input, width: 140 }}
            >
              <option value="auto">זיהוי אוטומטי</option>
              <option value="csv">CSV</option>
              <option value="mt940">MT940</option>
            </select>
            <button onClick={confirmImport} disabled={loading} style={styles.primaryBtn}>
              {loading ? "מייבא..." : "✅ אשר ייבוא"}
            </button>
            <button
              onClick={() => {
                setFile(null);
                setRaw("");
                setPreview(null);
              }}
              style={styles.secondaryBtn}
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// TRANSACTIONS TAB
// ═══════════════════════════════════════════

function TransactionsTab({ accounts, transactions, onRefresh, showToast }) {
  const [filterAccount, setFilterAccount] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterAccount && String(t.account_id) !== String(filterAccount)) return false;
      if (filterStatus === "reconciled" && !(t.reconciled || t.matched)) return false;
      if (filterStatus === "unreconciled" && (t.reconciled || t.matched)) return false;
      const d = t.posted_at || t.date;
      if (fromDate && d && new Date(d) < new Date(fromDate)) return false;
      if (toDate && d && new Date(d) > new Date(toDate)) return false;
      return true;
    });
  }, [transactions, filterAccount, filterStatus, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filterAccount, filterStatus, fromDate, toDate]);

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>📋 תנועות בנק</h2>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          {filtered.length} תנועות • עמוד {page}/{totalPages}
        </div>
      </div>

      <div style={styles.formCard}>
        <div style={styles.grid4Small}>
          <Field label="חשבון">
            <select
              style={styles.input}
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
            >
              <option value="">כל החשבונות</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bank_code}-{a.branch}-{a.account_number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="סטטוס">
            <select
              style={styles.input}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">הכל</option>
              <option value="reconciled">מותאם</option>
              <option value="unreconciled">לא מותאם</option>
            </select>
          </Field>
          <Field label="מתאריך">
            <input
              type="date"
              style={styles.input}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </Field>
          <Field label="עד תאריך">
            <input
              type="date"
              style={styles.input}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>תאריך</th>
                <th style={styles.th}>תיאור</th>
                <th style={styles.th}>צד נגדי</th>
                <th style={styles.th}>סכום</th>
                <th style={styles.th}>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => {
                const isReconciled = t.reconciled || t.matched;
                return (
                  <tr key={t.id}>
                    <td style={styles.td}>{fmtDate(t.posted_at || t.date)}</td>
                    <td
                      style={{
                        ...styles.td,
                        maxWidth: 240,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.description || "—"}
                    </td>
                    <td style={styles.td}>{t.counterparty || "—"}</td>
                    <td style={{ ...styles.td, color: Number(t.amount) < 0 ? "#ef4444" : "#34d399", fontWeight: 700 }}>
                      {fmtMoney(t.amount)}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          background: isReconciled ? "#059669" : "#f59e0b",
                        }}
                      >
                        {isReconciled ? "מותאם" : "ממתין"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...styles.td, textAlign: "center", color: "#475569", padding: 20 }}>
                    אין תנועות להצגה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 6 }}>
          <button
            style={styles.secondaryBtn}
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ◀ קודם
          </button>
          <span style={{ padding: "8px 14px", color: "#94a3b8", fontSize: 12 }}>
            {page} / {totalPages}
          </span>
          <button
            style={styles.secondaryBtn}
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            הבא ▶
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// RECONCILE TAB
// ═══════════════════════════════════════════

function ReconcileTab({ accounts, matches, onRefresh, showToast }) {
  const [selectedAccount, setSelectedAccount] = useState("");
  const [running, setRunning] = useState(false);

  const runAutoReconcile = async () => {
    if (!selectedAccount) {
      showToast("בחר חשבון קודם", "error");
      return;
    }
    setRunning(true);
    const res = await api(`/api/bank/accounts/${selectedAccount}/auto-reconcile`, "POST");
    setRunning(false);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    showToast(`נמצאו ${res.matched || 0} התאמות חדשות`);
    onRefresh();
  };

  const decide = async (matchId, action) => {
    const res = await api(`/api/bank/matches/${matchId}/${action}`, "POST");
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    showToast(action === "approve" ? "ההתאמה אושרה" : "ההתאמה נדחתה");
    onRefresh();
  };

  const pending = matches.filter((m) => !m.status || m.status === "pending" || m.status === "suggested");

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>🔗 התאמות אוטומטיות</h2>
      </div>

      <div style={styles.formCard}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Field label="הרץ התאמה אוטומטית על חשבון">
              <select
                style={styles.input}
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
              >
                <option value="">— בחר חשבון —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank_code}-{a.branch}-{a.account_number} ({a.purpose || "תפעולי"})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button onClick={runAutoReconcile} disabled={running} style={styles.primaryBtn}>
            {running ? "רץ..." : "🚀 הרץ התאמה"}
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>📋 הצעות התאמה ממתינות ({pending.length})</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>תנועת בנק</th>
                <th style={styles.th}>התאמה (הזמנה/חשבונית)</th>
                <th style={styles.th}>סכום</th>
                <th style={styles.th}>ביטחון</th>
                <th style={styles.th}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((m) => (
                <tr key={m.id}>
                  <td style={styles.td}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{m.bank_description || m.transaction_description || "—"}</div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{fmtDate(m.bank_date || m.transaction_date)}</div>
                  </td>
                  <td style={styles.td}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      {m.matched_type || "הזמנה"} #{m.matched_ref || m.matched_id}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{m.matched_counterparty || ""}</div>
                  </td>
                  <td style={{ ...styles.td, fontWeight: 700, color: "#f59e0b" }}>
                    {fmtMoney(m.amount || m.bank_amount)}
                  </td>
                  <td style={styles.td}>
                    <ConfidenceBar score={m.confidence || m.score || 0} />
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() => decide(m.id, "approve")}
                        style={{ ...styles.smallBtn, background: "#059669" }}
                      >
                        ✓ אשר
                      </button>
                      <button
                        onClick={() => decide(m.id, "reject")}
                        style={{ ...styles.smallBtn, background: "#dc2626" }}
                      >
                        ✕ דחה
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...styles.td, textAlign: "center", color: "#475569", padding: 20 }}>
                    אין הצעות התאמה ממתינות — הרץ התאמה אוטומטית על חשבון
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBar({ score }) {
  const pct = Math.round(Number(score) * (score > 1 ? 1 : 100));
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= 85 ? "#34d399" : clamped >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ width: 100 }}>
      <div
        style={{
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 6,
          height: 10,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${clamped}%`, height: "100%", background: color, transition: "width 0.3s" }} />
      </div>
      <div style={{ fontSize: 10, color, fontWeight: 700, marginTop: 2, textAlign: "center" }}>{clamped}%</div>
    </div>
  );
}

// ═══════════════════════════════════════════
// DISCREPANCIES TAB
// ═══════════════════════════════════════════

function DiscrepanciesTab({ discrepancies }) {
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>⚠️ אי התאמות</h2>
        <div style={{ fontSize: 12, color: "#64748b" }}>{discrepancies.length} רשומות</div>
      </div>

      {selected && (
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>
                {selected.title || selected.type || "אי התאמה"}
              </h3>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                זוהה: {fmtDate(selected.detected_at || selected.created_at)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ ...styles.badge, background: severityColor(selected.severity) }}>
                {severityLabel(selected.severity)}
              </span>
              <button onClick={() => setSelected(null)} style={styles.secondaryBtn}>
                ✕ סגור
              </button>
            </div>
          </div>
          <div style={styles.grid2}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>סכום צפוי</div>
              <div style={styles.statValue}>{fmtMoney(selected.expected_amount)}</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>סכום בפועל</div>
              <div style={styles.statValue}>{fmtMoney(selected.actual_amount)}</div>
            </div>
          </div>
          {selected.description && (
            <div style={{ marginTop: 10, padding: 10, background: "rgba(15,23,42,0.5)", borderRadius: 8, fontSize: 12, color: "#94a3b8" }}>
              {selected.description}
            </div>
          )}
          {selected.reference && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
              הפניה: {selected.reference}
            </div>
          )}
        </div>
      )}

      {discrepancies.map((d) => (
        <div
          key={d.id}
          onClick={() => setSelected(d)}
          style={{ ...styles.supplierCard, cursor: "pointer" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.supplierName}>{d.title || d.type || "אי התאמה"}</div>
              <div style={styles.supplierSub}>
                {fmtDate(d.detected_at || d.created_at)} •{" "}
                {d.description ? d.description.slice(0, 80) : "לחץ לפרטים"}
              </div>
            </div>
            <div style={{ textAlign: "left", marginRight: 10 }}>
              <span style={{ ...styles.badge, background: severityColor(d.severity) }}>
                {severityLabel(d.severity)}
              </span>
              {(d.expected_amount != null || d.actual_amount != null) && (
                <div style={{ ...styles.listAmount, marginTop: 4 }}>
                  Δ {fmtMoney(Math.abs(Number(d.actual_amount || 0) - Number(d.expected_amount || 0)))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {discrepancies.length === 0 && (
        <div style={styles.card}>
          <div style={styles.empty}>✨ אין אי התאמות פתוחות</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SHARED
// ═══════════════════════════════════════════

function Field({ label, children }) {
  return (
    <div style={styles.fieldWrap}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════
// STYLES (matches onyx-dashboard.jsx)
// ═══════════════════════════════════════════

const styles = {
  app: { minHeight: "100vh", background: "#0c0f1a", color: "#e2e8f0", fontFamily: "'Rubik', sans-serif", direction: "rtl" },

  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "linear-gradient(180deg, #111827 0%, #0c0f1a 100%)", borderBottom: "1px solid #1e293b" },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logo: { width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, #38bdf8, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "#0c0f1a" },
  headerTitle: { fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "#38bdf8" },
  headerSub: { fontSize: 11, color: "#64748b" },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
  statusText: { fontSize: 12, color: "#94a3b8" },
  refreshBtn: { background: "none", border: "1px solid #1e293b", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 14 },

  nav: { display: "flex", gap: 2, padding: "8px 16px", overflowX: "auto", background: "#0c0f1a", borderBottom: "1px solid #1e293b" },
  tab: { padding: "8px 14px", borderRadius: 8, border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Rubik', sans-serif" },
  tabActive: { background: "rgba(56,189,248,0.12)", color: "#38bdf8", borderBottom: "2px solid #38bdf8" },

  main: { padding: 16, maxWidth: 1100, margin: "0 auto" },
  loading: { textAlign: "center", padding: 40, color: "#64748b" },

  card: { background: "rgba(30,41,59,0.4)", border: "1px solid #1e293b", borderRadius: 14, padding: 16, marginBottom: 14 },
  formCard: { background: "rgba(30,41,59,0.5)", border: "1px solid #1e293b", borderRadius: 14, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12 },

  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 },
  kpiCard: { background: "rgba(30,41,59,0.5)", border: "1px solid #1e293b", borderRadius: 14, padding: 16, textAlign: "center" },
  kpiValue: { fontSize: 24, fontWeight: 800, marginTop: 6 },
  kpiLabel: { fontSize: 12, color: "#64748b", marginTop: 4 },

  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  grid4Small: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 },

  statBox: { background: "rgba(15,23,42,0.5)", borderRadius: 10, padding: 12, textAlign: "center" },
  statLabel: { fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: 800, color: "#38bdf8", marginTop: 4 },
  statSub: { fontSize: 11, color: "#475569", marginTop: 2 },

  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1e293b55", gap: 8 },
  listTitle: { fontSize: 14, fontWeight: 600, color: "#e2e8f0" },
  listSub: { fontSize: 11, color: "#64748b" },
  listAmount: { fontSize: 14, fontWeight: 700, color: "#f59e0b" },
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase" },
  empty: { textAlign: "center", padding: 30, color: "#475569" },

  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: 800, color: "#e2e8f0" },

  supplierCard: { background: "rgba(30,41,59,0.4)", border: "1px solid #1e293b", borderRadius: 14, padding: 16, marginBottom: 10 },
  supplierHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  supplierName: { fontSize: 15, fontWeight: 700, color: "#e2e8f0" },
  supplierSub: { fontSize: 11, color: "#64748b" },
  scoreCircle: { width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #38bdf8, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center" },
  scoreValue: { fontSize: 16, fontWeight: 900, color: "#0c0f1a" },
  miniStat: { background: "rgba(15,23,42,0.4)", borderRadius: 8, padding: "6px 10px", textAlign: "center" },
  miniStatLabel: { fontSize: 9, color: "#475569" },
  miniStatValue: { fontSize: 12, fontWeight: 700, color: "#e2e8f0" },

  fieldWrap: { marginBottom: 6 },
  label: { display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 },
  input: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #1e293b", background: "#0f172a", color: "#e2e8f0", fontSize: 13, fontFamily: "'Rubik', sans-serif", outline: "none" },

  primaryBtn: { padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #38bdf8, #6366f1)", color: "#0c0f1a", cursor: "pointer", fontSize: 13, fontWeight: 700 },
  secondaryBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  smallBtn: { padding: "6px 14px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 },

  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "right", padding: "10px 8px", borderBottom: "1px solid #1e293b", color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 },
  td: { padding: "10px 8px", borderBottom: "1px solid #1e293b33", color: "#e2e8f0", fontSize: 12 },

  toast: { position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", padding: "10px 24px", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, zIndex: 9999, animation: "fadeIn 0.3s", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" },
};
