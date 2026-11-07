import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hand } from '../server/game/engine.js';

// 덱 배열: 1차 분배(0번 카드) A,B,C → 2차 분배(1번=공개) A,B,C → 3번째 A,B,C 순으로 뽑힌다.
const deckFor = (firsts, seconds, thirds) => [...firsts, ...seconds, ...thirds];
const S = { base: 100, maxRaises: 0, openCard: 'second', allInFrom: 'bet2', rules: { ddaengjabi: true, amhaeng: true, gusa: true, mungGusa: true } };
const players = (chips = 10_000) => [
  { id: 'A', chips },
  { id: 'B', chips },
  { id: 'C', chips },
];
/** 선 체크 → 나머지 삥/콜 로 라운드를 저렴하게 통과 */
function cheapRound(h, ids) {
  const [boss, ...rest] = ids;
  h.act(boss, 'check');
  rest.forEach((id, i) => h.act(id, i === 0 ? 'bbing' : 'call'));
  h.act(boss, 'call');
}

test('앤티 징수와 2장 분배(2번째 공개), 선부터 액션', () => {
  const h = new Hand({ no: 1, players: players(), dealerIdx: 1, settings: S, deck: deckFor(['1g', '2y', '3g'], ['1t', '2t', '3t'], ['4y', '5y', '6y']) }).start();
  assert.equal(h.pot, 300);
  assert.equal(h.stage, 'bet1');
  assert.equal(h.turnPlayerId, 'B');
  const vA = h.view('A');
  const pb = vA.players.find((p) => p.id === 'B');
  assert.deepEqual(pb.cards, [{ hidden: true, open: false }, { id: '2t', open: true }]);
  const pa = vA.players.find((p) => p.id === 'A');
  assert.deepEqual(pa.cards, [{ id: '1g', open: false }, { id: '1t', open: true }]);
  assert.equal(h.players[0].chips, 9_900);
  assert.equal(h.view('X').players[0].cards[0].hidden, true);
});

test('다이로 1명만 남으면 즉시 승리 (카드 비공개), 승자가 다음 선', () => {
  const h = new Hand({ no: 1, players: players(), dealerIdx: 0, settings: S, deck: deckFor(['1g', '2y', '3g'], ['1t', '2t', '3t'], ['4y', '5y', '6y']) }).start();
  assert.equal(h.act('A', 'bbing').ok, true);
  assert.equal(h.act('B', 'die').ok, true);
  assert.equal(h.act('C', 'die').ok, true);
  assert.equal(h.stage, 'done');
  assert.equal(h.result.type, 'fold');
  assert.deepEqual(h.result.winners, ['A']);
  assert.equal(h.result.dealerNext, 'A');
  assert.equal(h.player('A').chips, 10_000 + 200);
  assert.equal(h.result.carriedNext, 0);
  assert.equal(h.view('B').players.find((p) => p.id === 'A').cards[0].hidden, true);
});

test('1구 → 3번째 카드 → 2구 → 선택 → 쇼다운, 최고 족보가 판돈 획득, 선택한 2장만 공개', () => {
  // A: 3g,8g,+1t → 38광땡 / B: 2y,2t → 2땡 / C: 5y,5t → 5땡
  const h = new Hand({ no: 1, players: players(), dealerIdx: 0, settings: S, deck: deckFor(['3g', '2y', '5y'], ['8g', '2t', '5t'], ['1t', '4t', '6t']) }).start();
  cheapRound(h, ['A', 'B', 'C']);
  assert.equal(h.stage, 'bet2');
  assert.equal(h.players[0].cards.length, 3);
  assert.equal(h.turnPlayerId, 'A'); // 2구도 선부터
  assert.ok(h.legalActions('A').some((a) => a.kind === 'allin')); // 2구부터 올인 가능
  cheapRound(h, ['A', 'B', 'C']);
  assert.equal(h.stage, 'select');
  assert.equal(h.select('A', [0, 1]).ok, true);
  assert.equal(h.select('A', [0, 1]).ok, false);
  assert.equal(h.select('B', [0, 1]).ok, true);
  assert.equal(h.stage, 'select');
  assert.equal(h.select('C', [1, 0]).ok, true);
  assert.equal(h.stage, 'done');
  assert.equal(h.result.type, 'showdown');
  assert.deepEqual(h.result.winners, ['A']);
  assert.equal(h.result.dealerNext, 'A');
  assert.equal(h.pot, 900);
  assert.equal(h.player('A').chips, 10_000 - 300 + 900);
  assert.equal(h.result.reveals.A.hand.name, '38광땡');
  assert.equal(h.result.reveals.B.hand.name, '2땡');
  const a = h.view('B').players.find((p) => p.id === 'A');
  assert.deepEqual(a.cards.map((c) => c.open), [true, true, false]);
});

