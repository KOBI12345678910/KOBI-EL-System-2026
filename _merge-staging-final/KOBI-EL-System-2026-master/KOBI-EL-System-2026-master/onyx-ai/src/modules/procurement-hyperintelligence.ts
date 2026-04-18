/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   ONYX PROCUREMENT HYPERINTELLIGENCE                                  ║
 * ║   מערכת רכש חכמה אוטונומית — טכנו כל עוזי                             ║
 * ║                                                                        ║
 * ║   12 מודולים שעובדים ביחד לכיסוי מלא של מחזור הרכש                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *  Canonical Node version. Uses Node's `crypto.randomBytes` for id generation.
 *  Browser port lives at: techno-kol-ops/client/src/engines/procurementEngine.ts
 *  Philosophy: לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade and grow.
 *
 *  Sub-engines:
 *    1. SupplierIntelligenceEngine   — 6-factor dynamic risk scoring
 *    2. DemandPredictionEngine       — EOQ (Wilson), safety stock, reorder point
 *    3. NegotiationBot               — strategy picker + Hebrew message templates
 *    4. ReverseAuctionEngine         — auto-extend reverse auctions
 *    5. SmartBundlingEngine          — category-based order merging
 *    6. AutoReorderEngine            — cooldown + approval thresholds
 *    7. ContractLifecycleEngine      — prices / SLA / expiry
 *    8. QualityGateEngine            — QC scoring + actions
 *    9. SpendAnalyticsEngine         — forensic spend analysis
 *
 *  Killer feature: `intelligentOrder()` — AI auto-picks the best procurement path.
 */

import * as crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — ספקים / מוצרים / הזמנות / חוזים / משא-ומתן / מכרזים / ...
// ═══════════════════════════════════════════════════════════════════════════

export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'confirmed'
  | 'in_transit'
  | 'received'
  | 'qc_pending'
  | 'qc_passed'
  | 'qc_failed'
  | 'invoiced'
  | 'paid'
  | 'closed'
  | 'cancelled';

export type NegotiationStrategy =
  | 'aggressive'
  | 'collaborative'
  | 'competitive'
  | 'volume'
  | 'relationship'
  | 'time_pressure';

export type RiskBand = 'preferred' | 'approved' | 'watch' | 'avoid';

export interface SupplierRiskFactors {
  financial: number;      // 0-100 — איתנות פיננסית
  delivery: number;       // 0-100 — אמינות אספקה
  quality: number;        // 0-100 — איכות מוצרים
  concentration: number;  // 0-100 — ריכוזיות (ציון הפוך לאחוז ההוצאה)
  response: number;       // 0-100 — זמן תגובה
  geopolitical: number;   // 0-100 — סיכון גיאו-פוליטי
}

export interface SupplierScore {
  supplierId: string;
  overall: number;         // 0-100
  band: RiskBand;
  factors: SupplierRiskFactors;
  calculatedAt: string;
  notes: string[];
}

export interface SupplierPricePoint {
  productId: string;
  unitPrice: number;
  currency: string;
  recordedAt: string;
  source: 'quote' | 'po' | 'contract' | 'market';
}

export interface Supplier {
  id: string;
  name: string;
  legalName?: string;
  taxId?: string;
  country: string;
  categories: string[];             // קטגוריות מוצר שהספק מטפל בהן
  contactEmail?: string;
  contactPhone?: string;
  paymentTermsDays: number;         // שוטף + X
  currency: string;                 // ILS / USD / EUR ...
  // raw metrics used by risk scoring
  creditRating?: 'A' | 'B' | 'C' | 'D';
  financialHealth: number;          // 0-100
  onTimeDeliveryRate: number;       // 0-1
  defectRate: number;               // 0-1
  returnRate: number;               // 0-1
  avgResponseHours: number;
  countryRiskScore: number;         // 0-100 (0 = safe)
  // history caches
  priceHistory: SupplierPricePoint[];
  totalSpend: number;               // סה"כ הוצאה עד היום
  pastPurchasesCount: number;
  lastPurchaseAt?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  isActive: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  subcategory: string;
  unit: string;                     // יח' / ק"ג / מ' ...
  currentStock: number;
  reorderPoint: number;
  safetyStock: number;
  annualDemand: number;
  leadTimeDays: number;
  leadTimeStdDev: number;           // סטיית תקן של זמן האספקה (ימים)
  orderingCost: number;             // S — עלות הוצאת הזמנה
  holdingCostPerUnit: number;       // H — עלות החזקה ליחידה בשנה
  lastUnitPrice: number;
  preferredSupplierIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface POLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  lineTotal: number;
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  status: POStatus;
  lines: POLine[];
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
  expectedDeliveryAt?: string;
  receivedAt?: string;
  notes?: string;
  contractId?: string;
  auctionId?: string;
  bundleId?: string;
  negotiationId?: string;
  source: 'manual' | 'auto_reorder' | 'bundling' | 'auction' | 'negotiation' | 'contract';
}

export interface ContractTerm {
  productId: string;
  sku: string;
  unitPrice: number;
  currency: string;
  minimumAnnualQuantity?: number;
  maximumAnnualQuantity?: number;
  leadTimeDays: number;
}

