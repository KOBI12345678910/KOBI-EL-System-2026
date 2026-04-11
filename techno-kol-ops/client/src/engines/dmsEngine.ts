/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   TECHNO-KOL DMS ENGINE — Document Management System                   ║
 * ║   Browser-side version (no Node crypto — uses Web Crypto / SubtleCrypto) ║
 * ║                                                                          ║
 * ║   Features                                                              ║
 * ║   • 25+ auto-classification rules                                       ║
 * ║   • 8 entity types with auto-generated folder structures                ║
 * ║   • Versioning with SHA-256 duplicate detection                         ║
 * ║   • Permissions (read / write / admin) per folder + per document        ║
 * ║   • Multi-step approval workflow                                        ║
 * ║   • Retention policies (payslips/contracts 7y, quotes 1y, …)            ║
 * ║   • Full-text search with inverted index                                ║
 * ║   • Audit trail (every action logged)                                   ║
 * ║   • 4-level security classification (public/internal/confidential/…)    ║
 * ║                                                                          ║
 * ║   Philosophy: never delete, only archive + mark deleted                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DocCategory =
  | 'quote'            // הצעת מחיר
  | 'order'            // הזמנת רכש
  | 'invoice'          // חשבונית
  | 'receipt'          // קבלה
  | 'contract'         // חוזה
  | 'payslip'          // תלוש שכר
  | 'tax'              // מסמך מס
  | 'permit'           // אישור / רישיון
  | 'certificate'      // תעודה / תקן
  | 'drawing'          // שרטוט / תוכנית
  | 'measurement'      // מידה
  | 'delivery_note'    // תעודת משלוח
  | 'safety'           // בטיחות
  | 'hr'               // משאבי אנוש
  | 'legal'            // משפטי
  | 'insurance'        // ביטוח
  | 'report'           // דוח
  | 'photo'            // תמונה
  | 'correspondence'   // התכתבות
  | 'project_doc'      // מסמך פרויקט
  | 'warranty'         // אחריות
  | 'other';           // אחר

export type EntityType =
  | 'project'
  | 'client'
  | 'subcontractor'
  | 'employee'
  | 'supplier'
  | 'asset'
  | 'company'
  | 'real_estate';

export type SecurityLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export type DocStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'archived'
  | 'expired'
  | 'deleted';

export type PermissionLevel = 'read' | 'write' | 'admin';

export type AuditAction =
  | 'create'
  | 'update'
  | 'view'
  | 'download'
  | 'upload_version'
  | 'approve'
  | 'reject'
  | 'archive'
  | 'restore'
  | 'mark_deleted'
  | 'permission_change'
  | 'move'
  | 'rename'
  | 'classify'
  | 'tag';

// ───────────────────────────────────────────────────────────────────────────

export interface DocumentVersion {
  versionNumber: number;
  sha256: string;                // hex digest
  sizeBytes: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;            // ISO
  comment?: string;
  dataUrl?: string;              // browser-only: keep small files inline
  externalRef?: string;          // backend/S3 ref for large files
}

