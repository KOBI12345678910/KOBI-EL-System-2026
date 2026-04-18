#!/bin/bash
# Demo: Full workflow for Bash Fixer
# Usage: ./demo.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
AGENT="$PARENT_DIR/bin/run-bash-fixer.sh"
BROKEN="$SCRIPT_DIR/broken-script.sh"

echo "======================================"
echo "🔧 Bash Fixer - Full Demo"
echo "======================================"
echo ""

# Check prerequisites
if [[ ! -f "$AGENT" ]]; then
  echo "❌ Error: run-bash-fixer.sh not found"
  exit 1
fi

if [[ ! -f "$BROKEN" ]]; then
  echo "❌ Error: broken-script.sh not found"
  exit 1
fi

# Step 1: Show broken script
echo "1️⃣  Original Script (with Bash 5+ features)"
echo "─────────────────────────────────────────"
cat "$BROKEN"
echo ""
echo ""

# Step 2: Try to run broken script (will fail)
echo "2️⃣  Attempting to run in Bash 4.4..."
echo "─────────────────────────────────────────"
if bash --version | grep -q "version 4"; then
  echo "✅ You have Bash 4.x installed"
  if bash "$BROKEN" 2>&1 | head -20; then
    echo "✅ Script ran successfully"
  else
    echo "❌ Script failed (expected with Bash 4.4)"
  fi
else
  echo "⚠️  You don't have Bash 4.x (demo requires it)"
  bash "$BROKEN" 2>&1 | head -10 || true
fi
echo ""
echo ""

# Step 3: Check if API key is set
echo "3️⃣  Checking API Configuration..."
echo "─────────────────────────────────────────"
if [[ -z "$OPENAI_API_KEY" ]]; then
  echo "⚠️  OPENAI_API_KEY not set"
  echo "   Run: export OPENAI_API_KEY='sk-...'"
  echo ""
  echo "   Would use: cat script.sh | ./run-bash-fixer.sh > fixed.sh"
  exit 0
else
  echo "✅ OPENAI_API_KEY is set"
fi
echo ""
echo ""

# Step 4: Fix the script
echo "4️⃣  Fixing Script via AI..."
echo "─────────────────────────────────────────"
FIXED_FILE="/tmp/fixed-script.sh"

if cat "$BROKEN" | bash "$AGENT" > "$FIXED_FILE" 2>/dev/null; then
  echo "✅ Script fixed successfully"
  echo ""
  echo "Fixed script:"
  echo "─────────────"
  cat "$FIXED_FILE"
  echo ""
  echo ""
  
  # Step 5: Test fixed script
  echo "5️⃣  Testing Fixed Script..."
  echo "─────────────────────────────────────────"
  if bash "$FIXED_FILE"; then
    echo ""
    echo "✅ Fixed script runs successfully!"
  else
    echo ""
    echo "❌ Fixed script still has issues"
  fi
else
  echo "❌ Failed to fix script (API error or timeout)"
  exit 1
fi

echo ""
echo "======================================"
echo "✅ Demo Complete!"
echo "======================================"