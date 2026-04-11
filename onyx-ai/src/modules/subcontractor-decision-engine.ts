/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   ONYX SUBCONTRACTOR DECISION ENGINE                                   ║
 * ║   מנוע החלטות AI לקבלני משנה — טכנו כל עוזי                           ║
 * ║                                                                        ║
 * ║   מחשב אוטומטית מה זול יותר לחברה:                                    ║
 * ║   • אחוז מהפרויקט (% מהסכום הכולל)                                    ║
 * ║   • מחיר למ"ר (₪ × שטח בפועל)                                        ║
 * ║                                                                        ║
 * ║   ה-AI מקבל החלטה → מפיק הזמנה → שולח לקבלן                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *  FLOW:
 *
 *  פרויקט חדש נכנס
 *       ↓
 *  ┌────────────────────────────┐
 *  │  שליפת מחירי קבלנים       │  ← מחירון ידני (אחוזים + מ"ר)
 *  └────────────┬───────────────┘
 *               ↓
 *  ┌────────────────────────────┐
 *  │  חישוב עלות לפי אחוזים    │  סכום_פרויקט × אחוז_קבלן
 *  │  חישוב עלות לפי מ"ר       │  שטח_מ"ר × מחיר_למ"ר
 *  └────────────┬───────────────┘
 *               ↓
 *  ┌────────────────────────────┐
 *  │  AI DECISION               │
 *  │  בוחר את הזול יותר        │
 *  │  + מחשב חיסכון            │
 *  │  + מתעד סיבה              │
 *  └────────────┬───────────────┘
 *               ↓
 *  ┌────────────────────────────┐
 *  │  הפקת הזמנת עבודה         │  → שליחה לקבלן (WhatsApp/Email)
 *  │  + תיעוד באירועים         │
 *  └────────────────────────────┘
 */


// ═══════════════════════════════════════════════════════════════════════════
// TYPES — הגדרות מערכת
// ═══════════════════════════════════════════════════════════════════════════

/** סוג עבודה */
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

/** שיטת תמחור */
export type PricingMethod = 'percentage' | 'per_sqm';

/** קבלן משנה */
export interface Subcontractor {
  id: string;
  name: string;
  phone: string;
  email?: string;
  specialties: WorkType[];
  /** מחירון ידני — מעודכן ע"י המשתמש */
  pricing: SubcontractorPricing[];
  /** דירוג איכות 1-10 */
  qualityRating: number;
  /** דירוג אמינות 1-10 */
  reliabilityRating: number;
  /** זמינות נוכחית */
  available: boolean;
  /** הערות */
  notes: string;
  /** סטטיסטיקות */
  stats: {
    totalProjects: number;
    completedOnTime: number;
    avgDelayDays: number;
    totalRevenue: number;
    complaints: number;
  };
}

/** מחירון קבלן — נקבע ידנית */
export interface SubcontractorPricing {
  workType: WorkType;
  /** אחוז מסכום הפרויקט */
  percentageRate: number;
  /** מחיר למ"ר בשקלים */
  pricePerSqm: number;
  /** מחיר מינימום (אם רלוונטי) */
  minimumPrice?: number;
  /** תאריך עדכון אחרון */
  lastUpdated: Date;
  /** הערות למחיר */
  notes?: string;
}

/** פרויקט */
export interface Project {
  id: string;
  name: string;
  client: string;
  address: string;
  workType: WorkType;
  /** סכום הפרויקט הכולל (מה שהלקוח משלם) */
  totalProjectValue: number;
  /** שטח העבודה במ"ר */
  areaSqm: number;
  /** תאריך התחלה */
  startDate: Date;
  /** דד-ליין */
  deadline: Date;
  /** דרישות מיוחדות */
  requirements: string;
  /** סטטוס */
  status: 'new' | 'quoted' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
}

/** החלטת AI */
export interface SubcontractorDecision {
  id: string;
  projectId: string;
  timestamp: Date;

  /** הניתוח */
  analysis: {
    /** כל הקבלנים שנבדקו */
    candidates: CandidateAnalysis[];
    /** הקבלן שנבחר */
    selectedContractorId: string;
    /** שיטת התמחור שנבחרה */
    selectedPricingMethod: PricingMethod;
    /** העלות שנבחרה */
    selectedCost: number;
    /** העלות של האלטרנטיבה */
    alternativeCost: number;
    /** כמה חסכנו */
    savingsAmount: number;
    /** אחוז חיסכון */
    savingsPercent: number;
  };

  /** ההנמקה */
  reasoning: string[];

  /** הזמנת עבודה */
  workOrder: WorkOrder;

  /** האם נשלח לקבלן */
  sentToContractor: boolean;
  sentAt?: Date;
  sentVia?: 'whatsapp' | 'email' | 'sms';
}

/** ניתוח מועמד */
export interface CandidateAnalysis {
  contractorId: string;
  contractorName: string;
  /** עלות לפי אחוזים */
  costByPercentage: number;
  percentageRate: number;
  /** עלות לפי מ"ר */
  costBySqm: number;
  pricePerSqm: number;
  /** העלות הזולה מבין השתיים */
  bestCost: number;
  bestMethod: PricingMethod;
  /** ציון איכות/אמינות */
  qualityScore: number;
  /** ציון משוקלל סופי (מחיר × איכות) */
  finalScore: number;
  /** האם זמין */
  available: boolean;
}

/** הזמנת עבודה */
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
  startDate: Date;
  deadline: Date;
  requirements: string;
  /** תנאי תשלום */
  paymentTerms: string;
  /** מע"מ */
  vatIncluded: boolean;
  vatAmount: number;
  totalWithVat: number;
  createdAt: Date;
}


