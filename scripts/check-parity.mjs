/**
 * URL parity checker: every URL in the LIVE site's sitemaps must exist in the
 * freshly built dist/. This is the contract "换框架但 URI 不变".
 *
 * Comparison is string-set based (exact, case-sensitive) rather than
 * fs.existsSync, so it stays correct on case-insensitive filesystems (macOS)
 * while the production host (ASF httpd on Linux) is case-sensitive.
 *
 * Usage: node scripts/check-parity.mjs <live-en-urls.txt> <live-zh-urls.txt>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const [enList, zhList] = process.argv.slice(2);

const built = new Set();
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html') {
      const rel = path.relative(dist, path.dirname(p)).split(path.sep).join('/');
      built.add(rel === '' ? '/' : `/${rel}/`);
    }
  }
})(dist);

// Sections intentionally not in the prototype (identical pipeline, not yet
// synced): sub-project docs. Report them separately instead of as failures.
const DEFERRED = [/^\/(zh\/)?docs\/(ingress-controller|helm-chart|docker|java-plugin-runner|go-plugin-runner|python-plugin-runner)\//];

let ok = 0; const missing = []; const deferred = [];
for (const file of [enList, zhList]) {
  if (!file) continue;
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    // Live sitemap <loc> values are XML-escaped and sometimes percent-encoded;
    // dist directories carry the literal characters.
    const raw = line.replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    const url = decodeURIComponent(new URL(raw).pathname);
    if (built.has(url)) { ok += 1; continue; }
    if (DEFERRED.some((re) => re.test(url))) { deferred.push(url); continue; }
    missing.push(url);
  }
}

console.log(`parity: ${ok} present, ${missing.length} missing, ${deferred.length} deferred (sub-project docs)`);
if (missing.length) {
  console.log('\nMISSING:');
  for (const u of missing) console.log('  ' + u);
  process.exitCode = 1;
}
