export function getHebrewErrorMessage(error: any, defaultMessage: string = "אירעה שגיאה, נסה שנית"): string {
  if (!error) return defaultMessage;
  
  const message = error?.message || String(error);
  
  // Map common error patterns to Hebrew
  if (message.includes("UNIQUE constraint failed") || message.includes("duplicate key")) {
    return "רשומה זו כבר קיימת במערכת";
  }
  if (message.includes("FOREIGN KEY constraint failed") || message.includes("violates foreign key")) {
    return "לא ניתן למחוק רשומה זו מכיוון שהיא מקושרת לנתונים אחרים";
  }
  if (message.includes("NOT NULL constraint failed") || message.includes("violates not-null")) {
    return "שדה חובה חסר";
  }
  if (message.includes("timeout") || message.includes("connection refused")) {
    return "שגיאת התחברות לבסיס הנתונים, נסה שנית";
  }
  if (message.includes("syntax") || message.includes("parse")) {
    return "שגיאה בעיבוד הנתונים";
  }
  if (message.includes("permission") || message.includes("denied")) {
    return "אין לך הרשאה לבצע פעולה זו";
  }
  if (message.includes("not found")) {
    return "הרשומה לא נמצאה";
  }
  
  // Default to generic error for unknown issues
  return defaultMessage;
}

export function handleApiError(res: any, error: any, statusCode: number = 500, customMessage?: string) {
  console.error("API Error:", error);
  const message = customMessage || getHebrewErrorMessage(error);
  res.status(statusCode).json({ error: message });
}
