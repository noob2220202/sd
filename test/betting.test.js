import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BettingRound } from '../server/game/betting.js';

const P = (chips) => [
  { id: 'A', chips },
  { id: 'B', chips },
  { id: 'C', chips },
];
const kinds = (r, id) => r.legalActions(id).map((a) => a.kind);

test('첫 액션자(선) 옵션: 체크/삥/쿼터/하프/맥스/다이 (쿼터는 base 로 올림 → 삥과 중복 제거)', () => {
  const r = new BettingRound({ players: P(100_000), pot: 3_000, base: 1_000 });
  assert.equal(r.turnPlayerId, 'A');
  const list = r.legalActions('A').map((a) => `${a.kind}:${a.total}`);
  // 쿼터 = floor(3000/4)=750 → base 1000 으로 올림 = 삥과 같은 금액 → 중복 제거
  assert.deepEqual(list, ['check:0', 'bbing:1000', 'half:1500', 'max:3000', 'die:0']);
});

test('선이 체크하면 다음 사람은 체크 불가(삥 이상 베팅 또는 다이)', () => {
  const r = new BettingRound({ players: P(100_000), pot: 3_000, base: 1_000 });
  r.act('A', 'check');
  assert.deepEqual(kinds(r, 'B'), ['bbing', 'half', 'max', 'die']);
});

test('체크한 선은 이후 콜/다이만 가능 (리레이즈 불가)', () => {
  const r = new BettingRound({ players: P(100_000), pot: 3_000, base: 1_000 });
  r.act('A', 'check');
  r.act('B', 'bbing');
  r.act('C', 'half');
  assert.equal(r.turnPlayerId, 'A');
  assert.deepEqual(kinds(r, 'A'), ['call', 'die']);
});

test('콜한 플레이어는 같은 라운드에서 리레이즈 불가, 베팅/레이즈한 플레이어는 리레이즈 가능', () => {
  const r = new BettingRound({ players: P(100_000), pot: 3_000, base: 1_000 });
  r.act('A', 'bbing');
  r.act('B', 'half');
  r.act('C', 'call');
  // A 는 삥(베팅)했으므로 레이즈 가능
  assert.ok(kinds(r, 'A').includes('ddadang'));
  r.act('A', 'ddadang');
  // B 는 하프(레이즈)했으므로 다시 레이즈 가능
  assert.ok(kinds(r, 'B').includes('ddadang'));
  r.act('B', 'call');
  // C 는 콜만 했으므로 콜/다이만
  assert.deepEqual(kinds(r, 'C'), ['call', 'die']);
});

test('삥 → 콜/따당/쿼터/하프/맥스 금액', () => {
  const r = new BettingRound({ players: P(100_000), pot: 3_000, base: 1_000 });
  r.act('A', 'bbing');
  assert.equal(r.cur, 1_000);
  assert.equal(r.pot, 4_000);
  const m = Object.fromEntries(r.legalActions('B').map((a) => [a.kind, a]));
  assert.equal(m.call.total, 1_000);
  assert.equal(m.ddadang.total, 2_000); // 2 × 1000
  // 콜 포함 판돈 = 4000 + 1000(toCall) = 5000 → 쿼터 1250, 하프 2500, 맥스 5000
  assert.equal(m.quarter.total, 1_000 + 1_250);
  assert.equal(m.half.total, 1_000 + 2_500);
  assert.equal(m.max.total, 1_000 + 5_000);
  assert.equal(m.max.pay, 6_000);
  assert.ok(!('check' in m) && !('bbing' in m) && !('allin' in m));
});

test('allowAllIn 라운드에서는 올인 버튼이 추가되고, 맥스와 금액이 같으면 중복 제거', () => {
  const r = new BettingRound({ players: P(100_000), pot: 3_000, base: 1_000, allowAllIn: true });
  r.act('A', 'bbing');
  const m = Object.fromEntries(r.legalActions('B').map((a) => [a.kind, a]));
  assert.equal(m.allin.total, 100_000);
  assert.equal(m.allin.allIn, true);
  const r2 = new BettingRound({ players: [{ id: 'A', chips: 100_000 }, { id: 'B', chips: 6_000 }], pot: 3_000, base: 1_000, allowAllIn: true });
  r2.act('A', 'bbing');
  const k2 = kinds(r2, 'B');
  assert.ok(k2.includes('max') && !k2.includes('allin')); // 맥스 6000 = 올인 6000
});

test('선 체크 후 전원 다이하면 종료(선 승리)', () => {
  const r = new BettingRound({ players: P(10_000), pot: 300, base: 100 });
  r.act('A', 'check');
  r.act('B', 'die');
  const res = r.act('C', 'die');
  assert.equal(res.over, true);
  assert.equal(r.aliveCount(), 1);
  assert.equal(r.pot, 300);
});

