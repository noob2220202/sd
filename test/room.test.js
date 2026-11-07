import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoom, deckFor, FakeClock, FakeSocket } from './helpers.js';
import { INTERMISSION_MS, REGAME_INTERMISSION_MS, DISCONNECTED_TURN_MS } from '../server/net/room.js';

const D1 = deckFor(['3g', '2y', '5y'], ['8g', '2t', '5t'], ['1t', '4t', '6t']); // A 38광땡, B 2땡, C 5땡

test('방 생성/입장: 방장 착석, 시작 칩, 로비 상태, 뷰 기본값', () => {
  const { room, sockets } = makeRoom();
  const v = sockets.B.lastState();
  assert.equal(v.code, 'TEST01');
  assert.equal(v.hostId, 'A');
  assert.equal(v.phase, 'lobby');
  assert.equal(v.me.id, 'B');
  assert.equal(v.me.chips, 10_000);
  assert.equal(v.me.ledger.buyIn, 10_000);
  assert.deepEqual(v.players.map((p) => [p.id, p.seat, p.status]), [['A', 0, 'waiting'], ['B', 1, 'waiting'], ['C', 2, 'waiting']]);
  assert.equal(v.waiting.reason, 'lobby');
  assert.equal(v.hand, null);
  assert.equal(room.connectedCount(), 3);
});

test('닉네임 중복은 (2) 접미, 자리 꽉 차면 관전, sit/stand', () => {
  const { room, sockets } = makeRoom({ settings: { maxPlayers: 2 }, players: ['A', 'B'] });
  const sC = new FakeSocket();
  room.join('C', 'A', sC);
  const v = sC.lastState();
  assert.equal(v.me.nickname, 'A(2)');
  assert.equal(v.me.seat, null);
  assert.equal(v.me.status, 'spectating');
  assert.equal(room.sit('C').ok, false);
  assert.equal(room.stand('B').ok, true);
  assert.equal(room.sit('C').ok, true);
  assert.equal(room.player('C').seat, 1);
  assert.equal(room.player('C').chips, 10_000); // 처음 앉을 때 시작 칩 지급
  assert.equal(sockets.A.lastState().players.find((p) => p.id === 'B').status, 'spectating');
});

test('방장이 아니면 start 불가, start 하면 첫 판 시작(선 = 방장), 비공개 카드 가림', () => {
  const { room, sockets } = makeRoom({ decks: { 1: D1 } });
  assert.equal(room.hostCommand('B', { cmd: 'start' }).ok, false);
  assert.equal(room.hostCommand('A', { cmd: 'start' }).ok, true);
  const vB = sockets.B.lastState();
  assert.equal(vB.phase, 'playing');
  assert.equal(vB.hand.no, 1);
  assert.equal(vB.hand.stage, 'bet1');
  assert.equal(vB.hand.dealerId, 'A');
  assert.equal(vB.hand.turnId, 'A');
  assert.equal(vB.hand.pot, 300);
  assert.deepEqual(vB.hand.players.find((p) => p.id === 'A').cards, [{ hidden: true, open: false }, { id: '8g', open: true }]);
  assert.deepEqual(vB.hand.players.find((p) => p.id === 'B').cards, [{ id: '2y', open: false }, { id: '2t', open: true }]);
  assert.equal(vB.hand.legal.length, 0);
  assert.ok(sockets.A.lastState().hand.legal.length > 0);
  assert.ok(vB.hand.deadline > 0);
  assert.equal(vB.me.status, 'active');
  assert.equal(vB.me.canRefill, false);
});

