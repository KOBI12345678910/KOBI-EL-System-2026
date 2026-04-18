/**
 * IMPORTANT: This file contains demo/sample employee and supplier seed data for testing ONLY.
 * Routes in this file are NOT called automatically at server startup.
 * These endpoints are protected by super-admin auth only.
 * 
 * Do NOT run factory seed routes on production — the system is ready for real data entry.
 */

import { Router, Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import crypto from "crypto";

function hashPasswordForSeed(password: string): string {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

const router = Router();

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const permissions = req.permissions;
  if (!permissions || !permissions.isSuperAdmin) {
    return res.status(403).json({ error: "Super admin access required" });
  }
  return next();
}

const FIRST_NAMES_M = ["אבי", "יוסי", "דני", "משה", "אהרון", "יעקב", "שמעון", "לוי", "רון", "גיל", "עמי", "בני", "נתן", "אדם", "ברק", "כרמל", "נועם", "שי", "גלעד", "אביב", "ניר", "עומר", "ליאור", "טל", "ירון", "אלון", "עמוס", "ורד", "רפי", "שלמה", "אליהו", "דוד", "יצחק", "אברהם", "חיים", "שבתאי", "מאיר", "שמריה", "בצלאל", "ראובן", "שמואל", "גרשון", "דן", "יחיאל", "פנחס", "חנן", "אורי", "זוהר", "אורן", "בועז"];
const FIRST_NAMES_F = ["שרה", "רחל", "מרים", "לאה", "דינה", "רבקה", "חנה", "נעמי", "אסתר", "יעל", "דבורה", "מיכל", "תמר", "עדה", "ציפורה", "גאולה", "בלה", "מלכה", "אילנה", "ענת", "ריקי", "שירה", "נועה", "ליאת", "אורית", "הדר", "מאיה", "נעמה", "טלי", "רוני", "גלית", "ינון", "ירדן", "שגית", "מאור", "שלי", "יסמין", "אביגיל", "אורנה", "פנינה", "דנה", "שובל", "שחר", "שקד", "מלי", "אלי", "גלי", "לימור", "נגה"];
const LAST_NAMES = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "גבאי", "שפירו", "דהן", "אוחיון", "בן-דוד", "מורדכי", "שמש", "גרוס", "בן-שמחה", "שלום", "נחמיאס", "סבג", "חיון", "עזרא", "בוחבוט", "חסון", "גבריאל", "אלבז", "עמרם", "אשכנזי", "שוחט", "קץ", "בן-חמו", "אמסלם", "הרוש", "קדוש", "בר-לב", "יוסף", "חדד", "טיאן", "מלכה", "דיין", "נחום", "בן-גל", "חורי", "ספיר", "הלל", "בכר", "מנור", "ארוש", "פרידמן", "מרדכי", "שלוש", "ינאי"];
const CITIES = ["תל אביב", "ירושלים", "חיפה", "ראשון לציון", "פתח תקוה", "נתניה", "באר שבע", "בני ברק", "חולון", "רמת גן", "אשדוד", "אשקלון", "רחובות", "לוד", "רמלה", "נס ציונה", "הרצליה", "כפר סבא", "עפולה", "טבריה"];

interface DepartmentConfig {
  count: number;
  titles: string[];
}

const DEPARTMENT_CONFIG: Record<string, DepartmentConfig> = {
  "ייצור אלומיניום":  { count: 30, titles: ["מפעיל מכונה", "עובד ייצור", "ראש צוות ייצור", "טכנאי ייצור"] },
  "ייצור ברזל":       { count: 25, titles: ["עובד ייצור", "מרתך", "ראש צוות ייצור", "טכנאי ייצור"] },
  "ייצור נירוסטה":    { count: 12, titles: ["מרתך TIG", "עובד ייצור", "ראש צוות", "טכנאי"] },
  "ייצור זכוכית":     { count: 15, titles: ["מזגג", "מחתך זכוכית", "ראש צוות זיגוג", "טכנאי זכוכית"] },
  "ריתוך":            { count: 20, titles: ["מרתך", "מרתך מוסמך", "ראש צוות ריתוך", "מרתך בכיר", "מרתך TIG"] },
  "חיתוך CNC":        { count: 12, titles: ["מפעיל CNC", "מפעיל לייזר", "מפעיל פלזמה", "ראש צוות חיתוך"] },
  "כיפוף ופרסה":      { count: 10, titles: ["מפעיל כיפוף", "מפעיל פרסה", "ראש צוות כיפוף"] },
  "ציפוי ואנודייזינג":{ count: 8,  titles: ["מפעיל ציפוי", "כימאי טיפול שטח", "ראש צוות ציפוי"] },
  "הרכבה":            { count: 15, titles: ["מרכיב", "ראש צוות הרכבה", "טכנאי הרכבה"] },
  "התקנות":           { count: 20, titles: ["מתקין", "ראש צוות התקנות", "טכנאי התקנה", "מנהל התקנות"] },
  "שליטת איכות":      { count: 6,  titles: ["בודק איכות", "מנהל איכות", "מהנדס איכות"] },
  "מחסן":             { count: 8,  titles: ["מחסנאי", "ראש מחסן", "נהג מלגזה", "אחראי מלאי"] },
  "רכש":              { count: 5,  titles: ["רכזת רכש", "מנהל רכש", "קנאי", "מנהל ספקים"] },
  "מכירות":           { count: 8,  titles: ["נציג מכירות", "מנהל מכירות", "מנהל תיק לקוח"] },
  "אדמיניסטרציה":     { count: 4,  titles: ["מזכירה", "פקיד", "מנהל משרד"] },
  "מנהל":             { count: 3,  titles: ["מנכ\"ל", "סמנכ\"ל ייצור", "סמנכ\"ל כספים"] },
  "כספים":            { count: 4,  titles: ["חשב", "מנהלת חשבונות", "רואה חשבון"] },
  "לוגיסטיקה":        { count: 5,  titles: ["מנהל לוגיסטיקה", "נהג", "רכז שילוח"] },
  "תחזוקה":           { count: 6,  titles: ["טכנאי תחזוקה", "מכונאי", "חשמלאי תעשייתי"] },
  "תכנון ייצור":       { count: 4,  titles: ["מתכנן ייצור", "מנהל פרויקטים", "מהנדס תכנון"] },
};

interface EmployeeRecord {
  employee_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  id_number: string;
  email: string;
  phone: string;
  mobile_phone: string;
  department: string;
  job_title: string;
  employment_type: string;
  start_date: string;
  base_salary: string;
  gross_salary: string;
  net_salary: string;
  status: string;
  city: string;
  country: string;
  gender: string;
}

function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randItem<T>(arr: T[]): T { return arr[randInt(0, arr.length - 1)]; }
function fmtDate(year: number, month: number, day: number): string { return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`; }

function generateEmployees(count: number): EmployeeRecord[] {
  const employees: EmployeeRecord[] = [];
  const genders = ["male", "female"] as const;
  let globalIdx = 1;

  for (const [dept, config] of Object.entries(DEPARTMENT_CONFIG)) {
    const deptCount = Math.min(config.count, count - employees.length);
    if (deptCount <= 0) break;
    for (let i = 0; i < deptCount; i++) {
      const gender = randItem(genders);
      const firstName = gender === "male" ? randItem(FIRST_NAMES_M) : randItem(FIRST_NAMES_F);
      const lastName = randItem(LAST_NAMES);
      const jobTitle = randItem(config.titles);
      const city = randItem(CITIES);
      const startYear = randInt(2010, 2024);
      const startMonth = randInt(1, 12);
      const baseSalary = dept === "מנהל" ? randInt(18000, 40000) :
        dept === "כספים" || dept === "מכירות" ? randInt(10000, 25000) :
        randInt(7500, 18000);
      employees.push({
        employee_number: `EMP${String(globalIdx).padStart(4, '0')}`,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
        id_number: `${randInt(100000000, 399999999)}`,
        email: `${firstName.replace(/"/g, "")}.${lastName.replace(/[- "]/g, "")}${globalIdx}@factory.co.il`.toLowerCase(),
        phone: `03-${randInt(1000000, 9999999)}`,
        mobile_phone: `05${randInt(0, 9)}-${randInt(1000000, 9999999)}`,
        department: dept,
        job_title: jobTitle,
        employment_type: randItem(["full_time", "full_time", "full_time", "part_time", "contractor"]),
        start_date: fmtDate(startYear, startMonth, randInt(1, 28)),
        base_salary: baseSalary.toString(),
        gross_salary: (baseSalary * 1.2).toFixed(2),
        net_salary: (baseSalary * 0.85).toFixed(2),
        status: "active",
        city,
        country: "ישראל",
        gender,
      });
      globalIdx++;
    }
  }

  while (employees.length < count) {
    const gender = randItem(genders);
    const firstName = gender === "male" ? randItem(FIRST_NAMES_M) : randItem(FIRST_NAMES_F);
    const lastName = randItem(LAST_NAMES);
    const dept = randItem(Object.keys(DEPARTMENT_CONFIG));
    const config = DEPARTMENT_CONFIG[dept];
    const jobTitle = randItem(config.titles);
    const city = randItem(CITIES);
    const baseSalary = randInt(7500, 18000);
    employees.push({
      employee_number: `EMP${String(globalIdx).padStart(4, '0')}`,
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`,
      id_number: `${randInt(100000000, 399999999)}`,
      email: `${firstName.replace(/"/g, "")}.${lastName.replace(/[- "]/g, "")}${globalIdx}@factory.co.il`.toLowerCase(),
      phone: `03-${randInt(1000000, 9999999)}`,
      mobile_phone: `05${randInt(0, 9)}-${randInt(1000000, 9999999)}`,
      department: dept,
      job_title: jobTitle,
      employment_type: "full_time",
      start_date: fmtDate(randInt(2010, 2024), randInt(1, 12), randInt(1, 28)),
      base_salary: baseSalary.toString(),
      gross_salary: (baseSalary * 1.2).toFixed(2),
      net_salary: (baseSalary * 0.85).toFixed(2),
      status: "active",
      city,
      country: "ישראל",
      gender,
    });
    globalIdx++;
  }

  return employees;
}

interface SupplierRecord {
  supplierNumber: string;
  supplierName: string;
  contactPerson: string;
  phone: string;
  email: string;
  city: string;
  country: string;
  countryCode: string;
  currency: string;
  category: string;
  supplyType: string;
  paymentTerms: string;
  leadTimeDays: number;
  rating: number;
  supplierType: string;
}

