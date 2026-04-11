/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   ONYX INTELLIGENT ALERT SYSTEM (IAS) v2.0                            ║
 * ║   מערכת התראות מוסדית חכמה                                             ║
 * ║                                                                        ║
 * ║   לא מערכת "if > threshold → send" פשוטה.                             ║
 * ║   מערכת שמבינה הקשר, לומדת מהיסטוריה, מונעת alert fatigue,            ║
 * ║   מסלימה אוטומטית, מתאמת בין התראות, ויודעת מתי לא להפריע.           ║
 * ║                                                                        ║
 * ║   Inspired by: PagerDuty + Datadog + Bloomberg Terminal Alerts         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   ARCHITECTURE:
 *
 *   Signal (נתון גולמי)
 *        ↓
 *   ┌──────────────────────────┐
 *   │  SIGNAL PROCESSOR        │  → נרמול, סינון רעשים, anomaly detection
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │  RULE ENGINE             │  → כללים סטטיים + דינמיים
 *   │  + PATTERN DETECTOR      │  → זיהוי דפוסים מורכבים (composite)
 *   │  + ANOMALY ENGINE        │  → חריגות מהנורמה (ML-style)
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │  CORRELATION ENGINE      │  → קיבוץ התראות קשורות
 *   │                          │  → מניעת alert storm
 *   │                          │  → זיהוי root cause
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │  SEVERITY CALCULATOR     │  → חישוב חומרה דינמי
 *   │                          │  → לפי הקשר עסקי, זמן, היסטוריה
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │  SUPPRESSION ENGINE      │  → דיכוי כפילויות
 *   │                          │  → שעות שקטות
 *   │                          │  → maintenance windows
 *   │                          │  → cooldown
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │  ROUTING ENGINE          │  → מי מקבל? באיזה ערוץ?
 *   │                          │  → on-call schedule
 *   │                          │  → escalation chains
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │  DISPATCH                │  → WhatsApp / SMS / Email / Telegram
 *   │                          │  → Slack / Discord / Push
 *   │                          │  → ack tracking
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │  LIFECYCLE MANAGER       │  → escalation אוטומטי
 *   │                          │  → auto-resolve
 *   │                          │  → post-mortem
 *   │                          │  → SLA tracking
 *   └──────────────────────────┘
 */

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER CRYPTO SHIM — Web Crypto API + synchronous non-crypto hash
// (Port of Node 'crypto' module. Canonical Node version lives at
//  onyx-ai/src/modules/intelligent-alert-system.ts.)
// לא מוחקים רק משדרגים ומגדלים — זו הגרסה לדפדפן של אותו קוד בדיוק.
// ═══════════════════════════════════════════════════════════════════════════
const crypto = {
  randomBytes(n: number) {
    const arr = new Uint8Array(n);
    (globalThis.crypto || (window as any).crypto).getRandomValues(arr);
    return {
      toString(enc: string) {
        if (enc === 'hex') {
          return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        throw new Error('unsupported encoding: ' + enc);
      },
    };
  },
  createHash(_algo: string) {
    // NOTE: Web Crypto API's digest() is async only and does not expose MD5.
    // For fingerprint dedupe we use a synchronous 128-bit FNV-1a-style mix.
    // This is NOT for security — only for identity/dedupe keys.
    let data = '';
    return {
      update(s: string) { data += s; return this; },
      digest(_enc: string) {
        let h1 = 0x811c9dc5 >>> 0;
        let h2 = 0xcbf29ce4 >>> 0;
        let h3 = 0x9e3779b9 >>> 0;
        let h4 = 0x85ebca6b >>> 0;
        for (let i = 0; i < data.length; i++) {
          const c = data.charCodeAt(i);
          h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
          h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
          h3 = Math.imul(h3 ^ c, 0x27d4eb2f) >>> 0;
          h4 = Math.imul(h4 ^ c, 0x165667b1) >>> 0;
        }
        const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
        return toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
      },
    };
  },
};


// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type Severity = 'P1_CRITICAL' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW' | 'P5_INFO';
type AlertState = 'triggered' | 'acknowledged' | 'investigating' | 'mitigated' | 'resolved' | 'silenced' | 'expired' | 'auto_resolved';
type Channel = 'whatsapp' | 'sms' | 'email' | 'telegram' | 'slack' | 'discord' | 'push' | 'phone_call' | 'system_log';
type SignalType = 'metric' | 'event' | 'log' | 'change' | 'threshold' | 'anomaly' | 'external' | 'heartbeat_missing' | 'user_report';

/** סיגנל — הנתון הגולמי שנכנס */
interface Signal {
  id: string;
  timestamp: number;
  type: SignalType;
  source: string;
  category: string;
  /** הערך */
  value: number | string | boolean | Record<string, unknown>;
  /** ערך רגיל / baseline (לזיהוי חריגות) */
  baseline?: number;
  /** יחידת מידה */
  unit?: string;
  /** מטא-דאטא */
  metadata: Record<string, unknown>;
  /** tags */
  tags: string[];
}

/** כלל התראה */
interface AlertRule {
  id: string;
  name: string;
  description: string;
  active: boolean;
  /** סוגי סיגנלים שמפעילים את הכלל */
  signalTypes: SignalType[];
  /** קטגוריות סיגנל */
  signalCategories: string[];
  /** תנאי הפעלה */
  condition: AlertCondition;
  /** חומרה בסיסית */
  baseSeverity: Severity;
  /** כותרת (template) */
  titleTemplate: string;
  /** הודעה (template) */
  messageTemplate: string;
  /** ערוצי שליחה */
  channels: Channel[];
  /** cooldown בין התראות זהות (ms) */
  cooldownMs: number;
  /** escalation policy */
  escalationPolicyId?: string;
  /** auto-resolve אחרי (ms) */
  autoResolveMs?: number;
  /** תגיות */
  tags: string[];
  /** עדיפות (גבוה = נבדק ראשון) */
  priority: number;
  /** מתי הופעל לאחרונה */
  lastTriggeredAt?: number;
  /** כמה פעמים הופעל */
  triggerCount: number;
  /** correlation group — לקיבוץ התראות */
  correlationGroup?: string;
  /** פעולות אוטומטיות */
  autoActions?: AutoAction[];
}

/** תנאי התראה */
type AlertCondition =
  | { type: 'threshold'; operator: '>' | '<' | '>=' | '<=' | '==' | '!='; value: number }
  | { type: 'range'; min: number; max: number; triggerOutside: boolean }
  | { type: 'anomaly'; deviationMultiplier: number; minSamples: number }
  | { type: 'rate_of_change'; changePercent: number; windowMs: number; direction: 'increase' | 'decrease' | 'both' }
  | { type: 'absence'; expectedIntervalMs: number; gracePeriodMs: number }
  | { type: 'pattern'; pattern: string; matchType: 'contains' | 'regex' | 'exact' }
  | { type: 'composite'; operator: 'AND' | 'OR'; conditions: AlertCondition[] }
  | { type: 'frequency'; count: number; windowMs: number; groupBy?: string }
  | { type: 'custom'; evaluate: (signal: Signal, history: Signal[]) => boolean };

/** פעולה אוטומטית */
interface AutoAction {
  type: 'webhook' | 'run_workflow' | 'update_status' | 'create_task' | 'log';
  config: Record<string, unknown>;
  executeOnStates: AlertState[];
}

/** התראה */
interface Alert {
  id: string;
  /** fingerprint — לזיהוי התראות זהות */
  fingerprint: string;
  ruleId: string;
  ruleName: string;
  timestamp: number;
  severity: Severity;
  state: AlertState;
  title: string;
  message: string;
  /** הודעה טכנית מפורטת */
  technicalDetail: string;
  /** הסיגנל שגרם */
  triggerSignal: Signal;
  /** הקשר — סיגנלים קשורים */
  relatedSignals: Signal[];
  /** מקור */
  source: string;
  category: string;
  tags: string[];
  /** correlation */
  correlationGroup?: string;
  correlatedAlertIds: string[];
  /** ניתוב */
  routing: {
    channels: Channel[];
    recipients: AlertRecipientRecord[];
    escalationLevel: number;
    escalationPolicyId?: string;
  };
  /** lifecycle */
  lifecycle: {
    triggeredAt: number;
    acknowledgedAt?: number;
    acknowledgedBy?: string;
    investigatingAt?: number;
    investigatingBy?: string;
    mitigatedAt?: number;
    mitigatedBy?: string;
    resolvedAt?: number;
    resolvedBy?: string;
    resolvedReason?: string;
    autoResolveAt?: number;
    /** כמה זמן עד אסקלציה (ms) */
    nextEscalationAt?: number;
    /** SLA — זמן מקסימלי לתגובה (ms) */
    slaResponseMs: number;
    /** SLA — זמן מקסימלי לפתרון (ms) */
    slaResolutionMs: number;
    /** האם SLA הופר */
    slaBreached: boolean;
    /** מספר אסקלציות */
    escalationCount: number;
  };
  /** מדדים */
  metrics: {
    /** זמן עד acknowledge (ms) */
    timeToAckMs?: number;
    /** זמן עד resolve (ms) */
    timeToResolveMs?: number;
    /** כמה פעמים נשלח */
    notificationsSent: number;
    /** כמה פעמים אושר קבלה */
    notificationsDelivered: number;
    /** snooze count */
    snoozeCount: number;
  };
  /** הערות */
  notes: Array<{ timestamp: number; author: string; text: string }>;
  /** audit trail */
  audit: Array<{ timestamp: number; action: string; actor: string; detail: string }>;
  /** post-mortem */
  postMortem?: {
    rootCause: string;
    impact: string;
    resolution: string;
    preventionSteps: string[];
    createdBy: string;
    createdAt: number;
  };
}

/** רשומת נמען */
interface AlertRecipientRecord {
  recipientId: string;
  recipientName: string;
  channel: Channel;
  sentAt: number;
  delivered: boolean;
  acknowledged: boolean;
  acknowledgedAt?: number;
  failureReason?: string;
}

/** נמען */
interface Recipient {
  id: string;
  name: string;
  role: string;
  channels: Partial<Record<Channel, string>>;
  /** רמת חומרה מינימלית */
  minSeverity: Severity;
  /** קטגוריות (ריק = הכל) */
  categories: string[];
  /** שעות שקטות */
  quietHours?: { start: number; end: number; timezone: string; overrideForP1: boolean };
  /** on-call */
  onCall: boolean;
  onCallSchedule?: OnCallSchedule;
  active: boolean;
}

/** לוח תורנויות */
interface OnCallSchedule {
  /** ימים (0=ראשון) */
  days: number[];
  /** שעות */
  startHour: number;
  endHour: number;
  timezone: string;
}

/** מדיניות אסקלציה */
interface EscalationPolicy {
  id: string;
  name: string;
  /** שלבים — כל שלב עם זמן המתנה ונמענים */
  levels: EscalationLevel[];
  /** מה קורה אם כל השלבים נכשלו */
  finalAction: 'loop' | 'broadcast_all' | 'log_only';
  /** חל על אילו חומרות */
  appliesTo: Severity[];
}

interface EscalationLevel {
  /** זמן המתנה לפני אסקלציה (ms) */
  waitMs: number;
  /** נמענים בשלב הזה */
  recipientIds: string[];
  /** ערוצים בשלב הזה */
  channels: Channel[];
  /** הודעה מותאמת */
  messagePrefix?: string;
}

/** חלון תחזוקה — דיכוי התראות */
interface MaintenanceWindow {
  id: string;
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  /** אילו קטגוריות לדכא */
  categories: string[];
  /** אילו sources לדכא */
  sources: string[];
  /** האם לדכא גם P1 */
  suppressP1: boolean;
  createdBy: string;
  active: boolean;
}

/** דיכוי התראות */
interface SuppressionRule {
  id: string;
  name: string;
  /** fingerprint pattern — regex */
  fingerprintPattern: string;
  /** עד מתי */
  expiresAt: number;
  /** סיבה */
  reason: string;
  createdBy: string;
  createdAt: number;
  active: boolean;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: SIGNAL PROCESSOR — נרמול וסינון רעשים
// ═══════════════════════════════════════════════════════════════════════════

class SignalProcessor {
  /** היסטוריית סיגנלים לכל source+category */
  private history: Map<string, Signal[]> = new Map();
  private maxHistoryPerKey = 1000;
  /** baselines שנלמדו */
  private baselines: Map<string, { mean: number; stddev: number; samples: number; lastUpdated: number }> = new Map();

  /** עבד סיגנל — נרמל, חשב baseline, הוסף להיסטוריה */
  process(signal: Signal): ProcessedSignal {
    const key = `${signal.source}:${signal.category}`;

    // שמור בהיסטוריה
    if (!this.history.has(key)) this.history.set(key, []);
    const hist = this.history.get(key)!;
    hist.push(signal);
    if (hist.length > this.maxHistoryPerKey) hist.splice(0, hist.length - this.maxHistoryPerKey);

    // חשב baseline אם הערך מספרי
    let anomalyScore = 0;
    let deviation = 0;
    const numValue = typeof signal.value === 'number' ? signal.value : undefined;

    if (numValue !== undefined) {
      const baseline = this.updateBaseline(key, numValue);
      if (baseline.samples >= 10 && baseline.stddev > 0) {
        deviation = Math.abs(numValue - baseline.mean) / baseline.stddev;
        anomalyScore = Math.min(1, deviation / 3); // 3 sigma = anomaly score 1.0
      }
    }

    // חשב rate of change
    let rateOfChange = 0;
    if (numValue !== undefined && hist.length >= 2) {
      const prevNumeric = hist.slice(-10).filter(s => typeof s.value === 'number');
      if (prevNumeric.length >= 2) {
        const prev = prevNumeric[prevNumeric.length - 2].value as number;
        rateOfChange = prev !== 0 ? ((numValue - prev) / Math.abs(prev)) * 100 : 0;
      }
    }

    return {
      signal,
      anomalyScore,
      deviation,
      rateOfChange,
      baseline: this.baselines.get(key),
      historySize: hist.length,
    };
  }

  private updateBaseline(key: string, value: number): { mean: number; stddev: number; samples: number; lastUpdated: number } {
    const existing = this.baselines.get(key);
    if (!existing) {
      const baseline = { mean: value, stddev: 0, samples: 1, lastUpdated: Date.now() };
      this.baselines.set(key, baseline);
      return baseline;
    }

    // Welford's online algorithm for running mean and variance
    existing.samples++;
    const delta = value - existing.mean;
    existing.mean += delta / existing.samples;
    const delta2 = value - existing.mean;
    const m2 = (existing.stddev * existing.stddev * (existing.samples - 1)) + delta * delta2;
    existing.stddev = existing.samples > 1 ? Math.sqrt(m2 / (existing.samples - 1)) : 0;
    existing.lastUpdated = Date.now();

    return existing;
  }

  /** שלוף היסטוריה */
  getHistory(source: string, category: string, limit?: number): Signal[] {
    const key = `${source}:${category}`;
    const hist = this.history.get(key) ?? [];
    return limit ? hist.slice(-limit) : hist;
  }

  /** שלוף baseline */
  getBaseline(source: string, category: string) {
    return this.baselines.get(`${source}:${category}`);
  }
}

interface ProcessedSignal {
  signal: Signal;
  anomalyScore: number;         // 0-1
  deviation: number;            // מספר סטיות תקן מהממוצע
  rateOfChange: number;         // אחוז שינוי
  baseline?: { mean: number; stddev: number; samples: number };
  historySize: number;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: RULE ENGINE — הערכת כללים
// ═══════════════════════════════════════════════════════════════════════════

class RuleEngine {
  private rules: Map<string, AlertRule> = new Map();

  addRule(rule: Omit<AlertRule, 'id' | 'triggerCount'>): AlertRule {
    const full: AlertRule = { ...rule, id: `rule_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`, triggerCount: 0 };
    this.rules.set(full.id, full);
    return full;
  }

  removeRule(id: string): void { this.rules.delete(id); }
  setRuleActive(id: string, active: boolean): void { const r = this.rules.get(id); if (r) r.active = active; }

  /** הערך סיגנל מול כל הכללים */
  evaluate(processed: ProcessedSignal): Array<{ rule: AlertRule; triggered: boolean; detail: string }> {
    const results: Array<{ rule: AlertRule; triggered: boolean; detail: string }> = [];
    const signal = processed.signal;

    for (const rule of Array.from(this.rules.values()).filter(r => r.active).sort((a, b) => b.priority - a.priority)) {
      // בדוק התאמת סוג וקטגוריה
      if (rule.signalTypes.length > 0 && !rule.signalTypes.includes(signal.type)) continue;
      if (rule.signalCategories.length > 0 && !rule.signalCategories.includes(signal.category)) continue;

      // בדוק cooldown
      if (rule.lastTriggeredAt && Date.now() - rule.lastTriggeredAt < rule.cooldownMs) continue;

      // הערך תנאי
      const result = this.evaluateCondition(rule.condition, processed);
      results.push({ rule, triggered: result.triggered, detail: result.detail });

      if (result.triggered) {
        rule.lastTriggeredAt = Date.now();
        rule.triggerCount++;
      }
    }

    return results;
  }

  private evaluateCondition(condition: AlertCondition, processed: ProcessedSignal): { triggered: boolean; detail: string } {
    const signal = processed.signal;
    const numValue = typeof signal.value === 'number' ? signal.value : undefined;
    const strValue = typeof signal.value === 'string' ? signal.value : JSON.stringify(signal.value);

    switch (condition.type) {
      case 'threshold': {
        if (numValue === undefined) return { triggered: false, detail: 'ערך לא מספרי' };
        const ops: Record<string, (a: number, b: number) => boolean> = {
          '>': (a, b) => a > b, '<': (a, b) => a < b, '>=': (a, b) => a >= b,
          '<=': (a, b) => a <= b, '==': (a, b) => a === b, '!=': (a, b) => a !== b,
        };
        const triggered = ops[condition.operator](numValue, condition.value);
        return { triggered, detail: `${numValue} ${condition.operator} ${condition.value}` };
      }

      case 'range': {
        if (numValue === undefined) return { triggered: false, detail: 'ערך לא מספרי' };
        const inRange = numValue >= condition.min && numValue <= condition.max;
        const triggered = condition.triggerOutside ? !inRange : inRange;
        return { triggered, detail: `${numValue} ${triggered ? 'מחוץ' : 'בתוך'} טווח [${condition.min}, ${condition.max}]` };
      }

      case 'anomaly': {
        const triggered = processed.deviation >= condition.deviationMultiplier && (processed.baseline?.samples ?? 0) >= condition.minSamples;
        return { triggered, detail: `סטייה: ${processed.deviation.toFixed(1)}σ (סף: ${condition.deviationMultiplier}σ, דגימות: ${processed.baseline?.samples ?? 0})` };
      }

      case 'rate_of_change': {
        const absChange = Math.abs(processed.rateOfChange);
        let triggered = absChange >= condition.changePercent;
        if (triggered && condition.direction !== 'both') {
          triggered = condition.direction === 'increase' ? processed.rateOfChange > 0 : processed.rateOfChange < 0;
        }
        return { triggered, detail: `שינוי: ${processed.rateOfChange.toFixed(1)}% (סף: ${condition.changePercent}%)` };
      }

      case 'absence': {
        // נבדק בנפרד ע"י heartbeat monitor
        return { triggered: false, detail: 'absence נבדק ב-heartbeat monitor' };
      }

      case 'pattern': {
        let triggered = false;
        switch (condition.matchType) {
          case 'contains': triggered = strValue.includes(condition.pattern); break;
          case 'exact': triggered = strValue === condition.pattern; break;
          case 'regex': triggered = new RegExp(condition.pattern).test(strValue); break;
        }
        return { triggered, detail: `pattern "${condition.pattern}" ${triggered ? 'נמצא' : 'לא נמצא'}` };
      }

      case 'composite': {
        const subResults = condition.conditions.map(c => this.evaluateCondition(c, processed));
        const triggered = condition.operator === 'AND'
          ? subResults.every(r => r.triggered)
          : subResults.some(r => r.triggered);
        return { triggered, detail: `composite(${condition.operator}): ${subResults.map(r => r.triggered ? '✓' : '✗').join(', ')}` };
      }

      case 'frequency': {
        // ספירת אירועים דומים בחלון זמן — נבדק בנפרד
        return { triggered: false, detail: 'frequency נבדק ב-correlation engine' };
      }

      case 'custom': {
        try {
          const hist = []; // simplified
          const triggered = condition.evaluate(signal, hist);
          return { triggered, detail: `custom function → ${triggered}` };
        } catch (err) {
          return { triggered: false, detail: `custom function error: ${err}` };
        }
      }

      default:
        return { triggered: false, detail: 'unknown condition type' };
    }
  }

  getRules(): AlertRule[] { return Array.from(this.rules.values()); }
  getRule(id: string): AlertRule | undefined { return this.rules.get(id); }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: CORRELATION ENGINE — קיבוץ התראות + root cause
// ═══════════════════════════════════════════════════════════════════════════

class CorrelationEngine {
  private activeGroups: Map<string, { alertIds: string[]; firstSeen: number; lastSeen: number; count: number }> = new Map();
  private windowMs: number;

  constructor(windowMs: number = 300000) { // 5 minutes default
    this.windowMs = windowMs;
  }

  /** קבע אם התראה חדשה שייכת לקבוצה קיימת */
  correlate(alert: Alert): {
    isCorrelated: boolean;
    groupKey: string;
    existingAlertIds: string[];
    isDuplicate: boolean;
    isFlapping: boolean;
  } {
    const groupKey = alert.correlationGroup ?? alert.fingerprint;

    // בדוק אם יש קבוצה פעילה
    const existing = this.activeGroups.get(groupKey);
    const now = Date.now();

    if (existing && now - existing.lastSeen < this.windowMs) {
      existing.alertIds.push(alert.id);
      existing.lastSeen = now;
      existing.count++;

      // flapping detection — אם אותה התראה נפתחת ונסגרת הרבה פעמים
      const isFlapping = existing.count >= 5;

      return {
        isCorrelated: true,
        groupKey,
        existingAlertIds: existing.alertIds.filter(id => id !== alert.id),
        isDuplicate: existing.count > 1 && now - existing.firstSeen < 60000, // כפילות תוך דקה
        isFlapping,
      };
    }

    // קבוצה חדשה
    this.activeGroups.set(groupKey, { alertIds: [alert.id], firstSeen: now, lastSeen: now, count: 1 });
    return { isCorrelated: false, groupKey, existingAlertIds: [], isDuplicate: false, isFlapping: false };
  }

  /** נקה קבוצות ישנות */
  cleanup(): void {
    const now = Date.now();
    for (const [key, group] of this.activeGroups) {
      if (now - group.lastSeen > this.windowMs * 2) {
        this.activeGroups.delete(key);
      }
    }
  }

  getActiveGroups() { return Object.fromEntries(this.activeGroups); }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: SEVERITY CALCULATOR — חישוב חומרה דינמי
// ═══════════════════════════════════════════════════════════════════════════

class SeverityCalculator {
  private severityOrder: Record<Severity, number> = { P1_CRITICAL: 5, P2_HIGH: 4, P3_MEDIUM: 3, P4_LOW: 2, P5_INFO: 1 };
  private severityFromScore = (score: number): Severity => {
    if (score >= 4.5) return 'P1_CRITICAL';
    if (score >= 3.5) return 'P2_HIGH';
    if (score >= 2.5) return 'P3_MEDIUM';
    if (score >= 1.5) return 'P4_LOW';
    return 'P5_INFO';
  };

  /** חשב חומרה דינמית לפי הקשר */
  calculate(params: {
    baseSeverity: Severity;
    anomalyScore: number;
    deviation: number;
    /** האם בשעות עבודה */
    duringBusinessHours: boolean;
    /** האם קשור לפרויקט פעיל */
    activeProjectRelated: boolean;
    /** סכום כספי מעורב */
    financialAmount?: number;
    /** כמה התראות קשורות פעילות */
    correlatedAlertCount: number;
    /** האם flapping */
    isFlapping: boolean;
    /** היסטוריית trigger — אם מופעל בתדירות גבוהה, אולי פחות דחוף */
    recentTriggerCount: number;
  }): { severity: Severity; adjustedScore: number; reasoning: string[] } {
    let score = this.severityOrder[params.baseSeverity];
    const reasoning: string[] = [`בסיס: ${params.baseSeverity} (${score})`];

    // anomaly — אם חריגה חזקה, העלה חומרה
    if (params.anomalyScore > 0.7) {
      score += 0.5;
      reasoning.push(`חריגה גבוהה (${(params.anomalyScore * 100).toFixed(0)}%) → +0.5`);
    }

    // שעות עבודה — בלילה, P3 הופך ל-P4
    if (!params.duringBusinessHours && score < 4) {
      score -= 0.3;
      reasoning.push(`מחוץ לשעות עבודה → -0.3`);
    }

    // פרויקט פעיל — מעלה חומרה
    if (params.activeProjectRelated) {
      score += 0.3;
      reasoning.push(`קשור לפרויקט פעיל → +0.3`);
    }

    // סכום כספי גבוה
    if (params.financialAmount !== undefined) {
      if (params.financialAmount > 100000) { score += 0.5; reasoning.push(`סכום >₪100K → +0.5`); }
      else if (params.financialAmount > 50000) { score += 0.3; reasoning.push(`סכום >₪50K → +0.3`); }
    }

    // הרבה התראות מתואמות — אירוע מערכתי
    if (params.correlatedAlertCount >= 5) {
      score += 0.5;
      reasoning.push(`${params.correlatedAlertCount} התראות מתואמות → +0.5 (אירוע מערכתי)`);
    }

    // flapping — הורד חומרה (noise)
    if (params.isFlapping) {
      score -= 0.5;
      reasoning.push(`flapping detected → -0.5`);
    }

    // trigger תכוף — alert fatigue prevention
    if (params.recentTriggerCount > 10) {
      score -= 0.3;
      reasoning.push(`trigger תכוף (${params.recentTriggerCount}x) → -0.3`);
    }

    const adjustedScore = Math.max(1, Math.min(5, score));
    const severity = this.severityFromScore(adjustedScore);
    reasoning.push(`ציון סופי: ${adjustedScore.toFixed(1)} → ${severity}`);

    return { severity, adjustedScore, reasoning };
  }

  isBusinessHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    // ישראל: ראשון-חמישי 7:00-19:00
    return day >= 0 && day <= 4 && hour >= 7 && hour < 19;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: SUPPRESSION ENGINE — דיכוי רעשים
// ═══════════════════════════════════════════════════════════════════════════

class SuppressionEngine {
  private suppressionRules: Map<string, SuppressionRule> = new Map();
  private maintenanceWindows: Map<string, MaintenanceWindow> = new Map();

  addSuppressionRule(rule: Omit<SuppressionRule, 'id' | 'createdAt'>): SuppressionRule {
    const full: SuppressionRule = { ...rule, id: `sup_${Date.now().toString(36)}`, createdAt: Date.now() };
    this.suppressionRules.set(full.id, full);
    return full;
  }

  addMaintenanceWindow(window: Omit<MaintenanceWindow, 'id'>): MaintenanceWindow {
    const full: MaintenanceWindow = { ...window, id: `mw_${Date.now().toString(36)}` };
    this.maintenanceWindows.set(full.id, full);
    return full;
  }

  /** בדוק אם התראה צריכה להיות מדוכאת */
  shouldSuppress(alert: Alert): { suppress: boolean; reason: string } {
    const now = Date.now();

    // בדוק suppression rules
    for (const rule of Array.from(this.suppressionRules.values()).filter(r => r.active)) {
      if (now > rule.expiresAt) { rule.active = false; continue; }
      if (new RegExp(rule.fingerprintPattern).test(alert.fingerprint)) {
        return { suppress: true, reason: `suppression rule: ${rule.name} — ${rule.reason}` };
      }
    }

    // בדוק maintenance windows
    for (const mw of Array.from(this.maintenanceWindows.values()).filter(w => w.active)) {
      if (now < mw.startTime || now > mw.endTime) continue;
      if (!mw.suppressP1 && alert.severity === 'P1_CRITICAL') continue;
      if (mw.categories.length > 0 && !mw.categories.includes(alert.category)) continue;
      if (mw.sources.length > 0 && !mw.sources.includes(alert.source)) continue;
      return { suppress: true, reason: `maintenance window: ${mw.name}` };
    }

    return { suppress: false, reason: '' };
  }

  /** נקה rules שפגו */
  cleanup(): void {
    const now = Date.now();
    for (const [id, rule] of this.suppressionRules) {
      if (now > rule.expiresAt) this.suppressionRules.delete(id);
    }
    for (const [id, mw] of this.maintenanceWindows) {
      if (now > mw.endTime) this.maintenanceWindows.delete(id);
    }
  }

  getActiveSuppressions(): SuppressionRule[] {
    return Array.from(this.suppressionRules.values()).filter(r => r.active && Date.now() < r.expiresAt);
  }

  getAllSuppressionRules(): SuppressionRule[] {
    return Array.from(this.suppressionRules.values());
  }

  getAllMaintenanceWindows(): MaintenanceWindow[] {
    return Array.from(this.maintenanceWindows.values());
  }

  getActiveMaintenanceWindows(): MaintenanceWindow[] {
    const now = Date.now();
    return Array.from(this.maintenanceWindows.values()).filter(w => w.active && now >= w.startTime && now <= w.endTime);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: ROUTING ENGINE — ניתוב לנמענים
// ═══════════════════════════════════════════════════════════════════════════

class RoutingEngine {
  private recipients: Map<string, Recipient> = new Map();
  private escalationPolicies: Map<string, EscalationPolicy> = new Map();

  addRecipient(recipient: Recipient): void {
    this.recipients.set(recipient.id, recipient);
  }

  addEscalationPolicy(policy: EscalationPolicy): void {
    this.escalationPolicies.set(policy.id, policy);
  }

  /** קבע למי לשלוח */
  route(alert: Alert): Array<{ recipientId: string; recipientName: string; channel: Channel; address: string }> {
    const routes: Array<{ recipientId: string; recipientName: string; channel: Channel; address: string }> = [];
    const severityOrder: Record<Severity, number> = { P1_CRITICAL: 5, P2_HIGH: 4, P3_MEDIUM: 3, P4_LOW: 2, P5_INFO: 1 };
    const now = new Date();
    const hour = now.getHours();

    for (const recipient of Array.from(this.recipients.values()).filter(r => r.active)) {
      // בדוק חומרה מינימלית
      if (severityOrder[alert.severity] < severityOrder[recipient.minSeverity]) continue;

      // בדוק קטגוריות
      if (recipient.categories.length > 0 && !recipient.categories.includes(alert.category)) continue;

      // בדוק שעות שקטות
      if (recipient.quietHours) {
        const inQuietHours = hour >= recipient.quietHours.start || hour < recipient.quietHours.end;
        if (inQuietHours && !(recipient.quietHours.overrideForP1 && alert.severity === 'P1_CRITICAL')) continue;
      }

      // בדוק on-call
      if (recipient.onCallSchedule) {
        const day = now.getDay();
        if (!recipient.onCallSchedule.days.includes(day)) continue;
        if (hour < recipient.onCallSchedule.startHour || hour >= recipient.onCallSchedule.endHour) continue;
      }

      // שלח בכל ערוץ רלוונטי
      for (const channel of alert.routing.channels) {
        const address = recipient.channels[channel];
        if (address) {
          routes.push({ recipientId: recipient.id, recipientName: recipient.name, channel, address });
        }
      }
    }

    return routes;
  }

  /** שלוף escalation policy */
  getEscalationPolicy(id: string): EscalationPolicy | undefined {
    return this.escalationPolicies.get(id);
  }

  /** שלוף escalation level */
  getEscalationLevel(policyId: string, level: number): EscalationLevel | undefined {
    const policy = this.escalationPolicies.get(policyId);
    if (!policy) return undefined;
    return policy.levels[level];
  }

  getRecipient(id: string): Recipient | undefined { return this.recipients.get(id); }
  getAllRecipients(): Recipient[] { return Array.from(this.recipients.values()); }
  getAllEscalationPolicies(): EscalationPolicy[] { return Array.from(this.escalationPolicies.values()); }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: LIFECYCLE MANAGER — ניהול מחזור חיים
// ═══════════════════════════════════════════════════════════════════════════

class LifecycleManager {
  /** SLA defaults by severity */
  private slaDefaults: Record<Severity, { responseMs: number; resolutionMs: number }> = {
    P1_CRITICAL: { responseMs: 300000, resolutionMs: 3600000 },       // 5min / 1hr
    P2_HIGH: { responseMs: 900000, resolutionMs: 14400000 },          // 15min / 4hr
    P3_MEDIUM: { responseMs: 3600000, resolutionMs: 86400000 },       // 1hr / 24hr
    P4_LOW: { responseMs: 14400000, resolutionMs: 604800000 },        // 4hr / 7 days
    P5_INFO: { responseMs: 86400000, resolutionMs: 2592000000 },      // 24hr / 30 days
  };

  /** בדוק SLA breaches + escalations */
  check(alerts: Alert[], routingEngine: RoutingEngine): Array<{ alertId: string; action: string; detail: string }> {
    const actions: Array<{ alertId: string; action: string; detail: string }> = [];
    const now = Date.now();

    for (const alert of alerts) {
      if (alert.state === 'resolved' || alert.state === 'auto_resolved' || alert.state === 'expired') continue;

      // SLA response breach
      if (alert.state === 'triggered') {
        const sla = this.slaDefaults[alert.severity];
        if (now - alert.lifecycle.triggeredAt > sla.responseMs && !alert.lifecycle.slaBreached) {
          alert.lifecycle.slaBreached = true;
          actions.push({ alertId: alert.id, action: 'sla_response_breach', detail: `SLA response breach: ${alert.severity} — ${this.formatDuration(now - alert.lifecycle.triggeredAt)}` });
        }
      }

      // SLA resolution breach
      if (alert.state !== 'resolved') {
        const sla = this.slaDefaults[alert.severity];
        if (now - alert.lifecycle.triggeredAt > sla.resolutionMs && !alert.lifecycle.slaBreached) {
          alert.lifecycle.slaBreached = true;
          actions.push({ alertId: alert.id, action: 'sla_resolution_breach', detail: `SLA resolution breach: ${alert.severity}` });
        }
      }

      // Auto-resolve
      if (alert.lifecycle.autoResolveAt && now >= alert.lifecycle.autoResolveAt) {
        alert.state = 'auto_resolved';
        alert.lifecycle.resolvedAt = now;
        alert.lifecycle.resolvedReason = 'auto-resolved';
        alert.audit.push({ timestamp: now, action: 'auto_resolved', actor: 'system', detail: 'Auto-resolved by timeout' });
        actions.push({ alertId: alert.id, action: 'auto_resolved', detail: 'Auto-resolved' });
        continue;
      }

      // Escalation
      if (alert.state === 'triggered' && alert.routing.escalationPolicyId && alert.lifecycle.nextEscalationAt && now >= alert.lifecycle.nextEscalationAt) {
        const policy = routingEngine.getEscalationPolicy(alert.routing.escalationPolicyId);
        if (policy) {
          const nextLevel = alert.routing.escalationLevel + 1;
          if (nextLevel < policy.levels.length) {
            alert.routing.escalationLevel = nextLevel;
            alert.lifecycle.escalationCount++;
            const level = policy.levels[nextLevel];
            alert.lifecycle.nextEscalationAt = now + level.waitMs;
            alert.audit.push({ timestamp: now, action: 'escalated', actor: 'system', detail: `Escalated to level ${nextLevel + 1}` });
            actions.push({ alertId: alert.id, action: 'escalate', detail: `Escalated to level ${nextLevel + 1}: ${level.recipientIds.join(', ')}` });
          } else if (policy.finalAction === 'loop') {
            alert.routing.escalationLevel = 0;
            alert.lifecycle.nextEscalationAt = now + policy.levels[0].waitMs;
            actions.push({ alertId: alert.id, action: 'escalation_loop', detail: 'Escalation looped back to level 1' });
          }
        }
      }
    }

    return actions;
  }

  getSLADefaults(): typeof this.slaDefaults { return this.slaDefaults; }

  private formatDuration(ms: number): string {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
    return `${(ms / 86400000).toFixed(1)}d`;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: INTELLIGENT ALERT SYSTEM — הכל ביחד
// ═══════════════════════════════════════════════════════════════════════════

export class IntelligentAlertSystem {
  readonly signalProcessor: SignalProcessor;
  readonly ruleEngine: RuleEngine;
  readonly correlationEngine: CorrelationEngine;
  readonly severityCalculator: SeverityCalculator;
  readonly suppressionEngine: SuppressionEngine;
  readonly routingEngine: RoutingEngine;
  readonly lifecycleManager: LifecycleManager;

  private alerts: Map<string, Alert> = new Map();
  private stats = { totalSignals: 0, totalAlerts: 0, totalSuppressed: 0, totalCorrelated: 0, totalEscalated: 0, totalResolved: 0 };

  /** handler לשליחת הודעות — מחובר ל-ONYX integrations */
  private sendHandler?: (channel: Channel, address: string, title: string, message: string, severity: Severity) => Promise<boolean>;

  constructor(config?: { correlationWindowMs?: number }) {
    this.signalProcessor = new SignalProcessor();
    this.ruleEngine = new RuleEngine();
    this.correlationEngine = new CorrelationEngine(config?.correlationWindowMs);
    this.severityCalculator = new SeverityCalculator();
    this.suppressionEngine = new SuppressionEngine();
    this.routingEngine = new RoutingEngine();
    this.lifecycleManager = new LifecycleManager();
  }

  setSendHandler(handler: typeof this.sendHandler): void { this.sendHandler = handler; }

  // ─── הפעולה המרכזית: הזנת סיגנל ─────────────────────────────────

  async ingestSignal(params: {
    type: SignalType;
    source: string;
    category: string;
    value: number | string | boolean | Record<string, unknown>;
    baseline?: number;
    unit?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): Promise<{ signalId: string; alertsTriggered: number; alertIds: string[] }> {
    const signal: Signal = {
      id: `sig_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: Date.now(),
      type: params.type,
      source: params.source,
      category: params.category,
      value: params.value,
      baseline: params.baseline,
      unit: params.unit,
      metadata: params.metadata ?? {},
      tags: params.tags ?? [],
    };

    this.stats.totalSignals++;

    // 1. עיבוד סיגנל
    const processed = this.signalProcessor.process(signal);

    // 2. הערכת כללים
    const ruleResults = this.ruleEngine.evaluate(processed);
    const triggeredRules = ruleResults.filter(r => r.triggered);

    // 3. יצירת התראות
    const newAlertIds: string[] = [];

    for (const { rule, detail } of triggeredRules) {
      // חישוב fingerprint
      const fingerprint = crypto.createHash('md5').update(`${rule.id}:${signal.source}:${signal.category}`).digest('hex');

      // חישוב חומרה דינמי
      const severityResult = this.severityCalculator.calculate({
        baseSeverity: rule.baseSeverity,
        anomalyScore: processed.anomalyScore,
        deviation: processed.deviation,
        duringBusinessHours: this.severityCalculator.isBusinessHours(),
        activeProjectRelated: signal.tags.includes('project_related'),
        financialAmount: typeof signal.value === 'number' && signal.category.includes('financial') ? signal.value : undefined,
        correlatedAlertCount: 0,
        isFlapping: false,
        recentTriggerCount: rule.triggerCount,
      });

      // בנה הודעה
      const title = this.renderTemplate(rule.titleTemplate, signal, processed, severityResult.severity);
      const message = this.renderTemplate(rule.messageTemplate, signal, processed, severityResult.severity);

      const slaDefaults = this.lifecycleManager.getSLADefaults()[severityResult.severity];

      const alert: Alert = {
        id: `alert_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
        fingerprint,
        ruleId: rule.id,
        ruleName: rule.name,
        timestamp: Date.now(),
        severity: severityResult.severity,
        state: 'triggered',
        title,
        message,
        technicalDetail: `${detail}\nSeverity reasoning:\n${severityResult.reasoning.join('\n')}`,
        triggerSignal: signal,
        relatedSignals: [],
        source: signal.source,
        category: signal.category,
        tags: [...rule.tags, ...signal.tags],
        correlationGroup: rule.correlationGroup,
        correlatedAlertIds: [],
        routing: {
          channels: rule.channels,
          recipients: [],
          escalationLevel: 0,
          escalationPolicyId: rule.escalationPolicyId,
        },
        lifecycle: {
          triggeredAt: Date.now(),
          slaResponseMs: slaDefaults.responseMs,
          slaResolutionMs: slaDefaults.resolutionMs,
          slaBreached: false,
          escalationCount: 0,
          autoResolveAt: rule.autoResolveMs ? Date.now() + rule.autoResolveMs : undefined,
          nextEscalationAt: rule.escalationPolicyId ? Date.now() + 300000 : undefined, // 5 min default
        },
        metrics: { notificationsSent: 0, notificationsDelivered: 0, snoozeCount: 0 },
        notes: [],
        audit: [{ timestamp: Date.now(), action: 'triggered', actor: 'system', detail: `Rule: ${rule.name} — ${detail}` }],
      };

      // 4. Correlation
      const correlation = this.correlationEngine.correlate(alert);
      if (correlation.isDuplicate) {
        this.stats.totalSuppressed++;
        continue; // כפילות — דלג
      }
      if (correlation.isCorrelated) {
        alert.correlatedAlertIds = correlation.existingAlertIds;
        this.stats.totalCorrelated++;
      }
      if (correlation.isFlapping) {
        // עדכן חומרה
        const flappingResult = this.severityCalculator.calculate({ ...{
          baseSeverity: rule.baseSeverity, anomalyScore: processed.anomalyScore,
          deviation: processed.deviation, duringBusinessHours: this.severityCalculator.isBusinessHours(),
          activeProjectRelated: false, correlatedAlertCount: correlation.existingAlertIds.length,
          isFlapping: true, recentTriggerCount: rule.triggerCount,
        }});
        alert.severity = flappingResult.severity;
      }

      // 5. Suppression
      const suppression = this.suppressionEngine.shouldSuppress(alert);
      if (suppression.suppress) {
        alert.state = 'silenced';
        alert.audit.push({ timestamp: Date.now(), action: 'suppressed', actor: 'system', detail: suppression.reason });
        this.alerts.set(alert.id, alert);
        this.stats.totalSuppressed++;
        continue;
      }

      // 6. Routing
      const routes = this.routingEngine.route(alert);

      // 7. Dispatch
      for (const route of routes) {
        const icon = { P1_CRITICAL: '🚨', P2_HIGH: '🔴', P3_MEDIUM: '🟡', P4_LOW: '🔵', P5_INFO: 'ℹ️' }[alert.severity];
        const fullTitle = `${icon} [${alert.severity}] ${alert.title}`;
        const fullMessage = `${alert.message}\n\nמקור: ${alert.source}\nקטגוריה: ${alert.category}\nזמן: ${new Date(alert.timestamp).toLocaleString('he-IL')}\n\nID: ${alert.id}`;

        let delivered = false;
        try {
          if (this.sendHandler) {
            delivered = await this.sendHandler(route.channel, route.address, fullTitle, fullMessage, alert.severity);
          } else {
            console.log(`[IAS → ${route.channel}] ${route.recipientName}: ${fullTitle}`);
            delivered = true;
          }
        } catch {}

        alert.routing.recipients.push({
          recipientId: route.recipientId,
          recipientName: route.recipientName,
          channel: route.channel,
          sentAt: Date.now(),
          delivered,
          acknowledged: false,
        });

        alert.metrics.notificationsSent++;
        if (delivered) alert.metrics.notificationsDelivered++;
      }

      // שמור
      this.alerts.set(alert.id, alert);
      newAlertIds.push(alert.id);
      this.stats.totalAlerts++;
    }

    return { signalId: signal.id, alertsTriggered: newAlertIds.length, alertIds: newAlertIds };
  }

  private renderTemplate(template: string, signal: Signal, processed: ProcessedSignal, severity: Severity): string {
    return template
      .replace(/\{source\}/g, signal.source)
      .replace(/\{category\}/g, signal.category)
      .replace(/\{value\}/g, String(signal.value))
      .replace(/\{severity\}/g, severity)
      .replace(/\{anomalyScore\}/g, (processed.anomalyScore * 100).toFixed(0))
      .replace(/\{deviation\}/g, processed.deviation.toFixed(1))
      .replace(/\{rateOfChange\}/g, processed.rateOfChange.toFixed(1))
      .replace(/\{baseline_mean\}/g, String(processed.baseline?.mean?.toFixed(1) ?? 'N/A'))
      .replace(/\{unit\}/g, signal.unit ?? '')
      .replace(/\{timestamp\}/g, new Date(signal.timestamp).toLocaleString('he-IL'));
  }


  // ─── פעולות על התראות ─────────────────────────────────────────────

  acknowledge(alertId: string, by: string, comment?: string): void {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.state !== 'triggered') return;
    alert.state = 'acknowledged';
    alert.lifecycle.acknowledgedAt = Date.now();
    alert.lifecycle.acknowledgedBy = by;
    alert.metrics.timeToAckMs = Date.now() - alert.lifecycle.triggeredAt;
    alert.audit.push({ timestamp: Date.now(), action: 'acknowledged', actor: by, detail: comment ?? '' });
  }

  investigate(alertId: string, by: string): void {
    const alert = this.alerts.get(alertId);
    if (!alert) return;
    alert.state = 'investigating';
    alert.lifecycle.investigatingAt = Date.now();
    alert.lifecycle.investigatingBy = by;
    alert.audit.push({ timestamp: Date.now(), action: 'investigating', actor: by, detail: '' });
  }

  mitigate(alertId: string, by: string, detail: string): void {
    const alert = this.alerts.get(alertId);
    if (!alert) return;
    alert.state = 'mitigated';
    alert.lifecycle.mitigatedAt = Date.now();
    alert.lifecycle.mitigatedBy = by;
    alert.audit.push({ timestamp: Date.now(), action: 'mitigated', actor: by, detail });
  }

  resolve(alertId: string, by: string, reason: string): void {
    const alert = this.alerts.get(alertId);
    if (!alert) return;
    alert.state = 'resolved';
    alert.lifecycle.resolvedAt = Date.now();
    alert.lifecycle.resolvedBy = by;
    alert.lifecycle.resolvedReason = reason;
    alert.metrics.timeToResolveMs = Date.now() - alert.lifecycle.triggeredAt;
    alert.audit.push({ timestamp: Date.now(), action: 'resolved', actor: by, detail: reason });
    this.stats.totalResolved++;
  }

  snooze(alertId: string, durationMs: number, by: string): void {
    const alert = this.alerts.get(alertId);
    if (!alert) return;
    alert.state = 'silenced';
    alert.lifecycle.autoResolveAt = Date.now() + durationMs;
    alert.metrics.snoozeCount++;
    alert.audit.push({ timestamp: Date.now(), action: 'snoozed', actor: by, detail: `${durationMs / 60000} דקות` });
  }

  addNote(alertId: string, author: string, text: string): void {
    const alert = this.alerts.get(alertId);
    if (!alert) return;
    alert.notes.push({ timestamp: Date.now(), author, text });
    alert.audit.push({ timestamp: Date.now(), action: 'note_added', actor: author, detail: text.slice(0, 100) });
  }

  addPostMortem(alertId: string, postMortem: Alert['postMortem']): void {
    const alert = this.alerts.get(alertId);
    if (alert) { alert.postMortem = postMortem; alert.audit.push({ timestamp: Date.now(), action: 'post_mortem_added', actor: postMortem?.createdBy ?? 'system', detail: '' }); }
  }

  // ─── Lifecycle check — הרץ כל דקה ─────────────────────────────────

  async runLifecycleCheck(): Promise<void> {
    const activeAlerts = Array.from(this.alerts.values()).filter(a => !['resolved', 'auto_resolved', 'expired'].includes(a.state));
    const actions = this.lifecycleManager.check(activeAlerts, this.routingEngine);

    for (const action of actions) {
      if (action.action === 'escalate') {
        const alert = this.alerts.get(action.alertId);
        if (alert) {
          this.stats.totalEscalated++;
          // re-route for escalation level
          const routes = this.routingEngine.route(alert);
          for (const route of routes) {
            if (this.sendHandler) {
              await this.sendHandler(route.channel, route.address, `⬆️ ESCALATED: ${alert.title}`, `${alert.message}\n\n⬆️ אסקלציה רמה ${alert.routing.escalationLevel + 1}`, alert.severity);
            }
          }
        }
      }
    }

    // Cleanup
    this.correlationEngine.cleanup();
    this.suppressionEngine.cleanup();
  }

  /** התחל lifecycle check אוטומטי */
  private lifecycleInterval: ReturnType<typeof setInterval> | null = null;
  startLifecycleLoop(intervalMs: number = 60000): void {
    this.lifecycleInterval = setInterval(() => this.runLifecycleCheck(), intervalMs);
  }
  stopLifecycleLoop(): void { if (this.lifecycleInterval) clearInterval(this.lifecycleInterval); }

  // ─── שליפות ──

  getAlert(id: string): Alert | undefined { return this.alerts.get(id); }
  getActiveAlerts(): Alert[] { return Array.from(this.alerts.values()).filter(a => ['triggered', 'acknowledged', 'investigating', 'mitigated'].includes(a.state)).sort((a, b) => b.timestamp - a.timestamp); }
  getAllAlerts(limit: number = 100): Alert[] { return Array.from(this.alerts.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, limit); }
  getAlertsByCategory(category: string): Alert[] { return Array.from(this.alerts.values()).filter(a => a.category === category); }
  getAlertsBySeverity(severity: Severity): Alert[] { return Array.from(this.alerts.values()).filter(a => a.severity === severity); }

  getStats() {
    const active = this.getActiveAlerts();
    const slaBreached = active.filter(a => a.lifecycle.slaBreached);
    return {
      ...this.stats,
      activeAlerts: active.length,
      bySeverity: {
        P1: active.filter(a => a.severity === 'P1_CRITICAL').length,
        P2: active.filter(a => a.severity === 'P2_HIGH').length,
        P3: active.filter(a => a.severity === 'P3_MEDIUM').length,
        P4: active.filter(a => a.severity === 'P4_LOW').length,
        P5: active.filter(a => a.severity === 'P5_INFO').length,
      },
      slaBreached: slaBreached.length,
      avgTimeToAckMs: (() => {
        const acked = Array.from(this.alerts.values()).filter(a => a.metrics.timeToAckMs);
        return acked.length > 0 ? Math.round(acked.reduce((s, a) => s + (a.metrics.timeToAckMs ?? 0), 0) / acked.length) : 0;
      })(),
      avgTimeToResolveMs: (() => {
        const resolved = Array.from(this.alerts.values()).filter(a => a.metrics.timeToResolveMs);
        return resolved.length > 0 ? Math.round(resolved.reduce((s, a) => s + (a.metrics.timeToResolveMs ?? 0), 0) / resolved.length) : 0;
      })(),
      rules: this.ruleEngine.getRules().length,
      activeSuppressions: this.suppressionEngine.getActiveSuppressions().length,
      activeMaintenanceWindows: this.suppressionEngine.getActiveMaintenanceWindows().length,
    };
  }

  /** דוח */
  printDashboard(): void {
    const stats = this.getStats();
    const active = this.getActiveAlerts().slice(0, 10);
    const fmtMs = (ms: number) => ms < 60000 ? `${Math.round(ms/1000)}s` : ms < 3600000 ? `${Math.round(ms/60000)}m` : `${(ms/3600000).toFixed(1)}h`;

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   🚨 ONYX IAS — Intelligent Alert System                       ║
╠══════════════════════════════════════════════════════════════════╣
║
║   סיגנלים שנקלטו: ${String(stats.totalSignals).padEnd(8)} התראות שנוצרו: ${stats.totalAlerts}
║   דוכאו: ${String(stats.totalSuppressed).padEnd(15)} תואמו: ${stats.totalCorrelated}
║   אסקלציות: ${String(stats.totalEscalated).padEnd(12)} נפתרו: ${stats.totalResolved}
║
║   ── התראות פעילות: ${stats.activeAlerts} ──
║   🚨 P1: ${stats.bySeverity.P1}  🔴 P2: ${stats.bySeverity.P2}  🟡 P3: ${stats.bySeverity.P3}  🔵 P4: ${stats.bySeverity.P4}  ℹ️ P5: ${stats.bySeverity.P5}
║
║   ⚡ SLA הופר: ${stats.slaBreached}
║   ⏱️ זמן ממוצע ל-ACK: ${fmtMs(stats.avgTimeToAckMs)}
║   ⏱️ זמן ממוצע לפתרון: ${fmtMs(stats.avgTimeToResolveMs)}
║
║   📏 כללים: ${stats.rules} | 🔇 דיכויים: ${stats.activeSuppressions} | 🔧 תחזוקה: ${stats.activeMaintenanceWindows}
║
${active.length > 0 ? `║   ── אחרונות ──\n${active.map(a => {
  const icon = { P1_CRITICAL: '🚨', P2_HIGH: '🔴', P3_MEDIUM: '🟡', P4_LOW: '🔵', P5_INFO: 'ℹ️' }[a.severity];
  const stateIcon = { triggered: '⚡', acknowledged: '👁️', investigating: '🔍', mitigated: '🛡️' }[a.state] ?? '❓';
  return `║   ${icon}${stateIcon} ${a.title.slice(0, 50)} [${a.state}] ${fmtMs(Date.now() - a.timestamp)} ago`;
}).join('\n')}` : '║   ✅ אין התראות פעילות'}
║
╚══════════════════════════════════════════════════════════════════╝`);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: BUILT-IN RULES — כללים מובנים לטכנו כל עוזי
// ═══════════════════════════════════════════════════════════════════════════

export function loadBuiltInRules(ias: IntelligentAlertSystem): void {
  // ── פיננסי ──

  ias.ruleEngine.addRule({
    name: 'תזרים מזומנים קריטי', description: 'Runway פחות מ-2 חודשים', active: true,
    signalTypes: ['metric'], signalCategories: ['cashflow'],
    condition: { type: 'threshold', operator: '<', value: 2 },
    baseSeverity: 'P1_CRITICAL',
    titleTemplate: '🔴 תזרים מזומנים קריטי — runway {value} חודשים',
    messageTemplate: 'Runway: {value} חודשים\nנדרשת פעולה מיידית לשיפור תזרים',
    channels: ['whatsapp', 'sms', 'email'], cooldownMs: 86400000,
    escalationPolicyId: 'financial_escalation', tags: ['financial', 'critical'],
    priority: 100, correlationGroup: 'cashflow',
  });

  ias.ruleEngine.addRule({
    name: 'חוב באיחור גבוה', description: 'חוב באיחור מעל ₪100K', active: true,
    signalTypes: ['metric'], signalCategories: ['receivables_overdue'],
    condition: { type: 'threshold', operator: '>', value: 100000 },
    baseSeverity: 'P2_HIGH',
    titleTemplate: 'חוב באיחור: ₪{value}',
    messageTemplate: 'חוב לגבייה באיחור: ₪{value}\nנא לבדוק ולטפל',
    channels: ['whatsapp', 'email'], cooldownMs: 86400000, tags: ['financial'], priority: 85,
  });

  ias.ruleEngine.addRule({
    name: 'רווחיות שלילית', description: 'רווח חודשי שלילי', active: true,
    signalTypes: ['metric'], signalCategories: ['monthly_profit'],
    condition: { type: 'threshold', operator: '<', value: 0 },
    baseSeverity: 'P1_CRITICAL',
    titleTemplate: '🔴 הפסד החודש: ₪{value}',
    messageTemplate: 'הפסד של ₪{value} החודש.\nנדרש ניתוח הוצאות מיידי.',
    channels: ['whatsapp', 'sms', 'email'], cooldownMs: 604800000, tags: ['financial'], priority: 98,
  });

  ias.ruleEngine.addRule({
    name: 'הוצאה חריגה', description: 'הוצאה בודדת חריגה (3σ)', active: true,
    signalTypes: ['metric'], signalCategories: ['expense'],
    condition: { type: 'anomaly', deviationMultiplier: 3, minSamples: 20 },
    baseSeverity: 'P3_MEDIUM',
    titleTemplate: 'הוצאה חריגה: ₪{value}',
    messageTemplate: 'הוצאה של ₪{value} — חריגה של {deviation}σ מהממוצע ({baseline_mean})\nנא לאמת.',
    channels: ['whatsapp'], cooldownMs: 3600000, tags: ['financial', 'anomaly'], priority: 70,
  });

  // ── תפעולי ──

  ias.ruleEngine.addRule({
    name: 'פרויקט באיחור', description: 'פרויקט חרג מדדליין', active: true,
    signalTypes: ['event'], signalCategories: ['project_overdue'],
    condition: { type: 'threshold', operator: '>', value: 0 },
    baseSeverity: 'P2_HIGH',
    titleTemplate: 'פרויקט באיחור: {value}',
    messageTemplate: 'פרויקט "{value}" חרג מהדדליין.\nיש לבדוק סטטוס ולעדכן לקוח.',
    channels: ['whatsapp'], cooldownMs: 86400000, tags: ['operations'], priority: 80,
  });

  ias.ruleEngine.addRule({
    name: 'חריגת תקציב פרויקט', description: 'הוצאות פרויקט עברו 90% מהתקציב', active: true,
    signalTypes: ['metric'], signalCategories: ['project_budget_usage'],
    condition: { type: 'threshold', operator: '>', value: 90 },
    baseSeverity: 'P2_HIGH',
    titleTemplate: 'חריגת תקציב: {value}% ניצולת',
    messageTemplate: 'ניצולת תקציב: {value}%\nעלות עלולה לחרוג.',
    channels: ['whatsapp', 'email'], cooldownMs: 86400000, tags: ['operations', 'financial'], priority: 78,
  });

  ias.ruleEngine.addRule({
    name: 'קבלן לא הגיע', description: 'קבלן לא דיווח הגעה', active: true,
    signalTypes: ['heartbeat_missing'], signalCategories: ['subcontractor_checkin'],
    condition: { type: 'absence', expectedIntervalMs: 28800000, gracePeriodMs: 3600000 }, // 8 שעות + שעה grace
    baseSeverity: 'P3_MEDIUM',
    titleTemplate: 'קבלן לא דיווח: {source}',
    messageTemplate: 'קבלן {source} לא דיווח הגעה לאתר.\nזמן מ-check-in אחרון: מעל 9 שעות.',
    channels: ['whatsapp'], cooldownMs: 43200000, tags: ['operations', 'workforce'], priority: 65,
  });

  // ── איכות ──

  ias.ruleEngine.addRule({
    name: 'תלונת לקוח', description: 'תלונת לקוח חדשה', active: true,
    signalTypes: ['event'], signalCategories: ['client_complaint'],
    condition: { type: 'threshold', operator: '>=', value: 1 },
    baseSeverity: 'P2_HIGH',
    titleTemplate: 'תלונת לקוח: {value}',
    messageTemplate: 'תלונה חדשה מלקוח: "{value}"\nנדרש טיפול מיידי.',
    channels: ['whatsapp', 'email'], cooldownMs: 0, tags: ['clients', 'quality'], priority: 82,
  });

  // ── מערכת ──

  ias.ruleEngine.addRule({
    name: 'שגיאת אינטגרציה', description: 'כלי חיצוני נכשל', active: true,
    signalTypes: ['event', 'log'], signalCategories: ['integration_error'],
    condition: { type: 'frequency', count: 5, windowMs: 300000 },
    baseSeverity: 'P3_MEDIUM',
    titleTemplate: 'שגיאת אינטגרציה: {source}',
    messageTemplate: '5+ שגיאות ב-5 דקות מ-{source}\nCircuit breaker עלול להיפתח.',
    channels: ['whatsapp', 'slack'], cooldownMs: 600000, tags: ['system'], priority: 60, correlationGroup: 'integration_errors',
  });

  ias.ruleEngine.addRule({
    name: 'ביטוח פג תוקף', description: 'פוליסת ביטוח קבלן פגה', active: true,
    signalTypes: ['event'], signalCategories: ['insurance_expired'],
    condition: { type: 'threshold', operator: '>=', value: 1 },
    baseSeverity: 'P1_CRITICAL',
    titleTemplate: '🔴 ביטוח פג תוקף: {value}',
    messageTemplate: 'ביטוח של "{value}" פג תוקף!\nאסור להעסיק קבלן ללא ביטוח בתוקף.\nנדרשת פעולה מיידית.',
    channels: ['whatsapp', 'sms', 'email'], cooldownMs: 86400000, tags: ['compliance', 'legal', 'critical'], priority: 99,
  });

  ias.ruleEngine.addRule({
    name: 'ירידה בציון בריאות', description: 'ציון בריאות חברה ירד מתחת ל-50', active: true,
    signalTypes: ['metric'], signalCategories: ['company_health_score'],
    condition: { type: 'composite', operator: 'AND', conditions: [
      { type: 'threshold', operator: '<', value: 50 },
      { type: 'rate_of_change', changePercent: 10, windowMs: 86400000, direction: 'decrease' },
    ]},
    baseSeverity: 'P2_HIGH',
    titleTemplate: 'ירידה בציון בריאות: {value}/100',
    messageTemplate: 'ציון בריאות החברה: {value}/100 (ירידה של {rateOfChange}%)\nנדרשת בדיקה.',
    channels: ['whatsapp'], cooldownMs: 86400000, tags: ['company_health'], priority: 88,
  });

  console.log(`✅ נטענו ${ias.ruleEngine.getRules().length} כללי התראה מובנים`);
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  SignalProcessor, RuleEngine, CorrelationEngine, SeverityCalculator,
  SuppressionEngine, RoutingEngine, LifecycleManager,
};

export type {
  Signal, SignalType, ProcessedSignal,
  AlertRule, AlertCondition, AutoAction,
  Alert, AlertState, Severity, Channel,
  Recipient, OnCallSchedule,
  EscalationPolicy, EscalationLevel,
  MaintenanceWindow, SuppressionRule,
};


// ═══════════════════════════════════════════════════════════════════════════
// שימוש
// ═══════════════════════════════════════════════════════════════════════════
//
// const ias = new IntelligentAlertSystem({ correlationWindowMs: 300000 });
//
// // טען כללים מובנים
// loadBuiltInRules(ias);
//
// // הוסף נמענים
// ias.routingEngine.addRecipient({
//   id: 'kobi', name: 'קובי', role: 'CEO',
//   channels: { whatsapp: '+972...', sms: '+972...', email: 'kobi@technokoluzi.com' },
//   minSeverity: 'P3_MEDIUM', categories: [], active: true,
//   quietHours: { start: 23, end: 6, timezone: 'Asia/Jerusalem', overrideForP1: true },
//   onCall: true,
// });
//
// ias.routingEngine.addRecipient({
//   id: 'dima', name: 'דימה', role: 'Operations',
//   channels: { whatsapp: '+972...' },
//   minSeverity: 'P3_MEDIUM', categories: ['operations', 'workforce', 'quality'],
//   active: true, onCall: true,
//   quietHours: { start: 22, end: 7, timezone: 'Asia/Jerusalem', overrideForP1: true },
// });
//
// // escalation policy
// ias.routingEngine.addEscalationPolicy({
//   id: 'financial_escalation', name: 'Financial Escalation',
//   levels: [
//     { waitMs: 300000, recipientIds: ['kobi'], channels: ['whatsapp'] },          // 5 min → קובי
//     { waitMs: 900000, recipientIds: ['kobi'], channels: ['whatsapp', 'sms'] },   // 15 min → קובי + SMS
//     { waitMs: 1800000, recipientIds: ['kobi'], channels: ['phone_call'] },       // 30 min → שיחה
//   ],
//   finalAction: 'loop', appliesTo: ['P1_CRITICAL', 'P2_HIGH'],
// });
//
// // maintenance window
// ias.suppressionEngine.addMaintenanceWindow({
//   name: 'שדרוג מערכת', description: 'שדרוג סופ"ש',
//   startTime: new Date('2026-04-18T22:00:00').getTime(),
//   endTime: new Date('2026-04-19T06:00:00').getTime(),
//   categories: ['system'], sources: [], suppressP1: false,
//   createdBy: 'kobi', active: true,
// });
//
// // חבר ל-ONYX integrations
// ias.setSendHandler(async (channel, address, title, message, severity) => {
//   // onyx.toolRegistry.invoke(`${channel}.send_text`, { to: address, message: `${title}\n\n${message}` }, ...);
//   return true;
// });
//
// // התחל lifecycle loop
// ias.startLifecycleLoop(60000);
//
// // ── שלח סיגנלים ──
//
// await ias.ingestSignal({
//   type: 'metric', source: 'finance_module', category: 'cashflow',
//   value: 1.5, unit: 'months',
// });
// // → 🚨 [P1_CRITICAL] תזרים מזומנים קריטי — runway 1.5 חודשים → WhatsApp + SMS + Email
//
// await ias.ingestSignal({
//   type: 'event', source: 'crm', category: 'client_complaint',
//   value: 'הלקוח מתלונן על איחור של שבועיים',
//   metadata: { clientName: 'חברת כנען', projectId: 'proj_123' },
//   tags: ['project_related'],
// });
// // → 🔴 [P2_HIGH] תלונת לקוח → WhatsApp + Email
//
// await ias.ingestSignal({
//   type: 'metric', source: 'accounting', category: 'expense',
//   value: 85000, unit: 'ILS',
// });
// // → אם חריגה של 3σ מהממוצע → 🟡 [P3_MEDIUM] הוצאה חריגה
//
// ias.printDashboard();


// ═══════════════════════════════════════════════════════════════════════════
// BROWSER SINGLETON + SEED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** singleton — one alert system instance for the whole app */
export const IAS = new IntelligentAlertSystem({ correlationWindowMs: 300000 });

/** initialize the default rules, recipients, escalation policies — idempotent */
let iasInitialized = false;
export function initIAS(): void {
  if (iasInitialized) return;
  iasInitialized = true;

  loadBuiltInRules(IAS);

  IAS.routingEngine.addRecipient({
    id: 'kobi', name: 'קובי', role: 'CEO',
    channels: { whatsapp: '+972501111111', sms: '+972501111111', email: 'kobi@technokoluzi.com' },
    minSeverity: 'P3_MEDIUM', categories: [], active: true,
    quietHours: { start: 23, end: 6, timezone: 'Asia/Jerusalem', overrideForP1: true },
    onCall: true,
  });
  IAS.routingEngine.addRecipient({
    id: 'dima', name: 'דימה', role: 'Operations',
    channels: { whatsapp: '+972501112233', email: 'dima@technokoluzi.com' },
    minSeverity: 'P3_MEDIUM', categories: ['operations', 'workforce', 'quality', 'production'],
    active: true, onCall: true,
    quietHours: { start: 22, end: 7, timezone: 'Asia/Jerusalem', overrideForP1: true },
  });
  IAS.routingEngine.addRecipient({
    id: 'corin', name: 'קורין', role: 'HR / Office',
    channels: { whatsapp: '+972503334455', email: 'corin@technokoluzi.com' },
    minSeverity: 'P4_LOW', categories: ['hr', 'admin', 'workforce'],
    active: true, onCall: false,
    quietHours: { start: 20, end: 8, timezone: 'Asia/Jerusalem', overrideForP1: true },
  });

  IAS.routingEngine.addEscalationPolicy({
    id: 'financial_escalation', name: 'Financial Escalation',
    levels: [
      { waitMs: 300000, recipientIds: ['kobi'], channels: ['whatsapp'] },
      { waitMs: 900000, recipientIds: ['kobi'], channels: ['whatsapp', 'sms'] },
      { waitMs: 1800000, recipientIds: ['kobi'], channels: ['phone_call'] },
    ],
    finalAction: 'loop', appliesTo: ['P1_CRITICAL', 'P2_HIGH'],
  });
  IAS.routingEngine.addEscalationPolicy({
    id: 'operations_escalation', name: 'Operations Escalation',
    levels: [
      { waitMs: 300000, recipientIds: ['dima'], channels: ['whatsapp'] },
      { waitMs: 900000, recipientIds: ['dima', 'kobi'], channels: ['whatsapp', 'sms'] },
    ],
    finalAction: 'loop', appliesTo: ['P1_CRITICAL', 'P2_HIGH'],
  });

  IAS.startLifecycleLoop(60000);
}

/** UI-ready snapshot accessor */
export function getIASSnapshot() {
  return {
    stats: IAS.getStats(),
    alerts: IAS.getAllAlerts(200),
    activeAlerts: IAS.getActiveAlerts(),
    rules: IAS.ruleEngine.getRules(),
    recipients: IAS.routingEngine.getAllRecipients(),
    escalationPolicies: IAS.routingEngine.getAllEscalationPolicies(),
    maintenanceWindows: IAS.suppressionEngine.getAllMaintenanceWindows(),
    activeMaintenanceWindows: IAS.suppressionEngine.getActiveMaintenanceWindows(),
    suppressionRules: IAS.suppressionEngine.getAllSuppressionRules(),
    activeSuppressions: IAS.suppressionEngine.getActiveSuppressions(),
  };
}

/** quick-fire a demo signal for testing the UI */
export async function demoSignal(type: 'cashflow' | 'complaint' | 'expense' | 'budget' | 'health') {
  const presets: Record<string, Parameters<typeof IAS.ingestSignal>[0]> = {
    cashflow:  { type: 'metric', source: 'finance_module', category: 'cashflow', value: 1.5, unit: 'months' },
    complaint: { type: 'event', source: 'crm', category: 'client_complaint', value: 'הלקוח מתלונן על איחור של שבועיים', metadata: { clientName: 'חברת כנען' }, tags: ['project_related'] },
    expense:   { type: 'metric', source: 'accounting', category: 'expense', value: 85000, unit: 'ILS' },
    budget:    { type: 'metric', source: 'project_tracker', category: 'budget_overrun', value: 18, unit: '%' },
    health:    { type: 'metric', source: 'situation_engine', category: 'health_score', value: 45, unit: 'score' },
  };
  return IAS.ingestSignal(presets[type]);
}
