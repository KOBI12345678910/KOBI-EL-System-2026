const MOBILE_PREFIXES = ["050", "051", "052", "053", "054", "055", "056", "057", "058", "059"];
const LANDLINE_PREFIXES = ["02", "03", "04", "08", "09", "072", "073", "074", "076", "077", "078", "079"];

export function validateIsraeliPhone(phone: string): boolean {
  const cleaned = phone.replace(/[-\s()]/g, "");
  if (!/^\+?972\d{9}$/.test(cleaned) && !/^0\d{8,9}$/.test(cleaned)) return false;
  let local = cleaned.startsWith("+972") ? "0" + cleaned.slice(4) : cleaned.startsWith("972") ? "0" + cleaned.slice(3) : cleaned;
  const isMobile = MOBILE_PREFIXES.some(p => local.startsWith(p));
  const isLandline2 = LANDLINE_PREFIXES.filter(p => p.length === 2).some(p => local.startsWith(p));
  const isLandline3 = LANDLINE_PREFIXES.filter(p => p.length === 3).some(p => local.startsWith(p));
  if (!isMobile && !isLandline2 && !isLandline3) return false;
  if (isMobile && local.length !== 10) return false;
  if (isLandline2 && local.length !== 9) return false;
  if (isLandline3 && local.length !== 10) return false;
  return true;
}

export function formatIsraeliPhone(phone: string): string {
  const cleaned = phone.replace(/[-\s()]/g, "");
  let local = cleaned.startsWith("+972") ? "0" + cleaned.slice(4) : cleaned.startsWith("972") ? "0" + cleaned.slice(3) : cleaned;
  if (local.length === 10 && MOBILE_PREFIXES.some(p => local.startsWith(p))) {
    return `${local.slice(0, 3)}-${local.slice(3)}`;
  }
  if (local.length === 9 && LANDLINE_PREFIXES.filter(p => p.length === 2).some(p => local.startsWith(p))) {
    return `${local.slice(0, 2)}-${local.slice(2)}`;
  }
  if (local.length === 10 && LANDLINE_PREFIXES.filter(p => p.length === 3).some(p => local.startsWith(p))) {
    return `${local.slice(0, 3)}-${local.slice(3)}`;
  }
  return local;
}

export function israeliPhoneError(phone: string): string | null {
  if (!phone || phone.trim() === "") return null;
  if (!validateIsraeliPhone(phone)) return "מספר טלפון אינו תקין (נדרש מספר ישראלי)";
  return null;
}
