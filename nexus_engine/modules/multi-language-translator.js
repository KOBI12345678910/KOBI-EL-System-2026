// ══════════════════════════════════════════════════════════════════
// MODULE: Multi-Language Translator
// מודול שמתרגם ומתאים תוכן בין עברית/אנגלית/צרפתית — עם שימור טון
// ══════════════════════════════════════════════════════════════════
//
// אסטרטגיה:
//   1. מקבל תוכן בשפה מקור
//   2. מתרגם לשפות יעד (EN / FR)
//   3. מתאים לתרבות היעד — לא רק מילים, אלא טון + דוגמאות
//   4. שומר glossary של מונחי מפתח (luxury, penthouse, investment)
//   5. מוודא עקביות בין תרגומים של אותו מותג

const MultiLanguageTranslatorModule = {
  name: "multi_language_translator",
  description: "Translates + localizes content between Hebrew/English/French preserving brand tone",

  // Brand glossary — ensures consistency across translations
  _glossary: {
    elkayam_real_estate: {
      "he->en": {
        "קובי אלקיים נדל\"ן": "Elkayam Luxury Real Estate",
        "דירת יוקרה": "luxury apartment",
        "פנטהאוז": "penthouse",
        "משקיע בינלאומי": "international investor",
        "תל אביב": "Tel Aviv",
        "יוקרתי": "luxurious",
      },
      "he->fr": {
        "קובי אלקיים נדל\"ן": "Elkayam Immobilier de Luxe",
        "דירת יוקרה": "appartement de luxe",
        "פנטהאוז": "penthouse",
        "משקיע בינלאומי": "investisseur international",
        "תל אביב": "Tel Aviv",
        "יוקרתי": "luxueux",
      },
    },
    techno_kol_uzi: {
      "he->en": {
        "טכנו כל עוזי": "Techno-Kol Uzi",
        "מעקה": "railing",
        "שער": "gate",
        "גדר": "fence",
        "פרגולה": "pergola",
      },
    },
  },

  // Content pipeline — pending items waiting for translation
  _pipeline: [
    {
      id: "cnt_001",
      business: "elkayam_real_estate",
      source_language: "he",
      target_languages: ["en", "fr"],
      source_text: "דירת 5 חדרים, 180 מ\"ר, נוף מושלם לים, בניין חדש בלב תל אביב. משקיעים בינלאומיים — הזדמנות נדירה.",
      type: "listing_description",
      status: "pending",
    },
    {
      id: "cnt_002",
      business: "elkayam_real_estate",
      source_language: "he",
      target_languages: ["en", "fr"],
      source_text: "פנטהאוז 250 מ\"ר עם בריכה פרטית, 3 חניות, גינת גג ענקית. מחיר מיוחד למשקיעים.",
      type: "listing_description",
      status: "pending",
    },
    {
      id: "cnt_003",
      business: "techno_kol_uzi",
      source_language: "he",
      target_languages: ["en"],
      source_text: "פרגולות אלומיניום באיכות גבוהה, התקנה מקצועית תוך שבועיים. אחריות 15 שנה.",
      type: "product_description",
      status: "pending",
    },
  ],

  async run(state, brain, alerts) {
    const pending = this._pipeline.filter(p => p.status === "pending").slice(0, 2);
    if (pending.length === 0) return;

    const translations = [];
    for (const item of pending) {
      const results = { id: item.id, business: item.business, type: item.type, translations: {} };

      for (const targetLang of item.target_languages) {
        const glossaryKey = `${item.source_language}->${targetLang}`;
        const glossary = this._glossary[item.business]?.[glossaryKey] || {};
        const glossaryText = Object.entries(glossary)
          .map(([k, v]) => `  "${k}" → "${v}"`)
          .join("\n");

        const prompt = `
Translate the following from ${item.source_language.toUpperCase()} to ${targetLang.toUpperCase()}.
IMPORTANT: Preserve brand tone. Adapt culturally (not just word-for-word).

Brand glossary (use these exact translations):
${glossaryText}

Source text:
"${item.source_text}"

Return ONLY the translated text — no explanation, no markdown.`;

        const translated = await brain.think(prompt);
        if (translated) {
          results.translations[targetLang] = String(translated).trim();
        }
      }

      item.status = "translated";
      item.translated_at = new Date().toISOString();
      translations.push(results);

      state.addMemory("longTerm", {
        type: "translation_completed",
        content_id: item.id,
        business: item.business,
        target_languages: Object.keys(results.translations),
      });
    }

    state.update("modules.multi_language_translator.last_translations", translations);
    if (translations.length > 0) {
      alerts.addAlert(
        "success",
        "Translations ready",
        `${translations.length} content pieces translated`,
        { items: translations.map(t => t.id) }
      );
    }
  },
};

module.exports = MultiLanguageTranslatorModule;
