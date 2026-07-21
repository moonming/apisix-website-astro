Subject: [DISCUSS] Rebuilding apisix.apache.org as a fully static site (keeping every URL)

Hi all,

I'd like to propose rebuilding apisix.apache.org's generator, and I have a
working prototype with measurements to discuss.

## The problem

Our site is four independent Docusaurus 2.0-beta SPAs (website, doc, blog/en,
blog/zh) stitched together at build time. This architecture causes real,
recurring issues:

1. Recurring 404s. Each workspace ships its own client-side route manifest.
   After every deploy, browsers holding a stale manifest resolve
   cross-workspace navigations to the SPA 404 page. We patched one symptom
   (#2064), but the architecture guarantees this class of bug.

2. Payload. The homepage ships ~350 KB of HTML plus ~120 KB (gzipped) of
   React runtime and hydration JS — for a content page with no interactive
   state. Every docs and blog page pays the same JS tax.

3. Frozen toolchain. We are pinned to Node 16 (EOL) and Docusaurus
   2.0.0-beta.6/beta.8 with patch-package patches, four node_modules trees,
   and four separate cached builds in CI.

Note the site is *already* served as static files from the asf-site branch by
ASF httpd. Only the generator — and what it makes browsers download — needs
to change.

## The proposal

Regenerate the identical URL space with Astro in static-output mode:

- Zero client-side JS. Pages become plain HTML plus one shared ~2.7 KB
  (gzipped) stylesheet. Algolia DocSearch / the kapa.ai widget can be
  re-added as additive script tags if we want them.
- Same content sources and contributor workflow. Blog / learning-center /
  articles markdown stays in this repo exactly where it is today; project
  docs are synced from apache/apisix and the six sub-project repos the same
  way sync-docs.js does now (the replacement sync script is ~120 lines).
- Same deploy. dist/ -> asf-site branch -> ASF httpd. .htaccess redirects,
  the asf-staging profile, and CI cadence are unchanged.
- Same URLs. Verified mechanically, not by hand.

## Prototype results

I built a prototype covering the full current URL space:

- URL parity: 1294/1294 URLs from the live sitemap.xml + zh/sitemap.xml
  exist in the new build, compared exactly and case-sensitively. Zero
  missing.
- 1368 pages build in ~18 seconds on a laptop (Node 22).
- Homepage first-load transfer: ~5.3 KB gzipped (2.6 KB HTML + 2.7 KB shared
  CSS), versus ~200 KB+ today — roughly 40x lighter. A docs page is ~7.3 KB
  gzipped HTML.
- SEO surface preserved per page: canonical, hreflang (en / zh-CN /
  x-default), meta description, OG/Twitter tags, JSON-LD
  (WebSite/Organization + BlogPosting/TechArticle/FAQPage), robots.txt, and
  split EN/ZH sitemaps — same shape as production.

Getting to 100% parity required reverse-engineering a few URL rules from the
live sitemaps (blog slugs preserve filename case and spaces; frontmatter
slug/id precedence in docs; sub-project docs must sync from release tags, not
master). These rules are now encoded in one commented module and enforced by
a parity checker that can run in CI forever after.

Not in the prototype, but mechanical rather than architectural: versioned
docs (3.10–3.17 x 2 locales — same pipeline, parameterized by the existing
config/apisix-versions.js), a pixel-faithful port of the current visual
design, and search integration.

## Suggested rollout (if we agree to proceed): subtree waves

We cannot canary by traffic percentage — ASF httpd serves asf-site directly
and there is no load balancer or edge under project control. But we don't
need to: both generators emit plain directory trees, and today's asf-site is
already four independent builds stitched together by path. So the canary unit
is a URL subtree. CI runs both toolchains and assembles the deploy tree from
a prefix allowlist; each wave is one commit, rollback is removing a prefix.

  Wave 0: full new site on asf-staging (preview/* autostage already
          configured) for community review; link-checker + Lighthouse.
  Wave 1: /learning-center/ + /articles/ + /events/archive/ — smallest
          blast radius, content lives in this repo.
  Wave 2: /blog/ (EN+ZH, ~650 URLs) — most mechanical, biggest build-time win.
  Wave 3: /docs/ — the docs framework swap; most complex surface
          (version trees, .htaccess), done with two waves of experience.
  Wave 4: homepage + marketing pages, after visual polish.

Per-wave gates: the parity checker asserts the subtree's URL set matches the
live sitemap exactly, plus an HTML diff of title/canonical/hreflang/JSON-LD
against production. Per-wave measurement: each migrated prefix is its own
cohort in Search Console (coverage, clicks) and CrUX (LCP/CLS) for ~two
weeks, with the not-yet-migrated subtrees as the control group. SEO risk
settles per-URL, so this is a cleaner experiment than a request split.

The Docusaurus workspaces stay in CI until the final wave has been stable
for a month; then we delete them. Because URLs, sitemaps, and head tags stay
byte-compatible, no wave triggers a re-indexing event.

You can browse the full rebuilt site on ASF staging right now (every URL
from the production sitemaps, EN + ZH):

  https://apisix-astro.staged.apache.org/

It is deployed from the preview/astro-staging branch of this repo via the
autostage mechanism already configured in our .asf.yaml. A head-tag diff of
60 sampled URLs against production reports zero regressions on
canonical/description/title/robots (the only intentional deltas: symmetric
hreflang pairs and leaner JSON-LD).

Prototype, measurement methodology, and this proposal in doc form:
https://github.com/moonming/apisix-website-astro

Framework choice is of course open to discussion — the
essential properties are "static HTML out, zero client JS, byte-identical
URLs"; Astro is simply the mainstream option that delivers them with the
least custom code (Hugo would be the no-Node alternative, with a weaker
markdown/component story).

Thoughts? Especially interested in concerns from anyone maintaining the docs
sync or the zh translations.

Thanks,
Ming Wen
