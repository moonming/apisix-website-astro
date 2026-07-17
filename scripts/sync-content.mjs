/**
 * Content sync: copies markdown from the existing apisix-website repo and the
 * upstream apache/apisix docs checkout into ./content, applying the same
 * normalizations the current sync-docs.js does, plus static-friendly rewrites:
 *   - strip MDX `import` lines
 *   - flatten <Tabs>/<TabItem> into sequential sections
 *   - `:::type Title` -> `:::type[Title]` (remark-directive label syntax)
 *   - relative image paths -> raw.githubusercontent.com
 *   - relative .md links -> absolute site URLs
 *
 * In the real migration this script replaces scripts/sync-docs.js and runs in
 * CI before `astro build`, for every project/version in config/apisix-versions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Clean export of apache/apisix-website origin/master (populated via
// `git archive`), decoupled from the mutable working checkout next door.
const WEBSITE_REPO = path.join(root, '.sync/website');
const OUT = path.join(root, 'content');

const stats = { copied: 0, tabsFlattened: 0, importsStripped: 0 };

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function flattenTabs(src) {
  if (!/<Tabs/i.test(src)) return src;
  stats.tabsFlattened += 1;
  return src
    .replace(/<TabItem[^>]*label=["']([^"']+)["'][^>]*>/g, '\n**$1**\n')
    .replace(/<TabItem[^>]*value=["']([^"']+)["'][^>]*>/g, '\n**$1**\n')
    .replace(/<\/?Tabs[^>]*>/g, '')
    .replace(/<\/TabItem>/g, '');
}

function transform(src, { docBase, ghProject, ghRef = 'master' } = {}) {
  let out = src;
  // MDX imports cannot exist in plain markdown.
  out = out.replace(/^import\s+.*(from\s+.*)?;?\s*$/gm, () => {
    stats.importsStripped += 1;
    return '';
  });
  out = flattenTabs(out);
  // Docusaurus admonition custom titles -> directive labels.
  out = out.replace(/^:::(\w+)[ \t]+(.+)$/gm, ':::$1[$2]');
  if (ghProject) {
    // ../assets/... and ../../docs/assets/... image refs -> raw GitHub (same
    // origin the current site ultimately serves many of these from).
    out = out.replace(/\((\.\.\/)+(?:docs\/)?assets\/([^)\s]+)(\s+"[^"]*")?\)/g,
      `(https://raw.githubusercontent.com/apache/${ghProject}/${ghRef}/docs/assets/$2$3)`);
  }
  if (docBase) {
    // Relative .md links -> absolute pretty URLs (mirrors current site behavior).
    out = out.replace(/\]\((\.{1,2}\/)?([\w\-./]+)\.md(#[^)]*)?\)/g, (_m, _dot, p, hash) => {
      const clean = p.replace(/^\.\//, '');
      return `](${docBase}/${clean}/${hash || ''})`;
    });
  }
  return out;
}

function copyTree(srcDir, outDir, opts = {}, filter = () => true) {
  for (const f of walk(srcDir)) {
    if (!f.endsWith('.md') || !filter(f)) continue;
    const rel = path.relative(srcDir, f);
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, transform(fs.readFileSync(f, 'utf8'), opts));
    stats.copied += 1;
  }
}

fs.rmSync(OUT, { recursive: true, force: true });

// Blog (both locales), learning center, articles, general docs — all already
// live as markdown in the apisix-website repo.
copyTree(path.join(WEBSITE_REPO, 'blog/en/blog'), path.join(OUT, 'blog-en'));
copyTree(path.join(WEBSITE_REPO, 'blog/zh/blog'), path.join(OUT, 'blog-zh'));
copyTree(path.join(WEBSITE_REPO, 'website/learning-center'), path.join(OUT, 'learning-center'));
copyTree(path.join(WEBSITE_REPO, 'website/articles'), path.join(OUT, 'articles'));
copyTree(path.join(WEBSITE_REPO, 'website/docs/general'), path.join(OUT, 'docs-general'),
  { docBase: '/docs/general', ghProject: 'apisix-website' });

// Upstream project docs (current version), en + zh where present.
// key = URL segment under /docs/, repo = apache/<repo> checkout under .sync/.
const PROJECTS = [
  { key: 'apisix', repo: 'apisix' },
  { key: 'ingress-controller', repo: 'apisix-ingress-controller' },
  { key: 'helm-chart', repo: 'apisix-helm-chart' },
  { key: 'docker', repo: 'apisix-docker' },
  { key: 'java-plugin-runner', repo: 'apisix-java-plugin-runner' },
  { key: 'go-plugin-runner', repo: 'apisix-go-plugin-runner' },
  { key: 'python-plugin-runner', repo: 'apisix-python-plugin-runner' },
];

for (const { key, repo } of PROJECTS) {
  const docsRoot = path.join(root, '.sync', repo, 'docs');
  for (const loc of ['en', 'zh']) {
    const src = path.join(docsRoot, loc, 'latest');
    if (!fs.existsSync(src)) continue;
    const outDir = path.join(OUT, `docs-${key}-${loc}`);
    copyTree(src, outDir, {
      docBase: `${loc === 'zh' ? '/zh' : ''}/docs/${key}`,
      ghProject: repo,
    });
    const cfg = path.join(src, 'config.json');
    if (fs.existsSync(cfg)) fs.copyFileSync(cfg, path.join(outDir, 'config.json'));
  }
}

console.log('sync-content done:', JSON.stringify(stats));