export interface Contract {
  id: string;
  contractNumber: string;
  supplierId: string;
  startDate: string;            // ISO
  endDate: string;              // ISO
  currency: string;
  totalValue: number;
  terms: ContractTerm[];
  slaOnTimePct: number;         // אחוז אספקה בזמן שדרוש (0-1)
  slaDefectPct: number;         // אחוז פגומים מקסימלי (0-1)
  slaResponseHours: number;
  penaltiesClause?: string;
  autoRenewal: boolean;
  status: 'draft' | 'active' | 'suspended' | 'expired' | 'terminated';
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface NegotiationMessage {
  id: string;
  sessionId: string;
  sender: 'bot' | 'supplier' | 'human';
  body: string;
  at: string;
  priceOffered?: number;
  quantityOffered?: number;
}

export interface NegotiationSession {
  id: string;
  supplierId: string;
  productId: string;
  quantity: number;
  targetPrice: number;
  ceilingPrice: number;
  currency: string;
  strategy: NegotiationStrategy;
  status: 'open' | 'agreed' | 'failed' | 'cancelled';
  messages: NegotiationMessage[];
  createdAt: string;
  closedAt?: string;
  finalPrice?: number;
  savings?: number;
}

export interface AuctionBid {
  id: string;
  auctionId: string;
  supplierId: string;
  unitPrice: number;
  at: string;
  validUntil?: string;
}

export interface ReverseAuction {
  id: string;
  productId: string;
  quantity: number;
  currency: string;
  ceilingPrice: number;              // מחיר תקרה — לא מעליו
  startAt: string;
  endAt: string;
  status: 'scheduled' | 'open' | 'closing' | 'closed' | 'cancelled';
  participantIds: string[];
  bids: AuctionBid[];
  winningBidId?: string;
  extensionsUsed: number;
  maxExtensions: number;
  extensionMinutes: number;
  savingsEstimate?: number;
  createdBy: string;
  createdAt: string;
  notes?: string;
}

export interface BundlingCandidate {
  id: string;
  category: string;
  subcategory: string;
  createdAt: string;
  linesQueued: Array<{
    productId: string;
    sku: string;
    quantity: number;
    requestedBy: string;
    expectedUnitPrice: number;
    queuedAt: string;
  }>;
  totalValue: number;
  supplierIdHint?: string;
  status: 'queued' | 'ready' | 'merged' | 'expired' | 'cancelled';
  mergedPoId?: string;
  expectedDiscountPct: number;       // הנחת כמות צפויה
}

export interface AutoReorderRule {
  id: string;
  productId: string;
  enabled: boolean;
  cooldownHours: number;             // לא להזמין פעמיים תוך X שעות
  approvalThreshold: number;         // מעל סכום זה — דרוש אישור אנושי
  preferredSupplierId?: string;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
  triggeredCount: number;
}

export interface QualityCheck {
  id: string;
  purchaseOrderId: string;
  productId: string;
  quantityReceived: number;
  quantityPassed: number;
  quantityRejected: number;
  qualityScore: number;              // 0-100
  defectReasons: string[];
  action: 'accept' | 'return' | 'credit' | 'replace' | 'partial_accept';
  inspectedBy: string;
  inspectedAt: string;
  notes?: string;
}

export interface SpendAnalysis {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  totalSpend: number;
  currency: string;
  byCategory: Record<string, number>;
  bySupplier: Record<string, number>;
  byMonth: Record<string, number>;
  savingsBreakdown: {
    fromAuctions: number;
    fromBundling: number;
    fromNegotiation: number;
    fromContracts: number;
    fromAutoReorder: number;
  };
  topSuppliers: Array<{ supplierId: string; amount: number; pct: number }>;
  riskHotspots: Array<{ supplierId: string; reason: string; severity: 'low' | 'medium' | 'high' }>;
}

export interface DemandForecast {
  productId: string;
  horizonDays: number;
  baseline: number;                  // ממוצע יומי
  trend: number;                     // יחידות לשבוע (חיובי=עלייה)
  seasonalityIndex: number;          // 1.0 = ניטרלי
  forecastDaily: number[];           // טור חיזוי
  confidenceLo: number;
  confidenceHi: number;
  generatedAt: string;
}

export interface EOQResult {
  productId: string;
  eoq: number;                       // Q* אופטימלי
  annualOrders: number;              // D/Q*
  totalOrderingCost: number;
  totalHoldingCost: number;
  totalCost: number;                 // עלות שנתית כוללת
  safetyStock: number;
  reorderPoint: number;
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS — ברירות מחדל, משקלי סיכון, רמות שירות
// ═══════════════════════════════════════════════════════════════════════════

export const RISK_WEIGHTS = {
  financial: 0.25,
  delivery: 0.20,
  quality: 0.20,
  concentration: 0.10,
  response: 0.15,
  geopolitical: 0.10,
} as const;

export const RISK_BANDS: Array<{ min: number; band: RiskBand; label: string }> = [
  { min: 80, band: 'preferred', label: 'ספק מועדף' },
  { min: 60, band: 'approved',  label: 'ספק מאושר' },
  { min: 40, band: 'watch',     label: 'במעקב' },
  { min: 0,  band: 'avoid',     label: 'לא לרכוש' },
];

export const SERVICE_LEVEL_Z = 1.65; // Z עבור 95% רמת שירות

export const DEFAULT_BUNDLING_WAIT_HOURS = 24;
export const DEFAULT_BUNDLING_THRESHOLD = 15000;
export const DEFAULT_AUTO_REORDER_COOLDOWN_HOURS = 48;
export const DEFAULT_AUTO_REORDER_APPROVAL_THRESHOLD = 25000;
export const DEFAULT_AUCTION_EXTENSION_MINUTES = 2;
export const DEFAULT_AUCTION_MAX_EXTENSIONS = 3;
export const DEFAULT_AUCTION_LAST_BID_WINDOW_SECONDS = 120;
export const DEFAULT_LARGE_ORDER_THRESHOLD = 100000;

export const NEGOTIATION_TEMPLATES: Record<NegotiationStrategy, string> = {
  aggressive: 'שלום, אנחנו בוחנים ספקים נוספים לפריט {product}. הצעתנו: {targetPrice}. אם תוכלו להתיישר, נוכל לסגור היום.',
  collaborative: 'שלום {supplier}, נמשיך לעבוד איתכם. האם תוכלו לבחון הפחתת מחיר של 5-8% בתמורה להתחייבות שנתית?',
  volume: 'במסגרת הגדלת הזמנות ל-{quantity} יחידות לרבעון, מבקשים מחיר מדרגתי',
  competitive: 'קיבלנו X הצעות לפריט {product}. המחיר הכי טוב: {bestPrice}. אנא הודיעו אם תוכלו לעמוד בזה.',
  relationship: 'שלום {supplier}, אנחנו מעריכים את השותפות. נוכל לדון בחוזה שנתי?',
  time_pressure: 'דחוף: נדרש {product} תוך 48 שעות. מי יכול?',
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILS — id generation, iso, clamps
// ═══════════════════════════════════════════════════════════════════════════

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function iso(d: Date = new Date()): string {
  return d.toISOString();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addHoursIso(hours: number, from: Date = new Date()): string {
  return new Date(from.getTime() + hours * 3600_000).toISOString();
}

function hoursSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 3600_000;
}

function bandFor(score: number): RiskBand {
  for (const b of RISK_BANDS) {
    if (score >= b.min) return b.band;
  }
  return 'avoid';
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : sum(xs) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = avg(xs);
  const v = avg(xs.map(x => (x - m) ** 2));
  return Math.sqrt(v);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) SupplierIntelligenceEngine — ניתוח ספקים דינמי
// ═══════════════════════════════════════════════════════════════════════════

export class SupplierIntelligenceEngine {
  readonly suppliers: Map<string, Supplier> = new Map();
  readonly scores: Map<string, SupplierScore> = new Map();
  private totalSpendCache = 0;

  registerSupplier(
    data: Omit<Supplier, 'id' | 'priceHistory' | 'totalSpend' | 'pastPurchasesCount' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      priceHistory?: SupplierPricePoint[];
      totalSpend?: number;
      pastPurchasesCount?: number;
    }
  ): Supplier {
    const id = data.id ?? uid('sup');
    const now = iso();
    const s: Supplier = {
      ...data,
      id,
      priceHistory: data.priceHistory ?? [],
      totalSpend: data.totalSpend ?? 0,
      pastPurchasesCount: data.pastPurchasesCount ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.suppliers.set(id, s);
    this.totalSpendCache += s.totalSpend;
    this.recomputeScore(id);
    return s;
  }

  updateSupplier(id: string, patch: Partial<Supplier>): Supplier | undefined {
    const s = this.suppliers.get(id);
    if (!s) return undefined;
    const updated: Supplier = { ...s, ...patch, id: s.id, updatedAt: iso() };
    this.suppliers.set(id, updated);
    this.recomputeScore(id);
    return updated;
  }

  recordPricePoint(supplierId: string, point: SupplierPricePoint): void {
    const s = this.suppliers.get(supplierId);
    if (!s) return;
    s.priceHistory.push(point);
    // שומרים רק 200 נקודות אחרונות כדי שהזיכרון לא יתנפח
    if (s.priceHistory.length > 200) s.priceHistory.splice(0, s.priceHistory.length - 200);
    s.updatedAt = iso();
  }

  registerSpend(supplierId: string, amount: number): void {
    const s = this.suppliers.get(supplierId);
    if (!s) return;
    s.totalSpend += amount;
    s.pastPurchasesCount += 1;
    s.lastPurchaseAt = iso();
    this.totalSpendCache += amount;
    s.updatedAt = iso();
    this.recomputeScore(supplierId);
  }

  // ───────────── 6-factor weighted scoring ─────────────
  recomputeScore(supplierId: string): SupplierScore | undefined {
    const s = this.suppliers.get(supplierId);
    if (!s) return undefined;

    // financial — גזור מציון בריאות כלכלית + credit rating
    let financial = clamp(s.financialHealth, 0, 100);
    if (s.creditRating === 'A') financial = Math.min(100, financial + 5);
    if (s.creditRating === 'B') financial = Math.min(100, financial + 0);
    if (s.creditRating === 'C') financial = Math.max(0, financial - 10);
    if (s.creditRating === 'D') financial = Math.max(0, financial - 20);

    // delivery
    const delivery = clamp(s.onTimeDeliveryRate * 100, 0, 100);

    // quality — 100 כשאין פגמים/החזרות
    const quality = clamp(100 - (s.defectRate * 60 + s.returnRate * 40), 0, 100);

    // concentration — ציון הפוך. אם ספק אחד אוכל >30% מההוצאה, סיכון גבוה
    const totalSpend = Math.max(1, this.totalSpendCache);
    const pctOfSpend = s.totalSpend / totalSpend;
    const concentration = clamp(100 - pctOfSpend * 200, 0, 100);

    // response — 100 עד שעה, 0 מעל 72
    const response = clamp(100 - (s.avgResponseHours / 0.72), 0, 100);

    // geopolitical — ציון מדינה (0 בטוח, 100 מסוכן)
    const geopolitical = clamp(100 - s.countryRiskScore, 0, 100);

    const factors: SupplierRiskFactors = {
      financial: round2(financial),
      delivery: round2(delivery),
      quality: round2(quality),
      concentration: round2(concentration),
      response: round2(response),
      geopolitical: round2(geopolitical),
    };

    const overall = round2(
      factors.financial * RISK_WEIGHTS.financial +
      factors.delivery * RISK_WEIGHTS.delivery +
      factors.quality * RISK_WEIGHTS.quality +
      factors.concentration * RISK_WEIGHTS.concentration +
      factors.response * RISK_WEIGHTS.response +
      factors.geopolitical * RISK_WEIGHTS.geopolitical
    );

    const notes: string[] = [];
    if (factors.quality < 60) notes.push('איכות נמוכה — שיעור פגמים גבוה');
    if (factors.delivery < 70) notes.push('אמינות אספקה בעייתית');
    if (factors.concentration < 50) notes.push('ריכוזיות גבוהה — תלות מסוכנת');
    if (factors.response < 50) notes.push('זמן תגובה איטי');
    if (factors.financial < 50) notes.push('איתנות פיננסית מעורערת');

    const score: SupplierScore = {
      supplierId,
      overall,
      band: bandFor(overall),
      factors,
      calculatedAt: iso(),
      notes,
    };
    this.scores.set(supplierId, score);
    return score;
  }

  recomputeAllScores(): void {
    for (const id of this.suppliers.keys()) this.recomputeScore(id);
  }

  getScore(supplierId: string): SupplierScore | undefined {
    return this.scores.get(supplierId);
  }

  findByCategory(category: string): Supplier[] {
    return Array.from(this.suppliers.values()).filter(
      s => s.isActive && s.categories.includes(category)
    );
  }

  countFor(productCategory: string): number {
    return this.findByCategory(productCategory).length;
  }

  rankForCategory(category: string, limit = 10): Array<Supplier & { score: SupplierScore }> {
    return this.findByCategory(category)
      .map(s => ({ ...s, score: this.scores.get(s.id)! }))
      .filter(s => !!s.score)
      .sort((a, b) => b.score.overall - a.score.overall)
      .slice(0, limit);
  }

  topSupplierFor(category: string): (Supplier & { score: SupplierScore }) | undefined {
    return this.rankForCategory(category, 1)[0];
  }

  priceTrend(supplierId: string, productId: string): { last: number; prev: number; deltaPct: number } | undefined {
    const s = this.suppliers.get(supplierId);
    if (!s) return undefined;
    const points = s.priceHistory.filter(p => p.productId === productId).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    if (points.length < 2) return undefined;
    const last = points[points.length - 1].unitPrice;
    const prev = points[points.length - 2].unitPrice;
    const deltaPct = prev === 0 ? 0 : ((last - prev) / prev) * 100;
    return { last, prev, deltaPct: round2(deltaPct) };
  }

  listByBand(band: RiskBand): Supplier[] {
    return Array.from(this.suppliers.values()).filter(s => this.scores.get(s.id)?.band === band);
  }

  deactivate(supplierId: string, reason: string): void {
    const s = this.suppliers.get(supplierId);
    if (!s) return;
    s.isActive = false;
    s.tags.push(`deactivated:${reason}`);
    s.updatedAt = iso();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) DemandPredictionEngine — חיזוי ביקוש + EOQ (Wilson)
// ═══════════════════════════════════════════════════════════════════════════

export class DemandPredictionEngine {
  readonly products: Map<string, Product> = new Map();
  readonly consumptionHistory: Map<string, Array<{ at: string; quantity: number }>> = new Map();
  readonly forecasts: Map<string, DemandForecast> = new Map();
  readonly eoqCache: Map<string, EOQResult> = new Map();

  registerProduct(
    data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Product {
    const id = data.id ?? uid('prd');
    const now = iso();
    const p: Product = { ...data, id, createdAt: now, updatedAt: now };
    this.products.set(id, p);
    this.consumptionHistory.set(id, []);
    return p;
  }

  recordConsumption(productId: string, quantity: number, at: string = iso()): void {
    const list = this.consumptionHistory.get(productId) ?? [];
    list.push({ at, quantity });
    if (list.length > 730) list.splice(0, list.length - 730); // שנתיים מקסימום
    this.consumptionHistory.set(productId, list);
    const p = this.products.get(productId);
    if (p) {
      p.currentStock = Math.max(0, p.currentStock - quantity);
      p.updatedAt = iso();
    }
  }

  recordReceipt(productId: string, quantity: number): void {
    const p = this.products.get(productId);
    if (!p) return;
    p.currentStock += quantity;
    p.updatedAt = iso();
  }

  forecast(productId: string, horizonDays = 30): DemandForecast | undefined {
    const p = this.products.get(productId);
    if (!p) return undefined;
    const hist = this.consumptionHistory.get(productId) ?? [];
    const quantities = hist.map(h => h.quantity);
    const baseline = quantities.length > 0 ? avg(quantities.slice(-30)) : p.annualDemand / 365;

    // trend לינארי פשוט: ממוצע השבוע האחרון פחות ממוצע שבוע לפני זה
    let trend = 0;
    if (quantities.length >= 14) {
      const last7 = avg(quantities.slice(-7));
      const prev7 = avg(quantities.slice(-14, -7));
      trend = last7 - prev7;
    }

    // seasonalityIndex דמי — בפועל יחושב מ-YoY
    const month = new Date().getMonth();
    const seasonalityIndex = [0.95, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.2, 1.1, 1.05, 1.0, 0.9][month];

    const forecastDaily: number[] = [];
    for (let d = 0; d < horizonDays; d++) {
      const trendContribution = (trend / 7) * d;
      const val = Math.max(0, (baseline + trendContribution) * seasonalityIndex);
      forecastDaily.push(round2(val));
    }

    const sd = stddev(quantities.slice(-30));
    const confidenceLo = Math.max(0, baseline - 1.96 * sd);
    const confidenceHi = baseline + 1.96 * sd;

    const f: DemandForecast = {
      productId,
      horizonDays,
      baseline: round2(baseline),
      trend: round2(trend),
      seasonalityIndex: round2(seasonalityIndex),
      forecastDaily,
      confidenceLo: round2(confidenceLo),
      confidenceHi: round2(confidenceHi),
      generatedAt: iso(),
    };
    this.forecasts.set(productId, f);
    return f;
  }

  // ───────────── Wilson EOQ: Q* = sqrt((2 * D * S) / H) ─────────────
  computeEOQ(productId: string): EOQResult | undefined {
    const p = this.products.get(productId);
    if (!p) return undefined;
    const D = Math.max(1, p.annualDemand);
    const S = Math.max(0.01, p.orderingCost);
    const H = Math.max(0.01, p.holdingCostPerUnit);
    const eoq = Math.sqrt((2 * D * S) / H);
    const annualOrders = D / eoq;
    const totalOrderingCost = annualOrders * S;
    const totalHoldingCost = (eoq / 2) * H;
    const totalCost = totalOrderingCost + totalHoldingCost;

    // safety stock: Z * σLT * sqrt(L)
    const safetyStock = SERVICE_LEVEL_Z * p.leadTimeStdDev * Math.sqrt(Math.max(1, p.leadTimeDays));

    // reorder point: (avg daily demand * lead time) + safety stock
    const avgDaily = D / 365;
    const reorderPoint = avgDaily * p.leadTimeDays + safetyStock;

    const result: EOQResult = {
      productId,
      eoq: round2(eoq),
      annualOrders: round2(annualOrders),
      totalOrderingCost: round2(totalOrderingCost),
      totalHoldingCost: round2(totalHoldingCost),
      totalCost: round2(totalCost),
      safetyStock: round2(safetyStock),
      reorderPoint: round2(reorderPoint),
      generatedAt: iso(),
    };
    this.eoqCache.set(productId, result);

    // מעדכנים את המוצר עצמו
    p.safetyStock = result.safetyStock;
    p.reorderPoint = result.reorderPoint;
    p.updatedAt = iso();
    return result;
  }

  recomputeAllEOQ(): void {
    for (const id of this.products.keys()) this.computeEOQ(id);
  }

  needsReorder(productId: string): boolean {
    const p = this.products.get(productId);
    if (!p) return false;
    return p.currentStock <= p.reorderPoint;
  }

  listNeedingReorder(): Product[] {
    return Array.from(this.products.values()).filter(p => p.currentStock <= p.reorderPoint);
  }

  estimateDaysUntilStockout(productId: string): number {
    const p = this.products.get(productId);
    if (!p) return Infinity;
    const f = this.forecasts.get(productId) ?? this.forecast(productId, 30);
    if (!f || f.baseline <= 0) return Infinity;
    return round2(p.currentStock / f.baseline);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) NegotiationBot — אסטרטג משא ומתן אוטומטי
// ═══════════════════════════════════════════════════════════════════════════

export class NegotiationBot {
  readonly sessions: Map<string, NegotiationSession> = new Map();

  constructor(
    private readonly suppliers: SupplierIntelligenceEngine,
    private readonly demand: DemandPredictionEngine
  ) {}

  // ───────────── Decision tree from Kobi ─────────────
  pickStrategy(params: {
    alternativeSuppliers: number;
    supplierScore: number;
    pastPurchases: number;
    orderSize: number;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    marketTrend?: 'rising' | 'stable' | 'falling';
  }): NegotiationStrategy {
    const { alternativeSuppliers, supplierScore, pastPurchases, orderSize, urgency } = params;
    if (alternativeSuppliers >= 3 && supplierScore < 60) return 'aggressive';
    if (supplierScore >= 80 && pastPurchases > 5) return 'collaborative';
    if (orderSize > 50000) return 'volume';
    if (alternativeSuppliers >= 5) return 'competitive';
    if (urgency === 'critical') return 'time_pressure';
    if (supplierScore >= 70) return 'relationship';
    return 'collaborative';
  }

  openSession(params: {
    supplierId: string;
    productId: string;
    quantity: number;
    targetPrice: number;
    ceilingPrice: number;
    currency: string;
    urgency?: 'low' | 'medium' | 'high' | 'critical';
    bestAlternativePrice?: number;
  }): NegotiationSession | undefined {
    const supplier = this.suppliers.suppliers.get(params.supplierId);
    const product = this.demand.products.get(params.productId);
    if (!supplier || !product) return undefined;

    const alternativeSuppliers = this.suppliers.findByCategory(product.category).length - 1;
    const score = this.suppliers.getScore(params.supplierId)?.overall ?? 50;
    const strategy = this.pickStrategy({
      alternativeSuppliers,
      supplierScore: score,
      pastPurchases: supplier.pastPurchasesCount,
      orderSize: params.quantity * params.targetPrice,
      urgency: params.urgency ?? 'medium',
    });

    const session: NegotiationSession = {
      id: uid('neg'),
      supplierId: params.supplierId,
      productId: params.productId,
      quantity: params.quantity,
      targetPrice: params.targetPrice,
      ceilingPrice: params.ceilingPrice,
      currency: params.currency,
      strategy,
      status: 'open',
      messages: [],
      createdAt: iso(),
    };
    this.sessions.set(session.id, session);
    const intro = this.buildMessage(session, { bestAlternativePrice: params.bestAlternativePrice });
    session.messages.push(intro);
    return session;
  }

  // ───────────── Message template builder ─────────────
  buildMessage(
    session: NegotiationSession,
    context: { bestAlternativePrice?: number } = {}
  ): NegotiationMessage {
    const supplier = this.suppliers.suppliers.get(session.supplierId);
    const product = this.demand.products.get(session.productId);
    const template = NEGOTIATION_TEMPLATES[session.strategy];
    let body = template
      .replace('{product}', product?.name ?? session.productId)
      .replace('{supplier}', supplier?.name ?? session.supplierId)
      .replace('{targetPrice}', `${session.targetPrice} ${session.currency}`)
      .replace('{quantity}', String(session.quantity))
      .replace('{bestPrice}', context.bestAlternativePrice != null ? `${context.bestAlternativePrice} ${session.currency}` : `${session.targetPrice} ${session.currency}`);
    return {
      id: uid('msg'),
      sessionId: session.id,
      sender: 'bot',
      body,
      at: iso(),
      priceOffered: session.targetPrice,
      quantityOffered: session.quantity,
    };
  }

  recordSupplierReply(sessionId: string, body: string, priceOffered?: number): NegotiationMessage | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'open') return undefined;
    const msg: NegotiationMessage = {
      id: uid('msg'),
      sessionId,
      sender: 'supplier',
      body,
      at: iso(),
      priceOffered,
    };
    session.messages.push(msg);
    // אם הספק נכנע — סוגר
    if (priceOffered != null && priceOffered <= session.targetPrice) {
      this.closeSession(sessionId, 'agreed', priceOffered);
    }
    return msg;
  }

  counterOffer(sessionId: string, newTarget: number, customBody?: string): NegotiationMessage | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'open') return undefined;
    session.targetPrice = newTarget;
    const template = customBody ?? `הצעה מעודכנת: ${newTarget} ${session.currency} ליחידה, סגירה מהירה.`;
    const msg: NegotiationMessage = {
      id: uid('msg'),
      sessionId,
      sender: 'bot',
      body: template,
      at: iso(),
      priceOffered: newTarget,
    };
    session.messages.push(msg);
    return msg;
  }

  closeSession(sessionId: string, outcome: 'agreed' | 'failed' | 'cancelled', finalPrice?: number): NegotiationSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.status = outcome;
    session.closedAt = iso();
    if (finalPrice != null) {
      session.finalPrice = finalPrice;
      session.savings = round2((session.ceilingPrice - finalPrice) * session.quantity);
    }
    return session;
  }

