# SEO status — audited 2026-10-10

I was asked to "optimise completely" and make the site "discoverable very
easily". The honest finding is that **the on-site SEO is already
comprehensive and working**, so this records what was verified, the two
things changed, and the one action left that only you can take.

## What was verified working (not assumed — checked)

| | |
|---|---|
| Indexable pages | **658** generated, 663 sitemap URLs |
| Orphans | none — `tests/seo-audit.test.cjs` passes |
| Canonicals, titles, H1s, JSON-LD | all present, 663 unique titles |
| Segmented sitemaps | present and referenced from `robots.txt` |
| Per-score pages | 66 SAT (`/sat-scores/1000/` etc.), 20 ACT |
| SAT↔ACT conversion | `/sat-act-conversion/`, built on the official ACT/College Board concordance shipped in `college-data.js` |
| College profiles | 405 |
| Scholarships / costs / guides | 52 / 51 / 19 |
| Main app page | crawlable — ~2,460 words of static text, an `<h1>`, 32 internal links |
| IndexNow key | `641c1120…​.txt`, tracked and served |
| IndexNow submissions | **21 batches, all HTTP 200**, 663 URLs submitted |
| Automation | Temporal worker on a 7-day schedule, currently running |

Structured data on the home page already covers Organization, WebSite,
WebApplication, HowTo and FAQPage.

## Two things I checked that looked like gaps and were not

**ACT scores 11–16 have no pages.** This is correct, not an oversight. Of the
273 colleges with ACT ranges, scores 11–13 match **zero** and 14–16 match
2, 7 and 13 respectively. Pages there would be the thin, near-empty content
the generators' own editorial rule forbids ("every page links to real,
existing parts of the site"). The cutoff at 17 — where 20 colleges match — is
a sensible editorial line.

**A missing IndexNow key.** There is one; I looked for the wrong filename
(the key file is named by its hex value, not `indexnow*`).

## What changed

**`scripts/deploy.sh`** — deploy, then submit to IndexNow immediately.
Submission already ran, but on a 7-day cycle, so a page published the day
after a run waited up to a week. This closes it to minutes.

    ./scripts/deploy.sh

Order matters and the script enforces it: submit *after* wrangler finishes.
IndexNow tells a crawler "this changed, come and look" — if it arrives before
the deploy is live, the crawler fetches the old page, records it as
unchanged, and the submission is worse than wasted. A submission failure
never fails the deploy; the weekly run remains the safety net.

## The one thing left, and it needs your account

**Google Search Console. Google does not consume IndexNow at all.** Every
automated submission this repo makes reaches Bing, Yandex, Seznam and Naver
— and none of it reaches Google. If the site is not verified in Search
Console with the sitemap submitted, that is by far the largest remaining
discoverability gap, and no amount of code changes it.

1. <https://search.google.com/search-console> → Add property → **Domain** →
   `funsat.bid`
2. Verify by DNS TXT. The domain is already on Cloudflare, so this is one
   record and takes a minute.
3. Sitemaps → submit `sitemap.xml`
4. Optional but quick: Bing Webmaster Tools can import directly from Search
   Console once it is set up.

## Honest note on what SEO can and cannot do here

The technical and on-page work on this site is done to a high standard. What
decides whether it ranks now is mostly off-site — links, domain age, and
competing against College Board, Khan Academy and PrepScholar for the same
queries. Those are not code problems, and changing more markup will not move
them. The highest-value remaining actions are Search Console, then earning
links (the score pages and the free calculators are the most linkable assets
here).
