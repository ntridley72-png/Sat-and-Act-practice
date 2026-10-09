/* Default profile pictures: a plain head-and-shoulders silhouette on a flat colour.
   No network, no image files — every avatar is an SVG built here and handed back as a
   data URI, so it works offline and costs nothing to serve.

   The colour is picked from the seed (email, name, or id), so the same person keeps the
   same avatar on every device without anything being stored.

   window.FunsatAvatar
     .colors                      -> the palette, as [{key, name, bg, ink}]
     .url(seed, opts)             -> data:image/svg+xml URI, for an <img src> or CSS url()
     .svg(seed, opts)             -> the raw SVG string
     .element(seed, opts)         -> a ready <img> element with alt text set
     opts: {size=128, color='sky'|…|undefined (auto from seed), shape='circle'|'square'|
            'squircle', initials='AB'|true|false, ring=false}
*/
(function (global) {
  'use strict';

  // Flat, mid-dark grounds so a white silhouette clears 4.5:1 on every one of them,
  // and they stay distinguishable in both light and dark page themes.
  var COLORS = [
    { key: 'slate',   name: 'Slate',   bg: '#475569' },
    { key: 'sky',     name: 'Sky',     bg: '#0369a1' },
    { key: 'teal',    name: 'Teal',    bg: '#0f766e' },
    { key: 'forest',  name: 'Forest',  bg: '#15803d' },
    { key: 'olive',   name: 'Olive',   bg: '#4d7c0f' },
    { key: 'amber',   name: 'Amber',   bg: '#b45309' },
    { key: 'rust',    name: 'Rust',    bg: '#c2410c' },
    { key: 'crimson', name: 'Crimson', bg: '#be123c' },
    { key: 'plum',    name: 'Plum',    bg: '#9333ea' },
    { key: 'indigo',  name: 'Indigo',  bg: '#4338ca' },
    { key: 'denim',   name: 'Denim',   bg: '#1d4ed8' },
    { key: 'graphite',name: 'Graphite',bg: '#334155' }
  ];
  COLORS.forEach(function (c) { c.ink = '#ffffff'; });

  function hash(str) {
    var h = 2166136261, i;
    str = String(str == null ? '' : str);
    for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function colorFor(seed, wanted) {
    var i, c;
    if (wanted) {
      for (i = 0; i < COLORS.length; i++) if (COLORS[i].key === wanted) return COLORS[i];
      if (String(wanted).charAt(0) === '#') return { key: 'custom', name: 'Custom', bg: wanted, ink: '#ffffff' };
    }
    c = COLORS[hash(seed) % COLORS.length];
    return c;
  }

  function initialsFrom(seed) {
    var s = String(seed == null ? '' : seed).trim();
    if (!s) return '';
    s = s.split('@')[0].replace(/[._-]+/g, ' ').trim();
    var parts = s.split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The silhouette: one head circle and one shoulder shape, on a 100x100 viewBox.
  // Four slightly different builds, chosen from the seed, so a list of people is not
  // twelve copies of the same outline in twelve colours.
  function figure(variant, ink) {
    var head, body;
    if (variant === 1) {          // narrow shoulders, higher head
      head = '<circle cx="50" cy="36" r="15"/>';
      body = '<path d="M50 56c-15 0-26 10-28 24h56c-2-14-13-24-28-24z"/>';
    } else if (variant === 2) {   // broad shoulders
      head = '<circle cx="50" cy="38" r="16"/>';
      body = '<path d="M50 58c-19 0-32 11-34 26h68c-2-15-15-26-34-26z"/>';
    } else if (variant === 3) {   // rounded, shoulders tucked in
      head = '<circle cx="50" cy="37" r="15.5"/>';
      body = '<path d="M50 57c-16 0-27 12-27 27h54c0-15-11-27-27-27z"/>';
    } else {                      // the plain default
      head = '<circle cx="50" cy="37" r="15"/>';
      body = '<path d="M50 57c-17 0-29 11-30 25h60c-1-14-13-25-30-25z"/>';
    }
    return '<g fill="' + ink + '">' + head + body + '</g>';
  }

  function clipFor(shape) {
    if (shape === 'square') return '<rect x="0" y="0" width="100" height="100"/>';
    if (shape === 'squircle') return '<rect x="0" y="0" width="100" height="100" rx="26" ry="26"/>';
    return '<circle cx="50" cy="50" r="50"/>';
  }

  function svg(seed, opts) {
    opts = opts || {};
    var size = opts.size || 128;
    var c = colorFor(seed, opts.color);
    var h = hash(seed);
    var shape = opts.shape || 'circle';
    var id = 'a' + (h % 100000);
    var inner;

    if (opts.initials) {
      var text = typeof opts.initials === 'string' ? opts.initials : initialsFrom(seed);
      inner = text
        ? '<text x="50" y="50" fill="' + c.ink + '" font-family="Archivo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"' +
          ' font-size="38" font-weight="700" text-anchor="middle" dominant-baseline="central">' + esc(text) + '</text>'
        : figure(h % 4, c.ink);
    } else {
      inner = figure(h % 4, c.ink);
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" role="img">' +
      '<defs><clipPath id="' + id + '">' + clipFor(shape) + '</clipPath></defs>' +
      '<g clip-path="url(#' + id + ')">' +
      '<rect x="0" y="0" width="100" height="100" fill="' + c.bg + '"/>' +
      inner +
      '</g>' +
      (opts.ring ? '<circle cx="50" cy="50" r="48.5" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3"/>' : '') +
      '</svg>';
  }

  function url(seed, opts) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(seed, opts));
  }

  function element(seed, opts) {
    opts = opts || {};
    var img = document.createElement('img');
    img.src = url(seed, opts);
    img.width = img.height = opts.size || 128;
    img.alt = opts.alt || (seed ? 'Profile picture for ' + seed : 'Default profile picture');
    img.decoding = 'async';
    return img;
  }

  global.FunsatAvatar = { colors: COLORS, url: url, svg: svg, element: element, initials: initialsFrom, colorFor: colorFor };
})(typeof window !== 'undefined' ? window : globalThis);