test('한 판 전체: 베팅 → 선택 → 쇼다운 → 결과 표시 → 다음 판 자동 시작, 선 = 승자, 장부 반영', () => {
  const D2 = deckFor(['1g', '2y', '3g'], ['1t', '2t', '3t'], ['4y', '5y', '6y']);
  const { room, sockets, clock } = makeRoom({ decks: { 1: D1, 2: D2 } });
  room.hostCommand('A', { cmd: 'start' });
  assert.equal(room.action('B', 1, 'check').ok, false); // 턴 아님
  assert.equal(room.action('A', 1, 'check').ok, true);
  assert.equal(room.action('B', 1, 'bbing').ok, true);
  assert.equal(room.action('C', 1, 'call').ok, true);
  assert.equal(room.action('A', 1, 'call').ok, true);
  assert.equal(room.hand.stage, 'bet2');
  room.action('A', 1, 'check');
  room.action('B', 1, 'half');
  room.action('C', 1, 'die');
  room.action('A', 1, 'call');
  assert.equal(room.hand.stage, 'select');
  assert.equal(room.select('C', 1, [0, 1]).ok, false); // 다이한 사람
  room.select('A', 1, [0, 1]);
  room.select('B', 1, [0, 1]);
  assert.equal(room.hand.isDone, true);
  const v = sockets.C.lastState();
  assert.equal(v.hand.stage, 'done');
  assert.equal(v.hand.result.type, 'showdown');
  assert.deepEqual(v.hand.result.winners, ['A']);
  assert.ok(v.hand.intermission && v.hand.intermission.until > clock.now());
  assert.equal(v.hand.deadline, null);
  const a = v.players.find((p) => p.id === 'A');
  assert.equal(a.ledger.wins, 1);
  assert.equal(a.chips, room.player('A').chips);
  assert.ok(room.log.some((l) => l.text.includes('38광땡')));
  // 결과 표시가 끝나면 다음 판
  clock.advance(INTERMISSION_MS);
  assert.equal(room.hand.no, 2);
  assert.equal(room.hand.dealerId, 'A'); // 승자가 선
  assert.equal(room.hand.turnPlayerId, 'A');
  assert.equal(sockets.B.lastState().hand.no, 2);
});

test('dealerRule=rotate 면 매판 시계방향', () => {
  const D2 = deckFor(['1g', '2y', '3g'], ['1t', '2t', '3t'], ['4y', '5y', '6y']);
  const { room, clock } = makeRoom({ settings: { dealerRule: 'rotate' }, decks: { 1: D1, 2: D2, 3: D1 } });
  room.hostCommand('A', { cmd: 'start' });
  assert.equal(room.hand.dealerId, 'A');
  room.action('A', 1, 'bbing');
  room.action('B', 1, 'die');
  room.action('C', 1, 'die');
  clock.advance(INTERMISSION_MS);
  assert.equal(room.hand.dealerId, 'B');
  room.action('B', 2, 'bbing');
  room.action('C', 2, 'die');
  room.action('A', 2, 'die');
  clock.advance(INTERMISSION_MS);
  assert.equal(room.hand.dealerId, 'C');
});

test('타임아웃: 체크 가능하면 체크, 아니면 다이 → 기권승', () => {
  const { room, clock } = makeRoom({ decks: { 1: D1 } });
  room.hostCommand('A', { cmd: 'start' });
  clock.advance(30_000); // A 자동 체크
  assert.equal(room.hand.turnPlayerId, 'B');
  clock.advance(30_000); // B 자동 다이
  assert.equal(room.hand.player('B').folded, true);
  clock.advance(30_000); // C 자동 다이 → A 기권승
  assert.equal(room.hand.isDone, true);
  assert.equal(room.hand.result.type, 'fold');
  assert.equal(room.player('A').chips, 10_200);
});

test('제한시간 없음: 끊긴 플레이어의 턴만 60초 안전장치로 자동 처리', () => {
  const { room, sockets, clock } = makeRoom({ settings: { turnSeconds: 0 }, decks: { 1: D1 } });
  room.hostCommand('A', { cmd: 'start' });
  assert.equal(room.deadline, null);
  clock.advance(120_000);
  assert.equal(room.hand.turnPlayerId, 'A'); // 접속 중이면 기다림
  room.detach('A', sockets.A);
  assert.ok(room.deadline > 0);
  clock.advance(DISCONNECTED_TURN_MS);
  assert.equal(room.hand.turnPlayerId, 'B'); // A 자동 체크됨
  assert.equal(sockets.B.lastState().hand.deadline, null);
});

test('재접속: 소켓 교체 후 상태 수신, 자리/칩 유지', () => {
  const { room, sockets } = makeRoom({ decks: { 1: D1 } });
  room.hostCommand('A', { cmd: 'start' });
  room.detach('B', sockets.B);
  assert.equal(sockets.A.lastState().players.find((p) => p.id === 'B').connected, false);
  const s2 = new FakeSocket();
  room.attach('B', s2);
  const v = s2.lastState();
  assert.equal(v.me.id, 'B');
  assert.equal(v.me.seat, 1);
  assert.equal(v.me.connected, true);
  assert.deepEqual(v.hand.players.find((p) => p.id === 'B').cards.map((c) => c.id), ['2y', '2t']);
});

