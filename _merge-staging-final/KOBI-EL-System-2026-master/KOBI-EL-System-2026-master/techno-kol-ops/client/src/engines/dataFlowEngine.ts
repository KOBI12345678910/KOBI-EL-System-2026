/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   ONYX DATA FLOW ENGINE — Client-Side                                 ║
 * ║   מנוע זרימת נתונים אוטומטית                                          ║
 * ║                                                                        ║
 * ║   כל נתון שנכנס למערכת → מסווג אוטומטית → זורם לכל מי שצריך אותו     ║
 * ║   PUSH MODEL: הנתונים זורמים אליך — אין צורך "לשאוב"                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DataCategory =
  | 'project'
  | 'client'
  | 'subcontractor'
  | 'financial'
  | 'work_order'
  | 'measurement'
  | 'material'
  | 'schedule'
  | 'communication'
  | 'document'
  | 'employee'
  | 'decision'
  | 'alert'
  | 'metric'
  | 'inventory'
  | 'quality'
  | 'task'
  | 'crm'
  | 'seo'
  | 'real_estate'
  | 'system';

export type DataTag =
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

export interface DataSource {
  type: 'api' | 'webhook' | 'agent' | 'user' | 'system' | 'integration' | 'sensor' | 'schedule';
  id: string;
  name: string;
}

export interface DataPacket {
  id: string;
  timestamp: number;
  category: DataCategory;
  tags: DataTag[];
  source: DataSource;
  payload: Record<string, unknown>;
  metadata: {
    correlationId: string;
    parentId?: string;
    priority: number;
    sizeBytes: number;
    ttl?: number;
    requiresAck: boolean;
    version: number;
  };
  distribution: {
    targetConsumers: string[];
    deliveredTo: string[];
    failedDeliveries: string[];
    deliveredAt: Record<string, number>;
  };
}

export interface ConsumerFilter {
  categories?: DataCategory[];
  tags?: DataTag[];
  requiredTags?: DataTag[];
  excludeTags?: DataTag[];
  sources?: string[];
  minPriority?: number;
  payloadFilter?: (payload: Record<string, unknown>) => boolean;
  maxSizeBytes?: number;
}

export interface DataConsumer {
  id: string;
  name: string;
  description: string;
  filter: ConsumerFilter;
  handler: (packet: DataPacket) => Promise<void> | void;
  active: boolean;
  maxQueueSize: number;
  stats: {
    received: number;
    processed: number;
    failed: number;
    dropped: number;
    lastReceivedAt: number;
    avgProcessingMs: number;
  };
  _queue: DataPacket[];
  _processing: boolean;
}

export interface ClassificationRule {
  id: string;
  name: string;
  condition: (packet: DataPacket) => boolean;
  addTags: DataTag[];
  overrideCategory?: DataCategory;
  overridePriority?: number;
  order: number;
  active: boolean;
}

export interface DataFlowStats {
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


// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFIER — סיווג אוטומטי
// ═══════════════════════════════════════════════════════════════════════════

class DataClassifier {
  private rules: ClassificationRule[] = [];

  constructor() {
    this.loadDefaultRules();
  }

