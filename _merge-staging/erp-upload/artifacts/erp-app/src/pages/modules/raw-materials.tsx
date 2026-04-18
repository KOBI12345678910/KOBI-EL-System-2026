import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Search, Plus, Edit2, Trash2, X, Save, Boxes, Filter,
  ChevronDown, ChevronUp, AlertTriangle, Upload,
  Package, Users, Tag, Grid3X3, Layers, Sparkles,
  Square, Wrench, Paintbrush, Settings2, Hammer,
  Ruler, Calculator, Zap, Shield, ShoppingCart,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const VAT = 1.18;
const PRICE_ALERT_THRESHOLD = 0.05;

function authHeaders() {
  const token = localStorage.getItem("erp_token") || localStorage.getItem("token") || "";
  return { Authorization: `Bearer ${token}` };
}

interface Material {
  id: number;
  materialNumber: string;
  materialName: string;
  category: string;
  subCategory: string | null;
  unit: string;
  description: string | null;
  minimumStock: string | null;
  currentStock: string | null;
  reorderPoint: string | null;
  standardPrice: string | null;
  currency: string | null;
  weightPerUnit: string | null;
  weightPerMeter: string | null;
  dimensions: string | null;
  materialGrade: string | null;
  materialType: string | null;
  finish: string | null;
  thickness: string | null;
  width: string | null;
  height: string | null;
  status: string;
  notes: string | null;
  supplierId: number | null;
  updatedAt: string;
  rodLength: string | null;
  pricingMethod: string | null;
  pricePerMeter: string | null;
  pricePerKg: string | null;
  packageQuantity: string | null;
  totalPriceBeforeVat: string | null;
  totalPriceAfterVat: string | null;
  diameter: string | null;
  innerDiameter: string | null;
  innerType: string | null;
  standard: string | null;
  countryOfOrigin: string | null;
  color: string | null;
  minimumOrder: string | null;
  deliveryDays: number | null;
  warrantyMonths: number | null;
}

interface Supplier {
  id: number;
  supplierName: string;
  supplierNumber: string;
  status: string;
}

const CATEGORIES = [
  "ברזל", "אלומיניום", "נירוסטה", "זכוכית", "פרזול",
  "צבע וציפויים", "חומרי ליטוש ושחיקה", "חומרי הלחמה",
  "חומרי איטום ודבק", "אביזרי בטיחות", "חומרי אריזה",
  "כלי עבודה מתכלים", "חשמל ותאורה", "כללי",
];

const SUBCATEGORIES: Record<string, string[]> = {
  "ברזל": [
    "ברזל שחור (חם)", "ברזל מגולוון (קר)", "ברזל בלגי", "פח שחור", "פח מגולוון",
    "פרופיל ברזל מרובע", "פרופיל ברזל מלבני", "פרופיל ברזל עגול",
    "צינור ברזל שחור", "צינור ברזל מגולוון",
    "ברזל זווית (L)", "ברזל T", "ברזל U (תעלה)", "ברזל H (IPE/HEA)",
    "מוט ברזל עגול (מלא)", "מוט ברזל מרובע", "מוט ברזל שטוח (פס)",
    "רשת ברזל מרותכת", "רשת ברזל מורחבת (סורג)",
    "גיליון ברזל (פלטה)", "תבנית (checker plate)", "אחר",
  ],
  "אלומיניום": [
    "פרופיל אלומיניום אנודייז כסף", "פרופיל אלומיניום אנודייז ברונזה", "פרופיל אלומיניום אנודייז שחור",
    "פרופיל אלומיניום RAL (צבע אבקה)", "פרופיל אלומיניום גלם (טבעי)",
    "פרופיל אלומיניום תרמי (עם גשר תרמי)", "פרופיל אלומיניום ללא גשר תרמי",
    "צינור אלומיניום עגול", "צינור אלומיניום מרובע", "צינור אלומיניום מלבני",
    "גיליון אלומיניום (פלטה)", "לוח אלומיניום מחורר",
    "מוט אלומיניום עגול", "מוט אלומיניום מרובע", "פס אלומיניום שטוח",
    "זווית אלומיניום", "U אלומיניום", "אחר",
  ],
  "נירוסטה": [
    "נירוסטה 304", "נירוסטה 316 (ימי)", "נירוסטה 430",
    "צינור נירוסטה עגול", "צינור נירוסטה מרובע", "צינור נירוסטה מלבני",
    "גיליון נירוסטה מוברש", "גיליון נירוסטה מראה", "גיליון נירוסטה מט",
    "מוט נירוסטה עגול", "מוט נירוסטה מרובע",
    "זווית נירוסטה", "פס נירוסטה שטוח", "אחר",
  ],
  "זכוכית": [
    "זכוכית שקופה רגילה (float)", "זכוכית מחוסמת (טמפרד)", "זכוכית למינציה (בטיחות)",
    "זכוכית כפולה (תרמית)", "זכוכית משולשת",
    "זכוכית חלבית (חומצית)", "זכוכית סנדבלסט", "זכוכית צבעונית (לקובלית)",
    "זכוכית LOW-E (חסכונית)", "זכוכית שמש (סולארית)",
    "זכוכית בלגי (שבלולית/פרובנס)", "זכוכית דקורטיבית",
    "מראה רגילה", "מראה בטיחותית", "אחר",
  ],
  "פרזול": [
    "בורג עץ", "בורג מתכת", "בורג נירוסטה", "בורג אלן", "בורג קוצר", "בורג בטון",
    "אום רגיל", "אום ביטחון (ניילוק)", "אום כנף", "אום מרובע",
    "דיבל פלסטיק", "דיבל פלדה", "דיבל כימי", "עוגן פלדה",
    "ברגי TEK (קודח עצמי)", "ברגי גבס", "מסמרים", "סיכות",
    "רתכי POP (ניטים)", "ניטים מושכים", "ניטים בורגיים",
    "ציר רגיל", "ציר פסנתר", "ציר שקוע", "ציר הידראולי",
    "מנעול צילינדר", "מנעול חשמלי", "מנעול פאניקה",
    "ידית חלון", "ידית דלת", "ידית קבועה", "ידית U",
    "מסילה לדלת הזזה", "מוביל חלון", "גלגלון",
    "גומי EPDM", "גומי סיליקון", "מברשת הצמדה", "אחר",
  ],
  "צבע וציפויים": [
    "ספריי ברזל", "ספריי אלומיניום", "ספריי נירוסטה", "ספריי אוניברסלי",
    "ספריי גלם", "ספריי מגולוון", "ספריי שחור", "ספריי לבן", "ספריי RAL",
    "צבע אבקה (powder coating) - RAL",
    "פריימר ברזל", "פריימר אלומיניום", "פריימר אפוקסי",
    "מדלל (טינר)", "מסיר צבע", "ממיס",
    "צבע אנטי-חלודה", "צבע אש (עמיד חום)", "צבע ימי", "אחר",
  ],
  "חומרי ליטוש ושחיקה": [
    "משחזת ברזל 115מ\"מ", "משחזת ברזל 125מ\"מ", "משחזת ברזל 230מ\"מ",
    "משחזת נירוסטה", "משחזת אלומיניום",
    "דיסק פלאפ 40", "דיסק פלאפ 60", "דיסק פלאפ 80", "דיסק פלאפ 120", "דיסק סקוצ'",
    "נייר שמיר P40", "נייר שמיר P60", "נייר שמיר P80", "נייר שמיר P120",
    "נייר שמיר P180", "נייר שמיר P220", "נייר שמיר P320", "נייר שמיר P400",
    "חוט ברזל (מברשת)", "גלגל הברקה", "משחת הברקה",
    "להב מתכת", "להב אלומיניום", "להב נירוסטה",
    "מקדח ברזל HSS", "מקדח קובלט", "מקדח SDS", "מקדח יהלום", "אחר",
  ],
  "חומרי הלחמה": [
    "אלקטרודות 6013 2.5מ\"מ", "אלקטרודות 6013 3.2מ\"מ", "אלקטרודות 6013 4.0מ\"מ",
    "אלקטרודות נירוסטה 308", "אלקטרודות נירוסטה 316",
    "חוט ריתוך MIG 0.8מ\"מ", "חוט ריתוך MIG 1.0מ\"מ", "חוט ריתוך MIG 1.2מ\"מ",
    "חוט ריתוך נירוסטה", "חוט ריתוך אלומיניום",
    "מוט TIG ברזל", "מוט TIG נירוסטה 308", "מוט TIG נירוסטה 316",
    "מוט TIG אלומיניום 4043", "מוט TIG אלומיניום 5356",
    "גז ארגון", "גז CO2", "גז מיקס (Ar+CO2)",
    "בדיל", "שטף (flux)", "משחת הלחמה", "אחר",
  ],
  "חומרי איטום ודבק": [
    "סיליקון שקוף", "סיליקון לבן", "סיליקון שחור", "סיליקון עמיד חום",
    "דבק PU (פוליאוריתן)", "אפוקסי דו-רכיבי", "דבק רגע (ציאנואקרילט)",
    "טייפ דו-צדדי", "טייפ אלומיניום", "טייפ בידוד", "אחר",
  ],
  "אביזרי בטיחות": ["כפפות עבודה", "משקפי מגן", "מסכת ריתוך", "אטמי אוזניים", "קסדת בטיחות", "נעלי בטיחות", "חגורת בטיחות", "אחר"],
  "חומרי אריזה": ["ניילון מתיחה", "ניילון בועות", "קרטון", "סרט דבק", "סרט מאסקינג", "אחר"],
  "כלי עבודה מתכלים": ["להבי מסור מתכת", "להבי מסור אלומיניום", "מקדחים", "שושנות", "להבי חרב", "אחר"],
  "חשמל ותאורה": ["כבל חשמל", "מפסק", "שקע", "נורה LED", "פנס", "מאריך", "אחר"],
  "כללי": ["אחר"],
};