test('판 도중 나가면 다이 처리, 방장은 승계, 전원 나가면 onEmpty', () => {
  let emptied = 0;
  const { room, sockets } = makeRoom({ decks: { 1: D1 }, onEmpty: () => emptied++ });
  room.hostCommand('A', { cmd: 'start' });
  room.action('A', 1, 'bbing');
  room.leave('A'); // 방장 퇴장, 턴은 B
  assert.equal(room.hostId, 'B');
  assert.equal(room.hand.player('A').folded, false); // 턴이 아니라 아직 그대로
  room.action('B', 1, 'call');
  room.action('C', 1, 'call');
  // A 턴이 되자 즉시 다이 → 라운드 종료 → 3번째 카드 → 2구 (B 선부터는 아니고 선 A 가 나갔으니 다음 활성 B)
  assert.equal(room.hand.player('A').folded, true);
  assert.equal(room.hand.stage, 'bet2');
  assert.equal(room.hand.turnPlayerId, 'B');
  assert.equal(sockets.B.lastState().players.length, 2);
  room.leave('B');
  room.leave('C');
  assert.equal(emptied, 1);
  assert.equal(room.destroyed, true);
});

test('강퇴: kicked 메시지, 목록에서 제거', () => {
  const { room, sockets } = makeRoom();
  assert.equal(room.hostCommand('A', { cmd: 'kick', playerId: 'A' }).ok, false);
  const res = room.hostCommand('A', { cmd: 'kick', playerId: 'C' });
  assert.equal(res.ok, true);
  assert.ok(sockets.C.sent.some((m) => m.t === 'kicked'));
  assert.equal(room.player('C'), null);
  assert.equal(sockets.A.lastState().players.length, 2);
});

test('리필(수동): 판 사이에만, 시작 칩까지, 장부 반영 / 칩 부족자는 sitout → 자동 대기', () => {
  const { room, sockets } = makeRoom({ players: ['A', 'B'], decks: { 1: deckFor(['1g', '2y'], ['1t', '2t'], ['3g', '4y']) } });
  room.player('B').chips = 50; // 삥(100) 미만
  room.hostCommand('A', { cmd: 'start' });
  assert.equal(room.hand, null); // 참가자 부족
  const v = sockets.B.lastState();
  assert.equal(v.waiting.reason, 'need_chips');
  assert.equal(v.me.status, 'sitout');
  assert.equal(v.me.canRefill, true);
  assert.equal(room.refill('A').ok, false); // A 는 꽉 차 있음
  assert.equal(room.refill('B').ok, true);
  assert.equal(room.player('B').ledger.buyIn, 10_000 + 9_950);
  assert.equal(room.player('B').ledger.refills, 1);
  assert.equal(room.hand.no, 1); // 리필되자 자동 시작
  assert.equal(room.player('B').chips, 10_000 - 100); // 시작 칩까지 채운 뒤 앤티
  assert.equal(room.refill('B').ok, false); // 판 참가 중
});

test('리필(자동): 판 시작 시 삥 못 내는 착석자 자동 충전', () => {
  const { room } = makeRoom({ settings: { refill: 'auto' }, players: ['A', 'B'], decks: { 1: deckFor(['1g', '2y'], ['1t', '2t'], ['3g', '4y']) } });
  room.player('B').chips = 10;
  room.hostCommand('A', { cmd: 'start' });
  assert.equal(room.hand.no, 1);
  assert.equal(room.player('B').chips, 10_000 - 100);
  assert.equal(room.player('B').ledger.refills, 1);
});