  addRule(rule: Omit<ClassificationRule, 'id'>): ClassificationRule {
    const full: ClassificationRule = {
      ...rule,
      id: `cls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    };
    this.rules.push(full);
    this.rules.sort((a, b) => a.order - b.order);
    return full;
  }

  classify(packet: DataPacket): DataPacket {
    for (const rule of this.rules.filter(r => r.active)) {
      try {
        if (rule.condition(packet)) {
          for (const tag of rule.addTags) {
            if (!packet.tags.includes(tag)) packet.tags.push(tag);
          }
          if (rule.overrideCategory) packet.category = rule.overrideCategory;
          if (rule.overridePriority !== undefined) packet.metadata.priority = rule.overridePriority;
        }
      } catch (err) {
        console.error(`[Classifier] Rule ${rule.name} failed:`, err);
      }
    }
    return packet;
  }

  private loadDefaultRules(): void {
    this.addRule({
      name: 'high_value_financial',
      condition: (p) => p.category === 'financial' && ((p.payload.amount as number) ?? 0) > 50000,
      addTags: ['high_value', 'urgent'],
      overridePriority: 9,
      order: 1,
      active: true,
    });
    this.addRule({
      name: 'new_project',
      condition: (p) => p.category === 'project' && p.tags.includes('new'),
      addTags: ['urgent'],
      overridePriority: 8,
      order: 2,
      active: true,
    });
    this.addRule({
      name: 'urgent_alert',
      condition: (p) => p.category === 'alert' && (p.payload.severity === 'critical' || p.payload.severity === 'error'),
      addTags: ['urgent'],
      overridePriority: 10,
      order: 0,
      active: true,
    });
    this.addRule({
      name: 'incoming_communication',
      condition: (p) => p.category === 'communication' && p.source.type === 'webhook',
      addTags: ['incoming'],
      order: 5,
      active: true,
    });
    this.addRule({
      name: 'expense_classification',
      condition: (p) => p.category === 'financial' && ((p.payload.amount as number) ?? 0) < 0,
      addTags: ['expense'],
      order: 4,
      active: true,
    });
    this.addRule({
      name: 'revenue_classification',
      condition: (p) => p.category === 'financial' && ((p.payload.amount as number) ?? 0) > 0,
      addTags: ['revenue'],
      order: 4,
      active: true,
    });
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
// ROUTER — ניתוב אוטומטי
// ═══════════════════════════════════════════════════════════════════════════

class DataRouter {
  private consumers: Map<string, DataConsumer> = new Map();

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

  removeConsumer(id: string): void {
    this.consumers.delete(id);
  }

  setConsumerActive(id: string, active: boolean): void {
    const c = this.consumers.get(id);
    if (c) c.active = active;
  }

  async route(packet: DataPacket): Promise<{
    targetCount: number;
    deliveredCount: number;
    failedCount: number;
    droppedCount: number;
    targets: string[];
  }> {
    const matching = this.findMatchingConsumers(packet);
    packet.distribution.targetConsumers = matching.map(c => c.id);

    let delivered = 0, failed = 0, dropped = 0;
    await Promise.allSettled(matching.map(async (consumer) => {
      if (consumer._queue.length >= consumer.maxQueueSize) {
        consumer.stats.dropped++;
        dropped++;
        return;
      }
      try {
        consumer.stats.received++;
        consumer.stats.lastReceivedAt = Date.now();
        const start = Date.now();
        await consumer.handler(packet);
        const duration = Date.now() - start;
        consumer.stats.processed++;
        consumer.stats.avgProcessingMs =
          (consumer.stats.avgProcessingMs * (consumer.stats.processed - 1) + duration) / consumer.stats.processed;
        packet.distribution.deliveredTo.push(consumer.id);
        packet.distribution.deliveredAt[consumer.id] = Date.now();
        delivered++;
      } catch (err) {
        consumer.stats.failed++;
        packet.distribution.failedDeliveries.push(consumer.id);
        failed++;
        console.error(`[Router] Delivery to ${consumer.name} failed:`, err);
      }
    }));

    return {
      targetCount: matching.length,
      deliveredCount: delivered,
      failedCount: failed,
      droppedCount: dropped,
      targets: matching.map(c => c.name),
    };
  }

  private findMatchingConsumers(packet: DataPacket): DataConsumer[] {
    return Array.from(this.consumers.values()).filter(c => c.active && this.matchesFilter(packet, c.filter));
  }

  private matchesFilter(packet: DataPacket, filter: ConsumerFilter): boolean {
    if (filter.categories?.length && !filter.categories.includes(packet.category)) return false;
    if (filter.tags?.length && !filter.tags.some(t => packet.tags.includes(t))) return false;
    if (filter.requiredTags?.length && !filter.requiredTags.every(t => packet.tags.includes(t))) return false;
    if (filter.excludeTags?.length && filter.excludeTags.some(t => packet.tags.includes(t))) return false;
    if (filter.sources?.length && !filter.sources.includes(packet.source.id) && !filter.sources.includes(packet.source.type)) return false;
    if (filter.minPriority !== undefined && packet.metadata.priority < filter.minPriority) return false;
    if (filter.maxSizeBytes !== undefined && packet.metadata.sizeBytes > filter.maxSizeBytes) return false;
    if (filter.payloadFilter) {
      try {
        if (!filter.payloadFilter(packet.payload)) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  getConsumerStats() {
    return Array.from(this.consumers.values()).map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      active: c.active,
      stats: { ...c.stats },
      queueSize: c._queue.length,
    }));
  }

  getConsumer(id: string) {
    return this.consumers.get(id);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// DATA FLOW ENGINE — המנוע המרכזי (singleton)
// ═══════════════════════════════════════════════════════════════════════════

class DataFlowEngineImpl {
  readonly classifier: DataClassifier;
  readonly router: DataRouter;
  private stats: DataFlowStats;
  private recentPackets: DataPacket[] = [];
  private maxRecentPackets = 500;
  private eventLog: Array<{ timestamp: number; type: string; packetId: string; detail: string }> = [];
  private listeners: Set<(stats: DataFlowStats) => void> = new Set();

  constructor() {
    this.classifier = new DataClassifier();
    this.router = new DataRouter();
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
    const start = Date.now();
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
        deliveredAt: {},
      },
    };

    this.classifier.classify(packet);
    const routing = await this.router.route(packet);

    this.recentPackets.push(packet);
    if (this.recentPackets.length > this.maxRecentPackets) {
      this.recentPackets = this.recentPackets.slice(-this.maxRecentPackets);
    }

    const routingTime = Date.now() - start;
    this.stats.totalPacketsIngested++;
    this.stats.totalPacketsRouted++;
    this.stats.totalDeliveries += routing.deliveredCount;
    this.stats.totalFailedDeliveries += routing.failedCount;
    this.stats.totalDropped += routing.droppedCount;
    this.stats.avgRoutingTimeMs =
      (this.stats.avgRoutingTimeMs * (this.stats.totalPacketsIngested - 1) + routingTime) / this.stats.totalPacketsIngested;
    this.stats.byCategory[packet.category] = (this.stats.byCategory[packet.category] ?? 0) + 1;
    this.stats.bySource[packet.source.name] = (this.stats.bySource[packet.source.name] ?? 0) + 1;

    const elapsedMin = (Date.now() - this.stats.startedAt) / 60000;
    this.stats.packetsPerMinute = elapsedMin > 0 ? Math.round((this.stats.totalPacketsIngested / elapsedMin) * 10) / 10 : 0;

    this.eventLog.push({
      timestamp: Date.now(),
      type: 'ingested',
      packetId: packet.id,
      detail: `${packet.category} → ${routing.deliveredCount}/${routing.targetCount} consumers (${routingTime}ms)`,
    });
    if (this.eventLog.length > 500) this.eventLog = this.eventLog.slice(-500);

    this.notifyListeners();

    return {
      packetId: packet.id,
      routingResult: {
        targetCount: routing.targetCount,
        deliveredCount: routing.deliveredCount,
        failedCount: routing.failedCount,
        targets: [...new Set(routing.targets)],
      },
    };
  }

  // ─── Shortcuts ─────────────────────────────────────────
  async ingestProject(project: Record<string, unknown>, source = 'ProjectManager'): Promise<string> {
    const r = await this.ingest({
      category: 'project',
      payload: project,
      tags: [(project.status === 'new' ? 'new' : 'update') as DataTag],
      source: { type: 'user', name: source },
      priority: 8,
    });
    return r.packetId;
  }

  async ingestFinancial(data: Record<string, unknown>, source = 'FinanceModule'): Promise<string> {
    const r = await this.ingest({
      category: 'financial',
      payload: data,
      source: { type: 'system', name: source },
      priority: 7,
    });
    return r.packetId;
  }

  async ingestClient(client: Record<string, unknown>, source = 'CRM'): Promise<string> {
    const r = await this.ingest({
      category: 'client',
      payload: client,
      tags: ['new'],
      source: { type: 'user', name: source },
    });
    return r.packetId;
  }

  async ingestSubcontractor(data: Record<string, unknown>, source = 'SubcontractorEngine'): Promise<string> {
    const r = await this.ingest({
      category: 'subcontractor',
      payload: data,
      source: { type: 'system', name: source },
    });
    return r.packetId;
  }

  async ingestMessage(message: Record<string, unknown>, source = 'WhatsApp'): Promise<string> {
    const r = await this.ingest({
      category: 'communication',
      payload: message,
      tags: ['incoming'],
      source: { type: 'webhook', name: source },
      priority: 6,
    });
    return r.packetId;
  }

  async ingestDecision(decision: Record<string, unknown>): Promise<string> {
    const r = await this.ingest({
      category: 'decision',
      payload: decision,
      source: { type: 'agent', name: 'DecisionEngine' },
      priority: 8,
    });
    return r.packetId;
  }

  async ingestMeasurement(m: Record<string, unknown>, source = 'Ozi'): Promise<string> {
    const r = await this.ingest({
      category: 'measurement',
      payload: m,
      source: { type: 'user', name: source },
    });
    return r.packetId;
  }

  async ingestAlert(alert: Record<string, unknown>): Promise<string> {
    const r = await this.ingest({
      category: 'alert',
      payload: alert,
      priority: alert.severity === 'critical' ? 10 : alert.severity === 'error' ? 9 : 7,
      source: { type: 'system', name: 'AlertSystem' },
    });
    return r.packetId;
  }

  // ─── Default Consumers ─────────────────────────────────
  registerDefaultConsumers(handlers?: {
    onDecision?: (p: DataPacket) => void;
    onFinance?: (p: DataPacket) => void;
    onClient?: (p: DataPacket) => void;
    onAlert?: (p: DataPacket) => void;
    onAnalytics?: (p: DataPacket) => void;
  }): void {
    const h = handlers ?? {};

    this.router.registerConsumer({
      id: 'consumer:decision_engine',
      name: 'Decision Engine (קבלנים)',
      description: 'מקבל פרויקטים ומדידות כדי לחשב הקצאת קבלנים',
      filter: { categories: ['project', 'measurement', 'subcontractor', 'work_order'], tags: ['new', 'update'] },
      handler: async (p) => h.onDecision?.(p),
    });

    this.router.registerConsumer({
      id: 'consumer:finance',
      name: 'Finance Module',
      description: 'מעקב הכנסות, הוצאות, תשלומים',
      filter: {
        categories: ['financial', 'work_order', 'decision'],
        payloadFilter: (p) => p.amount !== undefined || p.agreedPrice !== undefined || p.totalWithVat !== undefined,
      },
      handler: async (p) => h.onFinance?.(p),
    });

    this.router.registerConsumer({
      id: 'consumer:crm',
      name: 'CRM Module',
      description: 'ניהול לקוחות ותקשורת',
      filter: { categories: ['client', 'communication', 'crm'] },
      handler: async (p) => h.onClient?.(p),
    });

    this.router.registerConsumer({
      id: 'consumer:alerts',
      name: 'Alert System',
      description: 'מקבל התראות דחופות ומעביר ל-WhatsApp/SMS',
      filter: { categories: ['alert'], minPriority: 7 },
      handler: async (p) => h.onAlert?.(p),
    });

    this.router.registerConsumer({
      id: 'consumer:analytics',
      name: 'Analytics Engine',
      description: 'אוסף כל נתון לדשבורד ודוחות',
      filter: {},
      handler: async (p) => h.onAnalytics?.(p),
    });

    this.router.registerConsumer({
      id: 'consumer:audit',
      name: 'Audit Trail',
      description: 'תיעוד מלא לכל נתון שנכנס למערכת',
      filter: {},
      handler: async () => { /* silent persistence */ },
    });

    this.router.registerConsumer({
      id: 'consumer:scheduler',
      name: 'Scheduler',
      description: 'ניהול לוחות זמנים ודדליינים',
      filter: { categories: ['project', 'task', 'schedule', 'work_order'] },
      handler: async () => { /* no-op */ },
    });

    this.router.registerConsumer({
      id: 'consumer:inventory',
      name: 'Inventory Module',
      description: 'מעקב מלאי חומרים',
      filter: { categories: ['material', 'inventory', 'work_order'] },
      handler: async () => { /* no-op */ },
    });

    this.router.registerConsumer({
      id: 'consumer:seo',
      name: 'SEO & Marketing',
      description: 'תוכן שיווקי ו-SEO',
      filter: { categories: ['seo', 'client', 'real_estate'] },
      handler: async () => { /* no-op */ },
    });

    this.router.registerConsumer({
      id: 'consumer:real_estate',
      name: 'Real Estate Module',
      description: 'ניהול נכסי נדל"ן',
      filter: {
        categories: ['real_estate', 'financial', 'document'],
        payloadFilter: (p) => !!p.propertyId || !!p.address || (p as any).type === 'appraisal',
      },
      handler: async () => { /* no-op */ },
    });

    this.router.registerConsumer({
      id: 'consumer:quality',
      name: 'Quality Control',
      description: 'בקרת איכות על עבודות קבלנים',
      filter: { categories: ['quality', 'measurement', 'work_order'], tags: ['completed'] },
      handler: async () => { /* no-op */ },
    });

    this.router.registerConsumer({
      id: 'consumer:agents',
      name: 'AI Agent Pool',
      description: 'סוכני AI שמבצעים משימות',
      filter: { categories: ['task', 'decision'], minPriority: 5 },
      handler: async () => { /* no-op */ },
    });

    console.log(`[DataFlow] ✅ נרשמו ${this.router.getConsumerStats().length} צרכנים מובנים`);
  }

  // ─── Observability ─────────────────────────────────────
  getStats(): DataFlowStats {
    return { ...this.stats };
  }

  getConsumerStats() {
    return this.router.getConsumerStats();
  }

  getRecentPackets(limit = 50, category?: DataCategory): DataPacket[] {
    let packets = this.recentPackets;
    if (category) packets = packets.filter(p => p.category === category);
    return packets.slice(-limit).reverse();
  }

  getEventLog(limit = 100) {
    return this.eventLog.slice(-limit).reverse();
  }

  subscribe(fn: (stats: DataFlowStats) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notifyListeners() {
    for (const fn of this.listeners) {
      try { fn(this.getStats()); } catch { /* ignore */ }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE + default consumers wired at module load
// ═══════════════════════════════════════════════════════════════════════════

export const DataFlow = new DataFlowEngineImpl();

// Wire default consumers once
let _defaultsRegistered = false;
export function ensureDefaultConsumers(handlers?: Parameters<DataFlowEngineImpl['registerDefaultConsumers']>[0]) {
  if (_defaultsRegistered) return;
  DataFlow.registerDefaultConsumers(handlers);
  _defaultsRegistered = true;
}

// Helper: broadcast via CustomEvent so any React component can listen
export function onFlowUpdate(fn: (stats: DataFlowStats) => void): () => void {
  return DataFlow.subscribe(fn);
}
