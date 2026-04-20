#!/usr/bin/env bash
# One-shot downloader for all 10 ZIPs from GitHub
# Run from a fresh Replit shell:
#   bash download_all.sh
set -e

REPO_RAW="https://github.com/KOBI12345678910/KOBI-EL-System-2026/raw/master/_delivery/zips"

ZIPS=(
  "01_api-server.zip"
  "02_erp-app.zip"
  "03_onyx-procurement.zip"
  "04_onyx-ai.zip"
  "05_payroll-autonomous.zip"
  "06_techno-kol-ops_mobile_desktop.zip"
  "07_database_supabase.zip"
  "08_docs_master-registry_qa.zip"
  "09_packages_lib_locales.zip"
  "10_root-config_scripts_extras.zip"
)

echo "=== Downloading 10 ZIPs from GitHub ==="
for zip in "${ZIPS[@]}"; do
  echo ">> $zip"
  curl -fsSL -o "$zip" "$REPO_RAW/$zip"
done

echo ""
echo "=== Extracting all ZIPs ==="
for zip in "${ZIPS[@]}"; do
  echo ">> Unzipping $zip..."
  unzip -oq "$zip"
done

echo ""
echo "=== Cleaning up ZIPs ==="
rm -f "${ZIPS[@]}"

echo ""
echo "=== Installing dependencies ==="
pnpm install || npm install

echo ""
echo "DONE! Run:  pnpm --filter @workspace/erp-app dev"
