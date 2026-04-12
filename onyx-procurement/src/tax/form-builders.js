/**
 * Israeli Tax Forms Builders
 * Wave 1.5 — B-10 fix
 *
 * Generates JSON payloads for annual tax forms:
 *   - Form 1301 — דוח שנתי ליחיד (individual)
 *   - Form 1320 — דוח שנתי לחברה (corporation)
 *   - Form 6111 — דוח מתואם לצורכי מס (financial statements in tax format)
 *   - Form 30א — דוח יצרן (manufacturer report)
 *
 * Each builder returns a structured object ready for:
 *   a) Persisting in annual_tax_reports.payload
 *   b) Rendering to PDF/XML for submission
 *
 * IMPORTANT: This is a reference implementation. Before production filing:
 *   1. Cross-check every line against the latest PDF from רשות המסים
 *   2. Have a licensed CPA review the output
 *   3. Test with last year's known-good data
 */

'use strict';

// ═══ Form 1320 — Annual Return for Companies ═══

function buildForm1320({ fiscalYear, profile, totals, projects, customerInvoices, taxInvoices }) {
  if (!fiscalYear) throw new Error('fiscalYear is required');
  if (!profile) throw new Error('company tax profile is required');

  const revenueFromSales = sum(customerInvoices, 'net_amount', i => i.status !== 'voided');
  const revenueByProject = groupSum(customerInvoices, 'project_id', 'net_amount');

  const totalPurchases = sum(taxInvoices, 'net_amount', i => i.direction === 'input' && !i.is_asset && i.status !== 'voided');
  const assetPurchases = sum(taxInvoices, 'net_amount', i => i.direction === 'input' && i.is_asset && i.status !== 'voided');

  return {
    formType: '1320',
    formVersion: String(fiscalYear),
    preparedAt: new Date().toISOString(),

    // Section 1 — Company identification
    companyIdentification: {
      companyId: profile.company_id,
      legalName: profile.legal_name,
      tradingName: profile.company_name,
      vatFileNumber: profile.vat_file_number,
      taxFileNumber: profile.tax_file_number,
      address: {
        street: profile.address_street,
        city: profile.address_city,
        postal: profile.address_postal,
      },
      phone: profile.phone,
      email: profile.email,
      fiscalYear,
      fiscalYearEnd: `${fiscalYear}-${String(profile.fiscal_year_end_month || 12).padStart(2, '0')}-${fiscalYear === new Date().getFullYear() ? '31' : '31'}`,
      accountingMethod: profile.accounting_method,
    },

    // Section 2 — Revenue
    revenue: {
      salesRevenue: revenueFromSales,
      otherRevenue: 0,
      totalRevenue: revenueFromSales,
      revenueByProject,
    },

    // Section 3 — Cost of goods sold
    costOfGoodsSold: {
      beginningInventory: 0,
      purchases: totalPurchases,
      endingInventory: 0,
      totalCogs: totalPurchases,
    },

    // Section 4 — Expenses
    operatingExpenses: {
      salaries: totals?.salaries || 0,
      rent: totals?.rent || 0,
      utilities: totals?.utilities || 0,
      depreciation: totals?.depreciation || 0,
      other: totals?.other_expenses || 0,
      totalExpenses: (totals?.salaries || 0) + (totals?.rent || 0) + (totals?.utilities || 0) + (totals?.depreciation || 0) + (totals?.other_expenses || 0),
    },

    // Section 5 — Profit calculation
    profit: {
      grossProfit: revenueFromSales - totalPurchases,
      operatingProfit: revenueFromSales - totalPurchases - ((totals?.salaries || 0) + (totals?.rent || 0) + (totals?.utilities || 0)),
      profitBeforeTax: totals?.profit_before_tax || 0,
      corporateTax: totals?.corporate_tax || 0,
      profitAfterTax: totals?.profit_after_tax || 0,
    },

    // Section 6 — Assets
    assets: {
      cashAndEquivalents: totals?.cash || 0,
      accountsReceivable: sum(customerInvoices, 'amount_outstanding', i => i.status !== 'voided'),
      inventory: 0,
      fixedAssets: assetPurchases,
      totalAssets: (totals?.cash || 0) + sum(customerInvoices, 'amount_outstanding', i => i.status !== 'voided') + assetPurchases,
    },

    // Section 7 — Metadata
    metadata: {
      projectCount: projects?.length || 0,
      customerInvoiceCount: customerInvoices?.length || 0,
      schemaVersion: 'onyx-wave1.5',
    },
  };
}

// ═══ Form 6111 — Financial Statements in Tax Format ═══

