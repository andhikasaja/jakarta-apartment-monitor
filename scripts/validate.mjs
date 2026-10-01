import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html','runtime-config.json','vercel.json','data/apartments.json','data/changes.json','data/health.json',
  'config/monitor.json','config/search-pages.json','config/properties.json','config/seed-listings.json',
  '.github/workflows/monitor.yml'
];
let bad = false;
for (const f of required) {
  try { await fs.access(path.join(ROOT, f)); } catch { console.error(`Missing: ${f}`); bad = true; }
}
for (const f of required.filter(x => x.endsWith('.json'))) {
  try { JSON.parse(await fs.readFile(path.join(ROOT, f), 'utf8')); } catch (e) { console.error(`Invalid JSON ${f}: ${e.message}`); bad = true; }
}
const data = JSON.parse(await fs.readFile(path.join(ROOT, 'data/apartments.json'), 'utf8'));
if (!Array.isArray(data.listings)) { console.error('data/apartments.json must contain listings[]'); bad = true; }
for (const [i,l] of (data.listings || []).entries()) {
  if (!l.id || !l.property || ![1,2].includes(l.bedrooms)) { console.error(`Invalid listing at index ${i}`); bad = true; }
}
if (bad) process.exit(1);
console.log(`Validation OK: ${data.listings.length} bundled listings.`);
