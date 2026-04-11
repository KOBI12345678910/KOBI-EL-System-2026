import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:3100";

// ═══ API Helper ═══
async function api(path, method = "GET", body = null) {
  try {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ═══ Main App ═══
export default function OnyxDashboard() {
  const [tab, setTab] = useState("dashboard");
  const [status, setStatus] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [rfqs, setRfqs] = useState([]);
  const [savings, setSavings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, sup, sub, o, r, sav] = await Promise.all([
      api("/api/status"), api("/api/suppliers"), api("/api/subcontractors"),
      api("/api/purchase-orders"), api("/api/rfqs"), api("/api/analytics/savings"),
    ]);
    setStatus(s); setSuppliers(sup.suppliers || []); setSubcontractors(sub.subcontractors || []);
    setOrders(o.orders || []); setRfqs(r.rfqs || []); setSavings(sav);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); const i = setInterval(refresh, 30000); return () => clearInterval(i); }, [refresh]);

  const tabs = [
    { id: "dashboard", label: "דשבורד", icon: "📊" },
    { id: "suppliers", label: "ספקים", icon: "🏭" },
    { id: "rfq", label: "בקשת מחיר", icon: "📤" },
    { id: "quotes", label: "הצעות", icon: "📥" },
    { id: "orders", label: "הזמנות", icon: "📦" },
    { id: "subcontractors", label: "קבלנים", icon: "👷" },
    { id: "sub_decide", label: "החלטת קבלן", icon: "🎯" },
  ];

  return (
    <div style={styles.app}>
      {/* Toast */}
      {toast && <div style={{ ...styles.toast, background: toast.type === "error" ? "#dc2626" : "#059669" }}>{toast.msg}</div>}

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>O</div>
          <div>
            <div style={styles.headerTitle}>ONYX</div>
            <div style={styles.headerSub}>מערכת רכש • טכנו כל עוזי</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <span style={{ ...styles.statusDot, background: status?.status === "operational" ? "#34d399" : "#f87171" }} />
          <span style={styles.statusText}>{status?.status === "operational" ? "פעיל" : "לא מחובר"}</span>
          <button onClick={refresh} style={styles.refreshBtn}>🔄</button>
        </div>
      </header>

      {/* Tabs */}
      <nav style={styles.nav}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={styles.main}>
        {loading && <div style={styles.loading}>טוען...</div>}

        {tab === "dashboard" && <DashboardTab status={status} savings={savings} suppliers={suppliers} orders={orders} rfqs={rfqs} />}
        {tab === "suppliers" && <SuppliersTab suppliers={suppliers} onRefresh={refresh} showToast={showToast} />}
        {tab === "rfq" && <RFQTab suppliers={suppliers} onRefresh={refresh} showToast={showToast} />}
        {tab === "quotes" && <QuotesTab rfqs={rfqs} suppliers={suppliers} onRefresh={refresh} showToast={showToast} />}
        {tab === "orders" && <OrdersTab orders={orders} onRefresh={refresh} showToast={showToast} />}
        {tab === "subcontractors" && <SubcontractorsTab subcontractors={subcontractors} onRefresh={refresh} showToast={showToast} />}
        {tab === "sub_decide" && <SubDecideTab onRefresh={refresh} showToast={showToast} />}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0c0f1a; }
        input, select, textarea, button { font-family: 'Rubik', sans-serif; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════

function DashboardTab({ status, savings, suppliers, orders, rfqs }) {
  const d = status?.dashboard || {};
  const activeOrders = orders.filter(o => !["closed", "cancelled", "delivered"].includes(o.status)).length;

  return (
    <div>
      {/* KPI Cards */}
      <div style={styles.grid4}>
        <KPI icon="🏭" label="ספקים פעילים" value={suppliers.length} color="#38bdf8" />
        <KPI icon="📦" label="הזמנות פעילות" value={activeOrders} color="#f59e0b" />
        <KPI icon="📤" label="RFQs פתוחים" value={rfqs.filter(r => r?.status === "sent" || r?.status === "collecting").length} color="#a78bfa" />
        <KPI icon="💰" label="חיסכון כולל" value={`₪${(savings?.total_savings || 0).toLocaleString()}`} color="#34d399" />
      </div>

      {/* Savings Breakdown */}
      {savings && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>💰 פירוט חיסכון</h3>
          <div style={styles.grid2}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>רכש (RFQ)</div>
              <div style={styles.statValue}>₪{(savings.procurement?.total || 0).toLocaleString()}</div>
              <div style={styles.statSub}>{savings.procurement?.decisions || 0} החלטות</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>קבלני משנה</div>
              <div style={styles.statValue}>₪{(savings.subcontractor?.total || 0).toLocaleString()}</div>
              <div style={styles.statSub}>{savings.subcontractor?.decisions || 0} החלטות</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>📦 הזמנות אחרונות</h3>
        {orders.slice(0, 5).map(o => (
          <div key={o.id} style={styles.listItem}>
            <div>
              <div style={styles.listTitle}>{o.supplier_name}</div>
              <div style={styles.listSub}>{o.source} • {new Date(o.created_at).toLocaleDateString("he-IL")}</div>
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ ...styles.badge, background: o.status === "delivered" ? "#059669" : o.status === "sent" ? "#2563eb" : "#71717a" }}>{o.status}</div>
              <div style={styles.listAmount}>₪{(o.total || 0).toLocaleString()}</div>
            </div>
          </div>
        ))}
        {orders.length === 0 && <div style={styles.empty}>אין הזמנות עדיין</div>}
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
// SUPPLIERS TAB
// ═══════════════════════════════════════════

function SuppliersTab({ suppliers, onRefresh, showToast }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", contact_person: "", phone: "", email: "", preferred_channel: "whatsapp" });

  const addSupplier = async () => {
    if (!form.name || !form.phone) return showToast("שם וטלפון חובה", "error");
    const res = await api("/api/suppliers", "POST", form);
    if (res.error) return showToast(res.error, "error");
    showToast(`✅ ${form.name} נוסף`);
    setForm({ name: "", contact_person: "", phone: "", email: "", preferred_channel: "whatsapp" });
    setShowAdd(false);
    onRefresh();
  };

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>🏭 ספקים ({suppliers.length})</h2>
        <button onClick={() => setShowAdd(!showAdd)} style={styles.primaryBtn}>{showAdd ? "ביטול" : "+ הוסף ספק"}</button>
      </div>

      {showAdd && (
        <div style={styles.formCard}>
          <div style={styles.grid2}>
            <Input label="שם ספק" value={form.name} onChange={v => setForm({ ...form, name: v })} />
            <Input label="איש קשר" value={form.contact_person} onChange={v => setForm({ ...form, contact_person: v })} />
            <Input label="טלפון" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
            <Input label="אימייל" value={form.email} onChange={v => setForm({ ...form, email: v })} />
          </div>
          <button onClick={addSupplier} style={styles.primaryBtn}>שמור ספק</button>
        </div>
      )}

      {suppliers.map(s => (
        <div key={s.id} style={styles.supplierCard}>
          <div style={styles.supplierHeader}>
            <div>
              <div style={styles.supplierName}>{s.name}</div>
              <div style={styles.supplierSub}>{s.phone} • {s.product_count || 0} מוצרים</div>
            </div>
            <div style={styles.scoreCircle}>
              <span style={styles.scoreValue}>{Math.round(s.overall_score || 0)}</span>
            </div>
          </div>
          <div style={styles.grid4Small}>
            <MiniStat label="הזמנות" value={s.total_orders || 0} />
            <MiniStat label="הוצאות" value={`₪${(s.total_spent || 0).toLocaleString()}`} />
            <MiniStat label="דירוג" value={`${s.rating || 0}/10`} />
            <MiniStat label="סיכון" value={Math.round(s.risk_score || 0)} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// RFQ TAB — שליחת בקשה לספקים
// ═══════════════════════════════════════════

function RFQTab({ suppliers, onRefresh, showToast }) {
  const [items, setItems] = useState([{ category: "ברזל", name: "", quantity: "", unit: "מטר", specs: "" }]);
  const [meta, setMeta] = useState({ requested_by: "דימה", urgency: "normal", project_name: "", response_hours: 24, note: "" });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const addItem = () => setItems([...items, { category: "ברזל", name: "", quantity: "", unit: "מטר", specs: "" }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i, field, value) => { const n = [...items]; n[i][field] = value; setItems(n); };

  const categories = ["ברזל", "אלומיניום", "נירוסטה", "זכוכית", "צבע", "ברגים_ואביזרים", "כלי_עבודה", "ציוד_בטיחות"];
  const units = ["מטר", 'מ"ר', 'ק"ג', "טון", "יחידה", "ליטר", "אריזה"];

  const send = async () => {
    const validItems = items.filter(i => i.name && i.quantity);
    if (validItems.length === 0) return showToast("הוסף לפחות פריט אחד", "error");
    setSending(true);

    // 1. Create purchase request
    const prRes = await api("/api/purchase-requests", "POST", {
      requested_by: meta.requested_by, urgency: meta.urgency, project_name: meta.project_name,
      items: validItems.map(i => ({ ...i, quantity: parseFloat(i.quantity) })),
    });
    if (prRes.error) { setSending(false); return showToast(prRes.error, "error"); }

    // 2. Send RFQ
    const rfqRes = await api("/api/rfq/send", "POST", {
      purchase_request_id: prRes.request.id,
      response_window_hours: parseInt(meta.response_hours),
      company_note: meta.note || undefined,
    });

    setSending(false);
    if (rfqRes.error) return showToast(rfqRes.error, "error");
    setResult(rfqRes);
    showToast(rfqRes.message || "RFQ נשלח!");
    onRefresh();
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>📤 שליחת בקשה להצעת מחיר</h2>

      <div style={styles.formCard}>
        <div style={styles.grid3}>
          <Input label="מבקש" value={meta.requested_by} onChange={v => setMeta({ ...meta, requested_by: v })} />
          <Select label="דחיפות" value={meta.urgency} onChange={v => setMeta({ ...meta, urgency: v })} options={[["low", "נמוכה"], ["normal", "רגילה"], ["high", "גבוהה"], ["critical", "קריטית"]]} />
          <Input label="פרויקט" value={meta.project_name} onChange={v => setMeta({ ...meta, project_name: v })} placeholder="שם פרויקט" />
        </div>

        <h3 style={{ ...styles.cardTitle, marginTop: 16 }}>פריטים</h3>
        {items.map((item, i) => (
          <div key={i} style={{ ...styles.grid5, marginBottom: 8, alignItems: "end" }}>
            <Select label="קטגוריה" value={item.category} onChange={v => updateItem(i, "category", v)} options={categories.map(c => [c, c])} />
            <Input label="שם מוצר" value={item.name} onChange={v => updateItem(i, "name", v)} placeholder='לדוגמה: ברזל 12 מ"מ' />
            <Input label="כמות" value={item.quantity} onChange={v => updateItem(i, "quantity", v)} type="number" />
            <Select label="יחידה" value={item.unit} onChange={v => updateItem(i, "unit", v)} options={units.map(u => [u, u])} />
            <button onClick={() => removeItem(i)} style={styles.removeBtn}>✕</button>
          </div>
        ))}
        <button onClick={addItem} style={styles.secondaryBtn}>+ הוסף פריט</button>

        <div style={{ ...styles.grid2, marginTop: 16 }}>
          <Input label="שעות לתשובה" value={meta.response_hours} onChange={v => setMeta({ ...meta, response_hours: v })} type="number" />
          <Input label="הערה לספקים" value={meta.note} onChange={v => setMeta({ ...meta, note: v })} placeholder="אופציונלי" />
        </div>

        <button onClick={send} disabled={sending} style={{ ...styles.primaryBtn, marginTop: 16, width: "100%", fontSize: 16, padding: "14px 0" }}>
          {sending ? "שולח..." : "📤 שלח לכל הספקים"}
        </button>
      </div>

      {result && (
        <div style={{ ...styles.card, borderColor: "#059669" }}>
          <h3 style={styles.cardTitle}>✅ {result.message}</h3>
          <div style={styles.statBox}>
            <div>ספקים: {result.suppliers_contacted} | נשלח: {result.delivered} | דדליין: {new Date(result.deadline).toLocaleString("he-IL")}</div>
          </div>
          {result.results?.map((r, i) => (
            <div key={i} style={styles.listItem}>
              <span>{r.delivered ? "✅" : "❌"} {r.supplier}</span>
              <span style={styles.listSub}>{r.channel}: {r.address}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// QUOTES TAB — הזנת הצעות + החלטה
// ═══════════════════════════════════════════

function QuotesTab({ rfqs, suppliers, onRefresh, showToast }) {
  const [selectedRfq, setSelectedRfq] = useState("");
  const [rfqDetail, setRfqDetail] = useState(null);
  const [quoteForm, setQuoteForm] = useState({ supplier_id: "", supplier_name: "", delivery_days: 5, delivery_fee: 0, free_delivery: false, line_items: [{ name: "", quantity: "", unit: "מטר", unit_price: "" }] });
  const [decision, setDecision] = useState(null);

  const loadRFQ = async (id) => { setSelectedRfq(id); const res = await api(`/api/rfq/${id}`); setRfqDetail(res); setDecision(null); };

  const addQuoteLine = () => setQuoteForm({ ...quoteForm, line_items: [...quoteForm.line_items, { name: "", quantity: "", unit: "מטר", unit_price: "" }] });

  const submitQuote = async () => {
    if (!quoteForm.supplier_id) return showToast("בחר ספק", "error");
    const validLines = quoteForm.line_items.filter(l => l.name && l.quantity && l.unit_price);
    if (validLines.length === 0) return showToast("הוסף לפחות שורה אחת", "error");
    const res = await api("/api/quotes", "POST", {
      rfq_id: selectedRfq, supplier_id: quoteForm.supplier_id, supplier_name: quoteForm.supplier_name,
      delivery_days: parseInt(quoteForm.delivery_days), delivery_fee: parseFloat(quoteForm.delivery_fee || 0),
      free_delivery: quoteForm.free_delivery,
      line_items: validLines.map(l => ({ ...l, quantity: parseFloat(l.quantity), unit_price: parseFloat(l.unit_price) })),
    });
    if (res.error) return showToast(res.error, "error");
    showToast(res.message);
    loadRFQ(selectedRfq);
    setQuoteForm({ ...quoteForm, supplier_id: "", supplier_name: "", line_items: [{ name: "", quantity: "", unit: "מטר", unit_price: "" }] });
    onRefresh();
  };

  const decide = async () => {
    const res = await api(`/api/rfq/${selectedRfq}/decide`, "POST", { decided_by: "קובי" });
    if (res.error) return showToast(res.error, "error");
    setDecision(res);
    showToast(res.message);
    onRefresh();
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>📥 הצעות מחיר + החלטה</h2>

      <div style={styles.formCard}>
        <Select label="בחר RFQ" value={selectedRfq} onChange={loadRFQ} options={[["", "— בחר —"], ...(rfqs || []).map(r => [r.rfq_id, `${r.rfq_id?.slice(0, 12)} | ${r.project_name || "ללא פרויקט"} | ${r.quotes_received || 0} הצעות`])]} />
      </div>

      {rfqDetail?.quotes?.length > 0 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>הצעות שהתקבלו ({rfqDetail.quotes.length})</h3>
          {rfqDetail.quotes.map(q => (
            <div key={q.id} style={styles.listItem}>
              <div>
                <div style={styles.listTitle}>{q.supplier_name}</div>
                <div style={styles.listSub}>{q.delivery_days} ימי אספקה • {q.free_delivery ? "משלוח חינם" : `משלוח ₪${q.delivery_fee}`}</div>
              </div>
              <div style={styles.listAmount}>₪{(q.total_price || 0).toLocaleString()}</div>
            </div>
          ))}
          <button onClick={decide} style={{ ...styles.primaryBtn, width: "100%", marginTop: 12, fontSize: 15, padding: "12px 0", background: "linear-gradient(135deg, #059669, #10b981)" }}>
            🎯 AI — בחר את ההצעה הטובה ביותר
          </button>
        </div>
      )}

      {decision && (
        <div style={{ ...styles.card, border: "2px solid #059669" }}>
          <h3 style={{ ...styles.cardTitle, color: "#34d399" }}>🏆 החלטה</h3>
          {decision.reasoning?.map((r, i) => <div key={i} style={{ ...styles.listSub, padding: "2px 0", direction: "rtl" }}>{r}</div>)}
          <div style={{ ...styles.statBox, marginTop: 12, background: "rgba(5,150,105,0.1)", border: "1px solid #05966930" }}>
            <div style={styles.statLabel}>חיסכון</div>
            <div style={{ ...styles.statValue, color: "#34d399" }}>₪{(decision.savings?.amount || 0).toLocaleString()} ({decision.savings?.percent || 0}%)</div>
          </div>
        </div>
      )}

      {selectedRfq && (
        <div style={styles.formCard}>
          <h3 style={styles.cardTitle}>➕ הזן הצעת מחיר חדשה</h3>
          <div style={styles.grid3}>
            <Select label="ספק" value={quoteForm.supplier_id} onChange={v => {
              const s = suppliers.find(s => s.id === v);
              setQuoteForm({ ...quoteForm, supplier_id: v, supplier_name: s?.name || "" });
            }} options={[["", "— בחר ספק —"], ...suppliers.map(s => [s.id, s.name])]} />
            <Input label="ימי אספקה" value={quoteForm.delivery_days} onChange={v => setQuoteForm({ ...quoteForm, delivery_days: v })} type="number" />
            <Input label="דמי משלוח" value={quoteForm.delivery_fee} onChange={v => setQuoteForm({ ...quoteForm, delivery_fee: v })} type="number" />
          </div>

          <h4 style={{ ...styles.kpiLabel, marginTop: 12 }}>שורות:</h4>
          {quoteForm.line_items.map((li, i) => (
            <div key={i} style={{ ...styles.grid4Small, marginBottom: 6 }}>
              <Input placeholder="מוצר" value={li.name} onChange={v => { const n = [...quoteForm.line_items]; n[i].name = v; setQuoteForm({ ...quoteForm, line_items: n }); }} />
              <Input placeholder="כמות" value={li.quantity} type="number" onChange={v => { const n = [...quoteForm.line_items]; n[i].quantity = v; setQuoteForm({ ...quoteForm, line_items: n }); }} />
              <Input placeholder="יחידה" value={li.unit} onChange={v => { const n = [...quoteForm.line_items]; n[i].unit = v; setQuoteForm({ ...quoteForm, line_items: n }); }} />
              <Input placeholder="מחיר" value={li.unit_price} type="number" onChange={v => { const n = [...quoteForm.line_items]; n[i].unit_price = v; setQuoteForm({ ...quoteForm, line_items: n }); }} />
            </div>
          ))}
          <button onClick={addQuoteLine} style={styles.secondaryBtn}>+ שורה</button>
          <button onClick={submitQuote} style={{ ...styles.primaryBtn, marginTop: 12 }}>📥 שמור הצעה</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// ORDERS TAB
// ═══════════════════════════════════════════

function OrdersTab({ orders, onRefresh, showToast }) {
  const approve = async (id) => {
    const res = await api(`/api/purchase-orders/${id}/approve`, "POST", { approved_by: "קובי" });
    showToast(res.message || "אושר"); onRefresh();
  };
  const send = async (id) => {
    const res = await api(`/api/purchase-orders/${id}/send`, "POST", { sent_by: "קובי" });
    showToast(res.message || (res.sent ? "נשלח" : "שליחה נכשלה"), res.sent ? "success" : "error"); onRefresh();
  };

  const statusColors = { draft: "#71717a", pending_approval: "#f59e0b", approved: "#2563eb", sent: "#8b5cf6", confirmed: "#059669", delivered: "#34d399", closed: "#6b7280", cancelled: "#dc2626" };

  return (
    <div>
      <h2 style={styles.sectionTitle}>📦 הזמנות רכש ({orders.length})</h2>
      {orders.map(o => (
        <div key={o.id} style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={styles.listTitle}>{o.supplier_name}</div>
              <div style={styles.listSub}>{o.source} • {new Date(o.created_at).toLocaleDateString("he-IL")} • {o.po_line_items?.length || 0} פריטים</div>
              {o.project_name && <div style={styles.listSub}>פרויקט: {o.project_name}</div>}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ ...styles.badge, background: statusColors[o.status] || "#71717a" }}>{o.status}</div>
              <div style={{ ...styles.listAmount, fontSize: 18 }}>₪{(o.total || 0).toLocaleString()}</div>
              {o.negotiated_savings > 0 && <div style={{ color: "#34d399", fontSize: 12 }}>חיסכון: ₪{o.negotiated_savings.toLocaleString()}</div>}
            </div>
          </div>
          {o.po_line_items?.map((li, i) => (
            <div key={i} style={{ ...styles.listSub, padding: "4px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 6, marginTop: 4 }}>
              {li.name} — {li.quantity} {li.unit} × ₪{li.unit_price} = ₪{(li.total_price || 0).toLocaleString()}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {o.status === "draft" && <button onClick={() => approve(o.id)} style={styles.smallBtn}>✅ אשר</button>}
            {(o.status === "approved" || o.status === "draft") && <button onClick={() => send(o.id)} style={{ ...styles.smallBtn, background: "#2563eb" }}>📤 שלח לספק</button>}
          </div>
        </div>
      ))}
      {orders.length === 0 && <div style={styles.empty}>אין הזמנות</div>}
    </div>
  );
}

// ═══════════════════════════════════════════
// SUBCONTRACTORS TAB
// ═══════════════════════════════════════════

function SubcontractorsTab({ subcontractors, onRefresh, showToast }) {
  return (
    <div>
      <h2 style={styles.sectionTitle}>👷 קבלני משנה ({subcontractors.length})</h2>
      {subcontractors.map(s => (
        <div key={s.id} style={styles.supplierCard}>
          <div style={styles.supplierHeader}>
            <div>
              <div style={styles.supplierName}>{s.name}</div>
              <div style={styles.supplierSub}>{s.phone} • {(s.specialties || []).join(", ")}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <MiniStat label="איכות" value={`${s.quality_rating}/10`} />
              <MiniStat label="אמינות" value={`${s.reliability_rating}/10`} />
            </div>
          </div>
          {s.subcontractor_pricing?.map((p, i) => (
            <div key={i} style={{ ...styles.listSub, display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>{p.work_type}</span>
              <span>{p.percentage_rate}% | ₪{p.price_per_sqm}/מ"ר{p.minimum_price ? ` | מינימום ₪${p.minimum_price.toLocaleString()}` : ""}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// SUBCONTRACTOR DECIDE TAB — % vs מ"ר
// ═══════════════════════════════════════════

function SubDecideTab({ onRefresh, showToast }) {
  const [form, setForm] = useState({ work_type: "מעקות_ברזל", project_value: "", area_sqm: "", project_name: "", client_name: "" });
  const [result, setResult] = useState(null);

  const workTypes = ["מעקות_ברזל", "מעקות_אלומיניום", "שערים", "גדרות", "פרגולות", "התקנה"];

  const decide = async () => {
    if (!form.project_value || !form.area_sqm) return showToast("סכום ושטח חובה", "error");
    const res = await api("/api/subcontractors/decide", "POST", {
      ...form, project_value: parseFloat(form.project_value), area_sqm: parseFloat(form.area_sqm),
    });
    if (res.error) return showToast(res.error, "error");
    setResult(res);
    showToast(res.message);
    onRefresh();
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>🎯 החלטת קבלן — אחוזים או מ"ר?</h2>

      <div style={styles.formCard}>
        <div style={styles.grid3}>
          <Select label="סוג עבודה" value={form.work_type} onChange={v => setForm({ ...form, work_type: v })} options={workTypes.map(w => [w, w])} />
          <Input label="סכום פרויקט (₪)" value={form.project_value} onChange={v => setForm({ ...form, project_value: v })} type="number" placeholder="120000" />
          <Input label='שטח (מ"ר)' value={form.area_sqm} onChange={v => setForm({ ...form, area_sqm: v })} type="number" placeholder="280" />
        </div>
        <div style={styles.grid2}>
          <Input label="שם פרויקט" value={form.project_name} onChange={v => setForm({ ...form, project_name: v })} />
          <Input label="לקוח" value={form.client_name} onChange={v => setForm({ ...form, client_name: v })} />
        </div>
        <button onClick={decide} style={{ ...styles.primaryBtn, width: "100%", marginTop: 16, fontSize: 16, padding: "14px 0" }}>
          🎯 AI — חשב ובחר
        </button>
      </div>

      {result && (
        <div style={{ ...styles.card, border: "2px solid #059669" }}>
          <h3 style={{ ...styles.cardTitle, color: "#34d399" }}>🏆 תוצאה</h3>
          {result.reasoning?.map((r, i) => <div key={i} style={{ ...styles.listSub, padding: "2px 0", direction: "rtl" }}>{r}</div>)}
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <div style={{ ...styles.statBox, flex: 1, background: "rgba(5,150,105,0.1)", border: "1px solid #05966930" }}>
              <div style={styles.statLabel}>חיסכון</div>
              <div style={{ ...styles.statValue, color: "#34d399" }}>₪{(result.savings?.amount || 0).toLocaleString()}</div>
              <div style={styles.statSub}>{result.savings?.percent || 0}%</div>
            </div>
            <div style={{ ...styles.statBox, flex: 1 }}>
              <div style={styles.statLabel}>רווח גולמי</div>
              <div style={styles.statValue}>₪{(result.gross_profit?.amount || 0).toLocaleString()}</div>
              <div style={styles.statSub}>{result.gross_profit?.margin || 0}%</div>
            </div>
          </div>
          {result.candidates && (
            <div style={{ marginTop: 12 }}>
              <div style={styles.statLabel}>כל הקבלנים:</div>
              {result.candidates.map((c, i) => (
                <div key={i} style={{ ...styles.listItem, background: i === 0 ? "rgba(5,150,105,0.05)" : "transparent" }}>
                  <span>{i === 0 ? "🏆" : `#${i + 1}`} {c.name}</span>
                  <span>₪{(c.best_cost || 0).toLocaleString()} ({c.best_method === "percentage" ? `${c.percentage_rate}%` : `₪${c.price_per_sqm}/מ"ר`}) | ציון: {c.final_score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
// STYLES
// ═══════════════════════════════════════════

const styles = {
  app: { minHeight: "100vh", background: "#0c0f1a", color: "#e2e8f0", fontFamily: "'Rubik', sans-serif", direction: "rtl" },

  // Header
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "linear-gradient(180deg, #111827 0%, #0c0f1a 100%)", borderBottom: "1px solid #1e293b" },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logo: { width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, #f59e0b, #ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "#0c0f1a" },
  headerTitle: { fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "#f59e0b" },
  headerSub: { fontSize: 11, color: "#64748b" },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
  statusText: { fontSize: 12, color: "#94a3b8" },
  refreshBtn: { background: "none", border: "1px solid #1e293b", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 14 },

  // Nav
  nav: { display: "flex", gap: 2, padding: "8px 16px", overflowX: "auto", background: "#0c0f1a", borderBottom: "1px solid #1e293b" },
  tab: { padding: "8px 14px", borderRadius: 8, border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Rubik', sans-serif" },
  tabActive: { background: "rgba(245,158,11,0.12)", color: "#f59e0b", borderBottom: "2px solid #f59e0b" },

  // Main
  main: { padding: 16, maxWidth: 900, margin: "0 auto" },
  loading: { textAlign: "center", padding: 40, color: "#64748b" },

  // Cards
  card: { background: "rgba(30,41,59,0.4)", border: "1px solid #1e293b", borderRadius: 14, padding: 16, marginBottom: 14 },
  formCard: { background: "rgba(30,41,59,0.5)", border: "1px solid #1e293b", borderRadius: 14, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12 },

  // KPI
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 },
  kpiCard: { background: "rgba(30,41,59,0.5)", border: "1px solid #1e293b", borderRadius: 14, padding: 16, textAlign: "center" },
  kpiValue: { fontSize: 26, fontWeight: 800, marginTop: 6 },
  kpiLabel: { fontSize: 12, color: "#64748b", marginTop: 4 },

  // Grids
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  grid4Small: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 },
  grid5: { display: "grid", gridTemplateColumns: "1fr 1.5fr 0.7fr 0.7fr 40px", gap: 6 },

  // Stats
  statBox: { background: "rgba(15,23,42,0.5)", borderRadius: 10, padding: 12, textAlign: "center" },
  statLabel: { fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: 800, color: "#f59e0b", marginTop: 4 },
  statSub: { fontSize: 11, color: "#475569", marginTop: 2 },

  // Lists
  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1e293b15" },
  listTitle: { fontSize: 14, fontWeight: 600, color: "#e2e8f0" },
  listSub: { fontSize: 11, color: "#64748b" },
  listAmount: { fontSize: 15, fontWeight: 700, color: "#f59e0b" },
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase" },
  empty: { textAlign: "center", padding: 30, color: "#475569" },

  // Suppliers
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: 800, color: "#e2e8f0" },
  supplierCard: { background: "rgba(30,41,59,0.4)", border: "1px solid #1e293b", borderRadius: 14, padding: 16, marginBottom: 10 },
  supplierHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  supplierName: { fontSize: 16, fontWeight: 700, color: "#e2e8f0" },
  supplierSub: { fontSize: 12, color: "#64748b" },
  scoreCircle: { width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #ef4444)", display: "flex", alignItems: "center", justifyContent: "center" },
  scoreValue: { fontSize: 16, fontWeight: 900, color: "#0c0f1a" },
  miniStat: { background: "rgba(15,23,42,0.4)", borderRadius: 8, padding: "6px 10px", textAlign: "center" },
  miniStatLabel: { fontSize: 9, color: "#475569" },
  miniStatValue: { fontSize: 13, fontWeight: 700, color: "#e2e8f0" },

  // Forms
  fieldWrap: { marginBottom: 6 },
  label: { display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 },
  input: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #1e293b", background: "#0f172a", color: "#e2e8f0", fontSize: 13, fontFamily: "'Rubik', sans-serif", outline: "none" },

  // Buttons
  primaryBtn: { padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#0c0f1a", cursor: "pointer", fontSize: 13, fontWeight: 700 },
  secondaryBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  smallBtn: { padding: "6px 14px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  removeBtn: { padding: "6px 10px", borderRadius: 6, border: "1px solid #dc262630", background: "transparent", color: "#dc2626", cursor: "pointer", fontSize: 14 },

  // Toast
  toast: { position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", padding: "10px 24px", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, zIndex: 9999, animation: "fadeIn 0.3s", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" },
};