const PRICING_METHODS = [
  "יחידה", "מטר רץ", "ק\"ג", "טון", "מ\"ר", "חבילה",
];

const UNITS = [
  "יחידה", "מטר רץ", "מ\"ר", "ק\"ג", "טון", "ליטר", "גליל", "חבילה",
  "קרטון", "שק", "מ\"ק", "סט", "זוג", "תריסר (12)", "מאה (100)", "אלף",
];

const MATERIAL_TYPES = [
  "פרופיל", "צינור", "מוט (עגול)", "מוט (מרובע)", "פס שטוח",
  "זווית (L)", "U תעלה", "T", "H (IPE/HEA)", "לוח/גיליון", "רשת",
  "קורה", "תבנית", "צינור עגול", "צינור מרובע", "צינור מלבני",
  "חוט", "סרט/גליל", "גרגיר/אבקה", "נוזל", "יחידה בודדת",
];

const FINISHES = [
  "גלם (טבעי)", "מגולוון חם", "מגולוון קר (אלקטרו)", "צבוע RAL",
  "אנודייז כסף", "אנודייז ברונזה", "אנודייז שחור", "אנודייז זהב",
  "מוברש", "מראה (פוליש)", "חול (סנדבלסט)", "חומצי (אצ'ינג)",
  "צבע אבקה", "שעועית", "לכה", "כרום", "ניקל", "פוספט", "אבץ-ניקל",
];

const INNER_TYPES = ["חלול", "מלא"];
const STANDARDS = ["ISO", "DIN", "ASTM", "ישראלי", "EN", "JIS", "אחר"];
const ROD_LENGTH_PRESETS = ["6.0", "6.1", "6.5", "5.8", "3.0", "4.0", "12.0"];

