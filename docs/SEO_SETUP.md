# SEO operations setup — funsat.bid

## Build pipeline

```
rm -rf public && mkdir public && copy assets
python3 scripts/build-seo-pages.py --out public   # clusters + guides
python3 scripts/build-landing-pages.py --out public
python3 scripts/build-hubs.py --out public        # trust + topic hubs
python3 scripts/build-sitemaps.py --out public    # scans output, writes sitemaps
```

The build starts from a fresh `public/` every time (no stale trees) and the
sitemaps are generated **last** from what was actually produced, so a page can
never be missing from the sitemap while existing on disk.

### Sitemaps
- Segments: `/sitemaps/{core,sat-act,colleges,scholarships,guides,games}.xml`
- Index: `/sitemap.xml` (stable URL; referenced from robots.txt).
- `lastmod` comes from `seo-lastmod.json` (committed): a page's date only moves
  when its rendered content hash changes. Unchanged rebuilds keep their dates.
- `noindex` pages are excluded automatically.

## IndexNow (Bing / Yandex / Naver)

```
node scripts/indexnow.mjs --dry-run     # lists what would be sent; no network, no writes
node scripts/indexnow.mjs               # submits new/changed URLs only
node scripts/indexnow.mjs --all         # resubmit everything (use after a deploy)
node scripts/indexnow.mjs --since FILE  # custom state file
```

- Only `https://funsat.bid/...` URLs from the generated sitemaps are eligible;
  localhost/staging/preview/workers.dev URLs are rejected.
- State lives in `logs/indexnow-state.json` (gitignored); a URL is resubmitted
  when its sitemap `lastmod` advances.
- Batches of 100; 429/5xx retried with exponential backoff; any terminal
  non-2xx sets a failing exit code; failures are logged to `logs/indexnow.log`.
- The verification key is the 32-hex `.txt` file in the repo root, published at
  `https://funsat.bid/<key>.txt`. It is public by design, not a secret.

**After the first deploy of this branch, run `node scripts/indexnow.mjs --all`**
once, because URLs were submitted before these pages were live (see incident
note below) and their `lastmod` will not change on deploy alone.

## Incident note (2026-10-06)

While verifying that `scripts/indexnow.mjs` was import-safe, the script was
executed unintentionally and submitted 659 production URLs. All were canonical
`https://funsat.bid` URLs (no staging/localhost), but at that moment not all of
those pages were deployed, so some will have been fetched as 404. Mitigation:
the script now only runs under `if (import.meta.url === pathToFileURL(process.argv[1]).href)`;
after the next deploy run `--all` once so currently-live pages are re-announced.

## Google Search Console

1. Verify `https://funsat.bid` (the verification meta tag is already live).
2. Sitemaps → submit `https://funsat.bid/sitemap.xml` (the index; stable).
3. URL Inspection → Request Indexing for `/`, `/sat-practice-test/`,
   `/unblocked-games/`, and a few college profiles — sparingly.
4. Monitor: Pages (indexed vs discovered/crawled-not-indexed), Sitemaps status,
   Core Web Vitals, Links.
5. Do **not** use the Google Indexing API for these pages; it is for
   JobPosting/BroadcastEvent only and is not used anywhere in this repo.

## Bing Webmaster Tools

1. funsat.bid is already added/verified.
2. Sitemaps → submit `/sitemap.xml`; confirm IndexNow shows submissions.
3. Watch the URL report for crawl errors after each deploy.

## Post-deploy checklist

1. `node scripts/indexnow.mjs --all` once (see incident note).
2. Confirm sitemaps and a sample of each cluster return 200.
3. GSC → URL Inspection on the homepage; check Pages report over the next weeks.
4. Re-export GSC/BWT data after 30 days and compare against the baseline in
   docs/SEARCH_VISIBILITY_BASELINE.md.
