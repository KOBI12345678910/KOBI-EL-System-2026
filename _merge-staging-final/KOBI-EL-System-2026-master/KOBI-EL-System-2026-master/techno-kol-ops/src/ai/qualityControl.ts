// Quality control checklists — stage + category aware
export const qualityEngine = {
  getQualityChecklist(stage: string, category: string): string[] {
    const base: Record<string, string[]> = {
      pre_production: ['בדוק מידות מול שרטוט', 'בדוק איכות חומר גלם', 'ודא כל כלים זמינים'],
      production: ['ריתוכים ישרים ונקיים', 'מידות תואמות ±2 מ"מ', 'פינות חלקות'],
      pre_paint: ['ניקוי מלא משומן וחלודה', 'פנסים סגורים', 'אזורים מכוסים'],
      post_paint: ['כיסוי אחיד', 'אין זליגות', 'עובי מינימום 80 מיקרון'],
      pre_install: ['בדיקת תחום עבודה', 'ודא חומרי עזר', 'בדיקת בטיחות'],
      installation: ['פלס תקין', 'חיזוקים לפי תקן', 'בטיחות ילדים (מרווחים)'],
      final: ['בדיקת פונקציונליות', 'תיעוד צילומי', 'חתימת לקוח', 'ניקיון אתר'],
    };
    const categorySpecific: Record<string, string[]> = {
      railings: ['גובה 105 ס"מ מינימום', 'מרווח ≤10 ס"מ', 'עמודים יציבים'],
      gates: ['פתיחה חלקה', 'מנעול תקין', 'צירים כבדים'],
      fences: ['יסודות בטון', 'מרווחים אחידים', 'ללא חדים'],
    };
    return [...(base[stage] || []), ...(categorySpecific[category] || [])];
  },
};
