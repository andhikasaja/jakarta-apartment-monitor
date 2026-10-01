# Jakarta Apartment Monitor 2026-2030

Interactive apartment monitoring dashboard for a Monas work location, focused on Jakarta Pusat and Jakarta Selatan, 1-2BR units, MRT/LRT access, and a purchase target of IDR 900 million or below.

## What this package does

1. Serves a static interactive dashboard on Vercel.
2. Runs an apartment monitoring job every day at **08:00 Asia/Jakarta** using GitHub Actions.
3. Attempts no-key discovery from configured public 99.co MRT/LRT search pages.
4. Tracks known Rumah123, Pinhome, and 99.co listing URLs.
5. Optionally expands discovery using Serper/Google search when `SERPER_API_KEY` is configured.
6. Detects `NEW`, `PRICE_DOWN`, and `PRICE_UP` events.
7. Writes current data to `data/apartments.json` and recent events to `data/changes.json`.
8. The Vercel page polls the live GitHub raw JSON every 60 seconds, so data can change without rebuilding the Vercel site.

## Current decision assumptions

- Work area: Monas, Jakarta Pusat
- Areas: Jakarta Pusat + Jakarta Selatan
- Bedrooms: 1BR / 2BR
- Priority transit: MRT / LRT
- KRL is not treated as the primary access criterion
- Purchase monitor threshold: IDR 900,000,000
- Net salary: IDR 15,000,000/month
- Housing budget: IDR 5,000,000/month
- KPR comparison: 10 years / 15 years
- Base KPR effective-rate assumption: 8.5% p.a. (editable in dashboard/config)

## Architecture

```text
Configured search pages + tracked listing URLs
                  |
                  v
       scripts/monitor.mjs
                  |
                  v
GitHub Actions daily schedule (08:00 WIB)
                  |
                  v
 data/apartments.json + data/changes.json
                  |
                  v
 raw.githubusercontent.com (cache-busted)
                  |
        browser polls every 60 seconds
                  |
                  v
        Vercel static dashboard
```

This separation is deliberate: **Vercel does not need to redeploy when only listing data changes.**

## Fastest deployment via Codex

Open this folder in Codex and instruct it to read `CODEX_INSTRUCTIONS.md` and execute the deployment.

Or manually run:

```bash
gh auth login
npx vercel login
npm run codex:deploy
```

The deployment script will:

- validate the package;
- run an initial monitor cycle;
- initialize Git if required;
- create or use a public GitHub repository;
- configure the dashboard to read raw GitHub JSON;
- push the package;
- deploy the static website to Vercel.

A public GitHub repository is the default because the client-side dashboard needs to read raw JSON without exposing a GitHub token. Listing information in this project is public market data. If you need a private repository, add a server-side proxy instead of exposing a token in browser JavaScript.

## Verify scheduled monitoring

```bash
gh workflow list
gh workflow run "Apartment Listing Monitor"
gh run list --workflow monitor.yml --limit 5
```

The scheduled workflow is defined in `.github/workflows/monitor.yml`.

## Reliable broader discovery (recommended)

The package can run without an API key. However, Indonesian property portals can use anti-bot controls or change their HTML. For more reliable discovery across multiple portals, configure a Serper API key as a **GitHub Actions secret**:

```bash
gh secret set SERPER_API_KEY
```

Paste the key when prompted. Never put the key in `index.html`, `runtime-config.json`, or any committed file.

After adding it, trigger a run:

```bash
gh workflow run "Apartment Listing Monitor"
```

## Edit monitoring criteria

Edit `config/monitor.json`.

Important fields:

```json
{
  "target_price_idr": 900000000,
  "salary_net_monthly_idr": 15000000,
  "housing_budget_monthly_idr": 5000000,
  "kpr_interest_effective_percent": 8.5,
  "kpr_tenors_years": [10, 15]
}
```

Search corridors are in `config/search-pages.json`. Known-building transit and IPL assumptions are in `config/properties.json`. Tracked listing URLs are in `config/seed-listings.json`.

## Add another apartment/building

Add a record to `config/properties.json`, for example:

```json
{
  "property": "Example Residence",
  "aliases": ["example residence"],
  "area": "Jakarta Selatan",
  "district": "Setiabudi",
  "transit": "MRT Setiabudi",
  "transit_type": "MRT",
  "distance_km": 0.8,
  "monas_access": "Very Good from 2028+",
  "ipl_monthly": 750000,
  "certificate_note": "Verify SHMSRS and land HGB term",
  "risk": "Medium"
}
```

Then run:

```bash
npm run monitor
```

## Add a listing URL directly

Add it to `config/seed-listings.json`. Seed data is intentionally allowed to include fallback values so the monitor remains usable when a portal temporarily blocks automated fetches.

## Files

- `index.html` - interactive dashboard
- `runtime-config.json` - live JSON endpoint configuration
- `data/apartments.json` - current monitored market snapshot
- `data/changes.json` - listing/price-change history
- `data/health.json` - monitoring health status
- `config/monitor.json` - financial and filtering criteria
- `config/search-pages.json` - no-key discovery pages
- `config/properties.json` - apartment/building metadata
- `config/seed-listings.json` - directly tracked listing URLs
- `scripts/monitor.mjs` - monitoring engine
- `scripts/set-runtime-config.mjs` - sets GitHub raw endpoints
- `scripts/validate.mjs` - package/data validation
- `scripts/codex-deploy.sh` - one-command Codex deployment
- `.github/workflows/monitor.yml` - daily monitoring schedule
- `vercel.json` - static-hosting/cache settings

## Operational caveats

- Portal asking price is not final transaction price.
- A listing can disappear or be stale even when its page remains accessible.
- HTML scraping is inherently brittle; this package preserves safe fallback data when a source request fails.
- For purchase due diligence, verify SHMSRS/SHM Sarusun, land-right term, encumbrance, IPL/sinking-fund arrears, PPPSRS records, tax/utilities, and KPR bankability.
- Do not treat portal labels such as `SHM`, `HGB`, `Strata`, or `PPJB` as equivalent without checking the underlying unit documents.