  listOpen(): NegotiationSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'open');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) ReverseAuctionEngine — מכרזים הפוכים עם הארכה אוטומטית
// ═══════════════════════════════════════════════════════════════════════════

export class ReverseAuctionEngine {
  readonly auctions: Map<string, ReverseAuction> = new Map();

  constructor(private readonly suppliers: SupplierIntelligenceEngine) {}

  createAuction(params: {
    productId: string;
    quantity: number;
    currency: string;
    ceilingPrice: number;
    durationMinutes: number;
    participantIds: string[];
    createdBy: string;
    notes?: string;
  }): ReverseAuction {
    const now = new Date();
    const auction: ReverseAuction = {
      id: uid('auc'),
      productId: params.productId,
      quantity: params.quantity,
      currency: params.currency,
      ceilingPrice: params.ceilingPrice,
      startAt: iso(now),
      endAt: addHoursIso(params.durationMinutes / 60, now),
      status: 'open',
      participantIds: params.participantIds,
      bids: [],
      extensionsUsed: 0,
      maxExtensions: DEFAULT_AUCTION_MAX_EXTENSIONS,
      extensionMinutes: DEFAULT_AUCTION_EXTENSION_MINUTES,
      createdBy: params.createdBy,
      createdAt: iso(),
      notes: params.notes,
    };
    this.auctions.set(auction.id, auction);
    return auction;
  }

