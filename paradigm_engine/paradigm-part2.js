// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 2/4
// BOM + HR + FINANCE + OPS
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, Brain, Memory, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const path = require("path");

// ═══════════════════════════════════════
// BOM MODULE — Bill of Materials
// ═══════════════════════════════════════

class BOMModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "bom", "state.json");
    this.data = load(this.file, {
      templates: [], activeBOMs: [], materials: [],
      priceHistory: [], wastageRates: {}, laborRates: {},
    });
    if (this.data.templates.length === 0) this.initTemplates();
  }
  save() { save(this.file, this.data); }

  initTemplates() {
    const defs = [
      {
        name: "מעקה ברזל סטנדרטי", type: "railing_iron", margin: 35, wastage: 10,
        laborPerMeter: 2.5, laborFixed: 0, laborRate: 15000,
        items: [
          { material: "צינור ברזל 40×40×2 מ\"מ", unit: "meter", qtyPerMeter: 3.5, qtyFixed: 0, price: 4500, supplier: "ברזל ישראל", category: "steel" },
          { material: "פרופיל ברזל 20×20×1.5 מ\"מ", unit: "meter", qtyPerMeter: 6, qtyFixed: 0, price: 2800, supplier: "ברזל ישראל", category: "steel" },
          { material: "פלטות עיגון 100×100×5 מ\"מ", unit: "piece", qtyPerMeter: 0.5, qtyFixed: 2, price: 1500, supplier: "ברזל ישראל", category: "steel" },
          { material: "אלקטרודות ריתוך 3.2 מ\"מ", unit: "kg", qtyPerMeter: 0.3, qtyFixed: 0, price: 3500, supplier: "ריתוך פלוס", category: "consumable" },
          { material: "דיסקיות חיתוך 230 מ\"מ", unit: "piece", qtyPerMeter: 0.2, qtyFixed: 1, price: 1200, supplier: "כלי עבודה", category: "consumable" },
          { material: "דיסקיות שחיקה 230 מ\"מ", unit: "piece", qtyPerMeter: 0.15, qtyFixed: 1, price: 800, supplier: "כלי עבודה", category: "consumable" },
          { material: "צבע יסוד אפוקסי 2 רכיבים", unit: "liter", qtyPerMeter: 0.3, qtyFixed: 0.5, price: 8500, supplier: "צבעי טמבור", category: "paint" },
          { material: "צבע גמר פוליאוריטן", unit: "liter", qtyPerMeter: 0.2, qtyFixed: 0.3, price: 12000, supplier: "צבעי טמבור", category: "paint" },
          { material: "מדלל/טינר", unit: "liter", qtyPerMeter: 0.1, qtyFixed: 0.2, price: 3000, supplier: "צבעי טמבור", category: "paint" },
          { material: "ברגים נירוסטה M10×80", unit: "piece", qtyPerMeter: 2, qtyFixed: 4, price: 350, supplier: "ברגים פלוס", category: "fastener" },
          { material: "דיבלים כימיים", unit: "piece", qtyPerMeter: 1, qtyFixed: 2, price: 2500, supplier: "כלי עבודה", category: "fastener" },
          { material: "שקיות חול לניקוי (Sandblast)", unit: "kg", qtyPerMeter: 0.5, qtyFixed: 0, price: 500, supplier: "ניקוי מתכות", category: "consumable" },
          { material: "ניילון הגנה (התקנה)", unit: "meter", qtyPerMeter: 2, qtyFixed: 5, price: 200, supplier: "אריזות", category: "protection" },
          { material: "סרט מסקינג", unit: "roll", qtyPerMeter: 0.05, qtyFixed: 1, price: 1500, supplier: "אריזות", category: "protection" },
        ],
      },
      {
        name: "מעקה אלומיניום פרופיל", type: "railing_aluminum", margin: 38, wastage: 8,
        laborPerMeter: 2.0, laborFixed: 0, laborRate: 15000,
        items: [
          { material: "פרופיל אלומיניום ראשי 50×50", unit: "meter", qtyPerMeter: 3, qtyFixed: 0, price: 7500, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "פרופיל אלומיניום משני 30×30", unit: "meter", qtyPerMeter: 5, qtyFixed: 0, price: 4500, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "פרופיל אלומיניום מאחז יד", unit: "meter", qtyPerMeter: 1.05, qtyFixed: 0, price: 6000, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "חיבורי אלומיניום פנימיים", unit: "piece", qtyPerMeter: 3, qtyFixed: 4, price: 850, supplier: "אלומיניום ישראל", category: "connector" },
          { material: "פקקים/סתימות", unit: "piece", qtyPerMeter: 0.5, qtyFixed: 4, price: 200, supplier: "אלומיניום ישראל", category: "connector" },
          { material: "ברגים נירוסטה M8×60", unit: "piece", qtyPerMeter: 4, qtyFixed: 4, price: 250, supplier: "ברגים פלוס", category: "fastener" },
          { material: "דיבלים מכניים", unit: "piece", qtyPerMeter: 1.5, qtyFixed: 2, price: 1800, supplier: "כלי עבודה", category: "fastener" },
          { material: "סיליקון UV שקוף", unit: "tube", qtyPerMeter: 0.1, qtyFixed: 1, price: 3500, supplier: "חומרי איטום", category: "sealant" },
          { material: "ניילון הגנה", unit: "meter", qtyPerMeter: 2, qtyFixed: 5, price: 200, supplier: "אריזות", category: "protection" },
        ],
      },
      {
        name: "מעקה זכוכית", type: "railing_glass", margin: 40, wastage: 5,
        laborPerMeter: 3.0, laborFixed: 1, laborRate: 18000,
        items: [
          { material: "זכוכית מחוסמת למינציה 10+10 מ\"מ", unit: "sqm", qtyPerMeter: 1.1, qtyFixed: 0, price: 85000, supplier: "זכוכית ישראל", category: "glass" },
          { material: "פרופיל U אלומיניום לזכוכית", unit: "meter", qtyPerMeter: 1.05, qtyFixed: 0, price: 12000, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "מאחז יד נירוסטה/אלומיניום", unit: "meter", qtyPerMeter: 1.05, qtyFixed: 0, price: 8500, supplier: "נירוסטה בע\"מ", category: "stainless" },
          { material: "ספיידרים/מחזיקי זכוכית", unit: "piece", qtyPerMeter: 2, qtyFixed: 2, price: 4500, supplier: "נירוסטה בע\"מ", category: "connector" },
          { material: "גומי EPDM לזכוכית", unit: "meter", qtyPerMeter: 2.1, qtyFixed: 0, price: 1500, supplier: "חומרי איטום", category: "sealant" },
          { material: "סיליקון מבני", unit: "tube", qtyPerMeter: 0.2, qtyFixed: 1, price: 5500, supplier: "חומרי איטום", category: "sealant" },
          { material: "ברגים נירוסטה A4", unit: "piece", qtyPerMeter: 4, qtyFixed: 8, price: 500, supplier: "ברגים פלוס", category: "fastener" },
          { material: "דיבלים כימיים כבדים", unit: "piece", qtyPerMeter: 1, qtyFixed: 2, price: 3500, supplier: "כלי עבודה", category: "fastener" },
        ],
      },
      {
        name: "שער ברזל חשמלי הזזה", type: "gate_electric_sliding", margin: 32, wastage: 5,
        laborPerMeter: 0, laborFixed: 28, laborRate: 15000,
        items: [
          { material: "צינור ברזל 60×60×3 מ\"מ (מסגרת)", unit: "meter", qtyPerMeter: 0, qtyFixed: 28, price: 7500, supplier: "ברזל ישראל", category: "steel" },
          { material: "פרופיל ברזל 30×30×2 מ\"מ (מילוי)", unit: "meter", qtyPerMeter: 0, qtyFixed: 40, price: 3500, supplier: "ברזל ישראל", category: "steel" },
          { material: "פס ברזל 50×5 (מסילה)", unit: "meter", qtyPerMeter: 0, qtyFixed: 7, price: 2500, supplier: "ברזל ישראל", category: "steel" },
          { material: "מנוע חשמלי CAME BXV", unit: "piece", qtyPerMeter: 0, qtyFixed: 1, price: 280000, supplier: "CAME Israel", category: "motor" },
          { material: "שלט אלחוטי 4 ערוצים", unit: "piece", qtyPerMeter: 0, qtyFixed: 3, price: 8500, supplier: "CAME Israel", category: "motor" },
          { material: "פוטוסל בטיחות", unit: "pair", qtyPerMeter: 0, qtyFixed: 1, price: 12000, supplier: "CAME Israel", category: "safety" },
          { material: "נורית הבזק", unit: "piece", qtyPerMeter: 0, qtyFixed: 1, price: 4500, supplier: "CAME Israel", category: "safety" },
          { material: "גלגלים V groove", unit: "piece", qtyPerMeter: 0, qtyFixed: 4, price: 5500, supplier: "גלגלים בע\"מ", category: "hardware" },
          { material: "מסילה תחתונה V", unit: "meter", qtyPerMeter: 0, qtyFixed: 6, price: 4000, supplier: "גלגלים בע\"מ", category: "hardware" },
          { material: "מנעול חשמלי", unit: "piece", qtyPerMeter: 0, qtyFixed: 1, price: 15000, supplier: "CAME Israel", category: "hardware" },
          { material: "עמוד תפס", unit: "piece", qtyPerMeter: 0, qtyFixed: 1, price: 8000, supplier: "ברזל ישראל", category: "steel" },
          { material: "כבל חשמל 3×1.5", unit: "meter", qtyPerMeter: 0, qtyFixed: 15, price: 800, supplier: "חשמל", category: "electrical" },
          { material: "צבע יסוד + גמר", unit: "liter", qtyPerMeter: 0, qtyFixed: 6, price: 10000, supplier: "צבעי טמבור", category: "paint" },
          { material: "בטון/יסודות", unit: "kg", qtyPerMeter: 0, qtyFixed: 100, price: 80, supplier: "חומרי בניין", category: "concrete" },
        ],
      },
      {
        name: "שער כניסה ברזל", type: "gate_entry", margin: 35, wastage: 8,
        laborPerMeter: 0, laborFixed: 16, laborRate: 15000,
        items: [
          { material: "צינור ברזל 50×50×2.5 מ\"מ", unit: "meter", qtyPerMeter: 0, qtyFixed: 18, price: 6000, supplier: "ברזל ישראל", category: "steel" },
          { material: "פרופיל ברזל מעוצב", unit: "meter", qtyPerMeter: 0, qtyFixed: 25, price: 4500, supplier: "ברזל ישראל", category: "steel" },
          { material: "צירים כבדים", unit: "piece", qtyPerMeter: 0, qtyFixed: 3, price: 8000, supplier: "ברזל ישראל", category: "hardware" },
          { material: "מנעול CISA", unit: "piece", qtyPerMeter: 0, qtyFixed: 1, price: 25000, supplier: "מנעולים", category: "hardware" },
          { material: "ידית חיצונית + פנימית", unit: "set", qtyPerMeter: 0, qtyFixed: 1, price: 15000, supplier: "מנעולים", category: "hardware" },
          { material: "סוגר אוטומטי", unit: "piece", qtyPerMeter: 0, qtyFixed: 1, price: 6000, supplier: "ברזל ישראל", category: "hardware" },
          { material: "צבע יסוד + גמר", unit: "liter", qtyPerMeter: 0, qtyFixed: 4, price: 10000, supplier: "צבעי טמבור", category: "paint" },
        ],
      },
      {
        name: "גדר ברזל עם עמודים", type: "fence_iron", margin: 33, wastage: 8,
        laborPerMeter: 1.5, laborFixed: 2, laborRate: 15000,
        items: [
          { material: "עמודי ברזל 60×60×3 מ\"מ (2 מטר)", unit: "piece", qtyPerMeter: 0.5, qtyFixed: 2, price: 12000, supplier: "ברזל ישראל", category: "steel" },
          { material: "פרופיל אופקי 40×20", unit: "meter", qtyPerMeter: 3, qtyFixed: 0, price: 3200, supplier: "ברזל ישראל", category: "steel" },
          { material: "פרופיל אנכי 20×20 (שבכה)", unit: "meter", qtyPerMeter: 8, qtyFixed: 0, price: 2500, supplier: "ברזל ישראל", category: "steel" },
          { material: "בטון C25 ליסודות", unit: "kg", qtyPerMeter: 8, qtyFixed: 0, price: 80, supplier: "חומרי בניין", category: "concrete" },
          { material: "ברגי עיגון M12", unit: "piece", qtyPerMeter: 1, qtyFixed: 4, price: 500, supplier: "ברגים פלוס", category: "fastener" },
          { material: "צבע יסוד + גמר", unit: "liter", qtyPerMeter: 0.4, qtyFixed: 0, price: 10000, supplier: "צבעי טמבור", category: "paint" },
        ],
      },
      {
        name: "גדר דקורטיבית/מעוצבת", type: "fence_decorative", margin: 40, wastage: 10,
        laborPerMeter: 3.0, laborFixed: 3, laborRate: 17000,
        items: [
          { material: "עמודי ברזל מעוצבים (יציקה)", unit: "piece", qtyPerMeter: 0.5, qtyFixed: 2, price: 18000, supplier: "יציקות ברזל", category: "steel" },
          { material: "פנלים מעוצבים (CNC/יציקה)", unit: "piece", qtyPerMeter: 1, qtyFixed: 0, price: 25000, supplier: "יציקות ברזל", category: "steel" },
          { material: "ראשי עמודים דקורטיביים", unit: "piece", qtyPerMeter: 0.5, qtyFixed: 2, price: 5000, supplier: "יציקות ברזל", category: "steel" },
          { material: "צבע מיוחד (Patina/חלודה מבוקרת)", unit: "liter", qtyPerMeter: 0.5, qtyFixed: 1, price: 18000, supplier: "צבעים מיוחדים", category: "paint" },
          { material: "בטון ליסודות", unit: "kg", qtyPerMeter: 10, qtyFixed: 0, price: 80, supplier: "חומרי בניין", category: "concrete" },
        ],
      },
      {
        name: "פרגולת אלומיניום עם להבים", type: "pergola_aluminum", margin: 36, wastage: 5,
        laborPerMeter: 3.5, laborFixed: 4, laborRate: 16000,
        items: [
          { material: "עמודי אלומיניום 100×100×3 מ\"מ", unit: "piece", qtyPerMeter: 0, qtyFixed: 4, price: 38000, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "קורות ראשיות 150×50", unit: "meter", qtyPerMeter: 2, qtyFixed: 0, price: 14000, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "קורות משניות 80×40", unit: "meter", qtyPerMeter: 3, qtyFixed: 0, price: 8000, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "להבים/שלבים אלומיניום", unit: "piece", qtyPerMeter: 5, qtyFixed: 0, price: 4800, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "מנגנון להבים מתכוונן", unit: "set", qtyPerMeter: 0, qtyFixed: 1, price: 45000, supplier: "אלומיניום ישראל", category: "mechanism" },
          { material: "חיבורים + זוויתנים", unit: "piece", qtyPerMeter: 0, qtyFixed: 16, price: 2200, supplier: "אלומיניום ישראל", category: "connector" },
          { material: "ברגים נירוסטה M10", unit: "piece", qtyPerMeter: 8, qtyFixed: 24, price: 350, supplier: "ברגים פלוס", category: "fastener" },
          { material: "פלטות עיגון לרצפה", unit: "piece", qtyPerMeter: 0, qtyFixed: 4, price: 3500, supplier: "אלומיניום ישראל", category: "connector" },
          { material: "דיבלים כימיים", unit: "piece", qtyPerMeter: 0, qtyFixed: 8, price: 2500, supplier: "כלי עבודה", category: "fastener" },
          { material: "מרזב ניקוז", unit: "meter", qtyPerMeter: 1.05, qtyFixed: 0, price: 3000, supplier: "אלומיניום ישראל", category: "drainage" },
        ],
      },
      {
        name: "דלת ברזל כניסה מעוצבת", type: "door_iron", margin: 38, wastage: 5,
        laborPerMeter: 0, laborFixed: 20, laborRate: 16000,
        items: [
          { material: "פח ברזל 2 מ\"מ (כנף דלת)", unit: "sqm", qtyPerMeter: 0, qtyFixed: 4, price: 15000, supplier: "ברזל ישראל", category: "steel" },
          { material: "צינור ברזל 50×30 (מסגרת)", unit: "meter", qtyPerMeter: 0, qtyFixed: 12, price: 5000, supplier: "ברזל ישראל", category: "steel" },
          { material: "משקוף ברזל", unit: "meter", qtyPerMeter: 0, qtyFixed: 6, price: 6000, supplier: "ברזל ישראל", category: "steel" },
          { material: "צירים כבדים 3D", unit: "piece", qtyPerMeter: 0, qtyFixed: 3, price: 12000, supplier: "ציר טק", category: "hardware" },
          { material: "מנעול רב-נקודתי ISEO", unit: "piece", qtyPerMeter: 0, qtyFixed: 1, price: 45000, supplier: "מנעולים", category: "hardware" },
          { material: "ידית/כדור דלת", unit: "set", qtyPerMeter: 0, qtyFixed: 1, price: 20000, supplier: "ידיות", category: "hardware" },
          { material: "בידוד תרמי PU", unit: "sqm", qtyPerMeter: 0, qtyFixed: 3.5, price: 8000, supplier: "בידוד", category: "insulation" },
          { material: "גומי איטום EPDM", unit: "meter", qtyPerMeter: 0, qtyFixed: 8, price: 1500, supplier: "חומרי איטום", category: "sealant" },
          { material: "סף אלומיניום", unit: "piece", qtyPerMeter: 0, qtyFixed: 1, price: 8000, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "צבע יסוד + גמר", unit: "liter", qtyPerMeter: 0, qtyFixed: 4, price: 10000, supplier: "צבעי טמבור", category: "paint" },
        ],
      },
      {
        name: "חלון אלומיניום", type: "window_aluminum", margin: 35, wastage: 5,
        laborPerMeter: 0, laborFixed: 6, laborRate: 15000,
        items: [
          { material: "פרופיל אלומיניום תרמי (מסגרת)", unit: "meter", qtyPerMeter: 0, qtyFixed: 8, price: 9000, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "פרופיל אלומיניום תרמי (כנף)", unit: "meter", qtyPerMeter: 0, qtyFixed: 7, price: 8000, supplier: "אלומיניום ישראל", category: "aluminum" },
          { material: "זכוכית תרמית דו-שכבתית", unit: "sqm", qtyPerMeter: 0, qtyFixed: 2.5, price: 45000, supplier: "זכוכית ישראל", category: "glass" },
          { material: "אטם EPDM", unit: "meter", qtyPerMeter: 0, qtyFixed: 12, price: 800, supplier: "חומרי איטום", category: "sealant" },
          { material: "חזקן (ידית) + מנגנון", unit: "set", qtyPerMeter: 0, qtyFixed: 1, price: 6000, supplier: "אלומיניום ישראל", category: "hardware" },
          { material: "ברגים + עיגון", unit: "set", qtyPerMeter: 0, qtyFixed: 1, price: 2000, supplier: "ברגים פלוס", category: "fastener" },
          { material: "סיליקון חיצוני UV", unit: "tube", qtyPerMeter: 0, qtyFixed: 2, price: 3500, supplier: "חומרי איטום", category: "sealant" },
          { material: "קלקר אלומיניום (אדן)", unit: "meter", qtyPerMeter: 0, qtyFixed: 1.5, price: 4000, supplier: "אלומיניום ישראל", category: "aluminum" },
        ],
      },
      {
        name: "סורגים", type: "bars", margin: 30, wastage: 8,
        laborPerMeter: 1.5, laborFixed: 1, laborRate: 14000,
        items: [
          { material: "מוט ברזל מלא 16 מ\"מ", unit: "meter", qtyPerMeter: 8, qtyFixed: 0, price: 2000, supplier: "ברזל ישראל", category: "steel" },
          { material: "פרופיל מסגרת 30×30", unit: "meter", qtyPerMeter: 3.5, qtyFixed: 0, price: 3000, supplier: "ברזל ישראל", category: "steel" },
          { material: "צבע יסוד + גמר", unit: "liter", qtyPerMeter: 0.25, qtyFixed: 0.3, price: 10000, supplier: "צבעי טמבור", category: "paint" },
          { material: "ברגים + דיבלים", unit: "piece", qtyPerMeter: 2, qtyFixed: 4, price: 300, supplier: "ברגים פלוס", category: "fastener" },
        ],
      },
    ];

    for (const d of defs) this.createTemplate(d);
    log("BOM", `✅ ${defs.length} תבניות BOM אותחלו`, "SUCCESS");
  }

  createTemplate(data) {
    const t = {
      id: uid(), version: 1, createdAt: now(), active: true,
      name: data.name, type: data.type,
      items: (data.items || []).map(i => ({ id: uid(), ...i })),
      laborPerMeter: data.laborPerMeter || 0,
      laborFixed: data.laborFixed || 0,
      laborRate: data.laborRate || 15000,
      wastage: data.wastage || 10,
      margin: data.margin || 35,
    };
    this.data.templates.push(t);
    this.save();
    return t;
  }

  getTemplateByType(type) {
    return this.data.templates.find(t => t.type === type && t.active);
  }

  generateBOM(templateId, meters, projectId = null, options = {}) {
    const tmpl = this.data.templates.find(t => t.id === templateId);
    if (!tmpl) return null;

    const wasteMult = 1 + (tmpl.wastage / 100);

    const bom = {
      id: `BOM-${uid()}`, templateId, templateName: tmpl.name, templateType: tmpl.type,
      projectId, meters, status: "draft", createdAt: now(),
      items: tmpl.items.map(item => {
        const rawQty = (item.qtyPerMeter || 0) * meters + (item.qtyFixed || 0);
        const qtyWithWaste = Math.ceil(rawQty * wasteMult * 100) / 100;
        const roundedQty = item.unit === "piece" ? Math.ceil(qtyWithWaste) : qtyWithWaste;
        return {
          ...item, rawQty: Math.round(rawQty * 100) / 100,
          qtyWithWaste: roundedQty,
          totalCost: Math.round(roundedQty * item.price),
        };
      }),
      laborHours: tmpl.laborPerMeter * meters + (tmpl.laborFixed || 0),
      laborRate: tmpl.laborRate,
      laborCost: 0,
      materialCost: 0,
      overheadCost: 0,
      totalCost: 0,
      margin: options.margin || tmpl.margin,
      sellingPrice: 0,
      pricePerMeter: 0,
      vatAmount: 0,
      totalWithVat: 0,
    };

    bom.materialCost = bom.items.reduce((s, i) => s + i.totalCost, 0);
    bom.laborCost = Math.round(bom.laborHours * bom.laborRate);
    bom.overheadCost = Math.round((bom.materialCost + bom.laborCost) * 0.08); // 8% overhead
    bom.totalCost = bom.materialCost + bom.laborCost + bom.overheadCost;
    bom.sellingPrice = Math.round(bom.totalCost / (1 - bom.margin / 100));
    bom.pricePerMeter = meters > 0 ? Math.round(bom.sellingPrice / meters) : bom.sellingPrice;
    bom.vatAmount = vatOf(bom.sellingPrice);
    bom.totalWithVat = addVat(bom.sellingPrice);

    this.data.activeBOMs.push(bom);
    this.save();
    log("BOM", `📋 BOM: ${bom.id} — ${tmpl.name} — ${meters > 0 ? meters + "מ'" : "יחידה"} — עלות: ₪${shekel(bom.totalCost)} — מכירה: ₪${shekel(bom.sellingPrice)} (${bom.margin}%) — כולל מע"מ: ₪${shekel(bom.totalWithVat)}`);
    return bom;
  }

  async optimizeBOM(bomId) {
    const bom = this.data.activeBOMs.find(b => b.id === bomId);
    if (!bom) return null;

    return await this.brain.thinkJSON(`
אתה מהנדס עלויות אוטונומי של טכנו כל עוזי.
תפקידך: למצוא חיסכון בBOM בלי לפגוע באיכות.

═══ BOM לאופטימיזציה ═══
${JSON.stringify(bom, null, 2)}

═══ מה לבדוק ═══
1. **חומרים חלופיים** — האם יש חומר זול יותר באותה איכות?
2. **כמויות** — האם אפשר להקטין פחת? לנצל טוב יותר?
3. **ספקים** — האם ספק אחר זול יותר? הנחות כמות?
4. **שילוב הזמנות** — האם אפשר לשלב עם פרויקטים אחרים?
5. **עבודה** — האם אפשר לייעל? כלים חדשים? שיטות?
6. **Overhead** — האם 8% נכון? מה אפשר להוריד?

תחזיר JSON:
{
  "currentCost": 0,
  "optimizedCost": 0,
  "totalSaving": 0,
  "savingPercent": 0,
  "materialSavings": [{"item": "...", "currentCost": 0, "optimizedCost": 0, "saving": 0, "method": "alternative_material/bulk_discount/reduce_waste/negotiate/combine_orders", "details": "...", "qualityImpact": "none/minor/significant", "riskLevel": "low/medium/high"}],
  "laborSavings": [{"current": 0, "proposed": 0, "saving": 0, "method": "...", "details": "..."}],
  "supplierRecommendations": [{"material": "...", "currentSupplier": "...", "suggestedSupplier": "...", "saving": 0, "reason": "..."}],
  "bulkOpportunities": [{"item": "...", "currentPrice": 0, "bulkPrice": 0, "minQty": 0, "saving": 0}],
  "processImprovements": [{"area": "...", "improvement": "...", "saving": 0, "investment": 0, "roi": "..."}],
  "overallRecommendation": "...",
  "implementationPlan": [{"step": "...", "saving": 0, "effort": "low/medium/high", "timeline": "..."}]
}`);
  }

  async analyze() {
    return await this.brain.thinkJSON(`
נתח BOM:
תבניות: ${this.data.templates.length} (${this.data.templates.map(t => t.type).join(", ")})
BOMs פעילים: ${this.data.activeBOMs.length}

תבניות ומחירים: ${JSON.stringify(this.data.templates.map(t => {
  const bom = this.generateBOM(t.id, 1);
  return { name: t.name, type: t.type, items: t.items.length, pricePerMeter: bom ? shekel(bom.pricePerMeter) : "N/A", margin: t.margin + "%", wastage: t.wastage + "%" };
}))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "costTrends": {"materials": "rising/stable/falling", "labor": "rising/stable/falling", "recommendation": "..."},
  "marginAnalysis": [{"template": "...", "margin": 0, "healthy": true, "recommendation": "..."}],
  "expensiveItems": [{"material": "...", "costPercent": 0, "suggestion": "..."}],
  "missingTemplates": ["סוג מוצר שחסר BOM"],
  "optimizations": [{"area": "...", "saving": 0, "method": "..."}],
  "priceCompetitiveness": {"assessment": "...", "recommendation": "..."}
}`);
  }
}

