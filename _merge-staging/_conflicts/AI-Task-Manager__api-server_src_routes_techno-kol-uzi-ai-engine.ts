/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    TECHNO KOL UZI — AI DATA FLOW ENGINE                     ║
 * ║                         טכנו כל עוזי — מנוע הזרמת נתונים                      ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Version:    1.0.0                                                         ║
 * ║  Platform:   BASH44 (Base44) ↔ Know Do (Replit)                           ║
 * ║  Language:   TypeScript (strict mode)                                      ║
 * ║  Theme:      Dark Slate (#0f172a, #1e293b, #38bdf8)                       ║
 * ║  Currency:   ILS — stored as agorot (integers)                            ║
 * ║  VAT:        17% (multiplier 1.17)                                        ║
 * ║  Direction:  RTL (Hebrew)                                                 ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  4 CORE LAYERS:                                                           ║
 * ║    1. DataBus       — Real-time event streaming between all modules       ║
 * ║    2. AIBrain       — Smart analytics, insights & predictions             ║
 * ║    3. AutomationEngine — When X happens → do Y automatically             ║
 * ║    4. SyncBridge    — External system connectors (SUMIT, WhatsApp, etc)  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// ============================================================================
// SECTION 0: CORE CONSTANTS & CONFIGURATION
// ============================================================================
import { VAT_RATE as _VAT_RATE } from '../constants';

const ENGINE_CONFIG = {
  version: '1.0.0',
  name: 'TechnoKolUzi AI Engine',
  nameHe: 'מנוע AI טכנו כל עוזי',
  vat: _VAT_RATE,
  vatMultiplier: 1 + _VAT_RATE,
  currencyUnit: 'agorot', // all monetary values as integers
  locale: 'he-IL',
  direction: 'rtl' as const,
  theme: {
    bgPrimary: '#0f172a',
    bgSecondary: '#1e293b',
    accent: '#38bdf8',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
  platforms: {
    bash44: {
      name: 'BASH44',
      stack: 'Base44',
      sdk: 'npm:@base44/sdk@0.8.18',
      apiPattern: 'Deno.serve',
    },
    knowDo: {
      name: 'Know Do',
      stack: 'React/Node/PostgreSQL',
      runtime: 'Replit',
    },
  },
  limits: {
    maxEventsPerSecond: 1000,
    maxQueueSize: 50000,
    maxRetries: 3,
    retryDelayMs: 1000,
    batchSize: 100,
    aiAnalysisIntervalMs: 60000, // 1 minute
    syncIntervalMs: 30000, // 30 seconds
  },
} as const;

// ============================================================================
// SECTION 1: TYPE SYSTEM — הגדרות טיפוסים
// ============================================================================

// --- 1.1 Module Registry (all system categories) ---

type ModuleId =
  // CRM Modules
  | 'crm:customers'
  | 'crm:leads'
  | 'crm:contacts'
  | 'crm:deals'
  | 'crm:pipeline'
  | 'crm:activities'
  | 'crm:campaigns'
  // ERP Modules
  | 'erp:inventory'
  | 'erp:rawMaterials'
  | 'erp:suppliers'
  | 'erp:procurement'
  | 'erp:manufacturing'
  | 'erp:mrp'
  | 'erp:mps'
  | 'erp:warehouse'
  | 'erp:importCustoms'
  // Finance Modules
  | 'finance:invoices'
  | 'finance:quotes'
  | 'finance:payments'
  | 'finance:expenses'
  | 'finance:billing'
  | 'finance:tax'
  // Project Modules
  | 'project:projects'
  | 'project:stages'
  | 'project:tasks'
  | 'project:timeline'
  | 'project:billing'
  // HR Modules
  | 'hr:employees'
  | 'hr:attendance'
  | 'hr:payroll'
  | 'hr:contractors'
  // Operations
  | 'ops:measurements'
  | 'ops:installation'
  | 'ops:delivery'
  | 'ops:quality'
  // Sales
  | 'sales:orders'
  | 'sales:catalog'
  | 'sales:pricing'
  | 'sales:commissions'
  // Analytics
  | 'analytics:kpi'
  | 'analytics:reports'
  | 'analytics:dashboard'
  // External
  | 'external:sumit'
  | 'external:whatsapp'
  | 'external:google'
  | 'external:scala'
  | 'external:wix'
  | 'external:n8n'
  | 'external:make';

// --- 1.2 Event Types ---

type EventPriority = 'critical' | 'high' | 'medium' | 'low';
type EventStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
type DataFlowDirection = 'bash44→knowdo' | 'knowdo→bash44' | 'internal' | 'external→in' | 'out→external';

interface DataEvent<T = any> {
  id: string;
  timestamp: number;
  source: ModuleId;
  target: ModuleId | ModuleId[] | '*'; // '*' = broadcast to all
  type: EventType;
  priority: EventPriority;
  status: EventStatus;
  direction: DataFlowDirection;
  payload: T;
  metadata: {
    userId?: string;
    correlationId: string; // trace across systems
    platform: 'bash44' | 'knowdo' | 'both';
    retryCount: number;
    ttlMs: number;
    tags: string[];
  };
  audit: {
    createdBy: string;
    createdAt: number;
    processedAt?: number;
    completedAt?: number;
    error?: string;
  };
}

type EventType =
  // CRUD Events
  | 'entity:created'
  | 'entity:updated'
  | 'entity:deleted'
  | 'entity:bulkUpdate'
  // Business Events
  | 'lead:newInquiry'
  | 'lead:qualified'
  | 'lead:converted'
  | 'lead:lost'
  | 'customer:created'
  | 'customer:updated'
  | 'customer:deactivated'
  | 'deal:stageChanged'
  | 'deal:won'
  | 'deal:lost'
  | 'quote:created'
  | 'quote:approved'
  | 'quote:expired'
  | 'invoice:created'
  | 'invoice:sent'
  | 'invoice:paid'
  | 'invoice:overdue'
  | 'payment:received'
  | 'payment:failed'
  | 'order:placed'
  | 'order:confirmed'
  | 'order:inProduction'
  | 'order:ready'
  | 'order:delivered'
  | 'order:cancelled'
  // Project Events
  | 'project:created'
  | 'project:stageChanged'
  | 'project:completed'
  | 'project:delayed'
  | 'measurement:scheduled'
  | 'measurement:completed'
  | 'installation:scheduled'
  | 'installation:completed'
  // ERP Events
  | 'inventory:low'
  | 'inventory:reorderPoint'
  | 'inventory:received'
  | 'inventory:adjusted'
  | 'production:started'
  | 'production:completed'
  | 'production:delayed'
  | 'procurement:requested'
  | 'procurement:approved'
  | 'procurement:ordered'
  | 'procurement:received'
  // HR Events
  | 'employee:clockIn'
  | 'employee:clockOut'
  | 'employee:absent'
  // Finance Events
  | 'expense:submitted'
  | 'expense:approved'
  | 'cashflow:alert'
  | 'revenue:milestone'
  // AI Events
  | 'ai:insightGenerated'
  | 'ai:anomalyDetected'
  | 'ai:predictionReady'
  | 'ai:recommendationReady'
  // System Events
  | 'sync:started'
  | 'sync:completed'
  | 'sync:failed'
  | 'automation:triggered'
  | 'automation:completed'
  | 'system:healthCheck'
  | 'system:error';

// --- 1.3 AI Types ---

type InsightCategory =
  | 'revenue_trend'
  | 'cash_flow_forecast'
  | 'customer_churn_risk'
  | 'inventory_optimization'
  | 'sales_performance'
  | 'project_delay_risk'
  | 'pricing_suggestion'
  | 'supplier_evaluation'
  | 'lead_scoring'
  | 'production_efficiency'
  | 'employee_productivity'
  | 'cost_reduction';

interface AIInsight {
  id: string;
  category: InsightCategory;
  severity: 'info' | 'warning' | 'critical';
  titleHe: string;
  descriptionHe: string;
  dataPoints: Record<string, number | string>;
  recommendation: string;
  confidence: number; // 0-1
  affectedModules: ModuleId[];
  generatedAt: number;
  expiresAt: number;
  actionable: boolean;
  suggestedActions: AIAction[];
}

interface AIAction {
  id: string;
  type: 'automation' | 'notification' | 'report' | 'alert' | 'task';
  titleHe: string;
  payload: Record<string, any>;
  autoExecute: boolean;
}

// --- 1.4 Automation Types ---

interface AutomationRule {
  id: string;
  nameHe: string;
  description: string;
  enabled: boolean;
  priority: number;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  cooldownMs: number; // prevent rapid re-firing
  lastFiredAt?: number;
  stats: {
    totalFired: number;
    totalSuccess: number;
    totalFailed: number;
    avgExecutionMs: number;
  };
}

interface AutomationTrigger {
  eventType: EventType | EventType[];
  sourceModule?: ModuleId | ModuleId[];
  schedule?: string; // cron expression for time-based triggers
}

interface AutomationCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'notContains' | 'in' | 'notIn' | 'exists' | 'regex';
  value: any;
  logicGate?: 'AND' | 'OR';
}

interface AutomationAction {
  type: 'sendEvent' | 'callApi' | 'sendWhatsApp' | 'sendEmail' | 'createTask' | 'updateEntity' | 'createInvoice' | 'notify' | 'webhook' | 'aiAnalysis';
  config: Record<string, any>;
  delayMs?: number;
  retryOnFail: boolean;
}

// --- 1.5 Sync Types ---

type ExternalSystem = 'sumit' | 'whatsapp' | 'google_sheets' | 'google_drive' | 'google_calendar' | 'scala_crm' | 'wix' | 'n8n' | 'make_com';

interface SyncConfig {
  system: ExternalSystem;
  enabled: boolean;
  direction: 'push' | 'pull' | 'bidirectional';
  intervalMs: number;
  auth: {
    type: 'apiKey' | 'oauth2' | 'bearer' | 'basic' | 'webhook';
    credentials: Record<string, string>;
  };
  mappings: FieldMapping[];
  lastSyncAt?: number;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  errorLog: SyncError[];
}

interface FieldMapping {
  localModule: ModuleId;
  localField: string;
  externalField: string;
  transform?: 'none' | 'agorotToShekel' | 'shekelToAgorot' | 'dateToTimestamp' | 'timestampToDate' | 'addVat' | 'removeVat' | 'custom';
  customTransform?: string; // function body as string
}

interface SyncError {
  timestamp: number;
  system: ExternalSystem;
  operation: string;
  error: string;
  resolved: boolean;
}

// --- 1.6 Subscriber / Handler Types ---

type EventHandler = (event: DataEvent) => Promise<void> | void;

interface Subscription {
  id: string;
  module: ModuleId;
  eventTypes: EventType[] | '*';
  handler: EventHandler;
  filter?: (event: DataEvent) => boolean;
  priority: number; // lower = runs first
}

// ============================================================================
// SECTION 2: UTILITY FUNCTIONS — פונקציות עזר
// ============================================================================

const Utils = {
  /** Generate unique ID */
  generateId: (prefix: string = 'evt'): string => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}_${random}`;
  },

  /** Generate correlation ID for tracing across systems */
  generateCorrelationId: (): string => {
    return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
  },

  /** Convert shekel to agorot (integer) */
  shekelToAgorot: (shekel: number): number => Math.round(shekel * 100),

  /** Convert agorot to shekel */
  agorotToShekel: (agorot: number): number => agorot / 100,

  /** Add VAT (17%) */
  addVat: (amountAgorot: number): number => Math.round(amountAgorot * ENGINE_CONFIG.vatMultiplier),

  /** Remove VAT */
  removeVat: (amountWithVatAgorot: number): number => Math.round(amountWithVatAgorot / ENGINE_CONFIG.vatMultiplier),

  /** Format currency for display */
  formatCurrency: (agorot: number): string => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
    }).format(agorot / 100);
  },

  /** Current timestamp */
  now: (): number => Date.now(),

  /** Delay helper */
  delay: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),

  /** Deep clone */
  clone: <T>(obj: T): T => JSON.parse(JSON.stringify(obj)),

  /** Safe JSON parse */
  safeJsonParse: <T>(str: string, fallback: T): T => {
    try { return JSON.parse(str); } catch { return fallback; }
  },

  /** Exponential backoff */
  getRetryDelay: (attempt: number, baseMs: number = 1000): number => {
    return Math.min(baseMs * Math.pow(2, attempt), 30000);
  },

  /** Check if event matches filter conditions */
  matchesConditions: (payload: Record<string, any>, conditions: AutomationCondition[]): boolean => {
    let result = true;
    for (const cond of conditions) {
      const value = payload[cond.field];
      let match = false;
      switch (cond.operator) {
        case 'eq': match = value === cond.value; break;
        case 'neq': match = value !== cond.value; break;
        case 'gt': match = value > cond.value; break;
        case 'gte': match = value >= cond.value; break;
        case 'lt': match = value < cond.value; break;
        case 'lte': match = value <= cond.value; break;
        case 'contains': match = String(value).includes(cond.value); break;
        case 'notContains': match = !String(value).includes(cond.value); break;
        case 'in': match = Array.isArray(cond.value) && cond.value.includes(value); break;
        case 'notIn': match = Array.isArray(cond.value) && !cond.value.includes(value); break;
        case 'exists': match = value !== undefined && value !== null; break;
        case 'regex': match = new RegExp(cond.value).test(String(value)); break;
      }
      if (cond.logicGate === 'OR') {
        result = result || match;
      } else {
        result = result && match;
      }
    }
    return result;
  },

  /** Log with timestamp and module context */
  log: (level: 'info' | 'warn' | 'error' | 'debug', module: string, message: string, data?: any): void => {
    const timestamp = new Date().toISOString();
    const icon = { info: 'ℹ️', warn: '⚠️', error: '🔴', debug: '🔧' }[level];
    console.log(`${icon} [${timestamp}] [${module}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
};

// ============================================================================
// SECTION 3: LAYER 1 — DataBus (אוטובוס נתונים בזמן אמת)
// ============================================================================

class DataBus {
  private queue: DataEvent[] = [];
  private subscriptions: Map<string, Subscription> = new Map();
  private processing: boolean = false;
  private stats = {
    totalEventsEmitted: 0,
    totalEventsProcessed: 0,
    totalEventsFailed: 0,
    eventsPerSecond: 0,
    avgProcessingMs: 0,
  };
  private eventHistory: DataEvent[] = [];
  private maxHistorySize: number = 10000;

  /** Subscribe a module to events */
  subscribe(subscription: Omit<Subscription, 'id'>): string {
    const id = Utils.generateId('sub');
    this.subscriptions.set(id, { ...subscription, id });
    Utils.log('info', 'DataBus', `Module ${subscription.module} subscribed`, {
      eventTypes: subscription.eventTypes,
    });
    return id;
  }

  /** Unsubscribe */
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  /** Emit an event into the data bus */
  async emit<T = any>(params: {
    source: ModuleId;
    target: ModuleId | ModuleId[] | '*';
    type: EventType;
    priority?: EventPriority;
    direction?: DataFlowDirection;
    payload: T;
    platform?: 'bash44' | 'knowdo' | 'both';
    tags?: string[];
    userId?: string;
  }): Promise<string> {
    const event: DataEvent<T> = {
      id: Utils.generateId('evt'),
      timestamp: Utils.now(),
      source: params.source,
      target: params.target,
      type: params.type,
      priority: params.priority || 'medium',
      status: 'pending',
      direction: params.direction || 'internal',
      payload: params.payload,
      metadata: {
        userId: params.userId,
        correlationId: Utils.generateCorrelationId(),
        platform: params.platform || 'both',
        retryCount: 0,
        ttlMs: 300000, // 5 min default TTL
        tags: params.tags || [],
      },
      audit: {
        createdBy: params.source,
        createdAt: Utils.now(),
      },
    };

    // Priority insertion — critical events go to front of queue
    if (event.priority === 'critical') {
      this.queue.unshift(event);
    } else {
      this.queue.push(event);
    }

    this.stats.totalEventsEmitted++;
    Utils.log('info', 'DataBus', `Event emitted: ${event.type}`, {
      id: event.id,
      source: event.source,
      target: event.target,
    });

    // Auto-process if not already running
    if (!this.processing) {
      await this.processQueue();
    }

    return event.id;
  }

  /** Process event queue */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      event.status = 'processing';
      event.audit.processedAt = Utils.now();

      const startTime = performance.now();

      try {
        // Find matching subscribers, sorted by priority
        const matchingSubscriptions = Array.from(this.subscriptions.values())
          .filter(sub => {
            // Check event type match
            const typeMatch = sub.eventTypes === '*' || sub.eventTypes.includes(event.type);
            if (!typeMatch) return false;

            // Check target match
            if (event.target === '*') return true;
            const targets = Array.isArray(event.target) ? event.target : [event.target];
            if (targets.includes(sub.module)) return true;

            // Check custom filter
            if (sub.filter && !sub.filter(event)) return false;
            return true;
          })
          .sort((a, b) => a.priority - b.priority);

        // Execute handlers in priority order
        for (const sub of matchingSubscriptions) {
          try {
            await sub.handler(event);
          } catch (handlerError) {
            Utils.log('error', 'DataBus', `Handler failed for ${sub.module}`, {
              eventId: event.id,
              error: String(handlerError),
            });
          }
        }

        event.status = 'completed';
        event.audit.completedAt = Utils.now();
        this.stats.totalEventsProcessed++;
      } catch (error) {
        event.status = 'failed';
        event.audit.error = String(error);
        this.stats.totalEventsFailed++;

        // Retry logic
        if (event.metadata.retryCount < ENGINE_CONFIG.limits.maxRetries) {
          event.metadata.retryCount++;
          event.status = 'retrying';
          const delay = Utils.getRetryDelay(event.metadata.retryCount);
          Utils.log('warn', 'DataBus', `Retrying event ${event.id} in ${delay}ms`, {
            attempt: event.metadata.retryCount,
          });
          await Utils.delay(delay);
          this.queue.push(event);
        }
      }

      // Track processing time
      const processingTime = performance.now() - startTime;
      this.stats.avgProcessingMs =
        (this.stats.avgProcessingMs * (this.stats.totalEventsProcessed - 1) + processingTime) /
        this.stats.totalEventsProcessed;

      // Store in history (ring buffer)
      this.eventHistory.push(event);
      if (this.eventHistory.length > this.maxHistorySize) {
        this.eventHistory.shift();
      }
    }

    this.processing = false;
  }

  /** Get events for a specific module */
  getModuleEvents(moduleId: ModuleId, limit: number = 50): DataEvent[] {
    return this.eventHistory
      .filter(e => e.source === moduleId || e.target === moduleId || e.target === '*')
      .slice(-limit);
  }

  /** Get bus statistics */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      activeSubscriptions: this.subscriptions.size,
      historySize: this.eventHistory.length,
    };
  }

  /** Health check */
  healthCheck(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];
    if (this.queue.length > ENGINE_CONFIG.limits.maxQueueSize * 0.8) {
      issues.push('תור האירועים מתקרב לקיבולת מקסימלית');
    }
    if (this.stats.totalEventsFailed / Math.max(this.stats.totalEventsEmitted, 1) > 0.1) {
      issues.push('שיעור כשלונות גבוה מ-10%');
    }
    return { healthy: issues.length === 0, issues };
  }
}

