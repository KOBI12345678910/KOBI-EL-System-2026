// ══════════════════════════════════════════════════════════════════
// MODULE: SEO Content Generator
// מודול שמייצר תוכן SEO אוטומטית עבור שני העסקים
// ══════════════════════════════════════════════════════════════════
//
// אסטרטגיה:
//   1. מזהה פערי תוכן (content gaps) לכל עסק
//   2. מייצר כותרות, meta descriptions, body outlines
//   3. מתרגם לאנגלית + צרפתית (לקובי אלקיים)
//   4. שומר תוכן מוכן ב-state
//   5. מנטר ביצועי SEO של תוכן שפורסם

const SeoContentGeneratorModule = {
  name: "seo_content_generator",
  description: "Generates SEO content for both businesses",

  _topicPipeline: [
    // Techno-Kol Uzi topics
    { business: "techno_kol_uzi", keyword: "מעקות לבית פרטי", language: "he", status: "pending" },
    { business: "techno_kol_uzi", keyword: "שערים חשמליים מחיר", language: "he", status: "pending" },
    { business: "techno_kol_uzi", keyword: "פרגולות יוקרה גוש דן", language: "he", status: "pending" },
    { business: "techno_kol_uzi", keyword: "גדר אלומיניום התקנה", language: "he", status: "pending" },
    // Elkayam Real Estate topics (multilingual)
    { business: "elkayam_real_estate", keyword: "luxury apartments tel aviv investment", language: "en", status: "pending" },
    { business: "elkayam_real_estate", keyword: "investir immobilier tel aviv", language: "fr", status: "pending" },
    { business: "elkayam_real_estate", keyword: "tel aviv penthouse foreign buyer", language: "en", status: "pending" },
    { business: "elkayam_real_estate", keyword: "appartement luxe israel achat", language: "fr", status: "pending" },
  ],

  async run(state, brain, alerts) {
    // Get 2 pending topics per cycle so we don't burn tokens
    const pipeline = this._topicPipeline.filter(t => t.status === "pending").slice(0, 2);
    if (pipeline.length === 0) {
      Logger.info?.("SEO", "Pipeline empty — nothing to generate this cycle");
      return;
    }

    const generated = [];
    for (const topic of pipeline) {
      const langHint =
        topic.language === "en" ? "Write in clear, persuasive English for English-speaking investors."
        : topic.language === "fr" ? "Écrivez en français persuasif pour investisseurs francophones."
        : "כתוב בעברית מקצועית ומעוררת-פעולה לקהל ישראלי.";

      const content = await brain.think(`
Generate SEO content for:
- business: ${topic.business}
- keyword: ${topic.keyword}
- language: ${topic.language}

${langHint}

Return JSON with these keys:
{
  "title": "...",
  "meta_description": "... (150-160 chars)",
  "h1": "...",
  "sections": [
    { "heading": "...", "points": ["...", "..."] }
  ],
  "call_to_action": "...",
  "internal_links": ["...", "..."],
  "target_word_count": 1200
}
`);

      const extractJSON = require("../nexus-engine.js").extractJSON;
      const parsed = extractJSON(content);

      if (parsed) {
        topic.status = "ready";
        topic.generated_at = new Date().toISOString();
        topic.content = parsed;
        generated.push(topic);
        state.addMemory("longTerm", {
          type: "seo_content_generated",
          business: topic.business,
          keyword: topic.keyword,
          language: topic.language,
          title: parsed.title,
        });
      }
    }

    state.update("modules.seo_content_generator.total_ready",
      (state.get("modules.seo_content_generator.total_ready") ?? 0) + generated.length);
    state.update("modules.seo_content_generator.last_generated", generated);

    if (generated.length > 0) {
      alerts.addAlert(
        "success",
        "SEO content ready",
        `${generated.length} pieces generated and ready for review`,
        { topics: generated.map(g => ({ keyword: g.keyword, language: g.language })) }
      );
    }
  },
};

module.exports = SeoContentGeneratorModule;
