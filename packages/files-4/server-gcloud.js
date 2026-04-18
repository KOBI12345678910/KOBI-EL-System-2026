/**
 * ONYX PROCUREMENT API SERVER — Google Cloud Edition
 * Cloud Run + Firestore
 * Project: onyx-system-493009
 */

const express = require('express');
const { Firestore } = require('@google-cloud/firestore');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const db = new Firestore();
const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';

// ═══ HELPERS ═══

async function sendWhatsApp(to, message) {
  if (!WA_TOKEN) return { success: false, reason: 'WhatsApp not configured' };
  const data = JSON.stringify({
    messaging_product: 'whatsapp', recipient_type: 'individual',
    to: to.replace(/[^0-9+]/g, ''), type: 'text', text: { preview_url: false, body: message },
  });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com', path: `/v21.0/${WA_PHONE_ID}/messages`, method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve({ success: res.statusCode === 200, messageId: JSON.parse(body)?.messages?.[0]?.id }); } catch { resolve({ success: false }); } });
    });
    req.on('error', () => resolve({ success: false }));
    req.write(data); req.end();
  });
}

async function audit(type, id, action, actor, detail) {
  await db.collection('audit_log').add({ entity_type: type, entity_id: id, action, actor, detail, created_at: new Date().toISOString() });
}

// ═══ STATUS ═══
app.get('/api/status', async (req, res) => {
  const s = await db.collection('suppliers').get();
  const o = await db.collection('purchase_orders').get();
  res.json({ engine: 'ONYX Procurement', version: '1.0.0-gcloud', status: 'operational', timestamp: new Date().toISOString(), counts: { suppliers: s.size, orders: o.size }, whatsapp: WA_TOKEN ? 'configured' : 'not configured', database: 'Firestore' });
});

// ═══ SUPPLIERS ═══
app.get('/api/suppliers', async (req, res) => {
  const snap = await db.collection('suppliers').where('active', '==', true).get();
  const suppliers = []; snap.forEach(d => suppliers.push({ id: d.id, ...d.data() }));
  suppliers.sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0));
  res.json({ suppliers });
});

app.get('/api/suppliers/:id', async (req, res) => {
  const doc = await db.collection('suppliers').doc(req.params.id).get();
  if (!doc.exists) return res.status(404).json({ error: 'Not found' });
  const ps = await db.collection('supplier_products').where('supplier_id', '==', req.params.id).get();
  const products = []; ps.forEach(d => products.push({ id: d.id, ...d.data() }));
  res.json({ supplier: { id: doc.id, ...doc.data() }, products });
});

