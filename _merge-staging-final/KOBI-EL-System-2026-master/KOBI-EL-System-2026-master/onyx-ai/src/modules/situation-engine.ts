/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   ONYX SITUATIONAL AWARENESS & ALERT ENGINE                           ║
 * ║   תמונת מצב בזמן אמת + מודל התראות חכם                               ║
 * ║                                                                        ║
 * ║   כל הנתונים מכל המודלים → תמונת מצב אחת → ציון בריאות חברה          ║
 * ║   חריגה מסף → התראה אוטומטית → WhatsApp / SMS / Email / Telegram      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │                    DATA FLOW ENGINE                            │
 *   │   פרויקטים│כספים│קבלנים│לקוחות│מלאי│איכות│משימות              │
 *   └─────────────────────┬──────────────────────────────────────────┘
 *                         ↓
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │              SITUATION AWARENESS ENGINE                         │
 *   │                                                                 │
 *   │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐      │
 *   │  │ Financial  │ │Operations │ │ Workforce │ │ Client    │      │
 *   │  │ Health     │ │ Health    │ │ Health    │ │ Health    │      │
 *   │  │ Score      │ │ Score     │ │ Score     │ │ Score     │      │
 *   │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘      │
 *   │        └──────────────┼──────────────┼──────────────┘           │
 *   │                       ↓                                         │
 *   │              ┌────────────────┐                                 │
 *   │              │ COMPANY HEALTH │ ← ציון כולל 0-100              │
 *   │              │    SCORE       │                                 │
 *   │              └───────┬────────┘                                 │
 *   │                      ↓                                          │
 *   │              ┌────────────────┐                                 │
 *   │              │ ALERT ENGINE   │ ← חריגה? → שלח התראה           │
 *   │              └────────────────┘                                 │
 *   └─────────────────────────────────────────────────────────────────┘
 */


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 0: TYPES
// ═══════════════════════════════════════════════════════════════════════════

type HealthLevel = 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
type AlertChannel = 'whatsapp' | 'sms' | 'email' | 'telegram' | 'slack' | 'discord' | 'system';
type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'expired' | 'silenced';

interface HealthScore {
  score: number;        // 0-100
  level: HealthLevel;
  trend: 'improving' | 'stable' | 'declining';
  factors: HealthFactor[];
  lastUpdated: number;
}

interface HealthFactor {
  name: string;
  score: number;         // 0-100
  weight: number;        // 0-1 — משקל בציון הכולל
  status: HealthLevel;
  detail: string;
  recommendation?: string;
}

/** תמונת מצב פיננסית */
interface FinancialSnapshot {
  revenue: { thisMonth: number; lastMonth: number; thisYear: number; trend: number };
  expenses: { thisMonth: number; lastMonth: number; thisYear: number; trend: number };
  profit: { thisMonth: number; lastMonth: number; thisYear: number; margin: number };
  cashflow: { current: number; projected30Days: number; runway: number };
  receivables: { total: number; overdue: number; avgDaysOutstanding: number };
  payables: { total: number; overdue: number; dueThisWeek: number };
}

/** תמונת מצב תפעולית */
interface OperationsSnapshot {
  activeProjects: number;
  projectsOnTrack: number;
  projectsDelayed: number;
  projectsOverBudget: number;
  avgProjectCompletion: number;
  pendingWorkOrders: number;
  completedThisMonth: number;
  utilizationRate: number;
}

/** תמונת מצב כח אדם */
interface WorkforceSnapshot {
  totalEmployees: number;
  activeSubcontractors: number;
  availableSubcontractors: number;
  avgSubcontractorRating: number;
  openTasks: number;
  overdueTasks: number;
  avgTaskCompletionTime: number;
}

/** תמונת מצב לקוחות */
interface ClientSnapshot {
  totalClients: number;
  activeClients: number;
  newClientsThisMonth: number;
  avgSatisfaction: number;
  pendingQuotes: number;
  conversionRate: number;
  complaintsOpen: number;
}

/** תמונת מצב כוללת */
interface CompanySnapshot {
  timestamp: number;
  companyHealth: HealthScore;
  financial: { snapshot: FinancialSnapshot; health: HealthScore };
  operations: { snapshot: OperationsSnapshot; health: HealthScore };
  workforce: { snapshot: WorkforceSnapshot; health: HealthScore };
  clients: { snapshot: ClientSnapshot; health: HealthScore };
  alerts: { active: number; critical: number; unacknowledged: number };
  topIssues: string[];
  topOpportunities: string[];
}

/** התראה */
interface Alert {
  id: string;
  timestamp: number;
  severity: AlertSeverity;
  category: string;
  title: string;
  message: string;
  detail: string;
  source: string;
  status: AlertStatus;
  channels: AlertChannel[];
  sentTo: Array<{ channel: AlertChannel; sentAt: number; delivered: boolean }>;
  relatedEntityId?: string;
  relatedEntityType?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolvedAt?: number;
  autoResolveAt?: number;
  escalationLevel: number;
  escalateAfterMs: number;
  metadata: Record<string, unknown>;
}

/** כלל התראה */
interface AlertRule {
  id: string;
  name: string;
  description: string;
  active: boolean;
  /** תנאי הפעלה */
  condition: (snapshot: CompanySnapshot) => boolean;
  /** חומרת ההתראה */
  severity: AlertSeverity;
  /** קטגוריה */
  category: string;
  /** כותרת */
  titleTemplate: (snapshot: CompanySnapshot) => string;
  /** הודעה מפורטת */
  messageTemplate: (snapshot: CompanySnapshot) => string;
  /** ערוצי שליחה */
  channels: AlertChannel[];
  /** cooldown — מינימום זמן בין התראות זהות (ms) */
  cooldownMs: number;
  /** אסקלציה אחרי (ms) */
  escalateAfterMs: number;
  /** auto-resolve אחרי (ms) */
  autoResolveMs?: number;
  /** פעם אחרונה שהופעלה */
  lastTriggeredAt?: number;
  /** עדיפות — גבוה יותר = נבדק ראשון */
  priority: number;
}