// ═══════════════════════════════════════
// HR MODULE
// ═══════════════════════════════════════

class HRModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "hr", "state.json");
    this.data = load(this.file, {
      employees: [], attendance: [], payroll: [],
      recruitment: { openPositions: [], candidates: [], interviews: [] },
      performance: [], training: [], leaves: [],
      documents: [], policies: [], alerts: [],
      config: {
        workDayHours: 8.5, workDaysPerWeek: 5,
        overtimeRate: 1.25, shabbatRate: 1.5,
        overtimeThreshold: 186,
        minWageHourly: 5572,
        annualLeaveDays: 12, sickLeaveDays: 18,
        nationalInsuranceEmployer: 0.0345 + 0.0766, // ביטוח לאומי + בריאות מעסיק
        pensionEmployer: 0.0625,
        severanceContribution: 0.0833,
      },
    });
  }
  save() { save(this.file, this.data); }

  addEmployee(data) {
    const e = {
      id: `EMP-${uid()}`, status: "active",
      name: data.name, idNumber: data.idNumber || "",
      role: data.role || "", title: data.title || "",
      department: data.department || "ייצור",
      phone: data.phone || "", email: data.email || "",
      address: data.address || "",
      startDate: data.startDate || today(), endDate: null,
      contractType: data.contractType || "full_time",
      salary: {
        type: data.salaryType || "monthly",
        base: data.baseSalary || 0,
        hourlyRate: data.hourlyRate || 0,
        travelAllowance: data.travelAllowance || 0,
        mealAllowance: data.mealAllowance || 0,
        phoneAllowance: data.phoneAllowance || 0,
        bonus: 0,
      },
      bankAccount: {
        bank: data.bankName || "", branch: data.bankBranch || "",
        account: data.bankAccount || "",
      },
      taxInfo: {
        taxPoints: data.taxPoints || 2.25,
        taxBracket: null,
      },
      emergencyContact: {
        name: data.emergencyName || "", phone: data.emergencyPhone || "",
        relation: data.emergencyRelation || "",
      },
      skills: data.skills || [],
      certifications: data.certifications || [],
      languages: data.languages || ["עברית"],
      drivingLicense: data.drivingLicense || false,
      leaveBalance: {
        annual: data.annualLeave || this.data.config.annualLeaveDays,
        sick: data.sickLeave || this.data.config.sickLeaveDays,
        personal: 0,
        taken: { annual: 0, sick: 0, personal: 0 },
      },
      equipment: [], // כלי עבודה, רכב, טלפון
      performanceHistory: [],
      attendance: [],
      warnings: [],
      notes: [],
      documents: [],
      createdAt: now(),
    };
    this.data.employees.push(e);
    this.save();
    log("HR", `👷 עובד: ${e.name} — ${e.role} (${e.department})`);
    this.memory.add("shortTerm", { type: "employee_added", name: e.name, role: e.role });
    return e;
  }

  terminateEmployee(empId, data = {}) {
    const emp = this.data.employees.find(e => e.id === empId);
    if (!emp) return null;
    emp.status = data.type || "terminated"; // terminated, resigned, retired, layoff
    emp.endDate = data.endDate || today();
    emp.notes.push({
      type: "termination", reason: data.reason || "",
      severancePaid: data.severancePaid || false,
      noticeGiven: data.noticeGiven || false,
      exitInterview: data.exitInterview || false,
      t: now(),
    });
    this.save();
    log("HR", `👷 ${data.type || "סיום"}: ${emp.name} — ${data.reason || ""}`, "WARN");
    this.memory.add("shortTerm", { type: "employee_left", name: emp.name, reason: data.reason });
    return emp;
  }

  recordAttendance(empId, type, time = now()) {
    const rec = { id: uid(), empId, type, t: time };
    this.data.attendance.push(rec);
    const emp = this.data.employees.find(e => e.id === empId);
    if (emp) {
      emp.attendance.push(rec);

      if (type === "late") {
        const month = time.substring(0, 7);
        const lateThisMonth = emp.attendance.filter(a => a.type === "late" && a.t.startsWith(month)).length;
        if (lateThisMonth >= 3) {
          this.data.alerts.push({ type: "excessive_lateness", empId, name: emp.name, count: lateThisMonth, month, t: now() });
          log("HR", `⚠️ איחורים: ${emp.name} (${lateThisMonth}x החודש)`, "WARN");
        }
      }
      if (type === "absent") {
        this.data.alerts.push({ type: "absent", empId, name: emp.name, date: time.substring(0, 10), t: now() });
        log("HR", `⚠️ חיסור: ${emp.name}`, "WARN");
      }
    }
    this.save();
    return rec;
  }

  requestLeave(empId, data) {
    const emp = this.data.employees.find(e => e.id === empId);
    if (!emp) return null;

    const days = Math.ceil((new Date(data.endDate) - new Date(data.startDate)) / 86400000) + 1;

    const leave = {
      id: uid(), empId, employeeName: emp.name,
      leaveType: data.leaveType || "annual", // annual, sick, personal, maternity, paternity, military, bereavement, unpaid
      startDate: data.startDate, endDate: data.endDate,
      days, reason: data.reason || "",
      status: "pending",
      approvedBy: null, approvedAt: null,
      rejectedReason: null,
      createdAt: now(),
    };

    // בדיקת יתרה
    const balance = emp.leaveBalance[leave.leaveType];
    if (balance !== undefined && balance < days) {
      leave.status = "insufficient_balance";
      log("HR", `❌ חופש נדחה: ${emp.name} — יתרה לא מספיקה (${balance}/${days})`, "WARN");
    }

    this.data.leaves.push(leave);
    this.save();
    log("HR", `📅 חופש: ${emp.name} — ${leave.leaveType} — ${data.startDate} → ${data.endDate} (${days} ימים)`);
    return leave;
  }

  approveLeave(leaveId, approvedBy = "system") {
    const leave = this.data.leaves.find(l => l.id === leaveId);
    if (!leave || leave.status !== "pending") return null;
    leave.status = "approved";
    leave.approvedBy = approvedBy;
    leave.approvedAt = now();

    const emp = this.data.employees.find(e => e.id === leave.empId);
    if (emp) {
      const type = leave.leaveType;
      if (emp.leaveBalance[type] !== undefined) {
        emp.leaveBalance[type] -= leave.days;
        emp.leaveBalance.taken[type] = (emp.leaveBalance.taken[type] || 0) + leave.days;
      }
    }

    this.save();
    log("HR", `✅ חופש אושר: ${leave.employeeName} (${leave.days} ימים)`, "SUCCESS");
    return leave;
  }

  rejectLeave(leaveId, reason, rejectedBy = "system") {
    const leave = this.data.leaves.find(l => l.id === leaveId);
    if (!leave) return null;
    leave.status = "rejected";
    leave.rejectedReason = reason;
    this.save();
    return leave;
  }

  openPosition(data) {
    const pos = {
      id: uid(), status: "open",
      title: data.title, department: data.department || "ייצור",
      description: data.description || "",
      responsibilities: data.responsibilities || [],
      requirements: data.requirements || [],
      niceToHave: data.niceToHave || [],
      salaryRange: { min: data.salaryMin || 0, max: data.salaryMax || 0 },
      type: data.type || "full_time",
      urgency: data.urgency || "medium",
      reportingTo: data.reportingTo || "",
      headcount: data.headcount || 1,
      candidates: [],
      publishedChannels: [],
      createdAt: now(),
    };
    this.data.recruitment.openPositions.push(pos);
    this.save();
    log("HR", `📢 משרה: ${pos.title} (${pos.department}) — ${pos.urgency}`);
    return pos;
  }

  addCandidate(positionId, data) {
    const c = {
      id: uid(), positionId, status: "new",
      name: data.name, phone: data.phone || "",
      email: data.email || "", cv: data.cv || "",
      source: data.source || "unknown", // facebook, referral, job_board, walk_in, whatsapp
      experience: data.experience || "",
      currentSalary: data.currentSalary || 0,
      expectedSalary: data.expectedSalary || 0,
      availability: data.availability || "",
      notes: data.notes || "",
      score: 0, // AI scoring
      interviews: [],
      createdAt: now(),
    };
    this.data.recruitment.candidates.push(c);
    const pos = this.data.recruitment.openPositions.find(p => p.id === positionId);
    if (pos) pos.candidates.push(c.id);
    this.save();
    log("HR", `👤 מועמד: ${c.name} → ${pos?.title || positionId}`);
    return c;
  }

  recordPerformance(empId, data) {
    const review = {
      id: uid(), empId, period: data.period || today().substring(0, 7),
      overallScore: data.overallScore || 0,
      categories: {
        quality: data.quality || 0, // 1-5
        speed: data.speed || 0,
        teamwork: data.teamwork || 0,
        attendance: data.attendance || 0,
        initiative: data.initiative || 0,
        safety: data.safety || 0,
      },
      strengths: data.strengths || [],
      improvements: data.improvements || [],
      goals: data.goals || [],
      reviewedBy: data.reviewedBy || "system",
      createdAt: now(),
    };
    review.overallScore = review.overallScore || (
      Object.values(review.categories).filter(v => v > 0).reduce((s, v) => s + v, 0) /
      Object.values(review.categories).filter(v => v > 0).length
    ).toFixed(1);

    this.data.performance.push(review);
    const emp = this.data.employees.find(e => e.id === empId);
    if (emp) emp.performanceHistory.push(review);
    this.save();
    return review;
  }

  issueWarning(empId, data) {
    const emp = this.data.employees.find(e => e.id === empId);
    if (!emp) return null;
    const warning = {
      id: uid(), type: data.type || "verbal", // verbal, written, final
      reason: data.reason, details: data.details || "",
      issuedBy: data.issuedBy || "system",
      acknowledged: false,
      createdAt: now(),
    };
    emp.warnings.push(warning);

    if (emp.warnings.filter(w => w.type === "written").length >= 3) {
      this.data.alerts.push({ type: "excessive_warnings", empId, name: emp.name, count: emp.warnings.length, t: now() });
      log("HR", `🚨 ${emp.name}: 3+ אזהרות כתובות`, "ERROR");
    }

    this.save();
    log("HR", `⚠️ אזהרה (${warning.type}): ${emp.name} — ${data.reason}`, "WARN");
    return warning;
  }

  getActiveEmployees() { return this.data.employees.filter(e => e.status === "active"); }

  getHeadcount() {
    const active = this.getActiveEmployees();
    return {
      total: active.length,
      byDepartment: active.reduce((a, e) => { a[e.department] = (a[e.department] || 0) + 1; return a; }, {}),
      byRole: active.reduce((a, e) => { a[e.role] = (a[e.role] || 0) + 1; return a; }, {}),
      openPositions: this.data.recruitment.openPositions.filter(p => p.status === "open").length,
      pendingCandidates: this.data.recruitment.candidates.filter(c => c.status === "new").length,
    };
  }

  getTotalSalaryCost() {
    const cfg = this.data.config;
    return this.getActiveEmployees().reduce((sum, e) => {
      const base = e.salary.base || 0;
      const employer = base * (cfg.nationalInsuranceEmployer + cfg.pensionEmployer + cfg.severanceContribution);
      return sum + base + employer + (e.salary.travelAllowance || 0) + (e.salary.mealAllowance || 0) + (e.salary.phoneAllowance || 0);
    }, 0);
  }

  async analyze() {
    const headcount = this.getHeadcount();
    const salaryCost = this.getTotalSalaryCost();
    const pendingLeaves = this.data.leaves.filter(l => l.status === "pending");
    const recentAlerts = this.data.alerts.slice(-10);

    return await this.brain.thinkJSON(`
אתה מנהל HR אוטונומי של טכנו כל עוזי — מפעל מתכת, 30 עובדים.
תפקידך: לנתח כוח אדם, לזהות בעיות, ולהמליץ על פעולות.

═══ מצב כוח אדם ═══
${JSON.stringify(headcount)}
עלות שכר חודשית כוללת (כולל מעסיק): ₪${shekel(salaryCost)}
עובדים: ${JSON.stringify(this.getActiveEmployees().map(e => ({
  name: e.name, role: e.role, dept: e.department, since: e.startDate,
  salary: shekel(e.salary.base), warnings: e.warnings.length,
  leaveBalance: e.leaveBalance, daysEmployed: daysAgo(e.startDate),
})))}

═══ גיוס ═══
משרות פתוחות: ${JSON.stringify(this.data.recruitment.openPositions.filter(p => p.status === "open").map(p => ({
  title: p.title, dept: p.department, urgency: p.urgency, candidates: p.candidates.length,
  daysSinceOpened: daysAgo(p.createdAt),
})))}
מועמדים חדשים: ${this.data.recruitment.candidates.filter(c => c.status === "new").length}

═══ נוכחות ושעות ═══
התראות אחרונות: ${JSON.stringify(recentAlerts)}
חופשות ממתינות: ${JSON.stringify(pendingLeaves.map(l => ({
  employee: l.employeeName, type: l.leaveType, days: l.days, dates: l.startDate + " → " + l.endDate,
})))}

═══ ביצועים ═══
סקירות אחרונות: ${this.data.performance.length}
אזהרות פעילות: ${this.getActiveEmployees().reduce((s, e) => s + e.warnings.length, 0)}

═══ מה לנתח ═══

1. **רמת אכלוס** — האם 30 עובדים מספיקים? חסר? עודף? באיזה מחלקה?
2. **עלויות שכר** — האם בתקציב? מה היחס שכר/הכנסות?
3. **גיוס** — מה דחוף? איפה מפרסמים? כמה זמן לוקח?
4. **נוכחות** — בעיות איחורים? חיסורים? מי בסיכון?
5. **שימור** — מי בסיכון לעזוב? סימנים: ירידה בביצועים, איחורים, בקשות חופש רבות
6. **ביצועים** — מי מצטיין? מי צריך שיפור? מי צריך הכשרה?
7. **חוקי עבודה** — האם עומדים? שעות נוספות? חופשות? הודעה מוקדמת?
8. **תרבות** — מה המורל? אווירה? שיתוף פעולה?
9. **הכשרות** — מה חסר? בטיחות? מקצועי?
10. **תכנון** — מי צריך גיבוי? מי חיוני? Knowledge management?

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "סיכום 2-3 שורות",
  "staffingAnalysis": {
    "current": 0, "needed": 0, "gap": 0,
    "byDepartment": [{"dept": "...", "current": 0, "needed": 0, "action": "..."}],
    "criticalRoles": ["תפקיד חיוני שחסר"]
  },
  "costAnalysis": {
    "totalMonthlyCost": 0, "avgSalary": 0,
    "salaryToRevenueRatio": 0, "benchmark": "...",
    "recommendations": ["..."]
  },
  "recruitmentPriority": [{
    "position": "...", "urgency": "critical/high/medium/low",
    "reason": "...", "suggestedChannels": ["facebook_groups", "referral", "job_board", "whatsapp"],
    "expectedTimeToHire": "...", "suggestedSalary": "..."
  }],
  "retentionRisks": [{
    "employee": "...", "risk": "high/medium/low",
    "signals": ["..."], "action": "...", "cost_of_replacement": 0
  }],
  "attendanceIssues": [{
    "employee": "...", "issue": "...", "frequency": "...",
    "recommendation": "verbal_warning/written_warning/meeting/support"
  }],
  "performanceHighlights": {
    "topPerformers": ["..."],
    "needsImprovement": [{"employee": "...", "area": "...", "action": "..."}],
    "trainingNeeds": [{"employee": "...", "training": "...", "priority": "..."}]
  },
  "complianceCheck": {
    "overtimeCompliance": true,
    "leaveCompliance": true,
    "safetyTraining": true,
    "issues": ["..."]
  },
  "leaveApprovals": [{
    "leaveId": "...", "employee": "...", "recommendation": "approve/reject",
    "reason": "...", "impactOnOperations": "none/minor/significant"
  }],
  "keyManRisk": [{
    "employee": "...", "criticality": "high/medium/low",
    "backup": "exists/partial/none",
    "action": "..."
  }],
  "automatedActions": [{
    "action": "...", "reason": "...", "priority": "...",
    "affectedEmployee": "..."
  }],
  "kpis": {
    "headcount": 0, "turnoverRate": 0, "avgTenure": 0,
    "absenteeismRate": 0, "timeToHire": 0, "trainingHoursPerEmployee": 0,
    "employeeSatisfaction": 0, "safetyIncidents": 0
  }
}`);
  }
}

