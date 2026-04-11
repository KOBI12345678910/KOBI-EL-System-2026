/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   PURCHASING ENGINE — מנוע רכש                                        ║
 * ║                                                                        ║
 * ║   3 מאגרים מחוברים:                                                   ║
 * ║   • חומרי גלם (Raw Materials) — ברזל, פלדה, צבע, בורגים...          ║
 * ║   • מוצרים (Products) — מעקה בטיחות, שער כניסה, פרגולה...           ║
 * ║   • BOM — כל מוצר = רשימת חומרי גלם (מה שמכניסים לפרויקט)          ║
 * ║                                                                        ║
 * ║   בכל פרויקט חובה לציין אילו חומרי גלם נכנסים אליו                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type MaterialCategory =
  | 'ברזל'
  | 'פלדה'
  | 'אלומיניום'
  | 'נירוסטה'
  | 'צבע'
  | 'חומרי_ריתוך'
  | 'אמלר'
  | 'ברגים_ומסמרים'
  | 'אבזרים'
  | 'בטיחות'
  | 'אריזה'
  | 'כלי_עבודה'
  | 'חשמל'
  | 'אחר';

export type MaterialUnit =
  | 'ק"ג'
  | 'מטר'
  | 'מטר מרובע'
  | 'מטר קובי'
  | 'יחידה'
  | 'ליטר'
  | 'גרם'
  | 'שעה'
  | 'צרור'
  | 'גליל';

export type ProductCategory =
  | 'מעקות'
  | 'שערים'
  | 'גדרות'
  | 'פרגולות'
  | 'חיפויים'
  | 'דלתות'
  | 'חלונות'
  | 'מסגרות'
  | 'אחר';

// חומר גלם — פריט במחסן
export interface RawMaterial {
  id: string;
  /** קוד פנימי (למשל: BRZ-001) */
  code: string;
  /** שם החומר */
  name: string;
  /** קטגוריה */
  category: MaterialCategory;
  /** תיאור מפורט */
  description: string;
  /** יחידת מידה */
  unit: MaterialUnit;
  /** עלות ליחידה (₪) */
  costPerUnit: number;
  /** מחיר מכירה ליחידה (אם מוכרים בנפרד) */
  salePrice?: number;
  /** ספק ראשי */
  supplier: string;
  /** טלפון ספק */
  supplierPhone?: string;
  /** מלאי זמין */
  stockQty: number;
  /** רמת התראה (כשצונחים מתחת — התראה) */
  reorderLevel: number;
  /** כמות הזמנה מומלצת */
  reorderQty: number;
  /** זמן אספקה (ימים) */
  leadTimeDays: number;
  /** תמונה (URL / base64) */
  imageUrl?: string;
  /** מפרט טכני */
  specs?: string;
  /** מיקום במחסן */
  location?: string;
  /** תאריך יצירה */
  createdAt: string;
  /** עדכון אחרון */
  updatedAt: string;
  /** פעיל */
  active: boolean;
  /** הערות */
  notes?: string;
}

// BOM — רשימת חומרים למוצר
export interface BOMLine {
  rawMaterialId: string;
  /** כמות נדרשת ליחידת מוצר */
  quantityPerUnit: number;
  /** פחת % (waste factor) */
  wastePercent: number;
  /** האם קריטי (אם חסר — לא מייצרים) */
  critical: boolean;
  notes?: string;
}

// מוצר — מה שמכינים/מוכרים ללקוח
export interface Product {
  id: string;
  /** קוד פנימי */
  code: string;
  /** שם המוצר */
  name: string;
  /** קטגוריה */
  category: ProductCategory;
  /** תיאור */
  description: string;
  /** תמונה ראשית (URL / base64) */
  imageUrl: string;
  /** תמונות נוספות */
  additionalImages?: string[];
  /** מפרט טכני */
  specifications: string;
  /** יחידת מידה */
  unit: 'יחידה' | 'מטר' | 'מטר מרובע' | 'סט';
  /** מחיר מכירה ללקוח */
  salePrice: number;
  /** BOM — חומרי הגלם שנכנסים למוצר */
  bom: BOMLine[];
  /** עלות ייצור (מחושבת מה-BOM) */
  computedCost: number;
  /** שולי רווח (%) */
  marginPercent: number;
  /** זמן ייצור (שעות) */
  productionHours: number;
  /** פעיל */
  active: boolean;
  /** תאריך יצירה */
  createdAt: string;
  /** עדכון אחרון */
  updatedAt: string;
}

