export const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: "הבקשה שגויה — אנא בדקו את הנתונים שהוזנו",
  401: "נדרשת התחברות מחדש למערכת",
  403: "אין לכם הרשאה לבצע פעולה זו",
  404: "המשאב המבוקש לא נמצא",
  408: "הבקשה פגה תוקף — נסו שוב",
  409: "קיים קונפליקט בנתונים — ייתכן שהרשומה כבר קיימת",
  422: "הנתונים שהוזנו אינם תקינים",
  429: "יותר מדי בקשות — אנא המתינו מספר שניות",
  500: "שגיאת שרת פנימית — אנא נסו שוב מאוחר יותר",
  502: "השרת אינו זמין כעת",
  503: "השירות אינו זמין כרגע",
};

export function hebrewApiError(status: number, fallback?: string): string {
  return HTTP_ERROR_MESSAGES[status] || fallback || "שגיאה לא צפויה";
}

export async function handleApiResponse<T = unknown>(
  res: Response,
  fallback?: string
): Promise<T> {
  if (!res.ok) {
    const msg = hebrewApiError(res.status, fallback);
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return res.json() as Promise<T>;
}
