/* Typed ("grid-in") answers: what may be typed, and which typed forms count as right. Pure functions, no browser. */
const assert = require("node:assert/strict");
const G = require("../gridin.js");

// ---- what may be typed
for (const t of ["20", "-4", "0", "3/4", "-3/4", "0.75", ".75", "6.25", "-1.5", "12345", "-1234", ".6667", "5.", "100/7"]) assert.ok(G.valid(t), `"${t}" should be accepted as typed input`);
for (const [t, why] of [
  ["", /Type your answer/], ["   ", /Type your answer/],
  ["3 1/2", /No spaces.*mixed/i], ["1,200", /no commas/i], ["50%", /percent/i], ["$5", /dollar/i],
  ["abc", /digits/i], ["1/0", /0 on the bottom/], ["1.2.3", /not a number/], ["--5", /digits|not a number/], ["1/2/3", /not a number/], ["1.5/2", /not a number/], ["/", /not a number/], [".", /not a number/],
  ["123456", /Too long/], ["-12345.", /Too long/], ["0.6667", /Too long/],
]) { const p = G.parse(t); assert.equal(p.ok, false, `"${t}" should be refused`); assert.match(p.error, why, `"${t}": ${p.error}`); }
assert.ok(G.valid("-12345"), "6 characters are allowed with a minus sign");
assert.equal(G.parse("−3/4").value, -0.75, "a typographic minus sign is read as a minus");
assert.equal(G.parse("  42 ").value, 42, "surrounding spaces are ignored");

// ---- equivalent forms of a terminating answer all count, and nothing else does
const three4 = { answer: "3/4" };
for (const t of ["3/4", "6/8", "0.75", ".75", "0.750"]) assert.ok(G.matches(three4, t), `${t} is 3/4`);
for (const t of ["0.7", "0.76", "3/5", "75", "-3/4", ".7500001"]) assert.ok(!G.matches(three4, t), `${t} is not 3/4`);
assert.ok(G.matches({ answer: "20" }, "20") && G.matches({ answer: "20" }, "20.0") && G.matches({ answer: "20" }, "40/2"));
assert.ok(!G.matches({ answer: "20" }, "2") && !G.matches({ answer: "20" }, "-20"));
assert.ok(G.matches({ answer: "-1.5" }, "-3/2") && G.matches({ answer: "-1.5" }, "−1.5") && !G.matches({ answer: "-1.5" }, "1.5"));
assert.ok(G.matches({ answer: "6.25" }, "25/4") && G.matches({ answer: "6.25" }, "6.25"));
assert.ok(G.matches({ answer: "0.3" }, "3/10") && G.matches({ answer: "3/10" }, ".3"));

// ---- a non-terminating answer: an equal fraction, or a decimal with 3+ places within 0.001
const two3 = { answer: "2/3" };
for (const t of ["2/3", "4/6", ".666", ".667", ".6666", ".6667", "0.667"]) assert.ok(G.matches(two3, t), `${t} is accepted for 2/3`);
for (const t of [".67", ".66", "0.7", ".6", ".665", ".669", "1/3", "2/4"]) assert.ok(!G.matches(two3, t), `${t} is not accepted for 2/3`);
assert.ok(G.matches({ answer: "1/3" }, ".333") && G.matches({ answer: "1/3" }, ".3333") && !G.matches({ answer: "1/3" }, ".33"));
assert.ok(G.matches({ answer: "-1/3" }, "-.333") && !G.matches({ answer: "-1/3" }, ".333"));
assert.ok(G.matches({ answer: "5/6" }, ".833") && G.matches({ answer: "5/6" }, ".8333") && !G.matches({ answer: "5/6" }, ".83"));

// ---- terminating test
assert.ok(G.terminates(3, 4) && G.terminates(1, 8) && G.terminates(7, 10) && G.terminates(9, 3) && G.terminates(6, 8));
assert.ok(!G.terminates(2, 3) && !G.terminates(1, 7) && !G.terminates(5, 6) && !G.terminates(4, 12));

// ---- extra accepted forms
assert.ok(G.matches({ answer: "12", accept: ["12.0", "24/2"] }, "24/2"));
assert.ok(!G.matches({ answer: "12", accept: [] }, "13"));

// ---- garbage never matches
for (const t of ["", "x", "1/0", "3 1/2", "1,2"]) assert.ok(!G.matches({ answer: "3" }, t), `"${t}" must not match`);
assert.equal(G.matches({ answer: "not a number" }, "3"), false, "an unreadable stored answer matches nothing");

// ---- display
assert.equal(G.display("-3/4"), "−3/4");
assert.equal(G.display(" .75 "), ".75");

console.log("PASS: typed answers follow the SAT grid rules: length, no mixed numbers, equivalent forms count, rounded repeating decimals need 3 places.");
