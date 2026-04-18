export interface FieldTypeDefinition {
  key: string;
  label: string;
  icon: string;
  category: string;
  hasOptions?: boolean;
  hasRelation?: boolean;
}

export const FIELD_TYPE_CATEGORIES = [
  { key: "text", label: "טקסט" },
  { key: "number", label: "מספרים" },
  { key: "date", label: "תאריך וזמן" },
  { key: "selection", label: "בחירה" },
  { key: "boolean", label: "לוגי" },
  { key: "relation", label: "קשרים" },
  { key: "media", label: "מדיה" },
  { key: "contact", label: "פרטי קשר" },
  { key: "advanced", label: "מתקדם" },
];

export const FIELD_TYPES: FieldTypeDefinition[] = [
  { key: "text", label: "טקסט קצר", icon: "Type", category: "text" },
  { key: "long_text", label: "טקסט ארוך", icon: "AlignRight", category: "text" },
  { key: "rich_text", label: "טקסט עשיר", icon: "FileText", category: "text" },

  { key: "number", label: "מספר", icon: "Hash", category: "number" },
  { key: "decimal", label: "עשרוני", icon: "Hash", category: "number" },
  { key: "currency", label: "מטבע", icon: "DollarSign", category: "number" },
  { key: "percent", label: "אחוז", icon: "Percent", category: "number" },

  { key: "date", label: "תאריך", icon: "Calendar", category: "date" },
  { key: "datetime", label: "תאריך ושעה", icon: "Clock", category: "date" },
  { key: "time", label: "שעה", icon: "Clock", category: "date" },
  { key: "duration", label: "משך זמן", icon: "Timer", category: "date" },

  { key: "single_select", label: "בחירה בודדת", icon: "List", category: "selection", hasOptions: true },
  { key: "multi_select", label: "בחירה מרובה", icon: "ListChecks", category: "selection", hasOptions: true },
  { key: "tags", label: "תגיות", icon: "Tags", category: "selection", hasOptions: true },
  { key: "radio", label: "כפתורי רדיו", icon: "CircleDot", category: "selection", hasOptions: true },
  { key: "status", label: "סטטוס", icon: "Activity", category: "selection", hasOptions: true },
  { key: "category", label: "קטגוריה", icon: "FolderTree", category: "selection", hasOptions: true },

  { key: "boolean", label: "כן/לא", icon: "ToggleRight", category: "boolean" },
  { key: "checkbox", label: "תיבת סימון", icon: "CheckSquare", category: "boolean" },

  { key: "relation", label: "קשר לישות", icon: "Link", category: "relation", hasRelation: true },
  { key: "relation_list", label: "רשימת קשרים", icon: "Link2", category: "relation", hasRelation: true },
  { key: "user_reference", label: "משתמש", icon: "User", category: "relation" },

  { key: "file", label: "קובץ", icon: "Paperclip", category: "media" },
  { key: "image", label: "תמונה", icon: "Image", category: "media" },
  { key: "signature", label: "חתימה", icon: "PenTool", category: "media" },

  { key: "email", label: "אימייל", icon: "Mail", category: "contact" },
  { key: "phone", label: "טלפון", icon: "Phone", category: "contact" },
  { key: "url", label: "קישור", icon: "Globe", category: "contact" },
  { key: "address", label: "כתובת", icon: "MapPin", category: "contact" },

  { key: "json", label: "JSON", icon: "Braces", category: "advanced" },
  { key: "formula", label: "נוסחה", icon: "Calculator", category: "advanced" },
  { key: "computed", label: "שדה מחושב", icon: "Cpu", category: "advanced" },
  { key: "auto_number", label: "מספור אוטומטי", icon: "Hash", category: "advanced" },
  { key: "sub_table", label: "תת-טבלה", icon: "Table2", category: "advanced" },
  { key: "barcode", label: "ברקוד", icon: "Barcode", category: "advanced" },
  { key: "qr", label: "QR", icon: "QrCode", category: "advanced" },
];

export const FIELD_TYPE_MAP = Object.fromEntries(FIELD_TYPES.map(ft => [ft.key, ft]));

export const ENTITY_TYPES = [
  { key: "master", label: "ראשי (Master)", description: "ישות ראשית כמו לקוחות, ספקים, פרויקטים" },
  { key: "transaction", label: "תנועה (Transaction)", description: "ישות עסקה כמו הזמנה, חשבונית, תשלום" },
  { key: "child", label: "ילד (Child)", description: "ישות משנית שתלויה בישות אב" },
  { key: "reference", label: "הפניה (Reference)", description: "טבלת עזר כמו קטגוריות, סוגים" },
  { key: "log", label: "יומן (Log)", description: "ישות לתיעוד פעולות ואירועים" },
  { key: "system", label: "מערכת (System)", description: "ישות מערכתית פנימית לניהול הפלטפורמה" },
  { key: "document", label: "מסמך (Document)", description: "ישות מסמך כמו הצעת מחיר, חוזה, דו\"ח" },
  { key: "analytics", label: "אנליטיקה (Analytics)", description: "ישות לניתוח נתונים וסטטיסטיקות" },
];

export const MODULE_ICONS = [
  "Box", "Package", "Boxes", "Building", "Building2", "Store", "Factory",
  "Users", "UserCircle", "UserCheck", "Contact",
  "ShoppingCart", "ShoppingBag", "CreditCard", "Wallet", "Receipt", "DollarSign",
  "Truck", "MapPin", "Globe", "Ship", "Plane",
  "FileText", "Files", "FolderOpen", "ClipboardList", "BookOpen",
  "Settings", "Wrench", "Cog", "Shield", "Lock",
  "BarChart3", "PieChart", "TrendingUp", "Activity",
  "Calendar", "Clock", "Timer",
  "Mail", "MessageSquare", "Bell", "Phone",
  "Database", "Server", "Cloud", "Cpu",
  "Heart", "Star", "Zap", "Target", "Award",
  "Briefcase", "GraduationCap", "Stethoscope", "Hammer",
  "Layers", "Grid", "Layout", "Blocks",
];

export const STATUS_COLORS = [
  { key: "gray", label: "אפור", hex: "#6b7280" },
  { key: "blue", label: "כחול", hex: "#3b82f6" },
  { key: "green", label: "ירוק", hex: "#22c55e" },
  { key: "yellow", label: "צהוב", hex: "#eab308" },
  { key: "orange", label: "כתום", hex: "#f97316" },
  { key: "red", label: "אדום", hex: "#ef4444" },
  { key: "purple", label: "סגול", hex: "#a855f7" },
  { key: "pink", label: "ורוד", hex: "#ec4899" },
  { key: "cyan", label: "תכלת", hex: "#06b6d4" },
  { key: "indigo", label: "אינדיגו", hex: "#6366f1" },
];
