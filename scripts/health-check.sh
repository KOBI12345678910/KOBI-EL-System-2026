#!/bin/bash
# Health check for all 4 services
echo "=== ERP Health Check ==="
services=("http://localhost:3100/health" "http://localhost:3200/health" "http://localhost:3300/health" "http://localhost:5173")
names=("onyx-procurement" "techno-kol-ops" "onyx-ai" "payroll-autonomous")
for i in "${!services[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "${services[$i]}" 2>/dev/null)
  if [ "$status" = "200" ]; then
    echo "✅ ${names[$i]} — UP"
  else
    echo "❌ ${names[$i]} — DOWN (HTTP $status)"
  fi
done