// חומר גלם המשויך לפרויקט (חובה!)
export interface ProjectMaterial {
  id: string;
  projectId: string;
  /** חומר גלם ישיר או דרך מוצר */
  sourceType: 'raw' | 'product';
  /** אם raw — rawMaterialId; אם product — productId */
  sourceId: string;
  /** שם לתצוגה */
  name: string;
  /** כמות */
  quantity: number;
  /** יחידת מידה */
  unit: string;
  /** עלות ליחידה */
  costPerUnit: number;
  /** עלות כוללת */
  totalCost: number;
  /** הערות */
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE KEYS
// ═══════════════════════════════════════════════════════════════════════════

const KEYS = {
  rawMaterials: 'tk_raw_materials',
  products: 'tk_products',
  projectMaterials: 'tk_project_materials',
};

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, list: T[]): void {
  localStorage.setItem(key, JSON.stringify(list));
}

// ═══════════════════════════════════════════════════════════════════════════
// RAW MATERIALS REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const RawMaterialRegistry = {
  getAll(): RawMaterial[] {
    return load<RawMaterial>(KEYS.rawMaterials);
  },

  get(id: string): RawMaterial | undefined {
    return this.getAll().find(m => m.id === id);
  },

  getByCode(code: string): RawMaterial | undefined {
    return this.getAll().find(m => m.code === code);
  },

  getByCategory(category: MaterialCategory): RawMaterial[] {
    return this.getAll().filter(m => m.category === category && m.active);
  },

  add(params: Omit<RawMaterial, 'id' | 'createdAt' | 'updatedAt' | 'active'>): RawMaterial {
    const now = new Date().toISOString();
    const material: RawMaterial = {
      ...params,
      id: `rm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const list = this.getAll();
    list.push(material);
    save(KEYS.rawMaterials, list);
    return material;
  },

  update(id: string, updates: Partial<RawMaterial>): RawMaterial | undefined {
    const list = this.getAll();
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) return undefined;
    list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
    save(KEYS.rawMaterials, list);
    return list[idx];
  },

  remove(id: string): void {
    const list = this.getAll().filter(m => m.id !== id);
    save(KEYS.rawMaterials, list);
  },

  /** הפחתת מלאי */
  consume(id: string, qty: number): boolean {
    const material = this.get(id);
    if (!material) return false;
    if (material.stockQty < qty) return false;
    this.update(id, { stockQty: material.stockQty - qty });
    return true;
  },

  /** הוספת מלאי (רכישה) */
  restock(id: string, qty: number): void {
    const material = this.get(id);
    if (!material) return;
    this.update(id, { stockQty: material.stockQty + qty });
  },

  /** חומרים שמלאי נמוך */
  getLowStock(): RawMaterial[] {
    return this.getAll().filter(m => m.active && m.stockQty <= m.reorderLevel);
  },

  /** שווי כולל של המלאי */
  getInventoryValue(): number {
    return this.getAll()
      .filter(m => m.active)
      .reduce((sum, m) => sum + m.stockQty * m.costPerUnit, 0);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const ProductRegistry = {
  getAll(): Product[] {
    return load<Product>(KEYS.products);
  },

  get(id: string): Product | undefined {
    return this.getAll().find(p => p.id === id);
  },

  getByCategory(category: ProductCategory): Product[] {
    return this.getAll().filter(p => p.category === category && p.active);
  },

  /** חישוב עלות אוטומטי מה-BOM */
  computeCost(bom: BOMLine[]): number {
    let total = 0;
    for (const line of bom) {
      const material = RawMaterialRegistry.get(line.rawMaterialId);
      if (!material) continue;
      const effectiveQty = line.quantityPerUnit * (1 + line.wastePercent / 100);
      total += effectiveQty * material.costPerUnit;
    }
    return Math.round(total * 100) / 100;
  },

  add(params: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'active' | 'computedCost'>): Product {
    const now = new Date().toISOString();
    const computedCost = this.computeCost(params.bom);
    const product: Product = {
      ...params,
      id: `prd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      active: true,
      computedCost,
      createdAt: now,
      updatedAt: now,
    };
    const list = this.getAll();
    list.push(product);
    save(KEYS.products, list);
    return product;
  },

  update(id: string, updates: Partial<Product>): Product | undefined {
    const list = this.getAll();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return undefined;
    const merged = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
    // Re-compute cost if BOM changed
    if (updates.bom) {
      merged.computedCost = this.computeCost(updates.bom);
    }
    list[idx] = merged;
    save(KEYS.products, list);
    return list[idx];
  },

  remove(id: string): void {
    const list = this.getAll().filter(p => p.id !== id);
    save(KEYS.products, list);
  },

  /** קבלת BOM מפורטת עם שמות חומרים */
  getBOMDetails(productId: string): Array<{
    material: RawMaterial;
    quantityPerUnit: number;
    wastePercent: number;
    effectiveQty: number;
    cost: number;
    critical: boolean;
  }> {
    const product = this.get(productId);
    if (!product) return [];
    return product.bom
      .map(line => {
        const material = RawMaterialRegistry.get(line.rawMaterialId);
        if (!material) return null;
        const effectiveQty = line.quantityPerUnit * (1 + line.wastePercent / 100);
        return {
          material,
          quantityPerUnit: line.quantityPerUnit,
          wastePercent: line.wastePercent,
          effectiveQty,
          cost: effectiveQty * material.costPerUnit,
          critical: line.critical,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  },

  /** האם ניתן לייצר כמות X של המוצר (יש מספיק מלאי) */
  canProduce(productId: string, quantity: number): {
    canProduce: boolean;
    shortages: Array<{ materialName: string; needed: number; available: number }>;
  } {
    const product = this.get(productId);
    if (!product) return { canProduce: false, shortages: [] };

    const shortages: Array<{ materialName: string; needed: number; available: number }> = [];

    for (const line of product.bom) {
      const material = RawMaterialRegistry.get(line.rawMaterialId);
      if (!material) continue;
      const effectiveQty = line.quantityPerUnit * (1 + line.wastePercent / 100);
      const needed = effectiveQty * quantity;
      if (material.stockQty < needed) {
        shortages.push({
          materialName: material.name,
          needed,
          available: material.stockQty,
        });
      }
    }

    return { canProduce: shortages.length === 0, shortages };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT MATERIALS — חומרי גלם לפרויקט (חובה)
// ═══════════════════════════════════════════════════════════════════════════

export const ProjectMaterialStore = {
  getAll(): ProjectMaterial[] {
    return load<ProjectMaterial>(KEYS.projectMaterials);
  },

  getByProject(projectId: string): ProjectMaterial[] {
    return this.getAll().filter(pm => pm.projectId === projectId);
  },

  /** הוספת חומר גלם ישיר לפרויקט */
  addRawMaterial(projectId: string, rawMaterialId: string, quantity: number, notes?: string): ProjectMaterial {
    const material = RawMaterialRegistry.get(rawMaterialId);
    if (!material) throw new Error('חומר גלם לא נמצא');

    const pm: ProjectMaterial = {
      id: `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      sourceType: 'raw',
      sourceId: rawMaterialId,
      name: material.name,
      quantity,
      unit: material.unit,
      costPerUnit: material.costPerUnit,
      totalCost: Math.round(material.costPerUnit * quantity * 100) / 100,
      notes,
    };

    const list = this.getAll();
    list.push(pm);
    save(KEYS.projectMaterials, list);
    return pm;
  },

  /** הוספת מוצר לפרויקט (BOM מתפרק אוטומטית לחומרי גלם) */
  addProduct(projectId: string, productId: string, productQuantity: number, notes?: string): ProjectMaterial[] {
    const product = ProductRegistry.get(productId);
    if (!product) throw new Error('מוצר לא נמצא');

    const list = this.getAll();
    const results: ProjectMaterial[] = [];

    // הוסף שורה מסכמת למוצר עצמו
    const productPm: ProjectMaterial = {
      id: `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      sourceType: 'product',
      sourceId: productId,
      name: `${product.name} (מוצר)`,
      quantity: productQuantity,
      unit: product.unit,
      costPerUnit: product.computedCost,
      totalCost: Math.round(product.computedCost * productQuantity * 100) / 100,
      notes: notes ?? `כולל ${product.bom.length} חומרי גלם`,
    };
    list.push(productPm);
    results.push(productPm);

    save(KEYS.projectMaterials, list);
    return results;
  },

  update(id: string, updates: Partial<ProjectMaterial>): ProjectMaterial | undefined {
    const list = this.getAll();
    const idx = list.findIndex(pm => pm.id === id);
    if (idx === -1) return undefined;
    const merged = { ...list[idx], ...updates };
    if (updates.quantity !== undefined || updates.costPerUnit !== undefined) {
      merged.totalCost = Math.round(merged.quantity * merged.costPerUnit * 100) / 100;
    }
    list[idx] = merged;
    save(KEYS.projectMaterials, list);
    return list[idx];
  },

  remove(id: string): void {
    const list = this.getAll().filter(pm => pm.id !== id);
    save(KEYS.projectMaterials, list);
  },

  /** סיכום עלויות חומרי גלם לפרויקט */
  getProjectTotalCost(projectId: string): number {
    return this.getByProject(projectId).reduce((sum, pm) => sum + pm.totalCost, 0);
  },

  /** האם לפרויקט יש חומרי גלם מוגדרים (ולידציה חובה) */
  hasRequiredMaterials(projectId: string): boolean {
    return this.getByProject(projectId).length > 0;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER — סיד דמו
// ═══════════════════════════════════════════════════════════════════════════

/** אוכלוסיית הדגמה — רק אם המאגרים ריקים */
export function seedDemoData(): void {
  if (RawMaterialRegistry.getAll().length > 0) return;

  // חומרי גלם
  const brzProfile = RawMaterialRegistry.add({
    code: 'BRZ-001',
    name: 'פרופיל ברזל 40×40 מ"מ',
    category: 'ברזל',
    description: 'פרופיל ברזל מרובע 40×40×2 מ"מ, אורך 6 מטר',
    unit: 'מטר',
    costPerUnit: 22,
    salePrice: 35,
    supplier: 'מתכת דרום בע"מ',
    supplierPhone: '+972-8-9876543',
    stockQty: 250,
    reorderLevel: 50,
    reorderQty: 200,
    leadTimeDays: 3,
    imageUrl: '',
    specs: 'גלבון: 80 מיקרון, תקן IS 4466',
    location: 'מחסן A - מדף 3',
  });

  const welding = RawMaterialRegistry.add({
    code: 'WLD-001',
    name: 'אלקטרודות 3.2 מ"מ E6013',
    category: 'חומרי_ריתוך',
    description: 'אלקטרודות ריתוך רותייל, קוטר 3.2 מ"מ, אריזה 5 ק"ג',
    unit: 'ק"ג',
    costPerUnit: 18,
    supplier: 'ריתוך ישראל',
    stockQty: 35,
    reorderLevel: 10,
    reorderQty: 25,
    leadTimeDays: 2,
    imageUrl: '',
    location: 'מחסן B - ארון 1',
  });

  const paint = RawMaterialRegistry.add({
    code: 'PNT-001',
    name: 'צבע אפוקסי שחור',
    category: 'צבע',
    description: 'צבע אפוקסי שחור 2 קומפוננטות, מיועד למעקות חוץ',
    unit: 'ליטר',
    costPerUnit: 65,
    supplier: 'טמבור',
    stockQty: 45,
    reorderLevel: 15,
    reorderQty: 30,
    leadTimeDays: 1,
    imageUrl: '',
    location: 'מחסן חומ"ס',
  });

  // מוצר דמו
  ProductRegistry.add({
    code: 'MEK-100',
    name: 'מעקה בטיחות סטנדרטי (מטר אורך)',
    category: 'מעקות',
    description: 'מעקה ברזל בגובה 105 ס"מ, צבוע אפוקסי שחור',
    imageUrl: 'https://via.placeholder.com/300x200.png?text=מעקה+ברזל',
    specifications: 'גובה: 105 ס"מ | מרחק בין שלבים: 10 ס"מ | תקן ישראלי 1142',
    unit: 'מטר',
    salePrice: 450,
    bom: [
      { rawMaterialId: brzProfile.id, quantityPerUnit: 4, wastePercent: 10, critical: true },
      { rawMaterialId: welding.id, quantityPerUnit: 0.3, wastePercent: 5, critical: true },
      { rawMaterialId: paint.id, quantityPerUnit: 0.15, wastePercent: 8, critical: false },
    ],
    marginPercent: 45,
    productionHours: 1.5,
  });
}
