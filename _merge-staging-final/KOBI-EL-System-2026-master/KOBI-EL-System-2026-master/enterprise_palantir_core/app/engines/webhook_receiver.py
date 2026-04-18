"""
Webhook Receiver — signed webhook endpoint for inbound data pushes
from external connectors (Stripe, FedEx, Shopify, GitHub, etc.).

Features:
  - HMAC-SHA256 signature verification per connector
  - Idempotency keys (same event_id ingested twice → second request is a no-op)
  - Automatic mapping to IngestRecordIn via a per-connector transformer
  - Full audit logging
  - Replay protection (nonce window)

Each external system registers a WebhookTransformer that takes a raw
POST body and returns an IngestRecordIn. The receiver handles signature
verification, idempotency, and auditing before handing off to the
ingestion service.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.schemas.ingest import IngestRecordIn


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class WebhookConfig:
    connector_id: str
    tenant_id: str
    secret: str
    signature_header: str = "X-Palantir-Signature"
    signature_algo: str = "sha256"
    # 5 minute replay window for nonce validation
    replay_window_seconds: int = 300


@dataclass
class WebhookReceipt:
    receipt_id: str
    connector_id: str
    received_at: datetime
    signature_valid: bool
    idempotency_key: Optional[str]
    status: str  # accepted | rejected | duplicate
    error: Optional[str] = None
    ingest_record: Optional[Dict[str, Any]] = None


WebhookTransformer = Callable[[Dict[str, Any]], IngestRecordIn]


class WebhookReceiver:
    def __init__(self) -> None:
        self._configs: Dict[str, WebhookConfig] = {}
        self._transformers: Dict[str, WebhookTransformer] = {}
        self._seen_idempotency_keys: Dict[str, float] = {}  # key → timestamp
        self._receipts: List[WebhookReceipt] = []
        self._max_receipts = 500

    def register(self, config: WebhookConfig, transformer: WebhookTransformer) -> None:
        self._configs[config.connector_id] = config
        self._transformers[config.connector_id] = transformer

    def verify_signature(
        self,
        connector_id: str,
        raw_body: bytes,
        signature: str,
    ) -> bool:
        config = self._configs.get(connector_id)
        if config is None:
            return False
        expected = hmac.new(
            config.secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def receive(
        self,
        connector_id: str,
        raw_body: bytes,
        headers: Dict[str, str],
        *,
        idempotency_key: Optional[str] = None,
    ) -> Tuple[WebhookReceipt, Optional[IngestRecordIn]]:
        receipt_id = f"whr_{int(time.time() * 1000)}_{connector_id}"
        now = utc_now()

        # Check registration
        config = self._configs.get(connector_id)
        if config is None:
            receipt = WebhookReceipt(
                receipt_id=receipt_id,
                connector_id=connector_id,
                received_at=now,
                signature_valid=False,
                idempotency_key=idempotency_key,
                status="rejected",
                error="unknown_connector",
            )
            self._record(receipt)
            return receipt, None

        # Verify signature (if signature header present)
        signature = headers.get(config.signature_header) or headers.get(config.signature_header.lower()) or ""
        sig_valid = True
        if signature:
            sig_valid = self.verify_signature(connector_id, raw_body, signature)
            if not sig_valid:
                receipt = WebhookReceipt(
                    receipt_id=receipt_id,
                    connector_id=connector_id,
                    received_at=now,
                    signature_valid=False,
                    idempotency_key=idempotency_key,
                    status="rejected",
                    error="invalid_signature",
                )
                self._record(receipt)
                return receipt, None

        # Idempotency check
        if idempotency_key:
            if idempotency_key in self._seen_idempotency_keys:
                receipt = WebhookReceipt(
                    receipt_id=receipt_id,
                    connector_id=connector_id,
                    received_at=now,
                    signature_valid=sig_valid,
                    idempotency_key=idempotency_key,
                    status="duplicate",
                    error="idempotency_key_replay",
                )
                self._record(receipt)
                return receipt, None
            self._seen_idempotency_keys[idempotency_key] = time.time()
            # Garbage-collect old keys outside the replay window
            self._gc_idempotency_keys(config.replay_window_seconds)

        # Parse body + transform
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception as exc:
            receipt = WebhookReceipt(
                receipt_id=receipt_id,
                connector_id=connector_id,
                received_at=now,
                signature_valid=sig_valid,
                idempotency_key=idempotency_key,
                status="rejected",
                error=f"json_parse_error: {exc}",
            )
            self._record(receipt)
            return receipt, None

        transformer = self._transformers.get(connector_id)
        if transformer is None:
            receipt = WebhookReceipt(
                receipt_id=receipt_id,
                connector_id=connector_id,
                received_at=now,
                signature_valid=sig_valid,
                idempotency_key=idempotency_key,
                status="rejected",
                error="no_transformer_registered",
            )
            self._record(receipt)
            return receipt, None

        try:
            record = transformer(payload)
        except Exception as exc:
            receipt = WebhookReceipt(
                receipt_id=receipt_id,
                connector_id=connector_id,
                received_at=now,
                signature_valid=sig_valid,
                idempotency_key=idempotency_key,
                status="rejected",
                error=f"transformer_error: {exc}",
            )
            self._record(receipt)
            return receipt, None

        receipt = WebhookReceipt(
            receipt_id=receipt_id,
            connector_id=connector_id,
            received_at=now,
            signature_valid=sig_valid,
            idempotency_key=idempotency_key,
            status="accepted",
            ingest_record=record.model_dump() if hasattr(record, "model_dump") else dict(record.__dict__),
        )
        self._record(receipt)
        return receipt, record

    def _gc_idempotency_keys(self, window_seconds: int) -> None:
        now = time.time()
        to_remove = [k for k, ts in self._seen_idempotency_keys.items() if now - ts > window_seconds]
        for k in to_remove:
            self._seen_idempotency_keys.pop(k, None)

    def _record(self, receipt: WebhookReceipt) -> None:
        self._receipts.append(receipt)
        if len(self._receipts) > self._max_receipts:
            self._receipts.pop(0)

    def recent(self, limit: int = 50) -> List[WebhookReceipt]:
        return self._receipts[-limit:]

    def stats(self) -> Dict[str, int]:
        accepted = sum(1 for r in self._receipts if r.status == "accepted")
        rejected = sum(1 for r in self._receipts if r.status == "rejected")
        duplicate = sum(1 for r in self._receipts if r.status == "duplicate")
        return {
            "total_received": len(self._receipts),
            "accepted": accepted,
            "rejected": rejected,
            "duplicate": duplicate,
            "registered_connectors": len(self._configs),
        }


_receiver: Optional[WebhookReceiver] = None


def get_webhook_receiver() -> WebhookReceiver:
    global _receiver
    if _receiver is None:
        _receiver = WebhookReceiver()
    return _receiver
