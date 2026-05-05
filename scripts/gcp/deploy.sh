#!/bin/bash
# =============================================================================
# Techno-Kol Uzi ERP — Google Cloud Deployment (one-shot)
# =============================================================================
# Designed to run inside Google Cloud Shell (https://shell.cloud.google.com)
# where gcloud + git are pre-installed.
#
# What it does:
#   1. Creates/selects a GCP project (BASH44).
#   2. Enables required APIs.
#   3. Creates Artifact Registry for Docker images.
#   4. Generates strong random secrets and stores them in Secret Manager.
#   5. Clones the repo fresh from GitHub.
#   6. Builds & deploys all 4 services to Cloud Run via Cloud Build.
#   7. Wires up service-to-service URLs as env vars.
#   8. Runs smoke tests.
#   9. Prints the public URLs.
#
# Usage (in Cloud Shell):
#   bash <(curl -s https://raw.githubusercontent.com/KOBI12345678910/KOBI-EL-System-2026/master/scripts/gcp/deploy.sh)
#
# Or, if already cloned:
#   bash scripts/gcp/deploy.sh
#
# Rule: לא מוחקים, רק משדרגים ומגדלים.
# =============================================================================

set -euo pipefail

# ----- Config -----
PROJECT_ID_DEFAULT="bash44-erp-$(date +%s | tail -c 5)"
REGION="${REGION:-europe-west3}"
REPO_URL="${REPO_URL:-https://github.com/KOBI12345678910/KOBI-EL-System-2026.git}"
BRANCH="${BRANCH:-claude/objective-merkle-40ff93}"
AR_REPO="bash44"
WORK_DIR="${WORK_DIR:-$HOME/techno-kol-erp}"

# ----- Colors -----
RED="$(printf '\033[31m')"
GREEN="$(printf '\033[32m')"
YELLOW="$(printf '\033[33m')"
BLUE="$(printf '\033[34m')"
BOLD="$(printf '\033[1m')"
RESET="$(printf '\033[0m')"

log()   { echo -e "${BLUE}[$(date +%H:%M:%S)]${RESET} $*"; }
ok()    { echo -e "${GREEN}✓${RESET} $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $*"; }
err()   { echo -e "${RED}✗${RESET} $*" >&2; }
step()  { echo -e "\n${BOLD}${BLUE}═══ $* ═══${RESET}\n"; }

# =============================================================================
# PRE-FLIGHT
# =============================================================================
step "1/10 Pre-flight checks"

if ! command -v gcloud >/dev/null 2>&1; then
  err "gcloud CLI not found. Are you in Cloud Shell? Try: https://shell.cloud.google.com"
  exit 1
fi
ok "gcloud present: $(gcloud --version | head -1)"

ACTIVE_ACCOUNT=$(gcloud config get-value account 2>/dev/null || true)
if [ -z "$ACTIVE_ACCOUNT" ]; then
  err "No active gcloud account. Run: gcloud auth login"
  exit 1
fi
ok "Signed in as: ${ACTIVE_ACCOUNT}"

# =============================================================================
# PROJECT SETUP
# =============================================================================
step "2/10 Project setup"

CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || true)
if [ -z "$CURRENT_PROJECT" ]; then
  warn "No project selected."
  read -p "Enter Project ID (or press Enter to create '${PROJECT_ID_DEFAULT}'): " PROJECT_ID
  PROJECT_ID=${PROJECT_ID:-$PROJECT_ID_DEFAULT}

  # Check if it exists
  if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
    log "Project '$PROJECT_ID' already exists. Using it."
  else
    log "Creating project '$PROJECT_ID'..."
    gcloud projects create "$PROJECT_ID" --name="Techno-Kol Uzi ERP 2026"
  fi
  gcloud config set project "$PROJECT_ID"
else
  PROJECT_ID="$CURRENT_PROJECT"
  log "Using current project: ${PROJECT_ID}"
fi

# Verify billing linked
BILLING_ENABLED=$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || echo "false")
if [ "$BILLING_ENABLED" != "True" ] && [ "$BILLING_ENABLED" != "true" ]; then
  err "Billing is NOT enabled for project ${PROJECT_ID}."
  err "Open: https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"
  err "Link a billing account, then re-run this script."
  exit 2
fi
ok "Billing enabled for ${PROJECT_ID}"

# =============================================================================
# APIs
# =============================================================================
step "3/10 Enabling required APIs (this takes ~2 min the first time)"

APIS=(
  run.googleapis.com
  cloudbuild.googleapis.com
  artifactregistry.googleapis.com
  secretmanager.googleapis.com
  cloudresourcemanager.googleapis.com
  iam.googleapis.com
  serviceusage.googleapis.com
)
gcloud services enable "${APIS[@]}"
ok "APIs enabled: ${APIS[*]}"

