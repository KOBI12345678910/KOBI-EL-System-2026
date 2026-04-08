// Currency formatting with Hebrew locale
export function formatCurrency(amount: number, currency: string = "ILS"): string {
  const symbols: Record<string, string> = {
    ILS: "₪",
    USD: "$",
    EUR: "€",
    GBP: "£",
  };
  
  const symbol = symbols[currency] || currency;
  const formatted = (amount || 0).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return `${symbol}${formatted}`;
}

export function parseCurrency(str: string): number {
  return parseFloat(str.replace(/[^\d.-]/g, "")) || 0;
}