test('동점 재경기: 동점자끼리만, 앤티 없음, 이월 판돈으로 시작, 비참가자는 대기', () => {
  // A 여덟끗(2y+6t), B 여덟끗(3t+5t), C 일곱끗(3g+4t)
  const D = deckFor(['2y', '3t', '3g'], ['6t', '5t', '4t'], ['1g', '10y', '7t']);
  const DR = deckFor(['1g', '2y'], ['1t', '2t'], ['3g', '4y']); // 재경기: A 삥땡, B 2땡
  const { room, sockets, clock } = makeRoom({ decks: { 1: D, 2: DR } });
  room.hostCommand('A', { cmd: 'start' });
  room.action('A', 1, 'check'); room.action('B', 1, 'bbing'); room.action('C', 1, 'call'); room.action('A', 1, 'call');
  room.action('A', 1, 'check'); room.action('B', 1, 'bbing'); room.action('C', 1, 'call'); room.action('A', 1, 'call');
  room.select('A', 1, [0, 1]); room.select('B', 1, [0, 1]); room.select('C', 1, [0, 1]);
  assert.equal(room.hand.result.type, 'regame');
  const v = sockets.C.lastState();
  assert.equal(v.hand.intermission.regameNext.reason, 'tie');
  assert.deepEqual(v.hand.intermission.regameNext.participants.sort(), ['A', 'B']);
  assert.equal(v.hand.intermission.rejoinFee, 0); // 동점은 참가 불가
  assert.equal(room.carried, 900);
  clock.advance(REGAME_INTERMISSION_MS);
  assert.equal(room.hand.no, 2);
  assert.deepEqual(room.hand.players.map((p) => p.id), ['A', 'B']);
  assert.equal(room.hand.carried, 900);
  assert.equal(room.hand.pot, 900);
  assert.equal(room.hand.regame.reason, 'tie');
  assert.equal(room.hand.dealerId, 'A'); // 선 유지
  const vC = sockets.C.lastState();
  assert.equal(vC.me.status, 'waiting');
  assert.equal(room.player('A').chips, 10_000 - 300); // 앤티 없음
  // 재경기 결과: B 2땡 승 → 판돈 가져감
  room.action('A', 2, 'check'); room.action('B', 2, 'bbing'); room.action('A', 2, 'call');
  room.action('A', 2, 'check'); room.action('B', 2, 'bbing'); room.action('A', 2, 'call');
  room.select('A', 2, [0, 1]); room.select('B', 2, [0, 1]);
  assert.deepEqual(room.hand.result.winners, ['B']);
  assert.equal(room.player('B').chips, 10_000 - 300 - 200 + 900 + 400);
  assert.equal(room.carried, 0);
  clock.advance(INTERMISSION_MS);
  assert.equal(room.hand.no, 3);
  assert.deepEqual(room.hand.players.map((p) => p.id), ['A', 'B', 'C']); // 일반 판 복귀
  assert.equal(room.hand.dealerId, 'B');
});

test('구사 재경기: 다이한 사람이 참가금(이월 절반)을 내고 참가, 판돈 합산', () => {
  // A 구사(4t+9t), B 알리(1g+2y), C 다이
  const D = deckFor(['4t', '1g', '6y'], ['9t', '2y', '7t'], ['5t', '8y', '10t']);
  const DR = deckFor(['3g', '2y', '5y'], ['8g', '2t', '5t'], ['1t', '4t', '6t']);
  const { room, sockets, clock } = makeRoom({ decks: { 1: D, 2: DR } });
  room.hostCommand('A', { cmd: 'start' });
  room.action('A', 1, 'bbing'); room.action('B', 1, 'call'); room.action('C', 1, 'die');
  room.action('A', 1, 'check'); room.action('B', 1, 'bbing'); room.action('A', 1, 'call');
  room.select('A', 1, [0, 1]); room.select('B', 1, [0, 1]);
  assert.equal(room.hand.result.reason, 'gusa');
  assert.equal(room.carried, 700);
  const v = sockets.C.lastState();
  assert.deepEqual(v.hand.intermission.rejoinable, ['C']);
  assert.equal(v.hand.intermission.rejoinFee, 350);
  assert.equal(room.rejoin('B').ok, false);
  assert.equal(room.rejoin('C').ok, true);
  assert.equal(room.rejoin('C').ok, false);
  assert.equal(room.player('C').chips, 10_000 - 100 - 350);
  assert.equal(room.carried, 1_050);
  clock.advance(REGAME_INTERMISSION_MS);
  assert.deepEqual(room.hand.players.map((p) => p.id), ['A', 'B', 'C']);
  assert.equal(room.hand.pot, 1_050);
  assert.equal(room.hand.regame.reason, 'gusa');
});

test('구사 재경기 참가 비허용 설정이면 참가 불가', () => {
  const D = deckFor(['4t', '1g', '6y'], ['9t', '2y', '7t'], ['5t', '8y', '10t']);
  const { room } = makeRoom({ settings: { regameRejoin: false }, decks: { 1: D } });
  room.hostCommand('A', { cmd: 'start' });
  room.action('A', 1, 'bbing'); room.action('B', 1, 'call'); room.action('C', 1, 'die');
  room.action('A', 1, 'check'); room.action('B', 1, 'bbing'); room.action('A', 1, 'call');
  room.select('A', 1, [0, 1]); room.select('B', 1, [0, 1]);
  assert.equal(room.intermission.rejoinable.size, 0);
  assert.equal(room.rejoin('C').ok, false);
});