  placeBid(auctionId: string, supplierId: string, unitPrice: number): AuctionBid | undefined {
    const a = this.auctions.get(auctionId);
    if (!a) return undefined;
    if (a.status !== 'open' && a.status !== 'closing') return undefined;
    if (!a.participantIds.includes(supplierId)) return undefined;
    if (unitPrice > a.ceilingPrice) return undefined;

    const lowest = this.lowestBid(auctionId)?.unitPrice ?? Infinity;
    if (unitPrice >= lowest) return undefined; // חייב לרדת מתחת להצעה הנמוכה ביותר

    const bid: AuctionBid = {
      id: uid('bid'),
      auctionId,
      supplierId,
      unitPrice,
      at: iso(),
    };
    a.bids.push(bid);

    // ───────────── Auto-extend rule ─────────────
    const secondsLeft = (new Date(a.endAt).getTime() - Date.now()) / 1000;
    if (secondsLeft <= DEFAULT_AUCTION_LAST_BID_WINDOW_SECONDS && a.extensionsUsed < a.maxExtensions) {
      a.endAt = addHoursIso(a.extensionMinutes / 60, new Date(a.endAt));
      a.extensionsUsed += 1;
      a.status = 'closing';
    }
    return bid;
  }

  lowestBid(auctionId: string): AuctionBid | undefined {
    const a = this.auctions.get(auctionId);
    if (!a || a.bids.length === 0) return undefined;
    return a.bids.reduce((lo, b) => (b.unitPrice < lo.unitPrice ? b : lo));
  }

