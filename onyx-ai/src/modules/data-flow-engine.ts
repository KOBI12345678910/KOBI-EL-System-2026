/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   ONYX DATA FLOW ENGINE                                               ║
 * ║   מנוע זרימת נתונים אוטומטית                                          ║
 * ║                                                                        ║
 * ║   כל נתון שנכנס למערכת → מסווג אוטומטית → זורם לכל מי שצריך אותו     ║
 * ║   אין צורך "לשאוב" נתונים — הנתונים מגיעים אליך                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   DATA FLOW ARCHITECTURE:
 *
 *   נתון נכנס (מכל מקור)
 *        ↓
 *   ┌──────────────────────────┐
 *   │   DATA CLASSIFIER        │  → מזהה סוג: פיננסי? לקוח? פרויקט? קבלן?
 *   │   סיווג אוטומטי          │  → מוסיף tags
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │   DATA ROUTER            │  → בודק מי רשום לקבל את הסוג הזה
 *   │   ניתוב אוטומטי          │  → מפנה לכל הצרכנים הרלוונטיים
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────────────────────────────────┐
 *   │                                                      │
 *   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
 *   │  │ Decision │ │ Finance  │ │ CRM      │ │ Report │ │
 *   │  │ Engine   │ │ Module   │ │ Module   │ │ Engine │ │
 *   │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
 *   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
 *   │  │ Agent    │ │ Alert    │ │ Analytics│ │ Audit  │ │
 *   │  │ Pool     │ │ System   │ │ Engine   │ │ Trail  │ │
 *   │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
 *   │                                                      │
 *   └──────────────────────────────────────────────────────┘
 *
 *   PUSH MODEL — לא PULL:
 *   • הנתונים לא ממתינים שמישהו ישאב אותם
 *   • כל נתון שנכנס מופץ מיידית לכל הצרכנים הרשומים
 *   • כל צרכן מגדיר פילטר — מקבל רק מה שרלוונטי לו
 *   • הכל אסינכרוני עם backpressure
 */


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 0: DATA TYPES — כל סוגי הנתונים במערכת
// ═══════════════════════════════════════════════════════════════════════════

/** קטגוריות נתונים */
type DataCategory =
  | 'project'           // פרויקט חדש/עדכון
  | 'client'            // לקוח
  | 'subcontractor'     // קבלן משנה
  | 'financial'         // כספי — חשבונית, תשלום, הצעת מחיר
  | 'work_order'        // הזמנת עבודה
  | 'measurement'       // מדידה
  | 'material'          // חומרים
  | 'schedule'          // לו"ז
  | 'communication'     // הודעה נכנסת/יוצאת
  | 'document'          // מסמך
  | 'employee'          // עובד
  | 'decision'          // החלטת AI
  | 'alert'             // התראה
  | 'metric'            // מדד ביצוע
  | 'inventory'         // מלאי
  | 'quality'           // בקרת איכות
  | 'task'              // משימה
  | 'crm'               // CRM
  | 'seo'               // SEO / שיווק
  | 'real_estate'       // נדל"ן
  | 'system';           // מערכת

/** תגיות משניות לסיווג מדויק */
type DataTag =
  | 'incoming' | 'outgoing'
  | 'urgent' | 'routine'
  | 'revenue' | 'expense' | 'profit'
  | 'new' | 'update' | 'delete'
  | 'overdue' | 'on_time' | 'delayed'
  | 'approved' | 'pending' | 'rejected'
  | 'high_value' | 'low_value'
  | 'iron' | 'aluminum' | 'steel'
  | 'tel_aviv' | 'holon' | 'tiberias' | 'yehud'
  | string;

/** יחידת נתון — הבסיס של הכל */
interface DataPacket {
  /** מזהה ייחודי */
  id: string;
  /** חותמת זמן */
  timestamp: number;
  /** קטגוריה ראשית */
  category: DataCategory;
  /** תגיות משניות */
  tags: DataTag[];
  /** מקור הנתון */
  source: DataSource;
  /** הנתון עצמו */
  payload: Record<string, unknown>;
  /** מטא-דאטא */
  metadata: {
    /** מזהה קורלציה — לעקיבות */
    correlationId: string;
    /** נתון אב (אם נגזר מנתון אחר) */
    parentId?: string;
    /** עדיפות 1-10 */
    priority: number;
    /** גודל בבתים */
    sizeBytes: number;
    /** TTL — כמה זמן הנתון רלוונטי (ms) */
    ttl?: number;
    /** האם דורש אישור */
    requiresAck: boolean;
    /** גרסה */
    version: number;
  };
  /** מעקב הפצה — לאיזה צרכנים הנתון הגיע */
  distribution: {
    targetConsumers: string[];
    deliveredTo: string[];
    failedDeliveries: string[];
    deliveredAt: Map<string, number>;
  };
}

