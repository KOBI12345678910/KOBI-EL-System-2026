# 📚 Bash Fixer Usage Guide

Complete examples of using the Bash fixer system.

## Quick Start

### Setup
```bash
# 1. Get your OpenAI API key
export OPENAI_API_KEY="sk-..."

# 2. Make scripts executable
chmod +x ../bin/run-bash-fixer.sh
chmod +x demo.sh
```

### Usage Pattern: `cat script.sh | ./fixer.sh > fixed.sh && bash fixed.sh`

```bash
# Fix and run in one command
cat broken-script.sh | ../bin/run-bash-fixer.sh > fixed.sh && bash fixed.sh

# Or separate steps
cat broken-script.sh | ../bin/run-bash-fixer.sh > fixed.sh
bash fixed.sh

# Or directly on file
../bin/run-bash-fixer.sh broken-script.sh > fixed.sh
```

## Examples

### Example 1: Associative Arrays

**Broken (Bash 5+):**
```bash
declare -A settings=(
  [debug]="yes"
  [port]="8080"
)
echo "${settings[debug]}"
```

**Fixed (Bash 4.4):**
```bash
settings_debug="yes"
settings_port="8080"
echo "$settings_debug"
```

### Example 2: Name References

**Broken (Bash 4.3+):**
```bash
declare -n ref=myvar
ref="value"
echo "$ref"
```

**Fixed (Bash 4.4):**
```bash
myvar="value"
eval "echo \$$ref"
```

### Example 3: Globstar Pattern

**Broken (Bash 4.3+):**
```bash
shopt -s globstar
for file in **/*.txt; do
  echo "$file"
done
```

**Fixed (Bash 4.4):**
```bash
for file in $(find . -name "*.txt"); do
  echo "$file"
done
```

## Running the Demo

```bash
# Full interactive demo
./demo.sh

# This will:
# 1. Show the broken script
# 2. Try to run it (fail)
# 3. Fix it via AI
# 4. Run the fixed version (success)
```

## Integration with Bots

### DevOpsBot (Manual Fixes)
```bash
npm run bot DEVOPS
```
- Basic script validation
- Automatic Bash 4.4 compatibility checks
- Manual fixes for common issues

### PythonFixerBot (AI-Powered)
```bash
npm run bot PYTHON_FIXER
```
- Calls OpenAI API for intelligent fixes
- Up to 3 iterations to get script working
- Full LLM-driven optimization

## Workflow

```
Your Script
    ↓
cat script.sh | ./run-bash-fixer.sh
    ↓
OpenAI API (if key set)
    ↓
Fixed Script (Bash 4.4 compatible)
    ↓
bash fixed.sh ✅
```

## Troubleshooting

### "OPENAI_API_KEY not set"
```bash
export OPENAI_API_KEY="sk-your-key-here"
```

### "Python not found"
```bash
# Check Python version
python3 --version
# Should be 3.6+
```

### "Script timeout"
- Increase timeout in Python agent (default: 30s)
- Use `--max-iters 2` to reduce iterations

### "API rate limit"
- Wait and retry
- Check your OpenAI quota

---

**Pro Tip:** Use this in CI/CD to automatically fix scripts:
```bash
for script in scripts/*.sh; do
  cat "$script" | ./run-bash-fixer.sh > "$script.fixed"
  mv "$script.fixed" "$script"
done
``