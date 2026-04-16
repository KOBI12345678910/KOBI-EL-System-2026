#requires -Version 5.1
<#
.SYNOPSIS
  Techno-Kol Uzi ERP — Google Cloud deployment (PowerShell / Windows).

.DESCRIPTION
  Runs the same flow as scripts/gcp/deploy.sh but from a local Windows
  PowerShell. Use this if you don't want to use Cloud Shell.

  Prerequisites:
    - Google Cloud SDK installed (https://cloud.google.com/sdk/docs/install)
    - gcloud auth login — already run once in a terminal

.EXAMPLE
  cd "C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL"
  .\scripts\gcp\deploy.ps1

.NOTES
  Rule: לא מוחקים, רק משדרגים ומגדלים.
#>

[CmdletBinding()]
param(
  [string]$ProjectId = "",
  [string]$Region    = "europe-west3",
  [string]$Branch    = "master"
)

$ErrorActionPreference = "Stop"

function Write-Step   { param($Msg) Write-Host "`n=== $Msg ===`n" -ForegroundColor Cyan }
function Write-Ok     { param($Msg) Write-Host "[OK]   $Msg" -ForegroundColor Green }
function Write-WarnK  { param($Msg) Write-Host "[WARN] $Msg" -ForegroundColor Yellow }
function Write-ErrK   { param($Msg) Write-Host "[ERR]  $Msg" -ForegroundColor Red }

# ----- Pre-flight -----
Write-Step "1/10 Pre-flight"

$gcloudCmd = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloudCmd) {
  Write-ErrK "gcloud CLI not found."
  Write-Host "Install it first: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
  Write-Host "Or use Cloud Shell (no local install needed): https://shell.cloud.google.com" -ForegroundColor Yellow
  exit 1
}
Write-Ok "gcloud present: $(gcloud --version | Select-Object -First 1)"

$account = (gcloud config get-value account 2>$null)
if (-not $account) {
  Write-ErrK "No signed-in account. Running 'gcloud auth login' now..."
  gcloud auth login
  $account = (gcloud config get-value account)
}
Write-Ok "Signed in as: $account"

# ----- Project -----
Write-Step "2/10 Project"

if (-not $ProjectId) {
  $current = (gcloud config get-value project 2>$null)
  if ($current) {
    $ProjectId = $current
    Write-Host "Using current project: $ProjectId"
  } else {
    $ProjectId = "bash44-erp-$([int][double]::Parse((Get-Date -UFormat %s)))"
    Write-Host "Creating new project: $ProjectId"
    gcloud projects create $ProjectId --name="Techno-Kol Uzi ERP 2026"
    gcloud config set project $ProjectId
  }
}

$billing = (gcloud billing projects describe $ProjectId --format='value(billingEnabled)' 2>$null)
if ($billing -ne "True" -and $billing -ne "true") {
  Write-ErrK "Billing NOT enabled for $ProjectId"
  Write-Host "Open: https://console.cloud.google.com/billing/linkedaccount?project=$ProjectId" -ForegroundColor Yellow
  Write-Host "Link a billing account, then re-run this script." -ForegroundColor Yellow
  exit 2
}
Write-Ok "Billing enabled"

# ----- APIs -----
Write-Step "3/10 Enabling APIs"
$apis = @(
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "iam.googleapis.com",
  "serviceusage.googleapis.com"
)
gcloud services enable @apis
Write-Ok "APIs enabled"

# ----- Hand off the rest to deploy.sh via Cloud Shell, OR run steps directly via gcloud -----
Write-Step "4/10 Delegating remaining steps to bash script"

$shPath = Join-Path $PSScriptRoot "deploy.sh"
if (-not (Test-Path $shPath)) {
  Write-ErrK "Missing scripts/gcp/deploy.sh"
  exit 3
}

Write-Host "Running the remainder (Artifact Registry, Secrets, Build, Deploy, Smoke Tests)..." -ForegroundColor Cyan
# Use bash via Git-for-Windows (always present on dev boxes)
$bashCmd = (Get-Command bash -ErrorAction SilentlyContinue)
if (-not $bashCmd) {
  Write-ErrK "bash.exe not found (needed to run deploy.sh)."
  Write-Host "Install Git for Windows (includes bash): https://git-scm.com/download/win" -ForegroundColor Yellow
  Write-Host "Or use Cloud Shell instead — open https://shell.cloud.google.com and run:" -ForegroundColor Yellow
  Write-Host "  bash <(curl -s https://raw.githubusercontent.com/KOBI12345678910/KOBI-EL-System-2026/master/scripts/gcp/deploy.sh)" -ForegroundColor Yellow
  exit 4
}

$env:REGION = $Region
$env:BRANCH = $Branch
bash $shPath

Write-Ok "Deployment script finished. Read the final block above for service URLs + next steps."
