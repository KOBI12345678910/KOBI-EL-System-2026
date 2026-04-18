#!/bin/bash
# Example: Script with Bash 5+ features that won't work in 4.4

# Associative arrays (Bash 4.3+)
declare -A config=(
  [host]="localhost"
  [port]="5432"
  [user]="admin"
  [debug]="true"
)

echo "=== Configuration ==="
for key in "${!config[@]}"; do
  echo "  $key: ${config[$key]}"
done

# Name references (Bash 4.3+)
declare -n ref=config
echo "=== Via nameref ==="
echo "Host: ${ref[host]}"

# Globstar pattern (Bash 4.3+)
shopt -s globstar
for file in src/**/*.js; do
  echo "Found: $file"
done