/** מקור נתון */
interface DataSource {
  type: 'api' | 'webhook' | 'agent' | 'user' | 'system' | 'integration' | 'sensor' | 'schedule';
  id: string;
  name: string;
}

/** פילטר צרכן — מגדיר אילו נתונים הצרכן רוצה לקבל */
interface ConsumerFilter {
  /** קטגוריות שמעניינות */
  categories?: DataCategory[];
  /** תגיות נדרשות (OR) */
  tags?: DataTag[];
  /** תגיות חובה (AND) — כל התגיות חייבות להיות */
  requiredTags?: DataTag[];
  /** תגיות חסומות — אם קיימות, לא לשלוח */
  excludeTags?: DataTag[];
  /** מקורות מסוימים בלבד */
  sources?: string[];
  /** עדיפות מינימלית */
  minPriority?: number;
  /** פילטר מותאם אישית על ה-payload */
  payloadFilter?: (payload: Record<string, unknown>) => boolean;
  /** גודל מקסימלי */
  maxSizeBytes?: number;
}

/** צרכן נתונים — כל מודול/agent/service שרוצה לקבל נתונים */
interface DataConsumer {
  id: string;
  name: string;
  description: string;
  filter: ConsumerFilter;
  handler: (packet: DataPacket) => Promise<void> | void;
  /** מצב */
  active: boolean;
  /** backpressure — מקסימום הודעות בתור */
  maxQueueSize: number;
  /** סטטיסטיקות */
  stats: {
    received: number;
    processed: number;
    failed: number;
    dropped: number;
    lastReceivedAt: number;
    avgProcessingMs: number;
  };
  /** תור פנימי */
  _queue: DataPacket[];
  _processing: boolean;
}

/** כלל טרנספורמציה — משנה נתון לפני הפצה */
interface TransformRule {
  id: string;
  name: string;
  /** על אילו קטגוריות להפעיל */
  appliesTo: DataCategory[];
  /** פונקציית טרנספורמציה */
  transform: (packet: DataPacket) => DataPacket | DataPacket[] | null;
  /** סדר ביצוע */
  order: number;
  active: boolean;
}

/** כלל העשרה — מוסיף מידע לנתון */
interface EnrichmentRule {
  id: string;
  name: string;
  appliesTo: DataCategory[];
  enrich: (packet: DataPacket) => Promise<Record<string, unknown>>;
  order: number;
  active: boolean;
}

/** כלל סיווג — מוסיף קטגוריות ותגיות אוטומטית */
interface ClassificationRule {
  id: string;
  name: string;
  /** תנאי הפעלה */
  condition: (packet: DataPacket) => boolean;
  /** תגיות להוסיף */
  addTags: DataTag[];
  /** קטגוריה לשנות (אופציונלי) */
  overrideCategory?: DataCategory;
  /** עדיפות לשנות */
  overridePriority?: number;
  order: number;
  active: boolean;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: DATA CLASSIFIER — סיווג אוטומטי
// ═══════════════════════════════════════════════════════════════════════════

class DataClassifier {
  private rules: ClassificationRule[] = [];

  constructor() {
    this.loadDefaultRules();
  }

  /** הוסף כלל סיווג */
  addRule(rule: Omit<ClassificationRule, 'id'>): ClassificationRule {
    const full: ClassificationRule = { ...rule, id: `cls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` };
    this.rules.push(full);
    this.rules.sort((a, b) => a.order - b.order);
    return full;
  }

  /** סווג נתון */
  classify(packet: DataPacket): DataPacket {
    const activeRules = this.rules.filter(r => r.active);

    for (const rule of activeRules) {
      try {
        if (rule.condition(packet)) {
          // הוספת תגיות
          for (const tag of rule.addTags) {
            if (!packet.tags.includes(tag)) {
              packet.tags.push(tag);
            }
          }
          // שינוי קטגוריה
          if (rule.overrideCategory) {
            packet.category = rule.overrideCategory;
          }
          // שינוי עדיפות
          if (rule.overridePriority !== undefined) {
            packet.metadata.priority = rule.overridePriority;
          }
        }
      } catch (err) {
        console.error(`[Classifier] Rule ${rule.name} failed:`, err);
      }
    }

    return packet;
  }

