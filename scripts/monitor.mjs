import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async (p) => JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8'));
const writeJSON = async (p, value) => fs.writeFile(path.join(ROOT, p), JSON.stringify(value, null, 2) + '\n');

const config = await readJSON('config/monitor.json');
const searchPages = await readJSON('config/search-pages.json');
const registry = await readJSON('config/properties.json');
const seeds = await readJSON('config/seed-listings.json');
const oldData = await readJSON('data/apartments.json');
const oldChanges = await readJSON('data/changes.json').catch(() => ({ changes: [] }));

function nowJakartaISO() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+07:00`;
}

function normalizeUrl(input) {
  try {
    const u = new URL(input);
    u.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid'].forEach(k => u.searchParams.delete(k));
    if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch { return input; }
}

function sourceFromUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (h.includes('99.co')) return '99.co';
    if (h.includes('rumah123')) return 'Rumah123';
    if (h.includes('pinhome')) return 'Pinhome';
    return h;
  } catch { return 'Web'; }
}

function hashId(url) {
  return 'L-' + crypto.createHash('sha1').update(normalizeUrl(url)).digest('hex').slice(0, 12).toUpperCase();
}

function parseNumber(s) {
  if (!s) return null;
  const clean = String(s).replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const n = Number(clean.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parsePrice(text) {
  const t = String(text || '').replace(/\u00a0/g, ' ');
  const matches = [...t.matchAll(/Rp\.?\s*([0-9][0-9.,]*)\s*(Miliar|Milyar|Juta|JT|M)\b/ig)];
  for (const m of matches) {
    const n = parseNumber(m[1]);
    if (!n) continue;
    const unit = m[2].toLowerCase();
    const mult = unit.startsWith('m') ? 1_000_000_000 : 1_000_000;
    const price = Math.round(n * mult);
    if (price >= 100_000_000 && price <= 50_000_000_000) return price;
  }
  const raw = t.match(/(?:harga(?:\s+jual)?|price)\s*[:\-]?\s*Rp\.?\s*([0-9.]{7,})/i);
  if (raw) return parseNumber(raw[1]);
  return null;
}

function parseBedrooms(text) {
  const t = String(text || '');
  const patterns = [
    /\b([12])\s*(?:BR|Bedroom|Bedrooms)\b/i,
    /\b([12])\s*(?:KT|Kamar Tidur)\b/i,
    /(?:tipe kamar|kamar tidur)\s*[:\-]?\s*([12])\b/i
  ];
  for (const p of patterns) {
    const m = t.match(p); if (m) return Number(m[1]);
  }
  return null;
}

function parseSize(text) {
  const t = String(text || '');
  const patterns = [
    /\bLB\s*([0-9]+(?:[.,][0-9]+)?)\s*m(?:2|²)?/i,
    /(?:luas(?:\s+(?:apartemen|bangunan|unit))?|floor area)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)\s*m(?:2|²)?/i,
    /\b([0-9]{2,3}(?:[.,][0-9]+)?)\s*(?:sqm|m²|m2)\b/i
  ];
  for (const p of patterns) {
    const m = t.match(p); if (m) return Number(String(m[1]).replace(',', '.'));
  }
  return null;
}

function extractCertificate(text, fallback = '') {
  const t = String(text || '');
  const keys = ['SHMSRS','SHM Sarusun','Strata Title','Strata','PPJB','HGB','AJB','P4TB'];
  const found = keys.filter(k => new RegExp(k.replace(/\s+/g, '\\s*'), 'i').test(t));
  if (found.length) return `Listing mentions: ${[...new Set(found)].join(' / ')} — verify documents before payment`;
  return fallback || 'Not stated — verify SHMSRS / strata title and land rights before payment';
}

function matchRegistry(text) {
  const x = String(text || '').toLowerCase();
  return registry.find(r => r.aliases.some(a => x.includes(a.toLowerCase()))) || null;
}

function chooseName(title, reg) {
  if (reg) return reg.property;
  let x = String(title || '').replace(/\s+/g, ' ').trim();
  x = x.replace(/\s*[-|]\s*(99\.co|Rumah123|Pinhome).*$/i, '');
  return x.slice(0, 100) || 'Apartment listing';
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_,n) => String.fromCharCode(Number(n)));
}

function stripHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function htmlTitle(html) {
  const og = String(html || '').match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || String(html || '').match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og) return decodeEntities(og[1]);
  const t = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t ? stripHtml(t[1]) : '';
}

function jsonLdText(html) {
  const texts=[];
  const re=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while((m=re.exec(String(html||'')))) texts.push(stripHtml(m[1]));
  return texts.join(' | ');
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': config.user_agent, 'accept-language': 'id-ID,id;q=0.9,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(config.request_timeout_ms || 18000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html') && !type.includes('application/xhtml')) throw new Error(`Unexpected content-type ${type}`);
  return await res.text();
}

function extractSearchLinks(html, meta) {
  const src=String(html||'');
  const out=[];
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m;
  while((m=re.exec(src))){
    let href=decodeEntities(m[1]);
    if(href.startsWith('/')) href=new URL(href, meta.url).toString();
    if(!/99\.co\/id\/properti\//i.test(href)) continue;
    const context=stripHtml(src.slice(Math.max(0,m.index-1800),Math.min(src.length,m.index+2600))).slice(0,2200);
    out.push({url:normalizeUrl(href),context,meta});
  }
  const uniq=new Map();
  for(const x of out) if(!uniq.has(x.url)) uniq.set(x.url,x);
  return [...uniq.values()].slice(0,config.search_max_links_per_page||18);
}

async function serperDiscover() {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const queries = [
    'site:99.co/id/properti apartemen dijual 1BR "MRT" "Jakarta Pusat" "Rp"',
    'site:99.co/id/properti apartemen dijual 2BR "MRT" "Jakarta Pusat" "Rp"',
    'site:99.co/id/properti apartemen dijual 1BR (MRT OR LRT) "Jakarta Selatan" "Rp"',
    'site:99.co/id/properti apartemen dijual 2BR (MRT OR LRT) "Jakarta Selatan" "Rp"',
    'site:rumah123.com/properti apartemen dijual 1BR MRT Jakarta Pusat',
    'site:pinhome.id/dijual/apartemen-sekunder 1BR LRT Jakarta Selatan'
  ];
  const found = [];
  for (const q of queries) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, gl: 'id', hl: 'id', num: 10 }),
        signal: AbortSignal.timeout(config.request_timeout_ms || 18000)
      });
      if (!res.ok) continue;
      const j = await res.json();
      for (const r of j.organic || []) {
        if (!/(99\.co|rumah123\.com|pinhome\.id)/i.test(r.link || '')) continue;
        found.push({ url: normalizeUrl(r.link), context: `${r.title || ''} ${r.snippet || ''}`, meta: null });
      }
    } catch {}
  }
  const uniq = new Map();
  for (const x of found) if (!uniq.has(x.url)) uniq.set(x.url, x);
  return [...uniq.values()].slice(0, 40);
}

function oldByUrlMap() {
  const m = new Map();
  for (const l of oldData.listings || []) if (l.source_url) m.set(normalizeUrl(l.source_url), l);
  return m;
}
const oldByUrl = oldByUrlMap();

async function inspectCandidate(candidate, seedOverride = null) {
  let html = '', fetchError = null;
  try { html = await fetchText(candidate.url); } catch (e) { fetchError = e.message; }
  const title = seedOverride?.property || (html ? htmlTitle(html) : '') || candidate.context || '';
  const bodyText = html ? stripHtml(html) : '';
  const structured = html ? jsonLdText(html) : '';
  const combined = `${title} ${candidate.context || ''} ${structured} ${bodyText}`.slice(0, 120000);
  const reg = matchRegistry(combined) || matchRegistry(seedOverride?.property || '');
  const prev = oldByUrl.get(normalizeUrl(candidate.url));

  const buyPrice = seedOverride?.buy_price || parsePrice(combined) || prev?.buy_price || null;
  const bedrooms = seedOverride?.bedrooms || parseBedrooms(combined) || prev?.bedrooms || null;
  const size = seedOverride?.size_sqm || parseSize(combined) || prev?.size_sqm || null;
  const area = reg?.area || candidate.meta?.area || prev?.area || (/jakarta pusat/i.test(combined) ? 'Jakarta Pusat' : /jakarta selatan/i.test(combined) ? 'Jakarta Selatan' : null);
  const transitType = reg?.transit_type || candidate.meta?.transit_type || prev?.transit_type || (/\bMRT\b/i.test(combined) && /\bLRT\b/i.test(combined) ? 'MRT/LRT' : /\bMRT\b/i.test(combined) ? 'MRT' : /\bLRT\b/i.test(combined) ? 'LRT' : null);

  if (!area || !config.areas.includes(area)) return { accepted: false, reason: 'area' };
  if (!config.bedrooms.includes(bedrooms)) return { accepted: false, reason: 'bedrooms' };
  if (!buyPrice || buyPrice > config.discovery_price_ceiling_idr) return { accepted: false, reason: 'price' };
  if (!transitType || !/(MRT|LRT)/.test(transitType)) return { accepted: false, reason: 'transit' };

  const certFallback = reg?.certificate_note || prev?.certificate || '';
  const certificate = extractCertificate(combined, certFallback);
  const property = chooseName(title, reg);
  const source = seedOverride?.source || sourceFromUrl(candidate.url);
  const now = nowJakartaISO();
  const id = prev?.id || hashId(candidate.url);
  const market = seedOverride?.market || prev?.market || (/baru|primary|under construction/i.test(combined) ? 'New / Primary' : 'Secondary');
  let risk = reg?.risk || prev?.risk || 'Medium';
  if (/PPJB/i.test(certificate)) risk = risk === 'High' ? risk : 'Medium-High';
  if (/under construction/i.test(market)) risk = 'High';

  const listing = {
    id,
    property,
    area,
    district: reg?.district || prev?.district || '',
    bedrooms,
    size_sqm: size,
    buy_price: buyPrice,
    previous_buy_price: prev?.buy_price ?? null,
    rent_monthly: prev?.rent_monthly ?? null,
    rent_includes_ipl: prev?.rent_includes_ipl ?? false,
    ipl_monthly: reg?.ipl_monthly ?? prev?.ipl_monthly ?? null,
    market,
    certificate,
    transit: reg?.transit || candidate.meta?.transit || prev?.transit || transitType,
    transit_type: transitType,
    distance_km: reg?.distance_km ?? candidate.meta?.distance_hint_km ?? prev?.distance_km ?? null,
    monas_access: reg?.monas_access || candidate.meta?.monas_access || prev?.monas_access || 'Verify route',
    source,
    source_url: normalizeUrl(candidate.url),
    risk,
    notes: fetchError ? `Auto-monitor fallback used because source fetch failed: ${fetchError}. Verify before transaction.` : 'Auto-monitored listing. Asking price and legal documents must be verified before transaction.',
    first_seen_at: prev?.first_seen_at || prev?.generated_at || now,
    last_seen_at: now,
    monitor_status: buyPrice < config.target_price_idr ? 'TARGET_BELOW_900M' : buyPrice === config.target_price_idr ? 'TARGET_900M' : 'BENCHMARK',
    fetch_status: fetchError ? 'fallback' : 'ok'
  };
  return { accepted: true, listing };
}

const stats = { sources_ok: 0, sources_failed: 0, discovered_urls: 0, inspected: 0, accepted: 0 };
const discovered = [];
for (const meta of searchPages) {
  try {
    const html = await fetchText(meta.url);
    stats.sources_ok++;
    discovered.push(...extractSearchLinks(html, meta));
  } catch (e) {
    stats.sources_failed++;
    console.warn(`Search page failed: ${meta.name}: ${e.message}`);
  }
}
const serper = await serperDiscover();
discovered.push(...serper);
for (const seed of seeds) discovered.push({ url: normalizeUrl(seed.url), context: seed.property, meta: null, seed });

const unique = new Map();
for (const d of discovered) {
  const u = normalizeUrl(d.url);
  if (!unique.has(u) || d.seed) unique.set(u, d);
}
stats.discovered_urls = unique.size;

const acceptedMap = new Map();
const candidates=[...unique.values()];
const concurrency=Math.max(1,config.monitor_concurrency||4);
for(let i=0;i<candidates.length;i+=concurrency){
  const batch=candidates.slice(i,i+concurrency);
  const results=await Promise.all(batch.map(async candidate=>{
    const seed=candidate.seed||seeds.find(s=>normalizeUrl(s.url)===normalizeUrl(candidate.url))||null;
    try{return await inspectCandidate(candidate,seed)}catch(e){return {accepted:false,reason:e.message}}
  }));
  stats.inspected+=batch.length;
  for(const result of results){
    if(result.accepted){acceptedMap.set(normalizeUrl(result.listing.source_url),result.listing);stats.accepted++;}
  }
}

// Preserve bundled benchmarks and rental references even when they are outside discovery ceiling.
for (const old of oldData.listings || []) {
  const u = old.source_url ? normalizeUrl(old.source_url) : null;
  if (u && acceptedMap.has(u)) continue;
  if (!old.buy_price || old.buy_price > config.discovery_price_ceiling_idr || old.rent_monthly) {
    acceptedMap.set(u || old.id, old);
  }
}

let listings = [...acceptedMap.values()];
listings.sort((a, b) => {
  const ta = a.buy_price && a.buy_price <= config.target_price_idr ? 0 : 1;
  const tb = b.buy_price && b.buy_price <= config.target_price_idr ? 0 : 1;
  return ta - tb || (a.buy_price || 9e15) - (b.buy_price || 9e15) || String(a.property).localeCompare(String(b.property));
});
listings = listings.slice(0, config.max_listings || 80);

const changes = [];
for (const l of listings) {
  const prev = l.source_url ? oldByUrl.get(normalizeUrl(l.source_url)) : null;
  if (!prev) {
    changes.push({ type: 'NEW', at: nowJakartaISO(), id: l.id, property: l.property, bedrooms: l.bedrooms, price: l.buy_price, source_url: l.source_url });
  } else if (prev.buy_price && l.buy_price && l.buy_price !== prev.buy_price) {
    changes.push({
      type: l.buy_price < prev.buy_price ? 'PRICE_DOWN' : 'PRICE_UP',
      at: nowJakartaISO(), id: l.id, property: l.property, bedrooms: l.bedrooms,
      old_price: prev.buy_price, price: l.buy_price, delta: l.buy_price - prev.buy_price, source_url: l.source_url
    });
  }
}

const now = nowJakartaISO();
const output = {
  generated_at: now,
  currency: 'IDR',
  criteria: {
    workplace: config.workplace,
    areas: config.areas,
    bedrooms: config.bedrooms,
    transit_priority: config.transit_priority,
    target_price_idr: config.target_price_idr,
    salary_net_monthly_idr: config.salary_net_monthly_idr,
    housing_budget_monthly_idr: config.housing_budget_monthly_idr,
    kpr_tenors_years: config.kpr_tenors_years,
    kpr_interest_effective_percent: config.kpr_interest_effective_percent
  },
  notes: 'Automated asking-price monitor. Verify unit availability, negotiated price, SHMSRS/strata documents, land HGB, IPL arrears, bankability and transit walking distance before transaction.',
  listings
};

const mergedChanges = [...changes, ...(oldChanges.changes || [])]
  .filter((x, i, a) => i === a.findIndex(y => `${y.type}|${y.id}|${y.at}|${y.price}` === `${x.type}|${x.id}|${x.at}|${x.price}`))
  .slice(0, 100);

await writeJSON('data/apartments.json', output);
await writeJSON('data/changes.json', { generated_at: now, changes: mergedChanges });
await writeJSON('data/health.json', {
  generated_at: now,
  status: stats.accepted > 0 || listings.length > 0 ? 'ok' : 'degraded',
  ...stats,
  accepted_listings: listings.length,
  serper_enabled: Boolean(process.env.SERPER_API_KEY),
  message: stats.sources_failed ? 'Completed with one or more source fetch failures; retained safe fallbacks where possible.' : 'Monitoring completed.'
});

console.log(`Monitor complete: ${listings.length} listings, ${changes.length} new changes, ${stats.sources_ok}/${searchPages.length} search pages OK.`);
