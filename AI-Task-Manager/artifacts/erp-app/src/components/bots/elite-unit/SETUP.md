# 🚀 Elite Dev Unit - Setup Guide

Complete setup for autonomous 24/7 development machine with stack-aware agents.

---

## ✅ Prerequisites

- Python 3.11+
- pip / conda
- OpenAI API key (gpt-4-turbo)
- Optional: GitHub token, Slack webhook, SMTP credentials

---

## 1️⃣ Installation

```bash
cd components/bots/elite-unit

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

---

## 2️⃣ Configuration

Create `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required
OPENAI_API_KEY="sk-proj-..."
OPENAI_MODEL="gpt-4-turbo"

# Optional but recommended
TECH_STACK="python-fastapi"  # or nodejs-nestjs, go-echo

# GitHub (creates PRs automatically)
GITHUB_TOKEN="ghp_..."
GITHUB_OWNER="your-org"
GITHUB_REPO="your-repo"

# Slack (notifications)
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."

# Email (distribution)
SMTP_HOST="smtp.gmail.com"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
```

---

## 3️⃣ Initialize Queue Database

```bash
python3 worker.py init
```

Output:
```
✅ Database initialized: elite_queue.sqlite3
```

---

## 4️⃣ Start Components

### Terminal 1: Worker (processes events)

```bash
python3 worker.py work --poll 2
```

This runs 24/7, pulling events from queue and executing the full pipeline.

### Terminal 2: Scheduler (enqueues recurring tasks)

```bash
# Optional: Daily updates, weekly analysis, etc.
python3 scheduler.py --poll 60
```

### Terminal 3: API Server (for UI dashboard)

```bash
# Runs on http://localhost:8765
python3 api_server.py --port 8765
```

### Terminal 4: Company Updates (logs & notifications)

```bash
# Watch output
tail -f company_updates.log
```

---

## 5️⃣ Enqueue Your First Event

```bash
# Feature request
python3 worker.py enqueue \
  --type feature \
  --request "Build CRM lead module with status tracking" \
  --stack python-fastapi

# Bug fix
python3 worker.py enqueue \
  --type bug \
  --request "Fix auth middleware not validating JWT" \
  --stack nodejs-nestjs

# Infrastructure
python3 worker.py enqueue \
  --type infrastructure \
  --request "Set up Redis cluster and Kafka topics" \
  --stack go-echo
```

Check processing:

```bash
# View queue status
python3 worker.py status --id 1

# View output
ls -la runs/
cat runs/000001_feature_RUN-*.json | jq
```

---

## 🎯 Technology Stacks Supported

### Python/FastAPI
```
Backend: Python 3.11 + FastAPI
ORM: SQLAlchemy 2.0 + Alembic
Database: PostgreSQL 15+
Container: Docker + Kubernetes
IaC: Terraform
Testing: pytest + coverage
```

### Node.js/NestJS
```
Backend: TypeScript 5.0 + NestJS
ORM: TypeORM / Prisma
Database: PostgreSQL 15+ / MongoDB
Container: Docker + Kubernetes
IaC: Terraform / CDK
Testing: Jest + Supertest
```

### Go/Echo
```
Backend: Go 1.21 + Echo
ORM: GORM
Database: PostgreSQL 15+ / MySQL 8+
Container: Docker + Kubernetes
IaC: Terraform / Pulumi
Testing: testify + Go testing
```

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────┐
│          UI Dashboard (EliteDeveloperUnit)      │
│  - Enqueue events (feature/bug/infra)           │
│  - Monitor queue status                         │
│  - View run results                             │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   Scheduler            API Server (8765)
   (enqueues)           (REST API)
        │                         │
        └────────────┬────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │   SQLite Queue       │
          │  elite_queue.sqlite3 │
          └──────────┬───────────┘
                     │
                     ▼
    ┌────────────────────────────────┐
    │   Elite Dev Unit Worker        │
    │   (processes events 24/7)      │
    └────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
    [Product]  [Architect]  [Backend]
      Spec       Design        Tasks
        │            │            │
        └────────────┼────────────┘
                     │
        ┌────────────┼────────────────┐
        │            │                │
        ▼            ▼                ▼
    [DevOps]    [Security]        [QA]
     IaC/CI      Threat Model    Tests
        │            │                │
        └────────────┼────────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │  Run Output     │
            │  JSON + Files   │
            └────────┬────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
     GitHub       Slack        Email
    (PR auto)    (notify)    (publish)
```

---

## 🔗 GitHub Integration

If configured, generated code automatically creates PRs:

```bash
# Example output
✅ PR #42: https://github.com/your-org/your-repo/pull/42
```

Features:
- Auto-creates feature branch (`elite/RUN-ABC123`)
- Commits generated files (main.py, requirements.txt, Dockerfile, etc.)
- Creates PR with formatted code + documentation
- Links to run_id for traceability

---

## 📢 Slack/Email Notifications

Company updates are published to configured channels:

```
✨ CRM Lead Module Released
   Generated on: 2026-02-10T09:00:00Z
   Stack: Python/FastAPI
   
Updates sent to:
  - Slack webhook
  - team@company.com
  - company_updates.log
```

---

## 📈 Monitoring

### Queue Status

```bash
sqlite3 elite_queue.sqlite3 "SELECT id, type, status FROM events LIMIT 10;"
```

### Recent Outputs

```bash
ls -lht runs/ | head -10
```

### Worker Health

```bash
ps aux | grep worker.py
tail -f worker.log
```

---

## 🐛 Troubleshooting

### API Rate Limiting

Space out enqueued events:
```bash
for i in {1..5}; do
  python3 worker.py enqueue --request "Feature $i"
  sleep 30  # Wait 30s between events
done
```

### Database Locked

SQLite locks typically resolve automatically. If stuck:
```bash
# Force reset
rm -f elite_queue.sqlite3* && python3 worker.py init
```

### GitHub Auth Failed

Check token:
```bash
export GITHUB_TOKEN="ghp_..."
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/user
```

---

## 🚀 Advanced: Docker Deployment

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
docker build -t elite-dev-unit .
docker run -e OPENAI_API_KEY="sk-..." \
           -v $(pwd)/runs:/app/runs \
           -v $(pwd)/elite_queue.sqlite3:/app/elite_queue.sqlite3 \
           elite-dev-unit
```

---

## ✨ Next Steps

1. ✅ Set up environment
2. ✅ Initialize queue
3. ✅ Start worker + API server
4. ✅ Enqueue first event
5. 📊 Monitor in dashboard
6. 🔗 Connect GitHub (auto-PR)
7. 📢 Set up Slack/Email
8. 📅 Schedule recurring tasks

---

## 📚 Documentation

- `README.md` — Overview & features
- `WORKER_README.md` — Queue & worker details
- `orchestrator_v2.py` — Stack-aware agents
- `stack_config.py` — Technology stacks
- `publisher.py` — Output publishing
- `github_integration.py` — GitHub automation

---

**Questions?** Check logs, review agent outputs in `runs/`, or re-run with `--poll 2` for debugging.