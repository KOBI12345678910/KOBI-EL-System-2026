// ============================================================================
// TechnoKoluzi ERP - Pricing Calculation Engine
// SAP-level pricing with line/header discounts, tax calculation, margin
// analysis, price lists, and landed cost computation.
// All monetary values use toFixed(2) for precision.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PricingLine {
  itemId: string;
  quantity: number;
  unitPrice: number;
  lineDiscountPercent?: number;
  lineDiscountAmount?: number;
  taxRate?: number;
  costPrice?: number;
}

export interface LineCalculation {
  itemId: string;
  quantity: number;
  unitPrice: number;
  grossTotal: number;
  discountAmount: number;
  netBeforeTax: number;
  taxAmount: number;
  netTotal: number;
  taxRate: number;
  marginAmount?: number;
  marginPercent?: number;
}

export interface PricingResult {
  lines: LineCalculation[];
  subtotalBeforeDiscount: number;
  totalLineDiscounts: number;
  subtotalAfterLineDiscounts: number;
  headerDiscountAmount: number;
  subtotalAfterAllDiscounts: number;
  totalTax: number;
  grandTotal: number;
  marginPercent?: number;
  marginAmount?: number;
  currency?: string;
  calculatedAt: string;
}

export interface MarginResult {
  marginAmount: number;
  marginPercent: number;
}

export interface MarginValidation {
  status: 'ok' | 'warning' | 'blocked';
  message: string;
  marginPercent: number;
}

export interface LandedCostBreakdown {
  basePrice: number;
  freight: number;
  customs: number;
  insurance: number;
  handling: number;
  totalLandedCost: number;
  landedCostPerUnit?: number;
  upliftPercent: number;
}

export interface PriceListEntry {
  itemId: string;
  customerId?: string;
  customerGroup?: string;
  priceListId: string;
  unitPrice: number;
  minQuantity: number;
  maxQuantity?: number;
  validFrom: string;
  validTo?: string;
  currency: string;
}

