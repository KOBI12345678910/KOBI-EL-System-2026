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

// ═══════════════════════════════════════
// EXPORT PART 1
// ═══════════════════════════════════════

module.exports = {
  CONFIG, Brain, Memory, ERPModule, CRMModule,
  MASTER_SYSTEM_PROMPT, cli,
  uid, now, today, ensure, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log,
};