// ═══════════════════════════════════════════════════════════════════════════
// SUBCONTRACTOR REGISTRY — מאגר קבלנים עם מחירון ידני
// ═══════════════════════════════════════════════════════════════════════════

export class SubcontractorRegistry {
  private contractors: Map<string, Subcontractor> = new Map();

  /** הוספת קבלן */
  addContractor(params: {
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
    this.contractors.set(id, contractor);
    return contractor;
  }

  /** עדכון מחירון ידני — הפעולה המרכזית */
  setPricing(contractorId: string, pricing: {
    workType: WorkType;
    percentageRate: number;
    pricePerSqm: number;
    minimumPrice?: number;
    notes?: string;
  }): void {
    const contractor = this.contractors.get(contractorId);
    if (!contractor) throw new Error(`קבלן ${contractorId} לא נמצא`);

    // מחיקת מחיר קיים לאותו סוג עבודה
    contractor.pricing = contractor.pricing.filter(p => p.workType !== pricing.workType);

    // הוספת מחיר חדש
    contractor.pricing.push({
      workType: pricing.workType,
      percentageRate: pricing.percentageRate,
      pricePerSqm: pricing.pricePerSqm,
      minimumPrice: pricing.minimumPrice,
      lastUpdated: new Date(),
      notes: pricing.notes,
    });
  }

  /** עדכון מחירון בבת אחת לכמה סוגי עבודה */
  setBulkPricing(contractorId: string, pricingList: Array<{
    workType: WorkType;
    percentageRate: number;
    pricePerSqm: number;
    minimumPrice?: number;
  }>): void {
    for (const p of pricingList) {
      this.setPricing(contractorId, p);
    }
  }

  /** שליפת קבלנים לפי סוג עבודה */
  findByWorkType(workType: WorkType): Subcontractor[] {
    return Array.from(this.contractors.values())
      .filter(c => c.specialties.includes(workType) || c.specialties.includes('custom'))
      .filter(c => c.pricing.some(p => p.workType === workType));
  }

  /** שליפת קבלנים זמינים */
  findAvailable(workType: WorkType): Subcontractor[] {
    return this.findByWorkType(workType).filter(c => c.available);
  }

  getContractor(id: string): Subcontractor | undefined {
    return this.contractors.get(id);
  }

  getAllContractors(): Subcontractor[] {
    return Array.from(this.contractors.values());
  }

  setAvailability(contractorId: string, available: boolean): void {
    const c = this.contractors.get(contractorId);
    if (c) c.available = available;
  }

  updateRating(contractorId: string, quality?: number, reliability?: number): void {
    const c = this.contractors.get(contractorId);
    if (c) {
      if (quality !== undefined) c.qualityRating = Math.max(1, Math.min(10, quality));
      if (reliability !== undefined) c.reliabilityRating = Math.max(1, Math.min(10, reliability));
    }
  }

  updateStats(contractorId: string, update: Partial<Subcontractor['stats']>): void {
    const c = this.contractors.get(contractorId);
    if (c) {
      if (update.totalProjects !== undefined) c.stats.totalProjects = update.totalProjects;
      if (update.completedOnTime !== undefined) c.stats.completedOnTime = update.completedOnTime;
      if (update.avgDelayDays !== undefined) c.stats.avgDelayDays = update.avgDelayDays;
      if (update.totalRevenue !== undefined) c.stats.totalRevenue = update.totalRevenue;
      if (update.complaints !== undefined) c.stats.complaints = update.complaints;
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// DECISION ENGINE — הלב של המערכת
// ═══════════════════════════════════════════════════════════════════════════

const VAT_RATE = 0.18; // 18% מע"מ

export interface DecisionConfig {
  /** משקל מחיר בציון הסופי (0-1) */
  priceWeight: number;
  /** משקל איכות בציון הסופי (0-1) */
  qualityWeight: number;
  /** משקל אמינות בציון הסופי (0-1) */
  reliabilityWeight: number;
  /** האם לשלוח אוטומטית לקבלן */
  autoSendToContractor: boolean;
  /** שיטת שליחה מועדפת */
  preferredSendMethod: 'whatsapp' | 'email' | 'sms';
  /** תנאי תשלום ברירת מחדל */
  defaultPaymentTerms: string;
  /** האם לכלול מע"מ */
  includeVat: boolean;
}

export class SubcontractorDecisionEngine {
  private decisions: Map<string, SubcontractorDecision> = new Map();
  private config: DecisionConfig;

  constructor(
    private registry: SubcontractorRegistry,
    config?: Partial<DecisionConfig>,
  ) {
    this.config = {
      priceWeight: 0.6,
      qualityWeight: 0.25,
      reliabilityWeight: 0.15,
      autoSendToContractor: false,
      preferredSendMethod: 'whatsapp',
      defaultPaymentTerms: 'שוטף + 30',
      includeVat: true,
      ...config,
    };
  }

  // ─── הפונקציה המרכזית: קבלת החלטה על פרויקט ─────────────────────

  decide(project: Project): SubcontractorDecision {
    const candidates = this.registry.findAvailable(project.workType);

    if (candidates.length === 0) {
      throw new Error(`אין קבלנים זמינים לעבודת ${project.workType}`);
    }

    // ── שלב 1: חישוב עלות לכל קבלן בשתי השיטות ──

    const analyses: CandidateAnalysis[] = candidates.map(contractor => {
      const pricing = contractor.pricing.find(p => p.workType === project.workType);
      if (!pricing) throw new Error(`אין מחירון ל-${project.workType} עבור ${contractor.name}`);

      // חישוב עלות לפי אחוזים
      let costByPercentage = project.totalProjectValue * (pricing.percentageRate / 100);

      // חישוב עלות לפי מ"ר
      let costBySqm = project.areaSqm * pricing.pricePerSqm;

      // בדיקת מחיר מינימום
      if (pricing.minimumPrice) {
        costByPercentage = Math.max(costByPercentage, pricing.minimumPrice);
        costBySqm = Math.max(costBySqm, pricing.minimumPrice);
      }

      // בחירת השיטה הזולה יותר
      const bestMethod: PricingMethod = costByPercentage <= costBySqm ? 'percentage' : 'per_sqm';
      const bestCost = Math.min(costByPercentage, costBySqm);

      // ציון איכות משוקלל (0-100)
      const qualityScore = (contractor.qualityRating / 10) * 50 + (contractor.reliabilityRating / 10) * 50;

      // ציון סופי: שילוב מחיר ואיכות
      // ככל שהמחיר נמוך יותר, הציון גבוה יותר
      const maxPossibleCost = Math.max(project.totalProjectValue * 0.5, project.areaSqm * 1000);
      const priceScore = Math.max(0, 100 - (bestCost / maxPossibleCost) * 100);

      const finalScore =
        priceScore * this.config.priceWeight +
        (contractor.qualityRating / 10) * 100 * this.config.qualityWeight +
        (contractor.reliabilityRating / 10) * 100 * this.config.reliabilityWeight;

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

    // ── שלב 2: מיון לפי ציון סופי (הגבוה ביותר = הטוב ביותר) ──

    analyses.sort((a, b) => b.finalScore - a.finalScore);

    // ── שלב 3: בחירת המנצח ──

    const winner = analyses[0];

    // חישוב חיסכון מול האלטרנטיבה היקרה
    const alternativeCost = winner.bestMethod === 'percentage' ? winner.costBySqm : winner.costByPercentage;
    const savingsAmount = alternativeCost - winner.bestCost;
    const savingsPercent = alternativeCost > 0 ? Math.round((savingsAmount / alternativeCost) * 100 * 10) / 10 : 0;

    // ── שלב 4: בניית הנמקה ──

    const reasoning = this.buildReasoning(project, winner, analyses, savingsAmount, savingsPercent);

    // ── שלב 5: הפקת הזמנת עבודה ──

    const workOrder = this.createWorkOrder(project, winner);

    // ── שלב 6: שמירת ההחלטה ──

    const decision: SubcontractorDecision = {
      id: `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      projectId: project.id,
      timestamp: new Date(),
      analysis: {
        candidates: analyses,
        selectedContractorId: winner.contractorId,
        selectedPricingMethod: winner.bestMethod,
        selectedCost: winner.bestCost,
        alternativeCost,
        savingsAmount,
        savingsPercent,
      },
      reasoning,
      workOrder,
      sentToContractor: false,
    };

    this.decisions.set(decision.id, decision);
    return decision;
  }


  // ─── בניית הנמקה ─────────────────────────────────────────────────

  private buildReasoning(
    project: Project,
    winner: CandidateAnalysis,
    allCandidates: CandidateAnalysis[],
    savingsAmount: number,
    savingsPercent: number,
  ): string[] {
    const reasons: string[] = [];

    reasons.push(`📋 פרויקט: ${project.name} | לקוח: ${project.client}`);
    reasons.push(`💰 סכום פרויקט: ₪${project.totalProjectValue.toLocaleString()} | שטח: ${project.areaSqm} מ"ר`);
    reasons.push(`---`);
    reasons.push(`🏆 נבחר: ${winner.contractorName}`);

    if (winner.bestMethod === 'percentage') {
      reasons.push(`📊 שיטת תמחור: אחוזים (${winner.percentageRate}% מסכום הפרויקט)`);
      reasons.push(`💵 עלות: ₪${winner.bestCost.toLocaleString()} (לפי אחוזים)`);
      reasons.push(`❌ אלטרנטיבה: ₪${winner.costBySqm.toLocaleString()} (לפי מ"ר — יקר יותר)`);
    } else {
      reasons.push(`📊 שיטת תמחור: מחיר למ"ר (₪${winner.pricePerSqm}/מ"ר)`);
      reasons.push(`💵 עלות: ₪${winner.bestCost.toLocaleString()} (לפי מ"ר)`);
      reasons.push(`❌ אלטרנטיבה: ₪${winner.costByPercentage.toLocaleString()} (לפי אחוזים — יקר יותר)`);
    }

    reasons.push(`✅ חיסכון: ₪${savingsAmount.toLocaleString()} (${savingsPercent}%)`);
    reasons.push(`⭐ ציון איכות: ${winner.qualityScore}/100`);
    reasons.push(`🎯 ציון משוקלל סופי: ${winner.finalScore}/100`);

    if (allCandidates.length > 1) {
      reasons.push(`---`);
      reasons.push(`📊 השוואה בין ${allCandidates.length} קבלנים:`);
      for (const c of allCandidates) {
        const tag = c.contractorId === winner.contractorId ? '🏆' : '  ';
        reasons.push(`${tag} ${c.contractorName}: ₪${c.bestCost.toLocaleString()} (${c.bestMethod === 'percentage' ? `${c.percentageRate}%` : `₪${c.pricePerSqm}/מ"ר`}) | ציון: ${c.finalScore}`);
      }
    }

    // חישוב רווח גולמי לחברה
    const grossProfit = project.totalProjectValue - winner.bestCost;
    const grossMargin = Math.round((grossProfit / project.totalProjectValue) * 100 * 10) / 10;
    reasons.push(`---`);
    reasons.push(`📈 רווח גולמי לחברה: ₪${grossProfit.toLocaleString()} (${grossMargin}%)`);

    return reasons;
  }


  // ─── הפקת הזמנת עבודה ─────────────────────────────────────────────

  private createWorkOrder(project: Project, winner: CandidateAnalysis): WorkOrder {
    const vatAmount = this.config.includeVat ? Math.round(winner.bestCost * VAT_RATE) : 0;

    return {
      id: `wo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      projectId: project.id,
      contractorId: winner.contractorId,
      contractorName: winner.contractorName,
      workType: project.workType,
      pricingMethod: winner.bestMethod,
      agreedPrice: winner.bestCost,
      projectValue: project.totalProjectValue,
      areaSqm: project.areaSqm,
      startDate: project.startDate,
      deadline: project.deadline,
      requirements: project.requirements,
      paymentTerms: this.config.defaultPaymentTerms,
      vatIncluded: this.config.includeVat,
      vatAmount,
      totalWithVat: winner.bestCost + vatAmount,
      createdAt: new Date(),
    };
  }


  // ─── פורמט הזמנת עבודה לשליחה ────────────────────────────────────

  formatWorkOrderMessage(decision: SubcontractorDecision, language: 'he' | 'en' = 'he'): string {
    const wo = decision.workOrder;
    const contractor = this.registry.getContractor(wo.contractorId);

    if (language === 'he') {
      return [
        `══════════════════════════════`,
        `📄 הזמנת עבודה #${wo.id}`,
        `══════════════════════════════`,
        ``,
        `לכבוד: ${wo.contractorName}`,
        `תאריך: ${wo.createdAt.toLocaleDateString('he-IL')}`,
        ``,
        `── פרטי העבודה ──`,
        `סוג עבודה: ${wo.workType}`,
        `כתובת: ${contractor?.notes ?? ''}`,
        `שטח: ${wo.areaSqm} מ"ר`,
        ``,
        `── תמחור ──`,
        wo.pricingMethod === 'percentage'
          ? `שיטה: אחוז מהפרויקט (${decision.analysis.candidates.find(c => c.contractorId === wo.contractorId)?.percentageRate}%)`
          : `שיטה: מחיר למ"ר (₪${decision.analysis.candidates.find(c => c.contractorId === wo.contractorId)?.pricePerSqm}/מ"ר)`,
        `סכום מוסכם: ₪${wo.agreedPrice.toLocaleString()}`,
        wo.vatIncluded ? `מע"מ (18%): ₪${wo.vatAmount.toLocaleString()}` : `ללא מע"מ`,
        `סה"כ לתשלום: ₪${wo.totalWithVat.toLocaleString()}`,
        ``,
        `── לוח זמנים ──`,
        `תחילת עבודה: ${wo.startDate.toLocaleDateString('he-IL')}`,
        `סיום נדרש: ${wo.deadline.toLocaleDateString('he-IL')}`,
        ``,
        `── תנאי תשלום ──`,
        `${wo.paymentTerms}`,
        ``,
        wo.requirements ? `── דרישות מיוחדות ──\n${wo.requirements}\n` : '',
        `══════════════════════════════`,
        `טכנו כל עוזי בע"מ`,
        `══════════════════════════════`,
      ].filter(Boolean).join('\n');
    }

    return [
      `═══════════════════════════`,
      `📄 Work Order #${wo.id}`,
      `═══════════════════════════`,
      ``,
      `To: ${wo.contractorName}`,
      `Date: ${wo.createdAt.toLocaleDateString('en-IL')}`,
      `Work Type: ${wo.workType}`,
      `Area: ${wo.areaSqm} sqm`,
      `Agreed Price: ₪${wo.agreedPrice.toLocaleString()}`,
      `Total (incl. VAT): ₪${wo.totalWithVat.toLocaleString()}`,
      `Start: ${wo.startDate.toLocaleDateString('en-IL')}`,
      `Deadline: ${wo.deadline.toLocaleDateString('en-IL')}`,
      `Payment: ${wo.paymentTerms}`,
      ``,
      `Techno Kol Uzi Ltd.`,
    ].join('\n');
  }


  // ─── שליפת החלטות ─────────────────────────────────────────────────

  getDecision(id: string): SubcontractorDecision | undefined {
    return this.decisions.get(id);
  }

  getDecisionsByProject(projectId: string): SubcontractorDecision[] {
    return Array.from(this.decisions.values()).filter(d => d.projectId === projectId);
  }

  getAllDecisions(): SubcontractorDecision[] {
    return Array.from(this.decisions.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /** דוח חיסכון כולל */
  getSavingsReport(): {
    totalDecisions: number;
    totalSavings: number;
    avgSavingsPercent: number;
    byWorkType: Record<string, { count: number; savings: number }>;
    byContractor: Record<string, { count: number; totalCost: number }>;
  } {
    const decisions = this.getAllDecisions();
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

  /** עדכון הגדרות */
  updateConfig(updates: Partial<DecisionConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /** סימון ההחלטה כנשלחה */
  markAsSent(decisionId: string, via: 'whatsapp' | 'email' | 'sms'): void {
    const d = this.decisions.get(decisionId);
    if (d) {
      d.sentToContractor = true;
      d.sentAt = new Date();
      d.sentVia = via;
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// QUICK-ACCESS API — ממשק פשוט לשימוש יומיומי
// ═══════════════════════════════════════════════════════════════════════════

export class SubcontractorManager {
  readonly registry: SubcontractorRegistry;
  readonly engine: SubcontractorDecisionEngine;

  constructor(config?: Partial<DecisionConfig>) {
    this.registry = new SubcontractorRegistry();
    this.engine = new SubcontractorDecisionEngine(this.registry, config);
  }

  // ─── קבלנים ──

  /** הוסף קבלן */
  addContractor(name: string, phone: string, specialties: WorkType[], opts?: { email?: string; quality?: number; reliability?: number }): Subcontractor {
    return this.registry.addContractor({ name, phone, specialties, email: opts?.email, qualityRating: opts?.quality, reliabilityRating: opts?.reliability });
  }

  /** עדכן מחירון קבלן */
  setPrice(contractorId: string, workType: WorkType, percentageRate: number, pricePerSqm: number, minimumPrice?: number): void {
    this.registry.setPricing(contractorId, { workType, percentageRate, pricePerSqm, minimumPrice });
  }

  // ─── פרויקטים ──

  /** שלח פרויקט להחלטה */
  processProject(params: {
    name: string;
    client: string;
    address: string;
    workType: WorkType;
    totalValue: number;
    areaSqm: number;
    startDate: Date;
    deadline: Date;
    requirements?: string;
  }): SubcontractorDecision {
    const project: Project = {
      id: `proj_${Date.now().toString(36)}`,
      name: params.name,
      client: params.client,
      address: params.address,
      workType: params.workType,
      totalProjectValue: params.totalValue,
      areaSqm: params.areaSqm,
      startDate: params.startDate,
      deadline: params.deadline,
      requirements: params.requirements ?? '',
      status: 'new',
    };

    return this.engine.decide(project);
  }

  /** הדפס החלטה */
  printDecision(decision: SubcontractorDecision): void {
    console.log('\n' + decision.reasoning.join('\n') + '\n');
  }

  /** הדפס הזמנת עבודה */
  printWorkOrder(decision: SubcontractorDecision): void {
    console.log('\n' + this.engine.formatWorkOrderMessage(decision) + '\n');
  }

  /** דוח חיסכון */
  savingsReport(): void {
    const report = this.engine.getSavingsReport();
    console.log('\n═══════════════════════════════');
    console.log('📊 דוח חיסכון כולל');
    console.log('═══════════════════════════════');
    console.log(`סה"כ החלטות: ${report.totalDecisions}`);
    console.log(`סה"כ חיסכון: ₪${report.totalSavings.toLocaleString()}`);
    console.log(`חיסכון ממוצע: ${report.avgSavingsPercent}%`);
    console.log('\nלפי סוג עבודה:');
    for (const [type, data] of Object.entries(report.byWorkType)) {
      console.log(`  ${type}: ${data.count} פרויקטים | חיסכון: ₪${data.savings.toLocaleString()}`);
    }
    console.log('\nלפי קבלן:');
    for (const [name, data] of Object.entries(report.byContractor)) {
      console.log(`  ${name}: ${data.count} פרויקטים | סכום: ₪${data.totalCost.toLocaleString()}`);
    }
    console.log('═══════════════════════════════\n');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// דוגמת שימוש
// ═══════════════════════════════════════════════════════════════════════════
//
// const mgr = new SubcontractorManager({
//   priceWeight: 0.6,        // 60% משקל למחיר
//   qualityWeight: 0.25,     // 25% משקל לאיכות
//   reliabilityWeight: 0.15, // 15% משקל לאמינות
//   defaultPaymentTerms: 'שוטף + 30',
//   includeVat: true,
// });
//
// // ── הוספת קבלנים ──
// const moshe = mgr.addContractor('משה מעקות', '+972501234567', ['מעקות_ברזל', 'מעקות_אלומיניום'], { quality: 8, reliability: 9 });
// const david = mgr.addContractor('דוד מסגריה', '+972509876543', ['מעקות_ברזל', 'שערים', 'גדרות'], { quality: 7, reliability: 7 });
// const yossi = mgr.addContractor('יוסי התקנות', '+972503456789', ['התקנה', 'מעקות_ברזל'], { quality: 9, reliability: 6 });
//
// // ── הגדרת מחירון ידני ──
// mgr.setPrice(moshe.id, 'מעקות_ברזל', 15, 350);      // 15% או ₪350/מ"ר
// mgr.setPrice(moshe.id, 'מעקות_אלומיניום', 12, 400);  // 12% או ₪400/מ"ר
// mgr.setPrice(david.id, 'מעקות_ברזל', 18, 300);       // 18% או ₪300/מ"ר
// mgr.setPrice(david.id, 'שערים', 20, 500);             // 20% או ₪500/מ"ר
// mgr.setPrice(yossi.id, 'מעקות_ברזל', 14, 380, 5000); // 14% או ₪380/מ"ר, מינימום ₪5,000
//
// // ── שליחת פרויקט להחלטת AI ──
// const decision = mgr.processProject({
//   name: 'מעקות בניין מגורים קריית 10',
//   client: 'חברת כנען בנייה',
//   address: 'קריאתי 10, שכונת התקווה, תל אביב',
//   workType: 'מעקות_ברזל',
//   totalValue: 120000,     // ₪120,000 סכום הפרויקט
//   areaSqm: 280,           // 280 מ"ר
//   startDate: new Date('2026-05-01'),
//   deadline: new Date('2026-06-15'),
//   requirements: 'מעקות ברזל עם ציפוי אפוקסי, גובה 105 ס"מ, תקן ישראלי',
// });
//
// // ── תוצאה ──
// mgr.printDecision(decision);
// mgr.printWorkOrder(decision);
//
// // ── פלט לדוגמה ──
// // 📋 פרויקט: מעקות בניין מגורים קריית 10 | לקוח: חברת כנען בנייה
// // 💰 סכום פרויקט: ₪120,000 | שטח: 280 מ"ר
// // ---
// // 🏆 נבחר: משה מעקות
// // 📊 שיטת תמחור: אחוזים (15% מסכום הפרויקט)
// // 💵 עלות: ₪18,000 (לפי אחוזים)
// // ❌ אלטרנטיבה: ₪98,000 (לפי מ"ר — יקר יותר)
// // ✅ חיסכון: ₪80,000 (81.6%)
// // ---
// // 📈 רווח גולמי לחברה: ₪102,000 (85%)
