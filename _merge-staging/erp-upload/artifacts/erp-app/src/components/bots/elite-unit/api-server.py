#!/usr/bin/env python3
"""
Elite Dev Unit API Server
Provides REST endpoints for UI integration:
- POST /enqueue — Add event to queue
- GET /events — List recent events
- GET /run/<run_id> — Get run details
"""

from __future__ import annotations
import os
import json
import sqlite3
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from pathlib import Path

from worker import (
    get_db, enqueue, fetch_next_event, mark_event_done, mark_event_failed,
    get_event_status, RUNS_DIR, STACK
)

class EliteAPIHandler(BaseHTTPRequestHandler):
    """HTTP request handler for Elite Dev Unit API"""

    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        """POST endpoints"""
        path = urlparse(self.path).path

        if path == "/api/elite-queue/enqueue":
            self.handle_enqueue()
        else:
            self.send_error(404)

    def do_GET(self):
        """GET endpoints"""
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if path == "/api/elite-queue/events":
            self.handle_list_events()
        elif path.startswith("/api/elite-queue/run/"):
            run_id = path.split("/")[-1]
            self.handle_get_run(run_id)
        else:
            self.send_error(404)

    def handle_enqueue(self):
        """POST /api/elite-queue/enqueue"""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            data = json.loads(body)

            event_type = data.get("type", "feature")
            request = data.get("request", "")
            stack = data.get("stack", STACK)

            if not request.strip():
                self.send_json(400, {"error": "Missing request"})
                return

            event_id = enqueue(event_type, {"request": request}, stack=stack)

            self.send_json(200, {
                "success": True,
                "event_id": event_id,
                "message": f"Event {event_id} enqueued"
            })

        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_list_events(self):
        """GET /api/elite-queue/events"""
        try:
            conn = get_db()
            try:
                cur = conn.cursor()
                cur.execute(
                    "SELECT id, type, status, payload, created_at_utc FROM events ORDER BY created_at_utc DESC LIMIT 50"
                )
                rows = cur.fetchall()

                events = [
                    {
                        "id": row[0],
                        "type": row[1],
                        "status": row[2],
                        "payload": json.loads(row[3]),
                        "created_at_utc": row[4],
                    }
                    for row in rows
                ]

                self.send_json(200, events)

            finally:
                conn.close()

        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_get_run(self, run_id: str):
        """GET /api/elite-queue/run/<run_id>"""
        try:
            # Try to find the run file
            runs_dir = Path(RUNS_DIR)
            if not runs_dir.exists():
                self.send_json(404, {"error": "No runs directory"})
                return

            # Look for file matching run_id
            for file in runs_dir.glob("*.json"):
                if run_id in file.name:
                    with open(file, "r") as f:
                        data = json.load(f)
                    self.send_json(200, data)
                    return

            self.send_json(404, {"error": f"Run {run_id} not found"})

        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def send_json(self, status: int, data: dict):
        """Send JSON response"""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        """Suppress default logging"""
        pass

def run_server(host: str = "0.0.0.0", port: int = 8765):
    """Start API server"""
    server = HTTPServer((host, port), EliteAPIHandler)
    print(f"🚀 Elite Dev Unit API Server")
    print(f"   http://{host}:{port}")
    print(f"   GET  /api/elite-queue/events")
    print(f"   POST /api/elite-queue/enqueue")
    print(f"   GET  /api/elite-queue/run/<run_id>")
    print(f"\nPress Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n✅ Server stopped")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Elite Dev Unit API Server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)

    args = parser.parse_args()
    run_server(host=args.host, port=args.port)