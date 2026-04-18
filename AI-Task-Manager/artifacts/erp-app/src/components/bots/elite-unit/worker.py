#!/usr/bin/env python3
"""
Elite Dev Unit 24/7 Worker with SQLite queue

- Enqueue events (feature/bug/incident)
- Worker continuously pulls and processes events
- Stores outputs under ./runs/<event_id>_<run_id>.json

No external infrastructure needed.
"""

from __future__ import annotations
import os
import json
import time
import sqlite3
import argparse
from dataclasses import dataclass
from typing import Optional, Dict, Any

from orchestrator_v2 import DevUnitOrchestrator

DB_PATH = os.environ.get("ELITE_QUEUE_DB", "elite_queue.sqlite3")
RUNS_DIR = os.environ.get("ELITE_RUNS_DIR", "runs")
STACK = os.environ.get("TECH_STACK", "python-fastapi")

os.makedirs(RUNS_DIR, exist_ok=True)

# ============================================
# Queue Database
# ============================================

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at_utc INTEGER NOT NULL,
  started_at_utc INTEGER,
  finished_at_utc INTEGER,
  last_error TEXT,
  stack TEXT DEFAULT 'python-fastapi'
);
CREATE INDEX IF NOT EXISTS idx_events_status_created ON events(status, created_at_utc);
"""

@dataclass
class Event:
    """Queued event"""
    id: int
    type: str
    payload: Dict[str, Any]
    status: str
    stack: str = "python-fastapi"

def get_db() -> sqlite3.Connection:
    """Get database connection with WAL mode"""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def init_db() -> None:
    """Initialize database schema"""
    conn = get_db()
    try:
        conn.executescript(SCHEMA_SQL)
        conn.commit()
        print(f"✅ Database initialized: {DB_PATH}")
    finally:
        conn.close()

def enqueue(event_type: str, payload: Dict[str, Any], stack: str = STACK) -> int:
    """Enqueue a new event"""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO events(type, payload, status, created_at_utc, stack) VALUES(?,?, 'queued', ?, ?)",
            (event_type, json.dumps(payload, ensure_ascii=False), int(time.time()), stack)
        )
        conn.commit()
        event_id = int(cur.lastrowid)
        print(f"📤 Enqueued event {event_id}: {event_type}")
        return event_id
    finally:
        conn.close()

def fetch_next_event() -> Optional[Event]:
    """Fetch and mark next queued event as running"""
    conn = get_db()
    try:
        cur = conn.cursor()
        # Pick oldest queued event
        cur.execute(
            "SELECT id, type, payload, status, stack FROM events WHERE status='queued' ORDER BY created_at_utc ASC LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return None
        
        ev_id, ev_type, payload_json, status, stack = row

        # Mark as running (atomic CAS)
        cur.execute(
            "UPDATE events SET status='running', started_at_utc=? WHERE id=? AND status='queued'",
            (int(time.time()), ev_id)
        )
        if cur.rowcount != 1:
            conn.commit()
            return None  # Race condition - another worker grabbed it
        
        conn.commit()

        return Event(
            id=int(ev_id),
            type=str(ev_type),
            payload=json.loads(payload_json),
            status="running",
            stack=stack or "python-fastapi"
        )
    finally:
        conn.close()

def mark_event_done(ev_id: int) -> None:
    """Mark event as completed"""
    conn = get_db()
    try:
        conn.execute(
            "UPDATE events SET status='done', finished_at_utc=?, last_error=NULL WHERE id=?",
            (int(time.time()), ev_id)
        )
        conn.commit()
    finally:
        conn.close()

def mark_event_failed(ev_id: int, error: str) -> None:
    """Mark event as failed with error message"""
    conn = get_db()
    try:
        conn.execute(
            "UPDATE events SET status='failed', finished_at_utc=?, last_error=? WHERE id=?",
            (int(time.time()), error[:2000], ev_id)
        )
        conn.commit()
    finally:
        conn.close()

def get_event_status(ev_id: int) -> Optional[Dict[str, Any]]:
    """Get event status"""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, type, status, created_at_utc, started_at_utc, finished_at_utc, last_error FROM events WHERE id=?",
            (ev_id,)
        )
        row = cur.fetchone()
        if not row:
            return None
        
        return {
            "id": row[0],
            "type": row[1],
            "status": row[2],
            "created_at_utc": row[3],
            "started_at_utc": row[4],
            "finished_at_utc": row[5],
            "last_error": row[6],
        }
    finally:
        conn.close()

# ============================================
# Worker Loop
# ============================================

def safe_string(s: str) -> str:
    """Sanitize string for filename"""
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in s)[:60]

def worker_loop(poll_seconds: int = 2, max_events: Optional[int] = None) -> None:
    """Main worker loop - continuously processes events"""
    print(f"\n🚀 Elite Dev Unit Worker Started")
    print(f"   DB: {DB_PATH}")
    print(f"   Runs Dir: {RUNS_DIR}")
    print(f"   Poll Interval: {poll_seconds}s")
    if max_events:
        print(f"   Max Events: {max_events}")
    print("=" * 70)
    
    processed = 0
    
    while True:
        ev = fetch_next_event()
        
        if not ev:
            print(f"[{time.strftime('%H:%M:%S')}] Waiting for events...", end="\r")
            time.sleep(poll_seconds)
            continue

        try:
            feature_request = ev.payload.get("request", "")
            if not feature_request.strip():
                raise RuntimeError("Missing 'request' in event payload")

            print(f"\n[{time.strftime('%H:%M:%S')}] 🔄 Processing event {ev.id}")
            print(f"   Type: {ev.type}")
            print(f"   Stack: {ev.stack}")
            print(f"   Request: {feature_request[:80]}...")

            # Run orchestrator pipeline
            orchestrator = DevUnitOrchestrator(stack_name=ev.stack)
            result = orchestrator.process_feature(feature_request)

            # Save output
            out_name = f"{ev.id:06d}_{safe_string(ev.type)}_{result['run_id']}.json"
            out_path = os.path.join(RUNS_DIR, out_name)

            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            mark_event_done(ev.id)
            processed += 1
            print(f"✅ Event {ev.id} complete → {out_path}")
            
            if max_events and processed >= max_events:
                print(f"\n✅ Processed {processed} events. Stopping.")
                break

        except Exception as e:
            error_msg = str(e)
            mark_event_failed(ev.id, error_msg)
            print(f"❌ Event {ev.id} FAILED: {error_msg}")

# ============================================
# CLI Commands
# ============================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Elite Dev Unit 24/7 Queue + Worker"
    )
    subparsers = parser.add_subparsers(dest="cmd", required=True)

    # init command
    p_init = subparsers.add_parser("init", help="Initialize SQLite queue database")
    
    # enqueue command
    p_enq = subparsers.add_parser("enqueue", help="Enqueue a new event")
    p_enq.add_argument(
        "--type",
        default="feature",
        choices=["feature", "bug", "incident", "infrastructure"],
        help="Event type"
    )
    p_enq.add_argument(
        "--request",
        required=True,
        help="Feature/bug/incident description"
    )
    p_enq.add_argument(
        "--stack",
        default=STACK,
        choices=["python-fastapi", "nodejs-nestjs", "go-echo"],
        help="Technology stack"
    )

    # status command
    p_status = subparsers.add_parser("status", help="Check event status")
    p_status.add_argument("--id", type=int, required=True, help="Event ID")

    # work command
    p_work = subparsers.add_parser("work", help="Run worker loop")
    p_work.add_argument(
        "--poll",
        type=int,
        default=2,
        help="Poll interval in seconds"
    )
    p_work.add_argument(
        "--max-events",
        type=int,
        default=None,
        help="Stop after processing N events (for testing)"
    )

    args = parser.parse_args()

    # Initialize DB (always)
    init_db()

    if args.cmd == "init":
        return 0

    if args.cmd == "enqueue":
        event_id = enqueue(
            args.type,
            {"request": args.request},
            stack=args.stack
        )
        return 0

    if args.cmd == "status":
        info = get_event_status(args.id)
        if not info:
            print(f"❌ Event {args.id} not found")
            return 1
        print(f"Event {args.id}:")
        print(f"  Type: {info['type']}")
        print(f"  Status: {info['status']}")
        print(f"  Created: {info['created_at_utc']}")
        if info['last_error']:
            print(f"  Error: {info['last_error']}")
        return 0

    if args.cmd == "work":
        worker_loop(poll_seconds=args.poll, max_events=args.max_events)
        return 0

    return 0

if __name__ == "__main__":
    raise SystemExit(main())