function buildForm6111({ fiscalYear, profile, chartOfAccounts = [], journalEntries = [] }) {
  // Group balance and P&L by 6111 line number
  const byLine = {};
  for (const acc of chartOfAccounts) {
    if (!acc.form_6111_line) continue;
    if (!byLine[acc.form_6111_line]) {
      byLine[acc.form_6111_line] = { line: acc.form_6111_line, accounts: [], balance: 0 };
    }
    byLine[acc.form_6111_line].accounts.push(acc.account_code);
  }

  return {
    formType: '6111',
    formVersion: String(fiscalYear),
    preparedAt: new Date().toISOString(),
    companyId: profile.company_id,
    fiscalYear,
    lines: Object.values(byLine),
    totals: {
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
    },
    disclaimer: 'Auto-generated from onyx chart_of_accounts mapping — REVIEW BEFORE FILING',
  };
}

// ═══ Form 1301 — Annual Return for Individuals ═══

function buildForm1301({ fiscalYear, taxpayer, incomeSources, deductions, credits }) {
  if (!taxpayer?.tax_id) throw new Error('taxpayer.tax_id (ת.ז) required');

  const totalIncome = (incomeSources || []).reduce((s, src) => s + (src.amount || 0), 0);
  const totalDeductions = (deductions || []).reduce((s, d) => s + (d.amount || 0), 0);
  const totalCredits = (credits || []).reduce((s, c) => s + (c.amount || 0), 0);
  const taxableIncome = Math.max(0, totalIncome - totalDeductions);

  return {
    formType: '1301',
    formVersion: String(fiscalYear),
    preparedAt: new Date().toISOString(),

    taxpayer: {
      name: taxpayer.name,
      id: taxpayer.tax_id,
      address: taxpayer.address,
      fiscalYear,
    },

    incomeSources: (incomeSources || []).map(src => ({
      type: src.type,                 // 'salary','business','rental','interest','dividend','capital_gain'
      amount: src.amount,
      source: src.source,
      taxWithheld: src.tax_withheld || 0,
    })),
    totalIncome,

    deductions: (deductions || []).map(d => ({
      type: d.type,                   // 'pension','life_insurance','study_fund','donations'
      amount: d.amount,
      reference: d.reference,
    })),
    totalDeductions,

    credits: (credits || []).map(c => ({
      type: c.type,                   // 'personal','disabled','new_immigrant','housing'
      amount: c.amount,
      reference: c.reference,
    })),
    totalCredits,

    computation: {
      grossIncome: totalIncome,
      deductions: totalDeductions,
      taxableIncome,
      // Tax brackets would be applied here per year-specific rates
      estimatedTaxLiability: 0, // computed in separate function
      creditsApplied: totalCredits,
      finalTaxDue: 0,
    },
  };
}

// ═══ Form 30א — Manufacturer Report ═══

function buildForm30A({ fiscalYear, profile, production, rawMaterials, finishedGoods, labor }) {
  return {
    formType: '30a',
    formVersion: String(fiscalYear),
    preparedAt: new Date().toISOString(),
    companyId: profile.company_id,
    fiscalYear,
    production: {
      unitsProduced: production?.units || 0,
      unitsSold: production?.soldUnits || 0,
      unitsInInventory: production?.inventoryUnits || 0,
    },
    rawMaterials: {
      openingBalance: rawMaterials?.opening || 0,
      purchases: rawMaterials?.purchases || 0,
      consumed: rawMaterials?.consumed || 0,
      closingBalance: rawMaterials?.closing || 0,
    },
    finishedGoods: {
      openingBalance: finishedGoods?.opening || 0,
      produced: finishedGoods?.produced || 0,
      sold: finishedGoods?.sold || 0,
      closingBalance: finishedGoods?.closing || 0,
    },
    labor: {
      directLaborCost: labor?.direct || 0,
      indirectLaborCost: labor?.indirect || 0,
      totalEmployees: labor?.totalEmployees || 0,
      foreignWorkers: labor?.foreignWorkers || 0,
    },
  };
}

// ═══ HELPERS ═══

function sum(arr, key, filter) {
  if (!arr) return 0;
  return arr.reduce((s, item) => (!filter || filter(item)) ? s + Number(item[key] || 0) : s, 0);
}

function groupSum(arr, groupKey, valueKey) {
  if (!arr) return {};
  const out = {};
  for (const item of arr) {
    const g = item[groupKey] || '_none';
    out[g] = (out[g] || 0) + Number(item[valueKey] || 0);
  }
  return out;
}

module.exports = {
  buildForm1320,
  buildForm1301,
  buildForm6111,
  buildForm30A,
};
