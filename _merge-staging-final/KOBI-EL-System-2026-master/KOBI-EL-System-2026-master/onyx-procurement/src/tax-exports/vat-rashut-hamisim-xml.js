/**
 * vat-rashut-hamisim-xml.js — יצוא מע"מ רבעוני ב-XML של רשות המיסים.
 * Agent 70 — Tax Authority XML export formats (Wave 2026)
 *
 * Quarterly VAT XML export. This is the new XML-shape submission, NOT
 * to be confused with the legacy PCN836 flat-file generator at
 * src/vat/pcn836.js — that file is left intact.
 */

'use strict';

const {
  el, wrap, fields, buildDocument, buildMetaBlock, writeXmlFile,
  isoDate, amount, integer, requireFields, validateTaxIdField,
} = require('./_xml-common');

const FORM_CODE = 'VAT-Q';
const ROOT_TAG = 'ReportVATQuarterly';

// ═══════════════════════════════════════════════════════════════

function buildBusinessBlock(biz = {}) {
  return wrap('Business', fields({
    VatFileNumber: biz.vatFileNumber,
    BusinessName: biz.businessName,
    ReportingFrequency: biz.reportingFrequency || 'quarterly',
    ReportingMethod: biz.reportingMethod || 'accrual',  // 'accrual' | 'cash'
  }));
}

function buildQuarterBlock(q = {}) {
  return wrap('Quarter', fields({
    Year: integer(q.year),
    QuarterNumber: integer(q.quarter),
    PeriodStart: q.periodStart ? isoDate(q.periodStart) : undefined,
    PeriodEnd: q.periodEnd ? isoDate(q.periodEnd) : undefined,
  }));
}

function buildSalesBlock(sales = {}) {
  return wrap('Sales', fields({
    TaxableSales: amount(sales.taxableSales),
    VatOnSales: amount(sales.vatOnSales),
    ZeroRateSales: amount(sales.zeroRateSales),
    ExemptSales: amount(sales.exemptSales),
    ExportSales: amount(sales.exportSales),
    TotalSales: amount(
      (+sales.taxableSales || 0) +
      (+sales.zeroRateSales || 0) +
      (+sales.exemptSales || 0) +
      (+sales.exportSales || 0)
    ),
  }));
}

function buildPurchasesBlock(purchases = {}) {
  return wrap('Purchases', fields({
    TaxablePurchases: amount(purchases.taxablePurchases),
    VatOnPurchases: amount(purchases.vatOnPurchases),
    AssetPurchases: amount(purchases.assetPurchases),
    VatOnAssets: amount(purchases.vatOnAssets),
    ImportPurchases: amount(purchases.importPurchases),
    VatOnImports: amount(purchases.vatOnImports),
  }));
}

function buildNetVatBlock(net = {}) {
  const vatOut = +net.vatOnSales || 0;
  const vatIn = (+net.vatOnPurchases || 0) + (+net.vatOnAssets || 0) + (+net.vatOnImports || 0);
  return wrap('NetVat', fields({
    TotalVatOnSales: amount(net.totalVatOnSales ?? vatOut),
    TotalVatOnPurchases: amount(net.totalVatOnPurchases ?? vatIn),
    NetVatPayable: amount(net.netVatPayable ?? (vatOut - vatIn)),
    IsRefund: (net.netVatPayable !== undefined ? net.netVatPayable : (vatOut - vatIn)) < 0 ? 'Y' : 'N',
  }));
}

function buildInvoiceReformBlock(ref = {}) {
  return wrap('InvoiceReform', fields({
    InvoicesWithAllocationNumber: integer(ref.invoicesWithAllocationNumber),
    InvoicesWithoutAllocationNumber: integer(ref.invoicesWithoutAllocationNumber),
    AllocationNumberRequired: ref.allocationNumberRequired ? 'Y' : 'N',
  }));
}

// ═══════════════════════════════════════════════════════════════

function generate(data) {
  if (!data) throw new Error('vat-rashut-hamisim: data is required');
  const meta = buildMetaBlock({
    formCode: FORM_CODE,
    companyId: data.business?.vatFileNumber,
    companyName: data.business?.businessName,
    taxYear: data.quarter?.year,
    periodStart: data.quarter?.periodStart,
    periodEnd: data.quarter?.periodEnd,
    submissionType: data.submission?.type || 'initial',
    submissionDate: data.submission?.date,
  });

  // Merge sales/purchases amounts for net calc
  const netInput = {
    vatOnSales: data.sales?.vatOnSales,
    vatOnPurchases: data.purchases?.vatOnPurchases,
    vatOnAssets: data.purchases?.vatOnAssets,
    vatOnImports: data.purchases?.vatOnImports,
    ...(data.netVat || {}),
  };

  const inner =
    meta +
    buildBusinessBlock(data.business) +
    buildQuarterBlock(data.quarter) +
    buildSalesBlock(data.sales || {}) +
    buildPurchasesBlock(data.purchases || {}) +
    buildNetVatBlock(netInput) +
    buildInvoiceReformBlock(data.invoiceReform || {});

  return buildDocument(ROOT_TAG, FORM_CODE, inner);
}

function validate(data) {
  const errors = [];
  if (!data) {
    errors.push('vat-rashut-hamisim: data is required');
    return errors;
  }
  errors.push(...requireFields(data, ['business', 'quarter']));
  if (data.business) {
    errors.push(...requireFields(data.business, ['vatFileNumber', 'businessName'], 'business.'));
    errors.push(...validateTaxIdField(data.business, 'vatFileNumber', 'business.'));
    if (data.business.reportingMethod && !['accrual', 'cash'].includes(data.business.reportingMethod)) {
      errors.push("business.reportingMethod: must be 'accrual' or 'cash'");
    }
  }
  if (data.quarter) {
    errors.push(...requireFields(data.quarter, ['year', 'quarter'], 'quarter.'));
    if (data.quarter.quarter !== undefined) {
      const q = Number(data.quarter.quarter);
      if (!(q >= 1 && q <= 4)) errors.push('quarter.quarter: must be 1-4');
    }
  }
  return errors;
}

function writeToFile(data, outputPath) {
  const xml = generate(data);
  return writeXmlFile(xml, outputPath);
}

module.exports = {
  FORM_CODE,
  ROOT_TAG,
  generate,
  validate,
  writeToFile,
};
