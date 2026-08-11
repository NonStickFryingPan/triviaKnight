'use strict';

const { mergeDecks } = require('../js/sheetsSync.js');

let passed = 0;
let failed = 0;

function eq(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    passed++;
    console.log('ok - ' + name);
  } else {
    failed++;
    console.log('FAIL - ' + name);
    console.log('  got:  ' + g);
    console.log('  want: ' + w);
  }
}

function card(id, updatedAt) {
  return { id: id, updatedAt: updatedAt, front: id };
}

// 1. remote-newer wins
{
  const local = [card('a', '2026-01-02T00:00:00Z')];
  const remote = [card('a', '2026-01-03T00:00:00Z')];
  const res = mergeDecks(local, remote);
  eq('remote-newer wins', res, { writes: [card('a', '2026-01-03T00:00:00Z')], added: 0, updated: 1 });
}

// 2. local-newer kept (no write)
{
  const local = [card('a', '2026-01-03T00:00:00Z')];
  const remote = [card('a', '2026-01-02T00:00:00Z')];
  const res = mergeDecks(local, remote);
  eq('local-newer kept', res, { writes: [], added: 0, updated: 0 });
}

// 3. remote-only added
{
  const local = [];
  const remote = [card('b', '2026-01-01T00:00:00Z')];
  const res = mergeDecks(local, remote);
  eq('remote-only added', res, { writes: [card('b', '2026-01-01T00:00:00Z')], added: 1, updated: 0 });
}

// 4. tie keeps local
{
  const local = [card('a', '2026-01-01T00:00:00Z')];
  const remote = [card('a', '2026-01-01T00:00:00Z')];
  const res = mergeDecks(local, remote);
  eq('tie keeps local', res, { writes: [], added: 0, updated: 0 });
}

// 5. legacy card without updatedAt uses createdAt
{
  const local = [{ id: 'a', createdAt: '2026-01-02T00:00:00Z' }];
  const remote = [{ id: 'a', createdAt: '2026-01-03T00:00:00Z' }];
  const res = mergeDecks(local, remote);
  eq('legacy createdAt fallback', res, { writes: [{ id: 'a', createdAt: '2026-01-03T00:00:00Z' }], added: 0, updated: 1 });
}

// 6. disjoint ids union
{
  const local = [card('a', '2026-01-01T00:00:00Z')];
  const remote = [card('b', '2026-01-01T00:00:00Z')];
  const res = mergeDecks(local, remote);
  eq('disjoint ids union', res, { writes: [card('b', '2026-01-01T00:00:00Z')], added: 1, updated: 0 });
}

// 7. mixed: one updated, one added, one local-only
{
  const local = [card('a', '2026-01-01T00:00:00Z'), card('local', '2026-01-01T00:00:00Z')];
  const remote = [card('a', '2026-01-02T00:00:00Z'), card('b', '2026-01-03T00:00:00Z')];
  const res = mergeDecks(local, remote);
  eq('mixed merge', res, {
    writes: [card('a', '2026-01-02T00:00:00Z'), card('b', '2026-01-03T00:00:00Z')],
    added: 1, updated: 1
  });
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
