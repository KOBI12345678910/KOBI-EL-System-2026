export const formatCurrency = (n: number) =>
  `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const formatDate = (d: string | Date) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export const formatDateTime = (d: string | Date) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const isOverdue = (deliveryDate: string) =>
  new Date(deliveryDate) < new Date();

export const daysUntil = (deliveryDate: string) => {
  const diff = new Date(deliveryDate).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export const materialCategoryHe: Record<string, string> = {
  iron: 'ברזל',
  aluminum: 'אלומיניום',
  stainless: 'נירוסטה',
  glass: 'זכוכית',
  consumables: 'מתכלים',
  mixed: 'מעורב'
};

export const orderCategoryHe: Record<string, string> = {
  railings: 'מעקות',
  gates: 'שערים',
  fences: 'גדרות',
  pergolas: 'פרגולות',
  stairs: 'מדרגות',
  glass: 'זכוכית'
};

export const statusHe: Record<string, string> = {
  pending: 'הכנה',
  production: 'ייצור',
  finishing: 'גימור',
  ready: 'מוכן',
  delivered: 'נמסר',
  cancelled: 'בוטל'
};

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws';
