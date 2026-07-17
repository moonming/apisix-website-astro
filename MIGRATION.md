# Proposal: rebuild apisix.apache.org as a fully static site

## Why

The current site is four independent Docusaurus 2.0-beta SPAs (website, doc, blog/en, blog/zh) stitched together at build time. Measured problems:

1. **Recurring 404s.** Each workspace ships its own client-side route manifest. After every deploy, browsers holding a stale manifest resolve cross-workspace navigations to the SPA 404 route. PR #2064 patched one symptom (guarded reload in a swizzled NotFound); the architecture guarantees the class of bug.
2. **Payload.** The homepage ships ~350 KB of HTML plus ~120 KB gz of framework JS (React runtime + hydration) and 36 KB gz CSS — for a content page with no interactive state. Every docs/blog page pays a similar JS tax.
3. **Frozen toolchain.** Node 16 (EOL), Docusaurus 2.0.0-beta.6/beta.8 with patch-package patches, four `node_modules` trees, tens-of-minutes CI builds with four cache layers.

The site is *already* served as static files from the `asf-site` branch by ASF httpd. Only the generator — and what it makes browsers download — needs to change.

## What

Regenerate the identical URL space with [Astro](https://astro.build) in static output mode:

- **Zero client JS.** Pages are plain HTML + one shared 2.7 KB gz stylesheet. (Single exception: `/edit/`, a redirector that inherently needs 3 lines of inline JS. Algolia DocSearch and the kapa.ai widget can be re-added as progressive enhancements if wanted — they are additive `<script>` tags, not framework requirements.)
- **Same content sources.** Blog/learning-center/articles markdown lives in the repo as today; project docs are synced from apache/apisix and the six sub-project repos exactly as `sync-docs.js` does now (`scripts/sync-content.mjs` replaces it, ~120 lines).
- **Same deploy.** `dist/` → `asf-site` branch → ASF httpd. `.htaccess` redirects, staging profile, CI trigger cadence: all unchanged.
- **Same URLs.** Verified mechanically, not by hand — see below.

## Evidence (prototype in this repo)

| Metric | Result |
|---|---|
| URL parity | **1294/1294** URLs from the live `sitemap.xml` + `zh/sitemap.xml` exist in `dist/` (exact, case-sensitive). 0 missing. |
| Pages built | 1368 (654 EN + 640 ZH sitemap URLs + versionless extras) in **~18 s** on a laptop |
| Homepage transfer | 2.6 KB gz HTML + 2.7 KB gz CSS ≈ **5.3 KB** vs ~200 KB+ today (≈40×) |
| Docs page transfer | 7.3 KB gz HTML + shared CSS |
| Client JS | 0 bytes on all indexable pages |
| SEO surface | per-page canonical, `hreflang` en/zh-CN/x-default, meta description, OG/Twitter, JSON-LD (WebSite/Organization + BlogPosting/TechArticle/FAQPage), robots.txt, split EN/ZH sitemaps — same shape as today |

URL rules that had to be reverse-engineered and are now encoded in `src/lib/content.ts` (each verified against the live sitemap):

- Blog: `/blog/YYYY/MM/DD/<filename-as-is>/` — case and spaces preserved (`APISIX-integrates-with-Coraza`, `bi-weekly report`); frontmatter `slug` containing `/` replaces the whole path.
- Docs: frontmatter `slug` (root- or dir-relative) > frontmatter `id` > file path; case preserved (`/docs/apisix/FAQ/`).
- Docs `general`: `id` overrides are live (`security-guide.md` → `/docs/general/security/`).
- Sub-project docs must sync from the **latest release tag**, not master (ingress-controller master has a restructured tree).

## What is intentionally NOT in the prototype

Mechanical, not architectural, work for the real migration:

1. **Versioned docs** (`/docs/apisix/3.10/…` × 8 versions × 2 locales, ~3 000 pages). Same pipeline parameterized by version — the current `config/apisix-versions.js` list carries over.
2. **Pixel-faithful visual port.** The prototype approximates the current design (brand palette, layout); the real PR should port section-by-section styling and the full homepage art.
3. **Search.** Recommend keeping Algolia DocSearch as an additive script (crawler-based, no build coupling), or Pagefind for a fully self-hosted option.
4. **Team/downloads data generators** (`generate-repos-info` GitHub API calls) — build-time JSON, framework-agnostic, ports as-is.

## Rollout plan

1. Discuss on dev@apisix.apache.org with this prototype + numbers (Apache Way: consensus first).
2. Land the Astro build in a `next/` directory of apache/apisix-website behind the existing CI, publishing to the `asf-staging` profile (`preview/*` autostage already configured in `.asf.yaml`) for community review.
3. Diff crawl: run the parity checker plus an HTML-level diff of title/canonical/hreflang/JSON-LD for every URL against production.
4. Flip the deploy step's `publish_dir`. `asf-site` history provides instant rollback (`force_orphan: true` today — consider keeping one prior snapshot).
5. Monitor GSC coverage + CWV for two weeks. Because URLs, sitemaps, and head tags are byte-compatible, there is no re-indexing event — Google sees the same pages, just 40× lighter.
6. Delete the four Docusaurus workspaces once stable.