/** נמען התראות */
interface AlertRecipient {
  id: string;
  name: string;
  channels: {
    whatsapp?: string;
    sms?: string;
    email?: string;
    telegram?: string;
    slack?: string;
    discord?: string;
  };
  /** רמת חומרה מינימלית לקבלת התראה */
  minSeverity: AlertSeverity;
  /** קטגוריות שמעניינות (ריק = הכל) */
  categories: string[];
  /** שעות שקטות — לא לשלוח */
  quietHours?: { start: number; end: number };
  active: boolean;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: REAL-TIME DATA ACCUMULATOR
// אוסף נתונים מכל המודלים ושומר סיכום עדכני
// ═══════════════════════════════════════════════════════════════════════════

class DataAccumulator {
  // נתונים פיננסיים
  private revenues: Array<{ amount: number; date: number; projectId?: string }> = [];
  private expenses: Array<{ amount: number; date: number; category?: string }> = [];
  private receivables: Array<{ amount: number; dueDate: number; clientId: string; paid: boolean }> = [];
  private payables: Array<{ amount: number; dueDate: number; contractorId: string; paid: boolean }> = [];

  // פרויקטים
  private projects: Map<string, {
    id: string; name: string; status: string; budget: number; spent: number;
    startDate: number; deadline: number; completionPercent: number; delayed: boolean;
  }> = new Map();

  // קבלנים
  private subcontractors: Map<string, {
    id: string; name: string; rating: number; reliability: number;
    available: boolean; activeProjects: number;
  }> = new Map();

  // לקוחות
  private clients: Map<string, {
    id: string; name: string; satisfaction: number; projectCount: number;
    totalRevenue: number; lastContact: number; complaints: number;
  }> = new Map();

  // משימות
  private tasks: Array<{
    id: string; status: string; assignee: string; dueDate: number;
    completedAt?: number; type: string;
  }> = [];

  // עובדים
  private employees: Map<string, { id: string; name: string; department: string; active: boolean }> = new Map();

  /** הזנת נתון — DataFlowEngine קורא לכאן */
  ingest(category: string, payload: Record<string, unknown>): void {
    const now = Date.now();

    switch (category) {
      case 'financial':
        if ((payload.amount as number) > 0) {
          this.revenues.push({ amount: payload.amount as number, date: payload.date as number ?? now, projectId: payload.projectId as string });
        } else if ((payload.amount as number) < 0) {
          this.expenses.push({ amount: Math.abs(payload.amount as number), date: payload.date as number ?? now, category: payload.category as string });
        }
        if (payload.type === 'receivable') {
          this.receivables.push({ amount: payload.amount as number, dueDate: payload.dueDate as number, clientId: payload.clientId as string, paid: false });
        }
        if (payload.type === 'payable') {
          this.payables.push({ amount: payload.amount as number, dueDate: payload.dueDate as number, contractorId: payload.contractorId as string, paid: false });
        }
        break;

      case 'project':
        this.projects.set(payload.id as string ?? `p_${now}`, {
          id: payload.id as string ?? `p_${now}`,
          name: payload.name as string ?? '',
          status: payload.status as string ?? 'active',
          budget: payload.totalValue as number ?? payload.budget as number ?? 0,
          spent: payload.spent as number ?? 0,
          startDate: payload.startDate ? new Date(payload.startDate as string).getTime() : now,
          deadline: payload.deadline ? new Date(payload.deadline as string).getTime() : now + 30 * 86400000,
          completionPercent: payload.completionPercent as number ?? 0,
          delayed: payload.delayed as boolean ?? false,
        });
        break;

      case 'subcontractor':
        this.subcontractors.set(payload.id as string ?? `s_${now}`, {
          id: payload.id as string ?? `s_${now}`,
          name: payload.name as string ?? '',
          rating: payload.qualityRating as number ?? payload.rating as number ?? 5,
          reliability: payload.reliabilityRating as number ?? payload.reliability as number ?? 5,
          available: payload.available as boolean ?? true,
          activeProjects: payload.activeProjects as number ?? 0,
        });
        break;

      case 'client':
        this.clients.set(payload.id as string ?? `c_${now}`, {
          id: payload.id as string ?? `c_${now}`,
          name: payload.name as string ?? '',
          satisfaction: payload.satisfaction as number ?? 7,
          projectCount: payload.projectCount as number ?? 1,
          totalRevenue: payload.totalRevenue as number ?? 0,
          lastContact: now,
          complaints: payload.complaints as number ?? 0,
        });
        break;

      case 'task':
        this.tasks.push({
          id: payload.id as string ?? `t_${now}`,
          status: payload.status as string ?? 'open',
          assignee: payload.assignee as string ?? '',
          dueDate: payload.dueDate ? new Date(payload.dueDate as string).getTime() : now + 7 * 86400000,
          completedAt: payload.completedAt ? new Date(payload.completedAt as string).getTime() : undefined,
          type: payload.type as string ?? 'general',
        });
        break;

      case 'employee':
        this.employees.set(payload.id as string ?? `e_${now}`, {
          id: payload.id as string ?? `e_${now}`,
          name: payload.name as string ?? '',
          department: payload.department as string ?? '',
          active: payload.active as boolean ?? true,
        });
        break;

      case 'work_order':
        // עדכון הוצאה + פרויקט
        if (payload.agreedPrice) {
          this.expenses.push({ amount: payload.agreedPrice as number, date: now, category: 'subcontractor' });
        }
        break;

      case 'decision':
        // עדכון חיסכון
        if (payload.savingsAmount) {
          // נשמר כ-metadata
        }
        break;

      case 'measurement':
        // עדכון פרויקט
        if (payload.projectId && this.projects.has(payload.projectId as string)) {
          const proj = this.projects.get(payload.projectId as string)!;
          if (payload.areaSqm) proj.completionPercent = Math.min(100, proj.completionPercent + 10);
        }
        break;
    }
  }