test('1구에서는 올인 버튼 없음(allInFrom=bet2), allInFrom=bet1 이면 있음', () => {
  const h = new Hand({ no: 1, players: players(), dealerIdx: 0, settings: S, deck: deckFor(['3g', '2y', '5y'], ['8g', '2t', '5t'], ['1t', '4t', '6t']) }).start();
  assert.ok(!h.legalActions('A').some((a) => a.kind === 'allin'));
  const h2 = new Hand({ no: 1, players: players(), dealerIdx: 0, settings: { ...S, allInFrom: 'bet1' }, deck: deckFor(['3g', '2y', '5y'], ['8g', '2t', '5t'], ['1t', '4t', '6t']) }).start();
  assert.ok(h2.legalActions('A').some((a) => a.kind === 'allin'));
});

test('숏 올인 사이드팟: 메인팟은 올인자 포함 비교, 사이드팟은 나머지끼리', () => {
  // A(300칩) 장땡, B 9땡, C 여덟끗(2y+6t)
  const ps = [{ id: 'A', chips: 300 }, { id: 'B', chips: 10_000 }, { id: 'C', chips: 10_000 }];
  const h = new Hand({ no: 1, players: ps, dealerIdx: 0, settings: S, deck: deckFor(['10y', '9y', '2y'], ['10t', '9t', '6t'], ['1t', '4t', '3t']) }).start();
  h.act('A', 'bbing'); // cur 100, pot 400
  assert.equal(h.legalActions('B').find((a) => a.kind === 'half').total, 350);
  h.act('B', 'half');
  h.act('C', 'call');
  const callA = h.legalActions('A').find((a) => a.kind === 'call');
  assert.equal(callA.allIn, true);
  assert.equal(callA.total, 200); // 삥 100 + 남은 100
  h.act('A', 'call');
  assert.equal(h.player('A').handBet, 300);
  assert.equal(h.stage, 'bet2');
  assert.equal(h.turnPlayerId, 'B'); // A 올인 → 선 다음 활성 플레이어
  h.act('B', 'check');
  h.act('C', 'bbing');
  h.act('B', 'call');
  assert.equal(h.stage, 'select');
  h.select('A', [0, 1]);
  h.select('B', [0, 1]);
  h.select('C', [0, 1]);
  assert.equal(h.result.type, 'showdown');
  // 기여: A 300, B 550, C 550 → 메인팟 900(A,B,C) → A 장땡 / 사이드팟 500(B,C) → B 9땡
  assert.deepEqual(h.result.pots.map((p) => [p.amount, p.winner]), [[900, 'A'], [500, 'B']]);
  assert.equal(h.player('A').chips, 900);
  assert.equal(h.player('B').chips, 10_000 - 550 + 500);
  assert.equal(h.player('C').chips, 10_000 - 550);
  assert.equal(h.result.dealerNext, 'A'); // 메인팟 승자
});

