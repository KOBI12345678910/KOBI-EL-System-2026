/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   ONYX DOCUMENT MANAGEMENT SYSTEM (DMS)                               ║
 * ║   מערכת ניהול מסמכים מוסדית — ברמה שמעבר ל-BlackRock                  ║
 * ║                                                                        ║
 * ║   כל מסמך שנכנס:                                                      ║
 * ║   → מסווג אוטומטית                                                    ║
 * ║   → נכנס לתיקיה הנכונה                                                ║
 * ║   → מקושר ליישות (עובד/ספק/לקוח/פרויקט)                              ║
 * ║   → מקבל גרסאות + audit trail                                         ║
 * ║   → מוצפן + הרשאות                                                    ║
 * ║   → retention policy אוטומטית                                          ║
 * ║   → full-text search                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   FOLDER STRUCTURE (AUTO-GENERATED):
 *
 *   /ONYX_DMS
 *   ├── /חברה
 *   │   ├── /רישום_ורישיונות
 *   │   ├── /תקנון_ונהלים
 *   │   ├── /ביטוח
 *   │   ├── /משפטי
 *   │   └── /כללי
 *   ├── /עובדים
 *   │   ├── /[שם_עובד]
 *   │   │   ├── /חוזה_העסקה
 *   │   │   ├── /תעודות
 *   │   │   ├── /תלושי_שכר
 *   │   │   ├── /הערכות_ביצוע
 *   │   │   ├── /משמעת
 *   │   │   └── /כללי
 *   │   └── /טפסים_כלליים
 *   ├── /ספקים
 *   │   ├── /[שם_ספק]
 *   │   │   ├── /חוזים
 *   │   │   ├── /הצעות_מחיר
 *   │   │   ├── /חשבוניות
 *   │   │   ├── /תעודות_משלוח
 *   │   │   └── /כללי
 *   │   └── /טפסים_כלליים
 *   ├── /קבלני_משנה
 *   │   └── /[שם_קבלן]
 *   │       ├── /חוזים
 *   │       ├── /הזמנות_עבודה
 *   │       ├── /חשבוניות
 *   │       ├── /ביטוח_וערבויות
 *   │       └── /כללי
 *   ├── /לקוחות
 *   │   └── /[שם_לקוח]
 *   │       ├── /הצעות_מחיר
 *   │       ├── /חוזים
 *   │       ├── /חשבוניות
 *   │       ├── /תכניות_ושרטוטים
 *   │       └── /התכתבות
 *   ├── /פרויקטים
 *   │   └── /[שם_פרויקט]
 *   │       ├── /תכניות
 *   │       ├── /היתרים
 *   │       ├── /חוזים
 *   │       ├── /הזמנות_רכש
 *   │       ├── /דוחות_ביצוע
 *   │       ├── /תמונות
 *   │       ├── /מדידות
 *   │       ├── /בטיחות
 *   │       └── /כללי
 *   ├── /כספים
 *   │   ├── /חשבוניות_נכנסות
 *   │   ├── /חשבוניות_יוצאות
 *   │   ├── /קבלות
 *   │   ├── /דוחות_כספיים
 *   │   ├── /מס_הכנסה
 *   │   ├── /מע"מ
 *   │   ├── /ביטוח_לאומי
 *   │   └── /בנקים
 *   ├── /נדל"ן
 *   │   └── /[שם_נכס]
 *   │       ├── /שמאויות
 *   │       ├── /חוזים
 *   │       ├── /היתרים
 *   │       ├── /תכניות
 *   │       └── /כללי
 *   └── /ארכיון
 *       └── /[שנה]
 */

import * as crypto from 'crypto';


// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** קטגוריות מסמך ראשיות */
type DocumentCategory =
  | 'contract'              // חוזה
  | 'invoice_incoming'      // חשבונית נכנסת (מספק)
  | 'invoice_outgoing'      // חשבונית יוצאת (ללקוח)
  | 'receipt'               // קבלה
  | 'quote_incoming'        // הצעת מחיר נכנסת (מספק)
  | 'quote_outgoing'        // הצעת מחיר יוצאת (ללקוח)
  | 'work_order'            // הזמנת עבודה
  | 'purchase_order'        // הזמנת רכש
  | 'delivery_note'         // תעודת משלוח
  | 'employment_contract'   // חוזה העסקה
  | 'payslip'               // תלוש שכר
  | 'certificate'           // תעודה / רישיון
  | 'insurance'             // ביטוח
  | 'guarantee'             // ערבות
  | 'permit'                // היתר
  | 'plan'                  // תכנית / שרטוט
  | 'measurement'           // מדידה
  | 'photo'                 // תמונה
  | 'report'                // דוח
  | 'letter'                // מכתב
  | 'legal'                 // משפטי
  | 'tax'                   // מס
  | 'bank'                  // בנק
  | 'appraisal'             // שמאות
  | 'safety'                // בטיחות
  | 'protocol'              // פרוטוקול
  | 'presentation'          // מצגת
  | 'correspondence'        // התכתבות
  | 'performance_review'    // הערכת ביצוע
  | 'disciplinary'          // משמעת
  | 'policy'                // נוהל / מדיניות
  | 'general';              // כללי

/** לאיזה ישות המסמך שייך */
type EntityType = 'company' | 'employee' | 'supplier' | 'subcontractor' | 'client' | 'project' | 'finance' | 'real_estate';

/** סטטוס מסמך */
type DocumentStatus = 'draft' | 'active' | 'pending_approval' | 'approved' | 'rejected' | 'expired' | 'archived' | 'deleted';

/** רמת סיווג ביטחוני */
type ClassificationLevel = 'public' | 'internal' | 'confidential' | 'restricted';

/** סוג קובץ */
type FileType = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'jpg' | 'png' | 'dwg' | 'dxf' | 'email' | 'txt' | 'csv' | 'zip' | 'other';

/** מסמך */
interface Document {
  id: string;
  /** שם המסמך */
  name: string;
  /** תיאור */
  description: string;
  /** קטגוריה */
  category: DocumentCategory;
  /** ישות קשורה */
  entity: { type: EntityType; id: string; name: string };
  /** תיקיה */
  folderPath: string;
  /** גרסה נוכחית */
  currentVersion: number;
  /** כל הגרסאות */
  versions: DocumentVersion[];
  /** סטטוס */
  status: DocumentStatus;
  /** רמת סיווג */
  classification: ClassificationLevel;
  /** תגיות חיפוש */
  tags: string[];
  /** מטא-דאטא מותאם */
  metadata: Record<string, unknown>;
  /** תאריכים */
  dates: {
    created: number;
    modified: number;
    expires?: number;         // תוקף מסמך
    retentionUntil?: number;  // עד מתי לשמור
    archivedAt?: number;
  };
  /** בעלות */
  ownership: {
    createdBy: string;
    modifiedBy: string;
    owner: string;            // בעל המסמך
    department?: string;
  };
  /** הרשאות */
  permissions: DocumentPermission[];
  /** קשרים למסמכים אחרים */
  relatedDocuments: string[];
  /** סכומים כספיים (לחשבוניות/הצעות) */
  financialData?: {
    amount?: number;
    currency?: string;
    vatAmount?: number;
    total?: number;
    dueDate?: number;
    paid?: boolean;
  };
  /** חתימות */
  signatures: DocumentSignature[];
  /** הערות */
  notes: DocumentNote[];
  /** workflow */
  workflow?: DocumentWorkflow;
  /** audit trail */
  auditTrail: AuditEntry[];
  /** hash לזיהוי כפילויות */
  contentHash: string;
}

