/* Student-produced response ("grid-in") answers: what a student may type, and when it counts as right.
 *
 * Follows the Digital SAT's rules: a whole number, a decimal, or a fraction like 3/4; at most 5 characters (6 with a minus
 * sign); no mixed numbers ("3 1/2" would be read as 31/2), no commas, no percent signs. Equivalent forms all count: for an
 * answer of 3/4, "3/4", ".75" and "0.75" are all right. When the true answer does not terminate (2/3), a decimal counts only
 * if it carries at least three decimal places and is within 0.001 (".666", ".667", ".6667"); ".67" does not.
 *
 * Pure functions, no DOM. Works in the browser (window.FunSATGridIn) and in Node (tests, the question verifier).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FunSATGridIn = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_POSITIVE = 5, MAX_NEGATIVE = 6;

  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; };

  /** Clean what was typed: trim, and turn the typographic minus signs into "-". */
  function normalize(text) {
    return String(text == null ? "" : text).trim().replace(/[−–—]/g, "-");
  }

  /** Read what was typed. Returns { ok, value, kind, text, error } with kind "integer" | "decimal" | "fraction". */
  function parse(text) {
    const t = normalize(text);
    const fail = (error) => ({ ok: false, text: t, error });
    if (!t) return fail("Type your answer.");
    if (/\s/.test(t)) return fail("No spaces. Mixed numbers are not accepted: write 7/2 or 3.5, not 3 1/2.");
    if (/[,%$]/.test(t)) return fail("Use digits only: no commas, percent signs or dollar signs.");
    if (!/^-?[0-9./]+$/.test(t)) return fail("Use digits, a decimal point, a minus sign or a fraction like 3/4.");
    const negative = t[0] === "-";
    if (t.length > (negative ? MAX_NEGATIVE : MAX_POSITIVE)) return fail("Too long: at most " + MAX_POSITIVE + " characters (" + MAX_NEGATIVE + " with a minus sign).");
    const body = negative ? t.slice(1) : t;
    let m;
    if ((m = /^(\d+)\/(\d+)$/.exec(body))) {
      const num = Number(m[1]), den = Number(m[2]);
      if (den === 0) return fail("A fraction cannot have 0 on the bottom.");
      return { ok: true, value: (negative ? -1 : 1) * num / den, kind: "fraction", num: (negative ? -1 : 1) * num, den, text: t };
    }
    if (/^\d+$/.test(body)) return { ok: true, value: (negative ? -1 : 1) * Number(body), kind: "integer", text: t };
    if ((m = /^(\d*)\.(\d*)$/.exec(body)) && (m[1] || m[2])) {
      return { ok: true, value: (negative ? -1 : 1) * Number((m[1] || "0") + "." + (m[2] || "0")), kind: "decimal", decimals: m[2].length, text: t };
    }
    return fail("That is not a number the grid can take. Try a whole number, a decimal like 0.75, or a fraction like 3/4.");
  }

  const valid = (text) => parse(text).ok;

  /** Does the exact value num/den have a terminating decimal expansion? (only 2s and 5s in the reduced denominator) */
  function terminates(num, den) {
    let d = den / gcd(num, den);
    while (d % 2 === 0) d /= 2;
    while (d % 5 === 0) d /= 5;
    return d === 1;
  }

  /** The true answer as an exact value: { value, terminating }. Accepts the stored forms "20", "-1.5", "3/10". */
  function target(answer) {
    const p = parse(answer);
    if (!p.ok) {
      // A stored answer may be longer than the grid allows (a long decimal); read it without the length rule.
      const t = normalize(answer);
      if (/^-?\d*\.\d+$/.test(t) || /^-?\d+$/.test(t)) return { value: Number(t), terminating: true };
      return null;
    }
    if (p.kind === "fraction") return { value: p.value, terminating: terminates(p.num, p.den) };
    return { value: p.value, terminating: true };
  }

  /** Is the typed text a correct answer to question q? q.answer is the stored answer; q.accept lists extra accepted forms. */
  function matches(q, text) {
    const got = parse(text);
    if (!got.ok) return false;
    const forms = [q.answer].concat(Array.isArray(q.accept) ? q.accept : []);
    for (const form of forms) {
      const want = target(form);
      if (!want) continue;
      if (want.terminating) {
        if (Math.abs(got.value - want.value) < 1e-9) return true;
      } else if (got.kind === "fraction" || got.kind === "integer") {
        if (Math.abs(got.value - want.value) < 1e-9) return true;               // an equal fraction, e.g. 4/6 for 2/3
      } else if (got.decimals >= 3 && Math.abs(got.value - want.value) < 0.001) return true;   // rounded or truncated to fit the grid
    }
    return false;
  }

  /** A readable form of a typed answer for feedback: fractions stay fractions, a minus sign is a real minus. */
  function display(text) {
    const t = normalize(text);
    return t.replace(/^-/, "−");
  }

  return { normalize, parse, valid, matches, display, terminates, target, MAX_POSITIVE, MAX_NEGATIVE };
});