export interface DocumentRecord {
  id: string;
  title: string;
  fileName: string;
  category: DocCategory;
  entityType?: EntityType;
  entityId?: string;
  entityName?: string;
  folderId: string;
  tags: string[];
  security: SecurityLevel;
  status: DocStatus;
  currentVersion: number;
  versions: DocumentVersion[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // retention
  retentionYears: number;
  retainUntil: string;           // ISO date string
  // approval
  requiresApproval: boolean;
  approvalSteps: ApprovalStep[];
  // permissions
  acl: DocACL[];
  // full-text search cache
  searchText: string;
  // free metadata
  metadata: Record<string, string | number | boolean>;
}

export interface ApprovalStep {
  stepNumber: number;
  approverRole: string;
  approverId?: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedAt?: string;
  comment?: string;
}

export interface DocACL {
  principalType: 'user' | 'role' | 'group';
  principalId: string;
  level: PermissionLevel;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  entityType?: EntityType;
  entityId?: string;
  path: string;                  // cached absolute path, e.g. /projects/proj-123/quotes
  readonly: boolean;
  acl: DocACL[];
  createdAt: string;
  defaultSecurity: SecurityLevel;
  defaultCategory?: DocCategory;
}

export interface AuditEntry {
  id: string;
  documentId?: string;
  folderId?: string;
  action: AuditAction;
  actor: string;
  timestamp: string;
  details?: string;
  before?: string;
  after?: string;
}

export interface ClassificationRule {
  id: string;
  name: string;
  priority: number;              // higher = first
  category: DocCategory;
  // matchers
  fileNamePatterns?: string[];   // substrings / extensions
  titleKeywords?: string[];
  mimeTypes?: string[];
  entityTypes?: EntityType[];
  // output
  applyTags?: string[];
  applySecurity?: SecurityLevel;
  applyRetentionYears?: number;
  requireApproval?: boolean;
}

export interface RetentionPolicy {
  category: DocCategory;
  years: number;
  note?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS — labels, colors, defaults
// ═══════════════════════════════════════════════════════════════════════════

export const CATEGORY_LABELS: Record<DocCategory, string> = {
  quote: 'הצעת מחיר',
  order: 'הזמנת רכש',
  invoice: 'חשבונית',
  receipt: 'קבלה',
  contract: 'חוזה',
  payslip: 'תלוש שכר',
  tax: 'מסמך מס',
  permit: 'אישור / רישיון',
  certificate: 'תעודה / תקן',
  drawing: 'שרטוט / תוכנית',
  measurement: 'מידה',
  delivery_note: 'תעודת משלוח',
  safety: 'בטיחות',
  hr: 'משאבי אנוש',
  legal: 'משפטי',
  insurance: 'ביטוח',
  report: 'דוח',
  photo: 'תמונה',
  correspondence: 'התכתבות',
  project_doc: 'מסמך פרויקט',
  warranty: 'אחריות',
  other: 'אחר',
};

export const CATEGORY_COLORS: Record<DocCategory, string> = {
  quote: '#14CCBB',
  order: '#FFA500',
  invoice: '#F6B64A',
  receipt: '#48AFF0',
  contract: '#8B7FFF',
  payslip: '#FC8585',
  tax: '#FF9E66',
  permit: '#9D4EDD',
  certificate: '#14CCBB',
  drawing: '#48AFF0',
  measurement: '#F6B64A',
  delivery_note: '#FFA500',
  safety: '#FC8585',
  hr: '#8B7FFF',
  legal: '#9D4EDD',
  insurance: '#48AFF0',
  report: '#FFA500',
  photo: '#14CCBB',
  correspondence: '#5C7080',
  project_doc: '#FFA500',
  warranty: '#F6B64A',
  other: '#5C7080',
};

export const SECURITY_LABELS: Record<SecurityLevel, string> = {
  public: 'ציבורי',
  internal: 'פנימי',
  confidential: 'סודי',
  restricted: 'מוגבל',
};

export const SECURITY_COLORS: Record<SecurityLevel, string> = {
  public: '#14CCBB',
  internal: '#48AFF0',
  confidential: '#F6B64A',
  restricted: '#FC8585',
};

export const STATUS_LABELS: Record<DocStatus, string> = {
  draft: 'טיוטה',
  pending_approval: 'ממתין לאישור',
  approved: 'מאושר',
  rejected: 'נדחה',
  archived: 'בארכיון',
  expired: 'פג תוקף',
  deleted: 'נמחק',
};

export const STATUS_COLORS: Record<DocStatus, string> = {
  draft: '#5C7080',
  pending_approval: '#F6B64A',
  approved: '#14CCBB',
  rejected: '#FC8585',
  archived: '#8B7FFF',
  expired: '#FFA500',
  deleted: '#FC8585',
};

// ───────────────────────────────────────────────────────────────────────────
// RETENTION POLICIES (Israeli accounting + labour law baseline)
// ───────────────────────────────────────────────────────────────────────────

export const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  { category: 'payslip',       years: 7, note: 'חובה על פי חוק עבודה' },
  { category: 'invoice',       years: 7, note: 'חובה על פי פקודת מס הכנסה' },
  { category: 'receipt',       years: 7, note: 'חובה על פי פקודת מס הכנסה' },
  { category: 'contract',      years: 7, note: 'שמירה ארוכת טווח' },
  { category: 'tax',           years: 7, note: 'חובה כלפי רשויות המס' },
  { category: 'hr',            years: 7, note: 'תיקי עובדים' },
  { category: 'legal',         years: 10, note: 'מסמכים משפטיים' },
  { category: 'insurance',     years: 7 },
  { category: 'warranty',      years: 10 },
  { category: 'permit',        years: 10 },
  { category: 'certificate',   years: 10 },
  { category: 'quote',         years: 1, note: 'הצעות שלא נחתמו' },
  { category: 'order',         years: 7 },
  { category: 'delivery_note', years: 7 },
  { category: 'drawing',       years: 10 },
  { category: 'measurement',   years: 5 },
  { category: 'safety',        years: 7 },
  { category: 'report',        years: 5 },
  { category: 'photo',         years: 5 },
  { category: 'correspondence',years: 3 },
  { category: 'project_doc',   years: 7 },
  { category: 'other',         years: 3 },
];

export function retentionYearsFor(category: DocCategory): number {
  const rule = DEFAULT_RETENTION_POLICIES.find((r) => r.category === category);
  return rule?.years ?? 3;
}

// ───────────────────────────────────────────────────────────────────────────
// FOLDER TEMPLATES per entity type
// ───────────────────────────────────────────────────────────────────────────

export const FOLDER_TEMPLATES: Record<EntityType, { sub: string; defaultCategory?: DocCategory; security?: SecurityLevel }[]> = {
  project: [
    { sub: 'quotes',        defaultCategory: 'quote' },
    { sub: 'contracts',     defaultCategory: 'contract',      security: 'confidential' },
    { sub: 'orders',        defaultCategory: 'order' },
    { sub: 'invoices',      defaultCategory: 'invoice' },
    { sub: 'drawings',      defaultCategory: 'drawing' },
    { sub: 'measurements',  defaultCategory: 'measurement' },
    { sub: 'permits',       defaultCategory: 'permit' },
    { sub: 'photos',        defaultCategory: 'photo' },
    { sub: 'reports',       defaultCategory: 'report' },
    { sub: 'correspondence',defaultCategory: 'correspondence' },
    { sub: 'warranty',      defaultCategory: 'warranty' },
    { sub: 'other',         defaultCategory: 'other' },
  ],
  client: [
    { sub: 'contracts',     defaultCategory: 'contract',      security: 'confidential' },
    { sub: 'quotes',        defaultCategory: 'quote' },
    { sub: 'invoices',      defaultCategory: 'invoice' },
    { sub: 'receipts',      defaultCategory: 'receipt' },
    { sub: 'correspondence',defaultCategory: 'correspondence' },
    { sub: 'legal',         defaultCategory: 'legal',         security: 'restricted' },
  ],
  subcontractor: [
    { sub: 'contracts',     defaultCategory: 'contract',      security: 'confidential' },
    { sub: 'orders',        defaultCategory: 'order' },
    { sub: 'invoices',      defaultCategory: 'invoice' },
    { sub: 'insurance',     defaultCategory: 'insurance' },
    { sub: 'safety',        defaultCategory: 'safety' },
    { sub: 'certificates',  defaultCategory: 'certificate' },
  ],
  employee: [
    { sub: 'contract',      defaultCategory: 'contract',      security: 'restricted' },
    { sub: 'payslips',      defaultCategory: 'payslip',       security: 'restricted' },
    { sub: 'tax',           defaultCategory: 'tax',           security: 'confidential' },
    { sub: 'hr',            defaultCategory: 'hr',            security: 'confidential' },
    { sub: 'permits',       defaultCategory: 'permit' },
    { sub: 'certificates',  defaultCategory: 'certificate' },
    { sub: 'safety',        defaultCategory: 'safety' },
  ],
  supplier: [
    { sub: 'contracts',     defaultCategory: 'contract',      security: 'confidential' },
    { sub: 'orders',        defaultCategory: 'order' },
    { sub: 'invoices',      defaultCategory: 'invoice' },
    { sub: 'delivery_notes',defaultCategory: 'delivery_note' },
    { sub: 'certificates',  defaultCategory: 'certificate' },
  ],
  asset: [
    { sub: 'warranty',      defaultCategory: 'warranty' },
    { sub: 'receipts',      defaultCategory: 'receipt' },
    { sub: 'maintenance',   defaultCategory: 'report' },
    { sub: 'insurance',     defaultCategory: 'insurance' },
  ],
  company: [
    { sub: 'legal',         defaultCategory: 'legal',         security: 'restricted' },
    { sub: 'permits',       defaultCategory: 'permit' },
    { sub: 'certificates',  defaultCategory: 'certificate' },
    { sub: 'insurance',     defaultCategory: 'insurance' },
    { sub: 'tax',           defaultCategory: 'tax',           security: 'confidential' },
    { sub: 'reports',       defaultCategory: 'report' },
    { sub: 'correspondence',defaultCategory: 'correspondence' },
  ],
  real_estate: [
    { sub: 'deed',          defaultCategory: 'legal',         security: 'restricted' },
    { sub: 'permits',       defaultCategory: 'permit' },
    { sub: 'tax',           defaultCategory: 'tax',           security: 'confidential' },
    { sub: 'insurance',     defaultCategory: 'insurance' },
    { sub: 'invoices',      defaultCategory: 'invoice' },
    { sub: 'photos',        defaultCategory: 'photo' },
    { sub: 'reports',       defaultCategory: 'report' },
    { sub: 'contracts',     defaultCategory: 'contract',      security: 'confidential' },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// DEFAULT CLASSIFICATION RULES (25+)
// ───────────────────────────────────────────────────────────────────────────

export const DEFAULT_CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    id: 'r_quote_title',
    name: 'הצעת מחיר לפי כותרת',
    priority: 90,
    category: 'quote',
    titleKeywords: ['הצעת מחיר', 'הצעה', 'quote', 'quotation', 'estimate'],
    fileNamePatterns: ['quote', 'הצעה', 'הצעת'],
    applyTags: ['quote'],
    applyRetentionYears: 1,
  },
  {
    id: 'r_order',
    name: 'הזמנת רכש',
    priority: 90,
    category: 'order',
    titleKeywords: ['הזמנת רכש', 'הזמנה', 'purchase order', 'po'],
    fileNamePatterns: ['order', 'po_', 'הזמנה'],
    applyTags: ['order'],
    applyRetentionYears: 7,
  },
  {
    id: 'r_invoice',
    name: 'חשבונית',
    priority: 95,
    category: 'invoice',
    titleKeywords: ['חשבונית', 'חשבונית מס', 'invoice', 'חשבונית מס/קבלה'],
    fileNamePatterns: ['invoice', 'inv_', 'חשבונית', 'חשבונית_מס'],
    applyTags: ['invoice', 'accounting'],
    applyRetentionYears: 7,
    applySecurity: 'internal',
  },
  {
    id: 'r_receipt',
    name: 'קבלה',
    priority: 90,
    category: 'receipt',
    titleKeywords: ['קבלה', 'receipt'],
    fileNamePatterns: ['receipt', 'קבלה'],
    applyTags: ['receipt'],
    applyRetentionYears: 7,
  },
  {
    id: 'r_contract',
    name: 'חוזה / הסכם',
    priority: 95,
    category: 'contract',
    titleKeywords: ['חוזה', 'הסכם', 'contract', 'agreement'],
    fileNamePatterns: ['contract', 'agreement', 'חוזה', 'הסכם'],
    applyTags: ['contract', 'legal'],
    applySecurity: 'confidential',
    applyRetentionYears: 7,
    requireApproval: true,
  },
  {
    id: 'r_payslip',
    name: 'תלוש שכר',
    priority: 99,
    category: 'payslip',
    titleKeywords: ['תלוש', 'תלוש שכר', 'payslip', 'salary slip'],
    fileNamePatterns: ['payslip', 'salary', 'תלוש'],
    applyTags: ['hr', 'payroll', 'sensitive'],
    applySecurity: 'restricted',
    applyRetentionYears: 7,
  },
  {
    id: 'r_tax_106',
    name: 'טופס 106',
    priority: 99,
    category: 'tax',
    titleKeywords: ['טופס 106', '106', 'form 106'],
    fileNamePatterns: ['106', 'tax_summary'],
    applyTags: ['tax', 'hr', 'sensitive'],
    applySecurity: 'restricted',
    applyRetentionYears: 7,
  },
  {
    id: 'r_tax_general',
    name: 'מסמך מס כללי',
    priority: 80,
    category: 'tax',
    titleKeywords: ['מס הכנסה', 'מעמ', 'מע"מ', 'ביטוח לאומי', 'tax', 'vat'],
    fileNamePatterns: ['tax', 'vat', 'מעמ', 'מס'],
    applyTags: ['tax'],
    applySecurity: 'confidential',
    applyRetentionYears: 7,
  },
  {
    id: 'r_permit',
    name: 'אישור / רישיון',
    priority: 85,
    category: 'permit',
    titleKeywords: ['אישור', 'רישיון', 'permit', 'license'],
    fileNamePatterns: ['permit', 'license', 'אישור', 'רישיון'],
    applyTags: ['permit'],
    applyRetentionYears: 10,
  },
  {
    id: 'r_certificate',
    name: 'תעודה / תקן',
    priority: 85,
    category: 'certificate',
    titleKeywords: ['תעודה', 'תקן', 'iso', 'certificate'],
    fileNamePatterns: ['certificate', 'iso', 'תעודה', 'תקן'],
    applyTags: ['certificate'],
    applyRetentionYears: 10,
  },
  {
    id: 'r_drawing',
    name: 'שרטוט / תוכנית',
    priority: 85,
    category: 'drawing',
    titleKeywords: ['שרטוט', 'תוכנית', 'drawing', 'plan', 'blueprint', 'dwg'],
    fileNamePatterns: ['.dwg', '.dxf', '.skp', 'drawing', 'שרטוט', 'plan'],
    mimeTypes: ['application/acad', 'image/vnd.dwg'],
    applyTags: ['drawing', 'engineering'],
    applyRetentionYears: 10,
  },
  {
    id: 'r_measurement',
    name: 'מידה',
    priority: 80,
    category: 'measurement',
    titleKeywords: ['מידה', 'measurements', 'measurement'],
    fileNamePatterns: ['measurement', 'מידה', 'מידות'],
    applyTags: ['measurement'],
    applyRetentionYears: 5,
  },
  {
    id: 'r_delivery_note',
    name: 'תעודת משלוח',
    priority: 85,
    category: 'delivery_note',
    titleKeywords: ['תעודת משלוח', 'delivery note', 'תז"מ'],
    fileNamePatterns: ['delivery', 'תעודת_משלוח', 'תזמ'],
    applyTags: ['delivery'],
    applyRetentionYears: 7,
  },
  {
    id: 'r_safety',
    name: 'בטיחות',
    priority: 85,
    category: 'safety',
    titleKeywords: ['בטיחות', 'safety', 'ריכוז סיכונים', 'msds'],
    fileNamePatterns: ['safety', 'msds', 'בטיחות'],
    applyTags: ['safety'],
    applyRetentionYears: 7,
    requireApproval: true,
  },
  {
    id: 'r_hr',
    name: 'משאבי אנוש',
    priority: 80,
    category: 'hr',
    titleKeywords: ['תיק עובד', 'hr', 'כח אדם'],
    fileNamePatterns: ['hr', 'employee_file'],
    applyTags: ['hr'],
    applySecurity: 'confidential',
    applyRetentionYears: 7,
  },
  {
    id: 'r_legal',
    name: 'מסמכים משפטיים',
    priority: 90,
    category: 'legal',
    titleKeywords: ['משפטי', 'legal', 'תביעה', 'כתב הגנה', 'פסק דין'],
    fileNamePatterns: ['legal', 'court', 'משפטי'],
    applyTags: ['legal'],
    applySecurity: 'restricted',
    applyRetentionYears: 10,
    requireApproval: true,
  },
  {
    id: 'r_insurance',
    name: 'ביטוח',
    priority: 85,
    category: 'insurance',
    titleKeywords: ['ביטוח', 'insurance', 'פוליסה'],
    fileNamePatterns: ['insurance', 'policy', 'ביטוח'],
    applyTags: ['insurance'],
    applyRetentionYears: 7,
  },
  {
    id: 'r_report',
    name: 'דוח',
    priority: 70,
    category: 'report',
    titleKeywords: ['דוח', 'report', 'סיכום'],
    fileNamePatterns: ['report', 'דוח'],
    applyTags: ['report'],
    applyRetentionYears: 5,
  },
  {
    id: 'r_photo_ext',
    name: 'תמונה לפי סיומת',
    priority: 70,
    category: 'photo',
    fileNamePatterns: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'],
    applyTags: ['photo'],
    applyRetentionYears: 5,
  },
  {
    id: 'r_correspondence_email',
    name: 'מייל / התכתבות',
    priority: 75,
    category: 'correspondence',
    fileNamePatterns: ['.eml', '.msg', 'mail', 'email'],
    mimeTypes: ['message/rfc822'],
    applyTags: ['email', 'correspondence'],
    applyRetentionYears: 3,
  },
  {
    id: 'r_correspondence_title',
    name: 'התכתבות לפי כותרת',
    priority: 60,
    category: 'correspondence',
    titleKeywords: ['התכתבות', 'מכתב', 'correspondence', 'letter'],
    applyTags: ['correspondence'],
    applyRetentionYears: 3,
  },
  {
    id: 'r_warranty',
    name: 'אחריות',
    priority: 85,
    category: 'warranty',
    titleKeywords: ['אחריות', 'warranty'],
    fileNamePatterns: ['warranty', 'אחריות'],
    applyTags: ['warranty'],
    applyRetentionYears: 10,
  },
  {
    id: 'r_project_doc',
    name: 'מסמך פרויקט',
    priority: 70,
    category: 'project_doc',
    titleKeywords: ['פרויקט', 'project'],
    entityTypes: ['project'],
    applyTags: ['project'],
    applyRetentionYears: 7,
  },
  {
    id: 'r_pdf_fallback',
    name: 'PDF ללא זיהוי',
    priority: 40,
    category: 'other',
    fileNamePatterns: ['.pdf'],
    mimeTypes: ['application/pdf'],
    applyTags: ['pdf'],
    applyRetentionYears: 3,
  },
  {
    id: 'r_word',
    name: 'מסמך Word',
    priority: 40,
    category: 'other',
    fileNamePatterns: ['.doc', '.docx'],
    mimeTypes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    applyTags: ['word'],
    applyRetentionYears: 3,
  },
  {
    id: 'r_excel',
    name: 'גיליון Excel',
    priority: 40,
    category: 'other',
    fileNamePatterns: ['.xls', '.xlsx', '.csv'],
    mimeTypes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ],
    applyTags: ['excel'],
    applyRetentionYears: 3,
  },
  {
    id: 'r_zip',
    name: 'קובץ מכווץ',
    priority: 35,
    category: 'other',
    fileNamePatterns: ['.zip', '.rar', '.7z'],
    applyTags: ['archive'],
    applyRetentionYears: 3,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function addYearsISO(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
}

/**
 * Compute SHA-256 of a Blob / ArrayBuffer / string using Web Crypto API.
 * Never touches Node's crypto module — safe for the browser.
 */
export async function sha256Hex(input: Blob | ArrayBuffer | string): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof input === 'string') {
    buffer = new TextEncoder().encode(input).buffer;
  } else if (input instanceof Blob) {
    buffer = await input.arrayBuffer();
  } else {
    buffer = input;
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // fallback simple hash (NOT cryptographic) — prevents total failure in SSR
    let h = 0;
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
      h = (h * 31 + bytes[i]) | 0;
    }
    return `fallback_${(h >>> 0).toString(16)}_${bytes.length}`;
  }
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Read a File as data URL for small-file inline storage. */
export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE KEYS
// ═══════════════════════════════════════════════════════════════════════════