export interface PriceListLookupResult {
  unitPrice: number;
  source: 'customer_specific' | 'customer_group' | 'quantity_break' | 'base_price';
  priceListId?: string;
  appliedDiscount?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Israeli standard VAT rate */
export const IL_VAT_RATE = 0.17;

/** Common tax rates by jurisdiction */
export const TAX_RATES = {
  IL_VAT: 0.17,
  IL_ZERO: 0.0,
  US_AVERAGE: 0.0725,
  EU_STANDARD: 0.20,
  UK_VAT: 0.20,
  EXEMPT: 0.0,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimal places for monetary values */
function money(value: number): number {
  return parseFloat(value.toFixed(2));
}

/** Safe percentage: value * (percent / 100), rounded */
function applyPercent(value: number, percent: number): number {
  return money(value * (percent / 100));
}

// ---------------------------------------------------------------------------
// PricingEngine
// ---------------------------------------------------------------------------

export class PricingEngine {
  private priceListStore: PriceListEntry[] = [];
  private defaultTaxRate: number;
  private defaultCurrency: string;

  constructor(options?: { defaultTaxRate?: number; defaultCurrency?: string }) {
    this.defaultTaxRate = options?.defaultTaxRate ?? IL_VAT_RATE;
    this.defaultCurrency = options?.defaultCurrency ?? 'ILS';
  }

  // -----------------------------------------------------------------------
  // Line-level calculation
  // -----------------------------------------------------------------------

  calculateLine(line: PricingLine): LineCalculation {
    const quantity = line.quantity;
    const unitPrice = money(line.unitPrice);
    const grossTotal = money(quantity * unitPrice);
    const taxRate = line.taxRate ?? this.defaultTaxRate;

    // Discount: percent-based takes priority, then fixed amount, or zero
    let discountAmount = 0;
    if (line.lineDiscountPercent && line.lineDiscountPercent > 0) {
      discountAmount = applyPercent(grossTotal, line.lineDiscountPercent);
    } else if (line.lineDiscountAmount && line.lineDiscountAmount > 0) {
      discountAmount = money(Math.min(line.lineDiscountAmount, grossTotal));
    }

    const netBeforeTax = money(grossTotal - discountAmount);
    const taxAmount = money(netBeforeTax * taxRate);
    const netTotal = money(netBeforeTax + taxAmount);

    // Optional margin if cost price provided
    let marginAmount: number | undefined;
    let marginPercent: number | undefined;
    if (line.costPrice !== undefined && line.costPrice > 0) {
      const totalCost = money(line.costPrice * quantity);
      const margin = this.calculateMargin(netBeforeTax, totalCost);
      marginAmount = margin.marginAmount;
      marginPercent = margin.marginPercent;
    }

    return {
      itemId: line.itemId,
      quantity,
      unitPrice,
      grossTotal,
      discountAmount,
      netBeforeTax,
      taxAmount,
      netTotal,
      taxRate,
      marginAmount,
      marginPercent,
    };
  }

  // -----------------------------------------------------------------------
  // Quote / Order level calculation
  // -----------------------------------------------------------------------

  calculateQuote(
    lines: PricingLine[],
    headerDiscountPercent?: number,
    headerDiscountAmount?: number,
    currency?: string,
  ): PricingResult {
    const calculatedLines = lines.map((l) => this.calculateLine(l));

    const subtotalBeforeDiscount = money(
      calculatedLines.reduce((sum, l) => sum + l.grossTotal, 0),
    );

    const totalLineDiscounts = money(
      calculatedLines.reduce((sum, l) => sum + l.discountAmount, 0),
    );

    const subtotalAfterLineDiscounts = money(subtotalBeforeDiscount - totalLineDiscounts);

    // Header-level discount applied on top of line discounts
    let headerDiscountAmt = 0;
    if (headerDiscountPercent && headerDiscountPercent > 0) {
      headerDiscountAmt = applyPercent(subtotalAfterLineDiscounts, headerDiscountPercent);
    } else if (headerDiscountAmount && headerDiscountAmount > 0) {
      headerDiscountAmt = money(Math.min(headerDiscountAmount, subtotalAfterLineDiscounts));
    }

    const subtotalAfterAllDiscounts = money(subtotalAfterLineDiscounts - headerDiscountAmt);

    // When header discount is applied, we need to recalculate tax proportionally
    // Distribute the header discount across lines proportionally and recalculate tax
    let totalTax: number;
    if (headerDiscountAmt > 0 && subtotalAfterLineDiscounts > 0) {
      const headerDiscountRatio = headerDiscountAmt / subtotalAfterLineDiscounts;
      totalTax = money(
        calculatedLines.reduce((sum, l) => {
          const lineShareOfHeaderDiscount = money(l.netBeforeTax * headerDiscountRatio);
          const adjustedNetBeforeTax = money(l.netBeforeTax - lineShareOfHeaderDiscount);
          return sum + money(adjustedNetBeforeTax * l.taxRate);
        }, 0),
      );

      // Update line calculations to reflect header discount distribution
      for (const l of calculatedLines) {
        const lineShareOfHeaderDiscount = money(l.netBeforeTax * headerDiscountRatio);
        const adjustedNetBeforeTax = money(l.netBeforeTax - lineShareOfHeaderDiscount);
        l.taxAmount = money(adjustedNetBeforeTax * l.taxRate);
        l.netTotal = money(adjustedNetBeforeTax + l.taxAmount);
      }
    } else {
      totalTax = money(
        calculatedLines.reduce((sum, l) => sum + l.taxAmount, 0),
      );
    }

    const grandTotal = money(subtotalAfterAllDiscounts + totalTax);

    // Aggregate margin if all lines have cost data
    let marginAmount: number | undefined;
    let marginPercent: number | undefined;
    const allLinesHaveCost = calculatedLines.every((l) => l.marginAmount !== undefined);
    if (allLinesHaveCost) {
      const totalCost = money(
        lines.reduce((sum, l) => sum + (l.costPrice ?? 0) * l.quantity, 0),
      );
      if (totalCost > 0) {
        const margin = this.calculateMargin(subtotalAfterAllDiscounts, totalCost);
        marginAmount = margin.marginAmount;
        marginPercent = margin.marginPercent;
      }
    }

    return {
      lines: calculatedLines,
      subtotalBeforeDiscount,
      totalLineDiscounts,
      subtotalAfterLineDiscounts,
      headerDiscountAmount: headerDiscountAmt,
      subtotalAfterAllDiscounts,
      totalTax,
      grandTotal,
      marginPercent,
      marginAmount,
      currency: currency ?? this.defaultCurrency,
      calculatedAt: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------------
  // Margin calculation
  // -----------------------------------------------------------------------

  calculateMargin(sellingPrice: number, costPrice: number): MarginResult {
    if (sellingPrice === 0) {
      return { marginAmount: money(-costPrice), marginPercent: -100 };
    }
    const marginAmount = money(sellingPrice - costPrice);
    const marginPercent = money((marginAmount / sellingPrice) * 100);
    return { marginAmount, marginPercent };
  }

  validateMargin(
    marginPercent: number,
    thresholds: { warning: number; block: number },
  ): MarginValidation {
    if (marginPercent < thresholds.block) {
      return {
        status: 'blocked',
        message: `Margin ${marginPercent.toFixed(2)}% is below the minimum threshold of ${thresholds.block}%. Transaction blocked -- manager approval required.`,
        marginPercent,
      };
    }
    if (marginPercent < thresholds.warning) {
      return {
        status: 'warning',
        message: `Margin ${marginPercent.toFixed(2)}% is below the warning threshold of ${thresholds.warning}%. Proceed with caution.`,
        marginPercent,
      };
    }
    return {
      status: 'ok',
      message: `Margin ${marginPercent.toFixed(2)}% is within acceptable range.`,
      marginPercent,
    };
  }

  // -----------------------------------------------------------------------
  // Price list management
  // -----------------------------------------------------------------------

  /** Load price list entries (typically called at startup or refresh) */
  loadPriceList(entries: PriceListEntry[]): void {
    this.priceListStore = [...entries];
  }

  /** Add a single price list entry */
  addPriceListEntry(entry: PriceListEntry): void {
    this.priceListStore.push(entry);
  }

  /** Look up the best unit price from price lists */
  async applyPriceList(
    itemId: string,
    customerId: string,
    quantity: number,
  ): Promise<number> {
    const result = this.lookupPriceList(itemId, customerId, quantity);
    return result.unitPrice;
  }

  /** Full lookup returning source information */
  lookupPriceList(
    itemId: string,
    customerId: string,
    quantity: number,
  ): PriceListLookupResult {
    const now = new Date().toISOString();
    const candidates = this.priceListStore.filter((e) => {
      if (e.itemId !== itemId) return false;
      if (e.validFrom > now) return false;
      if (e.validTo && e.validTo < now) return false;
      if (quantity < e.minQuantity) return false;
      if (e.maxQuantity && quantity > e.maxQuantity) return false;
      return true;
    });

    // Priority: customer-specific > customer-group > quantity break > base
    const customerSpecific = candidates.find((c) => c.customerId === customerId);
    if (customerSpecific) {
      return {
        unitPrice: customerSpecific.unitPrice,
        source: 'customer_specific',
        priceListId: customerSpecific.priceListId,
      };
    }

    // Customer group match would require a lookup -- for now we check the customerGroup field
    const groupMatch = candidates.find((c) => c.customerGroup && !c.customerId);
    if (groupMatch) {
      return {
        unitPrice: groupMatch.unitPrice,
        source: 'customer_group',
        priceListId: groupMatch.priceListId,
      };
    }

    // Quantity break: find the entry with the highest minQuantity that the order satisfies
    const quantityBreaks = candidates
      .filter((c) => !c.customerId && !c.customerGroup)
      .sort((a, b) => b.minQuantity - a.minQuantity);

    if (quantityBreaks.length > 0) {
      return {
        unitPrice: quantityBreaks[0].unitPrice,
        source: 'quantity_break',
        priceListId: quantityBreaks[0].priceListId,
      };
    }

    // No match -- return 0 to signal "no price list price found"
    return { unitPrice: 0, source: 'base_price' };
  }

  // -----------------------------------------------------------------------
  // Landed cost
  // -----------------------------------------------------------------------

  calculateLandedCost(
    basePrice: number,
    freight: number,
    customs: number,
    insurance: number,
    handling: number,
    quantity?: number,
  ): LandedCostBreakdown {
    const totalLandedCost = money(basePrice + freight + customs + insurance + handling);
    const landedCostPerUnit = quantity && quantity > 0 ? money(totalLandedCost / quantity) : undefined;
    const upliftPercent = basePrice > 0 ? money(((totalLandedCost - basePrice) / basePrice) * 100) : 0;

    return {
      basePrice: money(basePrice),
      freight: money(freight),
      customs: money(customs),
      insurance: money(insurance),
      handling: money(handling),
      totalLandedCost,
      landedCostPerUnit,
      upliftPercent,
    };
  }

  // -----------------------------------------------------------------------
  // Israeli VAT helpers
  // -----------------------------------------------------------------------

  /** Add Israeli VAT (17%) to a net amount */
  addIlVat(netAmount: number): { netAmount: number; vatAmount: number; grossAmount: number } {
    const net = money(netAmount);
    const vatAmount = money(net * IL_VAT_RATE);
    return { netAmount: net, vatAmount, grossAmount: money(net + vatAmount) };
  }

  /** Extract Israeli VAT from a gross (VAT-inclusive) amount */
  extractIlVat(grossAmount: number): { netAmount: number; vatAmount: number; grossAmount: number } {
    const gross = money(grossAmount);
    const netAmount = money(gross / (1 + IL_VAT_RATE));
    const vatAmount = money(gross - netAmount);
    return { netAmount, vatAmount, grossAmount: gross };
  }

  // -----------------------------------------------------------------------
  // Multi-currency placeholder
  // -----------------------------------------------------------------------

  /** Convert amount between currencies (requires an exchange rate) */
  convertCurrency(
    amount: number,
    exchangeRate: number,
    fromCurrency: string,
    toCurrency: string,
  ): { originalAmount: number; convertedAmount: number; exchangeRate: number; fromCurrency: string; toCurrency: string } {
    return {
      originalAmount: money(amount),
      convertedAmount: money(amount * exchangeRate),
      exchangeRate,
      fromCurrency,
      toCurrency,
    };
  }

  // -----------------------------------------------------------------------
  // Batch pricing for inventory valuation
  // -----------------------------------------------------------------------

  /** Calculate weighted average cost from a set of purchase batches */
  calculateWeightedAverageCost(
    batches: { quantity: number; unitCost: number }[],
  ): number {
    const totalQuantity = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalQuantity === 0) return 0;
    const totalValue = batches.reduce((sum, b) => sum + b.quantity * b.unitCost, 0);
    return money(totalValue / totalQuantity);
  }

  /** FIFO cost for a withdrawal quantity from ordered batches */
  calculateFifoCost(
    batches: { quantity: number; unitCost: number }[],
    withdrawQuantity: number,
  ): { totalCost: number; unitCost: number; remainingBatches: { quantity: number; unitCost: number }[] } {
    let remaining = withdrawQuantity;
    let totalCost = 0;
    const remainingBatches: { quantity: number; unitCost: number }[] = [];

    for (const batch of batches) {
      if (remaining <= 0) {
        remainingBatches.push({ ...batch });
        continue;
      }
      const take = Math.min(batch.quantity, remaining);
      totalCost += take * batch.unitCost;
      remaining -= take;
      const leftInBatch = batch.quantity - take;
      if (leftInBatch > 0) {
        remainingBatches.push({ quantity: leftInBatch, unitCost: batch.unitCost });
      }
    }

    return {
      totalCost: money(totalCost),
      unitCost: withdrawQuantity > 0 ? money(totalCost / withdrawQuantity) : 0,
      remainingBatches,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton export for convenience
// ---------------------------------------------------------------------------

export const pricingEngine = new PricingEngine({
  defaultTaxRate: IL_VAT_RATE,
  defaultCurrency: 'ILS',
});
