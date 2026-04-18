#!/usr/bin/env bash
set -euo pipefail

: "${OPENAI_API_KEY:?Set OPENAI_API_KEY env var first}"

# Usage:
#   ./run_fix.sh your_script.sh > fixed.sh
#   bash fixed.sh
#
# Or:
#   cat your_script.sh | ./run_fix.sh > fixed.sh

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [script.sh]" >&2
  exit 2
fi

if [[ $# -eq 1 ]]; then
  cat "$1" | ./ai-bash-fix-agent.py --bash bash --max-iters 3
else
  ./ai-bash-fix-agent.py --bash bash --max-iters 3
fi