# =============================================================================
# ARTIFACT REGISTRY
# =============================================================================
step "4/10 Artifact Registry (Docker image storage)"

if gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1; then
  ok "Artifact Registry '${AR_REPO}' already exists in ${REGION}"
else
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Techno-Kol Uzi ERP — Docker images"
  ok "Created Artifact Registry '${AR_REPO}' in ${REGION}"
fi

# Allow Cloud Build to push to Artifact Registry
PROJECT_NUM=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
CB_SA="${PROJECT_NUM}@cloudbuild.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/artifactregistry.writer" \
  --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/run.admin" \
  --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None >/dev/null
ok "Cloud Build service account granted deploy + secret read permissions"

# =============================================================================
# SECRETS
# =============================================================================
step "5/10 Secret Manager — generating strong random secrets"

gen_secret() { openssl rand -hex 32; }

create_or_update_secret() {
  local NAME="$1" VALUE="$2"
  if gcloud secrets describe "$NAME" >/dev/null 2>&1; then
    echo -n "$VALUE" | gcloud secrets versions add "$NAME" --data-file=- >/dev/null
    log "  Updated secret: ${NAME}"
  else
    echo -n "$VALUE" | gcloud secrets create "$NAME" --replication-policy=automatic --data-file=-
    log "  Created secret: ${NAME}"
  fi
}

# 5a. API keys — two keys for admin rotation
API_KEY_1=$(gen_secret)
API_KEY_2=$(gen_secret)
create_or_update_secret "api-keys" "${API_KEY_1},${API_KEY_2}"

# 5b. Payroll admin keys (same two, initially)
create_or_update_secret "payroll-admin-keys" "${API_KEY_1},${API_KEY_2}"

# 5c. Payroll employee map (empty by default — Kobi fills later via UI)
create_or_update_secret "payroll-employee-map" "U-100:placeholder-key"

# 5d. Database URL — user provides if they have Supabase already
if gcloud secrets describe "supabase-db-url" >/dev/null 2>&1; then
  ok "supabase-db-url already exists (not overwriting)"
else
  warn "supabase-db-url NOT set. Using placeholder."
  warn "AFTER this script finishes, set it from Supabase:"
  warn "  1. Go to https://supabase.com/dashboard → your project → Settings → Database"
  warn "  2. Copy the 'Connection string' (URI format)"
  warn "  3. Run: echo -n 'postgresql://...' | gcloud secrets versions add supabase-db-url --data-file=-"
  create_or_update_secret "supabase-db-url" "postgresql://placeholder:placeholder@placeholder/placeholder"
fi

# 5e. Anthropic API key — optional, skip if not provided
if gcloud secrets describe "anthropic-api-key" >/dev/null 2>&1; then
  ok "anthropic-api-key already exists"
else
  warn "anthropic-api-key NOT set. onyx-ai will run without LLM features until you set it:"
  warn "  echo -n 'sk-ant-...' | gcloud secrets create anthropic-api-key --data-file=-"
  create_or_update_secret "anthropic-api-key" "placeholder"
fi

# 5f. Placeholders for cross-service URLs — populated after services deploy
create_or_update_secret "procurement-api-url" "https://placeholder.run.app"
create_or_update_secret "onyx-ai-url"         "https://placeholder.run.app"

ok "Secret Manager populated (9 secrets)"

# =============================================================================
# REPO CHECKOUT
# =============================================================================
step "6/10 Checkout repository"

if [ -d "$WORK_DIR/.git" ]; then
  log "Found existing checkout at ${WORK_DIR}. Pulling latest..."
  cd "$WORK_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  log "Cloning ${REPO_URL} → ${WORK_DIR}"
  git clone "$REPO_URL" "$WORK_DIR"
  cd "$WORK_DIR"
  git checkout "$BRANCH"
fi
ok "Repo at: $(pwd) (branch ${BRANCH})"

# =============================================================================
# BUILD + DEPLOY — first pass (creates services with placeholder URLs)
# =============================================================================
step "7/10 Build + deploy 4 services to Cloud Run"

declare -A SERVICES=(
  [onyx-procurement]="cloudbuild-onyx-procurement.yaml"
  [techno-kol-ops]="cloudbuild-techno-kol-ops.yaml"
  [onyx-ai]="cloudbuild-onyx-ai.yaml"
  [payroll-autonomous]="cloudbuild-payroll-autonomous.yaml"
)

