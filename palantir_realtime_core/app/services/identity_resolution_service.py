"""
Advanced Identity Resolution Service.

Unifies records that refer to the same real-world entity across multiple
source systems. Supports:

- Deterministic matching on exact keys (email, vat, phone, canonical_external_key)
- Fuzzy matching on normalized strings (Levenshtein similarity)
- Composite matching (multiple fields must agree above a threshold)
- Confidence scoring
- Merge history (audit trail)
- Manual override
- Conflict detection (when two sources disagree)

This is the layer that makes "customer_id in ERP", "account_no in CRM",
and "client_code in spreadsheet" become one canonical Customer.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


@dataclass
class SourceLink:
    source_id: str
    source_record_id: str
    match_score: float
    match_reason: str
    linked_at: datetime = field(default_factory=utc_now)


@dataclass
class IdentityCluster:
    cluster_id: str
    tenant_id: str
    entity_type: str
    canonical_id: str
    canonical_attrs: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0
    links: List[SourceLink] = field(default_factory=list)
    merge_history: List[Dict[str, Any]] = field(default_factory=list)
    manually_verified: bool = False
    conflicts: List[Dict[str, Any]] = field(default_factory=list)
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


@dataclass
class ResolutionRequest:
    tenant_id: str
    entity_type: str
    source_id: str
    source_record_id: str
    attributes: Dict[str, Any]
    # Fields to match on — first match wins
    exact_match_fields: List[str] = field(default_factory=lambda: ["email", "vat_number", "phone", "canonical_external_key"])
    fuzzy_match_fields: List[str] = field(default_factory=lambda: ["name"])
    fuzzy_threshold: float = 0.85


@dataclass
class ResolutionResult:
    cluster: IdentityCluster
    is_new_cluster: bool
    match_score: float
    match_reason: str
    conflicts: List[str] = field(default_factory=list)


# ════════════════════════════════════════════════════════════════
# STRING NORMALIZATION + SIMILARITY
# ════════════════════════════════════════════════════════════════

def normalize(value: Any) -> str:
    if value is None:
        return ""
    s = str(value).lower().strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s@.-]", "", s)
    return s


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev_row = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr_row = [i + 1]
        for j, cb in enumerate(b):
            cost = 0 if ca == cb else 1
            curr_row.append(min(
                curr_row[j] + 1,          # insertion
                prev_row[j + 1] + 1,      # deletion
                prev_row[j] + cost,       # substitution
            ))
        prev_row = curr_row
    return prev_row[-1]


def similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    return 1.0 - (levenshtein(a, b) / max_len)


# ════════════════════════════════════════════════════════════════
# IDENTITY RESOLUTION SERVICE
# ════════════════════════════════════════════════════════════════

class IdentityResolutionService:
    def __init__(self) -> None:
        # cluster_id → cluster
        self._clusters: Dict[str, IdentityCluster] = {}
        # index for fast lookup: (tenant_id, entity_type, exact_key_name, normalized_value) → cluster_id
        self._exact_index: Dict[Tuple[str, str, str, str], str] = {}

    def resolve(self, req: ResolutionRequest) -> ResolutionResult:
        # 1. Deterministic exact match
        for field_name in req.exact_match_fields:
            v = normalize(req.attributes.get(field_name))
            if not v:
                continue
            key = (req.tenant_id, req.entity_type, field_name, v)
            cluster_id = self._exact_index.get(key)
            if cluster_id:
                cluster = self._clusters[cluster_id]
                return self._merge_into(cluster, req, match_score=1.0, match_reason=f"exact:{field_name}")

        # 2. Fuzzy match — check all clusters of the same type
        best_cluster: Optional[IdentityCluster] = None
        best_score = 0.0
        best_reason = ""
        for c in self._clusters.values():
            if c.tenant_id != req.tenant_id or c.entity_type != req.entity_type:
                continue
            score, reasons = self._fuzzy_score(c, req)
            if score > best_score:
                best_score = score
                best_cluster = c
                best_reason = reasons
        if best_cluster is not None and best_score >= req.fuzzy_threshold:
            return self._merge_into(best_cluster, req, match_score=best_score, match_reason=f"fuzzy:{best_reason}")

        # 3. No match — create new cluster
        return self._create_cluster(req)

    def _fuzzy_score(self, cluster: IdentityCluster, req: ResolutionRequest) -> Tuple[float, str]:
        scores: List[Tuple[float, str]] = []
        for f in req.fuzzy_match_fields:
            a = normalize(req.attributes.get(f))
            b = normalize(cluster.canonical_attrs.get(f))
            if a and b:
                s = similarity(a, b)
                scores.append((s, f"{f}={s:.2f}"))
        if not scores:
            return 0.0, ""
        avg = sum(s for s, _ in scores) / len(scores)
        return avg, ",".join(r for _, r in scores)

    def _merge_into(
        self,
        cluster: IdentityCluster,
        req: ResolutionRequest,
        match_score: float,
        match_reason: str,
    ) -> ResolutionResult:
        conflicts: List[str] = []

        # Detect conflicts (same field, different values)
        for k, v in req.attributes.items():
            existing = cluster.canonical_attrs.get(k)
            if existing is not None and v is not None and normalize(existing) != normalize(v):
                conflicts.append(f"field_{k}:existing={existing},incoming={v}")
                cluster.conflicts.append({
                    "field": k,
                    "existing": existing,
                    "incoming": v,
                    "source_id": req.source_id,
                    "detected_at": utc_now().isoformat(),
                })
            else:
                cluster.canonical_attrs[k] = v

        # Add link (idempotent — skip if already present)
        already = any(
            l.source_id == req.source_id and l.source_record_id == req.source_record_id
            for l in cluster.links
        )
        if not already:
            cluster.links.append(SourceLink(
                source_id=req.source_id,
                source_record_id=req.source_record_id,
                match_score=match_score,
                match_reason=match_reason,
            ))
            cluster.merge_history.append({
                "source_id": req.source_id,
                "source_record_id": req.source_record_id,
                "score": match_score,
                "reason": match_reason,
                "merged_at": utc_now().isoformat(),
            })

        # Update confidence (weighted average)
        cluster.confidence = (cluster.confidence + match_score) / 2.0
        cluster.updated_at = utc_now()

        # Update exact-match index for new keys
        for f in req.exact_match_fields:
            v = normalize(req.attributes.get(f))
            if v:
                key = (req.tenant_id, req.entity_type, f, v)
                self._exact_index[key] = cluster.cluster_id

        return ResolutionResult(
            cluster=cluster,
            is_new_cluster=False,
            match_score=match_score,
            match_reason=match_reason,
            conflicts=conflicts,
        )

    def _create_cluster(self, req: ResolutionRequest) -> ResolutionResult:
        cluster_id = new_id("ic")
        canonical_id = new_id(f"canon_{req.entity_type.lower()}")
        cluster = IdentityCluster(
            cluster_id=cluster_id,
            tenant_id=req.tenant_id,
            entity_type=req.entity_type,
            canonical_id=canonical_id,
            canonical_attrs=dict(req.attributes),
            confidence=1.0,
            links=[
                SourceLink(
                    source_id=req.source_id,
                    source_record_id=req.source_record_id,
                    match_score=1.0,
                    match_reason="new_cluster",
                )
            ],
            merge_history=[{
                "source_id": req.source_id,
                "source_record_id": req.source_record_id,
                "score": 1.0,
                "reason": "new_cluster",
                "merged_at": utc_now().isoformat(),
            }],
        )
        self._clusters[cluster_id] = cluster
        for f in req.exact_match_fields:
            v = normalize(req.attributes.get(f))
            if v:
                self._exact_index[(req.tenant_id, req.entity_type, f, v)] = cluster_id
        return ResolutionResult(
            cluster=cluster,
            is_new_cluster=True,
            match_score=1.0,
            match_reason="new_cluster",
        )

    def get(self, cluster_id: str) -> Optional[IdentityCluster]:
        return self._clusters.get(cluster_id)

    def list_for_tenant(self, tenant_id: str) -> List[IdentityCluster]:
        return [c for c in self._clusters.values() if c.tenant_id == tenant_id]

    def manual_merge(self, cluster_a: str, cluster_b: str, merged_by: str) -> Optional[IdentityCluster]:
        a = self._clusters.get(cluster_a)
        b = self._clusters.get(cluster_b)
        if a is None or b is None:
            return None
        if a.tenant_id != b.tenant_id or a.entity_type != b.entity_type:
            return None
        # Merge b into a
        a.canonical_attrs.update(b.canonical_attrs)
        a.links.extend(b.links)
        a.merge_history.append({
            "type": "manual_merge",
            "merged_cluster": b.cluster_id,
            "merged_by": merged_by,
            "merged_at": utc_now().isoformat(),
        })
        a.manually_verified = True
        a.updated_at = utc_now()
        del self._clusters[cluster_b]
        return a

    def stats(self, tenant_id: str) -> Dict[str, Any]:
        clusters = self.list_for_tenant(tenant_id)
        total_links = sum(len(c.links) for c in clusters)
        multi_source = sum(1 for c in clusters if len(c.links) > 1)
        with_conflicts = sum(1 for c in clusters if c.conflicts)
        return {
            "total_clusters": len(clusters),
            "total_links": total_links,
            "multi_source_clusters": multi_source,
            "clusters_with_conflicts": with_conflicts,
            "avg_confidence": sum(c.confidence for c in clusters) / len(clusters) if clusters else 1.0,
        }