// ═══════════════════════════════════════
// FINANCE MODULE
// ═══════════════════════════════════════

class FinanceModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "finance", "state.json");
    this.data = load(this.file, {
      transactions: [], invoices: [], receipts: [], expenses: [],
      cashflow: { in: 0, out: 0, balance: 0 },
      accounts: { receivable: [], payable: [] },
      budgets: { monthly: {}, annual: {}, departments: {} },
      taxes: {
        vatCollected: 0, vatPaid: 0, vatBalance: 0,
        incomeTaxPaid: 0, nationalInsurancePaid: 0,
        nextVatReport: null, nextTaxReport: null,
      },
      bankAccounts: [],
      checks: { received: [], issued: [] },
      loans: [],
      reports: [],
    });
  }
  save() { save(this.file, this.data); }

  addTransaction(data) {
    const amount = data.amount || 0;
    const tx = {
      id: `TX-${uid()}`,
      type: data.type || "income",
      category: data.category || "general",
      subcategory: data.subcategory || "",
      description: data.description || "",
      amount: amount,
      amountBeforeVat: data.amountBeforeVat || Math.round(Math.abs(amount) / 1.18),
      vat: data.vat || vatOf(Math.round(Math.abs(amount) / 1.18)),
      method: data.method || "transfer",
      reference: data.reference || "",
      checkNumber: data.checkNumber || null,
      projectId: data.projectId || null,
      supplierId: data.supplierId || null,
      customerId: data.customerId || null,
      employeeId: data.employeeId || null,
      invoiceId: data.invoiceId || null,
      date: data.date || today(),
      dueDate: data.dueDate || null,
      reconciled: false,
      approvedBy: data.approvedBy || null,
      notes: data.notes || "",
      createdAt: now(),
    };

    this.data.transactions.push(tx);

    if (tx.type === "income") {
      this.data.cashflow.in += Math.abs(tx.amount);
      this.data.taxes.vatCollected += tx.vat;
    } else {
      this.data.cashflow.out += Math.abs(tx.amount);
      this.data.taxes.vatPaid += tx.vat;
    }
    this.data.cashflow.balance = this.data.cashflow.in - this.data.cashflow.out;
    this.data.taxes.vatBalance = this.data.taxes.vatCollected - this.data.taxes.vatPaid;

    this.save();
    log("FINANCE", `💰 ${tx.type}: ₪${shekel(Math.abs(tx.amount))} — ${tx.description} (${tx.category})`);
    return tx;
  }

  createInvoice(data) {
    const items = (data.items || []).map(i => ({
      description: i.description, qty: i.qty || 1,
      unitPrice: i.unitPrice || 0,
      total: (i.qty || 1) * (i.unitPrice || 0),
    }));
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const discount = data.discount || 0;
    const afterDiscount = subtotal - discount;
    const vat = vatOf(afterDiscount);

    const inv = {
      id: `INV-${uid()}`,
      number: `${new Date().getFullYear()}-${(this.data.invoices.length + 1).toString().padStart(5, "0")}`,
      type: data.type || "tax_invoice", // tax_invoice, receipt, proforma, credit_note
      customerId: data.customerId || null,
      customerName: data.customerName || "",
      customerAddress: data.customerAddress || "",
      customerBN: data.customerBN || "", // ח.פ.
      projectId: data.projectId || null,
      items, subtotal, discount, afterDiscount, vat,
      total: afterDiscount + vat,
      currency: "ILS",
      status: "draft",
      paymentTerms: data.paymentTerms || "שוטף + 30",
      dueDate: data.dueDate || null,
      notes: data.notes || "",
      bankDetails: data.bankDetails || "בנק הפועלים, סניף XXX, חשבון XXX",
      createdAt: now(), sentAt: null, paidAt: null,
      reminders: [],
    };

    // חישוב תאריך פירעון
    if (!inv.dueDate && inv.paymentTerms === "שוטף + 30") {
      const due = new Date();
      due.setDate(due.getDate() + 30);
      inv.dueDate = due.toISOString().split("T")[0];
    } else if (!inv.dueDate && inv.paymentTerms === "שוטף + 60") {
      const due = new Date();
      due.setDate(due.getDate() + 60);
      inv.dueDate = due.toISOString().split("T")[0];
    } else if (!inv.dueDate) {
      const due = new Date();
      due.setDate(due.getDate() + 30);
      inv.dueDate = due.toISOString().split("T")[0];
    }

    this.data.invoices.push(inv);
    this.data.accounts.receivable.push({
      invoiceId: inv.id, invoiceNumber: inv.number,
      customer: inv.customerName, amount: inv.total,
      dueDate: inv.dueDate, status: "pending",
    });

    this.save();
    log("FINANCE", `📄 חשבונית: ${inv.number} — ${inv.customerName} — ₪${shekel(inv.total)} (כולל מע"מ) — יעד: ${inv.dueDate}`);
    return inv;
  }

  sendInvoice(invoiceId) {
    const inv = this.data.invoices.find(i => i.id === invoiceId);
    if (!inv) return null;
    inv.status = "sent";
    inv.sentAt = now();
    this.save();
    log("FINANCE", `📤 חשבונית ${inv.number} נשלחה`);
    return inv;
  }

  markInvoicePaid(invoiceId, data = {}) {
    const inv = this.data.invoices.find(i => i.id === invoiceId);
    if (!inv) return null;
    inv.status = "paid";
    inv.paidAt = data.paidDate || today();

    this.data.accounts.receivable = this.data.accounts.receivable.filter(a => a.invoiceId !== invoiceId);

    this.addTransaction({
      type: "income", category: "sales",
      description: `תשלום חשבונית ${inv.number} — ${inv.customerName}`,
      amount: inv.afterDiscount, // לפני מע"מ
      vat: inv.vat,
      method: data.method || "transfer",
      invoiceId: inv.id, customerId: inv.customerId, projectId: inv.projectId,
    });

    this.save();
    log("FINANCE", `✅ חשבונית ${inv.number} שולמה — ₪${shekel(inv.total)}`, "SUCCESS");
    this.memory.add("successes", { type: "invoice_paid", number: inv.number, amount: inv.total, customer: inv.customerName });
    return inv;
  }

  addExpense(data) {
    const amount = data.amount || 0;
    const exp = {
      id: `EXP-${uid()}`,
      category: data.category || "general",
      subcategory: data.subcategory || "",
      description: data.description || "",
      amount: amount,
      vat: data.includesVat ? Math.round(amount - amount / 1.18) : vatOf(amount),
      vendor: data.vendor || "",
      vendorBN: data.vendorBN || "",
      receipt: data.receipt || null,
      projectId: data.projectId || null,
      department: data.department || null,
      approvedBy: data.approvedBy || null,
      date: data.date || today(),
      paymentMethod: data.paymentMethod || "transfer",
      recurring: data.recurring || false,
      recurringFrequency: data.recurringFrequency || null,
      createdAt: now(),
    };

    this.data.expenses.push(exp);
    this.addTransaction({
      type: "expense", category: exp.category, subcategory: exp.subcategory,
      description: exp.description, amount: -Math.abs(exp.amount),
      vat: exp.vat, method: exp.paymentMethod, supplierId: exp.vendor,
      projectId: exp.projectId,
    });

    this.save();
    return exp;
  }

  addCheck(data) {
    const check = {
      id: uid(), type: data.type || "received", // received, issued
      number: data.number || "",
      bank: data.bank || "", branch: data.branch || "",
      amount: data.amount || 0,
      date: data.date || today(),
      dueDate: data.dueDate || today(),
      payee: data.payee || "",
      payer: data.payer || "",
      status: "pending", // pending, deposited, cleared, bounced, cancelled
      projectId: data.projectId || null,
      notes: data.notes || "",
      createdAt: now(),
    };
    this.data.checks[data.type === "issued" ? "issued" : "received"].push(check);
    this.save();
    return check;
  }

  getOverdueInvoices() {
    return this.data.invoices.filter(inv =>
      inv.status !== "paid" && inv.status !== "cancelled" &&
      inv.dueDate && new Date(inv.dueDate) < new Date()
    );
  }

  getMonthlyPnL(yearMonth) {
    const month = yearMonth || today().substring(0, 7);
    const txs = this.data.transactions.filter(t => t.date && t.date.startsWith(month));
    const income = txs.filter(t => t.type === "income").reduce((s, t) => s + Math.abs(t.amount), 0);
    const expenses = txs.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
    const profit = income - expenses;

    const byCategory = {};
    for (const tx of txs) {
      const cat = tx.category || "other";
      if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 };
      if (tx.type === "income") byCategory[cat].income += Math.abs(tx.amount);
      else byCategory[cat].expense += Math.abs(tx.amount);
    }

    return { month, income, expenses, profit, margin: income > 0 ? (profit / income * 100).toFixed(1) : "0", byCategory, transactionCount: txs.length };
  }

  getYTDSummary() {
    const year = today().substring(0, 4);
    const txs = this.data.transactions.filter(t => t.date && t.date.startsWith(year));
    const income = txs.filter(t => t.type === "income").reduce((s, t) => s + Math.abs(t.amount), 0);
    const expenses = txs.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
    return { year, income, expenses, profit: income - expenses, months: new Date().getMonth() + 1 };
  }

  async analyze() {
    const pnl = this.getMonthlyPnL();
    const ytd = this.getYTDSummary();
    const overdue = this.getOverdueInvoices();
    const pendingChecks = this.data.checks.received.filter(c => c.status === "pending");

    return await this.brain.thinkJSON(`
אתה CFO אוטונומי של טכנו כל עוזי + קובי אלקיים נדל"ן.
תפקידך: לנהל כספים, לחזות תזרים, ולמנוע בעיות.

═══ תזרים מזומנים ═══
נכנס: ₪${shekel(this.data.cashflow.in)}
יוצא: ₪${shekel(this.data.cashflow.out)}
יתרה: ₪${shekel(this.data.cashflow.balance)}

═══ P&L חודשי (${pnl.month}) ═══
הכנסות: ₪${shekel(pnl.income)}
הוצאות: ₪${shekel(pnl.expenses)}
רווח: ₪${shekel(pnl.profit)} (${pnl.margin}%)
לפי קטגוריה: ${JSON.stringify(pnl.byCategory)}

═══ YTD (${ytd.year}) ═══
הכנסות: ₪${shekel(ytd.income)}
הוצאות: ₪${shekel(ytd.expenses)}
רווח: ₪${shekel(ytd.profit)}

═══ חובות ═══
חשבוניות באיחור: ${overdue.length} (₪${shekel(overdue.reduce((s, i) => s + i.total, 0))})
${JSON.stringify(overdue.map(i => ({ number: i.number, customer: i.customerName, amount: shekel(i.total), daysOverdue: daysAgo(i.dueDate) })))}
צ'קים ממתינים: ${pendingChecks.length} (₪${shekel(pendingChecks.reduce((s, c) => s + c.amount, 0))})

═══ מיסים ═══
מע"מ לתשלום: ₪${shekel(this.data.taxes.vatBalance)}
דוח מע"מ הבא: ${this.data.taxes.nextVatReport || "לא מוגדר"}

═══ הוצאות גדולות אחרונות ═══
${JSON.stringify(this.data.expenses.slice(-10).map(e => ({ category: e.category, amount: shekel(e.amount), vendor: e.vendor, date: e.date })))}

═══ מה לנתח ═══

1. **תזרים** — האם חיובי? מגמה? חיזוי 30/60/90 יום?
2. **רווחיות** — Margin בריא? לפי סוג פרויקט? לפי לקוח?
3. **חובות** — מי חייב? כמה זמן? מה לעשות? (טלפון/מכתב/עו"ד)
4. **הוצאות** — חריגות? הזדמנויות חיסכון? הוצאות מיותרות?
5. **מע"מ** — האם מוכנים לדוח? כמה לשלם?
6. **Budget** — האם בתקציב? חריגות? לפי מחלקה?
7. **סיכונים** — האם יש לקוח גדול שחייב הרבה? ריכוז סיכון?
8. **הזדמנויות** — הנחות ספקים? תנאי תשלום טובים יותר?
9. **השקעות** — האם יש עודף מזומנים להשקיע? בציוד? בשיווק?
10. **חיזוי** — הכנסות/הוצאות צפויות? בעיות צפויות?

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "סיכום 2-3 שורות",
  "cashflowHealth": {
    "current": "positive/tight/negative/critical",
    "trend": "improving/stable/declining",
    "forecast30days": 0, "forecast60days": 0, "forecast90days": 0,
    "burnRate": 0, "runway": "...",
    "criticalDate": "תאריך שבו עלול להיגמר הכסף (אם רלוונטי)"
  },
  "profitability": {
    "grossMargin": 0, "netMargin": 0,
    "trend": "improving/stable/declining",
    "benchmark": "above/at/below market",
    "byCategory": [{"category": "...", "margin": 0, "healthy": true}]
  },
  "overdueActions": [{
    "invoiceNumber": "...", "customer": "...", "amount": 0, "daysOverdue": 0,
    "action": "phone_call/email_reminder/formal_letter/legal_notice/write_off",
    "suggestedMessage": "...",
    "urgency": "critical/high/medium/low"
  }],
  "expenseAnalysis": {
    "topCategories": [{"category": "...", "amount": 0, "percent": 0, "trend": "..."}],
    "anomalies": [{"expense": "...", "reason": "..."}],
    "savingOpportunities": [{"area": "...", "currentCost": 0, "potentialSaving": 0, "method": "..."}]
  },
  "taxPreparation": {
    "vatDue": 0, "nextDeadline": "...",
    "incomeTaxEstimate": 0,
    "nationalInsurance": 0,
    "preparednessScore": 0,
    "missingDocuments": ["..."]
  },
  "budgetVariance": [{"department": "...", "budgeted": 0, "actual": 0, "variance": 0, "explanation": "..."}],
  "riskAssessment": {
    "concentrationRisk": {"topCustomer": "...", "percentOfRevenue": 0, "recommendation": "..."},
    "creditRisk": [{"customer": "...", "exposure": 0, "risk": "high/medium/low"}],
    "cashflowRisk": "..."
  },
  "automatedActions": [{
    "action": "...", "reason": "...", "amount": 0,
    "priority": "critical/high/medium/low",
    "expectedImpact": "..."
  }],
  "kpis": {
    "monthlyRevenue": 0, "monthlyProfit": 0,
    "grossMargin": 0, "netMargin": 0,
    "dso": 0, "dpo": 0,
    "currentRatio": 0,
    "debtToEquity": 0,
    "revenuePerEmployee": 0,
    "costPerProject": 0,
    "collectionRate": 0
  }
}`);
  }
}