  /** בנה תמונת מצב פיננסית */
  buildFinancialSnapshot(): FinancialSnapshot {
    const now = Date.now();
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime();
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

    const revenueThisMonth = this.revenues.filter(r => r.date >= thisMonthStart).reduce((s, r) => s + r.amount, 0);
    const revenueLastMonth = this.revenues.filter(r => r.date >= lastMonthStart && r.date < thisMonthStart).reduce((s, r) => s + r.amount, 0);
    const revenueThisYear = this.revenues.filter(r => r.date >= yearStart).reduce((s, r) => s + r.amount, 0);

    const expenseThisMonth = this.expenses.filter(e => e.date >= thisMonthStart).reduce((s, e) => s + e.amount, 0);
    const expenseLastMonth = this.expenses.filter(e => e.date >= lastMonthStart && e.date < thisMonthStart).reduce((s, e) => s + e.amount, 0);
    const expenseThisYear = this.expenses.filter(e => e.date >= yearStart).reduce((s, e) => s + e.amount, 0);

    const profitThisMonth = revenueThisMonth - expenseThisMonth;
    const profitLastMonth = revenueLastMonth - expenseLastMonth;

    const unpaidReceivables = this.receivables.filter(r => !r.paid);
    const overdueReceivables = unpaidReceivables.filter(r => r.dueDate < now);

    const unpaidPayables = this.payables.filter(p => !p.paid);
    const overduePayables = unpaidPayables.filter(p => p.dueDate < now);
    const dueThisWeek = unpaidPayables.filter(p => p.dueDate <= now + 7 * 86400000 && p.dueDate > now);

    return {
      revenue: {
        thisMonth: revenueThisMonth, lastMonth: revenueLastMonth, thisYear: revenueThisYear,
        trend: revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : 0,
      },
      expenses: {
        thisMonth: expenseThisMonth, lastMonth: expenseLastMonth, thisYear: expenseThisYear,
        trend: expenseLastMonth > 0 ? ((expenseThisMonth - expenseLastMonth) / expenseLastMonth) * 100 : 0,
      },
      profit: {
        thisMonth: profitThisMonth, lastMonth: profitLastMonth,
        thisYear: revenueThisYear - expenseThisYear,
        margin: revenueThisMonth > 0 ? (profitThisMonth / revenueThisMonth) * 100 : 0,
      },
      cashflow: {
        current: revenueThisYear - expenseThisYear,
        projected30Days: (revenueThisMonth - expenseThisMonth) + unpaidReceivables.filter(r => r.dueDate <= now + 30 * 86400000).reduce((s, r) => s + r.amount, 0) - dueThisWeek.reduce((s, p) => s + p.amount, 0),
        runway: expenseThisMonth > 0 ? Math.round((revenueThisYear - expenseThisYear) / expenseThisMonth) : 99,
      },
      receivables: {
        total: unpaidReceivables.reduce((s, r) => s + r.amount, 0),
        overdue: overdueReceivables.reduce((s, r) => s + r.amount, 0),
        avgDaysOutstanding: unpaidReceivables.length > 0 ? Math.round(unpaidReceivables.reduce((s, r) => s + (now - r.dueDate) / 86400000, 0) / unpaidReceivables.length) : 0,
      },
      payables: {
        total: unpaidPayables.reduce((s, p) => s + p.amount, 0),
        overdue: overduePayables.reduce((s, p) => s + p.amount, 0),
        dueThisWeek: dueThisWeek.reduce((s, p) => s + p.amount, 0),
      },
    };
  }

  /** בנה תמונת מצב תפעולית */
  buildOperationsSnapshot(): OperationsSnapshot {
    const projects = Array.from(this.projects.values());
    const active = projects.filter(p => p.status === 'active' || p.status === 'in_progress');
    const delayed = active.filter(p => p.delayed || p.deadline < Date.now());
    const overBudget = active.filter(p => p.spent > p.budget);
    const completed = projects.filter(p => p.status === 'completed');
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    return {
      activeProjects: active.length,
      projectsOnTrack: active.length - delayed.length,
      projectsDelayed: delayed.length,
      projectsOverBudget: overBudget.length,
      avgProjectCompletion: active.length > 0 ? Math.round(active.reduce((s, p) => s + p.completionPercent, 0) / active.length) : 0,
      pendingWorkOrders: this.tasks.filter(t => t.type === 'work_order' && t.status !== 'completed').length,
      completedThisMonth: completed.filter(p => p.deadline >= thisMonthStart).length + this.tasks.filter(t => t.completedAt && t.completedAt >= thisMonthStart).length,
      utilizationRate: active.length > 0 ? Math.min(100, Math.round((active.length / Math.max(1, this.subcontractors.size)) * 100)) : 0,
    };
  }

  /** בנה תמונת מצב כח אדם */
  buildWorkforceSnapshot(): WorkforceSnapshot {
    const subs = Array.from(this.subcontractors.values());
    const openTasks = this.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
    const overdueTasks = openTasks.filter(t => t.dueDate < Date.now());
    const completedTasks = this.tasks.filter(t => t.completedAt);
    const avgTime = completedTasks.length > 0 ? completedTasks.reduce((s, t) => s + ((t.completedAt ?? 0) - t.dueDate), 0) / completedTasks.length / 86400000 : 0;

    return {
      totalEmployees: Array.from(this.employees.values()).filter(e => e.active).length,
      activeSubcontractors: subs.filter(s => s.activeProjects > 0).length,
      availableSubcontractors: subs.filter(s => s.available).length,
      avgSubcontractorRating: subs.length > 0 ? Math.round(subs.reduce((s, c) => s + c.rating, 0) / subs.length * 10) / 10 : 0,
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      avgTaskCompletionTime: Math.round(Math.abs(avgTime) * 10) / 10,
    };
  }

