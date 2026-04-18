// K-02: Hebrew Translation Dictionary
export const HebrewStrings = {
  // Common Actions
  "Save": "שמור",
  "Edit": "ערוך",
  "Delete": "מחק",
  "Add": "הוסף",
  "Cancel": "ביטול",
  "Close": "סגור",
  "Search": "חיפוש",
  "Filter": "סנן",
  "Export": "ייצא",
  "Import": "יבא",
  "Download": "הורד",
  "Upload": "העלה",
  "Submit": "שלח",
  "Confirm": "אישור",
  "Copy": "העתק",
  "View": "צפה",
  "View Details": "צפה בפרטים",
  "Duplicate": "שכפול",
  "Back": "חזור",
  "Next": "הבא",
  "Previous": "הקודם",
  "Loading": "טוען...",
  "Save & Close": "שמור וסגור",
  
  // Form Fields
  "Auto-generated": "נוצר אוטומטית",
  "Contact Person": "איש קשר",
  "Phone": "טלפון",
  "Mobile": "נייד",
  "Email": "אימייל",
  "Website": "אתר",
  "LinkedIn": "לינקדאין",
  "Code": "קוד",
  "Name": "שם",
  "Description": "תיאור",
  "Status": "סטטוס",
  "Date": "תאריך",
  "Amount": "סכום",
  "Total": "סה״כ",
  "Quantity": "כמות",
  "Unit": "יחידה",
  "Price": "מחיר",
  "Discount": "הנחה",
  "VAT": "מע״מ",
  
  // Placeholders
  "Search by name...": "חיפוש לפי שם...",
  "Search by order number...": "חיפוש לפי מספר הזמנה...",
  "Search by supplier...": "חיפוש לפי ספק...",
  "Enter text...": "הזן טקסט...",
  "Select an option": "בחר אפשרות",
  "Comma-separated tags": "תגים מופרדים בפסיק",
  "e.g., Premium, Standard": "לדוגמה: פרימיום, סטנדרט",
  "INV-YYYY-NNNNN": "חש-YYYY-NNNNN",
  "PO-001": "הז-001",
  "cc@example.com": "cc@example.com",
  
  // Status Messages
  "Loading...": "טוען...",
  "No data available": "אין נתונים זמינים",
  "Error loading data": "שגיאה בטעינת הנתונים",
  "Success": "הצלחה",
  "Error": "שגיאה",
  "Warning": "אזהרה",
  "Info": "מידע",
  
  // Dialog Labels
  "Are you sure?": "האם אתה בטוח?",
  "Confirm Delete": "אישור מחיקה",
  "Confirm Action": "אישור פעולה",
  "This action cannot be undone": "לא ניתן לבטל פעולה זו",
  
  // Table Headers
  "Actions": "פעולות",
  "Type": "סוג",
  "Created": "נוצר",
  "Modified": "שונה",
  "Created By": "נוצר על ידי",
} as const;

// Helper function to translate strings
export function t(key: keyof typeof HebrewStrings): string {
  return HebrewStrings[key] || key;
}
