# DOMAIN — intelligence

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `intelligence` (plus planned `ai_automation.*`) |
| Evidence | `B-E013` `B-E015` `B-E016` DISCOVERY §B §D |

## 1. domain_checklist

### expected_models (15)
ai_insights, anomaly_cases, anomaly_feedback, decision_recommendations, forecast_models, model_executions, quality_scores, recommendation_feedback, seasonality_patterns, trend_signals, agent_jobs, agent_registry, model_registry — plus planned: automation_rules, automation_runs, ai_agents, ai_actions, prediction_outputs, recommendation_logs, prompt_templates, orchestration_flows

### required_pages
AIInsightsFeed, AnomalyCasesList, AnomalyCase360, ForecastsPage, DecisionRecommendationsPage, AgentsConsole (admin), ModelsRegistryAdmin (admin), AutomationRulesPage (planned), PromptTemplatesPage (planned), OrchestrationFlowsPage (planned)

### required_forms
ProvideFeedback (anomaly/recommendation), ApproveAction (from AI), NewAutomationRule, EditPromptTemplate, NewAIAgent

### required_routes
`/intelligence/insights`, `/intelligence/anomalies`, `/intelligence/anomaly/:id`, `/intelligence/forecasts`, `/intelligence/recommendations`, `/intelligence/agents`, `/intelligence/models`, `/intelligence/automations`, `/intelligence/prompts`, `/intelligence/flows`

### required_reports
forecast_accuracy_report, anomaly_resolution_report, recommendation_adoption_report, agent_performance_report

### required_dashboards
AIControlRoom (registered but invisible), InsightsDashboard, AnomalyDashboard

### required_flows
- anomaly detect → case → action → feedback loop
- forecast → recommendation → decision → execute → outcome loop
- agent-task dispatch flow

### critical_relations
- anomaly_cases 1—* anomaly_feedback
- forecast_models 1—* model_executions
- decision_recommendations 1—* recommendation_feedback
- agent_registry 1—* agent_jobs; model_registry 1—* model_executions

### completion_gate
- intelligence area CANNOT be 0% exposed if business-facing — **currently 0% per INVISIBLE_MENU_ITEMS**
- every engine (223 per INVISIBLE_MENU_ITEMS) needs user_facing / admin_only / internal_only decision
- prompt_templates + orchestration_flows need decisions

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables intelligence.* | 13 |
| Registry models | 0 full + 15 partial |
| API engines | 36+ AI engines (per INVISIBLE_MENU_ITEMS) |
| Pages | 0 user-facing (ai-sandbox experimental) |
| Menu entries | 0 intelligence.* coverage |
| Dashboards | AIControlRoom registered, hidden |
| Reports | 0 connected |

## 3. GAPS — everything is red

| class | items |
|---|---|
| **planned_locked (8)** | automation_rules, automation_runs, ai_agents, ai_actions, prediction_outputs, recommendation_logs, prompt_templates, orchestration_flows |
| **built_not_exposed (13)** | all 13 intelligence.* tables |
| **223 engines** | need per-engine decision: user_facing / admin_only / internal_only |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | decide intelligence menu root — create `/intelligence` category with Insights + Anomalies + Forecasts + Recommendations |
| build_now (Phase 10) | wire AIControlRoom; wire AIInsightsFeed; wire AnomalyCases360 |
| internal_only | model_executions, seasonality_patterns, trend_signals, quality_scores (detector outputs), agent_jobs, agent_registry, model_registry (ops tables) |
| postpone | digital_twin, process_mining, knowledge_graph (Phase 13 intelligence-advanced) |
| remove_from_registry | N/A |

## 5. DEPLOYMENT

0/13 tables verified; pending.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 5 |
| business_readiness | blocked |
| gate_status | blocked — 0% menu exposure is a domain-level gate failure |
| red rows | 13 |