/** גרסת מסמך */
interface DocumentVersion {
  version: number;
  fileType: FileType;
  fileName: string;
  fileSize: number;
  filePath: string;          // נתיב אחסון
  contentHash: string;
  uploadedAt: number;
  uploadedBy: string;
  changeDescription: string;
  /** טקסט שחולץ (OCR / text extraction) */
  extractedText?: string;
}

/** הרשאת מסמך */
interface DocumentPermission {
  principalId: string;       // userId / groupId / role
  principalType: 'user' | 'group' | 'role' | 'department';
  access: 'read' | 'write' | 'admin' | 'none';
  grantedBy: string;
  grantedAt: number;
  expiresAt?: number;
}

/** חתימה על מסמך */
interface DocumentSignature {
  signerId: string;
  signerName: string;
  signedAt: number;
  signatureType: 'digital' | 'manual' | 'approval';
  verified: boolean;
  hash: string;
}

/** הערה על מסמך */
interface DocumentNote {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
  pinned: boolean;
}

/** workflow מסמך */
interface DocumentWorkflow {
  id: string;
  type: 'approval' | 'review' | 'sign' | 'custom';
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  steps: WorkflowStep[];
  currentStepIndex: number;
  startedAt: number;
  completedAt?: number;
}

interface WorkflowStep {
  name: string;
  assigneeId: string;
  assigneeName: string;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  completedAt?: number;
  comment?: string;
}

/** רשומת audit */
interface AuditEntry {
  timestamp: number;
  action: string;
  actorId: string;
  actorName: string;
  detail: string;
  previousValue?: unknown;
  newValue?: unknown;
}

/** מדיניות שימור (retention) */
interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  /** על אילו קטגוריות חל */
  appliesTo: DocumentCategory[];
  /** כמה זמן לשמור (ימים) */
  retentionDays: number;
  /** מה לעשות בסוף */
  action: 'archive' | 'delete' | 'review';
  /** האם חל גם על מסמכים פעילים */
  includeActive: boolean;
  active: boolean;
}

/** תבנית תיקיה */
interface FolderTemplate {
  name: string;
  subfolders: string[];
}

/** תוצאת חיפוש */
interface SearchResult {
  document: Document;
  relevanceScore: number;
  matchedFields: string[];
  snippet?: string;
}

/** סטטיסטיקות DMS */
interface DMSStats {
  totalDocuments: number;
  totalVersions: number;
  totalSizeBytes: number;
  byCategory: Record<string, number>;
  byEntity: Record<string, number>;
  byStatus: Record<string, number>;
  byClassification: Record<string, number>;
  expiringSoon: number;        // תוך 30 יום
  pendingApproval: number;
  recentlyModified: number;    // 7 ימים אחרונים
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: FOLDER STRUCTURE MANAGER
// ═══════════════════════════════════════════════════════════════════════════

class FolderManager {
  private entityFolders: Map<string, string[]> = new Map(); // entityKey → created folder paths

  /** מבנה תיקיות לכל סוג ישות */
  private templates: Record<EntityType, FolderTemplate> = {
    company: { name: 'חברה', subfolders: ['רישום_ורישיונות', 'תקנון_ונהלים', 'ביטוח', 'משפטי', 'כללי'] },
    employee: { name: 'עובדים', subfolders: ['חוזה_העסקה', 'תעודות', 'תלושי_שכר', 'הערכות_ביצוע', 'משמעת', 'כללי'] },
    supplier: { name: 'ספקים', subfolders: ['חוזים', 'הצעות_מחיר', 'חשבוניות', 'תעודות_משלוח', 'כללי'] },
    subcontractor: { name: 'קבלני_משנה', subfolders: ['חוזים', 'הזמנות_עבודה', 'חשבוניות', 'ביטוח_וערבויות', 'כללי'] },
    client: { name: 'לקוחות', subfolders: ['הצעות_מחיר', 'חוזים', 'חשבוניות', 'תכניות_ושרטוטים', 'התכתבות'] },
    project: { name: 'פרויקטים', subfolders: ['תכניות', 'היתרים', 'חוזים', 'הזמנות_רכש', 'דוחות_ביצוע', 'תמונות', 'מדידות', 'בטיחות', 'כללי'] },
    finance: { name: 'כספים', subfolders: ['חשבוניות_נכנסות', 'חשבוניות_יוצאות', 'קבלות', 'דוחות_כספיים', 'מס_הכנסה', 'מעמ', 'ביטוח_לאומי', 'בנקים'] },
    real_estate: { name: 'נדלן', subfolders: ['שמאויות', 'חוזים', 'היתרים', 'תכניות', 'כללי'] },
  };

  /** מיפוי קטגוריית מסמך → שם תת-תיקיה */
  private categoryToSubfolder: Record<DocumentCategory, string> = {
    contract: 'חוזים',
    invoice_incoming: 'חשבוניות',
    invoice_outgoing: 'חשבוניות',
    receipt: 'קבלות',
    quote_incoming: 'הצעות_מחיר',
    quote_outgoing: 'הצעות_מחיר',
    work_order: 'הזמנות_עבודה',
    purchase_order: 'הזמנות_רכש',
    delivery_note: 'תעודות_משלוח',
    employment_contract: 'חוזה_העסקה',
    payslip: 'תלושי_שכר',
    certificate: 'תעודות',
    insurance: 'ביטוח_וערבויות',
    guarantee: 'ביטוח_וערבויות',
    permit: 'היתרים',
    plan: 'תכניות',
    measurement: 'מדידות',
    photo: 'תמונות',
    report: 'דוחות_ביצוע',
    letter: 'התכתבות',
    legal: 'משפטי',
    tax: 'מס_הכנסה',
    bank: 'בנקים',
    appraisal: 'שמאויות',
    safety: 'בטיחות',
    protocol: 'כללי',
    presentation: 'כללי',
    correspondence: 'התכתבות',
    performance_review: 'הערכות_ביצוע',
    disciplinary: 'משמעת',
    policy: 'תקנון_ונהלים',
    general: 'כללי',
  };