// ============================================================================
// SECTION 4: LAYER 2 — AIBrain (מוח מלאכותי — ניתוח ותובנות)
// ============================================================================

class AIBrain {
  private insights: AIInsight[] = [];
  private dataBus: DataBus;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;
  private dataStore: Map<ModuleId, any[]> = new Map();

  constructor(dataBus: DataBus) {
    this.dataBus = dataBus;
    this.registerListeners();
  }

  /** Register to listen to all events for analysis */
  private registerListeners(): void {
    this.dataBus.subscribe({
      module: 'analytics:kpi',
      eventTypes: '*',
      handler: async (event) => {
        this.collectDataPoint(event);
      },
      priority: 100, // low priority — doesn't block business logic
    });
  }

  /** Collect data points from events */
  private collectDataPoint(event: DataEvent): void {
    const moduleData = this.dataStore.get(event.source) || [];
    moduleData.push({
      type: event.type,
      payload: event.payload,
      timestamp: event.timestamp,
    });
    // Keep last 1000 data points per module
    if (moduleData.length > 1000) moduleData.shift();
    this.dataStore.set(event.source, moduleData);
  }

  /** Start periodic AI analysis */
  startAnalysis(): void {
    this.analysisInterval = setInterval(() => {
      this.runAllAnalyses();
    }, ENGINE_CONFIG.limits.aiAnalysisIntervalMs);
    Utils.log('info', 'AIBrain', 'AI analysis engine started');
  }

