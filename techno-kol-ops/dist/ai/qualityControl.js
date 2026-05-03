"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qualityEngine = void 0;
// Quality control checklists — stage + category aware
exports.qualityEngine = {
    getQualityChecklist(stage, category) {
        const base = {
            pre_production: ['בדוק מידות מול שרטוט', 'בדוק איכות חומר גלם', 'ודא כל כלים זמינים'],
            production: ['ריתוכים ישרים ונקיים', 'מידות תואמות ±2 מ"מ', 'פינות חלקות'],
            pre_paint: ['ניקוי מלא משומן וחלודה', 'פנסים סגורים', 'אזורים מכוסים'],
            post_paint: ['כיסוי אחיד', 'אין זליגות', 'עובי מינימום 80 מיקרון'],
            pre_install: ['בדיקת תחום עבודה', 'ודא חומרי עזר', 'בדיקת בטיחות'],
            installation: ['פלס תקין', 'חיזוקים לפי תקן', 'בטיחות ילדים (מרווחים)'],
            final: ['בדיקת פונקציונליות', 'תיעוד צילומי', 'חתימת לקוח', 'ניקיון אתר'],
        };
        const categorySpecific = {
            railings: ['גובה 105 ס"מ מינימום', 'מרווח ≤10 ס"מ', 'עמודים יציבים'],
            gates: ['פתיחה חלקה', 'מנעול תקין', 'צירים כבדים'],
            fences: ['יסודות בטון', 'מרווחים אחידים', 'ללא חדים'],
        };
        return [...(base[stage] || []), ...(categorySpecific[category] || [])];
    },
};
