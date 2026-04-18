/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   SUBCONTRACTOR DECISION ENGINE — Client-Side                         ║
 * ║   מנוע החלטות AI לקבלני משנה                                          ║
 * ║                                                                        ║
 * ║   Autonomous — runs in browser, persists to localStorage             ║
 * ║   Every quote/deal that comes in → auto-analysis → alert              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type WorkType =
  | 'מעקות_ברזל'
  | 'מעקות_אלומיניום'
  | 'שערים'
  | 'גדרות'
  | 'פרגולות'
  | 'דלתות'
  | 'חלונות'
  | 'ריתוך'
  | 'צביעה'
  | 'התקנה'
  | 'ייצור_מפעל'
  | 'הובלה_והרכבה'
  | 'חיפוי_אלומיניום'
  | 'מסגרות_פלדה'
  | 'custom';

export type PricingMethod = 'percentage' | 'per_sqm';

export interface SubcontractorPricing {
  workType: WorkType;
  percentageRate: number;
  pricePerSqm: number;
  minimumPrice?: number;
  lastUpdated: string;
  notes?: string;
}

export interface Subcontractor {
  id: string;
  name: string;
  phone: string;
  email?: string;
  specialties: WorkType[];
  pricing: SubcontractorPricing[];
  qualityRating: number;
  reliabilityRating: number;
  available: boolean;
  notes: string;
  stats: {
    totalProjects: number;
    completedOnTime: number;
    avgDelayDays: number;
    totalRevenue: number;
    complaints: number;
  };
}

export interface Project {
  id: string;
  name: string;
  client: string;
  address: string;
  workType: WorkType;
  totalProjectValue: number;
  areaSqm: number;
  startDate: string;
  deadline: string;
  requirements: string;
  status: 'new' | 'quoted' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  /** חומרי גלם נדרשים לפרויקט — חובה */
  rawMaterialsRequired: ProjectMaterialRequirement[];
}

export interface ProjectMaterialRequirement {
  rawMaterialId: string;
  rawMaterialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  notes?: string;
}

export interface CandidateAnalysis {
  contractorId: string;
  contractorName: string;
  costByPercentage: number;
  percentageRate: number;
  costBySqm: number;
  pricePerSqm: number;
  bestCost: number;
  bestMethod: PricingMethod;
  qualityScore: number;
  finalScore: number;
  available: boolean;
}

export interface WorkOrder {
  id: string;
  projectId: string;
  contractorId: string;
  contractorName: string;
  workType: WorkType;
  pricingMethod: PricingMethod;
  agreedPrice: number;
  projectValue: number;
  areaSqm: number;
  startDate: string;
  deadline: string;
  requirements: string;
  paymentTerms: string;
  vatIncluded: boolean;
  vatAmount: number;
  totalWithVat: number;
  createdAt: string;
}

export interface SubcontractorDecision {
  id: string;
  projectId: string;
  projectName: string;
  timestamp: string;
  analysis: {
    candidates: CandidateAnalysis[];
    selectedContractorId: string;
    selectedContractorName: string;
    selectedPricingMethod: PricingMethod;
    selectedCost: number;
    alternativeCost: number;
    savingsAmount: number;
    savingsPercent: number;
  };
  reasoning: string[];
  workOrder: WorkOrder;
  sentToContractor: boolean;
  sentAt?: string;
  sentVia?: 'whatsapp' | 'email' | 'sms';
  /** AI alert level */
  alertLevel: 'info' | 'warning' | 'critical';
  alertMessage: string;
}

export interface DecisionConfig {
  priceWeight: number;
  qualityWeight: number;
  reliabilityWeight: number;
  autoSendToContractor: boolean;
  preferredSendMethod: 'whatsapp' | 'email' | 'sms';
  defaultPaymentTerms: string;
  includeVat: boolean;
  /** Minimum gross margin % to trigger "good deal" alert */
  goodMarginThreshold: number;
  /** Margin % below which triggers "bad deal" critical alert */
  badMarginThreshold: number;
}

