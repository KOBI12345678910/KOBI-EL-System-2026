/**
 * OCR Service - חילוץ נתונים מחשבוניות
 * כרגע placeholder - ניתן לחבר ל-Tesseract.js, Google Vision, או AI API
 */

/**
 * Parse invoice from file - returns extracted data
 * @param {string} filePath - path to the uploaded file
 * @returns {Promise<object>} - extracted invoice data
 */
async function parseInvoice(filePath) {
  // TODO: Integrate with actual OCR service
  // Options:
  // 1. Tesseract.js (free, local) - npm install tesseract.js
  // 2. Google Cloud Vision API
  // 3. Azure Computer Vision
  // 4. OpenAI Vision API

  return {
    success: false,
    message: 'OCR לא מוגדר. הזן נתונים ידנית.',
    data: {
      supplier_name: null,
      invoice_number: null,
      invoice_date: null,
      amount: null,
      amount_before_vat: null,
      vat_amount: null,
    },
  };
}

/**
 * Extract text from image/PDF for manual review
 */
async function extractText(filePath) {
  try {
    // If tesseract.js is installed, use it
    const Tesseract = require('tesseract.js');
    const { data: { text } } = await Tesseract.recognize(filePath, 'heb+eng');
    return { success: true, text };
  } catch {
    return { success: false, message: 'Tesseract.js לא מותקן. התקן עם npm install tesseract.js' };
  }
}

module.exports = { parseInvoice, extractText };