  /** כללי סיווג מובנים */
  private loadDefaultRules(): void {
    // נתון פיננסי גבוה
    this.addRule({
      name: 'high_value_financial',
      condition: (p) => p.category === 'financial' && (p.payload.amount as number ?? 0) > 50000,
      addTags: ['high_value', 'urgent'],
      overridePriority: 9,
      order: 1,
      active: true,
    });

    // פרויקט חדש
    this.addRule({
      name: 'new_project',
      condition: (p) => p.category === 'project' && p.tags.includes('new'),
      addTags: ['urgent'],
      overridePriority: 8,
      order: 2,
      active: true,
    });

    // הזמנת עבודה → דורשת אישור
    this.addRule({
      name: 'work_order_approval',
      condition: (p) => p.category === 'work_order' && (p.payload.totalWithVat as number ?? 0) > 10000,
      addTags: ['pending'],
      order: 3,
      active: true,
    });

    // התראה דחופה
    this.addRule({
      name: 'urgent_alert',
      condition: (p) => p.category === 'alert' && (p.payload.severity === 'critical' || p.payload.severity === 'error'),
      addTags: ['urgent'],
      overridePriority: 10,
      order: 0,
      active: true,
    });

    // תקשורת נכנסת
    this.addRule({
      name: 'incoming_communication',
      condition: (p) => p.category === 'communication' && p.source.type === 'webhook',
      addTags: ['incoming'],
      order: 5,
      active: true,
    });

    // סיווג לפי סכום
    this.addRule({
      name: 'expense_classification',
      condition: (p) => p.category === 'financial' && (p.payload.amount as number ?? 0) < 0,
      addTags: ['expense'],
      order: 4,
      active: true,
    });

    this.addRule({
      name: 'revenue_classification',
      condition: (p) => p.category === 'financial' && (p.payload.amount as number ?? 0) > 0,
      addTags: ['revenue'],
      order: 4,
      active: true,
    });

    // איחור בפרויקט
    this.addRule({
      name: 'overdue_detection',
      condition: (p) => {
        if (p.category !== 'project' && p.category !== 'task') return false;
        const deadline = p.payload.deadline as string;
        if (!deadline) return false;
        return new Date(deadline).getTime() < Date.now();
      },
      addTags: ['overdue', 'urgent'],
      overridePriority: 9,
      order: 1,
      active: true,
    });

    // מדידה → קושר לפרויקט
    this.addRule({
      name: 'measurement_link',
      condition: (p) => p.category === 'measurement' && !!p.payload.projectId,
      addTags: ['update'],
      order: 6,
      active: true,
    });

    // חומר ברזל / אלומיניום
    this.addRule({
      name: 'material_type_iron',
      condition: (p) => {
        const text = JSON.stringify(p.payload).toLowerCase();
        return text.includes('ברזל') || text.includes('iron') || text.includes('פלדה') || text.includes('steel');
      },
      addTags: ['iron'],
      order: 10,
      active: true,
    });

    this.addRule({
      name: 'material_type_aluminum',
      condition: (p) => {
        const text = JSON.stringify(p.payload).toLowerCase();
        return text.includes('אלומיניום') || text.includes('aluminum');
      },
      addTags: ['aluminum'],
      order: 10,
      active: true,
    });
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: DATA ROUTER — ניתוב אוטומטי לצרכנים
// ═══════════════════════════════════════════════════════════════════════════

class DataRouter {
  private consumers: Map<string, DataConsumer> = new Map();

  /** רשום צרכן */
  registerConsumer(params: {
    id: string;
    name: string;
    description: string;
    filter: ConsumerFilter;
    handler: (packet: DataPacket) => Promise<void> | void;
    maxQueueSize?: number;
  }): DataConsumer {
    const consumer: DataConsumer = {
      id: params.id,
      name: params.name,
      description: params.description,
      filter: params.filter,
      handler: params.handler,
      active: true,
      maxQueueSize: params.maxQueueSize ?? 1000,
      stats: { received: 0, processed: 0, failed: 0, dropped: 0, lastReceivedAt: 0, avgProcessingMs: 0 },
      _queue: [],
      _processing: false,
    };
    this.consumers.set(params.id, consumer);
    return consumer;
  }

  /** הסר צרכן */
  removeConsumer(id: string): void {
    this.consumers.delete(id);
  }

  /** השהה/הפעל צרכן */
  setConsumerActive(id: string, active: boolean): void {
    const c = this.consumers.get(id);
    if (c) c.active = active;
  }

  /** נתב נתון לכל הצרכנים הרלוונטיים */
  async route(packet: DataPacket): Promise<{
    targetCount: number;
    deliveredCount: number;
    failedCount: number;
    droppedCount: number;
    targets: string[];
  }> {
    const matchingConsumers = this.findMatchingConsumers(packet);
    packet.distribution.targetConsumers = matchingConsumers.map(c => c.id);

    let delivered = 0;
    let failed = 0;
    let dropped = 0;

    const deliveryPromises = matchingConsumers.map(async (consumer) => {
      // Backpressure check
      if (consumer._queue.length >= consumer.maxQueueSize) {
        consumer.stats.dropped++;
        dropped++;
        return;
      }

      try {
        consumer.stats.received++;
        consumer.stats.lastReceivedAt = Date.now();

        const startTime = Date.now();
        await consumer.handler(packet);
        const duration = Date.now() - startTime;

        consumer.stats.processed++;
        consumer.stats.avgProcessingMs =
          (consumer.stats.avgProcessingMs * (consumer.stats.processed - 1) + duration) / consumer.stats.processed;

        packet.distribution.deliveredTo.push(consumer.id);
        packet.distribution.deliveredAt.set(consumer.id, Date.now());
        delivered++;
      } catch (err) {
        consumer.stats.failed++;
        packet.distribution.failedDeliveries.push(consumer.id);
        failed++;
        console.error(`[Router] Delivery to ${consumer.name} failed:`, err);
      }
    });

    await Promise.allSettled(deliveryPromises);

    return {
      targetCount: matchingConsumers.length,
      deliveredCount: delivered,
      failedCount: failed,
      droppedCount: dropped,
      targets: matchingConsumers.map(c => c.name),
    };
  }

  /** מצא צרכנים מתאימים */
  private findMatchingConsumers(packet: DataPacket): DataConsumer[] {
    return Array.from(this.consumers.values()).filter(consumer => {
      if (!consumer.active) return false;
      return this.matchesFilter(packet, consumer.filter);
    });
  }

  /** בדוק התאמה לפילטר */
  private matchesFilter(packet: DataPacket, filter: ConsumerFilter): boolean {
    // קטגוריות
    if (filter.categories && filter.categories.length > 0) {
      if (!filter.categories.includes(packet.category)) return false;
    }

    // תגיות (OR)
    if (filter.tags && filter.tags.length > 0) {
      if (!filter.tags.some(tag => packet.tags.includes(tag))) return false;
    }

    // תגיות חובה (AND)
    if (filter.requiredTags && filter.requiredTags.length > 0) {
      if (!filter.requiredTags.every(tag => packet.tags.includes(tag))) return false;
    }

    // תגיות חסומות
    if (filter.excludeTags && filter.excludeTags.length > 0) {
      if (filter.excludeTags.some(tag => packet.tags.includes(tag))) return false;
    }

    // מקורות
    if (filter.sources && filter.sources.length > 0) {
      if (!filter.sources.includes(packet.source.id) && !filter.sources.includes(packet.source.type)) return false;
    }

    // עדיפות מינימלית
    if (filter.minPriority !== undefined) {
      if (packet.metadata.priority < filter.minPriority) return false;
    }

    // גודל
    if (filter.maxSizeBytes !== undefined) {
      if (packet.metadata.sizeBytes > filter.maxSizeBytes) return false;
    }

    // פילטר מותאם אישית
    if (filter.payloadFilter) {
      try {
        if (!filter.payloadFilter(packet.payload)) return false;
      } catch { return false; }
    }

    return true;
  }

  /** סטטיסטיקות צרכנים */
  getConsumerStats(): Array<{
    id: string; name: string; active: boolean; stats: DataConsumer['stats']; queueSize: number;
  }> {
    return Array.from(this.consumers.values()).map(c => ({
      id: c.id, name: c.name, active: c.active, stats: { ...c.stats }, queueSize: c._queue.length,
    }));
  }

  getConsumer(id: string): DataConsumer | undefined {
    return this.consumers.get(id);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: DATA PIPELINE — צינור עיבוד ראשי
// ═══════════════════════════════════════════════════════════════════════════

class DataPipeline {
  private transformRules: TransformRule[] = [];
  private enrichmentRules: EnrichmentRule[] = [];

  /** הוסף כלל טרנספורמציה */
  addTransform(rule: Omit<TransformRule, 'id'>): TransformRule {
    const full: TransformRule = { ...rule, id: `trn_${Date.now().toString(36)}` };
    this.transformRules.push(full);
    this.transformRules.sort((a, b) => a.order - b.order);
    return full;
  }

  /** הוסף כלל העשרה */
  addEnrichment(rule: Omit<EnrichmentRule, 'id'>): EnrichmentRule {
    const full: EnrichmentRule = { ...rule, id: `enr_${Date.now().toString(36)}` };
    this.enrichmentRules.push(full);
    this.enrichmentRules.sort((a, b) => a.order - b.order);
    return full;
  }

  /** עבד נתון דרך כל הצינור */
  async process(packet: DataPacket): Promise<DataPacket[]> {
    let packets: DataPacket[] = [packet];

    // שלב 1: טרנספורמציות
    for (const rule of this.transformRules.filter(r => r.active)) {
      const newPackets: DataPacket[] = [];
      for (const p of packets) {
        if (!rule.appliesTo.includes(p.category)) {
          newPackets.push(p);
          continue;
        }
        try {
          const result = rule.transform(p);
          if (result === null) continue; // נתון סונן
          if (Array.isArray(result)) newPackets.push(...result);
          else newPackets.push(result);
        } catch (err) {
          console.error(`[Pipeline] Transform ${rule.name} failed:`, err);
          newPackets.push(p); // במקרה של שגיאה, מעביר את הנתון המקורי
        }
      }
      packets = newPackets;
    }

    // שלב 2: העשרה
    for (const rule of this.enrichmentRules.filter(r => r.active)) {
      for (const p of packets) {
        if (!rule.appliesTo.includes(p.category)) continue;
        try {
          const enrichment = await rule.enrich(p);
          p.payload = { ...p.payload, ...enrichment };
        } catch (err) {
          console.error(`[Pipeline] Enrichment ${rule.name} failed:`, err);
        }
      }
    }

    return packets;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: DATA FLOW ENGINE — המנוע המרכזי
// ═══════════════════════════════════════════════════════════════════════════

interface DataFlowStats {
  totalPacketsIngested: number;
  totalPacketsRouted: number;
  totalDeliveries: number;
  totalFailedDeliveries: number;
  totalDropped: number;
  avgRoutingTimeMs: number;
  packetsPerMinute: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  startedAt: number;
}

class DataFlowEngine {
  readonly classifier: DataClassifier;
  readonly router: DataRouter;
  readonly pipeline: DataPipeline;
  private stats: DataFlowStats;
  private recentPackets: DataPacket[] = [];
  private maxRecentPackets = 10000;
  private eventLog: Array<{ timestamp: number; type: string; packetId: string; detail: string }> = [];

  constructor() {
    this.classifier = new DataClassifier();
    this.router = new DataRouter();
    this.pipeline = new DataPipeline();
    this.stats = {
      totalPacketsIngested: 0,
      totalPacketsRouted: 0,
      totalDeliveries: 0,
      totalFailedDeliveries: 0,
      totalDropped: 0,
      avgRoutingTimeMs: 0,
      packetsPerMinute: 0,
      byCategory: {},
      bySource: {},
      startedAt: Date.now(),
    };
  }

  // ─── הזנת נתון למערכת — נקודת הכניסה היחידה ─────────────────────

  async ingest(params: {
    category: DataCategory;
    payload: Record<string, unknown>;
    source?: Partial<DataSource>;
    tags?: DataTag[];
    priority?: number;
    correlationId?: string;
    parentId?: string;
    ttl?: number;
    requiresAck?: boolean;
  }): Promise<{
    packetId: string;
    routingResult: { targetCount: number; deliveredCount: number; failedCount: number; targets: string[] };
  }> {
    const startTime = Date.now();

    // יצירת DataPacket
    const packet: DataPacket = {
      id: `dp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      category: params.category,
      tags: params.tags ?? [],
      source: {
        type: params.source?.type ?? 'system',
        id: params.source?.id ?? 'unknown',
        name: params.source?.name ?? 'Unknown Source',
      },
      payload: { ...params.payload },
      metadata: {
        correlationId: params.correlationId ?? `cor_${Date.now().toString(36)}`,
        parentId: params.parentId,
        priority: params.priority ?? 5,
        sizeBytes: JSON.stringify(params.payload).length,
        ttl: params.ttl,
        requiresAck: params.requiresAck ?? false,
        version: 1,
      },
      distribution: {
        targetConsumers: [],
        deliveredTo: [],
        failedDeliveries: [],
        deliveredAt: new Map(),
      },
    };

    // שלב 1: סיווג אוטומטי
    this.classifier.classify(packet);

    // שלב 2: עיבוד בצינור (טרנספורמציה + העשרה)
    const processedPackets = await this.pipeline.process(packet);

    // שלב 3: ניתוב לכל הצרכנים
    let totalRouting = { targetCount: 0, deliveredCount: 0, failedCount: 0, droppedCount: 0, targets: [] as string[] };

    for (const processed of processedPackets) {
      const result = await this.router.route(processed);
      totalRouting.targetCount += result.targetCount;
      totalRouting.deliveredCount += result.deliveredCount;
      totalRouting.failedCount += result.failedCount;
      totalRouting.droppedCount += result.droppedCount;
      totalRouting.targets.push(...result.targets);

      // שמירה ברשימה אחרונה
      this.recentPackets.push(processed);
      if (this.recentPackets.length > this.maxRecentPackets) {
        this.recentPackets = this.recentPackets.slice(-this.maxRecentPackets);
      }
    }

    // עדכון סטטיסטיקות
    const routingTime = Date.now() - startTime;
    this.stats.totalPacketsIngested++;
    this.stats.totalPacketsRouted += processedPackets.length;
    this.stats.totalDeliveries += totalRouting.deliveredCount;
    this.stats.totalFailedDeliveries += totalRouting.failedCount;
    this.stats.totalDropped += totalRouting.droppedCount;
    this.stats.avgRoutingTimeMs = (this.stats.avgRoutingTimeMs * (this.stats.totalPacketsIngested - 1) + routingTime) / this.stats.totalPacketsIngested;
    this.stats.byCategory[packet.category] = (this.stats.byCategory[packet.category] ?? 0) + 1;
    this.stats.bySource[packet.source.name] = (this.stats.bySource[packet.source.name] ?? 0) + 1;

    const elapsedMinutes = (Date.now() - this.stats.startedAt) / 60000;
    this.stats.packetsPerMinute = elapsedMinutes > 0 ? Math.round(this.stats.totalPacketsIngested / elapsedMinutes * 10) / 10 : 0;

    // לוג
    this.eventLog.push({
      timestamp: Date.now(),
      type: 'ingested',
      packetId: packet.id,
      detail: `${packet.category} → ${totalRouting.deliveredCount}/${totalRouting.targetCount} consumers (${routingTime}ms)`,
    });

    return {
      packetId: packet.id,
      routingResult: {
        targetCount: totalRouting.targetCount,
        deliveredCount: totalRouting.deliveredCount,
        failedCount: totalRouting.failedCount,
        targets: [...new Set(totalRouting.targets)],
      },
    };
  }


  // ─── קיצורי דרך להזנה ─────────────────────────────────────────────

  /** פרויקט חדש */
  async ingestProject(project: Record<string, unknown>, source?: string): Promise<string> {
    const result = await this.ingest({
      category: 'project',
      payload: project,
      tags: [project.status === 'new' ? 'new' : 'update'],
      source: { type: 'user', name: source ?? 'ProjectManager' },
      priority: 8,
    });
    return result.packetId;
  }

  /** נתון פיננסי */
  async ingestFinancial(data: Record<string, unknown>, source?: string): Promise<string> {
    const result = await this.ingest({
      category: 'financial',
      payload: data,
      source: { type: 'system', name: source ?? 'FinanceModule' },
      priority: 7,
    });
    return result.packetId;
  }

  /** לקוח */
  async ingestClient(client: Record<string, unknown>, source?: string): Promise<string> {
    const result = await this.ingest({
      category: 'client',
      payload: client,
      tags: ['new'],
      source: { type: 'user', name: source ?? 'CRM' },
    });
    return result.packetId;
  }

  /** קבלן משנה */
  async ingestSubcontractor(data: Record<string, unknown>, source?: string): Promise<string> {
    const result = await this.ingest({
      category: 'subcontractor',
      payload: data,
      source: { type: 'system', name: source ?? 'SubcontractorEngine' },
    });
    return result.packetId;
  }

  /** הודעה נכנסת */
  async ingestMessage(message: Record<string, unknown>, source?: string): Promise<string> {
    const result = await this.ingest({
      category: 'communication',
      payload: message,
      tags: ['incoming'],
      source: { type: 'webhook', name: source ?? 'WhatsApp' },
      priority: 6,
    });
    return result.packetId;
  }

  /** החלטת AI */
  async ingestDecision(decision: Record<string, unknown>): Promise<string> {
    const result = await this.ingest({
      category: 'decision',
      payload: decision,
      source: { type: 'agent', name: 'DecisionEngine' },
      priority: 8,
    });
    return result.packetId;
  }

  /** מדידה */
  async ingestMeasurement(measurement: Record<string, unknown>, source?: string): Promise<string> {
    const result = await this.ingest({
      category: 'measurement',
      payload: measurement,
      source: { type: 'user', name: source ?? 'Ozi' },
    });
    return result.packetId;
  }

  /** התראה */
  async ingestAlert(alert: Record<string, unknown>): Promise<string> {
    const result = await this.ingest({
      category: 'alert',
      payload: alert,
      priority: (alert.severity === 'critical' ? 10 : alert.severity === 'error' ? 9 : 7),
      source: { type: 'system', name: 'AlertSystem' },
    });
    return result.packetId;
  }


  // ─── רישום צרכנים מובנים ──────────────────────────────────────────

  /** רשום את כל הצרכנים המובנים של ONYX */
  registerDefaultConsumers(): void {
    // מנוע החלטות קבלנים — מקבל פרויקטים חדשים + מדידות
    this.router.registerConsumer({
      id: 'consumer:decision_engine',
      name: 'Decision Engine (קבלנים)',
      description: 'מקבל פרויקטים ומדידות כדי לחשב הקצאת קבלנים',
      filter: {
        categories: ['project', 'measurement', 'subcontractor', 'work_order'],
        tags: ['new', 'update'],
      },
      handler: async (packet) => {
        console.log(`[DecisionEngine] 📥 קיבל ${packet.category}: ${packet.payload.name ?? packet.id}`);
      },
    });

    // מודול פיננסי — מקבל כל נתון כספי + הזמנות עבודה
    this.router.registerConsumer({
      id: 'consumer:finance',
      name: 'Finance Module',
      description: 'מעקב הכנסות, הוצאות, תשלומים',
      filter: {
        categories: ['financial', 'work_order', 'decision'],
        payloadFilter: (p) => p.amount !== undefined || p.agreedPrice !== undefined || p.totalWithVat !== undefined,
      },
      handler: async (packet) => {
        console.log(`[Finance] 💰 קיבל ${packet.category}: ₪${packet.payload.amount ?? packet.payload.agreedPrice ?? '?'}`);
      },
    });

    // CRM — מקבל לקוחות + תקשורת
    this.router.registerConsumer({
      id: 'consumer:crm',
      name: 'CRM Module',
      description: 'ניהול לקוחות ותקשורת',
      filter: {
        categories: ['client', 'communication', 'crm'],
      },
      handler: async (packet) => {
        console.log(`[CRM] 👥 קיבל ${packet.category}: ${packet.payload.name ?? packet.payload.from ?? packet.id}`);
      },
    });

    // מערכת התראות — מקבל רק דחוף
    this.router.registerConsumer({
      id: 'consumer:alerts',
      name: 'Alert System',
      description: 'מקבל התראות דחופות ומעביר ל-WhatsApp/SMS',
      filter: {
        categories: ['alert'],
        minPriority: 7,
      },
      handler: async (packet) => {
        console.log(`[Alert] 🚨 ${packet.payload.severity}: ${packet.payload.message}`);
      },
    });

    // אנליטיקס — מקבל הכל
    this.router.registerConsumer({
      id: 'consumer:analytics',
      name: 'Analytics Engine',
      description: 'אוסף כל נתון לדשבורד ודוחות',
      filter: {}, // בלי פילטר = מקבל הכל
      handler: async (packet) => {
        // שקט — רק אוסף
      },
    });

    // Audit Trail — מקבל הכל, שומר לצמיתות
    this.router.registerConsumer({
      id: 'consumer:audit',
      name: 'Audit Trail',
      description: 'תיעוד מלא לכל נתון שנכנס למערכת',
      filter: {},
      handler: async (packet) => {
        // שומר ל-EventStore / קובץ
      },
    });

    // לו"ז — מקבל פרויקטים + משימות + לוחות זמנים
    this.router.registerConsumer({
      id: 'consumer:scheduler',
      name: 'Scheduler',
      description: 'ניהול לוחות זמנים ודדליינים',
      filter: {
        categories: ['project', 'task', 'schedule', 'work_order'],
      },
      handler: async (packet) => {
        console.log(`[Scheduler] 📅 קיבל ${packet.category}: ${packet.payload.name ?? packet.payload.deadline ?? ''}`);
      },
    });

    // מלאי — מקבל חומרים + הזמנות עבודה (כדי לחשב צורך בחומרים)
    this.router.registerConsumer({
      id: 'consumer:inventory',
      name: 'Inventory Module',
      description: 'מעקב מלאי חומרים',
      filter: {
        categories: ['material', 'inventory', 'work_order'],
      },
      handler: async (packet) => {
        console.log(`[Inventory] 📦 קיבל ${packet.category}`);
      },
    });

    // SEO / שיווק
    this.router.registerConsumer({
      id: 'consumer:seo',
      name: 'SEO & Marketing',
      description: 'תוכן שיווקי ו-SEO',
      filter: {
        categories: ['seo', 'client', 'real_estate'],
      },
      handler: async (packet) => {
        console.log(`[SEO] 🎯 קיבל ${packet.category}`);
      },
    });

    // נדל"ן
    this.router.registerConsumer({
      id: 'consumer:real_estate',
      name: 'Real Estate Module',
      description: 'ניהול נכסי נדל"ן',
      filter: {
        categories: ['real_estate', 'financial', 'document'],
        payloadFilter: (p) => !!p.propertyId || !!p.address || (p as any).type === 'appraisal',
      },
      handler: async (packet) => {
        console.log(`[RealEstate] 🏢 קיבל ${packet.category}: ${packet.payload.address ?? ''}`);
      },
    });

    // בקרת איכות
    this.router.registerConsumer({
      id: 'consumer:quality',
      name: 'Quality Control',
      description: 'בקרת איכות על עבודות קבלנים',
      filter: {
        categories: ['quality', 'measurement', 'work_order'],
        tags: ['completed'],
      },
      handler: async (packet) => {
        console.log(`[Quality] ✅ קיבל ${packet.category}`);
      },
    });

    // AI Agents — מקבל משימות + החלטות
    this.router.registerConsumer({
      id: 'consumer:agents',
      name: 'AI Agent Pool',
      description: 'סוכני AI שמבצעים משימות',
      filter: {
        categories: ['task', 'decision'],
        minPriority: 5,
      },
      handler: async (packet) => {
        console.log(`[Agents] 🤖 קיבל ${packet.category}: ${packet.payload.title ?? packet.id}`);
      },
    });

    console.log(`\n✅ נרשמו ${this.router.getConsumerStats().length} צרכנים מובנים\n`);
  }


  // ─── סטטיסטיקות ודוחות ─────────────────────────────────────────────

  getStats(): DataFlowStats {
    return { ...this.stats };
  }

  getConsumerStats() {
    return this.router.getConsumerStats();
  }

  getRecentPackets(limit: number = 50, category?: DataCategory): DataPacket[] {
    let packets = this.recentPackets;
    if (category) packets = packets.filter(p => p.category === category);
    return packets.slice(-limit);
  }

  getEventLog(limit: number = 100) {
    return this.eventLog.slice(-limit);
  }

  /** דוח זרימת נתונים מלא */
  flowReport(): void {
    const stats = this.getStats();
    const consumers = this.getConsumerStats();

    console.log('\n═══════════════════════════════════════');
    console.log('📊 דוח זרימת נתונים — ONYX Data Flow');
    console.log('═══════════════════════════════════════');
    console.log(`נתונים שנכנסו: ${stats.totalPacketsIngested}`);
    console.log(`נתונים שנותבו: ${stats.totalPacketsRouted}`);
    console.log(`משלוחים מוצלחים: ${stats.totalDeliveries}`);
    console.log(`משלוחים שנכשלו: ${stats.totalFailedDeliveries}`);
    console.log(`נתונים שנשמטו (backpressure): ${stats.totalDropped}`);
    console.log(`זמן ניתוב ממוצע: ${stats.avgRoutingTimeMs.toFixed(1)}ms`);
    console.log(`קצב: ${stats.packetsPerMinute} נתונים/דקה`);

    console.log('\nלפי קטגוריה:');
    for (const [cat, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat}: ${count}`);
    }

    console.log('\nצרכנים:');
    for (const c of consumers) {
      const successRate = c.stats.processed + c.stats.failed > 0
        ? Math.round(c.stats.processed / (c.stats.processed + c.stats.failed) * 100)
        : 100;
      console.log(`  ${c.active ? '🟢' : '⚪'} ${c.name}: ${c.stats.processed} processed | ${c.stats.failed} failed | ${successRate}% success | ${c.stats.avgProcessingMs.toFixed(1)}ms avg`);
    }
    console.log('═══════════════════════════════════════\n');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  DataFlowEngine,
  DataClassifier,
  DataRouter,
  DataPipeline,
};

export type {
  DataPacket,
  DataCategory,
  DataTag,
  DataSource,
  DataConsumer,
  ConsumerFilter,
  TransformRule,
  EnrichmentRule,
  ClassificationRule,
  DataFlowStats,
};


// ═══════════════════════════════════════════════════════════════════════════
// דוגמת שימוש מלאה
// ═══════════════════════════════════════════════════════════════════════════
//
// const flow = new DataFlowEngine();
//
// // רישום כל הצרכנים המובנים
// flow.registerDefaultConsumers();
//
// // אפשר להוסיף צרכן מותאם
// flow.router.registerConsumer({
//   id: 'consumer:kobi_whatsapp',
//   name: 'Kobi Notifications',
//   description: 'שולח לקובי התראות על דברים דחופים',
//   filter: {
//     tags: ['urgent'],
//     minPriority: 8,
//   },
//   handler: async (packet) => {
//     // כאן מחברים ל-whatsapp.send_text דרך ONYX
//     console.log(`📱 → קובי: ${packet.category} דחוף!`);
//   },
// });
//
// // הזנת פרויקט חדש → זורם אוטומטית ל:
// // DecisionEngine, Finance, Scheduler, Analytics, Audit, Agents
// await flow.ingestProject({
//   name: 'מעקות בניין מגורים',
//   client: 'חברת כנען',
//   totalValue: 120000,
//   areaSqm: 280,
//   workType: 'מעקות_ברזל',
//   deadline: '2026-06-15',
//   status: 'new',
// });
//
// // הזנת תשלום → זורם ל: Finance, Analytics, Audit
// await flow.ingestFinancial({
//   type: 'payment_received',
//   client: 'חברת כנען',
//   amount: 50000,
//   projectId: 'proj_123',
// });
//
// // הזנת הודעת WhatsApp נכנסת → זורם ל: CRM, Analytics, Audit
// await flow.ingestMessage({
//   from: '+972501234567',
//   name: 'משה קבלן',
//   text: 'סיימתי את ההתקנה בקומה 3',
//   platform: 'whatsapp',
// });
//
// // הזנת התראה דחופה → זורם ל: Alerts, Kobi WhatsApp, Analytics, Audit
// await flow.ingestAlert({
//   severity: 'critical',
//   message: 'קבלן דוד לא הגיע לאתר — איחור של 3 שעות',
//   projectId: 'proj_456',
// });
//
// // דוח
// flow.flowReport();