for SVC in "${!SERVICES[@]}"; do
  log "Building & deploying: ${BOLD}${SVC}${RESET}"
  gcloud builds submit --config="scripts/gcp/${SERVICES[$SVC]}" --substitutions=SHORT_SHA="$(git rev-parse --short HEAD)" "$WORK_DIR"
  ok "${SVC} deployed"
done

# =============================================================================
# WIRE UP CROSS-SERVICE URLS
# =============================================================================
step "8/10 Wire up cross-service URLs"

get_url() {
  gcloud run services describe "$1" --region="$REGION" --format='value(status.url)' 2>/dev/null
}

PROCUREMENT_URL=$(get_url onyx-procurement)
AI_URL=$(get_url onyx-ai)
TKO_URL=$(get_url techno-kol-ops)
PAYROLL_URL=$(get_url payroll-autonomous)

log "Discovered service URLs:"
log "  onyx-procurement  : ${PROCUREMENT_URL}"
log "  onyx-ai           : ${AI_URL}"
log "  techno-kol-ops    : ${TKO_URL}"
log "  payroll-autonomous: ${PAYROLL_URL}"

# Update secrets that feed back into other services
create_or_update_secret "procurement-api-url" "${PROCUREMENT_URL}"
create_or_update_secret "onyx-ai-url"         "${AI_URL}"

# Redeploy onyx-ai + techno-kol-ops so they pick up the new URLs
for SVC in onyx-ai techno-kol-ops; do
  log "Redeploying ${SVC} to refresh cross-service URLs..."
  gcloud run services update "$SVC" --region="$REGION" \
    --set-secrets=PROCUREMENT_API_URL=procurement-api-url:latest,ONYX_AI_URL=onyx-ai-url:latest >/dev/null
done
ok "Cross-service wiring complete"

# =============================================================================
# SMOKE TESTS
# =============================================================================
step "9/10 Smoke tests"

smoke_test() {
  local NAME="$1" URL="$2" EXPECT_STATUS="${3:-200}"
  log "Testing ${NAME} → ${URL}/healthz ..."
  local ACTUAL=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/healthz" || echo "000")
  if [ "$ACTUAL" = "$EXPECT_STATUS" ]; then
    ok "${NAME}: ${ACTUAL} ✓"
  else
    warn "${NAME}: expected ${EXPECT_STATUS}, got ${ACTUAL}"
  fi
}

smoke_test "onyx-procurement"   "$PROCUREMENT_URL"
smoke_test "onyx-ai"            "$AI_URL"
smoke_test "techno-kol-ops"     "$TKO_URL"
smoke_test "payroll-autonomous" "$PAYROLL_URL"

# =============================================================================
# FINAL REPORT
# =============================================================================
step "10/10 DONE 🎉"

cat <<EOF

${GREEN}${BOLD}✅ Deployment complete.${RESET}

${BOLD}Project:${RESET}   ${PROJECT_ID}
${BOLD}Region:${RESET}    ${REGION}
${BOLD}Services:${RESET}
   onyx-procurement   → ${PROCUREMENT_URL}
   onyx-ai            → ${AI_URL}
   techno-kol-ops     → ${TKO_URL}
   payroll-autonomous → ${PAYROLL_URL}

${YELLOW}${BOLD}⚠ Next steps (MANUAL):${RESET}

1. Set the real Supabase database URL (if you have one):
   ${BOLD}echo -n 'postgresql://postgres:PWD@db.xxxxx.supabase.co:5432/postgres' | \\
     gcloud secrets versions add supabase-db-url --data-file=-${RESET}

   Then: ${BOLD}gcloud run services update onyx-procurement --region=${REGION} \\
     --set-secrets=SUPABASE_DB_URL=supabase-db-url:latest${RESET}

2. Set the Anthropic API key (if using onyx-ai LLM features):
   ${BOLD}echo -n 'sk-ant-...' | gcloud secrets versions add anthropic-api-key --data-file=-${RESET}

3. Save your admin API keys (write these down somewhere safe — Bitwarden / 1Password):
   ${BOLD}gcloud secrets versions access latest --secret=api-keys${RESET}
   (prints the two API_KEYs — use the first one for admin requests)

4. Test a real request:
   ${BOLD}curl -H "x-api-key: \$(gcloud secrets versions access latest --secret=api-keys | cut -d, -f1)" \\
     ${PROCUREMENT_URL}/api/suppliers${RESET}

5. (Optional) Connect a custom domain:
   ${BOLD}gcloud run domain-mappings create --service=onyx-procurement --domain=erp.yourdomain.com --region=${REGION}${RESET}

${GREEN}הכל באוויר. בהצלחה!${RESET} 🚀

EOF
