# Open questions and decisions to review

These are items I finished with a reasonable default rather than blocking on an answer.
Reply to any of them and I'll adjust.

## College data
1. **Campus photos:** 65 of 354 colleges have a Wikimedia Commons photo cached. Wikipedia
   rate-limits bulk requests, so the fetch pauses and resumes automatically.
   Default taken: leave the rest without photos (`rerun python3 scripts/build-college-data.py`
   later to continue). Do you want me to keep retrying until all are filled?
2. **Athletics division and on-campus housing %:** not available in the federal College
   Scorecard file, so those two rows say "Not reported". If you want them, I can add a
   manually curated file for the top ~100 colleges.
3. **"What students say" consensus:** Reddit and Niche block automated reads, so the social
   section shows an app estimate (A–D) from official size/retention/diversity/location plus
   links to Reddit and Niche searches. If you provide a Reddit API key I can add a short
   sourced consensus per college.
4. **Subject practice coverage:** 32 narrow skills still have fewer than 10 unique questions.
   Drills top up from the same domain and label it as mixed. Want another question pack
   targeting those specific skills?

## Driving games
5. **Economy balance:** currently 1 token = $250 garage cash (manual conversion in the
   garage), and drift/circuit runs earn cash directly. Car prices $800–$9,000; widebody
   $1,500; GT wing $600. Too slow, too fast, or fine?
6. **Circuit race:** 3 laps against 3 AI opponents on the selected track. Default difficulty
   is modest (AI speeds 46–56). Should the AI scale with your car, or stay fixed?
7. **Race modes:** Neon Racing has "Traffic dodge" (endless) and "Circuit race" (laps), both
   selectable in the garage. Do you want one of them to be the default on first play?
8. **Sound:** engine volume defaults to 70% with per-car engine notes plus blow-off,
   exhaust pops, and tire screech. The global mute button still overrides everything.
   Should racing and drift share one engine volume, or have separate sliders?
9. **Missing customization we discussed but you did not pick:** driver/helmet, sound packs,
   exhaust flame colors. Say the word and I'll add them.
10. **Garage access:** now in the arcade menu, the in-game HUD for Drift and Racing, and the
    custom panel. Should it also be a top-bar tab beside Practice/College/Arcade?

## AI tutor
11. **Provider fallback:** the Worker now answers some requests through Cloudflare Workers AI
    (observed `provider: cloudflare`, model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) when
    every Groq model fails. An earlier requirement said Groq-only. Keep the Cloudflare
    fallback for reliability, or remove it and keep Groq-only?
12. **Help history provider field:** entries saved while the Cloudflare fallback answered are
    labeled "cloudflare" in Help history. Confirm that's acceptable.

## Practice / scoring
13. **ACT composite:** still English + Math + Reading (official current rule), Science
    reported separately. Unchanged, listed here only for awareness.
14. **Estimated SAT score:** subject drills, topic drills, and arcade results are all excluded.
    Confirmed by tests; no action needed unless you want a separate combined-progress view.