  /** בנה תמונת מצב לקוחות */
  buildClientSnapshot(): ClientSnapshot {
    const clients = Array.from(this.clients.values());
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const newThisMonth = clients.filter(c => c.lastContact >= thisMonthStart);
    const totalComplaints = clients.reduce((s, c) => s + c.complaints, 0);

    return {
      totalClients: clients.length,
      activeClients: clients.filter(c => c.projectCount > 0).length,
      newClientsThisMonth: newThisMonth.length,
      avgSatisfaction: clients.length > 0 ? Math.round(clients.reduce((s, c) => s + c.satisfaction, 0) / clients.length * 10) / 10 : 0,
      pendingQuotes: this.tasks.filter(t => t.type === 'quote' && t.status === 'pending').length,
      conversionRate: clients.length > 0 ? Math.round(clients.filter(c => c.projectCount > 0).length / clients.length * 100) : 0,
      complaintsOpen: totalComplaints,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: HEALTH SCORE CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

class HealthCalculator {
  private history: Array<{ timestamp: number; score: number }> = [];

  private scoreToLevel(score: number): HealthLevel {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    if (score >= 30) return 'poor';
    return 'critical';
  }

  private getTrend(): 'improving' | 'stable' | 'declining' {
    if (this.history.length < 3) return 'stable';
    const recent = this.history.slice(-5);
    const first = recent[0].score;
    const last = recent[recent.length - 1].score;
    const diff = last - first;
    if (diff > 3) return 'improving';
    if (diff < -3) return 'declining';
    return 'stable';
  }

  /** חשב ציון בריאות פיננסי */
  calculateFinancialHealth(fin: FinancialSnapshot): HealthScore {
    const factors: HealthFactor[] = [];

    // רווחיות
    const marginScore = Math.min(100, Math.max(0, fin.profit.margin * 2.5));
    factors.push({
      name: 'רווחיות', score: Math.round(marginScore), weight: 0.3, status: this.scoreToLevel(marginScore),
      detail: `מרווח רווח ${fin.profit.margin.toFixed(1)}%`,
      recommendation: marginScore < 50 ? 'צמצם הוצאות או העלה מחירים' : undefined,
    });

    // מגמת הכנסות
    const revTrend = Math.min(100, Math.max(0, 50 + fin.revenue.trend));
    factors.push({
      name: 'מגמת הכנסות', score: Math.round(revTrend), weight: 0.2, status: this.scoreToLevel(revTrend),
      detail: `${fin.revenue.trend > 0 ? '+' : ''}${fin.revenue.trend.toFixed(1)}% מול חודש קודם`,
    });

    // חובות לגבייה
    const receivableRatio = fin.receivables.total > 0 ? (fin.receivables.overdue / fin.receivables.total) * 100 : 0;
    const receivableScore = Math.max(0, 100 - receivableRatio * 2);
    factors.push({
      name: 'גבייה', score: Math.round(receivableScore), weight: 0.2, status: this.scoreToLevel(receivableScore),
      detail: `₪${fin.receivables.overdue.toLocaleString()} באיחור מתוך ₪${fin.receivables.total.toLocaleString()}`,
      recommendation: receivableScore < 50 ? 'שלח תזכורות תשלום ללקוחות באיחור' : undefined,
    });

    // תזרים מזומנים
    const cashScore = Math.min(100, Math.max(0, fin.cashflow.runway * 10));
    factors.push({
      name: 'תזרים מזומנים', score: Math.round(cashScore), weight: 0.2, status: this.scoreToLevel(cashScore),
      detail: `runway: ${fin.cashflow.runway} חודשים`,
      recommendation: cashScore < 50 ? 'בדוק תזרים — סיכון למצוקה תזרימית' : undefined,
    });

    // תשלומים באיחור
    const payableRatio = fin.payables.total > 0 ? (fin.payables.overdue / fin.payables.total) * 100 : 0;
    const payableScore = Math.max(0, 100 - payableRatio * 2);
    factors.push({
      name: 'תשלומים לספקים', score: Math.round(payableScore), weight: 0.1, status: this.scoreToLevel(payableScore),
      detail: `₪${fin.payables.overdue.toLocaleString()} באיחור`,
    });

    const totalScore = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0));
    this.history.push({ timestamp: Date.now(), score: totalScore });

    return { score: totalScore, level: this.scoreToLevel(totalScore), trend: this.getTrend(), factors, lastUpdated: Date.now() };
  }

  /** חשב ציון בריאות תפעולי */
  calculateOperationsHealth(ops: OperationsSnapshot): HealthScore {
    const factors: HealthFactor[] = [];

    const onTrackRate = ops.activeProjects > 0 ? (ops.projectsOnTrack / ops.activeProjects) * 100 : 100;
    factors.push({
      name: 'פרויקטים בזמן', score: Math.round(onTrackRate), weight: 0.35, status: this.scoreToLevel(onTrackRate),
      detail: `${ops.projectsOnTrack}/${ops.activeProjects} בזמן, ${ops.projectsDelayed} באיחור`,
      recommendation: onTrackRate < 70 ? 'הקצה יותר משאבים לפרויקטים מאחרים' : undefined,
    });

    const budgetRate = ops.activeProjects > 0 ? ((ops.activeProjects - ops.projectsOverBudget) / ops.activeProjects) * 100 : 100;
    factors.push({
      name: 'עמידה בתקציב', score: Math.round(budgetRate), weight: 0.25, status: this.scoreToLevel(budgetRate),
      detail: `${ops.projectsOverBudget} פרויקטים חורגים מתקציב`,
    });

    const completionScore = Math.min(100, ops.avgProjectCompletion * 1.2);
    factors.push({
      name: 'קצב השלמה', score: Math.round(completionScore), weight: 0.2, status: this.scoreToLevel(completionScore),
      detail: `ממוצע השלמה: ${ops.avgProjectCompletion}%`,
    });

    const utilScore = Math.min(100, ops.utilizationRate);
    factors.push({
      name: 'ניצולת', score: Math.round(utilScore), weight: 0.2, status: this.scoreToLevel(utilScore),
      detail: `ניצולת: ${ops.utilizationRate}%`,
    });

    const totalScore = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0));
    return { score: totalScore, level: this.scoreToLevel(totalScore), trend: 'stable', factors, lastUpdated: Date.now() };
  }

