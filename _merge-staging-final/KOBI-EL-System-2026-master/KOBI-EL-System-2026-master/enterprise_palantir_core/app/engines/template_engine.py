"""
Template Engine — Jinja-lite templating for notifications, reports,
and AI prompts.

Supports:
  - {{ variable }}            substitution
  - {{ nested.path }}         nested attribute access
  - {% if condition %} ... {% endif %}   simple conditionals
  - {% for item in list %} ... {% endfor %}  loops
  - Filters: | upper | lower | title | currency | percent | round(2)

Zero dependencies (no Jinja2 required). Designed for template bodies
< 10KB so simple regex-based parsing is fast enough.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class RenderedTemplate:
    template_id: str
    rendered: str
    variables_used: List[str]
    rendered_at: datetime


class TemplateEngine:
    VARIABLE_RE = re.compile(r"\{\{\s*([\w\.]+)(?:\s*\|\s*([\w\(\)\d\.]+))?\s*\}\}")
    IF_RE = re.compile(r"\{%\s*if\s+([\w\.]+)\s*%\}(.*?)\{%\s*endif\s*%\}", re.DOTALL)
    FOR_RE = re.compile(r"\{%\s*for\s+(\w+)\s+in\s+([\w\.]+)\s*%\}(.*?)\{%\s*endfor\s*%\}", re.DOTALL)

    def __init__(self) -> None:
        self._templates: Dict[str, str] = {}
        self._filters: Dict[str, Callable[[Any], str]] = self._default_filters()

    def register_template(self, template_id: str, template: str) -> None:
        self._templates[template_id] = template

    def render(self, template_id: str, context: Dict[str, Any]) -> RenderedTemplate:
        template = self._templates.get(template_id)
        if template is None:
            raise ValueError(f"template not found: {template_id}")
        rendered, used = self._render_string(template, context)
        return RenderedTemplate(
            template_id=template_id,
            rendered=rendered,
            variables_used=sorted(used),
            rendered_at=utc_now(),
        )

    def render_inline(self, template: str, context: Dict[str, Any]) -> str:
        rendered, _ = self._render_string(template, context)
        return rendered

    def list_templates(self) -> List[str]:
        return sorted(self._templates.keys())

    # ─── Rendering ───────────────────────────────────────────
    def _render_string(self, template: str, context: Dict[str, Any]) -> tuple:
        used: set = set()

        # 1. For loops (process first, they create scoped variables)
        def for_sub(match):
            item_var = match.group(1)
            list_path = match.group(2)
            body = match.group(3)
            items = self._resolve_path(list_path, context)
            used.add(list_path)
            if not isinstance(items, list):
                return ""
            out_parts = []
            for item in items:
                child_ctx = dict(context)
                child_ctx[item_var] = item
                rendered_body, sub_used = self._render_string(body, child_ctx)
                used.update(sub_used)
                out_parts.append(rendered_body)
            return "".join(out_parts)

        template = self.FOR_RE.sub(for_sub, template)

        # 2. Conditionals
        def if_sub(match):
            path = match.group(1)
            body = match.group(2)
            value = self._resolve_path(path, context)
            used.add(path)
            if value:
                rendered_body, sub_used = self._render_string(body, context)
                used.update(sub_used)
                return rendered_body
            return ""

        template = self.IF_RE.sub(if_sub, template)

        # 3. Variable substitution (with optional filter)
        def var_sub(match):
            path = match.group(1)
            filter_name = match.group(2)
            value = self._resolve_path(path, context)
            used.add(path)
            if filter_name:
                value = self._apply_filter(value, filter_name)
            return str(value) if value is not None else ""

        rendered = self.VARIABLE_RE.sub(var_sub, template)
        return rendered, used

    def _resolve_path(self, path: str, context: Dict[str, Any]) -> Any:
        parts = path.split(".")
        value: Any = context
        for p in parts:
            if isinstance(value, dict):
                value = value.get(p)
            elif hasattr(value, p):
                value = getattr(value, p)
            else:
                return None
            if value is None:
                return None
        return value

    def _apply_filter(self, value: Any, filter_spec: str) -> Any:
        # filter_spec examples: "upper", "currency", "round(2)"
        name = filter_spec
        arg: Optional[str] = None
        if "(" in filter_spec:
            name = filter_spec.split("(")[0]
            arg = filter_spec.split("(")[1].rstrip(")")
        filter_fn = self._filters.get(name)
        if filter_fn is None:
            return value
        try:
            if arg is not None:
                return filter_fn((value, arg))
            return filter_fn(value)
        except Exception:
            return value

    # ─── Default filters ─────────────────────────────────────
    def _default_filters(self) -> Dict[str, Callable[[Any], str]]:
        def f_upper(v): return str(v).upper()
        def f_lower(v): return str(v).lower()
        def f_title(v): return str(v).title()
        def f_currency(v):
            try:
                return f"{float(v):,.2f} ILS"
            except Exception:
                return str(v)
        def f_percent(v):
            try:
                return f"{float(v):.1f}%"
            except Exception:
                return str(v)
        def f_round(arg):
            value, digits = arg
            try:
                return str(round(float(value), int(digits)))
            except Exception:
                return str(value)
        def f_date(v):
            if isinstance(v, datetime):
                return v.strftime("%Y-%m-%d")
            return str(v)
        return {
            "upper": f_upper,
            "lower": f_lower,
            "title": f_title,
            "currency": f_currency,
            "percent": f_percent,
            "round": f_round,
            "date": f_date,
        }


_engine: Optional[TemplateEngine] = None


def get_template_engine() -> TemplateEngine:
    global _engine
    if _engine is None:
        _engine = TemplateEngine()
        _seed_default_templates(_engine)
    return _engine


def _seed_default_templates(engine: TemplateEngine) -> None:
    engine.register_template(
        "alert.supplier_delayed",
        """[{{ severity | upper }}] Supplier delay detected
Supplier: {{ supplier_name }}
Days delayed: {{ delay_days }}
Impact: {{ impacted_projects_count }} projects affected
Action required: Review procurement pipeline and activate contingency supplier
""",
    )
    engine.register_template(
        "alert.inventory_low",
        """[{{ severity | upper }}] Inventory below threshold
Material: {{ material_name }}
Qty on hand: {{ qty_on_hand }}
Reorder point: {{ reorder_point }}
Urgency: {{ urgency }}
Recommended order: {{ recommended_qty }} units
""",
    )
    engine.register_template(
        "daily.ops_brief",
        """Daily Operations Brief — {{ date }}
Tenant: {{ tenant_name }}
Overall health: {{ overall_health }}/100

Top concerns:
{% for concern in top_concerns %}  - [{{ concern.severity }}] {{ concern.title }}
{% endfor %}
{% if has_critical_alerts %}CRITICAL ALERTS REQUIRE IMMEDIATE ATTENTION
{% endif %}
Next actions:
{% for action in next_actions %}  * {{ action }}
{% endfor %}
""",
    )
    engine.register_template(
        "prompt.entity_explain",
        """You are a senior operations analyst. Explain the current state of this entity.

Entity: {{ entity.name }}
Type: {{ entity.object_type }}
Status: {{ entity.status }}
Risk score: {{ state.risk_score }}

Recent properties:
{{ entity.properties }}

Question: Why is this entity {{ entity.status }} and what should the operator do?
""",
    )