// ═══════════════════════════════════════
// OPS MODULE
// ═══════════════════════════════════════

class OpsModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "ops", "state.json");
    this.data = load(this.file, {
      schedule: [], measurements: [], installations: [],
      deliveries: [], vehicles: [], tools: [],
      incidents: [], dailyReports: [], weatherAlerts: [],
      serviceAreas: ["תל אביב", "רמת גן", "גבעתיים", "בני ברק", "חולון", "בת ים", "הרצליה", "רעננה", "כפר סבא", "פתח תקווה", "ראשון לציון", "נתניה", "חיפה", "ירושלים", "באר שבע"],
    });
  }
  save() { save(this.file, this.data); }

  scheduleMeasurement(data) {
    const m = {
      id: `MEAS-${uid()}`, status: "scheduled",
      leadId: data.leadId || null, projectId: data.projectId || null,
      customerName: data.customerName || "", phone: data.phone || "",
      address: data.address || "", city: data.city || "",
      floor: data.floor || "", apartment: data.apartment || "",
      date: data.date, time: data.time || "09:00",
      assignee: data.assignee || "עוזי",
      estimatedDuration: data.estimatedDuration || 45,
      projectType: data.projectType || "",
      accessInstructions: data.accessInstructions || "",
      parkingInfo: data.parkingInfo || "",
      notes: data.notes || "",
      result: null,
      measurements: {
        sections: [], // { name: "מרפסת", length: 0, height: 0, notes: "" }
        totalLength: 0, totalArea: 0,
        obstacles: [], // "עמוד", "צנרת", "חלון"
        specialRequirements: [],
      },
      photos: [],
      sketches: [],
      customerPresent: null,
      createdAt: now(),
    };
    this.data.measurements.push(m);
    this.data.schedule.push({
      type: "measurement", refId: m.id,
      date: m.date, time: m.time,
      assignee: m.assignee, address: m.address, city: m.city,
      customer: m.customerName, phone: m.phone,
      duration: m.estimatedDuration,
    });
    this.save();
    log("OPS", `📏 מדידה: ${m.customerName} — ${m.address}, ${m.city} — ${m.date} ${m.time} — ${m.assignee}`);
    return m;
  }

  completeMeasurement(measId, data = {}) {
    const m = this.data.measurements.find(x => x.id === measId);
    if (!m) return null;
    m.status = "completed";
    m.result = "measured";
    m.completedAt = now();
    if (data.measurements) m.measurements = { ...m.measurements, ...data.measurements };
    if (data.photos) m.photos = data.photos;
    if (data.notes) m.notes += "\n" + data.notes;
    m.customerPresent = data.customerPresent !== undefined ? data.customerPresent : null;
    this.save();
    log("OPS", `✅ מדידה: ${m.customerName} — ${m.measurements.totalLength}מ'`, "SUCCESS");
    return m;
  }

  cancelMeasurement(measId, reason) {
    const m = this.data.measurements.find(x => x.id === measId);
    if (!m) return null;
    m.status = "cancelled";
    m.result = "cancelled";
    m.notes += `\nבוטל: ${reason}`;
    this.data.schedule = this.data.schedule.filter(s => s.refId !== measId);
    this.save();
    log("OPS", `❌ מדידה בוטלה: ${m.customerName} — ${reason}`, "WARN");
    return m;
  }

  rescheduleMeasurement(measId, newDate, newTime) {
    const m = this.data.measurements.find(x => x.id === measId);
    if (!m) return null;
    const oldDate = m.date;
    m.date = newDate;
    m.time = newTime || m.time;
    m.status = "rescheduled";
    m.notes += `\nנדחה מ-${oldDate} ל-${newDate}`;

    // עדכון לוח זמנים
    const sched = this.data.schedule.find(s => s.refId === measId);
    if (sched) { sched.date = newDate; sched.time = newTime || sched.time; }

    this.save();
    log("OPS", `📅 מדידה נדחתה: ${m.customerName} — ${oldDate} → ${newDate}`);
    return m;
  }

  scheduleInstallation(data) {
    const inst = {
      id: `INST-${uid()}`, status: "scheduled",
      projectId: data.projectId || null,
      customerName: data.customerName || "", phone: data.phone || "",
      address: data.address || "", city: data.city || "",
      floor: data.floor || "",
      date: data.date, time: data.time || "07:30",
      endDate: data.endDate || data.date,
      team: data.team || [],
      teamLead: data.teamLead || null,
      estimatedDuration: data.estimatedDuration || 480,
      projectType: data.projectType || "",
      materials: data.materials || [],
      tools: data.tools || [],
      vehicle: data.vehicle || null,
      accessInstructions: data.accessInstructions || "",
      parkingInfo: data.parkingInfo || "",
      powerAvailable: data.powerAvailable !== undefined ? data.powerAvailable : true,
      elevatorAvailable: data.elevatorAvailable || false,
      safetyRequirements: data.safetyRequirements || [],
      notes: data.notes || "",
      result: null,
      customerSignature: null,
      photos: { before: [], during: [], after: [] },
      quality: { checklist: [], score: null, issues: [] },
      timeLog: { arrived: null, started: null, breaks: [], finished: null },
      createdAt: now(),
    };
    this.data.installations.push(inst);
    this.data.schedule.push({
      type: "installation", refId: inst.id,
      date: inst.date, time: inst.time, endDate: inst.endDate,
      team: inst.team, teamLead: inst.teamLead,
      address: inst.address, city: inst.city,
      customer: inst.customerName, phone: inst.phone,
      duration: inst.estimatedDuration,
      projectType: inst.projectType,
    });
    this.save();
    log("OPS", `🔧 התקנה: ${inst.customerName} — ${inst.address}, ${inst.city} — ${inst.date} — צוות: ${inst.team.join(", ")}`);
    return inst;
  }

  startInstallation(instId, data = {}) {
    const inst = this.data.installations.find(x => x.id === instId);
    if (!inst) return null;
    inst.status = "in_progress";
    inst.timeLog.arrived = data.arrivedAt || now();
    inst.timeLog.started = data.startedAt || now();
    this.save();
    return inst;
  }

  completeInstallation(instId, data = {}) {
    const inst = this.data.installations.find(x => x.id === instId);
    if (!inst) return null;
    inst.status = "completed";
    inst.result = "completed";
    inst.completedAt = now();
    inst.timeLog.finished = now();
    if (data.customerSignature) inst.customerSignature = data.customerSignature;
    if (data.photos) inst.photos = { ...inst.photos, ...data.photos };
    if (data.quality) inst.quality = { ...inst.quality, ...data.quality };
    if (data.notes) inst.notes += "\n" + data.notes;
    this.save();
    log("OPS", `✅ התקנה: ${inst.customerName} — ${inst.address}`, "SUCCESS");
    this.memory.add("successes", { type: "installation_completed", customer: inst.customerName, address: inst.address });
    return inst;
  }

  addVehicle(data) {
    const v = {
      id: uid(),
      plateNumber: data.plateNumber || "",
      type: data.type || "van",
      make: data.make || "", model: data.model || "", year: data.year || 0,
      driver: data.driver || null,
      status: "available",
      mileage: data.mileage || 0,
      fuelType: data.fuelType || "diesel",
      insurance: { company: data.insuranceCompany || "", expires: data.insuranceExpires || null, policy: data.insurancePolicy || "" },
      test: { lastDate: data.lastTestDate || null, nextDate: data.nextTestDate || null },
      service: { lastDate: data.lastServiceDate || null, nextDate: data.nextServiceDate || null, nextKm: data.nextServiceKm || 0 },
      equipment: data.equipment || [],
      history: [],
      createdAt: now(),
    };
    this.data.vehicles.push(v);
    this.save();
    log("OPS", `🚐 רכב: ${v.plateNumber} (${v.type}) — ${v.driver || "ללא נהג"}`);
    return v;
  }

  reportIncident(data) {
    const inc = {
      id: `INC-${uid()}`,
      type: data.type || "safety",
      severity: data.severity || "medium",
      description: data.description || "",
      location: data.location || "",
      projectId: data.projectId || null,
      involvedPersons: data.involvedPersons || [],
      reportedBy: data.reportedBy || "system",
      witnesses: data.witnesses || [],
      injuries: data.injuries || [],
      propertyDamage: data.propertyDamage || "",
      rootCause: data.rootCause || "",
      immediateActions: data.immediateActions || [],
      correctiveActions: [],
      photos: data.photos || [],
      status: "open",
      createdAt: now(), resolvedAt: null,
    };
    this.data.incidents.push(inc);
    this.save();

    const icon = inc.severity === "critical" ? "🚨" : inc.severity === "high" ? "⚠️" : "ℹ️";
    log("OPS", `${icon} אירוע ${inc.type}: ${inc.description}`, inc.severity === "critical" ? "ERROR" : "WARN");
    this.memory.add("alerts", { type: "incident", severity: inc.severity, description: inc.description, location: inc.location });
    this.memory.add("mistakes", { type: "incident", severity: inc.severity, description: inc.description });
    return inc;
  }

  getScheduleForDate(date = today()) {
    return this.data.schedule.filter(s => s.date === date).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }

  getScheduleForWeek(startDate = today()) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      if (d.getDay() === 6) continue; // דלג על שבת
      const dateStr = d.toISOString().split("T")[0];
      const dayName = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][d.getDay()];
      week.push({ date: dateStr, day: dayName, events: this.getScheduleForDate(dateStr) });
    }
    return week;
  }

  getPendingMeasurements() { return this.data.measurements.filter(m => m.status === "scheduled" || m.status === "rescheduled"); }
  getPendingInstallations() { return this.data.installations.filter(i => i.status === "scheduled"); }
  getOpenIncidents() { return this.data.incidents.filter(i => i.status === "open"); }

  async planDay(date = today()) {
    const schedule = this.getScheduleForDate(date);
    const pending = {
      measurements: this.getPendingMeasurements().length,
      installations: this.getPendingInstallations().length,
    };

    return await this.brain.thinkJSON(`
אתה מנהל תפעול אוטונומי של טכנו כל עוזי.
תכנן יום עבודה אופטימלי.

═══ תאריך: ${date} ═══
לוח זמנים נוכחי: ${JSON.stringify(schedule)}
ממתינים: ${JSON.stringify(pending)}
רכבים: ${JSON.stringify(this.data.vehicles.map(v => ({ plate: v.plateNumber, type: v.type, driver: v.driver, status: v.status })))}
אירועים פתוחים: ${this.getOpenIncidents().length}
שעות עבודה: ${CONFIG.BUSINESS.techno.workHours.start} - ${CONFIG.BUSINESS.techno.workHours.end}

═══ כללים ═══
- מדידות: בוקר (08:00-12:00) — עוזי
- התקנות: כל היום (07:30-16:00) — צוותים
- לא לקבוע 2 מדידות באותה שעה
- זמן נסיעה בין נקודות: 30-45 דקות בת"א
- הפסקת צהריים: 12:00-12:30
- שישי: עד 13:00 בלבד

תחזיר JSON:
{
  "optimizedSchedule": [{
    "time": "...", "endTime": "...",
    "type": "measurement/installation/delivery/maintenance",
    "address": "...", "city": "...",
    "team": ["..."], "vehicle": "...",
    "customer": "...", "phone": "...",
    "notes": "...", "priority": "high/medium/low"
  }],
  "routeOptimization": {
    "suggestedOrder": ["כתובת 1", "כתובת 2"],
    "estimatedKm": 0, "estimatedDriveTime": "...",
    "fuelEstimate": 0
  },
  "conflicts": ["..."],
  "missingResources": ["..."],
  "preparationChecklist": ["הכנה 1"],
  "safetyReminders": ["תזכורת בטיחות 1"],
  "weatherConsideration": "...",
  "riskAssessment": "...",
  "backupPlan": "..."
}`);
  }

  async analyze() {
    const week = this.getScheduleForWeek();
    const pending = { measurements: this.getPendingMeasurements().length, installations: this.getPendingInstallations().length };

    return await this.brain.thinkJSON(`
נתח תפעול:
מדידות ממתינות: ${pending.measurements}
התקנות ממתינות: ${pending.installations}
אירועים פתוחים: ${this.getOpenIncidents().length}
רכבים: ${this.data.vehicles.length}
לוח שבועי: ${JSON.stringify(week)}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "סיכום",
  "efficiency": 0.0-1.0,
  "bottlenecks": [{"area": "...", "description": "...", "solution": "..."}],
  "delays": [{"project": "...", "reason": "...", "impact": "...", "solution": "..."}],
  "vehicleUtilization": 0.0-1.0,
  "vehicleAlerts": [{"vehicle": "...", "alert": "...", "urgency": "..."}],
  "safetyScore": 0-100,
  "safetyIssues": ["..."],
  "weekLoadBalance": [{"date": "...", "load": "heavy/normal/light", "recommendation": "..."}],
  "recommendations": ["..."],
  "automatedActions": [{"action": "...", "reason": "...", "priority": "..."}],
  "kpis": {
    "measurementsPerWeek": 0, "installationsPerWeek": 0,
    "avgInstallationTime": 0, "onTimeRate": 0,
    "incidentRate": 0, "vehicleUtilization": 0,
    "customerNoShowRate": 0, "reworkRate": 0
  }
}`);
  }
}

// ═══════════════════════════════════════
// EXPORT PART 2
// ═══════════════════════════════════════

module.exports = { BOMModule, HRModule, FinanceModule, OpsModule };