const LS = {
  documents: 'tk_dms_documents',
  folders: 'tk_dms_folders',
  audit: 'tk_dms_audit',
  rules: 'tk_dms_rules',
  retention: 'tk_dms_retention',
  seed: 'tk_dms_seeded',
} as const;

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════

export class DocClassifier {
  private rules: ClassificationRule[];

  constructor(rules: ClassificationRule[] = DEFAULT_CLASSIFICATION_RULES) {
    this.rules = [...rules].sort((a, b) => b.priority - a.priority);
  }

  setRules(rules: ClassificationRule[]) {
    this.rules = [...rules].sort((a, b) => b.priority - a.priority);
    saveLS(LS.rules, this.rules);
  }

  getRules(): ClassificationRule[] {
    return this.rules;
  }

  classify(params: {
    title: string;
    fileName: string;
    mimeType?: string;
    entityType?: EntityType;
  }): {
    category: DocCategory;
    tags: string[];
    security: SecurityLevel;
    retentionYears: number;
    requiresApproval: boolean;
    matchedRule?: string;
  } {
    const lcTitle = params.title.toLowerCase();
    const lcName = params.fileName.toLowerCase();
    const mime = (params.mimeType || '').toLowerCase();

    for (const rule of this.rules) {
      // entity filter
      if (rule.entityTypes && params.entityType && !rule.entityTypes.includes(params.entityType)) {
        continue;
      }
      let matched = false;
      if (rule.titleKeywords?.some((k) => lcTitle.includes(k.toLowerCase()))) matched = true;
      if (!matched && rule.fileNamePatterns?.some((p) => lcName.includes(p.toLowerCase()))) matched = true;
      if (!matched && mime && rule.mimeTypes?.some((m) => mime === m.toLowerCase())) matched = true;
      if (matched) {
        return {
          category: rule.category,
          tags: rule.applyTags ? [...rule.applyTags] : [],
          security: rule.applySecurity ?? 'internal',
          retentionYears: rule.applyRetentionYears ?? retentionYearsFor(rule.category),
          requiresApproval: !!rule.requireApproval,
          matchedRule: rule.id,
        };
      }
    }
    // default
    return {
      category: 'other',
      tags: [],
      security: 'internal',
      retentionYears: retentionYearsFor('other'),
      requiresApproval: false,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL-TEXT SEARCH
// ═══════════════════════════════════════════════════════════════════════════

export class FullTextIndex {
  private index = new Map<string, Set<string>>(); // term -> doc ids

  reset() {
    this.index.clear();
  }

  addDocument(docId: string, text: string) {
    const terms = this.tokenize(text);
    for (const t of terms) {
      let set = this.index.get(t);
      if (!set) {
        set = new Set();
        this.index.set(t, set);
      }
      set.add(docId);
    }
  }

  removeDocument(docId: string) {
    for (const [, set] of this.index) set.delete(docId);
  }

  search(query: string): string[] {
    const terms = this.tokenize(query);
    if (terms.length === 0) return [];
    let result: Set<string> | null = null;
    for (const t of terms) {
      const set = this.index.get(t);
      if (!set) {
        // prefix scan — useful for Hebrew where tokenization can be partial
        const prefixHits = new Set<string>();
        for (const [term, ids] of this.index) {
          if (term.startsWith(t)) ids.forEach((id) => prefixHits.add(id));
        }
        if (prefixHits.size === 0) return [];
        result = result ? this.intersect(result, prefixHits) : prefixHits;
      } else {
        result = result ? this.intersect(result, set) : new Set(set);
      }
      if (result.size === 0) return [];
    }
    return Array.from(result || []);
  }

  private intersect(a: Set<string>, b: Set<string>): Set<string> {
    const out = new Set<string>();
    for (const v of a) if (b.has(v)) out.add(v);
    return out;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

export const AuditLog = {
  entries(): AuditEntry[] {
    return loadLS<AuditEntry[]>(LS.audit, []);
  },
  byDocument(docId: string): AuditEntry[] {
    return this.entries().filter((e) => e.documentId === docId);
  },
  append(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const full: AuditEntry = {
      ...entry,
      id: uid('aud'),
      timestamp: nowISO(),
    };
    const list = this.entries();
    list.push(full);
    saveLS(LS.audit, list);
    return full;
  },
  clear(): void {
    saveLS(LS.audit, []);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FOLDER STORE
// ═══════════════════════════════════════════════════════════════════════════

export const FolderStore = {
  all(): Folder[] {
    return loadLS<Folder[]>(LS.folders, []);
  },
  save(list: Folder[]) {
    saveLS(LS.folders, list);
  },
  get(id: string): Folder | undefined {
    return this.all().find((f) => f.id === id);
  },
  getByPath(path: string): Folder | undefined {
    return this.all().find((f) => f.path === path);
  },
  children(parentId: string | null): Folder[] {
    return this.all()
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  },
  create(input: Omit<Folder, 'id' | 'createdAt' | 'path'>): Folder {
    const all = this.all();
    const parent = input.parentId ? all.find((f) => f.id === input.parentId) : undefined;
    const folder: Folder = {
      ...input,
      id: uid('fld'),
      createdAt: nowISO(),
      path: parent ? `${parent.path}/${input.name}` : `/${input.name}`,
    };
    all.push(folder);
    this.save(all);
    AuditLog.append({ folderId: folder.id, action: 'create', actor: 'system', details: folder.path });
    return folder;
  },
  ensureRoot(name: string, defaults?: Partial<Folder>): Folder {
    const existing = this.all().find((f) => f.parentId === null && f.name === name);
    if (existing) return existing;
    return this.create({
      name,
      parentId: null,
      readonly: false,
      acl: [],
      defaultSecurity: 'internal',
      ...defaults,
    });
  },
  ensurePath(parts: string[], defaults?: Partial<Folder>): Folder {
    let parent: Folder | null = null;
    for (const name of parts) {
      const existing = this.all().find((f) => f.parentId === (parent?.id ?? null) && f.name === name);
      if (existing) {
        parent = existing;
        continue;
      }
      parent = this.create({
        name,
        parentId: parent?.id ?? null,
        readonly: false,
        acl: [],
        defaultSecurity: defaults?.defaultSecurity ?? 'internal',
        defaultCategory: defaults?.defaultCategory,
        entityType: defaults?.entityType,
        entityId: defaults?.entityId,
      });
    }
    return parent!;
  },
  rename(id: string, newName: string): Folder | undefined {
    const all = this.all();
    const idx = all.findIndex((f) => f.id === id);
    if (idx < 0) return undefined;
    const old = all[idx];
    const parent = old.parentId ? all.find((f) => f.id === old.parentId) : undefined;
    const updated: Folder = {
      ...old,
      name: newName,
      path: parent ? `${parent.path}/${newName}` : `/${newName}`,
    };
    all[idx] = updated;
    this.save(all);
    AuditLog.append({ folderId: id, action: 'rename', actor: 'system', before: old.path, after: updated.path });
    return updated;
  },
  /**
   * Build a complete folder template for an entity. Idempotent —
   * calling multiple times will NOT duplicate folders ("never delete, only grow").
   */
  buildForEntity(entity: { type: EntityType; id: string; name: string }): Folder {
    const typeRoot = this.ensureRoot(entityRootName(entity.type));
    const entityFolder = this.ensurePath([typeRoot.name, `${entity.name} (${entity.id})`], {
      entityType: entity.type,
      entityId: entity.id,
    });
    const template = FOLDER_TEMPLATES[entity.type];
    for (const sub of template) {
      const already = this.all().find((f) => f.parentId === entityFolder.id && f.name === sub.sub);
      if (already) continue;
      this.create({
        name: sub.sub,
        parentId: entityFolder.id,
        readonly: false,
        acl: [],
        defaultSecurity: sub.security ?? 'internal',
        defaultCategory: sub.defaultCategory,
        entityType: entity.type,
        entityId: entity.id,
      });
    }
    return entityFolder;
  },
};

function entityRootName(type: EntityType): string {
  switch (type) {
    case 'project':       return 'פרויקטים';
    case 'client':        return 'לקוחות';
    case 'subcontractor': return 'קבלני משנה';
    case 'employee':      return 'עובדים';
    case 'supplier':      return 'ספקים';
    case 'asset':         return 'נכסים';
    case 'company':       return 'חברה';
    case 'real_estate':   return 'נדלן';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT STORE
// ═══════════════════════════════════════════════════════════════════════════

const classifier = new DocClassifier();
const searchIndex = new FullTextIndex();

// Build search index on load
(function initIndex() {
  try {
    const docs = loadLS<DocumentRecord[]>(LS.documents, []);
    for (const d of docs) {
      searchIndex.addDocument(d.id, d.searchText);
    }
  } catch {
    /* ignore */
  }
})();

export const DMS = {
  classifier,
  searchIndex,

  all(): DocumentRecord[] {
    return loadLS<DocumentRecord[]>(LS.documents, []);
  },
  save(list: DocumentRecord[]) {
    saveLS(LS.documents, list);
  },
  get(id: string): DocumentRecord | undefined {
    return this.all().find((d) => d.id === id);
  },

  // ─── Upload ────────────────────────────────────────────────────────────
  async uploadDocument(params: {
    title: string;
    fileName: string;
    mimeType: string;
    file: File | Blob;
    folderId: string;
    entityType?: EntityType;
    entityId?: string;
    entityName?: string;
    createdBy: string;
    security?: SecurityLevel;
    tagsExtra?: string[];
    metadata?: Record<string, string | number | boolean>;
  }): Promise<DocumentRecord> {
    const size = (params.file as Blob).size ?? 0;
    const sha = await sha256Hex(params.file);
    const dataUrl = size <= 2 * 1024 * 1024 ? await fileToDataUrl(params.file) : undefined;

    // duplicate detection: same folder, same sha
    const existing = this.all().find(
      (d) => d.folderId === params.folderId && d.versions.some((v) => v.sha256 === sha),
    );
    if (existing) {
      AuditLog.append({
        documentId: existing.id,
        action: 'view',
        actor: params.createdBy,
        details: `duplicate upload detected (sha=${sha.slice(0, 12)}…) — existing document returned`,
      });
      return existing;
    }

    // classify
    const cls = classifier.classify({
      title: params.title,
      fileName: params.fileName,
      mimeType: params.mimeType,
      entityType: params.entityType,
    });

    const security = params.security ?? cls.security;
    const version: DocumentVersion = {
      versionNumber: 1,
      sha256: sha,
      sizeBytes: size,
      mimeType: params.mimeType,
      uploadedBy: params.createdBy,
      uploadedAt: nowISO(),
      dataUrl,
    };

    const tags = Array.from(new Set([...cls.tags, ...(params.tagsExtra || [])]));
    const searchText = [
      params.title,
      params.fileName,
      params.entityName || '',
      tags.join(' '),
      Object.values(params.metadata || {}).join(' '),
    ].join(' ');

    const doc: DocumentRecord = {
      id: uid('doc'),
      title: params.title,
      fileName: params.fileName,
      category: cls.category,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName,
      folderId: params.folderId,
      tags,
      security,
      status: cls.requiresApproval ? 'pending_approval' : 'draft',
      currentVersion: 1,
      versions: [version],
      createdBy: params.createdBy,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      retentionYears: cls.retentionYears,
      retainUntil: addYearsISO(cls.retentionYears),
      requiresApproval: cls.requiresApproval,
      approvalSteps: cls.requiresApproval ? defaultApprovalSteps(cls.category) : [],
      acl: [],
      searchText,
      metadata: params.metadata || {},
    };

    const all = this.all();
    all.push(doc);
    this.save(all);
    searchIndex.addDocument(doc.id, doc.searchText);

    AuditLog.append({
      documentId: doc.id,
      action: 'create',
      actor: params.createdBy,
      details: `matchedRule=${cls.matchedRule ?? 'none'} sha=${sha.slice(0, 12)}… size=${size}`,
    });
    AuditLog.append({
      documentId: doc.id,
      action: 'classify',
      actor: 'system',
      details: `category=${cls.category} security=${security}`,
    });

    return doc;
  },

  // ─── Versions ──────────────────────────────────────────────────────────
  async addVersion(params: {
    documentId: string;
    file: File | Blob;
    mimeType: string;
    uploadedBy: string;
    comment?: string;
  }): Promise<DocumentRecord | undefined> {
    const all = this.all();
    const idx = all.findIndex((d) => d.id === params.documentId);
    if (idx < 0) return undefined;
    const doc = all[idx];
    const size = (params.file as Blob).size ?? 0;
    const sha = await sha256Hex(params.file);
    if (doc.versions.some((v) => v.sha256 === sha)) {
      AuditLog.append({
        documentId: doc.id,
        action: 'upload_version',
        actor: params.uploadedBy,
        details: `duplicate sha — version NOT added`,
      });
      return doc;
    }
    const dataUrl = size <= 2 * 1024 * 1024 ? await fileToDataUrl(params.file) : undefined;
    const nextNumber = doc.currentVersion + 1;
    const version: DocumentVersion = {
      versionNumber: nextNumber,
      sha256: sha,
      sizeBytes: size,
      mimeType: params.mimeType,
      uploadedBy: params.uploadedBy,
      uploadedAt: nowISO(),
      comment: params.comment,
      dataUrl,
    };
    const updated: DocumentRecord = {
      ...doc,
      currentVersion: nextNumber,
      versions: [...doc.versions, version],
      updatedAt: nowISO(),
    };
    all[idx] = updated;
    this.save(all);
    AuditLog.append({
      documentId: doc.id,
      action: 'upload_version',
      actor: params.uploadedBy,
      details: `v${nextNumber} sha=${sha.slice(0, 12)}…`,
    });
    return updated;
  },

  // ─── Approval ──────────────────────────────────────────────────────────
  approveStep(docId: string, stepNumber: number, approverId: string, comment?: string): DocumentRecord | undefined {
    const all = this.all();
    const idx = all.findIndex((d) => d.id === docId);
    if (idx < 0) return undefined;
    const doc = all[idx];
    const steps = doc.approvalSteps.map((s) =>
      s.stepNumber === stepNumber
        ? { ...s, status: 'approved' as const, approverId, decidedAt: nowISO(), comment }
        : s,
    );
    const allApproved = steps.every((s) => s.status === 'approved');
    const updated: DocumentRecord = {
      ...doc,
      approvalSteps: steps,
      status: allApproved ? 'approved' : 'pending_approval',
      updatedAt: nowISO(),
    };
    all[idx] = updated;
    this.save(all);
    AuditLog.append({
      documentId: doc.id,
      action: 'approve',
      actor: approverId,
      details: `step=${stepNumber}`,
    });
    return updated;
  },

  rejectStep(docId: string, stepNumber: number, approverId: string, comment?: string): DocumentRecord | undefined {
    const all = this.all();
    const idx = all.findIndex((d) => d.id === docId);
    if (idx < 0) return undefined;
    const doc = all[idx];
    const steps = doc.approvalSteps.map((s) =>
      s.stepNumber === stepNumber
        ? { ...s, status: 'rejected' as const, approverId, decidedAt: nowISO(), comment }
        : s,
    );
    const updated: DocumentRecord = {
      ...doc,
      approvalSteps: steps,
      status: 'rejected',
      updatedAt: nowISO(),
    };
    all[idx] = updated;
    this.save(all);
    AuditLog.append({
      documentId: doc.id,
      action: 'reject',
      actor: approverId,
      details: `step=${stepNumber}`,
    });
    return updated;
  },

  // ─── Archive / restore (never actually delete) ─────────────────────────
  archive(docId: string, actor: string): DocumentRecord | undefined {
    return this.setStatus(docId, 'archived', actor);
  },
  restore(docId: string, actor: string): DocumentRecord | undefined {
    return this.setStatus(docId, 'draft', actor, 'restore');
  },
  markDeleted(docId: string, actor: string): DocumentRecord | undefined {
    return this.setStatus(docId, 'deleted', actor, 'mark_deleted');
  },
  setStatus(docId: string, status: DocStatus, actor: string, action: AuditAction = 'update'): DocumentRecord | undefined {
    const all = this.all();
    const idx = all.findIndex((d) => d.id === docId);
    if (idx < 0) return undefined;
    const doc = all[idx];
    const updated: DocumentRecord = { ...doc, status, updatedAt: nowISO() };
    all[idx] = updated;
    this.save(all);
    AuditLog.append({ documentId: doc.id, action, actor, before: doc.status, after: status });
    return updated;
  },

  // ─── Permissions ───────────────────────────────────────────────────────
  setAcl(docId: string, acl: DocACL[], actor: string): DocumentRecord | undefined {
    const all = this.all();
    const idx = all.findIndex((d) => d.id === docId);
    if (idx < 0) return undefined;
    const doc = all[idx];
    const updated: DocumentRecord = { ...doc, acl, updatedAt: nowISO() };
    all[idx] = updated;
    this.save(all);
    AuditLog.append({
      documentId: doc.id,
      action: 'permission_change',
      actor,
      details: `acl entries=${acl.length}`,
    });
    return updated;
  },
  canAccess(doc: DocumentRecord, principalId: string, level: PermissionLevel, roles: string[] = []): boolean {
    // public docs = anyone can read
    if (level === 'read' && doc.security === 'public') return true;
    // creator always has admin
    if (doc.createdBy === principalId) return true;
    const rank: Record<PermissionLevel, number> = { read: 1, write: 2, admin: 3 };
    for (const a of doc.acl) {
      if (a.principalType === 'user' && a.principalId === principalId && rank[a.level] >= rank[level]) return true;
      if (a.principalType === 'role' && roles.includes(a.principalId) && rank[a.level] >= rank[level]) return true;
    }
    return false;
  },

  // ─── Search ────────────────────────────────────────────────────────────
  search(query: string, opts?: { category?: DocCategory; entityType?: EntityType; status?: DocStatus }): DocumentRecord[] {
    const q = query.trim();
    const all = this.all();
    let pool: DocumentRecord[];
    if (!q) {
      pool = all;
    } else {
      const ids = new Set(searchIndex.search(q));
      pool = all.filter((d) => ids.has(d.id));
    }
    return pool.filter((d) => {
      if (opts?.category && d.category !== opts.category) return false;
      if (opts?.entityType && d.entityType !== opts.entityType) return false;
      if (opts?.status && d.status !== opts.status) return false;
      return true;
    });
  },

  // ─── Retention review ──────────────────────────────────────────────────
  retentionReview(): { expiring: DocumentRecord[]; expired: DocumentRecord[] } {
    const now = Date.now();
    const soon = now + 1000 * 60 * 60 * 24 * 90; // next 90 days
    const expiring: DocumentRecord[] = [];
    const expired: DocumentRecord[] = [];
    for (const d of this.all()) {
      const t = Date.parse(d.retainUntil);
      if (!Number.isFinite(t)) continue;
      if (t <= now) expired.push(d);
      else if (t <= soon) expiring.push(d);
    }
    return { expiring, expired };
  },

  // ─── Stats ─────────────────────────────────────────────────────────────
  stats() {
    const all = this.all();
    const byCategory: Record<string, number> = {};
    const bySecurity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalBytes = 0;
    for (const d of all) {
      byCategory[d.category] = (byCategory[d.category] || 0) + 1;
      bySecurity[d.security] = (bySecurity[d.security] || 0) + 1;
      byStatus[d.status] = (byStatus[d.status] || 0) + 1;
      totalBytes += d.versions.reduce((sum, v) => sum + v.sizeBytes, 0);
    }
    return {
      totalDocuments: all.length,
      byCategory,
      bySecurity,
      byStatus,
      totalBytes,
      totalFolders: FolderStore.all().length,
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════════

function defaultApprovalSteps(category: DocCategory): ApprovalStep[] {
  switch (category) {
    case 'contract':
      return [
        { stepNumber: 1, approverRole: 'legal',     status: 'pending' },
        { stepNumber: 2, approverRole: 'manager',   status: 'pending' },
        { stepNumber: 3, approverRole: 'ceo',       status: 'pending' },
      ];
    case 'legal':
      return [
        { stepNumber: 1, approverRole: 'legal',     status: 'pending' },
        { stepNumber: 2, approverRole: 'ceo',       status: 'pending' },
      ];
    case 'safety':
      return [
        { stepNumber: 1, approverRole: 'safety_officer', status: 'pending' },
        { stepNumber: 2, approverRole: 'manager',        status: 'pending' },
      ];
    default:
      return [
        { stepNumber: 1, approverRole: 'manager', status: 'pending' },
      ];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED — company skeleton on first run
// ═══════════════════════════════════════════════════════════════════════════

export function seedDMSDemoData(): void {
  if (localStorage.getItem(LS.seed) === '1') return;
  // root company folder
  const companyRoot = FolderStore.ensureRoot('חברה');
  FolderStore.buildForEntity({ type: 'company', id: 'techno-kol', name: 'טכנו-קול' });
  // sample project
  FolderStore.buildForEntity({ type: 'project', id: 'proj-demo', name: 'פרויקט הדגמה' });
  // sample employee
  FolderStore.buildForEntity({ type: 'employee', id: 'emp-demo', name: 'עובד הדגמה' });
  // sample client
  FolderStore.buildForEntity({ type: 'client', id: 'client-demo', name: 'לקוח הדגמה' });
  void companyRoot;
  localStorage.setItem(LS.seed, '1');
}

// ═══════════════════════════════════════════════════════════════════════════
// DATAFLOW INTEGRATION — register DMS as a DataFlow consumer
// ═══════════════════════════════════════════════════════════════════════════

export async function wireDMSToDataFlow(): Promise<void> {
  try {
    const mod = await import('./dataFlowEngine');
    const { DataFlow } = mod;
    if (!DataFlow) return;
    const alreadyRegistered = DataFlow.getConsumerStats?.().some((c: any) => c.id === 'dms');
    if (alreadyRegistered) return;
    DataFlow.registerConsumer({
      id: 'dms',
      name: 'ניהול מסמכים',
      filter: { categories: ['document'] },
      handler: async (packet: any) => {
        // naive: when a document-category packet arrives, log it in audit
        AuditLog.append({
          action: 'create',
          actor: 'dataflow',
          details: `dataflow packet: ${packet?.summary || packet?.id || ''}`,
        });
      },
    } as any);
  } catch {
    /* dataFlowEngine not available — ignore */
  }
}
