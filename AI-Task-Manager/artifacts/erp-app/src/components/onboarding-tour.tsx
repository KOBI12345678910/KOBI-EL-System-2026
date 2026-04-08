import { useEffect, useCallback } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from "@/hooks/use-auth";

const TOUR_VERSION = "v1";

function getTourKey(userId: string): string {
  return `erp_onboarding_done_${TOUR_VERSION}_${userId}`;
}

function isTourDone(userId: string): boolean {
  try {
    return localStorage.getItem(getTourKey(userId)) === "true";
  } catch {
    return false;
  }
}

function markTourDone(userId: string): void {
  try {
    localStorage.setItem(getTourKey(userId), "true");
  } catch {
    /* noop */
  }
}

function clearTourDone(userId: string): void {
  try {
    localStorage.removeItem(getTourKey(userId));
  } catch {
    /* noop */
  }
}

const ADMIN_STEPS = [
  {
    popover: {
      title: "ברוכים הבאים למערכת ERP",
      description: "מערכת ניהול ארגונית מתקדמת לניהול כל תחומי הפעילות העסקית. נסייר יחד בתפקידים המרכזיים.",
    },
  },
  {
    element: "[data-tour='sidebar']",
    popover: {
      title: "תפריט ניווט ראשי",
      description: "בצד ימין תמצאו את תפריט הניווט. ניתן לגשת לכל המודולים: CRM, ייצור, כספים, משאבי אנוש ועוד.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='dashboard']",
    popover: {
      title: "לוח הבקרה",
      description: "דשבורד הנהלה מציג נתוני KPI בזמן אמת — מכירות, ייצור, מלאי ועוד. ניתן להתאים אותו לצרכים שלכם.",
      side: "bottom" as const,
    },
  },
  {
    element: "[data-tour='finance']",
    popover: {
      title: 'מודול כספים ומע"מ',
      description: 'מנוע החשבונאות הישראלי מחשב מע"מ בשיעור 17%, מייצר חשבוניות, מנהל חובות וזכאויות.',
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='hr']",
    popover: {
      title: "משאבי אנוש",
      description: "נהלו עובדים, שכר, נוכחות, חופשות וגיוס — כל מחזור חיי העובד במקום אחד.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='production']",
    popover: {
      title: "ניהול ייצור",
      description: "מעקב אחר הזמנות עבודה, בקרת איכות, ניהול מכונות ומשאבים — כל מחזור הייצור.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='crm']",
    popover: {
      title: "CRM ולקוחות",
      description: "נהלו לידים, הצעות מחיר, חשבוניות ולקוחות. המערכת כוללת ניתוח AI לחיזוי מכירות.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='inventory']",
    popover: {
      title: "מלאי ורכש",
      description: "ניהול מלאי בזמן אמת, הזמנות רכש, ספקים ונקודות הזמנה מחדש.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='search']",
    popover: {
      title: "חיפוש גלובלי",
      description: "חיפוש מהיר בכל הנתונים, מסמכים ורשומות בתוך המערכת.",
      side: "bottom" as const,
    },
  },
  {
    element: "[data-tour='notifications']",
    popover: {
      title: "התראות ועדכונים",
      description: "קבלו התראות בזמן אמת על אירועים חשובים: אישורים, מועדים, התראות מלאי ועוד.",
      side: "bottom" as const,
    },
  },
  {
    element: "[data-tour='settings']",
    popover: {
      title: "הגדרות ואדמין",
      description: "כמנהל מערכת, הגדירו תפקידים, הרשאות גישה ומדיניות אבטחה לכל משתמש.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='version']",
    popover: {
      title: "מוכנים לעבודה!",
      description: 'מערכת ERP v1.0.0 · מע"מ 17% · מוכנה לשימוש. בהצלחה! ניתן להפעיל את הסיור מחדש מהגדרות.',
      side: "top" as const,
    },
  },
];

const EMPLOYEE_STEPS = [
  {
    popover: {
      title: "ברוכים הבאים למערכת ERP",
      description: "מערכת ניהול ארגונית. נסייר יחד בתפקידים הרלוונטיים לתפקידכם.",
    },
  },
  {
    element: "[data-tour='sidebar']",
    popover: {
      title: "תפריט ניווט",
      description: "בצד ימין תמצאו את התפריט לגישה למודולים הרלוונטיים לתפקידכם.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='dashboard']",
    popover: {
      title: "לוח הבקרה",
      description: "דשבורד מציג את המשימות, הפעילות ונתוני KPI הרלוונטיים לכם.",
      side: "bottom" as const,
    },
  },
  {
    element: "[data-tour='notifications']",
    popover: {
      title: "התראות",
      description: "כאן תקבלו התראות על משימות, אישורים ועדכונים חשובים.",
      side: "bottom" as const,
    },
  },
  {
    popover: {
      title: "מוכנים לעבודה!",
      description: "אתם מוכנים להתחיל. ניתן להפעיל את הסיור מחדש מהגדרות. בהצלחה!",
    },
  },
];

function getUserId(user: Record<string, unknown>): string {
  const id = user["id"] ?? user["userId"] ?? user["username"];
  return id != null ? String(id) : "unknown";
}

function getUserRole(user: Record<string, unknown>): string {
  const role = user["role"];
  if (typeof role === "string") return role;
  const isSuperAdmin = user["isSuperAdmin"];
  if (isSuperAdmin === true) return "super_admin";
  return "employee";
}

export function OnboardingTour() {
  const { user } = useAuth();

  const startTour = useCallback(() => {
    if (!user) return;
    const userId = getUserId(user);
    const role = getUserRole(user);
    const isAdmin = role === "admin" || role === "super_admin";
    const steps = isAdmin ? ADMIN_STEPS : EMPLOYEE_STEPS;

    const driverObj = driver({
      showProgress: true,
      progressText: "{{current}} מתוך {{total}}",
      nextBtnText: "הבא ←",
      prevBtnText: "→ הקודם",
      doneBtnText: "סיום",
      showButtons: ["next", "previous", "close"],
      animate: true,
      allowClose: true,
      overlayOpacity: 0.6,
      popoverClass: "erp-tour-popover",
      steps: steps,
      onDestroyStarted: () => {
        markTourDone(userId);
        driverObj.destroy();
      },
    });

    driverObj.drive();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const userId = getUserId(user);
    if (isTourDone(userId)) return;
    const timer = setTimeout(startTour, 1500);
    return () => clearTimeout(timer);
  }, [user, startTour]);

  return null;
}

export function useRestartTour() {
  const { user } = useAuth();
  return () => {
    if (user) {
      clearTourDone(getUserId(user));
    }
    window.location.reload();
  };
}
