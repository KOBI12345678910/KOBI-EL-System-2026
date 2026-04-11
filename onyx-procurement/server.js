/**
 * ONYX API SERVER
 * Express.js + Supabase + WhatsApp Business API
 * 
 * Setup:
 * 1. npm init -y
 * 2. npm install express @supabase/supabase-js dotenv cors
 * 3. Create .env file with credentials
 * 4. node server.js
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const https = require('https');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ═══ SUPABASE CLIENT ═══
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ═══ WHATSAPP CONFIG ═══
const WA_TOKEN = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// ═══════════════════════════════════════════════════════════════
// HELPER: WhatsApp sender
// ═══════════════════════════════════════════════════════════════

async function sendWhatsApp(to, message) {
  const data = JSON.stringify({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/[^0-9+]/g, ''),
    type: 'text',
    text: { preview_url: false, body: message },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: `/v21.0/${WA_PHONE_ID}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ success: res.statusCode === 200, messageId: parsed?.messages?.[0]?.id, status: res.statusCode });
        } catch { resolve({ success: false, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendSMS(to, message) {
  // Twilio SMS — if configured
  if (!process.env.TWILIO_SID) return { success: false, reason: 'Twilio not configured' };
  const sid = process.env.TWILIO_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const formData = `To=${encodeURIComponent(to)}&From=${encodeURIComponent(process.env.TWILIO_FROM)}&Body=${encodeURIComponent(message)}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${sid}/Messages.json`,
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ success: res.statusCode === 201, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(formData);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Audit log
// ═══════════════════════════════════════════════════════════════

async function audit(entityType, entityId, action, actor, detail, prev, next) {
  await supabase.from('audit_log').insert({
    entity_type: entityType, entity_id: entityId,
    action, actor, detail,
    previous_value: prev, new_value: next,
  });
}

// ═══════════════════════════════════════════════════════════════
// API: STATUS
// ═══════════════════════════════════════════════════════════════

app.get('/api/status', async (req, res) => {
  const { data: dashboard } = await supabase.from('procurement_dashboard').select('*').single();
  res.json({
    engine: 'ONYX Procurement System',
    version: '1.0.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
    dashboard: dashboard || {},
    whatsapp: !!WA_TOKEN ? 'configured' : 'not configured',
    supabase: 'connected',
  });
});


// ═══════════════════════════════════════════════════════════════
// API: SUPPLIERS — ספקים
// ═══════════════════════════════════════════════════════════════

// List all suppliers
app.get('/api/suppliers', async (req, res) => {
  const { data, error } = await supabase
    .from('supplier_dashboard')
    .select('*')
    .order('overall_score', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ suppliers: data });
});

// Get single supplier with products
app.get('/api/suppliers/:id', async (req, res) => {
  const { data: supplier } = await supabase.from('suppliers').select('*').eq('id', req.params.id).single();
  const { data: products } = await supabase.from('supplier_products').select('*').eq('supplier_id', req.params.id);
  const { data: priceHistory } = await supabase.from('price_history').select('*').eq('supplier_id', req.params.id).order('recorded_at', { ascending: false }).limit(50);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
  res.json({ supplier, products, priceHistory });
});

// Create supplier
app.post('/api/suppliers', async (req, res) => {
  const { data, error } = await supabase.from('suppliers').insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await audit('supplier', data.id, 'created', req.body.created_by || 'api', `ספק חדש: ${data.name}`);
  res.status(201).json({ supplier: data });
});

// Update supplier
app.patch('/api/suppliers/:id', async (req, res) => {
  const { data: prev } = await supabase.from('suppliers').select('*').eq('id', req.params.id).single();
  const { data, error } = await supabase.from('suppliers').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await audit('supplier', data.id, 'updated', req.body.updated_by || 'api', JSON.stringify(req.body), prev, data);
  res.json({ supplier: data });
});

// Add product to supplier
app.post('/api/suppliers/:id/products', async (req, res) => {
  const { data, error } = await supabase.from('supplier_products').insert({ ...req.body, supplier_id: req.params.id }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ product: data });
});

// Find suppliers by category
app.get('/api/suppliers/search/:category', async (req, res) => {
  const { data } = await supabase
    .from('supplier_products')
    .select('*, suppliers(*)')
    .eq('category', req.params.category);
  
  // Unique suppliers
  const suppliersMap = new Map();
  (data || []).forEach(p => {
    if (p.suppliers?.active) suppliersMap.set(p.suppliers.id, { ...p.suppliers, matchedProduct: p.name });
  });
  res.json({ suppliers: Array.from(suppliersMap.values()) });
});


// ═══════════════════════════════════════════════════════════════
// API: PURCHASE REQUESTS — בקשות רכש
// ═══════════════════════════════════════════════════════════════

app.post('/api/purchase-requests', async (req, res) => {
  const { items, ...requestData } = req.body;
  
  // Create request
  const { data: request, error } = await supabase
    .from('purchase_requests')
    .insert(requestData)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  // Create items
  if (items?.length) {
    const itemsWithRequestId = items.map(item => ({ ...item, request_id: request.id }));
    await supabase.from('purchase_request_items').insert(itemsWithRequestId);
  }

  await audit('purchase_request', request.id, 'created', requestData.requested_by, `בקשת רכש: ${items?.length || 0} פריטים`);
  res.status(201).json({ request, items });
});

app.get('/api/purchase-requests', async (req, res) => {
  const { data } = await supabase
    .from('purchase_requests')
    .select('*, purchase_request_items(*)')
    .order('created_at', { ascending: false });
  res.json({ requests: data });
});


// ═══════════════════════════════════════════════════════════════
// API: RFQ — שליחת בקשה לכל הספקים במכה אחת
// ═══════════════════════════════════════════════════════════════

app.post('/api/rfq/send', async (req, res) => {
  const { purchase_request_id, categories, response_window_hours, company_note } = req.body;

  // 1. Get the purchase request + items
  const { data: request } = await supabase
    .from('purchase_requests')
    .select('*, purchase_request_items(*)')
    .eq('id', purchase_request_id)
    .single();
  if (!request) return res.status(404).json({ error: 'Purchase request not found' });

  // 2. Find suppliers for these categories
  const cats = categories || [...new Set(request.purchase_request_items.map(i => i.category))];
  const { data: products } = await supabase
    .from('supplier_products')
    .select('supplier_id, suppliers(id, name, phone, whatsapp, email, preferred_channel, active)')
    .in('category', cats);

  const uniqueSuppliers = new Map();
  (products || []).forEach(p => {
    if (p.suppliers?.active) uniqueSuppliers.set(p.suppliers.id, p.suppliers);
  });
  const suppliers = Array.from(uniqueSuppliers.values());

  if (suppliers.length === 0) {
    return res.status(400).json({ error: `לא נמצאו ספקים לקטגוריות: ${cats.join(', ')}` });
  }

  // 3. Build RFQ message
  const deadline = new Date(Date.now() + (response_window_hours || 24) * 3600000);
  const rfqId = `RFQ-${Date.now().toString(36).toUpperCase()}`;
  
  const itemsList = request.purchase_request_items.map((item, i) =>
    `${i + 1}. ${item.name} — ${item.quantity} ${item.unit}${item.specs ? `\n   מפרט: ${item.specs}` : ''}`
  ).join('\n');

  const messageText = [
    `שלום רב,`,
    ``,
    `חברת טכנו כל עוזי בע"מ מבקשת הצעת מחיר:`,
    ``,
    itemsList,
    ``,
    `מספר בקשה: ${rfqId}`,
    `דדליין: ${deadline.toLocaleDateString('he-IL')} ${deadline.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`,
    ``,
    `נא לציין: מחיר ליחידה, סה"כ, משלוח, זמן אספקה, תנאי תשלום.`,
    company_note ? `\n${company_note}` : '',
    ``,
    `בברכה, טכנו כל עוזי בע"מ`,
  ].filter(Boolean).join('\n');

  // 4. Create RFQ in DB
  const { data: rfq } = await supabase.from('rfqs').insert({
    purchase_request_id,
    message_text: messageText,
    response_deadline: deadline.toISOString(),
    response_window_hours: response_window_hours || 24,
    status: 'sent',
  }).select().single();

  // 5. Send to all suppliers
  const results = [];
  for (const supplier of suppliers) {
    const channel = supplier.preferred_channel || 'whatsapp';
    const address = channel === 'whatsapp' ? (supplier.whatsapp || supplier.phone) : supplier.phone;
    
    let sendResult = { success: false };
    try {
      if (channel === 'whatsapp' && WA_TOKEN) {
        sendResult = await sendWhatsApp(address, messageText);
      } else if (channel === 'sms') {
        sendResult = await sendSMS(address, messageText);
      }
    } catch (err) {
      sendResult = { success: false, error: err.message };
    }

    // Record recipient
    await supabase.from('rfq_recipients').insert({
      rfq_id: rfq.id,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      sent_via: channel,
      delivered: sendResult.success,
      status: sendResult.success ? 'delivered' : 'sent',
    });

    results.push({
      supplier: supplier.name,
      channel,
      address,
      delivered: sendResult.success,
      messageId: sendResult.messageId,
    });
  }

  // Update purchase request status
  await supabase.from('purchase_requests').update({ status: 'rfq_sent' }).eq('id', purchase_request_id);

  await audit('rfq', rfq.id, 'sent', req.body.sent_by || 'api', `RFQ שנשלח ל-${suppliers.length} ספקים`);

  // Log system event
  await supabase.from('system_events').insert({
    type: 'rfq_sent', severity: 'info', source: 'procurement',
    message: `RFQ ${rfqId} נשלח ל-${results.filter(r => r.delivered).length}/${suppliers.length} ספקים`,
    data: { rfqId: rfq.id, supplierCount: suppliers.length, deliveredCount: results.filter(r => r.delivered).length },
  });

  res.status(201).json({
    rfq_id: rfq.id,
    rfq_code: rfqId,
    suppliers_contacted: suppliers.length,
    delivered: results.filter(r => r.delivered).length,
    deadline: deadline.toISOString(),
    results,
    message: `📤 נשלח ל-${results.filter(r => r.delivered).length}/${suppliers.length} ספקים`,
  });
});

// Get RFQ status
app.get('/api/rfq/:id', async (req, res) => {
  const { data: rfq } = await supabase.from('rfqs').select('*').eq('id', req.params.id).single();
  const { data: recipients } = await supabase.from('rfq_recipients').select('*').eq('rfq_id', req.params.id);
  const { data: quotes } = await supabase.from('supplier_quotes').select('*, quote_line_items(*)').eq('rfq_id', req.params.id);
  res.json({ rfq, recipients, quotes });
});

// List RFQs
app.get('/api/rfqs', async (req, res) => {
  const { data } = await supabase.from('rfq_summary').select('*').order('sent_at', { ascending: false });
  res.json({ rfqs: data });
});


// ═══════════════════════════════════════════════════════════════
// API: QUOTES — הזנת הצעות מחיר
// ═══════════════════════════════════════════════════════════════

app.post('/api/quotes', async (req, res) => {
  const { line_items, ...quoteData } = req.body;

  // Calculate totals
  const lineItems = (line_items || []).map(item => {
    const discountMult = item.discount_percent ? (1 - item.discount_percent / 100) : 1;
    return { ...item, total_price: Math.round(item.quantity * item.unit_price * discountMult) };
  });

  const subtotal = lineItems.reduce((s, i) => s + i.total_price, 0);
  const deliveryFee = quoteData.free_delivery ? 0 : (quoteData.delivery_fee || 0);
  const totalPrice = subtotal + deliveryFee;
  const vatAmount = quoteData.vat_included ? 0 : Math.round(totalPrice * 0.18);
  const totalWithVat = totalPrice + vatAmount;

  // Insert quote
  const { data: quote, error } = await supabase.from('supplier_quotes').insert({
    ...quoteData,
    total_price: totalPrice,
    vat_amount: vatAmount,
    total_with_vat: totalWithVat,
    delivery_fee: deliveryFee,
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });

  // Insert line items
  if (lineItems.length) {
    await supabase.from('quote_line_items').insert(lineItems.map(i => ({ ...i, quote_id: quote.id })));
  }

  // Update RFQ recipient status
  await supabase.from('rfq_recipients')
    .update({ status: 'quoted' })
    .eq('rfq_id', quoteData.rfq_id)
    .eq('supplier_id', quoteData.supplier_id);

  // Record price history
  for (const item of lineItems) {
    await supabase.from('price_history').insert({
      supplier_id: quoteData.supplier_id,
      product_key: item.name,
      price: item.unit_price,
      quantity: item.quantity,
      source: 'quote',
    });
  }

  await audit('quote', quote.id, 'received', quoteData.supplier_name, `הצעה: ₪${totalPrice.toLocaleString()} (${lineItems.length} פריטים)`);

  res.status(201).json({
    quote: { ...quote, line_items: lineItems },
    message: `📥 הצעה מ-${quoteData.supplier_name}: ₪${totalPrice.toLocaleString()}`,
  });
});


// ═══════════════════════════════════════════════════════════════
// API: DECIDE — AI בוחר את ההצעה הטובה ביותר
// ═══════════════════════════════════════════════════════════════

app.post('/api/rfq/:id/decide', async (req, res) => {
  const rfqId = req.params.id;
  const { price_weight, delivery_weight, rating_weight, reliability_weight } = req.body;

  // Weights
  const weights = {
    price: price_weight || 0.50,
    delivery: delivery_weight || 0.15,
    rating: rating_weight || 0.20,
    reliability: reliability_weight || 0.15,
  };

  // Get all quotes for this RFQ
  const { data: quotes } = await supabase
    .from('supplier_quotes')
    .select('*, quote_line_items(*)')
    .eq('rfq_id', rfqId);

  if (!quotes || quotes.length < 1) {
    return res.status(400).json({ error: 'אין הצעות מחיר — לא ניתן לקבל החלטה' });
  }

  // Get supplier details
  const supplierIds = quotes.map(q => q.supplier_id);
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('*')
    .in('id', supplierIds);

  const supplierMap = new Map(suppliers.map(s => [s.id, s]));

  // Score each quote
  const maxPrice = Math.max(...quotes.map(q => q.total_price));
  const minPrice = Math.min(...quotes.map(q => q.total_price));
  const maxDelivery = Math.max(...quotes.map(q => q.delivery_days), 1);
  const priceRange = maxPrice - minPrice || 1;

  const scored = quotes.map(quote => {
    const supplier = supplierMap.get(quote.supplier_id) || {};

    const priceScore = ((maxPrice - quote.total_price) / priceRange) * 100;
    const deliveryScore = Math.max(0, 100 - (quote.delivery_days / maxDelivery) * 100);
    const ratingScore = (supplier.rating || 5) * 10;
    const reliabilityScore = (supplier.delivery_reliability || 5) * 10;

    const weightedScore = Math.round(
      priceScore * weights.price +
      deliveryScore * weights.delivery +
      ratingScore * weights.rating +
      reliabilityScore * weights.reliability
    );

    return {
      quote_id: quote.id,
      supplier_id: quote.supplier_id,
      supplier_name: quote.supplier_name,
      total_price: quote.total_price,
      total_with_vat: quote.total_with_vat,
      delivery_fee: quote.delivery_fee,
      free_delivery: quote.free_delivery,
      delivery_days: quote.delivery_days,
      payment_terms: quote.payment_terms,
      supplier_rating: supplier.rating || 5,
      supplier_reliability: supplier.delivery_reliability || 5,
      price_score: Math.round(priceScore),
      delivery_score: Math.round(deliveryScore),
      rating_score: Math.round(ratingScore),
      reliability_score: Math.round(reliabilityScore),
      weighted_score: weightedScore,
    };
  });

  // Sort by score
  scored.sort((a, b) => b.weighted_score - a.weighted_score);
  scored.forEach((s, i) => s.rank = i + 1);

  const winner = scored[0];
  const winnerQuote = quotes.find(q => q.id === winner.quote_id);
  const savingsAmount = maxPrice - winner.total_price;
  const savingsPercent = maxPrice > 0 ? Math.round((savingsAmount / maxPrice) * 100 * 10) / 10 : 0;

  // Build reasoning
  const reasoning = [
    `📦 RFQ — ${quotes.length} הצעות התקבלו`,
    `---`,
    `📊 השוואה:`,
    ...scored.map(s => {
      const tag = s.rank === 1 ? '🏆' : `#${s.rank}`;
      return `${tag} ${s.supplier_name}: ₪${s.total_price.toLocaleString()} | ${s.delivery_days} ימים | דירוג ${s.supplier_rating}/10 | ציון: ${s.weighted_score}`;
    }),
    `---`,
    `🏆 נבחר: ${winner.supplier_name}`,
    `💵 עלות: ₪${winner.total_price.toLocaleString()} + מע"מ = ₪${winner.total_with_vat.toLocaleString()}`,
    `🚚 אספקה: ${winner.delivery_days} ימים${winner.free_delivery ? ' (משלוח חינם)' : ` + ₪${winner.delivery_fee} משלוח`}`,
    `✅ חיסכון: ₪${savingsAmount.toLocaleString()} (${savingsPercent}%) מול ההצעה היקרה`,
    `📊 משקלות: מחיר ${weights.price * 100}% | אספקה ${weights.delivery * 100}% | דירוג ${weights.rating * 100}% | אמינות ${weights.reliability * 100}%`,
  ];

  // Create Purchase Order
  const { data: po } = await supabase.from('purchase_orders').insert({
    rfq_id: rfqId,
    supplier_id: winner.supplier_id,
    supplier_name: winner.supplier_name,
    subtotal: winner.total_price - (winner.delivery_fee || 0),
    delivery_fee: winner.delivery_fee || 0,
    vat_amount: winnerQuote.vat_amount,
    total: winner.total_with_vat,
    payment_terms: winner.payment_terms,
    expected_delivery: new Date(Date.now() + winner.delivery_days * 86400000).toISOString().split('T')[0],
    source: 'rfq',
    status: 'draft',
    original_price: maxPrice,
    negotiated_savings: savingsAmount,
    requested_by: req.body.decided_by || 'system',
  }).select().single();

  // Copy line items to PO
  if (winnerQuote.quote_line_items?.length) {
    await supabase.from('po_line_items').insert(
      winnerQuote.quote_line_items.map(li => ({
        po_id: po.id,
        name: li.name,
        category: li.category,
        quantity: li.quantity,
        unit: li.unit,
        unit_price: li.unit_price,
        discount_percent: li.discount_percent || 0,
        total_price: li.total_price,
        lead_time_days: li.lead_time_days,
      }))
    );
  }

  // Save decision
  const { data: decision } = await supabase.from('procurement_decisions').insert({
    rfq_id: rfqId,
    purchase_order_id: po.id,
    selected_supplier_id: winner.supplier_id,
    selected_supplier_name: winner.supplier_name,
    selected_total_cost: winner.total_with_vat,
    highest_cost: maxPrice,
    savings_amount: savingsAmount,
    savings_percent: savingsPercent,
    reasoning,
    quotes_compared: quotes.length,
  }).select().single();

  // Update RFQ status
  await supabase.from('rfqs').update({ status: 'decided' }).eq('id', rfqId);

  // Update supplier stats
  await supabase.from('suppliers').update({
    total_orders: (supplierMap.get(winner.supplier_id)?.total_orders || 0) + 1,
    total_spent: (supplierMap.get(winner.supplier_id)?.total_spent || 0) + winner.total_price,
    last_order_date: new Date().toISOString(),
  }).eq('id', winner.supplier_id);

  await audit('procurement_decision', decision.id, 'decided', req.body.decided_by || 'AI', `בחר ${winner.supplier_name} — ₪${winner.total_price.toLocaleString()}`);

  res.json({
    decision_id: decision.id,
    purchase_order_id: po.id,
    winner: winner,
    all_quotes: scored,
    savings: { amount: savingsAmount, percent: savingsPercent },
    reasoning,
    message: `🏆 ${winner.supplier_name} נבחר — חיסכון ₪${savingsAmount.toLocaleString()} (${savingsPercent}%)`,
  });
});


// ═══════════════════════════════════════════════════════════════
// API: PURCHASE ORDERS — הזמנות רכש
// ═══════════════════════════════════════════════════════════════

app.get('/api/purchase-orders', async (req, res) => {
  const { data } = await supabase
    .from('purchase_orders')
    .select('*, po_line_items(*)')
    .order('created_at', { ascending: false });
  res.json({ orders: data });
});

app.get('/api/purchase-orders/:id', async (req, res) => {
  const { data } = await supabase.from('purchase_orders').select('*, po_line_items(*)').eq('id', req.params.id).single();
  res.json({ order: data });
});

// Approve PO
app.post('/api/purchase-orders/:id/approve', async (req, res) => {
  const { data } = await supabase.from('purchase_orders').update({
    status: 'approved',
    approved_by: req.body.approved_by,
    approved_at: new Date().toISOString(),
  }).eq('id', req.params.id).select().single();

  await audit('purchase_order', data.id, 'approved', req.body.approved_by, `PO approved: ₪${data.total}`);
  res.json({ order: data, message: '✅ הזמנה אושרה' });
});

// Send PO to supplier via WhatsApp
app.post('/api/purchase-orders/:id/send', async (req, res) => {
  const { data: po } = await supabase.from('purchase_orders').select('*, po_line_items(*)').eq('id', req.params.id).single();
  if (!po) return res.status(404).json({ error: 'PO not found' });

  const { data: supplier } = await supabase.from('suppliers').select('*').eq('id', po.supplier_id).single();

  const itemsList = po.po_line_items.map((item, i) =>
    `${i + 1}. ${item.name}\n   כמות: ${item.quantity} ${item.unit}\n   מחיר: ₪${item.unit_price} × ${item.quantity} = ₪${item.total_price.toLocaleString()}`
  ).join('\n');

  const message = [
    `══════════════════`,
    `📄 הזמנת רכש`,
    `══════════════════`,
    ``,
    `לכבוד: ${po.supplier_name}`,
    `תאריך: ${new Date().toLocaleDateString('he-IL')}`,
    ``,
    `── פריטים ──`,
    itemsList,
    ``,
    `סה"כ: ₪${po.subtotal.toLocaleString()}`,
    po.delivery_fee > 0 ? `משלוח: ₪${po.delivery_fee}` : 'משלוח: חינם',
    `מע"מ: ₪${po.vat_amount.toLocaleString()}`,
    `═══════════`,
    `סה"כ לתשלום: ₪${po.total.toLocaleString()}`,
    ``,
    `אספקה עד: ${po.expected_delivery}`,
    `תשלום: ${po.payment_terms}`,
    `כתובת: ${po.delivery_address}`,
    ``,
    `טכנו כל עוזי בע"מ`,
  ].join('\n');

  const address = supplier.whatsapp || supplier.phone;
  let sendResult = { success: false };

  if (WA_TOKEN && address) {
    sendResult = await sendWhatsApp(address, message);
  }

  await supabase.from('purchase_orders').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
  }).eq('id', po.id);

  await audit('purchase_order', po.id, 'sent', req.body.sent_by || 'api', `PO sent to ${po.supplier_name} via WhatsApp`);

  res.json({
    sent: sendResult.success,
    messageId: sendResult.messageId,
    message: sendResult.success ? `📤 הזמנה נשלחה ל-${po.supplier_name}` : '❌ שליחה נכשלה',
  });
});


// ═══════════════════════════════════════════════════════════════
// API: SUBCONTRACTORS — קבלני משנה
// ═══════════════════════════════════════════════════════════════

app.get('/api/subcontractors', async (req, res) => {
  const { data } = await supabase.from('subcontractors').select('*, subcontractor_pricing(*)').order('quality_rating', { ascending: false });
  res.json({ subcontractors: data });
});

app.post('/api/subcontractors', async (req, res) => {
  const { pricing, ...subData } = req.body;
  const { data, error } = await supabase.from('subcontractors').insert(subData).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (pricing?.length) {
    await supabase.from('subcontractor_pricing').insert(pricing.map(p => ({ ...p, subcontractor_id: data.id })));
  }
  res.status(201).json({ subcontractor: data });
});

// Set pricing
app.put('/api/subcontractors/:id/pricing', async (req, res) => {
  const { work_type, percentage_rate, price_per_sqm, minimum_price } = req.body;
  const { data, error } = await supabase.from('subcontractor_pricing').upsert({
    subcontractor_id: req.params.id, work_type, percentage_rate, price_per_sqm, minimum_price,
  }, { onConflict: 'subcontractor_id,work_type' }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ pricing: data });
});

// Decide: % vs sqm
app.post('/api/subcontractors/decide', async (req, res) => {
  const { work_type, project_value, area_sqm, project_name, client_name, price_weight, quality_weight, reliability_weight } = req.body;

  const wPrice = price_weight || 0.6;
  const wQuality = quality_weight || 0.25;
  const wReliability = reliability_weight || 0.15;

  // Find subcontractors with pricing for this work type
  const { data: pricingData } = await supabase
    .from('subcontractor_pricing')
    .select('*, subcontractors(*)')
    .eq('work_type', work_type);

  if (!pricingData?.length) return res.status(400).json({ error: `אין קבלנים ל-${work_type}` });

  const available = pricingData.filter(p => p.subcontractors?.available);
  if (!available.length) return res.status(400).json({ error: 'אין קבלנים זמינים' });

  // Calculate for each
  const candidates = available.map(p => {
    const sub = p.subcontractors;
    let costByPct = project_value * (p.percentage_rate / 100);
    let costBySqm = area_sqm * p.price_per_sqm;
    if (p.minimum_price) { costByPct = Math.max(costByPct, p.minimum_price); costBySqm = Math.max(costBySqm, p.minimum_price); }

    const bestMethod = costByPct <= costBySqm ? 'percentage' : 'per_sqm';
    const bestCost = Math.min(costByPct, costBySqm);

    const maxCost = Math.max(project_value * 0.5, area_sqm * 1000);
    const priceScore = Math.max(0, 100 - (bestCost / maxCost) * 100);
    const qualityScore = (sub.quality_rating / 10) * 100;
    const reliabilityScore = (sub.reliability_rating / 10) * 100;
    const finalScore = Math.round(priceScore * wPrice + qualityScore * wQuality + reliabilityScore * wReliability);

    return {
      subcontractor_id: sub.id, name: sub.name, phone: sub.phone,
      percentage_rate: p.percentage_rate, price_per_sqm: p.price_per_sqm,
      cost_by_percentage: Math.round(costByPct), cost_by_sqm: Math.round(costBySqm),
      best_method: bestMethod, best_cost: Math.round(bestCost),
      quality_rating: sub.quality_rating, reliability_rating: sub.reliability_rating,
      final_score: finalScore,
    };
  });

  candidates.sort((a, b) => b.final_score - a.final_score);
  const winner = candidates[0];
  const alternativeCost = winner.best_method === 'percentage' ? winner.cost_by_sqm : winner.cost_by_percentage;
  const savingsAmount = alternativeCost - winner.best_cost;
  const savingsPercent = alternativeCost > 0 ? Math.round((savingsAmount / alternativeCost) * 100 * 10) / 10 : 0;
  const grossProfit = project_value - winner.best_cost;
  const grossMargin = Math.round((grossProfit / project_value) * 100 * 10) / 10;

  const reasoning = [
    `📋 פרויקט: ${project_name || 'N/A'} | לקוח: ${client_name || 'N/A'}`,
    `💰 סכום: ₪${project_value.toLocaleString()} | שטח: ${area_sqm} מ"ר`,
    `---`,
    ...candidates.map((c, i) => {
      const tag = i === 0 ? '🏆' : `#${i + 1}`;
      return `${tag} ${c.name}: ₪${c.best_cost.toLocaleString()} (${c.best_method === 'percentage' ? `${c.percentage_rate}%` : `₪${c.price_per_sqm}/מ"ר`}) | ציון: ${c.final_score}`;
    }),
    `---`,
    `🏆 נבחר: ${winner.name}`,
    `📊 שיטה: ${winner.best_method === 'percentage' ? `אחוזים (${winner.percentage_rate}%)` : `מ"ר (₪${winner.price_per_sqm})`}`,
    `💵 עלות: ₪${winner.best_cost.toLocaleString()}`,
    `✅ חיסכון: ₪${savingsAmount.toLocaleString()} (${savingsPercent}%)`,
    `📈 רווח גולמי: ₪${grossProfit.toLocaleString()} (${grossMargin}%)`,
  ];

  // Save decision
  await supabase.from('subcontractor_decisions').insert({
    project_name, client_name, work_type, project_value, area_sqm,
    selected_subcontractor_id: winner.subcontractor_id,
    selected_subcontractor_name: winner.name,
    selected_pricing_method: winner.best_method,
    selected_cost: winner.best_cost,
    alternative_cost: alternativeCost,
    savings_amount: savingsAmount, savings_percent: savingsPercent,
    reasoning,
  });

  res.json({
    winner, candidates, reasoning,
    savings: { amount: savingsAmount, percent: savingsPercent },
    gross_profit: { amount: grossProfit, margin: grossMargin },
    message: `🏆 ${winner.name} — ₪${winner.best_cost.toLocaleString()} (חיסכון ${savingsPercent}%)`,
  });
});


// ═══════════════════════════════════════════════════════════════
// API: ANALYTICS — דוחות
// ═══════════════════════════════════════════════════════════════

app.get('/api/analytics/savings', async (req, res) => {
  const { data: procurementSavings } = await supabase
    .from('procurement_decisions')
    .select('savings_amount, savings_percent, selected_supplier_name, decided_at');
  
  const { data: subSavings } = await supabase
    .from('subcontractor_decisions')
    .select('savings_amount, savings_percent, selected_subcontractor_name, decided_at');

  const totalProcurement = (procurementSavings || []).reduce((s, d) => s + (d.savings_amount || 0), 0);
  const totalSubcontractor = (subSavings || []).reduce((s, d) => s + (d.savings_amount || 0), 0);

  res.json({
    total_savings: totalProcurement + totalSubcontractor,
    procurement: { total: totalProcurement, decisions: procurementSavings?.length || 0 },
    subcontractor: { total: totalSubcontractor, decisions: subSavings?.length || 0 },
    message: `💰 חיסכון כולל: ₪${(totalProcurement + totalSubcontractor).toLocaleString()}`,
  });
});

app.get('/api/analytics/spend-by-supplier', async (req, res) => {
  const { data } = await supabase
    .from('suppliers')
    .select('name, total_spent, total_orders, overall_score, risk_score')
    .gt('total_orders', 0)
    .order('total_spent', { ascending: false });
  res.json({ suppliers: data });
});

app.get('/api/analytics/spend-by-category', async (req, res) => {
  const { data } = await supabase
    .from('po_line_items')
    .select('category, total_price');
  
  const byCategory = {};
  (data || []).forEach(item => {
    byCategory[item.category] = (byCategory[item.category] || 0) + item.total_price;
  });

  res.json({ categories: Object.entries(byCategory).map(([cat, total]) => ({ category: cat, total })).sort((a, b) => b.total - a.total) });
});


// ═══════════════════════════════════════════════════════════════
// API: AUDIT LOG
// ═══════════════════════════════════════════════════════════════

app.get('/api/audit', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  res.json({ entries: data });
});


// ═══════════════════════════════════════════════════════════════
// WEBHOOK: WhatsApp incoming messages
// ═══════════════════════════════════════════════════════════════

app.get('/webhook/whatsapp', (req, res) => {
  // Verification challenge
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook/whatsapp', async (req, res) => {
  const body = req.body;
  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const messages = changes?.value?.messages;

  if (messages?.length) {
    for (const msg of messages) {
      const from = msg.from;
      const text = msg.text?.body || msg.type;
      
      // Log incoming message
      await supabase.from('system_events').insert({
        type: 'whatsapp_incoming',
        severity: 'info',
        source: 'whatsapp',
        message: `הודעה מ-${from}: ${text.slice(0, 200)}`,
        data: { from, text, messageId: msg.id, timestamp: msg.timestamp },
      });

      console.log(`📱 WhatsApp from ${from}: ${text.slice(0, 100)}`);
    }
  }

  res.sendStatus(200);
});


// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 ONYX PROCUREMENT API SERVER                            ║
║                                                              ║
║   Port: ${PORT}                                                ║
║   Supabase: ${process.env.SUPABASE_URL ? '✅ Connected' : '❌ Not configured'}                          ║
║   WhatsApp: ${WA_TOKEN ? '✅ Configured' : '❌ Not configured'}                          ║
║                                                              ║
║   Endpoints:                                                 ║
║   GET  /api/status                                           ║
║   GET  /api/suppliers                                        ║
║   POST /api/suppliers                                        ║
║   POST /api/purchase-requests                                ║
║   POST /api/rfq/send          ← שליחה לכל הספקים             ║
║   POST /api/quotes            ← הזנת הצעת מחיר               ║
║   POST /api/rfq/:id/decide   ← AI בוחר הכי טוב              ║
║   POST /api/purchase-orders/:id/approve                      ║
║   POST /api/purchase-orders/:id/send  ← שלח לספק             ║
║   POST /api/subcontractors/decide     ← % vs מ"ר             ║
║   GET  /api/analytics/savings                                ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
