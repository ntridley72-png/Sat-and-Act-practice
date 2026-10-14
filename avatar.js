/* Avatar art.
   Simple head-and-shoulders silhouettes drawn in the browser as SVG: nothing
   is uploaded, nothing is fetched, and no image is hosted anywhere. Each
   variant is one accessible background/figure color combination, so a choice
   looks the same for every student. A custom photo upload is handled by the
   app (canvas re-encode into a small square JPEG stored in the signed-in
   profile); this module only draws the built-in silhouettes and validates
   stored photo references. */
(function () {
  "use strict";

  var VARIANTS = 8;
  // Background / figure pairs chosen for a clear silhouette edge and readable
  // contrast in both the dark and light workspace appearances.
  var COMBOS = [
    { id: "navy", bg: "#1d3557", ink: "#eef4fb" },
    { id: "forest", bg: "#14532d", ink: "#e9f6ee" },
    { id: "rust", bg: "#7c2d12", ink: "#fbeee6" },
    { id: "violet", bg: "#4c1d95", ink: "#f2ecfe" },
    { id: "teal", bg: "#0f5f6e", ink: "#e6f6f9" },
    { id: "berry", bg: "#831843", ink: "#fdeaf2" },
    { id: "slate", bg: "#334155", ink: "#f1f5f9" },
    { id: "amber", bg: "#704a12", ink: "#fdf4e4" }
  ];

  var clipCounter = 0;

  function silhouetteMarkup(variant) {
    var v = Number.isFinite(Number(variant)) ? Math.floor(Number(variant)) : 0;
    var combo = COMBOS[((v % COMBOS.length) + COMBOS.length) % COMBOS.length];
    var clipId = "fxav-clip-" + (++clipCounter);
    return {
      bg: combo.bg,
      markup:
        '<defs><clipPath id="' + clipId + '"><circle cx="24" cy="24" r="24"/></clipPath></defs>' +
        '<g clip-path="url(#' + clipId + ')">' +
        '<circle cx="24" cy="24" r="24" fill="' + combo.bg + '"/>' +
        '<circle cx="24" cy="18.4" r="8.1" fill="' + combo.ink + '"/>' +
        '<path d="M6.8 45.6c1.5-9.6 8.5-15.2 17.2-15.2s15.7 5.6 17.2 15.2z" fill="' + combo.ink + '"/>' +
        "</g>"
    };
  }

  /* svg(id, variant, size, opts)
     The id argument is kept for call-site compatibility with the previous
     generated-block avatars; silhouettes are chosen by variant, so an existing
     saved variant index keeps working and simply renders the new art.
     opts.decorative: true marks it aria-hidden instead of giving it a label. */
  function svg(id, variant, size, opts) {
    opts = opts || {};
    size = size || 30;
    var art = silhouetteMarkup(variant);
    var label = opts.decorative
      ? 'aria-hidden="true" focusable="false"'
      : 'role="img" aria-label="' + (opts.label || "Your avatar") + '"';
    return '<svg class="fxav" viewBox="0 0 48 48" width="' + size + '" height="' + size + '" ' + label + ">" +
      art.markup + "</svg>";
  }

  // Only the canvas re-encode the app produces is accepted. Anything that is
  // not a base64 PNG/JPEG/WebP data URL (for example an SVG or HTML payload)
  // is treated as absent, so a tampered profile cannot inject markup.
  var SAFE_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

  function validPhoto(src) {
    return typeof src === "string" && src.length <= 120000 && SAFE_IMAGE.test(src);
  }

  function photoMarkup(src, size, opts) {
    opts = opts || {};
    size = size || 30;
    var label = opts.decorative
      ? 'aria-hidden="true"'
      : 'role="img" aria-label="' + (opts.label || "Your photo") + '"';
    return '<img class="fxav fxav-photo" src="' + src + '" width="' + size + '" height="' + size + '" ' + label + ' alt="" decoding="async">';
  }

  window.FunSATAvatar = {
    VARIANTS: VARIANTS,
    COMBOS: COMBOS,
    svg: svg,
    validPhoto: validPhoto,
    photoMarkup: photoMarkup,
    // A stable per-account seed is still exposed for future use; silhouettes
    // no longer depend on it.
    seedFor: function (user) { return user && user.email ? String(user.email).toLowerCase() : null; },
  };
}());
