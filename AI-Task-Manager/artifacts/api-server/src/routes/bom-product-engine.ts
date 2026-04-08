// ============================================================
// מנוע BOM - ניהול מפרט חומרים למוצרי מפעל מתכת
// שערים, גדרות, מעקות, פרגולות, דלתות, חלונות ועוד
// ============================================================

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { VAT_RATE } from "../constants";

const router = Router();

// ============================================================
// יצירת טבלאות ונתוני בסיס
// ============================================================
router.post("/init", async (req: Request, res: Response) => {
  try {
    // טבלת מוצרי BOM
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_bom (
        id SERIAL PRIMARY KEY,
        product_id INTEGER,
        product_name VARCHAR(255),
        product_name_he VARCHAR(255),
        product_code VARCHAR(50) UNIQUE,
        category VARCHAR(50),
        description TEXT,
        description_he TEXT,
        default_width_mm NUMERIC(10,2),
        default_height_mm NUMERIC(10,2),
        base_price_per_sqm NUMERIC(10,2),
        image_url TEXT,
        technical_drawing_url TEXT,
        version INTEGER DEFAULT 1,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת רכיבי חומר
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bom_components (
        id SERIAL PRIMARY KEY,
        bom_id INTEGER REFERENCES product_bom(id),
        raw_material_id INTEGER,
        material_name VARCHAR(255),
        material_name_he VARCHAR(255),
        material_type VARCHAR(50),
        profile_type VARCHAR(100),
        quantity_per_sqm NUMERIC(10,4),
        unit VARCHAR(20),
        waste_percentage NUMERIC(5,2) DEFAULT 5,
        unit_cost NUMERIC(10,2),
        cost_per_sqm NUMERIC(10,2),
        supplier_id INTEGER,
        supplier_name VARCHAR(255),
        is_optional BOOLEAN DEFAULT false,
        substitute_material_id INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת עבודה
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bom_labor (
        id SERIAL PRIMARY KEY,
        bom_id INTEGER REFERENCES product_bom(id),
        operation VARCHAR(100),
        operation_he VARCHAR(100),
        worker_type VARCHAR(50),
        hours_per_sqm NUMERIC(6,3),
        cost_per_hour NUMERIC(10,2),
        cost_per_sqm NUMERIC(10,2),
        sequence_order INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת סיכום עלויות
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bom_cost_summary (
        id SERIAL PRIMARY KEY,
        bom_id INTEGER REFERENCES product_bom(id),
        calculated_at TIMESTAMPTZ DEFAULT NOW(),
        material_cost_per_sqm NUMERIC(10,2),
        labor_cost_per_sqm NUMERIC(10,2),
        overhead_per_sqm NUMERIC(10,2) DEFAULT 0,
        painting_cost_per_sqm NUMERIC(10,2) DEFAULT 55,
        transport_cost_per_sqm NUMERIC(10,2) DEFAULT 15,
        total_cost_per_sqm NUMERIC(10,2),
        margin_percentage NUMERIC(5,2) DEFAULT 200,
        suggested_price_per_sqm NUMERIC(10,2),
        suggested_price_with_vat NUMERIC(10,2),
        notes TEXT
      )
    `);

    // ============================================================
    // זריעת 6 מוצרים עם רכיבים ועבודה
    // ============================================================

    // מוצר 1: מעקה SIT
    const p1 = await pool.query(
      `INSERT INTO product_bom (product_id, product_name, product_name_he, product_code, category, description, description_he, default_width_mm, default_height_mm, base_price_per_sqm)
       VALUES (1, 'SIT Railing', 'מעקה SIT', 'RAIL-SIT-001', 'railing', 'Modern SIT design railing with horizontal bars', 'מעקה בעיצוב SIT מודרני עם מוטות אופקיים', 1000, 1000, 850)
       ON CONFLICT (product_code) DO NOTHING RETURNING id`,
      []
    );
    const bomId1 = p1.rows[0]?.id;

    if (bomId1) {
      // רכיבי מעקה SIT
      const sitComponents = [
        { name: "Square tube 40x40x2", nameHe: "פרופיל מרובע 40x40x2", type: "iron_profile", profile: "40x40x2mm", qty: 3.2, unit: "מטר", waste: 5, cost: 28, costSqm: 94.08, supplier: "ברזל השרון" },
        { name: "Round tube 25x2", nameHe: "פרופיל עגול 25x2", type: "iron_profile", profile: "25x2mm", qty: 8.5, unit: "מטר", waste: 7, cost: 15, costSqm: 136.28, supplier: "ברזל השרון" },
        { name: "Flat bar 50x5", nameHe: "פס שטוח 50x5", type: "iron_profile", profile: "50x5mm", qty: 1.5, unit: "מטר", waste: 5, cost: 12, costSqm: 18.90, supplier: "ברזל השרון" },
        { name: "Base plate 100x100x6", nameHe: "פלטת בסיס 100x100x6", type: "iron_profile", profile: "100x100x6mm", qty: 2, unit: "יחידה", waste: 0, cost: 18, costSqm: 36.00, supplier: "מתכת פלוס" },
        { name: "Welding wire 1.2mm", nameHe: "חוט ריתוך 1.2 מ\"מ", type: "welding", profile: "MIG 1.2mm", qty: 0.15, unit: 'ק"ג', waste: 10, cost: 45, costSqm: 7.43, supplier: "רתכים בע\"מ" },
        { name: "Primer paint", nameHe: "צבע יסוד", type: "paint", profile: "אפוקסי", qty: 0.2, unit: "ליטר", waste: 5, cost: 35, costSqm: 7.35, supplier: "צבעי טמבור" },
        { name: "Top coat paint", nameHe: "צבע גמר", type: "paint", profile: "פוליאוריתן", qty: 0.25, unit: "ליטר", waste: 5, cost: 48, costSqm: 12.60, supplier: "צבעי טמבור" },
        { name: "Anchor bolts M10", nameHe: "בורגי עיגון M10", type: "hardware", profile: "M10x100", qty: 4, unit: "יחידה", waste: 0, cost: 3.5, costSqm: 14.00, supplier: "חומרי בניין רמי" },
      ];

      for (const comp of sitComponents) {
        await pool.query(
          `INSERT INTO bom_components (bom_id, material_name, material_name_he, material_type, profile_type, quantity_per_sqm, unit, waste_percentage, unit_cost, cost_per_sqm, supplier_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [bomId1, comp.name, comp.nameHe, comp.type, comp.profile, comp.qty, comp.unit, comp.waste, comp.cost, comp.costSqm, comp.supplier]
        );
      }

      // עבודה מעקה SIT
      const sitLabor = [
        { op: "Cutting", opHe: "חיתוך", worker: "מסגר", hours: 0.4, costHour: 120, costSqm: 48, seq: 1 },
        { op: "Welding", opHe: "ריתוך", worker: "רתך מוסמך", hours: 0.8, costHour: 150, costSqm: 120, seq: 2 },
        { op: "Grinding", opHe: "שיוף", worker: "מסגר", hours: 0.3, costHour: 120, costSqm: 36, seq: 3 },
        { op: "Sandblasting", opHe: "ניקוי בחול", worker: "עובד ייצור", hours: 0.2, costHour: 100, costSqm: 20, seq: 4 },
        { op: "Painting", opHe: "צביעה", worker: "צבע", hours: 0.35, costHour: 130, costSqm: 45.5, seq: 5 },
        { op: "Assembly", opHe: "הרכבה", worker: "מרכיב", hours: 0.25, costHour: 130, costSqm: 32.5, seq: 6 },
      ];

      for (const lab of sitLabor) {
        await pool.query(
          `INSERT INTO bom_labor (bom_id, operation, operation_he, worker_type, hours_per_sqm, cost_per_hour, cost_per_sqm, sequence_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [bomId1, lab.op, lab.opHe, lab.worker, lab.hours, lab.costHour, lab.costSqm, lab.seq]
        );
      }
    }

    // מוצר 2: שער קלאסי
    const p2 = await pool.query(
      `INSERT INTO product_bom (product_id, product_name, product_name_he, product_code, category, description, description_he, default_width_mm, default_height_mm, base_price_per_sqm)
       VALUES (2, 'Classic Gate', 'שער קלאסי', 'GATE-CLS-001', 'gate', 'Classic ornamental iron gate with decorative scrolls', 'שער ברזל קלאסי עם עיטורי סלסולים', 3000, 1800, 1200)
       ON CONFLICT (product_code) DO NOTHING RETURNING id`,
      []
    );
    const bomId2 = p2.rows[0]?.id;

    if (bomId2) {
      const gateComponents = [
        { name: "Square tube 60x60x3", nameHe: "פרופיל מרובע 60x60x3", type: "iron_profile", profile: "60x60x3mm", qty: 4.0, unit: "מטר", waste: 5, cost: 52, costSqm: 218.40, supplier: "ברזל השרון" },
        { name: "Square tube 40x40x2", nameHe: "פרופיל מרובע 40x40x2", type: "iron_profile", profile: "40x40x2mm", qty: 5.5, unit: "מטר", waste: 7, cost: 28, costSqm: 164.78, supplier: "ברזל השרון" },
        { name: "Round bar 12mm", nameHe: "מוט עגול 12 מ\"מ", type: "iron_profile", profile: "12mm solid", qty: 10, unit: "מטר", waste: 8, cost: 9, costSqm: 97.20, supplier: "ברזל השרון" },
        { name: "Decorative scrolls", nameHe: "סלסולי עיטור", type: "accessory", profile: "S-scroll 150mm", qty: 6, unit: "יחידה", waste: 0, cost: 22, costSqm: 132.00, supplier: "עיטורי מתכת" },
        { name: "Gate hinges heavy duty", nameHe: "צירי שער כבדים", type: "hardware", profile: "Ø25 heavy", qty: 1.5, unit: "זוג", waste: 0, cost: 85, costSqm: 127.50, supplier: "חומרי בניין רמי" },
        { name: "Gate lock", nameHe: "מנעול שער", type: "hardware", profile: "תואם שער", qty: 0.2, unit: "יחידה", waste: 0, cost: 180, costSqm: 36.00, supplier: "חומרי בניין רמי" },
        { name: "Welding wire 1.2mm", nameHe: "חוט ריתוך 1.2 מ\"מ", type: "welding", profile: "MIG 1.2mm", qty: 0.25, unit: 'ק"ג', waste: 10, cost: 45, costSqm: 12.38, supplier: "רתכים בע\"מ" },
        { name: "Primer paint", nameHe: "צבע יסוד", type: "paint", profile: "אפוקסי", qty: 0.3, unit: "ליטר", waste: 5, cost: 35, costSqm: 11.03, supplier: "צבעי טמבור" },
        { name: "Top coat paint", nameHe: "צבע גמר", type: "paint", profile: "פוליאוריתן", qty: 0.35, unit: "ליטר", waste: 5, cost: 48, costSqm: 17.64, supplier: "צבעי טמבור" },
        { name: "Anchor bolts M12", nameHe: "בורגי עיגון M12", type: "hardware", profile: "M12x120", qty: 4, unit: "יחידה", waste: 0, cost: 5.5, costSqm: 22.00, supplier: "חומרי בניין רמי" },
      ];

      for (const comp of gateComponents) {
        await pool.query(
          `INSERT INTO bom_components (bom_id, material_name, material_name_he, material_type, profile_type, quantity_per_sqm, unit, waste_percentage, unit_cost, cost_per_sqm, supplier_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [bomId2, comp.name, comp.nameHe, comp.type, comp.profile, comp.qty, comp.unit, comp.waste, comp.cost, comp.costSqm, comp.supplier]
        );
      }

      const gateLabor = [
        { op: "Cutting", opHe: "חיתוך", worker: "מסגר", hours: 0.6, costHour: 120, costSqm: 72, seq: 1 },
        { op: "Bending/Scrollwork", opHe: "כיפוף וסלסולים", worker: "מסגר אומן", hours: 1.0, costHour: 170, costSqm: 170, seq: 2 },
        { op: "Welding", opHe: "ריתוך", worker: "רתך מוסמך", hours: 1.2, costHour: 150, costSqm: 180, seq: 3 },
        { op: "Grinding", opHe: "שיוף", worker: "מסגר", hours: 0.5, costHour: 120, costSqm: 60, seq: 4 },
        { op: "Painting", opHe: "צביעה", worker: "צבע", hours: 0.5, costHour: 130, costSqm: 65, seq: 5 },
        { op: "Hardware installation", opHe: "התקנת אביזרים", worker: "מרכיב", hours: 0.4, costHour: 130, costSqm: 52, seq: 6 },
      ];

      for (const lab of gateLabor) {
        await pool.query(
          `INSERT INTO bom_labor (bom_id, operation, operation_he, worker_type, hours_per_sqm, cost_per_hour, cost_per_sqm, sequence_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [bomId2, lab.op, lab.opHe, lab.worker, lab.hours, lab.costHour, lab.costSqm, lab.seq]
        );
      }
    }

    // מוצר 3: גדר מודרנית
    const p3 = await pool.query(
      `INSERT INTO product_bom (product_id, product_name, product_name_he, product_code, category, description, description_he, default_width_mm, default_height_mm, base_price_per_sqm)
       VALUES (3, 'Modern Fence', 'גדר מודרנית', 'FENCE-MOD-001', 'fence', 'Modern horizontal slat fence with clean lines', 'גדר מודרנית עם שלבים אופקיים וקווים נקיים', 2500, 1600, 750)
       ON CONFLICT (product_code) DO NOTHING RETURNING id`,
      []
    );
    const bomId3 = p3.rows[0]?.id;

    if (bomId3) {
      const fenceComponents = [
        { name: "Square tube 50x50x2.5", nameHe: "פרופיל מרובע 50x50x2.5", type: "iron_profile", profile: "50x50x2.5mm", qty: 2.5, unit: "מטר", waste: 5, cost: 38, costSqm: 99.75, supplier: "ברזל השרון" },
        { name: "Rect tube 100x20x2", nameHe: "פרופיל מלבני 100x20x2", type: "iron_profile", profile: "100x20x2mm", qty: 7.0, unit: "מטר", waste: 5, cost: 24, costSqm: 176.40, supplier: "ברזל השרון" },
        { name: "Flat bar 30x3", nameHe: "פס שטוח 30x3", type: "iron_profile", profile: "30x3mm", qty: 1.0, unit: "מטר", waste: 5, cost: 8, costSqm: 8.40, supplier: "מתכת פלוס" },
        { name: "Welding wire 1.0mm", nameHe: "חוט ריתוך 1.0 מ\"מ", type: "welding", profile: "MIG 1.0mm", qty: 0.12, unit: 'ק"ג', waste: 10, cost: 42, costSqm: 5.54, supplier: "רתכים בע\"מ" },
        { name: "Primer paint", nameHe: "צבע יסוד", type: "paint", profile: "אפוקסי", qty: 0.22, unit: "ליטר", waste: 5, cost: 35, costSqm: 8.09, supplier: "צבעי טמבור" },
        { name: "Powder coat", nameHe: "צביעה אלקטרוסטטית", type: "paint", profile: "RAL colors", qty: 0.3, unit: 'ק"ג', waste: 8, cost: 55, costSqm: 17.82, supplier: "ציפוי טק" },
        { name: "Post caps", nameHe: "כיפות לעמודים", type: "accessory", profile: "50x50 cap", qty: 1, unit: "יחידה", waste: 0, cost: 8, costSqm: 8.00, supplier: "חומרי בניין רמי" },
      ];

      for (const comp of fenceComponents) {
        await pool.query(
          `INSERT INTO bom_components (bom_id, material_name, material_name_he, material_type, profile_type, quantity_per_sqm, unit, waste_percentage, unit_cost, cost_per_sqm, supplier_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [bomId3, comp.name, comp.nameHe, comp.type, comp.profile, comp.qty, comp.unit, comp.waste, comp.cost, comp.costSqm, comp.supplier]
        );
      }

      const fenceLabor = [
        { op: "Cutting", opHe: "חיתוך", worker: "מסגר", hours: 0.35, costHour: 120, costSqm: 42, seq: 1 },
        { op: "Welding", opHe: "ריתוך", worker: "רתך מוסמך", hours: 0.6, costHour: 150, costSqm: 90, seq: 2 },
        { op: "Grinding", opHe: "שיוף", worker: "מסגר", hours: 0.2, costHour: 120, costSqm: 24, seq: 3 },
        { op: "Powder coating", opHe: "ציפוי אלקטרוסטטי", worker: "צבע", hours: 0.3, costHour: 130, costSqm: 39, seq: 4 },
        { op: "Quality check", opHe: "בדיקת איכות", worker: "מפקח", hours: 0.1, costHour: 140, costSqm: 14, seq: 5 },
      ];

      for (const lab of fenceLabor) {
        await pool.query(
          `INSERT INTO bom_labor (bom_id, operation, operation_he, worker_type, hours_per_sqm, cost_per_hour, cost_per_sqm, sequence_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [bomId3, lab.op, lab.opHe, lab.worker, lab.hours, lab.costHour, lab.costSqm, lab.seq]
        );
      }
    }

    // מוצר 4: פרגולת אלומיניום
    const p4 = await pool.query(
      `INSERT INTO product_bom (product_id, product_name, product_name_he, product_code, category, description, description_he, default_width_mm, default_height_mm, base_price_per_sqm)
       VALUES (4, 'Aluminum Pergola', 'פרגולת אלומיניום', 'PERG-ALU-001', 'pergola', 'Premium aluminum pergola with motorized louvers', 'פרגולת אלומיניום פרימיום עם תריסים ממונעים', 4000, 3000, 1800)
       ON CONFLICT (product_code) DO NOTHING RETURNING id`,
      []
    );
    const bomId4 = p4.rows[0]?.id;

    if (bomId4) {
      const pergolaComponents = [
        { name: "Aluminum column 150x150x3", nameHe: "עמוד אלומיניום 150x150x3", type: "aluminum_profile", profile: "150x150x3mm", qty: 0.8, unit: "מטר", waste: 3, cost: 120, costSqm: 98.88, supplier: "אלופרופיל" },
        { name: "Aluminum beam 200x100x3", nameHe: "קורת אלומיניום 200x100x3", type: "aluminum_profile", profile: "200x100x3mm", qty: 2.0, unit: "מטר", waste: 3, cost: 95, costSqm: 195.70, supplier: "אלופרופיל" },
        { name: "Louver blades 200x20", nameHe: "להבי תריס 200x20", type: "aluminum_profile", profile: "200x20mm", qty: 12, unit: "מטר", waste: 5, cost: 28, costSqm: 352.80, supplier: "אלופרופיל" },
        { name: "Motorized mechanism", nameHe: "מנגנון ממונע", type: "hardware", profile: "220V motor kit", qty: 0.08, unit: "יחידה", waste: 0, cost: 2200, costSqm: 176.00, supplier: "סומפי ישראל" },
        { name: "Rain gutter system", nameHe: "מערכת ניקוז גשם", type: "aluminum_profile", profile: "גוטר 80mm", qty: 1.5, unit: "מטר", waste: 5, cost: 35, costSqm: 55.13, supplier: "אלופרופיל" },
        { name: "SS fasteners kit", nameHe: "ערכת חיבורים נירוסטה", type: "hardware", profile: "A4 SS", qty: 15, unit: "יחידה", waste: 5, cost: 4.5, costSqm: 70.88, supplier: "חומרי בניין רמי" },
        { name: "LED strip lighting", nameHe: "תאורת LED רצועה", type: "accessory", profile: "IP65 warm", qty: 2.5, unit: "מטר", waste: 5, cost: 32, costSqm: 84.00, supplier: "לד שופ" },
        { name: "Aluminum powder coat", nameHe: "ציפוי אלומיניום", type: "paint", profile: "PVDF", qty: 0.4, unit: 'ק"ג', waste: 5, cost: 75, costSqm: 31.50, supplier: "ציפוי טק" },
        { name: "Sealant", nameHe: "חומר איטום", type: "sealant", profile: "סיליקון UV", qty: 0.3, unit: "שפופרת", waste: 5, cost: 45, costSqm: 14.18, supplier: "חומרי בניין רמי" },
      ];

      for (const comp of pergolaComponents) {
        await pool.query(
          `INSERT INTO bom_components (bom_id, material_name, material_name_he, material_type, profile_type, quantity_per_sqm, unit, waste_percentage, unit_cost, cost_per_sqm, supplier_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [bomId4, comp.name, comp.nameHe, comp.type, comp.profile, comp.qty, comp.unit, comp.waste, comp.cost, comp.costSqm, comp.supplier]
        );
      }

      const pergolaLabor = [
        { op: "Cutting & CNC", opHe: "חיתוך ו-CNC", worker: "מפעיל CNC", hours: 0.5, costHour: 160, costSqm: 80, seq: 1 },
        { op: "Assembly frame", opHe: "הרכבת שלד", worker: "מרכיב בכיר", hours: 0.8, costHour: 150, costSqm: 120, seq: 2 },
        { op: "Louver installation", opHe: "התקנת תריסים", worker: "מרכיב בכיר", hours: 0.6, costHour: 150, costSqm: 90, seq: 3 },
        { op: "Electrical wiring", opHe: "חיווט חשמלי", worker: "חשמלאי", hours: 0.3, costHour: 180, costSqm: 54, seq: 4 },
        { op: "Sealing & finishing", opHe: "איטום וגמר", worker: "עובד גמר", hours: 0.25, costHour: 120, costSqm: 30, seq: 5 },
        { op: "On-site installation", opHe: "התקנה באתר", worker: "צוות התקנה", hours: 0.7, costHour: 200, costSqm: 140, seq: 6 },
      ];

      for (const lab of pergolaLabor) {
        await pool.query(
          `INSERT INTO bom_labor (bom_id, operation, operation_he, worker_type, hours_per_sqm, cost_per_hour, cost_per_sqm, sequence_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [bomId4, lab.op, lab.opHe, lab.worker, lab.hours, lab.costHour, lab.costSqm, lab.seq]
        );
      }
    }

    // מוצר 5: מעקה זכוכית
    const p5 = await pool.query(
      `INSERT INTO product_bom (product_id, product_name, product_name_he, product_code, category, description, description_he, default_width_mm, default_height_mm, base_price_per_sqm)
       VALUES (5, 'Glass Balustrade', 'מעקה זכוכית', 'BAL-GLS-001', 'balustrade', 'Frameless glass balustrade with stainless steel top rail', 'מעקה זכוכית ללא מסגרת עם מאחז נירוסטה עליון', 1000, 1100, 1600)
       ON CONFLICT (product_code) DO NOTHING RETURNING id`,
      []
    );
    const bomId5 = p5.rows[0]?.id;

    if (bomId5) {
      const glassComponents = [
        { name: "Tempered glass 12mm", nameHe: "זכוכית מחוסמת 12 מ\"מ", type: "glass", profile: "12mm clear tempered", qty: 1.05, unit: "מ\"ר", waste: 3, cost: 320, costSqm: 345.60, supplier: "פניציה זכוכית" },
        { name: "SS top rail Ø50", nameHe: "מאחז נירוסטה Ø50", type: "stainless_steel", profile: "Ø50x2mm 316L", qty: 1.1, unit: "מטר", waste: 5, cost: 110, costSqm: 127.05, supplier: "נירוסטה ישראל" },
        { name: "SS glass clamps", nameHe: "תפסני זכוכית נירוסטה", type: "stainless_steel", profile: "316L clamp", qty: 4, unit: "יחידה", waste: 0, cost: 65, costSqm: 260.00, supplier: "נירוסטה ישראל" },
        { name: "SS base shoe", nameHe: "נעל בסיס נירוסטה", type: "stainless_steel", profile: "U-channel 316L", qty: 1.05, unit: "מטר", waste: 3, cost: 180, costSqm: 194.67, supplier: "נירוסטה ישראל" },
        { name: "Rubber gaskets", nameHe: "גומיות אטימה", type: "sealant", profile: "EPDM", qty: 2.2, unit: "מטר", waste: 5, cost: 12, costSqm: 27.72, supplier: "גומי פלוס" },
        { name: "Chemical anchors", nameHe: "עוגנים כימיים", type: "hardware", profile: "M12 chemical", qty: 3, unit: "יחידה", waste: 0, cost: 28, costSqm: 84.00, supplier: "חומרי בניין רמי" },
        { name: "SS polish compound", nameHe: "חומר פוליש נירוסטה", type: "accessory", profile: "mirror finish", qty: 0.05, unit: "ליטר", waste: 10, cost: 95, costSqm: 5.23, supplier: "נירוסטה ישראל" },
      ];

      for (const comp of glassComponents) {
        await pool.query(
          `INSERT INTO bom_components (bom_id, material_name, material_name_he, material_type, profile_type, quantity_per_sqm, unit, waste_percentage, unit_cost, cost_per_sqm, supplier_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [bomId5, comp.name, comp.nameHe, comp.type, comp.profile, comp.qty, comp.unit, comp.waste, comp.cost, comp.costSqm, comp.supplier]
        );
      }

      const glassLabor = [
        { op: "SS cutting & prep", opHe: "חיתוך והכנת נירוסטה", worker: "מסגר נירוסטה", hours: 0.4, costHour: 170, costSqm: 68, seq: 1 },
        { op: "SS welding & polish", opHe: "ריתוך ופוליש נירוסטה", worker: "רתך TIG", hours: 0.6, costHour: 180, costSqm: 108, seq: 2 },
        { op: "Glass measurement", opHe: "מדידת זכוכית", worker: "מודד", hours: 0.15, costHour: 140, costSqm: 21, seq: 3 },
        { op: "Base installation", opHe: "התקנת בסיס", worker: "מרכיב בכיר", hours: 0.5, costHour: 160, costSqm: 80, seq: 4 },
        { op: "Glass fitting", opHe: "התקנת זכוכית", worker: "מתקין זכוכית", hours: 0.45, costHour: 170, costSqm: 76.5, seq: 5 },
      ];

      for (const lab of glassLabor) {
        await pool.query(
          `INSERT INTO bom_labor (bom_id, operation, operation_he, worker_type, hours_per_sqm, cost_per_hour, cost_per_sqm, sequence_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [bomId5, lab.op, lab.opHe, lab.worker, lab.hours, lab.costHour, lab.costSqm, lab.seq]
        );
      }
    }

    // מוצר 6: דלת ברזל
    const p6 = await pool.query(
      `INSERT INTO product_bom (product_id, product_name, product_name_he, product_code, category, description, description_he, default_width_mm, default_height_mm, base_price_per_sqm)
       VALUES (6, 'Iron Door', 'דלת ברזל', 'DOOR-IRN-001', 'door', 'Decorative iron entry door with glass insert', 'דלת כניסה מברזל עם שקעית זכוכית', 1000, 2200, 2200)
       ON CONFLICT (product_code) DO NOTHING RETURNING id`,
      []
    );
    const bomId6 = p6.rows[0]?.id;

    if (bomId6) {
      const doorComponents = [
        { name: "Steel sheet 2mm", nameHe: "פח פלדה 2 מ\"מ", type: "iron_profile", profile: "2mm HR sheet", qty: 2.2, unit: "מ\"ר", waste: 8, cost: 85, costSqm: 201.96, supplier: "ברזל השרון" },
        { name: "Square tube 50x30x2", nameHe: "פרופיל מלבני 50x30x2", type: "iron_profile", profile: "50x30x2mm", qty: 6.0, unit: "מטר", waste: 5, cost: 22, costSqm: 138.60, supplier: "ברזל השרון" },
        { name: "Decorative panel", nameHe: "פאנל דקורטיבי", type: "iron_profile", profile: "CNC cut panel", qty: 0.5, unit: "מ\"ר", waste: 10, cost: 350, costSqm: 192.50, supplier: "עיטורי מתכת" },
        { name: "Insulated glass 6+12+6", nameHe: "זכוכית מבודדת 6+12+6", type: "glass", profile: "double glazed", qty: 0.25, unit: "מ\"ר", waste: 0, cost: 280, costSqm: 70.00, supplier: "פניציה זכוכית" },
        { name: "Multi-point lock", nameHe: "מנעול רב-נקודתי", type: "hardware", profile: "3-point lock", qty: 0.5, unit: "יחידה", waste: 0, cost: 450, costSqm: 225.00, supplier: "מנעולי יאל" },
        { name: "Heavy duty hinges", nameHe: "צירים כבדים", type: "hardware", profile: "3D adjustable", qty: 1.5, unit: "יחידה", waste: 0, cost: 120, costSqm: 180.00, supplier: "חומרי בניין רמי" },
        { name: "Door handle set", nameHe: "ידית דלת", type: "hardware", profile: "SS lever handle", qty: 0.5, unit: "ערכה", waste: 0, cost: 280, costSqm: 140.00, supplier: "מנעולי יאל" },
        { name: "Thermal insulation", nameHe: "בידוד תרמי", type: "accessory", profile: "PU foam", qty: 1.0, unit: "מ\"ר", waste: 5, cost: 45, costSqm: 47.25, supplier: "בידוד פלוס" },
        { name: "Weather seal", nameHe: "אטם מזג אוויר", type: "sealant", profile: "EPDM Q-lon", qty: 5.0, unit: "מטר", waste: 5, cost: 8, costSqm: 42.00, supplier: "גומי פלוס" },
        { name: "Primer + top coat", nameHe: "צבע יסוד + גמר", type: "paint", profile: "2K automotive", qty: 0.5, unit: "ליטר", waste: 5, cost: 85, costSqm: 44.63, supplier: "צבעי טמבור" },
      ];

      for (const comp of doorComponents) {
        await pool.query(
          `INSERT INTO bom_components (bom_id, material_name, material_name_he, material_type, profile_type, quantity_per_sqm, unit, waste_percentage, unit_cost, cost_per_sqm, supplier_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [bomId6, comp.name, comp.nameHe, comp.type, comp.profile, comp.qty, comp.unit, comp.waste, comp.cost, comp.costSqm, comp.supplier]
        );
      }

      const doorLabor = [
        { op: "Cutting & CNC", opHe: "חיתוך ו-CNC", worker: "מפעיל CNC", hours: 0.6, costHour: 160, costSqm: 96, seq: 1 },
        { op: "Welding frame", opHe: "ריתוך מסגרת", worker: "רתך מוסמך", hours: 1.0, costHour: 150, costSqm: 150, seq: 2 },
        { op: "Sheet bending", opHe: "כיפוף פח", worker: "מסגר", hours: 0.4, costHour: 130, costSqm: 52, seq: 3 },
        { op: "Insulation filling", opHe: "מילוי בידוד", worker: "עובד ייצור", hours: 0.2, costHour: 100, costSqm: 20, seq: 4 },
        { op: "Painting", opHe: "צביעה", worker: "צבע", hours: 0.5, costHour: 130, costSqm: 65, seq: 5 },
        { op: "Hardware & glass", opHe: "אביזרים וזכוכית", worker: "מרכיב בכיר", hours: 0.6, costHour: 150, costSqm: 90, seq: 6 },
      ];

      for (const lab of doorLabor) {
        await pool.query(
          `INSERT INTO bom_labor (bom_id, operation, operation_he, worker_type, hours_per_sqm, cost_per_hour, cost_per_sqm, sequence_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [bomId6, lab.op, lab.opHe, lab.worker, lab.hours, lab.costHour, lab.costSqm, lab.seq]
        );
      }
    }

    res.json({ success: true, message: "טבלאות BOM נוצרו בהצלחה ו-6 מוצרים נזרעו עם רכיבים ועבודה" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD מוצרים - יצירה
// ============================================================
router.post("/products", async (req: Request, res: Response) => {
  try {
    const {
      product_id, product_name, product_name_he, product_code, category,
      description, description_he, default_width_mm, default_height_mm, base_price_per_sqm,
      image_url, technical_drawing_url,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO product_bom (product_id, product_name, product_name_he, product_code, category, description, description_he, default_width_mm, default_height_mm, base_price_per_sqm, image_url, technical_drawing_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [product_id, product_name, product_name_he, product_code, category, description, description_he, default_width_mm, default_height_mm, base_price_per_sqm, image_url, technical_drawing_url]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD מוצרים - שליפת הכל
// ============================================================
router.get("/products", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM product_bom WHERE status = 'active' ORDER BY product_name`
    );
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD מוצרים - שליפת מוצר בודד
// ============================================================
router.get("/products/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM product_bom WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "מוצר לא נמצא" });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD מוצרים - עדכון
// ============================================================
router.put("/products/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const allowedFields = [
      "product_name", "product_name_he", "category", "description", "description_he",
      "default_width_mm", "default_height_mm", "base_price_per_sqm", "image_url",
      "technical_drawing_url", "status",
    ];

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: "לא נשלחו שדות לעדכון" });
    }

    setClauses.push(`updated_at = NOW()`);
    setClauses.push(`version = version + 1`);
    values.push(id);

    await pool.query(
      `UPDATE product_bom SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
      values
    );

    const result = await pool.query(`SELECT * FROM product_bom WHERE id = $1`, [id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD רכיבים - יצירה
// ============================================================
router.post("/components", async (req: Request, res: Response) => {
  try {
    const {
      bom_id, raw_material_id, material_name, material_name_he, material_type,
      profile_type, quantity_per_sqm, unit, waste_percentage, unit_cost, cost_per_sqm,
      supplier_id, supplier_name, is_optional, substitute_material_id, notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO bom_components (bom_id, raw_material_id, material_name, material_name_he, material_type, profile_type, quantity_per_sqm, unit, waste_percentage, unit_cost, cost_per_sqm, supplier_id, supplier_name, is_optional, substitute_material_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [bom_id, raw_material_id, material_name, material_name_he, material_type, profile_type, quantity_per_sqm, unit, waste_percentage || 5, unit_cost, cost_per_sqm, supplier_id, supplier_name, is_optional || false, substitute_material_id, notes]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD רכיבים - שליפת כל הרכיבים למוצר
// ============================================================
router.get("/components/:bomId", async (req: Request, res: Response) => {
  try {
    const { bomId } = req.params;
    const result = await pool.query(
      `SELECT * FROM bom_components WHERE bom_id = $1 ORDER BY material_type, material_name`,
      [bomId]
    );
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD רכיבים - עדכון
// ============================================================
router.put("/components/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const allowedFields = [
      "material_name", "material_name_he", "material_type", "profile_type",
      "quantity_per_sqm", "unit", "waste_percentage", "unit_cost", "cost_per_sqm",
      "supplier_id", "supplier_name", "is_optional", "substitute_material_id", "notes",
    ];

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    await pool.query(
      `UPDATE bom_components SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
      values
    );

    const result = await pool.query(`SELECT * FROM bom_components WHERE id = $1`, [id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD עבודה - יצירה
// ============================================================
router.post("/labor", async (req: Request, res: Response) => {
  try {
    const {
      bom_id, operation, operation_he, worker_type, hours_per_sqm,
      cost_per_hour, cost_per_sqm, sequence_order, notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO bom_labor (bom_id, operation, operation_he, worker_type, hours_per_sqm, cost_per_hour, cost_per_sqm, sequence_order, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [bom_id, operation, operation_he, worker_type, hours_per_sqm, cost_per_hour, cost_per_sqm, sequence_order, notes]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD עבודה - שליפה למוצר
// ============================================================
router.get("/labor/:bomId", async (req: Request, res: Response) => {
  try {
    const { bomId } = req.params;
    const result = await pool.query(
      `SELECT * FROM bom_labor WHERE bom_id = $1 ORDER BY sequence_order`,
      [bomId]
    );
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD עבודה - עדכון
// ============================================================
router.put("/labor/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const allowedFields = [
      "operation", "operation_he", "worker_type", "hours_per_sqm",
      "cost_per_hour", "cost_per_sqm", "sequence_order", "notes",
    ];

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    values.push(id);

    await pool.query(
      `UPDATE bom_labor SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
      values
    );

    const result = await pool.query(`SELECT * FROM bom_labor WHERE id = $1`, [id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// BOM מלא למוצר - חומרים, עבודה, עלויות
// ============================================================
router.get("/product/:id/full-bom", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await pool.query(`SELECT * FROM product_bom WHERE id = $1`, [id]);
    if (product.rows.length === 0) {
      return res.status(404).json({ success: false, error: "מוצר לא נמצא" });
    }

    const components = await pool.query(
      `SELECT * FROM bom_components WHERE bom_id = $1 ORDER BY material_type, material_name`,
      [id]
    );

    const labor = await pool.query(
      `SELECT * FROM bom_labor WHERE bom_id = $1 ORDER BY sequence_order`,
      [id]
    );

    const costSummary = await pool.query(
      `SELECT * FROM bom_cost_summary WHERE bom_id = $1 ORDER BY calculated_at DESC LIMIT 1`,
      [id]
    );

    // חישוב סכומי עלות
    const totalMaterialCost = components.rows.reduce(
      (sum: number, c: any) => sum + parseFloat(c.cost_per_sqm || 0), 0
    );
    const totalLaborCost = labor.rows.reduce(
      (sum: number, l: any) => sum + parseFloat(l.cost_per_sqm || 0), 0
    );

    res.json({
      success: true,
      data: {
        product: product.rows[0],
        components: components.rows,
        labor: labor.rows,
        cost_summary: costSummary.rows[0] || null,
        calculated_totals: {
          material_cost_per_sqm: Math.round(totalMaterialCost * 100) / 100,
          labor_cost_per_sqm: Math.round(totalLaborCost * 100) / 100,
          total_components: components.rows.length,
          total_operations: labor.rows.length,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// חישוב עלויות מחדש למוצר
// ============================================================
router.post("/product/:id/calculate-cost", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await pool.query(`SELECT * FROM product_bom WHERE id = $1`, [id]);
    if (product.rows.length === 0) {
      return res.status(404).json({ success: false, error: "מוצר לא נמצא" });
    }

    // חישוב עלות חומרים
    const components = await pool.query(
      `SELECT SUM(cost_per_sqm) as total FROM bom_components WHERE bom_id = $1`,
      [id]
    );
    const materialCost = parseFloat(components.rows[0].total || 0);

    // חישוב עלות עבודה
    const labor = await pool.query(
      `SELECT SUM(cost_per_sqm) as total FROM bom_labor WHERE bom_id = $1`,
      [id]
    );
    const laborCost = parseFloat(labor.rows[0].total || 0);

    // עלויות נוספות
    const overheadCost = materialCost * 0.08; // 8% תקורה
    const paintingCost = 55; // צביעה קבועה למ"ר
    const transportCost = 15; // הובלה קבועה למ"ר

    const totalCost = materialCost + laborCost + overheadCost + paintingCost + transportCost;
    const marginPct = 200; // מרווח 200% (פי 2)
    const suggestedPrice = totalCost * (marginPct / 100);
    const priceWithVat = suggestedPrice * (1 + VAT_RATE);

    // שמירת סיכום עלויות
    const result = await pool.query(
      `INSERT INTO bom_cost_summary (bom_id, material_cost_per_sqm, labor_cost_per_sqm, overhead_per_sqm, painting_cost_per_sqm, transport_cost_per_sqm, total_cost_per_sqm, margin_percentage, suggested_price_per_sqm, suggested_price_with_vat)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [id, materialCost, laborCost, Math.round(overheadCost * 100) / 100, paintingCost, transportCost, Math.round(totalCost * 100) / 100, marginPct, Math.round(suggestedPrice * 100) / 100, Math.round(priceWithVat * 100) / 100]
    );

    res.json({
      success: true,
      message: "עלויות חושבו מחדש",
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// פירוט עלויות - נתוני תרשים עוגה
// ============================================================
router.get("/product/:id/cost-breakdown", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // עלות חומרים
    const components = await pool.query(
      `SELECT SUM(cost_per_sqm) as total FROM bom_components WHERE bom_id = $1`,
      [id]
    );
    const materialCost = parseFloat(components.rows[0].total || 0);

    // עלות עבודה
    const labor = await pool.query(
      `SELECT SUM(cost_per_sqm) as total FROM bom_labor WHERE bom_id = $1`,
      [id]
    );
    const laborCost = parseFloat(labor.rows[0].total || 0);

    const overheadCost = materialCost * 0.08;
    const paintingCost = 55;
    const transportCost = 15;
    const totalCost = materialCost + laborCost + overheadCost + paintingCost + transportCost;

    // פירוט חומרים לפי סוג
    const materialBreakdown = await pool.query(
      `SELECT material_type, SUM(cost_per_sqm) as total_cost, COUNT(*) as count
       FROM bom_components WHERE bom_id = $1
       GROUP BY material_type ORDER BY total_cost DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        // נתוני עוגה ראשיים
        pie_chart: [
          { label: "חומרים", label_en: "Materials", value: Math.round(materialCost * 100) / 100, percentage: Math.round(materialCost / totalCost * 10000) / 100, color: "#4CAF50" },
          { label: "עבודה", label_en: "Labor", value: Math.round(laborCost * 100) / 100, percentage: Math.round(laborCost / totalCost * 10000) / 100, color: "#2196F3" },
          { label: "צביעה", label_en: "Painting", value: paintingCost, percentage: Math.round(paintingCost / totalCost * 10000) / 100, color: "#FF9800" },
          { label: "הובלה", label_en: "Transport", value: transportCost, percentage: Math.round(transportCost / totalCost * 10000) / 100, color: "#9C27B0" },
          { label: "תקורה", label_en: "Overhead", value: Math.round(overheadCost * 100) / 100, percentage: Math.round(overheadCost / totalCost * 10000) / 100, color: "#F44336" },
        ],
        total_cost_per_sqm: Math.round(totalCost * 100) / 100,
        material_breakdown: materialBreakdown.rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// מחשבון הצעת מחיר - לפי מוצר ומידות
// ============================================================
router.post("/quote-calculator", async (req: Request, res: Response) => {
  try {
    const { product_id, width_mm, height_mm, quantity, include_installation } = req.body;

    const product = await pool.query(`SELECT * FROM product_bom WHERE id = $1`, [product_id]);
    if (product.rows.length === 0) {
      return res.status(404).json({ success: false, error: "מוצר לא נמצא" });
    }

    const p = product.rows[0];
    const widthM = (width_mm || parseFloat(p.default_width_mm)) / 1000;
    const heightM = (height_mm || parseFloat(p.default_height_mm)) / 1000;
    const area = widthM * heightM;
    const qty = quantity || 1;

    // שליפת עלויות חומרים
    const components = await pool.query(
      `SELECT * FROM bom_components WHERE bom_id = $1`,
      [product_id]
    );

    // חישוב כמויות חומרים נדרשות
    const materialsNeeded = components.rows.map((c: any) => {
      const baseQty = parseFloat(c.quantity_per_sqm) * area * qty;
      const wasteMultiplier = 1 + (parseFloat(c.waste_percentage) / 100);
      const totalQty = baseQty * wasteMultiplier;
      const totalCost = totalQty * parseFloat(c.unit_cost);

      return {
        material_name: c.material_name,
        material_name_he: c.material_name_he,
        quantity_needed: Math.round(totalQty * 100) / 100,
        unit: c.unit,
        unit_cost: parseFloat(c.unit_cost),
        total_cost: Math.round(totalCost * 100) / 100,
      };
    });

    // סיכום עלויות
    const totalMaterialCost = materialsNeeded.reduce((sum: number, m: any) => sum + m.total_cost, 0);

    const laborResult = await pool.query(
      `SELECT SUM(cost_per_sqm) as total FROM bom_labor WHERE bom_id = $1`,
      [product_id]
    );
    const laborCostPerSqm = parseFloat(laborResult.rows[0].total || 0);
    const totalLaborCost = laborCostPerSqm * area * qty;

    const overheadCost = totalMaterialCost * 0.08;
    const paintingCost = 55 * area * qty;
    const transportCost = 15 * area * qty;
    const installationCost = include_installation ? 120 * area * qty : 0;

    const totalCost = totalMaterialCost + totalLaborCost + overheadCost + paintingCost + transportCost + installationCost;
    const suggestedPrice = totalCost * 2; // מרווח 200%
    const priceWithVat = suggestedPrice * (1 + VAT_RATE);

    res.json({
      success: true,
      data: {
        product: {
          name: p.product_name,
          name_he: p.product_name_he,
          code: p.product_code,
          category: p.category,
        },
        dimensions: {
          width_mm: widthM * 1000,
          height_mm: heightM * 1000,
          area_sqm: Math.round(area * 100) / 100,
          quantity: qty,
          total_area_sqm: Math.round(area * qty * 100) / 100,
        },
        materials_needed: materialsNeeded,
        cost_breakdown: {
          materials: Math.round(totalMaterialCost * 100) / 100,
          labor: Math.round(totalLaborCost * 100) / 100,
          overhead: Math.round(overheadCost * 100) / 100,
          painting: Math.round(paintingCost * 100) / 100,
          transport: Math.round(transportCost * 100) / 100,
          installation: Math.round(installationCost * 100) / 100,
          total_cost: Math.round(totalCost * 100) / 100,
        },
        pricing: {
          suggested_price: Math.round(suggestedPrice * 100) / 100,
          price_with_vat: Math.round(priceWithVat * 100) / 100,
          price_per_sqm: Math.round((suggestedPrice / (area * qty)) * 100) / 100,
          margin_percentage: 200,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// ניתוח רגישות מחיר - מה קורה אם חומר גלם עולה
// ============================================================
router.get("/price-sensitivity/:productId", async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    const product = await pool.query(`SELECT * FROM product_bom WHERE id = $1`, [productId]);
    if (product.rows.length === 0) {
      return res.status(404).json({ success: false, error: "מוצר לא נמצא" });
    }

    // עלויות נוכחיות
    const components = await pool.query(
      `SELECT material_type, SUM(cost_per_sqm) as total_cost
       FROM bom_components WHERE bom_id = $1
       GROUP BY material_type ORDER BY total_cost DESC`,
      [productId]
    );

    const totalMaterialCost = components.rows.reduce(
      (sum: number, c: any) => sum + parseFloat(c.total_cost), 0
    );

    // סימולציות עליית מחיר
    const scenarios = [
      { material: "iron_profile", nameHe: "ברזל", increase_pct: 10 },
      { material: "iron_profile", nameHe: "ברזל", increase_pct: 20 },
      { material: "aluminum_profile", nameHe: "אלומיניום", increase_pct: 15 },
      { material: "aluminum_profile", nameHe: "אלומיניום", increase_pct: 30 },
      { material: "glass", nameHe: "זכוכית", increase_pct: 10 },
      { material: "stainless_steel", nameHe: "נירוסטה", increase_pct: 15 },
      { material: "paint", nameHe: "צבע", increase_pct: 20 },
      { material: "hardware", nameHe: "אביזרים", increase_pct: 10 },
    ];

    const sensitivityResults = [];

    for (const scenario of scenarios) {
      const materialCost = components.rows.find(
        (c: any) => c.material_type === scenario.material
      );

      if (materialCost) {
        const currentCost = parseFloat(materialCost.total_cost);
        const increasedCost = currentCost * (1 + scenario.increase_pct / 100);
        const costDifference = increasedCost - currentCost;
        const newTotalMaterial = totalMaterialCost + costDifference;
        const totalImpactPct = (costDifference / totalMaterialCost) * 100;

        sensitivityResults.push({
          material_type: scenario.material,
          material_name_he: scenario.nameHe,
          price_increase_pct: scenario.increase_pct,
          current_cost_per_sqm: Math.round(currentCost * 100) / 100,
          new_cost_per_sqm: Math.round(increasedCost * 100) / 100,
          cost_difference: Math.round(costDifference * 100) / 100,
          total_material_impact_pct: Math.round(totalImpactPct * 100) / 100,
          new_total_material_cost: Math.round(newTotalMaterial * 100) / 100,
        });
      }
    }

    res.json({
      success: true,
      data: {
        product_name: product.rows[0].product_name_he,
        current_total_material_cost: Math.round(totalMaterialCost * 100) / 100,
        scenarios: sensitivityResults,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// השוואת עלויות בין מוצרים
// ============================================================
router.get("/products-comparison", async (req: Request, res: Response) => {
  try {
    const products = await pool.query(
      `SELECT p.*,
        (SELECT COALESCE(SUM(c.cost_per_sqm), 0) FROM bom_components c WHERE c.bom_id = p.id) as material_cost,
        (SELECT COALESCE(SUM(l.cost_per_sqm), 0) FROM bom_labor l WHERE l.bom_id = p.id) as labor_cost,
        (SELECT COUNT(*) FROM bom_components c WHERE c.bom_id = p.id) as component_count,
        (SELECT COUNT(*) FROM bom_labor l WHERE l.bom_id = p.id) as operation_count
       FROM product_bom p
       WHERE p.status = 'active'
       ORDER BY material_cost + labor_cost DESC`
    );

    const comparison = products.rows.map((p: any) => {
      const materialCost = parseFloat(p.material_cost);
      const laborCost = parseFloat(p.labor_cost);
      const overhead = materialCost * 0.08;
      const totalCost = materialCost + laborCost + overhead + 55 + 15; // + צביעה + הובלה

      return {
        product_name: p.product_name,
        product_name_he: p.product_name_he,
        category: p.category,
        material_cost_per_sqm: Math.round(materialCost * 100) / 100,
        labor_cost_per_sqm: Math.round(laborCost * 100) / 100,
        total_cost_per_sqm: Math.round(totalCost * 100) / 100,
        suggested_price_per_sqm: Math.round(totalCost * 2 * 100) / 100,
        component_count: parseInt(p.component_count),
        operation_count: parseInt(p.operation_count),
        material_to_labor_ratio: laborCost > 0 ? Math.round(materialCost / laborCost * 100) / 100 : 0,
      };
    });

    res.json({ success: true, data: comparison });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דשבורד BOM
// ============================================================
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    // כמות מוצרים
    const productCount = await pool.query(
      `SELECT COUNT(*) as total, category, COUNT(*) as count
       FROM product_bom WHERE status = 'active'
       GROUP BY category`
    );

    // עלות ממוצעת למ"ר
    const avgCost = await pool.query(
      `SELECT AVG(sub.total_cost) as avg_cost_per_sqm
       FROM (
         SELECT p.id,
           COALESCE((SELECT SUM(c.cost_per_sqm) FROM bom_components c WHERE c.bom_id = p.id), 0) +
           COALESCE((SELECT SUM(l.cost_per_sqm) FROM bom_labor l WHERE l.bom_id = p.id), 0) as total_cost
         FROM product_bom p WHERE p.status = 'active'
       ) sub`
    );

    // חומרים הכי יקרים
    const expensiveMaterials = await pool.query(
      `SELECT material_name_he, material_type, unit_cost, cost_per_sqm, supplier_name
       FROM bom_components
       ORDER BY cost_per_sqm DESC
       LIMIT 10`
    );

    // מוצרים הכי זולים
    const cheapestProducts = await pool.query(
      `SELECT p.product_name_he, p.category,
         COALESCE((SELECT SUM(c.cost_per_sqm) FROM bom_components c WHERE c.bom_id = p.id), 0) +
         COALESCE((SELECT SUM(l.cost_per_sqm) FROM bom_labor l WHERE l.bom_id = p.id), 0) as total_cost
       FROM product_bom p WHERE p.status = 'active'
       ORDER BY total_cost ASC
       LIMIT 5`
    );

    // סה"כ מוצרים
    const totalProducts = await pool.query(
      `SELECT COUNT(*) as total FROM product_bom WHERE status = 'active'`
    );

    res.json({
      success: true,
      dashboard: {
        total_products: parseInt(totalProducts.rows[0].total),
        products_by_category: productCount.rows,
        avg_cost_per_sqm: Math.round(parseFloat(avgCost.rows[0].avg_cost_per_sqm || 0) * 100) / 100,
        most_expensive_materials: expensiveMaterials.rows,
        cheapest_products: cheapestProducts.rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
