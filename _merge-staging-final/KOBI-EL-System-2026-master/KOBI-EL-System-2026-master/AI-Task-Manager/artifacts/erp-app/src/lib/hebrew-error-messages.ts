export const hebrewErrorMessages: Record<number | string, string> = {
  // 2xx Success
  200: "בקשה הושלמה בהצלחה",
  201: "רשומה חדשה נוצרה בהצלחה",
  204: "הבקשה הושלמה (ללא תוכן)",

  // 3xx Redirection
  300: "בחר בין אפשרויות מרובות",
  301: "הדף הועבר לצמיתות",
  302: "הדף הועבר זמנית",
  304: "הנתונים לא השתנו",

  // 4xx Client Errors
  400: "בקשה לא תקינה - בדוק את הקלט שלך",
  401: "אתה לא מחובר - אנא התחבר מחדש",
  402: "דרוש תשלום",
  403: "אתה אינך מורשה לגשת לרשומה זו",
  404: "הרשומה לא נמצאה",
  405: "שיטה זו אינה מותרת",
  408: "הבקשה קבעה זמן מהיר",
  409: "סכסוך בנתונים - הרשומה כבר קיימת או נמחקה",
  410: "הרשומה נמחקה",
  422: "לא ניתן לעבד את הנתונים - בדוק את השדות",
  429: "יותר מדי בקשות - נסה שוב מאוחר",

  // 5xx Server Errors
  500: "שגיאה בשרת - אנא נסה שוב",
  501: "שירות זה לא זמין",
  502: "שגיאת Gateway - נסה שוב",
  503: "השרת לא זמין כרגע",
  504: "timeout של השרת",

  // Common API errors
  "INVALID_CREDENTIALS": "שם משתמש או סיסמה לא נכונים",
  "TOKEN_EXPIRED": "ההרשאה שלך פקעה - אנא התחבר מחדש",
  "PERMISSION_DENIED": "אתה אינך מורשה לביצוע פעולה זו",
  "RECORD_NOT_FOUND": "הרשומה לא נמצאה",
  "DUPLICATE_ENTRY": "רשומה זו כבר קיימת",
  "VALIDATION_ERROR": "נתונים לא תקינים",
  "NETWORK_ERROR": "שגיאת רשת - בדוק את התקשורת שלך",
  "TIMEOUT": "הזמן לביצוע הבקשה פקע - נסה שוב",
  "UNKNOWN_ERROR": "שגיאה לא ידועה",

  // Entity-specific errors
  "WORK_ORDER_NOT_FOUND": "הוראת העבודה לא נמצאה",
  "CUSTOMER_NOT_FOUND": "הלקוח לא נמצא",
  "INVENTORY_LOW": "מלאי חומרים נמוך מדי",
  "INVOICE_ALREADY_PAID": "החשבונית שולמה כבר",
  "QUOTE_EXPIRED": "ההצעה פקעה - אנא צור הצעה חדשה",
  "EMPLOYEE_NOT_FOUND": "העובד לא נמצא",

  // Form validation
  "REQUIRED_FIELD": "שדה זה הוא חובה",
  "INVALID_EMAIL": "כתובת דוא״ל לא תקינה",
  "INVALID_PHONE": "מספר טלפון לא תקין",
  "INVALID_DATE": "תאריך לא תקין",
  "INVALID_AMOUNT": "סכום לא תקין",
  "PASSWORD_WEAK": "הסיסמה חלשה מדי - השתמש בתו גדול, קטן, ספרה וסמל",
  "PASSWORD_MISMATCH": "הסיסמאות לא תואמות",
};

export function getHebrewErrorMessage(errorCode: number | string): string {
  if (typeof errorCode === "number") {
    if (errorCode >= 500) return hebrewErrorMessages[500];
    if (errorCode >= 400) return hebrewErrorMessages[errorCode] || hebrewErrorMessages[400];
    if (errorCode >= 300) return hebrewErrorMessages[errorCode] || "הבקשה הועברה";
    if (errorCode >= 200) return hebrewErrorMessages[errorCode] || "בקשה הושלמה";
  }
  
  return hebrewErrorMessages[errorCode] || hebrewErrorMessages["UNKNOWN_ERROR"];
}

export function formatErrorMessage(error: any): string {
  if (!error) return hebrewErrorMessages["UNKNOWN_ERROR"];
  
  // Status code
  if (error.status || error.statusCode) {
    return getHebrewErrorMessage(error.status || error.statusCode);
  }
  
  // Error code/type
  if (error.code) {
    return getHebrewErrorMessage(error.code);
  }
  
  // Message field
  if (error.message) {
    const msg = error.message.toLowerCase();
    if (msg.includes("unauthorized") || msg.includes("401")) return hebrewErrorMessages["INVALID_CREDENTIALS"];
    if (msg.includes("forbidden") || msg.includes("403")) return hebrewErrorMessages["PERMISSION_DENIED"];
    if (msg.includes("not found") || msg.includes("404")) return hebrewErrorMessages["RECORD_NOT_FOUND"];
    if (msg.includes("timeout")) return hebrewErrorMessages["TIMEOUT"];
    if (msg.includes("network")) return hebrewErrorMessages["NETWORK_ERROR"];
  }
  
  return hebrewErrorMessages["UNKNOWN_ERROR"];
}
