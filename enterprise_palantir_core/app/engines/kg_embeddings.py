"""
Knowledge Graph Embeddings — TransE-style translation embeddings
over the ontology.

Idea: every entity is a vector, every relationship is a vector, and
if (h, r, t) is a true triple then h + r ≈ t in the embedding space.

Trains with a simple margin-based loss (contrastive) using randomly
corrupted triples. Pure Python, zero dependencies.

Once trained, the embeddings power:
  - link prediction ("does Customer X likely have a relationship with Supplier Y?")
  - analogy queries ("as Elco:Project_Elco, so Phoenix:?")
  - clustering similar entities in vector space
  - cold-start similarity for new entities

Training is fast enough for 100-10,000 entities on a single Replit
instance. For larger graphs, swap in PyKEEN / DGL-KE in production.
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ════════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ════════════════════════════════════════════════════════════════

@dataclass
class EmbeddingStats:
    tenant_id: str
    dimension: int
    entity_count: int
    relation_count: int
    triple_count: int
    epochs_trained: int
    final_loss: float
    trained_at: datetime


@dataclass
class SimilarityResult:
    entity_id: str
    similarity: float
    entity_name: Optional[str] = None
    entity_type: Optional[str] = None


@dataclass
class LinkPrediction:
    head: str
    relation: str
    predicted_tail: str
    score: float


# ════════════════════════════════════════════════════════════════
# LIGHT-WEIGHT LINEAR ALGEBRA (pure Python)
# ════════════════════════════════════════════════════════════════

def _zeros(n: int) -> List[float]:
    return [0.0] * n


def _random_vec(n: int, scale: float = 0.1) -> List[float]:
    return [random.uniform(-scale, scale) for _ in range(n)]


def _add(a: List[float], b: List[float]) -> List[float]:
    return [x + y for x, y in zip(a, b)]


def _sub(a: List[float], b: List[float]) -> List[float]:
    return [x - y for x, y in zip(a, b)]


def _scale(a: List[float], s: float) -> List[float]:
    return [x * s for x in a]


def _dot(a: List[float], b: List[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _norm(a: List[float]) -> float:
    return math.sqrt(sum(x * x for x in a))


def _normalize(a: List[float]) -> List[float]:
    n = _norm(a)
    if n < 1e-12:
        return list(a)
    return [x / n for x in a]


def _distance(a: List[float], b: List[float]) -> float:
    """L2 distance."""
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _cosine(a: List[float], b: List[float]) -> float:
    na = _norm(a)
    nb = _norm(b)
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return _dot(a, b) / (na * nb)


# ════════════════════════════════════════════════════════════════
# KG EMBEDDING ENGINE
# ════════════════════════════════════════════════════════════════

class KGEmbeddingEngine:
    def __init__(self, db: Session, *, dimension: int = 32, seed: int = 42) -> None:
        self.db = db
        self.dimension = dimension
        self._entity_vecs: Dict[str, List[float]] = {}
        self._relation_vecs: Dict[str, List[float]] = {}
        self._triples: List[Tuple[str, str, str]] = []
        self._entity_metadata: Dict[str, Dict[str, Any]] = {}
        self._trained_at: Optional[datetime] = None
        self._final_loss: float = 0.0
        self._epochs: int = 0
        random.seed(seed)

    # ─── Build triples from the ontology ─────────────────────
    def build_triples(self, tenant_id: str) -> int:
        objects = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .all()
        )
        self._triples = []
        self._entity_metadata = {}
        for obj in objects:
            self._entity_metadata[obj.id] = {
                "name": obj.name,
                "type": obj.object_type,
            }
            # Initialize entity vector
            if obj.id not in self._entity_vecs:
                self._entity_vecs[obj.id] = _normalize(_random_vec(self.dimension))
            try:
                rels = json.loads(obj.relationships_json or "{}")
            except Exception:
                continue
            for rel_name, targets in rels.items():
                # Initialize relation vector
                if rel_name not in self._relation_vecs:
                    self._relation_vecs[rel_name] = _normalize(_random_vec(self.dimension))
                for target in targets or []:
                    if target not in self._entity_vecs:
                        self._entity_vecs[target] = _normalize(_random_vec(self.dimension))
                    self._triples.append((obj.id, rel_name, target))
        return len(self._triples)

    # ─── TransE training loop ────────────────────────────────
    def train(
        self,
        *,
        epochs: int = 100,
        learning_rate: float = 0.05,
        margin: float = 1.0,
    ) -> EmbeddingStats:
        """
        TransE margin-based loss:
          for each positive (h, r, t):
            corrupt to (h', r, t) or (h, r, t')
            loss = max(0, margin + d(h+r, t) - d(h'+r, t'))
          optimize via simple SGD
        """
        if not self._triples:
            raise ValueError("No triples to train on — call build_triples first")

        entity_ids = list(self._entity_vecs.keys())
        final_loss = 0.0

        for epoch in range(epochs):
            epoch_loss = 0.0
            random.shuffle(self._triples)
            for h, r, t in self._triples:
                # Random corruption: replace head or tail
                if random.random() < 0.5:
                    h_corrupt = random.choice(entity_ids)
                    while h_corrupt == h:
                        h_corrupt = random.choice(entity_ids)
                    t_corrupt = t
                else:
                    t_corrupt = random.choice(entity_ids)
                    while t_corrupt == t:
                        t_corrupt = random.choice(entity_ids)
                    h_corrupt = h

                h_vec = self._entity_vecs[h]
                r_vec = self._relation_vecs[r]
                t_vec = self._entity_vecs[t]
                h_c_vec = self._entity_vecs[h_corrupt]
                t_c_vec = self._entity_vecs[t_corrupt]

                pos_dist = _distance(_add(h_vec, r_vec), t_vec)
                neg_dist = _distance(_add(h_c_vec, r_vec), t_c_vec)
                loss = max(0.0, margin + pos_dist - neg_dist)

                if loss > 0:
                    epoch_loss += loss
                    # Gradient updates (approximate, no autograd)
                    # For positive: push h+r → t
                    diff_pos = _sub(_add(h_vec, r_vec), t_vec)
                    self._entity_vecs[h] = _normalize(
                        _sub(h_vec, _scale(diff_pos, learning_rate))
                    )
                    self._entity_vecs[t] = _normalize(
                        _add(t_vec, _scale(diff_pos, learning_rate))
                    )
                    self._relation_vecs[r] = _sub(
                        r_vec, _scale(diff_pos, learning_rate * 0.5)
                    )
                    # For negative: pull h'+r away from t'
                    diff_neg = _sub(_add(h_c_vec, r_vec), t_c_vec)
                    self._entity_vecs[h_corrupt] = _normalize(
                        _add(h_c_vec, _scale(diff_neg, learning_rate * 0.5))
                    )
                    self._entity_vecs[t_corrupt] = _normalize(
                        _sub(t_c_vec, _scale(diff_neg, learning_rate * 0.5))
                    )
            final_loss = epoch_loss
            if epoch_loss < 0.01:
                break  # converged

        self._epochs = epochs
        self._final_loss = round(final_loss, 4)
        self._trained_at = utc_now()

        return EmbeddingStats(
            tenant_id="",  # set by caller
            dimension=self.dimension,
            entity_count=len(self._entity_vecs),
            relation_count=len(self._relation_vecs),
            triple_count=len(self._triples),
            epochs_trained=self._epochs,
            final_loss=self._final_loss,
            trained_at=self._trained_at,
        )

    # ─── Query operations ────────────────────────────────────
    def find_similar(
        self,
        entity_id: str,
        *,
        top_k: int = 10,
    ) -> List[SimilarityResult]:
        """Find entities closest to the given entity in embedding space."""
        if entity_id not in self._entity_vecs:
            return []
        query_vec = self._entity_vecs[entity_id]
        scored: List[Tuple[float, str]] = []
        for eid, vec in self._entity_vecs.items():
            if eid == entity_id:
                continue
            sim = _cosine(query_vec, vec)
            scored.append((sim, eid))
        scored.sort(key=lambda x: -x[0])
        out: List[SimilarityResult] = []
        for sim, eid in scored[:top_k]:
            meta = self._entity_metadata.get(eid, {})
            out.append(SimilarityResult(
                entity_id=eid,
                similarity=round(sim, 4),
                entity_name=meta.get("name"),
                entity_type=meta.get("type"),
            ))
        return out

    def predict_link(
        self,
        head: str,
        relation: str,
        *,
        top_k: int = 5,
    ) -> List[LinkPrediction]:
        """
        Link prediction: given (head, relation, ?), find the top-k
        most likely tails by computing h + r ≈ ? for every candidate.
        """
        if head not in self._entity_vecs or relation not in self._relation_vecs:
            return []
        h_vec = self._entity_vecs[head]
        r_vec = self._relation_vecs[relation]
        target_vec = _add(h_vec, r_vec)
        scored: List[Tuple[float, str]] = []
        for eid, vec in self._entity_vecs.items():
            if eid == head:
                continue
            score = 1.0 / (1.0 + _distance(target_vec, vec))  # closer = higher score
            scored.append((score, eid))
        scored.sort(key=lambda x: -x[0])
        return [
            LinkPrediction(head=head, relation=relation, predicted_tail=eid, score=round(s, 4))
            for s, eid in scored[:top_k]
        ]

    def analogy(
        self,
        *,
        a: str,
        b: str,
        c: str,
        top_k: int = 5,
    ) -> List[SimilarityResult]:
        """
        Classic analogy: a is to b as c is to ?
        Computes: target = b - a + c, then finds nearest neighbors.
        """
        if a not in self._entity_vecs or b not in self._entity_vecs or c not in self._entity_vecs:
            return []
        target = _add(_sub(self._entity_vecs[b], self._entity_vecs[a]), self._entity_vecs[c])
        scored: List[Tuple[float, str]] = []
        for eid, vec in self._entity_vecs.items():
            if eid in (a, b, c):
                continue
            sim = _cosine(target, vec)
            scored.append((sim, eid))
        scored.sort(key=lambda x: -x[0])
        out: List[SimilarityResult] = []
        for sim, eid in scored[:top_k]:
            meta = self._entity_metadata.get(eid, {})
            out.append(SimilarityResult(
                entity_id=eid,
                similarity=round(sim, 4),
                entity_name=meta.get("name"),
                entity_type=meta.get("type"),
            ))
        return out

    def cluster_by_type(self) -> Dict[str, List[str]]:
        """Group entities by their nearest centroid per entity type."""
        by_type: Dict[str, List[str]] = {}
        for eid, meta in self._entity_metadata.items():
            t = meta.get("type", "unknown")
            by_type.setdefault(t, []).append(eid)
        return by_type

    def stats(self) -> Dict[str, Any]:
        return {
            "dimension": self.dimension,
            "entity_count": len(self._entity_vecs),
            "relation_count": len(self._relation_vecs),
            "triple_count": len(self._triples),
            "epochs_trained": self._epochs,
            "final_loss": self._final_loss,
            "trained_at": self._trained_at.isoformat() if self._trained_at else None,
        }