const SUPPLIERS_DATA: SupplierRecord[] = [
  { supplierNumber: "SUP001", supplierName: "אלומיטל סחר בע\"מ", contactPerson: "מוטי לוי", phone: "03-5551234", email: "info@alumital.co.il", city: "חולון", country: "ישראל", countryCode: "IL", currency: "ILS", category: "חומרי גלם", supplyType: "אלומיניום", paymentTerms: "שוטף+30", leadTimeDays: 7, rating: 5, supplierType: "manufacturer" },
  { supplierNumber: "SUP002", supplierName: "ברזלניה הצפון בע\"מ", contactPerson: "יצחק ברזלי", phone: "04-8887788", email: "sales@barzelia.co.il", city: "חיפה", country: "ישראל", countryCode: "IL", currency: "ILS", category: "חומרי גלם", supplyType: "ברזל ופלדה", paymentTerms: "שוטף+45", leadTimeDays: 5, rating: 4, supplierType: "distributor" },
  { supplierNumber: "SUP003", supplierName: "זכוכית פרמיום ישראל", contactPerson: "חנה שמיר", phone: "08-9991122", email: "contact@glasspremium.co.il", city: "אשדוד", country: "ישראל", countryCode: "IL", currency: "ILS", category: "חומרי גלם", supplyType: "זכוכית", paymentTerms: "שוטף+30", leadTimeDays: 10, rating: 5, supplierType: "manufacturer" },
  { supplierNumber: "SUP004", supplierName: "נירוסטה מוביל בע\"מ", contactPerson: "אבי ניר", phone: "03-7773344", email: "nir@nirostamovil.co.il", city: "תל אביב", country: "ישראל", countryCode: "IL", currency: "ILS", category: "חומרי גלם", supplyType: "נירוסטה", paymentTerms: "שוטף+30", leadTimeDays: 7, rating: 4, supplierType: "manufacturer" },
  { supplierNumber: "SUP005", supplierName: "כימיקלים ואיטום דרום", contactPerson: "שמעון כהן", phone: "08-6664455", email: "info@sealchem.co.il", city: "באר שבע", country: "ישראל", countryCode: "IL", currency: "ILS", category: "חומרי עזר", supplyType: "איטום וכימיקלים", paymentTerms: "שוטף+30", leadTimeDays: 3, rating: 3, supplierType: "distributor" },
  { supplierNumber: "SUP006", supplierName: "מחברים ופתרונות בע\"מ", contactPerson: "רחל פרידמן", phone: "03-4445566", email: "rachel@connectors.co.il", city: "ראשון לציון", country: "ישראל", countryCode: "IL", currency: "ILS", category: "אביזרים", supplyType: "ברגים מחברים", paymentTerms: "שוטף+30", leadTimeDays: 2, rating: 4, supplierType: "distributor" },
  { supplierNumber: "SUP007", supplierName: "פרופיל מאסטר אלומיניום", contactPerson: "גדי פרופיל", phone: "04-5553344", email: "gadi@profilemaster.co.il", city: "נתניה", country: "ישראל", countryCode: "IL", currency: "ILS", category: "חומרי גלם", supplyType: "פרופילי אלומיניום", paymentTerms: "שוטף+60", leadTimeDays: 14, rating: 5, supplierType: "manufacturer" },
  { supplierNumber: "SUP008", supplierName: "תרבות ציפוי מתקדמת", contactPerson: "יוסי ציפוי", phone: "09-7771122", email: "coating@tarbut.co.il", city: "כפר סבא", country: "ישראל", countryCode: "IL", currency: "ILS", category: "שירותי עיבוד", supplyType: "אנודייזינג וציפוי", paymentTerms: "שוטף+30", leadTimeDays: 5, rating: 4, supplierType: "service" },
  { supplierNumber: "SUP009", supplierName: "גלגלים ומסילות מתכת", contactPerson: "בנצי גלגל", phone: "03-3334455", email: "info@metalwheels.co.il", city: "פתח תקוה", country: "ישראל", countryCode: "IL", currency: "ILS", category: "אביזרים", supplyType: "גלגלים ומסילות", paymentTerms: "שוטף+30", leadTimeDays: 3, rating: 3, supplierType: "distributor" },
  { supplierNumber: "SUP010", supplierName: "ייצור מתכות מרכז", contactPerson: "רן ישראלי", phone: "03-9998877", email: "production@metalcenter.co.il", city: "תל אביב", country: "ישראל", countryCode: "IL", currency: "ILS", category: "חומרי גלם", supplyType: "פרופילים שונים", paymentTerms: "שוטף+30", leadTimeDays: 7, rating: 4, supplierType: "manufacturer" },
  { supplierNumber: "SUP011", supplierName: "חוטי ריתוך ותוספים", contactPerson: "נחמן ריתוך", phone: "04-2223344", email: "welding@wires.co.il", city: "חיפה", country: "ישראל", countryCode: "IL", currency: "ILS", category: "חומרי עזר", supplyType: "חומרי ריתוך", paymentTerms: "שוטף+30", leadTimeDays: 5, rating: 4, supplierType: "distributor" },
  { supplierNumber: "SUP012", supplierName: "כלים ומכשור תעשייתי", contactPerson: "אריה כלים", phone: "08-1112233", email: "tools@kalimach.co.il", city: "אשדוד", country: "ישראל", countryCode: "IL", currency: "ILS", category: "ציוד", supplyType: "כלים ומכשור", paymentTerms: "שוטף+30", leadTimeDays: 7, rating: 3, supplierType: "distributor" },
  { supplierNumber: "SUP013", supplierName: "גזים תעשייתיים מרכז", contactPerson: "שוקי גז", phone: "03-6665544", email: "gas@industrial.co.il", city: "בני ברק", country: "ישראל", countryCode: "IL", currency: "ILS", category: "חומרי עזר", supplyType: "גזים תעשייתיים", paymentTerms: "שוטף+30", leadTimeDays: 2, rating: 4, supplierType: "manufacturer" },
  { supplierNumber: "SUP014", supplierName: "ציוד מגן ובטיחות", contactPerson: "שמרית בטיחות", phone: "09-4445566", email: "safety@equipment.co.il", city: "הרצליה", country: "ישראל", countryCode: "IL", currency: "ILS", category: "ציוד", supplyType: "ציוד מגן אישי", paymentTerms: "שוטף+30", leadTimeDays: 3, rating: 5, supplierType: "distributor" },
  { supplierNumber: "SUP015", supplierName: "אריזה ולוגיסטיקה פרו", contactPerson: "לאה אריזה", phone: "08-7778899", email: "pack@logipro.co.il", city: "לוד", country: "ישראל", countryCode: "IL", currency: "ILS", category: "אריזה", supplyType: "חומרי אריזה", paymentTerms: "שוטף+30", leadTimeDays: 2, rating: 3, supplierType: "distributor" },
  { supplierNumber: "SUP021", supplierName: "Hydro Aluminium ASA", contactPerson: "Lars Eriksen", phone: "+47-22-530000", email: "israel@hydro.com", city: "Oslo", country: "נורווגיה", countryCode: "NO", currency: "EUR", category: "חומרי גלם", supplyType: "אלומיניום גלמי", paymentTerms: "LC+60", leadTimeDays: 60, rating: 5, supplierType: "manufacturer" },
  { supplierNumber: "SUP022", supplierName: "Pilkington Glass Germany GmbH", contactPerson: "Hans Mueller", phone: "+49-211-8040", email: "export@pilkington.de", city: "Cologne", country: "גרמניה", countryCode: "DE", currency: "EUR", category: "חומרי גלם", supplyType: "זכוכית מחוסמת", paymentTerms: "TT+30", leadTimeDays: 45, rating: 5, supplierType: "manufacturer" },
  { supplierNumber: "SUP023", supplierName: "Outokumpu Stainless AB", contactPerson: "Maria Lindqvist", phone: "+46-8-5601-0000", email: "mideast@outokumpu.com", city: "Stockholm", country: "שוודיה", countryCode: "SE", currency: "EUR", category: "חומרי גלם", supplyType: "נירוסטה גלמית", paymentTerms: "LC+45", leadTimeDays: 50, rating: 4, supplierType: "manufacturer" },
  { supplierNumber: "SUP024", supplierName: "Sapa Extrusions Sp. z o.o.", contactPerson: "Piotr Kowalski", phone: "+48-32-2880-000", email: "exports@sapagroup.pl", city: "Katowice", country: "פולין", countryCode: "PL", currency: "EUR", category: "חומרי גלם", supplyType: "פרופילי אלומיניום דחוסים", paymentTerms: "TT+45", leadTimeDays: 35, rating: 4, supplierType: "manufacturer" },
  { supplierNumber: "SUP025", supplierName: "Guangdong Aluminium Co. Ltd", contactPerson: "Li Wei", phone: "+86-20-8888-0000", email: "export@gdaluminium.cn", city: "Guangzhou", country: "סין", countryCode: "CN", currency: "USD", category: "חומרי גלם", supplyType: "פרופילי אלומיניום ייצוא", paymentTerms: "LC+30", leadTimeDays: 75, rating: 3, supplierType: "manufacturer" },
];

interface CustomerSeedRecord {
  customerNumber: string;
  customerName: string;
  contactPerson: string;
  phone: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  taxId: string;
  creditLimit: string;
  creditTermsDays: number;
  customerCategory: string;
  customerType: string;
}

