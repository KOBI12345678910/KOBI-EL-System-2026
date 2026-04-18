// ============================================================
// מנוע קטלוג מוצרים והצעות מחיר - מפעל מתכות/אלומיניום
// Product Catalog & Quote Generation Engine
// ============================================================

import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { OVERHEAD_RATE, PROFIT_MARGIN_RATE, VAT_RATE } from "../constants";

const router = Router();

// ============================================================
// אימות משתמש - Middleware
// ============================================================
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}
router.use(requireAuth as any);

// ============================================================
// פונקציית עזר לשאילתות SQL
// ============================================================
async function q(query: string, params?: any[]) {
  try {
    const r = await db.execute(sql.raw(query));
    return r.rows || [];
  } catch (e: any) {
    console.error("ProductQuoteEngine query error:", e.message, "\nQuery:", query.substring(0, 200));
    return [];
  }
}

// ============================================================
// POST /init - יצירת טבלאות וזריעת מוצרים
// ============================================================
router.post("/init", async (_req: Request, res: Response) => {
  try {
    // --- טבלת מוצרי מפעל ---
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS factory_products (
        id SERIAL PRIMARY KEY,
        product_code VARCHAR(50) UNIQUE,
        product_name VARCHAR(300),
        product_name_he VARCHAR(300),
        category VARCHAR(100),
        subcategory VARCHAR(100),
        material_type VARCHAR(50),
        description TEXT,
        description_he TEXT,
        base_price_per_sqm NUMERIC(15,2),
        min_price_per_sqm NUMERIC(15,2),
        max_price_per_sqm NUMERIC(15,2),
        production_time_days INTEGER,
        installation_time_hours INTEGER,
        bom_items JSONB DEFAULT '[]',
        features JSONB DEFAULT '[]',
        available_colors JSONB DEFAULT '[]',
        available_finishes JSONB DEFAULT '[]',
        dimensions_min JSONB,
        dimensions_max JSONB,
        weight_per_sqm NUMERIC(10,2),
        warranty_months INTEGER DEFAULT 12,
        image_url TEXT,
        gallery JSONB DEFAULT '[]',
        technical_drawing_url TEXT,
        certifications JSONB DEFAULT '[]',
        popularity_score INTEGER DEFAULT 0,
        total_sold INTEGER DEFAULT 0,
        total_revenue NUMERIC(15,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // --- טבלת תבניות הצעות מחיר ---
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS quote_templates (
        id SERIAL PRIMARY KEY,
        template_name VARCHAR(300),
        template_name_he VARCHAR(300),
        category VARCHAR(100),
        header_html TEXT,
        footer_html TEXT,
        terms_html TEXT,
        logo_url TEXT,
        company_details JSONB,
        design_theme VARCHAR(50) DEFAULT 'professional',
        colors JSONB DEFAULT '{}',
        font VARCHAR(100) DEFAULT 'Arial',
        include_photos BOOLEAN DEFAULT true,
        include_specs BOOLEAN DEFAULT true,
        include_warranty BOOLEAN DEFAULT true,
        include_payment_terms BOOLEAN DEFAULT true,
        is_default BOOLEAN DEFAULT false,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // --- טבלת היסטוריית הצעות מחיר ---
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS quote_history (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER,
        version INTEGER,
        changed_by VARCHAR,
        change_type VARCHAR(100),
        changes JSONB,
        previous_total NUMERIC(15,2),
        new_total NUMERIC(15,2),
        discount_changed BOOLEAN DEFAULT false,
        price_changed BOOLEAN DEFAULT false,
        items_changed BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // --- טבלת מעקב מחירי חומרי גלם ---
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS material_price_tracker (
        id SERIAL PRIMARY KEY,
        material_name VARCHAR(200),
        material_type VARCHAR(100),
        unit VARCHAR(50),
        current_price NUMERIC(15,2),
        previous_price NUMERIC(15,2),
        price_change_percent NUMERIC(5,2),
        supplier_id INTEGER,
        supplier_name VARCHAR(200),
        effective_date DATE,
        source VARCHAR(200),
        market_trend VARCHAR(20),
        price_history JSONB DEFAULT '[]',
        alert_threshold_percent NUMERIC(5,2) DEFAULT 10,
        notes TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // --- אינדקסים ---
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_factory_products_category ON factory_products(category)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_factory_products_material ON factory_products(material_type)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_factory_products_active ON factory_products(is_active)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_quote_history_quote_id ON quote_history(quote_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_material_price_tracker_type ON material_price_tracker(material_type)`));

    // ============================================================
    // זריעת מוצרי מפעל - 23 מוצרים
    // ============================================================
    const existingProducts = await q(`SELECT COUNT(*) as cnt FROM factory_products`);
    const cnt = parseInt((existingProducts[0] as any)?.cnt || "0");

    if (cnt === 0) {
      // --- מוצרי מפעל - שערים, גדרות, מעקות, סורגים, פרגולות, דלתות, קירות מסך, תריסים, מבני פלדה, מדרגות, ויטרינות ---
      const products = [
        // 1. שער חשמלי ברזל
        `('GTE-IRN-001', 'Electric Iron Gate', 'שער חשמלי ברזל', 'gates', 'electric', 'iron',
          'Premium electric iron gate with motor and remote control', 'שער חשמלי ברזל פרימיום עם מנוע ושלט רחוק',
          2800.00, 2200.00, 4500.00, 14, 8,
          '${JSON.stringify([{item:"iron_profiles",qty:25,unit:"kg"},{item:"motor_unit",qty:1,unit:"pc"},{item:"remote_kit",qty:1,unit:"pc"},{item:"paint",qty:2,unit:"liter"}])}',
          '${JSON.stringify(["חשמלי","שלט רחוק","חיישני בטיחות","נעילה אוטומטית"])}',
          '${JSON.stringify(["שחור","אפור גרפיט","חום חלודה","לבן"])}',
          '${JSON.stringify(["צביעה אלקטרוסטטית","גלוון חם","אנטי-חלודה"])}',
          '${JSON.stringify({width_cm:100,height_cm:150})}', '${JSON.stringify({width_cm:600,height_cm:250})}',
          35.0, 24, NULL, '[]', NULL, '${JSON.stringify(["ISO 9001","תו תקן ישראלי"])}',
          85, 120, 336000.00, true, 'מוצר פופולרי - שער חשמלי ברזל')`,

        // 2. שער חשמלי אלומיניום
        `('GTE-ALU-001', 'Electric Aluminum Gate', 'שער חשמלי אלומיניום', 'gates', 'electric', 'aluminum',
          'Modern electric aluminum gate with smart control', 'שער חשמלי אלומיניום מודרני עם שליטה חכמה',
          3200.00, 2600.00, 5200.00, 12, 6,
          '${JSON.stringify([{item:"aluminum_profiles",qty:20,unit:"kg"},{item:"motor_unit",qty:1,unit:"pc"},{item:"smart_remote",qty:1,unit:"pc"},{item:"powder_coat",qty:1.5,unit:"liter"}])}',
          '${JSON.stringify(["חשמלי","שלט חכם","WiFi","אפליקציה"])}',
          '${JSON.stringify(["לבן","אפור אנתרציט","שחור","בז׳","דמוי עץ"])}',
          '${JSON.stringify(["אנודייז","צביעה אלקטרוסטטית","דמוי עץ"])}',
          '${JSON.stringify({width_cm:100,height_cm:150})}', '${JSON.stringify({width_cm:600,height_cm:250})}',
          18.0, 24, NULL, '[]', NULL, '${JSON.stringify(["ISO 9001","תו תקן ישראלי"])}',
          92, 145, 464000.00, true, 'שער אלומיניום חשמלי - ביקוש גבוה')`,

        // 3. גדר ברזל
        `('FNC-IRN-001', 'Iron Fence', 'גדר ברזל', 'fences', 'standard', 'iron',
          'Decorative iron fence with various patterns', 'גדר ברזל דקורטיבית בדגמים שונים',
          850.00, 600.00, 1800.00, 7, 4,
          '${JSON.stringify([{item:"iron_bars",qty:15,unit:"kg"},{item:"welding_wire",qty:0.5,unit:"kg"},{item:"paint",qty:1,unit:"liter"},{item:"anchors",qty:4,unit:"pc"}])}',
          '${JSON.stringify(["דקורטיבי","עמיד בפני חלודה","התאמה אישית"])}',
          '${JSON.stringify(["שחור","אפור","חום","ירוק כהה"])}',
          '${JSON.stringify(["גלוון","צביעה","אנטי-חלודה"])}',
          '${JSON.stringify({width_cm:100,height_cm:60})}', '${JSON.stringify({width_cm:300,height_cm:200})}',
          28.0, 12, NULL, '[]', NULL, '${JSON.stringify(["תו תקן ישראלי"])}',
          70, 230, 195500.00, true, 'גדר ברזל - מוצר בסיסי')`,

        // 4. גדר אלומיניום
        `('FNC-ALU-001', 'Aluminum Fence', 'גדר אלומיניום', 'fences', 'standard', 'aluminum',
          'Lightweight aluminum fence, maintenance-free', 'גדר אלומיניום קלה ללא תחזוקה',
          1100.00, 800.00, 2200.00, 5, 3,
          '${JSON.stringify([{item:"aluminum_slats",qty:12,unit:"kg"},{item:"brackets",qty:6,unit:"pc"},{item:"screws",qty:20,unit:"pc"}])}',
          '${JSON.stringify(["קל משקל","ללא תחזוקה","עמיד UV"])}',
          '${JSON.stringify(["לבן","אפור","שחור","דמוי עץ","בז׳"])}',
          '${JSON.stringify(["אנודייז","צביעה אלקטרוסטטית"])}',
          '${JSON.stringify({width_cm:100,height_cm:60})}', '${JSON.stringify({width_cm:300,height_cm:200})}',
          12.0, 12, NULL, '[]', NULL, '${JSON.stringify(["ISO 9001"])}',
          78, 310, 341000.00, true, 'גדר אלומיניום - רב מכר')`,

        // 5. מעקה ברזל
        `('RLG-IRN-001', 'Iron Railing', 'מעקה ברזל', 'railings', 'standard', 'iron',
          'Classic iron railing for balconies and stairs', 'מעקה ברזל קלאסי למרפסות ומדרגות',
          1200.00, 900.00, 2500.00, 10, 5,
          '${JSON.stringify([{item:"iron_tubes",qty:18,unit:"kg"},{item:"handrail",qty:1,unit:"meter"},{item:"paint",qty:1.5,unit:"liter"},{item:"wall_brackets",qty:3,unit:"pc"}])}',
          '${JSON.stringify(["קלאסי","חזק","התאמה לכל גובה"])}',
          '${JSON.stringify(["שחור","לבן","אפור","זהב"])}',
          '${JSON.stringify(["צביעה","גלוון חם","פטינה"])}',
          '${JSON.stringify({width_cm:50,height_cm:90})}', '${JSON.stringify({width_cm:400,height_cm:110})}',
          30.0, 12, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 1142"])}',
          65, 180, 216000.00, true, 'מעקה ברזל - מוצר סטנדרטי')`,

        // 6. מעקה אלומיניום
        `('RLG-ALU-001', 'Aluminum Railing', 'מעקה אלומיניום', 'railings', 'standard', 'aluminum',
          'Modern aluminum railing, sleek design', 'מעקה אלומיניום מודרני בעיצוב נקי',
          1500.00, 1100.00, 3000.00, 7, 4,
          '${JSON.stringify([{item:"aluminum_profiles",qty:10,unit:"kg"},{item:"handrail_alu",qty:1,unit:"meter"},{item:"connectors",qty:6,unit:"pc"}])}',
          '${JSON.stringify(["מודרני","קל","ללא תחזוקה","עמיד UV"])}',
          '${JSON.stringify(["לבן","שחור","אפור אנתרציט","דמוי עץ"])}',
          '${JSON.stringify(["אנודייז","צביעה אלקטרוסטטית"])}',
          '${JSON.stringify({width_cm:50,height_cm:90})}', '${JSON.stringify({width_cm:400,height_cm:110})}',
          14.0, 24, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 1142","ISO 9001"])}',
          80, 250, 375000.00, true, 'מעקה אלומיניום - ביקוש גבוה')`,

        // 7. מעקה נירוסטה + זכוכית
        `('RLG-SSG-001', 'Stainless Steel + Glass Railing', 'מעקה נירוסטה + זכוכית', 'railings', 'premium', 'stainless_steel',
          'Premium stainless steel railing with tempered glass panels', 'מעקה נירוסטה פרימיום עם זכוכית מחוסמת',
          2800.00, 2200.00, 5000.00, 12, 6,
          '${JSON.stringify([{item:"stainless_posts",qty:8,unit:"kg"},{item:"tempered_glass",qty:1,unit:"sqm"},{item:"glass_clamps",qty:8,unit:"pc"},{item:"handrail_ss",qty:1,unit:"meter"}])}',
          '${JSON.stringify(["פרימיום","שקיפות","נירוסטה 316","זכוכית מחוסמת 10מ\"מ"])}',
          '${JSON.stringify(["נירוסטה מוברשת","נירוסטה מבריקה","שחור מט"])}',
          '${JSON.stringify(["סאטן","מראה","מוברש"])}',
          '${JSON.stringify({width_cm:50,height_cm:90})}', '${JSON.stringify({width_cm:400,height_cm:110})}',
          22.0, 36, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 1142","EN 12150"])}',
          88, 95, 266000.00, true, 'מעקה נירוסטה+זכוכית - מוצר יוקרתי')`,

        // 8. סורגים ברזל
        `('BRS-IRN-001', 'Iron Window Bars', 'סורגים ברזל', 'bars', 'security', 'iron',
          'Security iron bars for windows, fixed or removable', 'סורגים ברזל לחלונות - קבועים או נשלפים',
          650.00, 450.00, 1200.00, 5, 3,
          '${JSON.stringify([{item:"iron_bars_12mm",qty:10,unit:"kg"},{item:"frame_profile",qty:4,unit:"meter"},{item:"paint",qty:0.5,unit:"liter"}])}',
          '${JSON.stringify(["אבטחה","נשלף אופציונלי","תו תקן"])}',
          '${JSON.stringify(["שחור","לבן","אפור"])}',
          '${JSON.stringify(["צביעה","גלוון"])}',
          '${JSON.stringify({width_cm:40,height_cm:40})}', '${JSON.stringify({width_cm:200,height_cm:200})}',
          25.0, 12, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 1635"])}',
          60, 400, 260000.00, true, 'סורגים ברזל - מוצר ביטחוני')`,

        // 9. סורגים אלומיניום
        `('BRS-ALU-001', 'Aluminum Window Bars', 'סורגים אלומיניום', 'bars', 'security', 'aluminum',
          'Lightweight aluminum security bars', 'סורגים אלומיניום קלים לאבטחת חלונות',
          800.00, 600.00, 1500.00, 4, 2,
          '${JSON.stringify([{item:"aluminum_bars",qty:7,unit:"kg"},{item:"frame_alu",qty:4,unit:"meter"},{item:"screws",qty:12,unit:"pc"}])}',
          '${JSON.stringify(["קל","ללא חלודה","עיצוב מודרני"])}',
          '${JSON.stringify(["לבן","שחור","אפור","דמוי עץ"])}',
          '${JSON.stringify(["אנודייז","צביעה אלקטרוסטטית"])}',
          '${JSON.stringify({width_cm:40,height_cm:40})}', '${JSON.stringify({width_cm:200,height_cm:200})}',
          10.0, 12, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 1635"])}',
          72, 350, 280000.00, true, 'סורגים אלומיניום - רב מכר')`,

        // 10. פרגולה ברזל
        `('PRG-IRN-001', 'Iron Pergola', 'פרגולה ברזל', 'pergolas', 'outdoor', 'iron',
          'Sturdy iron pergola for gardens and terraces', 'פרגולה ברזל חזקה לגינות ומרפסות',
          1800.00, 1400.00, 3500.00, 14, 8,
          '${JSON.stringify([{item:"iron_beams",qty:40,unit:"kg"},{item:"cross_bars",qty:20,unit:"kg"},{item:"paint",qty:3,unit:"liter"},{item:"base_plates",qty:4,unit:"pc"}])}',
          '${JSON.stringify(["חזק","עמיד לרוח","התאמה אישית","אפשרות הצללה"])}',
          '${JSON.stringify(["שחור","לבן","אפור","חום"])}',
          '${JSON.stringify(["צביעה אלקטרוסטטית","גלוון חם"])}',
          '${JSON.stringify({width_cm:200,height_cm:220})}', '${JSON.stringify({width_cm:600,height_cm:350})}',
          40.0, 24, NULL, '[]', NULL, '${JSON.stringify(["ISO 9001"])}',
          55, 80, 144000.00, true, 'פרגולה ברזל - מוצר עונתי')`,

        // 11. פרגולה אלומיניום
        `('PRG-ALU-001', 'Aluminum Pergola', 'פרגולה אלומיניום', 'pergolas', 'outdoor', 'aluminum',
          'Modern aluminum pergola with optional motorized louvers', 'פרגולה אלומיניום מודרנית עם אופציה ללמלות חשמליות',
          3500.00, 2800.00, 7000.00, 10, 6,
          '${JSON.stringify([{item:"aluminum_beams",qty:25,unit:"kg"},{item:"louvers",qty:15,unit:"pc"},{item:"motor_optional",qty:1,unit:"pc"},{item:"drainage",qty:1,unit:"set"}])}',
          '${JSON.stringify(["מודרני","למלות מתכווננות","ניקוז מובנה","אופציה חשמלית"])}',
          '${JSON.stringify(["לבן","אפור אנתרציט","שחור","דמוי עץ"])}',
          '${JSON.stringify(["אנודייז","צביעה אלקטרוסטטית","דמוי עץ"])}',
          '${JSON.stringify({width_cm:200,height_cm:220})}', '${JSON.stringify({width_cm:800,height_cm:350})}',
          16.0, 36, NULL, '[]', NULL, '${JSON.stringify(["ISO 9001","CE"])}',
          90, 110, 385000.00, true, 'פרגולה אלומיניום - מוצר פרימיום')`,

        // 12. דלת כניסה ברזל
        `('DOR-IRN-001', 'Iron Entry Door', 'דלת כניסה ברזל', 'doors', 'entry', 'iron',
          'Decorative iron entry door with security features', 'דלת כניסה ברזל דקורטיבית עם מאפייני אבטחה',
          3500.00, 2800.00, 6000.00, 18, 6,
          '${JSON.stringify([{item:"iron_sheet",qty:30,unit:"kg"},{item:"frame",qty:15,unit:"kg"},{item:"lock_set",qty:1,unit:"pc"},{item:"hinges",qty:3,unit:"pc"},{item:"paint",qty:2,unit:"liter"}])}',
          '${JSON.stringify(["אבטחה","דקורטיבי","בידוד תרמי","מנעול רב-בריחי"])}',
          '${JSON.stringify(["שחור","חום","אפור","דמוי עץ"])}',
          '${JSON.stringify(["צביעה","פטינה","חלודה מבוקרת"])}',
          '${JSON.stringify({width_cm:80,height_cm:200})}', '${JSON.stringify({width_cm:140,height_cm:240})}',
          45.0, 24, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 23","ISO 9001"])}',
          68, 70, 245000.00, true, 'דלת כניסה ברזל - מוצר אבטחה')`,

        // 13. דלת כניסה אלומיניום
        `('DOR-ALU-001', 'Aluminum Entry Door', 'דלת כניסה אלומיניום', 'doors', 'entry', 'aluminum',
          'Modern aluminum entry door with thermal break', 'דלת כניסה אלומיניום מודרנית עם חיתוך תרמי',
          4200.00, 3500.00, 8000.00, 14, 5,
          '${JSON.stringify([{item:"aluminum_frame",qty:15,unit:"kg"},{item:"panel_fill",qty:1,unit:"sqm"},{item:"lock_multi",qty:1,unit:"pc"},{item:"thermal_break",qty:1,unit:"set"},{item:"seals",qty:4,unit:"meter"}])}',
          '${JSON.stringify(["חיתוך תרמי","בידוד אקוסטי","מנעול רב-בריחי","חסין פריצה"])}',
          '${JSON.stringify(["לבן","אפור אנתרציט","שחור","דמוי עץ אלון","דמוי עץ אגוז"])}',
          '${JSON.stringify(["אנודייז","צביעה אלקטרוסטטית","דמוי עץ"])}',
          '${JSON.stringify({width_cm:80,height_cm:200})}', '${JSON.stringify({width_cm:140,height_cm:240})}',
          22.0, 36, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 23","ISO 9001","CE"])}',
          82, 95, 399000.00, true, 'דלת כניסה אלומיניום - מוצר יוקרתי')`,

        // 14. קיר מסך אלומיניום + זכוכית
        `('CWT-ALG-001', 'Aluminum + Glass Curtain Wall', 'קיר מסך אלומיניום + זכוכית', 'curtain_walls', 'commercial', 'aluminum',
          'Commercial-grade aluminum curtain wall with insulated glass', 'קיר מסך אלומיניום לבנייני משרדים עם זכוכית מבודדת',
          4500.00, 3500.00, 8000.00, 30, 16,
          '${JSON.stringify([{item:"mullion_profiles",qty:8,unit:"kg/sqm"},{item:"transom_profiles",qty:5,unit:"kg/sqm"},{item:"double_glass",qty:1,unit:"sqm"},{item:"seals_epdm",qty:4,unit:"meter"},{item:"anchors_steel",qty:4,unit:"pc"}])}',
          '${JSON.stringify(["בידוד תרמי","אקוסטי","עמיד רוח","אטום מים","זכוכית בלגית"])}',
          '${JSON.stringify(["כסוף","אפור אנתרציט","שחור"])}',
          '${JSON.stringify(["אנודייז","צביעה PVDF"])}',
          '${JSON.stringify({width_cm:100,height_cm:100})}', '${JSON.stringify({width_cm:9999,height_cm:9999})}',
          35.0, 60, NULL, '[]', NULL, '${JSON.stringify(["EN 13830","תקן ישראלי 1039","ISO 9001"])}',
          75, 25, 112500.00, true, 'קיר מסך - פרויקטי בנייה גדולים')`,

        // 15. תריס אלומיניום
        `('SHT-ALU-001', 'Aluminum Shutter', 'תריס אלומיניום', 'shutters', 'standard', 'aluminum',
          'Standard aluminum roller shutter, manual operation', 'תריס אלומיניום גלילה סטנדרטי - הפעלה ידנית',
          950.00, 700.00, 1600.00, 5, 3,
          '${JSON.stringify([{item:"slats_aluminum",qty:6,unit:"kg"},{item:"side_guides",qty:2,unit:"meter"},{item:"axle",qty:1,unit:"pc"},{item:"strap_roller",qty:1,unit:"pc"}])}',
          '${JSON.stringify(["גלילה","ידני","בידוד","האפלה"])}',
          '${JSON.stringify(["לבן","אפור","בז׳","חום"])}',
          '${JSON.stringify(["צביעה אלקטרוסטטית"])}',
          '${JSON.stringify({width_cm:50,height_cm:50})}', '${JSON.stringify({width_cm:300,height_cm:250})}',
          8.0, 12, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 22"])}',
          73, 500, 475000.00, true, 'תריס אלומיניום - מוצר בסיסי')`,

        // 16. תריס חשמלי
        `('SHT-ELC-001', 'Electric Roller Shutter', 'תריס חשמלי', 'shutters', 'electric', 'aluminum',
          'Motorized aluminum roller shutter with remote/smart control', 'תריס אלומיניום חשמלי עם שלט/שליטה חכמה',
          1600.00, 1200.00, 2800.00, 7, 4,
          '${JSON.stringify([{item:"slats_aluminum",qty:6,unit:"kg"},{item:"side_guides",qty:2,unit:"meter"},{item:"tubular_motor",qty:1,unit:"pc"},{item:"remote_kit",qty:1,unit:"pc"},{item:"smart_switch",qty:1,unit:"pc"}])}',
          '${JSON.stringify(["חשמלי","שלט רחוק","WiFi אופציונלי","טיימר"])}',
          '${JSON.stringify(["לבן","אפור","בז׳","חום","אפור אנתרציט"])}',
          '${JSON.stringify(["צביעה אלקטרוסטטית"])}',
          '${JSON.stringify({width_cm:50,height_cm:50})}', '${JSON.stringify({width_cm:300,height_cm:250})}',
          9.0, 24, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 22","CE"])}',
          87, 380, 608000.00, true, 'תריס חשמלי - מוצר פופולרי מאוד')`,

        // 17. מבנה פלדה
        `('STL-STR-001', 'Steel Structure', 'מבנה פלדה', 'steel_structures', 'industrial', 'iron',
          'Industrial steel structure for warehouses and factories', 'מבנה פלדה תעשייתי למחסנים ומפעלים',
          1200.00, 800.00, 2500.00, 45, 40,
          '${JSON.stringify([{item:"steel_columns",qty:80,unit:"kg/sqm"},{item:"steel_beams",qty:50,unit:"kg/sqm"},{item:"purlins",qty:15,unit:"kg/sqm"},{item:"bracing",qty:10,unit:"kg/sqm"},{item:"bolts",qty:20,unit:"pc/sqm"}])}',
          '${JSON.stringify(["תעשייתי","עמיד רעידות","מוגן אש","התאמה אישית"])}',
          '${JSON.stringify(["גלוון","אפור","כחול","אדום"])}',
          '${JSON.stringify(["גלוון חם","צביעה תעשייתית","אנטי-אש"])}',
          '${JSON.stringify({width_cm:500,height_cm:400})}', '${JSON.stringify({width_cm:99999,height_cm:2000})}',
          155.0, 120, NULL, '[]', NULL, '${JSON.stringify(["ISO 9001","ISO 3834","תקן ישראלי 1225"])}',
          50, 15, 18000000.00, true, 'מבנה פלדה - פרויקטים גדולים')`,

        // 18. סככה
        `('STL-SHD-001', 'Steel Shade Structure', 'סככה', 'steel_structures', 'shade', 'iron',
          'Steel shade structure for parking and outdoor areas', 'סככת פלדה לחניון ושטחים פתוחים',
          800.00, 550.00, 1500.00, 14, 10,
          '${JSON.stringify([{item:"steel_columns",qty:30,unit:"kg"},{item:"roof_beams",qty:20,unit:"kg"},{item:"polycarbonate",qty:1,unit:"sqm"},{item:"paint",qty:2,unit:"liter"}])}',
          '${JSON.stringify(["הצללה","עמיד לרוח","פוליקרבונט","גלוון"])}',
          '${JSON.stringify(["גלוון","אפור","לבן","שחור"])}',
          '${JSON.stringify(["גלוון חם","צביעה"])}',
          '${JSON.stringify({width_cm:300,height_cm:250})}', '${JSON.stringify({width_cm:2000,height_cm:500})}',
          50.0, 24, NULL, '[]', NULL, '${JSON.stringify(["ISO 9001"])}',
          62, 60, 48000.00, true, 'סככה - מוצר עונתי')`,

        // 19. מדרגות ברזל
        `('STR-IRN-001', 'Iron Staircase', 'מדרגות ברזל', 'stairs', 'interior', 'iron',
          'Custom iron staircase with various design options', 'מדרגות ברזל בהתאמה אישית בעיצובים שונים',
          3200.00, 2500.00, 6000.00, 21, 12,
          '${JSON.stringify([{item:"steel_stringers",qty:40,unit:"kg"},{item:"treads",qty:14,unit:"pc"},{item:"railing",qty:4,unit:"meter"},{item:"paint",qty:3,unit:"liter"},{item:"anti_slip",qty:14,unit:"pc"}])}',
          '${JSON.stringify(["התאמה אישית","ישר/ספיראלי/U","אנטי-החלקה","מעקה משולב"])}',
          '${JSON.stringify(["שחור","לבן","אפור","חלודה מבוקרת"])}',
          '${JSON.stringify(["צביעה","חלודה מבוקרת","גלוון"])}',
          '${JSON.stringify({width_cm:60,height_cm:250})}', '${JSON.stringify({width_cm:150,height_cm:500})}',
          55.0, 36, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 1142","ISO 9001"])}',
          58, 45, 144000.00, true, 'מדרגות ברזל - מוצר מותאם אישית')`,

        // 20. ויטרינה אלומיניום + זכוכית
        `('VTR-ALG-001', 'Aluminum + Glass Storefront', 'ויטרינה אלומיניום + זכוכית', 'storefronts', 'commercial', 'aluminum',
          'Commercial aluminum storefront with laminated glass', 'ויטרינה אלומיניום לחנויות עם זכוכית שכבתית',
          2200.00, 1600.00, 4000.00, 14, 8,
          '${JSON.stringify([{item:"aluminum_frame",qty:10,unit:"kg/sqm"},{item:"laminated_glass",qty:1,unit:"sqm"},{item:"door_hardware",qty:1,unit:"set"},{item:"seals",qty:4,unit:"meter"}])}',
          '${JSON.stringify(["מסחרי","זכוכית בטיחותית","דלת משולבת","בידוד"])}',
          '${JSON.stringify(["כסוף","שחור","אפור אנתרציט"])}',
          '${JSON.stringify(["אנודייז","צביעה אלקטרוסטטית"])}',
          '${JSON.stringify({width_cm:100,height_cm:200})}', '${JSON.stringify({width_cm:1000,height_cm:400})}',
          20.0, 24, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 1039","ISO 9001"])}',
          66, 55, 121000.00, true, 'ויטרינה - מוצר מסחרי')`,

        // 21. שער הזזה ברזל
        `('GTS-IRN-001', 'Sliding Iron Gate', 'שער הזזה ברזל', 'gates', 'sliding', 'iron',
          'Heavy-duty sliding iron gate for driveways', 'שער הזזה ברזל כבד לכניסות רכב',
          3200.00, 2500.00, 5500.00, 16, 10,
          '${JSON.stringify([{item:"iron_frame",qty:35,unit:"kg"},{item:"track_rail",qty:1,unit:"set"},{item:"wheels",qty:4,unit:"pc"},{item:"motor_sliding",qty:1,unit:"pc"},{item:"paint",qty:2.5,unit:"liter"}])}',
          '${JSON.stringify(["הזזה","חשמלי","מסילה","עמיד"])}',
          '${JSON.stringify(["שחור","אפור","חום"])}',
          '${JSON.stringify(["צביעה אלקטרוסטטית","גלוון חם"])}',
          '${JSON.stringify({width_cm:200,height_cm:150})}', '${JSON.stringify({width_cm:800,height_cm:250})}',
          38.0, 24, NULL, '[]', NULL, '${JSON.stringify(["ISO 9001","תו תקן ישראלי"])}',
          77, 90, 288000.00, true, 'שער הזזה ברזל')`,

        // 22. מעקה זכוכית בלגית
        `('RLG-BLG-001', 'Belgian Glass Railing', 'מעקה זכוכית בלגית', 'railings', 'premium', 'glass',
          'Ultra-premium Belgian glass railing, frameless design', 'מעקה זכוכית בלגית פרימיום ללא מסגרת',
          3800.00, 3000.00, 6500.00, 14, 8,
          '${JSON.stringify([{item:"belgian_glass_12mm",qty:1,unit:"sqm"},{item:"base_channel",qty:1,unit:"meter"},{item:"glass_clamps_ss",qty:6,unit:"pc"},{item:"handrail_optional",qty:1,unit:"meter"}])}',
          '${JSON.stringify(["זכוכית בלגית 12מ\"מ","ללא מסגרת","שקיפות מלאה","יוקרתי"])}',
          '${JSON.stringify(["שקוף","חלבי","מעושן"])}',
          '${JSON.stringify(["מחוסם","שכבתי"])}',
          '${JSON.stringify({width_cm:50,height_cm:90})}', '${JSON.stringify({width_cm:400,height_cm:120})}',
          30.0, 60, NULL, '[]', NULL, '${JSON.stringify(["EN 12150","תקן ישראלי 1142","CE"])}',
          83, 40, 152000.00, true, 'מעקה זכוכית בלגית - מוצר יוקרה')`,

        // 23. חלון אלומיניום
        `('WND-ALU-001', 'Aluminum Window', 'חלון אלומיניום', 'windows', 'standard', 'aluminum',
          'Aluminum window with thermal break and double glazing', 'חלון אלומיניום עם חיתוך תרמי וזיגוג כפול',
          1400.00, 1000.00, 2800.00, 7, 3,
          '${JSON.stringify([{item:"window_frame_alu",qty:8,unit:"kg"},{item:"double_glass",qty:1,unit:"sqm"},{item:"hardware_set",qty:1,unit:"set"},{item:"seals",qty:4,unit:"meter"}])}',
          '${JSON.stringify(["חיתוך תרמי","זיגוג כפול","אטום מים","בידוד אקוסטי"])}',
          '${JSON.stringify(["לבן","אפור אנתרציט","שחור","דמוי עץ"])}',
          '${JSON.stringify(["אנודייז","צביעה אלקטרוסטטית"])}',
          '${JSON.stringify({width_cm:40,height_cm:40})}', '${JSON.stringify({width_cm:300,height_cm:250})}',
          12.0, 24, NULL, '[]', NULL, '${JSON.stringify(["תקן ישראלי 22","ISO 9001"])}',
          76, 420, 588000.00, true, 'חלון אלומיניום - מוצר בסיסי פופולרי')`
      ];

      // הכנסת כל המוצרים לטבלה
      for (const p of products) {
        await db.execute(sql.raw(`
          INSERT INTO factory_products (
            product_code, product_name, product_name_he, category, subcategory, material_type,
            description, description_he, base_price_per_sqm, min_price_per_sqm, max_price_per_sqm,
            production_time_days, installation_time_hours,
            bom_items, features, available_colors, available_finishes,
            dimensions_min, dimensions_max, weight_per_sqm, warranty_months,
            image_url, gallery, technical_drawing_url, certifications,
            popularity_score, total_sold, total_revenue, is_active, notes
          ) VALUES (${p})
          ON CONFLICT (product_code) DO NOTHING
        `));
      }
    }

    // --- זריעת תבנית הצעת מחיר ברירת מחדל ---
    const existingTemplates = await q(`SELECT COUNT(*) as cnt FROM quote_templates`);
    const tcnt = parseInt((existingTemplates[0] as any)?.cnt || "0");
    if (tcnt === 0) {
      await db.execute(sql.raw(`
        INSERT INTO quote_templates (template_name, template_name_he, category, header_html, footer_html, terms_html, logo_url,
          company_details, design_theme, colors, font, include_photos, include_specs, include_warranty, include_payment_terms, is_default, status)
        VALUES
        ('Professional Quote', 'הצעת מחיר מקצועית', 'general',
         '<div style="text-align:center"><h1>הצעת מחיר</h1></div>',
         '<div style="text-align:center"><p>תודה שבחרתם בנו!</p></div>',
         '<ul><li>הצעה בתוקף ל-30 יום</li><li>מע"מ אינו כלול</li><li>אחריות לפי המוצר</li><li>זמן אספקה לפי אישור הזמנה</li></ul>',
         NULL,
         '${JSON.stringify({name:"מפעל מתכת בע\"מ",address:"אזור תעשייה",phone:"03-1234567",email:"info@metal-factory.co.il",tax_id:"123456789"})}',
         'professional',
         '${JSON.stringify({primary:"#1a365d",secondary:"#2d3748",accent:"#e53e3e",background:"#ffffff"})}',
         'Arial', true, true, true, true, true, 'active'),
        ('Modern Minimal', 'מינימליסטי מודרני', 'premium',
         '<div style="border-bottom:3px solid #333"><h1 style="font-weight:300">QUOTE</h1></div>',
         '<div style="border-top:1px solid #eee;margin-top:20px;padding-top:10px"><small>Metal Factory Ltd.</small></div>',
         '<ol><li>הצעה בתוקף 14 יום</li><li>מחירים לא כוללים מע"מ</li><li>תנאי תשלום: שוטף+30</li></ol>',
         NULL,
         '${JSON.stringify({name:"Metal Factory Ltd.",address:"Industrial Zone",phone:"03-1234567",email:"quotes@metal-factory.co.il"})}',
         'minimal',
         '${JSON.stringify({primary:"#333333",secondary:"#666666",accent:"#0066cc",background:"#fafafa"})}',
         'Helvetica', false, true, true, true, false, 'active')
      `));
    }

    // --- זריעת מחירי חומרי גלם ---
    const existingMaterials = await q(`SELECT COUNT(*) as cnt FROM material_price_tracker`);
    const mcnt = parseInt((existingMaterials[0] as any)?.cnt || "0");
    if (mcnt === 0) {
      await db.execute(sql.raw(`
        INSERT INTO material_price_tracker (material_name, material_type, unit, current_price, previous_price, price_change_percent, supplier_name, effective_date, source, market_trend, price_history, alert_threshold_percent)
        VALUES
        ('פרופיל ברזל 40x40', 'iron', 'kg', 8.50, 7.80, 8.97, 'ברזל ישראל', CURRENT_DATE, 'שוק מקומי', 'up', '${JSON.stringify([{date:"2026-01-01",price:7.50},{date:"2026-02-01",price:7.80},{date:"2026-03-01",price:8.50}])}', 10),
        ('פרופיל אלומיניום 6063', 'aluminum', 'kg', 22.00, 20.50, 7.32, 'אלומיל', CURRENT_DATE, 'LME', 'up', '${JSON.stringify([{date:"2026-01-01",price:19.00},{date:"2026-02-01",price:20.50},{date:"2026-03-01",price:22.00}])}', 10),
        ('נירוסטה 316L', 'stainless_steel', 'kg', 35.00, 34.00, 2.94, 'מטלורג', CURRENT_DATE, 'שוק בינלאומי', 'stable', '${JSON.stringify([{date:"2026-01-01",price:33.50},{date:"2026-02-01",price:34.00},{date:"2026-03-01",price:35.00}])}', 10),
        ('זכוכית מחוסמת 10מ"מ', 'glass', 'sqm', 280.00, 265.00, 5.66, 'פניציה', CURRENT_DATE, 'שוק מקומי', 'up', '${JSON.stringify([{date:"2026-01-01",price:250.00},{date:"2026-02-01",price:265.00},{date:"2026-03-01",price:280.00}])}', 8),
        ('זכוכית בלגית 12מ"מ', 'belgian_glass', 'sqm', 450.00, 430.00, 4.65, 'AGC Belgium', CURRENT_DATE, 'יבוא', 'stable', '${JSON.stringify([{date:"2026-01-01",price:420.00},{date:"2026-02-01",price:430.00},{date:"2026-03-01",price:450.00}])}', 8),
        ('צבע אלקטרוסטטי', 'coating', 'liter', 85.00, 82.00, 3.66, 'טמבור', CURRENT_DATE, 'שוק מקומי', 'stable', '${JSON.stringify([{date:"2026-01-01",price:80.00},{date:"2026-02-01",price:82.00},{date:"2026-03-01",price:85.00}])}', 15),
        ('מנוע שער Somfy', 'motor', 'pc', 1200.00, 1150.00, 4.35, 'סומפי ישראל', CURRENT_DATE, 'יבוא', 'stable', '${JSON.stringify([{date:"2026-01-01",price:1100.00},{date:"2026-02-01",price:1150.00},{date:"2026-03-01",price:1200.00}])}', 10),
        ('מנוע תריס צינורי', 'motor', 'pc', 350.00, 340.00, 2.94, 'Nice', CURRENT_DATE, 'יבוא', 'stable', '${JSON.stringify([{date:"2026-01-01",price:330.00},{date:"2026-02-01",price:340.00},{date:"2026-03-01",price:350.00}])}', 10),
        ('בורג נירוסטה M10', 'fastener', 'pc', 2.50, 2.40, 4.17, 'חומרי בניין', CURRENT_DATE, 'שוק מקומי', 'stable', '[]', 20),
        ('פוליקרבונט 16מ"מ', 'polycarbonate', 'sqm', 180.00, 175.00, 2.86, 'פלסט-גל', CURRENT_DATE, 'שוק מקומי', 'stable', '${JSON.stringify([{date:"2026-01-01",price:170.00},{date:"2026-02-01",price:175.00},{date:"2026-03-01",price:180.00}])}', 10)
      `));
    }

    res.json({ success: true, message: "טבלאות מנוע הצעות מחיר אותחלו בהצלחה - כולל מוצרים, תבניות וחומרי גלם" });
  } catch (e: any) {
    console.error("Init error:", e);
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// קטלוג מוצרים - GET /products/catalog
// ============================================================
router.get("/products/catalog", async (req: Request, res: Response) => {
  try {
    const { category, material_type, subcategory, search, min_price, max_price, sort_by, sort_order, is_active, limit, offset } = req.query;

    let where = "WHERE 1=1";
    if (category) where += ` AND category = '${category}'`;
    if (material_type) where += ` AND material_type = '${material_type}'`;
    if (subcategory) where += ` AND subcategory = '${subcategory}'`;
    if (is_active !== undefined) where += ` AND is_active = ${is_active === 'true'}`;
    if (search) where += ` AND (product_name_he ILIKE '%${search}%' OR product_name ILIKE '%${search}%' OR description_he ILIKE '%${search}%')`;
    if (min_price) where += ` AND base_price_per_sqm >= ${min_price}`;
    if (max_price) where += ` AND base_price_per_sqm <= ${max_price}`;

    // מיון
    const validSorts = ["base_price_per_sqm", "popularity_score", "total_sold", "total_revenue", "product_name_he", "created_at"];
    const orderCol = validSorts.includes(sort_by as string) ? sort_by : "popularity_score";
    const orderDir = sort_order === "asc" ? "ASC" : "DESC";

    const lim = Math.min(parseInt(limit as string) || 50, 200);
    const off = parseInt(offset as string) || 0;

    // ספירה כוללת
    const countRows = await q(`SELECT COUNT(*) as total FROM factory_products ${where}`);
    const total = parseInt((countRows[0] as any)?.total || "0");

    // שליפת מוצרים
    const rows = await q(`
      SELECT * FROM factory_products ${where}
      ORDER BY ${orderCol} ${orderDir}
      LIMIT ${lim} OFFSET ${off}
    `);

    // קטגוריות ייחודיות - לפילטרים
    const categories = await q(`SELECT DISTINCT category FROM factory_products WHERE is_active = true ORDER BY category`);
    const materials = await q(`SELECT DISTINCT material_type FROM factory_products WHERE is_active = true ORDER BY material_type`);

    res.json({
      success: true,
      total,
      limit: lim,
      offset: off,
      filters: {
        categories: categories.map((r: any) => r.category),
        materials: materials.map((r: any) => r.material_type)
      },
      products: rows
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// פירוט עלויות מוצר - GET /products/:id/costing
// ============================================================
router.get("/products/:id/costing", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { area_sqm } = req.query; // שטח מבוקש

    // שליפת מוצר
    const rows = await q(`SELECT * FROM factory_products WHERE id = ${id}`);
    if (!rows.length) { res.status(404).json({ error: "מוצר לא נמצא" }); return; }

    const product = rows[0] as any;
    const area = parseFloat(area_sqm as string) || 1;

    // חישוב עלויות BOM
    const bomItems = product.bom_items || [];
    let totalMaterialCost = 0;
    const costBreakdown: any[] = [];

    for (const item of bomItems) {
      // ניסיון למצוא מחיר חומר גלם עדכני
      const materialRows = await q(`
        SELECT current_price, unit FROM material_price_tracker
        WHERE material_name ILIKE '%${item.item}%' OR material_type ILIKE '%${item.item}%'
        LIMIT 1
      `);

      const unitPrice = materialRows.length ? parseFloat((materialRows[0] as any).current_price) : 0;
      const qty = parseFloat(item.qty) * area;
      const lineCost = unitPrice * qty;
      totalMaterialCost += lineCost;

      costBreakdown.push({
        item: item.item,
        quantity: qty,
        unit: item.unit,
        unit_price: unitPrice,
        line_cost: Math.round(lineCost * 100) / 100,
        price_source: materialRows.length ? "מעקב מחירים" : "לא נמצא - יש לעדכן"
      });
    }

    // חישוב עלויות נוספות (הערכה)
    const laborCostPerHour = 120; // עלות שעת עבודה
    const productionHours = (product.production_time_days || 1) * 8;
    const installationHours = product.installation_time_hours || 0;
    const laborCost = (productionHours + installationHours) * laborCostPerHour;
    const overhead = (totalMaterialCost + laborCost) * OVERHEAD_RATE;
    const totalCost = totalMaterialCost + laborCost + overhead;
    const suggestedPrice = totalCost * (1 + PROFIT_MARGIN_RATE);
    const catalogPrice = product.base_price_per_sqm * area;

    res.json({
      success: true,
      product_id: product.id,
      product_name_he: product.product_name_he,
      area_sqm: area,
      cost_breakdown: {
        materials: costBreakdown,
        total_material_cost: Math.round(totalMaterialCost * 100) / 100,
        labor: {
          production_hours: productionHours,
          installation_hours: installationHours,
          rate_per_hour: laborCostPerHour,
          total_labor_cost: laborCost
        },
        overhead: {
          percent: overheadPercent * 100,
          amount: Math.round(overhead * 100) / 100
        },
        total_cost: Math.round(totalCost * 100) / 100,
        suggested_price: Math.round(suggestedPrice * 100) / 100,
        catalog_price: Math.round(catalogPrice * 100) / 100,
        profit_margin_percent: profitMarginPercent * 100,
        estimated_profit: Math.round((catalogPrice - totalCost) * 100) / 100,
        actual_margin_percent: Math.round(((catalogPrice - totalCost) / catalogPrice) * 10000) / 100
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// יצירת הצעת מחיר - POST /generate-quote
// ============================================================
router.post("/generate-quote", async (req: Request, res: Response) => {
  try {
    const {
      customer_name, customer_phone, customer_email, customer_address,
      items, // [{product_id, quantity, area_sqm, color, finish, custom_price, discount_percent, notes}]
      template_id,
      general_discount_percent,
      payment_terms,
      delivery_address,
      notes,
      valid_days
    } = req.body;

    if (!items || !items.length) {
      res.status(400).json({ error: "נדרש לפחות פריט אחד בהצעה" });
      return;
    }

    const user = (req as any).user;

    // שליפת תבנית
    let template: any = null;
    if (template_id) {
      const tRows = await q(`SELECT * FROM quote_templates WHERE id = ${template_id}`);
      template = tRows[0] || null;
    }
    if (!template) {
      const defRows = await q(`SELECT * FROM quote_templates WHERE is_default = true LIMIT 1`);
      template = defRows[0] || null;
    }

    // בניית פריטי הצעה
    const quoteItems: any[] = [];
    let subtotal = 0;

    for (const item of items) {
      const productRows = await q(`SELECT * FROM factory_products WHERE id = ${item.product_id}`);
      if (!productRows.length) continue;

      const product = productRows[0] as any;
      const area = parseFloat(item.area_sqm) || 1;
      const qty = parseInt(item.quantity) || 1;
      const unitPrice = item.custom_price || product.base_price_per_sqm;
      const lineTotal = unitPrice * area * qty;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const discountAmount = lineTotal * (discountPercent / 100);
      const lineNet = lineTotal - discountAmount;

      subtotal += lineNet;

      quoteItems.push({
        product_id: product.id,
        product_code: product.product_code,
        product_name_he: product.product_name_he,
        category: product.category,
        material_type: product.material_type,
        quantity: qty,
        area_sqm: area,
        unit_price: unitPrice,
        color: item.color || null,
        finish: item.finish || null,
        line_total: Math.round(lineTotal * 100) / 100,
        discount_percent: discountPercent,
        discount_amount: Math.round(discountAmount * 100) / 100,
        line_net: Math.round(lineNet * 100) / 100,
        production_time_days: product.production_time_days,
        installation_time_hours: product.installation_time_hours,
        warranty_months: product.warranty_months,
        features: product.features,
        notes: item.notes || ""
      });
    }

    // הנחה כללית
    const generalDiscount = parseFloat(general_discount_percent) || 0;
    const generalDiscountAmount = subtotal * (generalDiscount / 100);
    const totalBeforeVat = subtotal - generalDiscountAmount;
    const vatAmount = totalBeforeVat * VAT_RATE;
    const grandTotal = totalBeforeVat + vatAmount;

    // מספר הצעת מחיר
    const year = new Date().getFullYear();
    const lastQuote = await q(`SELECT quote_number FROM quote_history WHERE quote_id IS NOT NULL ORDER BY id DESC LIMIT 1`);
    // יצירת מספר ייחודי
    const quoteNumber = `Q-${year}-${String(Date.now()).slice(-6)}`;

    // זמן ייצור משוער (המקסימום מכל הפריטים)
    const maxProductionDays = Math.max(...quoteItems.map((i: any) => i.production_time_days || 0));
    const totalInstallationHours = quoteItems.reduce((sum: number, i: any) => sum + (i.installation_time_hours || 0), 0);

    // תוקף הצעה
    const validDays = parseInt(valid_days) || 30;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    // נתוני הצעת מחיר מלאה
    const quoteData = {
      quote_number: quoteNumber,
      date: new Date().toISOString(),
      valid_until: validUntil.toISOString(),
      valid_days: validDays,
      customer: {
        name: customer_name || "",
        phone: customer_phone || "",
        email: customer_email || "",
        address: customer_address || ""
      },
      items: quoteItems,
      summary: {
        items_count: quoteItems.length,
        subtotal: Math.round(subtotal * 100) / 100,
        general_discount_percent: generalDiscount,
        general_discount_amount: Math.round(generalDiscountAmount * 100) / 100,
        total_before_vat: Math.round(totalBeforeVat * 100) / 100,
        vat_rate: vatRate * 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        grand_total: Math.round(grandTotal * 100) / 100
      },
      production: {
        estimated_production_days: maxProductionDays,
        estimated_installation_hours: totalInstallationHours
      },
      payment_terms: payment_terms || "שוטף +30",
      delivery_address: delivery_address || customer_address || "",
      notes: notes || "",
      template: template ? {
        id: template.id,
        name: template.template_name_he,
        header_html: template.header_html,
        footer_html: template.footer_html,
        terms_html: template.terms_html,
        company_details: template.company_details,
        design_theme: template.design_theme,
        colors: template.colors,
        font: template.font,
        include_photos: template.include_photos,
        include_specs: template.include_specs,
        include_warranty: template.include_warranty,
        include_payment_terms: template.include_payment_terms
      } : null,
      created_by: user?.email || "system"
    };

    // שמירת גרסה ראשונה בהיסטוריה
    await db.execute(sql.raw(`
      INSERT INTO quote_history (quote_id, version, changed_by, change_type, changes, previous_total, new_total, notes)
      VALUES (0, 1, '${user?.email || "system"}', 'created', '${JSON.stringify(quoteData).replace(/'/g, "''")}', 0, ${grandTotal}, 'הצעת מחיר חדשה - ${quoteNumber}')
    `));

    // שליפת ID של הרשומה שנוצרה
    const lastInserted = await q(`SELECT id FROM quote_history ORDER BY id DESC LIMIT 1`);
    const historyId = (lastInserted[0] as any)?.id;

    // עדכון quote_id לרשומה עצמה
    if (historyId) {
      await db.execute(sql.raw(`UPDATE quote_history SET quote_id = ${historyId} WHERE id = ${historyId}`));
    }

    res.json({
      success: true,
      quote_number: quoteNumber,
      quote_history_id: historyId,
      quote: quoteData
    });
  } catch (e: any) {
    console.error("Generate quote error:", e);
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// היסטוריית גרסאות הצעה - GET /quote-versions/:quoteId
// ============================================================
router.get("/quote-versions/:quoteId", async (req: Request, res: Response) => {
  try {
    const { quoteId } = req.params;
    const rows = await q(`
      SELECT * FROM quote_history
      WHERE quote_id = ${quoteId}
      ORDER BY version ASC
    `);

    res.json({
      success: true,
      quote_id: parseInt(quoteId),
      total_versions: rows.length,
      versions: rows
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// מעקב שינוי מחיר חומר גלם - POST /track-price-change
// ============================================================
router.post("/track-price-change", async (req: Request, res: Response) => {
  try {
    const { material_id, new_price, source, notes } = req.body;

    if (!material_id || !new_price) {
      res.status(400).json({ error: "נדרש מזהה חומר ומחיר חדש" });
      return;
    }

    // שליפת מחיר נוכחי
    const rows = await q(`SELECT * FROM material_price_tracker WHERE id = ${material_id}`);
    if (!rows.length) { res.status(404).json({ error: "חומר לא נמצא" }); return; }

    const material = rows[0] as any;
    const oldPrice = parseFloat(material.current_price);
    const newPriceVal = parseFloat(new_price);
    const changePercent = ((newPriceVal - oldPrice) / oldPrice) * 100;

    // עדכון היסטוריית מחירים
    const priceHistory = material.price_history || [];
    priceHistory.push({
      date: new Date().toISOString().split("T")[0],
      price: newPriceVal,
      previous: oldPrice,
      change_percent: Math.round(changePercent * 100) / 100,
      source: source || "עדכון ידני"
    });

    // קביעת מגמה
    let trend = "stable";
    if (changePercent > 2) trend = "up";
    else if (changePercent < -2) trend = "down";

    await db.execute(sql.raw(`
      UPDATE material_price_tracker SET
        previous_price = ${oldPrice},
        current_price = ${newPriceVal},
        price_change_percent = ${Math.round(changePercent * 100) / 100},
        effective_date = CURRENT_DATE,
        source = '${(source || "עדכון ידני").replace(/'/g, "''")}',
        market_trend = '${trend}',
        price_history = '${JSON.stringify(priceHistory).replace(/'/g, "''")}',
        notes = '${(notes || "").replace(/'/g, "''")}',
        updated_at = NOW()
      WHERE id = ${material_id}
    `));

    // בדיקת התראה
    const alertThreshold = parseFloat(material.alert_threshold_percent) || 10;
    const isAlert = Math.abs(changePercent) >= alertThreshold;

    res.json({
      success: true,
      material_name: material.material_name,
      old_price: oldPrice,
      new_price: newPriceVal,
      change_percent: Math.round(changePercent * 100) / 100,
      trend,
      alert: isAlert,
      alert_message: isAlert ? `התראה! שינוי מחיר של ${Math.round(Math.abs(changePercent) * 100) / 100}% ב-${material.material_name}` : null
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// התראות מחירים - GET /price-alerts
// ============================================================
router.get("/price-alerts", async (req: Request, res: Response) => {
  try {
    const { threshold } = req.query;
    const minThreshold = parseFloat(threshold as string) || 5;

    const rows = await q(`
      SELECT * FROM material_price_tracker
      WHERE ABS(price_change_percent) >= ${minThreshold}
      ORDER BY ABS(price_change_percent) DESC
    `);

    // סיכום התראות
    const alerts = (rows as any[]).map((m: any) => ({
      id: m.id,
      material_name: m.material_name,
      material_type: m.material_type,
      current_price: m.current_price,
      previous_price: m.previous_price,
      change_percent: m.price_change_percent,
      trend: m.market_trend,
      supplier_name: m.supplier_name,
      effective_date: m.effective_date,
      alert_level: Math.abs(m.price_change_percent) >= 15 ? "critical" : Math.abs(m.price_change_percent) >= 10 ? "warning" : "info"
    }));

    res.json({
      success: true,
      threshold_percent: minThreshold,
      total_alerts: alerts.length,
      critical: alerts.filter((a: any) => a.alert_level === "critical").length,
      warnings: alerts.filter((a: any) => a.alert_level === "warning").length,
      alerts
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// סטטיסטיקות מוצרים - GET /product-statistics
// ============================================================
router.get("/product-statistics", async (req: Request, res: Response) => {
  try {
    // רבי מכר
    const bestSellers = await q(`
      SELECT id, product_code, product_name_he, category, material_type, total_sold, total_revenue, popularity_score
      FROM factory_products
      WHERE is_active = true
      ORDER BY total_sold DESC
      LIMIT 10
    `);

    // הכנסות לפי קטגוריה
    const revenueByCategory = await q(`
      SELECT category, COUNT(*) as product_count, SUM(total_sold) as total_units, SUM(total_revenue) as total_revenue,
             AVG(base_price_per_sqm) as avg_price
      FROM factory_products
      WHERE is_active = true
      GROUP BY category
      ORDER BY total_revenue DESC
    `);

    // הכנסות לפי חומר
    const revenueByMaterial = await q(`
      SELECT material_type, COUNT(*) as product_count, SUM(total_sold) as total_units, SUM(total_revenue) as total_revenue,
             AVG(base_price_per_sqm) as avg_price
      FROM factory_products
      WHERE is_active = true
      GROUP BY material_type
      ORDER BY total_revenue DESC
    `);

    // סיכום כללי
    const summary = await q(`
      SELECT
        COUNT(*) as total_products,
        COUNT(*) FILTER (WHERE is_active = true) as active_products,
        SUM(total_sold) as total_units_sold,
        SUM(total_revenue) as total_revenue,
        AVG(base_price_per_sqm) as avg_price_per_sqm,
        AVG(popularity_score) as avg_popularity
      FROM factory_products
    `);

    // מוצרים בעלי פופולריות גבוהה אך מכירות נמוכות (פוטנציאל)
    const potential = await q(`
      SELECT id, product_code, product_name_he, popularity_score, total_sold, base_price_per_sqm
      FROM factory_products
      WHERE is_active = true AND popularity_score > 70 AND total_sold < 50
      ORDER BY popularity_score DESC
      LIMIT 5
    `);

    // מגמות מחירי חומרים
    const materialTrends = await q(`
      SELECT material_name, material_type, current_price, price_change_percent, market_trend
      FROM material_price_tracker
      ORDER BY ABS(price_change_percent) DESC
    `);

    res.json({
      success: true,
      summary: summary[0],
      best_sellers: bestSellers,
      revenue_by_category: revenueByCategory,
      revenue_by_material: revenueByMaterial,
      high_potential_products: potential,
      material_price_trends: materialTrends
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// אופטימיזציית הצעה בעזרת AI - POST /ai-quote-optimize/:quoteId
// ============================================================
router.post("/ai-quote-optimize/:quoteId", async (req: Request, res: Response) => {
  try {
    const { quoteId } = req.params;
    const { target_margin, max_discount, strategy } = req.body;
    // strategy: "maximize_margin" | "competitive_pricing" | "win_deal"

    // שליפת הצעה מההיסטוריה
    const historyRows = await q(`
      SELECT * FROM quote_history WHERE quote_id = ${quoteId} ORDER BY version DESC LIMIT 1
    `);
    if (!historyRows.length) { res.status(404).json({ error: "הצעת מחיר לא נמצאה" }); return; }

    const quoteHistory = historyRows[0] as any;
    const quoteData = quoteHistory.changes || {};
    const items = quoteData.items || [];

    if (!items.length) {
      res.status(400).json({ error: "לא נמצאו פריטים בהצעה" });
      return;
    }

    const targetMarginPct = parseFloat(target_margin) || 25;
    const maxDiscountPct = parseFloat(max_discount) || 15;
    const strat = strategy || "maximize_margin";

    // ניתוח כל פריט וחישוב אופטימיזציה
    const optimizedItems: any[] = [];
    let originalTotal = 0;
    let optimizedTotal = 0;

    for (const item of items) {
      const productRows = await q(`SELECT * FROM factory_products WHERE id = ${item.product_id}`);
      const product = productRows[0] as any;

      if (!product) {
        optimizedItems.push({ ...item, optimization: "מוצר לא נמצא" });
        continue;
      }

      const originalLineNet = item.line_net || 0;
      originalTotal += originalLineNet;

      // חישוב עלות משוערת (60-70% ממחיר קטלוג כהערכה)
      const estimatedCostRatio = strat === "win_deal" ? 0.70 : strat === "competitive_pricing" ? 0.65 : 0.60;
      const estimatedCost = item.unit_price * (item.area_sqm || 1) * (item.quantity || 1) * estimatedCostRatio;

      // חישוב מחיר אופטימלי לפי אסטרטגיה
      let optimalPrice = 0;
      let suggestedDiscount = 0;
      let recommendation = "";

      switch (strat) {
        case "maximize_margin":
          // מקסום רווח - מינימום הנחה, מחיר גבוה
          optimalPrice = estimatedCost * (1 + targetMarginPct / 100);
          suggestedDiscount = Math.max(0, Math.min(item.discount_percent || 0, 5));
          recommendation = `מומלץ לשמור על מחיר גבוה. רווח משוער: ${targetMarginPct}%`;
          break;

        case "competitive_pricing":
          // תמחור תחרותי - הנחה מתונה
          optimalPrice = estimatedCost * (1 + (targetMarginPct * 0.8) / 100);
          suggestedDiscount = Math.min(maxDiscountPct, 10);
          recommendation = `תמחור תחרותי עם הנחה של ${suggestedDiscount}%. רווח משוער: ${Math.round(targetMarginPct * 0.8)}%`;
          break;

        case "win_deal":
          // סגירת עסקה - הנחה אגרסיבית
          optimalPrice = estimatedCost * (1 + (targetMarginPct * 0.6) / 100);
          suggestedDiscount = Math.min(maxDiscountPct, 15);
          recommendation = `הנחה אגרסיבית ${suggestedDiscount}% לסגירת עסקה. רווח מינימלי: ${Math.round(targetMarginPct * 0.6)}%`;
          break;
      }

      const optimizedLineNet = optimalPrice * (1 - suggestedDiscount / 100);
      optimizedTotal += optimizedLineNet;

      // ניתוח פופולריות - אם מוצר פופולרי, פחות הנחה
      if (product.popularity_score > 80) {
        suggestedDiscount = Math.max(0, suggestedDiscount - 3);
        recommendation += ` | מוצר בביקוש גבוה (${product.popularity_score}) - מומלץ הנחה מצומצמת`;
      }

      // ניתוח עונתיות - פרגולות בקיץ שווים יותר
      const month = new Date().getMonth();
      if (product.category === "pergolas" && month >= 3 && month <= 8) {
        recommendation += " | עונת שיא לפרגולות - ניתן להעלות מחיר";
      }

      optimizedItems.push({
        product_id: item.product_id,
        product_name_he: item.product_name_he,
        original_price: item.unit_price,
        original_discount: item.discount_percent,
        original_line_net: originalLineNet,
        optimized_price: Math.round(optimalPrice * 100) / 100,
        suggested_discount: suggestedDiscount,
        optimized_line_net: Math.round(optimizedLineNet * 100) / 100,
        estimated_cost: Math.round(estimatedCost * 100) / 100,
        estimated_margin_percent: Math.round(((optimizedLineNet - estimatedCost) / optimizedLineNet) * 10000) / 100,
        recommendation
      });
    }

    // סיכום אופטימיזציה
    const generalDiscount = quoteData.summary?.general_discount_percent || 0;
    const optimizedBeforeVat = optimizedTotal * (1 - generalDiscount / 100);
    const optimizedGrandTotal = optimizedBeforeVat * (1 + VAT_RATE);

    res.json({
      success: true,
      quote_id: parseInt(quoteId),
      strategy: strat,
      target_margin_percent: targetMarginPct,
      max_discount_percent: maxDiscountPct,
      original_total: Math.round(originalTotal * 100) / 100,
      optimized_total: Math.round(optimizedTotal * 100) / 100,
      optimized_grand_total: Math.round(optimizedGrandTotal * 100) / 100,
      savings_or_increase: Math.round((optimizedTotal - originalTotal) * 100) / 100,
      optimized_items: optimizedItems,
      ai_recommendations: [
        strat === "maximize_margin" ? "אסטרטגיית מקסום רווח - מתאימה ללקוחות חוזרים ומוצרים ייחודיים" : null,
        strat === "competitive_pricing" ? "תמחור תחרותי - מתאים לשוק תחרותי עם מתחרים רבים" : null,
        strat === "win_deal" ? "אסטרטגיית סגירת עסקה - מתאימה לפרויקטים גדולים ולקוחות חדשים" : null,
        items.length > 3 ? "טיפ: הצעה עם מספר פריטים - שקלו הנחת כמות" : null,
        "מומלץ לבדוק מחירי חומרי גלם עדכניים לפני שליחת ההצעה"
      ].filter(Boolean)
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// CRUD - מוצרי מפעל (factory_products)
// ============================================================

// שליפת כל המוצרים
router.get("/factory-products", async (_req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM factory_products ORDER BY popularity_score DESC`);
    res.json({ success: true, total: rows.length, data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// שליפת מוצר בודד
router.get("/factory-products/:id", async (req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM factory_products WHERE id = ${req.params.id}`);
    if (!rows.length) { res.status(404).json({ error: "מוצר לא נמצא" }); return; }
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// יצירת מוצר חדש
router.post("/factory-products", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const cols = Object.keys(b).join(", ");
    const vals = Object.values(b).map((v: any) =>
      v === null ? "NULL" : typeof v === "object" ? `'${JSON.stringify(v).replace(/'/g, "''")}'` : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : v
    ).join(", ");

    await db.execute(sql.raw(`INSERT INTO factory_products (${cols}) VALUES (${vals})`));
    const rows = await q(`SELECT * FROM factory_products ORDER BY id DESC LIMIT 1`);
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// עדכון מוצר
router.put("/factory-products/:id", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const sets = Object.entries(b).map(([k, v]: [string, any]) =>
      v === null ? `${k} = NULL` : typeof v === "object" ? `${k} = '${JSON.stringify(v).replace(/'/g, "''")}'` : typeof v === "string" ? `${k} = '${v.replace(/'/g, "''")}'` : `${k} = ${v}`
    ).join(", ");

    await db.execute(sql.raw(`UPDATE factory_products SET ${sets}, updated_at = NOW() WHERE id = ${req.params.id}`));
    const rows = await q(`SELECT * FROM factory_products WHERE id = ${req.params.id}`);
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// מחיקה רכה - סימון כלא פעיל
router.delete("/factory-products/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql.raw(`UPDATE factory_products SET is_active = false, updated_at = NOW() WHERE id = ${req.params.id}`));
    res.json({ success: true, message: "מוצר סומן כלא פעיל" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


// ============================================================
// CRUD - תבניות הצעות מחיר (quote_templates)
// ============================================================

router.get("/quote-templates", async (_req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM quote_templates ORDER BY is_default DESC, id ASC`);
    res.json({ success: true, total: rows.length, data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/quote-templates/:id", async (req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM quote_templates WHERE id = ${req.params.id}`);
    if (!rows.length) { res.status(404).json({ error: "תבנית לא נמצאה" }); return; }
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/quote-templates", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const cols = Object.keys(b).join(", ");
    const vals = Object.values(b).map((v: any) =>
      v === null ? "NULL" : typeof v === "object" ? `'${JSON.stringify(v).replace(/'/g, "''")}'` : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : v
    ).join(", ");

    await db.execute(sql.raw(`INSERT INTO quote_templates (${cols}) VALUES (${vals})`));
    const rows = await q(`SELECT * FROM quote_templates ORDER BY id DESC LIMIT 1`);
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/quote-templates/:id", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const sets = Object.entries(b).map(([k, v]: [string, any]) =>
      v === null ? `${k} = NULL` : typeof v === "object" ? `${k} = '${JSON.stringify(v).replace(/'/g, "''")}'` : typeof v === "string" ? `${k} = '${v.replace(/'/g, "''")}'` : `${k} = ${v}`
    ).join(", ");

    await db.execute(sql.raw(`UPDATE quote_templates SET ${sets}, updated_at = NOW() WHERE id = ${req.params.id}`));
    const rows = await q(`SELECT * FROM quote_templates WHERE id = ${req.params.id}`);
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/quote-templates/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql.raw(`UPDATE quote_templates SET status = 'archived', updated_at = NOW() WHERE id = ${req.params.id}`));
    res.json({ success: true, message: "תבנית הועברה לארכיון" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


// ============================================================
// CRUD - היסטוריית הצעות מחיר (quote_history)
// ============================================================

router.get("/quote-history", async (req: Request, res: Response) => {
  try {
    const { limit, offset, change_type } = req.query;
    let where = "WHERE 1=1";
    if (change_type) where += ` AND change_type = '${change_type}'`;
    const lim = Math.min(parseInt(limit as string) || 50, 200);
    const off = parseInt(offset as string) || 0;

    const rows = await q(`SELECT * FROM quote_history ${where} ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`);
    const countRows = await q(`SELECT COUNT(*) as total FROM quote_history ${where}`);
    res.json({ success: true, total: parseInt((countRows[0] as any)?.total || "0"), data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/quote-history/:id", async (req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM quote_history WHERE id = ${req.params.id}`);
    if (!rows.length) { res.status(404).json({ error: "רשומת היסטוריה לא נמצאה" }); return; }
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/quote-history", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const cols = Object.keys(b).join(", ");
    const vals = Object.values(b).map((v: any) =>
      v === null ? "NULL" : typeof v === "object" ? `'${JSON.stringify(v).replace(/'/g, "''")}'` : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : v
    ).join(", ");

    await db.execute(sql.raw(`INSERT INTO quote_history (${cols}) VALUES (${vals})`));
    const rows = await q(`SELECT * FROM quote_history ORDER BY id DESC LIMIT 1`);
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/quote-history/:id", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const sets = Object.entries(b).map(([k, v]: [string, any]) =>
      v === null ? `${k} = NULL` : typeof v === "object" ? `${k} = '${JSON.stringify(v).replace(/'/g, "''")}'` : typeof v === "string" ? `${k} = '${v.replace(/'/g, "''")}'` : `${k} = ${v}`
    ).join(", ");

    await db.execute(sql.raw(`UPDATE quote_history SET ${sets} WHERE id = ${req.params.id}`));
    const rows = await q(`SELECT * FROM quote_history WHERE id = ${req.params.id}`);
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


// ============================================================
// CRUD - מעקב מחירי חומרים (material_price_tracker)
// ============================================================

router.get("/material-prices", async (_req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM material_price_tracker ORDER BY material_type, material_name`);
    res.json({ success: true, total: rows.length, data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/material-prices/:id", async (req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM material_price_tracker WHERE id = ${req.params.id}`);
    if (!rows.length) { res.status(404).json({ error: "חומר לא נמצא" }); return; }
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/material-prices", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const cols = Object.keys(b).join(", ");
    const vals = Object.values(b).map((v: any) =>
      v === null ? "NULL" : typeof v === "object" ? `'${JSON.stringify(v).replace(/'/g, "''")}'` : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : v
    ).join(", ");

    await db.execute(sql.raw(`INSERT INTO material_price_tracker (${cols}) VALUES (${vals})`));
    const rows = await q(`SELECT * FROM material_price_tracker ORDER BY id DESC LIMIT 1`);
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/material-prices/:id", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const sets = Object.entries(b).map(([k, v]: [string, any]) =>
      v === null ? `${k} = NULL` : typeof v === "object" ? `${k} = '${JSON.stringify(v).replace(/'/g, "''")}'` : typeof v === "string" ? `${k} = '${v.replace(/'/g, "''")}'` : `${k} = ${v}`
    ).join(", ");

    await db.execute(sql.raw(`UPDATE material_price_tracker SET ${sets}, updated_at = NOW() WHERE id = ${req.params.id}`));
    const rows = await q(`SELECT * FROM material_price_tracker WHERE id = ${req.params.id}`);
    res.json({ success: true, data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/material-prices/:id", async (req: Request, res: Response) => {
  try {
    // מחיקה רכה - עדכון הערה שהחומר לא פעיל
    await db.execute(sql.raw(`UPDATE material_price_tracker SET notes = COALESCE(notes, '') || ' [לא פעיל]', updated_at = NOW() WHERE id = ${req.params.id}`));
    res.json({ success: true, message: "חומר סומן כלא פעיל" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


export default router;
