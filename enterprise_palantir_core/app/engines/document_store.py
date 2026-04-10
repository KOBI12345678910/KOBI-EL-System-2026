"""
Document Store — in-memory document storage indexed by canonical entity id.

A document is unstructured content (text, markdown, JSON blob, contract
body, email thread, PDF text extraction) attached to an ontology entity.
The document store lets the platform answer "show me every PDF / note
/ email associated with customer X".

Each document has:
  - doc_id, tenant_id, attached_to_entity_id (optional)
  - doc_type (note | email | pdf_text | contract | memo | meeting_minutes)
  - title, content, content_hash
  - author, created_at, updated_at
  - tags, metadata
  - size_bytes

A production version would back this with S3 + a relational index. The
in-memory store is sufficient for demo + Replit deployments.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_doc_id() -> str:
    return f"doc_{uuid.uuid4().hex[:16]}"


class DocType(str, Enum):
    NOTE = "note"
    EMAIL = "email"
    PDF_TEXT = "pdf_text"
    CONTRACT = "contract"
    MEMO = "memo"
    MEETING_MINUTES = "meeting_minutes"
    SPEC = "spec"
    REPORT = "report"


@dataclass
class Document:
    doc_id: str
    tenant_id: str
    doc_type: DocType
    title: str
    content: str
    attached_to_entity_id: Optional[str] = None
    author: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    content_hash: str = ""
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)
    size_bytes: int = 0


class DocumentStore:
    def __init__(self) -> None:
        self._docs: Dict[str, Document] = {}
        self._by_entity: Dict[str, List[str]] = {}

    def create(
        self,
        *,
        tenant_id: str,
        doc_type: DocType,
        title: str,
        content: str,
        attached_to_entity_id: Optional[str] = None,
        author: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Document:
        doc_id = new_doc_id()
        content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()[:32]
        doc = Document(
            doc_id=doc_id,
            tenant_id=tenant_id,
            doc_type=doc_type,
            title=title,
            content=content,
            attached_to_entity_id=attached_to_entity_id,
            author=author,
            tags=list(tags or []),
            metadata=dict(metadata or {}),
            content_hash=content_hash,
            size_bytes=len(content.encode("utf-8")),
        )
        self._docs[doc_id] = doc
        if attached_to_entity_id:
            self._by_entity.setdefault(attached_to_entity_id, []).append(doc_id)
        return doc

    def get(self, doc_id: str) -> Optional[Document]:
        return self._docs.get(doc_id)

    def update(self, doc_id: str, *, title: Optional[str] = None, content: Optional[str] = None) -> Optional[Document]:
        doc = self._docs.get(doc_id)
        if doc is None:
            return None
        if title is not None:
            doc.title = title
        if content is not None:
            doc.content = content
            doc.content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()[:32]
            doc.size_bytes = len(content.encode("utf-8"))
        doc.updated_at = utc_now()
        return doc

    def delete(self, doc_id: str) -> bool:
        doc = self._docs.pop(doc_id, None)
        if doc is None:
            return False
        if doc.attached_to_entity_id:
            entity_docs = self._by_entity.get(doc.attached_to_entity_id, [])
            if doc_id in entity_docs:
                entity_docs.remove(doc_id)
        return True

    def list_for_entity(self, entity_id: str) -> List[Document]:
        ids = self._by_entity.get(entity_id, [])
        return [self._docs[i] for i in ids if i in self._docs]

    def list_for_tenant(self, tenant_id: str, *, doc_type: Optional[DocType] = None) -> List[Document]:
        docs = [d for d in self._docs.values() if d.tenant_id == tenant_id]
        if doc_type:
            docs = [d for d in docs if d.doc_type == doc_type]
        return docs

    def search(self, tenant_id: str, query: str, limit: int = 20) -> List[Document]:
        """Naive substring search across title + content + tags."""
        q = query.lower()
        hits: List[Document] = []
        for doc in self._docs.values():
            if doc.tenant_id != tenant_id:
                continue
            if (q in doc.title.lower()
                or q in doc.content.lower()
                or any(q in tag.lower() for tag in doc.tags)):
                hits.append(doc)
                if len(hits) >= limit:
                    break
        return hits

    def stats(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        docs = [d for d in self._docs.values() if tenant_id is None or d.tenant_id == tenant_id]
        by_type: Dict[str, int] = {}
        total_bytes = 0
        for d in docs:
            by_type[d.doc_type.value] = by_type.get(d.doc_type.value, 0) + 1
            total_bytes += d.size_bytes
        return {
            "total": len(docs),
            "by_type": by_type,
            "total_bytes": total_bytes,
            "total_entities_with_docs": len(
                {d.attached_to_entity_id for d in docs if d.attached_to_entity_id}
            ),
        }


_store: Optional[DocumentStore] = None


def get_document_store() -> DocumentStore:
    global _store
    if _store is None:
        _store = DocumentStore()
    return _store
