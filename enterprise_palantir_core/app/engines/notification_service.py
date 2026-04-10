"""
Notification Service — fans out alerts and AI recommendations to
external delivery channels: email, webhook, Slack, SMS, PagerDuty.

Each channel is a protocol-satisfying handler. Built-in handlers:
  - LogChannel    — logs to stdout (always active, useful for dev)
  - WebhookChannel — POSTs JSON to a configured URL (uses httpx)
  - EmailChannel   — SMTP (uses stdlib smtplib)
  - SlackChannel   — POSTs a Slack incoming webhook
  - PagerDutyChannel — routes severity=critical to PagerDuty Events API v2
  - ConsoleChannel — print() for quick demos

Channels can be enabled/disabled per tenant. Severity routing rules
decide which channels receive which alerts (e.g., critical → all,
warning → email only, info → log only).
"""

from __future__ import annotations

import asyncio
import json
import smtplib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DeliveryResult(str, Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    SKIPPED = "skipped"


@dataclass
class NotificationMessage:
    title: str
    body: str
    severity: str                      # info | warning | high | critical
    tenant_id: str
    entity_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)


@dataclass
class DeliveryAttempt:
    channel: str
    result: DeliveryResult
    message: str
    attempted_at: datetime = field(default_factory=utc_now)


class NotificationChannel(Protocol):
    name: str
    min_severity: str  # lowest severity this channel accepts

    async def send(self, message: NotificationMessage) -> DeliveryAttempt: ...


SEVERITY_RANK = {"info": 0, "warning": 1, "high": 2, "critical": 3}


def _meets_threshold(msg_severity: str, min_severity: str) -> bool:
    return SEVERITY_RANK.get(msg_severity, 0) >= SEVERITY_RANK.get(min_severity, 0)


# ════════════════════════════════════════════════════════════════
# BUILT-IN CHANNELS
# ════════════════════════════════════════════════════════════════

class LogChannel:
    def __init__(self, min_severity: str = "info") -> None:
        self.name = "log"
        self.min_severity = min_severity

    async def send(self, message: NotificationMessage) -> DeliveryAttempt:
        print(
            f"[notify:{self.name}] [{message.severity}] {message.tenant_id} "
            f"{message.title}: {message.body[:120]}"
        )
        return DeliveryAttempt(channel=self.name, result=DeliveryResult.SUCCESS, message="logged")


class ConsoleChannel(LogChannel):
    def __init__(self, min_severity: str = "info") -> None:
        super().__init__(min_severity)
        self.name = "console"


class WebhookChannel:
    def __init__(self, name: str, url: str, min_severity: str = "warning") -> None:
        self.name = name
        self.url = url
        self.min_severity = min_severity

    async def send(self, message: NotificationMessage) -> DeliveryAttempt:
        try:
            import httpx  # type: ignore
        except ImportError:
            return DeliveryAttempt(
                channel=self.name,
                result=DeliveryResult.SKIPPED,
                message="httpx not installed",
            )
        payload = {
            "title": message.title,
            "body": message.body,
            "severity": message.severity,
            "tenant_id": message.tenant_id,
            "entity_id": message.entity_id,
            "metadata": message.metadata,
            "tags": message.tags,
            "generated_at": utc_now().isoformat(),
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(self.url, json=payload)
                if 200 <= r.status_code < 300:
                    return DeliveryAttempt(
                        channel=self.name,
                        result=DeliveryResult.SUCCESS,
                        message=f"status={r.status_code}",
                    )
                return DeliveryAttempt(
                    channel=self.name,
                    result=DeliveryResult.FAILURE,
                    message=f"status={r.status_code}",
                )
        except Exception as exc:
            return DeliveryAttempt(
                channel=self.name,
                result=DeliveryResult.FAILURE,
                message=str(exc),
            )


class SlackChannel:
    def __init__(self, webhook_url: str, min_severity: str = "warning") -> None:
        self.name = "slack"
        self.webhook_url = webhook_url
        self.min_severity = min_severity

    async def send(self, message: NotificationMessage) -> DeliveryAttempt:
        try:
            import httpx  # type: ignore
        except ImportError:
            return DeliveryAttempt(
                channel=self.name,
                result=DeliveryResult.SKIPPED,
                message="httpx not installed",
            )
        severity_emoji = {"info": "i", "warning": "!", "high": "!!", "critical": "!!!"}
        emoji = severity_emoji.get(message.severity, "i")
        text = f"[{emoji} {message.severity.upper()}] {message.title}\n{message.body}"
        payload = {"text": text, "attachments": [{
            "color": {"info": "good", "warning": "warning", "high": "warning", "critical": "danger"}.get(message.severity, "good"),
            "fields": [
                {"title": "Tenant", "value": message.tenant_id, "short": True},
                {"title": "Entity", "value": message.entity_id or "—", "short": True},
            ],
        }]}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(self.webhook_url, json=payload)
                if 200 <= r.status_code < 300:
                    return DeliveryAttempt(channel=self.name, result=DeliveryResult.SUCCESS, message="posted")
                return DeliveryAttempt(channel=self.name, result=DeliveryResult.FAILURE, message=f"status={r.status_code}")
        except Exception as exc:
            return DeliveryAttempt(channel=self.name, result=DeliveryResult.FAILURE, message=str(exc))


class EmailChannel:
    def __init__(
        self,
        smtp_host: str,
        smtp_port: int,
        username: str,
        password: str,
        from_addr: str,
        to_addrs: List[str],
        min_severity: str = "high",
    ) -> None:
        self.name = "email"
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.username = username
        self.password = password
        self.from_addr = from_addr
        self.to_addrs = to_addrs
        self.min_severity = min_severity

    async def send(self, message: NotificationMessage) -> DeliveryAttempt:
        # Run the blocking smtplib in a thread pool
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, self._send_sync, message)
            return DeliveryAttempt(channel=self.name, result=DeliveryResult.SUCCESS, message="sent")
        except Exception as exc:
            return DeliveryAttempt(channel=self.name, result=DeliveryResult.FAILURE, message=str(exc))

    def _send_sync(self, message: NotificationMessage) -> None:
        mime = MIMEMultipart()
        mime["Subject"] = f"[{message.severity.upper()}] {message.title}"
        mime["From"] = self.from_addr
        mime["To"] = ", ".join(self.to_addrs)
        body = (
            f"{message.body}\n\n"
            f"Tenant: {message.tenant_id}\n"
            f"Entity: {message.entity_id or '—'}\n"
            f"Severity: {message.severity}\n"
            f"Tags: {', '.join(message.tags)}\n\n"
            f"Metadata:\n{json.dumps(message.metadata, indent=2)}"
        )
        mime.attach(MIMEText(body, "plain", "utf-8"))
        with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10) as s:
            s.starttls()
            s.login(self.username, self.password)
            s.sendmail(self.from_addr, self.to_addrs, mime.as_string())