  /** Stop analysis */
  stopAnalysis(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  /** Run all analysis modules */
  private async runAllAnalyses(): Promise<void> {
    await Promise.allSettled([
      this.analyzeCashFlow(),
      this.analyzeCustomerChurn(),
      this.analyzeInventory(),
      this.analyzeSalesPerformance(),
      this.analyzeProjectDelays(),
      this.analyzeLeadScoring(),
      this.analyzeProductionEfficiency(),
      this.analyzePricingOptimization(),
    ]);
  }

  // --- 4.1 Cash Flow Analysis ---
  private async analyzeCashFlow(): Promise<void> {
    const invoiceData = this.dataStore.get('finance:invoices') || [];
    const paymentData = this.dataStore.get('finance:payments') || [];

    const totalInvoiced = invoiceData
      .filter(d => d.type === 'invoice:created')
      .reduce((sum, d) => sum + (d.payload.amountAgorot || 0), 0);

    const totalPaid = paymentData
      .filter(d => d.type === 'payment:received')
      .reduce((sum, d) => sum + (d.payload.amountAgorot || 0), 0);

    const overdueInvoices = invoiceData.filter(d => d.type === 'invoice:overdue');
    const collectionRate = totalInvoiced > 0 ? totalPaid / totalInvoiced : 1;

    if (collectionRate < 0.7 || overdueInvoices.length > 5) {
      const insight: AIInsight = {
        id: Utils.generateId('ins'),
        category: 'cash_flow_forecast',
        severity: collectionRate < 0.5 ? 'critical' : 'warning',
        titleHe: '⚠️ התראת תזרים מזומנים',
        descriptionHe: `שיעור הגבייה עומד על ${(collectionRate * 100).toFixed(1)}%. יש ${overdueInvoices.length} חשבוניות באיחור.`,
        dataPoints: {
          totalInvoicedILS: Utils.agorotToShekel(totalInvoiced),
          totalPaidILS: Utils.agorotToShekel(totalPaid),
          collectionRate: `${(collectionRate * 100).toFixed(1)}%`,
          overdueCount: overdueInvoices.length,
        },
        recommendation: `מומלץ ליצור קשר עם ${overdueInvoices.length} לקוחות עם חשבוניות באיחור. שקול תנאי תשלום מחמירים יותר.`,
        confidence: 0.85,
        affectedModules: ['finance:invoices', 'finance:payments', 'crm:customers'],
        generatedAt: Utils.now(),
        expiresAt: Utils.now() + 86400000, // 24h
        actionable: true,
        suggestedActions: [
          {
            id: Utils.generateId('act'),
            type: 'notification',
            titleHe: 'שלח תזכורת ללקוחות עם חוב',
            payload: { overdueInvoices: overdueInvoices.map(i => i.payload.invoiceId) },
            autoExecute: false,
          },
          {
            id: Utils.generateId('act'),
            type: 'report',
            titleHe: 'הפק דוח גיול חובות',
            payload: { reportType: 'aging_receivables' },
            autoExecute: true,
          },
        ],
      };

      this.emitInsight(insight);
    }
  }

  // --- 4.2 Customer Churn Risk ---
  private async analyzeCustomerChurn(): Promise<void> {
    const customerData = this.dataStore.get('crm:customers') || [];
    const activityData = this.dataStore.get('crm:activities') || [];
    const dealData = this.dataStore.get('crm:deals') || [];

    const thirtyDaysAgo = Utils.now() - 30 * 86400000;
    const inactiveCustomers = customerData.filter(c => {
      const lastActivity = activityData
        .filter(a => a.payload.customerId === c.payload.id)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      return !lastActivity || lastActivity.timestamp < thirtyDaysAgo;
    });

    if (inactiveCustomers.length > 0) {
      this.emitInsight({
        id: Utils.generateId('ins'),
        category: 'customer_churn_risk',
        severity: inactiveCustomers.length > 10 ? 'warning' : 'info',
        titleHe: '📉 לקוחות בסיכון נטישה',
        descriptionHe: `${inactiveCustomers.length} לקוחות ללא פעילות ב-30 ימים אחרונים.`,
        dataPoints: {
          inactiveCount: inactiveCustomers.length,
          period: '30 days',
        },
        recommendation: 'מומלץ ליצור קשר עם לקוחות אלו — שלח הצעה מיוחדת או סקר שביעות רצון.',
        confidence: 0.75,
        affectedModules: ['crm:customers', 'crm:activities', 'sales:orders'],
        generatedAt: Utils.now(),
        expiresAt: Utils.now() + 604800000, // 7d
        actionable: true,
        suggestedActions: [
          {
            id: Utils.generateId('act'),
            type: 'automation',
            titleHe: 'שלח WhatsApp אוטומטי ללקוחות רדומים',
            payload: { template: 'win_back', customerIds: inactiveCustomers.map(c => c.payload.id) },
            autoExecute: false,
          },
        ],
      });
    }
  }

  // --- 4.3 Inventory Optimization ---
  private async analyzeInventory(): Promise<void> {
    const inventoryData = this.dataStore.get('erp:inventory') || [];
    const lowStockItems = inventoryData.filter(d => d.type === 'inventory:low' || d.type === 'inventory:reorderPoint');

    if (lowStockItems.length > 0) {
      this.emitInsight({
        id: Utils.generateId('ins'),
        category: 'inventory_optimization',
        severity: lowStockItems.length > 5 ? 'critical' : 'warning',
        titleHe: '📦 מלאי נמוך — נדרשת הזמנה',
        descriptionHe: `${lowStockItems.length} פריטים מתחת לנקודת הזמנה מחדש.`,
        dataPoints: {
          lowStockCount: lowStockItems.length,
          items: lowStockItems.slice(0, 5).map(i => i.payload.itemName).join(', '),
        },
        recommendation: 'יש להפעיל הזמנת רכש אוטומטית לפריטים קריטיים.',
        confidence: 0.95,
        affectedModules: ['erp:inventory', 'erp:procurement', 'erp:rawMaterials', 'erp:suppliers'],
        generatedAt: Utils.now(),
        expiresAt: Utils.now() + 43200000, // 12h
        actionable: true,
        suggestedActions: [
          {
            id: Utils.generateId('act'),
            type: 'automation',
            titleHe: 'צור הזמנות רכש אוטומטיות',
            payload: { items: lowStockItems.map(i => i.payload) },
            autoExecute: true,
          },
        ],
      });
    }
  }

  // --- 4.4 Sales Performance ---
  private async analyzeSalesPerformance(): Promise<void> {
    const dealData = this.dataStore.get('crm:deals') || [];
    const now = Utils.now();
    const thisMonth = dealData.filter(d => d.timestamp > now - 30 * 86400000);

    const won = thisMonth.filter(d => d.type === 'deal:won');
    const lost = thisMonth.filter(d => d.type === 'deal:lost');
    const winRate = (won.length + lost.length) > 0
      ? won.length / (won.length + lost.length)
      : 0;

    const totalRevenueThisMonth = won.reduce((sum, d) => sum + (d.payload.amountAgorot || 0), 0);

    this.emitInsight({
      id: Utils.generateId('ins'),
      category: 'sales_performance',
      severity: winRate < 0.3 ? 'warning' : 'info',
      titleHe: '📊 ביצועי מכירות — סיכום חודשי',
      descriptionHe: `שיעור סגירה: ${(winRate * 100).toFixed(1)}%. הכנסות החודש: ${Utils.formatCurrency(totalRevenueThisMonth)}.`,
      dataPoints: {
        wonDeals: won.length,
        lostDeals: lost.length,
        winRate: `${(winRate * 100).toFixed(1)}%`,
        revenueILS: Utils.agorotToShekel(totalRevenueThisMonth),
      },
      recommendation: winRate < 0.3
        ? 'שיעור הסגירה נמוך. בדוק האם יש בעיה בתמחור או באיכות הלידים.'
        : 'ביצועים סבירים. המשך לעקוב אחרי מגמות.',
      confidence: 0.8,
      affectedModules: ['crm:deals', 'sales:orders', 'crm:leads'],
      generatedAt: Utils.now(),
      expiresAt: Utils.now() + 604800000,
      actionable: winRate < 0.3,
      suggestedActions: [],
    });
  }

  // --- 4.5 Project Delay Detection ---
  private async analyzeProjectDelays(): Promise<void> {
    const projectData = this.dataStore.get('project:projects') || [];
    const delayedProjects = projectData.filter(d => d.type === 'project:delayed');

    if (delayedProjects.length > 0) {
      this.emitInsight({
        id: Utils.generateId('ins'),
        category: 'project_delay_risk',
        severity: delayedProjects.length > 3 ? 'critical' : 'warning',
        titleHe: '🚧 פרויקטים באיחור',
        descriptionHe: `${delayedProjects.length} פרויקטים חורגים מלוח הזמנים.`,
        dataPoints: {
          delayedCount: delayedProjects.length,
          projects: delayedProjects.slice(0, 3).map(p => p.payload.projectName).join(', '),
        },
        recommendation: 'יש לעדכן לקוחות ולבדוק עם עוזי וצוות ההתקנה.',
        confidence: 0.9,
        affectedModules: ['project:projects', 'project:stages', 'ops:installation'],
        generatedAt: Utils.now(),
        expiresAt: Utils.now() + 86400000,
        actionable: true,
        suggestedActions: [
          {
            id: Utils.generateId('act'),
            type: 'notification',
            titleHe: 'התרע לעוזי ודימה על עיכובים',
            payload: { channel: 'whatsapp', recipients: ['ozi', 'dima'] },
            autoExecute: true,
          },
        ],
      });
    }
  }

  // --- 4.6 Lead Scoring ---
  private async analyzeLeadScoring(): Promise<void> {
    const leadData = this.dataStore.get('crm:leads') || [];
    const newLeads = leadData.filter(d => d.type === 'lead:newInquiry');

    for (const lead of newLeads.slice(-20)) {
      const score = this.calculateLeadScore(lead.payload);
      if (score >= 80) {
        this.emitInsight({
          id: Utils.generateId('ins'),
          category: 'lead_scoring',
          severity: 'info',
          titleHe: `🔥 ליד חם — ${lead.payload.name || 'לא ידוע'}`,
          descriptionHe: `ניקוד: ${score}/100. מקור: ${lead.payload.source || 'ישיר'}. סוג: ${lead.payload.projectType || 'לא מוגדר'}.`,
          dataPoints: { score, source: lead.payload.source, budget: lead.payload.budget },
          recommendation: 'יש ליצור קשר תוך שעה! ליד עם פוטנציאל גבוה.',
          confidence: 0.7,
          affectedModules: ['crm:leads', 'crm:deals', 'sales:orders'],
          generatedAt: Utils.now(),
          expiresAt: Utils.now() + 14400000, // 4h
          actionable: true,
          suggestedActions: [
            {
              id: Utils.generateId('act'),
              type: 'task',
              titleHe: `התקשר לליד: ${lead.payload.name}`,
              payload: { leadId: lead.payload.id, assignTo: 'sales_team' },
              autoExecute: true,
            },
          ],
        });
      }
    }
  }

  /** Simple lead scoring algorithm */
  private calculateLeadScore(lead: any): number {
    let score = 50; // base score
    // Budget factor
    if (lead.budgetAgorot > Utils.shekelToAgorot(50000)) score += 20;
    else if (lead.budgetAgorot > Utils.shekelToAgorot(20000)) score += 10;
    // Source factor
    if (lead.source === 'referral') score += 15;
    else if (lead.source === 'google_ads') score += 10;
    else if (lead.source === 'organic') score += 8;
    // Project type
    if (['stairs', 'pergola', 'gate'].includes(lead.projectType)) score += 10;
    // Urgency
    if (lead.urgency === 'high') score += 15;
    else if (lead.urgency === 'medium') score += 5;
    // Clamp 0-100
    return Math.max(0, Math.min(100, score));
  }

  // --- 4.7 Production Efficiency ---
  private async analyzeProductionEfficiency(): Promise<void> {
    const prodData = this.dataStore.get('erp:manufacturing') || [];
    const completed = prodData.filter(d => d.type === 'production:completed');
    const delayed = prodData.filter(d => d.type === 'production:delayed');

    if (completed.length + delayed.length > 0) {
      const efficiency = completed.length / (completed.length + delayed.length);
      if (efficiency < 0.8) {
        this.emitInsight({
          id: Utils.generateId('ins'),
          category: 'production_efficiency',
          severity: efficiency < 0.6 ? 'critical' : 'warning',
          titleHe: '🏭 יעילות ייצור ירודה',
          descriptionHe: `יעילות ייצור: ${(efficiency * 100).toFixed(1)}%. ${delayed.length} הזמנות בעיכוב.`,
          dataPoints: { efficiency: `${(efficiency * 100).toFixed(1)}%`, delayed: delayed.length, completed: completed.length },
          recommendation: 'בדוק צווארי בקבוק בייצור. ייתכן שנדרש קבלן נוסף.',
          confidence: 0.85,
          affectedModules: ['erp:manufacturing', 'erp:mrp', 'project:timeline'],
          generatedAt: Utils.now(),
          expiresAt: Utils.now() + 86400000,
          actionable: true,
          suggestedActions: [],
        });
      }
    }
  }

  // --- 4.8 Pricing Optimization ---
  private async analyzePricingOptimization(): Promise<void> {
    const quoteData = this.dataStore.get('finance:quotes') || [];
    const approved = quoteData.filter(d => d.type === 'quote:approved');
    const expired = quoteData.filter(d => d.type === 'quote:expired');

    if (approved.length + expired.length > 5) {
      const approvalRate = approved.length / (approved.length + expired.length);
      if (approvalRate < 0.4) {
        this.emitInsight({
          id: Utils.generateId('ins'),
          category: 'pricing_suggestion',
          severity: 'warning',
          titleHe: '💰 הצעות מחיר — שיעור אישור נמוך',
          descriptionHe: `רק ${(approvalRate * 100).toFixed(1)}% מההצעות מאושרות. בדוק תמחור.`,
          dataPoints: { approved: approved.length, expired: expired.length, rate: `${(approvalRate * 100).toFixed(1)}%` },
          recommendation: 'שקול הורדת מחירים של 5-10% או הצעת חבילות משולבות.',
          confidence: 0.65,
          affectedModules: ['finance:quotes', 'sales:pricing', 'crm:deals'],
          generatedAt: Utils.now(),
          expiresAt: Utils.now() + 604800000,
          actionable: true,
          suggestedActions: [],
        });
      }
    }
  }

  /** Emit insight to the data bus */
  private emitInsight(insight: AIInsight): void {
    this.insights.push(insight);
    // Keep last 500 insights
    if (this.insights.length > 500) this.insights.shift();

    this.dataBus.emit({
      source: 'analytics:kpi',
      target: '*',
      type: 'ai:insightGenerated',
      priority: insight.severity === 'critical' ? 'critical' : 'medium',
      payload: insight,
      tags: ['ai', insight.category],
    });

    Utils.log('info', 'AIBrain', `Insight generated: ${insight.titleHe}`, {
      category: insight.category,
      severity: insight.severity,
    });
  }

  /** Get all active insights */
  getActiveInsights(): AIInsight[] {
    const now = Utils.now();
    return this.insights.filter(i => i.expiresAt > now);
  }

  /** Get insights by category */
  getInsightsByCategory(category: InsightCategory): AIInsight[] {
    return this.getActiveInsights().filter(i => i.category === category);
  }
}

// ============================================================================
// SECTION 5: LAYER 3 — AutomationEngine (מנוע אוטומציה)
// ============================================================================

class AutomationEngine {
  private rules: Map<string, AutomationRule> = new Map();
  private dataBus: DataBus;
  private executionLog: Array<{ ruleId: string; eventId: string; timestamp: number; success: boolean; error?: string }> = [];