  /** חשב ציון בריאות כח אדם */
  calculateWorkforceHealth(wf: WorkforceSnapshot): HealthScore {
    const factors: HealthFactor[] = [];

    const ratingScore = Math.min(100, wf.avgSubcontractorRating * 10);
    factors.push({ name: 'איכות קבלנים', score: Math.round(ratingScore), weight: 0.3, status: this.scoreToLevel(ratingScore), detail: `ממוצע דירוג: ${wf.avgSubcontractorRating}/10` });

    const overdueRate = wf.openTasks > 0 ? ((wf.openTasks - wf.overdueTasks) / wf.openTasks) * 100 : 100;
    factors.push({
      name: 'משימות בזמן', score: Math.round(overdueRate), weight: 0.3, status: this.scoreToLevel(overdueRate),
      detail: `${wf.overdueTasks} משימות באיחור מתוך ${wf.openTasks}`,
      recommendation: overdueRate < 60 ? 'יש לטפל במשימות מאחרות' : undefined,
    });

    const availScore = wf.activeSubcontractors + wf.availableSubcontractors > 0
      ? (wf.availableSubcontractors / (wf.activeSubcontractors + wf.availableSubcontractors)) * 100 : 50;
    factors.push({ name: 'זמינות קבלנים', score: Math.round(Math.min(100, availScore * 1.5)), weight: 0.2, status: this.scoreToLevel(availScore), detail: `${wf.availableSubcontractors} קבלנים זמינים` });

    const employeeScore = Math.min(100, wf.totalEmployees * 5);
    factors.push({ name: 'כח אדם', score: Math.round(employeeScore), weight: 0.2, status: this.scoreToLevel(employeeScore), detail: `${wf.totalEmployees} עובדים פעילים` });

    const totalScore = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0));
    return { score: totalScore, level: this.scoreToLevel(totalScore), trend: 'stable', factors, lastUpdated: Date.now() };
  }

  /** חשב ציון בריאות לקוחות */
  calculateClientHealth(cl: ClientSnapshot): HealthScore {
    const factors: HealthFactor[] = [];

    const satScore = Math.min(100, cl.avgSatisfaction * 10);
    factors.push({ name: 'שביעות רצון', score: Math.round(satScore), weight: 0.35, status: this.scoreToLevel(satScore), detail: `ממוצע: ${cl.avgSatisfaction}/10` });

    const convScore = Math.min(100, cl.conversionRate * 1.2);
    factors.push({ name: 'המרה', score: Math.round(convScore), weight: 0.25, status: this.scoreToLevel(convScore), detail: `${cl.conversionRate}% מהלידים הופכים ללקוחות` });

    const complaintScore = Math.max(0, 100 - cl.complaintsOpen * 15);
    factors.push({
      name: 'תלונות', score: Math.round(complaintScore), weight: 0.2, status: this.scoreToLevel(complaintScore),
      detail: `${cl.complaintsOpen} תלונות פתוחות`,
      recommendation: complaintScore < 50 ? 'טפל בתלונות פתוחות מיידית' : undefined,
    });

    const growthScore = Math.min(100, cl.newClientsThisMonth * 20);
    factors.push({ name: 'צמיחה', score: Math.round(growthScore), weight: 0.2, status: this.scoreToLevel(growthScore), detail: `${cl.newClientsThisMonth} לקוחות חדשים החודש` });

    const totalScore = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0));
    return { score: totalScore, level: this.scoreToLevel(totalScore), trend: 'stable', factors, lastUpdated: Date.now() };
  }

  /** ציון בריאות כולל של החברה */
  calculateCompanyHealth(fin: HealthScore, ops: HealthScore, wf: HealthScore, cl: HealthScore): HealthScore {
    const factors: HealthFactor[] = [
      { name: 'פיננסי', score: fin.score, weight: 0.35, status: fin.level, detail: `ציון: ${fin.score}/100` },
      { name: 'תפעולי', score: ops.score, weight: 0.30, status: ops.level, detail: `ציון: ${ops.score}/100` },
      { name: 'כח אדם', score: wf.score, weight: 0.15, status: wf.level, detail: `ציון: ${wf.score}/100` },
      { name: 'לקוחות', score: cl.score, weight: 0.20, status: cl.level, detail: `ציון: ${cl.score}/100` },
    ];

    const totalScore = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0));
    this.history.push({ timestamp: Date.now(), score: totalScore });

    return { score: totalScore, level: this.scoreToLevel(totalScore), trend: this.getTrend(), factors, lastUpdated: Date.now() };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: ALERT ENGINE
// ═══════════════════════════════════════════════════════════════════════════

class AlertEngine {
  private rules: AlertRule[] = [];
  private alerts: Map<string, Alert> = new Map();
  private recipients: Map<string, AlertRecipient> = new Map();
  private sendHandler?: (channel: AlertChannel, recipient: string, title: string, message: string) => Promise<boolean>;

  /** רשום handler לשליחת התראות — מחובר ל-ONYX integrations */
  setSendHandler(handler: (channel: AlertChannel, recipient: string, title: string, message: string) => Promise<boolean>): void {
    this.sendHandler = handler;
  }

  /** הוסף נמען */
  addRecipient(recipient: AlertRecipient): void {
    this.recipients.set(recipient.id, recipient);
  }

  /** הוסף כלל התראה */
  addRule(rule: Omit<AlertRule, 'id'>): AlertRule {
    const full: AlertRule = { ...rule, id: `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` };
    this.rules.push(full);
    this.rules.sort((a, b) => b.priority - a.priority);
    return full;
  }

  /** הפעל בדיקת התראות על תמונת מצב */
  async evaluate(snapshot: CompanySnapshot): Promise<Alert[]> {
    const newAlerts: Alert[] = [];

    for (const rule of this.rules.filter(r => r.active)) {
      // Cooldown check
      if (rule.lastTriggeredAt && Date.now() - rule.lastTriggeredAt < rule.cooldownMs) continue;

      try {
        if (rule.condition(snapshot)) {
          const alert = this.createAlert(rule, snapshot);
          this.alerts.set(alert.id, alert);
          rule.lastTriggeredAt = Date.now();
          newAlerts.push(alert);

          // שלח לנמענים
          await this.dispatchAlert(alert);
        }
      } catch (err) {
        console.error(`[AlertEngine] Rule ${rule.name} failed:`, err);
      }
    }

    // Auto-resolve expired alerts
    for (const [id, alert] of this.alerts) {
      if (alert.autoResolveAt && Date.now() >= alert.autoResolveAt && alert.status === 'active') {
        alert.status = 'resolved';
        alert.resolvedAt = Date.now();
      }
    }

    return newAlerts;
  }

