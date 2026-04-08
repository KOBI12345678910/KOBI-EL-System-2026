/**
 * =============================================================================
 * מנוע תמחור פרויקטים מתקדם - מפעל מתכת/אלומיניום
 * =============================================================================
 *
 * מנוע תמחור מקיף לפרויקטים של:
 * שערים, גדרות, סורגים, מעקות, פרגולות, דלתות, קירות מסך, תריסים
 * מחומרים: ברזל, אלומיניום, נירוסטה, זכוכית
 *
 * שכבות התמחור:
 * 1. עלות חומרי גלם (BOM לפי מוצר)
 * 2. עלות עבודה - פועלי ייצור (קבלנים) - לפי % או למ"ר
 * 3. עלות עבודה - מתקינים (קבלנים) - לפי % או למ"ר
 * 4. עמלת סוכן מכירות (7.5% + מע"מ, בונוס 2.5%)
 * 5. עלויות נוספות (צביעה בתנור, הובלה, הנדסה, תקורה)
 * 6. הכנסות והרווחיות
 * =============================================================================
 */

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { VAT_RATE } from "../constants";

const router = Router();

// =====================================================
// קבועים ומשתנים גלובליים
// =====================================================

/** עלות צביעה בתנור ברירת מחדל למ"ר */
const DEFAULT_PAINTING_RATE_PER_SQM = 55;

/** עמלת בסיס לסוכן מכירות */
const DEFAULT_SALES_COMMISSION_RATE = 7.5;

/** בונוס עמלה אם הושג יעד */
const DEFAULT_SALES_BONUS_RATE = 2.5;

/** אחוז תקורה ברירת מחדל */
const DEFAULT_OVERHEAD_RATE = 5;

/** מרווח יעד ברירת מחדל (200% = הכפלת עלות) */
const DEFAULT_TARGET_MARGIN = 200;

// =====================================================
// טיפוסים וממשקים
// =====================================================

/** קטגוריות מוצרים */
type ProductCategory = 'gate' | 'fence' | 'railing' | 'pergola' | 'door' | 'curtain_wall' | 'shutter' | 'bars' | 'other';

/** סוגי חומר */
type MaterialType = 'iron' | 'aluminum' | 'stainless_steel' | 'glass' | 'mixed';

/** שיטת תשלום לקבלנים */
type LaborMethod = 'percentage' | 'per_sqm';

/** סטטוס פרויקט */
type ProjectStatus = 'draft' | 'quoted' | 'approved' | 'in_production' | 'completed' | 'cancelled';

/** תוצאת השוואת מודלי עבודה */
interface LaborModelComparison {
  byPercent: {
    method: 'percentage';
    rate: number;
    cost: number;
    costPerSqm: number;
  };
  bySqm: {
    method: 'per_sqm';
    rate: number;
    cost: number;
    costAsPercent: number;
  };
  recommendation: 'percentage' | 'per_sqm' | 'equal';
  savings: number;
  savingsPercent: number;
  explanation: string;
  explanationHe: string;
}

/** פירוט עלויות פרויקט */
interface ProjectCostBreakdown {
  projectId: number;
  projectNumber: string;
  customerName: string;
  // הכנסות
  revenue: {
    customerPriceExclVat: number;
    customerPriceInclVat: number;
    pricePerSqm: number;
    totalSqm: number;
  };
  // עלויות
  costs: {
    rawMaterials: number;
    rawMaterialsPerSqm: number;
    productionLabor: number;
    productionLaborMethod: string;
    productionLaborRate: number;
    installationLabor: number;
    installationLaborMethod: string;
    installationLaborRate: number;
    painting: number;
    paintingPerSqm: number;
    transport: number;
    engineering: number;
    salesCommission: number;
    salesCommissionRate: number;
    salesBonus: number;
    salesBonusRate: number;
    overhead: number;
    overheadRate: number;
    totalCost: number;
    totalCostPerSqm: number;
  };
  // רווחיות
  profitability: {
    grossProfit: number;
    grossMarginPct: number;
    netProfit: number;
    netMarginPct: number;
    targetMarginPct: number;
    meetsTarget: boolean;
    revenueMultiplier: number;
  };
  // המלצת AI
  aiRecommendation: string;
  // פירוט פריטים
  items: any[];
  // תרחישים
  scenarios: any[];
}

/** תרחיש לניתוח */
interface Scenario {
  name: string;
  nameHe: string;
  materialCostChange?: number;    // שינוי באחוזים בעלות חומרים
  laborCostChange?: number;       // שינוי באחוזים בעלות עבודה
  priceChange?: number;           // שינוי באחוזים במחיר ללקוח
  paintingCostChange?: number;    // שינוי באחוזים בעלות צביעה
}

// =====================================================
// יצירת טבלאות - POST /init
// =====================================================

/**
 * יצירת כל הטבלאות הנדרשות למנוע התמחור
 * כולל אינדקסים לביצועים מיטביים
 */
