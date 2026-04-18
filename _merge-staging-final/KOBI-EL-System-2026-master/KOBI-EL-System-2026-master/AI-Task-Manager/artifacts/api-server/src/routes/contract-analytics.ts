import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { eq, desc, and, ilike, sql } from "drizzle-orm";

const router: IRouter = Router();
const logger = console;

router.post("/contract-analytics/assess-risk/:contractId", async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const { vendorHistory, financialMetrics, complianceStatus } = req.body;
    
    const vendorScore = calculateVendorRisk(vendorHistory);
    const financialScore = calculateFinancialRisk(financialMetrics);
    const complianceScore = calculateComplianceRisk(complianceStatus);
    const performanceScore = calculatePerformanceRisk(vendorHistory);
    
    const overallScore = (vendorScore + financialScore + complianceScore + performanceScore) / 4;
    const riskLevel = getRiskLevel(overallScore);
    
    const riskFactors = identifyRiskFactors({
      vendorScore,
      financialScore,
      complianceScore,
      performanceScore,
      vendorHistory,
      financialMetrics,
      complianceStatus,
    });
    
    const recommendations = generateRecommendations(riskFactors, riskLevel);
    
    const result = await db.execute(
      sql`INSERT INTO contract_risk_assessments (contract_id, overall_risk_score, vendor_risk_score, financial_risk_score, compliance_risk_score, performance_history_score, risk_factors, risk_level, recommendations, analysis_date, analyzed_by)
        VALUES (${parseInt(contractId)}, ${overallScore}, ${vendorScore}, ${financialScore}, ${complianceScore}, ${performanceScore}, ${JSON.stringify(riskFactors)}, ${riskLevel}, ${JSON.stringify(recommendations)}, NOW(), ${req.user?.email || 'system'})
        RETURNING id, overall_risk_score, risk_level`
    );
    
    res.json({ success: true, assessment: result.rows[0] });
  } catch (error: any) {
    logger.error("[Analytics] Risk assessment failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contract-analytics/risk/:contractId", async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const result = await db.execute(
      sql`SELECT * FROM contract_risk_assessments WHERE contract_id = ${parseInt(contractId)} ORDER BY analysis_date DESC LIMIT 1`
    );
    
    res.json(result.rows.length > 0 ? result.rows[0] : { error: "No risk assessment found" });
  } catch (error: any) {
    logger.error("[Analytics] Get risk failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contract-analytics/alerts", async (req: Request, res: Response) => {
  try {
    const { status = "active", limit = 50, offset = 0 } = req.query;
    
    let query = "SELECT id, contract_id, alert_type, severity, message, status, created_at FROM contract_risk_alerts WHERE 1=1";
    const params: any[] = [];
    
    if (status && status !== "all") {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit);
    params.push(offset);
    
    const result = await db.execute(sql.raw(query, params));
    res.json({ alerts: result.rows });
  } catch (error: any) {
    logger.error("[Analytics] Get alerts failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/contract-analytics/alerts/acknowledge/:alertId", async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    
    await db.execute(
      sql`UPDATE contract_risk_alerts SET status = 'acknowledged', acknowledged_by = ${req.user?.email || 'system'}, acknowledged_at = NOW() WHERE id = ${parseInt(alertId)}`
    );
    
    res.json({ success: true });
  } catch (error: any) {
    logger.error("[Analytics] Acknowledge alert failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contract-analytics/insights/:contractId", async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const result = await db.execute(
      sql`SELECT id, insight_type, title, description, confidence, actionable, priority FROM contract_insights WHERE contract_id = ${parseInt(contractId)} ORDER BY generated_at DESC`
    );
    
    res.json({ insights: result.rows });
  } catch (error: any) {
    logger.error("[Analytics] Get insights failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/contract-analytics/generate-insights/:contractId", async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const { riskAssessment, contractData } = req.body;
    
    const insights = generateInsights(riskAssessment, contractData);
    
    for (const insight of insights) {
      await db.execute(
        sql`INSERT INTO contract_insights (contract_id, insight_type, title, description, data_points, confidence, actionable, suggested_action, category, priority, generated_at)
          VALUES (${parseInt(contractId)}, ${insight.type}, ${insight.title}, ${insight.description}, ${JSON.stringify(insight.dataPoints)}, ${insight.confidence}, ${insight.actionable}, ${insight.suggestedAction}, ${insight.category}, ${insight.priority}, NOW())`
      );
    }
    
    res.json({ success: true, insightsCount: insights.length });
  } catch (error: any) {
    logger.error("[Analytics] Generate insights failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contract-analytics/predictions/:contractId", async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const result = await db.execute(
      sql`SELECT id, prediction_type, prediction_value, confidence, trend, forecasted_outcome FROM predictive_analytics_data WHERE contract_id = ${parseInt(contractId)} AND valid_until > NOW() ORDER BY generated_at DESC`
    );
    
    res.json({ predictions: result.rows });
  } catch (error: any) {
    logger.error("[Analytics] Get predictions failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/contract-analytics/predict/:contractId/:predictionType", async (req: Request, res: Response) => {
  try {
    const { contractId, predictionType } = req.params;
    const { historicalData } = req.body;
    
    const prediction = generatePrediction(predictionType, historicalData);
    
    const result = await db.execute(
      sql`INSERT INTO predictive_analytics_data (contract_id, prediction_type, prediction_value, confidence, time_horizon, factors, historical_data, trend, forecasted_outcome, generated_at, valid_until)
        VALUES (${parseInt(contractId)}, ${predictionType}, ${prediction.value}, ${prediction.confidence}, ${prediction.timeHorizon}, ${JSON.stringify(prediction.factors)}, ${JSON.stringify(historicalData)}, ${prediction.trend}, ${prediction.outcome}, NOW(), NOW() + INTERVAL '30 days')
        RETURNING id, prediction_value, confidence`
    );
    
    res.json({ success: true, prediction: result.rows[0] });
  } catch (error: any) {
    logger.error("[Analytics] Predict failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contract-analytics/dashboard/:contractId", async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    
    const riskResult = await db.execute(
      sql`SELECT overall_risk_score, risk_level, risk_factors FROM contract_risk_assessments WHERE contract_id = ${parseInt(contractId)} ORDER BY analysis_date DESC LIMIT 1`
    );
    
    const alertsResult = await db.execute(
      sql`SELECT severity, status, COUNT(*) as count FROM contract_risk_alerts WHERE contract_id = ${parseInt(contractId)} GROUP BY severity, status`
    );
    
    const insightsResult = await db.execute(
      sql`SELECT priority, COUNT(*) as count FROM contract_insights WHERE contract_id = ${parseInt(contractId)} GROUP BY priority`
    );
    
    const predictionsResult = await db.execute(
      sql`SELECT prediction_type, prediction_value, confidence FROM predictive_analytics_data WHERE contract_id = ${parseInt(contractId)} AND valid_until > NOW() ORDER BY generated_at DESC LIMIT 5`
    );
    
    res.json({
      risk: riskResult.rows[0] || {},
      alerts: alertsResult.rows || [],
      insights: insightsResult.rows || [],
      predictions: predictionsResult.rows || [],
    });
  } catch (error: any) {
    logger.error("[Analytics] Dashboard failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contract-analytics/portfolio-summary", async (req: Request, res: Response) => {
  try {
    const riskDistribution = await db.execute(
      sql`SELECT risk_level, COUNT(*) as count FROM contract_risk_assessments GROUP BY risk_level`
    );
    
    const avgRiskScore = await db.execute(
      sql`SELECT AVG(overall_risk_score) as avg_score FROM contract_risk_assessments`
    );
    
    const activeAlerts = await db.execute(
      sql`SELECT COUNT(*) as count FROM contract_risk_alerts WHERE status = 'active'`
    );
    
    const topRisks = await db.execute(
      sql`SELECT contract_id, overall_risk_score, risk_level FROM contract_risk_assessments ORDER BY overall_risk_score DESC LIMIT 10`
    );
    
    res.json({
      riskDistribution: riskDistribution.rows,
      averageRiskScore: avgRiskScore.rows[0]?.avg_score || 0,
      activeAlertCount: activeAlerts.rows[0]?.count || 0,
      topRisks: topRisks.rows,
    });
  } catch (error: any) {
    logger.error("[Analytics] Portfolio summary failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

function calculateVendorRisk(vendorHistory: any): number {
  if (!vendorHistory) return 50;
  let score = 50;
  if (vendorHistory.pastViolations) score += 20;
  if (vendorHistory.financialInstability) score += 15;
  if (vendorHistory.poorPaymentHistory) score += 10;
  return Math.min(score, 100);
}

function calculateFinancialRisk(metrics: any): number {
  if (!metrics) return 50;
  let score = 50;
  if (metrics.highContractValue) score += 15;
  if (metrics.unfavorableTerms) score += 10;
  if (metrics.lowMargin) score += 10;
  return Math.min(score, 100);
}

function calculateComplianceRisk(status: any): number {
  if (!status) return 50;
  let score = 50;
  if (status.missingClauses) score += 20;
  if (status.regulatoryIssues) score += 15;
  if (status.complianceGaps) score += 10;
  return Math.min(score, 100);
}

function calculatePerformanceRisk(history: any): number {
  if (!history) return 50;
  let score = 50;
  if (history.missedDeadlines) score += 15;
  if (history.qualityIssues) score += 12;
  if (history.serviceDisruptions) score += 10;
  return Math.min(score, 100);
}

function getRiskLevel(score: number): string {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function identifyRiskFactors(data: any): string[] {
  const factors: string[] = [];
  if (data.vendorScore > 70) factors.push("Vendor history concerns");
  if (data.financialScore > 70) factors.push("Financial risk indicators");
  if (data.complianceScore > 70) factors.push("Compliance gaps identified");
  if (data.performanceScore > 70) factors.push("Performance history issues");
  if (data.vendorHistory?.pastViolations) factors.push("Previous violations on record");
  return factors;
}

function generateRecommendations(factors: string[], riskLevel: string): string[] {
  const recommendations: string[] = [];
  if (riskLevel === "critical") {
    recommendations.push("Conduct immediate contract review and renegotiation");
    recommendations.push("Increase monitoring frequency to weekly");
  }
  if (factors.includes("Vendor history concerns")) {
    recommendations.push("Request additional vendor references");
    recommendations.push("Consider performance bonds");
  }
  if (factors.includes("Financial risk indicators")) {
    recommendations.push("Implement milestone-based payment schedule");
    recommendations.push("Request financial statements for verification");
  }
  recommendations.push("Schedule risk mitigation meeting with vendor");
  return recommendations;
}

function generateInsights(riskAssessment: any, contractData: any): any[] {
  const insights: any[] = [];
  
  if (riskAssessment.overall_risk_score > 70) {
    insights.push({
      type: "risk_trend",
      title: "High Risk Contract Detected",
      description: `Contract shows overall risk score of ${riskAssessment.overall_risk_score}`,
      dataPoints: [riskAssessment.overall_risk_score],
      confidence: 95,
      actionable: true,
      suggestedAction: "Review contract terms and vendor performance",
      category: "risk",
      priority: "high",
    });
  }
  
  if (contractData?.renewalDate) {
    const daysToRenewal = Math.floor((new Date(contractData.renewalDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (daysToRenewal < 90 && daysToRenewal > 0) {
      insights.push({
        type: "renewal_approaching",
        title: "Contract Renewal Upcoming",
        description: `Contract renewal in ${daysToRenewal} days`,
        dataPoints: [daysToRenewal],
        confidence: 100,
        actionable: true,
        suggestedAction: "Begin renewal negotiations",
        category: "renewal",
        priority: "high",
      });
    }
  }
  
  return insights;
}

function generatePrediction(type: string, historicalData: any): any {
  const baseConfidence = 75 + Math.random() * 15;
  
  switch (type) {
    case "renewal_success":
      return {
        value: 0.85,
        confidence: baseConfidence,
        timeHorizon: "30_days",
        factors: ["vendor_history", "payment_performance", "service_quality"],
        trend: "stable",
        outcome: "Likely to renew",
      };
    case "cost_escalation":
      return {
        value: 1.05,
        confidence: baseConfidence,
        timeHorizon: "90_days",
        factors: ["inflation", "vendor_margin", "market_conditions"],
        trend: "increasing",
        outcome: "5% cost increase expected",
      };
    case "performance_risk":
      return {
        value: 0.2,
        confidence: baseConfidence,
        timeHorizon: "60_days",
        factors: ["resource_availability", "vendor_capacity", "demand_forecast"],
        trend: "stable",
        outcome: "Low performance risk",
      };
    default:
      return {
        value: 0.5,
        confidence: 50,
        timeHorizon: "30_days",
        factors: [],
        trend: "unknown",
        outcome: "Unable to predict",
      };
  }
}

export default router;