  constructor(dataBus: DataBus) {
    this.dataBus = dataBus;
    this.registerListener();
  }

  /** Listen to all events and check automation rules */
  private registerListener(): void {
    this.dataBus.subscribe({
      module: 'analytics:dashboard',
      eventTypes: '*',
      handler: async (event) => {
        await this.evaluateRules(event);
      },
      priority: 50,
    });
  }

  /** Register an automation rule */
  addRule(rule: Omit<AutomationRule, 'stats'>): void {
    const fullRule: AutomationRule = {
      ...rule,
      stats: { totalFired: 0, totalSuccess: 0, totalFailed: 0, avgExecutionMs: 0 },
    };
    this.rules.set(rule.id, fullRule);
    Utils.log('info', 'Automation', `Rule registered: ${rule.nameHe}`, { id: rule.id });
  }

  /** Remove a rule */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /** Evaluate all rules against an event */
  private async evaluateRules(event: DataEvent): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check cooldown
      if (rule.lastFiredAt && (Utils.now() - rule.lastFiredAt) < rule.cooldownMs) continue;

      // Check trigger match
      const triggerTypes = Array.isArray(rule.trigger.eventType) ? rule.trigger.eventType : [rule.trigger.eventType];
      if (!triggerTypes.includes(event.type)) continue;

      // Check source module filter
      if (rule.trigger.sourceModule) {
        const sourceModules = Array.isArray(rule.trigger.sourceModule) ? rule.trigger.sourceModule : [rule.trigger.sourceModule];
        if (!sourceModules.includes(event.source)) continue;
      }

      // Check conditions
      if (rule.conditions.length > 0 && !Utils.matchesConditions(event.payload, rule.conditions)) continue;

