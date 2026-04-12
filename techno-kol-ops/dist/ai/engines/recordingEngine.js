"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordingEngine = void 0;
const connection_1 = require("../../db/connection");
// ════════════════════════════════════════════
// ENGINE 11: RECORDING ANALYSIS ENGINE
// מנוע ניתוח הקלטות — שיחות מכירה
// ════════════════════════════════════════════
exports.recordingEngine = {
    // ניתוח שיחת מכירה (transcript)
    async analyzeCallTranscript(data) {
        const analysis = this.analyzeText(data.transcript);
        await (0, connection_1.query)(`
      INSERT INTO call_recordings
        (agent_id, lead_id, transcript, duration_seconds, call_date,
         sentiment_score, talk_ratio_agent, objections_detected,
         price_mentioned, next_step_defined, analysis)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id
    `, [
            data.agent_id, data.lead_id, data.transcript,
            data.duration_seconds, data.call_date,
            analysis.sentiment_score,
            analysis.agent_talk_ratio,
            JSON.stringify(analysis.objections),
            analysis.price_mentioned,
            analysis.has_next_step,
            JSON.stringify(analysis)
        ]);
        return analysis;
    },
    analyzeText(transcript) {
        const words = transcript.toLowerCase().split(/\s+/);
        const totalWords = words.length;
        // ניתוח סנטימנט בסיסי בעברית
        const positiveWords = ['מצוין', 'נהדר', 'אהבתי', 'מושלם', 'בסדר', 'כן', 'מסכים', 'תודה', 'יפה', 'טוב'];
        const negativeWords = ['יקר', 'לא', 'בעיה', 'קשה', 'אחשוב', 'אולי', 'מחיר גבוה', 'מתחרה', 'זול יותר'];
        const objectionWords = ['יקר', 'מחיר', 'תקציב', 'מתחרה', 'אחשוב על זה', 'לא עכשיו', 'נתאם', 'צריך לבדוק'];
        const closingWords = ['מתקדמים', 'בואו', 'נחתום', 'מסכים', 'שלח חוזה', 'אוקיי מחיר', 'ניפגש'];
        const positiveCount = positiveWords.filter(w => transcript.includes(w)).length;
        const negativeCount = negativeWords.filter(w => transcript.includes(w)).length;
        const sentimentScore = Math.round(50 + (positiveCount - negativeCount) * 8);
        const objections = objectionWords.filter(w => transcript.includes(w));
        const priceMentioned = transcript.includes('₪') || transcript.includes('מחיר') || transcript.includes('עלות');
        const hasNextStep = closingWords.some(w => transcript.includes(w));
        // יחס דיבור (הנח שסוכן מדבר 60% מהמילים בממוצע)
        const agentTalkRatio = 0.60;
        const recommendations = [];
        if (agentTalkRatio > 0.65)
            recommendations.push('הסוכן מדבר יותר מדי — תן ללקוח לדבר');
        if (objections.length > 3)
            recommendations.push('הרבה התנגדויות — עבוד על טיפול בהתנגדויות');
        if (!hasNextStep)
            recommendations.push('לא הוגדר שלב הבא — תמיד סגור עם next step');
        if (sentimentScore < 40)
            recommendations.push('סנטימנט שלילי — בדוק מה הרחיק את הלקוח');
        if (sentimentScore > 70 && !hasNextStep)
            recommendations.push('לקוח חיובי אבל לא נסגר — החמצת הזדמנות');
        return {
            sentiment_score: Math.min(100, Math.max(0, sentimentScore)),
            sentiment_label: sentimentScore > 65 ? 'POSITIVE' : sentimentScore > 40 ? 'NEUTRAL' : 'NEGATIVE',
            agent_talk_ratio: agentTalkRatio,
            objections,
            objection_count: objections.length,
            price_mentioned: priceMentioned,
            has_next_step: hasNextStep,
            closing_signals: closingWords.filter(w => transcript.includes(w)),
            word_count: totalWords,
            recommendations,
            score: Math.round(sentimentScore * 0.3 +
                (hasNextStep ? 100 : 20) * 0.3 +
                Math.max(0, 100 - objections.length * 15) * 0.2 +
                Math.max(0, 100 - (agentTalkRatio - 0.5) * 200) * 0.2)
        };
    },
    // סיכום ביצועי שיחות לסוכן
    async agentCallSummary(agentId) {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        COUNT(*) as total_calls,
        AVG(duration_seconds)/60 as avg_duration_min,
        AVG(sentiment_score) as avg_sentiment,
        COUNT(*) FILTER (WHERE next_step_defined=true) as calls_with_next_step,
        AVG((analysis->>'score')::float) as avg_call_score,
        COUNT(*) FILTER (WHERE sentiment_score > 65) as positive_calls
      FROM call_recordings
      WHERE agent_id=$1
        AND call_date >= CURRENT_DATE - INTERVAL '30 days'
    `, [agentId]);
        return rows[0];
    }
};
