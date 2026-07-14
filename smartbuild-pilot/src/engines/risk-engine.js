/**
 * SmartBuild Pilot 2.0 — Risk Engine (מרשם סיכונים ומפת חום)
 */

'use strict';

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

function levelOf(score) {
  if (score >= 20) return 'critical';
  if (score > 12) return 'high';
  if (score > 6) return 'medium';
  return 'low';
}

function computeRisks(store, projectId) {
  const risks = store.find('risk', (r) => r.project_id === projectId);
  const register = risks.map((r) => {
    const score = n(r.probability) * n(r.impact);
    return Object.assign({}, r, { score, level: levelOf(score) });
  }).sort((a, b) => b.score - a.score);

  // heatmap[impact-1][probability-1] = מספר סיכונים פתוחים
  const heatmap = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (const r of register) {
    if (r.status === 'closed') continue;
    const i = Math.min(5, Math.max(1, n(r.impact))) - 1;
    const p = Math.min(5, Math.max(1, n(r.probability))) - 1;
    heatmap[i][p] += 1;
  }

  const byCategory = {};
  for (const r of register) {
    if (!byCategory[r.category]) byCategory[r.category] = { count: 0, maxScore: 0 };
    byCategory[r.category].count += 1;
    byCategory[r.category].maxScore = Math.max(byCategory[r.category].maxScore, r.score);
  }

  const open = register.filter((r) => r.status !== 'closed');
  return {
    register,
    heatmap,
    topRisks: register.slice(0, 5),
    byCategory,
    openCount: open.length,
    avgScore: open.length
      ? Math.round((open.reduce((a, r) => a + r.score, 0) / open.length) * 100) / 100 : 0,
  };
}

module.exports = { computeRisks };
