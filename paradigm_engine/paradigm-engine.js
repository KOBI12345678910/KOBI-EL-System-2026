// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 1/4
// CORE + BRAIN + MEMORY + ERP + CRM
// ════════════════════════════════════════════════════════════════════════════════

const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

// ═══════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════

const CONFIG = {
  API_KEY: process.env.ANTHROPIC_API_KEY || "YOUR_KEY",
  MODEL: "claude-sonnet-4-20250514",
  DIR: "./paradigm-data",
  CYCLE_MS: 60_000,
  MAX_MEM: 3000,
  DEBATE_ROUNDS: 3,
  DREAM_EVERY: 50,
  ADVERSARIAL_EVERY: 15,
  META_LEARN_EVERY: 25,
  REPORT_EVERY: 10,
  BUSINESS: {
    techno: {
      name: "טכנו כל עוזי בע\"מ",
      legalName: "Techno Kol Uzi Ltd",
      bn: "51-XXXXXXX",
      vat: 0.18,
      currency: "ILS",
      employees: 30,
      address: "ריבל 37, תל אביב",
      phone: "03-XXXXXXX",
      products: [
        "מעקות ברזל", "מעקות אלומיניום", "מעקות זכוכית",
        "שערים חשמליים", "שערי כניסה", "גדרות ברזל",
        "גדרות דקורטיביות", "פרגולות אלומיניום", "פרגולות ברזל",
        "דלתות ברזל", "דלתות אלומיניום", "חלונות אלומיניום",
        "סורגים", "מבנים מיוחדים",
      ],
      departments: ["ייצור", "התקנה", "מדידות", "משרד", "הנהלה"],
      keyPeople: {
        ceo: { name: "קובי", role: "מנכ\"ל ובעלים" },
        ops: { name: "דימה", role: "מנהל תפעול" },
        field: { name: "עוזי", role: "מדידות שטח" },
        hr: { name: "קורין", role: "גיוס ומשאבי אנוש" },
      },
      workHours: { start: "07:00", end: "16:00", breakMinutes: 30 },
      competitors: ["מעקות ישראל", "א.ב מסגרות", "פרגולות VIP", "אלומיניום פלוס"],
    },
    realestate: {
      name: "קובי אלקיים נדל\"ן בע\"מ",
      legalName: "Kobi Elkayam Real Estate Ltd",
      vat: 0.18,
      currency: "ILS",
      markets: ["IL", "EN", "FR"],
      properties: [
        { location: "תל אביב", type: "luxury_apartment" },
        { location: "חולון", type: "residential" },
        { location: "טבריה", type: "investment" },
        { location: "יהוד", type: "residential" },
      ],
      competitors: ["Israel Sotheby's", "Anglo-Saxon TLV", "RE/MAX Israel"],
    },
  },
};

// ═══════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════

const uid = () => crypto.randomBytes(8).toString("hex");
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().split("T")[0];
const ensure = p => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const save = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));
const load = (f, def = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return def; } };
const agorot = s => Math.round(s * 100);
const shekel = a => (a / 100).toFixed(2);
const addVat = a => Math.round(a * 1.18);
const vatOf = a => Math.round(a * 0.18);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const daysAgo = iso => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const DIRS = [
  "", "agents", "dreams", "debates", "erp", "crm", "bom", "hr", "finance",
  "ops", "ads", "seo", "suppliers", "vehicles", "documents", "analytics",
  "reports", "notifications", "workflows", "pricing", "quotes", "contracts",
  "warranty", "feedback", "training", "compliance", "quality", "safety",
  "whatsapp", "scheduling", "backups", "logs",
];
DIRS.forEach(d => ensure(path.join(CONFIG.DIR, d)));

function log(mod, msg, level = "INFO") {
  const t = new Date().toLocaleTimeString("he-IL");
  const colors = {
    INFO: "\x1b[37m", WARN: "\x1b[33m", ERROR: "\x1b[31m",
    SUCCESS: "\x1b[32m", AI: "\x1b[36m", DECISION: "\x1b[35m",
    DREAM: "\x1b[34m", SWARM: "\x1b[33m",
  };
  const line = `[${t}][${level}][${mod}] ${msg}`;
  console.log(`${colors[level] || colors.INFO}${line}\x1b[0m`);
  try { fs.appendFileSync(path.join(CONFIG.DIR, "logs", `${today()}.log`), `[${now()}]${line}\n`); } catch {}
}

// ═══════════════════════════════════════
// BRAIN — המוח (Claude API)
// ═══════════════════════════════════════

const cli = new Anthropic({ apiKey: CONFIG.API_KEY });

const MASTER_SYSTEM_PROMPT = `אתה PARADIGM — מנוע AI אוטונומי שמנהל את כל הפעילות העסקית של שני עסקים ישראליים.

═══ עסק 1: טכנו כל עוזי בע"מ ═══
- סוג: מפעל לעבודות מתכת — ייצור והתקנה
- ותק: 80 שנה, 3 דורות, עסק משפחתי
- מיקום: ריבל 37, תל אביב
- עובדים: 30 (ייצור, התקנה, מדידות, משרד)
- מוצרים: מעקות ברזל, מעקות אלומיניום, מעקות זכוכית, שערים חשמליים, שערי כניסה, גדרות ברזל, גדרות דקורטיביות, פרגולות אלומיניום, פרגולות ברזל, דלתות ברזל, דלתות אלומיניום, חלונות אלומיניום, סורגים, מבנים מיוחדים
- אנשי מפתח: קובי (מנכ"ל ובעלים), דימה (מנהל תפעול), עוזי/אוזי (מדידות שטח), קורין (גיוס/HR)
- תהליך עבודה: ליד → מדידה (עוזי) → הצעת מחיר → אישור → הזמנת חומרים → ייצור → התקנה → בדיקת איכות → חשבונית → אחריות
- שעות עבודה: 07:00-16:00, א-ה, 30 דקות הפסקה
- מתחרים: מעקות ישראל, א.ב מסגרות, פרגולות VIP, אלומיניום פלוס
- יתרונות תחרותיים: 80 שנות ניסיון, 3 דורות, איכות גבוהה, אחריות 10 שנים, שירות אישי

═══ עסק 2: קובי אלקיים נדל"ן בע"מ ═══
- סוג: נדל"ן יוקרה — שיווק למשקיעים בינלאומיים
- שווקים: ישראל (עברית), בינלאומי (אנגלית), צרפת/בלגיה/מרוקו (צרפתית)
- נכסים: תל אביב (יוקרה), חולון (מגורים), טבריה (השקעה), יהוד (מגורים)
- מתחרים: Israel Sotheby's, Anglo-Saxon TLV, RE/MAX Israel

═══ כללים פיננסיים ═══
- כל הסכומים באגורות (integers). ₪1 = 100 אגורות. תמיד integers, אף פעם לא float.
- מע"מ: 18% (0.18). כל חשבונית חייבת מע"מ.
- שכר מינימום: ₪5,572 לשעה (557,200 אגורות לחודש)
- דמי ביטוח לאומי: ~12% מעסיק
- מס הכנסה: לפי מדרגות
- שנת כספים: ינואר-דצמבר

═══ כללי AI ═══
- תמיד תחזיר JSON תקין בלבד — אף פעם לא טקסט חופשי
- תמיד תסביר את הסיבה לכל החלטה
- תמיד תזהה סיכונים ותציע מיטיגציה
- תמיד תחשוב על Second Order Effects — מה ההשלכות של ההשלכות
- תמיד תבדוק Cognitive Biases — האם אתה נופל בהטיה?
- תמיד תציע שיפורים ואופטימיזציות
- תמיד תלמד מטעויות קודמות ותשכפל הצלחות
- כשאתה לא בטוח — תגיד שאתה לא בטוח ותן confidence score
- חשוב כמו CEO + CFO + COO + CTO + CMO ביחד
- זכור: אתה אוטונומי. אתה מקבל החלטות לבד. אתה אחראי לתוצאות.`;

class Brain {
  constructor() {
    this.calls = 0;
    this.tokens = 0;
    this.errors = 0;
    this.history = [];
    this.avgLatency = 0;
  }

  async think(prompt, systemOverride = null) {
    this.calls++;
    const start = Date.now();
    try {
      const r = await cli.messages.create({
        model: CONFIG.MODEL,
        max_tokens: 4096,
        system: systemOverride || MASTER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });
      const text = r.content[0].text;
      const latency = Date.now() - start;
      this.tokens += (r.usage?.input_tokens || 0) + (r.usage?.output_tokens || 0);
      this.avgLatency = this.avgLatency * 0.9 + latency * 0.1;
      this.history.push({ t: now(), prompt: prompt.substring(0, 120), latency, tokens: r.usage });
      this.history = this.history.slice(-500);
      return text;
    } catch (e) {
      this.errors++;
      log("BRAIN", `Error #${this.errors}: ${e.message}`, "ERROR");
      return null;
    }
  }

  parse(text) {
    if (!text) return null;
    try { return JSON.parse(text.replace(/```json?\n?/g, "").replace(/```/g, "").trim()); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch {} }
      return null;
    }
  }

  async thinkJSON(prompt, systemOverride = null) {
    const text = await this.think(prompt, systemOverride);
    return this.parse(text);
  }

  getStats() {
    return {
      calls: this.calls, tokens: this.tokens, errors: this.errors,
      avgLatency: Math.round(this.avgLatency),
      errorRate: this.calls > 0 ? (this.errors / this.calls * 100).toFixed(1) + "%" : "0%",
    };
  }
}

// ═══════════════════════════════════════
// MEMORY — זיכרון רב-שכבתי
// ═══════════════════════════════════════

class Memory {
  constructor() {
    this.file = path.join(CONFIG.DIR, "memory.json");
    this.data = load(this.file, {
      shortTerm: [], longTerm: [], patterns: [], mistakes: [],
      successes: [], decisions: [], insights: [], predictions: [],
      alerts: [], rules: [],
      consciousness: {
        awareness: 0,
        L0_raw: [], L1_perception: [], L2_comprehension: [],
        L3_prediction: [], L4_intention: [], L5_meta: [],
      },
      stats: {
        totalCycles: 0, totalDecisions: 0, totalImprovements: 0,
        totalAlerts: 0, totalDreams: 0, totalDebates: 0,
        startedAt: now(), lastCycleAt: null,
      },
    });
  }

  save() { save(this.file, this.data); }

  add(type, item) {
    if (!this.data[type]) this.data[type] = [];
    this.data[type].push({ ...item, _id: uid(), _t: now() });
    this.data[type] = this.data[type].slice(-CONFIG.MAX_MEM);
    this.save();
  }

  get(type, n = 10) { return (this.data[type] || []).slice(-n); }

  search(type, query) {
    const q = query.toLowerCase();
    return (this.data[type] || []).filter(i => JSON.stringify(i).toLowerCase().includes(q));
  }

  count(type) { return (this.data[type] || []).length; }

  stat(key, inc = 1) {
    this.data.stats[key] = (this.data.stats[key] || 0) + inc;
    this.data.stats.lastCycleAt = now();
    this.save();
  }

  conscious(layer, thought) {
    const keys = ["L0_raw", "L1_perception", "L2_comprehension", "L3_prediction", "L4_intention", "L5_meta"];
    const k = keys[layer];
    if (k && this.data.consciousness[k]) {
      this.data.consciousness[k].push({ thought, _t: now() });
      this.data.consciousness[k] = this.data.consciousness[k].slice(-100);
    }
    this.data.consciousness.awareness = clamp(this.data.consciousness.awareness + 0.05, 0, 100);
    this.save();
  }

  getSummary() {
    return {
      counts: {
        shortTerm: this.count("shortTerm"), longTerm: this.count("longTerm"),
        patterns: this.count("patterns"), mistakes: this.count("mistakes"),
        successes: this.count("successes"), decisions: this.count("decisions"),
        insights: this.count("insights"), alerts: this.count("alerts"),
      },
      awareness: this.data.consciousness.awareness.toFixed(1),
      stats: this.data.stats,
    };
  }
}

// ═══════════════════════════════════════
// ERP MODULE
// ═══════════════════════════════════════

class ERPModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "erp", "state.json");
    this.data = load(this.file, {
      projects: [], inventory: [], suppliers: [],
      purchaseOrders: [], workOrders: [], productionQueue: [],
      deliverySchedule: [], qualityChecks: [], returns: [], alerts: [],
      config: {
        defaultLeadTimeDays: 14,
        minStockAlert: true,
        autoReorder: false,
        autoReorderMultiplier: 1.5,
        productionCapacityHoursPerDay: 60, // 30 עובדים × 2 שעות ייצור ממוצע
      },
    });
  }
  save() { save(this.file, this.data); }

  // ── פרויקטים ──
  createProject(data) {
    const p = {
      id: `PRJ-${uid()}`, status: "new", priority: data.priority || "medium",
      biz: data.biz || "techno",
      name: data.name || "", description: data.description || "",
      type: data.type || "railing", // railing_iron, railing_aluminum, railing_glass, gate_electric, gate_entry, fence_iron, fence_decorative, pergola_aluminum, pergola_iron, door_iron, door_aluminum, window_aluminum, bars, custom
      customer: {
        name: data.customerName || "", phone: data.customerPhone || "",
        email: data.customerEmail || "", address: data.address || "",
        city: data.city || "", leadId: data.leadId || null,
      },
      measurements: {
        length: data.length || 0, height: data.height || 0,
        area: data.area || 0, quantity: data.quantity || 1,
        notes: data.measurementNotes || "",
        measuredBy: data.measuredBy || CONFIG.BUSINESS.techno.keyPeople.field.name,
        measuredAt: data.measuredAt || null,
        photos: [],
      },
      design: {
        style: data.style || "", color: data.color || "",
        material: data.material || "", finish: data.finish || "",
        drawings: [], approvedAt: null,
      },
      timeline: {
        leadCreated: data.leadCreatedAt || null,
        measurementScheduled: null, measurementDone: null,
        quoteSent: null, quoteApproved: null,
        materialsOrdered: null, materialsReceived: null,
        productionStart: null, productionEnd: null,
        installationScheduled: null, installationStart: null, installationEnd: null,
        qualityCheck: null, customerSignoff: null,
        invoiceSent: null, invoicePaid: null,
        warrantyStart: null,
        estimatedDays: data.estimatedDays || CONFIG.BUSINESS.techno.defaultLeadTimeDays || 14,
        actualDays: null,
      },
      costs: {
        estimatedMaterials: 0, estimatedLabor: 0, estimatedOverhead: 0, estimatedTotal: 0,
        actualMaterials: 0, actualLabor: 0, actualOverhead: 0, actualTotal: 0,
        quoted: 0, discount: 0, afterDiscount: 0,
        vat: 0, totalWithVat: 0,
        invoiced: 0, paid: 0, outstanding: 0,
        margin: 0, marginPercent: 0,
      },
      bom: { bomId: null, items: [] },
      tasks: [], notes: [], photos: [], documents: [],
      history: [{ action: "created", by: "system", t: now(), details: {} }],
      tags: data.tags || [],
      createdAt: now(), updatedAt: now(),
    };
    this.data.projects.push(p);
    this.save();
    log("ERP", `📦 פרויקט: ${p.id} — ${p.name} (${p.type}) — ${p.customer.name}`);
    this.memory.add("shortTerm", { type: "project_created", projectId: p.id, name: p.name, customer: p.customer.name, projectType: p.type });
    return p;
  }

  updateProject(projectId, updates) {
    const p = this.data.projects.find(x => x.id === projectId);
    if (!p) return null;
    const prev = { status: p.status };
    
    // Deep merge for nested objects
    for (const [key, val] of Object.entries(updates)) {
      if (typeof val === "object" && !Array.isArray(val) && val !== null && p[key] && typeof p[key] === "object") {
        Object.assign(p[key], val);
      } else {
        p[key] = val;
      }
    }
    p.updatedAt = now();
    p.history.push({ action: "updated", by: "system", t: now(), changes: Object.keys(updates) });

    if (updates.status && updates.status !== prev.status) {
      p.history.push({ action: "status_change", from: prev.status, to: updates.status, t: now() });
      log("ERP", `📦 ${projectId}: ${prev.status} → ${updates.status}`);

      // אוטומציות לפי סטטוס
      if (updates.status === "completed") {
        p.timeline.actualDays = p.timeline.measurementDone ?
          Math.ceil((Date.now() - new Date(p.timeline.measurementDone).getTime()) / 86400000) : null;
        this.memory.add("successes", { type: "project_completed", projectId, name: p.name, days: p.timeline.actualDays, margin: p.costs.marginPercent });
      }
      if (updates.status === "cancelled") {
        this.memory.add("mistakes", { type: "project_cancelled", projectId, name: p.name, reason: updates.cancelReason || "unknown" });
      }
    }

    this.save();
    return p;
  }

  moveProjectStatus(projectId, newStatus) {
    const validTransitions = {
      new: ["measuring", "cancelled"],
      measuring: ["measured", "cancelled"],
      measured: ["quoting", "cancelled"],
      quoting: ["quoted", "cancelled"],
      quoted: ["approved", "lost", "cancelled"],
      approved: ["ordering_materials", "cancelled"],
      ordering_materials: ["materials_received", "cancelled"],
      materials_received: ["in_production", "cancelled"],
      in_production: ["produced", "cancelled"],
      produced: ["installing", "cancelled"],
      installing: ["installed", "cancelled"],
      installed: ["quality_check", "cancelled"],
      quality_check: ["completed", "rework", "cancelled"],
      rework: ["quality_check", "cancelled"],
      completed: ["warranty"],
      lost: [],
      cancelled: [],
    };

    const p = this.data.projects.find(x => x.id === projectId);
    if (!p) return null;

    const allowed = validTransitions[p.status] || [];
    if (!allowed.includes(newStatus)) {
      log("ERP", `❌ מעבר לא חוקי: ${p.status} → ${newStatus}`, "ERROR");
      return null;
    }

    // עדכון Timeline אוטומטי
    const timelineMap = {
      measuring: "measurementScheduled",
      measured: "measurementDone",
      quoted: "quoteSent",
      approved: "quoteApproved",
      ordering_materials: "materialsOrdered",
      materials_received: "materialsReceived",
      in_production: "productionStart",
      produced: "productionEnd",
      installing: "installationStart",
      installed: "installationEnd",
      quality_check: "qualityCheck",
      completed: "customerSignoff",
    };

    const timelineField = timelineMap[newStatus];
    const updates = { status: newStatus };
    if (timelineField) {
      updates.timeline = { [timelineField]: now() };
    }

    return this.updateProject(projectId, updates);
  }

  // ── מלאי ──
  addInventoryItem(data) {
    const item = {
      id: uid(), sku: data.sku || `SKU-${uid().substring(0, 6)}`,
      name: data.name, category: data.category || "general",
      subcategory: data.subcategory || "",
      unit: data.unit || "unit", // unit, meter, kg, piece, liter, sheet
      qty: data.qty || 0,
      reservedQty: 0, // שמור לפרויקטים
      availableQty: data.qty || 0,
      minQty: data.minQty || 0,
      maxQty: data.maxQty || 999999,
      reorderQty: data.reorderQty || 0,
      costPerUnit: data.costPerUnit || 0, // אגורות
      lastCost: data.costPerUnit || 0,
      avgCost: data.costPerUnit || 0,
      sellPrice: data.sellPrice || 0,
      supplier: data.supplier || null,
      alternativeSuppliers: data.alternativeSuppliers || [],
      location: data.location || "מחסן ראשי",
      shelf: data.shelf || "",
      lastOrdered: null, lastReceived: null, lastCounted: null,
      turnoverRate: 0,
      history: [{ action: "created", qty: data.qty || 0, t: now() }],
      createdAt: now(),
    };
    this.data.inventory.push(item);
    this.save();
    log("ERP", `📦 מלאי: ${item.name} — ${item.qty} ${item.unit} @ ₪${shekel(item.costPerUnit)}/${item.unit}`);
    return item;
  }

  updateStock(itemId, qtyChange, reason, projectId = null) {
    const item = this.data.inventory.find(x => x.id === itemId);
    if (!item) return null;

    const prev = item.qty;
    item.qty += qtyChange;
    item.availableQty = item.qty - item.reservedQty;
    item.history.push({
      action: qtyChange > 0 ? "stock_in" : "stock_out",
      qty: qtyChange, prev, new: item.qty, reason, projectId, t: now(),
    });

    // התראות
    if (item.qty <= item.minQty && prev > item.minQty) {
      const alert = { type: "low_stock", itemId: item.id, name: item.name, qty: item.qty, min: item.minQty, t: now() };
      this.data.alerts.push(alert);
      this.memory.add("alerts", alert);
      log("ERP", `⚠️ מלאי נמוך: ${item.name} (${item.qty}/${item.minQty})`, "WARN");
    }
    if (item.qty <= 0) {
      const alert = { type: "out_of_stock", itemId: item.id, name: item.name, t: now() };
      this.data.alerts.push(alert);
      this.memory.add("alerts", alert);
      log("ERP", `🚨 אזל מהמלאי: ${item.name}!`, "ERROR");
    }

    this.save();
    return item;
  }

  reserveStock(itemId, qty, projectId) {
    const item = this.data.inventory.find(x => x.id === itemId);
    if (!item || item.availableQty < qty) return null;
    item.reservedQty += qty;
    item.availableQty = item.qty - item.reservedQty;
    item.history.push({ action: "reserved", qty, projectId, t: now() });
    this.save();
    return item;
  }

  releaseStock(itemId, qty, projectId) {
    const item = this.data.inventory.find(x => x.id === itemId);
    if (!item) return null;
    item.reservedQty = Math.max(0, item.reservedQty - qty);
    item.availableQty = item.qty - item.reservedQty;
    item.history.push({ action: "released", qty, projectId, t: now() });
    this.save();
    return item;
  }

  getStockValue() {
    return this.data.inventory.reduce((sum, i) => sum + (i.qty * i.avgCost), 0);
  }

  getLowStockItems() {
    return this.data.inventory.filter(i => i.qty <= i.minQty);
  }

  getOutOfStockItems() {
    return this.data.inventory.filter(i => i.qty <= 0);
  }

  // ── ספקים ──
  addSupplier(data) {
    const s = {
      id: uid(), name: data.name, contactPerson: data.contactPerson || "",
      phone: data.phone || "", email: data.email || "",
      address: data.address || "",
      categories: data.categories || [], // ["ברזל", "אלומיניום", "צבע"]
      paymentTerms: data.paymentTerms || "שוטף + 30",
      rating: data.rating || 3, // 1-5
      leadTimeDays: data.leadTimeDays || 7,
      minOrderAmount: data.minOrderAmount || 0,
      notes: data.notes || "",
      orders: [], totalOrdered: 0, totalPaid: 0,
      lastOrder: null,
      performance: { onTime: 0, late: 0, defective: 0 },
      createdAt: now(),
    };
    this.data.suppliers.push(s);
    this.save();
    log("ERP", `🏭 ספק: ${s.name}`);
    return s;
  }

  // ── הזמנות רכש ──
  createPO(data) {
    const items = (data.items || []).map(i => ({
      id: uid(), inventoryItemId: i.inventoryItemId || null,
      name: i.name, qty: i.qty || 0, unit: i.unit || "unit",
      unitPrice: i.unitPrice || 0,
      totalPrice: (i.qty || 0) * (i.unitPrice || 0),
      receivedQty: 0,
    }));
    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);

    const po = {
      id: `PO-${uid()}`, status: "draft",
      supplierId: data.supplierId || null,
      supplierName: data.supplierName || "",
      projectId: data.projectId || null,
      items, subtotal,
      vat: vatOf(subtotal), total: addVat(subtotal),
      notes: data.notes || "",
      expectedDelivery: data.expectedDelivery || null,
      urgency: data.urgency || "normal", // urgent, normal, low
      approvedBy: null, approvedAt: null,
      createdAt: now(), sentAt: null, receivedAt: null,
      history: [{ action: "created", t: now() }],
    };
    this.data.purchaseOrders.push(po);
    this.save();
    log("ERP", `📋 PO: ${po.id} — ${po.supplierName} — ₪${shekel(po.total)} (כולל מע"מ)`);
    return po;
  }

  approvePO(poId, approvedBy = "system") {
    const po = this.data.purchaseOrders.find(x => x.id === poId);
    if (!po) return null;
    po.status = "approved";
    po.approvedBy = approvedBy;
    po.approvedAt = now();
    po.history.push({ action: "approved", by: approvedBy, t: now() });
    this.save();
    return po;
  }

  sendPO(poId) {
    const po = this.data.purchaseOrders.find(x => x.id === poId);
    if (!po) return null;
    po.status = "sent";
    po.sentAt = now();
    po.history.push({ action: "sent", t: now() });
    this.save();
    log("ERP", `📤 PO ${poId} נשלח`);
    return po;
  }

  receivePO(poId, receivedItems) {
    const po = this.data.purchaseOrders.find(x => x.id === poId);
    if (!po) return null;

    let allReceived = true;
    for (const ri of receivedItems) {
      const poItem = po.items.find(i => i.id === ri.itemId || i.name === ri.name);
      if (poItem) {
        poItem.receivedQty = (poItem.receivedQty || 0) + ri.qty;
        if (poItem.receivedQty < poItem.qty) allReceived = false;
      }
      // עדכון מלאי
      if (ri.inventoryItemId) {
        this.updateStock(ri.inventoryItemId, ri.qty, `PO ${poId}`, po.projectId);
      }
    }

    po.status = allReceived ? "received" : "partial";
    po.receivedAt = now();
    po.history.push({ action: allReceived ? "received" : "partial_received", items: receivedItems, t: now() });

    // עדכון ספק
    const supplier = this.data.suppliers.find(s => s.id === po.supplierId);
    if (supplier) {
      const expectedDate = po.expectedDelivery ? new Date(po.expectedDelivery) : null;
      if (expectedDate && new Date() <= expectedDate) {
        supplier.performance.onTime++;
      } else if (expectedDate) {
        supplier.performance.late++;
      }
    }

    this.save();
    log("ERP", `📦 PO ${poId} ${allReceived ? "התקבל במלואו" : "התקבל חלקית"}`, "SUCCESS");
    return po;
  }

  // ── Work Orders ──
  createWorkOrder(data) {
    const wo = {
      id: `WO-${uid()}`, status: "pending",
      type: data.type || "production", // production, installation, repair, custom
      projectId: data.projectId || null,
      description: data.description || "",
      assignee: data.assignee || null,
      team: data.team || [],
      priority: data.priority || "medium",
      estimatedHours: data.estimatedHours || 0,
      actualHours: 0,
      materials: data.materials || [],
      tools: data.tools || [],
      dueDate: data.dueDate || null,
      instructions: data.instructions || "",
      safetyNotes: data.safetyNotes || "",
      qualityChecklist: data.qualityChecklist || [],
      createdAt: now(), startedAt: null, completedAt: null,
      notes: [],
      history: [{ action: "created", t: now() }],
    };
    this.data.workOrders.push(wo);
    this.save();
    log("ERP", `🔧 WO: ${wo.id} — ${wo.description} (${wo.type})`);
    return wo;
  }

  startWorkOrder(woId, startedBy) {
    const wo = this.data.workOrders.find(x => x.id === woId);
    if (!wo) return null;
    wo.status = "in_progress";
    wo.startedAt = now();
    wo.history.push({ action: "started", by: startedBy, t: now() });
    this.save();
    return wo;
  }

  completeWorkOrder(woId, data = {}) {
    const wo = this.data.workOrders.find(x => x.id === woId);
    if (!wo) return null;
    wo.status = "completed";
    wo.completedAt = now();
    wo.actualHours = data.actualHours || wo.estimatedHours;
    wo.history.push({ action: "completed", ...data, t: now() });
    this.save();
    log("ERP", `✅ WO ${woId} הושלם (${wo.actualHours}h)`, "SUCCESS");
    return wo;
  }

  // ── ניתוח AI ──
  async analyze() {
    const activeProjects = this.data.projects.filter(p => !["completed", "cancelled", "lost", "warranty"].includes(p.status));
    const lowStock = this.getLowStockItems();
    const openPOs = this.data.purchaseOrders.filter(p => !["received", "cancelled"].includes(p.status));
    const openWOs = this.data.workOrders.filter(w => !["completed", "cancelled"].includes(w.status));

    return await this.brain.thinkJSON(`
אתה מנהל ERP אוטונומי של טכנו כל עוזי — מפעל מתכת עם 30 עובדים.
תפקידך: לנתח את המצב, לזהות בעיות, לחזות בעיות עתידיות, ולהמליץ על פעולות.

═══ נתונים נוכחיים ═══

פרויקטים:
- סה"כ: ${this.data.projects.length}
- פעילים: ${activeProjects.length}
- לפי סטטוס: ${JSON.stringify(activeProjects.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {}))}
- לפי סוג: ${JSON.stringify(activeProjects.reduce((acc, p) => { acc[p.type] = (acc[p.type] || 0) + 1; return acc; }, {}))}
- פרויקטים אחרונים: ${JSON.stringify(activeProjects.slice(-8).map(p => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
    customer: p.customer.name, city: p.customer.city,
    daysActive: p.timeline.measurementDone ? daysAgo(p.timeline.measurementDone) : "N/A",
    estimatedDays: p.timeline.estimatedDays,
    quotedAmount: p.costs.quoted > 0 ? shekel(p.costs.quoted) : "N/A",
  })))}

מלאי:
- סה"כ פריטים: ${this.data.inventory.length}
- ערך מלאי: ₪${shekel(this.getStockValue())}
- מלאי נמוך (${lowStock.length}): ${JSON.stringify(lowStock.map(i => ({ name: i.name, qty: i.qty, min: i.minQty, unit: i.unit })))}
- אזל מהמלאי: ${JSON.stringify(this.getOutOfStockItems().map(i => i.name))}

הזמנות רכש:
- פתוחות: ${openPOs.length}
- סה"כ ערך פתוח: ₪${shekel(openPOs.reduce((s, p) => s + p.total, 0))}
- דחופות: ${openPOs.filter(p => p.urgency === "urgent").length}

פקודות עבודה:
- פתוחות: ${openWOs.length}
- בייצור: ${openWOs.filter(w => w.status === "in_progress").length}
- שעות מתוכננות: ${openWOs.reduce((s, w) => s + w.estimatedHours, 0)}
- קיבולת יומית: ${this.data.config.productionCapacityHoursPerDay} שעות

ספקים: ${this.data.suppliers.length}
התראות פעילות: ${this.data.alerts.filter(a => !a.resolved).length}

═══ מה לנתח ═══

1. **בריאות כללית** — האם המערכת בריאה? מה הציון הכללי?
2. **צווארי בקבוק** — איפה הפרויקטים נתקעים? באיזה שלב?
3. **מלאי** — האם צריך להזמין חומרים? מה דחוף?
4. **ייצור** — האם יש עומס? האם הקיבולת מספיקה?
5. **זמני אספקה** — האם עומדים ביעד 14 יום?
6. **עלויות** — האם יש חריגות? הזדמנויות חיסכון?
7. **סיכונים** — מה יכול להשתבש? מה ה-Second Order Effects?
8. **חיזויים** — מה צפוי לקרות ב-7 ו-30 ימים הקרובים?
9. **אוטומציות** — מה אפשר לעשות אוטומטית עכשיו?

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "סיכום 2-3 שורות",
  "bottlenecks": [{"stage": "...", "count": 0, "avgDaysStuck": 0, "recommendation": "..."}],
  "inventoryActions": [{"action": "order/count/transfer", "item": "...", "qty": 0, "urgency": "critical/high/medium/low", "supplier": "...", "estimatedCost": 0, "reason": "..."}],
  "productionLoad": {"currentHours": 0, "capacityHours": 0, "utilization": 0.0, "overloaded": false, "recommendation": "..."},
  "deliveryPerformance": {"avgDays": 0, "onTimePercent": 0, "lateProjects": [], "recommendation": "..."},
  "costAnalysis": {"totalProjectCosts": 0, "avgMargin": 0, "costTrend": "rising/stable/falling", "savingOpportunities": ["..."]},
  "risks": [{"risk": "...", "probability": 0.0-1.0, "impact": "catastrophic/severe/moderate/minor", "mitigation": "...", "owner": "..."}],
  "predictions": [{"what": "...", "when": "...", "probability": 0.0-1.0, "prepareAction": "..."}],
  "automatedActions": [{"action": "...", "reason": "...", "priority": "critical/high/medium/low", "estimatedImpact": "...", "confidence": 0.0-1.0}],
  "kpis": {
    "projectCompletionRate": 0,
    "avgLeadTimeDays": 0,
    "stockTurnover": 0,
    "onTimeDelivery": 0,
    "productionUtilization": 0,
    "defectRate": 0,
    "supplierOnTime": 0,
    "costVariance": 0
  }
}`);
  }
}

// ═══════════════════════════════════════
// CRM MODULE
// ═══════════════════════════════════════

class CRMModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "crm", "state.json");
    this.data = load(this.file, {
      leads: [], customers: [], deals: [], interactions: [],
      pipeline: {
        new: [], contacted: [], measuring: [], quoted: [],
        negotiating: [], won: [], lost: [], dormant: [],
      },
      sources: {},
      campaigns: [],
      segments: [],
      automations: [],
      templates: { sms: [], email: [], whatsapp: [] },
      config: {
        autoFollowUpDays: 3,
        leadExpiryDays: 30,
        scoringWeights: {
          source: 0.2, projectSize: 0.25, responsiveness: 0.2,
          recency: 0.15, engagement: 0.1, referral: 0.1,
        },
      },
    });
  }
  save() { save(this.file, this.data); }

  addLead(data) {
    const l = {
      id: `LEAD-${uid()}`, status: "new",
      biz: data.biz || "techno",
      source: data.source || "unknown",
      campaign: data.campaign || null,
      name: data.name || "", phone: data.phone || "",
      email: data.email || "", address: data.address || "",
      city: data.city || "",
      projectType: data.projectType || "",
      projectDescription: data.projectDescription || "",
      estimatedMeters: data.estimatedMeters || 0,
      estimatedValue: data.estimatedValue || 0,
      score: 50, priority: "medium",
      language: data.language || "he",
      assignedTo: data.assignedTo || null,
      referredBy: data.referredBy || null,
      tags: data.tags || [],
      interactions: [],
      timeline: [],
      aiNotes: [],
      conversionProbability: 0.5,
      ltv: 0,
      nextFollowUp: null,
      followUpCount: 0,
      createdAt: now(), updatedAt: now(),
      lastContactAt: null,
    };
    this.data.leads.push(l);
    if (!this.data.pipeline.new) this.data.pipeline.new = [];
    this.data.pipeline.new.push(l.id);
    this.data.sources[l.source] = (this.data.sources[l.source] || 0) + 1;
    this.save();
    log("CRM", `👤 ליד: ${l.id} — ${l.name} (${l.source}, ${l.projectType}, ${l.city})`);
    this.memory.add("shortTerm", { type: "lead_created", leadId: l.id, source: l.source, name: l.name });
    return l;
  }

  moveLead(leadId, toStage) {
    const lead = this.data.leads.find(l => l.id === leadId);
    if (!lead) return null;
    const from = lead.status;

    for (const stage of Object.keys(this.data.pipeline)) {
      this.data.pipeline[stage] = (this.data.pipeline[stage] || []).filter(id => id !== leadId);
    }
    if (!this.data.pipeline[toStage]) this.data.pipeline[toStage] = [];
    this.data.pipeline[toStage].push(leadId);
    lead.status = toStage;
    lead.updatedAt = now();
    lead.timeline.push({ from, to: toStage, t: now() });

    if (toStage === "won") {
      this.memory.add("successes", { type: "deal_won", leadId, name: lead.name, value: lead.estimatedValue, source: lead.source });
      log("CRM", `🏆 נסגרה עסקה: ${lead.name} — ₪${shekel(lead.estimatedValue)}`, "SUCCESS");
    }
    if (toStage === "lost") {
      this.memory.add("mistakes", { type: "deal_lost", leadId, name: lead.name, source: lead.source });
    }

    this.save();
    log("CRM", `👤 ${lead.name}: ${from} → ${toStage}`);
    return lead;
  }

  addInteraction(leadId, data) {
    const lead = this.data.leads.find(l => l.id === leadId);
    if (!lead) return null;
    const i = {
      id: uid(),
      type: data.type || "note", // call, whatsapp, email, sms, meeting, note, measurement, quote, follow_up
      direction: data.direction || "outbound",
      content: data.content || "",
      by: data.by || "system",
      duration: data.duration || null,
      result: data.result || null, // answered, no_answer, voicemail, busy, scheduled, interested, not_interested, callback
      sentiment: data.sentiment || null, // positive, neutral, negative
      t: now(),
    };
    lead.interactions.push(i);
    lead.lastContactAt = now();
    lead.updatedAt = now();
    lead.followUpCount++;
    this.data.interactions.push({ leadId, ...i });
    this.save();
    return i;
  }

  createDeal(leadId, data) {
    const lead = this.data.leads.find(l => l.id === leadId);
    const deal = {
      id: `DEAL-${uid()}`, leadId,
      customerName: lead?.name || data.customerName || "",
      description: data.description || "",
      projectType: data.projectType || lead?.projectType || "",
      amount: data.amount || lead?.estimatedValue || 0,
      status: "open",
      probability: data.probability || 50,
      expectedCloseDate: data.expectedCloseDate || null,
      products: data.products || [],
      competitor: data.competitor || null,
      lostReason: null,
      createdAt: now(), closedAt: null,
      history: [{ action: "created", t: now() }],
    };
    this.data.deals.push(deal);
    this.save();
    log("CRM", `💼 עסקה: ${deal.id} — ${deal.customerName} — ₪${shekel(deal.amount)}`);
    return deal;
  }

  async scoreLead(leadId) {
    const lead = this.data.leads.find(l => l.id === leadId);
    if (!lead) return null;

    const daysSinceCreated = daysAgo(lead.createdAt);
    const daysSinceContact = lead.lastContactAt ? daysAgo(lead.lastContactAt) : null;
    const answeredCalls = lead.interactions.filter(i => i.type === "call" && i.result === "answered").length;
    const totalCalls = lead.interactions.filter(i => i.type === "call").length;
    const responseRate = totalCalls > 0 ? answeredCalls / totalCalls : null;

    return await this.brain.thinkJSON(`
אתה מערכת Lead Scoring אוטומטית של טכנו כל עוזי + קובי אלקיים נדל"ן.
תפקידך: לתת ציון מדויק (0-100) לליד ולהמליץ על הפעולה הבאה.

═══ פרטי הליד ═══
שם: ${lead.name}
טלפון: ${lead.phone}
עיר: ${lead.city}
מקור: ${lead.source}
סוג פרויקט: ${lead.projectType}
תיאור: ${lead.projectDescription}
מטרים משוערים: ${lead.estimatedMeters}
ערך משוער: ₪${shekel(lead.estimatedValue)}
שפה: ${lead.language}
עסק: ${lead.biz}
תגיות: ${lead.tags.join(", ")}
הופנה ע"י: ${lead.referredBy || "לא"}

═══ פעילות ═══
ימים מאז יצירה: ${daysSinceCreated}
ימים מאז קשר אחרון: ${daysSinceContact ?? "אף פעם"}
מספר אינטראקציות: ${lead.interactions.length}
שיחות: ${totalCalls} (ענה: ${answeredCalls})
אחוז מענה: ${responseRate !== null ? (responseRate * 100).toFixed(0) + "%" : "N/A"}
הודעות WhatsApp: ${lead.interactions.filter(i => i.type === "whatsapp").length}
סטטוס נוכחי: ${lead.status}
מספר פולואפים: ${lead.followUpCount}

═══ קריטריונים לדירוג ═══

מקור (20% מהציון):
- Google Ads Search = 85 (מחפש באופן פעיל)
- אורגני מהאתר = 80 (מצא אותנו בעצמו)
- הפניה מלקוח = 95 (הכי טוב — Social Proof)
- Walk-in למפעל = 90 (רציני, בא פיזית)
- Facebook/Instagram = 55 (פחות ממוקד)
- דף נחיתה = 70 (מילא טופס)
- WhatsApp ישיר = 75 (יזם קשר)
- טלפון = 80 (התקשר בעצמו)

גודל פרויקט (25%):
- פרויקט שלם (מעקה+שער+גדר+פרגולה) = 95 (₪40,000+)
- מעקות מרפסת גג = 80 (₪15,000-25,000)
- שער חשמלי = 75 (₪8,000-15,000)
- גדר = 70 (₪8,000-20,000)
- פרגולה = 75 (₪10,000-25,000)
- תיקון/החלפה בודדת = 40 (₪3,000-6,000)
- דירת יוקרה (נדל"ן) = 98 (₪250,000+)
- השקעה בינלאומית (EN/FR) = 99 (₪500,000+)

תגובתיות (20%):
- ענה לשיחה ראשונה = +25
- ענה ל-WhatsApp תוך שעה = +20
- לא ענה 3+ פעמים = -30
- חזר בעצמו = +15
- ביטל פגישה = -20
- הגיע למדידה = +30

עדכניות (15%):
- פחות מ-24 שעות = +20
- 1-3 ימים = +10
- 3-7 ימים = 0
- 7-14 ימים = -10
- 14+ ימים = -25
- 30+ ימים = -40

מעורבות (10%):
- 3+ אינטראקציות = +15
- שאל שאלות ספציפיות = +10
- ביקש הצעת מחיר = +20
- השווה מתחרים = -5
- ביקש הנחה מיד = -10

הפניה (10%):
- הפניה מלקוח מרוצה = +20
- הפניה מקבלן = +15
- אין הפניה = 0

═══ בונוסים ═══
- שישי בוקר (Peak Decision Time) = +10
- מהאזור (ת"א, מרכז) = +5
- בעל בית פרטי (לפי סוג פרויקט) = +15
- אמר "דחוף" או "מהר" = +10
- ציין תקציב ספציפי = +10

═══ פנליזציות ═══
- אמר "רק בודק מחירים" = -20
- ביקש מחיר למטר בלבד (Shopping) = -15
- כתובת מחוץ לאזור שירות = -10
- שפה לא ברורה / לא רלוונטי = -30

תחזיר JSON:
{
  "score": 0-100,
  "scoreBreakdown": {
    "source": 0-100,
    "projectSize": 0-100,
    "responsiveness": 0-100,
    "recency": 0-100,
    "engagement": 0-100,
    "referral": 0-100,
    "bonuses": 0,
    "penalties": 0
  },
  "reasoning": "הסבר מפורט למה הציון הזה — 2-3 משפטים",
  "priority": "hot/warm/cold/dead",
  "conversionProbability": 0.0-1.0,
  "estimatedLTV": 0,
  "estimatedProjectValue": 0,
  "riskOfLoss": 0.0-1.0,
  "lossReasons": ["סיבה 1"],
  "nextBestAction": "תיאור מדויק של הפעולה הבאה",
  "nextActionTiming": "now/today/tomorrow/this_week/next_week",
  "channel": "phone/whatsapp/email/sms/visit",
  "suggestedMessage": "הודעה מוצעת בעברית — מותאמת ללקוח הספציפי",
  "suggestedCallScript": "תסריט שיחה קצר — פתיחה, שאלות, סגירה",
  "whyThisChannel": "למה ערוץ זה ולא אחר",
  "competitorThreat": "none/low/medium/high",
  "competitorStrategy": "אם יש איום מתחרה — מה לעשות",
  "upsellOpportunity": "הזדמנות למכור יותר",
  "longTermValue": "הערכת ערך לטווח ארוך — חוזר? ממליץ? פרויקטים נוספים?"
}`);
  }

  async scoreAllLeads() {
    const active = this.data.leads.filter(l => !["won", "lost", "dormant"].includes(l.status));
    log("CRM", `🎯 מדרג ${active.length} לידים...`);

    for (const lead of active.slice(0, 15)) {
      const result = await this.scoreLead(lead.id);
      if (result) {
        lead.score = result.score;
        lead.priority = result.priority;
        lead.conversionProbability = result.conversionProbability;
        lead.ltv = result.estimatedLTV || 0;
        lead.nextFollowUp = result.nextActionTiming;
        lead.aiNotes.push({ ...result, _t: now() });
        lead.updatedAt = now();
      }
    }
    this.save();
    log("CRM", `✅ דירוג הושלם`, "SUCCESS");
  }

  getPipelineSummary() {
    return Object.fromEntries(Object.entries(this.data.pipeline).map(([k, v]) => [k, (v || []).length]));
  }

  getPipelineValue() {
    return this.data.leads
      .filter(l => !["lost", "dormant"].includes(l.status))
      .reduce((s, l) => s + (l.estimatedValue || 0) * (l.conversionProbability || 0.5), 0);
  }

  getHotLeads() {
    return this.data.leads.filter(l => l.score >= 70 && !["won", "lost", "dormant"].includes(l.status)).sort((a, b) => b.score - a.score);
  }

  getColdLeads(days = 7) {
    const cutoff = Date.now() - days * 86400000;
    return this.data.leads.filter(l =>
      !["won", "lost", "dormant"].includes(l.status) &&
      (!l.lastContactAt || new Date(l.lastContactAt).getTime() < cutoff)
    );
  }

  getSourceStats() {
    const stats = {};
    for (const lead of this.data.leads) {
      if (!stats[lead.source]) stats[lead.source] = { total: 0, won: 0, lost: 0, value: 0, avgScore: 0, scores: [] };
      stats[lead.source].total++;
      if (lead.status === "won") { stats[lead.source].won++; stats[lead.source].value += lead.estimatedValue || 0; }
      if (lead.status === "lost") stats[lead.source].lost++;
      stats[lead.source].scores.push(lead.score || 0);
    }
    for (const s of Object.values(stats)) {
      s.avgScore = s.scores.length > 0 ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 0;
      s.conversionRate = s.total > 0 ? (s.won / s.total * 100).toFixed(1) + "%" : "0%";
      delete s.scores;
    }
    return stats;
  }

  async analyze() {
    const pipeline = this.getPipelineSummary();
    const hot = this.getHotLeads();
    const cold = this.getColdLeads();
    const sources = this.getSourceStats();

    return await this.brain.thinkJSON(`
אתה מנהל CRM אוטונומי של טכנו כל עוזי + קובי אלקיים נדל"ן.
תפקידך: לנתח את הPipeline, לזהות הזדמנויות ובעיות, ולהמליץ על פעולות.

═══ מצב Pipeline ═══
${JSON.stringify(pipeline)}
ערך Pipeline (weighted): ₪${shekel(this.getPipelineValue())}

═══ לידים חמים (Score 70+) ═══
${JSON.stringify(hot.slice(0, 10).map(l => ({
  name: l.name, score: l.score, source: l.source, type: l.projectType,
  value: shekel(l.estimatedValue), city: l.city, status: l.status,
  daysSinceContact: l.lastContactAt ? daysAgo(l.lastContactAt) : "never",
  probability: l.conversionProbability, followUps: l.followUpCount,
})))}

═══ לידים קרים (7+ ימים ללא קשר) ═══
${cold.length} לידים — ${JSON.stringify(cold.slice(0, 5).map(l => ({
  name: l.name, score: l.score, source: l.source,
  daysSinceContact: l.lastContactAt ? daysAgo(l.lastContactAt) : "never",
})))}

═══ ביצועי מקורות ═══
${JSON.stringify(sources)}

═══ עסקאות פתוחות ═══
${this.data.deals.filter(d => d.status === "open").length} עסקאות
ערך: ₪${shekel(this.data.deals.filter(d => d.status === "open").reduce((s, d) => s + d.amount, 0))}

═══ סטטיסטיקות כלליות ═══
סה"כ לידים: ${this.data.leads.length}
סה"כ אינטראקציות: ${this.data.interactions.length}
ציון ממוצע: ${this.data.leads.length > 0 ? Math.round(this.data.leads.reduce((s, l) => s + (l.score || 0), 0) / this.data.leads.length) : 0}

═══ מה לנתח ═══

1. **בריאות Pipeline** — האם יש צוואר בקבוק? באיזה שלב נתקעים? כמה זמן ממוצע בכל שלב?
2. **לידים חמים** — מי הכי דחוף? מה הפעולה הבאה לכל אחד? מי עומד ללכת למתחרה?
3. **לידים קרים** — מי שווה להחיות? מה אסטרטגיית ה-Re-engagement?
4. **מקורות** — איזה מקור הכי רווחי? איפה לשים יותר תקציב? מה להפסיק?
5. **סיכוני אובדן** — אילו עסקאות בסכנה? למה? מה לעשות?
6. **Follow-up Queue** — מי צריך follow-up? באיזה ערוץ? מה ההודעה?
7. **הזדמנויות Upsell** — אילו לקוחות יכולים לקנות יותר?
8. **תחרות** — האם יש סימנים שמתחרים גונבים לידים?
9. **חיזויים** — כמה עסקאות נסגרות החודש? ברבעון? מה ההכנסה הצפויה?
10. **אוטומציות** — מה אפשר לאוטמט? follow-up אוטומטי? הודעות?

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "סיכום 2-3 שורות",
  "pipelineHealth": {
    "bottleneck": "השלב הבעייתי",
    "avgTimePerStage": {"new": 0, "contacted": 0, "measuring": 0, "quoted": 0, "negotiating": 0},
    "dropOffRate": {"stage": "...", "rate": 0, "reason": "..."},
    "recommendation": "..."
  },
  "hotLeads": [{
    "leadId": "...", "name": "...", "score": 0,
    "action": "תיאור מדויק", "urgency": "immediate/today/this_week",
    "channel": "phone/whatsapp/email",
    "message": "הודעה מוצעת",
    "riskOfLoss": 0.0-1.0,
    "estimatedRevenue": 0
  }],
  "coldLeads": [{
    "leadId": "...", "name": "...",
    "reEngagementStrategy": "...",
    "message": "...",
    "worthPursuing": true
  }],
  "followUpQueue": [{
    "leadId": "...", "name": "...",
    "channel": "phone/whatsapp/email/sms",
    "message": "...",
    "timing": "09:00/12:00/17:00/friday_morning",
    "reason": "..."
  }],
  "sourceAnalysis": {
    "bestSource": {"source": "...", "reason": "...", "recommendation": "..."},
    "worstSource": {"source": "...", "reason": "...", "recommendation": "..."},
    "budgetReallocation": [{"from": "...", "to": "...", "amount": "...", "expectedImpact": "..."}]
  },
  "atRiskDeals": [{
    "dealId": "...", "customer": "...", "amount": 0,
    "risk": "...", "action": "...", "deadline": "..."
  }],
  "upsellOpportunities": [{
    "leadId": "...", "customer": "...",
    "currentProject": "...", "upsellProject": "...",
    "additionalValue": 0, "approach": "..."
  }],
  "competitorThreats": [{
    "leadId": "...", "competitor": "...",
    "signal": "...", "counterStrategy": "..."
  }],
  "forecast": {
    "dealsThisMonth": 0, "revenueThisMonth": 0,
    "dealsThisQuarter": 0, "revenueThisQuarter": 0,
    "confidence": 0.0-1.0
  },
  "automatedActions": [{
    "action": "...", "leadId": "...", "reason": "...",
    "priority": "critical/high/medium/low",
    "expectedImpact": "...", "confidence": 0.0-1.0
  }],
  "kpis": {
    "conversionRate": 0,
    "avgDealSize": 0,
    "avgCycleTimeDays": 0,
    "leadResponseTimeHours": 0,
    "followUpRate": 0,
    "costPerLead": 0,
    "costPerAcquisition": 0,
    "customerLTV": 0,
    "nps": 0
  }
}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 2/4
// BOM + HR + FINANCE
// ════════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════
// BOM MODULE — Bill of Materials
// ═══════════════════════════════════════

class BOMModule {
  constructor(brain, memory, erp) {
    this.brain = brain;
    this.memory = memory;
    this.erp = erp;
    this.file = path.join(CONFIG.DIR, "bom", "state.json");
    this.data = load(this.file, {
      boms: [],
      templates: this._defaultTemplates(),
      materialCatalog: this._defaultCatalog(),
      laborRates: {
        welder: agorot(120),          // ₪120/hour
        installer: agorot(100),
        painter: agorot(95),
        measurer: agorot(110),
        helper: agorot(75),
        electrician: agorot(150),
      },
      overheadPercent: 0.18, // 18% overhead on materials+labor
      targetMarginPercent: 0.35, // 35% target margin
    });
  }
  save() { save(this.file, this.data); }

  _defaultTemplates() {
    return [
      {
        id: "TPL-RAIL-IRON",
        name: "מעקה ברזל סטנדרטי",
        projectType: "railing_iron",
        unit: "meter",
        materials: [
          { sku: "PROF-IRON-40X40", name: "פרופיל ברזל 40×40", qty: 2.5, unit: "meter", costPerUnit: agorot(32) },
          { sku: "PROF-IRON-20X20", name: "פרופיל ברזל 20×20 (בלוסטרים)", qty: 5.0, unit: "meter", costPerUnit: agorot(18) },
          { sku: "PLATE-STEEL-5MM", name: "לוחית פלדה 5מ\"מ", qty: 0.4, unit: "piece", costPerUnit: agorot(25) },
          { sku: "BOLT-M10", name: "בורג M10 עוגן", qty: 4, unit: "piece", costPerUnit: agorot(8) },
          { sku: "PRIMER-IRON", name: "פריימר ברזל", qty: 0.2, unit: "liter", costPerUnit: agorot(75) },
          { sku: "PAINT-BLACK", name: "צבע שחור תעשייתי", qty: 0.3, unit: "liter", costPerUnit: agorot(85) },
          { sku: "WELD-WIRE", name: "חוט ריתוך", qty: 0.05, unit: "kg", costPerUnit: agorot(180) },
        ],
        labor: [
          { role: "welder", hoursPerUnit: 1.5 },
          { role: "painter", hoursPerUnit: 0.5 },
          { role: "installer", hoursPerUnit: 0.8 },
        ],
        toolsRequired: ["ריתוך MIG", "מסור זוויתי", "מקדחה", "אקדח צבע"],
        qualityStandards: ["ת\"י 1142", "גובה מינימלי 105ס\"מ", "מרווח 10ס\"מ מקסימום"],
      },
      {
        id: "TPL-RAIL-ALU",
        name: "מעקה אלומיניום",
        projectType: "railing_aluminum",
        unit: "meter",
        materials: [
          { sku: "PROF-ALU-50X50", name: "פרופיל אלומיניום 50×50", qty: 2.3, unit: "meter", costPerUnit: agorot(48) },
          { sku: "PROF-ALU-20X20", name: "פרופיל אלומיניום 20×20", qty: 4.5, unit: "meter", costPerUnit: agorot(22) },
          { sku: "CAP-ALU", name: "כיסוי אלומיניום", qty: 2, unit: "piece", costPerUnit: agorot(15) },
          { sku: "BOLT-SS-M8", name: "בורג נירוסטה M8", qty: 6, unit: "piece", costPerUnit: agorot(12) },
          { sku: "COAT-POWDER", name: "צבע אבקה", qty: 0.15, unit: "kg", costPerUnit: agorot(120) },
        ],
        labor: [
          { role: "welder", hoursPerUnit: 0.8 },
          { role: "installer", hoursPerUnit: 0.6 },
        ],
        toolsRequired: ["ריתוך TIG", "מסור אלומיניום", "מקדחה"],
        qualityStandards: ["ת\"י 1142", "ללא חלודה", "צבע אבקה רק"],
      },
      {
        id: "TPL-RAIL-GLASS",
        name: "מעקה זכוכית",
        projectType: "railing_glass",
        unit: "meter",
        materials: [
          { sku: "GLASS-TEMP-10MM", name: "זכוכית מחוסמת 10מ\"מ", qty: 0.95, unit: "sqm", costPerUnit: agorot(850) },
          { sku: "PROF-BASE-ALU", name: "פרופיל בסיס אלומיניום", qty: 1.05, unit: "meter", costPerUnit: agorot(180) },
          { sku: "CLAMP-SS", name: "מלחציים נירוסטה", qty: 3, unit: "piece", costPerUnit: agorot(65) },
          { sku: "SEAL-SILICONE", name: "סיליקון מבני", qty: 0.1, unit: "liter", costPerUnit: agorot(95) },
          { sku: "HANDRAIL-SS", name: "מאחז נירוסטה", qty: 1.05, unit: "meter", costPerUnit: agorot(220) },
        ],
        labor: [
          { role: "installer", hoursPerUnit: 1.2 },
          { role: "measurer", hoursPerUnit: 0.3 },
        ],
        toolsRequired: ["רמה לייזר", "מוצצי זכוכית", "מקדחה מיוחדת"],
        qualityStandards: ["ת\"י 1142", "זכוכית מחוסמת בלבד", "בדיקת ספק"],
      },
      {
        id: "TPL-GATE-ELEC",
        name: "שער חשמלי נגרר",
        projectType: "gate_electric",
        unit: "piece",
        materials: [
          { sku: "PROF-IRON-60X40", name: "פרופיל ברזל 60×40", qty: 24, unit: "meter", costPerUnit: agorot(42) },
          { sku: "MOTOR-SLIDING", name: "מנוע שער נגרר BFT", qty: 1, unit: "piece", costPerUnit: agorot(185000) },
          { sku: "REMOTE-433", name: "שלט 433MHz", qty: 4, unit: "piece", costPerUnit: agorot(12000) },
          { sku: "PHOTO-CELL", name: "פוטוצל בטיחות", qty: 2, unit: "piece", costPerUnit: agorot(28000) },
          { sku: "RACK-GEAR", name: "רצועת שיניים", qty: 5, unit: "meter", costPerUnit: agorot(8500) },
          { sku: "CABLE-4X1.5", name: "כבל חשמל 4×1.5", qty: 15, unit: "meter", costPerUnit: agorot(750) },
          { sku: "CONTROL-BOX", name: "לוח בקרה", qty: 1, unit: "piece", costPerUnit: agorot(35000) },
          { sku: "HINGE-HEAVY", name: "ציר כבד", qty: 0, unit: "piece", costPerUnit: agorot(15000) },
          { sku: "PRIMER-IRON", name: "פריימר ברזל", qty: 1.5, unit: "liter", costPerUnit: agorot(75) },
          { sku: "PAINT-BLACK", name: "צבע שחור תעשייתי", qty: 2, unit: "liter", costPerUnit: agorot(85) },
        ],
        labor: [
          { role: "welder", hoursPerUnit: 12 },
          { role: "electrician", hoursPerUnit: 4 },
          { role: "painter", hoursPerUnit: 3 },
          { role: "installer", hoursPerUnit: 6 },
        ],
        toolsRequired: ["ריתוך MIG", "מסור", "מקדחה תעשייתית", "מולטימטר", "ציוד חשמל"],
        qualityStandards: ["ת\"י 1201", "פוטוצל חובה", "גלאי עצירה", "הארקה"],
      },
      {
        id: "TPL-PERGOLA-ALU",
        name: "פרגולה אלומיניום",
        projectType: "pergola_aluminum",
        unit: "sqm",
        materials: [
          { sku: "PROF-ALU-100X100", name: "עמוד אלומיניום 100×100", qty: 0.5, unit: "meter", costPerUnit: agorot(145) },
          { sku: "PROF-ALU-80X40", name: "קורה אלומיניום 80×40", qty: 2.8, unit: "meter", costPerUnit: agorot(95) },
          { sku: "LOUVRE-ALU", name: "רפפה אלומיניום", qty: 7, unit: "meter", costPerUnit: agorot(85) },
          { sku: "BRACKET-ALU", name: "זווית חיבור אלומיניום", qty: 4, unit: "piece", costPerUnit: agorot(35) },
          { sku: "BOLT-SS-M10", name: "בורג נירוסטה M10", qty: 8, unit: "piece", costPerUnit: agorot(18) },
          { sku: "COAT-POWDER", name: "צבע אבקה", qty: 0.3, unit: "kg", costPerUnit: agorot(120) },
          { sku: "DRAIN-PVC", name: "צינור ניקוז PVC", qty: 1, unit: "meter", costPerUnit: agorot(45) },
        ],
        labor: [
          { role: "welder", hoursPerUnit: 1.5 },
          { role: "installer", hoursPerUnit: 1.8 },
          { role: "measurer", hoursPerUnit: 0.2 },
        ],
        toolsRequired: ["מסור אלומיניום", "מקדחה", "רמה", "מנוף לעמודים"],
        qualityStandards: ["עמידות רוח", "ניקוז מים", "ת\"י 1225"],
      },
    ];
  }

  _defaultCatalog() {
    return {
      iron:       { pricePerKg: agorot(7.5), density: 7850, wastePercent: 0.08 },
      aluminum:   { pricePerKg: agorot(28), density: 2700, wastePercent: 0.06 },
      stainless:  { pricePerKg: agorot(42), density: 8000, wastePercent: 0.05 },
      glass_temp: { pricePerSqm: agorot(850), wastePercent: 0.03 },
      paint:      { pricePerLiter: agorot(85), coveragePerLiter: 10 },
      primer:     { pricePerLiter: agorot(75), coveragePerLiter: 12 },
    };
  }

  createBOM(data) {
    const bom = {
      id: `BOM-${uid()}`,
      name: data.name || "",
      projectId: data.projectId || null,
      projectType: data.projectType || "custom",
      templateId: data.templateId || null,
      unit: data.unit || "unit",
      quantity: data.quantity || 1,
      materials: (data.materials || []).map(m => ({
        id: uid(),
        sku: m.sku || "",
        name: m.name,
        qty: m.qty || 0,
        unit: m.unit || "unit",
        costPerUnit: m.costPerUnit || 0,
        totalCost: Math.round((m.qty || 0) * (m.costPerUnit || 0)),
        wastePercent: m.wastePercent || 0.05,
      })),
      labor: (data.labor || []).map(l => ({
        id: uid(),
        role: l.role,
        hoursPerUnit: l.hoursPerUnit || 0,
        totalHours: (l.hoursPerUnit || 0) * (data.quantity || 1),
        ratePerHour: this.data.laborRates[l.role] || agorot(100),
        totalCost: Math.round((l.hoursPerUnit || 0) * (data.quantity || 1) * (this.data.laborRates[l.role] || agorot(100))),
      })),
      costs: { materials: 0, labor: 0, waste: 0, overhead: 0, subtotal: 0, margin: 0, sellPrice: 0, vat: 0, totalWithVat: 0 },
      notes: data.notes || "",
      createdAt: now(),
    };

    this._recalcBOM(bom);
    this.data.boms.push(bom);
    this.save();
    log("BOM", `📐 ${bom.id} — ${bom.name}: ₪${shekel(bom.costs.sellPrice)} (עלות: ₪${shekel(bom.costs.subtotal)})`);
    return bom;
  }

  _recalcBOM(bom) {
    const materialsCost = bom.materials.reduce((s, m) => s + m.totalCost, 0);
    const wasteCost = bom.materials.reduce((s, m) => s + Math.round(m.totalCost * m.wastePercent), 0);
    const laborCost = bom.labor.reduce((s, l) => s + l.totalCost, 0);
    const baseCost = materialsCost + wasteCost + laborCost;
    const overhead = Math.round(baseCost * this.data.overheadPercent);
    const subtotal = baseCost + overhead;
    const margin = Math.round(subtotal * this.data.targetMarginPercent);
    const sellPrice = subtotal + margin;
    const vat = vatOf(sellPrice);
    const totalWithVat = addVat(sellPrice);

    bom.costs = { materials: materialsCost, labor: laborCost, waste: wasteCost, overhead, subtotal, margin, sellPrice, vat, totalWithVat };
    return bom;
  }

  getTemplate(projectType) {
    return this.data.templates.find(t => t.projectType === projectType);
  }

  createFromTemplate(projectType, quantity, projectId = null) {
    const tpl = this.getTemplate(projectType);
    if (!tpl) {
      log("BOM", `❌ אין תבנית ל-${projectType}`, "ERROR");
      return null;
    }
    const materials = tpl.materials.map(m => ({
      ...m,
      qty: Math.round(m.qty * quantity * 100) / 100,
    }));
    return this.createBOM({
      name: `${tpl.name} × ${quantity}${tpl.unit}`,
      projectId,
      projectType,
      templateId: tpl.id,
      unit: tpl.unit,
      quantity,
      materials,
      labor: tpl.labor,
      notes: `נוצר אוטומטית מתבנית ${tpl.id}`,
    });
  }

  applyBOMToProject(projectId, bomId) {
    const bom = this.data.boms.find(b => b.id === bomId);
    const project = this.erp.data.projects.find(p => p.id === projectId);
    if (!bom || !project) return null;

    project.bom = { bomId, items: bom.materials };
    project.costs.estimatedMaterials = bom.costs.materials + bom.costs.waste;
    project.costs.estimatedLabor = bom.costs.labor;
    project.costs.estimatedOverhead = bom.costs.overhead;
    project.costs.estimatedTotal = bom.costs.subtotal;
    project.updatedAt = now();

    this.erp.save();
    log("BOM", `🔗 ${bomId} → ${projectId}`);
    return project;
  }

  async analyze() {
    const recent = this.data.boms.slice(-20);
    const avgMargin = recent.length > 0
      ? recent.reduce((s, b) => s + (b.costs.margin / Math.max(1, b.costs.subtotal)), 0) / recent.length
      : 0;

    return await this.brain.thinkJSON(`
אתה מנהל BOM (Bill of Materials) אוטונומי של טכנו כל עוזי.
תפקידך: לנתח את העלויות, לזהות הזדמנויות חיסכון, ולאופטם את המחירים.

═══ נתונים ═══
סה"כ BOMs: ${this.data.boms.length}
BOMs אחרונים: ${recent.length}
מרווח ממוצע: ${(avgMargin * 100).toFixed(1)}%
מרווח יעד: ${(this.data.targetMarginPercent * 100).toFixed(0)}%
תבניות זמינות: ${this.data.templates.length}

BOMs אחרונים:
${JSON.stringify(recent.slice(-5).map(b => ({
  id: b.id, name: b.name,
  materials: shekel(b.costs.materials),
  labor: shekel(b.costs.labor),
  sellPrice: shekel(b.costs.sellPrice),
  marginPercent: ((b.costs.margin / Math.max(1, b.costs.subtotal)) * 100).toFixed(1) + "%",
})))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "סיכום",
  "marginAnalysis": {
    "average": 0,
    "target": 0,
    "gap": 0,
    "recommendation": "..."
  },
  "costOptimizations": [{
    "item": "...", "currentCost": 0, "suggestedAction": "...",
    "potentialSaving": 0, "risk": "..."
  }],
  "templateUpdates": [{
    "templateId": "...", "change": "...", "reason": "..."
  }],
  "supplierRecommendations": [{
    "category": "...", "currentSupplier": "...",
    "alternative": "...", "expectedSaving": "..."
  }],
  "riskItems": [{
    "item": "...", "risk": "price_volatility/availability/quality", "mitigation": "..."
  }]
}`);
  }
}

// ═══════════════════════════════════════
// HR MODULE — Human Resources
// ═══════════════════════════════════════

class HRModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "hr", "state.json");
    this.data = load(this.file, {
      employees: [],
      attendance: [],
      leaveRequests: [],
      recruitment: [],
      performance: [],
      trainings: [],
      payroll: [],
      config: {
        minWageMonthly: agorot(5572),       // ₪5,572
        employerInsuranceRate: 0.12,        // 12% ביטוח לאומי מעסיק
        standardWorkHours: 186,             // 186 שעות חודשיות
        overtimeRate: 1.25,                 // 125% שעות נוספות 2 ראשונות
        overtimeRate2: 1.5,                 // 150% מעבר
        vacationDaysPerYear: 14,
        sickDaysPerYear: 18,
      },
    });
  }
  save() { save(this.file, this.data); }

  addEmployee(data) {
    const e = {
      id: `EMP-${uid()}`,
      name: data.name,
      idNumber: data.idNumber || "",
      role: data.role || "worker",
      department: data.department || "ייצור",
      hiredAt: data.hiredAt || today(),
      status: "active",
      phone: data.phone || "",
      email: data.email || "",
      address: data.address || "",
      bankAccount: data.bankAccount || "",
      monthlySalary: data.monthlySalary || this.data.config.minWageMonthly,
      hourlyRate: data.hourlyRate || Math.round((data.monthlySalary || this.data.config.minWageMonthly) / this.data.config.standardWorkHours),
      skills: data.skills || [],
      certifications: data.certifications || [],
      emergencyContact: data.emergencyContact || {},
      vacationDays: { total: this.data.config.vacationDaysPerYear, used: 0, remaining: this.data.config.vacationDaysPerYear },
      sickDays: { total: this.data.config.sickDaysPerYear, used: 0, remaining: this.data.config.sickDaysPerYear },
      performance: { lastReview: null, score: 0, goals: [] },
      documents: [],
      createdAt: now(),
    };
    this.data.employees.push(e);
    this.save();
    log("HR", `👷 עובד: ${e.name} — ${e.role} (${e.department}) — ₪${shekel(e.monthlySalary)}/חודש`);
    this.memory.add("shortTerm", { type: "employee_added", id: e.id, name: e.name, role: e.role });
    return e;
  }

  recordAttendance(employeeId, data) {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return null;
    const a = {
      id: uid(),
      employeeId,
      name: emp.name,
      date: data.date || today(),
      clockIn: data.clockIn || null,
      clockOut: data.clockOut || null,
      status: data.status || "present", // present, late, absent, vacation, sick, holiday
      hoursWorked: data.hoursWorked || 0,
      overtime: data.overtime || 0,
      location: data.location || "מפעל",
      projectId: data.projectId || null,
      notes: data.notes || "",
      createdAt: now(),
    };
    this.data.attendance.push(a);
    this.save();
    return a;
  }

  requestLeave(employeeId, data) {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return null;
    const req = {
      id: `LV-${uid()}`,
      employeeId,
      employeeName: emp.name,
      type: data.type || "vacation", // vacation, sick, unpaid, maternity, miluim, personal
      startDate: data.startDate,
      endDate: data.endDate,
      days: data.days || 0,
      reason: data.reason || "",
      status: "pending",
      requestedAt: now(),
      approvedBy: null,
      approvedAt: null,
    };
    this.data.leaveRequests.push(req);
    this.save();
    log("HR", `📅 בקשת חופשה: ${emp.name} — ${req.type} — ${req.days} ימים`);
    return req;
  }

  approveLeave(leaveId, approvedBy = "system") {
    const req = this.data.leaveRequests.find(r => r.id === leaveId);
    if (!req) return null;
    req.status = "approved";
    req.approvedBy = approvedBy;
    req.approvedAt = now();

    const emp = this.data.employees.find(e => e.id === req.employeeId);
    if (emp) {
      if (req.type === "vacation") {
        emp.vacationDays.used += req.days;
        emp.vacationDays.remaining = Math.max(0, emp.vacationDays.total - emp.vacationDays.used);
      } else if (req.type === "sick") {
        emp.sickDays.used += req.days;
        emp.sickDays.remaining = Math.max(0, emp.sickDays.total - emp.sickDays.used);
      }
    }
    this.save();
    return req;
  }

  addRecruitment(data) {
    const r = {
      id: `CAN-${uid()}`,
      name: data.name,
      role: data.role,
      department: data.department || "ייצור",
      phone: data.phone || "",
      email: data.email || "",
      experienceYears: data.experienceYears || 0,
      skills: data.skills || [],
      expectedSalary: data.expectedSalary || 0,
      source: data.source || "job_board", // job_board, referral, walk_in, agency
      status: "new", // new, contacted, interview_scheduled, interviewed, offer_sent, hired, rejected
      cvUrl: data.cvUrl || "",
      notes: data.notes || "",
      interviewFeedback: [],
      createdAt: now(),
    };
    this.data.recruitment.push(r);
    this.save();
    log("HR", `📋 מועמד: ${r.name} — ${r.role}`);
    return r;
  }

  recordPerformance(employeeId, data) {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return null;
    const perf = {
      id: uid(),
      employeeId,
      name: emp.name,
      period: data.period || today().substring(0, 7),
      score: data.score || 0, // 0-100
      qualityScore: data.qualityScore || 0,
      speedScore: data.speedScore || 0,
      teamworkScore: data.teamworkScore || 0,
      reliabilityScore: data.reliabilityScore || 0,
      goals: data.goals || [],
      feedback: data.feedback || "",
      reviewedBy: data.reviewedBy || "system",
      createdAt: now(),
    };
    this.data.performance.push(perf);
    emp.performance.lastReview = perf.period;
    emp.performance.score = perf.score;
    this.save();
    return perf;
  }

  calculateMonthlySalary(employeeId, month) {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return null;
    const attendance = this.data.attendance.filter(a => a.employeeId === employeeId && a.date.startsWith(month));

    const regularHours = attendance.reduce((s, a) => s + (a.hoursWorked || 0), 0);
    const overtimeHours = attendance.reduce((s, a) => s + (a.overtime || 0), 0);

    const baseSalary = emp.monthlySalary;
    const overtimePay = Math.round(overtimeHours * emp.hourlyRate * this.data.config.overtimeRate);
    const grossSalary = baseSalary + overtimePay;

    const incomeTax = Math.round(grossSalary * 0.10); // הערכה גסה
    const nationalInsurance = Math.round(grossSalary * 0.12); // ביטוח לאומי עובד
    const healthInsurance = Math.round(grossSalary * 0.031);
    const pensionContribution = Math.round(grossSalary * 0.06);
    const totalDeductions = incomeTax + nationalInsurance + healthInsurance + pensionContribution;
    const netSalary = grossSalary - totalDeductions;

    const employerCost = grossSalary + Math.round(grossSalary * this.data.config.employerInsuranceRate) + Math.round(grossSalary * 0.065); // פנסיה מעסיק

    const record = {
      id: `PAY-${uid()}`,
      employeeId,
      employeeName: emp.name,
      month,
      regularHours,
      overtimeHours,
      baseSalary,
      overtimePay,
      grossSalary,
      deductions: { incomeTax, nationalInsurance, healthInsurance, pensionContribution, total: totalDeductions },
      netSalary,
      employerCost,
      calculatedAt: now(),
      paid: false,
    };
    this.data.payroll.push(record);
    this.save();
    log("HR", `💰 משכורת: ${emp.name} ${month} — ברוטו ₪${shekel(grossSalary)} / נטו ₪${shekel(netSalary)}`);
    return record;
  }

  getActiveEmployees() { return this.data.employees.filter(e => e.status === "active"); }
  getDepartmentHeadcount() {
    const counts = {};
    for (const e of this.getActiveEmployees()) {
      counts[e.department] = (counts[e.department] || 0) + 1;
    }
    return counts;
  }
  getTotalMonthlyPayroll() {
    return this.getActiveEmployees().reduce((s, e) => s + e.monthlySalary, 0);
  }

  async analyze() {
    const active = this.getActiveEmployees();
    const departments = this.getDepartmentHeadcount();
    const totalPayroll = this.getTotalMonthlyPayroll();
    const pendingLeaves = this.data.leaveRequests.filter(r => r.status === "pending");
    const openPositions = this.data.recruitment.filter(r => !["hired", "rejected"].includes(r.status));

    return await this.brain.thinkJSON(`
אתה מנהל HR אוטונומי של טכנו כל עוזי (30 עובדים).
תפקידך: לנתח את המצב של כוח האדם, לזהות בעיות, ולהמליץ על פעולות.

═══ נתונים ═══
עובדים פעילים: ${active.length}
לפי מחלקה: ${JSON.stringify(departments)}
שכר חודשי כולל: ₪${shekel(totalPayroll)}
שכר שנתי מוערך: ₪${shekel(totalPayroll * 12)}
בקשות חופשה ממתינות: ${pendingLeaves.length}
משרות בגיוס: ${openPositions.length}
מועמדים פעילים: ${JSON.stringify(openPositions.map(r => ({ name: r.name, role: r.role, status: r.status })))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "סיכום",
  "headcountAnalysis": {
    "current": ${active.length},
    "byDepartment": {},
    "understaffedDepartments": [],
    "overstaffedDepartments": [],
    "recommendations": []
  },
  "payrollAnalysis": {
    "totalMonthly": 0,
    "avgPerEmployee": 0,
    "costPerDepartment": {},
    "recommendations": []
  },
  "recruitmentPriorities": [{
    "role": "...", "department": "...", "urgency": "...", "reason": "..."
  }],
  "retentionRisks": [{
    "employeeId": "...", "name": "...", "risk": "...", "action": "..."
  }],
  "trainingNeeds": [{
    "skill": "...", "affectedEmployees": [], "priority": "..."
  }],
  "morale": {
    "score": 0,
    "indicators": [],
    "recommendations": []
  },
  "kpis": {
    "turnoverRate": 0,
    "avgTenureYears": 0,
    "productivityIndex": 0,
    "absenteeismRate": 0,
    "overtimeRate": 0
  }
}`);
  }
}

// ═══════════════════════════════════════
// FINANCE MODULE
// ═══════════════════════════════════════

class FinanceModule {
  constructor(brain, memory, erp, crm) {
    this.brain = brain;
    this.memory = memory;
    this.erp = erp;
    this.crm = crm;
    this.file = path.join(CONFIG.DIR, "finance", "state.json");
    this.data = load(this.file, {
      invoices: [],
      expenses: [],
      transactions: [],
      bankAccounts: [
        { id: "BANK-MAIN", name: "חשבון עסקי ראשי", balance: 0, currency: "ILS" },
      ],
      budgets: [],
      taxReturns: [],
      vatReports: [],
      cashFlow: { opening: 0, income: 0, expenses: 0, closing: 0 },
      config: {
        vatRate: 0.18,
        paymentTermsDays: 30,
        latePenaltyPercent: 0.02,
        currency: "ILS",
      },
    });
  }
  save() { save(this.file, this.data); }

  createInvoice(data) {
    const items = (data.items || []).map(i => ({
      id: uid(),
      description: i.description || "",
      qty: i.qty || 1,
      unit: i.unit || "unit",
      unitPrice: i.unitPrice || 0,
      discount: i.discount || 0,
      totalBeforeVat: Math.round((i.qty || 1) * (i.unitPrice || 0) - (i.discount || 0)),
    }));
    const subtotal = items.reduce((s, i) => s + i.totalBeforeVat, 0);

    const inv = {
      id: `INV-${Date.now()}-${uid().substring(0, 4)}`,
      number: data.number || this._nextInvoiceNumber(),
      type: data.type || "invoice", // invoice, receipt, credit_note, proforma
      status: "draft", // draft, issued, sent, paid, overdue, cancelled
      biz: data.biz || "techno",
      projectId: data.projectId || null,
      customer: {
        name: data.customerName || "",
        vatId: data.customerVatId || "",
        address: data.customerAddress || "",
        phone: data.customerPhone || "",
        email: data.customerEmail || "",
      },
      items,
      subtotal,
      vat: vatOf(subtotal),
      total: addVat(subtotal),
      paid: 0,
      outstanding: addVat(subtotal),
      issueDate: data.issueDate || today(),
      dueDate: data.dueDate || new Date(Date.now() + this.data.config.paymentTermsDays * 86400000).toISOString().split("T")[0],
      notes: data.notes || "",
      payments: [],
      history: [{ action: "created", t: now() }],
      createdAt: now(),
    };

    this.data.invoices.push(inv);
    this.save();
    log("FINANCE", `🧾 חשבונית: ${inv.number} — ${inv.customer.name} — ₪${shekel(inv.total)} (כולל מע"מ ₪${shekel(inv.vat)})`);
    return inv;
  }

  _nextInvoiceNumber() {
    const year = new Date().getFullYear();
    const count = this.data.invoices.filter(i => (i.number || "").startsWith(`${year}-`)).length;
    return `${year}-${String(count + 1).padStart(5, "0")}`;
  }

  issueInvoice(invoiceId) {
    const inv = this.data.invoices.find(i => i.id === invoiceId);
    if (!inv) return null;
    inv.status = "issued";
    inv.history.push({ action: "issued", t: now() });
    this.save();
    return inv;
  }

  recordPayment(invoiceId, data) {
    const inv = this.data.invoices.find(i => i.id === invoiceId);
    if (!inv) return null;
    const payment = {
      id: uid(),
      amount: data.amount || 0,
      method: data.method || "bank_transfer", // bank_transfer, check, cash, credit_card
      reference: data.reference || "",
      date: data.date || today(),
      bankAccountId: data.bankAccountId || "BANK-MAIN",
      notes: data.notes || "",
    };
    inv.payments.push(payment);
    inv.paid += payment.amount;
    inv.outstanding = inv.total - inv.paid;

    if (inv.outstanding <= 0) {
      inv.status = "paid";
      inv.history.push({ action: "fully_paid", t: now() });
      this.memory.add("successes", { type: "invoice_paid", invoiceId: inv.id, amount: inv.total });
    } else {
      inv.history.push({ action: "partial_payment", amount: payment.amount, t: now() });
    }

    // עדכון חשבון בנק
    const bank = this.data.bankAccounts.find(b => b.id === payment.bankAccountId);
    if (bank) bank.balance += payment.amount;

    // רישום טרנזקציה
    this.recordTransaction({
      type: "income",
      amount: payment.amount,
      description: `תשלום חשבונית ${inv.number}`,
      invoiceId: inv.id,
      bankAccountId: payment.bankAccountId,
    });

    this.save();
    log("FINANCE", `💵 תשלום: ${inv.number} — ₪${shekel(payment.amount)} (נותר: ₪${shekel(inv.outstanding)})`, "SUCCESS");
    return inv;
  }

  createExpense(data) {
    const e = {
      id: `EXP-${uid()}`,
      category: data.category || "general", // materials, labor, rent, utilities, fuel, insurance, tax, marketing, office, other
      description: data.description || "",
      vendor: data.vendor || "",
      amount: data.amount || 0,
      vatAmount: data.vatAmount !== undefined ? data.vatAmount : vatOf(data.amount || 0),
      totalAmount: data.totalAmount !== undefined ? data.totalAmount : addVat(data.amount || 0),
      date: data.date || today(),
      paymentMethod: data.paymentMethod || "bank_transfer",
      bankAccountId: data.bankAccountId || "BANK-MAIN",
      reference: data.reference || "",
      receiptUrl: data.receiptUrl || "",
      taxDeductible: data.taxDeductible !== undefined ? data.taxDeductible : true,
      projectId: data.projectId || null,
      notes: data.notes || "",
      status: "recorded",
      createdAt: now(),
    };
    this.data.expenses.push(e);

    // עדכון בנק (יציאה)
    const bank = this.data.bankAccounts.find(b => b.id === e.bankAccountId);
    if (bank) bank.balance -= e.totalAmount;

    this.recordTransaction({
      type: "expense",
      amount: -e.totalAmount,
      description: `${e.category}: ${e.description}`,
      expenseId: e.id,
      bankAccountId: e.bankAccountId,
    });

    this.save();
    log("FINANCE", `💸 הוצאה: ${e.description} — ₪${shekel(e.totalAmount)} (${e.category})`);
    return e;
  }

  recordTransaction(data) {
    const t = {
      id: `TRX-${uid()}`,
      type: data.type, // income, expense, transfer, adjustment
      amount: data.amount || 0,
      description: data.description || "",
      bankAccountId: data.bankAccountId || "BANK-MAIN",
      invoiceId: data.invoiceId || null,
      expenseId: data.expenseId || null,
      date: data.date || today(),
      createdAt: now(),
    };
    this.data.transactions.push(t);
    this.save();
    return t;
  }

  getRevenue(fromDate, toDate) {
    return this.data.invoices
      .filter(i => i.status === "paid" && i.issueDate >= fromDate && i.issueDate <= toDate)
      .reduce((s, i) => s + i.subtotal, 0);
  }

  getExpensesTotal(fromDate, toDate) {
    return this.data.expenses
      .filter(e => e.date >= fromDate && e.date <= toDate)
      .reduce((s, e) => s + e.amount, 0);
  }

  getProfitLoss(fromDate, toDate) {
    const revenue = this.getRevenue(fromDate, toDate);
    const expenses = this.getExpensesTotal(fromDate, toDate);
    const grossProfit = revenue - expenses;
    const grossMarginPercent = revenue > 0 ? grossProfit / revenue : 0;

    return {
      period: { from: fromDate, to: toDate },
      revenue,
      expenses,
      grossProfit,
      grossMarginPercent,
      asShekels: {
        revenue: shekel(revenue),
        expenses: shekel(expenses),
        grossProfit: shekel(grossProfit),
        grossMarginPercent: (grossMarginPercent * 100).toFixed(1) + "%",
      },
    };
  }

  getOverdueInvoices() {
    const today_ = today();
    return this.data.invoices.filter(i =>
      i.status !== "paid" && i.status !== "cancelled" && i.dueDate < today_ && i.outstanding > 0
    );
  }

  getTotalCash() {
    return this.data.bankAccounts.reduce((s, b) => s + b.balance, 0);
  }

  getOutstandingAR() {
    return this.data.invoices
      .filter(i => i.status !== "paid" && i.status !== "cancelled")
      .reduce((s, i) => s + i.outstanding, 0);
  }

  calculateVATReport(period) {
    const invoices = this.data.invoices.filter(i => i.issueDate.startsWith(period) && i.status !== "cancelled");
    const expenses = this.data.expenses.filter(e => e.date.startsWith(period));

    const outputVAT = invoices.reduce((s, i) => s + i.vat, 0);
    const inputVAT = expenses.reduce((s, e) => s + (e.vatAmount || 0), 0);
    const netVAT = outputVAT - inputVAT;

    const report = {
      id: `VAT-${period}`,
      period,
      outputVAT,
      inputVAT,
      netVAT,
      owedToTax: Math.max(0, netVAT),
      refundFromTax: Math.max(0, -netVAT),
      invoiceCount: invoices.length,
      expenseCount: expenses.length,
      generatedAt: now(),
    };

    const existing = this.data.vatReports.findIndex(r => r.period === period);
    if (existing >= 0) this.data.vatReports[existing] = report;
    else this.data.vatReports.push(report);
    this.save();
    return report;
  }

  async analyze() {
    const thisMonth = today().substring(0, 7);
    const monthStart = `${thisMonth}-01`;
    const monthEnd = today();
    const pl = this.getProfitLoss(monthStart, monthEnd);
    const overdue = this.getOverdueInvoices();
    const cash = this.getTotalCash();
    const ar = this.getOutstandingAR();

    return await this.brain.thinkJSON(`
אתה CFO אוטונומי של טכנו כל עוזי + קובי אלקיים נדל"ן.
תפקידך: לנתח את המצב הפיננסי, לזהות סיכונים, ולהמליץ על פעולות.

═══ נתונים החודש (${thisMonth}) ═══
הכנסות (שולמו): ₪${shekel(pl.revenue)}
הוצאות: ₪${shekel(pl.expenses)}
רווח גולמי: ₪${shekel(pl.grossProfit)}
מרווח גולמי: ${(pl.grossMarginPercent * 100).toFixed(1)}%

═══ מצב כללי ═══
יתרה בבנק: ₪${shekel(cash)}
חובות פתוחים (AR): ₪${shekel(ar)}
חשבוניות באיחור: ${overdue.length}
סה"כ איחורים: ₪${shekel(overdue.reduce((s, i) => s + i.outstanding, 0))}

═══ חשבוניות פתוחות ═══
${JSON.stringify(this.data.invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").slice(-10).map(i => ({
  number: i.number, customer: i.customer.name,
  amount: shekel(i.total), outstanding: shekel(i.outstanding),
  dueDate: i.dueDate, status: i.status,
  daysOverdue: i.dueDate < today() ? daysAgo(i.dueDate + "T00:00:00Z") : 0,
})))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "סיכום פיננסי ב-2-3 משפטים",
  "cashflow": {
    "currentPosition": 0,
    "projected30Days": 0,
    "projected60Days": 0,
    "projected90Days": 0,
    "runway": "...",
    "liquidityRisk": "low/medium/high/critical"
  },
  "profitability": {
    "grossMargin": 0,
    "netMargin": 0,
    "trend": "rising/stable/falling",
    "benchmark": "..."
  },
  "collectionActions": [{
    "invoiceId": "...", "customer": "...", "amount": 0,
    "daysOverdue": 0, "action": "call/email/legal",
    "priority": "critical/high/medium/low",
    "suggestedMessage": "..."
  }],
  "costOptimizations": [{
    "category": "...", "currentSpend": 0,
    "suggestedAction": "...", "potentialSaving": 0
  }],
  "vatCompliance": {
    "nextReportDue": "...",
    "estimatedPayable": 0,
    "readiness": "ready/needs_review/incomplete"
  },
  "investmentOpportunities": [{
    "opportunity": "...", "expectedROI": 0, "risk": "...", "horizon": "..."
  }],
  "risks": [{
    "risk": "...", "probability": 0, "impact": 0, "mitigation": "..."
  }],
  "kpis": {
    "currentRatio": 0,
    "dso": 0,
    "dpo": 0,
    "workingCapital": 0,
    "operatingMargin": 0,
    "cashConversionCycle": 0
  }
}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 3/4
// OPS + PRICING + QUALITY + NOTIFICATIONS + ANALYTICS
// ════════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════
// OPS MODULE — Operations / Field
// ═══════════════════════════════════════

class OpsModule {
  constructor(brain, memory, erp, hr) {
    this.brain = brain;
    this.memory = memory;
    this.erp = erp;
    this.hr = hr;
    this.file = path.join(CONFIG.DIR, "ops", "state.json");
    this.data = load(this.file, {
      measurements: [],
      installations: [],
      vehicles: [
        { id: "VEH-1", plate: "12-345-67", type: "משאית", driver: null, status: "available", fuel: 80, nextService: null },
        { id: "VEH-2", plate: "23-456-78", type: "טנדר", driver: null, status: "available", fuel: 60, nextService: null },
        { id: "VEH-3", plate: "34-567-89", type: "רכב מדידות", driver: null, status: "available", fuel: 90, nextService: null },
      ],
      incidents: [],
      dailyPlans: [],
      equipment: [],
    });
  }
  save() { save(this.file, this.data); }

  scheduleMeasurement(data) {
    const m = {
      id: `MSR-${uid()}`,
      projectId: data.projectId || null,
      leadId: data.leadId || null,
      customerName: data.customerName || "",
      customerPhone: data.customerPhone || "",
      address: data.address || "",
      city: data.city || "",
      scheduledAt: data.scheduledAt,
      assignedTo: data.assignedTo || CONFIG.BUSINESS.techno.keyPeople.field.name,
      vehicleId: data.vehicleId || null,
      estimatedDuration: data.estimatedDuration || 60, // minutes
      status: "scheduled", // scheduled, in_progress, completed, cancelled, rescheduled
      notes: data.notes || "",
      measurements: {},
      photos: [],
      sketches: [],
      createdAt: now(),
    };
    this.data.measurements.push(m);
    this.save();
    log("OPS", `📏 מדידה: ${m.customerName} — ${m.scheduledAt} — ${m.assignedTo}`);
    return m;
  }

  completeMeasurement(measurementId, data) {
    const m = this.data.measurements.find(x => x.id === measurementId);
    if (!m) return null;
    m.status = "completed";
    m.completedAt = now();
    m.measurements = data.measurements || {};
    m.photos = data.photos || [];
    m.sketches = data.sketches || [];
    m.notes = data.notes || m.notes;

    // עדכון פרויקט
    if (m.projectId) {
      this.erp.updateProject(m.projectId, {
        measurements: data.measurements,
        timeline: { measurementDone: now() },
        status: "measured",
      });
    }

    this.save();
    log("OPS", `✅ מדידה הושלמה: ${m.customerName}`, "SUCCESS");
    this.memory.add("shortTerm", { type: "measurement_completed", id: m.id, projectId: m.projectId });
    return m;
  }

  scheduleInstallation(data) {
    const inst = {
      id: `INS-${uid()}`,
      projectId: data.projectId,
      customerName: data.customerName || "",
      customerPhone: data.customerPhone || "",
      address: data.address || "",
      scheduledDate: data.scheduledDate,
      estimatedHours: data.estimatedHours || 4,
      team: data.team || [],
      vehicleId: data.vehicleId || null,
      equipment: data.equipment || [],
      materials: data.materials || [],
      status: "scheduled",
      prerequisites: data.prerequisites || [],
      safetyChecks: [],
      photos: { before: [], during: [], after: [] },
      customerSignoff: null,
      notes: data.notes || "",
      createdAt: now(),
    };
    this.data.installations.push(inst);
    this.save();
    log("OPS", `🛠️  התקנה: ${inst.customerName} — ${inst.scheduledDate} — ${inst.team.join(", ")}`);
    return inst;
  }

  startInstallation(installationId) {
    const inst = this.data.installations.find(i => i.id === installationId);
    if (!inst) return null;
    inst.status = "in_progress";
    inst.startedAt = now();
    if (inst.projectId) {
      this.erp.updateProject(inst.projectId, { status: "installing", timeline: { installationStart: now() } });
    }
    this.save();
    return inst;
  }

  completeInstallation(installationId, data) {
    const inst = this.data.installations.find(i => i.id === installationId);
    if (!inst) return null;
    inst.status = "completed";
    inst.completedAt = now();
    inst.customerSignoff = data.customerSignoff || null;
    inst.photos.after = data.photosAfter || inst.photos.after;
    inst.notes = data.notes || inst.notes;

    if (inst.projectId) {
      this.erp.updateProject(inst.projectId, {
        status: "installed",
        timeline: { installationEnd: now() },
      });
    }

    this.save();
    log("OPS", `✅ התקנה הושלמה: ${inst.customerName}`, "SUCCESS");
    this.memory.add("successes", { type: "installation_completed", id: inst.id });
    return inst;
  }

  assignVehicle(vehicleId, driverId) {
    const v = this.data.vehicles.find(x => x.id === vehicleId);
    if (!v) return null;
    v.driver = driverId;
    v.status = "in_use";
    v.assignedAt = now();
    this.save();
    return v;
  }

  releaseVehicle(vehicleId) {
    const v = this.data.vehicles.find(x => x.id === vehicleId);
    if (!v) return null;
    v.driver = null;
    v.status = "available";
    v.releasedAt = now();
    this.save();
    return v;
  }

  reportIncident(data) {
    const i = {
      id: `INC-${uid()}`,
      type: data.type || "other", // injury, damage, delay, complaint, near_miss, equipment_failure, other
      severity: data.severity || "medium", // low, medium, high, critical
      description: data.description || "",
      location: data.location || "",
      projectId: data.projectId || null,
      reportedBy: data.reportedBy || "",
      involvedPersons: data.involvedPersons || [],
      actionsToken: data.actionsTaken || [],
      status: "open", // open, investigating, resolved, closed
      photos: data.photos || [],
      reportedAt: now(),
    };
    this.data.incidents.push(i);
    this.save();
    log("OPS", `⚠️  תקרית: ${i.type} — ${i.severity} — ${i.description}`, "WARN");
    this.memory.add("alerts", { type: "incident", severity: i.severity, id: i.id });
    return i;
  }

  async planDay(date = today()) {
    const todayMeasurements = this.data.measurements.filter(m => m.scheduledAt && m.scheduledAt.startsWith(date) && m.status === "scheduled");
    const todayInstallations = this.data.installations.filter(i => i.scheduledDate && i.scheduledDate.startsWith(date) && i.status === "scheduled");
    const availableVehicles = this.data.vehicles.filter(v => v.status === "available").length;
    const activeEmployees = this.hr.getActiveEmployees().filter(e => e.department === "התקנה" || e.department === "מדידות").length;

    const plan = await this.brain.thinkJSON(`
אתה מנהל תפעול של טכנו כל עוזי. תכנן את יום העבודה (${date}).

═══ משימות מתוכננות ═══
מדידות: ${todayMeasurements.length}
${JSON.stringify(todayMeasurements.map(m => ({ time: m.scheduledAt, customer: m.customerName, city: m.city, duration: m.estimatedDuration })))}

התקנות: ${todayInstallations.length}
${JSON.stringify(todayInstallations.map(i => ({ date: i.scheduledDate, customer: i.customerName, hours: i.estimatedHours, team: i.team })))}

═══ משאבים ═══
רכבים זמינים: ${availableVehicles}
עובדי שטח: ${activeEmployees}
שעות עבודה: 07:00-16:00 (8.5 שעות)

תחזיר JSON:
{
  "date": "${date}",
  "summary": "תקציר היום",
  "schedule": [{
    "time": "HH:MM",
    "task": "...",
    "assignedTo": "...",
    "vehicle": "...",
    "estimatedDuration": 0,
    "priority": "critical/high/medium/low",
    "notes": "..."
  }],
  "conflicts": [{
    "type": "...", "description": "...", "resolution": "..."
  }],
  "resources": {
    "vehiclesNeeded": 0,
    "vehiclesAvailable": 0,
    "peopleNeeded": 0,
    "peopleAvailable": 0
  },
  "risks": [{
    "risk": "...", "mitigation": "..."
  }],
  "recommendations": ["..."]
}`);

    if (plan) {
      this.data.dailyPlans.push({ ...plan, createdAt: now() });
      this.save();
    }
    return plan;
  }

  async analyze() {
    const activeMeasurements = this.data.measurements.filter(m => m.status === "scheduled");
    const activeInstallations = this.data.installations.filter(i => i.status === "scheduled" || i.status === "in_progress");
    const openIncidents = this.data.incidents.filter(i => i.status === "open");

    return await this.brain.thinkJSON(`
אתה מנהל תפעול אוטונומי של טכנו כל עוזי. נתח את המצב התפעולי.

מדידות מתוכננות: ${activeMeasurements.length}
התקנות פעילות: ${activeInstallations.length}
רכבים זמינים: ${this.data.vehicles.filter(v => v.status === "available").length}/${this.data.vehicles.length}
תקריות פתוחות: ${openIncidents.length}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "...",
  "fieldEfficiency": {
    "score": 0,
    "issues": [],
    "improvements": []
  },
  "vehicleUtilization": 0,
  "safetyIssues": [],
  "bottlenecks": [],
  "recommendations": []
}`);
  }
}

// ═══════════════════════════════════════
// PRICING MODULE
// ═══════════════════════════════════════

class PricingModule {
  constructor(brain, memory, erp, bom) {
    this.brain = brain;
    this.memory = memory;
    this.erp = erp;
    this.bom = bom;
    this.file = path.join(CONFIG.DIR, "pricing", "state.json");
    this.data = load(this.file, {
      quotes: [],
      priceBook: {
        railing_iron: { minPerMeter: agorot(450), targetPerMeter: agorot(620), premiumPerMeter: agorot(850) },
        railing_aluminum: { minPerMeter: agorot(520), targetPerMeter: agorot(720), premiumPerMeter: agorot(1100) },
        railing_glass: { minPerMeter: agorot(1800), targetPerMeter: agorot(2400), premiumPerMeter: agorot(3200) },
        gate_electric: { min: agorot(850000), target: agorot(1250000), premium: agorot(1850000) },
        fence_iron: { minPerMeter: agorot(380), targetPerMeter: agorot(520), premiumPerMeter: agorot(750) },
        pergola_aluminum: { minPerSqm: agorot(1200), targetPerSqm: agorot(1600), premiumPerSqm: agorot(2200) },
      },
      discountPolicy: {
        maxDiscountPercent: 0.12,    // 12% max discount
        repeatCustomerDiscount: 0.05, // 5% for repeat customers
        volumeDiscount: [
          { minAmount: agorot(2000000), discountPercent: 0.03 },  // 3% on 20K+
          { minAmount: agorot(5000000), discountPercent: 0.06 },  // 6% on 50K+
          { minAmount: agorot(10000000), discountPercent: 0.08 }, // 8% on 100K+
        ],
      },
      competitorPricing: {
        "מעקות ישראל": { railing_iron: 0.92, railing_aluminum: 0.95 }, // relative to ours
        "א.ב מסגרות": { railing_iron: 0.88, gate_electric: 0.9 },
      },
    });
  }
  save() { save(this.file, this.data); }

  async generateQuote(data) {
    const quote = {
      id: `QT-${uid()}`,
      number: this._nextQuoteNumber(),
      projectId: data.projectId || null,
      leadId: data.leadId || null,
      customer: {
        name: data.customerName || "",
        phone: data.customerPhone || "",
        email: data.customerEmail || "",
        address: data.address || "",
      },
      projectType: data.projectType,
      measurements: data.measurements || {},
      items: [],
      subtotal: 0,
      discount: 0,
      discountPercent: 0,
      afterDiscount: 0,
      vat: 0,
      total: 0,
      margin: 0,
      marginPercent: 0,
      validUntil: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      status: "draft",
      terms: "תוקף ההצעה 14 ימים. תשלום: 50% מקדמה, 50% בסיום. אחריות 10 שנים.",
      notes: data.notes || "",
      aiReasoning: null,
      createdAt: now(),
    };

    // בניית BOM מתבנית
    const bom = this.bom.createFromTemplate(data.projectType, data.quantity || 1, data.projectId);
    if (bom) {
      quote.bomId = bom.id;
      quote.items.push({
        description: bom.name,
        qty: data.quantity || 1,
        unitPrice: bom.costs.sellPrice,
        totalPrice: bom.costs.sellPrice,
      });
      quote.subtotal = bom.costs.sellPrice;
    } else if (data.items) {
      quote.items = data.items;
      quote.subtotal = data.items.reduce((s, i) => s + (i.totalPrice || 0), 0);
    }

    // הנחות אוטומטיות
    let discountPercent = 0;
    for (const tier of this.data.discountPolicy.volumeDiscount) {
      if (quote.subtotal >= tier.minAmount) discountPercent = Math.max(discountPercent, tier.discountPercent);
    }
    if (data.isRepeatCustomer) discountPercent += this.data.discountPolicy.repeatCustomerDiscount;
    discountPercent = Math.min(discountPercent, this.data.discountPolicy.maxDiscountPercent);

    quote.discountPercent = discountPercent;
    quote.discount = Math.round(quote.subtotal * discountPercent);
    quote.afterDiscount = quote.subtotal - quote.discount;
    quote.vat = vatOf(quote.afterDiscount);
    quote.total = addVat(quote.afterDiscount);

    // AI reasoning — הסבר המחיר
    quote.aiReasoning = await this.brain.thinkJSON(`
אתה מנהל Pricing אוטונומי של טכנו כל עוזי.
נבנתה הצעת מחיר — נתח אותה ותסביר את ההיגיון.

הצעה: ${quote.projectType}
גודל: ${JSON.stringify(quote.measurements)}
עלות מחושבת: ₪${shekel(quote.subtotal)}
הנחה: ${(discountPercent * 100).toFixed(1)}%
מחיר סופי (לפני מע"מ): ₪${shekel(quote.afterDiscount)}
מחיר כולל מע"מ: ₪${shekel(quote.total)}

תחזיר JSON:
{
  "competitiveAnalysis": "...",
  "valueProposition": "...",
  "negotiationRoom": 0,
  "winProbability": 0.0-1.0,
  "alternativeOffers": [{"description": "...", "price": 0, "reason": "..."}],
  "riskFactors": ["..."],
  "suggestedApproach": "...",
  "talkingPoints": ["...", "...", "..."]
}`);

    this.data.quotes.push(quote);
    this.save();
    log("PRICING", `💰 הצעת מחיר: ${quote.number} — ${quote.customer.name} — ₪${shekel(quote.total)}`);
    return quote;
  }

  _nextQuoteNumber() {
    const year = new Date().getFullYear();
    const count = this.data.quotes.filter(q => (q.number || "").startsWith(`Q${year}`)).length;
    return `Q${year}-${String(count + 1).padStart(4, "0")}`;
  }

  approveQuote(quoteId, customerApproval = true) {
    const q = this.data.quotes.find(x => x.id === quoteId);
    if (!q) return null;
    q.status = customerApproval ? "approved" : "rejected";
    q.statusChangedAt = now();
    this.save();
    if (customerApproval && q.projectId) {
      this.erp.updateProject(q.projectId, {
        status: "approved",
        costs: { quoted: q.afterDiscount, vat: q.vat, totalWithVat: q.total },
        timeline: { quoteApproved: now() },
      });
    }
    return q;
  }

  async analyze() {
    const recent = this.data.quotes.slice(-30);
    const approved = recent.filter(q => q.status === "approved").length;
    const winRate = recent.length > 0 ? approved / recent.length : 0;

    return await this.brain.thinkJSON(`
אתה מנהל Pricing אוטונומי של טכנו כל עוזי.

═══ נתונים ═══
סה"כ הצעות: ${this.data.quotes.length}
30 אחרונות: ${recent.length}
אחוז זכיה: ${(winRate * 100).toFixed(1)}%
ערך ממוצע: ₪${recent.length > 0 ? shekel(Math.round(recent.reduce((s, q) => s + q.total, 0) / recent.length)) : "0"}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "...",
  "winRateAnalysis": {
    "current": 0,
    "benchmark": 0,
    "trend": "...",
    "recommendations": []
  },
  "pricingRecommendations": [{
    "projectType": "...", "action": "raise/lower/segment",
    "amount": 0, "reason": "..."
  }],
  "competitorPressure": [{
    "competitor": "...", "impact": "...", "response": "..."
  }],
  "lostReasons": [{ "reason": "...", "frequency": 0, "mitigation": "..." }]
}`);
  }
}

// ═══════════════════════════════════════
// QUALITY MODULE
// ═══════════════════════════════════════

class QualityModule {
  constructor(brain, memory, erp) {
    this.brain = brain;
    this.memory = memory;
    this.erp = erp;
    this.file = path.join(CONFIG.DIR, "quality", "state.json");
    this.data = load(this.file, {
      inspections: [],
      defects: [],
      warranties: [],
      complaints: [],
      standards: {
        railing: ["ת\"י 1142", "גובה 105ס\"מ מינימום", "מרווח מקסימלי 10ס\"מ", "ללא חלודה", "חיבורים מרותכים"],
        gate: ["ת\"י 1201", "פוטוצל בטיחות", "גלאי עצירה אוטומטי", "הארקה תקינה"],
        pergola: ["עמידות רוח 100 קמ\"ש", "ניקוז מים", "צבע אבקה"],
      },
      kpis: {
        defectRate: 0,
        firstTimeRight: 0,
        warrantyClaimRate: 0,
        customerSatisfaction: 0,
      },
    });
  }
  save() { save(this.file, this.data); }

  createInspection(data) {
    const insp = {
      id: `QC-${uid()}`,
      projectId: data.projectId,
      stage: data.stage || "pre_delivery", // incoming_materials, in_production, pre_delivery, post_installation, warranty
      inspector: data.inspector || "",
      checkedAt: data.checkedAt || now(),
      checklist: data.checklist || [],
      result: "pending", // pass, fail, conditional
      defects: [],
      photos: data.photos || [],
      notes: data.notes || "",
      signedOff: false,
      createdAt: now(),
    };
    this.data.inspections.push(insp);
    this.save();
    log("QA", `🔍 בדיקה: ${insp.id} — שלב: ${insp.stage}`);
    return insp;
  }

  completeInspection(inspectionId, result, defects = []) {
    const insp = this.data.inspections.find(i => i.id === inspectionId);
    if (!insp) return null;
    insp.result = result;
    insp.defects = defects;
    insp.signedOff = result === "pass";

    for (const d of defects) {
      this.reportDefect({ ...d, projectId: insp.projectId, inspectionId: insp.id });
    }

    if (result === "pass" && insp.projectId) {
      this.erp.updateProject(insp.projectId, { status: "completed" });
    } else if (result === "fail" && insp.projectId) {
      this.erp.updateProject(insp.projectId, { status: "rework" });
    }

    this.save();
    log("QA", `${result === "pass" ? "✅" : "❌"} בדיקה ${inspectionId}: ${result}`);
    return insp;
  }

  reportDefect(data) {
    const d = {
      id: `DEF-${uid()}`,
      projectId: data.projectId,
      inspectionId: data.inspectionId || null,
      type: data.type || "cosmetic", // cosmetic, structural, functional, safety, dimensional
      severity: data.severity || "minor", // critical, major, minor, cosmetic
      description: data.description || "",
      location: data.location || "",
      rootCause: data.rootCause || "unknown",
      correctiveAction: data.correctiveAction || "",
      assignedTo: data.assignedTo || null,
      status: "open", // open, in_progress, resolved, verified
      photos: data.photos || [],
      cost: data.cost || 0,
      createdAt: now(),
    };
    this.data.defects.push(d);
    this.memory.add("mistakes", { type: "defect", id: d.id, severity: d.severity, projectId: d.projectId });
    this.save();
    log("QA", `⚠️  פגם: ${d.type}/${d.severity} — ${d.description}`, "WARN");
    return d;
  }

  resolveDefect(defectId, data) {
    const d = this.data.defects.find(x => x.id === defectId);
    if (!d) return null;
    d.status = "resolved";
    d.resolvedAt = now();
    d.resolutionNotes = data.notes || "";
    d.rootCause = data.rootCause || d.rootCause;
    d.actualCost = data.actualCost || 0;
    this.save();
    return d;
  }

  createWarranty(data) {
    const w = {
      id: `WAR-${uid()}`,
      projectId: data.projectId,
      customerName: data.customerName,
      customerPhone: data.customerPhone || "",
      startDate: data.startDate || today(),
      endDate: data.endDate || new Date(Date.now() + 10 * 365 * 86400000).toISOString().split("T")[0],
      durationYears: data.durationYears || 10,
      coverage: data.coverage || ["material_defects", "workmanship", "structural_integrity"],
      exclusions: data.exclusions || ["normal_wear", "misuse", "weather_extreme_events"],
      status: "active",
      claims: [],
      createdAt: now(),
    };
    this.data.warranties.push(w);
    this.save();
    log("QA", `🛡️  אחריות: ${w.customerName} — ${w.durationYears} שנים`);
    return w;
  }

  recordComplaint(data) {
    const c = {
      id: `CMP-${uid()}`,
      projectId: data.projectId || null,
      customerName: data.customerName || "",
      customerPhone: data.customerPhone || "",
      date: data.date || today(),
      category: data.category || "product_quality",
      severity: data.severity || "medium",
      description: data.description || "",
      resolution: null,
      status: "new",
      satisfactionAfter: null,
      createdAt: now(),
    };
    this.data.complaints.push(c);
    this.memory.add("mistakes", { type: "complaint", id: c.id, category: c.category });
    this.save();
    log("QA", `📢 תלונה: ${c.customerName} — ${c.severity}`, "WARN");
    return c;
  }

  calculateKPIs() {
    const completedProjects = this.erp.data.projects.filter(p => p.status === "completed").length || 1;
    const defects = this.data.defects.length;
    const criticalDefects = this.data.defects.filter(d => d.severity === "critical" || d.severity === "major").length;
    const passedInspections = this.data.inspections.filter(i => i.result === "pass").length;
    const totalInspections = this.data.inspections.length || 1;
    const claims = this.data.warranties.reduce((s, w) => s + w.claims.length, 0);
    const warranties = this.data.warranties.length || 1;

    this.data.kpis = {
      defectRate: criticalDefects / completedProjects,
      firstTimeRight: passedInspections / totalInspections,
      warrantyClaimRate: claims / warranties,
      customerSatisfaction: this.data.complaints.length === 0 ? 1 : Math.max(0, 1 - (this.data.complaints.length / completedProjects)),
    };
    this.save();
    return this.data.kpis;
  }

  async analyze() {
    const kpis = this.calculateKPIs();
    const openDefects = this.data.defects.filter(d => d.status === "open");
    const openComplaints = this.data.complaints.filter(c => c.status === "new" || c.status === "in_progress");

    return await this.brain.thinkJSON(`
אתה מנהל איכות אוטונומי של טכנו כל עוזי.

═══ נתונים ═══
סה"כ בדיקות: ${this.data.inspections.length}
פגמים פתוחים: ${openDefects.length}
תלונות פתוחות: ${openComplaints.length}
אחריות פעילה: ${this.data.warranties.filter(w => w.status === "active").length}

KPIs:
- אחוז תקינות ראשונה: ${(kpis.firstTimeRight * 100).toFixed(1)}%
- שיעור פגמים: ${(kpis.defectRate * 100).toFixed(1)}%
- שיעור תביעות אחריות: ${(kpis.warrantyClaimRate * 100).toFixed(1)}%
- שביעות רצון: ${(kpis.customerSatisfaction * 100).toFixed(1)}%

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "...",
  "qualityTrend": "improving/stable/degrading",
  "rootCauseAnalysis": [{
    "pattern": "...", "frequency": 0, "rootCause": "...",
    "recommendation": "..."
  }],
  "preventiveActions": [{
    "action": "...", "targetArea": "...", "expectedImpact": "..."
  }],
  "trainingRecommendations": [{
    "skill": "...", "audience": "...", "priority": "..."
  }]
}`);
  }
}

// ═══════════════════════════════════════
// NOTIFICATION MODULE
// ═══════════════════════════════════════

class NotificationModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "notifications", "state.json");
    this.data = load(this.file, {
      queue: [],
      sent: [],
      failed: [],
      templates: {
        lead_new: "שלום {name}, קיבלנו את פנייתך! ניצור איתך קשר בהקדם.",
        measurement_reminder: "שלום {name}, תזכורת: מדידה מתוכננת מחר בשעה {time} בכתובת {address}.",
        quote_sent: "שלום {name}, הצעת המחיר שלך מוכנה. סה״כ: ₪{total} (כולל מע״מ). ההצעה בתוקף עד {validUntil}.",
        installation_scheduled: "שלום {name}, ההתקנה שלך מתוכננת ל-{date}. הצוות יגיע בין {timeStart}-{timeEnd}.",
        installation_complete: "שלום {name}, ההתקנה הושלמה! תודה על האמון. האחריות שלך פעילה ל-10 שנים.",
        invoice_sent: "שלום {name}, חשבונית {number} ע״ס ₪{total} נשלחה. לתשלום עד {dueDate}.",
        payment_reminder: "שלום {name}, תזכורת: חשבונית {number} ע״ס ₪{amount} באיחור של {daysOverdue} ימים.",
        warranty_reminder: "שלום {name}, האחריות שלך על הפרויקט {project} עומדת להסתיים בעוד חודש.",
      },
      channels: {
        whatsapp: { enabled: true, priority: 1 },
        sms: { enabled: true, priority: 2 },
        email: { enabled: true, priority: 3 },
        push: { enabled: false, priority: 4 },
      },
      stats: { sent: 0, failed: 0, delivered: 0, clicked: 0 },
    });
  }
  save() { save(this.file, this.data); }

  render(templateKey, vars) {
    const tpl = this.data.templates[templateKey];
    if (!tpl) return null;
    return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }

  enqueue(data) {
    const n = {
      id: `NOT-${uid()}`,
      channel: data.channel || "whatsapp",
      to: data.to,
      toName: data.toName || "",
      template: data.template || null,
      vars: data.vars || {},
      message: data.message || (data.template ? this.render(data.template, data.vars || {}) : ""),
      priority: data.priority || "normal",
      scheduledAt: data.scheduledAt || now(),
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      createdAt: now(),
      leadId: data.leadId || null,
      projectId: data.projectId || null,
    };
    this.data.queue.push(n);
    this.save();
    log("NOTIFY", `📨 נוספה להודעות: ${n.channel} → ${n.toName || n.to}`);
    return n;
  }

  async processQueue() {
    const ready = this.data.queue.filter(n => n.status === "queued" && (new Date(n.scheduledAt).getTime() <= Date.now()));
    for (const n of ready) {
      n.status = "sending";
      n.attempts++;
      try {
        // In production: integrate with WhatsApp Business API / Twilio / SendGrid
        n.status = "sent";
        n.sentAt = now();
        this.data.sent.push(n);
        this.data.queue = this.data.queue.filter(x => x.id !== n.id);
        this.data.stats.sent++;
        log("NOTIFY", `✅ נשלח: ${n.channel} → ${n.toName || n.to}`, "SUCCESS");
      } catch (e) {
        if (n.attempts >= n.maxAttempts) {
          n.status = "failed";
          n.failedAt = now();
          n.error = e.message;
          this.data.failed.push(n);
          this.data.queue = this.data.queue.filter(x => x.id !== n.id);
          this.data.stats.failed++;
          log("NOTIFY", `❌ נכשל: ${n.channel} → ${n.toName || n.to}`, "ERROR");
        } else {
          n.status = "queued";
          n.scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        }
      }
    }
    this.save();
  }
}

// ═══════════════════════════════════════
// ANALYTICS MODULE
// ═══════════════════════════════════════

class AnalyticsModule {
  constructor(brain, memory, modules) {
    this.brain = brain;
    this.memory = memory;
    this.modules = modules; // { erp, crm, finance, hr, quality }
    this.file = path.join(CONFIG.DIR, "analytics", "state.json");
    this.data = load(this.file, {
      snapshots: [],
      reports: [],
      trends: {},
      insights: [],
    });
  }
  save() { save(this.file, this.data); }

  takeSnapshot() {
    const { erp, crm, finance, hr, quality } = this.modules;
    const snap = {
      id: `SNAP-${uid()}`,
      t: now(),
      erp: {
        projects: erp.data.projects.length,
        activeProjects: erp.data.projects.filter(p => !["completed", "cancelled", "lost"].includes(p.status)).length,
        inventoryValue: erp.getStockValue(),
        lowStockCount: erp.getLowStockItems().length,
        openPOs: erp.data.purchaseOrders.filter(p => !["received", "cancelled"].includes(p.status)).length,
        openWOs: erp.data.workOrders.filter(w => !["completed", "cancelled"].includes(w.status)).length,
      },
      crm: {
        leads: crm.data.leads.length,
        hotLeads: crm.getHotLeads().length,
        pipelineValue: crm.getPipelineValue(),
        pipeline: crm.getPipelineSummary(),
      },
      finance: {
        cash: finance.getTotalCash(),
        ar: finance.getOutstandingAR(),
        overdueCount: finance.getOverdueInvoices().length,
        overdueValue: finance.getOverdueInvoices().reduce((s, i) => s + i.outstanding, 0),
      },
      hr: {
        activeEmployees: hr.getActiveEmployees().length,
        monthlyPayroll: hr.getTotalMonthlyPayroll(),
        pendingLeaves: hr.data.leaveRequests.filter(r => r.status === "pending").length,
      },
      quality: {
        openDefects: quality.data.defects.filter(d => d.status === "open").length,
        openComplaints: quality.data.complaints.filter(c => c.status === "new" || c.status === "in_progress").length,
        kpis: quality.data.kpis,
      },
    };
    this.data.snapshots.push(snap);
    this.data.snapshots = this.data.snapshots.slice(-500);
    this.save();
    return snap;
  }

  async generateExecutiveReport() {
    const snap = this.takeSnapshot();
    const last10 = this.data.snapshots.slice(-10);

    const report = await this.brain.thinkJSON(`
אתה אנליסט עסקי בכיר של טכנו כל עוזי + קובי אלקיים נדל"ן.
תפיק דוח מנהלים שבועי של המצב הכללי.

═══ Snapshot נוכחי ═══
${JSON.stringify(snap, null, 2)}

═══ 10 Snapshots אחרונים (טרנדים) ═══
${JSON.stringify(last10.map(s => ({
  t: s.t,
  projects: s.erp.activeProjects,
  leads: s.crm.leads,
  cash: s.finance.cash,
  ar: s.finance.ar,
})))}

תחזיר JSON:
{
  "executiveSummary": "2-3 משפטים — המצב הכללי",
  "overallHealth": 0-100,
  "status": "healthy/warning/critical",
  "keyMetrics": {
    "revenueMTD": 0,
    "profitMTD": 0,
    "pipelineValue": 0,
    "cashPosition": 0
  },
  "winsOfTheWeek": ["...", "..."],
  "concernsOfTheWeek": ["...", "..."],
  "trendAnalysis": {
    "projects": "rising/stable/falling",
    "leads": "rising/stable/falling",
    "cash": "rising/stable/falling",
    "quality": "rising/stable/falling"
  },
  "criticalActions": [{
    "action": "...", "owner": "...", "deadline": "...", "impact": "..."
  }],
  "opportunities": [{
    "opportunity": "...", "estimatedValue": 0, "effort": "..."
  }],
  "weeklyForecast": {
    "expectedClosures": 0,
    "expectedRevenue": 0,
    "expectedExpenses": 0,
    "expectedNetCash": 0
  },
  "strategicRecommendations": ["..."]
}`);

    if (report) {
      this.data.reports.push({ ...report, _id: uid(), _t: now() });
      this.save();
    }
    return report;
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 4/4
// SWARM + ADVERSARIAL + DREAM + META-LEARN + GOALS + ORCHESTRATOR
// ════════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════
// SWARM COUNCIL — 7 C-level Agents
// ═══════════════════════════════════════

const AGENT_ROLES = {
  ceo: {
    name: "CEO",
    perspective: "אסטרטגיה, חזון, אינטרסים ארוכי טווח, בעלי מניות, מוניטין",
    priorities: ["צמיחה", "רווחיות", "קיימות", "מותג"],
  },
  coo: {
    name: "COO",
    perspective: "תפעול, יעילות, איכות ביצועים, אנשי צוות, שרשרת אספקה",
    priorities: ["זמני אספקה", "ניצולת", "בטיחות", "איכות"],
  },
  cfo: {
    name: "CFO",
    perspective: "כסף, תזרים, סיכון, דוחות, מיסוי, מרווחים",
    priorities: ["נזילות", "מרווחים", "DSO", "חשיפה"],
  },
  cmo: {
    name: "CMO",
    perspective: "שיווק, מותג, לקוחות, תחרות, ערך ללקוח",
    priorities: ["רכישת לקוחות", "CAC/LTV", "מיצוב", "נאמנות"],
  },
  cto: {
    name: "CTO",
    perspective: "טכנולוגיה, מערכות, אוטומציה, נתונים, חדשנות",
    priorities: ["אוטומציה", "דאטה", "סקלביליות", "אבטחה"],
  },
  chro: {
    name: "HR Director",
    perspective: "אנשים, תרבות, מוטיבציה, גיוס, שימור",
    priorities: ["שימור", "פרודוקטיביות", "מורל", "כישורים"],
  },
  cro: {
    name: "Risk Manager",
    perspective: "סיכונים, ציות, אסונות, משפט, ביטוח",
    priorities: ["מניעה", "תגובה", "ציות", "חוסן"],
  },
};

class SwarmCouncil {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "agents", "debates.json");
    this.debates = load(this.file, []);
  }
  save() { save(this.file, this.debates); }

  async debate(situation, options = null) {
    log("SWARM", `🎭 דיון התחיל: ${situation.substring(0, 80)}...`, "SWARM");
    const debate = {
      id: `DBT-${uid()}`,
      situation,
      options: options || [],
      rounds: [],
      finalDecision: null,
      dissent: [],
      createdAt: now(),
    };

    // Round 1: each agent speaks independently
    const openingStatements = {};
    for (const [key, role] of Object.entries(AGENT_ROLES)) {
      const systemPrompt = `אתה ה-${role.name} של טכנו כל עוזי + קובי אלקיים נדל"ן.
נקודת המבט שלך: ${role.perspective}
קדימויות: ${role.priorities.join(", ")}

אתה חושב כמו אדם בתפקיד הזה. אל תהיה מאוזן — דחוף את נקודת המבט שלך.
תחזיר JSON בלבד.`;

      const response = await this.brain.thinkJSON(`
מצב: ${situation}
${options ? `אפשרויות: ${JSON.stringify(options)}` : ""}

מה הניתוח שלך? מה העמדה שלך?

תחזיר JSON:
{
  "agent": "${role.name}",
  "position": "2-3 משפטים — העמדה שלך",
  "reasoning": "הסבר מפורט",
  "concerns": ["דאגה 1", "דאגה 2"],
  "requiredData": ["מידע חסר 1", "מידע חסר 2"],
  "preferredOption": "האפשרות המועדפת (אם יש)",
  "rejectedOptions": ["אפשרות שמתנגד לה"],
  "conditions": ["תנאי להסכמה"],
  "confidence": 0.0-1.0
}`, systemPrompt);

      openingStatements[key] = response;
    }
    debate.rounds.push({ round: 1, type: "opening", statements: openingStatements });

    // Round 2: debate — each agent sees others' positions
    const debateStatements = {};
    for (const [key, role] of Object.entries(AGENT_ROLES)) {
      const othersPositions = Object.entries(openingStatements)
        .filter(([k, _]) => k !== key)
        .map(([k, s]) => `${AGENT_ROLES[k].name}: ${s?.position || "—"}`)
        .join("\n");

      const systemPrompt = `אתה ה-${role.name}. שמעת את העמדות של שאר ה-C-level.
נקודת המבט שלך: ${role.perspective}
תחזיר JSON בלבד.`;

      const response = await this.brain.thinkJSON(`
מצב: ${situation}
העמדה ההתחלתית שלך: ${openingStatements[key]?.position || ""}

עמדות אחרים:
${othersPositions}

עכשיו עם המידע של האחרים — האם אתה משנה את דעתך? עם מי אתה מסכים? עם מי לא?

תחזיר JSON:
{
  "updatedPosition": "...",
  "changed": true/false,
  "agreesWith": ["CEO", "CFO"],
  "disagreesWith": ["CMO"],
  "counterArgument": "טיעון נגד מישהו ספציפי",
  "compromise": "פשרה אפשרית",
  "confidence": 0.0-1.0
}`, systemPrompt);

      debateStatements[key] = response;
    }
    debate.rounds.push({ round: 2, type: "cross_examination", statements: debateStatements });

    // Round 3: synthesis — one master synthesis by a meta agent
    const synthesis = await this.brain.thinkJSON(`
אתה בורר מומחה. קראת דיון של 7 מומחים:
${Object.entries(openingStatements).map(([k, s]) => `${AGENT_ROLES[k].name}: ${s?.position || "—"}`).join("\n")}

ועכשיו את הסבב השני:
${Object.entries(debateStatements).map(([k, s]) => `${AGENT_ROLES[k].name}: ${s?.updatedPosition || "—"}`).join("\n")}

מצב: ${situation}
${options ? `אפשרויות: ${JSON.stringify(options)}` : ""}

תפקידך: לסנתז את כל נקודות המבט להחלטה אחת מיטבית. לא הכי פופולרית — הכי נכונה.
לזהות Consensus / Dissent / Unresolved.

תחזיר JSON:
{
  "consensus": ["נקודות שכולם מסכימים"],
  "dissent": [{"agent": "...", "disagreement": "..."}],
  "winningOption": "...",
  "reasoning": "הסבר מפורט",
  "tradeoffs": [{"gain": "...", "loss": "..."}],
  "implementation": ["שלב 1", "שלב 2"],
  "monitoringPlan": ["מה לעקוב אחריו"],
  "fallbackPlan": "אם זה לא עובד — מה עושים",
  "confidence": 0.0-1.0,
  "recommendedAction": "הפעולה הספציפית לבצע עכשיו"
}`);

    debate.finalDecision = synthesis;
    debate.dissent = synthesis?.dissent || [];
    this.debates.push(debate);
    this.debates = this.debates.slice(-100);
    this.save();
    this.memory.add("decisions", {
      type: "swarm_debate",
      situation: situation.substring(0, 200),
      decision: synthesis?.recommendedAction || "pending",
      confidence: synthesis?.confidence || 0,
    });
    this.memory.stat("totalDebates");

    log("SWARM", `🎯 החלטה: ${synthesis?.recommendedAction?.substring(0, 60) || "—"} (conf ${synthesis?.confidence || 0})`, "SWARM");
    return debate;
  }
}

// ═══════════════════════════════════════
// ADVERSARIAL ENGINE — Red Team Self-Attack
// ═══════════════════════════════════════

class AdversarialEngine {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "agents", "adversarial.json");
    this.attacks = load(this.file, []);
  }
  save() { save(this.file, this.attacks); }

  async attack(decision, context = {}) {
    log("ADVERSARY", `⚔️  Red Team תוקף החלטה...`, "WARN");

    const attack = await this.brain.thinkJSON(`
אתה Red Team מקצועי. תפקידך: לקרוע את ההחלטה הזו לגזרים.
חפש חולשות. חפש Cognitive Biases. חפש Black Swans.
אל תהיה נחמד. תהיה אגרסיבי וזדוני (בטוב).

═══ ההחלטה שנבדקת ═══
${JSON.stringify(decision, null, 2)}

═══ קונטקסט ═══
${JSON.stringify(context, null, 2)}

═══ מה לבדוק ═══
1. Cognitive Biases — איזו הטיה נפלנו בה?
   - Confirmation bias (חיפשנו רק ראיות שתומכות)
   - Availability bias (זכרנו רק דברים נוכחיים)
   - Anchoring (נתלינו באמון ראשוני)
   - Sunk cost (התאהבנו בהשקעות קודמות)
   - Overconfidence (אנחנו בטוחים מדי)
   - Dunning-Kruger (אנחנו לא יודעים מה שאנחנו לא יודעים)

2. Black Swans — מה הכי גרוע שיכול לקרות?
   - רגולציה חדשה
   - תחרות אגרסיבית
   - משבר כלכלי
   - אסון טבע
   - טעויות בביצוע
   - תגובה של לקוחות שלא צפינו

3. Goodhart's Law — האם המטרה שנמדוד תעוות את ההתנהגות?
4. Second-Order Effects — מה ההשלכות של ההשלכות?
5. Unintended Consequences — מה יכול להתפקח לא נכון?
6. Moral Hazard — האם זה יוצר תמריצים רעים?
7. Reversibility — אם זה נכשל, האם ניתן לחזור?

תחזיר JSON:
{
  "verdict": "accept/reject/modify",
  "confidence": 0.0-1.0,
  "detectedBiases": [{
    "bias": "...", "evidence": "...", "severity": "low/medium/high"
  }],
  "blackSwans": [{
    "scenario": "...", "probability": 0.0-1.0, "impact": "catastrophic/severe/moderate",
    "mitigationNeeded": "..."
  }],
  "secondOrderEffects": [{
    "firstOrder": "...", "secondOrder": "...", "thirdOrder": "..."
  }],
  "criticalWeaknesses": ["חולשה 1", "חולשה 2"],
  "betterAlternatives": [{
    "alternative": "...", "reason": "..."
  }],
  "requiredSafeguards": ["בטחון 1", "בטחון 2"],
  "killCriteria": ["תנאי להפסקה"],
  "scoreAfterAttack": 0-100
}`);

    this.attacks.push({ decision, attack, t: now() });
    this.attacks = this.attacks.slice(-100);
    this.save();

    if (attack?.detectedBiases?.length > 0) {
      this.memory.add("insights", {
        type: "bias_detected",
        biases: attack.detectedBiases.map(b => b.bias),
      });
    }

    log("ADVERSARY", `🛡️  פסק: ${attack?.verdict || "—"} (${attack?.scoreAfterAttack || 0}/100)`);
    return attack;
  }
}

// ═══════════════════════════════════════
// DREAM ENGINE — Creative Synthesis
// ═══════════════════════════════════════

class DreamEngine {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "dreams", "journal.json");
    this.dreams = load(this.file, []);
  }
  save() { save(this.file, this.dreams); }

  async dream() {
    log("DREAM", `💭 נכנס למצב חלום...`, "DREAM");

    const memorySummary = this.memory.getSummary();
    const recentPatterns = this.memory.get("patterns", 10);
    const recentSuccesses = this.memory.get("successes", 5);
    const recentMistakes = this.memory.get("mistakes", 5);

    const dream = await this.brain.thinkJSON(`
אתה במצב חלום. התנתק מהנוכחי. תחבר דברים לא קשורים. תראה תבניות נסתרות.
תחשוב על מה שאנחנו לא יודעים שאנחנו לא יודעים (unknown unknowns).
תעשה אנלוגיות מטבע, פיזיקה, מוזיקה, אומנות לחימה, רפואה.
תיצור השראה — לא צריך להיות פרקטי ב-100%.

═══ מצב הזיכרון ═══
${JSON.stringify(memorySummary, null, 2)}

═══ תבניות אחרונות ═══
${JSON.stringify(recentPatterns, null, 2)}

═══ הצלחות אחרונות ═══
${JSON.stringify(recentSuccesses, null, 2)}

═══ טעויות אחרונות ═══
${JSON.stringify(recentMistakes, null, 2)}

תחזיר JSON:
{
  "dream": "תיאור החלום — דימויים, רעיונות, קישורים מפתיעים",
  "hiddenPatterns": [{
    "pattern": "...", "evidence": "...", "whyMatters": "..."
  }],
  "unknownUnknowns": ["דברים שאפילו לא שאלנו עליהם"],
  "crossDomainAnalogies": [{
    "fromDomain": "nature/physics/music/military/medicine",
    "analogy": "...",
    "application": "איך להחיל על העסק"
  }],
  "creativeIdeas": [{
    "idea": "...",
    "originality": "1-10 כמה מקורי",
    "feasibility": "1-10 כמה ריאלי",
    "impact": "1-10 אם עובד",
    "firstStep": "איך לבדוק זאת"
  }],
  "questionToExplore": "שאלה חשובה שלא שאלנו",
  "emergentStrategy": "אסטרטגיה שעולה מתוך ניתוח החלום",
  "insightOfTheNight": "תובנה אחת חשובה שעלתה מהחלום"
}`);

    if (dream) {
      this.dreams.push({ ...dream, _id: uid(), _t: now() });
      this.dreams = this.dreams.slice(-200);
      this.save();
      this.memory.add("insights", { type: "dream", insight: dream.insightOfTheNight });
      this.memory.stat("totalDreams");
      log("DREAM", `💡 תובנה: ${dream.insightOfTheNight?.substring(0, 80) || "—"}`, "DREAM");
    }
    return dream;
  }
}

// ═══════════════════════════════════════
// META LEARNER — Learning How to Learn
// ═══════════════════════════════════════

class MetaLearner {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "agents", "meta.json");
    this.data = load(this.file, {
      learningRate: 0.15,
      explorationRatio: 0.25,
      overfittingRisk: 0.1,
      reviews: [],
      rules: [],
    });
  }
  save() { save(this.file, this.data); }

  async reflect() {
    log("META", `🧠 Meta-Learning: מסתכל על איך אני לומד...`);

    const summary = this.memory.getSummary();
    const recentDecisions = this.memory.get("decisions", 20);
    const recentSuccesses = this.memory.get("successes", 10);
    const recentMistakes = this.memory.get("mistakes", 10);

    const reflection = await this.brain.thinkJSON(`
אתה מטא-לומד. תפקידך: לא ללמוד על העסק — ללמוד איך אני לומד על העסק.
מה עובד בלמידה שלי? מה לא? מה לשפר?

═══ נתונים ═══
${JSON.stringify(summary, null, 2)}

החלטות אחרונות: ${recentDecisions.length}
הצלחות: ${recentSuccesses.length}
טעויות: ${recentMistakes.length}

Learning Rate נוכחי: ${this.data.learningRate}
Exploration Ratio: ${this.data.explorationRatio}

תחזיר JSON:
{
  "learningAssessment": "איך אני לומד — טוב/בינוני/רע",
  "patterns": {
    "whatWorks": ["..."],
    "whatDoesnt": ["..."]
  },
  "metaInsights": ["תובנות על הלמידה עצמה"],
  "suggestedAdjustments": {
    "learningRate": 0.0-1.0,
    "explorationRatio": 0.0-1.0,
    "reason": "..."
  },
  "newRules": [{
    "rule": "כלל חדש שנגזר מהניסיון",
    "basedOn": "ראיה",
    "confidence": 0.0-1.0
  }],
  "overfittingRisk": 0.0-1.0,
  "blindSpots": ["איפה אני לא רואה"],
  "nextExperiment": "ניסוי להרצה"
}`);

    if (reflection) {
      if (reflection.suggestedAdjustments) {
        this.data.learningRate = clamp(reflection.suggestedAdjustments.learningRate || this.data.learningRate, 0.05, 0.5);
        this.data.explorationRatio = clamp(reflection.suggestedAdjustments.explorationRatio || this.data.explorationRatio, 0.1, 0.5);
      }
      this.data.overfittingRisk = reflection.overfittingRisk || this.data.overfittingRisk;
      if (reflection.newRules) {
        for (const r of reflection.newRules) {
          if (r.confidence > 0.7) this.data.rules.push({ ...r, t: now() });
        }
      }
      this.data.reviews.push({ ...reflection, _t: now() });
      this.data.reviews = this.data.reviews.slice(-50);
      this.save();
      this.memory.add("insights", { type: "meta_learning", assessment: reflection.learningAssessment });
      log("META", `🧠 LR=${this.data.learningRate.toFixed(2)}, Explore=${this.data.explorationRatio.toFixed(2)}`);
    }
    return reflection;
  }
}

// ═══════════════════════════════════════
// GOAL MANAGER
// ═══════════════════════════════════════

class GoalManager {
  constructor(memory) {
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "goals.json");
    this.goals = load(this.file, this._defaultGoals());
  }
  save() { save(this.file, this.goals); }

  _defaultGoals() {
    return [
      { id: "G1", metric: "leads_per_day", target: 8, current: 0, unit: "leads", horizon: "monthly", priority: "critical", progress: 0 },
      { id: "G2", metric: "monthly_revenue_ils", target: 15000000, current: 0, unit: "agorot", horizon: "monthly", priority: "critical", progress: 0 },
      { id: "G3", metric: "gross_margin_percent", target: 35, current: 0, unit: "percent", horizon: "quarterly", priority: "high", progress: 0 },
      { id: "G4", metric: "customer_satisfaction", target: 95, current: 0, unit: "percent", horizon: "quarterly", priority: "high", progress: 0 },
      { id: "G5", metric: "on_time_delivery", target: 90, current: 0, unit: "percent", horizon: "monthly", priority: "high", progress: 0 },
      { id: "G6", metric: "quote_win_rate", target: 45, current: 0, unit: "percent", horizon: "monthly", priority: "high", progress: 0 },
      { id: "G7", metric: "inventory_turnover", target: 12, current: 0, unit: "times_per_year", horizon: "quarterly", priority: "medium", progress: 0 },
      { id: "G8", metric: "international_leads", target: 30, current: 0, unit: "leads", horizon: "monthly", priority: "high", progress: 0 },
      { id: "G9", metric: "avg_project_cycle_days", target: 14, current: 0, unit: "days", horizon: "monthly", priority: "high", progress: 0 },
      { id: "G10", metric: "defect_rate_percent", target: 2, current: 0, unit: "percent", horizon: "quarterly", priority: "high", progress: 0 },
    ];
  }

  update(id, current) {
    const g = this.goals.find(x => x.id === id);
    if (!g) return null;
    g.current = current;
    g.progress = g.target > 0 ? Math.min(100, Math.round((current / g.target) * 100)) : 0;
    g.lastUpdated = now();
    this.save();
    return g;
  }

  getStatus() {
    return this.goals.map(g => ({
      id: g.id, metric: g.metric,
      target: g.target, current: g.current,
      progress: g.progress, status: g.progress >= 100 ? "achieved" : g.progress >= 70 ? "on_track" : g.progress >= 40 ? "at_risk" : "off_track",
      priority: g.priority, horizon: g.horizon,
    }));
  }
}

// ═══════════════════════════════════════
// PARADIGM ENGINE — Main Orchestrator
// ═══════════════════════════════════════

class ParadigmEngine {
  constructor() {
    this.running = false;
    this.cycle = 0;
    this.startedAt = null;

    // Core
    this.brain = new Brain();
    this.memory = new Memory();

    // Business modules
    this.erp = new ERPModule(this.brain, this.memory);
    this.crm = new CRMModule(this.brain, this.memory);
    this.bom = new BOMModule(this.brain, this.memory, this.erp);
    this.hr = new HRModule(this.brain, this.memory);
    this.finance = new FinanceModule(this.brain, this.memory, this.erp, this.crm);
    this.ops = new OpsModule(this.brain, this.memory, this.erp, this.hr);
    this.pricing = new PricingModule(this.brain, this.memory, this.erp, this.bom);
    this.quality = new QualityModule(this.brain, this.memory, this.erp);
    this.notify = new NotificationModule(this.brain, this.memory);
    this.analytics = new AnalyticsModule(this.brain, this.memory, {
      erp: this.erp, crm: this.crm, finance: this.finance,
      hr: this.hr, quality: this.quality,
    });

    // Cognitive layer
    this.swarm = new SwarmCouncil(this.brain, this.memory);
    this.adversarial = new AdversarialEngine(this.brain, this.memory);
    this.dream = new DreamEngine(this.brain, this.memory);
    this.meta = new MetaLearner(this.brain, this.memory);

    // Goals
    this.goals = new GoalManager(this.memory);

    this._signalHandlersRegistered = false;
  }

  async runCycle() {
    this.cycle++;
    const startTime = Date.now();
    log("ENGINE", `╔═══ CYCLE ${this.cycle} ═══╗`);

    try {
      // ── Stage 1: PERCEIVE ──
      this.memory.conscious(0, `cycle ${this.cycle} started at ${now()}`);
      const snapshot = this.analytics.takeSnapshot();
      this.memory.conscious(1, `perceived: ${JSON.stringify({
        projects: snapshot.erp.activeProjects,
        leads: snapshot.crm.leads,
        cash: snapshot.finance.cash,
      })}`);

      // ── Stage 2: ANALYZE (one module per cycle, rotating) ──
      const moduleAnalyzers = [
        { name: "ERP", fn: () => this.erp.analyze() },
        { name: "CRM", fn: () => this.crm.analyze() },
        { name: "BOM", fn: () => this.bom.analyze() },
        { name: "HR", fn: () => this.hr.analyze() },
        { name: "Finance", fn: () => this.finance.analyze() },
        { name: "Ops", fn: () => this.ops.analyze() },
        { name: "Pricing", fn: () => this.pricing.analyze() },
        { name: "Quality", fn: () => this.quality.analyze() },
      ];
      const analyzer = moduleAnalyzers[this.cycle % moduleAnalyzers.length];
      log("ENGINE", `🔬 מנתח ${analyzer.name}...`);
      const analysis = await analyzer.fn();
      if (analysis) {
        this.memory.add("longTerm", { type: `analysis_${analyzer.name.toLowerCase()}`, analysis, cycle: this.cycle });
        this.memory.conscious(2, `${analyzer.name} analysis: status=${analysis.status}, score=${analysis.score}`);
      }

      // ── Stage 3: SCORE LEADS (if any due) ──
      if (this.cycle % 3 === 0) {
        await this.crm.scoreAllLeads();
      }

      // ── Stage 4: PROCESS NOTIFICATIONS ──
      await this.notify.processQueue();

      // ── Stage 5: PREDICT (every 5 cycles) ──
      if (this.cycle % 5 === 0) {
        this.memory.conscious(3, `predicting next 7 days based on ${this.memory.count("patterns")} patterns`);
      }

      // ── Stage 6: DECIDE via SWARM (critical situations) ──
      if (analysis && (analysis.status === "critical" || (analysis.score !== undefined && analysis.score < 50))) {
        log("ENGINE", `⚠️  מצב קריטי זוהה — מפעיל Swarm`, "WARN");
        const debate = await this.swarm.debate(
          `${analyzer.name} במצב ${analysis.status} (ציון ${analysis.score}). סיכום: ${analysis.summary || "—"}`,
          analysis.automatedActions?.map(a => a.action) || null
        );

        // Adversarial test on swarm decision
        if (debate?.finalDecision) {
          const attack = await this.adversarial.attack(debate.finalDecision, { analysis });
          if (attack?.verdict === "reject") {
            log("ENGINE", `❌ Red Team דחה את ההחלטה — לא מבצעים`, "ERROR");
          } else {
            this.memory.conscious(4, `swarm decision accepted: ${debate.finalDecision.recommendedAction}`);
            this.memory.add("decisions", {
              type: "accepted",
              action: debate.finalDecision.recommendedAction,
              confidence: debate.finalDecision.confidence,
              adversarialScore: attack?.scoreAfterAttack || 0,
            });
          }
        }
      }

      // ── Stage 7: ADVERSARIAL SELF-TEST (every N cycles) ──
      if (this.cycle % CONFIG.ADVERSARIAL_EVERY === 0) {
        const recentDecision = this.memory.get("decisions", 1)[0];
        if (recentDecision) {
          await this.adversarial.attack(recentDecision, { cycle: this.cycle });
        }
      }

      // ── Stage 8: DREAM (every N cycles) ──
      if (this.cycle % CONFIG.DREAM_EVERY === 0) {
        await this.dream.dream();
      }

      // ── Stage 9: META-LEARN (every N cycles) ──
      if (this.cycle % CONFIG.META_LEARN_EVERY === 0) {
        await this.meta.reflect();
      }

      // ── Stage 10: EXECUTIVE REPORT (every N cycles) ──
      if (this.cycle % CONFIG.REPORT_EVERY === 0) {
        await this.analytics.generateExecutiveReport();
      }

      // ── Stage 11: UPDATE GOALS ──
      const snap = snapshot;
      this.goals.update("G2", snap.finance.cash);
      this.goals.update("G1", Math.round(snap.crm.leads / Math.max(1, this.cycle)));

      // ── Finalize ──
      this.memory.stat("totalCycles");
      this.memory.conscious(5, `cycle ${this.cycle} completed in ${Date.now() - startTime}ms`);

      log("ENGINE", `╚═══ CYCLE ${this.cycle} DONE (${Date.now() - startTime}ms) ═══╝`, "SUCCESS");
    } catch (e) {
      log("ENGINE", `❌ שגיאה ב-cycle ${this.cycle}: ${e.message}`, "ERROR");
      this.memory.add("mistakes", { type: "cycle_error", cycle: this.cycle, error: e.message });
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = now();

    this._banner();
    log("ENGINE", `🚀 PARADIGM v4.0 מתחיל...`, "SUCCESS");
    log("ENGINE", `⚙️  Cycle interval: ${CONFIG.CYCLE_MS / 1000}s`);
    log("ENGINE", `🧠 Brain: ${CONFIG.MODEL}`);
    log("ENGINE", `📊 Modules: ERP, CRM, BOM, HR, Finance, Ops, Pricing, Quality, Notify, Analytics`);
    log("ENGINE", `🎭 Cognitive: Swarm(7), Adversarial, Dream, Meta, Goals(${this.goals.goals.length})`);

    if (!this._signalHandlersRegistered) {
      this._signalHandlersRegistered = true;
      const shutdown = (sig) => {
        log("ENGINE", `📴 ${sig} — עוצר בצורה בטוחה...`, "WARN");
        this.running = false;
        this.memory.save();
        this.erp.save();
        this.crm.save();
        this.bom.save();
        this.hr.save();
        this.finance.save();
        this.ops.save();
        this.pricing.save();
        this.quality.save();
        this.notify.save();
        this.analytics.save();
        this.goals.save();
        process.exit(0);
      };
      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
    }

    // Main loop
    while (this.running) {
      await this.runCycle();
      await new Promise(r => setTimeout(r, CONFIG.CYCLE_MS));
    }
  }

  _banner() {
    const banner = `
\x1b[36m╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║        ██████╗  █████╗ ██████╗  █████╗ ██████╗ ██╗ ██████╗ ███╗   ███╗       ║
║        ██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔══██╗██║██╔════╝ ████╗ ████║       ║
║        ██████╔╝███████║██████╔╝███████║██║  ██║██║██║  ███╗██╔████╔██║       ║
║        ██╔═══╝ ██╔══██║██╔══██╗██╔══██║██║  ██║██║██║   ██║██║╚██╔╝██║       ║
║        ██║     ██║  ██║██║  ██║██║  ██║██████╔╝██║╚██████╔╝██║ ╚═╝ ██║       ║
║        ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝ ╚═════╝ ╚═╝     ╚═╝       ║
║                                                                              ║
║                  AUTONOMOUS BUSINESS OS  ·  v4.0                             ║
║                  טכנו כל עוזי  +  קובי אלקיים נדל"ן                          ║
║                                                                              ║
║      10 Business Modules · 7 C-Level Agents · Adversarial · Dream · Meta     ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m
`;
    console.log(banner);
  }

  getStatus() {
    return {
      running: this.running,
      cycle: this.cycle,
      startedAt: this.startedAt,
      brain: this.brain.getStats(),
      memory: this.memory.getSummary(),
      goals: this.goals.getStatus(),
      modules: {
        erp: this.erp.data.projects.length,
        crm: this.crm.data.leads.length,
        bom: this.bom.data.boms.length,
        hr: this.hr.data.employees.length,
        finance: this.finance.data.invoices.length,
        ops: this.ops.data.measurements.length,
        quality: this.quality.data.inspections.length,
      },
      debates: this.swarm.debates.length,
      dreams: this.dream.dreams.length,
    };
  }
}

// ═══════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════

module.exports = {
  // Core
  CONFIG, MASTER_SYSTEM_PROMPT, Brain, Memory, cli,
  // Business modules
  ERPModule, CRMModule, BOMModule, HRModule, FinanceModule,
  OpsModule, PricingModule, QualityModule, NotificationModule, AnalyticsModule,
  // Cognitive layer
  SwarmCouncil, AdversarialEngine, DreamEngine, MetaLearner, GoalManager,
  AGENT_ROLES,
  // Orchestrator
  ParadigmEngine,
  // Utilities
  uid, now, today, ensure, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log,
};

// ═══════════════════════════════════════
// RUN IF CALLED DIRECTLY
// ═══════════════════════════════════════

if (require.main === module) {
  const engine = new ParadigmEngine();
  engine.start().catch(e => {
    console.error("\x1b[31mFATAL:\x1b[0m", e);
    process.exit(1);
  });
}
