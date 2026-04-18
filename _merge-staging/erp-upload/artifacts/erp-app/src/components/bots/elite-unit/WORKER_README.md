# 🚀 Elite Dev Unit 24/7 Worker

**Continuous Development Machine** — Queue-based event processor for 24/7 autonomous feature development.

---

## Setup

```bash
cd components/bots/elite-unit

# Install
pip install -r requirements.txt

# Set API key
export OPENAI_API_KEY="sk-proj-..."

# Initialize queue
python3 worker.py init
```

---

## Usage

### 1️⃣ Enqueue Events

```bash
# Feature request
python3 worker.py enqueue \
  --type feature \
  --request "Build CRM lead module with status tracking" \
  --stack python-fastapi

# Bug
python3 worker.py enqueue \
  --type bug \
  --request "Fix memory leak in background job processor" \
  --stack nodejs-nestjs

# Infrastructure
python3 worker.py enqueue \
  --type infrastructure \
  --request "Set up Redis cluster and Kafka topics" \
  --stack go-echo
```

### 2️⃣ Start Worker (24/7)

```bash
# Run continuously, process events as they arrive
python3 worker.py work --poll 2

# Or: Process 10 events then stop (for testing)
python3 worker.py work --max-events 10
```

### 3️⃣ Check Status

```bash
python3 worker.py status --id 1
```

---

## Architecture

```
Event Queue (SQLite)
     ↓
[Worker Loop polls every 2s]
     ↓
Event picked up → Status = "running"
     ↓
DevUnitOrchestrator.process_feature()
  ├─ Product Manager (spec)
  ├─ Architect (design)
  ├─ CTO (decision)
  ├─ Backend Lead (tasks + code)
  ├─ DevOps (infrastructure + CI/CD)
  ├─ QA (test strategy)
  └─ Security (threat model)
     ↓
Output JSON saved to runs/<event_id>_<run_id>.json
     ↓
Status = "done" or "failed"
```

---

## Database Schema

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  type TEXT,           -- feature, bug, incident, infrastructure
  payload TEXT,        -- JSON: { "request": "..." }
  status TEXT,         -- queued, running, done, failed
  created_at_utc INT,
  started_at_utc INT,
  finished_at_utc INT,
  last_error TEXT,
  stack TEXT           -- python-fastapi, nodejs-nestjs, go-echo
);
```

---

## Output Files

Each processed event generates:

```
runs/
├── 000001_feature_RUN-A1B2C3D4.json
├── 000002_bug_RUN-B2C3D4E5.json
├── 000003_infrastructure_RUN-C3D4E5F6.json
...
```

Each file contains:
- `run_id` — Unique run identifier
- `feature_request` — Original request
- `tech_stack` — Stack used (python-fastapi, etc.)
- `outputs` — Agent decisions (product, architect, backend, devops, qa, security, cto)
- `status` — READY_FOR_DEVELOPMENT
- `next_steps` — What to do next

---

## Advanced: Run in Background

### Screen / Tmux

```bash
screen -S elite-worker -d -m python3 worker.py work --poll 2
screen -ls
screen -r elite-worker
```

### Systemd Service

```ini
[Unit]
Description=Elite Dev Unit Worker
After=network.target

[Service]
Type=simple
User=developer
WorkingDirectory=/path/to/elite-unit
ExecStart=/usr/bin/python3 worker.py work --poll 2
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Install:
```bash
sudo cp elite-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable elite-worker
sudo systemctl start elite-worker
```

### Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
ENV OPENAI_API_KEY=${OPENAI_API_KEY}
CMD ["python3", "worker.py", "work", "--poll", "2"]
```

Run:
```bash
docker run -e OPENAI_API_KEY="sk-..." -v $(pwd)/runs:/app/runs elite-worker
```

---

## Monitoring

### Queue Status

```bash
sqlite3 elite_queue.sqlite3 \
  "SELECT id, type, status, created_at_utc FROM events ORDER BY created_at_utc DESC LIMIT 20;"
```

### Processed Events

```bash
ls -la runs/ | wc -l
```

### Tail Output JSON

```bash
jq '.outputs | keys' runs/*.json | tail -20
```

---

## Integration Examples

### GitHub Webhook

```python
# Pseudo: receive webhook → enqueue
@app.post("/github/webhook")
async def github_webhook(payload: dict):
    if payload["action"] == "opened" and "feature:" in payload["issue"]["title"]:
        worker.enqueue(
            "feature",
            {"request": payload["issue"]["body"]}
        )
    return {"ok": True}
```

### Slack Command

```python
# /develop <request>
def slack_develop(request: str):
    event_id = worker.enqueue("feature", {"request": request})
    return f"📤 Enqueued event {event_id}"
```

### Cron Scheduled

```bash
# Run analysis every 6 hours
0 */6 * * * python3 worker.py enqueue --type infrastructure --request "Analyze and optimize infrastructure"
```

---

## Key Features

✅ **No External Dependencies** — SQLite only, runs anywhere  
✅ **Atomic Queue** — WAL mode + proper locking  
✅ **Stack Aware** — Python/FastAPI, Node/NestJS, Go/Echo  
✅ **Full Audit Trail** — Every event logged with timestamps  
✅ **Error Resilience** — Failed events don't block queue  
✅ **Scalable** — Multiple workers can share same DB  

---

## Troubleshooting

### "Database is locked"

Increase timeout or use separate worker process:
```bash
python3 worker.py work --poll 5  # Longer poll = less contention
```

### Worker not picking up events

```bash
python3 worker.py status --id 1  # Check if stuck in "running"
sqlite3 elite_queue.sqlite3 "UPDATE events SET status='queued' WHERE status='running';"
```

### API Rate Limiting

Space out enqueued events or use batch scheduling:
```bash
# Enqueue with 30s delay between each
for i in {1..10}; do
  python3 worker.py enqueue --request "Feature $i"
  sleep 30
done
```

---

## Next: GitHub Integration

To connect to GitHub Issues:

```python
# auto-create PR with generated code
# link to GitHub Issue
# comment with run results
```

See `github_integration.py` (coming soon).