  private createAlert(rule: AlertRule, snapshot: CompanySnapshot): Alert {
    return {
      id: `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      severity: rule.severity,
      category: rule.category,
      title: rule.titleTemplate(snapshot),
      message: rule.messageTemplate(snapshot),
      detail: '',
      source: `rule:${rule.id}`,
      status: 'active',
      channels: rule.channels,
      sentTo: [],
      escalationLevel: 0,
      escalateAfterMs: rule.escalateAfterMs,
      autoResolveAt: rule.autoResolveMs ? Date.now() + rule.autoResolveMs : undefined,
      metadata: { ruleId: rule.id, ruleName: rule.name, companyHealthScore: snapshot.companyHealth.score },
    };
  }

  private async dispatchAlert(alert: Alert): Promise<void> {
    const severityOrder: Record<AlertSeverity, number> = { info: 0, warning: 1, error: 2, critical: 3 };

    for (const [_, recipient] of this.recipients) {
      if (!recipient.active) continue;
      if (severityOrder[alert.severity] < severityOrder[recipient.minSeverity]) continue;
      if (recipient.categories.length > 0 && !recipient.categories.includes(alert.category)) continue;

      // בדיקת שעות שקטות
      if (recipient.quietHours) {
        const hour = new Date().getHours();
        if (hour >= recipient.quietHours.start || hour < recipient.quietHours.end) {
          if (alert.severity !== 'critical') continue; // רק critical עובר בשעות שקטות
        }
      }

      // שלח בכל הערוצים
      for (const channel of alert.channels) {
        const address = recipient.channels[channel];
        if (!address) continue;

        const icon = { info: 'ℹ️', warning: '⚠️', error: '❌', critical: '🚨' }[alert.severity];
        const fullTitle = `${icon} ${alert.title}`;

        try {
          let delivered = false;
          if (this.sendHandler) {
            delivered = await this.sendHandler(channel, address, fullTitle, alert.message);
          } else {
            console.log(`[Alert → ${channel}] ${address}: ${fullTitle}\n${alert.message}`);
            delivered = true;
          }

          alert.sentTo.push({ channel, sentAt: Date.now(), delivered });
        } catch (err) {
          alert.sentTo.push({ channel, sentAt: Date.now(), delivered: false });
        }
      }
    }
  }

  /** אשר התראה */
  acknowledge(alertId: string, by: string): void {
    const alert = this.alerts.get(alertId);
    if (alert && alert.status === 'active') {
      alert.status = 'acknowledged';
      alert.acknowledgedBy = by;
      alert.acknowledgedAt = Date.now();
    }
  }

  /** סגור התראה */
  resolve(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) { alert.status = 'resolved'; alert.resolvedAt = Date.now(); }
  }

  /** השתק התראה */
  silence(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) alert.status = 'silenced';
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(a => a.status === 'active' || a.status === 'acknowledged').sort((a, b) => b.timestamp - a.timestamp);
  }

  getAllAlerts(limit: number = 100): Alert[] {
    return Array.from(this.alerts.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /** טען כללי התראה מובנים */
  loadDefaultRules(): void {
    // ציון חברה נמוך
    this.addRule({
      name: 'company_health_critical', description: 'ציון בריאות חברה קריטי', active: true,
      condition: (s) => s.companyHealth.score < 40,
      severity: 'critical', category: 'company_health',
      titleTemplate: (s) => `בריאות חברה קריטית: ${s.companyHealth.score}/100`,
      messageTemplate: (s) => `ציון בריאות החברה ירד ל-${s.companyHealth.score}/100 (${s.companyHealth.level}).\nגורמים:\n${s.companyHealth.factors.map(f => `• ${f.name}: ${f.score}/100`).join('\n')}`,
      channels: ['whatsapp', 'sms'], cooldownMs: 3600000, escalateAfterMs: 1800000, priority: 100,
    });

    this.addRule({
      name: 'company_health_poor', description: 'ציון בריאות חברה נמוך', active: true,
      condition: (s) => s.companyHealth.score < 60 && s.companyHealth.score >= 40,
      severity: 'warning', category: 'company_health',
      titleTemplate: (s) => `בריאות חברה נמוכה: ${s.companyHealth.score}/100`,
      messageTemplate: (s) => `ציון בריאות: ${s.companyHealth.score}/100.\n${s.topIssues.slice(0, 3).map(i => `• ${i}`).join('\n')}`,
      channels: ['whatsapp'], cooldownMs: 7200000, escalateAfterMs: 3600000, priority: 80,
    });

    // תזרים מזומנים
    this.addRule({
      name: 'cashflow_critical', description: 'תזרים מזומנים בסכנה', active: true,
      condition: (s) => s.financial.snapshot.cashflow.runway < 2,
      severity: 'critical', category: 'financial',
      titleTemplate: () => `🔴 התראת תזרים: פחות מ-2 חודשי runway`,
      messageTemplate: (s) => `Runway: ${s.financial.snapshot.cashflow.runway} חודשים\nתזרים נוכחי: ₪${s.financial.snapshot.cashflow.current.toLocaleString()}\nתחזית 30 יום: ₪${s.financial.snapshot.cashflow.projected30Days.toLocaleString()}`,
      channels: ['whatsapp', 'sms', 'email'], cooldownMs: 86400000, escalateAfterMs: 3600000, priority: 95,
    });

    // חובות באיחור
    this.addRule({
      name: 'receivables_overdue', description: 'חובות לגבייה באיחור', active: true,
      condition: (s) => s.financial.snapshot.receivables.overdue > 50000,
      severity: 'warning', category: 'financial',
      titleTemplate: (s) => `חובות באיחור: ₪${s.financial.snapshot.receivables.overdue.toLocaleString()}`,
      messageTemplate: (s) => `₪${s.financial.snapshot.receivables.overdue.toLocaleString()} באיחור גבייה.\nסה"כ חובות: ₪${s.financial.snapshot.receivables.total.toLocaleString()}\nממוצע ימי איחור: ${s.financial.snapshot.receivables.avgDaysOutstanding}`,
      channels: ['whatsapp'], cooldownMs: 86400000, escalateAfterMs: 172800000, priority: 70,
    });

    // פרויקטים באיחור
    this.addRule({
      name: 'projects_delayed', description: 'פרויקטים באיחור', active: true,
      condition: (s) => s.operations.snapshot.projectsDelayed > 0,
      severity: 'warning', category: 'operations',
      titleTemplate: (s) => `${s.operations.snapshot.projectsDelayed} פרויקטים באיחור`,
      messageTemplate: (s) => `פרויקטים באיחור: ${s.operations.snapshot.projectsDelayed}\nפרויקטים פעילים: ${s.operations.snapshot.activeProjects}\nבזמן: ${s.operations.snapshot.projectsOnTrack}`,
      channels: ['whatsapp'], cooldownMs: 43200000, escalateAfterMs: 86400000, priority: 65,
    });

    // חריגה מתקציב
    this.addRule({
      name: 'over_budget', description: 'פרויקטים חורגים מתקציב', active: true,
      condition: (s) => s.operations.snapshot.projectsOverBudget > 0,
      severity: 'error', category: 'operations',
      titleTemplate: (s) => `${s.operations.snapshot.projectsOverBudget} פרויקטים חורגים מתקציב`,
      messageTemplate: (s) => `חריגת תקציב ב-${s.operations.snapshot.projectsOverBudget} פרויקטים.\nיש לבדוק ולעדכן הצעות מחיר.`,
      channels: ['whatsapp', 'email'], cooldownMs: 86400000, escalateAfterMs: 172800000, priority: 75,
    });

    // משימות באיחור
    this.addRule({
      name: 'overdue_tasks', description: 'משימות באיחור', active: true,
      condition: (s) => s.workforce.snapshot.overdueTasks > 5,
      severity: 'warning', category: 'workforce',
      titleTemplate: (s) => `${s.workforce.snapshot.overdueTasks} משימות באיחור`,
      messageTemplate: (s) => `${s.workforce.snapshot.overdueTasks} משימות פתוחות באיחור.\nסה"כ משימות פתוחות: ${s.workforce.snapshot.openTasks}`,
      channels: ['whatsapp'], cooldownMs: 43200000, escalateAfterMs: 86400000, priority: 55,
    });

