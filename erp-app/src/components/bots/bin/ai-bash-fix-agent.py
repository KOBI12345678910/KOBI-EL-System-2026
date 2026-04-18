#!/usr/bin/env python3
"""
AI Bash Fixer Agent
Fixes bash scripts that don't work in Bash 4.4
Usage:
  cat script.sh | ./ai_bash_fix_agent.py > fixed.sh
  ./ai_bash_fix_agent.py script.sh > fixed.sh
  ./ai_bash_fix_agent.py --help
"""

import os
import re
import subprocess
import tempfile
import sys
import json
from dataclasses import dataclass
from typing import Optional

# =========================
# Configuration
# =========================

MODEL = os.environ.get("LLM_MODEL", "gpt-4-turbo")
API_ENDPOINT = os.environ.get("LLM_ENDPOINT", "https://api.openai.com/v1/chat/completions")
API_KEY = os.environ.get("OPENAI_API_KEY", "")

# =========================
# Data Classes
# =========================

@dataclass
class RunResult:
    code: int
    stdout: str
    stderr: str

# =========================
# Bash Runner
# =========================

def run_bash_script(script_text: str, bash_path: str = "bash") -> RunResult:
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".sh") as f:
        f.write(script_text)
        script_path = f.name

    try:
        p = subprocess.run(
            [bash_path, "--noprofile", "--norc", script_path],
            text=True,
            capture_output=True,
            timeout=30
        )
        return RunResult(p.returncode, p.stdout, p.stderr)
    except subprocess.TimeoutExpired:
        return RunResult(124, "", "Script timeout (30s exceeded)")
    finally:
        try:
            os.unlink(script_path)
        except OSError:
            pass

def get_bash_version(bash_path: str = "bash") -> str:
    try:
        p = subprocess.run(
            [bash_path, "--version"],
            text=True,
            capture_output=True,
            timeout=5
        )
        return (p.stdout or p.stderr).split("\n")[0]
    except Exception:
        return "unknown"

# =========================
# LLM Integration
# =========================

def call_llm_fix(script_text: str, result: RunResult, bash_ver: str) -> Optional[str]:
    if not API_KEY:
        print("Missing OPENAI_API_KEY env var", file=sys.stderr)
        return None

    import json
    import urllib.request

    system_msg = (
        "You are a bash expert. Fix scripts so they run in Bash 4.4 specifically. "
        "Avoid Bash 5+ features (associative arrays, etc). "
        "Output ONLY the corrected script text, no markdown, no explanations."
    )

    user_msg = f"""Bash version:
{bash_ver}

Original script:
{script_text}

Execution result:
exit_code={result.code}

stdout:
{result.stdout}

stderr:
{result.stderr}

Task:
Return a corrected version of the script that works in Bash 4.4.
Keep behavior as intended. Make the minimal fix to remove the error."""

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
        "temperature": 0.1,
        "max_tokens": 2048,
    }

    try:
        req = urllib.request.Request(
            API_ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if "choices" in data and len(data["choices"]) > 0:
            return data["choices"][0].get("message", {}).get("content", "").strip()
        else:
            print(f"Unexpected LLM response: {data}", file=sys.stderr)
            return None

    except Exception as err:
        print(f"LLM call failed: {err}", file=sys.stderr)
        return None

# =========================
# Utils
# =========================

def strip_markdown_fences(s: str) -> str:
    m = re.search(r"```(?:bash|sh)?\s*(.*?)```", s, flags=re.S)
    return m.group(1).strip() if m else s.strip()

# =========================
# Main Fix Loop
# =========================

def fix_loop(initial_script: str, max_iters: int = 3) -> str:
    script = initial_script
    bash_ver = get_bash_version()

    for i in range(1, max_iters + 1):
        print(f"[Iter {i}/{max_iters}] Running...", file=sys.stderr)

        res = run_bash_script(script)

        if res.code == 0:
            print("Script passed!", file=sys.stderr)
            return script

        print(f"Failed (code={res.code})", file=sys.stderr)
        if res.stderr:
            print(f"   Error: {res.stderr[:200]}", file=sys.stderr)

        fixed = call_llm_fix(script, res, bash_ver)

        if not fixed:
            raise RuntimeError(
                f"Could not fix script (iteration {i}, no LLM response).\n"
                f"Last error:\n{res.stderr}"
            )

        fixed = strip_markdown_fences(fixed)

        if fixed.strip() == script.strip():
            raise RuntimeError(
                f"LLM did not change script on iteration {i}.\n"
                f"Last error:\n{res.stderr}"
            )

        script = fixed

    final_res = run_bash_script(script)
    raise RuntimeError(
        f"Failed to fix script after {max_iters} iterations.\n"
        f"exit_code={final_res.code}\n"
        f"stderr:\n{final_res.stderr}"
    )

# =========================
# CLI
# =========================

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="AI Bash Script Fixer - Fix bash scripts for Bash 4.4"
    )
    parser.add_argument(
        "script",
        nargs="?",
        help="Script file to fix (or - for stdin, default)"
    )
    parser.add_argument(
        "--max-iters",
        type=int,
        default=3,
        help="Max fix iterations (default: 3)"
    )
    parser.add_argument(
        "--version",
        action="store_true",
        help="Show bash version and exit"
    )

    args = parser.parse_args()

    if args.version:
        print(get_bash_version())
        sys.exit(0)

    if args.script and args.script != "-":
        with open(args.script, "r") as f:
            script_text = f.read()
    else:
        script_text = sys.stdin.read()

    if not script_text.strip():
        print("No input received", file=sys.stderr)
        sys.exit(2)

    try:
        fixed = fix_loop(script_text, max_iters=args.max_iters)
        print(fixed)
        sys.exit(0)
    except Exception as err:
        print(f"{err}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