async function createTables(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // טבלת קטלוג מוצרים - כל המוצרים שהמפעל מייצר
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_catalog (
        id SERIAL PRIMARY KEY,
        product_code VARCHAR(50) UNIQUE NOT NULL,
        product_name VARCHAR(200) NOT NULL,
        product_name_he VARCHAR(200),
        category VARCHAR(50) NOT NULL CHECK (category IN ('gate','fence','railing','pergola','door','curtain_wall','shutter','bars','other')),
        material_type VARCHAR(50) NOT NULL CHECK (material_type IN ('iron','aluminum','stainless_steel','glass','mixed')),
        description TEXT,
        base_price_per_sqm NUMERIC(12,2) DEFAULT 0,
        image_url TEXT,
        specifications JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','discontinued')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // טבלת BOM - רשימת חומרים לכל מוצר
    // כמות חומר למ"ר כולל מקדם פחת (waste_factor)
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_bom (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
        material_id INTEGER,
        material_name VARCHAR(200) NOT NULL,
        material_type VARCHAR(100),
        quantity_per_sqm NUMERIC(12,4) NOT NULL DEFAULT 0,
        unit VARCHAR(50) DEFAULT 'unit',
        unit_cost NUMERIC(12,2) DEFAULT 0,
        waste_factor NUMERIC(5,3) DEFAULT 1.05,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // טבלת תמחור פרויקטים - הליבה של המנוע
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_costing (
        id SERIAL PRIMARY KEY,
        project_number VARCHAR(50) UNIQUE,
        customer_id INTEGER,
        customer_name VARCHAR(200),
        project_name VARCHAR(300),
        salesperson_name VARCHAR(200),
        salesperson_id INTEGER,
        status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft','quoted','approved','in_production','completed','cancelled')),

        -- פריטי הפרויקט (JSON)
        items JSONB DEFAULT '[]',
        total_sqm NUMERIC(12,2) DEFAULT 0,

        -- הכנסות - מחיר ללקוח
        customer_price_excl_vat NUMERIC(14,2),
        customer_price_incl_vat NUMERIC(14,2),
        vat_rate NUMERIC(5,2) DEFAULT 18,

        -- עלות חומרי גלם
        raw_material_cost NUMERIC(14,2) DEFAULT 0,

        -- עלות עבודה - ייצור (קבלנים)
        production_labor_cost NUMERIC(14,2) DEFAULT 0,
        production_labor_method VARCHAR(20) CHECK (production_labor_method IN ('percentage','per_sqm')),
        production_labor_rate NUMERIC(8,2),

        -- עלות עבודה - התקנה (קבלנים)
        installation_labor_cost NUMERIC(14,2) DEFAULT 0,
        installation_labor_method VARCHAR(20) CHECK (installation_labor_method IN ('percentage','per_sqm')),
        installation_labor_rate NUMERIC(8,2),

        -- צביעה בתנור
        painting_cost NUMERIC(14,2) DEFAULT 0,
        painting_rate_per_sqm NUMERIC(8,2) DEFAULT 55,

        -- הובלה והנדסה
        transport_cost NUMERIC(14,2) DEFAULT 0,
        engineering_cost NUMERIC(14,2) DEFAULT 0,

        -- עמלת סוכן מכירות
        sales_commission_rate NUMERIC(5,2) DEFAULT 7.5,
        sales_commission_amount NUMERIC(14,2) DEFAULT 0,
        sales_bonus_rate NUMERIC(5,2) DEFAULT 0,
        sales_bonus_amount NUMERIC(14,2) DEFAULT 0,

        -- תקורה
        overhead_rate NUMERIC(5,2) DEFAULT 5,
        overhead_amount NUMERIC(14,2) DEFAULT 0,

        -- סיכומים
        total_cost NUMERIC(14,2) DEFAULT 0,
        gross_profit NUMERIC(14,2) DEFAULT 0,
        gross_margin_pct NUMERIC(8,2) DEFAULT 0,
        net_profit NUMERIC(14,2) DEFAULT 0,
        net_margin_pct NUMERIC(8,2) DEFAULT 0,
        target_margin_pct NUMERIC(8,2) DEFAULT 200,

        -- המלצות AI וניתוח תרחישים
        ai_recommendation TEXT,
        scenario_analysis JSONB DEFAULT '[]',

        notes TEXT,
        created_by VARCHAR(200),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // טבלת פריטי תמחור - כל פריט בפרויקט
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_costing_items (
        id SERIAL PRIMARY KEY,
        project_costing_id INTEGER NOT NULL REFERENCES project_costing(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES product_catalog(id),
        product_name VARCHAR(200),
        product_category VARCHAR(50),
        material_type VARCHAR(50),
        width_m NUMERIC(8,3),
        height_m NUMERIC(8,3),
        sqm NUMERIC(10,3),
        quantity INTEGER DEFAULT 1,
        total_sqm NUMERIC(10,3),
        unit_price NUMERIC(12,2),
        total_price NUMERIC(14,2),
        material_cost NUMERIC(14,2),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // טבלת מחירון ספקים - מעקב אחר מחירי חומרי גלם
    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_price_index (
        id SERIAL PRIMARY KEY,
        supplier_id INTEGER,
        supplier_name VARCHAR(200) NOT NULL,
        material_id INTEGER,
        material_name VARCHAR(200) NOT NULL,
        material_category VARCHAR(100),
        unit_price NUMERIC(12,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'ILS',
        min_order_qty NUMERIC(10,2),
        lead_time_days INTEGER,
        last_updated DATE DEFAULT CURRENT_DATE,
        price_trend VARCHAR(20) CHECK (price_trend IN ('rising','stable','falling','volatile')),
        source VARCHAR(200),
        notes TEXT,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','expired')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // אינדקסים לביצועים
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_catalog_category ON product_catalog(category);
      CREATE INDEX IF NOT EXISTS idx_product_catalog_material ON product_catalog(material_type);
      CREATE INDEX IF NOT EXISTS idx_product_catalog_status ON product_catalog(status);
      CREATE INDEX IF NOT EXISTS idx_product_bom_product ON product_bom(product_id);
      CREATE INDEX IF NOT EXISTS idx_project_costing_status ON project_costing(status);
      CREATE INDEX IF NOT EXISTS idx_project_costing_customer ON project_costing(customer_id);
      CREATE INDEX IF NOT EXISTS idx_project_costing_salesperson ON project_costing(salesperson_id);
      CREATE INDEX IF NOT EXISTS idx_project_costing_created ON project_costing(created_at);
      CREATE INDEX IF NOT EXISTS idx_project_costing_items_project ON project_costing_items(project_costing_id);
      CREATE INDEX IF NOT EXISTS idx_supplier_price_material ON supplier_price_index(material_id);
      CREATE INDEX IF NOT EXISTS idx_supplier_price_supplier ON supplier_price_index(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_supplier_price_status ON supplier_price_index(status);
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// =====================================================
// פונקציות ליבה של מנוע התמחור
// =====================================================

/**
 * חישוב עלות חומרי גלם לפריט לפי BOM
 * מחשב כמות חומר הכוללת פחת (waste) ומחיר עדכני מספק
 */
async function calculateItemMaterialCost(productId: number, totalSqm: number): Promise<number> {
  // שליפת BOM למוצר
  const bomResult = await pool.query(
    `SELECT pb.*,
            COALESCE(
              (SELECT sp.unit_price FROM supplier_price_index sp
               WHERE sp.material_id = pb.material_id AND sp.status = 'active'
               ORDER BY sp.unit_price ASC LIMIT 1),
              pb.unit_cost
            ) as current_unit_cost
     FROM product_bom pb
     WHERE pb.product_id = $1`,
    [productId]
  );

  let totalMaterialCost = 0;

  for (const bom of bomResult.rows) {
    // כמות = כמות_למ"ר × סה"כ_מ"ר × מקדם_פחת
    const quantity = parseFloat(bom.quantity_per_sqm) * totalSqm * parseFloat(bom.waste_factor);
    const unitCost = parseFloat(bom.current_unit_cost) || 0;
    totalMaterialCost += quantity * unitCost;
  }

  return Math.round(totalMaterialCost * 100) / 100;
}

/**
 * השוואת מודלי תשלום לקבלנים (ייצור / התקנה)
 * מחזיר המלצה: לפי אחוז או לפי מ"ר - מה יותר משתלם לחברה
 */
function compareWorkerModels(
  projectValueExclVat: number,
  totalSqm: number,
  percentRate: number,
  sqmRate: number
): LaborModelComparison {
  // חישוב עלות לפי אחוז מערך הפרויקט (לפני מע"מ)
  const costByPercent = projectValueExclVat * (percentRate / 100);
  const costByPercentPerSqm = totalSqm > 0 ? costByPercent / totalSqm : 0;

  // חישוב עלות לפי מ"ר
  const costBySqm = totalSqm * sqmRate;
  const costBySqmAsPercent = projectValueExclVat > 0 ? (costBySqm / projectValueExclVat) * 100 : 0;

  // מציאת האופציה הזולה יותר לחברה
  const savings = Math.abs(costByPercent - costBySqm);
  const cheaper = costByPercent < costBySqm ? 'percentage' : costBySqm < costByPercent ? 'per_sqm' : 'equal';
  const savingsPercent = Math.max(costByPercent, costBySqm) > 0
    ? (savings / Math.max(costByPercent, costBySqm)) * 100
    : 0;

  // הסבר בעברית
  let explanationHe = '';
  if (cheaper === 'percentage') {
    explanationHe = `תשלום לפי ${percentRate}% (${costByPercent.toFixed(0)}₪) זול ב-${savings.toFixed(0)}₪ מתשלום לפי מ"ר (${costBySqm.toFixed(0)}₪). מומלץ לשלם באחוזים.`;
  } else if (cheaper === 'per_sqm') {
    explanationHe = `תשלום לפי ${sqmRate}₪/מ"ר (${costBySqm.toFixed(0)}₪) זול ב-${savings.toFixed(0)}₪ מתשלום לפי אחוז (${costByPercent.toFixed(0)}₪). מומלץ לשלם לפי מ"ר.`;
  } else {
    explanationHe = `שני המודלים שווים: ${costByPercent.toFixed(0)}₪. אפשר לבחור לפי נוחות.`;
  }

  return {
    byPercent: {
      method: 'percentage',
      rate: percentRate,
      cost: Math.round(costByPercent * 100) / 100,
      costPerSqm: Math.round(costByPercentPerSqm * 100) / 100,
    },
    bySqm: {
      method: 'per_sqm',
      rate: sqmRate,
      cost: Math.round(costBySqm * 100) / 100,
      costAsPercent: Math.round(costBySqmAsPercent * 100) / 100,
    },
    recommendation: cheaper as 'percentage' | 'per_sqm' | 'equal',
    savings: Math.round(savings * 100) / 100,
    savingsPercent: Math.round(savingsPercent * 100) / 100,
    explanation: cheaper === 'percentage'
      ? `Paying ${percentRate}% saves ${savings.toFixed(0)} ILS vs per-sqm rate`
      : cheaper === 'per_sqm'
        ? `Paying ${sqmRate} ILS/sqm saves ${savings.toFixed(0)} ILS vs percentage rate`
        : `Both models are equal at ${costByPercent.toFixed(0)} ILS`,
    explanationHe,
  };
}

/**
 * מציאת מחיר ספק הכי זול לחומר מסוים
 * בודק זמינות, כמות מינימלית, ומגמת מחירים
 */
async function findBestSupplierPrice(materialId: number, quantity: number = 1): Promise<any> {
  const result = await pool.query(
    `SELECT
       sp.*,
       -- חישוב עלות כוללת לכמות המבוקשת
       sp.unit_price * $2 as total_cost,
       -- בדיקה אם הכמות עומדת במינימום הזמנה
       CASE WHEN sp.min_order_qty IS NULL OR sp.min_order_qty <= $2 THEN true ELSE false END as meets_min_order,
       -- ימים מאז עדכון אחרון
       CURRENT_DATE - sp.last_updated as days_since_update
     FROM supplier_price_index sp
     WHERE sp.material_id = $1
       AND sp.status = 'active'
     ORDER BY sp.unit_price ASC`,
    [materialId, quantity]
  );

  if (result.rows.length === 0) {
    return {
      found: false,
      message: 'לא נמצאו ספקים פעילים לחומר זה',
      materialId,
      quantity,
    };
  }

  const bestSupplier = result.rows[0];
  const allSuppliers = result.rows;

  // חישוב ממוצע מחיר שוק
  const avgPrice = allSuppliers.reduce((sum: number, s: any) => sum + parseFloat(s.unit_price), 0) / allSuppliers.length;
  const bestPrice = parseFloat(bestSupplier.unit_price);
  const savingsVsAvg = ((avgPrice - bestPrice) / avgPrice) * 100;

  return {
    found: true,
    bestSupplier: {
      supplierId: bestSupplier.supplier_id,
      supplierName: bestSupplier.supplier_name,
      unitPrice: bestPrice,
      currency: bestSupplier.currency,
      totalCost: Math.round(bestPrice * quantity * 100) / 100,
      minOrderQty: bestSupplier.min_order_qty,
      meetsMinOrder: bestSupplier.meets_min_order,
      leadTimeDays: bestSupplier.lead_time_days,
      lastUpdated: bestSupplier.last_updated,
      priceTrend: bestSupplier.price_trend,
      daysSinceUpdate: bestSupplier.days_since_update,
    },
    marketAnalysis: {
      averagePrice: Math.round(avgPrice * 100) / 100,
      lowestPrice: bestPrice,
      highestPrice: parseFloat(allSuppliers[allSuppliers.length - 1].unit_price),
      savingsVsAverage: Math.round(savingsVsAvg * 100) / 100,
      totalSuppliers: allSuppliers.length,
    },
    allSuppliers: allSuppliers.map((s: any) => ({
      supplierId: s.supplier_id,
      supplierName: s.supplier_name,
      unitPrice: parseFloat(s.unit_price),
      totalCost: parseFloat(s.total_cost),
      meetsMinOrder: s.meets_min_order,
      leadTimeDays: s.lead_time_days,
      priceTrend: s.price_trend,
    })),
  };
}

/**
 * חישוב עלות פרויקט מלא - הפונקציה המרכזית של המנוע
 * מחשב את כל שכבות העלות ומעדכן את הרשומה בבסיס הנתונים
 */
async function calculateProjectCost(projectId: number): Promise<ProjectCostBreakdown> {
  const client = await pool.connect();
  try {
    // שליפת נתוני הפרויקט
    const projectResult = await client.query(
      `SELECT * FROM project_costing WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      throw new Error(`פרויקט ${projectId} לא נמצא`);
    }

    const project = projectResult.rows[0];

    // שליפת פריטי הפרויקט
    const itemsResult = await client.query(
      `SELECT pci.*, pc.product_code, pc.base_price_per_sqm
       FROM project_costing_items pci
       LEFT JOIN product_catalog pc ON pc.id = pci.product_id
       WHERE pci.project_costing_id = $1
       ORDER BY pci.id`,
      [projectId]
    );

    const items = itemsResult.rows;

    // ====== שלב 1: חישוב שטח כולל ======
    let totalSqm = 0;
    for (const item of items) {
      const sqm = parseFloat(item.sqm) || (parseFloat(item.width_m) * parseFloat(item.height_m));
      const qty = parseInt(item.quantity) || 1;
      const itemTotalSqm = sqm * qty;
      totalSqm += itemTotalSqm;

      // עדכון פריט
      await client.query(
        `UPDATE project_costing_items SET sqm = $1, total_sqm = $2 WHERE id = $3`,
        [sqm, itemTotalSqm, item.id]
      );
    }

    // ====== שלב 2: חישוב עלות חומרי גלם ======
    let rawMaterialCost = 0;
    for (const item of items) {
      if (item.product_id) {
        const sqm = parseFloat(item.sqm) || (parseFloat(item.width_m) * parseFloat(item.height_m));
        const qty = parseInt(item.quantity) || 1;
        const itemMaterialCost = await calculateItemMaterialCost(item.product_id, sqm * qty);
        rawMaterialCost += itemMaterialCost;

        // עדכון עלות חומרים בפריט
        await client.query(
          `UPDATE project_costing_items SET material_cost = $1 WHERE id = $2`,
          [itemMaterialCost, item.id]
        );
      }
    }

    // אם אין BOM, נשתמש בעלות חומרי הגלם שהוזנה ידנית
    if (rawMaterialCost === 0) {
      rawMaterialCost = parseFloat(project.raw_material_cost) || 0;
    }

    // ====== שלב 3: הכנסות ======
    const customerPriceExclVat = parseFloat(project.customer_price_excl_vat) || 0;
    const vatRate = parseFloat(project.vat_rate) || 18;
    const customerPriceInclVat = customerPriceExclVat * (1 + vatRate / 100);
    const pricePerSqm = totalSqm > 0 ? customerPriceExclVat / totalSqm : 0;

    // ====== שלב 4: עלות עבודת ייצור (קבלנים) ======
    let productionLaborCost = 0;
    const prodMethod = project.production_labor_method;
    const prodRate = parseFloat(project.production_labor_rate) || 0;

    if (prodMethod === 'percentage') {
      productionLaborCost = customerPriceExclVat * (prodRate / 100);
    } else if (prodMethod === 'per_sqm') {
      productionLaborCost = totalSqm * prodRate;
    }

    // ====== שלב 5: עלות התקנה (קבלנים) ======
    let installationLaborCost = 0;
    const instMethod = project.installation_labor_method;
    const instRate = parseFloat(project.installation_labor_rate) || 0;

    if (instMethod === 'percentage') {
      installationLaborCost = customerPriceExclVat * (instRate / 100);
    } else if (instMethod === 'per_sqm') {
      installationLaborCost = totalSqm * instRate;
    }

    // ====== שלב 6: צביעה בתנור ======
    const paintingRatePerSqm = parseFloat(project.painting_rate_per_sqm) || DEFAULT_PAINTING_RATE_PER_SQM;
    const paintingCost = totalSqm * paintingRatePerSqm;

    // ====== שלב 7: הובלה והנדסה ======
    const transportCost = parseFloat(project.transport_cost) || 0;
    const engineeringCost = parseFloat(project.engineering_cost) || 0;

    // ====== שלב 8: עמלת סוכן מכירות ======
    const commissionRate = parseFloat(project.sales_commission_rate) || DEFAULT_SALES_COMMISSION_RATE;
    // עמלה מחושבת מהמחיר ללקוח לפני מע"מ
    const salesCommissionAmount = customerPriceExclVat * (commissionRate / 100);
    // העמלה עצמה חייבת במע"מ (הקבלן מוציא חשבונית)
    const salesCommissionWithVat = salesCommissionAmount * (1 + VAT_RATE);

    // בונוס - אם הגיע ליעד
    const bonusRate = parseFloat(project.sales_bonus_rate) || 0;
    const salesBonusAmount = customerPriceExclVat * (bonusRate / 100);
    const salesBonusWithVat = salesBonusAmount * (1 + VAT_RATE);

    // ====== שלב 9: תקורה ======
    const overheadRate = parseFloat(project.overhead_rate) || DEFAULT_OVERHEAD_RATE;
    const overheadAmount = customerPriceExclVat * (overheadRate / 100);

    // ====== שלב 10: סיכום עלויות ======
    const totalCost =
      rawMaterialCost +
      productionLaborCost +
      installationLaborCost +
      paintingCost +
      transportCost +
      engineeringCost +
      salesCommissionWithVat +
      salesBonusWithVat +
      overheadAmount;

    // ====== שלב 11: רווחיות ======
    // רווח גולמי = הכנסות - עלות חומרים - עבודה
    const grossProfit = customerPriceExclVat - rawMaterialCost - productionLaborCost - installationLaborCost;
    const grossMarginPct = customerPriceExclVat > 0 ? (grossProfit / customerPriceExclVat) * 100 : 0;

    // רווח נקי = הכנסות - כל העלויות
    const netProfit = customerPriceExclVat - totalCost;
    const netMarginPct = customerPriceExclVat > 0 ? (netProfit / customerPriceExclVat) * 100 : 0;

    // מכפיל הכנסות על העלות
    const revenueMultiplier = totalCost > 0 ? (customerPriceExclVat / totalCost) * 100 : 0;

    const targetMarginPct = parseFloat(project.target_margin_pct) || DEFAULT_TARGET_MARGIN;
    const meetsTarget = revenueMultiplier >= targetMarginPct;

    // ====== שלב 12: המלצת AI ======
    const aiRecommendation = generateAiRecommendation({
      netMarginPct,
      grossMarginPct,
      revenueMultiplier,
      targetMarginPct,
      totalCost,
      customerPriceExclVat,
      rawMaterialCost,
      productionLaborCost,
      installationLaborCost,
      paintingCost,
      totalSqm,
      salesCommissionWithVat,
    });

    // ====== שלב 13: עדכון בסיס הנתונים ======
    await client.query(
      `UPDATE project_costing SET
        total_sqm = $1,
        customer_price_incl_vat = $2,
        raw_material_cost = $3,
        production_labor_cost = $4,
        installation_labor_cost = $5,
        painting_cost = $6,
        sales_commission_amount = $7,
        sales_bonus_amount = $8,
        overhead_amount = $9,
        total_cost = $10,
        gross_profit = $11,
        gross_margin_pct = $12,
        net_profit = $13,
        net_margin_pct = $14,
        ai_recommendation = $15,
        updated_at = NOW()
      WHERE id = $16`,
      [
        totalSqm,
        Math.round(customerPriceInclVat * 100) / 100,
        Math.round(rawMaterialCost * 100) / 100,
        Math.round(productionLaborCost * 100) / 100,
        Math.round(installationLaborCost * 100) / 100,
        Math.round(paintingCost * 100) / 100,
        Math.round(salesCommissionWithVat * 100) / 100,
        Math.round(salesBonusWithVat * 100) / 100,
        Math.round(overheadAmount * 100) / 100,
        Math.round(totalCost * 100) / 100,
        Math.round(grossProfit * 100) / 100,
        Math.round(grossMarginPct * 100) / 100,
        Math.round(netProfit * 100) / 100,
        Math.round(netMarginPct * 100) / 100,
        aiRecommendation,
        projectId,
      ]
    );

    // שליפת פריטים מעודכנים
    const updatedItems = await client.query(
      `SELECT * FROM project_costing_items WHERE project_costing_id = $1 ORDER BY id`,
      [projectId]
    );

    return {
      projectId,
      projectNumber: project.project_number,
      customerName: project.customer_name,
      revenue: {
        customerPriceExclVat: Math.round(customerPriceExclVat * 100) / 100,
        customerPriceInclVat: Math.round(customerPriceInclVat * 100) / 100,
        pricePerSqm: Math.round(pricePerSqm * 100) / 100,
        totalSqm: Math.round(totalSqm * 100) / 100,
      },
      costs: {
        rawMaterials: Math.round(rawMaterialCost * 100) / 100,
        rawMaterialsPerSqm: totalSqm > 0 ? Math.round((rawMaterialCost / totalSqm) * 100) / 100 : 0,
        productionLabor: Math.round(productionLaborCost * 100) / 100,
        productionLaborMethod: prodMethod || 'not_set',
        productionLaborRate: prodRate,
        installationLabor: Math.round(installationLaborCost * 100) / 100,
        installationLaborMethod: instMethod || 'not_set',
        installationLaborRate: instRate,
        painting: Math.round(paintingCost * 100) / 100,
        paintingPerSqm: paintingRatePerSqm,
        transport: transportCost,
        engineering: engineeringCost,
        salesCommission: Math.round(salesCommissionWithVat * 100) / 100,
        salesCommissionRate: commissionRate,
        salesBonus: Math.round(salesBonusWithVat * 100) / 100,
        salesBonusRate: bonusRate,
        overhead: Math.round(overheadAmount * 100) / 100,
        overheadRate,
        totalCost: Math.round(totalCost * 100) / 100,
        totalCostPerSqm: totalSqm > 0 ? Math.round((totalCost / totalSqm) * 100) / 100 : 0,
      },
      profitability: {
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMarginPct: Math.round(grossMarginPct * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        netMarginPct: Math.round(netMarginPct * 100) / 100,
        targetMarginPct,
        meetsTarget,
        revenueMultiplier: Math.round(revenueMultiplier * 100) / 100,
      },
      aiRecommendation,
      items: updatedItems.rows,
      scenarios: [],
    };
  } finally {
    client.release();
  }
}

/**
 * יצירת המלצת AI לפרויקט
 * מנתח את הנתונים ומספק המלצות לשיפור רווחיות
 */
function generateAiRecommendation(data: {
  netMarginPct: number;
  grossMarginPct: number;
  revenueMultiplier: number;
  targetMarginPct: number;
  totalCost: number;
  customerPriceExclVat: number;
  rawMaterialCost: number;
  productionLaborCost: number;
  installationLaborCost: number;
  paintingCost: number;
  totalSqm: number;
  salesCommissionWithVat: number;
}): string {
  const recommendations: string[] = [];

  // בדיקת רווחיות כללית
  if (data.netMarginPct < 15) {
    recommendations.push('⚠️ רווח נקי נמוך מ-15%. יש לבדוק מחיר ללקוח או לצמצם עלויות.');
  } else if (data.netMarginPct > 40) {
    recommendations.push('✅ רווחיות מצוינת. מחיר ללקוח אולי גבוה - שקול הורדה לשיפור תחרותיות.');
  } else {
    recommendations.push('✅ רווחיות סבירה.');
  }

  // בדיקת מכפיל הכנסות מול יעד
  if (data.revenueMultiplier < data.targetMarginPct) {
    const gap = data.targetMarginPct - data.revenueMultiplier;
    const neededPrice = data.totalCost * (data.targetMarginPct / 100);
    recommendations.push(
      `📊 מכפיל הכנסות (${data.revenueMultiplier.toFixed(0)}%) נמוך מהיעד (${data.targetMarginPct}%). ` +
      `מחיר מומלץ ללקוח: ${neededPrice.toFixed(0)}₪ (לפני מע"מ).`
    );
  }

  // בדיקת יחס חומרי גלם
  if (data.customerPriceExclVat > 0) {
    const materialRatio = (data.rawMaterialCost / data.customerPriceExclVat) * 100;
    if (materialRatio > 40) {
      recommendations.push(
        `🔧 חומרי גלם מהווים ${materialRatio.toFixed(1)}% מההכנסות. שקול ספקים חלופיים או חומרים מקבילים.`
      );
    }
  }

  // בדיקת עלות עבודה
  if (data.customerPriceExclVat > 0) {
    const laborRatio = ((data.productionLaborCost + data.installationLaborCost) / data.customerPriceExclVat) * 100;
    if (laborRatio > 30) {
      recommendations.push(
        `👷 עלות עבודה (ייצור + התקנה) מהווה ${laborRatio.toFixed(1)}% מההכנסות. בדוק אם אפשר לייעל.`
      );
    }
  }

  // בדיקת עמלה
  if (data.customerPriceExclVat > 0) {
    const commissionRatio = (data.salesCommissionWithVat / data.customerPriceExclVat) * 100;
    if (commissionRatio > 12) {
      recommendations.push(
        `💰 עמלת מכירות (כולל בונוס + מע"מ) מהווה ${commissionRatio.toFixed(1)}% מההכנסות.`
      );
    }
  }

  // המלצה לגבי צביעה
  if (data.totalSqm > 0 && data.paintingCost > 0) {
    const paintPerSqm = data.paintingCost / data.totalSqm;
    if (paintPerSqm > 65) {
      recommendations.push(
        `🎨 עלות צביעה (${paintPerSqm.toFixed(0)}₪/מ"ר) גבוהה מהממוצע. שקול ספק צביעה חלופי.`
      );
    }
  }

  return recommendations.join('\n');
}

/**
 * ניתוח תרחישים - מונטה קרלו
 * מחשב רווחיות בתרחישים שונים של שינויי מחירים
 */
async function generateScenarioAnalysis(
  projectId: number,
  scenarios: Scenario[]
): Promise<any[]> {
  // שליפת נתוני פרויקט
  const projectResult = await pool.query(
    `SELECT * FROM project_costing WHERE id = $1`,
    [projectId]
  );

  if (projectResult.rows.length === 0) {
    throw new Error(`פרויקט ${projectId} לא נמצא`);
  }

  const project = projectResult.rows[0];

  const baseRawMaterialCost = parseFloat(project.raw_material_cost) || 0;
  const baseProductionLabor = parseFloat(project.production_labor_cost) || 0;
  const baseInstallationLabor = parseFloat(project.installation_labor_cost) || 0;
  const basePaintingCost = parseFloat(project.painting_cost) || 0;
  const baseTransport = parseFloat(project.transport_cost) || 0;
  const baseEngineering = parseFloat(project.engineering_cost) || 0;
  const baseCommission = parseFloat(project.sales_commission_amount) || 0;
  const baseBonus = parseFloat(project.sales_bonus_amount) || 0;
  const baseOverhead = parseFloat(project.overhead_amount) || 0;
  const basePrice = parseFloat(project.customer_price_excl_vat) || 0;

  const results = [];

  // תרחיש בסיס
  const baseTotalCost = baseRawMaterialCost + baseProductionLabor + baseInstallationLabor +
    basePaintingCost + baseTransport + baseEngineering + baseCommission + baseBonus + baseOverhead;
  const baseNetProfit = basePrice - baseTotalCost;
  const baseNetMargin = basePrice > 0 ? (baseNetProfit / basePrice) * 100 : 0;

  results.push({
    name: 'Base Case',
    nameHe: 'תרחיש בסיס',
    customerPrice: basePrice,
    totalCost: Math.round(baseTotalCost * 100) / 100,
    netProfit: Math.round(baseNetProfit * 100) / 100,
    netMarginPct: Math.round(baseNetMargin * 100) / 100,
    changes: {},
  });

  // חישוב כל תרחיש
  for (const scenario of scenarios) {
    const matChange = (scenario.materialCostChange || 0) / 100;
    const laborChange = (scenario.laborCostChange || 0) / 100;
    const priceChange = (scenario.priceChange || 0) / 100;
    const paintChange = (scenario.paintingCostChange || 0) / 100;

    const scenarioMaterialCost = baseRawMaterialCost * (1 + matChange);
    const scenarioProductionLabor = baseProductionLabor * (1 + laborChange);
    const scenarioInstallationLabor = baseInstallationLabor * (1 + laborChange);
    const scenarioPaintingCost = basePaintingCost * (1 + paintChange);
    const scenarioPrice = basePrice * (1 + priceChange);

    // עמלה משתנה עם מחיר
    const scenarioCommission = basePrice > 0
      ? baseCommission * (scenarioPrice / basePrice)
      : 0;
    const scenarioOverhead = basePrice > 0
      ? baseOverhead * (scenarioPrice / basePrice)
      : 0;

    const scenarioTotalCost =
      scenarioMaterialCost + scenarioProductionLabor + scenarioInstallationLabor +
      scenarioPaintingCost + baseTransport + baseEngineering +
      scenarioCommission + baseBonus + scenarioOverhead;

    const scenarioNetProfit = scenarioPrice - scenarioTotalCost;
    const scenarioNetMargin = scenarioPrice > 0 ? (scenarioNetProfit / scenarioPrice) * 100 : 0;

    results.push({
      name: scenario.name,
      nameHe: scenario.nameHe,
      customerPrice: Math.round(scenarioPrice * 100) / 100,
      totalCost: Math.round(scenarioTotalCost * 100) / 100,
      netProfit: Math.round(scenarioNetProfit * 100) / 100,
      netMarginPct: Math.round(scenarioNetMargin * 100) / 100,
      profitDelta: Math.round((scenarioNetProfit - baseNetProfit) * 100) / 100,
      marginDelta: Math.round((scenarioNetMargin - baseNetMargin) * 100) / 100,
      changes: {
        materialCostChange: scenario.materialCostChange || 0,
        laborCostChange: scenario.laborCostChange || 0,
        priceChange: scenario.priceChange || 0,
        paintingCostChange: scenario.paintingCostChange || 0,
      },
    });
  }

  // שמירת תוצאות בפרויקט
  await pool.query(
    `UPDATE project_costing SET scenario_analysis = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(results), projectId]
  );

  return results;
}

/**
 * חישוב רווח יומי - סך הרווח מכל הפרויקטים הפעילים
 */
async function calculateDailyProfit(): Promise<any> {
  // פרויקטים פעילים (מאושרים או בייצור)
  const activeResult = await pool.query(`
    SELECT
      COUNT(*) as total_projects,
      SUM(customer_price_excl_vat) as total_revenue,
      SUM(total_cost) as total_costs,
      SUM(net_profit) as total_net_profit,
      SUM(gross_profit) as total_gross_profit,
      SUM(total_sqm) as total_sqm,
      AVG(net_margin_pct) as avg_net_margin,
      AVG(gross_margin_pct) as avg_gross_margin,
      SUM(raw_material_cost) as total_material_cost,
      SUM(production_labor_cost) as total_production_labor,
      SUM(installation_labor_cost) as total_installation_labor,
      SUM(painting_cost) as total_painting_cost,
      SUM(sales_commission_amount + sales_bonus_amount) as total_commissions
    FROM project_costing
    WHERE status IN ('approved', 'in_production')
  `);

  // פרויקטים שהושלמו החודש
  const completedThisMonthResult = await pool.query(`
    SELECT
      COUNT(*) as completed_projects,
      SUM(customer_price_excl_vat) as completed_revenue,
      SUM(net_profit) as completed_profit
    FROM project_costing
    WHERE status = 'completed'
      AND updated_at >= DATE_TRUNC('month', CURRENT_DATE)
  `);

  // פרויקטים בהצעת מחיר (פייפליין)
  const pipelineResult = await pool.query(`
    SELECT
      COUNT(*) as pipeline_projects,
      SUM(customer_price_excl_vat) as pipeline_value
    FROM project_costing
    WHERE status IN ('draft', 'quoted')
  `);

  // פירוט לפי קטגוריה
  const byCategoryResult = await pool.query(`
    SELECT
      pci.product_category,
      COUNT(DISTINCT pc.id) as projects,
      SUM(pci.total_sqm) as total_sqm,
      SUM(pci.total_price) as total_revenue
    FROM project_costing_items pci
    JOIN project_costing pc ON pc.id = pci.project_costing_id
    WHERE pc.status IN ('approved', 'in_production')
    GROUP BY pci.product_category
    ORDER BY total_revenue DESC
  `);

  const active = activeResult.rows[0];
  const completed = completedThisMonthResult.rows[0];
  const pipeline = pipelineResult.rows[0];

  return {
    date: new Date().toISOString().split('T')[0],
    activeProjects: {
      count: parseInt(active.total_projects) || 0,
      totalRevenue: parseFloat(active.total_revenue) || 0,
      totalCosts: parseFloat(active.total_costs) || 0,
      totalNetProfit: parseFloat(active.total_net_profit) || 0,
      totalGrossProfit: parseFloat(active.total_gross_profit) || 0,
      totalSqm: parseFloat(active.total_sqm) || 0,
      avgNetMargin: parseFloat(active.avg_net_margin) || 0,
      avgGrossMargin: parseFloat(active.avg_gross_margin) || 0,
      costBreakdown: {
        materials: parseFloat(active.total_material_cost) || 0,
        productionLabor: parseFloat(active.total_production_labor) || 0,
        installationLabor: parseFloat(active.total_installation_labor) || 0,
        painting: parseFloat(active.total_painting_cost) || 0,
        commissions: parseFloat(active.total_commissions) || 0,
      },
    },
    completedThisMonth: {
      count: parseInt(completed.completed_projects) || 0,
      revenue: parseFloat(completed.completed_revenue) || 0,
      profit: parseFloat(completed.completed_profit) || 0,
    },
    pipeline: {
      count: parseInt(pipeline.pipeline_projects) || 0,
      value: parseFloat(pipeline.pipeline_value) || 0,
    },
    byCategory: byCategoryResult.rows,
  };
}

/**
 * ניתוח מרווחים מפורט לפרויקט
 * כולל השוואה ליעדים והמלצות
 */
async function getMarginAnalysis(projectId: number): Promise<any> {
  const projectResult = await pool.query(
    `SELECT * FROM project_costing WHERE id = $1`,
    [projectId]
  );

  if (projectResult.rows.length === 0) {
    throw new Error(`פרויקט ${projectId} לא נמצא`);
  }

  const p = projectResult.rows[0];
  const revenue = parseFloat(p.customer_price_excl_vat) || 0;
  const totalCost = parseFloat(p.total_cost) || 0;
  const totalSqm = parseFloat(p.total_sqm) || 0;

  // פירוט אחוזי כל עלות מההכנסות
  const costBreakdownPct = {
    rawMaterials: revenue > 0 ? ((parseFloat(p.raw_material_cost) || 0) / revenue * 100) : 0,
    productionLabor: revenue > 0 ? ((parseFloat(p.production_labor_cost) || 0) / revenue * 100) : 0,
    installationLabor: revenue > 0 ? ((parseFloat(p.installation_labor_cost) || 0) / revenue * 100) : 0,
    painting: revenue > 0 ? ((parseFloat(p.painting_cost) || 0) / revenue * 100) : 0,
    transport: revenue > 0 ? ((parseFloat(p.transport_cost) || 0) / revenue * 100) : 0,
    engineering: revenue > 0 ? ((parseFloat(p.engineering_cost) || 0) / revenue * 100) : 0,
    salesCommission: revenue > 0 ? ((parseFloat(p.sales_commission_amount) || 0) / revenue * 100) : 0,
    salesBonus: revenue > 0 ? ((parseFloat(p.sales_bonus_amount) || 0) / revenue * 100) : 0,
    overhead: revenue > 0 ? ((parseFloat(p.overhead_amount) || 0) / revenue * 100) : 0,
  };

  // חישוב מחיר שבירה (break-even)
  const breakEvenPrice = totalCost;
  const breakEvenPricePerSqm = totalSqm > 0 ? totalCost / totalSqm : 0;

  // חישוב מחיר יעד (לפי מרווח היעד)
  const targetMargin = parseFloat(p.target_margin_pct) || DEFAULT_TARGET_MARGIN;
  const targetPrice = totalCost * (targetMargin / 100);
  const targetPricePerSqm = totalSqm > 0 ? targetPrice / totalSqm : 0;

  // כמה אפשר להוריד מחיר ועדיין לעמוד ביעד
  const maxDiscount = revenue > targetPrice
    ? ((revenue - targetPrice) / revenue) * 100
    : 0;

  // ממוצע שוק לפי קטגוריה (מפרויקטים קודמים)
  const itemsResult = await pool.query(
    `SELECT DISTINCT product_category FROM project_costing_items WHERE project_costing_id = $1`,
    [projectId]
  );
  const categories = itemsResult.rows.map((r: any) => r.product_category).filter(Boolean);

  let marketAvg = null;
  if (categories.length > 0) {
    const avgResult = await pool.query(
      `SELECT
         AVG(pc.net_margin_pct) as avg_margin,
         AVG(pc.customer_price_excl_vat / NULLIF(pc.total_sqm, 0)) as avg_price_per_sqm
       FROM project_costing pc
       JOIN project_costing_items pci ON pci.project_costing_id = pc.id
       WHERE pci.product_category = ANY($1)
         AND pc.status IN ('completed', 'in_production', 'approved')
         AND pc.id != $2`,
      [categories, projectId]
    );
    if (avgResult.rows[0].avg_margin) {
      marketAvg = {
        avgMargin: parseFloat(avgResult.rows[0].avg_margin) || 0,
        avgPricePerSqm: parseFloat(avgResult.rows[0].avg_price_per_sqm) || 0,
      };
    }
  }

  return {
    projectId,
    projectNumber: p.project_number,
    customerName: p.customer_name,
    revenue: {
      total: revenue,
      perSqm: totalSqm > 0 ? Math.round((revenue / totalSqm) * 100) / 100 : 0,
      inclVat: Math.round(revenue * (1 + (parseFloat(p.vat_rate) || 18) / 100) * 100) / 100,
    },
    totalCost: Math.round(totalCost * 100) / 100,
    costPerSqm: totalSqm > 0 ? Math.round((totalCost / totalSqm) * 100) / 100 : 0,
    costBreakdownPct: Object.fromEntries(
      Object.entries(costBreakdownPct).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
    grossProfit: parseFloat(p.gross_profit) || 0,
    grossMarginPct: parseFloat(p.gross_margin_pct) || 0,
    netProfit: parseFloat(p.net_profit) || 0,
    netMarginPct: parseFloat(p.net_margin_pct) || 0,
    targets: {
      targetMarginPct: targetMargin,
      targetPrice: Math.round(targetPrice * 100) / 100,
      targetPricePerSqm: Math.round(targetPricePerSqm * 100) / 100,
      meetsTarget: revenue >= targetPrice,
      gapToTarget: Math.round((revenue - targetPrice) * 100) / 100,
    },
    breakEven: {
      price: Math.round(breakEvenPrice * 100) / 100,
      pricePerSqm: Math.round(breakEvenPricePerSqm * 100) / 100,
      marginAboveBreakEven: Math.round((revenue - breakEvenPrice) * 100) / 100,
    },
    maxDiscount: Math.round(maxDiscount * 100) / 100,
    marketComparison: marketAvg,
    revenueMultiplier: totalCost > 0 ? Math.round((revenue / totalCost) * 10000) / 100 : 0,
  };
}

// =====================================================
// נתיבי API - Express Router
// =====================================================

// ---------- אתחול טבלאות ----------
router.post('/init', async (_req: Request, res: Response) => {
  try {
    await createTables();
    res.json({ success: true, message: 'טבלאות תמחור נוצרו בהצלחה' });
  } catch (err: any) {
    console.error('שגיאה ביצירת טבלאות:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// CRUD - product_catalog (קטלוג מוצרים)
// =====================================================

/** רשימת כל המוצרים */
router.get('/products', async (req: Request, res: Response) => {
  try {
    const { category, material_type, status, search } = req.query;
    let query = 'SELECT * FROM product_catalog WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (category) { query += ` AND category = $${idx++}`; params.push(category); }
    if (material_type) { query += ` AND material_type = $${idx++}`; params.push(material_type); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (search) {
      query += ` AND (product_name ILIKE $${idx} OR product_name_he ILIKE $${idx} OR product_code ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ' ORDER BY category, product_name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** מוצר בודד */
router.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM product_catalog WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'מוצר לא נמצא' });

    // שליפת BOM למוצר
    const bom = await pool.query('SELECT * FROM product_bom WHERE product_id = $1 ORDER BY id', [req.params.id]);
    res.json({ ...result.rows[0], bom: bom.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** יצירת מוצר חדש */
router.post('/products', async (req: Request, res: Response) => {
  try {
    const {
      product_code, product_name, product_name_he, category, material_type,
      description, base_price_per_sqm, image_url, specifications, status
    } = req.body;

    const result = await pool.query(
      `INSERT INTO product_catalog
       (product_code, product_name, product_name_he, category, material_type, description, base_price_per_sqm, image_url, specifications, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [product_code, product_name, product_name_he, category, material_type,
       description, base_price_per_sqm || 0, image_url, specifications || '{}', status || 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** עדכון מוצר */
router.put('/products/:id', async (req: Request, res: Response) => {
  try {
    const fields = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'id') continue;
      sets.push(`${key} = $${idx++}`);
      params.push(value);
    }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE product_catalog SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'מוצר לא נמצא' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** מחיקת מוצר */
router.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM product_catalog WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'מוצר לא נמצא' });
    res.json({ success: true, deleted: result.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// CRUD - product_bom (רשימת חומרים)
// =====================================================

/** BOM למוצר מסוים */
router.get('/bom/:productId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM product_bom WHERE product_id = $1 ORDER BY id',
      [req.params.productId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** הוספת חומר ל-BOM */
router.post('/bom', async (req: Request, res: Response) => {
  try {
    const {
      product_id, material_id, material_name, material_type,
      quantity_per_sqm, unit, unit_cost, waste_factor, notes
    } = req.body;

    const result = await pool.query(
      `INSERT INTO product_bom
       (product_id, material_id, material_name, material_type, quantity_per_sqm, unit, unit_cost, waste_factor, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [product_id, material_id, material_name, material_type,
       quantity_per_sqm, unit || 'unit', unit_cost || 0, waste_factor || 1.05, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** עדכון שורת BOM */
router.put('/bom/:id', async (req: Request, res: Response) => {
  try {
    const fields = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'id') continue;
      sets.push(`${key} = $${idx++}`);
      params.push(value);
    }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE product_bom SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'שורת BOM לא נמצאה' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** מחיקת שורת BOM */
router.delete('/bom/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM product_bom WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'שורת BOM לא נמצאה' });
    res.json({ success: true, deleted: result.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// CRUD - project_costing (תמחור פרויקטים)
// =====================================================

/** רשימת תמחורי פרויקטים */
router.get('/projects', async (req: Request, res: Response) => {
  try {
    const { status, customer_id, salesperson_id, search, limit, offset } = req.query;
    let query = 'SELECT * FROM project_costing WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (customer_id) { query += ` AND customer_id = $${idx++}`; params.push(customer_id); }
    if (salesperson_id) { query += ` AND salesperson_id = $${idx++}`; params.push(salesperson_id); }
    if (search) {
      query += ` AND (project_name ILIKE $${idx} OR customer_name ILIKE $${idx} OR project_number ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ' ORDER BY created_at DESC';
    if (limit) { query += ` LIMIT $${idx++}`; params.push(limit); }
    if (offset) { query += ` OFFSET $${idx++}`; params.push(offset); }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** פרויקט בודד עם פריטים */
router.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM project_costing WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'פרויקט לא נמצא' });

    const items = await pool.query(
      'SELECT * FROM project_costing_items WHERE project_costing_id = $1 ORDER BY id',
      [req.params.id]
    );

    res.json({ ...result.rows[0], itemsList: items.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** יצירת פרויקט תמחור חדש */
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const {
      project_number, customer_id, customer_name, project_name,
      salesperson_name, salesperson_id, status,
      customer_price_excl_vat, vat_rate,
      production_labor_method, production_labor_rate,
      installation_labor_method, installation_labor_rate,
      painting_rate_per_sqm, transport_cost, engineering_cost,
      sales_commission_rate, sales_bonus_rate, overhead_rate,
      target_margin_pct, notes, created_by,
    } = req.body;

    // יצירת מספר פרויקט אוטומטי אם לא סופק
    const projNum = project_number || `PC-${Date.now().toString(36).toUpperCase()}`;

    const result = await pool.query(
      `INSERT INTO project_costing
       (project_number, customer_id, customer_name, project_name,
        salesperson_name, salesperson_id, status,
        customer_price_excl_vat, vat_rate,
        production_labor_method, production_labor_rate,
        installation_labor_method, installation_labor_rate,
        painting_rate_per_sqm, transport_cost, engineering_cost,
        sales_commission_rate, sales_bonus_rate, overhead_rate,
        target_margin_pct, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        projNum, customer_id, customer_name, project_name,
        salesperson_name, salesperson_id, status || 'draft',
        customer_price_excl_vat || 0, vat_rate || 18,
        production_labor_method, production_labor_rate,
        installation_labor_method, installation_labor_rate,
        painting_rate_per_sqm || DEFAULT_PAINTING_RATE_PER_SQM,
        transport_cost || 0, engineering_cost || 0,
        sales_commission_rate || DEFAULT_SALES_COMMISSION_RATE,
        sales_bonus_rate || 0,
        overhead_rate || DEFAULT_OVERHEAD_RATE,
        target_margin_pct || DEFAULT_TARGET_MARGIN,
        notes, created_by,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** עדכון פרויקט */
router.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const fields = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'id' || key === 'itemsList') continue;
      sets.push(`${key} = $${idx++}`);
      params.push(value);
    }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE project_costing SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'פרויקט לא נמצא' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** מחיקת פרויקט */
router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM project_costing WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'פרויקט לא נמצא' });
    res.json({ success: true, deleted: result.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// CRUD - project_costing_items (פריטי פרויקט)
// =====================================================

/** פריטים של פרויקט */
router.get('/project-items/:projectId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM project_costing_items WHERE project_costing_id = $1 ORDER BY id',
      [req.params.projectId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** הוספת פריט לפרויקט */
router.post('/project-items', async (req: Request, res: Response) => {
  try {
    const {
      project_costing_id, product_id, product_name, product_category,
      material_type, width_m, height_m, sqm, quantity, unit_price, total_price, notes
    } = req.body;

    // חישוב שטח
    const calculatedSqm = sqm || (parseFloat(width_m) * parseFloat(height_m)) || 0;
    const qty = quantity || 1;
    const totalSqm = calculatedSqm * qty;
    const calcTotalPrice = total_price || (parseFloat(unit_price || '0') * qty);

    const result = await pool.query(
      `INSERT INTO project_costing_items
       (project_costing_id, product_id, product_name, product_category, material_type,
        width_m, height_m, sqm, quantity, total_sqm, unit_price, total_price, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        project_costing_id, product_id, product_name, product_category, material_type,
        width_m, height_m, calculatedSqm, qty, totalSqm,
        unit_price || 0, calcTotalPrice, notes
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** עדכון פריט */
router.put('/project-items/:id', async (req: Request, res: Response) => {
  try {
    const fields = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'id') continue;
      sets.push(`${key} = $${idx++}`);
      params.push(value);
    }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE project_costing_items SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'פריט לא נמצא' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** מחיקת פריט */
router.delete('/project-items/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM project_costing_items WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'פריט לא נמצא' });
    res.json({ success: true, deleted: result.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// CRUD - supplier_price_index (מחירון ספקים)
// =====================================================

/** רשימת מחירי ספקים */
router.get('/suppliers', async (req: Request, res: Response) => {
  try {
    const { supplier_id, material_id, status, material_category, search } = req.query;
    let query = 'SELECT * FROM supplier_price_index WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (supplier_id) { query += ` AND supplier_id = $${idx++}`; params.push(supplier_id); }
    if (material_id) { query += ` AND material_id = $${idx++}`; params.push(material_id); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (material_category) { query += ` AND material_category = $${idx++}`; params.push(material_category); }
    if (search) {
      query += ` AND (supplier_name ILIKE $${idx} OR material_name ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ' ORDER BY material_name, unit_price ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** מחיר ספק בודד */
router.get('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM supplier_price_index WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'רשומת ספק לא נמצאה' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** הוספת מחיר ספק */
router.post('/suppliers', async (req: Request, res: Response) => {
  try {
    const {
      supplier_id, supplier_name, material_id, material_name, material_category,
      unit_price, currency, min_order_qty, lead_time_days, price_trend, source, notes, status
    } = req.body;

    const result = await pool.query(
      `INSERT INTO supplier_price_index
       (supplier_id, supplier_name, material_id, material_name, material_category,
        unit_price, currency, min_order_qty, lead_time_days, last_updated, price_trend, source, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_DATE,$10,$11,$12,$13) RETURNING *`,
      [
        supplier_id, supplier_name, material_id, material_name, material_category,
        unit_price, currency || 'ILS', min_order_qty, lead_time_days,
        price_trend || 'stable', source, notes, status || 'active'
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** עדכון מחיר ספק */
router.put('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    const fields = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'id') continue;
      sets.push(`${key} = $${idx++}`);
      params.push(value);
    }
    sets.push(`updated_at = NOW()`);
    sets.push(`last_updated = CURRENT_DATE`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE supplier_price_index SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'רשומת ספק לא נמצאה' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** מחיקת מחיר ספק */
router.delete('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM supplier_price_index WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'רשומת ספק לא נמצאה' });
    res.json({ success: true, deleted: result.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// נתיבים מתקדמים - חישובים וניתוחים
// =====================================================

/**
 * חישוב עלות פרויקט מלא
 * POST /calculate/:projectId
 */
router.post('/calculate/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ error: 'מזהה פרויקט לא תקין' });

    const breakdown = await calculateProjectCost(projectId);
    res.json({
      success: true,
      message: 'חישוב תמחור בוצע בהצלחה',
      breakdown,
    });
  } catch (err: any) {
    console.error('שגיאה בחישוב תמחור:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * השוואת מודלי תשלום לעובדים/קבלנים
 * POST /compare-labor-models
 * body: { projectValue, totalSqm, percentRate, sqmRate }
 */
router.post('/compare-labor-models', async (req: Request, res: Response) => {
  try {
    const { projectValue, totalSqm, percentRate, sqmRate } = req.body;

    if (!projectValue || !totalSqm || !percentRate || !sqmRate) {
      return res.status(400).json({
        error: 'נדרשים: projectValue, totalSqm, percentRate, sqmRate',
      });
    }

    const comparison = compareWorkerModels(
      parseFloat(projectValue),
      parseFloat(totalSqm),
      parseFloat(percentRate),
      parseFloat(sqmRate)
    );

    res.json({
      success: true,
      comparison,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * מציאת מחיר ספק הכי זול
 * GET /best-price/:materialId?quantity=100
 */
router.get('/best-price/:materialId', async (req: Request, res: Response) => {
  try {
    const materialId = parseInt(req.params.materialId);
    const quantity = parseFloat(req.query.quantity as string) || 1;

    if (isNaN(materialId)) return res.status(400).json({ error: 'מזהה חומר לא תקין' });

    const result = await findBestSupplierPrice(materialId, quantity);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * ניתוח תרחישים
 * POST /scenario-analysis/:projectId
 * body: { scenarios: [{ name, nameHe, materialCostChange, laborCostChange, priceChange, paintingCostChange }] }
 */
router.post('/scenario-analysis/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ error: 'מזהה פרויקט לא תקין' });

    // תרחישים ברירת מחדל אם לא סופקו
    const defaultScenarios: Scenario[] = [
      { name: 'Material +10%', nameHe: 'עליית חומרים 10%', materialCostChange: 10 },
      { name: 'Material +20%', nameHe: 'עליית חומרים 20%', materialCostChange: 20 },
      { name: 'Material -10%', nameHe: 'ירידת חומרים 10%', materialCostChange: -10 },
      { name: 'Labor +15%', nameHe: 'עליית עבודה 15%', laborCostChange: 15 },
      { name: 'Price -5%', nameHe: 'הנחה 5%', priceChange: -5 },
      { name: 'Price -10%', nameHe: 'הנחה 10%', priceChange: -10 },
      { name: 'Worst Case', nameHe: 'תרחיש גרוע', materialCostChange: 15, laborCostChange: 10, priceChange: -5 },
      { name: 'Best Case', nameHe: 'תרחיש אופטימי', materialCostChange: -10, laborCostChange: -5, priceChange: 5 },
    ];

    const scenarios = req.body.scenarios || defaultScenarios;
    const results = await generateScenarioAnalysis(projectId, scenarios);

    res.json({
      success: true,
      projectId,
      scenarioCount: results.length,
      results,
    });
  } catch (err: any) {
    console.error('שגיאה בניתוח תרחישים:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * רווח יומי - סיכום כל הפרויקטים הפעילים
 * GET /daily-profit
 */
router.get('/daily-profit', async (_req: Request, res: Response) => {
  try {
    const result = await calculateDailyProfit();
    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('שגיאה בחישוב רווח יומי:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * לוח מרווחים - סקירה כללית של כל הפרויקטים
 * GET /margin-dashboard
 */
router.get('/margin-dashboard', async (_req: Request, res: Response) => {
  try {
    // סיכום כללי לפי סטטוס
    const byStatusResult = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(customer_price_excl_vat) as total_revenue,
        SUM(total_cost) as total_cost,
        SUM(net_profit) as total_profit,
        AVG(net_margin_pct) as avg_margin,
        AVG(gross_margin_pct) as avg_gross_margin,
        SUM(total_sqm) as total_sqm
      FROM project_costing
      GROUP BY status
      ORDER BY status
    `);

    // טופ 10 פרויקטים רווחיים
    const topProfitableResult = await pool.query(`
      SELECT id, project_number, customer_name, project_name,
             customer_price_excl_vat, total_cost, net_profit, net_margin_pct, total_sqm, status
      FROM project_costing
      WHERE net_profit IS NOT NULL AND status != 'cancelled'
      ORDER BY net_profit DESC
      LIMIT 10
    `);

    // פרויקטים עם רווחיות נמוכה (התראה)
    const lowMarginResult = await pool.query(`
      SELECT id, project_number, customer_name, project_name,
             customer_price_excl_vat, total_cost, net_profit, net_margin_pct, status
      FROM project_costing
      WHERE net_margin_pct < 10 AND net_margin_pct IS NOT NULL
        AND status IN ('draft', 'quoted', 'approved', 'in_production')
      ORDER BY net_margin_pct ASC
      LIMIT 10
    `);

    // ניתוח לפי סוג חומר
    const byMaterialResult = await pool.query(`
      SELECT
        pci.material_type,
        COUNT(DISTINCT pc.id) as projects,
        SUM(pci.total_sqm) as total_sqm,
        AVG(pc.net_margin_pct) as avg_margin
      FROM project_costing_items pci
      JOIN project_costing pc ON pc.id = pci.project_costing_id
      WHERE pc.status != 'cancelled'
      GROUP BY pci.material_type
      ORDER BY total_sqm DESC
    `);

    // ניתוח לפי קטגוריית מוצר
    const byCategoryResult = await pool.query(`
      SELECT
        pci.product_category,
        COUNT(DISTINCT pc.id) as projects,
        SUM(pci.total_sqm) as total_sqm,
        SUM(pci.total_price) as total_revenue,
        AVG(pc.net_margin_pct) as avg_margin
      FROM project_costing_items pci
      JOIN project_costing pc ON pc.id = pci.project_costing_id
      WHERE pc.status != 'cancelled' AND pci.product_category IS NOT NULL
      GROUP BY pci.product_category
      ORDER BY total_revenue DESC
    `);

    // סיכום חודשי (6 חודשים אחרונים)
    const monthlyResult = await pool.query(`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as projects,
        SUM(customer_price_excl_vat) as revenue,
        SUM(total_cost) as costs,
        SUM(net_profit) as profit,
        AVG(net_margin_pct) as avg_margin
      FROM project_costing
      WHERE created_at >= NOW() - INTERVAL '6 months'
        AND status != 'cancelled'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
    `);

    res.json({
      success: true,
      byStatus: byStatusResult.rows,
      topProfitable: topProfitableResult.rows,
      lowMarginAlerts: lowMarginResult.rows,
      byMaterial: byMaterialResult.rows,
      byCategory: byCategoryResult.rows,
      monthlyTrend: monthlyResult.rows,
    });
  } catch (err: any) {
    console.error('שגיאה בלוח מרווחים:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ניתוח מרווח מפורט לפרויקט בודד
 * GET /margin-analysis/:projectId
 */
router.get('/margin-analysis/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ error: 'מזהה פרויקט לא תקין' });

    const analysis = await getMarginAnalysis(projectId);
    res.json({ success: true, analysis });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// ייצוא
// =====================================================

export default router;

export {
  calculateProjectCost,
  compareWorkerModels,
  findBestSupplierPrice,
  generateScenarioAnalysis,
  calculateDailyProfit,
  getMarginAnalysis,
  createTables,
};
