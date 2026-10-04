'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const C = require('../src/library-engine.js');
const D = require('../src/deck-engine.js');
function track(i) { return { key: '42_' + i, title: 'Track ' + i, artist: 'Artist', duration: 180 }; }
function fixture(total, overrides = {}) {
  let top = 0, clock = 0, id = 'user42|playlist1', max = total;
  const a = {
    identity: () => id, total: () => total, measure: () => ({ top, height: 480, fullHeight: max * 48 }),
    scrollTo: y => { top = Math.max(0, Math.min(max * 48 - 480, y)); },
    read: () => Array.from({ length: Math.min(10, max - Math.floor(top / 48)) }, (_, j) => track(Math.floor(top / 48) + j)),
    busy: () => false, ...overrides
  };
  return { a, opts: { now: () => clock, sleep: async ms => { clock += ms; }, stepMs: 10, settleMs: 1, endMs: 100, stalledMs: 500, maxMs: 30000 },
    change: () => { id = 'other'; }, clock: () => clock };
}
test('all 1500 virtual rows are collected exactly once and in order', async () => {
  const f = fixture(1500), r = await C.createCollector(f.a, f.opts).run();
  assert.equal(r.complete, true); assert.equal(r.reason, 'count-matched');
  assert.equal(r.count, 1500); assert.deepEqual(r.items.map(t => t.key), Array.from({ length: 1500 }, (_, i) => '42_' + i));
});
test('same artist and title with distinct VK ids remain two tracks', () => {
  assert.equal(C.merge([], [track(1), { ...track(1), key: '42_2' }]).length, 2);
  assert.equal(C.merge([], [track(1), { ...track(1), key: '42_1#4' }]).length, 1);
});
test('unstable row indices fall back to metadata, not row number', () => {
  const a = { ...track(1), key: 'row0' }, b = { ...track(2), key: 'row0' };
  assert.equal(C.merge([], [a,b]).length, 2);
});
test('partial pass keeps saved tail, complete pass permits deletions', () => {
  const prior = Array.from({ length: 1000 }, (_, i) => track(i));
  assert.equal(C.saveResult(prior, { complete:false, items:prior.slice(0,30) }).length, 1000);
  assert.equal(C.saveResult(prior, { complete:true, reason:'end-observed', items:prior.slice(0,30) }).length, 1000);
  assert.equal(C.saveResult(prior, { complete:true, reason:'count-matched', items:prior.slice(0,30) }).length, 30);
});
test('count mismatch at the bottom is partial, not a successful full list', async () => {
  const f = fixture(40); f.a.total = () => 1000;
  const r = await C.createCollector(f.a, f.opts).run();
  assert.equal(r.complete, false); assert.equal(r.count, 40); assert.equal(r.reason, 'missing-tracks');
});
test('unknown total remains partial: bottom alone cannot prove completeness', async () => {
  const f = fixture(40); f.a.total = () => null;
  const r = await C.createCollector(f.a, f.opts).run();
  assert.equal(r.complete, false); assert.equal(r.reason, 'end-unverified'); assert.equal(r.count,40);
});
test('cancel returns a partial snapshot and does not fabricate success', async () => {
  const f = fixture(1000); let col;
  f.opts.onProgress = p => { if (p.count > 50) col.cancel(); };
  col = C.createCollector(f.a, f.opts); const r = await col.run();
  assert.equal(r.complete,false); assert.equal(r.reason,'cancelled'); assert.ok(r.count > 50 && r.count < 1000);
});
test('navigation cancels collection without scrolling new source', async () => {
  const f = fixture(1000); let movedAfter = false, changed = false;
  const scroll = f.a.scrollTo; f.a.scrollTo = v => { if(changed) movedAfter = true; scroll(v); };
  f.opts.onProgress = p => { if(p.count>50) { f.change(); changed = true; } };
  const r = await C.createCollector(f.a, f.opts).run();
  assert.equal(r.reason,'source-changed'); assert.equal(movedAfter,false);
});
test('crossfader is equal-power, endpoints isolate opposite deck', () => {
  assert.ok(D.weights(-1)[0] > .999); assert.ok(D.weights(-1)[1] < 1e-9);
  assert.ok(D.weights(1)[0] < 1e-9); assert.ok(D.weights(1)[1] > .999);
  for(let i=-10;i<=10;i++) { const [a,b] = D.weights(i/10); assert.ok(Math.abs(a*a+b*b-1) < 1e-9); }
});
test('malformed tracks are rejected, numeric values bounded', () => {
  assert.equal(C.clean(null), null); assert.equal(C.clean({title:''}),null);
  assert.equal(C.clean({...track(1),duration:-1}).duration,0);
  assert.equal(D.clamp(NaN,0,1),0);
});