const VAT_RATE = 0.18;

const DEFAULT_CONFIG: DecisionConfig = {
  priceWeight: 0.6,
  qualityWeight: 0.25,
  reliabilityWeight: 0.15,
  autoSendToContractor: false,
  preferredSendMethod: 'whatsapp',
  defaultPaymentTerms: 'שוטף + 30',
  includeVat: true,
  goodMarginThreshold: 35,
  badMarginThreshold: 15,
};

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE KEYS
// ═══════════════════════════════════════════════════════════════════════════

const KEYS = {
  contractors: 'tk_subcontractors',
  decisions: 'tk_decisions',
  config: 'tk_decision_config',
};

// ═══════════════════════════════════════════════════════════════════════════
// SUBCONTRACTOR REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

function loadContractors(): Subcontractor[] {
  try {
    const raw = localStorage.getItem(KEYS.contractors);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveContractors(list: Subcontractor[]) {
  localStorage.setItem(KEYS.contractors, JSON.stringify(list));
}

export const SubcontractorRegistry = {
  getAll(): Subcontractor[] {
    return loadContractors();
  },

  get(id: string): Subcontractor | undefined {
    return loadContractors().find(c => c.id === id);
  },

  add(params: {
    name: string;
    phone: string;
    email?: string;
    specialties: WorkType[];
    qualityRating?: number;
    reliabilityRating?: number;
    notes?: string;
  }): Subcontractor {
    const id = `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const contractor: Subcontractor = {
      id,
      name: params.name,
      phone: params.phone,
      email: params.email,
      specialties: params.specialties,
      pricing: [],
      qualityRating: params.qualityRating ?? 5,
      reliabilityRating: params.reliabilityRating ?? 5,
      available: true,
      notes: params.notes ?? '',
      stats: { totalProjects: 0, completedOnTime: 0, avgDelayDays: 0, totalRevenue: 0, complaints: 0 },
    };
    const list = loadContractors();
    list.push(contractor);
    saveContractors(list);
    return contractor;
  },

  update(id: string, updates: Partial<Subcontractor>): Subcontractor | undefined {
    const list = loadContractors();
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) return undefined;
    list[idx] = { ...list[idx], ...updates };
    saveContractors(list);
    return list[idx];
  },

  setPricing(
    contractorId: string,
    pricing: {
      workType: WorkType;
      percentageRate: number;
      pricePerSqm: number;
      minimumPrice?: number;
      notes?: string;
    },
  ): void {
    const list = loadContractors();
    const c = list.find(x => x.id === contractorId);
    if (!c) throw new Error(`קבלן ${contractorId} לא נמצא`);

    c.pricing = c.pricing.filter(p => p.workType !== pricing.workType);
    c.pricing.push({
      workType: pricing.workType,
      percentageRate: pricing.percentageRate,
      pricePerSqm: pricing.pricePerSqm,
      minimumPrice: pricing.minimumPrice,
      lastUpdated: new Date().toISOString(),
      notes: pricing.notes,
    });

    saveContractors(list);
  },

  findAvailable(workType: WorkType): Subcontractor[] {
    return loadContractors()
      .filter(c => c.available)
      .filter(c => c.specialties.includes(workType) || c.specialties.includes('custom'))
      .filter(c => c.pricing.some(p => p.workType === workType));
  },

  remove(id: string): void {
    const list = loadContractors().filter(c => c.id !== id);
    saveContractors(list);
  },

  setAvailability(id: string, available: boolean): void {
    this.update(id, { available });
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// DECISIONS PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

function loadDecisions(): SubcontractorDecision[] {
  try {
    const raw = localStorage.getItem(KEYS.decisions);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDecisions(list: SubcontractorDecision[]) {
  localStorage.setItem(KEYS.decisions, JSON.stringify(list));
}

export const DecisionStore = {
  getAll(): SubcontractorDecision[] {
    return loadDecisions().sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  },

  get(id: string): SubcontractorDecision | undefined {
    return loadDecisions().find(d => d.id === id);
  },

  getByProject(projectId: string): SubcontractorDecision[] {
    return loadDecisions().filter(d => d.projectId === projectId);
  },

  add(d: SubcontractorDecision): void {
    const list = loadDecisions();
    list.push(d);
    saveDecisions(list);
  },

  update(id: string, updates: Partial<SubcontractorDecision>): SubcontractorDecision | undefined {
    const list = loadDecisions();
    const idx = list.findIndex(d => d.id === id);
    if (idx === -1) return undefined;
    list[idx] = { ...list[idx], ...updates };
    saveDecisions(list);
    return list[idx];
  },

  markAsSent(id: string, via: 'whatsapp' | 'email' | 'sms'): void {
    this.update(id, { sentToContractor: true, sentAt: new Date().toISOString(), sentVia: via });
  },

  clear(): void {
    saveDecisions([]);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

export function loadConfig(): DecisionConfig {
  try {
    const raw = localStorage.getItem(KEYS.config);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: DecisionConfig): void {
  localStorage.setItem(KEYS.config, JSON.stringify(cfg));
}

// ═══════════════════════════════════════════════════════════════════════════
// THE DECISION ENGINE — AUTONOMOUS CORE
// ═══════════════════════════════════════════════════════════════════════════

export interface DecideInput {
  projectId?: string;
  projectName: string;
  client: string;
  address: string;
  workType: WorkType;
  totalProjectValue: number;
  areaSqm: number;
  startDate: string;
  deadline: string;
  requirements?: string;
  rawMaterialsRequired?: ProjectMaterialRequirement[];
}

export function decide(input: DecideInput): SubcontractorDecision {
  const config = loadConfig();
  const candidates = SubcontractorRegistry.findAvailable(input.workType);

  if (candidates.length === 0) {
    throw new Error(`אין קבלנים זמינים לעבודת ${input.workType}. הוסף קבלן עם מחירון קודם.`);
  }

  // ── Step 1: compute costs for each candidate ──

  const analyses: CandidateAnalysis[] = candidates.map(contractor => {
    const pricing = contractor.pricing.find(p => p.workType === input.workType)!;

    let costByPercentage = input.totalProjectValue * (pricing.percentageRate / 100);
    let costBySqm = input.areaSqm * pricing.pricePerSqm;

    if (pricing.minimumPrice) {
      costByPercentage = Math.max(costByPercentage, pricing.minimumPrice);
      costBySqm = Math.max(costBySqm, pricing.minimumPrice);
    }

    const bestMethod: PricingMethod = costByPercentage <= costBySqm ? 'percentage' : 'per_sqm';
    const bestCost = Math.min(costByPercentage, costBySqm);

    const qualityScore = (contractor.qualityRating / 10) * 50 + (contractor.reliabilityRating / 10) * 50;

    const maxPossibleCost = Math.max(input.totalProjectValue * 0.5, input.areaSqm * 1000);
    const priceScore = Math.max(0, 100 - (bestCost / maxPossibleCost) * 100);

    const finalScore =
      priceScore * config.priceWeight +
      (contractor.qualityRating / 10) * 100 * config.qualityWeight +
      (contractor.reliabilityRating / 10) * 100 * config.reliabilityWeight;

    return {
      contractorId: contractor.id,
      contractorName: contractor.name,
      costByPercentage: Math.round(costByPercentage),
      percentageRate: pricing.percentageRate,
      costBySqm: Math.round(costBySqm),
      pricePerSqm: pricing.pricePerSqm,
      bestCost: Math.round(bestCost),
      bestMethod,
      qualityScore: Math.round(qualityScore),
      finalScore: Math.round(finalScore * 10) / 10,
      available: contractor.available,
    };
  });

  analyses.sort((a, b) => b.finalScore - a.finalScore);

  const winner = analyses[0];

  const alternativeCost = winner.bestMethod === 'percentage' ? winner.costBySqm : winner.costByPercentage;
  const savingsAmount = alternativeCost - winner.bestCost;
  const savingsPercent = alternativeCost > 0 ? Math.round((savingsAmount / alternativeCost) * 100 * 10) / 10 : 0;

  // ── Step 2: raw materials cost ──

  const materialsCost = (input.rawMaterialsRequired || []).reduce((sum, m) => sum + m.totalCost, 0);

  // ── Step 3: gross margin and alert level ──

  const totalCost = winner.bestCost + materialsCost;
  const grossProfit = input.totalProjectValue - totalCost;
  const grossMargin = input.totalProjectValue > 0
    ? Math.round((grossProfit / input.totalProjectValue) * 100 * 10) / 10
    : 0;

  let alertLevel: 'info' | 'warning' | 'critical' = 'info';
  let alertMessage = '';

  if (grossMargin >= config.goodMarginThreshold) {
    alertLevel = 'info';
    alertMessage = `✅ עסקה מצוינת — רווח גולמי ${grossMargin}% (מעל סף ${config.goodMarginThreshold}%)`;
  } else if (grossMargin >= config.badMarginThreshold) {
    alertLevel = 'warning';
    alertMessage = `⚠️ עסקה בינונית — רווח גולמי ${grossMargin}% (בין ${config.badMarginThreshold}-${config.goodMarginThreshold}%)`;
  } else {
    alertLevel = 'critical';
    alertMessage = `🚨 עסקה גרועה — רווח גולמי ${grossMargin}% בלבד (מתחת ל-${config.badMarginThreshold}%). לא מומלץ לקחת!`;
  }

  // ── Step 4: reasoning ──

  const reasoning = buildReasoning(input, winner, analyses, savingsAmount, savingsPercent, materialsCost, grossProfit, grossMargin);

  // ── Step 5: work order ──

  const workOrder = createWorkOrder(input, winner, config);

  // ── Step 6: assemble decision ──

  const decision: SubcontractorDecision = {
    id: `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    projectId: input.projectId || `proj_${Date.now().toString(36)}`,
    projectName: input.projectName,
    timestamp: new Date().toISOString(),
    analysis: {
      candidates: analyses,
      selectedContractorId: winner.contractorId,
      selectedContractorName: winner.contractorName,
      selectedPricingMethod: winner.bestMethod,
      selectedCost: winner.bestCost,
      alternativeCost,
      savingsAmount,
      savingsPercent,
    },
    reasoning,
    workOrder,
    sentToContractor: false,
    alertLevel,
    alertMessage,
  };

  DecisionStore.add(decision);
  return decision;
}

function buildReasoning(
  input: DecideInput,
  winner: CandidateAnalysis,
  allCandidates: CandidateAnalysis[],
  savingsAmount: number,
  savingsPercent: number,
  materialsCost: number,
  grossProfit: number,
  grossMargin: number,
): string[] {
  const reasons: string[] = [];

  reasons.push(`📋 פרויקט: ${input.projectName} | לקוח: ${input.client}`);
  reasons.push(`💰 סכום פרויקט: ₪${input.totalProjectValue.toLocaleString()} | שטח: ${input.areaSqm} מ"ר`);
  reasons.push(`---`);
  reasons.push(`🏆 נבחר: ${winner.contractorName}`);

  if (winner.bestMethod === 'percentage') {
    reasons.push(`📊 שיטת תמחור: אחוזים (${winner.percentageRate}% מסכום הפרויקט)`);
    reasons.push(`💵 עלות קבלן: ₪${winner.bestCost.toLocaleString()} (לפי אחוזים)`);
    reasons.push(`❌ אלטרנטיבה: ₪${winner.costBySqm.toLocaleString()} (לפי מ"ר — יקר יותר)`);
  } else {
    reasons.push(`📊 שיטת תמחור: מחיר למ"ר (₪${winner.pricePerSqm}/מ"ר)`);
    reasons.push(`💵 עלות קבלן: ₪${winner.bestCost.toLocaleString()} (לפי מ"ר)`);
    reasons.push(`❌ אלטרנטיבה: ₪${winner.costByPercentage.toLocaleString()} (לפי אחוזים — יקר יותר)`);
  }

  reasons.push(`✅ חיסכון קבלן: ₪${savingsAmount.toLocaleString()} (${savingsPercent}%)`);
  reasons.push(`⭐ ציון איכות: ${winner.qualityScore}/100`);
  reasons.push(`🎯 ציון משוקלל סופי: ${winner.finalScore}/100`);

  if (materialsCost > 0) {
    reasons.push(`---`);
    reasons.push(`🏗️ עלות חומרי גלם: ₪${materialsCost.toLocaleString()}`);
  }

  if (allCandidates.length > 1) {
    reasons.push(`---`);
    reasons.push(`📊 השוואה בין ${allCandidates.length} קבלנים:`);
    for (const c of allCandidates) {
      const tag = c.contractorId === winner.contractorId ? '🏆' : '  ';
      reasons.push(
        `${tag} ${c.contractorName}: ₪${c.bestCost.toLocaleString()} (${c.bestMethod === 'percentage' ? `${c.percentageRate}%` : `₪${c.pricePerSqm}/מ"ר`}) | ציון: ${c.finalScore}`,
      );
    }
  }

  reasons.push(`---`);
  reasons.push(`📈 רווח גולמי לחברה: ₪${grossProfit.toLocaleString()} (${grossMargin}%)`);

  return reasons;
}

function createWorkOrder(input: DecideInput, winner: CandidateAnalysis, config: DecisionConfig): WorkOrder {
  const vatAmount = config.includeVat ? Math.round(winner.bestCost * VAT_RATE) : 0;

  return {
    id: `wo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    projectId: input.projectId || `proj_${Date.now().toString(36)}`,
    contractorId: winner.contractorId,
    contractorName: winner.contractorName,
    workType: input.workType,
    pricingMethod: winner.bestMethod,
    agreedPrice: winner.bestCost,
    projectValue: input.totalProjectValue,
    areaSqm: input.areaSqm,
    startDate: input.startDate,
    deadline: input.deadline,
    requirements: input.requirements ?? '',
    paymentTerms: config.defaultPaymentTerms,
    vatIncluded: config.includeVat,
    vatAmount,
    totalWithVat: winner.bestCost + vatAmount,
    createdAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTONOMOUS PIPELINE — processes every incoming quote/deal
// ═══════════════════════════════════════════════════════════════════════════

export interface IncomingQuote {
  quoteId: string;
  projectName: string;
  client: string;
  address: string;
  workType: WorkType;
  totalProjectValue: number;
  areaSqm: number;
  startDate: string;
  deadline: string;
  requirements?: string;
  rawMaterialsRequired?: ProjectMaterialRequirement[];
}

/**
 * The autonomous entry point — every quote/deal that comes in passes through here.
 * Returns the decision immediately; if it fails (no contractors), it records an error alert.
 */
export function processIncomingQuote(quote: IncomingQuote): SubcontractorDecision | null {
  try {
    return decide({
      projectId: quote.quoteId,
      projectName: quote.projectName,
      client: quote.client,
      address: quote.address,
      workType: quote.workType,
      totalProjectValue: quote.totalProjectValue,
      areaSqm: quote.areaSqm,
      startDate: quote.startDate,
      deadline: quote.deadline,
      requirements: quote.requirements,
      rawMaterialsRequired: quote.rawMaterialsRequired,
    });
  } catch (e) {
    console.error('[SubcontractorEngine] Failed to process quote:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTING
// ═══════════════════════════════════════════════════════════════════════════

export function getSavingsReport() {
  const decisions = DecisionStore.getAll();
  const byWorkType: Record<string, { count: number; savings: number }> = {};
  const byContractor: Record<string, { count: number; totalCost: number }> = {};
  let totalSavings = 0;
  let totalSavingsPercent = 0;

  for (const d of decisions) {
    totalSavings += d.analysis.savingsAmount;
    totalSavingsPercent += d.analysis.savingsPercent;

    const wt = d.workOrder.workType;
    if (!byWorkType[wt]) byWorkType[wt] = { count: 0, savings: 0 };
    byWorkType[wt].count++;
    byWorkType[wt].savings += d.analysis.savingsAmount;

    const cn = d.workOrder.contractorName;
    if (!byContractor[cn]) byContractor[cn] = { count: 0, totalCost: 0 };
    byContractor[cn].count++;
    byContractor[cn].totalCost += d.analysis.selectedCost;
  }

  return {
    totalDecisions: decisions.length,
    totalSavings,
    avgSavingsPercent: decisions.length > 0 ? Math.round((totalSavingsPercent / decisions.length) * 10) / 10 : 0,
    byWorkType,
    byContractor,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WORK ORDER FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

export function formatWorkOrderMessage(decision: SubcontractorDecision, language: 'he' | 'en' = 'he'): string {
  const wo = decision.workOrder;
  const contractor = SubcontractorRegistry.get(wo.contractorId);
  const winner = decision.analysis.candidates.find(c => c.contractorId === wo.contractorId);

  if (language === 'he') {
    return [
      `══════════════════════════════`,
      `📄 הזמנת עבודה #${wo.id}`,
      `══════════════════════════════`,
      ``,
      `לכבוד: ${wo.contractorName}`,
      `תאריך: ${new Date(wo.createdAt).toLocaleDateString('he-IL')}`,
      ``,
      `── פרטי העבודה ──`,
      `סוג עבודה: ${wo.workType}`,
      `כתובת: ${contractor?.notes ?? ''}`,
      `שטח: ${wo.areaSqm} מ"ר`,
      ``,
      `── תמחור ──`,
      wo.pricingMethod === 'percentage'
        ? `שיטה: אחוז מהפרויקט (${winner?.percentageRate}%)`
        : `שיטה: מחיר למ"ר (₪${winner?.pricePerSqm}/מ"ר)`,
      `סכום מוסכם: ₪${wo.agreedPrice.toLocaleString()}`,
      wo.vatIncluded ? `מע"מ (18%): ₪${wo.vatAmount.toLocaleString()}` : `ללא מע"מ`,
      `סה"כ לתשלום: ₪${wo.totalWithVat.toLocaleString()}`,
      ``,
      `── לוח זמנים ──`,
      `תחילת עבודה: ${new Date(wo.startDate).toLocaleDateString('he-IL')}`,
      `סיום נדרש: ${new Date(wo.deadline).toLocaleDateString('he-IL')}`,
      ``,
      `── תנאי תשלום ──`,
      `${wo.paymentTerms}`,
      ``,
      wo.requirements ? `── דרישות מיוחדות ──\n${wo.requirements}\n` : '',
      `══════════════════════════════`,
      `טכנו כל עוזי בע"מ`,
      `══════════════════════════════`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `═══════════════════════════`,
    `📄 Work Order #${wo.id}`,
    `═══════════════════════════`,
    ``,
    `To: ${wo.contractorName}`,
    `Date: ${new Date(wo.createdAt).toLocaleDateString('en-IL')}`,
    `Work Type: ${wo.workType}`,
    `Area: ${wo.areaSqm} sqm`,
    `Agreed Price: ₪${wo.agreedPrice.toLocaleString()}`,
    `Total (incl. VAT): ₪${wo.totalWithVat.toLocaleString()}`,
    `Start: ${new Date(wo.startDate).toLocaleDateString('en-IL')}`,
    `Deadline: ${new Date(wo.deadline).toLocaleDateString('en-IL')}`,
    `Payment: ${wo.paymentTerms}`,
    ``,
    `Techno Kol Uzi Ltd.`,
  ].join('\n');
}
