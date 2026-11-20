/* Reads the text of a College Board (SAT) or ACT score report and returns the numbers it can find.
   Everything runs in the visitor's browser: the PDF is never uploaded, stored, or sent to the AI.
   The parser is deliberately strict. It returns only values that pass range and consistency checks,
   and the Plan screen always shows what it read in an editable form before anything is saved. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FunSATReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SAT_DOMAINS = {
    rw: ["Information & Ideas", "Craft & Structure", "Expression of Ideas", "Standard English Conventions"],
    math: ["Algebra", "Advanced Math", "Problem-Solving & Data Analysis", "Geometry & Trigonometry"],
  };
  // The report names these with "and"; the question bank uses "&".
  const DOMAIN_PATTERNS = [
    ["Information & Ideas", /Information\s*(?:and|&)\s*Ideas/gi],
    ["Craft & Structure", /Craft\s*(?:and|&)\s*Structure/gi],
    ["Expression of Ideas", /Expression\s+of\s+Ideas/gi],
    ["Standard English Conventions", /Standard\s+English\s+Conventions/gi],
    ["Advanced Math", /Advanced\s+Math/gi],
    ["Problem-Solving & Data Analysis", /Problem[\s-]*Solving\s*(?:and|&)\s*Data\s+Analysis/gi],
    ["Geometry & Trigonometry", /Geometry\s*(?:and|&)\s*Trigonometry/gi],
    ["Algebra", /\bAlgebra\b/gi],
  ];
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

  const pad = (n) => String(n).padStart(2, "0");
  const validYear = (y) => y >= 2005 && y <= new Date().getFullYear() + 1;
  function iso(y, m, d) {
    if (!validYear(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
    return y + "-" + pad(m) + "-" + pad(d);
  }

  function parseDate(text) {
    const t = String(text || "");
    const patterns = [
      // March 8, 2025 | Mar 8 2025
      { re: /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi, f: (m) => iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]) },
      // 3/8/2025
      { re: /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g, f: (m) => iso(+m[3], +m[1], +m[2]) },
      // 2025-03-08
      { re: /\b(20\d{2})-(\d{2})-(\d{2})\b/g, f: (m) => iso(+m[1], +m[2], +m[3]) },
      // March 2025 (no day)
      { re: /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s+(20\d{2})\b/gi, f: (m) => iso(+m[2], MONTHS[m[1].slice(0, 3).toLowerCase()], 1) },
    ];
    const scan = (s) => {
      for (const p of patterns) { p.re.lastIndex = 0; let m; while ((m = p.re.exec(s))) { const v = p.f(m); if (v) return v; } }
      return null;
    };
    // A date written next to "Test Date" is the one we want; otherwise the first valid date in the document.
    const label = /(?:test\s*date|date\s*(?:of\s*test|taken)|administered|tested\s*on)\s*[:\-]?\s*/i.exec(t);
    if (label) { const near = scan(t.slice(label.index, label.index + label[0].length + 40)); if (near) return near; }
    return scan(t);
  }

  // The first number in [min, max] (a multiple of `step`) within `window` characters after (or before) a label match.
  function numbersNear(text, labelRe, { min, max, step = 1, window = 70, before = 0 }) {
    const out = [];
    const re = new RegExp(labelRe.source, labelRe.flags.includes("g") ? labelRe.flags : labelRe.flags + "g");
    let m;
    while ((m = re.exec(text))) {
      const from = m.index + m[0].length;
      const after = text.slice(from, from + window);
      const fwd = [...after.matchAll(/(?<![\d.,])(\d{1,4})(?![\d.,]*\d)(?!\s*%)/g)].map((x) => +x[1]);
      const back = before ? [...text.slice(Math.max(0, m.index - before), m.index).matchAll(/(?<![\d.,])(\d{1,4})(?![\d.,]*\d)/g)].map((x) => +x[1]).reverse() : [];
      [...fwd, ...back].forEach((n) => { if (n >= min && n <= max && n % step === 0) out.push(n); });
    }
    return out;
  }

  function detectKind(t) {
    const act = (t.match(/\bACT\b/g) || []).length + 2 * (/Composite/i.test(t) ? 1 : 0) + (/Science/i.test(t) ? 1 : 0);
    const sat = (t.match(/\bSAT\b/g) || []).length + 2 * (/Reading\s*(?:and|&)\s*Writing/i.test(t) ? 1 : 0) + 2 * (/College\s*Board/i.test(t) ? 1 : 0);
    if (!act && !sat) return null;
    return sat >= act ? "sat" : "act";
  }

  function parseSat(t, result) {
    const totals = numbersNear(t, /(?:Total|Your)\s*(?:SAT\s*)?Score/gi, { min: 400, max: 1600, step: 10, window: 90, before: 40 });
    const rw = numbersNear(t, /Reading\s*(?:and|&)\s*Writing(?!\s*Score\s*Range)/gi, { min: 200, max: 800, step: 10, window: 60 });
    const math = numbersNear(t, /(?<!Advanced\s)\bMath(?:ematics)?\b/gi, { min: 200, max: 800, step: 10, window: 50 });
    let total = totals[0] || null, rwScore = rw[0] || null, mathScore = math[0] || null;
    // Prefer the combination that adds up: the three numbers on a report agree with each other.
    outer: for (const T of totals.length ? totals : [null]) {
      for (const R of rw) for (const M of math) if (T == null ? false : R + M === T) { total = T; rwScore = R; mathScore = M; break outer; }
    }
    if (total == null && rwScore != null && mathScore != null) { total = rwScore + mathScore; result.warnings.push("Total score was added up from the two section scores."); }
    if (total != null && rwScore != null && mathScore == null && total - rwScore >= 200 && total - rwScore <= 800) mathScore = total - rwScore;
    if (total != null && mathScore != null && rwScore == null && total - mathScore >= 200 && total - mathScore <= 800) rwScore = total - mathScore;
    if (total != null && rwScore != null && mathScore != null && rwScore + mathScore !== total) {
      result.warnings.push("The section scores do not add up to the total. Check them against your report.");
    }
    result.total = total;
    result.sections = { rw: rwScore, math: mathScore };

    // Domain bands: only an explicit "N of 7" / "N/7" / "Level N" next to a domain name counts.
    const hits = [];
    DOMAIN_PATTERNS.forEach(([name, re]) => { re.lastIndex = 0; let m; while ((m = re.exec(t))) hits.push({ name, start: m.index, end: m.index + m[0].length }); });
    hits.sort((a, b) => a.start - b.start);
    const domains = {};
    hits.forEach((h, i) => {
      const next = hits[i + 1] ? hits[i + 1].start : t.length;
      const seg = t.slice(h.end, Math.min(next, h.end + 140));
      const m = /\b([1-7])\s*(?:\/|of|out\s+of)\s*7\b/i.exec(seg) || /\b(?:level|band|performance)\s*:?\s*([1-7])\b/i.exec(seg);
      if (m && domains[h.name] == null) domains[h.name] = +m[1];
    });
    result.domains = domains;

    const pct = numbersNear(t, /(?:SAT\s*)?(?:Total\s*)?Percentile[s]?/gi, { min: 1, max: 99, window: 60, before: 30 });
    if (pct.length) result.percentile = pct[0];
  }

  function parseAct(t, result) {
    const one = (re) => { const v = numbersNear(t, re, { min: 1, max: 36, window: 30 }); return v.length ? v[0] : null; };
    result.total = one(/Composite(?:\s*Score)?/gi);
    result.sections = {
      english: one(/\bEnglish\b/gi),
      math: one(/(?<!Advanced\s)\bMath(?:ematics)?\b/gi),
      reading: one(/\bReading\b/gi),
      science: one(/\bScience\b/gi),
    };
    result.domains = {};
    if (result.total == null) {
      const core = ["english", "math", "reading"].map((k) => result.sections[k]);
      if (core.every((v) => v != null)) { result.total = Math.round(core.reduce((a, b) => a + b, 0) / 3); result.warnings.push("Composite was averaged from English, Math and Reading."); }
    }
  }

  /** text -> { kind, date, total, sections, domains, percentile?, warnings } (null fields when not found) */
  function parseReportText(text) {
    const t = String(text || "").replace(/[   ]/g, " ").replace(/[ \t]+/g, " ");
    const result = { kind: detectKind(t), date: parseDate(t), total: null, sections: {}, domains: {}, warnings: [] };
    if (result.kind === "act") parseAct(t, result); else if (result.kind === "sat") parseSat(t, result);
    result.found = !!(result.total != null || Object.values(result.sections).some((v) => v != null));
    return result;
  }

  // ---- PDF text, via the vendored pdf.js, loaded only when a file is chosen ----
  let pdfModule = null;
  async function loadPdfjs() {
    if (pdfModule) return pdfModule;
    const base = (typeof document !== "undefined" && document.baseURI) || location.href;
    pdfModule = await import(new URL("vendor/pdfjs/pdf.min.mjs", base).href);
    pdfModule.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", base).href;
    return pdfModule;
  }
  const MAX_BYTES = 15 * 1024 * 1024, MAX_PAGES = 12;

  async function extractPdfText(file) {
    if (!file) throw Object.assign(new Error("No file"), { code: "no_file" });
    if (file.size > MAX_BYTES) throw Object.assign(new Error("That file is larger than 15 MB."), { code: "too_big" });
    const buf = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...buf.slice(0, 5)) !== "%PDF-") throw Object.assign(new Error("That does not look like a PDF."), { code: "not_pdf" });
    const pdfjs = await loadPdfjs();
    let doc;
    try { doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false, enableXfa: false, disableFontFace: true }).promise; }
    catch (e) {
      if (e && e.name === "PasswordException") throw Object.assign(new Error("That PDF is password-protected."), { code: "locked" });
      throw Object.assign(new Error("That PDF could not be read."), { code: "unreadable" });
    }
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const rows = [];
      content.items.forEach((it) => {
        if (!it.str || !it.str.trim()) return;
        const y = Math.round(it.transform[5] / 3), x = it.transform[4];
        let row = rows.find((r) => r.y === y);
        if (!row) rows.push((row = { y, parts: [] }));
        row.parts.push({ x, s: it.str });
      });
      rows.sort((a, b) => b.y - a.y);
      pages.push(rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ")).join("\n"));
    }
    try { doc.destroy(); } catch (e) { /* ignore */ }
    return pages.join("\n\n");
  }

  async function parseReportFile(file) {
    const text = await extractPdfText(file);
    if (!text.trim()) throw Object.assign(new Error("That PDF has no readable text (it may be a scan)."), { code: "no_text" });
    return parseReportText(text);
  }

  return { parseReportText, parseReportFile, extractPdfText, SAT_DOMAINS, parseDate };
});
