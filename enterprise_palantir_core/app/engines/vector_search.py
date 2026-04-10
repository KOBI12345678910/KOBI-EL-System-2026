"""
Vector Search Engine — semantic similarity search over the ontology
using a hash-based embedder + cosine similarity.

This is a DEPENDENCY-FREE embedder (no numpy, no torch, no API calls)
so the platform boots on Replit without external services. For a real
production deployment, swap in `SentenceTransformerEmbedder` (lazy
imports sentence-transformers) or `OpenAIEmbedder` (lazy imports
openai).

The SemanticIndex:
  1. Embeds each OntologyObject's name + properties into a fixed-size
     vector using feature hashing
  2. Normalizes the vector
  3. Stores it in memory
  4. On query, embeds the query string and returns the top-k by
     cosine similarity

Usage:
    index = VectorSearchEngine(db)
    index.build_for_tenant("techno_kol_uzi")
    results = index.search("aluminum supplier delayed", top_k=5)
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol, Tuple

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject


# ════════════════════════════════════════════════════════════════
# EMBEDDER PROTOCOL + DEFAULT IMPLEMENTATION
# ════════════════════════════════════════════════════════════════

class Embedder(Protocol):
    dim: int

    def embed(self, text: str) -> List[float]: ...


class HashingEmbedder:
    """
    Pure-Python feature-hashing embedder.

    Produces a `dim`-dimensional vector where each token in the input
    text hashes into one of `dim` buckets (sign determined by a second
    hash). The result is L2-normalized so cosine similarity simplifies
    to a dot product.

    Works well enough for noun-phrase matching (customer/supplier/project
    names + keywords). It does NOT capture semantic similarity like a
    trained transformer — but it's deterministic, offline, and has no
    dependencies.
    """

    STOP_WORDS = {
        "the", "a", "an", "of", "and", "or", "to", "in", "on", "at", "for",
        "is", "are", "was", "were", "be", "been", "it", "its", "this", "that",
    }

    def __init__(self, dim: int = 256) -> None:
        self.dim = dim

    def embed(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        tokens = self._tokenize(text)
        for token in tokens:
            idx = self._hash_index(token)
            sign = self._hash_sign(token)
            vec[idx] += sign
        # Include bigrams for better phrase matching
        for i in range(len(tokens) - 1):
            bigram = f"{tokens[i]}_{tokens[i + 1]}"
            idx = self._hash_index(bigram)
            sign = self._hash_sign(bigram)
            vec[idx] += sign * 0.7
        # L2 normalize
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec

    def _tokenize(self, text: str) -> List[str]:
        if not text:
            return []
        lowered = text.lower()
        # Keep alphanumeric + unicode letters (for Hebrew)
        tokens = re.findall(r"[\w\u0590-\u05FF]+", lowered, flags=re.UNICODE)
        return [t for t in tokens if len(t) > 1 and t not in self.STOP_WORDS]

    def _hash_index(self, token: str) -> int:
        h = hashlib.sha1(token.encode("utf-8")).digest()
        return int.from_bytes(h[:4], "big") % self.dim

    def _hash_sign(self, token: str) -> float:
        h = hashlib.sha1(("sign_" + token).encode("utf-8")).digest()
        return 1.0 if h[0] & 1 else -1.0


# ════════════════════════════════════════════════════════════════
# INDEX ENTRY + RESULT
# ════════════════════════════════════════════════════════════════

@dataclass
class IndexedEntity:
    entity_id: str
    entity_type: str
    name: str
    tenant_id: str
    embedding: List[float]
    raw_text: str


@dataclass
class SearchResult:
    entity_id: str
    entity_type: str
    name: str
    score: float
    snippet: str


# ════════════════════════════════════════════════════════════════
# ENGINE
# ════════════════════════════════════════════════════════════════

class VectorSearchEngine:
    def __init__(self, db: Session, embedder: Optional[Embedder] = None) -> None:
        self.db = db
        self.embedder: Embedder = embedder or HashingEmbedder(dim=256)
        self._indexes: Dict[str, List[IndexedEntity]] = {}  # tenant_id → entries

    def build_for_tenant(self, tenant_id: str) -> int:
        entries: List[IndexedEntity] = []
        objects = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .all()
        )
        for obj in objects:
            try:
                props = json.loads(obj.properties_json or "{}")
            except Exception:
                props = {}
            text = self._build_text(obj, props)
            entries.append(IndexedEntity(
                entity_id=obj.id,
                entity_type=obj.object_type,
                name=obj.name,
                tenant_id=tenant_id,
                embedding=self.embedder.embed(text),
                raw_text=text,
            ))
        self._indexes[tenant_id] = entries
        return len(entries)

    def _build_text(self, obj: OntologyObject, props: Dict[str, Any]) -> str:
        parts = [obj.name, obj.object_type]
        for k, v in props.items():
            if isinstance(v, (str, int, float)) and not isinstance(v, bool):
                parts.append(f"{k}:{v}")
        return " ".join(str(p) for p in parts if p)

    def search(
        self,
        query: str,
        *,
        tenant_id: str,
        top_k: int = 10,
        entity_type_filter: Optional[str] = None,
        min_score: float = 0.0,
    ) -> List[SearchResult]:
        if tenant_id not in self._indexes:
            self.build_for_tenant(tenant_id)
        entries = self._indexes[tenant_id]
        if not entries:
            return []
        query_vec = self.embedder.embed(query)
        scores: List[Tuple[float, IndexedEntity]] = []
        for e in entries:
            if entity_type_filter and e.entity_type != entity_type_filter:
                continue
            score = self._cosine(query_vec, e.embedding)
            if score >= min_score:
                scores.append((score, e))
        scores.sort(key=lambda x: -x[0])
        top = scores[:top_k]
        return [
            SearchResult(
                entity_id=e.entity_id,
                entity_type=e.entity_type,
                name=e.name,
                score=round(score, 4),
                snippet=(e.raw_text[:200] + "..." if len(e.raw_text) > 200 else e.raw_text),
            )
            for score, e in top
        ]

    def _cosine(self, a: List[float], b: List[float]) -> float:
        # Both are already L2-normalized, so cosine = dot product
        return sum(x * y for x, y in zip(a, b))

    def index_sizes(self) -> Dict[str, int]:
        return {t: len(entries) for t, entries in self._indexes.items()}