      // All checks passed — execute actions
      const startTime = performance.now();
      try {
        for (const action of rule.actions) {
          if (action.delayMs) await Utils.delay(action.delayMs);
          await this.executeAction(action, event, rule);
        }
        rule.stats.totalSuccess++;
        this.executionLog.push({ ruleId: rule.id, eventId: event.id, timestamp: Utils.now(), success: true });
      } catch (error) {
        rule.stats.totalFailed++;
        this.executionLog.push({ ruleId: rule.id, eventId: event.id, timestamp: Utils.now(), success: false, error: String(error) });
        Utils.log('error', 'Automation', `Rule execution failed: ${rule.nameHe}`, { error: String(error) });
      }

      rule.stats.totalFired++;
      rule.lastFiredAt = Utils.now();
      const executionTime = performance.now() - startTime;
      rule.stats.avgExecutionMs =
        (rule.stats.avgExecutionMs * (rule.stats.totalFired - 1) + executionTime) / rule.stats.totalFired;
    }
  }

  /** Execute a single automation action */
  private async executeAction(action: AutomationAction, triggerEvent: DataEvent, rule: AutomationRule): Promise<void> {
    switch (action.type) {
      case 'sendEvent':
        await this.dataBus.emit({
          source: triggerEvent.source,
          target: action.config.target || '*',
          type: action.config.eventType || 'automation:triggered',
          payload: { ...action.config.payload, triggeredBy: rule.id },
          tags: ['automation'],
        });
        break;

      case 'sendWhatsApp':
        await this.dataBus.emit({
          source: triggerEvent.source,
          target: 'external:whatsapp',
          type: 'automation:triggered',
          direction: 'out→external',
          payload: {
            action: 'sendMessage',
            phone: action.config.phone,
            template: action.config.template,
            params: action.config.params,
            triggeredBy: rule.id,
          },
          tags: ['automation', 'whatsapp'],
        });
        break;

      case 'sendEmail':
        await this.dataBus.emit({
          source: triggerEvent.source,
          target: 'external:google',
          type: 'automation:triggered',
          direction: 'out→external',
          payload: {
            action: 'sendEmail',
            to: action.config.to,
            subject: action.config.subject,
            body: action.config.body,
            triggeredBy: rule.id,
          },
          tags: ['automation', 'email'],
        });
        break;

      case 'createInvoice':
        await this.dataBus.emit({
          source: triggerEvent.source,
          target: 'external:sumit',
          type: 'automation:triggered',
          direction: 'out→external',
          payload: {
            action: 'createInvoice',
            ...action.config,
            triggeredBy: rule.id,
          },
          tags: ['automation', 'sumit', 'invoice'],
        });
        break;

      case 'updateEntity':
        await this.dataBus.emit({
          source: triggerEvent.source,
          target: action.config.module,
          type: 'entity:updated',
          payload: action.config.updates,
          tags: ['automation'],
        });
        break;

      case 'createTask':
        await this.dataBus.emit({
          source: triggerEvent.source,
          target: 'project:tasks',
          type: 'entity:created',
          payload: {
            type: 'task',
            title: action.config.title,
            assignee: action.config.assignee,
            dueDate: action.config.dueDate,
            priority: action.config.priority || 'medium',
            triggeredBy: rule.id,
          },
          tags: ['automation', 'task'],
        });
        break;

      case 'notify':
        Utils.log('info', 'Automation', `📢 ${action.config.message}`, {
          channel: action.config.channel,
          recipients: action.config.recipients,
        });
        break;

      case 'webhook':
        // Placeholder for HTTP webhook calls
        Utils.log('info', 'Automation', `🔗 Webhook: ${action.config.url}`, {
          method: action.config.method || 'POST',
        });
        break;

      case 'aiAnalysis':
        await this.dataBus.emit({
          source: triggerEvent.source,
          target: 'analytics:kpi',
          type: 'ai:recommendationReady',
          payload: { requestedAnalysis: action.config.analysisType, context: triggerEvent.payload },
          tags: ['automation', 'ai'],
        });
        break;

      case 'callApi':
        Utils.log('info', 'Automation', `🌐 API Call: ${action.config.endpoint}`, action.config);
        break;
    }
  }

  /** Get all rules */
  getRules(): AutomationRule[] {
    return Array.from(this.rules.values());
  }

  /** Get execution log */
  getExecutionLog(limit: number = 100) {
    return this.executionLog.slice(-limit);
  }
}

// ============================================================================
// SECTION 6: LAYER 4 — SyncBridge (גשר סנכרון עם מערכות חיצוניות)
// ============================================================================

class SyncBridge {
  private configs: Map<ExternalSystem, SyncConfig> = new Map();
  private dataBus: DataBus;
  private syncIntervals: Map<ExternalSystem, ReturnType<typeof setInterval>> = new Map();

  constructor(dataBus: DataBus) {
    this.dataBus = dataBus;
    this.registerListeners();
  }

  /** Listen for outbound sync events */
  private registerListeners(): void {
    this.dataBus.subscribe({
      module: 'external:sumit',
      eventTypes: ['automation:triggered', 'invoice:created', 'invoice:sent'],
      handler: async (event) => { await this.handleSumitSync(event); },
      priority: 10,
    });

    this.dataBus.subscribe({
      module: 'external:whatsapp',
      eventTypes: ['automation:triggered'],
      handler: async (event) => { await this.handleWhatsAppSync(event); },
      priority: 10,
    });

    this.dataBus.subscribe({
      module: 'external:google',
      eventTypes: ['automation:triggered'],
      handler: async (event) => { await this.handleGoogleSync(event); },
      priority: 10,
    });

    this.dataBus.subscribe({
      module: 'external:scala',
      eventTypes: ['entity:created', 'entity:updated', 'lead:newInquiry'],
      handler: async (event) => { await this.handleScalaSync(event); },
      priority: 10,
    });

    this.dataBus.subscribe({
      module: 'external:wix',
      eventTypes: ['lead:newInquiry'],
      handler: async (event) => { await this.handleWixSync(event); },
      priority: 10,
    });
  }

  /** Register an external system */
  registerSystem(config: SyncConfig): void {
    this.configs.set(config.system, config);
    Utils.log('info', 'SyncBridge', `System registered: ${config.system}`, {
      direction: config.direction,
      interval: config.intervalMs,
    });

    // Start periodic sync if bidirectional or pull
    if (config.direction !== 'push' && config.enabled) {
      this.startPeriodicSync(config.system);
    }
  }

  /** Start periodic sync for pull/bidirectional */
  private startPeriodicSync(system: ExternalSystem): void {
    const config = this.configs.get(system);
    if (!config) return;

    const interval = setInterval(async () => {
      await this.pullFromExternal(system);
    }, config.intervalMs);

    this.syncIntervals.set(system, interval);
  }

  /** Stop periodic sync */
  stopPeriodicSync(system: ExternalSystem): void {
    const interval = this.syncIntervals.get(system);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(system);
    }
  }

  /** Pull data from external system */
  private async pullFromExternal(system: ExternalSystem): Promise<void> {
    const config = this.configs.get(system);
    if (!config || !config.enabled) return;

    try {
      await this.dataBus.emit({
        source: `external:${system}` as ModuleId,
        target: '*',
        type: 'sync:started',
        direction: 'external→in',
        payload: { system, operation: 'pull' },
        tags: ['sync', system],
      });

      // System-specific pull logic would go here
      // Each external system has its own API client

      config.lastSyncAt = Utils.now();
      config.lastSyncStatus = 'success';

      await this.dataBus.emit({
        source: `external:${system}` as ModuleId,
        target: '*',
        type: 'sync:completed',
        direction: 'external→in',
        payload: { system, operation: 'pull', recordsProcessed: 0 },
        tags: ['sync', system],
      });
    } catch (error) {
      config.lastSyncStatus = 'failed';
      config.errorLog.push({
        timestamp: Utils.now(),
        system,
        operation: 'pull',
        error: String(error),
        resolved: false,
      });

      await this.dataBus.emit({
        source: `external:${system}` as ModuleId,
        target: '*',
        type: 'sync:failed',
        priority: 'high',
        direction: 'external→in',
        payload: { system, error: String(error) },
        tags: ['sync', system, 'error'],
      });
    }
  }

  // --- 6.1 SUMIT Integration ---
  private async handleSumitSync(event: DataEvent): Promise<void> {
    const config = this.configs.get('sumit');
    if (!config?.enabled) return;

    Utils.log('info', 'SyncBridge:SUMIT', `Processing: ${event.type}`, event.payload);

    // Map internal data to SUMIT API format
    if (event.payload.action === 'createInvoice') {
      const sumitPayload = {
        CustomerName: event.payload.customerName,
        CustomerEmail: event.payload.customerEmail,
        Items: event.payload.items?.map((item: any) => ({
          Description: item.description,
          Quantity: item.quantity,
          UnitPrice: Utils.agorotToShekel(item.priceAgorot),
          VATIncluded: false,
        })),
        // SUMIT expects shekel, we store agorot
        TotalAmount: Utils.agorotToShekel(event.payload.totalAgorot),
      };
      Utils.log('info', 'SyncBridge:SUMIT', 'Invoice payload ready', sumitPayload);
      // await fetch(SUMIT_API_URL, { method: 'POST', body: JSON.stringify(sumitPayload), headers: { ... } });
    }
  }

  // --- 6.2 WhatsApp Integration ---
  private async handleWhatsAppSync(event: DataEvent): Promise<void> {
    const config = this.configs.get('whatsapp');
    if (!config?.enabled) return;

    Utils.log('info', 'SyncBridge:WhatsApp', `Processing: ${event.payload.action}`, {
      phone: event.payload.phone,
      template: event.payload.template,
    });

    // WhatsApp Business API payload
    if (event.payload.action === 'sendMessage') {
      const waPayload = {
        messaging_product: 'whatsapp',
        to: event.payload.phone,
        type: 'template',
        template: {
          name: event.payload.template,
          language: { code: 'he' },
          components: event.payload.params ? [{
            type: 'body',
            parameters: event.payload.params.map((p: string) => ({ type: 'text', text: p })),
          }] : [],
        },
      };
      Utils.log('info', 'SyncBridge:WhatsApp', 'Message payload ready', waPayload);
      // await fetch(WA_API_URL, { method: 'POST', body: JSON.stringify(waPayload), headers: { ... } });
    }
  }

  // --- 6.3 Google Integration (Sheets, Drive, Calendar) ---
  private async handleGoogleSync(event: DataEvent): Promise<void> {
    const config = this.configs.get('google_sheets');
    if (!config?.enabled) return;

    Utils.log('info', 'SyncBridge:Google', `Processing: ${event.payload.action}`, event.payload);

    if (event.payload.action === 'appendToSheet') {
      // Google Sheets API append row
      Utils.log('info', 'SyncBridge:Google', 'Appending to sheet', {
        sheetId: event.payload.sheetId,
        range: event.payload.range,
      });
    }

    if (event.payload.action === 'sendEmail') {
      // Gmail API send
      Utils.log('info', 'SyncBridge:Google', 'Sending email', {
        to: event.payload.to,
        subject: event.payload.subject,
      });
    }
  }

  // --- 6.4 Scala CRM Integration ---
  private async handleScalaSync(event: DataEvent): Promise<void> {
    const config = this.configs.get('scala_crm');
    if (!config?.enabled) return;

    Utils.log('info', 'SyncBridge:Scala', `Syncing: ${event.type}`, event.payload);
    // Bidirectional sync with Scala CRM
  }

  // --- 6.5 Wix Integration ---
  private async handleWixSync(event: DataEvent): Promise<void> {
    const config = this.configs.get('wix');
    if (!config?.enabled) return;

    Utils.log('info', 'SyncBridge:Wix', `Processing lead from Wix`, event.payload);
    // Wix form submission → new lead in CRM
  }

  /** Get sync status for all systems */
  getSyncStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    for (const [system, config] of this.configs) {
      status[system] = {
        enabled: config.enabled,
        direction: config.direction,
        lastSyncAt: config.lastSyncAt ? new Date(config.lastSyncAt).toISOString() : 'never',
        lastStatus: config.lastSyncStatus || 'unknown',
        errors: config.errorLog.filter(e => !e.resolved).length,
      };
    }
    return status;
  }
}