  closeAuction(auctionId: string): ReverseAuction | undefined {
    const a = this.auctions.get(auctionId);
    if (!a) return undefined;
    const winner = this.lowestBid(auctionId);
    a.winningBidId = winner?.id;
    a.status = 'closed';
    if (winner) {
      a.savingsEstimate = round2((a.ceilingPrice - winner.unitPrice) * a.quantity);
    }
    return a;
  }

  tickAll(): void {
    for (const a of this.auctions.values()) {
      if (a.status !== 'open' && a.status !== 'closing') continue;
      if (Date.now() >= new Date(a.endAt).getTime()) {
        this.closeAuction(a.id);
      }
    }
  }

  listOpen(): ReverseAuction[] {
    return Array.from(this.auctions.values()).filter(a => a.status === 'open' || a.status === 'closing');
  }

  totalSavings(): number {
    return round2(sum(Array.from(this.auctions.values()).filter(a => a.status === 'closed').map(a => a.savingsEstimate ?? 0)));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5) SmartBundlingEngine — איחוד הזמנות לפי קטגוריה
// ═══════════════════════════════════════════════════════════════════════════

export class SmartBundlingEngine {
  readonly bundles: Map<string, BundlingCandidate> = new Map();
  maxWaitHours: number = DEFAULT_BUNDLING_WAIT_HOURS;
  threshold: number = DEFAULT_BUNDLING_THRESHOLD;

  constructor(private readonly demand: DemandPredictionEngine) {}

  queueLine(params: {
    productId: string;
    quantity: number;
    requestedBy: string;
    expectedUnitPrice: number;
  }): BundlingCandidate | undefined {
    const p = this.demand.products.get(params.productId);
    if (!p) return undefined;

    // מוצאים בנדל פתוח באותה תת-קטגוריה
    let bundle = Array.from(this.bundles.values()).find(
      b => b.status === 'queued' && b.category === p.category && b.subcategory === p.subcategory
    );
    if (!bundle) {
      bundle = {
        id: uid('bnd'),
        category: p.category,
        subcategory: p.subcategory,
        createdAt: iso(),
        linesQueued: [],
        totalValue: 0,
        status: 'queued',
        expectedDiscountPct: 0,
      };
      this.bundles.set(bundle.id, bundle);
    }

    bundle.linesQueued.push({
      productId: params.productId,
      sku: p.sku,
      quantity: params.quantity,
      requestedBy: params.requestedBy,
      expectedUnitPrice: params.expectedUnitPrice,
      queuedAt: iso(),
    });
    bundle.totalValue += params.quantity * params.expectedUnitPrice;
    bundle.expectedDiscountPct = this.calcExpectedDiscount(bundle.totalValue);

    // אם כבר עברנו את הרף -> ready
    if (bundle.totalValue >= this.threshold) {
      bundle.status = 'ready';
    }
    return bundle;
  }

  calcExpectedDiscount(value: number): number {
    // הנחת כמות דמה: קפיצה ב-5% בכל 25k
    if (value < 10000) return 0;
    if (value < 25000) return 2;
    if (value < 50000) return 5;
    if (value < 100000) return 8;
    return 12;
  }

  reviewQueue(): BundlingCandidate[] {
    const now = Date.now();
    for (const b of this.bundles.values()) {
      if (b.status !== 'queued') continue;
      const ageHours = (now - new Date(b.createdAt).getTime()) / 3600_000;
      if (ageHours >= this.maxWaitHours) b.status = 'ready';
    }
    return Array.from(this.bundles.values()).filter(b => b.status === 'ready');
  }

  markMerged(bundleId: string, mergedPoId: string): void {
    const b = this.bundles.get(bundleId);
    if (!b) return;
    b.status = 'merged';
    b.mergedPoId = mergedPoId;
  }

  expireStale(maxAgeHours = 72): number {
    let n = 0;
    for (const b of this.bundles.values()) {
      if (b.status !== 'queued' && b.status !== 'ready') continue;
      const ageHours = (Date.now() - new Date(b.createdAt).getTime()) / 3600_000;
      if (ageHours >= maxAgeHours) {
        b.status = 'expired';
        n++;
      }
    }
    return n;
  }

  findReadyFor(productId: string): BundlingCandidate | undefined {
    const p = this.demand.products.get(productId);
    if (!p) return undefined;
    return Array.from(this.bundles.values()).find(
      b => b.status === 'ready' && b.category === p.category && b.subcategory === p.subcategory
    );
  }

  listActive(): BundlingCandidate[] {
    return Array.from(this.bundles.values()).filter(b => b.status === 'queued' || b.status === 'ready');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6) AutoReorderEngine — הזמנה אוטומטית כשהמלאי יורד מתחת לנקודת ההזמנה
// ═══════════════════════════════════════════════════════════════════════════

export class AutoReorderEngine {
  readonly rules: Map<string, AutoReorderRule> = new Map();
  readonly pendingApprovals: Map<string, { ruleId: string; productId: string; quantity: number; estCost: number; createdAt: string }> = new Map();

  constructor(private readonly demand: DemandPredictionEngine) {}

  createRule(
    data: Omit<AutoReorderRule, 'id' | 'createdAt' | 'updatedAt' | 'triggeredCount'> & { id?: string }
  ): AutoReorderRule {
    const id = data.id ?? uid('rul');
    const now = iso();
    const rule: AutoReorderRule = { ...data, id, createdAt: now, updatedAt: now, triggeredCount: 0 };
    this.rules.set(id, rule);
    return rule;
  }

  updateRule(id: string, patch: Partial<AutoReorderRule>): AutoReorderRule | undefined {
    const r = this.rules.get(id);
    if (!r) return undefined;
    const updated = { ...r, ...patch, id: r.id, updatedAt: iso() };
    this.rules.set(id, updated);
    return updated;
  }

  private inCooldown(rule: AutoReorderRule): boolean {
    if (!rule.lastTriggeredAt) return false;
    return hoursSince(rule.lastTriggeredAt) < rule.cooldownHours;
  }

  // ───────────── evaluate all rules & trigger ─────────────
  scan(): Array<{ ruleId: string; productId: string; action: 'skipped' | 'queued' | 'requires_approval'; reason: string; estCost?: number }> {
    const results: Array<{ ruleId: string; productId: string; action: 'skipped' | 'queued' | 'requires_approval'; reason: string; estCost?: number }> = [];
    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        results.push({ ruleId: rule.id, productId: rule.productId, action: 'skipped', reason: 'disabled' });
        continue;
      }
      const p = this.demand.products.get(rule.productId);
      if (!p) {
        results.push({ ruleId: rule.id, productId: rule.productId, action: 'skipped', reason: 'product not found' });
        continue;
      }
      if (p.currentStock > p.reorderPoint) {
        results.push({ ruleId: rule.id, productId: rule.productId, action: 'skipped', reason: 'stock above ROP' });
        continue;
      }
      if (this.inCooldown(rule)) {
        results.push({ ruleId: rule.id, productId: rule.productId, action: 'skipped', reason: `cooldown ${rule.cooldownHours}h` });
        continue;
      }

