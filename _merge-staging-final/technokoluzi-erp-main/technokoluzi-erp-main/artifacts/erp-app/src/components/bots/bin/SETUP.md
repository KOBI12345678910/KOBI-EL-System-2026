# Bash Fixer Setup

## Prerequisites
- Python 3.6+
- Bash (any version, but will fix for 4.4)
- OpenAI API Key

## Setup

```bash
# 1. Make scripts executable
chmod +x ai-bash-fix-agent.py run-fix.sh

# 2. Set your OpenAI API key (required)
export OPENAI_API_KEY="sk-..."

# 3. (Optional) Set custom model
export OPENAI_MODEL="gpt-4.1-mini"
```

## Usage

### Method 1: File Input
```bash
./run-fix.sh your_script.sh > fixed.sh
bash fixed.sh
```

### Method 2: Stdin
```bash
cat your_script.sh | ./run-fix.sh > fixed.sh
bash fixed.sh
```

### Method 3: Direct Python
```bash
cat your_script.sh | ./ai-bash-fix-agent.py --bash bash --max-iters 3 > fixed.sh
```

## Features

- Fixes Bash 5+ incompatibilities for Bash 4.4
- Uses OpenAI Responses API (gpt-4.1-mini)
- Auto-iterate up to 3 times for correctness
- Security guardrails (blocks dangerous patterns)
- Handles markdown fencing in responses
- No external dependencies beyond Python stdlib

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | _(required)_ | Your OpenAI API key |
| `OPENAI_MODEL` | `gpt-4.1-mini` | LLM model to use |

---

**Example Workflow:**
```bash
export OPENAI_API_KEY="sk-..."
echo '#!/bin/bash
declare -A config=([host]="localhost")
echo ${config[host]}' | ./run-fix.sh > fixed.sh

# fixed.sh now contains Bash 4.4-compatible version
bash fixed.sh
```
