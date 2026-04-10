"""
Full-Text Search Indexer — lightweight inverted index across the
ontology + document store.

For every token in every entity (name + property values + attached
documents) the indexer maintains a posting list mapping token → set
of entity ids. Queries return the intersection of posting lists for
every query token, scored by TF and sorted by descending score.

This is complementary to vector_search.py (semantic cosine similarity).
Full-text is faster and more precise for exact-match queries (SKUs,
invoice numbers, supplier names, etc.).

Zero dependencies.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from app.engines.document_store import Document, get_document_store
from app.models.ontology import OntologyObject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class IndexEntry:
    source_id: str
    source_type: str  # "entity" | "document"
    tenant_id: str
    title: str
    snippet: str
    score: float


@dataclass
class IndexStats:
    total_documents: int
    total_terms: int
    avg_tokens_per_doc: float
    last_built_at: Optional[datetime]


class FullTextIndex:
    TOKEN_RE = re.compile(r"[\w\u0590-\u05FF]+", flags=re.UNICODE)
    STOP = {"the", "a", "an", "of", "and", "or", "to", "in", "on", "at", "for",
            "is", "are", "was", "were", "be", "it", "its", "that", "this"}

    def __init__(self, db: Session) -> None:
        self.db = db
        # tenant_id → token → Set[source_id]
        self._inverted: Dict[str, Dict[str, Set[str]]] = defaultdict(lambda: defaultdict(set))
        # source_id → metadata (for display)
        self._metadata: Dict[str, Dict[str, Any]] = {}
        # source_id → Counter of token frequencies (for TF scoring)
        self._tf: Dict[str, Counter] = {}
        self._last_built_at: Dict[str, datetime] = {}

    # ─── Indexing ────────────────────────────────────────────
    def build(self, tenant_id: str) -> IndexStats:
        # Index ontology entities
        objects = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .all()
        )
        for obj in objects:
            self._index_entity(obj, tenant_id)

        # Index documents
        store = get_document_store()
        for doc in store.list_for_tenant(tenant_id):
            self._index_document(doc, tenant_id)

        self._last_built_at[tenant_id] = utc_now()
        return self.stats(tenant_id)

    def _index_entity(self, obj: OntologyObject, tenant_id: str) -> None:
        try:
            props = json.loads(obj.properties_json or "{}")
        except Exception:
            props = {}

        # Build text from name + type + property values
        parts = [obj.name, obj.object_type]
        for v in props.values():
            if isinstance(v, (str, int, float)) and not isinstance(v, bool):
                parts.append(str(v))
        text = " ".join(str(p) for p in parts if p)

        tokens = self._tokenize(text)
        if not tokens:
            return
        tf = Counter(tokens)
        for token in tf.keys():
            self._inverted[tenant_id][token].add(obj.id)
        self._tf[obj.id] = tf
        self._metadata[obj.id] = {
            "source_type": "entity",
            "tenant_id": tenant_id,
            "title": obj.name,
            "object_type": obj.object_type,
            "snippet": text[:200],
        }

    def _index_document(self, doc: Document, tenant_id: str) -> None:
        text = f"{doc.title} {doc.content} {' '.join(doc.tags)}"
        tokens = self._tokenize(text)
        if not tokens:
            return
        tf = Counter(tokens)
        for token in tf.keys():
            self._inverted[tenant_id][token].add(doc.doc_id)
        self._tf[doc.doc_id] = tf
        self._metadata[doc.doc_id] = {
            "source_type": "document",
            "tenant_id": tenant_id,
            "title": doc.title,
            "doc_type": doc.doc_type.value,
            "attached_to_entity_id": doc.attached_to_entity_id,
            "snippet": doc.content[:200],
        }

    # ─── Querying ────────────────────────────────────────────
    def search(
        self,
        tenant_id: str,
        query: str,
        *,
        limit: int = 20,
        source_type_filter: Optional[str] = None,
    ) -> List[IndexEntry]:
        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []

        tenant_index = self._inverted.get(tenant_id, {})
        if not tenant_index:
            return []

        # Intersection: docs containing ALL query tokens
        candidate_sets = [tenant_index.get(t, set()) for t in query_tokens]
        if not candidate_sets or any(len(s) == 0 for s in candidate_sets):
            # Fallback: union (docs containing ANY token)
            union: Set[str] = set()
            for s in candidate_sets:
                union |= s
            candidates = list(union)
        else:
            intersection = set.intersection(*candidate_sets)
            candidates = list(intersection)

        # Score by TF: sum of query-token frequencies
        scored: List[tuple] = []
        for source_id in candidates:
            tf = self._tf.get(source_id, Counter())
            score = sum(tf.get(t, 0) for t in query_tokens)
            if score == 0:
                continue
            scored.append((score, source_id))
        scored.sort(key=lambda x: -x[0])

        out: List[IndexEntry] = []
        for score, source_id in scored[:limit]:
            meta = self._metadata.get(source_id, {})
            if source_type_filter and meta.get("source_type") != source_type_filter:
                continue
            out.append(IndexEntry(
                source_id=source_id,
                source_type=meta.get("source_type", ""),
                tenant_id=meta.get("tenant_id", ""),
                title=meta.get("title", ""),
                snippet=meta.get("snippet", ""),
                score=float(score),
            ))
        return out

    def _tokenize(self, text: str) -> List[str]:
        if not text:
            return []
        lowered = text.lower()
        tokens = self.TOKEN_RE.findall(lowered)
        return [t for t in tokens if len(t) > 1 and t not in self.STOP]

    def stats(self, tenant_id: str) -> IndexStats:
        tenant_index = self._inverted.get(tenant_id, {})
        doc_ids = {
            sid for token_docs in tenant_index.values() for sid in token_docs
        }
        total_tokens = sum(sum(self._tf.get(sid, Counter()).values()) for sid in doc_ids)
        return IndexStats(
            total_documents=len(doc_ids),
            total_terms=len(tenant_index),
            avg_tokens_per_doc=(total_tokens / len(doc_ids)) if doc_ids else 0,
            last_built_at=self._last_built_at.get(tenant_id),
        )
