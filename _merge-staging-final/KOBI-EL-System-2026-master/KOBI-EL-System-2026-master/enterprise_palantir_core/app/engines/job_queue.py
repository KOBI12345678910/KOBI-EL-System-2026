"""
Job Queue Engine — in-memory async job queue with worker pool.

Different from the scheduler (which fires cron-style jobs on an
interval). The JobQueue accepts one-off background tasks submitted
at runtime and runs them through a pool of async workers.

Features:
  - submit(handler, params) returns a Job id
  - workers run async, FIFO
  - retry on failure with exponential backoff
  - job status lifecycle: queued → running → success | failed | retrying
  - worker pool size configurable
  - full run history with duration + error

Zero dependencies.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_job_id() -> str:
    return f"job_{uuid.uuid4().hex[:16]}"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"


JobHandler = Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]]


@dataclass
class Job:
    job_id: str
    job_type: str
    params: Dict[str, Any]
    status: JobStatus = JobStatus.QUEUED
    created_at: datetime = field(default_factory=utc_now)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    priority: int = 5  # 1 = high, 9 = low


class JobQueue:
    def __init__(self, worker_count: int = 4) -> None:
        self.worker_count = worker_count
        self._handlers: Dict[str, JobHandler] = {}
        self._queue: asyncio.Queue = asyncio.Queue()
        self._jobs: Dict[str, Job] = {}
        self._workers: List[asyncio.Task] = []
        self._running = False

    def register_handler(self, job_type: str, handler: JobHandler) -> None:
        self._handlers[job_type] = handler

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        for i in range(self.worker_count):
            worker = asyncio.create_task(self._worker_loop(f"worker-{i}"))
            self._workers.append(worker)

    async def stop(self) -> None:
        self._running = False
        for w in self._workers:
            w.cancel()
        self._workers = []

    def submit(
        self,
        job_type: str,
        params: Dict[str, Any],
        *,
        priority: int = 5,
        max_retries: int = 3,
    ) -> Job:
        job = Job(
            job_id=new_job_id(),
            job_type=job_type,
            params=params,
            priority=priority,
            max_retries=max_retries,
        )
        self._jobs[job.job_id] = job
        self._queue.put_nowait(job)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def list(self, *, status: Optional[JobStatus] = None, limit: int = 100) -> List[Job]:
        jobs = list(self._jobs.values())
        if status:
            jobs = [j for j in jobs if j.status == status]
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]

    def cancel(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if job is None:
            return False
        if job.status != JobStatus.QUEUED:
            return False
        job.status = JobStatus.CANCELLED
        return True

    def stats(self) -> Dict[str, int]:
        counts = {s.value: 0 for s in JobStatus}
        for j in self._jobs.values():
            counts[j.status.value] += 1
        counts["workers"] = self.worker_count
        counts["queue_depth"] = self._queue.qsize()
        return counts

    async def _worker_loop(self, worker_name: str) -> None:
        while self._running:
            try:
                job = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except Exception:
                continue

            if job.status == JobStatus.CANCELLED:
                continue

            await self._run_job(job)

    async def _run_job(self, job: Job) -> None:
        handler = self._handlers.get(job.job_type)
        if handler is None:
            job.status = JobStatus.FAILED
            job.error = f"no handler for job_type={job.job_type}"
            job.finished_at = utc_now()
            return

        job.status = JobStatus.RUNNING
        job.started_at = utc_now()

        try:
            result = await handler(job.params)
            job.result = result
            job.status = JobStatus.SUCCESS
        except Exception as exc:
            job.error = str(exc)
            if job.retry_count < job.max_retries:
                job.retry_count += 1
                job.status = JobStatus.RETRYING
                # Exponential backoff: 1s, 2s, 4s, 8s, ...
                await asyncio.sleep(2 ** job.retry_count)
                self._queue.put_nowait(job)
                return
            job.status = JobStatus.FAILED

        job.finished_at = utc_now()
        if job.started_at:
            job.duration_ms = int((job.finished_at - job.started_at).total_seconds() * 1000)


_queue: Optional[JobQueue] = None


def get_job_queue() -> JobQueue:
    global _queue
    if _queue is None:
        _queue = JobQueue(worker_count=4)
    return _queue
