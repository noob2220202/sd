import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPots, totalOfPots } from '../server/game/pots.js';

test('균등 기여 → 메인팟 하나', () => {
  const pots = buildPots({ a: 100, b: 100, c: 100 });
  assert.deepEqual(pots, [{ amount: 300, eligible: ['a', 'b', 'c'] }]);
});

test('숏 올인 → 사이드팟 분리', () => {
  const pots = buildPots({ a: 300, b: 300, c: 100 });
  assert.equal(pots.length, 2);
  assert.deepEqual(pots[0], { amount: 300, eligible: ['a', 'b', 'c'] });
  assert.deepEqual(pots[1], { amount: 400, eligible: ['a', 'b'] });
  assert.equal(totalOfPots(pots), 700);
});

test('다이한 플레이어 기여는 팟에 포함되되 자격 없음', () => {
  const pots = buildPots({ a: 300, b: 300, c: 100 }, new Set(['c']));
  assert.deepEqual(pots, [{ amount: 700, eligible: ['a', 'b'] }]);
});

test('콜되지 않은 초과 베팅은 본인만 자격인 팟으로 돌아간다', () => {
  const pots = buildPots({ a: 500, b: 200, c: 150 });
  assert.deepEqual(pots, [
    { amount: 450, eligible: ['a', 'b', 'c'] },
    { amount: 100, eligible: ['a', 'b'] },
    { amount: 300, eligible: ['a'] },
  ]);
});

test('이월금은 메인팟에 합산', () => {
  const pots = buildPots({ a: 100, b: 100 }, new Set(), 5000);
  assert.deepEqual(pots, [{ amount: 5200, eligible: ['a', 'b'] }]);
});

test('다이한 사람이 가장 많이 냈어도 유자격 팟으로 흡수', () => {
  const pots = buildPots({ a: 400, b: 200, c: 200 }, new Set(['a']));
  assert.deepEqual(pots, [{ amount: 800, eligible: ['b', 'c'] }]);
});

test('세 단계 올인', () => {
  const pots = buildPots({ a: 50, b: 120, c: 300, d: 300 }, new Set());
  assert.deepEqual(pots, [
    { amount: 200, eligible: ['a', 'b', 'c', 'd'] },
    { amount: 210, eligible: ['b', 'c', 'd'] },
    { amount: 360, eligible: ['c', 'd'] },
  ]);
  assert.equal(totalOfPots(pots), 770);
});

test('Map 입력도 지원', () => {
  const pots = buildPots(new Map([['a', 10], ['b', 10]]));
  assert.equal(totalOfPots(pots), 20);
});
