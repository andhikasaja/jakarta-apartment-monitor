#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REPO_NAME="${REPO_NAME:-jakarta-apartment-monitor}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command '$1' is not installed."
    exit 2
  fi
}
need node
need npm
need git
need gh

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login"
  echo "After browser authentication, rerun: npm run codex:deploy"
  exit 3
fi

echo "[1/8] Installing dependencies"
npm install

echo "[2/8] Validating package"
npm run validate

echo "[3/8] Running one monitoring cycle"
npm run monitor

if [ ! -d .git ]; then
  echo "[4/8] Initializing Git repository"
  git init -b main
  git add .
  git commit -m "feat: initial Jakarta apartment monitor"
else
  echo "[4/8] Git repository already exists"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  GH_OWNER="$(gh api user -q .login)"
  if gh repo view "$GH_OWNER/$REPO_NAME" >/dev/null 2>&1; then
    echo "[5/8] Existing GitHub repository found: $GH_OWNER/$REPO_NAME"
    git remote add origin "https://github.com/$GH_OWNER/$REPO_NAME.git"
    git push -u origin main
  else
    echo "[5/8] Creating public GitHub repository: $REPO_NAME"
    gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
  fi
else
  echo "[5/8] Existing GitHub origin detected"
  git add .
  if ! git diff --cached --quiet; then git commit -m "chore: prepare automated apartment monitor"; fi
  git push -u origin main
fi

echo "[6/8] Pointing dashboard to GitHub raw JSON"
npm run set:runtime
git add runtime-config.json
if ! git diff --cached --quiet; then git commit -m "chore: configure live data endpoint"; fi
git push

echo "[7/8] Verifying GitHub Actions workflow"
gh workflow list || true

echo "[8/8] Deploying static dashboard to Vercel"
if ! npx --yes vercel whoami >/dev/null 2>&1; then
  echo "Vercel is not authenticated. Run: npx vercel login"
  echo "After browser authentication, rerun: npm run codex:deploy"
  exit 4
fi
npx --yes vercel --prod --yes

echo
echo "DEPLOYMENT COMPLETE"
echo "The dashboard polls GitHub raw JSON every 60 seconds."
echo "GitHub Actions refreshes listing data daily at 08:00 Asia/Jakarta."
echo "Run a manual refresh anytime with: gh workflow run \"Apartment Listing Monitor\""