test('구사 재경기: 판돈 전부 이월, 참가자 = 다이하지 않은 전원, 재경기 판은 앤티 없이 이월금으로 시작', () => {
  // A: 4t,9t (구사) / B: 1g,2y (알리) / C: 다이
  const h = new Hand({ no: 1, players: players(), dealerIdx: 0, settings: S, deck: deckFor(['4t', '1g', '6y'], ['9t', '2y', '7t'], ['5t', '8y', '10t']) }).start();
  h.act('A', 'bbing');
  h.act('B', 'call');
  h.act('C', 'die');
  h.act('A', 'check');
  h.act('B', 'bbing');
  h.act('A', 'call');
  h.select('A', [0, 1]);
  h.select('B', [0, 1]);
  assert.equal(h.result.type, 'regame');
  assert.equal(h.result.reason, 'gusa');
  assert.equal(h.result.carriedNext, 700); // 앤티 300 + 1구 200 + 2구 200
  assert.deepEqual(h.result.regameNext, { reason: 'gusa', participants: ['A', 'B'] });
  assert.equal(h.result.dealerNext, null);
  assert.equal(h.player('A').chips, 9_700);
  // 재경기 판: A,B 만, 앤티 없음
  const h2 = new Hand({ no: 2, players: [{ id: 'A', chips: 9_700 }, { id: 'B', chips: 9_700 }], dealerIdx: 0, settings: S, carried: 700, ante: false, regame: { reason: 'gusa' }, deck: deckFor(['3g', '2y'], ['8g', '2t'], ['1t', '4t']) }).start();
  assert.equal(h2.pot, 700);
  assert.equal(h2.player('A').chips, 9_700);
  cheapRound(h2, ['A', 'B']);
  cheapRound(h2, ['A', 'B']);
  h2.select('A', [0, 1]);
  h2.select('B', [0, 1]);
  assert.deepEqual(h2.result.winners, ['A']);
  assert.equal(h2.player('A').chips, 9_700 - 200 + 700 + 400);
});

test('동점 재경기: 같은 끗 → 동점자끼리 이월', () => {
  // A: 2y+6t = 여덟끗 / B: 3t+5t = 여덟끗 / C: 3g+4t = 일곱끗
  const h = new Hand({ no: 1, players: players(1_000), dealerIdx: 0, settings: S, deck: deckFor(['2y', '3t', '3g'], ['6t', '5t', '4t'], ['1g', '10y', '7t']) }).start();
  cheapRound(h, ['A', 'B', 'C']);
  cheapRound(h, ['A', 'B', 'C']);
  h.select('A', [0, 1]);
  h.select('B', [0, 1]);
  h.select('C', [0, 1]);
  assert.equal(h.result.type, 'regame');
  assert.equal(h.result.reason, 'tie');
  assert.equal(h.result.carriedNext, 900);
  assert.deepEqual(h.result.regameNext.participants.sort(), ['A', 'B']);
});

test('사이드팟만 동점이면 메인팟은 지급, 동점 팟만 이월', () => {
  // A(300칩) 장땡 / B 여덟끗(2y+6t) / C 여덟끗(3t+5t)
  const ps = [{ id: 'A', chips: 300 }, { id: 'B', chips: 10_000 }, { id: 'C', chips: 10_000 }];
  const h = new Hand({ no: 1, players: ps, dealerIdx: 0, settings: S, deck: deckFor(['10y', '2y', '3t'], ['10t', '6t', '5t'], ['1t', '4t', '7t']) }).start();
  h.act('A', 'bbing');
  h.act('B', 'half'); // 350
  h.act('C', 'call');
  h.act('A', 'call'); // 올인 300
  h.act('B', 'check');
  h.act('C', 'bbing');
  h.act('B', 'call');
  h.select('A', [0, 1]);
  h.select('B', [0, 1]);
  h.select('C', [0, 1]);
  assert.equal(h.result.type, 'showdown');
  assert.deepEqual(h.result.pots.map((p) => [p.amount, p.winner, p.tie]), [[900, 'A', false], [500, null, true]]);
  assert.equal(h.result.carriedNext, 500);
  assert.deepEqual(h.result.regameNext.participants.sort(), ['B', 'C']);
  assert.equal(h.result.dealerNext, 'A');
});