class PagerDutyChannel:
    def __init__(self, routing_key: str, min_severity: str = "critical") -> None:
        self.name = "pagerduty"
        self.routing_key = routing_key
        self.min_severity = min_severity

    async def send(self, message: NotificationMessage) -> DeliveryAttempt:
        try:
            import httpx  # type: ignore
        except ImportError:
            return DeliveryAttempt(
                channel=self.name,
                result=DeliveryResult.SKIPPED,
                message="httpx not installed",
            )
        payload = {
            "routing_key": self.routing_key,
            "event_action": "trigger",
            "payload": {
                "summary": f"[{message.severity}] {message.title}",
                "severity": "critical" if message.severity == "critical" else "error",
                "source": message.tenant_id,
                "custom_details": {
                    "body": message.body,
                    "entity_id": message.entity_id,
                    "metadata": message.metadata,
                },
            },
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post("https://events.pagerduty.com/v2/enqueue", json=payload)
                if 200 <= r.status_code < 300:
                    return DeliveryAttempt(channel=self.name, result=DeliveryResult.SUCCESS, message="triggered")
                return DeliveryAttempt(channel=self.name, result=DeliveryResult.FAILURE, message=f"status={r.status_code}")
        except Exception as exc:
            return DeliveryAttempt(channel=self.name, result=DeliveryResult.FAILURE, message=str(exc))


# ════════════════════════════════════════════════════════════════
# SERVICE
# ════════════════════════════════════════════════════════════════

class NotificationService:
    def __init__(self) -> None:
        self._channels: List[NotificationChannel] = [LogChannel(min_severity="info")]
        self._history: List[Dict[str, Any]] = []
        self._history_limit = 500

    def register(self, channel: NotificationChannel) -> None:
        self._channels.append(channel)

    def channels(self) -> List[str]:
        return [c.name for c in self._channels]

    async def dispatch(self, message: NotificationMessage) -> List[DeliveryAttempt]:
        results: List[DeliveryAttempt] = []
        for channel in self._channels:
            if not _meets_threshold(message.severity, channel.min_severity):
                results.append(DeliveryAttempt(
                    channel=channel.name,
                    result=DeliveryResult.SKIPPED,
                    message=f"below min_severity {channel.min_severity}",
                ))
                continue
            try:
                res = await channel.send(message)
            except Exception as exc:
                res = DeliveryAttempt(channel=channel.name, result=DeliveryResult.FAILURE, message=str(exc))
            results.append(res)
        self._history.append({
            "title": message.title,
            "severity": message.severity,
            "tenant_id": message.tenant_id,
            "entity_id": message.entity_id,
            "results": [{"channel": r.channel, "result": r.result.value, "message": r.message} for r in results],
            "dispatched_at": utc_now().isoformat(),
        })
        if len(self._history) > self._history_limit:
            self._history.pop(0)
        return results

    def recent_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        return self._history[-limit:]


_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    global _service
    if _service is None:
        _service = NotificationService()
    return _service
