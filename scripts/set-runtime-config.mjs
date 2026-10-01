import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function getOrigin() {
  try { return execFileSync('git', ['remote','get-url','origin'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return ''; }
}
function parseRepo(origin) {
  let m = origin.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return m ? { owner:m[1], repo:m[2] } : null;
}
const origin = process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}.git` : getOrigin();
const repo = parseRepo(origin);
const cfg = repo ? {
  data_url: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/main/data/apartments.json`,
  changes_url: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/main/data/changes.json`,
  health_url: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/main/data/health.json`,
  poll_seconds: 60,
  repository: `${repo.owner}/${repo.repo}`
} : {
  data_url: '/data/apartments.json', changes_url: '/data/changes.json', health_url: '/data/health.json', poll_seconds: 60
};
await fs.writeFile(path.join(ROOT,'runtime-config.json'), JSON.stringify(cfg,null,2)+'\n');
console.log(repo ? `Runtime configured for GitHub raw data: ${repo.owner}/${repo.repo}` : 'No GitHub origin found; runtime uses local bundled JSON.');
