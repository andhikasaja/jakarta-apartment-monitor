# Instructions for Codex

Your goal is to deploy this package as a live Vercel website and enable automatic daily apartment monitoring.

## Required outcome

At completion there must be:

1. a public GitHub repository containing this project;
2. GitHub Actions workflow `Apartment Listing Monitor` enabled;
3. a production Vercel URL serving `index.html`;
4. `runtime-config.json` pointing to the repository's `raw.githubusercontent.com` JSON URLs;
5. a successful local validation;
6. at least one successful manual GitHub Actions monitor run if GitHub permits triggering it immediately.

## Do this in order

### 1. Inspect and validate

```bash
node --version
git --version
gh --version
npm run validate
```

Node 20 or newer is preferred.

### 2. Authenticate GitHub if needed

Check:

```bash
gh auth status
```

If not logged in, run:

```bash
gh auth login
```

Ask the human only to complete the browser/device authorization. Do not ask them to manually create files or copy code.

### 3. Authenticate Vercel if needed

Check:

```bash
npx --yes vercel whoami
```

If not authenticated, run:

```bash
npx --yes vercel login
```

Ask the human only to complete the authorization flow, then continue.

### 4. Execute deployment

```bash
npm run codex:deploy
```

If the repository name should be changed, set it before running:

```bash
export REPO_NAME=jakarta-apartment-monitor
npm run codex:deploy
```

### 5. Confirm runtime configuration

Inspect:

```bash
cat runtime-config.json
```

It should contain URLs similar to:

```text
https://raw.githubusercontent.com/<owner>/<repo>/main/data/apartments.json
```

### 6. Verify the workflow

```bash
gh workflow list
gh workflow run "Apartment Listing Monitor"
gh run list --workflow monitor.yml --limit 5
```

If the workflow is queued, that is acceptable for the deployment step; verify that the workflow exists and was accepted by GitHub.

### 7. Verify production site

Use the Vercel CLI output or:

```bash
npx --yes vercel ls
```

Open the production URL and confirm:

- dashboard renders;
- listing table renders;
- KPR calculator works;
- source mode shows `GitHub live JSON` after runtime config is deployed;
- browser console has no fatal JavaScript error.

## Optional but recommended: broader discovery

The base monitor attempts to crawl configured public MRT/LRT search pages and tracks known URLs. Portal anti-bot rules may block automated requests. If the user provides a Serper API key, store it only as a GitHub secret:

```bash
gh secret set SERPER_API_KEY
```

Then trigger another monitor run. Never expose the secret in client-side files or Git history.

## Do not change these product requirements unless explicitly requested

- Jakarta Pusat and Jakarta Selatan only.
- 1BR and 2BR only.
- MRT and LRT are prioritized; do not use KRL as the primary transit filter.
- Main buy target is <= IDR 900 million.
- Salary assumption IDR 15 million net/month.
- Housing-cost target IDR 5 million/month.
- KPR comparisons 10 and 15 years.
- Dashboard must remain interactive and auto-refresh live data.
