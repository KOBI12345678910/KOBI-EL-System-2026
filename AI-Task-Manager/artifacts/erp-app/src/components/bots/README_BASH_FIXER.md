# 🔧 Bash Fixer System

מערכת תיקון סקריפטי bash ל-Bash 4.4 באמצעות AI.

## 📦 Components

### 1. Python Agent: `ai_bash_fix_agent.py`
מתקן סקריפטים בעזרת OpenAI API.

**דרישות:**
- Python 3.6+
- `OPENAI_API_KEY` בסביבה

**שימוש:**

```bash
# מ-stdin
cat broken.sh | python3 ai_bash_fix_agent.py > fixed.sh

# מקובץ
python3 ai_bash_fix_agent.py broken.sh > fixed.sh

# עם אפשרויות
python3 ai_bash_fix_agent.py --max-iters 5 script.sh

# הצגת גרסת bash
python3 ai_bash_fix_agent.py --version
```

### 2. Shell Wrapper: `run-bash-fixer.sh`
wrapper bash שקל לשימוש.

```bash
chmod +x run-bash-fixer.sh
export OPENAI_API_KEY="sk-..."

# שימוש
cat broken.sh | ./run-bash-fixer.sh > fixed.sh
./run-bash-fixer.sh broken.sh > fixed.sh
```

### 3. DevOps Bot: `DEVOPS.bot.js`
בוט בתוך מערכת הBots שריץ סקריפטים וחוקק אותם.

```bash
npm run bot DEVOPS
```

**ביכולת:**
- בדיקת סקריפטים
- תיקון ידני של בעיות Bash 4.4 נפוצות
- שמירת דוחות

### 4. Python Fixer Bot: `PYTHON_FIXER.bot.js`
בוט שמשתמש ב-Python agent לתיקון מתקדם.

```bash
npm run bot PYTHON_FIXER
```

## 🔗 Integration - DevOps + Python Fixer

**DevOpsBot:**
```javascript
// בדיקה בסיסית + תיקון ידני
const script = "...";
let res = this.bashFixer.runScript(script);
if (res.code !== 0) {
  script = this.manualFixBash44(script);
}
```

**PythonFixerBot:**
```javascript
// תיקון מתקדם דרך LLM
const fixed = await this._fixScript(scriptText);
```

## 🎯 Common Bash 4.4 Issues

### 1. Associative Arrays
❌ Bash 5+:
```bash
declare -A config=(
  [host]="localhost"
)
```

✅ Bash 4.4:
```bash
declare -a config
config[0]="localhost"
# או
config_host="localhost"
```

### 2. Regex Operator (=~)
⚠️ עשוי להיות בעיה בגרסאות מסוימות.

### 3. Globstar (**)
❌ Bash 5+:
```bash
shopt -s globstar
for file in **/*.txt; do
```

✅ Bash 4.4:
```bash
find . -name "*.txt"
```

### 4. Name References
❌ Bash 4.3+:
```bash
declare -n ref=$var
```

✅ Bash 4.4 early versions:
```bash
eval "echo \${$var}"
```

## 🚀 Workflow

```
1. Developer writes broken.sh
   ↓
2. cat broken.sh | ./run-bash-fixer.sh > fixed.sh
   ↓
3. Python Agent calls OpenAI API
   ↓
4. LLM suggests fix (max 3 iterations)
   ↓
5. fixed.sh is compatible with Bash 4.4
   ↓
6. bash fixed.sh ✅
```

## 🔐 Environment Setup

```bash
# Set API key
export OPENAI_API_KEY="sk-..."

# Optional: custom model
export LLM_MODEL="gpt-4-turbo"

# Optional: custom endpoint (default: OpenAI)
export LLM_ENDPOINT="https://api.openai.com/v1/chat/completions"

# Test
./run-bash-fixer.sh --version
```

## 📊 Bots Ecosystem

```
BaseBot (with bashFixer utility)
  ├── DevOpsBot
  │   ├── Run scripts
  │   ├── Manual Bash 4.4 fixes
  │   └── Test & Report
  │
  └── PythonFixerBot
      ├── Call Python agent
      ├── LLM-powered fixes
      └── Auto-iterate up to 3x
```

## 🧪 Example: Full Flow

```bash
# Script with Bash 5+ features
cat > broken.sh << 'EOF'
#!/bin/bash
declare -A settings
settings[debug]="true"
settings[verbose]="yes"

for key in "${!settings[@]}"; do
  echo "$key=${settings[$key]}"
done
EOF

# Fix it
./run-bash-fixer.sh broken.sh > fixed.sh

# Run fixed version
bash fixed.sh

# Or via bot
npm run bot PYTHON_FIXER
```

---

**Built for HiTech Company 24/7** 🚀