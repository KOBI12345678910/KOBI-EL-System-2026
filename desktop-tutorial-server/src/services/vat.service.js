/**
 * חישובי מע"מ ישראלי
 */
const VAT_RATE = 0.18; // 18% מע"מ (מ-2026-01-01; לפני כן 17%)

function calculateVAT(amountBeforeVAT) {
  const vat = amountBeforeVAT * VAT_RATE;
  return {
    amountBeforeVAT: round(amountBeforeVAT),
    vatAmount: round(vat),
    totalAmount: round(amountBeforeVAT + vat),
  };
}

function extractVATFromTotal(totalAmount) {
  const amountBeforeVAT = totalAmount / (1 + VAT_RATE);
  const vat = totalAmount - amountBeforeVAT;
  return {
    amountBeforeVAT: round(amountBeforeVAT),
    vatAmount: round(vat),
    totalAmount: round(totalAmount),
  };
}

function round(num) {
  return Math.round(num * 100) / 100;
}

module.exports = { VAT_RATE, calculateVAT, extractVATFromTotal };
