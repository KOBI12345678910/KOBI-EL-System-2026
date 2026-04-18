#!/bin/bash
set -euo pipefail

echo "🚀 Elite Dev Unit - CRM Lead Management Module"
echo "=============================================="

# Set up environment
export OPENAI_API_KEY="${OPENAI_API_KEY:?Error: OPENAI_API_KEY not set}"
export ORG_NAME="HiTech"
export TEAM_NAME="Elite Dev Unit"

# Run orchestrator
python3 orchestrator_v2.py \
  --request "לבנות מודול CRM לניהול לידים: קליטת לידים מטפסים/import, ניהול סטטוסים (חדש/זוקף/סגור), תזכורות אוטומטיות, שיוך למוכר, דוחות ביצוע וגרפים בסיסיים" \
  --out lead_crm_run.json

echo ""
echo "✅ Pipeline complete!"
echo "📄 Output: lead_crm_run.json"
echo ""
echo "View results:"
echo "  cat lead_crm_run.json | jq ."