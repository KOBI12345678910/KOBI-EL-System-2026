# 🚀 Elite Dev Unit - Quick Start

## Setup (2 דקות)

```bash
cd components/bots/elite-unit

# Install dependencies
pip install -r requirements.txt

# Set API key
export OPENAI_API_KEY="sk-proj-..."
```

## Run Pipeline (Example: CRM Lead Module)

### Option 1: Python script
```bash
python3 example_run.py
```

### Option 2: Direct CLI
```bash
python3 orchestrator_v2.py \
  --request "לבנות מודול CRM לניהול לידים עם קליטה, סטטוסים, תזכורות, שיוך למוכר ודוחות" \
  --out lead_crm_run.json
```

### Option 3: Bash script
```bash
bash run_example.sh
```

---

## Output

Gets `lead_crm_run.json` with:

```json
{
  "run_id": "RUN-A1B2C3D4",
  "timestamp_utc": "2026-02-10T...",
  "feature_request": "...",
  "outputs": {
    "product": { ... },      // Full spec
    "architect": { ... },    // System design
    "cto": { ... },          // Tech decisions
    "backend": { ... },      // Backend tasks
    "devops": { ... },       // Infrastructure
    "qa": { ... },           // Test strategy
    "security": { ... }      // Security review
  },
  "status": "READY_FOR_DEVELOPMENT",
  "next_steps": [ ... ]
}
```

---

## View Results

```bash
# Pretty print
python3 -m json.tool lead_crm_run.json | less

# Count tasks
jq '.outputs.backend.task_breakdown | length' lead_crm_run.json

# Extract product spec
jq '.outputs.product' lead_crm_run.json
```

---

## Key Features

✅ **7 AI Agents** - Each role makes independent decisions  
✅ **Structured JSON** - Machine-readable outputs for automation  
✅ **Zero Hallucination** - Uses placeholders for unknowns  
✅ **Enterprise Focus** - RBAC, audit logs, security-first  
✅ **Ready to Build** - Outputs directly feed into development  

---

## What's Next?

After you run the pipeline:

1. **Review outputs** - CTO decision, architecture, task breakdown
2. **Create sprints** - Assign Backend/Frontend/DevOps tasks
3. **Set up monitoring** - Use QA plan and DevOps checklist
4. **Deploy safely** - Follow release notes + rollback plan

---

## Advanced: 24/7 Worker (Future)

To make this fully autonomous:

```python
# Pseudo-code for continuous pipeline
while True:
    task = queue.pop()  # From Redis/Kafka
    if task:
        result = orchestrator.process_feature(task)
        github.create_issue(result)  # Link to GitHub
        notifications.send(result)   # Slack/teams
    time.sleep(5)
```

---

## Questions?

- Check `orchestrator_v2.py` for agent definitions
- See `schemas.py` for output types
- Read `orchestrator.py` v1 for full featured version