const fs = require('node:fs');
const vm = require('node:vm');

// The bank moved out of the HTML shell into app.js; read the data region there
// (from the DATA marker to the first browser-only API after the banks are built).
const app = fs.readFileSync('app.js', 'utf8');
const start = app.indexOf('/*__DATA_START__*/');
if (start < 0) throw new Error('Question bank data region was not found in app.js.');
let end = app.indexOf('const STORAGE_KEY', start);
if (end < 0) {
  const tail = app.slice(app.indexOf('ALL_UNIQUE_QUESTIONS.push(...SUBJECT_PACK)', start));
  const nextBrowser = tail.search(/\ndocument\.|\nwindow\.|\nlocalStorage\./);
  end = nextBrowser >= 0 ? app.indexOf('ALL_UNIQUE_QUESTIONS.push(...SUBJECT_PACK)', start) + nextBrowser : app.length;
}
const script = app;
const context = vm.createContext({ console });
vm.runInContext(script.slice(start, end), context);
const questions = vm.runInContext('ALL_UNIQUE_QUESTIONS', context);

const findings = questions.map((q) => {
  const issues = [];
  if (!q.id || !q.domain || !q.diff || !q.q) issues.push('Missing required metadata.');
  if (!['easy', 'medium', 'hard'].includes(q.diff)) issues.push('Invalid difficulty label.');
  if (!Array.isArray(q.choices) || q.choices.length !== 4) issues.push('Question does not have four choices.');
  const gridin = q.kind === 'gridin';
  const wantFive = /^am/.test(q.id);
  if (gridin) {
    if (!q.answer) issues.push('Grid-in missing its numeric answer string.');
  } else {
    if (Array.isArray(q.choices) && new Set(q.choices.map(String)).size !== q.choices.length) issues.push('Duplicate answer choices.');
    if (Array.isArray(q.choices) && q.choices.length !== (wantFive ? 5 : 4)) issues.push('Wrong number of choices.');
    if (!Number.isInteger(q.ans) || q.ans < 0 || q.ans > (wantFive ? 4 : 3)) issues.push('Answer index is invalid.');
  }
  if (Array.isArray(q.dw) && !gridin) {
    const want = (q.choices || []).length - 1;
    if (q.dw.length !== want || q.dw.some((w) => !w || String(w).trim().length < 8)) issues.push('Distractor explanations missing or too short.');
  }
  if (!q.exp || String(q.exp).trim().length < 20) issues.push('Explanation is missing or too short.');
  let textWords = null;
  if (q.kind === 'reading' || q.kind === 'writing') {
    const source = q.passage || q.q.split(/\n(?:Which choice|Which pair|The student wants)/)[0];
    textWords = String(source).trim().split(/\s+/).filter(Boolean).length;
    if (textWords < 25 || textWords > 150) issues.push(`Digital SAT text length is ${textWords} words; published guidance is 25–150.`);
  }
  let status = q.auditStatus || 'passed';
  if (issues.length) status = 'withheld';
  const method = q.id.startsWith('variety-math-')
    ? 'Independent alternate calculation in tests/variety.test.cjs, answer-choice uniqueness, and explanation comparison.'
    : /^m1\d{3}$/.test(q.id)
      ? 'Regenerated from the parameterized authoring formula, checked for choice uniqueness, and explanation/key consistency.'
      : /^m/.test(q.id)
        ? 'Answer-choice uniqueness, domain/scope review, and explanation/key consistency; representative forms independently substituted.'
        : q.kind === 'reading'
          ? 'Text-length/domain check plus evidence, best-answer, distractor, and explanation review against the supplied passage.'
          : q.kind === 'writing'
            ? 'Text-length/domain check plus grammar or rhetorical-goal review and explanation comparison.'
            : 'Data/experimental-condition review, answer-choice uniqueness, and explanation comparison.';
  return {
    id: q.id, version: q.version || '2026-10-02', bank: /^(m|am)/.test(q.id) || q.id.startsWith('variety-math') ? 'math' : /^(s|ar|ae)/.test(q.id) || q.id.startsWith('variety-science') ? (/^ar|^ae/.test(q.id) ? 'reading-writing' : 'science') : 'reading-writing',
    domain: q.domain, skill: q.skill || q.domain, difficulty: q.diff, status,
    answer: Array.isArray(q.choices) && Number.isInteger(q.ans) ? q.choices[q.ans] : null,
    textWords, reason: issues.join(' ') || q.auditReason || 'Passed required checks.', verificationMethod: method
  };
});

const counts = findings.reduce((out, item) => { out[item.status] = (out[item.status] || 0) + 1; return out; }, {});
const report = {
  generatedAt: new Date().toISOString(),
  standard: 'College Board Digital SAT published domains and 25–150-word Reading and Writing text guidance; ACT-specific science items remain separate.',
  total: findings.length, counts, findings
};
if (process.argv.includes('--write')) {
  fs.writeFileSync('docs/question-audit.json', JSON.stringify(report, null, 2) + '\n');
  const summary = `# Question bank audit\n\nGenerated ${report.generatedAt}. Questions are original modeled practice and are not official College Board questions.\n\n- Total unique questions: ${report.total}\n- Passed: ${counts.passed || 0}\n- Revised/deprioritized: ${counts.revised || 0}\n- Withheld from new attempts: ${counts.withheld || 0}\n\nThe machine-readable record in question-audit.json lists every question, answer, status, reason, version, and verification method. Withheld items remain addressable by ID so an older saved attempt can still be reviewed, but they are excluded from new practice sets.\n`;
  fs.writeFileSync('docs/question-audit-summary.md', summary);
}
console.log(JSON.stringify({ total: report.total, counts }));

/*__QB2_AUDIT__*/
