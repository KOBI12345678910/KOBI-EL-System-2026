/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  i18n.js — Lightweight Bilingual Helper (Hebrew ↔ English)              ║
 * ║  Techno-Kol Uzi ERP 2026                                                 ║
 * ║                                                                          ║
 * ║  Default language: he-IL. Switch to English with ?lang=en in the URL,   ║
 * ║  localStorage.setItem('lang','en'), or window.I18N_LANG = 'en'.         ║
 * ║                                                                          ║
 * ║  Zero-dependency ES module. Import from any project:                    ║
 * ║      import { t, formatCurrency, formatDate,                            ║
 * ║               formatNumber, formatHours } from './lib/i18n.js';         ║
 * ║                                                                          ║
 * ║  Author: Agent-30 · read-only A11y audit                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. LANGUAGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_LANG = 'he';
const SUPPORTED = ['he', 'en'];

function detectLang() {
  // Priority: window.I18N_LANG > URL param > localStorage > default.
  if (typeof window === 'undefined') return DEFAULT_LANG;

  if (window.I18N_LANG && SUPPORTED.includes(window.I18N_LANG)) {
    return window.I18N_LANG;
  }

  try {
    const url = new URL(window.location.href);
    const qp = url.searchParams.get('lang');
    if (qp && SUPPORTED.includes(qp)) {
      try {
        window.localStorage.setItem('lang', qp);
      } catch (_) {
        /* ignore quota / private mode */
      }
      return qp;
    }
  } catch (_) {
    /* non-browser or invalid URL */
  }

  try {
    const stored = window.localStorage.getItem('lang');
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch (_) {
    /* ignore */
  }

  return DEFAULT_LANG;
}

// Cached once per page load — use `setLang()` to override dynamically.
let currentLang = detectLang();

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang)) {
    throw new Error(`i18n: unsupported lang "${lang}". Supported: ${SUPPORTED.join(', ')}`);
  }
  currentLang = lang;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lang', lang);
    }
  } catch (_) {
    /* ignore */
  }
  // Also update <html lang> and dir for consistency.
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  }
}

