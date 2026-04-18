export interface DepartmentRoleTemplate {
  name: string;
  nameHe: string;
  nameEn: string;
  slug: string;
  description: string;
  color: string;
  department: string;
  settings: {
    isSuperAdmin: boolean;
    builderAccess: boolean;
    modules: Record<string, { view: boolean; manage: boolean; create?: boolean; edit?: boolean; delete?: boolean }>;
    entities: Record<string, { create: boolean; read: boolean; update: boolean; delete: boolean }>;
    fields: Record<string, Record<string, string>>;
    actions: Record<string, { execute: boolean }>;
  };
}

export const DEPARTMENT_ROLE_TEMPLATES: DepartmentRoleTemplate[] = [
  {
    name: "Sales Rep",
    nameHe: "נציג מכירות",
    nameEn: "Sales Rep",
    slug: "sales-rep",
    description: "נציג מכירות — גישה ללקוחות, לידים, הצעות מחיר והזמנות",
    color: "blue",
    department: "sales",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "customers-sales": { view: true, manage: false },
        "pricing-billing": { view: true, manage: false },
      },
      entities: {
        "customer": { create: true, read: true, update: true, delete: false },
        "lead": { create: true, read: true, update: true, delete: false },
        "quote": { create: true, read: true, update: true, delete: false },
        "order": { create: true, read: true, update: false, delete: false },
      },
      fields: {},
      actions: {},
    },
  },
  {
    name: "Sales Manager",
    nameHe: "מנהל מכירות",
    nameEn: "Sales Manager",
    slug: "sales-manager",
    description: "מנהל מכירות — גישה מלאה ללקוחות, לידים, דוחות מכירות ותמחור",
    color: "blue",
    department: "sales",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "customers-sales": { view: true, manage: true },
        "pricing-billing": { view: true, manage: true },
        "reports": { view: true, manage: false },
      },
      entities: {
        "customer": { create: true, read: true, update: true, delete: true },
        "lead": { create: true, read: true, update: true, delete: true },
        "quote": { create: true, read: true, update: true, delete: true },
        "order": { create: true, read: true, update: true, delete: true },
        "invoice": { create: true, read: true, update: true, delete: false },
      },
      fields: {},
      actions: {},
    },
  },
  {
    name: "Finance Clerk",
    nameHe: "פקיד כספים",
    nameEn: "Finance Clerk",
    slug: "finance-clerk",
    description: "פקיד כספים — הזנת חשבוניות, תשלומים ומעקב הוצאות",
    color: "green",
    department: "finance",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "finance": { view: true, manage: false },
        "accounting": { view: true, manage: false },
      },
      entities: {
        "invoice": { create: true, read: true, update: true, delete: false },
        "payment": { create: true, read: true, update: true, delete: false },
        "expense": { create: true, read: true, update: true, delete: false },
      },
      fields: {},
      actions: {},
    },
  },
  {
    name: "Finance Manager",
    nameHe: "מנהל כספים",
    nameEn: "Finance Manager",
    slug: "finance-manager",
    description: "מנהל כספים — גישה מלאה לחשבונאות, דוחות כספיים, תקציבים ומאזנים",
    color: "green",
    department: "finance",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "finance": { view: true, manage: true },
        "accounting": { view: true, manage: true },
        "reports": { view: true, manage: false },
      },
      entities: {
        "invoice": { create: true, read: true, update: true, delete: true },
        "payment": { create: true, read: true, update: true, delete: true },
        "expense": { create: true, read: true, update: true, delete: true },
        "budget": { create: true, read: true, update: true, delete: true },
      },
      fields: {},
      actions: {},
    },
  },
  {
    name: "HR Admin",
    nameHe: "מנהל משאבי אנוש",
    nameEn: "HR Admin",
    slug: "hr-admin",
    description: "מנהל HR — ניהול עובדים, שכר, נוכחות ומשמרות",
    color: "purple",
    department: "hr",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "hr": { view: true, manage: true },
      },
      entities: {
        "employee": { create: true, read: true, update: true, delete: true },
        "attendance": { create: true, read: true, update: true, delete: true },
        "payroll": { create: true, read: true, update: true, delete: false },
      },
      fields: {},
      actions: {},
    },
  },
  {
    name: "HR Viewer",
    nameHe: "צופה משאבי אנוש",
    nameEn: "HR Viewer",
    slug: "hr-viewer",
    description: "צפייה בלבד בנתוני עובדים ונוכחות",
    color: "purple",
    department: "hr",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "hr": { view: true, manage: false },
      },
      entities: {
        "employee": { create: false, read: true, update: false, delete: false },
        "attendance": { create: false, read: true, update: false, delete: false },
      },
      fields: {},
      actions: {},
    },
  },
  {
    name: "Procurement Officer",
    nameHe: "רכש",
    nameEn: "Procurement Officer",
    slug: "procurement-officer",
    description: "אחראי רכש — ניהול ספקים, הזמנות רכש, מלאי ותקציבים",
    color: "orange",
    department: "procurement",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "procurement-inventory": { view: true, manage: false },
        "import-operations": { view: true, manage: false },
      },
      entities: {
        "supplier": { create: true, read: true, update: true, delete: false },
        "purchase-order": { create: true, read: true, update: true, delete: false },
        "inventory-item": { create: true, read: true, update: true, delete: false },
      },
      fields: {},
      actions: {},
    },
  },
  {
    name: "Procurement Manager",
    nameHe: "מנהל רכש",
    nameEn: "Procurement Manager",
    slug: "procurement-manager",
    description: "מנהל רכש — גישה מלאה לכל פעולות הרכש, ספקים, אישורים וחוזים",
    color: "orange",
    department: "procurement",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "procurement-inventory": { view: true, manage: true },
        "import-operations": { view: true, manage: true },
        "reports": { view: true, manage: false },
      },
      entities: {
        "supplier": { create: true, read: true, update: true, delete: true },
        "purchase-order": { create: true, read: true, update: true, delete: true },
        "inventory-item": { create: true, read: true, update: true, delete: true },
        "supplier-opportunity": { create: true, read: true, update: true, delete: true },
      },
      fields: {},
      actions: {},
    },
  },
  {
    name: "Production Worker",
    nameHe: "עובד ייצור",
    nameEn: "Production Worker",
    slug: "production-worker",
    description: "עובד ייצור — צפייה בהזמנות עבודה ועצי מוצר",
    color: "yellow",
    department: "production",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "production": { view: true, manage: false },
      },
      entities: {
        "work-order": { create: false, read: true, update: true, delete: false },
        "product": { create: false, read: true, update: false, delete: false },
        "bom": { create: false, read: true, update: false, delete: false },
      },
      fields: {},
      actions: {},
    },
  },
  {
    name: "Production Manager",
    nameHe: "מנהל ייצור",
    nameEn: "Production Manager",
    slug: "production-manager",
    description: "מנהל ייצור — ניהול קווי ייצור, הזמנות עבודה, בקרת איכות ושרשרת אספקה",
    color: "yellow",
    department: "production",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "production": { view: true, manage: true },
        "installations": { view: true, manage: true },
        "field-measurements": { view: true, manage: true },
        "reports": { view: true, manage: false },
      },
      entities: {
        "work-order": { create: true, read: true, update: true, delete: true },
        "product": { create: true, read: true, update: true, delete: true },
        "bom": { create: true, read: true, update: true, delete: true },
        "installation": { create: true, read: true, update: true, delete: true },
        "measurement": { create: true, read: true, update: true, delete: true },
      },
      fields: {},
      actions: {},
    },
  },
  {
    name: "Viewer Only",
    nameHe: "צופה בלבד",
    nameEn: "Viewer Only",
    slug: "viewer-only",
    description: "צפייה בלבד — גישת קריאה לכל המודולים ללא יכולת יצירה, עריכה או מחיקה",
    color: "gray",
    department: "",
    settings: {
      isSuperAdmin: false,
      builderAccess: false,
      modules: {
        "customers-sales": { view: true, manage: false },
        "pricing-billing": { view: true, manage: false },
        "procurement-inventory": { view: true, manage: false },
        "production": { view: true, manage: false },
        "finance": { view: true, manage: false },
        "accounting": { view: true, manage: false },
        "hr": { view: true, manage: false },
        "reports": { view: true, manage: false },
      },
      entities: {},
      fields: {},
      actions: {},
    },
  },
  {
    name: "General Manager",
    nameHe: "מנכ\"ל / הנהלה",
    nameEn: "General Manager",
    slug: "management-general",
    description: "הנהלה — גישה רחבה לדשבורדים, דוחות ונתונים חוצי ארגון",
    color: "red",
    department: "management",
    settings: {
      isSuperAdmin: false,
      builderAccess: true,
      modules: {
        "customers-sales": { view: true, manage: true },
        "pricing-billing": { view: true, manage: true },
        "procurement-inventory": { view: true, manage: true },
        "production": { view: true, manage: true },
        "finance": { view: true, manage: true },
        "accounting": { view: true, manage: true },
        "hr": { view: true, manage: true },
        "reports": { view: true, manage: true },
        "projects": { view: true, manage: true },
        "approvals": { view: true, manage: true },
      },
      entities: {},
      fields: {},
      actions: {},
    },
  },
];

export const DEPARTMENTS = [
  { value: "sales", labelHe: "מכירות", labelEn: "Sales", color: "blue" },
  { value: "finance", labelHe: "כספים", labelEn: "Finance", color: "green" },
  { value: "hr", labelHe: "משאבי אנוש", labelEn: "HR", color: "purple" },
  { value: "procurement", labelHe: "רכש", labelEn: "Procurement", color: "orange" },
  { value: "production", labelHe: "ייצור", labelEn: "Production", color: "yellow" },
  { value: "management", labelHe: "הנהלה", labelEn: "Management", color: "red" },
  { value: "it", labelHe: "IT", labelEn: "IT", color: "cyan" },
  { value: "logistics", labelHe: "לוגיסטיקה", labelEn: "Logistics", color: "teal" },
  { value: "quality", labelHe: "בקרת איכות", labelEn: "Quality Control", color: "pink" },
];
