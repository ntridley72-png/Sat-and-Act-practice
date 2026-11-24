/* Wait for the first question, then move to the first multiple-choice question of the module. A Digital SAT math
   module can open on a typed-answer (grid-in) question, which has no lettered choices; tests about choices need one. */
module.exports = async function toChoice(page, opts) {
  await page.waitForSelector("#questionCard .choice, #questionCard .gridin", opts);
  await page.evaluate(() => {
    const ids = currentQids();
    const i = ids.findIndex((id) => { const q = byId(id); return q && q.kind !== "gridin"; });
    if (i > 0 && state.qi < i) { state.qi = i; render(); }
  });
  await page.waitForSelector("#questionCard .choice", opts);
};
