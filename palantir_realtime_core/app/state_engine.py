from __future__ import annotations

from app.models import DomainEvent, EntityState, EventType, FreshnessStatus, utc_now
from app.stores import state_store


async def handle_event_for_state(event: DomainEvent) -> None:
    state = state_store.get(event.canonical_entity_id)

    if state is None:
        state = EntityState(
            canonical_entity_id=event.canonical_entity_id,
            tenant_id=event.tenant_id,
            entity_type=event.entity_type,
            current_status="active",
            freshness_status=FreshnessStatus.FRESH,
            last_event_at=event.timestamp,
        )

    state.last_event_at = event.timestamp
    state.updated_at = utc_now()
    state.freshness_status = FreshnessStatus.FRESH

    if event.event_type == EventType.SUPPLIER_DELAYED:
        state.current_status = "at_risk"
        state.risk_score = max(state.risk_score, 0.85)
        if "supplier_delay" not in state.blockers:
            state.blockers.append("supplier_delay")
        if "supplier_delay_alert" not in state.alerts:
            state.alerts.append("supplier_delay_alert")

    elif event.event_type == EventType.INVENTORY_LOW:
        state.current_status = "at_risk"
        state.risk_score = max(state.risk_score, 0.75)
        if "inventory_shortage" not in state.blockers:
            state.blockers.append("inventory_shortage")

    elif event.event_type == EventType.PROJECT_AT_RISK:
        state.current_status = "at_risk"
        state.risk_score = max(state.risk_score, 0.90)

    elif event.event_type == EventType.WORKFLOW_STALLED:
        state.current_status = "blocked"
        if "workflow_stalled" not in state.blockers:
            state.blockers.append("workflow_stalled")
        state.risk_score = max(state.risk_score, 0.70)

    elif event.event_type == EventType.PAYMENT_RECEIVED:
        state.current_status = "active"
        state.properties = getattr(state, "properties", {})

    elif event.event_type == EventType.STATUS_CHANGED:
        new_status = event.payload.get("status")
        if new_status:
            state.current_status = str(new_status)

    state_store.upsert(state)
