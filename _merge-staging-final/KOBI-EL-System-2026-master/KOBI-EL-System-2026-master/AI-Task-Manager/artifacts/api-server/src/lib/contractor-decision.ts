import { VAT_RATE } from "../constants";
export const VAT_MULTIPLIER = 1 + VAT_RATE;

export interface PaymentComparisonInput {
  invoiceAmount: number;
  squareMeters: number;
  ratePerSqm: number;
  contractorPercent: number;
}

export interface PaymentComparisonResult {
  invoiceAmount: number;
  amountExVat: number;
  squareMeters: number;
  ratePerSqm: number;
  contractorPercent: number;
  costByPercent: number;
  costBySqm: number;
  difference: number;
  recommendation: "percent" | "sqm" | "equal";
  savings: number;
}

export function computePaymentComparison(input: PaymentComparisonInput): PaymentComparisonResult {
  const { invoiceAmount, squareMeters, ratePerSqm, contractorPercent } = input;
  const amountExVat = invoiceAmount / VAT_MULTIPLIER;
  const costByPercent = amountExVat * (contractorPercent / 100);
  const costBySqm = squareMeters * ratePerSqm;
  const difference = Math.abs(costByPercent - costBySqm);
  const recommendation: "percent" | "sqm" | "equal" =
    costByPercent < costBySqm ? "percent" : costBySqm < costByPercent ? "sqm" : "equal";
  return {
    invoiceAmount,
    amountExVat: Math.round(amountExVat * 100) / 100,
    squareMeters,
    ratePerSqm,
    contractorPercent,
    costByPercent: Math.round(costByPercent * 100) / 100,
    costBySqm: Math.round(costBySqm * 100) / 100,
    difference: Math.round(difference * 100) / 100,
    recommendation,
    savings: Math.round(difference * 100) / 100,
  };
}

export function extractComparisonInputFromData(data: Record<string, any>): PaymentComparisonInput | null {
  const invoiceAmount = Number(data.total_amount || data.amount || 0);
  const squareMeters = Number(data.square_meters || data.sqm || data.area || 0);
  const ratePerSqm = Number(data.rate_per_sqm || data.sqm_rate || 85);
  const contractorPercent = Number(data.contractor_percent || data.contractor_percentage || 30);

  if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) return null;
  if (!Number.isFinite(squareMeters) || squareMeters <= 0) return null;
  if (!Number.isFinite(ratePerSqm) || ratePerSqm <= 0) return null;
  if (!Number.isFinite(contractorPercent) || contractorPercent <= 0 || contractorPercent > 100) return null;

  return { invoiceAmount, squareMeters, ratePerSqm, contractorPercent };
}