// ============================================================================
// SECTION 7: BUILT-IN AUTOMATION RULES (חוקי אוטומציה מובנים)
// ============================================================================

const BUILT_IN_RULES: Omit<AutomationRule, 'stats'>[] = [
  // --- Rule 1: Lead → WhatsApp Welcome ---
  {
    id: 'rule_lead_welcome',
    nameHe: '🟢 ליד חדש → הודעת ברוכים הבאים בוואטסאפ',
    description: 'When a new lead comes in, send WhatsApp welcome message',
    enabled: true,
    priority: 1,
    trigger: { eventType: 'lead:newInquiry' },
    conditions: [
      { field: 'phone', operator: 'exists', value: true },
    ],
    actions: [
      {
        type: 'sendWhatsApp',
        config: {
          phone: '{{payload.phone}}',
          template: 'lead_welcome',
          params: ['{{payload.name}}', 'טכנו כל עוזי'],
        },
        retryOnFail: true,
      },
      {
        type: 'createTask',
        config: {
          title: 'התקשר לליד חדש: {{payload.name}}',
          assignee: 'sales_team',
          priority: 'high',
          dueDate: '+2h',
        },
        delayMs: 300000, // 5 min delay
        retryOnFail: false,
      },
    ],
    cooldownMs: 0,
  },

  // --- Rule 2: Invoice Overdue → Chase ---
  {
    id: 'rule_invoice_overdue',
    nameHe: '🔴 חשבונית באיחור → תזכורת ללקוח',
    description: 'When invoice becomes overdue, send reminder',
    enabled: true,
    priority: 2,
    trigger: { eventType: 'invoice:overdue' },
    conditions: [
      { field: 'daysOverdue', operator: 'gte', value: 7 },
    ],
    actions: [
      {
        type: 'sendWhatsApp',
        config: {
          phone: '{{payload.customerPhone}}',
          template: 'payment_reminder',
          params: ['{{payload.customerName}}', '{{payload.invoiceNumber}}', '{{payload.totalFormatted}}'],
        },
        retryOnFail: true,
      },
      {
        type: 'notify',
        config: {
          message: `חשבונית #{{payload.invoiceNumber}} באיחור של {{payload.daysOverdue}} ימים`,
          channel: 'internal',
          recipients: ['kobi', 'dima'],
        },
        retryOnFail: false,
      },
    ],
    cooldownMs: 86400000, // once per day per rule instance
  },

  // --- Rule 3: Inventory Low → Auto Reorder ---
  {
    id: 'rule_inventory_reorder',
    nameHe: '📦 מלאי נמוך → הזמנה אוטומטית',
    description: 'When inventory hits reorder point, create procurement request',
    enabled: true,
    priority: 1,
    trigger: { eventType: 'inventory:reorderPoint' },
    conditions: [],
    actions: [
      {
        type: 'sendEvent',
        config: {
          target: 'erp:procurement',
          eventType: 'procurement:requested',
          payload: {
            itemId: '{{payload.itemId}}',
            itemName: '{{payload.itemName}}',
            currentStock: '{{payload.currentStock}}',
            reorderQuantity: '{{payload.reorderQuantity}}',
            preferredSupplier: '{{payload.preferredSupplier}}',
          },
        },
        retryOnFail: true,
      },
      {
        type: 'notify',
        config: {
          message: '📦 הוזמן מחדש: {{payload.itemName}} ({{payload.reorderQuantity}} יחידות)',
          channel: 'whatsapp',
          recipients: ['dima'],
        },
        retryOnFail: false,
      },
    ],
    cooldownMs: 3600000, // 1h cooldown
  },

  // --- Rule 4: Deal Won → Generate Invoice ---
  {
    id: 'rule_deal_to_invoice',
    nameHe: '🎉 עסקה נסגרה → צור חשבונית',
    description: 'When deal is won, automatically create invoice in SUMIT',
    enabled: true,
    priority: 1,
    trigger: { eventType: 'deal:won' },
    conditions: [
      { field: 'amountAgorot', operator: 'gt', value: 0 },
    ],
    actions: [
      {
        type: 'createInvoice',
        config: {
          customerName: '{{payload.customerName}}',
          customerEmail: '{{payload.customerEmail}}',
          items: '{{payload.items}}',
          totalAgorot: '{{payload.amountAgorot}}',
        },
        retryOnFail: true,
      },
      {
        type: 'sendWhatsApp',
        config: {
          phone: '{{payload.customerPhone}}',
          template: 'deal_confirmation',
          params: ['{{payload.customerName}}', '{{payload.projectType}}'],
        },
        retryOnFail: false,
      },
    ],
    cooldownMs: 0,
  },

  // --- Rule 5: Project Stage Change → Notify Team ---
  {
    id: 'rule_project_stage_notify',
    nameHe: '📋 שינוי שלב בפרויקט → עדכון הצוות',
    description: 'When project moves to next stage, notify relevant team members',
    enabled: true,
    priority: 3,
    trigger: { eventType: 'project:stageChanged' },
    conditions: [],
    actions: [
      {
        type: 'notify',
        config: {
          message: 'פרויקט "{{payload.projectName}}" עבר לשלב: {{payload.newStage}}',
          channel: 'whatsapp',
          recipients: ['{{payload.assignedTo}}', 'dima'],
        },
        retryOnFail: false,
      },
      {
        type: 'aiAnalysis',
        config: {
          analysisType: 'project_delay_risk',
        },
        retryOnFail: false,
      },
    ],
    cooldownMs: 0,
  },

  // --- Rule 6: Measurement Completed → Start Production ---
  {
    id: 'rule_measurement_to_production',
    nameHe: '📐 מדידה הושלמה → התחל ייצור',
    description: 'After Ozi completes measurement, trigger production planning',
    enabled: true,
    priority: 2,
    trigger: { eventType: 'measurement:completed' },
    conditions: [
      { field: 'approved', operator: 'eq', value: true },
    ],
    actions: [
      {
        type: 'sendEvent',
        config: {
          target: 'erp:manufacturing',
          eventType: 'production:started',
          payload: {
            projectId: '{{payload.projectId}}',
            measurements: '{{payload.measurements}}',
            materialRequirements: '{{payload.materials}}',
          },
        },
        retryOnFail: true,
      },
      {
        type: 'updateEntity',
        config: {
          module: 'project:stages',
          updates: {
            projectId: '{{payload.projectId}}',
            stage: 'in_production',
            updatedAt: '{{now}}',
          },
        },
        retryOnFail: true,
      },
    ],
    cooldownMs: 0,
  },

  // --- Rule 7: Payment Received → Update All Systems ---
  {
    id: 'rule_payment_cascade',
    nameHe: '💳 תשלום התקבל → עדכן את כל המערכות',
    description: 'When payment is received, update invoice, CRM, and sync to SUMIT + Google Sheets',
    enabled: true,
    priority: 1,
    trigger: { eventType: 'payment:received' },
    conditions: [],
    actions: [
      {
        type: 'updateEntity',
        config: {
          module: 'finance:invoices',
          updates: {
            invoiceId: '{{payload.invoiceId}}',
            status: 'paid',
            paidAt: '{{now}}',
            paidAmountAgorot: '{{payload.amountAgorot}}',
          },
        },
        retryOnFail: true,
      },
      {
        type: 'sendEvent',
        config: {
          target: 'external:google',
          eventType: 'automation:triggered',
          payload: {
            action: 'appendToSheet',
            sheetId: 'PAYMENTS_SHEET_ID',
            range: 'Sheet1',
            values: ['{{payload.date}}', '{{payload.customerName}}', '{{payload.amountFormatted}}', '{{payload.invoiceNumber}}'],
          },
        },
        retryOnFail: true,
      },
      {
        type: 'notify',
        config: {
          message: '💰 תשלום התקבל: {{payload.amountFormatted}} מ-{{payload.customerName}}',
          channel: 'internal',
          recipients: ['kobi'],
        },
        retryOnFail: false,
      },
    ],
    cooldownMs: 0,
  },

  // --- Rule 8: Daily Health Check ---
  {
    id: 'rule_daily_health',
    nameHe: '🏥 בדיקת בריאות יומית',
    description: 'Daily system health check and KPI summary',
    enabled: true,
    priority: 10,
    trigger: {
      eventType: 'system:healthCheck',
      schedule: '0 8 * * *', // 8:00 AM daily
    },
    conditions: [],
    actions: [
      {
        type: 'aiAnalysis',
        config: { analysisType: 'daily_summary' },
        retryOnFail: false,
      },
      {
        type: 'notify',
        config: {
          message: '☀️ בוקר טוב! סיכום יומי מוכן בדשבורד.',
          channel: 'whatsapp',
          recipients: ['kobi'],
        },
        retryOnFail: false,
      },
    ],
    cooldownMs: 86400000,
  },
];

