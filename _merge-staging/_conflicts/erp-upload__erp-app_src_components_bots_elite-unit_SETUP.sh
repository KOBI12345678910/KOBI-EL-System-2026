#!/bin/bash
set -euo pipefail

echo "🚀 Elite Unit Setup"
echo "===================="

# Python environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Setup .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ Created .env - edit with your OPENAI_API_KEY"
else
  echo "✓ .env already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your OPENAI_API_KEY"
echo "  2. Run: python orchestrator.py"
echo ""