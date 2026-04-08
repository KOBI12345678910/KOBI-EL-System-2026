// K-02: Complete Hebrew Translation Dictionary
// Comprehensive coverage for all UI strings

export const HebrewUI = {
  // Navigation & Menus
  "Dashboard": "דשבורד",
  "Settings": "הגדרות",
  "Logout": "התנתק",
  "Menu": "תפריט",
  "Home": "בית",
  "Back": "חזור",
  "Next": "הבא",
  "Previous": "הקודם",
  "Close": "סגור",
  
  // Common Actions
  "Save": "שמור",
  "Edit": "ערוך",
  "Delete": "מחק",
  "Add": "הוסף",
  "Cancel": "ביטול",
  "Submit": "שלח",
  "Search": "חיפוש",
  "Filter": "סנן",
  "Export": "ייצא",
  "Import": "יבא",
  "Download": "הורד",
  "Upload": "העלה",
  "Copy": "העתק",
  "View": "צפה",
  "Details": "פרטים",
  "Actions": "פעולות",
  
  // Form Fields
  "Name": "שם",
  "Email": "אימייל",
  "Phone": "טלפון",
  "Mobile": "נייד",
  "Address": "כתובת",
  "City": "עיר",
  "Country": "מדינה",
  "Company": "חברה",
  "Description": "תיאור",
  "Notes": "הערות",
  "Status": "סטטוס",
  "Date": "תאריך",
  "Time": "זמן",
  "Amount": "סכום",
  "Price": "מחיר",
  "Quantity": "כמות",
  "Total": "סה״כ",
  "Subtotal": "סכום חלקי",
  "Tax": "מס",
  "Discount": "הנחה",
  "Percentage": "אחוז",
  
  // Currency & Finance
  "Currency": "מטבע",
  "ILS": "שקל ישראלי",
  "USD": "דולר אמריקאי",
  "EUR": "יורו",
  "VAT": "מע״מ",
  "Invoice": "חשבונית",
  "Order": "הזמנה",
  "Payment": "תשלום",
  "Balance": "יתרה",
  "Credit": "אשראי",
  "Debit": "חובה",
  
  // Success/Error Messages
  "Success": "הצלחה",
  "Error": "שגיאה",
  "Warning": "אזהרה",
  "Info": "מידע",
  "Saved successfully": "נשמר בהצלחה",
  "Deleted successfully": "נמחק בהצלחה",
  "Updated successfully": "עודכן בהצלחה",
  "Failed to save": "שמירה נכשלה",
  "Failed to delete": "מחיקה נכשלה",
  "Are you sure?": "האם אתה בטוח?",
  "Confirm delete": "אישור מחיקה",
  "This cannot be undone": "לא ניתן לבטל פעולה זו",
  
  // Loading & Status
  "Loading": "טוען",
  "Loading...": "טוען...",
  "Loading data": "טוען נתונים",
  "Please wait": "אנא המתן",
  "No data": "אין נתונים",
  "No results": "אין תוצאות",
  "Empty": "ריק",
  
  // Table Headers
  "ID": "מזהה",
  "Created": "נוצר",
  "Modified": "שונה",
  "Created By": "נוצר על ידי",
  "Modified By": "שונה על ידי",
  "Type": "סוג",
  "Category": "קטגוריה",
  "Status": "סטטוס",
  "Action": "פעולה",
  "Active": "פעיל",
  "Inactive": "לא פעיל",
  
  // Pages
  "Invoices": "חשבוניות",
  "Orders": "הזמנות",
  "Customers": "לקוחות",
  "Suppliers": "ספקים",
  "Products": "מוצרים",
  "Employees": "עובדים",
  "Reports": "דוחות",
  "Analytics": "ניתוחים",
  
  // Hebrew-specific
  "בעברית": "בעברית",
  "החברה": "החברה",
  "הזמנה": "הזמנה",
  "הזמנות": "הזמנות",
  "סטטוס": "סטטוס",
  "פעיל": "פעיל",
  "לא פעיל": "לא פעיל",
} as const;

export function t(key: keyof typeof HebrewUI): string {
  return HebrewUI[key] || key;
}

// Currency formatter with Hebrew locale
export function formatCurrency(amount: number, currency: string = "ILS"): string {
  const symbols: Record<string, string> = {
    ILS: "₪",
    USD: "$",
    EUR: "€",
  };
  
  const symbol = symbols[currency] || currency;
  const formatted = amount.toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return `${symbol}${formatted}`;
}

// Date formatter with Hebrew locale
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Time formatter
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// DateTime formatter
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