    // תלונות לקוחות
    this.addRule({
      name: 'client_complaints', description: 'תלונות לקוחות פתוחות', active: true,
      condition: (s) => s.clients.snapshot.complaintsOpen > 2,
      severity: 'error', category: 'clients',
      titleTemplate: (s) => `${s.clients.snapshot.complaintsOpen} תלונות לקוחות פתוחות`,
      messageTemplate: (s) => `שביעות רצון: ${s.clients.snapshot.avgSatisfaction}/10\n${s.clients.snapshot.complaintsOpen} תלונות דורשות טיפול מיידי`,
      channels: ['whatsapp', 'email'], cooldownMs: 86400000, escalateAfterMs: 43200000, priority: 72,
    });

    // רווחיות שלילית
    this.addRule({
      name: 'negative_profit', description: 'רווח שלילי', active: true,
      condition: (s) => s.financial.snapshot.profit.thisMonth < 0,
      severity: 'critical', category: 'financial',
      titleTemplate: () => `🔴 רווח שלילי החודש`,
      messageTemplate: (s) => `הפסד של ₪${Math.abs(s.financial.snapshot.profit.thisMonth).toLocaleString()} החודש.\nהכנסות: ₪${s.financial.snapshot.revenue.thisMonth.toLocaleString()}\nהוצאות: ₪${s.financial.snapshot.expenses.thisMonth.toLocaleString()}`,
      channels: ['whatsapp', 'sms', 'email'], cooldownMs: 86400000, escalateAfterMs: 3600000, priority: 98,
    });

    // מגמה יורדת
    this.addRule({
      name: 'declining_health', description: 'מגמת ירידה בבריאות', active: true,
      condition: (s) => s.companyHealth.trend === 'declining' && s.companyHealth.score < 70,
      severity: 'warning', category: 'company_health',
      titleTemplate: (s) => `מגמת ירידה — ציון ${s.companyHealth.score}/100`,
      messageTemplate: (s) => `בריאות החברה בירידה.\nציון נוכחי: ${s.companyHealth.score}\nיש לבדוק: ${s.topIssues[0] ?? 'לא זוהו בעיות ספציפיות'}`,
      channels: ['whatsapp'], cooldownMs: 86400000, escalateAfterMs: 172800000, priority: 60,
    });

    console.log(`✅ נטענו ${this.rules.length} כללי התראה מובנים`);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: SITUATION AWARENESS ENGINE — הכל ביחד
// ═══════════════════════════════════════════════════════════════════════════

export class SituationEngine {
  readonly accumulator: DataAccumulator;
  readonly calculator: HealthCalculator;
  readonly alertEngine: AlertEngine;
  private latestSnapshot: CompanySnapshot | null = null;
  private snapshotHistory: Array<{ timestamp: number; score: number; snapshot: CompanySnapshot }> = [];
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.accumulator = new DataAccumulator();
    this.calculator = new HealthCalculator();
    this.alertEngine = new AlertEngine();
    this.alertEngine.loadDefaultRules();
  }

  /** הזנת נתון — DataFlowEngine קורא לכאן */
  ingest(category: string, payload: Record<string, unknown>): void {
    this.accumulator.ingest(category, payload);
  }

  /** חשב תמונת מצב עדכנית */
  async computeSnapshot(): Promise<CompanySnapshot> {
    const finSnap = this.accumulator.buildFinancialSnapshot();
    const opsSnap = this.accumulator.buildOperationsSnapshot();
    const wfSnap = this.accumulator.buildWorkforceSnapshot();
    const clSnap = this.accumulator.buildClientSnapshot();

    const finHealth = this.calculator.calculateFinancialHealth(finSnap);
    const opsHealth = this.calculator.calculateOperationsHealth(opsSnap);
    const wfHealth = this.calculator.calculateWorkforceHealth(wfSnap);
    const clHealth = this.calculator.calculateClientHealth(clSnap);
    const companyHealth = this.calculator.calculateCompanyHealth(finHealth, opsHealth, wfHealth, clHealth);

    // זיהוי בעיות מרכזיות
    const allFactors = [...finHealth.factors, ...opsHealth.factors, ...wfHealth.factors, ...clHealth.factors];
    const topIssues = allFactors.filter(f => f.score < 50).sort((a, b) => a.score - b.score).map(f => `${f.name}: ${f.detail}${f.recommendation ? ` → ${f.recommendation}` : ''}`);
    const topOpportunities = allFactors.filter(f => f.score >= 80).sort((a, b) => b.score - a.score).map(f => `${f.name}: ${f.detail}`);

    const activeAlerts = this.alertEngine.getActiveAlerts();

    const snapshot: CompanySnapshot = {
      timestamp: Date.now(),
      companyHealth,
      financial: { snapshot: finSnap, health: finHealth },
      operations: { snapshot: opsSnap, health: opsHealth },
      workforce: { snapshot: wfSnap, health: wfHealth },
      clients: { snapshot: clSnap, health: clHealth },
      alerts: { active: activeAlerts.length, critical: activeAlerts.filter(a => a.severity === 'critical').length, unacknowledged: activeAlerts.filter(a => a.status === 'active').length },
      topIssues,
      topOpportunities,
    };

    this.latestSnapshot = snapshot;
    this.snapshotHistory.push({ timestamp: Date.now(), score: companyHealth.score, snapshot });
    if (this.snapshotHistory.length > 1440) this.snapshotHistory = this.snapshotHistory.slice(-1440); // 24 שעות

    // הפעל מנוע התראות
    await this.alertEngine.evaluate(snapshot);

    return snapshot;
  }

