#!/usr/bin/env bash
# validate-sidebar-routes.sh
# Validates that every sidebar href in layout.tsx has a matching route in App.tsx.
# Query strings (?tab=...) and hash fragments (#...) are stripped before comparison.
# Redirect "from=" attributes are counted as valid coverage.
#
# Usage: ./scripts/validate-sidebar-routes.sh
# Exit: 0 if all hrefs are covered, 1 if any are missing.

set -euo pipefail

LAYOUT="src/components/layout.tsx"
APP="src/App.tsx"
REPORT="sidebar-route-coverage.txt"

echo "=== Sidebar Route Coverage Audit ===" > "$REPORT"
echo "Date: $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$REPORT"
echo "" >> "$REPORT"

# Extract all href values from NAV_ITEMS, strip query strings and hash fragments
grep -oP 'href: "[^"]*"' "$LAYOUT" \
  | grep -oP '"[^"]*"' \
  | sed 's/"//g' \
  | sed 's/[?#].*//' \
  | sort -u > /tmp/sidebar_hrefs.txt

SIDEBAR_COUNT=$(wc -l < /tmp/sidebar_hrefs.txt)
echo "Sidebar hrefs (unique, normalized): $SIDEBAR_COUNT" >> "$REPORT"

# Extract all registered routes AND redirect "from" attributes from App.tsx
grep -oP '(path|from)="[^"]*"' "$APP" \
  | grep -oP '"[^"]*"' \
  | sed 's/"//g' \
  | sed 's/[?#].*//' \
  | sort -u > /tmp/app_routes.txt

ROUTE_COUNT=$(wc -l < /tmp/app_routes.txt)
echo "App.tsx routes+redirects (unique): $ROUTE_COUNT" >> "$REPORT"
echo "" >> "$REPORT"

# Find hrefs not covered by any route
MISSING=$(comm -23 /tmp/sidebar_hrefs.txt /tmp/app_routes.txt)
MISSING_COUNT=$(echo "$MISSING" | grep -c . || true)

if [ -z "$MISSING" ] || [ "$MISSING_COUNT" -eq 0 ]; then
  echo "STATUS: PASSED — All $SIDEBAR_COUNT sidebar hrefs are covered." >> "$REPORT"
  echo "STATUS: PASSED — All $SIDEBAR_COUNT sidebar hrefs are covered."
  cat "$REPORT"
  exit 0
else
  echo "STATUS: FAILED — $MISSING_COUNT sidebar hrefs have no route:" >> "$REPORT"
  echo "$MISSING" | while read -r href; do
    echo "  MISSING: $href" >> "$REPORT"
    echo "  MISSING: $href"
  done
  echo ""
  echo "STATUS: FAILED — $MISSING_COUNT sidebar hrefs have no route."
  cat "$REPORT"
  exit 1
fi
