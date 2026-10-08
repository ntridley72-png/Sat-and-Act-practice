/* Local/static-host fallback. Cloudflare serves validated Worker environment values
   at this same URL. Public publisher/unit IDs are not secrets. Default: no ads. */
window.FUNSAT_ADS = window.FUNSAT_ADS || {
  enabled: false, client: "", slots: {}, productionHosts: ["funsat.bid"],
  autoAdsExclusionsConfirmed: false, gameRails: 1, resultsDensity: "conservative",
  vignetteFrequencyMinutes: 3, experiment: "baseline", audienceReviewed: false
};