      // כמות להזמין: EOQ אם קיים, אחרת הפער עד safetyStock*3
      const eoq = this.demand.eoqCache.get(rule.productId)?.eoq ?? (p.safetyStock * 3 - p.currentStock);
      const quantity = Math.max(1, Math.ceil(eoq));
      const estCost = round2(quantity * p.lastUnitPrice);

      if (estCost >= rule.approvalThreshold) {
        this.pendingApprovals.set(uid('apr'), {
          ruleId: rule.id,
          productId: p.id,
          quantity,
          estCost,
          createdAt: iso(),
        });
        results.push({ ruleId: rule.id, productId: p.id, action: 'requires_approval', reason: `est ${estCost} >= threshold ${rule.approvalThreshold}`, estCost });
      } else {
        rule.lastTriggeredAt = iso();
        rule.triggeredCount += 1;
        rule.updatedAt = iso();
        results.push({ ruleId: rule.id, productId: p.id, action: 'queued', reason: 'auto approved', estCost });
      }
    }
    return results;
  }

  approvePending(approvalId: string): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) return false;
    const rule = this.rules.get(pending.ruleId);
    if (rule) {
      rule.lastTriggeredAt = iso();
      rule.triggeredCount += 1;
      rule.updatedAt = iso();
    }
    this.pendingApprovals.delete(approvalId);
    return true;
  }

  rejectPending(approvalId: string): boolean {
    return this.pendingApprovals.delete(approvalId);
  }

  listPending(): Array<{ id: string; ruleId: string; productId: string; quantity: number; estCost: number; createdAt: string }> {
    return Array.from(this.pendingApprovals.entries()).map(([id, v]) => ({ id, ...v }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7) ContractLifecycleEngine — ניהול חוזים מקצה לקצה
// ═══════════════════════════════════════════════════════════════════════════

export class ContractLifecycleEngine {
  readonly contracts: Map<string, Contract> = new Map();

  createContract(
    data: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Contract {
    const id = data.id ?? uid('ctr');
    const now = iso();
    const c: Contract = { ...data, id, createdAt: now, updatedAt: now };
    this.contracts.set(id, c);
    return c;
  }

  updateContract(id: string, patch: Partial<Contract>): Contract | undefined {
    const c = this.contracts.get(id);
    if (!c) return undefined;
    const updated = { ...c, ...patch, id: c.id, updatedAt: iso() };
    this.contracts.set(id, updated);
    return updated;
  }

  findActiveForProduct(productId: string): Contract | undefined {
    const now = iso();
    return Array.from(this.contracts.values()).find(
      c => c.status === 'active' &&
           c.startDate <= now && c.endDate >= now &&
           c.terms.some(t => t.productId === productId)
    );
  }

  hasActive(productId: string): boolean {
    return !!this.findActiveForProduct(productId);
  }

  getPrice(productId: string): { contractId: string; unitPrice: number; currency: string } | undefined {
    const c = this.findActiveForProduct(productId);
    if (!c) return undefined;
    const term = c.terms.find(t => t.productId === productId);
    if (!term) return undefined;
    return { contractId: c.id, unitPrice: term.unitPrice, currency: term.currency };
  }

  checkExpiring(withinDays = 30): Array<{ contract: Contract; daysLeft: number }> {
    const now = Date.now();
    return Array.from(this.contracts.values())
      .filter(c => c.status === 'active')
      .map(c => {
        const daysLeft = Math.floor((new Date(c.endDate).getTime() - now) / 86400_000);
        return { contract: c, daysLeft };
      })
      .filter(x => x.daysLeft >= 0 && x.daysLeft <= withinDays)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }

  markExpired(): number {
    let n = 0;
    const now = iso();
    for (const c of this.contracts.values()) {
      if (c.status === 'active' && c.endDate < now) {
        c.status = 'expired';
        c.updatedAt = iso();
        n++;
      }
    }
    return n;
  }

  suspend(contractId: string, reason: string): Contract | undefined {
    const c = this.contracts.get(contractId);
    if (!c) return undefined;
    c.status = 'suspended';
    c.notes = (c.notes ? c.notes + '\n' : '') + `[${iso()}] suspended: ${reason}`;
    c.updatedAt = iso();
    return c;
  }

  renew(contractId: string, monthsToAdd: number): Contract | undefined {
    const c = this.contracts.get(contractId);
    if (!c) return undefined;
    const end = new Date(c.endDate);
    end.setMonth(end.getMonth() + monthsToAdd);
    c.endDate = end.toISOString();
    c.updatedAt = iso();
    return c;
  }

  totalCommitted(): number {
    return round2(sum(Array.from(this.contracts.values()).filter(c => c.status === 'active').map(c => c.totalValue)));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 8) QualityGateEngine — בקרת איכות לכל הזמנה
// ═══════════════════════════════════════════════════════════════════════════

export class QualityGateEngine {
  readonly checks: Map<string, QualityCheck> = new Map();

  runCheck(params: {
    purchaseOrderId: string;
    productId: string;
    quantityReceived: number;
    quantityPassed: number;
    quantityRejected: number;
    defectReasons?: string[];
    inspectedBy: string;
    notes?: string;
  }): QualityCheck {
    const id = uid('qc');
    const qualityScore = params.quantityReceived > 0
      ? round2((params.quantityPassed / params.quantityReceived) * 100)
      : 0;
    const action = this.deriveAction(qualityScore, params.quantityRejected, params.quantityReceived);
    const check: QualityCheck = {
      id,
      purchaseOrderId: params.purchaseOrderId,
      productId: params.productId,
      quantityReceived: params.quantityReceived,
      quantityPassed: params.quantityPassed,
      quantityRejected: params.quantityRejected,
      qualityScore,
      defectReasons: params.defectReasons ?? [],
      action,
      inspectedBy: params.inspectedBy,
      inspectedAt: iso(),
      notes: params.notes,
    };
    this.checks.set(id, check);
    return check;
  }

  private deriveAction(score: number, rejected: number, received: number): QualityCheck['action'] {
    if (rejected === 0) return 'accept';
    if (score >= 95) return 'accept';
    if (score >= 85) return 'partial_accept';
    if (score >= 70) return 'credit';
    if (score >= 50) return 'replace';
    return 'return';
  }

  historyFor(productId: string): QualityCheck[] {
    return Array.from(this.checks.values()).filter(c => c.productId === productId).sort((a, b) => a.inspectedAt.localeCompare(b.inspectedAt));
  }

  avgScoreFor(productId: string): number {
    const hist = this.historyFor(productId);
    return hist.length === 0 ? 0 : round2(avg(hist.map(h => h.qualityScore)));
  }

  defectRateFor(productId: string): number {
    const hist = this.historyFor(productId);
    const totalReceived = sum(hist.map(h => h.quantityReceived));
    const totalRejected = sum(hist.map(h => h.quantityRejected));
    return totalReceived === 0 ? 0 : round2((totalRejected / totalReceived) * 100);
  }

  worstOffenders(limit = 10): Array<{ productId: string; defectRate: number; checks: number }> {
    const byProduct = new Map<string, { received: number; rejected: number; checks: number }>();
    for (const c of this.checks.values()) {
      const e = byProduct.get(c.productId) ?? { received: 0, rejected: 0, checks: 0 };
      e.received += c.quantityReceived;
      e.rejected += c.quantityRejected;
      e.checks += 1;
      byProduct.set(c.productId, e);
    }
    return Array.from(byProduct.entries())
      .map(([productId, v]) => ({
        productId,
        defectRate: v.received === 0 ? 0 : round2((v.rejected / v.received) * 100),
        checks: v.checks,
      }))
      .sort((a, b) => b.defectRate - a.defectRate)
      .slice(0, limit);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 9) SpendAnalyticsEngine — אנליטיקה פורנזית של הוצאות
// ═══════════════════════════════════════════════════════════════════════════

export class SpendAnalyticsEngine {
  readonly purchaseOrders: Map<string, PurchaseOrder> = new Map();

  constructor(
    private readonly suppliers: SupplierIntelligenceEngine,
    private readonly demand: DemandPredictionEngine,
    private readonly auctions: ReverseAuctionEngine,
    private readonly bundling: SmartBundlingEngine,
    private readonly negotiation: NegotiationBot,
    private readonly contracts: ContractLifecycleEngine
  ) {}

  recordPO(po: PurchaseOrder): void {
    this.purchaseOrders.set(po.id, po);
    this.suppliers.registerSpend(po.supplierId, po.total);
  }

  analyze(windowDays = 90, currency = 'ILS'): SpendAnalysis {
    const now = new Date();
    const start = new Date(now.getTime() - windowDays * 86400_000);
    const windowStart = start.toISOString();
    const windowEnd = now.toISOString();

    const windowed = Array.from(this.purchaseOrders.values()).filter(
      po => po.createdAt >= windowStart && po.createdAt <= windowEnd
    );

    const totalSpend = round2(sum(windowed.map(po => po.total)));

    const byCategory: Record<string, number> = {};
    const bySupplier: Record<string, number> = {};
    const byMonth: Record<string, number> = {};

    for (const po of windowed) {
      for (const line of po.lines) {
        const p = this.demand.products.get(line.productId);
        const cat = p?.category ?? 'uncategorized';
        byCategory[cat] = round2((byCategory[cat] ?? 0) + line.lineTotal);
      }
      bySupplier[po.supplierId] = round2((bySupplier[po.supplierId] ?? 0) + po.total);
      const month = po.createdAt.slice(0, 7);
      byMonth[month] = round2((byMonth[month] ?? 0) + po.total);
    }

    const savingsBreakdown = {
      fromAuctions: this.auctions.totalSavings(),
      fromBundling: round2(sum(
        Array.from(this.bundling.bundles.values())
          .filter(b => b.status === 'merged')
          .map(b => b.totalValue * (b.expectedDiscountPct / 100))
      )),
      fromNegotiation: round2(sum(
        Array.from(this.negotiation.sessions.values())
          .filter(s => s.status === 'agreed')
          .map(s => s.savings ?? 0)
      )),
      fromContracts: round2(this.contracts.totalCommitted() * 0.05),
      fromAutoReorder: 0,
    };

    const topSuppliers = Object.entries(bySupplier)
      .map(([supplierId, amount]) => ({
        supplierId,
        amount,
        pct: totalSpend > 0 ? round2((amount / totalSpend) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    const riskHotspots: Array<{ supplierId: string; reason: string; severity: 'low' | 'medium' | 'high' }> = [];
    for (const t of topSuppliers) {
      const score = this.suppliers.getScore(t.supplierId);
      if (score) {
        if (score.overall < 50) riskHotspots.push({ supplierId: t.supplierId, reason: `ציון ${score.overall}`, severity: 'high' });
        else if (score.overall < 70) riskHotspots.push({ supplierId: t.supplierId, reason: `ציון ${score.overall}`, severity: 'medium' });
        if (t.pct > 30) riskHotspots.push({ supplierId: t.supplierId, reason: `ריכוזיות ${t.pct}%`, severity: 'high' });
      }
    }

    return {
      generatedAt: iso(),
      windowStart,
      windowEnd,
      totalSpend,
      currency,
      byCategory,
      bySupplier,
      byMonth,
      savingsBreakdown,
      topSuppliers,
      riskHotspots,
    };
  }

  categoryRank(topN = 5, windowDays = 90): Array<{ category: string; amount: number }> {
    const { byCategory } = this.analyze(windowDays);
    return Object.entries(byCategory)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, topN);
  }

  supplierConcentration(): { topSharePct: number; top3SharePct: number } {
    const { topSuppliers } = this.analyze(365);
    const topSharePct = topSuppliers[0]?.pct ?? 0;
    const top3SharePct = round2(sum(topSuppliers.slice(0, 3).map(s => s.pct)));
    return { topSharePct, top3SharePct };
  }

  totalSavings(): number {
    const a = this.analyze(365);
    return round2(
      a.savingsBreakdown.fromAuctions +
      a.savingsBreakdown.fromBundling +
      a.savingsBreakdown.fromNegotiation +
      a.savingsBreakdown.fromContracts +
      a.savingsBreakdown.fromAutoReorder
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER — ProcurementHyperintelligence: composes all engines
// ═══════════════════════════════════════════════════════════════════════════

export class ProcurementHyperintelligence {
  readonly suppliers: SupplierIntelligenceEngine;
  readonly demand: DemandPredictionEngine;
  readonly negotiation: NegotiationBot;
  readonly auctions: ReverseAuctionEngine;
  readonly bundling: SmartBundlingEngine;
  readonly reorder: AutoReorderEngine;
  readonly contracts: ContractLifecycleEngine;
  readonly quality: QualityGateEngine;
  readonly spend: SpendAnalyticsEngine;

  constructor() {
    this.suppliers = new SupplierIntelligenceEngine();
    this.demand = new DemandPredictionEngine();
    this.negotiation = new NegotiationBot(this.suppliers, this.demand);
    this.auctions = new ReverseAuctionEngine(this.suppliers);
    this.bundling = new SmartBundlingEngine(this.demand);
    this.reorder = new AutoReorderEngine(this.demand);
    this.contracts = new ContractLifecycleEngine();
    this.quality = new QualityGateEngine();
    this.spend = new SpendAnalyticsEngine(
      this.suppliers,
      this.demand,
      this.auctions,
      this.bundling,
      this.negotiation,
      this.contracts
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // THE KILLER FEATURE — intelligentOrder
  // ═════════════════════════════════════════════════════════════════════════
  //
  //  Decision tree:
  //    1. יש חוזה פעיל?                              → direct_contract
  //    2. הזמנה גדולה + ≥3 ספקים?                    → reverse_auction
  //    3. אפשר לחכות + לא קריטי?                    → bundling
  //    4. ספק מוביל חזק (>=75)?                      → collaborative_negotiation
  //    5. ספק מוביל חלש (<60) + אלטרנטיבות?         → aggressive_negotiation
  //    6. אחרת                                       → collaborative_negotiation
  //
  async intelligentOrder(params: {
    productId: string;
    quantity: number;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    canWait?: boolean;
    maxWaitHours?: number;
  }): Promise<{
    strategy: 'direct_contract' | 'reverse_auction' | 'bundling' | 'collaborative_negotiation' | 'aggressive_negotiation';
    reasoning: string[];
    estimatedCost: number;
    estimatedSavings: number;
    recommendedSupplierId?: string;
    auctionId?: string;
    bundleId?: string;
    contractId?: string;
  }> {
    const reasoning: string[] = [];
    const product = this.demand.products.get(params.productId);
    if (!product) {
      return {
        strategy: 'collaborative_negotiation',
        reasoning: [`product ${params.productId} not found — fallback`],
        estimatedCost: 0,
        estimatedSavings: 0,
      };
    }

    const estimatedPrice = product.lastUnitPrice || 0;
    const estimatedCost = round2(estimatedPrice * params.quantity);
    reasoning.push(`product=${product.sku} qty=${params.quantity} estPrice=${estimatedPrice} estCost=${estimatedCost}`);

    // ───── 1) contract? ─────
    const contractPrice = this.contracts.getPrice(params.productId);
    if (contractPrice) {
      reasoning.push(`active contract ${contractPrice.contractId} → direct_contract`);
      const estimatedSavings = round2(Math.max(0, (estimatedPrice - contractPrice.unitPrice) * params.quantity));
      return {
        strategy: 'direct_contract',
        reasoning,
        estimatedCost: round2(contractPrice.unitPrice * params.quantity),
        estimatedSavings,
        contractId: contractPrice.contractId,
      };
    }
    reasoning.push('no active contract');

    const suppliersForCat = this.suppliers.findByCategory(product.category);
    reasoning.push(`${suppliersForCat.length} suppliers for category=${product.category}`);
    const top = this.suppliers.topSupplierFor(product.category);

    // ───── 2) large order + ≥3 suppliers → reverse auction ─────
    if (estimatedCost > DEFAULT_LARGE_ORDER_THRESHOLD && suppliersForCat.length >= 3) {
      reasoning.push(`estCost ${estimatedCost} > ${DEFAULT_LARGE_ORDER_THRESHOLD} and ${suppliersForCat.length} suppliers → reverse_auction`);
      const auction = this.auctions.createAuction({
        productId: params.productId,
        quantity: params.quantity,
        currency: product.preferredSupplierIds[0]
          ? (this.suppliers.suppliers.get(product.preferredSupplierIds[0])?.currency ?? 'ILS')
          : 'ILS',
        ceilingPrice: estimatedPrice,
        durationMinutes: 60,
        participantIds: suppliersForCat.map(s => s.id),
        createdBy: 'system',
        notes: 'auto-created by intelligentOrder',
      });
      return {
        strategy: 'reverse_auction',
        reasoning,
        estimatedCost,
        estimatedSavings: round2(estimatedCost * 0.08),
        auctionId: auction.id,
      };
    }

    // ───── 3) can wait → bundling ─────
    if (params.canWait && params.urgency !== 'critical') {
      reasoning.push('canWait && !critical → bundling');
      const bundle = this.bundling.queueLine({
        productId: params.productId,
        quantity: params.quantity,
        requestedBy: 'system',
        expectedUnitPrice: estimatedPrice,
      });
      return {
        strategy: 'bundling',
        reasoning,
        estimatedCost,
        estimatedSavings: round2(estimatedCost * ((bundle?.expectedDiscountPct ?? 0) / 100)),
        bundleId: bundle?.id,
      };
    }

    // ───── 4) strong top supplier → collaborative ─────
    if (top && top.score.overall >= 75) {
      reasoning.push(`top supplier ${top.id} score=${top.score.overall} → collaborative_negotiation`);
      this.negotiation.openSession({
        supplierId: top.id,
        productId: params.productId,
        quantity: params.quantity,
        targetPrice: round2(estimatedPrice * 0.94),
        ceilingPrice: estimatedPrice,
        currency: top.currency,
        urgency: params.urgency,
      });
      return {
        strategy: 'collaborative_negotiation',
        reasoning,
        estimatedCost: round2(estimatedCost * 0.94),
        estimatedSavings: round2(estimatedCost * 0.06),
        recommendedSupplierId: top.id,
      };
    }

    // ───── 5) weak supplier + alternatives → aggressive ─────
    if (top && top.score.overall < 60 && suppliersForCat.length >= 2) {
      reasoning.push(`top supplier ${top.id} weak score=${top.score.overall} + ${suppliersForCat.length} alternatives → aggressive_negotiation`);
      this.negotiation.openSession({
        supplierId: top.id,
        productId: params.productId,
        quantity: params.quantity,
        targetPrice: round2(estimatedPrice * 0.88),
        ceilingPrice: estimatedPrice,
        currency: top.currency,
        urgency: params.urgency,
      });
      return {
        strategy: 'aggressive_negotiation',
        reasoning,
        estimatedCost: round2(estimatedCost * 0.88),
        estimatedSavings: round2(estimatedCost * 0.12),
        recommendedSupplierId: top.id,
      };
    }

    // ───── 6) fallback → collaborative ─────
    reasoning.push('fallback → collaborative_negotiation');
    return {
      strategy: 'collaborative_negotiation',
      reasoning,
      estimatedCost,
      estimatedSavings: round2(estimatedCost * 0.05),
      recommendedSupplierId: top?.id,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Dashboard
  // ═════════════════════════════════════════════════════════════════════════
  getDashboard(): {
    generatedAt: string;
    suppliers: { total: number; preferred: number; approved: number; watch: number; avoid: number };
    demand: { products: number; needingReorder: number };
    auctions: { open: number; totalSavings: number };
    bundling: { active: number; ready: number };
    reorder: { rules: number; pendingApprovals: number };
    contracts: { active: number; expiringSoon: number; totalCommitted: number };
    quality: { totalChecks: number; worstOffender?: { productId: string; defectRate: number } };
    spend: SpendAnalysis;
  } {
    const totalSuppliers = this.suppliers.suppliers.size;
    const listByBand = (b: RiskBand) => this.suppliers.listByBand(b).length;
    const contractsActive = Array.from(this.contracts.contracts.values()).filter(c => c.status === 'active').length;
    const expiringSoon = this.contracts.checkExpiring(30).length;
    const worstList = this.quality.worstOffenders(1);
    return {
      generatedAt: iso(),
      suppliers: {
        total: totalSuppliers,
        preferred: listByBand('preferred'),
        approved: listByBand('approved'),
        watch: listByBand('watch'),
        avoid: listByBand('avoid'),
      },
      demand: {
        products: this.demand.products.size,
        needingReorder: this.demand.listNeedingReorder().length,
      },
      auctions: {
        open: this.auctions.listOpen().length,
        totalSavings: this.auctions.totalSavings(),
      },
      bundling: {
        active: this.bundling.listActive().length,
        ready: this.bundling.reviewQueue().length,
      },
      reorder: {
        rules: this.reorder.rules.size,
        pendingApprovals: this.reorder.pendingApprovals.size,
      },
      contracts: {
        active: contractsActive,
        expiringSoon,
        totalCommitted: this.contracts.totalCommitted(),
      },
      quality: {
        totalChecks: this.quality.checks.size,
        worstOffender: worstList[0] ? { productId: worstList[0].productId, defectRate: worstList[0].defectRate } : undefined,
      },
      spend: this.spend.analyze(90),
    };
  }

  printDashboard(): void {
    const d = this.getDashboard();
    // eslint-disable-next-line no-console
    console.log('╔══════════════════════════════════════════════════════════════╗');
    // eslint-disable-next-line no-console
    console.log('║           ONYX PROCUREMENT HYPERINTELLIGENCE — Dashboard     ║');
    // eslint-disable-next-line no-console
    console.log('╚══════════════════════════════════════════════════════════════╝');
    // eslint-disable-next-line no-console
    console.log(`Suppliers:  total=${d.suppliers.total}  preferred=${d.suppliers.preferred}  approved=${d.suppliers.approved}  watch=${d.suppliers.watch}  avoid=${d.suppliers.avoid}`);
    // eslint-disable-next-line no-console
    console.log(`Demand:     products=${d.demand.products}  needingReorder=${d.demand.needingReorder}`);
    // eslint-disable-next-line no-console
    console.log(`Auctions:   open=${d.auctions.open}  totalSavings=${d.auctions.totalSavings}`);
    // eslint-disable-next-line no-console
    console.log(`Bundling:   active=${d.bundling.active}  ready=${d.bundling.ready}`);
    // eslint-disable-next-line no-console
    console.log(`Reorder:    rules=${d.reorder.rules}  pending=${d.reorder.pendingApprovals}`);
    // eslint-disable-next-line no-console
    console.log(`Contracts:  active=${d.contracts.active}  expiringSoon=${d.contracts.expiringSoon}  committed=${d.contracts.totalCommitted}`);
    // eslint-disable-next-line no-console
    console.log(`Quality:    checks=${d.quality.totalChecks}  worst=${d.quality.worstOffender?.productId ?? '-'}`);
    // eslint-disable-next-line no-console
    console.log(`Spend(90d): ${d.spend.totalSpend} ${d.spend.currency}`);
  }
}
