export function validateIsraeliId(id: string): boolean {
  const cleaned = id.replace(/[^0-9]/g, "");
  if (cleaned.length < 1 || cleaned.length > 9) return false;
  const padded = cleaned.padStart(9, "0");
  let total = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(padded[i], 10);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    total += digit;
  }
  return total % 10 === 0;
}

export function formatIsraeliId(id: string): string {
  const cleaned = id.replace(/[^0-9]/g, "").slice(0, 9);
  return cleaned.padStart(cleaned.length > 0 ? 9 : 0, "0");
}

export function israeliIdError(id: string): string | null {
  if (!id || id.trim() === "") return "תעודת זהות נדרשת";
  if (!validateIsraeliId(id)) return "תעודת זהות אינה תקינה (מספר לא חוקי)";
  return null;
}
