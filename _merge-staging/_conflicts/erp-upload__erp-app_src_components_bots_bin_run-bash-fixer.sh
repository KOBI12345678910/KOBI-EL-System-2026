#!/bin/bash
# =============================================================
# Bash Fixer Wrapper - Easy shell script
# =============================================================
# Usage:
#   ./run-bash-fixer.sh script.sh
#   cat script.sh | ./run-bash-fixer.sh
#   ./run-bash-fixer.sh script.sh --max-iters 5
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_AGENT="$SCRIPT_DIR/ai-bash-fix-agent.py"

if [[ ! -f "$PYTHON_AGENT" ]]; then
    echo "Error: ai-bash-fix-agent.py not found at $PYTHON_AGENT" >&2
    exit 1
fi

if [[ -z "$OPENAI_API_KEY" ]]; then
    echo "Error: OPENAI_API_KEY environment variable not set" >&2
    echo "   Run: export OPENAI_API_KEY='sk-...'" >&2
    exit 1
fi

chmod +x "$PYTHON_AGENT" 2>/dev/null || true
exec python3 "$PYTHON_AGENT" "$@"