  /** חשב נתיב תיקיה למסמך */
  resolvePath(entityType: EntityType, entityName: string, category: DocumentCategory): string {
    const template = this.templates[entityType];
    const subfolder = this.categoryToSubfolder[category] ?? 'כללי';

    if (entityType === 'company') {
      return `/ONYX_DMS/${template.name}/${subfolder}`;
    }
    if (entityType === 'finance') {
      return `/ONYX_DMS/${template.name}/${subfolder}`;
    }

    const safeName = entityName.replace(/[\/\\:*?"<>|]/g, '_').trim();
    const basePath = `/ONYX_DMS/${template.name}/${safeName}`;
    const availableSubs = template.subfolders;

    // בדוק אם ה-subfolder קיים בתבנית
    if (availableSubs.includes(subfolder)) {
      return `${basePath}/${subfolder}`;
    }
    return `${basePath}/כללי`;
  }

  /** צור מבנה תיקיות ליישות חדשה */
  createEntityFolders(entityType: EntityType, entityName: string): string[] {
    const key = `${entityType}:${entityName}`;
    if (this.entityFolders.has(key)) return this.entityFolders.get(key)!;

    const template = this.templates[entityType];
    const safeName = entityName.replace(/[\/\\:*?"<>|]/g, '_').trim();
    const basePath = entityType === 'company' || entityType === 'finance'
      ? `/ONYX_DMS/${template.name}`
      : `/ONYX_DMS/${template.name}/${safeName}`;

    const paths = template.subfolders.map(sub => `${basePath}/${sub}`);
    this.entityFolders.set(key, paths);
    return paths;
  }

  /** שלוף תבנית */
  getTemplate(entityType: EntityType): FolderTemplate {
    return this.templates[entityType];
  }

  /** הוסף תת-תיקיה לתבנית */
  addSubfolder(entityType: EntityType, subfolderName: string): void {
    if (!this.templates[entityType].subfolders.includes(subfolderName)) {
      this.templates[entityType].subfolders.push(subfolderName);
    }
  }

  /** מבנה תיקיות מלא */
  getFullStructure(): Record<string, string[]> {
    const structure: Record<string, string[]> = {};
    for (const [type, template] of Object.entries(this.templates)) {
      structure[template.name] = template.subfolders;
    }
    return structure;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: DOCUMENT CLASSIFIER — סיווג אוטומטי
// ═══════════════════════════════════════════════════════════════════════════

class DocumentClassifier {
  /** סווג מסמך לפי שם קובץ, metadata, תוכן */
  classify(params: {
    fileName: string;
    metadata?: Record<string, unknown>;
    extractedText?: string;
    entityType?: EntityType;
    manualCategory?: DocumentCategory;
  }): {
    category: DocumentCategory;
    tags: string[];
    classification: ClassificationLevel;
    confidence: number;
  } {
    if (params.manualCategory) {
      return {
        category: params.manualCategory,
        tags: this.generateTags(params.manualCategory, params.fileName, params.extractedText),
        classification: this.determineClassification(params.manualCategory),
        confidence: 1.0,
      };
    }

    const fileName = params.fileName.toLowerCase();
    const text = (params.extractedText ?? '').toLowerCase();
    const combined = `${fileName} ${text}`;

    // כללי סיווג לפי מילות מפתח
    const rules: Array<{ keywords: string[]; category: DocumentCategory; confidence: number }> = [
      { keywords: ['חוזה', 'הסכם', 'contract', 'agreement'], category: 'contract', confidence: 0.9 },
      { keywords: ['חוזה העסקה', 'חוזה עבודה', 'employment'], category: 'employment_contract', confidence: 0.95 },
      { keywords: ['חשבונית מס', 'invoice', 'tax invoice'], category: 'invoice_incoming', confidence: 0.85 },
      { keywords: ['קבלה', 'receipt'], category: 'receipt', confidence: 0.85 },
      { keywords: ['הצעת מחיר', 'quotation', 'quote'], category: 'quote_outgoing', confidence: 0.85 },
      { keywords: ['הזמנת עבודה', 'work order'], category: 'work_order', confidence: 0.9 },
      { keywords: ['הזמנת רכש', 'purchase order'], category: 'purchase_order', confidence: 0.9 },
      { keywords: ['תעודת משלוח', 'delivery note'], category: 'delivery_note', confidence: 0.9 },
      { keywords: ['תלוש שכר', 'payslip', 'salary'], category: 'payslip', confidence: 0.95 },
      { keywords: ['תעודה', 'רישיון', 'certificate', 'license'], category: 'certificate', confidence: 0.8 },
      { keywords: ['ביטוח', 'פוליסה', 'insurance', 'policy'], category: 'insurance', confidence: 0.85 },
      { keywords: ['ערבות', 'guarantee', 'bond'], category: 'guarantee', confidence: 0.85 },
      { keywords: ['היתר', 'permit', 'רישיון בנייה'], category: 'permit', confidence: 0.85 },
      { keywords: ['תכנית', 'שרטוט', 'plan', 'drawing', 'dwg'], category: 'plan', confidence: 0.8 },
      { keywords: ['מדידה', 'measurement'], category: 'measurement', confidence: 0.85 },
      { keywords: ['דוח', 'report'], category: 'report', confidence: 0.7 },
      { keywords: ['מכתב', 'letter'], category: 'letter', confidence: 0.7 },
      { keywords: ['שמאות', 'appraisal', 'הערכת שווי'], category: 'appraisal', confidence: 0.9 },
      { keywords: ['בטיחות', 'safety'], category: 'safety', confidence: 0.85 },
      { keywords: ['פרוטוקול', 'protocol', 'minutes'], category: 'protocol', confidence: 0.8 },
      { keywords: ['מצגת', 'presentation'], category: 'presentation', confidence: 0.85 },
      { keywords: ['הערכת ביצוע', 'performance review'], category: 'performance_review', confidence: 0.9 },
      { keywords: ['משמעת', 'disciplinary'], category: 'disciplinary', confidence: 0.9 },
      { keywords: ['נוהל', 'מדיניות', 'policy', 'procedure'], category: 'policy', confidence: 0.8 },
      { keywords: ['מס הכנסה', 'tax', '856', '106'], category: 'tax', confidence: 0.85 },
      { keywords: ['בנק', 'bank', 'אשראי'], category: 'bank', confidence: 0.8 },
    ];

    // תמונות
    if (/\.(jpg|jpeg|png|gif|bmp|webp|heic)$/i.test(params.fileName)) {
      return { category: 'photo', tags: ['תמונה'], classification: 'internal', confidence: 0.95 };
    }

    // שרטוטים
    if (/\.(dwg|dxf)$/i.test(params.fileName)) {
      return { category: 'plan', tags: ['שרטוט', 'CAD'], classification: 'confidential', confidence: 0.95 };
    }

    // חפש התאמה הכי טובה
    let bestMatch: { category: DocumentCategory; confidence: number } = { category: 'general', confidence: 0.3 };

    for (const rule of rules) {
      const matchCount = rule.keywords.filter(kw => combined.includes(kw)).length;
      if (matchCount > 0) {
        const adjustedConfidence = rule.confidence * (matchCount / rule.keywords.length);
        if (adjustedConfidence > bestMatch.confidence) {
          bestMatch = { category: rule.category, confidence: Math.min(1, adjustedConfidence) };
        }
      }
    }

    return {
      category: bestMatch.category,
      tags: this.generateTags(bestMatch.category, params.fileName, params.extractedText),
      classification: this.determineClassification(bestMatch.category),
      confidence: bestMatch.confidence,
    };
  }

  private generateTags(category: DocumentCategory, fileName: string, text?: string): string[] {
    const tags: string[] = [category];
    const combined = `${fileName} ${text ?? ''}`.toLowerCase();

    if (combined.includes('ברזל') || combined.includes('iron')) tags.push('ברזל');
    if (combined.includes('אלומיניום') || combined.includes('aluminum')) tags.push('אלומיניום');
    if (combined.includes('מעקה') || combined.includes('railing')) tags.push('מעקות');
    if (combined.includes('שער') || combined.includes('gate')) tags.push('שערים');
    if (combined.includes('גדר') || combined.includes('fence')) tags.push('גדרות');
    if (combined.includes('פרגולה') || combined.includes('pergola')) tags.push('פרגולות');
    if (combined.includes('תל אביב')) tags.push('תל_אביב');

    const year = new Date().getFullYear().toString();
    if (combined.includes(year)) tags.push(year);

    return tags;
  }

  private determineClassification(category: DocumentCategory): ClassificationLevel {
    const confidential: DocumentCategory[] = ['employment_contract', 'payslip', 'disciplinary', 'performance_review', 'bank', 'tax'];
    const restricted: DocumentCategory[] = ['legal'];
    if (restricted.includes(category)) return 'restricted';
    if (confidential.includes(category)) return 'confidential';
    return 'internal';
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: DOCUMENT STORE — אחסון + גרסאות + חיפוש
// ═══════════════════════════════════════════════════════════════════════════

class DocumentStore {
  private documents: Map<string, Document> = new Map();
  private textIndex: Map<string, Set<string>> = new Map();           // word → docIds
  private categoryIndex: Map<DocumentCategory, Set<string>> = new Map();
  private entityIndex: Map<string, Set<string>> = new Map();         // entityKey → docIds
  private folderIndex: Map<string, Set<string>> = new Map();         // folderPath → docIds
  private tagIndex: Map<string, Set<string>> = new Map();
  private hashIndex: Map<string, string> = new Map();                // contentHash → docId (duplicate detection)

  /** שמור מסמך */
  store(doc: Document): void {
    this.documents.set(doc.id, doc);

    // אינדקסים
    if (!this.categoryIndex.has(doc.category)) this.categoryIndex.set(doc.category, new Set());
    this.categoryIndex.get(doc.category)!.add(doc.id);

    const entityKey = `${doc.entity.type}:${doc.entity.id}`;
    if (!this.entityIndex.has(entityKey)) this.entityIndex.set(entityKey, new Set());
    this.entityIndex.get(entityKey)!.add(doc.id);

    if (!this.folderIndex.has(doc.folderPath)) this.folderIndex.set(doc.folderPath, new Set());
    this.folderIndex.get(doc.folderPath)!.add(doc.id);

    for (const tag of doc.tags) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
      this.tagIndex.get(tag)!.add(doc.id);
    }

    if (doc.contentHash) this.hashIndex.set(doc.contentHash, doc.id);

    // אינדקס טקסט
    this.indexText(doc);
  }

  private indexText(doc: Document): void {
    // הסר ישן
    for (const [_, ids] of this.textIndex) ids.delete(doc.id);

    const text = [
      doc.name, doc.description,
      ...doc.tags,
      doc.entity.name,
      ...doc.versions.map(v => v.extractedText ?? ''),
      ...doc.notes.map(n => n.text),
      JSON.stringify(doc.metadata),
    ].join(' ').toLowerCase();

    for (const word of text.split(/\s+/).filter(w => w.length > 2)) {
      if (!this.textIndex.has(word)) this.textIndex.set(word, new Set());
      this.textIndex.get(word)!.add(doc.id);
    }
  }

  /** חיפוש full-text */
  search(params: {
    query?: string;
    category?: DocumentCategory;
    entityType?: EntityType;
    entityId?: string;
    folderPath?: string;
    tags?: string[];
    status?: DocumentStatus;
    classification?: ClassificationLevel;
    dateFrom?: number;
    dateTo?: number;
    hasFinancialData?: boolean;
    minAmount?: number;
    maxAmount?: number;
    limit?: number;
    sortBy?: 'relevance' | 'date' | 'name' | 'amount';
  }): SearchResult[] {
    let candidateIds: Set<string> | null = null;

    // קטגוריה
    if (params.category) {
      candidateIds = new Set(this.categoryIndex.get(params.category) ?? []);
    }

    // ישות
    if (params.entityType || params.entityId) {
      const key = params.entityId ? `${params.entityType}:${params.entityId}` : undefined;
      if (key) {
        const entityDocs = this.entityIndex.get(key) ?? new Set();
        candidateIds = candidateIds ? new Set([...candidateIds].filter(id => entityDocs.has(id))) : entityDocs;
      } else if (params.entityType) {
        const entityDocs = new Set<string>();
        for (const [k, ids] of this.entityIndex) {
          if (k.startsWith(`${params.entityType}:`)) for (const id of ids) entityDocs.add(id);
        }
        candidateIds = candidateIds ? new Set([...candidateIds].filter(id => entityDocs.has(id))) : entityDocs;
      }
    }

    // תיקיה
    if (params.folderPath) {
      const folderDocs = new Set<string>();
      for (const [path, ids] of this.folderIndex) {
        if (path.startsWith(params.folderPath)) for (const id of ids) folderDocs.add(id);
      }
      candidateIds = candidateIds ? new Set([...candidateIds].filter(id => folderDocs.has(id))) : folderDocs;
    }

    // תגיות
    if (params.tags?.length) {
      for (const tag of params.tags) {
        const tagDocs = this.tagIndex.get(tag) ?? new Set();
        candidateIds = candidateIds ? new Set([...candidateIds].filter(id => tagDocs.has(id))) : tagDocs;
      }
    }

    // טקסט חופשי
    let textScores: Map<string, number> | null = null;
    if (params.query) {
      textScores = new Map();
      const words = params.query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      for (const word of words) {
        for (const [indexed, ids] of this.textIndex) {
          if (indexed.includes(word)) {
            for (const id of ids) textScores.set(id, (textScores.get(id) ?? 0) + 1);
          }
        }
      }
      const matchingIds = new Set(textScores.keys());
      candidateIds = candidateIds ? new Set([...candidateIds].filter(id => matchingIds.has(id))) : matchingIds;
    }

    // מטריאליזציה
    let docs: Document[] = candidateIds
      ? Array.from(candidateIds).map(id => this.documents.get(id)!).filter(Boolean)
      : Array.from(this.documents.values());

    // פילטרים נוספים
    if (params.status) docs = docs.filter(d => d.status === params.status);
    if (params.classification) docs = docs.filter(d => d.classification === params.classification);
    if (params.dateFrom) docs = docs.filter(d => d.dates.created >= params.dateFrom!);
    if (params.dateTo) docs = docs.filter(d => d.dates.created <= params.dateTo!);
    if (params.hasFinancialData) docs = docs.filter(d => !!d.financialData);
    if (params.minAmount !== undefined) docs = docs.filter(d => (d.financialData?.amount ?? 0) >= params.minAmount!);
    if (params.maxAmount !== undefined) docs = docs.filter(d => (d.financialData?.amount ?? 0) <= params.maxAmount!);

    // ציון רלוונטיות ומיון
    const results: SearchResult[] = docs.map(doc => {
      let relevanceScore = 0.5;
      if (textScores?.has(doc.id)) {
        relevanceScore = Math.min(1, (textScores.get(doc.id)! / (params.query?.split(/\s+/).length ?? 1)) * 0.8 + 0.2);
      }
      const matchedFields: string[] = [];
      if (textScores?.has(doc.id)) matchedFields.push('content');
      if (params.category && doc.category === params.category) matchedFields.push('category');
      if (params.tags?.some(t => doc.tags.includes(t))) matchedFields.push('tags');

      return { document: doc, relevanceScore, matchedFields };
    });

    // מיון
    switch (params.sortBy) {
      case 'date': results.sort((a, b) => b.document.dates.modified - a.document.dates.modified); break;
      case 'name': results.sort((a, b) => a.document.name.localeCompare(b.document.name, 'he')); break;
      case 'amount': results.sort((a, b) => (b.document.financialData?.amount ?? 0) - (a.document.financialData?.amount ?? 0)); break;
      default: results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    return results.slice(0, params.limit ?? 50);
  }

  /** מצא כפילות */
  findDuplicate(contentHash: string): Document | undefined {
    const existingId = this.hashIndex.get(contentHash);
    return existingId ? this.documents.get(existingId) : undefined;
  }

  /** שלוף מסמך */
  get(id: string): Document | undefined { return this.documents.get(id); }

  /** שלוף מסמכים לפי ישות */
  getByEntity(entityType: EntityType, entityId: string): Document[] {
    const key = `${entityType}:${entityId}`;
    const ids = this.entityIndex.get(key);
    if (!ids) return [];
    return Array.from(ids).map(id => this.documents.get(id)!).filter(Boolean).sort((a, b) => b.dates.modified - a.dates.modified);
  }

  /** שלוף מסמכים לפי תיקיה */
  getByFolder(folderPath: string): Document[] {
    const ids = this.folderIndex.get(folderPath);
    if (!ids) return [];
    return Array.from(ids).map(id => this.documents.get(id)!).filter(Boolean);
  }

  /** סטטיסטיקות */
  getStats(): DMSStats {
    const docs = Array.from(this.documents.values());
    const now = Date.now();
    const thirtyDays = 30 * 86400000;
    const sevenDays = 7 * 86400000;

    const byCategory: Record<string, number> = {};
    const byEntity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byClassification: Record<string, number> = {};
    let totalSize = 0;
    let totalVersions = 0;

    for (const doc of docs) {
      byCategory[doc.category] = (byCategory[doc.category] ?? 0) + 1;
      byEntity[doc.entity.type] = (byEntity[doc.entity.type] ?? 0) + 1;
      byStatus[doc.status] = (byStatus[doc.status] ?? 0) + 1;
      byClassification[doc.classification] = (byClassification[doc.classification] ?? 0) + 1;
      totalVersions += doc.versions.length;
      totalSize += doc.versions.reduce((s, v) => s + v.fileSize, 0);
    }

    return {
      totalDocuments: docs.length,
      totalVersions,
      totalSizeBytes: totalSize,
      byCategory, byEntity, byStatus, byClassification,
      expiringSoon: docs.filter(d => d.dates.expires && d.dates.expires - now < thirtyDays && d.dates.expires > now).length,
      pendingApproval: docs.filter(d => d.status === 'pending_approval').length,
      recentlyModified: docs.filter(d => now - d.dates.modified < sevenDays).length,
    };
  }

  /** כל המסמכים */
  getAll(): Document[] { return Array.from(this.documents.values()); }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: RETENTION MANAGER — מדיניות שימור
// ═══════════════════════════════════════════════════════════════════════════

class RetentionManager {
  private policies: RetentionPolicy[] = [];

  constructor() { this.loadDefaults(); }

  addPolicy(policy: Omit<RetentionPolicy, 'id'>): RetentionPolicy {
    const full: RetentionPolicy = { ...policy, id: `ret_${Date.now().toString(36)}` };
    this.policies.push(full);
    return full;
  }

  /** בדוק אילו מסמכים צריך לטפל בהם */
  evaluate(documents: Document[]): Array<{ documentId: string; documentName: string; policyName: string; action: 'archive' | 'delete' | 'review'; reason: string }> {
    const actions: Array<{ documentId: string; documentName: string; policyName: string; action: RetentionPolicy['action']; reason: string }> = [];
    const now = Date.now();

    for (const doc of documents) {
      if (doc.status === 'deleted' || doc.status === 'archived') continue;

      for (const policy of this.policies.filter(p => p.active)) {
        if (!policy.appliesTo.includes(doc.category)) continue;
        if (!policy.includeActive && doc.status === 'active') continue;

        const retentionDeadline = doc.dates.created + policy.retentionDays * 86400000;
        if (now > retentionDeadline) {
          actions.push({
            documentId: doc.id,
            documentName: doc.name,
            policyName: policy.name,
            action: policy.action,
            reason: `עברו ${policy.retentionDays} ימים מאז יצירת המסמך`,
          });
        }
      }

      // בדוק תוקף מסמך
      if (doc.dates.expires && now > doc.dates.expires && doc.status !== 'expired') {
        actions.push({
          documentId: doc.id,
          documentName: doc.name,
          policyName: 'expiration',
          action: 'review',
          reason: `המסמך פג תוקף ב-${new Date(doc.dates.expires).toLocaleDateString('he-IL')}`,
        });
      }
    }

    return actions;
  }

  private loadDefaults(): void {
    this.addPolicy({ name: 'שימור תלושי שכר', description: '7 שנים לפי חוק', appliesTo: ['payslip'], retentionDays: 2555, action: 'archive', includeActive: false, active: true });
    this.addPolicy({ name: 'שימור חוזי עבודה', description: '7 שנים אחרי סיום', appliesTo: ['employment_contract'], retentionDays: 2555, action: 'archive', includeActive: false, active: true });
    this.addPolicy({ name: 'שימור חשבוניות', description: '7 שנים לפי מס הכנסה', appliesTo: ['invoice_incoming', 'invoice_outgoing'], retentionDays: 2555, action: 'archive', includeActive: false, active: true });
    this.addPolicy({ name: 'שימור מסמכי מס', description: '7 שנים', appliesTo: ['tax'], retentionDays: 2555, action: 'archive', includeActive: false, active: true });
    this.addPolicy({ name: 'ניקוי הצעות מחיר ישנות', description: 'הצעות מעל שנה', appliesTo: ['quote_incoming', 'quote_outgoing'], retentionDays: 365, action: 'archive', includeActive: false, active: true });
    this.addPolicy({ name: 'ביטוח — בדיקת תוקף', description: 'בדוק תוקף פוליסות', appliesTo: ['insurance'], retentionDays: 365, action: 'review', includeActive: true, active: true });
  }

  getPolicies(): RetentionPolicy[] { return this.policies; }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: DOCUMENT MANAGEMENT SYSTEM — הכל ביחד
// ═══════════════════════════════════════════════════════════════════════════

export class DocumentManagementSystem {
  readonly folders: FolderManager;
  readonly classifier: DocumentClassifier;
  readonly store: DocumentStore;
  readonly retention: RetentionManager;
  private auditLog: AuditEntry[] = [];

  constructor() {
    this.folders = new FolderManager();
    this.classifier = new DocumentClassifier();
    this.store = new DocumentStore();
    this.retention = new RetentionManager();
  }

  // ─── הפעולה המרכזית: הוספת מסמך ─────────────────────────────────

  addDocument(params: {
    name: string;
    description?: string;
    fileName: string;
    fileSize: number;
    fileType?: FileType;
    filePath?: string;
    /** ישות קשורה */
    entityType: EntityType;
    entityId: string;
    entityName: string;
    /** קטגוריה (אם ידועה — אחרת סיווג אוטומטי) */
    category?: DocumentCategory;
    /** תגיות נוספות */
    tags?: string[];
    /** מטא-דאטא */
    metadata?: Record<string, unknown>;
    /** נתונים כספיים */
    financialData?: Document['financialData'];
    /** תוקף */
    expiresAt?: Date;
    /** retention */
    retentionUntilDate?: Date;
    /** סיווג ביטחוני */
    classification?: ClassificationLevel;
    /** מי מעלה */
    uploadedBy: string;
    /** טקסט שחולץ */
    extractedText?: string;
    /** הרשאות */
    permissions?: DocumentPermission[];
    /** מסמכים קשורים */
    relatedDocuments?: string[];
    /** תוכן לחישוב hash */
    contentBuffer?: Buffer;
  }): Document {
    // 1. סיווג אוטומטי
    const classification = this.classifier.classify({
      fileName: params.fileName,
      metadata: params.metadata,
      extractedText: params.extractedText,
      entityType: params.entityType,
      manualCategory: params.category,
    });

    const category = params.category ?? classification.category;

    // 2. חישוב נתיב תיקיה
    this.folders.createEntityFolders(params.entityType, params.entityName);
    const folderPath = this.folders.resolvePath(params.entityType, params.entityName, category);

    // 3. חישוב hash
    const contentHash = params.contentBuffer
      ? crypto.createHash('sha256').update(params.contentBuffer).digest('hex')
      : crypto.createHash('sha256').update(`${params.name}${params.fileSize}${Date.now()}`).digest('hex');

    // 4. בדיקת כפילויות
    const duplicate = this.store.findDuplicate(contentHash);
    if (duplicate && params.contentBuffer) {
      console.log(`⚠️ מסמך כפול זוהה: "${params.name}" זהה ל-"${duplicate.name}" (${duplicate.id})`);
      // מוסיף כגרסה חדשה במקום מסמך חדש
      return this.addVersion(duplicate.id, {
        fileName: params.fileName,
        fileSize: params.fileSize,
        filePath: params.filePath ?? folderPath,
        uploadedBy: params.uploadedBy,
        changeDescription: 'זוהה כעדכון למסמך קיים',
        extractedText: params.extractedText,
        contentBuffer: params.contentBuffer,
      });
    }

    // 5. סוג קובץ
    const fileType: FileType = params.fileType ?? this.detectFileType(params.fileName);

    // 6. בניית המסמך
    const doc: Document = {
      id: `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: params.name,
      description: params.description ?? '',
      category,
      entity: { type: params.entityType, id: params.entityId, name: params.entityName },
      folderPath,
      currentVersion: 1,
      versions: [{
        version: 1,
        fileType,
        fileName: params.fileName,
        fileSize: params.fileSize,
        filePath: params.filePath ?? `${folderPath}/${params.fileName}`,
        contentHash,
        uploadedAt: Date.now(),
        uploadedBy: params.uploadedBy,
        changeDescription: 'גרסה ראשונה',
        extractedText: params.extractedText,
      }],
      status: 'active',
      classification: params.classification ?? classification.classification,
      tags: [...new Set([...(params.tags ?? []), ...classification.tags])],
      metadata: params.metadata ?? {},
      dates: {
        created: Date.now(),
        modified: Date.now(),
        expires: params.expiresAt?.getTime(),
        retentionUntil: params.retentionUntilDate?.getTime(),
      },
      ownership: {
        createdBy: params.uploadedBy,
        modifiedBy: params.uploadedBy,
        owner: params.uploadedBy,
      },
      permissions: params.permissions ?? [
        { principalId: params.uploadedBy, principalType: 'user', access: 'admin', grantedBy: 'system', grantedAt: Date.now() },
        { principalId: 'management', principalType: 'role', access: 'read', grantedBy: 'system', grantedAt: Date.now() },
      ],
      relatedDocuments: params.relatedDocuments ?? [],
      financialData: params.financialData,
      signatures: [],
      notes: [],
      auditTrail: [{
        timestamp: Date.now(),
        action: 'document_created',
        actorId: params.uploadedBy,
        actorName: params.uploadedBy,
        detail: `מסמך "${params.name}" נוצר בתיקיה ${folderPath}`,
      }],
      contentHash,
    };

    // 7. שמירה
    this.store.store(doc);

    console.log(`📄 מסמך חדש: "${params.name}" → ${folderPath} [${category}] (${this.formatSize(params.fileSize)})`);

    return doc;
  }

  /** הוספת גרסה חדשה למסמך קיים */
  addVersion(documentId: string, params: {
    fileName: string;
    fileSize: number;
    filePath?: string;
    uploadedBy: string;
    changeDescription: string;
    extractedText?: string;
    contentBuffer?: Buffer;
  }): Document {
    const doc = this.store.get(documentId);
    if (!doc) throw new Error(`מסמך ${documentId} לא נמצא`);

    const contentHash = params.contentBuffer
      ? crypto.createHash('sha256').update(params.contentBuffer).digest('hex')
      : crypto.createHash('sha256').update(`${params.fileName}${params.fileSize}${Date.now()}`).digest('hex');

    doc.currentVersion++;
    doc.versions.push({
      version: doc.currentVersion,
      fileType: this.detectFileType(params.fileName),
      fileName: params.fileName,
      fileSize: params.fileSize,
      filePath: params.filePath ?? `${doc.folderPath}/${params.fileName}`,
      contentHash,
      uploadedAt: Date.now(),
      uploadedBy: params.uploadedBy,
      changeDescription: params.changeDescription,
      extractedText: params.extractedText,
    });

    doc.dates.modified = Date.now();
    doc.ownership.modifiedBy = params.uploadedBy;
    doc.contentHash = contentHash;

    doc.auditTrail.push({
      timestamp: Date.now(),
      action: 'version_added',
      actorId: params.uploadedBy,
      actorName: params.uploadedBy,
      detail: `גרסה ${doc.currentVersion}: ${params.changeDescription}`,
    });

    this.store.store(doc);
    console.log(`📄 גרסה ${doc.currentVersion} נוספה ל-"${doc.name}"`);
    return doc;
  }

  // ─── פעולות על מסמכים ──────────────────────────────────────────────

  /** חיפוש */
  search(params: Parameters<DocumentStore['search']>[0]): SearchResult[] {
    return this.store.search(params);
  }

  /** שלוף מסמכי ישות */
  getEntityDocuments(entityType: EntityType, entityId: string): Document[] {
    return this.store.getByEntity(entityType, entityId);
  }

  /** שלוף מסמכי תיקיה */
  getFolderDocuments(folderPath: string): Document[] {
    return this.store.getByFolder(folderPath);
  }

  /** הוסף הערה */
  addNote(documentId: string, authorId: string, authorName: string, text: string, pinned: boolean = false): void {
    const doc = this.store.get(documentId);
    if (!doc) return;
    doc.notes.push({ id: `note_${Date.now().toString(36)}`, authorId, authorName, text, createdAt: Date.now(), pinned });
    doc.auditTrail.push({ timestamp: Date.now(), action: 'note_added', actorId: authorId, actorName: authorName, detail: text.slice(0, 100) });
  }

  /** חתום על מסמך */
  sign(documentId: string, signerId: string, signerName: string, type: DocumentSignature['signatureType'] = 'digital'): void {
    const doc = this.store.get(documentId);
    if (!doc) return;
    const hash = crypto.createHash('sha256').update(`${documentId}:${signerId}:${Date.now()}:${doc.contentHash}`).digest('hex');
    doc.signatures.push({ signerId, signerName, signedAt: Date.now(), signatureType: type, verified: true, hash });
    doc.auditTrail.push({ timestamp: Date.now(), action: 'document_signed', actorId: signerId, actorName: signerName, detail: `חתימה ${type}` });
  }

  /** שנה סטטוס */
  setStatus(documentId: string, status: DocumentStatus, actorId: string, actorName: string): void {
    const doc = this.store.get(documentId);
    if (!doc) return;
    const prev = doc.status;
    doc.status = status;
    doc.dates.modified = Date.now();
    if (status === 'archived') doc.dates.archivedAt = Date.now();
    doc.auditTrail.push({ timestamp: Date.now(), action: 'status_changed', actorId, actorName, detail: `${prev} → ${status}`, previousValue: prev, newValue: status });
  }

  /** הוסף הרשאה */
  grantAccess(documentId: string, principalId: string, principalType: DocumentPermission['principalType'], access: DocumentPermission['access'], grantedBy: string): void {
    const doc = this.store.get(documentId);
    if (!doc) return;
    doc.permissions = doc.permissions.filter(p => p.principalId !== principalId);
    doc.permissions.push({ principalId, principalType, access, grantedBy, grantedAt: Date.now() });
    doc.auditTrail.push({ timestamp: Date.now(), action: 'permission_granted', actorId: grantedBy, actorName: grantedBy, detail: `${principalId} → ${access}` });
  }

  /** בדוק הרשאה */
  checkAccess(documentId: string, userId: string, requiredAccess: 'read' | 'write' | 'admin'): boolean {
    const doc = this.store.get(documentId);
    if (!doc) return false;
    const accessLevel: Record<string, number> = { none: 0, read: 1, write: 2, admin: 3 };
    const userPermission = doc.permissions.find(p => p.principalId === userId);
    if (!userPermission) return false;
    if (userPermission.expiresAt && Date.now() > userPermission.expiresAt) return false;
    return accessLevel[userPermission.access] >= accessLevel[requiredAccess];
  }

  /** התחל workflow אישורים */
  startApprovalWorkflow(documentId: string, approvers: Array<{ id: string; name: string }>): void {
    const doc = this.store.get(documentId);
    if (!doc) return;
    doc.status = 'pending_approval';
    doc.workflow = {
      id: `wf_${Date.now().toString(36)}`,
      type: 'approval',
      status: 'pending',
      steps: approvers.map(a => ({ name: `אישור ${a.name}`, assigneeId: a.id, assigneeName: a.name, status: 'pending' as const })),
      currentStepIndex: 0,
      startedAt: Date.now(),
    };
    doc.auditTrail.push({ timestamp: Date.now(), action: 'workflow_started', actorId: 'system', actorName: 'system', detail: `workflow אישור — ${approvers.length} שלבים` });
  }

  /** אשר שלב ב-workflow */
  approveWorkflowStep(documentId: string, approverId: string, comment?: string): void {
    const doc = this.store.get(documentId);
    if (!doc?.workflow) return;
    const step = doc.workflow.steps[doc.workflow.currentStepIndex];
    if (!step || step.assigneeId !== approverId) return;

    step.status = 'approved';
    step.completedAt = Date.now();
    step.comment = comment;
    doc.workflow.currentStepIndex++;

    if (doc.workflow.currentStepIndex >= doc.workflow.steps.length) {
      doc.workflow.status = 'completed';
      doc.workflow.completedAt = Date.now();
      doc.status = 'approved';
    } else {
      doc.workflow.status = 'in_progress';
    }

    doc.auditTrail.push({ timestamp: Date.now(), action: 'workflow_step_approved', actorId: approverId, actorName: step.assigneeName, detail: comment ?? 'אושר' });
  }

  /** דחה ב-workflow */
  rejectWorkflowStep(documentId: string, approverId: string, reason: string): void {
    const doc = this.store.get(documentId);
    if (!doc?.workflow) return;
    const step = doc.workflow.steps[doc.workflow.currentStepIndex];
    if (!step || step.assigneeId !== approverId) return;

    step.status = 'rejected';
    step.completedAt = Date.now();
    step.comment = reason;
    doc.workflow.status = 'rejected';
    doc.workflow.completedAt = Date.now();
    doc.status = 'rejected';

    doc.auditTrail.push({ timestamp: Date.now(), action: 'workflow_step_rejected', actorId: approverId, actorName: step.assigneeName, detail: reason });
  }

  // ─── retention ──

  /** הרץ בדיקת retention */
  runRetentionCheck(): Array<{ documentId: string; documentName: string; policyName: string; action: string; reason: string }> {
    const allDocs = this.store.getAll();
    return this.retention.evaluate(allDocs);
  }

  // ─── דוחות ──

  getStats(): DMSStats { return this.store.getStats(); }

  printStats(): void {
    const stats = this.getStats();
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║   📁 ONYX DMS — סטטיסטיקות                                 ║
╠══════════════════════════════════════════════════════════════╣
║   סה"כ מסמכים: ${String(stats.totalDocuments).padEnd(10)} גרסאות: ${String(stats.totalVersions).padEnd(10)}
║   גודל כולל: ${this.formatSize(stats.totalSizeBytes).padEnd(15)}
║
║   לפי קטגוריה:
${Object.entries(stats.byCategory).sort((a,b) => b[1] - a[1]).slice(0, 10).map(([k,v]) => `║     ${k}: ${v}`).join('\n')}
║
║   לפי ישות:
${Object.entries(stats.byEntity).sort((a,b) => b[1] - a[1]).map(([k,v]) => `║     ${k}: ${v}`).join('\n')}
║
║   ממתינים לאישור: ${stats.pendingApproval}
║   פג תוקף בקרוב: ${stats.expiringSoon}
║   עודכנו השבוע: ${stats.recentlyModified}
╚══════════════════════════════════════════════════════════════╝`);
  }

  /** הדפס מבנה תיקיות */
  printFolderStructure(): void {
    const structure = this.folders.getFullStructure();
    console.log('\n📂 מבנה תיקיות ONYX DMS:');
    console.log('/ONYX_DMS');
    for (const [folder, subs] of Object.entries(structure)) {
      console.log(`├── /${folder}`);
      subs.forEach((sub, i) => console.log(`│   ${i === subs.length - 1 ? '└' : '├'}── /${sub}`));
    }
    console.log('└── /ארכיון\n');
  }

  // ─── עזר ──

  private detectFileType(fileName: string): FileType {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, FileType> = {
      pdf: 'pdf', docx: 'docx', doc: 'docx', xlsx: 'xlsx', xls: 'xlsx', pptx: 'pptx',
      jpg: 'jpg', jpeg: 'jpg', png: 'png', dwg: 'dwg', dxf: 'dxf', eml: 'email', msg: 'email',
      txt: 'txt', csv: 'csv', zip: 'zip', rar: 'zip',
    };
    return map[ext] ?? 'other';
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { FolderManager, DocumentClassifier, DocumentStore, RetentionManager };

export type {
  Document, DocumentVersion, DocumentPermission, DocumentSignature, DocumentNote,
  DocumentWorkflow, WorkflowStep, AuditEntry,
  DocumentCategory, EntityType, DocumentStatus, ClassificationLevel, FileType,
  RetentionPolicy, SearchResult, DMSStats,
};

// ═══════════════════════════════════════════════════════════════════════════
// שימוש
// ═══════════════════════════════════════════════════════════════════════════
//
// const dms = new DocumentManagementSystem();
//
// // הצג מבנה תיקיות
// dms.printFolderStructure();
//
// // ── הוסף מסמכים — סיווג ותיוק אוטומטי ──
//
// dms.addDocument({
//   name: 'חוזה העסקה — דימה',
//   fileName: 'employment_contract_dima.pdf',
//   fileSize: 245000,
//   entityType: 'employee', entityId: 'emp_dima', entityName: 'דימה',
//   uploadedBy: 'קובי',
//   // לא צריך category — מזהה אוטומטית 'employment_contract'
//   // לא צריך folderPath — נכנס אוטומטית ל: /ONYX_DMS/עובדים/דימה/חוזה_העסקה
//   expiresAt: new Date('2027-12-31'),
// });
//
// dms.addDocument({
//   name: 'חשבונית מס — מתכת מקס',
//   fileName: 'invoice_metalmax_2026_04.pdf',
//   fileSize: 120000,
//   entityType: 'supplier', entityId: 'sup_metalmax', entityName: 'מתכת מקס',
//   uploadedBy: 'דימה',
//   financialData: { amount: 15700, vatAmount: 2826, total: 18526, currency: 'ILS', dueDate: Date.now() + 30 * 86400000 },
//   // סיווג אוטומטי: invoice_incoming → /ONYX_DMS/ספקים/מתכת_מקס/חשבוניות
// });
//
// dms.addDocument({
//   name: 'שרטוט מעקות — קריאתי 10',
//   fileName: 'railings_kriyati10.dwg',
//   fileSize: 5200000,
//   entityType: 'project', entityId: 'proj_kriyati', entityName: 'מעקות קריאתי 10',
//   uploadedBy: 'עוזי',
//   tags: ['מעקות', 'ברזל', 'קומה_3'],
//   // סיווג אוטומטי: plan → /ONYX_DMS/פרויקטים/מעקות_קריאתי_10/תכניות
// });
//
// dms.addDocument({
//   name: 'פוליסת ביטוח — משה קבלן',
//   fileName: 'insurance_moshe_2026.pdf',
//   fileSize: 890000,
//   entityType: 'subcontractor', entityId: 'sub_moshe', entityName: 'משה מעקות',
//   uploadedBy: 'קובי',
//   expiresAt: new Date('2027-03-31'),
//   // סיווג: insurance → /ONYX_DMS/קבלני_משנה/משה_מעקות/ביטוח_וערבויות
// });
//
// dms.addDocument({
//   name: 'שמאות — קריאתי 10',
//   fileName: 'appraisal_kriyati10_standard19.pdf',
//   fileSize: 3400000,
//   entityType: 'real_estate', entityId: 're_kriyati', entityName: 'קריאתי 10 התקווה',
//   uploadedBy: 'קובי',
//   tags: ['שמאות', 'תקן_19', 'התקווה'],
//   // סיווג: appraisal → /ONYX_DMS/נדלן/קריאתי_10_התקווה/שמאויות
// });
//
// // ── חיפוש ──
//
// const results = dms.search({ query: 'מעקות ברזל', limit: 10 });
// const invoices = dms.search({ category: 'invoice_incoming', entityType: 'supplier' });
// const expiring = dms.search({ category: 'insurance', sortBy: 'date' });
// const highValue = dms.search({ hasFinancialData: true, minAmount: 50000, sortBy: 'amount' });
//
// // ── workflow אישורים ──
// dms.startApprovalWorkflow(doc.id, [
//   { id: 'dima', name: 'דימה' },
//   { id: 'kobi', name: 'קובי' },
// ]);
// dms.approveWorkflowStep(doc.id, 'dima', 'נבדק ומאושר');
// dms.approveWorkflowStep(doc.id, 'kobi'); // → מסמך approved
//
// // ── בדיקת retention ──
// const retentionActions = dms.runRetentionCheck();
// // → "שימור תלושי שכר: עברו 2555 ימים..." → archive
//
// // ── סטטיסטיקות ──
// dms.printStats();
