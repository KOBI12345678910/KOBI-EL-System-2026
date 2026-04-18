# Intelligence Permission Matrix (Mega Batch 00057/00058)

Generated: 2026-04-18
Scope: 15 intelligence models — RLS baseline + RBAC mapping.

## 1. Role inventory

| role_code | label_he | domain scope |
|---|---|---|
| `intelligence_analyst` | אנליסט בינה | CRUD on feedback, read all, actions on insights/anomalies/recommendations |
| `intelligence_admin`   | מנהל בינה   | CRUD on all models, can configure flows + prompt_templates |
| `super_admin`          | מנהל מערכת  | all DELETE + full config control |

## 2. Matrix (per endpoint)

Endpoints mount under `/api/intelligence/…`. `R` = read (GET), `C` = create (POST), `U` = update (PUT), `D` = soft-delete, `A` = action endpoint (POST business transitions).

| Endpoint / Model | Analyst | Admin | SuperAdmin |
|---|---|---|---|
| `GET /ai-insights`                         | R | R | R |
| `GET /ai-insights/:id`                     | R | R | R |
| `POST /ai-insights`                        | — | C | C |
| `PUT /ai-insights/:id`                     | U (status,notes) | U | U |
| `DELETE /ai-insights/:id`                  | — | D | D + hard |
| `POST /ai-insights/:id/acknowledge`        | A | A | A |
| `POST /ai-insights/:id/action`             | A | A | A |
| `POST /ai-insights/:id/dismiss`            | A | A | A |
| `GET /anomaly-cases`                       | R | R | R |
| `GET /anomaly-cases/:id`                   | R | R | R |
| `POST /anomaly-cases`                      | — | C | C |
| `PUT /anomaly-cases/:id`                   | U (status,notes) | U | U |
| `DELETE /anomaly-cases/:id`                | — | D | D + hard |
| `POST /anomaly-cases/:id/resolve`          | A | A | A |
| `POST /anomaly-cases/:id/false-positive`   | A | A | A |
| `GET /decision-recommendations`            | R | R | R |
| `POST /decision-recommendations`           | — | C | C |
| `PUT /decision-recommendations/:id`        | U (status,notes) | U | U |
| `DELETE /decision-recommendations/:id`     | — | D | D + hard |
| `POST /decision-recommendations/:id/accept`| A | A | A |
| `POST /decision-recommendations/:id/reject`| A | A | A |
| `GET /forecast-models`                     | R | R | R |
| `POST /forecast-models`                    | — | C | C |
| `PUT /forecast-models/:id`                 | — | U | U |
| `DELETE /forecast-models/:id`              | — | D | D |
| `GET /forecast-models/:id/executions`      | R | R | R |
| `GET /trend-signals` / CRUD                | R / — | CRUD | CRUD+DEL |
| `GET /seasonality-patterns` / CRUD         | R / — | CRUD | CRUD+DEL |
| `GET /quality-scores` / CRUD               | R / — | CRUD | CRUD+DEL |
| `GET /agents` (agent_registry)             | R | R | R |
| `POST /agents`                             | — | C | C |
| `PUT /agents/:id`                          | — | U | U |
| `DELETE /agents/:id`                       | — | — | D |
| `GET /agent-jobs` / CRUD                   | R | CRUD | CRUD+DEL |
| `POST /agent-jobs/enqueue`                 | A | A | A |
| `POST /agent-jobs/:id/cancel`              | A | A | A |
| `GET /model-registry` / CRUD               | R | CRUD | CRUD+DEL |
| `GET /model-executions` / CRUD             | R | R+U | CRUD+DEL |
| `POST /model-executions/:id/rerun`         | — | A | A |
| `GET /recommendation-feedback`             | R+C | CRUD | CRUD+DEL |
| `GET /anomaly-feedback`                    | R+C | CRUD | CRUD+DEL |
| `GET /prompt-templates`                    | R | CRUD | CRUD+DEL |
| `POST /prompt-templates`                   | — | C | C |
| `PUT /prompt-templates/:id`                | — | U | U |
| `POST /prompt-templates/:id/test-run`      | A | A | A |
| `DELETE /prompt-templates/:id`             | — | D | D |
| `GET /orchestration-flows`                 | R | CRUD | CRUD+DEL |
| `POST /orchestration-flows`                | — | C | C |
| `PUT /orchestration-flows/:id`             | — | U | U |
| `POST /orchestration-flows/:id/trigger`    | — | A | A |
| `DELETE /orchestration-flows/:id`          | — | — | D |

## 3. RLS (row-level security) — baseline policies

Applied to all 15 intelligence tables in 00057 Part F:

- `<tbl>_authenticated_read` — SELECT to any authenticated user
- `<tbl>_analyst_write` — INSERT + UPDATE to any authenticated/service-role user (role filtering enforced at API layer)
- `<tbl>_admin_delete` — DELETE only for super_admin or service_role

API layer (`api-server/src/routes/intelligence/*`) protects mutations via `authMiddleware`; role-level checks are enforced at the application level per the matrix above.

## 4. Status lifecycles (CHECK constraints)

- `ai_insight.status ∈ {generated, published, acknowledged, actioned, dismissed}`
- `anomaly_case.status ∈ {open, investigating, resolved, false_positive}`
- `decision_recommendation.status ∈ {pending, accepted, rejected, expired}`
- `agent_job.status ∈ {queued, running, completed, failed}`
- `model_execution.status ∈ {queued, running, complete, failed}`
- `orchestration_flow.status ∈ {draft, active, paused, completed}`

## 5. Route → Zod → table → page cross-reference

| page | route | primary model | zod module |
|---|---|---|---|
| AIInsightsPage         | /ai-insights          | ai_insights              | `intelligence/ai-insights.ts` |
| AnomalyCasesPage       | /anomalies            | anomaly_cases            | `intelligence/anomaly-cases.ts` |
| RecommendationCenterPage | /recommendations    | decision_recommendations | `intelligence/decision-recommendations.ts` |
| ForecastModelsPage     | /forecast-models      | forecast_models          | `intelligence/forecast-models.ts` |
| AgentRegistryPage      | /agents               | agent_registry           | `intelligence/agent-registry.ts` |
| AgentJobsPage          | /agent-jobs           | agent_jobs               | `intelligence/agent-jobs.ts` |
| OrchestrationFlowsPage | /orchestration-flows  | orchestration_flows      | `intelligence/orchestration-flows.ts` |
| PromptTemplatesPage    | /prompt-templates     | prompt_templates         | `intelligence/prompt-templates.ts` |
| ProcessMiningPage      | /process-mining       | cross-cutting read-only  | — |
