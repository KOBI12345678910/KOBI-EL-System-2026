import { db } from "./index";
import { 
  departmentsTable, shiftsTable, attendanceTable, 
  employeesTable, usersTable, customersTable, 
  suppliersTable, inventoryTable, invoicesTable,
  purchaseOrdersTable, payrollRecordsTable
} from "./schema";
import { eq } from "drizzle-orm";

const seed = async () => {
  console.log("🌱 Starting database seed...");

  try {
    // 1. Create 8 departments
    const departments = [
      { name: "ניהול", nameHe: "ניהול", code: "MGT" },
      { name: "ייצור", nameHe: "ייצור", code: "PROD" },
      { name: "מכירות", nameHe: "מכירות", code: "SALES" },
      { name: "HR", nameHe: "משאבי אנוש", code: "HR" },
      { name: "לוגיסטיקה", nameHe: "לוגיסטיקה", code: "LOG" },
      { name: "QC", nameHe: "בקרת איכות", code: "QC" },
      { name: "הנדסה", nameHe: "הנדסה", code: "ENG" },
      { name: "חשבונות", nameHe: "חשבונות", code: "ACC" },
    ];

    await db.insert(departmentsTable).values(departments).onConflictDoNothing();
    console.log("✓ 8 departments created");

    // 2. Create admin user
    const adminUser = {
      username: "admin",
      email: "admin@technokoluzi.com",
      passwordHash: "hashed_password_placeholder",
      fullName: "Administrator",
      fullNameHe: "מנהל מערכת",
      phone: "0527957599",
      isActive: true,
      isSuperAdmin: true,
      employmentType: "full_time",
      weeklyHours: 42,
      salary: 15000,
      salaryCurrency: "ILS",
      payFrequency: "monthly",
      hireDate: new Date("2020-01-01"),
      vacationDaysAnnual: 12,
      vacationDaysBalance: 12,
      sickDaysAnnual: 18,
      sickDaysBalance: 18,
      workLocation: "מפעל ראשי",
      shift: "בוקר",
    };

    await db.insert(usersTable).values(adminUser).onConflictDoNothing();
    console.log("✓ Admin user created");

    // 3. Create 10 employees
    const employees = [
      {
        employeeNumber: "E001",
        firstName: "דימה",
        lastName: "גרדוס",
        fullName: "דימה גרדוס",
        department: "ניהול",
        jobTitle: "מנהל",
        email: "dima@technokoluzi.com",
        phone: "0527957599",
        startDate: new Date("2020-01-01"),
        baseSalary: 15000,
        status: "active",
      },
      {
        employeeNumber: "E002",
        firstName: "עוזי",
        lastName: "כהן",
        fullName: "עוזי כהן",
        department: "ייצור",
        jobTitle: "מפקח ייצור",
        email: "uzi@technokoluzi.com",
        phone: "0527957500",
        startDate: new Date("2020-02-01"),
        baseSalary: 8000,
        status: "active",
      },
      {
        employeeNumber: "E003",
        firstName: "יוסי",
        lastName: "לוי",
        fullName: "יוסי לוי",
        department: "מכירות",
        jobTitle: "מנהל מכירות",
        email: "yossi@technokoluzi.com",
        phone: "0527957501",
        startDate: new Date("2020-03-01"),
        baseSalary: 10000,
        status: "active",
      },
      {
        employeeNumber: "E004",
        firstName: "שרה",
        lastName: "שלום",
        fullName: "שרה שלום",
        department: "HR",
        jobTitle: "מנהלת משאבי אנוש",
        email: "sara@technokoluzi.com",
        phone: "0527957502",
        startDate: new Date("2021-01-01"),
        baseSalary: 9000,
        status: "active",
      },
      {
        employeeNumber: "E005",
        firstName: "מנשה",
        lastName: "כהן",
        fullName: "מנשה כהן",
        department: "ייצור",
        jobTitle: "עובד ייצור",
        email: "menashe@technokoluzi.com",
        phone: "0527957503",
        startDate: new Date("2021-06-01"),
        baseSalary: 5500,
        status: "active",
      },
      {
        employeeNumber: "E006",
        firstName: "אלן",
        lastName: "רוזנפלד",
        fullName: "אלן רוזנפלד",
        department: "ייצור",
        jobTitle: "עובד ייצור",
        email: "alen@technokoluzi.com",
        phone: "0527957504",
        startDate: new Date("2021-07-01"),
        baseSalary: 5500,
        status: "active",
      },
      {
        employeeNumber: "E007",
        firstName: "דוד",
        lastName: "ישראל",
        fullName: "דוד ישראל",
        department: "לוגיסטיקה",
        jobTitle: "עובד לוגיסטיקה",
        email: "david@technokoluzi.com",
        phone: "0527957505",
        startDate: new Date("2021-08-01"),
        baseSalary: 5800,
        status: "active",
      },
      {
        employeeNumber: "E008",
        firstName: "רחל",
        lastName: "לבנון",
        fullName: "רחל לבנון",
        department: "QC",
        jobTitle: "בודק איכות",
        email: "rachel@technokoluzi.com",
        phone: "0527957506",
        startDate: new Date("2021-09-01"),
        baseSalary: 6500,
        status: "active",
      },
      {
        employeeNumber: "E009",
        firstName: "מיכאל",
        lastName: "גולדברג",
        fullName: "מיכאל גולדברג",
        department: "הנדסה",
        jobTitle: "מהנדס",
        email: "michael@technokoluzi.com",
        phone: "0527957507",
        startDate: new Date("2021-10-01"),
        baseSalary: 12000,
        status: "active",
      },
      {
        employeeNumber: "E010",
        firstName: "רחלה",
        lastName: "מילר",
        fullName: "רחלה מילר",
        department: "חשבונות",
        jobTitle: "חשבת",
        email: "rachela@technokoluzi.com",
        phone: "0527957508",
        startDate: new Date("2021-11-01"),
        baseSalary: 7500,
        status: "active",
      },
    ];

    await db.insert(employeesTable).values(employees).onConflictDoNothing();
    console.log("✓ 10 employees created");

    // 4. Create 5 customers
    const customers = [
      {
        customerNumber: "C001",
        customerName: "חברת ניהול פרויקטים הראל",
        contactPerson: "משה אברהם",
        email: "contact@harel.co.il",
        phone: "0548888888",
        city: "תל אביב",
        country: "Israel",
        taxId: "5001234567",
        creditLimit: 50000,
        creditTermsDays: 30,
        status: "active",
      },
      {
        customerNumber: "C002",
        customerName: "בנייה ודיור בע\"מ",
        contactPerson: "דן כהן",
        email: "info@building.co.il",
        phone: "0548888889",
        city: "ירושלים",
        country: "Israel",
        taxId: "5001234568",
        creditLimit: 75000,
        creditTermsDays: 45,
        status: "active",
      },
      {
        customerNumber: "C003",
        customerName: "התאחדות מסגרות ישראל",
        contactPerson: "יציק לוי",
        email: "sales@frames-israel.co.il",
        phone: "0548888890",
        city: "בני ברק",
        country: "Israel",
        taxId: "5001234569",
        creditLimit: 100000,
        creditTermsDays: 60,
        status: "active",
      },
      {
        customerNumber: "C004",
        customerName: "מטלייה וזכוכית אלפא",
        contactPerson: "שלום שחר",
        email: "contact@alpha-glass.co.il",
        phone: "0548888891",
        city: "אשדוד",
        country: "Israel",
        taxId: "5001234570",
        creditLimit: 60000,
        creditTermsDays: 30,
        status: "active",
      },
      {
        customerNumber: "C005",
        customerName: "עפר בנייה וקבלן ראשי",
        contactPerson: "ראובן דוד",
        email: "office@efer-build.co.il",
        phone: "0548888892",
        city: "רמלה",
        country: "Israel",
        taxId: "5001234571",
        creditLimit: 120000,
        creditTermsDays: 60,
        status: "active",
      },
    ];

    await db.insert(customersTable).values(customers).onConflictDoNothing();
    console.log("✓ 5 customers created");

    // 5. Create 20 inventory items
    const inventoryItems = [
      { itemCode: "FRAME-AL-40x60", name: "מסגרת אלומיניום 40x60", category: "מסגרות", unit: "יח'", quantityOnHand: 100, costPrice: 250, sellingPrice: 400 },
      { itemCode: "FRAME-AL-50x70", name: "מסגרת אלומיניום 50x70", category: "מסגרות", unit: "יח'", quantityOnHand: 85, costPrice: 300, sellingPrice: 480 },
      { itemCode: "FRAME-AL-60x80", name: "מסגרת אלומיניום 60x80", category: "מסגרות", unit: "יח'", quantityOnHand: 70, costPrice: 350, sellingPrice: 560 },
      { itemCode: "GLASS-CLEAR-4MM", name: "זכוכית שקופה 4ממ", category: "זכוכית", unit: "מ\"ר", quantityOnHand: 500, costPrice: 150, sellingPrice: 250 },
      { itemCode: "GLASS-TINTED-4MM", name: "זכוכית צבועה 4ממ", category: "זכוכית", unit: "מ\"ר", quantityOnHand: 300, costPrice: 200, sellingPrice: 350 },
      { itemCode: "GLASS-DOUBLE-6MM", name: "זכוכית דופלקס 6ממ", category: "זכוכית", unit: "מ\"ר", quantityOnHand: 200, costPrice: 400, sellingPrice: 650 },
      { itemCode: "SEAL-RUBBER-1M", name: "אטם גומי מטר", category: "חומרי גלם", unit: "מ'", quantityOnHand: 1000, costPrice: 15, sellingPrice: 30 },
      { itemCode: "SILICONE-CLEAR-1L", name: "סיליקון שקוף 1 ליטר", category: "חומרי גלם", unit: "ל'", quantityOnHand: 150, costPrice: 80, sellingPrice: 150 },
      { itemCode: "FASTENER-SCREW-M6", name: "ברגים M6", category: "חומרי גלם", unit: "קופסה", quantityOnHand: 5000, costPrice: 20, sellingPrice: 40 },
      { itemCode: "FASTENER-BOLT-M8", name: "בורגים M8", category: "חומרי גלם", unit: "קופסה", quantityOnHand: 3000, costPrice: 30, sellingPrice: 60 },
      { itemCode: "PAINT-WHITE-1L", name: "צבע לבן 1 ליטר", category: "צבעים", unit: "ל'", quantityOnHand: 200, costPrice: 120, sellingPrice: 200 },
      { itemCode: "PAINT-GREY-1L", name: "צבע אפור 1 ליטר", category: "צבעים", unit: "ל'", quantityOnHand: 150, costPrice: 120, sellingPrice: 200 },
      { itemCode: "BRUSH-LARGE", name: "מברשת גדולה", category: "כלים", unit: "יח'", quantityOnHand: 50, costPrice: 25, sellingPrice: 50 },
      { itemCode: "ROLLER-FRAME", name: "תפסן מרולר", category: "כלים", unit: "יח'", quantityOnHand: 80, costPrice: 35, sellingPrice: 70 },
      { itemCode: "GLOVES-WORK-S", name: "כפפות עבודה גודל S", category: "בטיחות", unit: "זוג", quantityOnHand: 500, costPrice: 10, sellingPrice: 20 },
      { itemCode: "GLOVES-WORK-L", name: "כפפות עבודה גודל L", category: "בטיחות", unit: "זוג", quantityOnHand: 600, costPrice: 10, sellingPrice: 20 },
      { itemCode: "MASK-DUST-N95", name: "מסכת אבק N95", category: "בטיחות", unit: "קופסה", quantityOnHand: 300, costPrice: 40, sellingPrice: 80 },
      { itemCode: "SAFETY-GLASSES", name: "משקפי בטיחות", category: "בטיחות", unit: "יח'", quantityOnHand: 200, costPrice: 30, sellingPrice: 60 },
      { itemCode: "LADDER-5STEP", name: "סולם 5 שלבים", category: "ציוד", unit: "יח'", quantityOnHand: 20, costPrice: 300, sellingPrice: 600 },
      { itemCode: "WORKBENCH-METAL", name: "שולחן עבודה מתכת", category: "ציוד", unit: "יח'", quantityOnHand: 10, costPrice: 800, sellingPrice: 1500 },
    ];

    await db.insert(inventoryTable).values(inventoryItems).onConflictDoNothing();
    console.log("✓ 20 inventory items created");

    console.log("🎉 Database seed completed successfully!");
  } catch (error) {
    console.error("❌ Seed error:", error);
    throw error;
  }
};

seed().catch(console.error);