test('재경기 참가자가 1명만 남으면 이월 판돈을 가져가고 일반 판으로', () => {
  const D = deckFor(['2y', '3t', '3g'], ['6t', '5t', '4t'], ['1g', '10y', '7t']);
  const { room, clock } = makeRoom({ decks: { 1: D, 2: D } });
  room.hostCommand('A', { cmd: 'start' });
  room.action('A', 1, 'check'); room.action('B', 1, 'bbing'); room.action('C', 1, 'call'); room.action('A', 1, 'call');
  room.action('A', 1, 'check'); room.action('B', 1, 'bbing'); room.action('C', 1, 'call'); room.action('A', 1, 'call');
  room.select('A', 1, [0, 1]); room.select('B', 1, [0, 1]); room.select('C', 1, [0, 1]);
  assert.equal(room.hand.result.reason, 'tie');
  room.leave('B');
  clock.advance(REGAME_INTERMISSION_MS);
  assert.equal(room.player('A').chips, 10_000 - 300 + 900 - 100); // 이월 획득 후 다음 판 앤티
  assert.equal(room.carried, 0);
  assert.equal(room.hand.no, 2);
  assert.deepEqual(room.hand.players.map((p) => p.id), ['A', 'C']);
});

test('일시정지: 진행 중인 판은 끝까지, 다음 판은 시작하지 않음, 재개하면 시작', () => {
  const { room, clock } = makeRoom({ decks: { 1: D1, 2: D1 } });
  room.hostCommand('A', { cmd: 'start' });
  room.hostCommand('A', { cmd: 'pause' });
  room.action('A', 1, 'bbing'); room.action('B', 1, 'die'); room.action('C', 1, 'die');
  clock.advance(INTERMISSION_MS);
  assert.equal(room.hand.no, 1);
  assert.equal(room.hand.isDone, true);
  room.hostCommand('A', { cmd: 'resume' });
  assert.equal(room.hand.no, 2);
});

test('설정 변경: 판 도중이면 다음 판에 적용, 좌석 수 축소 검증', () => {
  const { room, clock } = makeRoom({ decks: { 1: D1, 2: D1 } });
  room.hostCommand('A', { cmd: 'start' });
  assert.equal(room.hostCommand('A', { cmd: 'settings', settings: { maxPlayers: 2 } }).ok, false);
  assert.equal(room.hostCommand('A', { cmd: 'settings', settings: { base: 500 } }).ok, true);
  assert.equal(room.settings.base, 100);
  assert.equal(room.pendingSettings.base, 500);
  room.action('A', 1, 'bbing'); room.action('B', 1, 'die'); room.action('C', 1, 'die');
  clock.advance(INTERMISSION_MS);
  assert.equal(room.settings.base, 500);
  assert.equal(room.hand.pot, 1_500);
});

test('채팅은 전원에게 이벤트+상태로 전달, 100개 제한', () => {
  const { room, sockets } = makeRoom();
  room.chatMessage('B', '안녕');
  assert.equal(sockets.C.events('chat').at(-1).text, '안녕');
  assert.equal(sockets.A.lastState().chat.at(-1).from, 'B');
  for (let i = 0; i < 120; i++) room.chatMessage('A', `m${i}`);
  assert.equal(room.chat.length, 100);
});

test('관전자도 상태를 받지만 비공개 카드는 못 본다', () => {
  const { room } = makeRoom({ settings: { maxPlayers: 3 }, decks: { 1: D1 } });
  const sD = new FakeSocket();
  room.join('D', 'D', sD);
  room.hostCommand('A', { cmd: 'start' });
  const v = sD.lastState();
  assert.equal(v.me.status, 'spectating');
  assert.ok(v.hand.players.every((p) => p.cards[0].hidden === true));
});

test('공개 카드 직접 선택 설정: open 단계 → 타임아웃 시 2번째 카드', () => {
  const { room, sockets, clock } = makeRoom({ settings: { openCard: 'choose' }, decks: { 1: D1 } });
  room.hostCommand('A', { cmd: 'start' });
  assert.equal(room.hand.stage, 'open');
  assert.equal(room.chooseOpen('A', 1, 0).ok, true);
  assert.equal(sockets.B.lastState().hand.players[0].hasChosenOpen, true);
  clock.advance(30_000);
  assert.equal(room.hand.stage, 'bet1');
  assert.deepEqual(sockets.B.lastState().hand.players[0].cards[0], { id: '3g', open: true });
});
