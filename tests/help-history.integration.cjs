const assert = require('node:assert/strict');

(async () => {
  const base = 'http://localhost:8787/api/';
  async function call(path, method = 'GET', body, token) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const json = await response.json();
    assert(response.ok, JSON.stringify(json));
    return json;
  }
  const stamp = Date.now();
  const first = await call('signup', 'POST', { email: `help-a-${stamp}@example.com`, password: 'Local-test-9281' });
  const second = await call('signup', 'POST', { email: `help-b-${stamp}@example.com`, password: 'Local-test-9281' });
  const entry = { id: 'help_test_' + stamp, createdAt: stamp, questionId: 'variety-math-1', questionVersion: '2026-10-02', questionSnapshot: '{"question":"test"}', testType: 'sat', section: 'math', domain: 'Algebra', skill: 'Linear equations', attemptId: 'isolated-test', category: 'hint', requestText: 'Give me a hint.', responseText: 'Start by distributing.', provider: 'groq', model: 'test-model', status: 'complete', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
  await call('help-history', 'POST', entry, first.token);
  await call('help-history', 'POST', { ...entry, responseText: 'Start by distributing both sides.' }, first.token);
  let history = await call('help-history', 'GET', null, first.token);
  assert.equal(history.items.length, 1, 'idempotent saves should not duplicate entries');
  assert.equal(history.items[0].responseText, 'Start by distributing both sides.');
  assert.equal(history.items[0].usage.totalTokens, 15);
  const other = await call('help-history', 'GET', null, second.token);
  assert.equal(other.items.length, 0, 'another account must not see the entry');
  const foreignDelete = await call('help-history/' + encodeURIComponent(entry.id), 'DELETE', null, second.token);
  assert.equal(foreignDelete.deleted, 0, 'another account must not delete the entry');
  assert.equal((await call('help-history', 'GET', null, first.token)).items.length, 1);
  const ownDelete = await call('help-history/' + encodeURIComponent(entry.id), 'DELETE', null, first.token);
  assert.equal(ownDelete.deleted, 1);
  assert.equal((await call('help-history', 'GET', null, first.token)).items.length, 0);
  console.log('PASS: Groq help history persists, deduplicates, records usage, enforces account ownership, and deletes per entry.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