  /** התחל ריענון אוטומטי */
  startAutoRefresh(intervalMs: number = 60000): void {
    this.refreshInterval = setInterval(() => this.computeSnapshot(), intervalMs);
    console.log(`🔄 תמונת מצב מתרעננת כל ${intervalMs / 1000} שניות`);
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  /** שלוף תמונת מצב אחרונה */
  getLatestSnapshot(): CompanySnapshot | null {
    return this.latestSnapshot;
  }

  /** היסטוריית ציונים */
  getScoreHistory(hours: number = 24): Array<{ timestamp: number; score: number }> {
    const since = Date.now() - hours * 3600000;
    return this.snapshotHistory.filter(s => s.timestamp >= since).map(s => ({ timestamp: s.timestamp, score: s.score }));
  }

  /** הוסף נמען התראות */
  addAlertRecipient(recipient: AlertRecipient): void {
    this.alertEngine.addRecipient(recipient);
  }

  /** חבר שליחת התראות ל-ONYX */
  connectSendHandler(handler: (channel: AlertChannel, recipient: string, title: string, message: string) => Promise<boolean>): void {
    this.alertEngine.setSendHandler(handler);
  }

  /** הדפס תמונת מצב */
  printSnapshot(snapshot?: CompanySnapshot): void {
    const s = snapshot ?? this.latestSnapshot;
    if (!s) { console.log('אין תמונת מצב זמינה — הרץ computeSnapshot()'); return; }

    const healthIcon = (level: HealthLevel) => ({ excellent: '🟢', good: '🔵', fair: '🟡', poor: '🟠', critical: '🔴' }[level]);
    const trendIcon = (trend: string) => ({ improving: '📈', stable: '➡️', declining: '📉' }[trend] ?? '➡️');

    console.log(`
╔══════════════════════════════════════════════════════════════╗
║   תמונת מצב חברה — ${new Date(s.timestamp).toLocaleString('he-IL')}
╠══════════════════════════════════════════════════════════════╣
║
║   ${healthIcon(s.companyHealth.level)} ציון בריאות כולל: ${s.companyHealth.score}/100 (${s.companyHealth.level}) ${trendIcon(s.companyHealth.trend)}
║
║   ── פירוט ──
║   ${healthIcon(s.financial.health.level)} פיננסי:  ${s.financial.health.score}/100
║      הכנסות החודש: ₪${s.financial.snapshot.revenue.thisMonth.toLocaleString()}
║      הוצאות החודש: ₪${s.financial.snapshot.expenses.thisMonth.toLocaleString()}
║      רווח: ₪${s.financial.snapshot.profit.thisMonth.toLocaleString()} (${s.financial.snapshot.profit.margin.toFixed(1)}%)
║      Runway: ${s.financial.snapshot.cashflow.runway} חודשים
║
║   ${healthIcon(s.operations.health.level)} תפעולי:  ${s.operations.health.score}/100
║      פרויקטים פעילים: ${s.operations.snapshot.activeProjects}
║      בזמן: ${s.operations.snapshot.projectsOnTrack} | באיחור: ${s.operations.snapshot.projectsDelayed}
║      חריגת תקציב: ${s.operations.snapshot.projectsOverBudget}
║
║   ${healthIcon(s.workforce.health.level)} כח אדם: ${s.workforce.health.score}/100
║      עובדים: ${s.workforce.snapshot.totalEmployees} | קבלנים זמינים: ${s.workforce.snapshot.availableSubcontractors}
║      משימות באיחור: ${s.workforce.snapshot.overdueTasks}/${s.workforce.snapshot.openTasks}
║
║   ${healthIcon(s.clients.health.level)} לקוחות: ${s.clients.health.score}/100
║      לקוחות פעילים: ${s.clients.snapshot.activeClients}
║      שביעות רצון: ${s.clients.snapshot.avgSatisfaction}/10
║      תלונות: ${s.clients.snapshot.complaintsOpen}
║
║   ── התראות ──
║   🚨 פעילות: ${s.alerts.active} | קריטיות: ${s.alerts.critical} | ממתינות: ${s.alerts.unacknowledged}
║
${s.topIssues.length > 0 ? `║   ── בעיות מרכזיות ──\n${s.topIssues.slice(0, 5).map(i => `║   ⚠️ ${i}`).join('\n')}\n║` : '║   ✅ אין בעיות מרכזיות'}
${s.topOpportunities.length > 0 ? `║   ── חוזקות ──\n${s.topOpportunities.slice(0, 3).map(o => `║   💪 ${o}`).join('\n')}\n║` : ''}
╚══════════════════════════════════════════════════════════════╝`);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  DataAccumulator,
  HealthCalculator,
  AlertEngine,
};

export type {
  CompanySnapshot, HealthScore, HealthFactor, HealthLevel,
  FinancialSnapshot, OperationsSnapshot, WorkforceSnapshot, ClientSnapshot,
  Alert, AlertRule, AlertRecipient, AlertSeverity, AlertChannel, AlertStatus,
};

// ═══════════════════════════════════════════════════════════════════════════
// שימוש
// ═══════════════════════════════════════════════════════════════════════════
//
// const situation = new SituationEngine();
//
// // הוסף נמען — קובי מקבל הכל
// situation.addAlertRecipient({
//   id: 'kobi', name: 'קובי אלקיים',
//   channels: { whatsapp: '+972XXXXXXXXX', email: 'kobi@technokoluzi.com' },
//   minSeverity: 'warning', categories: [], active: true,
// });
//
// // הוסף נמען — דימה מקבל רק תפעולי
// situation.addAlertRecipient({
//   id: 'dima', name: 'דימה',
//   channels: { whatsapp: '+972XXXXXXXXX' },
//   minSeverity: 'warning', categories: ['operations', 'workforce'], active: true,
//   quietHours: { start: 22, end: 7 },
// });
//
// // חבר ל-DataFlowEngine — כל נתון שנכנס מתעדכן אוטומטית
// // flow.router.registerConsumer({
// //   id: 'consumer:situation',
// //   name: 'Situation Awareness',
// //   filter: {},  // מקבל הכל
// //   handler: async (packet) => situation.ingest(packet.category, packet.payload),
// // });
//
// // הזן נתונים (או שהם זורמים אוטומטית מ-DataFlow)
// situation.ingest('financial', { amount: 150000, type: 'revenue' });
// situation.ingest('financial', { amount: -80000, type: 'expense', category: 'subcontractor' });
// situation.ingest('project', { id: 'p1', name: 'מעקות בניין A', status: 'active', totalValue: 120000, deadline: '2026-06-15', completionPercent: 65 });
// situation.ingest('project', { id: 'p2', name: 'שער חנייה B', status: 'active', totalValue: 35000, deadline: '2026-04-01', delayed: true });
// situation.ingest('subcontractor', { id: 's1', name: 'משה', qualityRating: 8, reliabilityRating: 9, available: true });
// situation.ingest('client', { id: 'c1', name: 'חברת כנען', satisfaction: 8, projectCount: 3, complaints: 0 });
// situation.ingest('client', { id: 'c2', name: 'לקוח בעייתי', satisfaction: 4, projectCount: 1, complaints: 3 });
// situation.ingest('task', { id: 't1', status: 'open', dueDate: '2026-03-01', type: 'work_order' });
// situation.ingest('employee', { id: 'e1', name: 'דימה', department: 'operations', active: true });
//
// // חשב + הדפס + שלח התראות
// const snapshot = await situation.computeSnapshot();
// situation.printSnapshot();
//
// // התחל ריענון אוטומטי כל דקה
// situation.startAutoRefresh(60000);