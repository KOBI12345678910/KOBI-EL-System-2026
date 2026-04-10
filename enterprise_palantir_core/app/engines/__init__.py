"""
Production engine layer.

Every engine here is an abstraction that works in-process by default
(so the platform boots on sqlite/replit without extra services) but is
a drop-in swap for a production backend:

  event_bus_abstraction → in-process / Kafka / NATS
  redis_cache           → in-memory dict / real Redis
  workflow_engine       → real state machine runtime on top of the ORM
  alert_engine          → rule-driven alert system
  policy_engine         → guardrail policy evaluator
  action_engine         → action request → approval → execution → rollback
  cdc_framework         → polling + Postgres logical replication abstractions
  graph_traversal       → BFS / shortest-path over ontology relationships
  claude_adapter        → Claude API bridge with context packet builder
  schema_registry       → versioned schemas with compatibility checks
  identity_resolution   → deterministic + fuzzy entity resolution

These live under app/engines/ so they don't clash with the
domain-level app/services/ (which are thin wrappers used by the API).
"""
