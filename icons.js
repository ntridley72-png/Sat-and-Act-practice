/* The icon set: one family for the interface, drawn to match the Bluebook-style look.
 * 24px grid, 2px round-capped strokes, no fills, colour from the surrounding text (currentColor), so an icon always matches
 * its button in light and dark. FunSATIcons.html("pause") returns inline SVG markup; the .ic class in workspace.css sizes it
 * to the text it sits in. Used wherever an emoji used to stand in for an icon (the arcade cabinet keeps its own pixel style). */
(function (root) {
  "use strict";
  const P = {
    pause: '<path d="M9 5v14M15 5v14" stroke-width="3"/>',
    play: '<path d="M8 5.5l11 6.5-11 6.5z"/>',
    volume: '<path d="M4 9.5v5h3.5L12.5 19V5L7.5 9.5z"/><path d="M16 9a4.2 4.2 0 010 6M18.6 6.4a8 8 0 010 11.2"/>',
    mute: '<path d="M4 9.5v5h3.5L12.5 19V5L7.5 9.5z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    "check-circle": '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    "x-circle": '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    "calc-circle": '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8" stroke-width="1.8"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 114.1 2c-.9.7-1.7 1.2-1.7 2.4M12 16.8h.01"/>',
    bulb: '<path d="M9.5 18.5h5M10.5 21h3"/><path d="M12 3a6 6 0 00-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0012 3z"/>',
    book: '<path d="M4 6a2 2 0 012-2h5v15H6a2 2 0 00-2 2z"/><path d="M20 6a2 2 0 00-2-2h-5v15h5a2 2 0 012 2z"/>',
    gamepad: '<path d="M7.5 7.5h9A4.5 4.5 0 0121 12v2.2a2.8 2.8 0 01-4.9 1.9l-1.2-1.4H9.1l-1.2 1.4A2.8 2.8 0 013 14.2V12a4.5 4.5 0 014.5-4.5z"/><path d="M8 10.2v3M6.5 11.7h3"/><circle cx="15.2" cy="11" r=".7"/><circle cx="17.4" cy="12.6" r=".7"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M10 8v8M10 8h4.6M10 11.8h3.6"/>',
    flag: '<path d="M5 21V4M5 4.5h11.5l-2.3 3.8 2.3 3.8H5"/>',
    building: '<path d="M3 9.5L12 4l9 5.5M5.5 10v8M9.8 10v8M14.2 10v8M18.5 10v8M3 20.5h18"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-3.7 3.5-5.6 7-5.6s6.4 1.9 7 5.6"/>',
    calculator: '<rect x="5" y="3" width="14" height="18" rx="2.4"/><path d="M8.2 7.5h7.6M8.2 12h.01M12 12h.01M15.8 12h.01M8.2 16h.01M12 16h.01M15.8 16h.01" stroke-width="2.4"/>',
    chart: '<path d="M4 19.5h16M5 15.5l4-4.2 3 3 6.5-7.3"/>',
    flame: '<path d="M12 3c.7 3.6 5.3 5 5.3 10.2a5.3 5.3 0 01-10.6 0c0-2 1-3.4 2.3-4.3.2 1.4.9 2.2 2 2.4C10.4 8.4 10.6 5.6 12 3z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>',
    "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.6h.01"/>',
    star: '<path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4.5v1.5A3.5 3.5 0 008 11M16 6h3.5v1.5A3.5 3.5 0 0116 11M12 13v4M8.5 20.5h7M10 17h4"/>',
  };
  const names = Object.keys(P);
  function html(name, cls) {
    const body = P[name];
    if (!body) return "";
    return '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + "</svg>";
  }
  root.FunSATIcons = { html, names, has: (n) => Object.prototype.hasOwnProperty.call(P, n) };
  if (typeof module === "object" && module.exports) module.exports = root.FunSATIcons;
})(typeof self !== "undefined" ? self : this);