app.post('/api/suppliers', async (req, res) => {
  const data = { ...req.body, active: true, overall_score: 70, total_orders: 0, total_spent: 0, risk_score: 30, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const ref = await db.collection('suppliers').add(data);
  await audit('supplier', ref.id, 'created', 'api', data.name);
  res.status(201).json({ supplier: { id: ref.id, ...data } });
});

app.post('/api/suppliers/:id/products', async (req, res) => {
  const data = { ...req.body, supplier_id: req.params.id, created_at: new Date().toISOString() };
  const ref = await db.collection('supplier_products').add(data);
  res.status(201).json({ product: { id: ref.id, ...data } });
});

app.get('/api/suppliers/search/:category', async (req, res) => {
  const ps = await db.collection('supplier_products').where('category', '==', req.params.category).get();
  const sids = new Set(); ps.forEach(d => sids.add(d.data().supplier_id));
  const suppliers = [];
  for (const sid of sids) { const sd = await db.collection('suppliers').doc(sid).get(); if (sd.exists && sd.data().active) suppliers.push({ id: sd.id, ...sd.data() }); }
  res.json({ suppliers });
});

// ═══ PURCHASE REQUESTS ═══
app.post('/api/purchase-requests', async (req, res) => {
  const { items, ...rd } = req.body;
  const data = { ...rd, status: 'draft', created_at: new Date().toISOString() };
  const ref = await db.collection('purchase_requests').add(data);
  const savedItems = [];
  for (const item of (items || [])) { const r = await db.collection('purchase_request_items').add({ ...item, request_id: ref.id }); savedItems.push({ id: r.id, ...item }); }
  res.status(201).json({ request: { id: ref.id, ...data }, items: savedItems });
});

app.get('/api/purchase-requests', async (req, res) => {
  const snap = await db.collection('purchase_requests').orderBy('created_at', 'desc').get();
  const reqs = [];
  for (const doc of snap.docs) { const is = await db.collection('purchase_request_items').where('request_id', '==', doc.id).get(); const items = []; is.forEach(d => items.push({ id: d.id, ...d.data() })); reqs.push({ id: doc.id, ...doc.data(), items }); }
  res.json({ requests: reqs });
});

// ═══ RFQ ═══
app.post('/api/rfq/send', async (req, res) => {
  const { purchase_request_id, response_window_hours, company_note } = req.body;
  const prDoc = await db.collection('purchase_requests').doc(purchase_request_id).get();
  if (!prDoc.exists) return res.status(404).json({ error: 'Not found' });

  const is = await db.collection('purchase_request_items').where('request_id', '==', purchase_request_id).get();
  const items = []; is.forEach(d => items.push({ id: d.id, ...d.data() }));
  const cats = [...new Set(items.map(i => i.category))];

  const sids = new Set();
  for (const cat of cats) { const ps = await db.collection('supplier_products').where('category', '==', cat).get(); ps.forEach(d => sids.add(d.data().supplier_id)); }
  const suppliers = [];
  for (const sid of sids) { const sd = await db.collection('suppliers').doc(sid).get(); if (sd.exists && sd.data().active) suppliers.push({ id: sd.id, ...sd.data() }); }
  if (!suppliers.length) return res.status(400).json({ error: 'לא נמצאו ספקים' });

  const deadline = new Date(Date.now() + (response_window_hours || 24) * 3600000);
  const code = `RFQ-${Date.now().toString(36).toUpperCase()}`;
  const itemsList = items.map((item, i) => `${i + 1}. ${item.name} — ${item.quantity} ${item.unit}${item.specs ? '\n   מפרט: ' + item.specs : ''}`).join('\n');
  const msg = `שלום רב,\n\nטכנו כל עוזי — בקשה להצעת מחיר:\n\n${itemsList}\n\nבקשה: ${code}\nדדליין: ${deadline.toLocaleDateString('he-IL')}\n\nנא לציין: מחיר, משלוח, זמן אספקה.\n${company_note || ''}\n\nבברכה, טכנו כל עוזי`;

  const rfqRef = await db.collection('rfqs').add({ purchase_request_id, message_text: msg, response_deadline: deadline.toISOString(), status: 'sent', sent_at: new Date().toISOString(), created_at: new Date().toISOString() });

  const results = [];
  for (const sup of suppliers) {
    let sr = { success: false }; if (WA_TOKEN) try { sr = await sendWhatsApp(sup.whatsapp || sup.phone, msg); } catch {}
    await db.collection('rfq_recipients').add({ rfq_id: rfqRef.id, supplier_id: sup.id, supplier_name: sup.name, delivered: sr.success, status: sr.success ? 'delivered' : 'sent', sent_at: new Date().toISOString() });
    results.push({ supplier: sup.name, delivered: sr.success });
  }

  await db.collection('purchase_requests').doc(purchase_request_id).update({ status: 'rfq_sent' });
  res.status(201).json({ rfq_id: rfqRef.id, rfq_code: code, suppliers_contacted: suppliers.length, delivered: results.filter(r => r.delivered).length, deadline: deadline.toISOString(), results, message: `📤 נשלח ל-${results.filter(r => r.delivered).length}/${suppliers.length} ספקים` });
});

app.get('/api/rfq/:id', async (req, res) => {
  const doc = await db.collection('rfqs').doc(req.params.id).get();
  const rs = await db.collection('rfq_recipients').where('rfq_id', '==', req.params.id).get();
  const qs = await db.collection('supplier_quotes').where('rfq_id', '==', req.params.id).get();
  const recipients = [], quotes = [];
  rs.forEach(d => recipients.push({ id: d.id, ...d.data() }));
  for (const qd of qs.docs) { const ls = await db.collection('quote_line_items').where('quote_id', '==', qd.id).get(); const lines = []; ls.forEach(l => lines.push({ id: l.id, ...l.data() })); quotes.push({ id: qd.id, ...qd.data(), line_items: lines }); }
  res.json({ rfq: doc.exists ? { id: doc.id, ...doc.data() } : null, recipients, quotes });
});

app.get('/api/rfqs', async (req, res) => {
  const snap = await db.collection('rfqs').orderBy('created_at', 'desc').get();
  const rfqs = [];
  for (const doc of snap.docs) { const qs = await db.collection('supplier_quotes').where('rfq_id', '==', doc.id).get(); rfqs.push({ rfq_id: doc.id, ...doc.data(), quotes_received: qs.size }); }
  res.json({ rfqs });
});

// ═══ QUOTES ═══
app.post('/api/quotes', async (req, res) => {
  const { line_items, ...qd } = req.body;
  const lines = (line_items || []).map(i => ({ ...i, total_price: Math.round(i.quantity * i.unit_price * (1 - (i.discount_percent || 0) / 100)) }));
  const sub = lines.reduce((s, i) => s + i.total_price, 0);
  const fee = qd.free_delivery ? 0 : (qd.delivery_fee || 0);
  const total = sub + fee; const vat = qd.vat_included ? 0 : Math.round(total * 0.18);

  const ref = await db.collection('supplier_quotes').add({ ...qd, total_price: total, vat_amount: vat, total_with_vat: total + vat, delivery_fee: fee, received_at: new Date().toISOString(), created_at: new Date().toISOString() });
  for (const l of lines) await db.collection('quote_line_items').add({ ...l, quote_id: ref.id });

  const rs = await db.collection('rfq_recipients').where('rfq_id', '==', qd.rfq_id).where('supplier_id', '==', qd.supplier_id).get();
  rs.forEach(d => d.ref.update({ status: 'quoted' }));

  res.status(201).json({ quote: { id: ref.id, total_price: total }, message: `📥 הצעה מ-${qd.supplier_name}: ₪${total.toLocaleString()}` });
});

// ═══ DECIDE ═══
app.post('/api/rfq/:id/decide', async (req, res) => {
  const rfqId = req.params.id;
  const w = { price: req.body.price_weight || 0.50, delivery: req.body.delivery_weight || 0.15, rating: req.body.rating_weight || 0.20, reliability: req.body.reliability_weight || 0.15 };

  const qs = await db.collection('supplier_quotes').where('rfq_id', '==', rfqId).get();
  if (qs.empty) return res.status(400).json({ error: 'אין הצעות' });

  const quotes = []; qs.forEach(d => quotes.push({ id: d.id, ...d.data() }));
  const maxP = Math.max(...quotes.map(q => q.total_price)), range = maxP - Math.min(...quotes.map(q => q.total_price)) || 1;
  const maxD = Math.max(...quotes.map(q => q.delivery_days), 1);

  const scored = [];
  for (const q of quotes) {
    const sd = await db.collection('suppliers').doc(q.supplier_id).get(); const s = sd.exists ? sd.data() : {};
    const ws = Math.round(((maxP - q.total_price) / range) * 100 * w.price + Math.max(0, 100 - q.delivery_days / maxD * 100) * w.delivery + (s.rating || 5) * 10 * w.rating + (s.delivery_reliability || 5) * 10 * w.reliability);
    scored.push({ ...q, supplier_rating: s.rating || 5, weighted_score: ws });
  }
  scored.sort((a, b) => b.weighted_score - a.weighted_score);
  scored.forEach((s, i) => s.rank = i + 1);

  const win = scored[0], sav = maxP - win.total_price, savP = maxP > 0 ? Math.round(sav / maxP * 1000) / 10 : 0;
  const reasoning = [`📦 ${quotes.length} הצעות`, '---', ...scored.map(s => `${s.rank === 1 ? '🏆' : '#' + s.rank} ${s.supplier_name}: ₪${s.total_price.toLocaleString()} | ציון: ${s.weighted_score}`), '---', `🏆 ${win.supplier_name}`, `✅ חיסכון: ₪${sav.toLocaleString()} (${savP}%)`];

  const poRef = await db.collection('purchase_orders').add({ rfq_id: rfqId, supplier_id: win.supplier_id, supplier_name: win.supplier_name, subtotal: win.total_price, vat_amount: Math.round(win.total_price * 0.18), total: win.total_with_vat, payment_terms: win.payment_terms || 'שוטף + 30', expected_delivery: new Date(Date.now() + win.delivery_days * 86400000).toISOString().split('T')[0], delivery_address: 'ריבל 37, תל אביב', source: 'rfq', status: 'draft', original_price: maxP, negotiated_savings: sav, created_at: new Date().toISOString() });

  await db.collection('procurement_decisions').add({ rfq_id: rfqId, purchase_order_id: poRef.id, selected_supplier_name: win.supplier_name, savings_amount: sav, savings_percent: savP, reasoning, decided_at: new Date().toISOString() });
  await db.collection('rfqs').doc(rfqId).update({ status: 'decided' });

  res.json({ purchase_order_id: poRef.id, winner: win, all_quotes: scored, savings: { amount: sav, percent: savP }, reasoning, message: `🏆 ${win.supplier_name} — חיסכון ₪${sav.toLocaleString()} (${savP}%)` });
});

// ═══ PURCHASE ORDERS ═══
app.get('/api/purchase-orders', async (req, res) => {
  const snap = await db.collection('purchase_orders').orderBy('created_at', 'desc').get();
  const orders = []; snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
  res.json({ orders });
});

app.post('/api/purchase-orders/:id/approve', async (req, res) => {
  await db.collection('purchase_orders').doc(req.params.id).update({ status: 'approved', approved_by: req.body.approved_by, approved_at: new Date().toISOString() });
  res.json({ message: '✅ אושר' });
});

app.post('/api/purchase-orders/:id/send', async (req, res) => {
  const doc = await db.collection('purchase_orders').doc(req.params.id).get();
  const po = doc.data(); const sd = await db.collection('suppliers').doc(po.supplier_id).get(); const sup = sd.data() || {};
  const msg = `📄 הזמנת רכש\n\nלכבוד: ${po.supplier_name}\nסה"כ: ₪${po.total.toLocaleString()}\nאספקה: ${po.expected_delivery}\nכתובת: ${po.delivery_address}\n\nטכנו כל עוזי`;
  let sr = { success: false }; if (WA_TOKEN) sr = await sendWhatsApp(sup.whatsapp || sup.phone, msg);
  await db.collection('purchase_orders').doc(req.params.id).update({ status: 'sent', sent_at: new Date().toISOString() });
  res.json({ sent: sr.success, message: sr.success ? '📤 נשלח' : '⚠️ נשמר (WhatsApp לא מוגדר)' });
});

// ═══ SUBCONTRACTORS ═══
app.get('/api/subcontractors', async (req, res) => {
  const snap = await db.collection('subcontractors').get();
  const subs = [];
  for (const doc of snap.docs) { const ps = await db.collection('subcontractor_pricing').where('subcontractor_id', '==', doc.id).get(); const pricing = []; ps.forEach(d => pricing.push({ id: d.id, ...d.data() })); subs.push({ id: doc.id, ...doc.data(), subcontractor_pricing: pricing }); }
  res.json({ subcontractors: subs });
});

app.post('/api/subcontractors/decide', async (req, res) => {
  const { work_type, project_value, area_sqm, project_name, client_name } = req.body;
  const ps = await db.collection('subcontractor_pricing').where('work_type', '==', work_type).get();
  if (ps.empty) return res.status(400).json({ error: `אין קבלנים ל-${work_type}` });

  const cands = [];
  for (const pd of ps.docs) {
    const p = pd.data(); const sd = await db.collection('subcontractors').doc(p.subcontractor_id).get();
    if (!sd.exists || !sd.data().available) continue; const sub = sd.data();
    let cP = project_value * p.percentage_rate / 100, cS = area_sqm * p.price_per_sqm;
    if (p.minimum_price) { cP = Math.max(cP, p.minimum_price); cS = Math.max(cS, p.minimum_price); }
    const best = cP <= cS ? 'percentage' : 'per_sqm', cost = Math.min(cP, cS);
    const score = Math.round((Math.max(0, 100 - cost / Math.max(project_value * 0.5, area_sqm * 1000) * 100)) * 0.6 + sub.quality_rating * 10 * 0.25 + sub.reliability_rating * 10 * 0.15);
    cands.push({ subcontractor_id: sd.id, name: sub.name, percentage_rate: p.percentage_rate, price_per_sqm: p.price_per_sqm, cost_by_percentage: Math.round(cP), cost_by_sqm: Math.round(cS), best_method: best, best_cost: Math.round(cost), quality_rating: sub.quality_rating, reliability_rating: sub.reliability_rating, final_score: score });
  }
  if (!cands.length) return res.status(400).json({ error: 'אין קבלנים זמינים' });

  cands.sort((a, b) => b.final_score - a.final_score);
  const w = cands[0], alt = w.best_method === 'percentage' ? w.cost_by_sqm : w.cost_by_percentage;
  const sav = alt - w.best_cost, savP = alt > 0 ? Math.round(sav / alt * 1000) / 10 : 0;
  const gp = project_value - w.best_cost, gm = Math.round(gp / project_value * 1000) / 10;

  const reasoning = [`📋 ${project_name || ''} | ${client_name || ''}`, `💰 ₪${project_value.toLocaleString()} | ${area_sqm} מ"ר`, '---', ...cands.map((c, i) => `${i === 0 ? '🏆' : '#' + (i + 1)} ${c.name}: ₪${c.best_cost.toLocaleString()} | ציון: ${c.final_score}`), '---', `✅ חיסכון: ₪${sav.toLocaleString()} (${savP}%)`, `📈 רווח: ₪${gp.toLocaleString()} (${gm}%)`];

  await db.collection('subcontractor_decisions').add({ project_name, client_name, work_type, project_value, area_sqm, selected_subcontractor_name: w.name, selected_cost: w.best_cost, savings_amount: sav, savings_percent: savP, reasoning, decided_at: new Date().toISOString() });

  res.json({ winner: w, candidates: cands, reasoning, savings: { amount: sav, percent: savP }, gross_profit: { amount: gp, margin: gm }, message: `🏆 ${w.name} — ₪${w.best_cost.toLocaleString()} (חיסכון ${savP}%)` });
});

// ═══ ANALYTICS ═══
app.get('/api/analytics/savings', async (req, res) => {
  const ps = await db.collection('procurement_decisions').get(); const ss = await db.collection('subcontractor_decisions').get();
  let pt = 0, st = 0; ps.forEach(d => pt += d.data().savings_amount || 0); ss.forEach(d => st += d.data().savings_amount || 0);
  res.json({ total_savings: pt + st, procurement: { total: pt, decisions: ps.size }, subcontractor: { total: st, decisions: ss.size } });
});

app.get('/api/audit', async (req, res) => {
  const snap = await db.collection('audit_log').orderBy('created_at', 'desc').limit(50).get();
  const entries = []; snap.forEach(d => entries.push({ id: d.id, ...d.data() }));
  res.json({ entries });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 ONYX API — Port ${PORT}`));