const CUSTOMERS_DATA: CustomerSeedRecord[] = [
  { customerNumber: "CUS001", customerName: "שמעון בניין ופיתוח בע\"מ", contactPerson: "שמעון דוד", phone: "03-5241234", mobile: "050-5241234", email: "shimon@shimondavid.co.il", address: "רחוב הברזל 18", city: "תל אביב", postalCode: "6971018", taxId: "514286753", creditLimit: "500000", creditTermsDays: 30, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS002", customerName: "אדריכלות גולן ושות'", contactPerson: "נדב גולן", phone: "04-8321567", mobile: "052-8321567", email: "nadav@golan-arch.co.il", address: "שדרות הנשיא 45", city: "חיפה", postalCode: "3508409", taxId: "513974628", creditLimit: "300000", creditTermsDays: 45, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS003", customerName: "קבוצת אלרם בנייה", contactPerson: "אלי רם", phone: "03-6789012", mobile: "054-6789012", email: "eli@alram.co.il", address: "רחוב הרצל 102", city: "ראשון לציון", postalCode: "7521805", taxId: "512863957", creditLimit: "800000", creditTermsDays: 60, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS004", customerName: "עמוס קבלנות כללית", contactPerson: "עמוס בר-לב", phone: "08-6234567", mobile: "050-6234567", email: "amos@amoscon.co.il", address: "רחוב התקווה 30", city: "באר שבע", postalCode: "8489312", taxId: "515792341", creditLimit: "200000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS005", customerName: "נדל\"ן הגליל בע\"מ", contactPerson: "רון גלילי", phone: "04-6781234", mobile: "052-6781234", email: "ron@galil-re.co.il", address: "רחוב פאולוס השישי 12", city: "נצרת", postalCode: "1610001", taxId: "514638297", creditLimit: "600000", creditTermsDays: 45, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS006", customerName: "ברזילי קונסטרוקציות", contactPerson: "יוסי ברזילי", phone: "03-5678901", mobile: "054-5678901", email: "yosi@barzilai-const.co.il", address: "רחוב ז'בוטינסקי 78", city: "פתח תקוה", postalCode: "4959104", taxId: "516824139", creditLimit: "400000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS007", customerName: "חברת בניין הנגב", contactPerson: "מוטי שמש", phone: "08-6345678", mobile: "050-6345678", email: "moti@negev-build.co.il", address: "אזור תעשייה צפוני 5", city: "אשדוד", postalCode: "7710101", taxId: "513579246", creditLimit: "350000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS008", customerName: "פרויקט-ליין בע\"מ", contactPerson: "דנה כהן", phone: "09-7456789", mobile: "052-7456789", email: "dana@projectline.co.il", address: "רחוב ויצמן 55", city: "נתניה", postalCode: "4240535", taxId: "517946382", creditLimit: "450000", creditTermsDays: 45, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS009", customerName: "אלומיניום פרו התקנות", contactPerson: "גדי אלון", phone: "03-5432198", mobile: "054-5432198", email: "gadi@alupro.co.il", address: "רחוב התעשייה 22", city: "חולון", postalCode: "5885849", taxId: "512468135", creditLimit: "250000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS010", customerName: "זוהר עיצוב ואדריכלות", contactPerson: "מיכל זוהר", phone: "03-6123456", mobile: "050-6123456", email: "michal@zohar-design.co.il", address: "רחוב סוקולוב 40", city: "הרצליה", postalCode: "4655614", taxId: "518357924", creditLimit: "200000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS011", customerName: "מגורי השרון בע\"מ", contactPerson: "אריה שרון", phone: "09-7654321", mobile: "052-7654321", email: "arie@sharon-homes.co.il", address: "רחוב רוטשילד 15", city: "כפר סבא", postalCode: "4424828", taxId: "514729863", creditLimit: "700000", creditTermsDays: 60, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS012", customerName: "תעשיות בן-ארי", contactPerson: "נחמן בן-ארי", phone: "04-8567890", mobile: "054-8567890", email: "nahman@benari-ind.co.il", address: "אזור תעשייה 8", city: "עפולה", postalCode: "1812005", taxId: "515863749", creditLimit: "300000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS013", customerName: "חיים כהן קבלנות", contactPerson: "חיים כהן", phone: "08-6890123", mobile: "050-6890123", email: "haim@hcohen-con.co.il", address: "רחוב הנרקיס 7", city: "אשקלון", postalCode: "7830604", taxId: "516247913", creditLimit: "150000", creditTermsDays: 30, customerCategory: "C", customerType: "business" },
  { customerNumber: "CUS014", customerName: "דניאל הנדסת מבנים", contactPerson: "דניאל פרץ", phone: "03-5345678", mobile: "052-5345678", email: "daniel@daniel-eng.co.il", address: "רחוב ביאליק 62", city: "רמת גן", postalCode: "5252434", taxId: "517382946", creditLimit: "500000", creditTermsDays: 45, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS015", customerName: "מרכזי מסחר ישראל", contactPerson: "אורן גולד", phone: "03-6789345", mobile: "054-6789345", email: "oren@trade-centers.co.il", address: "מגדל שלום 9", city: "תל אביב", postalCode: "6525201", taxId: "518649372", creditLimit: "1000000", creditTermsDays: 60, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS016", customerName: "בנייני הים התיכון", contactPerson: "סמי חדד", phone: "04-8234567", mobile: "050-8234567", email: "sami@med-buildings.co.il", address: "רחוב העצמאות 33", city: "חיפה", postalCode: "3303317", taxId: "513482769", creditLimit: "600000", creditTermsDays: 45, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS017", customerName: "אופק נכסים והשקעות", contactPerson: "ליאור אופק", phone: "03-6456789", mobile: "052-6456789", email: "lior@ofek-invest.co.il", address: "רחוב הרצל 48", city: "רחובות", postalCode: "7610001", taxId: "514975238", creditLimit: "400000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS018", customerName: "גלעד פרויקטים", contactPerson: "גלעד ניר", phone: "09-7890123", mobile: "054-7890123", email: "gilad@gilad-proj.co.il", address: "רחוב אבא אבן 10", city: "הרצליה", postalCode: "4672530", taxId: "516738294", creditLimit: "350000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS019", customerName: "מפעלי מתכת השפלה", contactPerson: "רועי שפלה", phone: "08-6567890", mobile: "050-6567890", email: "roi@shfela-metal.co.il", address: "אזור תעשייה 14", city: "לוד", postalCode: "7139002", taxId: "517294638", creditLimit: "250000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS020", customerName: "רשת חנויות גביש", contactPerson: "שרה גביש", phone: "03-5890123", mobile: "052-5890123", email: "sara@gavish-stores.co.il", address: "רחוב רבי עקיבא 52", city: "בני ברק", postalCode: "5145202", taxId: "518463729", creditLimit: "200000", creditTermsDays: 30, customerCategory: "C", customerType: "business" },
  { customerNumber: "CUS021", customerName: "טופז הנדסה אזרחית", contactPerson: "אבנר טופז", phone: "03-6234567", mobile: "054-6234567", email: "avner@topaz-eng.co.il", address: "דרך מנחם בגין 132", city: "תל אביב", postalCode: "6701101", taxId: "512749386", creditLimit: "500000", creditTermsDays: 45, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS022", customerName: "א.ב. בנייה ופיתוח", contactPerson: "אבי בן-דוד", phone: "03-5567890", mobile: "050-5567890", email: "avi@ab-build.co.il", address: "רחוב דני מס 3", city: "רמלה", postalCode: "7219300", taxId: "515386247", creditLimit: "300000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS023", customerName: "שקד אדריכלים", contactPerson: "נועה שקד", phone: "09-7345678", mobile: "052-7345678", email: "noa@shaked-arch.co.il", address: "רחוב התחייה 20", city: "כפר סבא", postalCode: "4453820", taxId: "516829473", creditLimit: "200000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
  { customerNumber: "CUS024", customerName: "בנייני עתיד בע\"מ", contactPerson: "משה עתיד", phone: "03-6345890", mobile: "054-6345890", email: "moshe@atid-build.co.il", address: "רחוב בן גוריון 88", city: "פתח תקוה", postalCode: "4951101", taxId: "517493826", creditLimit: "450000", creditTermsDays: 45, customerCategory: "A", customerType: "business" },
  { customerNumber: "CUS025", customerName: "יוסף לוי נכסים", contactPerson: "יוסף לוי", phone: "08-6123789", mobile: "050-6123789", email: "yosef@levy-prop.co.il", address: "רחוב ויצמן 25", city: "נס ציונה", postalCode: "7403612", taxId: "518274936", creditLimit: "300000", creditTermsDays: 30, customerCategory: "B", customerType: "business" },
];

interface MaterialRecord {
  sku: string;
  materialName: string;
  category: string;
  unit: string;
  standardPrice: string;
  currentStock: string;
  minimumStock: string;
  materialType: string;
  finish?: string;
  width?: string;
  height?: string;
  thickness?: string;
  materialGrade?: string;
}

const SKUS_DATA: MaterialRecord[] = [
  { sku: "ALU-PRO-001", materialName: "פרופיל אלומיניום 40x40 לבן", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "28.50", currentStock: "2500", minimumStock: "500", materialType: "אלומיניום", finish: "ציפוי אבקה לבן", width: "40", height: "40", materialGrade: "6063-T5" },
  { sku: "ALU-PRO-002", materialName: "פרופיל אלומיניום 40x40 שחור", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "29.00", currentStock: "1800", minimumStock: "500", materialType: "אלומיניום", finish: "ציפוי אבקה שחור", width: "40", height: "40", materialGrade: "6063-T5" },
  { sku: "ALU-PRO-003", materialName: "פרופיל אלומיניום 60x40 לבן", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "35.00", currentStock: "1200", minimumStock: "300", materialType: "אלומיניום", finish: "ציפוי אבקה לבן", width: "60", height: "40", materialGrade: "6063-T5" },
  { sku: "ALU-PRO-004", materialName: "פרופיל אלומיניום 60x60 שחור", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "42.00", currentStock: "900", minimumStock: "300", materialType: "אלומיניום", finish: "ציפוי אבקה שחור", width: "60", height: "60", materialGrade: "6063-T5" },
  { sku: "ALU-PRO-005", materialName: "פרופיל אלומיניום 80x40 אנודייז", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "48.00", currentStock: "600", minimumStock: "200", materialType: "אלומיניום", finish: "אנודייזינג", width: "80", height: "40", materialGrade: "6063-T6" },
  { sku: "ALU-PRO-006", materialName: "פרופיל אלומיניום 100x50 לבן", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "58.00", currentStock: "400", minimumStock: "150", materialType: "אלומיניום", finish: "ציפוי אבקה לבן", width: "100", height: "50", materialGrade: "6063-T5" },
  { sku: "ALU-PRO-007", materialName: "פרופיל זווית אלומיניום 30x30", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "18.00", currentStock: "3000", minimumStock: "1000", materialType: "אלומיניום", finish: "כסוף טבעי", width: "30", height: "30", materialGrade: "6060-T6" },
  { sku: "ALU-PRO-008", materialName: "פרופיל T אלומיניום 20x20", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "14.00", currentStock: "2000", minimumStock: "500", materialType: "אלומיניום", finish: "כסוף טבעי", width: "20", height: "20", materialGrade: "6063-T5" },
  { sku: "ALU-PRO-009", materialName: "פרופיל מסגרת חלון 3\" שחור", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "45.00", currentStock: "1500", minimumStock: "400", materialType: "אלומיניום", finish: "ציפוי אבקה שחור", materialGrade: "6063-T5" },
  { sku: "ALU-PRO-010", materialName: "פרופיל פרגולה 80x80 לבן", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "65.00", currentStock: "800", minimumStock: "200", materialType: "אלומיניום", finish: "ציפוי אבקה לבן", width: "80", height: "80", materialGrade: "6063-T6" },
  { sku: "ALU-PRO-011", materialName: "פרופיל מעקה עגול 50mm", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "38.00", currentStock: "1100", minimumStock: "300", materialType: "אלומיניום", finish: "אנודייזינג", materialGrade: "6063-T6" },
  { sku: "ALU-PRO-012", materialName: "פרופיל ציר חלון כפול", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "52.00", currentStock: "700", minimumStock: "200", materialType: "אלומיניום", finish: "ציפוי אבקה לבן", materialGrade: "6063-T5" },
  { sku: "ALU-PRO-013", materialName: "פרופיל ריצפה אלומיניום שטוח 50x5", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "22.00", currentStock: "2200", minimumStock: "600", materialType: "אלומיניום", finish: "כסוף טבעי", width: "50", height: "5", materialGrade: "6061-T6" },
  { sku: "ALU-PRO-014", materialName: "פרופיל תריס רולדן 55mm", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "31.00", currentStock: "1600", minimumStock: "500", materialType: "אלומיניום", finish: "ציפוי אבקה", materialGrade: "6063-T5" },
  { sku: "ALU-PRO-015", materialName: "פרופיל קיר מסך 120x50", category: "פרופילי אלומיניום", unit: "מ\"ל", standardPrice: "78.00", currentStock: "350", minimumStock: "100", materialType: "אלומיניום", finish: "ציפוי אבקה", width: "120", height: "50", materialGrade: "6063-T6" },
  { sku: "IRON-001", materialName: "צינור ברזל מרובע 40x40x2", category: "פרופילי ברזל", unit: "מ\"ל", standardPrice: "22.00", currentStock: "3000", minimumStock: "800", materialType: "ברזל", materialGrade: "S235", width: "40", height: "40", thickness: "2" },
  { sku: "IRON-002", materialName: "צינור ברזל מרובע 50x50x2.5", category: "פרופילי ברזל", unit: "מ\"ל", standardPrice: "28.00", currentStock: "2500", minimumStock: "600", materialType: "ברזל", materialGrade: "S235", width: "50", height: "50", thickness: "2.5" },
  { sku: "IRON-003", materialName: "אנגל ברזל 50x50x5", category: "פרופילי ברזל", unit: "מ\"ל", standardPrice: "19.00", currentStock: "4000", minimumStock: "1000", materialType: "ברזל", materialGrade: "S235" },
  { sku: "IRON-004", materialName: "צינור ברזל עגול 50mm", category: "פרופילי ברזל", unit: "מ\"ל", standardPrice: "24.00", currentStock: "1800", minimumStock: "400", materialType: "ברזל", materialGrade: "S235" },
  { sku: "IRON-005", materialName: "I-beam ברזל H120", category: "פרופילי ברזל", unit: "מ\"ל", standardPrice: "85.00", currentStock: "500", minimumStock: "100", materialType: "ברזל", materialGrade: "S275" },
  { sku: "IRON-006", materialName: "פח ברזל 2mm", category: "פרופילי ברזל", unit: "מ\"ר", standardPrice: "45.00", currentStock: "800", minimumStock: "200", materialType: "ברזל", thickness: "2", materialGrade: "S235" },
  { sku: "IRON-007", materialName: "פח ברזל 3mm", category: "פרופילי ברזל", unit: "מ\"ר", standardPrice: "65.00", currentStock: "600", minimumStock: "150", materialType: "ברזל", thickness: "3", materialGrade: "S235" },
  { sku: "IRON-008", materialName: "פח ברזל 5mm", category: "פרופילי ברזל", unit: "מ\"ר", standardPrice: "95.00", currentStock: "400", minimumStock: "100", materialType: "ברזל", thickness: "5", materialGrade: "S275" },
  { sku: "IRON-009", materialName: "U-profile ברזל 60x30", category: "פרופילי ברזל", unit: "מ\"ל", standardPrice: "32.00", currentStock: "1200", minimumStock: "300", materialType: "ברזל", materialGrade: "S235" },
  { sku: "IRON-010", materialName: "עמוד ברזל מרובע 80x80x4", category: "פרופילי ברזל", unit: "מ\"ל", standardPrice: "58.00", currentStock: "700", minimumStock: "150", materialType: "ברזל", materialGrade: "S355" },
  { sku: "IRON-011", materialName: "פס ברזל שטוח 40x4", category: "פרופילי ברזל", unit: "מ\"ל", standardPrice: "16.00", currentStock: "5000", minimumStock: "1500", materialType: "ברזל", materialGrade: "S235" },
  { sku: "IRON-012", materialName: "T-profile ברזל 50x50x6", category: "פרופילי ברזל", unit: "מ\"ל", standardPrice: "38.00", currentStock: "900", minimumStock: "200", materialType: "ברזל", materialGrade: "S235" },
  { sku: "SS-001", materialName: "צינור נירוסטה עגול 38mm Grade 304", category: "פרופילי נירוסטה", unit: "מ\"ל", standardPrice: "65.00", currentStock: "1200", minimumStock: "300", materialType: "נירוסטה", materialGrade: "AISI 304", finish: "מוברש" },
  { sku: "SS-002", materialName: "צינור נירוסטה עגול 50mm Grade 316", category: "פרופילי נירוסטה", unit: "מ\"ל", standardPrice: "95.00", currentStock: "800", minimumStock: "200", materialType: "נירוסטה", materialGrade: "AISI 316", finish: "מוברש" },
  { sku: "SS-003", materialName: "פח נירוסטה 1.5mm Grade 304", category: "פרופילי נירוסטה", unit: "מ\"ר", standardPrice: "125.00", currentStock: "500", minimumStock: "100", materialType: "נירוסטה", materialGrade: "AISI 304", thickness: "1.5", finish: "2B" },
  { sku: "SS-004", materialName: "פח נירוסטה 2mm Grade 316L", category: "פרופילי נירוסטה", unit: "מ\"ר", standardPrice: "185.00", currentStock: "300", minimumStock: "80", materialType: "נירוסטה", materialGrade: "AISI 316L", thickness: "2", finish: "2B" },
  { sku: "SS-005", materialName: "מעקה נירוסטה עגול 42.4mm", category: "פרופילי נירוסטה", unit: "מ\"ל", standardPrice: "85.00", currentStock: "900", minimumStock: "250", materialType: "נירוסטה", materialGrade: "AISI 304", finish: "מוברש" },
  { sku: "SS-006", materialName: "אנגל נירוסטה 40x40x3", category: "פרופילי נירוסטה", unit: "מ\"ל", standardPrice: "55.00", currentStock: "600", minimumStock: "150", materialType: "נירוסטה", materialGrade: "AISI 304" },
  { sku: "SS-007", materialName: "פס נירוסטה שטוח 50x6", category: "פרופילי נירוסטה", unit: "מ\"ל", standardPrice: "45.00", currentStock: "700", minimumStock: "200", materialType: "נירוסטה", materialGrade: "AISI 304" },
  { sku: "SS-008", materialName: "מרובע נירוסטה 40x40x2", category: "פרופילי נירוסטה", unit: "מ\"ל", standardPrice: "75.00", currentStock: "400", minimumStock: "100", materialType: "נירוסטה", materialGrade: "AISI 316" },
  { sku: "GLASS-001", materialName: "זכוכית שטוחה 6mm שקופה", category: "זכוכית", unit: "מ\"ר", standardPrice: "95.00", currentStock: "400", minimumStock: "100", materialType: "זכוכית", thickness: "6", finish: "שקוף" },
  { sku: "GLASS-002", materialName: "זכוכית מחוסמת 6mm", category: "זכוכית", unit: "מ\"ר", standardPrice: "145.00", currentStock: "350", minimumStock: "80", materialType: "זכוכית מחוסמת", thickness: "6", finish: "שקוף" },
  { sku: "GLASS-003", materialName: "זכוכית מחוסמת 8mm", category: "זכוכית", unit: "מ\"ר", standardPrice: "185.00", currentStock: "280", minimumStock: "60", materialType: "זכוכית מחוסמת", thickness: "8", finish: "שקוף" },
  { sku: "GLASS-004", materialName: "זכוכית כפולה IGU 4+12+4", category: "זכוכית", unit: "מ\"ר", standardPrice: "280.00", currentStock: "200", minimumStock: "50", materialType: "זכוכית כפולה", finish: "שקוף" },
  { sku: "GLASS-005", materialName: "זכוכית כפולה Low-E 4+16+4", category: "זכוכית", unit: "מ\"ר", standardPrice: "380.00", currentStock: "150", minimumStock: "40", materialType: "זכוכית Low-E", finish: "ציפוי Low-E" },
  { sku: "GLASS-006", materialName: "זכוכית למינירט VSG 44.2", category: "זכוכית", unit: "מ\"ר", standardPrice: "320.00", currentStock: "120", minimumStock: "30", materialType: "זכוכית למינירט", thickness: "8.76", finish: "שקוף" },
  { sku: "GLASS-007", materialName: "זכוכית פרוסטד מחוסם 6mm", category: "זכוכית", unit: "מ\"ר", standardPrice: "165.00", currentStock: "100", minimumStock: "25", materialType: "זכוכית מחוסמת", thickness: "6", finish: "פרוסטד" },
  { sku: "GLASS-008", materialName: "זכוכית גרפיט 6mm", category: "זכוכית", unit: "מ\"ר", standardPrice: "180.00", currentStock: "80", minimumStock: "20", materialType: "זכוכית צבועה", thickness: "6", finish: "גרפיט" },
  { sku: "GLASS-009", materialName: "זכוכית מראה 4mm", category: "זכוכית", unit: "מ\"ר", standardPrice: "220.00", currentStock: "60", minimumStock: "15", materialType: "מראה", thickness: "4" },
  { sku: "GLASS-010", materialName: "זכוכית עמידת אש 30min", category: "זכוכית", unit: "מ\"ר", standardPrice: "850.00", currentStock: "30", minimumStock: "10", materialType: "זכוכית אש", thickness: "30", finish: "שקוף" },
  { sku: "ACC-001", materialName: "סיליקון איטום שקוף 300ml", category: "חומרי איטום", unit: "יחידה", standardPrice: "18.00", currentStock: "500", minimumStock: "100", materialType: "סיליקון" },
  { sku: "ACC-002", materialName: "סיליקון איטום שחור 300ml", category: "חומרי איטום", unit: "יחידה", standardPrice: "18.00", currentStock: "400", minimumStock: "100", materialType: "סיליקון" },
  { sku: "ACC-003", materialName: "טייפ EPDM 9x3mm", category: "חומרי איטום", unit: "מ\"ל", standardPrice: "3.50", currentStock: "2000", minimumStock: "500", materialType: "EPDM" },
  { sku: "ACC-004", materialName: "ברגים SS M8x30 100 יח'", category: "חיבורים", unit: "קופסה", standardPrice: "35.00", currentStock: "200", minimumStock: "50", materialType: "נירוסטה" },
  { sku: "ACC-005", materialName: "ברגים SS M10x50 100 יח'", category: "חיבורים", unit: "קופסה", standardPrice: "55.00", currentStock: "150", minimumStock: "40", materialType: "נירוסטה" },
  { sku: "ACC-006", materialName: "צירים חלון אלומיניום זוג", category: "אביזרי חלון", unit: "זוג", standardPrice: "45.00", currentStock: "300", minimumStock: "80", materialType: "אלומיניום" },
  { sku: "ACC-007", materialName: "ידית חלון לבנה", category: "אביזרי חלון", unit: "יחידה", standardPrice: "28.00", currentStock: "400", minimumStock: "100", materialType: "אלומיניום" },
  { sku: "ACC-008", materialName: "ידית דלת נירוסטה", category: "אביזרי דלת", unit: "זוג", standardPrice: "85.00", currentStock: "200", minimumStock: "50", materialType: "נירוסטה" },
  { sku: "ACC-009", materialName: "מנעול צילינדר אלומיניום", category: "אביזרי דלת", unit: "יחידה", standardPrice: "120.00", currentStock: "150", minimumStock: "30", materialType: "אלומיניום" },
  { sku: "ACC-010", materialName: "גלגלים למסילה 40kg", category: "חומרי עזר", unit: "זוג", standardPrice: "65.00", currentStock: "250", minimumStock: "60", materialType: "נירוסטה" },
  { sku: "ACC-011", materialName: "שפריץ פריימר אלומיניום 400ml", category: "חומרי ציפוי", unit: "יחידה", standardPrice: "42.00", currentStock: "120", minimumStock: "30", materialType: "צבע" },
  { sku: "ACC-012", materialName: "אבקת ציפוי לבנה RAL 9016 kg", category: "חומרי ציפוי", unit: "ק\"ג", standardPrice: "32.00", currentStock: "500", minimumStock: "100", materialType: "אבקת ציפוי" },
  { sku: "ACC-013", materialName: "אבקת ציפוי שחורה RAL 9005 kg", category: "חומרי ציפוי", unit: "ק\"ג", standardPrice: "32.00", currentStock: "400", minimumStock: "100", materialType: "אבקת ציפוי" },
  { sku: "ACC-014", materialName: "חוט ריתוך ER4043 0.8mm 5kg", category: "חומרי ריתוך", unit: "קופסה", standardPrice: "180.00", currentStock: "100", minimumStock: "25", materialType: "חוט ריתוך" },
  { sku: "ACC-015", materialName: "גז ארגון ריתוך TIG", category: "גזים", unit: "בלון", standardPrice: "350.00", currentStock: "30", minimumStock: "8", materialType: "גז" },
];

interface BomProduct {
  productNumber: string;
  productName: string;
  categoryName: string;
  description: string;
  unit: string;
  pricePerSqm: string;
  materialCostPerSqm: string;
  materialType: string;
  finishType: string;
  materials: Array<{ skuRef: string; qty: number; wastePct: number; uom: string }>;
}

const BOM_PRODUCTS: BomProduct[] = [
  {
    productNumber: "DRW-ALU-400",
    productName: "מגירת אלומיניום 400mm לבן",
    categoryName: "מגירות אלומיניום",
    description: "מגירת אלומיניום, עומק 400 מ\"מ, רוחב 500 מ\"מ, גימור ציפוי אבקה לבן, מסילה מלאה",
    unit: "יחידה",
    pricePerSqm: "420",
    materialCostPerSqm: "185",
    materialType: "אלומיניום",
    finishType: "ציפוי אבקה לבן",
    materials: [
      { skuRef: "ALU-PRO-001", qty: 1.8, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "ALU-PRO-003", qty: 0.6, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ACC-010", qty: 1, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-004", qty: 0.15, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-012", qty: 0.4, wastePct: 12, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "DRW-ALU-500",
    productName: "מגירת אלומיניום 500mm שחור",
    categoryName: "מגירות אלומיניום",
    description: "מגירת אלומיניום, עומק 500 מ\"מ, רוחב 600 מ\"מ, ציפוי אבקה שחור, מסילה מלאה Soft-Close",
    unit: "יחידה",
    pricePerSqm: "520",
    materialCostPerSqm: "240",
    materialType: "אלומיניום",
    finishType: "ציפוי אבקה שחור",
    materials: [
      { skuRef: "ALU-PRO-001", qty: 2.2, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "ALU-PRO-003", qty: 0.8, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ACC-010", qty: 1, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-004", qty: 0.2, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-013", qty: 0.5, wastePct: 12, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "DRW-IRON-450",
    productName: "מגירת ברזל 450mm אנתרציט",
    categoryName: "מגירות ברזל",
    description: "מגירת ברזל, עומק 450 מ\"מ, רוחב 600 מ\"מ, ציפוי אפוקסי אנתרציט, מסילה תעשייתית 80kg",
    unit: "יחידה",
    pricePerSqm: "380",
    materialCostPerSqm: "165",
    materialType: "ברזל",
    finishType: "ציפוי אפוקסי אנתרציט",
    materials: [
      { skuRef: "IRON-002", qty: 1.6, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "IRON-004", qty: 0.8, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ACC-010", qty: 1, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-005", qty: 0.2, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-013", qty: 0.6, wastePct: 10, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "DRW-SS-500",
    productName: "מגירת נירוסטה 500mm מוברש",
    categoryName: "מגירות נירוסטה",
    description: "מגירת נירוסטה AISI 304, עומק 500 מ\"מ, רוחב 500 מ\"מ, גימור מוברש, מסילה מלאה",
    unit: "יחידה",
    pricePerSqm: "680",
    materialCostPerSqm: "340",
    materialType: "נירוסטה",
    finishType: "מוברש",
    materials: [
      { skuRef: "SS-002", qty: 1.7, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "SS-006", qty: 0.5, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ACC-010", qty: 1, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-004", qty: 0.15, wastePct: 0, uom: "קופסה" },
    ],
  },
  {
    productNumber: "DRW-GLASS-500",
    productName: "מגירת זכוכית+אלומיניום 500mm",
    categoryName: "מגירות זכוכית",
    description: "מגירת אלומיניום עם חזית זכוכית מחוסמת 8mm, עומק 500 מ\"מ, רוחב 600 מ\"מ, ציפוי לבן",
    unit: "יחידה",
    pricePerSqm: "920",
    materialCostPerSqm: "450",
    materialType: "אלומיניום + זכוכית",
    finishType: "ציפוי אבקה לבן + זכוכית מחוסמת",
    materials: [
      { skuRef: "ALU-PRO-001", qty: 1.8, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "GLASS-002", qty: 0.30, wastePct: 8, uom: "מ\"ר" },
      { skuRef: "ACC-010", qty: 1, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-001", qty: 0.3, wastePct: 0, uom: "יחידה" },
      { skuRef: "ACC-004", qty: 0.15, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-012", qty: 0.3, wastePct: 12, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "DRW-ALU-KITCHEN",
    productName: "ערכת מגירות מטבח אלומיניום 3 שכבות",
    categoryName: "ערכות מגירות",
    description: "ערכת 3 מגירות אלומיניום למטבח: 150+200+250mm גובה, רוחב 600mm, עומק 450mm, ציפוי לבן",
    unit: "ערכה",
    pricePerSqm: "1850",
    materialCostPerSqm: "820",
    materialType: "אלומיניום",
    finishType: "ציפוי אבקה לבן",
    materials: [
      { skuRef: "ALU-PRO-001", qty: 6.2, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "ALU-PRO-003", qty: 2.4, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ACC-010", qty: 3, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-004", qty: 0.5, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-012", qty: 1.2, wastePct: 12, uom: "ק\"ג" },
      { skuRef: "ACC-007", qty: 3, wastePct: 0, uom: "יחידה" },
    ],
  },
  {
    productNumber: "WIN-ALU-STD",
    productName: "חלון אלומיניום סטנדרטי 120x100",
    categoryName: "חלונות אלומיניום",
    description: "חלון אלומיניום דו-כנפי, 120x100 ס\"מ, זכוכית כפולה, ציפוי אבקה לבן",
    unit: "יחידה",
    pricePerSqm: "850",
    materialCostPerSqm: "380",
    materialType: "אלומיניום",
    finishType: "ציפוי אבקה לבן",
    materials: [
      { skuRef: "ALU-PRO-009", qty: 4.4, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "GLASS-001", qty: 2.4, wastePct: 5, uom: "מ\"ר" },
      { skuRef: "ACC-001", qty: 4.8, wastePct: 0, uom: "מ\"ל" },
      { skuRef: "ACC-003", qty: 2, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-009", qty: 1, wastePct: 0, uom: "יחידה" },
      { skuRef: "ACC-012", qty: 0.8, wastePct: 10, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "WIN-ALU-DK",
    productName: "חלון אלומיניום דריי-קיפ 80x120",
    categoryName: "חלונות אלומיניום",
    description: "חלון אלומיניום דריי-קיפ (הטיה+פתיחה), 80x120 ס\"מ, זכוכית בידוד כפולה",
    unit: "יחידה",
    pricePerSqm: "1100",
    materialCostPerSqm: "520",
    materialType: "אלומיניום",
    finishType: "ציפוי אבקה שחור",
    materials: [
      { skuRef: "ALU-PRO-009", qty: 4.0, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ALU-PRO-012", qty: 2.0, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "GLASS-002", qty: 0.96, wastePct: 5, uom: "מ\"ר" },
      { skuRef: "ACC-001", qty: 4.0, wastePct: 0, uom: "מ\"ל" },
      { skuRef: "ACC-003", qty: 3, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-009", qty: 1, wastePct: 0, uom: "יחידה" },
      { skuRef: "ACC-013", qty: 0.8, wastePct: 10, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "DR-IRON-STD",
    productName: "דלת פלדה חד-כנפית 90x210",
    categoryName: "דלתות פלדה",
    description: "דלת פלדה חד-כנפית, 90x210 ס\"מ, פח 2 מ\"מ, ציפוי אפוקסי, כולל מסגרת",
    unit: "יחידה",
    pricePerSqm: "1400",
    materialCostPerSqm: "620",
    materialType: "ברזל",
    finishType: "ציפוי אפוקסי",
    materials: [
      { skuRef: "IRON-001", qty: 6.0, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "IRON-006", qty: 3.78, wastePct: 8, uom: "מ\"ר" },
      { skuRef: "ACC-005", qty: 0.3, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-008", qty: 1, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-009", qty: 1, wastePct: 0, uom: "יחידה" },
      { skuRef: "ACC-013", qty: 1.2, wastePct: 10, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "DR-ALU-SLIDE",
    productName: "דלת הזזה אלומיניום 200x220",
    categoryName: "דלתות אלומיניום",
    description: "דלת הזזה אלומיניום כפולה, 200x220 ס\"מ, זכוכית בטיחותית, מסילה עליונה",
    unit: "יחידה",
    pricePerSqm: "1800",
    materialCostPerSqm: "850",
    materialType: "אלומיניום + זכוכית",
    finishType: "אנודייזינג",
    materials: [
      { skuRef: "ALU-PRO-003", qty: 8.4, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ALU-PRO-004", qty: 4.4, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "GLASS-003", qty: 4.4, wastePct: 5, uom: "מ\"ר" },
      { skuRef: "ACC-001", qty: 8.8, wastePct: 0, uom: "מ\"ל" },
      { skuRef: "ACC-010", qty: 2, wastePct: 0, uom: "זוג" },
    ],
  },
  {
    productNumber: "RAIL-SS-RND",
    productName: "מעקה נירוסטה עגול 1 מ\"ל",
    categoryName: "מעקות נירוסטה",
    description: "מעקה נירוסטה AISI 304, צינור עגול 50 מ\"מ, 3 מוטות אופקיים, גובה 100 ס\"מ",
    unit: "מ\"ל",
    pricePerSqm: "950",
    materialCostPerSqm: "420",
    materialType: "נירוסטה",
    finishType: "מוברש סאטן",
    materials: [
      { skuRef: "SS-003", qty: 1.1, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "SS-004", qty: 3.3, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ACC-004", qty: 0.1, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-014", qty: 0.2, wastePct: 0, uom: "קופסה" },
    ],
  },
  {
    productNumber: "RAIL-ALU-STD",
    productName: "מעקה אלומיניום 1 מ\"ל",
    categoryName: "מעקות אלומיניום",
    description: "מעקה אלומיניום, פרופיל עגול 50 מ\"מ + זווית 30x30, גובה 100 ס\"מ, ציפוי אבקה",
    unit: "מ\"ל",
    pricePerSqm: "650",
    materialCostPerSqm: "280",
    materialType: "אלומיניום",
    finishType: "ציפוי אבקה לבן",
    materials: [
      { skuRef: "ALU-PRO-011", qty: 1.1, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ALU-PRO-007", qty: 3.3, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ACC-004", qty: 0.1, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-012", qty: 0.5, wastePct: 10, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "GATE-IRON-PARK",
    productName: "שער חנייה ברזל 5x2.5 מ'",
    categoryName: "שערי חנייה",
    description: "שער חנייה הזזה, 5x2.5 מ', צינור מרובע 50x50 + עמודים 80x80, ציפוי אפוקסי",
    unit: "יחידה",
    pricePerSqm: "4500",
    materialCostPerSqm: "1800",
    materialType: "ברזל",
    finishType: "ציפוי אפוקסי שחור",
    materials: [
      { skuRef: "IRON-002", qty: 30.0, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "IRON-010", qty: 5.0, wastePct: 5, uom: "מ\"ל" },
      { skuRef: "IRON-001", qty: 12.0, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "ACC-010", qty: 4, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-005", qty: 0.5, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-013", qty: 3.0, wastePct: 10, uom: "ק\"ג" },
      { skuRef: "ACC-014", qty: 1.0, wastePct: 0, uom: "קופסה" },
    ],
  },
  {
    productNumber: "GATE-IRON-PED",
    productName: "שער כניסה ברזל מעוצב 120x200",
    categoryName: "שערי כניסה",
    description: "שער כניסה ברזל מפורזל, 120x200 ס\"מ, כולל מסגרת ומנעול",
    unit: "יחידה",
    pricePerSqm: "2800",
    materialCostPerSqm: "1100",
    materialType: "ברזל",
    finishType: "ציפוי אפוקסי + חלודה מבוקרת",
    materials: [
      { skuRef: "IRON-001", qty: 6.4, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "IRON-006", qty: 2.4, wastePct: 8, uom: "מ\"ר" },
      { skuRef: "IRON-004", qty: 8.0, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "ACC-005", qty: 0.3, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-008", qty: 1, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-009", qty: 1, wastePct: 0, uom: "יחידה" },
    ],
  },
  {
    productNumber: "PERG-ALU-STD",
    productName: "פרגולת אלומיניום 4x3 מ'",
    categoryName: "פרגולות אלומיניום",
    description: "פרגולת אלומיניום, 4x3 מ', עמודים 80x80, קורות 100x50, ציפוי אבקה לבן",
    unit: "יחידה",
    pricePerSqm: "8500",
    materialCostPerSqm: "3800",
    materialType: "אלומיניום",
    finishType: "ציפוי אבקה לבן",
    materials: [
      { skuRef: "ALU-PRO-010", qty: 12.0, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ALU-PRO-006", qty: 24.0, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ACC-004", qty: 1.0, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-012", qty: 4.0, wastePct: 10, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "CW-ALU-STD",
    productName: "קיר מסך אלומיניום 1 מ\"ר",
    categoryName: "קירות מסך",
    description: "קיר מסך אלומיניום+זכוכית, פרופיל 120x50, זכוכית בידוד כפולה Low-E",
    unit: "מ\"ר",
    pricePerSqm: "2200",
    materialCostPerSqm: "980",
    materialType: "אלומיניום + זכוכית",
    finishType: "אנודייזינג כסוף",
    materials: [
      { skuRef: "ALU-PRO-015", qty: 3.0, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "GLASS-004", qty: 1.0, wastePct: 5, uom: "מ\"ר" },
      { skuRef: "ACC-001", qty: 4.0, wastePct: 0, uom: "מ\"ל" },
      { skuRef: "ACC-003", qty: 1, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-002", qty: 2.0, wastePct: 0, uom: "מ\"ל" },
    ],
  },
  {
    productNumber: "SHUT-ALU-ROL",
    productName: "תריס גלילה אלומיניום 150x150",
    categoryName: "תריסי גלילה",
    description: "תריס גלילה אלומיניום 55 מ\"מ, 150x150 ס\"מ, כולל ציר וקופסה, ציפוי אבקה",
    unit: "יחידה",
    pricePerSqm: "750",
    materialCostPerSqm: "320",
    materialType: "אלומיניום",
    finishType: "ציפוי אבקה לבן",
    materials: [
      { skuRef: "ALU-PRO-014", qty: 15.0, wastePct: 5, uom: "מ\"ל" },
      { skuRef: "ALU-PRO-007", qty: 3.0, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ACC-007", qty: 1, wastePct: 0, uom: "יחידה" },
      { skuRef: "ACC-003", qty: 2, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-012", qty: 0.5, wastePct: 10, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "STR-IRON-COL",
    productName: "עמוד פלדה H120 — 3 מ'",
    categoryName: "קונסטרוקציית פלדה",
    description: "עמוד פלדה I-beam H120, אורך 3 מ', פלטת בסיס 200x200x10, S275",
    unit: "יחידה",
    pricePerSqm: "1200",
    materialCostPerSqm: "520",
    materialType: "ברזל",
    finishType: "ציפוי אנטי-חלודה + אפוקסי",
    materials: [
      { skuRef: "IRON-005", qty: 3.0, wastePct: 5, uom: "מ\"ל" },
      { skuRef: "IRON-008", qty: 0.04, wastePct: 5, uom: "מ\"ר" },
      { skuRef: "ACC-014", qty: 0.5, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-013", qty: 1.5, wastePct: 10, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "STR-IRON-BEAM",
    productName: "קורת פלדה H120 — 6 מ'",
    categoryName: "קונסטרוקציית פלדה",
    description: "קורת פלדה I-beam H120, אורך 6 מ', חיזוקי אנגל 50x50x5, S275",
    unit: "יחידה",
    pricePerSqm: "2400",
    materialCostPerSqm: "1050",
    materialType: "ברזל",
    finishType: "ציפוי אנטי-חלודה",
    materials: [
      { skuRef: "IRON-005", qty: 6.0, wastePct: 5, uom: "מ\"ל" },
      { skuRef: "IRON-003", qty: 2.0, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "ACC-014", qty: 1.0, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-013", qty: 2.5, wastePct: 10, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "BAR-IRON-WIN",
    productName: "סורג חלון ברזל 120x100",
    categoryName: "סורגים",
    description: "סורג חלון ברזל, 120x100 ס\"מ, צינור מרובע 40x40 + עגול 50 מ\"מ, ציפוי אפוקסי",
    unit: "יחידה",
    pricePerSqm: "380",
    materialCostPerSqm: "160",
    materialType: "ברזל",
    finishType: "ציפוי אפוקסי שחור",
    materials: [
      { skuRef: "IRON-001", qty: 4.4, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "IRON-004", qty: 5.0, wastePct: 10, uom: "מ\"ל" },
      { skuRef: "ACC-005", qty: 0.2, wastePct: 0, uom: "קופסה" },
      { skuRef: "ACC-013", qty: 0.6, wastePct: 10, uom: "ק\"ג" },
    ],
  },
  {
    productNumber: "VIT-GLASS-STD",
    productName: "ויטרינת זכוכית מסחרית 200x250",
    categoryName: "ויטרינות זכוכית",
    description: "ויטרינת זכוכית מחוסמת 10 מ\"מ, מסגרת אלומיניום 60x60, 200x250 ס\"מ",
    unit: "יחידה",
    pricePerSqm: "3200",
    materialCostPerSqm: "1450",
    materialType: "אלומיניום + זכוכית",
    finishType: "אנודייזינג + זכוכית מחוסמת",
    materials: [
      { skuRef: "ALU-PRO-004", qty: 9.0, wastePct: 8, uom: "מ\"ל" },
      { skuRef: "GLASS-003", qty: 5.0, wastePct: 5, uom: "מ\"ר" },
      { skuRef: "ACC-001", qty: 9.0, wastePct: 0, uom: "מ\"ל" },
      { skuRef: "ACC-003", qty: 2, wastePct: 0, uom: "זוג" },
      { skuRef: "ACC-012", qty: 1.0, wastePct: 10, uom: "ק\"ג" },
    ],
  },
];

async function insertCustomers(): Promise<number> {
  let inserted = 0;
  for (const cus of CUSTOMERS_DATA) {
    const result = await pool.query(
      `INSERT INTO customers (customer_number, customer_name, contact_person, phone, mobile, email, address, city, postal_code, country, tax_id, credit_limit, credit_terms_days, customer_category, customer_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Israel',$10,$11,$12,$13,$14,'active')
       ON CONFLICT (customer_number) DO NOTHING`,
      [cus.customerNumber, cus.customerName, cus.contactPerson, cus.phone, cus.mobile, cus.email, cus.address, cus.city, cus.postalCode, cus.taxId, cus.creditLimit, cus.creditTermsDays, cus.customerCategory, cus.customerType]
    );
    if ((result.rowCount ?? 0) > 0) inserted++;
  }
  return inserted;
}

const WORK_ORDERS_DATA = [
  { orderNumber: "WO-2026-001", productName: "חלון אלומיניום סטנדרטי 120x100", customerName: "שמעון בניין ופיתוח בע\"מ", quantity: 48, status: "in_progress", priority: "high", plannedStart: "2026-01-15", plannedEnd: "2026-02-28", productionLine: "קו אלומיניום A", department: "ייצור אלומיניום", notes: "פרויקט מגורים רמת גן — 48 חלונות" },
  { orderNumber: "WO-2026-002", productName: "שער חנייה ברזל 5x2.5 מ'", customerName: "ברזילי קונסטרוקציות", quantity: 1, status: "completed", priority: "high", plannedStart: "2026-01-10", plannedEnd: "2026-01-25", productionLine: "קו ברזל B", department: "ייצור ברזל", notes: "שער חנייה חשמלי — כולל מנוע" },
  { orderNumber: "WO-2026-003", productName: "דלת פלדה חד-כנפית 90x210", customerName: "חברת בניין הנגב", quantity: 6, status: "completed", priority: "medium", plannedStart: "2026-01-20", plannedEnd: "2026-02-10", productionLine: "קו ברזל B", department: "ייצור ברזל", notes: "6 דלתות פלדה למפעל" },
  { orderNumber: "WO-2026-004", productName: "מעקה נירוסטה עגול 1 מ\"ל", customerName: "דניאל הנדסת מבנים", quantity: 120, status: "in_progress", priority: "high", plannedStart: "2026-02-01", plannedEnd: "2026-03-15", productionLine: "קו נירוסטה C", department: "ייצור נירוסטה", notes: "מעקות נירוסטה — בניין 8 קומות" },
  { orderNumber: "WO-2026-005", productName: "פרגולת אלומיניום 4x3 מ'", customerName: "מגורי השרון בע\"מ", quantity: 4, status: "in_progress", priority: "medium", plannedStart: "2026-02-10", plannedEnd: "2026-03-20", productionLine: "קו אלומיניום A", department: "ייצור אלומיניום", notes: "4 פרגולות — וילה פרטית" },
  { orderNumber: "WO-2026-006", productName: "קיר מסך אלומיניום 1 מ\"ר", customerName: "מרכזי מסחר ישראל", quantity: 250, status: "planned", priority: "critical", plannedStart: "2026-03-01", plannedEnd: "2026-06-30", productionLine: "קו אלומיניום A", department: "ייצור אלומיניום", notes: "חזית קיר מסך — מרכז מסחרי" },
  { orderNumber: "WO-2026-007", productName: "סורג חלון ברזל 120x100", customerName: "עמוס קבלנות כללית", quantity: 24, status: "in_progress", priority: "medium", plannedStart: "2026-02-15", plannedEnd: "2026-03-10", productionLine: "קו ברזל B", department: "ייצור ברזל", notes: "סורגים לבניין מגורים" },
  { orderNumber: "WO-2026-008", productName: "ויטרינת זכוכית מסחרית 200x250", customerName: "רשת חנויות גביש", quantity: 8, status: "planned", priority: "medium", plannedStart: "2026-03-15", plannedEnd: "2026-04-15", productionLine: "קו זכוכית D", department: "ייצור זכוכית", notes: "ויטרינות לרשת חנויות" },
  { orderNumber: "WO-2026-009", productName: "עמוד פלדה H120 — 3 מ'", customerName: "טופז הנדסה אזרחית", quantity: 32, status: "planned", priority: "high", plannedStart: "2026-04-01", plannedEnd: "2026-05-15", productionLine: "קו ברזל B", department: "ייצור ברזל", notes: "קונסטרוקציית פלדה — אולם ספורט" },
  { orderNumber: "WO-2026-010", productName: "חלון אלומיניום דריי-קיפ 80x120", customerName: "אדריכלות גולן ושות'", quantity: 12, status: "in_progress", priority: "medium", plannedStart: "2026-02-20", plannedEnd: "2026-03-15", productionLine: "קו אלומיניום A", department: "ייצור אלומיניום", notes: "חלונות דריי-קיפ למשרדים" },
  { orderNumber: "WO-2026-011", productName: "תריס גלילה אלומיניום 150x150", customerName: "אופק נכסים והשקעות", quantity: 20, status: "planned", priority: "medium", plannedStart: "2026-03-20", plannedEnd: "2026-04-20", productionLine: "קו אלומיניום A", department: "ייצור אלומיניום", notes: "תריסים — בניין משרדים" },
  { orderNumber: "WO-2026-012", productName: "דלת הזזה אלומיניום 200x220", customerName: "גלעד פרויקטים", quantity: 4, status: "planned", priority: "low", plannedStart: "2026-04-01", plannedEnd: "2026-04-30", productionLine: "קו אלומיניום A", department: "ייצור אלומיניום", notes: "דלתות הזזה — בית פרטי" },
  { orderNumber: "WO-2026-013", productName: "מעקה אלומיניום 1 מ\"ל", customerName: "קבוצת אלרם בנייה", quantity: 80, status: "in_progress", priority: "high", plannedStart: "2026-02-05", plannedEnd: "2026-03-25", productionLine: "קו אלומיניום A", department: "ייצור אלומיניום", notes: "מעקות — בניין מגורים 6 קומות" },
  { orderNumber: "WO-2026-014", productName: "קורת פלדה H120 — 6 מ'", customerName: "טופז הנדסה אזרחית", quantity: 18, status: "planned", priority: "high", plannedStart: "2026-04-01", plannedEnd: "2026-05-15", productionLine: "קו ברזל B", department: "ייצור ברזל", notes: "קורות לאולם ספורט — פרויקט משותף עם WO-2026-009" },
  { orderNumber: "WO-2026-015", productName: "שער כניסה ברזל מעוצב 120x200", customerName: "נדל\"ן הגליל בע\"מ", quantity: 3, status: "in_progress", priority: "medium", plannedStart: "2026-02-25", plannedEnd: "2026-03-20", productionLine: "קו ברזל B", department: "ייצור ברזל", notes: "שערי כניסה מעוצבים — פרויקט מגורים" },
];

async function insertWorkOrders(): Promise<number> {
  let inserted = 0;
  for (const wo of WORK_ORDERS_DATA) {
    const result = await pool.query(
      `INSERT INTO production_work_orders (order_number, product_name, customer_name, quantity_planned, status, priority, planned_start, planned_end, production_line, department, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (order_number) DO NOTHING`,
      [wo.orderNumber, wo.productName, wo.customerName, wo.quantity, wo.status, wo.priority, wo.plannedStart, wo.plannedEnd, wo.productionLine, wo.department, wo.notes]
    );
    if ((result.rowCount ?? 0) > 0) inserted++;
  }
  return inserted;
}

async function insertEmployees(employees: EmployeeRecord[]): Promise<number> {
  let inserted = 0;
  for (const emp of employees) {
    const result = await pool.query(
      `INSERT INTO employees (employee_number, first_name, last_name, full_name, id_number, email, phone, mobile_phone, department, job_title, employment_type, start_date, base_salary, gross_salary, net_salary, status, city, country, gender)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (employee_number) DO NOTHING`,
      [emp.employee_number, emp.first_name, emp.last_name, emp.full_name, emp.id_number, emp.email, emp.phone, emp.mobile_phone, emp.department, emp.job_title, emp.employment_type, emp.start_date, emp.base_salary, emp.gross_salary, emp.net_salary, emp.status, emp.city, emp.country, emp.gender]
    );
    if ((result.rowCount ?? 0) > 0) inserted++;
  }
  return inserted;
}

const DEPT_TO_ROLE_SLUG: Record<string, string> = {
  "מנהל":             "executive-manager",
  "כספים":            "accountant",
  "מכירות":           "sales-rep",
  "רכש":              "procurement-manager",
  "מחסן":             "warehouse-worker",
  "תכנון ייצור":       "factory-manager",
  "שליטת איכות":      "factory-manager",
  "ייצור אלומיניום":  "production-worker",
  "ייצור ברזל":       "production-worker",
  "ייצור נירוסטה":    "production-worker",
  "ייצור זכוכית":     "production-worker",
  "ריתוך":            "production-worker",
  "חיתוך CNC":        "production-worker",
  "כיפוף ופרסה":      "production-worker",
  "ציפוי ואנודייזינג":"production-worker",
  "הרכבה":            "production-worker",
  "התקנות":           "production-worker",
  "תחזוקה":           "production-worker",
  "לוגיסטיקה":        "production-worker",
  "אדמיניסטרציה":     "hr-manager",
};

async function insertEmployeeUsers(employees: EmployeeRecord[]): Promise<number> {
  const roles = await pool.query<{ id: number; slug: string }>(`SELECT id, slug FROM platform_roles`);
  const roleMap = new Map<string, number>(roles.rows.map(r => [r.slug, r.id]));

  let created = 0;

  for (const emp of employees) {
    const baseUsername = emp.email.replace(/@.*$/, "").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 30);
    const username = `${baseUsername}_${emp.employee_number.toLowerCase()}`.slice(0, 40);

    const exists = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE employee_number = $1 OR email = $2`,
      [emp.employee_number, emp.email]
    );
    if (exists.rows.length > 0) continue;

    const tempPassword = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPasswordForSeed(tempPassword);

    const userRes = await pool.query<{ id: number }>(
      `INSERT INTO users (username, email, password_hash, full_name, department, job_title, employee_number, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [username, emp.email, passwordHash, emp.full_name, emp.department, emp.job_title, emp.employee_number]
    );

    if ((userRes.rowCount ?? 0) === 0) continue;
    const userId = userRes.rows[0].id;

    const roleSlug = DEPT_TO_ROLE_SLUG[emp.department] ?? "production-worker";
    const roleId = roleMap.get(roleSlug);
    if (roleId) {
      await pool.query(
        `INSERT INTO role_assignments (role_id, user_id, role_name, department, is_primary)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT DO NOTHING`,
        [roleId, String(userId), roleSlug, emp.department]
      );
    }

    created++;
  }
  return created;
}

async function insertSuppliers(): Promise<number> {
  let inserted = 0;
  for (const sup of SUPPLIERS_DATA) {
    const result = await pool.query(
      `INSERT INTO suppliers (supplier_number, supplier_name, contact_person, phone, email, city, country, country_code, currency, category, supply_type, payment_terms, lead_time_days, rating, supplier_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active')
       ON CONFLICT (supplier_number) DO NOTHING`,
      [sup.supplierNumber, sup.supplierName, sup.contactPerson, sup.phone, sup.email, sup.city,
       sup.country, sup.countryCode, sup.currency,
       sup.category, sup.supplyType, sup.paymentTerms, sup.leadTimeDays, sup.rating, sup.supplierType]
    );
    if ((result.rowCount ?? 0) > 0) inserted++;
  }
  return inserted;
}

async function insertMaterials(): Promise<number> {
  let inserted = 0;
  for (const mat of SKUS_DATA) {
    const result = await pool.query(
      `INSERT INTO raw_materials (material_number, material_name, category, unit, standard_price, current_stock, minimum_stock, material_type, finish, width, height, thickness, material_grade, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active')
       ON CONFLICT (material_number) DO NOTHING`,
      [
        mat.sku, mat.materialName, mat.category, mat.unit,
        mat.standardPrice ?? "0", mat.currentStock ?? "0", mat.minimumStock ?? "0",
        mat.materialType ?? null, mat.finish ?? null,
        mat.width ?? null, mat.height ?? null,
        mat.thickness ?? null, mat.materialGrade ?? null,
      ]
    );
    if ((result.rowCount ?? 0) > 0) inserted++;
  }
  return inserted;
}

async function insertWarehouseLayout(): Promise<{ warehouses: number; locations: number }> {
  const WAREHOUSES = [
    { code: "WH-MAIN", name: "מחסן ראשי - חומרי גלם", type: "raw_materials", capacity: 5000 },
    { code: "WH-FG", name: "מחסן מוצרים מוגמרים", type: "finished_goods", capacity: 2000 },
    { code: "WH-ACC", name: "מחסן אביזרים ותוספים", type: "accessories", capacity: 500 },
  ];

  let warehouseCount = 0;
  let locationCount = 0;
  const warehouseIds: number[] = [];

  for (const wh of WAREHOUSES) {
    const existing = await pool.query<{ id: number }>(`SELECT id FROM warehouses WHERE code = $1`, [wh.code]);
    let whId: number;
    if (existing.rows.length > 0) {
      whId = existing.rows[0].id;
    } else {
      const res = await pool.query<{ id: number }>(
        `INSERT INTO warehouses (name, code, warehouse_type, capacity, is_active) VALUES ($1,$2,$3,$4,true) RETURNING id`,
        [wh.name, wh.code, wh.type, wh.capacity]
      );
      whId = res.rows[0].id;
      warehouseCount++;
    }
    warehouseIds.push(whId);
  }

  const ZONES = ["A", "B", "C", "D"];
  const AISLES = ["01", "02", "03", "04", "05"];
  const SHELVES = ["1", "2", "3", "4"];
  const BINS = ["A", "B", "C"];

  for (const whId of warehouseIds) {
    for (const zone of ZONES.slice(0, 2)) {
      for (const aisle of AISLES.slice(0, 3)) {
        for (const shelf of SHELVES.slice(0, 3)) {
          for (const bin of BINS) {
            const locCode = `${zone}${aisle}-${shelf}${bin}`;
            const existing = await pool.query(
              `SELECT id FROM warehouse_locations WHERE warehouse_id = $1 AND location_code = $2`,
              [whId, locCode]
            );
            if (existing.rows.length === 0) {
              await pool.query(
                `INSERT INTO warehouse_locations (warehouse_id, location_code, zone, aisle, shelf, bin, max_weight, is_active)
                 VALUES ($1,$2,$3,$4,$5,$6,500,true)`,
                [whId, locCode, zone, aisle, shelf, bin]
              );
              locationCount++;
            }
          }
        }
      }
    }
  }

  return { warehouses: warehouseCount, locations: locationCount };
}

async function insertPriceLists(): Promise<{ lists: number; items: number }> {
  const PRICE_LISTS = [
    { name: "מחירון קמעונאי 2025", type: "retail", currency: "ILS", markup: 35, isDefault: true },
    { name: "מחירון סיטונאי 2025", type: "wholesale", currency: "ILS", markup: 15, isDefault: false },
    { name: "מחירון קבלנים 2025", type: "contractor", currency: "ILS", markup: 22, isDefault: false },
    { name: "Export Price List 2025", type: "export", currency: "USD", markup: 40, isDefault: false },
  ];

  let listCount = 0;
  let itemCount = 0;

  for (const pl of PRICE_LISTS) {
    const existing = await pool.query(`SELECT id FROM price_lists WHERE name = $1`, [pl.name]);
    let plId: string;
    if (existing.rows.length > 0) {
      plId = existing.rows[0].id;
    } else {
      const res = await pool.query<{ id: string }>(
        `INSERT INTO price_lists (name, price_list_type, currency, markup_percent, is_default, is_active, valid_from)
         VALUES ($1,$2,$3,$4,$5,true,'2025-01-01') RETURNING id`,
        [pl.name, pl.type, pl.currency, pl.markup, pl.isDefault]
      );
      plId = res.rows[0].id;
      listCount++;
    }

    const products = await pool.query<{ id: number; product_number: string }>(
      `SELECT id, product_number FROM products WHERE product_number IN ('DRW-ALU-400','DRW-ALU-500','DRW-IRON-450','DRW-SS-500','DRW-GLASS-500','DRW-ALU-KITCHEN')`
    );

    const basePrices: Record<string, number> = {
      "DRW-ALU-400": 85000, "DRW-ALU-500": 110000, "DRW-IRON-450": 75000,
      "DRW-SS-500": 145000, "DRW-GLASS-500": 195000, "DRW-ALU-KITCHEN": 420000,
    };

    for (const prod of products.rows) {
      const base = basePrices[prod.product_number] ?? 100000;
      const unitPrice = Math.round(base * (1 + pl.markup / 100));

      const alreadyExists = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM price_list_items WHERE price_list_id = $1 AND unit_price = $2`,
        [plId, unitPrice]
      );

      if (parseInt(alreadyExists.rows[0].count) === 0) {
        await pool.query(
          `INSERT INTO price_list_items (price_list_id, unit_price, min_quantity) VALUES ($1,$2,1)`,
          [plId, unitPrice]
        );
        itemCount++;
      }
    }
  }

  return { lists: listCount, items: itemCount };
}

async function insertBOM(): Promise<{ products: number; bom_lines: number }> {
  let prodInserted = 0;
  let bomInserted = 0;

  const skuRows = await pool.query<{ id: number; material_number: string }>(
    `SELECT id, material_number FROM raw_materials WHERE material_number = ANY($1::text[])`,
    [SKUS_DATA.map(m => m.sku)]
  );
  const skuIdMap = new Map<string, number>();
  for (const row of skuRows.rows) {
    skuIdMap.set(row.material_number, row.id);
  }

  const catRows = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM product_categories`
  );
  const catIdMap = new Map<string, number>();
  for (const row of catRows.rows) {
    catIdMap.set(row.name, row.id);
  }

  const firstCat = await pool.query<{ id: number }>(`SELECT id FROM product_categories ORDER BY id LIMIT 1`);
  const fallbackCategoryId = firstCat.rows.length > 0 ? firstCat.rows[0].id : 1;

  for (const prod of BOM_PRODUCTS) {
    const resolvedCategoryId = catIdMap.get(prod.categoryName) ?? fallbackCategoryId;
    const existingProd = await pool.query<{ id: number }>(
      `SELECT id FROM products WHERE product_number = $1`,
      [prod.productNumber]
    );
    let productId: number;
    if (existingProd.rows.length > 0) {
      productId = existingProd.rows[0].id;
    } else {
      const insertedProd = await pool.query<{ id: number }>(
        `INSERT INTO products (product_number, product_name, category_id, description, unit, price_per_sqm_before_vat, materials_cost_per_sqm, material_type, finish_type, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'פעיל')
         RETURNING id`,
        [prod.productNumber, prod.productName, resolvedCategoryId, prod.description, prod.unit, prod.pricePerSqm, prod.materialCostPerSqm, prod.materialType, prod.finishType]
      );
      productId = insertedProd.rows[0].id;
      prodInserted++;
    }

    for (const bom of prod.materials) {
      const matId = skuIdMap.get(bom.skuRef);
      if (!matId) continue;
      const existingLine = await pool.query<{ id: number }>(
        `SELECT id FROM product_materials WHERE product_id = $1 AND material_id = $2`,
        [productId, matId]
      );
      if (existingLine.rows.length > 0) continue;
      const qtyWithWaste = bom.qty * (1 + bom.wastePct / 100);
      const matRows = await pool.query<{ standard_price: string }>(
        `SELECT standard_price FROM raw_materials WHERE id = $1`,
        [matId]
      );
      const unitCost = matRows.rows.length > 0 ? parseFloat(matRows.rows[0].standard_price) : 0;
      const totalCost = unitCost * qtyWithWaste;
      await pool.query(
        `INSERT INTO product_materials (product_id, material_id, quantity_per_sqm, quantity_per_unit, uom, waste_pct, quantity_with_waste, unit_cost, total_cost, total_cost_per_unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [productId, matId, bom.qty, bom.qty, bom.uom, bom.wastePct, qtyWithWaste.toFixed(5), unitCost.toFixed(2), totalCost.toFixed(2), totalCost.toFixed(2)]
      );
      bomInserted++;
    }
  }

  return { products: prodInserted, bom_lines: bomInserted };
}

router.post("/factory-seed/employees", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const existingCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM employees`);
    if (parseInt(existingCount.rows[0].count) >= 150) {
      return res.json({ success: true, message: "עובדים כבר קיימים", count: parseInt(existingCount.rows[0].count) });
    }
    const employees = generateEmployees(200);
    const inserted = await insertEmployees(employees);
    res.json({ success: true, inserted, total: employees.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[factory-seed/employees]", err);
    res.status(500).json({ error: message });
  }
});

router.post("/factory-seed/employee-users", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const empRows = await pool.query<EmployeeRecord>(
      `SELECT employee_number, first_name, last_name, full_name, id_number, email, phone, mobile_phone, department, job_title, employment_type, start_date::text, base_salary::text, gross_salary::text, net_salary::text, status, city, country, gender FROM employees WHERE employee_number LIKE 'EMP%'`
    );
    const created = await insertEmployeeUsers(empRows.rows);
    res.json({ success: true, created, checked: empRows.rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[factory-seed/employee-users]", err);
    res.status(500).json({ error: message });
  }
});

router.post("/factory-seed/suppliers", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const inserted = await insertSuppliers();
    res.json({ success: true, inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[factory-seed/suppliers]", err);
    res.status(500).json({ error: message });
  }
});

router.post("/factory-seed/materials", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const inserted = await insertMaterials();
    res.json({ success: true, inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[factory-seed/materials]", err);
    res.status(500).json({ error: message });
  }
});

router.post("/factory-seed/bom", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const result = await insertBOM();
    res.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[factory-seed/bom]", err);
    res.status(500).json({ error: message });
  }
});

router.post("/factory-seed/warehouse", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const result = await insertWarehouseLayout();
    res.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[factory-seed/warehouse]", err);
    res.status(500).json({ error: message });
  }
});

router.post("/factory-seed/pricelists", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const result = await insertPriceLists();
    res.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[factory-seed/pricelists]", err);
    res.status(500).json({ error: message });
  }
});

router.post("/factory-seed/all", requireSuperAdmin, async (req: Request, res: Response) => {
  if (process.env.ENABLE_SEED !== "true") {
    res.status(403).json({ error: "Seed is disabled by default. Set ENABLE_SEED=true to allow seeding." });
    return;
  }
  try {
    const results: Record<string, number> = {};

    const empCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM employees`);
    let employeeList: EmployeeRecord[];
    if (parseInt(empCount.rows[0].count) < 150) {
      employeeList = generateEmployees(200);
      results.employees_inserted = await insertEmployees(employeeList);
    } else {
      results.employees_existing = parseInt(empCount.rows[0].count);
      const empRows = await pool.query<EmployeeRecord>(
        `SELECT employee_number, first_name, last_name, full_name, id_number, email, phone, mobile_phone, department, job_title, employment_type, start_date::text, base_salary::text, gross_salary::text, net_salary::text, status, city, country, gender FROM employees WHERE employee_number LIKE 'EMP%'`
      );
      employeeList = empRows.rows;
    }

    results.employee_users_created = await insertEmployeeUsers(employeeList);

    results.suppliers_inserted = await insertSuppliers();

    results.customers_inserted = await insertCustomers();

    results.materials_inserted = await insertMaterials();

    const bomResult = await insertBOM();
    results.bom_products = bomResult.products;
    results.bom_lines = bomResult.bom_lines;

    const whResult = await insertWarehouseLayout();
    results.warehouses = whResult.warehouses;
    results.warehouse_locations = whResult.locations;

    const plResult = await insertPriceLists();
    results.price_lists = plResult.lists;
    results.price_list_items = plResult.items;

    results.work_orders_inserted = await insertWorkOrders();

    res.json({ success: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[factory-seed/all]", err);
    res.status(500).json({ error: message });
  }
});

router.get("/factory-seed/status", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const empCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM employees`);
    const empUserCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM users WHERE employee_number LIKE 'EMP%'`);
    const supCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM suppliers`);
    const foreignSupCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM suppliers WHERE country_code != 'IL'`);
    const matCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM raw_materials`);
    const cusCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM customers`);
    const prodCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM products`);
    const bomCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM product_materials`);
    const whCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM warehouses WHERE code LIKE 'WH-%'`);
    const locCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM warehouse_locations`);
    const plCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM price_lists`);
    const woCount = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM production_work_orders`);
    res.json({
      employees: parseInt(empCount.rows[0].count),
      employee_users: parseInt(empUserCount.rows[0].count),
      suppliers: parseInt(supCount.rows[0].count),
      foreign_suppliers: parseInt(foreignSupCount.rows[0].count),
      customers: parseInt(cusCount.rows[0].count),
      materials: parseInt(matCount.rows[0].count),
      bom_products: parseInt(prodCount.rows[0].count),
      bom_lines: parseInt(bomCount.rows[0].count),
      warehouses: parseInt(whCount.rows[0].count),
      warehouse_locations: parseInt(locCount.rows[0].count),
      price_lists: parseInt(plCount.rows[0].count),
      work_orders: parseInt(woCount.rows[0].count),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