// ============================================================================
// SECTION 8: ENGINE FACTORY — אתחול המנוע
// ============================================================================

class TechnoKolUziEngine {
  public dataBus: DataBus;
  public aiBrain: AIBrain;
  public automation: AutomationEngine;
  public syncBridge: SyncBridge;

  private running: boolean = false;

  constructor() {
    // Initialize all 4 layers
    this.dataBus = new DataBus();
    this.aiBrain = new AIBrain(this.dataBus);
    this.automation = new AutomationEngine(this.dataBus);
    this.syncBridge = new SyncBridge(this.dataBus);
  }

  /** Start the engine — הפעל את המנוע */
  async start(): Promise<void> {
    if (this.running) {
      Utils.log('warn', 'Engine', 'Engine is already running');
      return;
    }

    Utils.log('info', 'Engine', '🚀 Starting Techno Kol Uzi AI Engine...');

    // 1. Load built-in automation rules
    for (const rule of BUILT_IN_RULES) {
      this.automation.addRule(rule);
    }
    Utils.log('info', 'Engine', `✅ ${BUILT_IN_RULES.length} automation rules loaded`);

    // 2. Register external systems
    this.registerDefaultSyncSystems();
    Utils.log('info', 'Engine', '✅ External systems registered');

    // 3. Start AI analysis
    this.aiBrain.startAnalysis();
    Utils.log('info', 'Engine', '✅ AI Brain analysis started');

    // 4. Emit startup event
    await this.dataBus.emit({
      source: 'analytics:dashboard',
      target: '*',
      type: 'system:healthCheck',
      priority: 'low',
      payload: { status: 'engine_started', version: ENGINE_CONFIG.version },
      tags: ['system'],
    });

    this.running = true;
    Utils.log('info', 'Engine', `
╔══════════════════════════════════════════╗
║   🟢 ENGINE RUNNING — מנוע פעיל          ║
║   Version: ${ENGINE_CONFIG.version}                    ║
║   Modules: ${Object.keys(MODULE_REGISTRY).length} registered               ║
║   Rules: ${BUILT_IN_RULES.length} automation rules            ║
║   AI: 8 analysis engines active          ║
║   Sync: 7 external systems               ║
╚══════════════════════════════════════════╝
    `);
  }

  /** Stop the engine */
  async stop(): Promise<void> {
    this.aiBrain.stopAnalysis();
    for (const system of ['sumit', 'whatsapp', 'google_sheets', 'scala_crm', 'wix'] as ExternalSystem[]) {
      this.syncBridge.stopPeriodicSync(system);
    }
    this.running = false;
    Utils.log('info', 'Engine', '🔴 Engine stopped');
  }

  /** Register default external system configurations */
  private registerDefaultSyncSystems(): void {
    const systems: SyncConfig[] = [
      {
        system: 'sumit',
        enabled: true,
        direction: 'bidirectional',
        intervalMs: 60000,
        auth: { type: 'apiKey', credentials: { apiKey: 'SUMIT_API_KEY', companyId: 'SUMIT_COMPANY_ID' } },
        mappings: [
          { localModule: 'finance:invoices', localField: 'totalAgorot', externalField: 'TotalAmount', transform: 'agorotToShekel' },
          { localModule: 'finance:invoices', localField: 'customerName', externalField: 'CustomerName', transform: 'none' },
        ],
        errorLog: [],
      },
      {
        system: 'whatsapp',
        enabled: true,
        direction: 'push',
        intervalMs: 0,
        auth: { type: 'bearer', credentials: { token: 'WA_BUSINESS_TOKEN', phoneNumberId: 'WA_PHONE_ID' } },
        mappings: [],
        errorLog: [],
      },
      {
        system: 'google_sheets',
        enabled: true,
        direction: 'bidirectional',
        intervalMs: 120000,
        auth: { type: 'oauth2', credentials: { clientId: 'GOOGLE_CLIENT_ID', clientSecret: 'GOOGLE_SECRET', refreshToken: 'GOOGLE_REFRESH_TOKEN' } },
        mappings: [
          { localModule: 'finance:payments', localField: 'amountAgorot', externalField: 'amount', transform: 'agorotToShekel' },
        ],
        errorLog: [],
      },
      {
        system: 'scala_crm',
        enabled: true,
        direction: 'bidirectional',
        intervalMs: 300000,
        auth: { type: 'apiKey', credentials: { apiKey: 'SCALA_API_KEY' } },
        mappings: [
          { localModule: 'crm:leads', localField: 'name', externalField: 'lead_name', transform: 'none' },
          { localModule: 'crm:leads', localField: 'phone', externalField: 'lead_phone', transform: 'none' },
        ],
        errorLog: [],
      },
      {
        system: 'wix',
        enabled: true,
        direction: 'pull',
        intervalMs: 60000,
        auth: { type: 'apiKey', credentials: { apiKey: 'WIX_API_KEY', siteId: 'WIX_SITE_ID' } },
        mappings: [
          { localModule: 'crm:leads', localField: 'source', externalField: 'form_source', transform: 'none' },
        ],
        errorLog: [],
      },
      {
        system: 'n8n',
        enabled: true,
        direction: 'bidirectional',
        intervalMs: 0,
        auth: { type: 'webhook', credentials: { webhookUrl: 'N8N_WEBHOOK_URL' } },
        mappings: [],
        errorLog: [],
      },
      {
        system: 'make_com',
        enabled: true,
        direction: 'bidirectional',
        intervalMs: 0,
        auth: { type: 'webhook', credentials: { webhookUrl: 'MAKE_WEBHOOK_URL' } },
        mappings: [],
        errorLog: [],
      },
    ];

    for (const config of systems) {
      this.syncBridge.registerSystem(config);
    }
  }

  /** Full system health report */
  getHealthReport(): Record<string, any> {
    return {
      engine: {
        running: this.running,
        version: ENGINE_CONFIG.version,
        uptime: 'N/A', // would track actual uptime
      },
      dataBus: this.dataBus.getStats(),
      dataBusHealth: this.dataBus.healthCheck(),
      aiInsights: {
        activeInsights: this.aiBrain.getActiveInsights().length,
        criticalInsights: this.aiBrain.getActiveInsights().filter(i => i.severity === 'critical').length,
      },
      automation: {
        totalRules: this.automation.getRules().length,
        enabledRules: this.automation.getRules().filter(r => r.enabled).length,
        recentExecutions: this.automation.getExecutionLog(10).length,
      },
      sync: this.syncBridge.getSyncStatus(),
    };
  }
}

// ============================================================================
// SECTION 9: MODULE REGISTRY — רישום כל המודולים
// ============================================================================