test('레이즈 후 다른 플레이어는 다시 액션해야 한다', () => {
  const r = new BettingRound({ players: P(10_000), pot: 300, base: 100 });
  r.act('A', 'bbing'); // cur 100
  r.act('B', 'call');
  r.act('C', 'ddadang'); // cur 200
  assert.equal(r.over, false);
  assert.equal(r.turnPlayerId, 'A');
  r.act('A', 'call');
  assert.equal(r.turnPlayerId, 'B');
  const res = r.act('B', 'call');
  assert.equal(res.over, true);
  assert.deepEqual(r.players.map((p) => p.roundBet), [200, 200, 200]);
  assert.equal(r.pot, 900);
});

test('칩 부족 콜은 올인이며 cur 를 바꾸지 않는다', () => {
  const r = new BettingRound({ players: [{ id: 'A', chips: 10_000 }, { id: 'B', chips: 300 }, { id: 'C', chips: 10_000 }], pot: 300, base: 100 });
  r.act('A', 'max'); // raise = max(100, floor(300*1)) = 300 → total 300
  assert.equal(r.cur, 300);
  assert.equal(r.turnPlayerId, 'B');
  r.act('B', 'call');
  const b = r.player('B');
  assert.equal(b.roundBet, 300);
  assert.equal(b.chips, 0);
  assert.equal(b.allIn, true);
  assert.equal(r.cur, 300);
  const res = r.act('C', 'call');
  assert.equal(res.over, true);
});

test('숏 올인 레이즈는 cur 를 올리고 다른 플레이어가 다시 액션한다', () => {
  const r = new BettingRound({ players: [{ id: 'A', chips: 10_000 }, { id: 'B', chips: 1_500 }, { id: 'C', chips: 10_000 }], pot: 300, base: 100 });
  r.act('A', 'bbing'); // cur 100, pot 400
  const opts = r.legalActions('B');
  assert.equal(opts.find((a) => a.kind === 'half').total, 350); // (400+100)/2=250 → 350
  assert.equal(opts.find((a) => a.kind === 'max').total, 600); // 100 + 500
  r.act('B', 'max');
  assert.equal(r.cur, 600);
  assert.equal(r.turnPlayerId, 'C');
  r.act('C', 'call');
  assert.equal(r.turnPlayerId, 'A');
  const res = r.act('A', 'call');
  assert.equal(res.over, true);
});

test('레이즈 옵션이 칩 한도에 걸리면 올인 표시 + 중복 제거', () => {
  const r2 = new BettingRound({ players: [{ id: 'A', chips: 10_000 }, { id: 'B', chips: 250 }], pot: 300, base: 100 });
  r2.act('A', 'bbing');
  // B 칩 250: 콜 100, 따당 200, 쿼터 225, 하프 350→올인 250, 맥스 600→올인 250(중복 제거)
  assert.deepEqual(r2.legalActions('B').map((a) => `${a.kind}:${a.total}:${a.allIn}`), [
    'call:100:false', 'ddadang:200:false', 'quarter:225:false', 'half:250:true', 'die:0:false',
  ]);
});

test('maxRaises 상한에 걸리면 콜/다이만 가능', () => {
  const r = new BettingRound({ players: P(100_000), pot: 300, base: 100, maxRaises: 2 });
  r.act('A', 'bbing');
  r.act('B', 'ddadang');
  assert.deepEqual(kinds(r, 'C'), ['call', 'die']);
});

test('firstIdx 와 이미 다이/올인한 플레이어 건너뛰기, 첫 액션자가 누구든 체크 가능', () => {
  const r = new BettingRound({ players: P(1_000), pot: 300, base: 100, firstIdx: 1, alreadyFolded: new Set(['B']) });
  assert.equal(r.turnPlayerId, 'C');
  assert.ok(kinds(r, 'C').includes('check'));
  const r2 = new BettingRound({ players: P(1_000), pot: 300, base: 100, firstIdx: 2, alreadyAllIn: new Set(['C', 'A']) });
  assert.equal(r2.over, true); // 활성 플레이어 1명 → 액션 불필요
});

test('타임아웃 자동 액션: 체크 가능하면 체크, 아니면 다이', () => {
  const r = new BettingRound({ players: P(1_000), pot: 300, base: 100 });
  r.autoAction('A');
  assert.equal(r.player('A').folded, false);
  r.autoAction('B'); // 체크 불가 → 다이
  assert.equal(r.player('B').folded, true);
});

test('잘못된 턴/액션 거절', () => {
  const r = new BettingRound({ players: P(1_000), pot: 300, base: 100 });
  assert.equal(r.act('B', 'check').ok, false);
  assert.equal(r.act('A', 'call').ok, false);
  assert.equal(r.act('A', 'ddadang').ok, false);
  assert.equal(r.act('A', 'allin').ok, false);
});
