export const formatCurrency = (amount: number = 0): string => {
  const formatted = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  
  // Ensure ₪ is used instead of ILS
  return formatted.replace("ILS", "₪").replace(/\s/g, "");
};

export const formatCurrencyAgorot = (agorot: number = 0): string => {
  return formatCurrency(agorot / 100);
};

export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return "-";
  
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  
  return new Intl.DateTimeFormat("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return "-";
  
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  
  return new Intl.DateTimeFormat("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

export const formatTime = (date: string | Date | null | undefined): string => {
  if (!date) return "-";
  
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

export const formatPercent = (value: number = 0): string => {
  return `${Number(value).toFixed(1)}%`;
};

export const formatNumber = (num: number = 0, decimals: number = 0): string => {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};
