/**
 * Wage Slip PDF Generator — תלוש שכר
 * Wave 1.5 — B-08 fix
 *
 * Generates bilingual (Hebrew RTL + English fallback) PDF wage slip
 * compliant with חוק הגנת השכר תיקון 24. Uses pdfkit.
 *
 * Required sections per law:
 *   1. Employer identity
 *   2. Employee identity
 *   3. Period
 *   4. Hours breakdown
 *   5. Earnings breakdown
 *   6. Deductions breakdown
 *   7. Net pay
 *   8. Vacation/sick/study-fund/severance balances
 *   9. Employer contributions (informational)
 *  10. YTD totals
 */

'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const MONTH_NAMES_HE = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function formatMoney(n) {
  const num = Number(n || 0);
  return '₪ ' + num.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatHours(h) {
  const num = Number(h || 0);
  return num.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * Generate a wage slip PDF and write it to outputPath.
 * Returns a promise that resolves to { path, size }.
 */
function generateWageSlipPdf(slip, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `תלוש שכר ${slip.period_label} - ${slip.employee_name}`,
          Author: slip.employer_legal_name,
          Subject: 'Wage Slip / תלוש שכר',
          Keywords: 'payroll, wage slip, תלוש שכר',
          CreationDate: new Date(),
        },
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // ─── HEADER ───
      doc.fontSize(18).text('Wage Slip / תלוש שכר', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).text(
        `${MONTH_NAMES_HE[slip.period_month]} ${slip.period_year} / Period: ${slip.period_label}`,
        { align: 'center' }
      );
      doc.moveDown();

      // ─── EMPLOYER + EMPLOYEE BOX ───
      const topY = doc.y;
      doc.fontSize(10);

      // Employer (right column / left in LTR PDF)
      doc.text('EMPLOYER / מעסיק', 40, topY, { continued: false });
      doc.text(`Name: ${slip.employer_legal_name}`);
      doc.text(`Company ID: ${slip.employer_company_id}`);
      doc.text(`Tax File: ${slip.employer_tax_file}`);

      // Employee
      const col2X = 320;
      doc.text('EMPLOYEE / עובד', col2X, topY);
      doc.text(`Name: ${slip.employee_name}`, col2X, doc.y);
      doc.text(`National ID / ת.ז: ${slip.employee_national_id}`, col2X, doc.y);
      doc.text(`Employee #: ${slip.employee_number}`, col2X, doc.y);
      if (slip.position) doc.text(`Position: ${slip.position}`, col2X, doc.y);
      if (slip.department) doc.text(`Department: ${slip.department}`, col2X, doc.y);

      doc.moveDown(2);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      // ─── HOURS SECTION ───
      doc.fontSize(12).text('Hours / שעות עבודה', { underline: true });
      doc.fontSize(10).moveDown(0.3);
      drawTwoColumnRow(doc, 'Regular hours / שעות רגילות', formatHours(slip.hours_regular));
      drawTwoColumnRow(doc, 'Overtime 125% / שעות נוספות 125%', formatHours(slip.hours_overtime_125));
      drawTwoColumnRow(doc, 'Overtime 150% / שעות נוספות 150%', formatHours(slip.hours_overtime_150));
      if (Number(slip.hours_overtime_175) > 0)
        drawTwoColumnRow(doc, 'Overtime 175% (weekend)', formatHours(slip.hours_overtime_175));
      if (Number(slip.hours_overtime_200) > 0)
        drawTwoColumnRow(doc, 'Overtime 200% (holiday)', formatHours(slip.hours_overtime_200));
      if (Number(slip.hours_absence) > 0)
        drawTwoColumnRow(doc, 'Absence / היעדרות', formatHours(slip.hours_absence));
      if (Number(slip.hours_vacation) > 0)
        drawTwoColumnRow(doc, 'Vacation / חופשה', formatHours(slip.hours_vacation));
      if (Number(slip.hours_sick) > 0)
        drawTwoColumnRow(doc, 'Sick / מחלה', formatHours(slip.hours_sick));
      if (Number(slip.hours_reserve) > 0)
        drawTwoColumnRow(doc, 'Reserve / מילואים', formatHours(slip.hours_reserve));
      doc.moveDown(0.5);

      // ─── EARNINGS SECTION ───
      doc.fontSize(12).text('Earnings / הכנסות', { underline: true });
      doc.fontSize(10).moveDown(0.3);
      drawTwoColumnRow(doc, 'Base pay / שכר יסוד', formatMoney(slip.base_pay));
      if (Number(slip.overtime_pay) > 0)
        drawTwoColumnRow(doc, 'Overtime / שעות נוספות', formatMoney(slip.overtime_pay));
      if (Number(slip.vacation_pay) > 0)
        drawTwoColumnRow(doc, 'Vacation pay / דמי חופשה', formatMoney(slip.vacation_pay));
      if (Number(slip.sick_pay) > 0)
        drawTwoColumnRow(doc, 'Sick pay / דמי מחלה', formatMoney(slip.sick_pay));
      if (Number(slip.holiday_pay) > 0)
        drawTwoColumnRow(doc, 'Holiday pay / דמי חג', formatMoney(slip.holiday_pay));
      if (Number(slip.bonuses) > 0)
        drawTwoColumnRow(doc, 'Bonuses / בונוסים', formatMoney(slip.bonuses));
      if (Number(slip.commissions) > 0)
        drawTwoColumnRow(doc, 'Commissions / עמלות', formatMoney(slip.commissions));
      if (Number(slip.allowances_meal) > 0)
        drawTwoColumnRow(doc, 'Meal allowance / דמי ארוחה', formatMoney(slip.allowances_meal));
      if (Number(slip.allowances_travel) > 0)
        drawTwoColumnRow(doc, 'Travel allowance / דמי נסיעה', formatMoney(slip.allowances_travel));
      if (Number(slip.allowances_clothing) > 0)
        drawTwoColumnRow(doc, 'Clothing allowance / דמי ביגוד', formatMoney(slip.allowances_clothing));
      if (Number(slip.allowances_phone) > 0)
        drawTwoColumnRow(doc, 'Phone allowance / דמי טלפון', formatMoney(slip.allowances_phone));
      if (Number(slip.other_earnings) > 0)
        drawTwoColumnRow(doc, 'Other / אחר', formatMoney(slip.other_earnings));
      doc.moveDown(0.2);
      doc.fontSize(11);
      drawTwoColumnRow(doc, 'GROSS PAY / שכר ברוטו', formatMoney(slip.gross_pay), true);
      doc.fontSize(10).moveDown(0.5);

      // ─── DEDUCTIONS SECTION ───
      doc.fontSize(12).text('Deductions / ניכויים', { underline: true });
      doc.fontSize(10).moveDown(0.3);
      drawTwoColumnRow(doc, 'Income tax / מס הכנסה', formatMoney(slip.income_tax));
      drawTwoColumnRow(doc, 'National Insurance / ביטוח לאומי', formatMoney(slip.bituach_leumi));
      drawTwoColumnRow(doc, 'Health tax / מס בריאות', formatMoney(slip.health_tax));
      drawTwoColumnRow(doc, 'Pension (employee) / פנסיה עובד', formatMoney(slip.pension_employee));
      if (Number(slip.study_fund_employee) > 0)
        drawTwoColumnRow(doc, 'Study fund (employee) / קרן השתלמות עובד', formatMoney(slip.study_fund_employee));
      if (Number(slip.loans) > 0)
        drawTwoColumnRow(doc, 'Loans / הלוואות', formatMoney(slip.loans));
      if (Number(slip.garnishments) > 0)
        drawTwoColumnRow(doc, 'Garnishments / עיקולים', formatMoney(slip.garnishments));
      if (Number(slip.other_deductions) > 0)
        drawTwoColumnRow(doc, 'Other / אחר', formatMoney(slip.other_deductions));
      doc.moveDown(0.2);
      doc.fontSize(11);
      drawTwoColumnRow(doc, 'TOTAL DEDUCTIONS / סה"כ ניכויים', formatMoney(slip.total_deductions), true);
      doc.fontSize(10).moveDown(0.5);

      // ─── NET PAY ───
      doc.fontSize(14);
      const netY = doc.y;
      doc.rect(40, netY - 2, 515, 28).fillAndStroke('#f0f0f0', '#000');
      doc.fillColor('#000').text(
        `NET PAY / שכר נטו:        ${formatMoney(slip.net_pay)}`,
        45, netY + 4, { width: 505, align: 'center' }
      );
      doc.fontSize(10).moveDown(2);

      // ─── EMPLOYER CONTRIBUTIONS ───
      doc.fontSize(12).text('Employer Contributions / הפרשות מעסיק (informational)', { underline: true });
      doc.fontSize(9).moveDown(0.3);
      drawTwoColumnRow(doc, 'Pension employer / פנסיה מעסיק', formatMoney(slip.pension_employer));
      drawTwoColumnRow(doc, 'Severance / פיצויים', formatMoney(slip.severance_employer));
      if (Number(slip.study_fund_employer) > 0)
        drawTwoColumnRow(doc, 'Study fund employer / קרן השתלמות מעסיק', formatMoney(slip.study_fund_employer));
      drawTwoColumnRow(doc, 'National Insurance employer / ביטוח לאומי מעסיק', formatMoney(slip.bituach_leumi_employer));
      doc.fontSize(10).moveDown(0.5);

      // ─── BALANCES ───
      if (slip.vacation_balance !== null || slip.sick_balance !== null ||
          slip.study_fund_balance !== null || slip.severance_balance !== null) {
        doc.fontSize(12).text('Balances / יתרות', { underline: true });
        doc.fontSize(10).moveDown(0.3);
        if (slip.vacation_balance !== null)
          drawTwoColumnRow(doc, 'Vacation days / ימי חופשה', formatHours(slip.vacation_balance));
        if (slip.sick_balance !== null)
          drawTwoColumnRow(doc, 'Sick days / ימי מחלה', formatHours(slip.sick_balance));
        if (slip.study_fund_balance !== null)
          drawTwoColumnRow(doc, 'Study fund balance / יתרה קה"ש', formatMoney(slip.study_fund_balance));
        if (slip.severance_balance !== null)
          drawTwoColumnRow(doc, 'Severance balance / יתרה פיצויים', formatMoney(slip.severance_balance));
        doc.moveDown(0.5);
      }

      // ─── YTD ───
      if (slip.ytd_gross) {
        doc.fontSize(12).text('Year-to-Date / מתחילת השנה', { underline: true });
        doc.fontSize(9).moveDown(0.3);
        drawTwoColumnRow(doc, 'YTD Gross / ברוטו מצטבר', formatMoney(slip.ytd_gross));
        drawTwoColumnRow(doc, 'YTD Income tax / מס הכנסה מצטבר', formatMoney(slip.ytd_income_tax));
        drawTwoColumnRow(doc, 'YTD Bituach Leumi', formatMoney(slip.ytd_bituach_leumi));
        drawTwoColumnRow(doc, 'YTD Pension', formatMoney(slip.ytd_pension));
        doc.moveDown(0.5);
      }

      // ─── FOOTER ───
      doc.moveDown(1);
      doc.fontSize(8).fillColor('#666');
      doc.text(`Generated ${formatDate(new Date())} | Pay date: ${formatDate(slip.pay_date)}`, { align: 'center' });
      doc.text('This wage slip complies with חוק הגנת השכר תיקון 24 — Wage Protection Law Amendment 24', { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        const stats = fs.statSync(outputPath);
        resolve({ path: outputPath, size: stats.size });
      });
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

function drawTwoColumnRow(doc, label, value, bold = false) {
  const y = doc.y;
  if (bold) doc.font('Helvetica-Bold');
  doc.text(label, 60, y, { width: 280, align: 'left', continued: false });
  doc.text(value, 340, y, { width: 210, align: 'right' });
  if (bold) doc.font('Helvetica');
  doc.moveDown(0.1);
}

module.exports = {
  generateWageSlipPdf,
};
