# Official Google policy review — retrieved 2026-10-07

These links were fetched directly during implementation. Policies and product controls can change; recheck the account's Policy Center and official documentation before live rollout. A local implementation review is not Google approval.

| Official source | Finding applied |
|---|---|
| [AdSense Program policies](https://support.google.com/adsense/answer/48182?hl=en) | No self-clicks, encouragement/rewards for non-rewarded ads, invalid impressions or deceptive placement. Preserve substantive publisher content. |
| [Ad placement policies](https://support.google.com/adsense/answer/1346295?hl=en) | Do not induce accidental clicks, mimic controls or artificially refresh pages/elements. No preset-time display ad barrier before games/content. |
| [Content ads on game-play pages](https://support.google.com/adsense/answer/2768340?hl=en) | Strong recommendation: at least 150px from game edge, or remove ads; larger separation can be needed based on gameplay. Measure game/control rectangles and omit unsafe inventory. |
| [Special implementations](https://support.google.com/adsense/answer/1354742?hl=en) | Altering AdSense behavior/targeting is generally prohibited. Do not forcibly hide Google-generated creatives/vignettes. No custom sticky manual implementation was verified as appropriate, so use document-flow placements; Google's official anchor/side-rail formats remain a dashboard decision on eligible content. |
| [Screens without publisher content](https://support.google.com/publisherpolicies/answer/11112688?hl=en) | No empty/navigation/alert-only screens for ads. No artificial test breaks, page splitting or transitions. Short/support documents are conservatively excluded. |
| [Certified CMP requirements](https://support.google.com/adsense/answer/13554116?hl=en) | Certified CMP integrated with TCF is required for personalized advertising in EEA/UK/Switzerland. Consent is not inferred; ads wait for a legitimate publisher CMP callback. Regional/audience duties still require publisher setup. |
| [Auto Ads controls](https://support.google.com/adsense/answer/9305577?hl=en) | Current controls distinguish in-page banner/multiplex, official anchor/side rail/vignette overlays, exclusions, density and spacing. Exclude the interactive root and review content controls. |
| [Vignettes](https://support.google.com/adsense/answer/16531962?hl=en) | Google controls eligible serving, including additional user-interaction triggers; fullscreen ads must be dismissible. Additional triggers on a live SAT/game could interrupt input; app remains excluded. |
| [Vignette frequency](https://support.google.com/adsense/answer/13956167?hl=en) | Dashboard frequency range 1 minute–1 hour; default 10 minutes. Set approximately 3 minutes there; no JS refresh or guaranteed impression schedule. |
| [Prevent link-triggered vignettes](https://support.google.com/adsense/answer/17016693?hl=en) | Official `data-google-vignette="false"` can suppress a specific link trigger, but does not replace full-page exclusions or disable other triggers. It is not used as a false promise of active-test protection. |
| [H5 game structure](https://developers.google.com/ad-placement/docs/html5-game-structure) and [API reference](https://developers.google.com/ad-placement/apis) | HTML5 canvas architecture is technically compatible. Publisher access/approval remains unconfirmed; no H5 live integration or rewarded placements enabled. Official pause/mute/resume/no-fill callbacks required if later approved. |

## Conflicts resolved

- Requested Auto Ads/vignettes across long test/game sessions conflict with reliable active-question protection on the existing single URL. Alternative: root excluded; manual safe placements on app states; Google's vignettes on substantive content documents.
- Existing practice suppression hid Google creatives and `#google_vignette`. Removed rather than extending it. Only publisher-owned placement containers follow normal screen navigation.
- Existing fixed rails had no game/control clearance checks. Replaced with nonsticky, geometry-gated desktop rails. Games are never scaled down to accommodate them.
- Existing Adsterra scripts and privacy description disagreed. Removed network scripts; updated disclosures, while leaving live ad loading off until proper publisher setup.
- Old documentation URLs for vignette settings/H5 setup returned 404. The links above are the currently available official endpoints actually retrieved.

Quizlet and other free study sites are useful UX references for readable study content and separated inventory; they are not evidence of policy compliance, nor a reason to duplicate a specific competitor's density or copyrighted design.
