/* Generated blocky avatars.
   Drawn here in the browser as SVG: nothing is uploaded, nothing is fetched and
   no image is hosted anywhere. The pattern is a 5x5 grid mirrored down the
   vertical axis, so only the left three columns are decided and the right two
   are their reflection. Everything is derived from a hash of the account id, so
   the same person gets the same avatar on every device without storing a file —
   only which of the variants they picked. */
(function () {
  "use strict";

  var VARIANTS = 8;
  // Derived from the --fx-* palette: each entry is a token, resolved at draw
  // time so an avatar follows the active workspace theme like everything else.
  var INK = ["--fx-accent", "--fx-cat-1", "--fx-cat-2", "--fx-cat-3", "--fx-cat-4", "--fx-cat-5", "--fx-cat-6"];

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // A small deterministic PRNG so one seed yields a whole pattern.
  function rng(seed) {
    var s = seed || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* svg(id, variant, size, opts)
     opts.decorative: true marks it aria-hidden instead of giving it a label. */
  function svg(id, variant, size, opts) {
    opts = opts || {};
    size = size || 30;
    var seed = hash(String(id || "funsat") + "#" + (variant || 0));
    var next = rng(seed || 1);
    var ink = "var(" + INK[seed % INK.length] + ")";
    var cells = [];
    // Columns 0-2 are decided; 3 and 4 mirror 1 and 0.
    var grid = [];
    for (var y = 0; y < 5; y++) {
      grid[y] = [];
      for (var x = 0; x < 3; x++) {
        // The middle rows are denser, which keeps the shape from reading as noise.
        var bias = y === 0 || y === 4 ? 0.38 : 0.56;
        grid[y][x] = next() < bias;
      }
    }
    for (var row = 0; row < 5; row++) {
      for (var col = 0; col < 5; col++) {
        if (grid[row][col < 3 ? col : 4 - col]) cells.push('<rect x="' + col + '" y="' + row + '" width="1" height="1"/>');
      }
    }
    var label = opts.decorative
      ? 'aria-hidden="true" focusable="false"'
      : 'role="img" aria-label="' + (opts.label || "Your avatar") + '"';
    return '<svg class="fxav" viewBox="0 0 5 5" width="' + size + '" height="' + size + '" ' + label +
      ' shape-rendering="crispEdges"><rect width="5" height="5" fill="var(--fx-surface-2)"/>' +
      '<g fill="' + ink + '">' + cells.join("") + "</g></svg>";
  }

  window.FunSATAvatar = {
    VARIANTS: VARIANTS,
    svg: svg,
    hash: hash,
    // The id an avatar is seeded from: the signed-in account, so it is stable
    // across devices. Signed out there is nothing stable to seed from.
    seedFor: function (user) { return user && user.email ? String(user.email).toLowerCase() : null; },
  };
}());