const MODULE_REGISTRY: Record<string, { id: ModuleId; nameHe: string; category: string; platform: 'bash44' | 'knowdo' | 'both' }> = {
  // CRM
  'crm:customers':    { id: 'crm:customers',    nameHe: 'ניהול לקוחות',        category: 'CRM',        platform: 'both' },
  'crm:leads':        { id: 'crm:leads',        nameHe: 'ניהול לידים',          category: 'CRM',        platform: 'both' },
  'crm:contacts':     { id: 'crm:contacts',     nameHe: 'אנשי קשר',            category: 'CRM',        platform: 'both' },
  'crm:deals':        { id: 'crm:deals',        nameHe: 'עסקאות',              category: 'CRM',        platform: 'both' },
  'crm:pipeline':     { id: 'crm:pipeline',     nameHe: 'צינור מכירות',         category: 'CRM',        platform: 'both' },
  'crm:activities':   { id: 'crm:activities',   nameHe: 'פעילויות',             category: 'CRM',        platform: 'both' },
  'crm:campaigns':    { id: 'crm:campaigns',    nameHe: 'קמפיינים',             category: 'CRM',        platform: 'both' },
  // ERP
  'erp:inventory':    { id: 'erp:inventory',    nameHe: 'מלאי',                category: 'ERP',        platform: 'both' },
  'erp:rawMaterials': { id: 'erp:rawMaterials', nameHe: 'חומרי גלם',           category: 'ERP',        platform: 'both' },
  'erp:suppliers':    { id: 'erp:suppliers',    nameHe: 'ספקים',               category: 'ERP',        platform: 'both' },
  'erp:procurement':  { id: 'erp:procurement',  nameHe: 'רכש',                 category: 'ERP',        platform: 'both' },
  'erp:manufacturing':{ id: 'erp:manufacturing',nameHe: 'ייצור',               category: 'ERP',        platform: 'both' },
  'erp:mrp':          { id: 'erp:mrp',          nameHe: 'תכנון חומרים (MRP)',   category: 'ERP',        platform: 'bash44' },
  'erp:mps':          { id: 'erp:mps',          nameHe: 'תכנון ייצור (MPS)',    category: 'ERP',        platform: 'bash44' },
  'erp:warehouse':    { id: 'erp:warehouse',    nameHe: 'מחסן',                category: 'ERP',        platform: 'both' },
  'erp:importCustoms':{ id: 'erp:importCustoms',nameHe: 'יבוא ומכס',           category: 'ERP',        platform: 'bash44' },
  // Finance
  'finance:invoices': { id: 'finance:invoices', nameHe: 'חשבוניות',             category: 'Finance',    platform: 'both' },
  'finance:quotes':   { id: 'finance:quotes',   nameHe: 'הצעות מחיר',           category: 'Finance',    platform: 'both' },
  'finance:payments': { id: 'finance:payments', nameHe: 'תשלומים',              category: 'Finance',    platform: 'both' },
  'finance:expenses': { id: 'finance:expenses', nameHe: 'הוצאות',               category: 'Finance',    platform: 'both' },
  'finance:billing':  { id: 'finance:billing',  nameHe: 'חיוב לפי שלב',         category: 'Finance',    platform: 'bash44' },
  'finance:tax':      { id: 'finance:tax',      nameHe: 'מיסים ומע"מ',          category: 'Finance',    platform: 'both' },
  // Projects
  'project:projects': { id: 'project:projects', nameHe: 'פרויקטים',             category: 'Projects',   platform: 'both' },
  'project:stages':   { id: 'project:stages',   nameHe: 'שלבי פרויקט',          category: 'Projects',   platform: 'both' },
  'project:tasks':    { id: 'project:tasks',    nameHe: 'משימות',               category: 'Projects',   platform: 'both' },
  'project:timeline': { id: 'project:timeline', nameHe: 'לוח זמנים',            category: 'Projects',   platform: 'both' },
  'project:billing':  { id: 'project:billing',  nameHe: 'חיוב פרויקטים',        category: 'Projects',   platform: 'bash44' },
  // HR
  'hr:employees':     { id: 'hr:employees',     nameHe: 'עובדים',               category: 'HR',         platform: 'both' },
  'hr:attendance':    { id: 'hr:attendance',     nameHe: 'נוכחות',               category: 'HR',         platform: 'knowdo' },
  'hr:payroll':       { id: 'hr:payroll',       nameHe: 'שכר',                  category: 'HR',         platform: 'knowdo' },
  'hr:contractors':   { id: 'hr:contractors',   nameHe: 'קבלנים',               category: 'HR',         platform: 'both' },
  // Operations
  'ops:measurements': { id: 'ops:measurements', nameHe: 'מדידות (עוזי)',         category: 'Operations', platform: 'both' },
  'ops:installation': { id: 'ops:installation', nameHe: 'התקנה',                category: 'Operations', platform: 'both' },
  'ops:delivery':     { id: 'ops:delivery',     nameHe: 'משלוחים',              category: 'Operations', platform: 'both' },
  'ops:quality':      { id: 'ops:quality',      nameHe: 'בקרת איכות',           category: 'Operations', platform: 'both' },
  // Sales
  'sales:orders':     { id: 'sales:orders',     nameHe: 'הזמנות',               category: 'Sales',      platform: 'both' },
  'sales:catalog':    { id: 'sales:catalog',    nameHe: 'קטלוג מוצרים',         category: 'Sales',      platform: 'both' },
  'sales:pricing':    { id: 'sales:pricing',    nameHe: 'תמחור',                category: 'Sales',      platform: 'both' },
  'sales:commissions':{ id: 'sales:commissions',nameHe: 'עמלות',                category: 'Sales',      platform: 'both' },
  // Analytics
  'analytics:kpi':       { id: 'analytics:kpi',       nameHe: 'KPI',               category: 'Analytics',  platform: 'both' },
  'analytics:reports':   { id: 'analytics:reports',   nameHe: 'דוחות',              category: 'Analytics',  platform: 'both' },
  'analytics:dashboard': { id: 'analytics:dashboard', nameHe: 'דשבורד',             category: 'Analytics',  platform: 'both' },
  // External
  'external:sumit':    { id: 'external:sumit',    nameHe: 'SUMIT חשבוניות',      category: 'External',   platform: 'both' },
  'external:whatsapp': { id: 'external:whatsapp', nameHe: 'WhatsApp Business',   category: 'External',   platform: 'both' },
  'external:google':   { id: 'external:google',   nameHe: 'Google (Sheets/Drive)',category: 'External',   platform: 'both' },
  'external:scala':    { id: 'external:scala',    nameHe: 'Scala CRM',           category: 'External',   platform: 'both' },
  'external:wix':      { id: 'external:wix',      nameHe: 'Wix',                 category: 'External',   platform: 'both' },
  'external:n8n':      { id: 'external:n8n',      nameHe: 'N8N',                 category: 'External',   platform: 'both' },
  'external:make':     { id: 'external:make',     nameHe: 'Make.com',            category: 'External',   platform: 'both' },
};

// ============================================================================
// SECTION 10: USAGE EXAMPLES — דוגמאות שימוש
// ============================================================================

/*
 * ========== HOW TO USE — איך להשתמש ==========
 *
 * // 1. Create and start the engine
 * const engine = new TechnoKolUziEngine();
 * await engine.start();
 *
 * // 2. Emit events from any module
 * await engine.dataBus.emit({
 *   source: 'crm:leads',
 *   target: '*',
 *   type: 'lead:newInquiry',
 *   payload: {
 *     id: 'lead_001',
 *     name: 'יוסי כהן',
 *     phone: '+972501234567',
 *     source: 'google_ads',
 *     projectType: 'stairs',
 *     budgetAgorot: 3500000, // 35,000 ₪
 *     urgency: 'high',
 *     address: 'תל אביב',
 *   },
 *   tags: ['lead', 'google_ads'],
 * });
 * // → This automatically triggers:
 * //   - WhatsApp welcome message (Rule 1)
 * //   - Task created for sales team (Rule 1)
 * //   - AI lead scoring (AIBrain)
 * //   - Scala CRM sync (SyncBridge)
 *
 *
 * // 3. Track a payment
 * await engine.dataBus.emit({
 *   source: 'finance:payments',
 *   target: '*',
 *   type: 'payment:received',
 *   payload: {
 *     invoiceId: 'inv_123',
 *     invoiceNumber: '2024-0547',
 *     customerName: 'יוסי כהן',
 *     amountAgorot: 3500000,
 *     amountFormatted: '₪35,000',
 *     date: '2024-03-25',
 *   },
 * });
 * // → This automatically triggers:
 * //   - Invoice updated to "paid" (Rule 7)
 * //   - Row added to Google Sheet (Rule 7)
 * //   - Notification to Kobi (Rule 7)
 * //   - Cash flow AI analysis (AIBrain)
 *
 *
 * // 4. Check AI insights
 * const insights = engine.aiBrain.getActiveInsights();
 * console.log(`Active insights: ${insights.length}`);
 * insights.forEach(i => console.log(`${i.severity}: ${i.titleHe}`));
 *
 *
 * // 5. Add custom automation rule
 * engine.automation.addRule({
 *   id: 'custom_rule_001',
 *   nameHe: 'הזמנה מעל 50,000 → אישור אבא',
 *   description: 'Orders above 50K need father approval',
 *   enabled: true,
 *   priority: 1,
 *   trigger: { eventType: 'order:placed' },
 *   conditions: [
 *     { field: 'totalAgorot', operator: 'gte', value: 5000000 } // 50,000 ₪
 *   ],
 *   actions: [
 *     {
 *       type: 'notify',
 *       config: {
 *         message: '⚠️ הזמנה מעל 50,000₪ מחכה לאישור',
 *         channel: 'whatsapp',
 *         recipients: ['father'],
 *       },
 *       retryOnFail: true,
 *     },
 *   ],
 *   cooldownMs: 0,
 * });
 *
 *
 * // 6. Get system health
 * const health = engine.getHealthReport();
 * console.log(JSON.stringify(health, null, 2));
 *
 *
 * // 7. Stop engine
 * await engine.stop();
 */

// ============================================================================
// EXPORT
// ============================================================================

export {
  TechnoKolUziEngine,
  DataBus,
  AIBrain,
  AutomationEngine,
  SyncBridge,
  Utils,
  ENGINE_CONFIG,
  MODULE_REGISTRY,
  BUILT_IN_RULES,
};

export type {
  DataEvent,
  EventType,
  ModuleId,
  AIInsight,
  InsightCategory,
  AutomationRule,
  AutomationTrigger,
  AutomationCondition,
  AutomationAction,
  SyncConfig,
  ExternalSystem,
  FieldMapping,
  Subscription,
  EventHandler,
};