type SortField = "name" | "price" | "date";
type SortDir = "asc" | "desc";

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "ברזל": Hammer,
  "אלומיניום": Layers,
  "זכוכית": Sparkles,
  "נירוסטה": Settings2,
  "פרזול": Wrench,
  "צבע וציפויים": Paintbrush,
  "חומרי ליטוש ושחיקה": Square,
  "חומרי הלחמה": Zap,
  "חומרי איטום ודבק": Package,
  "אביזרי בטיחות": Shield,
  "חומרי אריזה": Boxes,
  "כלי עבודה מתכלים": Wrench,
  "חשמל ותאורה": Zap,
  "כללי": Package,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "ברזל":                  { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/30",    dot: "bg-blue-400" },
  "אלומיניום":             { bg: "bg-purple-500/10",  text: "text-purple-400",  border: "border-purple-500/30",  dot: "bg-purple-400" },
  "זכוכית":               { bg: "bg-cyan-500/10",    text: "text-cyan-400",    border: "border-cyan-500/30",    dot: "bg-cyan-400" },
  "נירוסטה":              { bg: "bg-muted/10",    text: "text-gray-300",    border: "border-gray-500/30",    dot: "bg-gray-300" },
  "פרזול":                { bg: "bg-orange-500/10",  text: "text-orange-400",  border: "border-orange-500/30",  dot: "bg-orange-400" },
  "צבע וציפויים":         { bg: "bg-pink-500/10",    text: "text-pink-400",    border: "border-pink-500/30",    dot: "bg-pink-400" },
  "חומרי ליטוש ושחיקה":  { bg: "bg-yellow-500/10",  text: "text-yellow-400",  border: "border-yellow-500/30",  dot: "bg-yellow-400" },
  "חומרי הלחמה":          { bg: "bg-red-500/10",     text: "text-red-400",     border: "border-red-500/30",     dot: "bg-red-400" },
  "חומרי איטום ודבק":    { bg: "bg-teal-500/10",    text: "text-teal-400",    border: "border-teal-500/30",    dot: "bg-teal-400" },
  "אביזרי בטיחות":       { bg: "bg-green-500/10",   text: "text-green-400",   border: "border-green-500/30",   dot: "bg-green-400" },
  "חומרי אריזה":          { bg: "bg-indigo-500/10",  text: "text-indigo-400",  border: "border-indigo-500/30",  dot: "bg-indigo-400" },
  "כלי עבודה מתכלים":    { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/30",   dot: "bg-amber-400" },
  "חשמל ותאורה":         { bg: "bg-lime-500/10",    text: "text-lime-400",    border: "border-lime-500/30",    dot: "bg-lime-400" },
  "כללי":                 { bg: "bg-muted/10",   text: "text-muted-foreground",   border: "border-slate-500/30",   dot: "bg-slate-400" },
};

function getCategoryColors(cat: string) {
  return CATEGORY_COLORS[cat] ?? { bg: "bg-muted/10", text: "text-muted-foreground", border: "border-slate-500/30", dot: "bg-slate-400" };
}

function parsePrevPrice(notes: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(/prev_price:([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function buildNotesWithPrevPrice(notes: string, prevPrice: number | null): string {
  const stripped = notes.replace(/\s*prev_price:[\d.]+\s*/g, "").trim();
  if (prevPrice !== null && !isNaN(prevPrice)) {
    return stripped ? `${stripped} prev_price:${prevPrice}` : `prev_price:${prevPrice}`;
  }
  return stripped;
}

const emptyForm = {
  materialNumber: "", materialName: "", category: "כללי", subCategory: "", unit: "יחידה",
  description: "", minimumStock: "", currentStock: "", reorderPoint: "", standardPrice: "",
  currency: "ILS", weightPerUnit: "", weightPerMeter: "", dimensions: "", materialGrade: "",
  status: "פעיל", notes: "", supplierId: "", materialType: "", finish: "",
  thickness: "", width: "", height: "", diameter: "", innerDiameter: "",
  innerType: "", standard: "", countryOfOrigin: "", color: "",
  minimumOrder: "", deliveryDays: "", warrantyMonths: "",
  priceWithVat: "", pricingMethod: "יחידה", rodLength: "",
  pricePerMeter: "", pricePerKg: "", packageQuantity: "",
  totalPriceBeforeVat: "", totalPriceAfterVat: "",
  customCategory: "", customSubCategory: "", customUnit: "", customFinish: "", isCustom: false,
};

interface BulkRow {
  materialNumber: string;
  materialName: string;
  category: string;
  materialType: string;
  finish: string;
  unit: string;
  standardPrice: string;
  supplierId: string;
  pricingMethod: string;
}

function emptyBulkRow(): BulkRow {
  return {
    materialNumber: "", materialName: "", category: "כללי", materialType: "",
    finish: "", unit: "יחידה", standardPrice: "", supplierId: "", pricingMethod: "יחידה",
  };
}

function computeTotals(form: typeof emptyForm): { totalBeforeVat: number | null; totalAfterVat: number | null } {
  const pm = form.pricingMethod;
  let basePrice: number | null = null;
  if ((pm === "מטר רץ" || pm === "מטר") && form.pricePerMeter) basePrice = parseFloat(form.pricePerMeter);
  else if ((pm === "ק\"ג" || pm === "ק״ג") && form.pricePerKg) basePrice = parseFloat(form.pricePerKg);
  else if (form.standardPrice) basePrice = parseFloat(form.standardPrice);

  if (basePrice === null || isNaN(basePrice)) return { totalBeforeVat: null, totalAfterVat: null };

  const qty = form.packageQuantity ? parseFloat(form.packageQuantity) : 1;
  const qtyFactor = isNaN(qty) ? 1 : qty;
  const totalBeforeVat = basePrice * qtyFactor;
  const totalAfterVat = totalBeforeVat * VAT;
  return { totalBeforeVat, totalAfterVat };
}

function buildPayload(form: typeof emptyForm, prevPrice: number | null = null) {
  let dimensions = form.dimensions || undefined;
  if (!dimensions && (form.thickness || form.width || form.height)) {
    const parts = [form.width || "0", form.height || "0", form.thickness || "0"];
    dimensions = parts.join("x");
  }

  const { totalBeforeVat, totalAfterVat } = computeTotals(form);
  const effectiveCategory = form.isCustom && form.customCategory ? form.customCategory : form.category;
  const effectiveUnit = form.isCustom && form.customUnit ? form.customUnit : form.unit;
  const effectiveFinish = form.isCustom && form.customFinish ? form.customFinish : form.finish;
  const effectiveSubCat = form.isCustom && form.customSubCategory ? form.customSubCategory : form.subCategory;

  const payload: Record<string, unknown> = {
    materialNumber: form.materialNumber,
    materialName: form.materialName,
    category: effectiveCategory,
    unit: effectiveUnit,
    description: form.description || undefined,
    minimumStock: form.minimumStock || undefined,
    currentStock: form.currentStock || undefined,
    reorderPoint: form.reorderPoint || undefined,
    standardPrice: form.standardPrice || undefined,
    currency: form.currency || undefined,
    weightPerUnit: form.weightPerUnit || undefined,
    weightPerMeter: form.weightPerMeter || undefined,
    dimensions,
    materialGrade: form.materialGrade || undefined,
    materialType: form.materialType || undefined,
    finish: effectiveFinish || undefined,
    thickness: form.thickness || undefined,
    width: form.width || undefined,
    height: form.height || undefined,
    status: form.status,
    pricingMethod: form.pricingMethod || "יחידה",
    rodLength: form.rodLength || undefined,
    pricePerMeter: form.pricePerMeter || undefined,
    pricePerKg: form.pricePerKg || undefined,
    packageQuantity: form.packageQuantity || undefined,
    totalPriceBeforeVat: totalBeforeVat !== null ? String(totalBeforeVat.toFixed(4)) : undefined,
    totalPriceAfterVat: totalAfterVat !== null ? String(totalAfterVat.toFixed(4)) : undefined,
    diameter: form.diameter || undefined,
    innerDiameter: form.innerDiameter || undefined,
    innerType: form.innerType || undefined,
    standard: form.standard || undefined,
    countryOfOrigin: form.countryOfOrigin || undefined,
    color: form.color || undefined,
    minimumOrder: form.minimumOrder || undefined,
    deliveryDays: form.deliveryDays ? parseInt(form.deliveryDays) : undefined,
    warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths) : undefined,
  };
  if (form.supplierId && form.supplierId !== "") {
    payload.supplierId = form.supplierId;
  }
  payload.subCategory = effectiveSubCat || undefined;
  const notesBase = form.notes || "";
  payload.notes = buildNotesWithPrevPrice(notesBase, prevPrice);
  return payload;
}

function buildBulkPayload(row: BulkRow) {
  const payload: Record<string, unknown> = {
    materialNumber: row.materialNumber,
    materialName: row.materialName,
    category: row.category,
    unit: row.unit,
    subCategory: row.materialType || undefined,
    materialType: row.materialType || undefined,
    finish: row.finish || undefined,
    standardPrice: row.standardPrice || undefined,
    pricingMethod: row.pricingMethod || "יחידה",
  };
  if (row.supplierId && row.supplierId !== "") {
    payload.supplierId = row.supplierId;
  }
  return payload;
}

export default function RawMaterialsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSubCategory, setFilterSubCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [formTab, setFormTab] = useState<"single" | "bulk">("single");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow()]);
  const [supplierError, setSupplierError] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("basic");
  const [filterMaterialType, setFilterMaterialType] = useState("all");
  const [detailTab, setDetailTab] = useState("details");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({ materialNumber: { required: true, message: "מספר חומר נדרש" }, materialName: { required: true, message: "שם חומר נדרש" } });
  const [filterFinish, setFilterFinish] = useState("all");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: materials = [], isLoading } = useQuery<Material[]>({
    queryKey: ["raw-materials", search, filterCategory, filterSubCategory],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (filterCategory !== "all") p.set("category", filterCategory);
      if (filterSubCategory !== "all") p.set("subCategory", filterSubCategory);
      const r = await authFetch(`${API}/raw-materials?${p}`, { headers: authHeaders() });
      return r.json();
    },
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const r = await authFetch(`${API}/suppliers`, { headers: authHeaders() });
      return r.json();
    },
  });
  const activeSuppliers = suppliers.filter(s => s.status === "פעיל");

  const createMut = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const payload = buildPayload(data);
      const r = await authFetch(`${API}/raw-materials`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["raw-materials"] }); closeForm(); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data, prevPrice }: { id: number; data: typeof emptyForm; prevPrice: number | null }) => {
      const payload = buildPayload(data, prevPrice);
      const r = await authFetch(`${API}/raw-materials/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["raw-materials"] }); closeForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await authFetch(`${API}/raw-materials/${id}`, { method: "DELETE", headers: authHeaders() }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["raw-materials"] }); setDeleteConfirm(null); },
  });

  const bulkMut = useMutation({
    mutationFn: async (rows: BulkRow[]) => {
      const payload = rows.map(buildBulkPayload);
      const r = await authFetch(`${API}/raw-materials/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ materials: payload }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["raw-materials"] }); closeForm(); },
  });

  function closeForm() {
    setShowForm(false); setEditingId(null); setEditingMaterial(null); setForm(emptyForm);
    setFormTab("single"); setBulkRows([emptyBulkRow()]); setSupplierError(false);
    setActiveSection("basic");
  }

  function openEdit(m: Material) {
    const notesRaw = m.notes || "";
    const finishFromNotes = notesRaw.match(/גימור:\s*([^|]+)/);
    const cleanNotes = notesRaw
      .replace(/גימור:\s*[^|]+(\|)?/g, "")
      .replace(/prev_price:[\d.]+/g, "")
      .replace(/\s*\|\s*/g, " ")
      .trim();

    setForm({
      materialNumber: m.materialNumber,
      materialName: m.materialName,
      category: m.category,
      subCategory: m.subCategory || "",
      unit: m.unit,
      description: m.description || "",
      minimumStock: m.minimumStock || "",
      currentStock: m.currentStock || "",
      reorderPoint: m.reorderPoint || "",
      standardPrice: m.standardPrice || "",
      currency: m.currency || "ILS",
      weightPerUnit: m.weightPerUnit || "",
      weightPerMeter: m.weightPerMeter || "",
      dimensions: m.dimensions || "",
      materialGrade: m.materialGrade || "",
      status: m.status,
      notes: cleanNotes,
      supplierId: m.supplierId ? String(m.supplierId) : "",
      materialType: m.materialType || "",
      finish: m.finish || (finishFromNotes ? finishFromNotes[1].trim() : ""),
      thickness: m.thickness || "",
      width: m.width || "",
      height: m.height || "",
      diameter: m.diameter || "",
      innerDiameter: m.innerDiameter || "",
      innerType: m.innerType || "",
      standard: m.standard || "",
      countryOfOrigin: m.countryOfOrigin || "",
      color: m.color || "",
      minimumOrder: m.minimumOrder || "",
      deliveryDays: m.deliveryDays !== null ? String(m.deliveryDays) : "",
      warrantyMonths: m.warrantyMonths !== null ? String(m.warrantyMonths) : "",
      priceWithVat: m.standardPrice ? (parseFloat(m.standardPrice) * VAT).toFixed(2) : "",
      pricingMethod: m.pricingMethod || "יחידה",
      rodLength: m.rodLength || "",
      pricePerMeter: m.pricePerMeter || "",
      pricePerKg: m.pricePerKg || "",
      packageQuantity: m.packageQuantity || "",
      totalPriceBeforeVat: m.totalPriceBeforeVat || "",
      totalPriceAfterVat: m.totalPriceAfterVat || "",
      customCategory: "", customSubCategory: "", customUnit: "", customFinish: "", isCustom: false,
    });
    setEditingId(m.id);
    setEditingMaterial(m);
    setShowForm(true);
    setFormTab("single");
    setActiveSection("basic");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.materialNumber || !form.materialName) return;
    if (!form.supplierId) { setSupplierError(true); return; }
    setSupplierError(false);
    if (editingId && editingMaterial) {
      const oldPrice = editingMaterial.standardPrice ? parseFloat(editingMaterial.standardPrice) : null;
      const newPrice = form.standardPrice ? parseFloat(form.standardPrice) : null;
      const prevPriceToStore = (oldPrice !== null && newPrice !== null && oldPrice !== newPrice) ? oldPrice : parsePrevPrice(editingMaterial.notes);
      updateMut.mutate({ id: editingId, data: form, prevPrice: prevPriceToStore });
    } else {
      createMut.mutate(form);
    }
  }

  function handleBulkSubmit() {
    const valid = bulkRows.filter(r => r.materialNumber && r.materialName);
    if (valid.length === 0) return;
    bulkMut.mutate(valid);
  }

  function toggleCategory(cat: string) {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  function updateNetPrice(v: string) {
    const net = parseFloat(v);
    setForm(f => {
      const updated = { ...f, standardPrice: v, priceWithVat: isNaN(net) ? "" : (net * VAT).toFixed(2) };
      const { totalBeforeVat, totalAfterVat } = computeTotals(updated);
      return { ...updated, totalPriceBeforeVat: totalBeforeVat !== null ? totalBeforeVat.toFixed(2) : "", totalPriceAfterVat: totalAfterVat !== null ? totalAfterVat.toFixed(2) : "" };
    });
  }

  function updateGrossPrice(v: string) {
    const gross = parseFloat(v);
    setForm(f => {
      const updated = { ...f, priceWithVat: v, standardPrice: isNaN(gross) ? "" : (gross / VAT).toFixed(2) };
      const { totalBeforeVat, totalAfterVat } = computeTotals(updated);
      return { ...updated, totalPriceBeforeVat: totalBeforeVat !== null ? totalBeforeVat.toFixed(2) : "", totalPriceAfterVat: totalAfterVat !== null ? totalAfterVat.toFixed(2) : "" };
    });
  }

  function updatePriceField(field: "pricePerMeter" | "pricePerKg" | "packageQuantity", v: string) {
    setForm(f => {
      const updated = { ...f, [field]: v };
      if (field === "pricePerMeter" && (f.pricingMethod === "מטר רץ" || f.pricingMethod === "מטר")) {
        updated.standardPrice = v;
        updated.priceWithVat = v ? (parseFloat(v) * VAT).toFixed(2) : "";
      }
      if (field === "pricePerKg" && (f.pricingMethod === "ק\"ג" || f.pricingMethod === "ק״ג")) {
        updated.standardPrice = v;
        updated.priceWithVat = v ? (parseFloat(v) * VAT).toFixed(2) : "";
      }
      const { totalBeforeVat, totalAfterVat } = computeTotals(updated);
      return { ...updated, totalPriceBeforeVat: totalBeforeVat !== null ? totalBeforeVat.toFixed(2) : "", totalPriceAfterVat: totalAfterVat !== null ? totalAfterVat.toFixed(2) : "" };
    });
  }

  function updatePricingMethod(v: string) {
    setForm(f => {
      const updated = { ...f, pricingMethod: v };
      if ((v === "מטר רץ" || v === "מטר") && f.pricePerMeter) {
        updated.standardPrice = f.pricePerMeter;
        updated.priceWithVat = (parseFloat(f.pricePerMeter) * VAT).toFixed(2);
      } else if ((v === "ק\"ג" || v === "ק״ג") && f.pricePerKg) {
        updated.standardPrice = f.pricePerKg;
        updated.priceWithVat = (parseFloat(f.pricePerKg) * VAT).toFixed(2);
      }
      const { totalBeforeVat, totalAfterVat } = computeTotals(updated);
      return { ...updated, totalPriceBeforeVat: totalBeforeVat !== null ? totalBeforeVat.toFixed(2) : "", totalPriceAfterVat: totalAfterVat !== null ? totalAfterVat.toFixed(2) : "" };
    });
  }

  function computeWeightTotal() {
    const wpm = parseFloat(form.weightPerMeter);
    const len = parseFloat(form.rodLength);
    if (!isNaN(wpm) && !isNaN(len)) return (wpm * len).toFixed(3);
    return null;
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function getSortIcon(field: SortField) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-muted-foreground" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />;
  }

  const materialsWithPriceChange = useMemo(() => {
    return materials.map(m => {
      const prev = parsePrevPrice(m.notes);
      const current = m.standardPrice ? parseFloat(m.standardPrice) : null;
      let changePct: number | null = null;
      if (prev !== null && current !== null && prev > 0) {
        changePct = (current - prev) / prev;
      }
      return { ...m, changePct };
    });
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    let result = materialsWithPriceChange;
    if (filterMaterialType !== "all") {
      result = result.filter(m => m.materialType === filterMaterialType || m.materialGrade === filterMaterialType);
    }
    if (filterFinish !== "all") {
      result = result.filter(m => m.finish === filterFinish);
    }
    if (sortField) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (sortField === "name") cmp = (a.materialName || "").localeCompare(b.materialName || "", "he");
        else if (sortField === "price") {
          const pa = a.standardPrice ? parseFloat(a.standardPrice) : 0;
          const pb = b.standardPrice ? parseFloat(b.standardPrice) : 0;
          cmp = pa - pb;
        } else if (sortField === "date") {
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        }
        return sortDir === "desc" ? -cmp : cmp;
      });
    }
    return result;
  }, [materialsWithPriceChange, filterMaterialType, filterFinish, sortField, sortDir]);

  const priceAlerts = useMemo(
    () => filteredMaterials.filter(m => m.changePct !== null && m.changePct > PRICE_ALERT_THRESHOLD).length,
    [filteredMaterials]
  );

  const grouped = useMemo(() => {
    return filteredMaterials.reduce<Record<string, typeof filteredMaterials>>((acc, m) => {
      const cat = m.category || "כללי";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(m);
      return acc;
    }, {});
  }, [filteredMaterials]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, { beforeVat: number; afterVat: number }> = {};
    for (const [cat, items] of Object.entries(grouped)) {
      let beforeVat = 0;
      let afterVat = 0;
      for (const m of items) {
        if (m.totalPriceAfterVat) afterVat += parseFloat(m.totalPriceAfterVat);
        else if (m.standardPrice) {
          const n = parseFloat(m.standardPrice);
          beforeVat += n;
          afterVat += n * VAT;
        }
        if (m.totalPriceBeforeVat) beforeVat += parseFloat(m.totalPriceBeforeVat);
      }
      totals[cat] = { beforeVat, afterVat };
    }
    return totals;
  }, [grouped]);

  const grandTotal = useMemo(() => {
    return Object.values(categoryTotals).reduce((acc, t) => ({ beforeVat: acc.beforeVat + t.beforeVat, afterVat: acc.afterVat + t.afterVat }), { beforeVat: 0, afterVat: 0 });
  }, [categoryTotals]);

  const activeSupplierIds = new Set(materials.filter(m => m.supplierId).map(m => m.supplierId));

  const stats = [
    { label: "סה\"כ חומרים", value: materials.length, icon: <Boxes className="w-5 h-5" />, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "קטגוריות פעילות", value: Object.keys(grouped).length, icon: <Grid3X3 className="w-5 h-5" />, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "התראות מחיר", value: priceAlerts, icon: <AlertTriangle className="w-5 h-5" />, color: priceAlerts > 0 ? "text-amber-400" : "text-muted-foreground", bg: priceAlerts > 0 ? "bg-amber-500/10" : "bg-muted/10" },
    { label: "ספקים פעילים", value: activeSupplierIds.size, icon: <Users className="w-5 h-5" />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  ];

  function getSupplierName(id: number | null) {
    if (!id) return "—";
    const s = suppliers.find(s => s.id === id);
    return s ? s.supplierName : String(id);
  }

  function formatDate(d: string) {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
    catch { return d; }
  }

  function pricingLabel(method: string | null) {
    if (!method || method === "יחידה") return "ליח'";
    if (method === "מטר רץ" || method === "מטר") return "למ'";
    if (method === "ק\"ג" || method === "ק״ג") return "לק\"ג";
    if (method === "טון") return "לטון";
    if (method === "מ\"ר") return "למ\"ר";
    if (method === "חבילה") return "לחב'";
    return method;
  }

  const categoriesToShow = filterCategory === "all" ? Object.keys(grouped) : (grouped[filterCategory] ? [filterCategory] : []);
  const currentSubcats = SUBCATEGORIES[form.category] || ["אחר"];
  const { totalBeforeVat: previewBefore, totalAfterVat: previewAfter } = computeTotals(form);
  const weightTotal = computeWeightTotal();

  const FORM_SECTIONS = [
    { id: "basic", label: "פרטים בסיסיים" },
    { id: "dimensions", label: "מידות" },
    { id: "pricing", label: "תמחור" },
    { id: "extra", label: "פרטים נוספים" },
  ];

  const availableSubcats = filterCategory !== "all" ? (SUBCATEGORIES[filterCategory] || []) : [];
  const usedMaterialTypes = useMemo(() => {
    const types = new Set<string>();
    for (const m of materials) {
      if (m.materialType) types.add(m.materialType);
      if (m.materialGrade) types.add(m.materialGrade);
    }
    return [...types];
  }, [materials]);
  const usedFinishes = useMemo(() => {
    const finishes = new Set<string>();
    for (const m of materials) {
      if (m.finish) finishes.add(m.finish);
    }
    return [...finishes];
  }, [materials]);

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <Boxes className="w-8 h-8 text-orange-400" />קטלוג חומרי גלם
            </h1>
            <p className="text-muted-foreground mt-1">ניהול חומרי גלם, מחירים וספקים — מתכת, אלומיניום, זכוכית וחומרי עזר</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1d23] border border-gray-700 hover:border-gray-500 text-gray-300 rounded-lg font-medium text-sm">
              <Upload className="w-4 h-4" />ייבוא Excel/CSV
            </button>
            <button
              onClick={() => { setForm(emptyForm); setEditingId(null); setEditingMaterial(null); setShowForm(true); setFormTab("single"); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium"
            >
              <Plus className="w-5 h-5" />הוסף חומר
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className="bg-[#1a1d23] border border-gray-800 rounded-xl p-4 flex items-center gap-3">
              <div className={`${s.bg} ${s.color} p-2 rounded-lg`}>{s.icon}</div>
              <div>
                <p className="text-muted-foreground text-xs">{s.label}</p>
                <p className={`text-lg sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {priceAlerts > 0 && (
          <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium">{priceAlerts} {priceAlerts === 1 ? "חומר" : "חומרים"} עם עליית מחיר מעל 5% — מומלץ לבדוק</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text" placeholder={'חיפוש לפי שם, מק"ט...'} value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 bg-[#1a1d23] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setFilterSubCategory("all"); }}
              className="bg-[#1a1d23] border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="all">כל הקטגוריות</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {filterCategory !== "all" && availableSubcats.length > 0 && (
              <select
                value={filterSubCategory} onChange={e => setFilterSubCategory(e.target.value)}
                className="bg-[#1a1d23] border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="all">כל תת-הקטגוריות</option>
                {availableSubcats.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {usedMaterialTypes.length > 0 && (
              <select
                value={filterMaterialType} onChange={e => setFilterMaterialType(e.target.value)}
                className="bg-[#1a1d23] border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="all">כל סוגי החומר</option>
                {usedMaterialTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {usedFinishes.length > 0 && (
              <select
                value={filterFinish} onChange={e => setFilterFinish(e.target.value)}
                className="bg-[#1a1d23] border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="all">כל הגימורים</option>
                {usedFinishes.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground ml-1">מיון:</span>
            <button onClick={() => toggleSort("name")} className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${sortField === "name" ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" : "bg-[#1a1d23] text-muted-foreground border border-gray-700 hover:text-white"}`}>
              שם {getSortIcon("name")}
            </button>
            <button onClick={() => toggleSort("price")} className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${sortField === "price" ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" : "bg-[#1a1d23] text-muted-foreground border border-gray-700 hover:text-white"}`}>
              מחיר {getSortIcon("price")}
            </button>
            <button onClick={() => toggleSort("date")} className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${sortField === "date" ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" : "bg-[#1a1d23] text-muted-foreground border border-gray-700 hover:text-white"}`}>
              עדכון {getSortIcon("date")}
            </button>
          </div>
        </div>

        <BulkActions bulk={bulk} actions={defaultBulkActions} entityName="חומרי גלם" />

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : materials.length === 0 ? (
          <div className="text-center py-20">
            <Boxes className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl text-muted-foreground mb-2">אין חומרי גלם</h3>
            <p className="text-muted-foreground mb-4">לחץ על "הוסף חומר" כדי להתחיל</p>
          </div>
        ) : (
          <div className="space-y-4">
            {categoriesToShow.map(cat => {
              const items = grouped[cat] || [];
              const colors = getCategoryColors(cat);
              const collapsed = collapsedCats.has(cat);
              const CatIcon = CATEGORY_ICONS[cat] || Package;
              const catTotal = categoryTotals[cat] || { beforeVat: 0, afterVat: 0 };
              return (
                <div key={cat} className={`border ${colors.border} rounded-xl overflow-hidden`}>
                  <button
                    onClick={() => toggleCategory(cat)}
                    className={`w-full flex items-center justify-between px-5 py-3 ${colors.bg} hover:opacity-90 transition-opacity`}
                  >
                    <div className="flex items-center gap-3">
                      <CatIcon className={`w-4 h-4 ${colors.text}`} />
                      <span className={`font-bold text-base ${colors.text}`}>{cat}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
                        {items.length} פריטים
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      {catTotal.afterVat > 0 && (
                        <span className="text-xs text-muted-foreground font-mono" dir="ltr">
                          סה"כ: ₪{catTotal.afterVat.toFixed(0)}
                        </span>
                      )}
                      {collapsed
                        ? <ChevronDown className={`w-4 h-4 ${colors.text}`} />
                        : <ChevronUp className={`w-4 h-4 ${colors.text}`} />}
                    </div>
                  </button>
                  {!collapsed && (
                    <div className="overflow-x-auto bg-[#1a1d23]">
                      <table className="w-full text-right text-sm">
                        <thead>
                          <tr className="border-b border-gray-800 bg-[#12141a]">
                            <th className="px-3 py-2.5 w-8"><BulkCheckbox bulk={bulk} id={-1} isHeader allIds={items.map(m => m.id)} /></th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium cursor-pointer hover:text-gray-200 select-none" onClick={() => toggleSort("name")}>
                              <span className="flex items-center gap-1">תיאור {getSortIcon("name")}</span>
                            </th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">מק"ט</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">תת-קטגוריה</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">סוג</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">תמחור</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">אורך (מ')</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">מידות</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium cursor-pointer hover:text-gray-200 select-none" onClick={() => toggleSort("price")}>
                              <span className="flex items-center gap-1">מחיר {getSortIcon("price")}</span>
                            </th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">לפני מע"מ</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">כולל מע"מ</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">שינוי %</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">גימור</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">צבע</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">תקן</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium">ספק</th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium cursor-pointer hover:text-gray-200 select-none" onClick={() => toggleSort("date")}>
                              <span className="flex items-center gap-1">עדכון {getSortIcon("date")}</span>
                            </th>
                            <th className="px-3 py-2.5 text-muted-foreground font-medium"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(m => {
                            const net = m.standardPrice ? parseFloat(m.standardPrice) : null;
                            const gross = net !== null ? (net * VAT) : null;
                            const { changePct } = m;
                            const pm = m.pricingMethod || "יחידה";
                            const displayPrice = (pm === "מטר רץ" || pm === "מטר") ? m.pricePerMeter : (pm === "ק\"ג" || pm === "ק״ג") ? m.pricePerKg : m.standardPrice;
                            const rowFinish = m.finish || "";
                            return (
                              <motion.tr key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`border-b border-gray-800/40 hover:bg-[#1e2128] cursor-pointer ${bulk.isSelected(m.id) ? "bg-blue-500/5" : ""}`} onClick={() => { setSelectedMaterial(m); setDetailTab("details"); }}>
                                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><BulkCheckbox bulk={bulk} id={m.id} /></td>
                                <td className="px-3 py-2.5 text-white font-medium max-w-[140px] truncate">{m.materialName}</td>
                                <td className="px-3 py-2.5 text-blue-400 font-mono text-xs">{m.materialNumber}</td>
                                <td className="px-3 py-2.5 text-gray-300 text-xs max-w-[120px] truncate">{m.subCategory || "—"}</td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[80px] truncate">{m.materialType || m.materialGrade || "—"}</td>
                                <td className="px-3 py-2.5 text-xs">
                                  <span className="px-1.5 py-0.5 bg-gray-700/60 text-gray-300 rounded text-xs">{pm}</span>
                                </td>
                                <td className="px-3 py-2.5 text-gray-300 font-mono text-xs" dir="ltr">
                                  {m.rodLength ? `${parseFloat(m.rodLength).toFixed(1)}` : "—"}
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono" dir="ltr">
                                  {m.dimensions || (m.thickness || m.width || m.height ? `${m.width || "-"}×${m.height || "-"}×${m.thickness || "-"}` : "—")}
                                </td>
                                <td className="px-3 py-2.5 text-gray-200 font-mono text-xs" dir="ltr">
                                  {displayPrice ? `₪${parseFloat(displayPrice).toFixed(2)} ${pricingLabel(pm)}` : "—"}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-xs" dir="ltr">
                                  {m.totalPriceBeforeVat
                                    ? <span className="text-gray-200">₪{parseFloat(m.totalPriceBeforeVat).toFixed(2)}</span>
                                    : (net !== null ? <span className="text-muted-foreground">₪{net.toFixed(2)}</span> : <span className="text-muted-foreground">—</span>)}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-xs" dir="ltr">
                                  {m.totalPriceAfterVat
                                    ? <span className="text-emerald-400 font-semibold">₪{parseFloat(m.totalPriceAfterVat).toFixed(2)}</span>
                                    : (gross !== null ? <span className="text-muted-foreground">₪{gross.toFixed(2)}</span> : <span className="text-muted-foreground">—</span>)}
                                </td>
                                <td className="px-3 py-2.5 text-xs">
                                  {changePct !== null ? (
                                    <span className={`font-medium ${changePct > 0 ? "text-red-400" : "text-emerald-400"}`} dir="ltr">
                                      {changePct > 0 ? "+" : ""}{(changePct * 100).toFixed(1)}%
                                    </span>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[80px] truncate">{rowFinish || "—"}</td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[60px] truncate">{m.color || "—"}</td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs">{m.standard || "—"}</td>
                                <td className="px-3 py-2.5 text-gray-300 text-xs max-w-[100px] truncate">{getSupplierName(m.supplierId)}</td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs">{formatDate(m.updatedAt)}</td>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => openEdit(m)} className="p-1 text-muted-foreground hover:text-amber-400 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setDeleteConfirm(m.id)} className="p-1 text-muted-foreground hover:text-red-400 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredMaterials.length > 0 && (
              <div className="p-4 bg-[#1a1d23] border border-gray-700 rounded-xl flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-gray-300">
                  <Calculator className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">סיכום כולל ({filteredMaterials.length} פריטים{filteredMaterials.length !== materials.length ? ` מתוך ${materials.length}` : ""})</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">לפני מע"מ</div>
                    <div className="text-sm font-semibold text-gray-200" dir="ltr">₪{grandTotal.beforeVat.toFixed(2)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">כולל מע"מ 18%</div>
                    <div className="text-base font-bold text-emerald-400" dir="ltr">₪{grandTotal.afterVat.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-4 overflow-y-auto"
            onClick={closeForm}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-[#1a1d23] border border-gray-700 rounded-2xl w-full max-w-4xl mx-4 mb-10"
              onClick={e => e.stopPropagation()}
              dir="rtl"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">{editingId ? "עריכת חומר גלם" : "הוספת חומר גלם"}</h2>
                <button onClick={closeForm} className="p-1 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              {!editingId && (
                <div className="flex border-b border-gray-700">
                  {(["single", "bulk"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setFormTab(tab)}
                      className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${formTab === tab
                        ? "text-blue-400 border-b-2 border-blue-400 bg-blue-500/5"
                        : "text-muted-foreground hover:text-white"}`}
                    >
                      {tab === "single" ? "חומר בודד" : "הוספה מרובה"}
                    </button>
                  ))}
                </div>
              )}

              {(editingId || formTab === "single") && (
                <form onSubmit={handleSubmit} className="p-6 space-y-0">
                  <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isCustom}
                        onChange={e => setForm(f => ({ ...f, isCustom: e.target.checked }))}
                        className="w-4 h-4 accent-blue-500"
                      />
                      <span className="text-sm text-gray-300">הוספה חופשית — הקלד קטגוריה, תת-קטגוריה, גימור ויחידה ידנית</span>
                    </label>
                  </div>

                  <div className="flex gap-1 mb-5 border-b border-gray-800 pb-0">
                    {FORM_SECTIONS.map(sec => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => setActiveSection(sec.id)}
                        className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors ${activeSection === sec.id
                          ? "bg-[#12141a] text-blue-400 border border-b-0 border-gray-700"
                          : "text-muted-foreground hover:text-gray-300"}`}
                      >
                        {sec.label}
                      </button>
                    ))}
                  </div>

                  {activeSection === "basic" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FI label="תיאור חומר *" value={form.materialName} onChange={v => setForm({ ...form, materialName: v })} placeholder="שם/תיאור החומר" />
                        <FI label='מק"ט / קוד קטלוג *' value={form.materialNumber} onChange={v => setForm({ ...form, materialNumber: v })} placeholder="MAT-001" />
                      </div>

                      {form.isCustom ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FI label="קטגוריה (חופשי)" value={form.customCategory} onChange={v => setForm({ ...form, customCategory: v })} placeholder="הזן קטגוריה חדשה..." />
                          <FI label="תת-קטגוריה (חופשי)" value={form.customSubCategory} onChange={v => setForm({ ...form, customSubCategory: v })} placeholder="הזן תת-קטגוריה..." />
                          <FI label="יחידת מידה (חופשי)" value={form.customUnit} onChange={v => setForm({ ...form, customUnit: v })} placeholder={'יחידה, מטר, ק"ג...'} />
                          <FI label="גימור (חופשי)" value={form.customFinish} onChange={v => setForm({ ...form, customFinish: v })} placeholder="גלם, מגולוון, צבוע..." />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <CBX label="קטגוריה" value={form.category} onChange={v => setForm({ ...form, category: v, subCategory: "", materialType: "" })} options={CATEGORIES} placeholder="בחר קטגוריה..." />
                          <CBX label="תת-קטגוריה" value={form.subCategory} onChange={v => setForm({ ...form, subCategory: v })} options={currentSubcats} placeholder="בחר / הקלד תת-קטגוריה..." />
                          <CBX label="גימור / ציפוי" value={form.finish} onChange={v => setForm({ ...form, finish: v })} options={FINISHES} placeholder="בחר / הקלד גימור..." />
                          <CBX label="יחידת מידה" value={form.unit} onChange={v => setForm({ ...form, unit: v })} options={UNITS} placeholder="בחר / הקלד יחידה..." />
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <CBX label="סוג חומר (Material Type)" value={form.materialType} onChange={v => setForm({ ...form, materialType: v, materialGrade: v })} options={MATERIAL_TYPES} placeholder="בחר / הקלד סוג חומר..." />
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-muted-foreground" />ספק <span className="text-red-400">*</span>
                          </label>
                          <select
                            value={form.supplierId}
                            onChange={e => { setForm({ ...form, supplierId: e.target.value }); setSupplierError(false); }}
                            className={`w-full px-3 py-2 bg-[#12141a] border rounded-lg text-white focus:outline-none ${supplierError ? "border-red-500 focus:border-red-500" : "border-gray-700 focus:border-blue-500"}`}
                          >
                            <option value="">— בחר ספק (חובה) —</option>
                            {activeSuppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
                          </select>
                          {supplierError && <p className="mt-1 text-xs text-red-400">יש לבחור ספק לחומר גלם</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">תיאור חומר</label>
                          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="תיאור מפורט, שימושים, מפרט טכני..." className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none" rows={2} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">הערות</label>
                          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="הערות נוספות..." className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none" rows={2} />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSection === "dimensions" && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><Ruler className="w-4 h-4 text-muted-foreground" />מידות ואורכים</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <CBX label="אורך מוט/פרופיל (מ')" value={form.rodLength} onChange={v => setForm({ ...form, rodLength: v })} options={ROD_LENGTH_PRESETS} placeholder="6.0" />
                        <FI label={'משקל למטר (ק"ג/מ\')'} value={form.weightPerMeter} onChange={v => setForm({ ...form, weightPerMeter: v })} type="number" dir="ltr" placeholder="0.00" />
                        <FI label={'משקל ליחידה (ק"ג)'} value={form.weightPerUnit} onChange={v => setForm({ ...form, weightPerUnit: v })} type="number" dir="ltr" placeholder="0.00" />
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">משקל כולל (ק"ג)</label>
                          <div className="w-full px-3 py-2 bg-[#12141a] border border-gray-600 rounded-lg text-gray-300 font-mono text-sm" dir="ltr">
                            {weightTotal !== null ? weightTotal : "—"}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <FI label='עובי (מ"מ)' value={form.thickness} onChange={v => setForm({ ...form, thickness: v })} type="number" dir="ltr" placeholder="0.00" />
                        <FI label='רוחב (מ"מ)' value={form.width} onChange={v => setForm({ ...form, width: v })} type="number" dir="ltr" placeholder="0.00" />
                        <FI label='גובה (מ"מ)' value={form.height} onChange={v => setForm({ ...form, height: v })} type="number" dir="ltr" placeholder="0.00" />
                        <FI label='מידות (אורך×רוחב×עובי)' value={form.dimensions} onChange={v => setForm({ ...form, dimensions: v })} placeholder="1000x50x3" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <FI label='קוטר (מ"מ)' value={form.diameter} onChange={v => setForm({ ...form, diameter: v })} type="number" dir="ltr" placeholder="0.00" />
                        <FI label='קוטר פנימי (מ"מ)' value={form.innerDiameter} onChange={v => setForm({ ...form, innerDiameter: v })} type="number" dir="ltr" placeholder="0.00" />
                        <SI label="סוג פנים" value={form.innerType} onChange={v => setForm({ ...form, innerType: v })} options={["", ...INNER_TYPES]} />
                        <FI label="צבע" value={form.color} onChange={v => setForm({ ...form, color: v })} placeholder="שחור, לבן, RAL 9016..." />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <CBX label="תקן" value={form.standard} onChange={v => setForm({ ...form, standard: v })} options={STANDARDS} placeholder="ISO, DIN, ASTM..." />
                        <FI label="ארץ ייצור" value={form.countryOfOrigin} onChange={v => setForm({ ...form, countryOfOrigin: v })} placeholder="ישראל, גרמניה, סין..." />
                        <FI label="מינימום הזמנה (כמות)" value={form.minimumOrder} onChange={v => setForm({ ...form, minimumOrder: v })} type="number" dir="ltr" placeholder="1" />
                        <FI label="זמן אספקה (ימים)" value={form.deliveryDays} onChange={v => setForm({ ...form, deliveryDays: v })} type="number" dir="ltr" placeholder="0" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <FI label="אחריות (חודשים)" value={form.warrantyMonths} onChange={v => setForm({ ...form, warrantyMonths: v })} type="number" dir="ltr" placeholder="0" />
                        <FI label="כמות באריזה/חבילה" value={form.packageQuantity} onChange={v => updatePriceField("packageQuantity", v)} type="number" dir="ltr" placeholder="1" />
                      </div>
                    </div>
                  )}

                  {activeSection === "pricing" && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><Tag className="w-4 h-4 text-muted-foreground" />שיטת תמחור</h3>
                      <div className="flex flex-wrap gap-2">
                        {PRICING_METHODS.map(m => (
                          <button
                            key={m} type="button" onClick={() => updatePricingMethod(m)}
                            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${form.pricingMethod === m ? "bg-blue-600 text-white" : "bg-[#12141a] text-muted-foreground hover:text-white border border-gray-700"}`}
                          >
                            לפי {m}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {(form.pricingMethod === "מטר רץ" || form.pricingMethod === "מטר") && (
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-blue-400 mb-1">מחיר למטר רץ (₪) *</label>
                            <input type="number" value={form.pricePerMeter} dir="ltr" step="0.01" onChange={e => updatePriceField("pricePerMeter", e.target.value)} placeholder="0.00" className="w-full px-3 py-2 bg-[#12141a] border border-blue-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-400 focus:outline-none" />
                          </div>
                        )}
                        {(form.pricingMethod === "ק\"ג" || form.pricingMethod === "ק״ג") && (
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-blue-400 mb-1">מחיר לק"ג (₪) *</label>
                            <input type="number" value={form.pricePerKg} dir="ltr" step="0.01" onChange={e => updatePriceField("pricePerKg", e.target.value)} placeholder="0.00" className="w-full px-3 py-2 bg-[#12141a] border border-blue-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-400 focus:outline-none" />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">מחיר לפני מע"מ (₪)</label>
                          <input type="number" value={form.standardPrice} dir="ltr" step="0.01" onChange={e => updateNetPrice(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">מחיר אחרי מע"מ 18% (₪)</label>
                          <input type="number" value={form.priceWithVat} dir="ltr" step="0.01" onChange={e => updateGrossPrice(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                        </div>
                      </div>

                      {(previewBefore !== null || form.totalPriceBeforeVat) && (
                        <div className="p-4 bg-[#12141a] border border-gray-700 rounded-lg flex flex-wrap gap-8">
                          <div className="flex items-center gap-2">
                            <Calculator className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">סה"כ לפני מע"מ:</span>
                            <span className="text-sm font-semibold text-gray-200" dir="ltr">
                              ₪{(previewBefore ?? parseFloat(form.totalPriceBeforeVat || "0")).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">סה"כ כולל מע"מ:</span>
                            <span className="text-base font-bold text-emerald-400" dir="ltr">
                              ₪{(previewAfter ?? parseFloat(form.totalPriceAfterVat || "0")).toFixed(2)}
                            </span>
                          </div>
                          {weightTotal && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">משקל כולל:</span>
                              <span className="text-sm font-semibold text-gray-200" dir="ltr">{weightTotal} ק"ג</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {activeSection === "extra" && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-muted-foreground" />פרטי מלאי ורכש</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <FI label="מלאי מינימום" value={form.minimumStock} onChange={v => setForm({ ...form, minimumStock: v })} type="number" dir="ltr" placeholder="0" />
                        <FI label="מלאי נוכחי" value={form.currentStock} onChange={v => setForm({ ...form, currentStock: v })} type="number" dir="ltr" placeholder="0" />
                        <FI label="נקודת הזמנה מחדש" value={form.reorderPoint} onChange={v => setForm({ ...form, reorderPoint: v })} type="number" dir="ltr" placeholder="0" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">סטטוס</label>
                          <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none">
                            <option value="פעיל">פעיל</option>
                            <option value="לא פעיל">לא פעיל</option>
                            <option value="מיועד להפסקה">מיועד להפסקה</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">מטבע</label>
                          <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none">
                            <option value="ILS">₪ שקל (ILS)</option>
                            <option value="USD">$ דולר (USD)</option>
                            <option value="EUR">€ יורו (EUR)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {(createMut.error || updateMut.error) && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                      {(createMut.error as Error)?.message || (updateMut.error as Error)?.message}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-5 mt-4 border-t border-gray-800">
                    <button
                      type="submit"
                      disabled={createMut.isPending || updateMut.isPending}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg font-medium"
                    >
                      <Save className="w-4 h-4" />
                      {createMut.isPending || updateMut.isPending ? "שומר..." : editingId ? "עדכן" : "שמור"}
                    </button>
                    <button type="button" onClick={closeForm} className="px-4 py-2.5 text-muted-foreground hover:text-white">ביטול</button>
                  </div>
                </form>
              )}

              {!editingId && formTab === "bulk" && (
                <div className="p-6 space-y-4">
                  <p className="text-sm text-muted-foreground">הזן מספר חומרים בבת אחת. לחץ על + להוספת שורה.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                      <thead>
                        <tr className="border-b border-gray-700">
                          {["תיאור *", 'מק"ט *', "קטגוריה", "תת-קטגוריה", "גימור", "יח'", "תמחור", "מחיר ₪", "ספק", ""].map(h => (
                            <th key={h} className="px-2 py-2 text-muted-foreground font-medium text-xs">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((row, i) => (
                          <tr key={i} className="border-b border-gray-800/50">
                            <td className="px-1 py-1"><input value={row.materialName} onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], materialName: e.target.value }; setBulkRows(r); }} className="w-36 px-2 py-1 bg-[#12141a] border border-gray-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none" /></td>
                            <td className="px-1 py-1"><input value={row.materialNumber} onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], materialNumber: e.target.value }; setBulkRows(r); }} className="w-24 px-2 py-1 bg-[#12141a] border border-gray-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none" /></td>
                            <td className="px-1 py-1">
                              <select value={row.category} onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], category: e.target.value, materialType: "" }; setBulkRows(r); }} className="w-28 px-2 py-1 bg-[#12141a] border border-gray-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none">
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <select value={row.materialType} onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], materialType: e.target.value }; setBulkRows(r); }} className="w-28 px-2 py-1 bg-[#12141a] border border-gray-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none">
                                <option value="">—</option>
                                {(SUBCATEGORIES[row.category] || ["אחר"]).map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <select value={row.finish} onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], finish: e.target.value }; setBulkRows(r); }} className="w-24 px-2 py-1 bg-[#12141a] border border-gray-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none">
                                <option value="">—</option>
                                {FINISHES.map(f => <option key={f} value={f}>{f}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <select value={row.unit} onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], unit: e.target.value }; setBulkRows(r); }} className="w-20 px-2 py-1 bg-[#12141a] border border-gray-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none">
                                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <select value={row.pricingMethod} onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], pricingMethod: e.target.value }; setBulkRows(r); }} className="w-24 px-2 py-1 bg-[#12141a] border border-gray-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none">
                                {PRICING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1"><input type="number" dir="ltr" value={row.standardPrice} onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], standardPrice: e.target.value }; setBulkRows(r); }} className="w-20 px-2 py-1 bg-[#12141a] border border-gray-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none" placeholder="0.00" /></td>
                            <td className="px-1 py-1">
                              <select value={row.supplierId} onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], supplierId: e.target.value }; setBulkRows(r); }} className="w-24 px-2 py-1 bg-[#12141a] border border-gray-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none">
                                <option value="">—</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <button onClick={() => setBulkRows(bulkRows.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-red-400">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={() => setBulkRows([...bulkRows, emptyBulkRow()])}
                    className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <Plus className="w-4 h-4" />הוסף שורה
                  </button>

                  {bulkMut.error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                      {(bulkMut.error as Error)?.message}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleBulkSubmit}
                      disabled={bulkMut.isPending}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg font-medium"
                    >
                      <Save className="w-4 h-4" />
                      {bulkMut.isPending ? "שומר..." : `שמור ${bulkRows.filter(r => r.materialNumber && r.materialName).length} חומרים`}
                    </button>
                    <button type="button" onClick={closeForm} className="px-4 py-2.5 text-muted-foreground hover:text-white">ביטול</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedMaterial && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSelectedMaterial(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1a1d23] border border-gray-700 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Package className="text-blue-400" size={22} />
                  {selectedMaterial.materialName}
                  <span className="text-sm text-muted-foreground font-mono">({selectedMaterial.materialNumber})</span>
                </h3>
                <button onClick={() => setSelectedMaterial(null)} className="p-2 hover:bg-gray-800 rounded-lg"><X size={20} /></button>
              </div>

              <div className="flex border-b border-gray-700 mb-6">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-white"}`}>{t.label}</button>
                ))}
              </div>

              {detailTab === "details" && (<>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 text-sm">
                  <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-muted-foreground">קטגוריה:</span> <span className="font-medium mr-2">{selectedMaterial.category || "—"}</span></div>
                  <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-muted-foreground">תת-קטגוריה:</span> <span className="font-medium mr-2">{selectedMaterial.subCategory || "—"}</span></div>
                  <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-muted-foreground">סוג:</span> <span className="font-medium mr-2">{selectedMaterial.materialType || "—"}</span></div>
                  <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-muted-foreground">יחידה:</span> <span className="font-medium mr-2">{selectedMaterial.unit || "—"}</span></div>
                  <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-muted-foreground">ספק:</span> <span className="font-medium mr-2">{getSupplierName(selectedMaterial.supplierId)}</span></div>
                  <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-muted-foreground">גימור:</span> <span className="font-medium mr-2">{selectedMaterial.finish || "—"}</span></div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">מחיר סטנדרטי</div>
                    <div className="font-bold text-blue-400">{selectedMaterial.standardPrice ? `₪${parseFloat(selectedMaterial.standardPrice).toFixed(2)}` : "—"}</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">לפני מע"מ</div>
                    <div className="font-bold">{selectedMaterial.totalPriceBeforeVat ? `₪${parseFloat(selectedMaterial.totalPriceBeforeVat).toFixed(2)}` : "—"}</div>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">כולל מע"מ</div>
                    <div className="font-bold text-emerald-400">{selectedMaterial.totalPriceAfterVat ? `₪${parseFloat(selectedMaterial.totalPriceAfterVat).toFixed(2)}` : "—"}</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">שינוי מחיר</div>
                    <div className={`font-bold ${selectedMaterial.changePct && selectedMaterial.changePct > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {selectedMaterial.changePct !== null ? `${(selectedMaterial.changePct * 100).toFixed(1)}%` : "—"}
                    </div>
                  </div>
                </div>

                {(selectedMaterial.dimensions || selectedMaterial.width || selectedMaterial.thickness) && (
                  <div className="bg-gray-800/40 rounded-lg p-3 mb-4">
                    <h4 className="font-bold text-sm mb-2">מידות</h4>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      {selectedMaterial.dimensions && <div><span className="text-muted-foreground">מידות:</span> <span className="mr-1">{selectedMaterial.dimensions}</span></div>}
                      {selectedMaterial.width && <div><span className="text-muted-foreground">רוחב:</span> <span className="mr-1">{selectedMaterial.width}</span></div>}
                      {selectedMaterial.height && <div><span className="text-muted-foreground">גובה:</span> <span className="mr-1">{selectedMaterial.height}</span></div>}
                      {selectedMaterial.thickness && <div><span className="text-muted-foreground">עובי:</span> <span className="mr-1">{selectedMaterial.thickness}</span></div>}
                      {selectedMaterial.rodLength && <div><span className="text-muted-foreground">אורך:</span> <span className="mr-1">{selectedMaterial.rodLength} מ'</span></div>}
                    </div>
                  </div>
                )}

                {selectedMaterial.notes && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">הערות</div>
                    <p className="text-sm">{selectedMaterial.notes}</p>
                  </div>
                )}
              </>)}

              {detailTab === "related" && (
                <RelatedRecords entityType="raw-materials" entityId={selectedMaterial.id} relations={[
                  { key: "suppliers", label: "ספקים", endpoint: "/api/suppliers" },
                  { key: "purchase-orders", label: "הזמנות רכש", endpoint: "/api/purchase-orders" },
                  { key: "products", label: "מוצרים", endpoint: "/api/products" },
                ]} />
              )}
              {detailTab === "docs" && (
                <AttachmentsSection entityType="raw-materials" entityId={selectedMaterial.id} />
              )}
              {detailTab === "history" && (
                <ActivityLog entityType="raw-materials" entityId={selectedMaterial.id} />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm !== null && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          >
            <div className="bg-[#1a1d23] border border-gray-700 rounded-xl p-6 max-w-sm mx-4" dir="rtl">
              <h3 className="text-lg font-bold text-white mb-2">מחיקת חומר</h3>
              <p className="text-muted-foreground mb-4">האם למחוק את החומר? פעולה זו אינה הפיכה.</p>
              <div className="flex gap-3">
                <button onClick={() => deleteMut.mutate(deleteConfirm)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg">מחק</button>
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-muted-foreground hover:text-white">ביטול</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FI({ label, value, onChange, type = "text", dir, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; dir?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        dir={dir} placeholder={placeholder}
        className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

function SI({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
      >
        {options.map(o => <option key={o} value={o}>{o || "— בחר —"}</option>)}
      </select>
    </div>
  );
}

function CBX({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const filtered = options.filter(o => o.toLowerCase().includes(inputVal.toLowerCase()));

  React.useEffect(() => { setInputVal(value); }, [value]);

  function select(v: string) {
    setInputVal(v);
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <input
        type="text"
        value={inputVal}
        placeholder={placeholder}
        onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-[#12141a] border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.map(o => (
            <button
              key={o} type="button"
              onMouseDown={() => select(o)}
              className={`w-full text-right px-3 py-2 text-sm hover:bg-[#1a1d23] text-gray-200 ${o === value ? "bg-blue-600/20 text-blue-300" : ""}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