export function isRTL() {
  return currentLang === 'he';
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. TRANSLATION DICTIONARY (~50 common keys)
// ═══════════════════════════════════════════════════════════════════════════
//
// Keys use dot-notation namespaces. Add new keys here — unknown keys fall
// back to the key itself so UI never crashes on missing translations.

export const translations = {
  he: {
    // Navigation / chrome
    'nav.dashboard': 'דשבורד',
    'nav.orders': 'הזמנות',
    'nav.suppliers': 'ספקים',
    'nav.employees': 'עובדים',
    'nav.clients': 'לקוחות',
    'nav.finance': 'כספים',
    'nav.materials': 'מחסן',
    'nav.alerts': 'התראות',
    'nav.production': 'ייצור',
    'nav.purchasing': 'רכש',
    'nav.reports': 'דוחות',
    'nav.settings': 'הגדרות',
    'nav.logout': 'יציאה',
    'nav.menu': 'תפריט',
    'nav.skip_to_main': 'דלג לתוכן הראשי',

    // Actions
    'action.save': 'שמור',
    'action.cancel': 'ביטול',
    'action.delete': 'מחק',
    'action.edit': 'ערוך',
    'action.add': 'הוסף',
    'action.search': 'חיפוש',
    'action.filter': 'סנן',
    'action.export': 'ייצוא',
    'action.refresh': 'רענן',
    'action.approve': 'אשר',
    'action.reject': 'דחה',
    'action.close': 'סגור',
    'action.confirm': 'אישור',
    'action.submit': 'שלח',

    // Status
    'status.active': 'פעיל',
    'status.inactive': 'לא פעיל',
    'status.pending': 'ממתין',
    'status.approved': 'אושר',
    'status.rejected': 'נדחה',
    'status.draft': 'טיוטה',
    'status.completed': 'הושלם',
    'status.cancelled': 'בוטל',
    'status.loading': 'טוען...',
    'status.error': 'שגיאה',
    'status.success': 'הצלחה',
    'status.online': 'מחובר',
    'status.offline': 'מנותק',

    // Common fields
    'field.name': 'שם',
    'field.phone': 'טלפון',
    'field.email': 'אימייל',
    'field.address': 'כתובת',
    'field.city': 'עיר',
    'field.date': 'תאריך',
    'field.amount': 'סכום',
    'field.quantity': 'כמות',
    'field.price': 'מחיר',
    'field.total': 'סה"כ',
    'field.notes': 'הערות',
    'field.required': 'שדה חובה',

    // Units / currency
    'unit.hours': 'שעות',
    'unit.days': 'ימים',
    'unit.currency_symbol': '₪',
    'unit.ils': 'ש"ח',

    // A11y
    'a11y.close_dialog': 'סגור דיאלוג',
    'a11y.open_menu': 'פתח תפריט',
    'a11y.loading_data': 'טוען נתונים',
  },
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.orders': 'Orders',
    'nav.suppliers': 'Suppliers',
    'nav.employees': 'Employees',
    'nav.clients': 'Clients',
    'nav.finance': 'Finance',
    'nav.materials': 'Materials',
    'nav.alerts': 'Alerts',
    'nav.production': 'Production',
    'nav.purchasing': 'Purchasing',
    'nav.reports': 'Reports',
    'nav.settings': 'Settings',
    'nav.logout': 'Logout',
    'nav.menu': 'Menu',
    'nav.skip_to_main': 'Skip to main content',

    'action.save': 'Save',
    'action.cancel': 'Cancel',
    'action.delete': 'Delete',
    'action.edit': 'Edit',
    'action.add': 'Add',
    'action.search': 'Search',
    'action.filter': 'Filter',
    'action.export': 'Export',
    'action.refresh': 'Refresh',
    'action.approve': 'Approve',
    'action.reject': 'Reject',
    'action.close': 'Close',
    'action.confirm': 'Confirm',
    'action.submit': 'Submit',

    'status.active': 'Active',
    'status.inactive': 'Inactive',
    'status.pending': 'Pending',
    'status.approved': 'Approved',
    'status.rejected': 'Rejected',
    'status.draft': 'Draft',
    'status.completed': 'Completed',
    'status.cancelled': 'Cancelled',
    'status.loading': 'Loading...',
    'status.error': 'Error',
    'status.success': 'Success',
    'status.online': 'Online',
    'status.offline': 'Offline',

    'field.name': 'Name',
    'field.phone': 'Phone',
    'field.email': 'Email',
    'field.address': 'Address',
    'field.city': 'City',
    'field.date': 'Date',
    'field.amount': 'Amount',
    'field.quantity': 'Quantity',
    'field.price': 'Price',
    'field.total': 'Total',
    'field.notes': 'Notes',
    'field.required': 'Required field',

    'unit.hours': 'hours',
    'unit.days': 'days',
    'unit.currency_symbol': '₪',
    'unit.ils': 'ILS',

    'a11y.close_dialog': 'Close dialog',
    'a11y.open_menu': 'Open menu',
    'a11y.loading_data': 'Loading data',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. t() — translate a key with optional variable interpolation
// ═══════════════════════════════════════════════════════════════════════════
//
// Usage:
//   t('nav.dashboard')                       // => 'דשבורד'
//   t('greeting', { name: 'קובי' })          // if dict has 'שלום {name}'
//   t('status.pending', undefined, 'en')     // force English once
//
// Unknown keys fall back to the key string itself.

export function t(key, vars, langOverride) {
  const lang = langOverride || currentLang;
  const dict = translations[lang] || translations[DEFAULT_LANG];
  let str = dict[key];
  if (str == null) {
    // Try fallback locale before returning the bare key.
    const fallback = translations[DEFAULT_LANG] && translations[DEFAULT_LANG][key];
    str = fallback != null ? fallback : key;
  }
  if (vars && typeof str === 'string') {
    str = str.replace(/\{(\w+)\}/g, (m, name) =>
      vars[name] != null ? String(vars[name]) : m,
    );
  }
  return str;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Number / currency / date / hours formatters
// ═══════════════════════════════════════════════════════════════════════════

const LOCALE_MAP = { he: 'he-IL', en: 'en-US' };

function localeFor(langOverride) {
  return LOCALE_MAP[langOverride || currentLang] || 'he-IL';
}

/**
 * formatCurrency(n) — Israeli convention: ₪ before the number, with a
 * non-breaking space and he-IL grouping.
 *
 * Example:
 *   formatCurrency(12345.5) // => '₪ 12,345.50'
 *   formatCurrency(0)       // => '₪ 0.00'
 *
 * Options:
 *   { decimals = 2, symbol = '₪' }
 */
export function formatCurrency(n, opts = {}) {
  const { decimals = 2, symbol = '₪' } = opts;
  const num = Number(n || 0);
  const locale = localeFor();
  const formatted = num.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // ₪ before the number (Israeli convention), with U+00A0 so it stays glued.
  return `${symbol}\u00A0${formatted}`;
}

/**
 * formatDate(d) — dd/mm/yyyy in Israeli format. Accepts Date | string | number.
 * Returns '—' for empty input.
 *
 * Example:
 *   formatDate(new Date(2026, 3, 11)) // => '11/04/2026'
 *   formatDate('2026-04-11')          // => '11/04/2026'
 */
export function formatDate(d, opts = {}) {
  if (d == null || d === '') return '—';
  const { twoDigitYear = false } = opts;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = localeFor();
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: twoDigitYear ? '2-digit' : 'numeric',
  });
}

/**
 * formatDateTime(d) — dd/mm/yyyy HH:mm in Israeli format.
 */
export function formatDateTime(d) {
  if (d == null || d === '') return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = localeFor();
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * formatNumber(n) — integer or fractional number in he-IL locale.
 *
 * Example:
 *   formatNumber(12345)        // => '12,345'
 *   formatNumber(12345.678, 2) // => '12,345.68'
 */
export function formatNumber(n, decimals = 0) {
  const num = Number(n || 0);
  const locale = localeFor();
  return num.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * formatHours(n) — hours with up to 2 fractional digits in he-IL locale.
 * Designed for payroll/timesheet contexts (e.g. 182.25 שעות).
 *
 * Example:
 *   formatHours(182)     // => '182.00'
 *   formatHours(8.5)     // => '8.50'
 *   formatHours(8.567)   // => '8.57'
 */
export function formatHours(n) {
  const num = Number(n || 0);
  const locale = localeFor();
  return num.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Default export — convenient single-import
// ═══════════════════════════════════════════════════════════════════════════

const i18n = {
  t,
  getLang,
  setLang,
  isRTL,
  translations,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatHours,
};

export default i18n;
