#!/bin/bash
set -euo pipefail
echo "========================================"
echo " KOBI-EL-System → GCP Cloud Run"
echo "========================================"
: ${GCP_PROJECT_ID:?"Set GCP_PROJECT_ID"}
: ${SUPABASE_URL:?"Set SUPABASE_URL"}
: ${DATABASE_URL:?"Set DATABASE_URL"}
: ${JWT_SECRET:?"Set JWT_SECRET"}
REGION="${REGION:-europe-west1}"
SERVICE_NAME="${SERVICE_NAME:-techno-kol-ops}"
echo "Step 1: Enable APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project=$GCP_PROJECT_ID
echo "Step 2: Build container..."
gcloud builds submit --config cloudbuild.yaml --project=$GCP_PROJECT_ID
echo "Step 3: Deploy..."
gcloud run deploy $SERVICE_NAME --image europe-west1-docker.pkg.dev/$GCP_PROJECT_ID/kobi-repo/$SERVICE_NAME:latest --platform managed --region $REGION --allow-unauthenticated --set-env-vars "NODE_ENV=production,PORT=8080,SUPABASE_URL=$SUPABASE_URL,DATABASE_URL=$DATABASE_URL,JWT_SECRET=$JWT_SECRET" --max-instances 10 --min-instances 1 --memory 1Gi --cpu 1 --project $GCP_PROJECT_ID
echo "Done!"