test('선택 타임아웃은 최고 조합을 자동 선택', () => {
  const ps = [{ id: 'A', chips: 1_000 }, { id: 'B', chips: 1_000 }];
  const h = new Hand({ no: 1, players: ps, dealerIdx: 0, settings: S, deck: deckFor(['1t', '2y'], ['3g', '6t'], ['8g', '10y']) }).start();
  cheapRound(h, ['A', 'B']);
  cheapRound(h, ['A', 'B']);
  h.select('B', [0, 1]);
  h.timeoutSelect();
  assert.deepEqual(h.player('A').selected, [1, 2]);
  assert.equal(h.result.reveals.A.hand.name, '38광땡');
});

test('베팅 타임아웃: 체크 가능하면 체크, 아니면 다이', () => {
  const h = new Hand({ no: 1, players: players(), dealerIdx: 0, settings: S, deck: deckFor(['1g', '2y', '3g'], ['1t', '2t', '3t'], ['4y', '5y', '6y']) }).start();
  h.timeoutTurn(); // A 체크
  assert.equal(h.player('A').folded, false);
  h.timeoutTurn(); // B 는 체크 불가 → 다이
  assert.equal(h.player('B').folded, true);
  assert.equal(h.turnPlayerId, 'C');
});

test('공개패 선택(openCard=choose): 각자 0/1 선택, 타임아웃은 2번째 카드', () => {
  const h = new Hand({ no: 1, players: players(), dealerIdx: 0, settings: { ...S, openCard: 'choose' }, deck: deckFor(['1g', '2y', '3g'], ['1t', '2t', '3t'], ['4y', '5y', '6y']) }).start();
  assert.equal(h.stage, 'open');
  assert.equal(h.chooseOpen('A', 0).ok, true);
  assert.equal(h.chooseOpen('A', 1).ok, false);
  assert.equal(h.chooseOpen('B', 2).ok, false);
  assert.equal(h.stage, 'open');
  h.timeoutOpen();
  assert.equal(h.stage, 'bet1');
  const v = h.view('C');
  assert.deepEqual(v.players.find((p) => p.id === 'A').cards, [{ id: '1g', open: true }, { hidden: true, open: false }]);
  assert.deepEqual(v.players.find((p) => p.id === 'B').cards, [{ hidden: true, open: false }, { id: '2t', open: true }]);
});

test('모든 플레이어가 앤티로 올인되면 베팅 없이 선택 단계로', () => {
  const ps = [{ id: 'A', chips: 100 }, { id: 'B', chips: 100 }];
  const h = new Hand({ no: 1, players: ps, dealerIdx: 0, settings: S, deck: deckFor(['1g', '2y'], ['1t', '2t'], ['3g', '4y']) }).start();
  assert.equal(h.stage, 'select');
  assert.equal(h.players[0].cards.length, 3);
});

test('판 도중 나간 플레이어 처리(forceLeave)', () => {
  const h = new Hand({ no: 1, players: players(), dealerIdx: 0, settings: S, deck: deckFor(['1g', '2y', '3g'], ['1t', '2t', '3t'], ['4y', '5y', '6y']) }).start();
  h.forceLeave('A'); // A 턴 → 다이
  assert.equal(h.player('A').folded, true);
  assert.equal(h.turnPlayerId, 'B');
  h.act('B', 'bbing');
  h.act('C', 'call');
  assert.equal(h.stage, 'bet2');
  h.act('B', 'check');
  h.act('C', 'bbing');
  h.act('B', 'call');
  assert.equal(h.stage, 'select');
  h.forceLeave('C'); // 선택 중 → 자동 선택
  assert.ok(h.player('C').selected);
  h.select('B', [0, 1]);
  assert.equal(h.stage, 'done');
});

test('잘못된 액션/선택 거절', () => {
  const h = new Hand({ no: 1, players: players(), dealerIdx: 0, settings: S, deck: deckFor(['1g', '2y', '3g'], ['1t', '2t', '3t'], ['4y', '5y', '6y']) }).start();
  assert.equal(h.select('A', [0, 1]).ok, false);
  assert.equal(h.chooseOpen('A', 0).ok, false);
  assert.equal(h.act('B', 'check').ok, false);
  assert.equal(h.act('A', 'call').ok, false);
  assert.equal(h.act('Z', 'check').ok, false);
});
