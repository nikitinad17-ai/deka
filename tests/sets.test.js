'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const S = require('../src/set-core.js');

test('VK video links of every common shape resolve to one canonical set URL', () => {
  const want = { kind: 'video', id: '-123_456', url: 'https://vkvideo.ru/video-123_456' };
  for (const link of [
    'https://vkvideo.ru/video-123_456',
    'vkvideo.ru/video-123_456?list=abc',
    'https://vk.ru/video-123_456',
    'https://m.vk.com/video-123_456',
    'https://vk.com/videos-1?z=video-123_456%2Fpl_-1_-2',
    'https://vk.com/wall-1_2?z=video-123_456'
  ]) assert.deepEqual(S.parseLink(link), want, link);
  assert.equal(S.parseLink('https://vkvideo.ru/clip-5_7').url, 'https://vkvideo.ru/clip-5_7');
  assert.equal(S.parseLink('https://vkvideo.ru/video123_4').id, '123_4');
});

test('foreign hosts and non-video VK pages are rejected', () => {
  for (const bad of ['', 'https://evil.ru/video-1_2', 'https://vk.ru.evil.com/video-1_2', 'https://vk.ru/audio-1_2',
    'javascript:alert(1)', 'https://vk.ru/video-1_2x', 'https://notvk.ru/video-1_2']) assert.equal(S.parseLink(bad), null, bad);
});

test('timestamps at line start, numbered, bracketed and with separators', () => {
  const text = [
    'Сет записан на крыше. Начало в 21:00 МСК',
    '',
    '1. 00:00 Intro',
    '02) [03:15] Artist One – Track Two',
    '07:42 - Artist Two — Track Three',
    '(12:05) Artist Three | Track Four',
    '1:02:03 ID - ID'
  ].join('\n');
  assert.deepEqual(S.parseTracklist(text), [
    { time: 0, title: 'Intro' },
    { time: 195, title: 'Artist One – Track Two' },
    { time: 462, title: 'Artist Two — Track Three' },
    { time: 725, title: 'Artist Three | Track Four' },
    { time: 3723, title: 'ID - ID' }
  ]);
});

test('timestamps at line end are understood', () => {
  const list = S.parseTracklist('Artist A - One 0:00\nArtist B - Two (4:30)\nArtist C - Three [9:10]');
  assert.deepEqual(list.map(t => [t.time, t.title]), [[0, 'Artist A - One'], [270, 'Artist B - Two'], [550, 'Artist C - Three']]);
});

test('stray times outside the increasing order are dropped, too short lists are rejected', () => {
  const list = S.parseTracklist('00:00 a\n05:00 b\nСтрим в 21:00\n10:00 c\n15:00 d');
  assert.deepEqual(list.map(t => t.time), [0, 300, 600, 900]);
  assert.deepEqual(S.parseTracklist('00:00 a\n05:00 b'), []);
  assert.deepEqual(S.parseTracklist('просто текст без времени\nещё строка'), []);
  assert.deepEqual(S.parseTracklist('00:00 a\n01:75 bad\n02:00 b\n03:00 c').map(t => t.time), [0, 120, 180]);
});

test('timestamps past the known duration are ignored; empty titles get numbers', () => {
  assert.deepEqual(S.parseTracklist('00:00\n01:00 x\n02:00 y\n59:00 z', 600).map(t => [t.time, t.title]),
    [[0, 'Трек 1'], [60, 'x'], [120, 'y']]);
});

test('current track of a set and stepping between tracks', () => {
  const tracks = [{ time: 0 }, { time: 100 }, { time: 250 }];
  assert.equal(S.chapterAt(tracks, 0), 0);
  assert.equal(S.chapterAt(tracks, 99), 0);
  assert.equal(S.chapterAt(tracks, 100), 1);
  assert.equal(S.chapterAt(tracks, 9999), 2);
  assert.equal(S.chapterAt([{ time: 10 }], 5), -1);
  assert.equal(S.stepTime(tracks, 120, 1), 250);
  assert.equal(S.stepTime(tracks, 260, 1), null);
  assert.equal(S.stepTime(tracks, 120, -1), 100, 'back restarts the current track');
  assert.equal(S.stepTime(tracks, 101, -1), 0, 'back at the start goes to the previous track');
  assert.equal(S.stepTime([], 50, 1), null);
});

test('resume only from a meaningful point, not from the very start or the end', () => {
  assert.equal(S.resumePoint(10, 3600), 0);
  assert.equal(S.resumePoint(4460.7, 7200), 4460);
  assert.equal(S.resumePoint(7190, 7200), 0);
  assert.equal(S.resumePoint(500, 0), 500, 'unknown duration still resumes');
  assert.equal(S.resumePoint(NaN, 100), 0);
});

test('positions persist, survive corrupt data and keep only the newest sets', () => {
  const m = new Map(), storage = { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) };
  let clock = 0;
  const p = S.positions(storage, () => ++clock);
  assert.equal(p.get('-1_1'), null);
  p.set('-1_1', 4460.9, 7200, 'Rooftop');
  assert.deepEqual(p.get('-1_1'), { t: 4460, d: 7200, title: 'Rooftop', at: 1 });
  p.set('-1_1', 4500, NaN);
  assert.equal(p.get('-1_1').d, 7200, 'unknown duration keeps the old one');
  assert.equal(p.get('-1_1').title, 'Rooftop');
  p.clear('-1_1'); assert.equal(p.get('-1_1'), null);
  m.set('deka:setpos', '{broken'); assert.equal(p.get('x'), null); assert.equal(p.set('x', 40, 100), true);
  for (let i = 0; i < S.MAX_POSITIONS + 5; i++) p.set('id' + i, 100, 1000);
  const ids = Object.keys(p.all());
  assert.equal(ids.length, S.MAX_POSITIONS);
  assert.ok(ids.includes('id' + (S.MAX_POSITIONS + 4)) && !ids.includes('id0'), 'oldest positions are evicted first');
  const full = S.positions({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
  assert.equal(full.set('a', 50, 100), false, 'full storage reports failure instead of throwing');
});

test('time formatting for long sets', () => {
  assert.equal(S.fmt(0), '0:00');
  assert.equal(S.fmt(75), '1:15');
  assert.equal(S.fmt(4460), '1:14:20');
  assert.equal(S.fmt(-5), '0:00');
});
