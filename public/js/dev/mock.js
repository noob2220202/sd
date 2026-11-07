// 개발용 목 네트워크: Net 과 같은 인터페이스(connect/send/close/onMessage/onStatus)로
// 실제와 같은 RoomView 스냅샷 시퀀스를 공급한다. ?mock=1&stage=<이름>, 'n' 키로 다음 단계, window.__mockGoto(name)
import { evaluate } from '../shared/hands.js';

const ME = 'p2';
const START = 1_000_000;
const BASE = 10_000;

const SETTINGS = {
  startChips: START, base: BASE, maxPlayers: 6, turnSeconds: 30, refill: 'manual', maxRaises: 0,
  openCard: 'second', allInFrom: 'bet2', dealerRule: 'winner', regameRejoin: true,
  rules: { ddaengjabi: true, amhaeng: true, gusa: true, mungGusa: true },
};

const PEOPLE = {
  p0: { id: 'p0', nickname: '민수', seat: 0, chips: 1_250_000, buyIn: START, refills: 0, wins: 3 },
  p1: { id: 'p1', nickname: '지영', seat: 1, chips: 820_000, buyIn: START, refills: 0, wins: 1 },
  p2: { id: 'p2', nickname: '현우', seat: 2, chips: 960_000, buyIn: START, refills: 0, wins: 2 },
  p3: { id: 'p3', nickname: '태호', seat: 3, chips: 1_970_000, buyIn: 2_000_000, refills: 1, wins: 4 },
  p4: { id: 'p4', nickname: '관전러', seat: null, chips: 0, buyIn: 0, refills: 0, wins: 0 },
};

export const STAGES = ['lobby', 'roomlobby', 'waiting', 'open', 'bet1', 'bet2', 'select', 'showdown', 'regame', 'foldwin', 'spectator', 'paused', 'reconnect'];

function player(id, over = {}) {
  const b = PEOPLE[id];
  const chips = over.chips ?? b.chips;
  return {
    id: b.id, nickname: b.nickname, seat: over.seat === undefined ? b.seat : over.seat, chips,
    connected: over.connected ?? true, isHost: Boolean(over.isHost),
    status: over.status || (b.seat == null ? 'spectating' : 'waiting'),
    ledger: { buyIn: b.buyIn, refills: b.refills, wins: b.wins, net: chips - b.buyIn },
    canRefill: Boolean(over.canRefill),
  };
}

const c = (id, open = false) => ({ id, open });
const hid = () => ({ hidden: true, open: false });

function hp(id, over) {
  return { id, chips: PEOPLE[id].chips, handBet: 0, roundBet: 0, folded: false, allIn: false, openIdx: 1, cards: [], selected: null, hasSelected: false, hasChosenOpen: true, reveal: null, ...over };
}

function hand(name) {
  return { name, rank: 0, category: 'kkeut', flags: {} };
}
function ev(a, b) {
  const h = evaluate(a, b);
  return { name: h.name, rank: h.rank, category: h.category, flags: h.flags };
}

const LOG = (now) => [
  { ts: now - 420_000, text: '민수 님이 방을 만들었습니다', kind: 'system' },
  { ts: now - 400_000, text: '지영 님이 입장했습니다', kind: 'system' },
  { ts: now - 380_000, text: '현우 님이 입장했습니다', kind: 'system' },
  { ts: now - 360_000, text: '태호 님이 입장했습니다', kind: 'system' },
  { ts: now - 300_000, text: '11번째 판 시작 — 선: 태호', kind: 'hand' },
  { ts: now - 290_000, text: '태호: 삥 10,000', kind: 'action' },
  { ts: now - 280_000, text: '민수: 하프 35,000', kind: 'action' },
  { ts: now - 270_000, text: '지영: 다이', kind: 'action' },
  { ts: now - 200_000, text: '11번째 판 결과: 동점(갑오) — 판돈 40,000 이월', kind: 'result' },
  { ts: now - 60_000, text: '12번째 판 시작 — 선: 민수, 이월 40,000', kind: 'hand' },
  { ts: now - 50_000, text: '민수: 삥 10,000', kind: 'action' },
  { ts: now - 40_000, text: '지영: 따당 20,000', kind: 'action' },
];
const CHAT = (now) => [
  { ts: now - 350_000, from: '민수', fromId: 'p0', text: '다들 왔으면 시작할게요' },
  { ts: now - 340_000, from: '지영', fromId: 'p1', text: '좋아요' },
  { ts: now - 100_000, from: '현우', fromId: 'p2', text: '아 갑오 동점이라니' },
  { ts: now - 90_000, from: '태호', fromId: 'p3', text: '판돈 쌓였다 가자' },
];

/** 단계별 RoomView 생성 */
export function buildRoom(stage, now = Date.now()) {
  const base = {
    code: 'K7PX2M', hostId: 'p0', phase: 'playing', settings: { ...SETTINGS, rules: { ...SETTINGS.rules } },
    players: [], hand: null, waiting: null, log: LOG(now), chat: CHAT(now), serverTime: now,
  };
  const four = (over = {}) => [player('p0', { isHost: true, status: 'active', ...over.p0 }), player('p1', { status: 'active', ...over.p1 }), player('p2', { status: 'active', ...over.p2 }), player('p3', { status: 'active', ...over.p3 })];
  const withMe = (room, meId = ME) => {
    room.me = room.players.find((p) => p.id === meId);
    return room;
  };
  const deadline = now + 30_000;

  switch (stage) {
    case 'lobby':
      return null;
    case 'roomlobby': {
      const r = { ...base, hostId: ME, phase: 'lobby', players: [player('p0', { status: 'waiting' }), player('p1', { status: 'waiting' }), player('p2', { isHost: true, status: 'waiting' }), player('p3', { status: 'waiting' }), player('p4')] };
      r.waiting = { reason: 'lobby', message: '방장이 게임을 시작하면 첫 판이 시작됩니다' };
      r.log = r.log.slice(0, 4);
      r.chat = r.chat.slice(0, 2);
      return withMe(r);
    }
    case 'waiting': {
      const r = { ...base, hostId: ME, players: [player('p2', { isHost: true, status: 'waiting', chips: 740_000, canRefill: true }), player('p4')] };
      r.waiting = { reason: 'need_players', message: '참가자가 2명 이상 필요합니다 (칩이 삥 이상인 착석자)' };
      return withMe(r);
    }
    case 'open': {
      const r = { ...base, players: four() };
      r.settings.openCard = 'choose';
      r.hand = {
        no: 12, stage: 'open', regame: null, dealerId: 'p0', turnId: null, lastAggressor: null, pot: 80_000, carried: 40_000, cur: 0, legal: [],
        players: [
          hp('p0', { handBet: BASE, openIdx: 1, hasChosenOpen: true, cards: [hid(), hid()] }),
          hp('p1', { handBet: BASE, openIdx: null, hasChosenOpen: false, cards: [hid(), hid()] }),
          hp('p2', { handBet: BASE, openIdx: null, hasChosenOpen: false, cards: [c('3g'), c('7y')] }),
          hp('p3', { handBet: BASE, openIdx: 0, hasChosenOpen: true, cards: [hid(), hid()] }),
        ],
        result: null, deadline, intermission: null,
      };
      return withMe(r);
    }
    case 'bet1': {
      const r = { ...base, players: four({ p2: { chips: 120_000 } }) };
      // 판돈: 이월 40,000 + 앤티 4×10,000 + 민수 삥 10,000 + 지영 따당 20,000 = 110,000. 내 콜 20,000
      r.hand = {
        no: 12, stage: 'bet1', regame: null, dealerId: 'p0', turnId: ME, lastAggressor: 'p1', pot: 110_000, carried: 40_000, cur: 20_000,
        legal: [
          { kind: 'call', total: 20_000, pay: 20_000, allIn: false },
          { kind: 'ddadang', total: 40_000, pay: 40_000, allIn: false },
          { kind: 'quarter', total: 52_500, pay: 52_500, allIn: false },
          { kind: 'half', total: 85_000, pay: 85_000, allIn: false },
          { kind: 'max', total: 120_000, pay: 120_000, allIn: true },
          { kind: 'die', total: 0, pay: 0, allIn: false },
        ],
        players: [
          hp('p0', { handBet: 20_000, roundBet: 10_000, cards: [hid(), c('1g', true)] }),
          hp('p1', { handBet: 30_000, roundBet: 20_000, cards: [hid(), c('10t', true)] }),
          hp('p2', { chips: 120_000, handBet: 10_000, roundBet: 0, cards: [c('3g'), c('7y', true)] }),
          hp('p3', { handBet: 10_000, roundBet: 0, cards: [hid(), c('4t', true)] }),
        ],
        result: null, deadline, intermission: null,
      };
      return withMe(r);
    }
    case 'bet2':
    case 'reconnect':
    case 'spectator': {
      const r = { ...base, players: four() };
      if (stage === 'spectator') r.players.push(player('p4'));
      if (stage === 'reconnect') r.players[3] = player('p3', { status: 'active', connected: false });
      // 1구 종료 판돈 150,000 → 2구: 민수 체크, 지영 삥 10,000, 현재 태호 차례
      r.hand = {
        no: 12, stage: 'bet2', regame: null, dealerId: 'p0', turnId: 'p3', lastAggressor: 'p1', pot: 160_000, carried: 40_000, cur: 10_000, legal: [],
        players: [
          hp('p0', { handBet: 30_000, roundBet: 0, cards: [hid(), c('1g', true), hid()] }),
          hp('p1', { handBet: 40_000, roundBet: 10_000, cards: [hid(), c('10t', true), hid()] }),
          hp('p2', { handBet: 30_000, roundBet: 0, cards: [c('3g'), c('7y', true), c('8g')] }),
          hp('p3', { handBet: 30_000, roundBet: 0, cards: [hid(), c('4t', true), hid()] }),
        ],
        result: null, deadline, intermission: null,
      };
      r.log = [...r.log, { ts: now - 30_000, text: '현우: 콜 20,000', kind: 'action' }, { ts: now - 25_000, text: '태호: 콜 20,000', kind: 'action' }, { ts: now - 20_000, text: '3번째 카드 분배', kind: 'hand' }, { ts: now - 15_000, text: '민수: 체크', kind: 'action' }, { ts: now - 10_000, text: '지영: 삥 10,000', kind: 'action' }];
      return withMe(r, stage === 'spectator' ? 'p4' : ME);
    }
    case 'select': {
      const r = { ...base, players: four({ p1: { status: 'folded' } }) };
      r.hand = {
        no: 12, stage: 'select', regame: null, dealerId: 'p0', turnId: null, lastAggressor: 'p1', pot: 200_000, carried: 40_000, cur: 0, legal: [],
        players: [
          hp('p0', { handBet: 50_000, hasSelected: true, cards: [hid(), c('1g', true), hid()] }),
          hp('p1', { handBet: 40_000, folded: true, cards: [hid(), c('10t', true), hid()] }),
          hp('p2', { handBet: 50_000, cards: [c('3g'), c('7y', true), c('8g')] }),
          hp('p3', { handBet: 50_000, cards: [hid(), c('4t', true), hid()] }),
        ],
        result: null, deadline, intermission: null,
      };
      return withMe(r);
    }
    case 'showdown': {
      // 현우(나) 땡잡이 성공: 민수 삥땡을 잡음. 태호 한끗. 지영 다이.
      const pot = 200_000;
      const r = { ...base, players: four({ p0: { chips: 1_200_000 }, p1: { status: 'folded' }, p2: { chips: 1_110_000 }, p3: { chips: 1_920_000 } }) };
      const reveals = { p0: { cards: ['1g', '1t'], hand: ev('1g', '1t') }, p2: { cards: ['3g', '7y'], hand: ev('3g', '7y') }, p3: { cards: ['4t', '7t'], hand: ev('4t', '7t') } };
      r.hand = {
        no: 12, stage: 'done', regame: null, dealerId: 'p0', turnId: null, lastAggressor: 'p1', pot, carried: 40_000, cur: 0, legal: [],
        players: [
          hp('p0', { chips: 1_200_000, handBet: 50_000, hasSelected: true, selected: null, cards: [c('1t', true), c('1g', true), hid()], reveal: reveals.p0 }),
          hp('p1', { handBet: 40_000, folded: true, cards: [hid(), c('10t', true), hid()] }),
          hp('p2', { chips: 1_110_000, handBet: 50_000, hasSelected: true, selected: [0, 1], cards: [c('3g'), c('7y', true), c('8g')], reveal: reveals.p2 }),
          hp('p3', { chips: 1_920_000, handBet: 50_000, hasSelected: true, cards: [hid(), c('4t', true), c('7t', true)], reveal: reveals.p3 }),
        ],
        result: {
          type: 'showdown', reason: null, winners: [ME], dealerNext: ME,
          pots: [{ amount: pot, eligible: ['p0', 'p2', 'p3'], winner: ME, tie: false, tied: [] }],
          payouts: { [ME]: pot }, reveals,
          specials: [{ id: ME, kind: 'ddaengjabi', success: true }],
          carriedNext: 0, regameNext: null, pot,
        },
        deadline: null,
        intermission: { until: now + 7000, regameNext: null, rejoinFee: 0, rejoinable: [], rejoined: [] },
      };
      r.log = [...r.log, { ts: now - 1000, text: '12번째 판 결과: 현우 승 (땡잡이 성공) +200,000', kind: 'result' }];
      return withMe(r);
    }
    case 'regame': {
      // 구사 재경기: 민수 구사 발동(태호 여덟끗), 나는 다이 → 재경기 참가 가능(이월 절반 지불)
      const pot = 200_000;
      const r = { ...base, players: four({ p1: { status: 'folded' }, p2: { status: 'folded' } }) };
      const reveals = { p0: { cards: ['4t', '9t'], hand: ev('4t', '9t') }, p3: { cards: ['2t', '6t'], hand: ev('2t', '6t') } };
      r.hand = {
        no: 12, stage: 'done', regame: null, dealerId: 'p0', turnId: null, lastAggressor: 'p3', pot, carried: 40_000, cur: 0, legal: [],
        players: [
          hp('p0', { handBet: 60_000, hasSelected: true, cards: [c('4t', true), c('9t', true), hid()], reveal: reveals.p0 }),
          hp('p1', { handBet: 20_000, folded: true, cards: [hid(), c('10t', true)] }),
          hp('p2', { handBet: 20_000, folded: true, cards: [c('3g'), c('7y', true)] }),
          hp('p3', { handBet: 60_000, hasSelected: true, cards: [hid(), c('2t', true), c('6t', true)], reveal: reveals.p3 }),
        ],
        result: {
          type: 'regame', reason: 'gusa', winners: [], dealerNext: null, pots: [], payouts: {}, reveals,
          specials: [{ id: 'p0', kind: 'gusa', success: true }],
          carriedNext: pot, regameNext: { reason: 'gusa', participants: ['p0', 'p3'] }, pot,
        },
        deadline: null,
        intermission: { until: now + 7000, regameNext: { reason: 'gusa', participants: ['p0', 'p3'] }, rejoinFee: 100_000, rejoinable: [ME, 'p1'], rejoined: ['p1'] },
      };
      r.log = [...r.log, { ts: now - 1000, text: '12번째 판 결과: 구사 — 재경기, 판돈 200,000 이월', kind: 'result' }];
      return withMe(r);
    }
    case 'foldwin': {
      const pot = 130_000;
      const r = { ...base, players: four({ p0: { chips: 1_350_000 }, p1: { status: 'folded' }, p2: { status: 'folded' }, p3: { status: 'folded' } }) };
      r.hand = {
        no: 12, stage: 'done', regame: null, dealerId: 'p0', turnId: null, lastAggressor: 'p0', pot, carried: 40_000, cur: 0, legal: [],
        players: [
          hp('p0', { chips: 1_350_000, handBet: 45_000, cards: [hid(), c('1g', true), hid()] }),
          hp('p1', { handBet: 20_000, folded: true, cards: [hid(), c('10t', true)] }),
          hp('p2', { handBet: 20_000, folded: true, cards: [c('3g'), c('7y', true), c('8g')] }),
          hp('p3', { handBet: 5_000, folded: true, cards: [hid(), c('4t', true), hid()] }),
        ],
        result: { type: 'fold', reason: null, winners: ['p0'], dealerNext: 'p0', pots: [{ amount: pot, eligible: ['p0'], winner: 'p0', tie: false, tied: [] }], payouts: { p0: pot }, reveals: {}, specials: [], carriedNext: 0, regameNext: null, pot },
        deadline: null,
        intermission: { until: now + 7000, regameNext: null, rejoinFee: 0, rejoinable: [], rejoined: [] },
      };
      return withMe(r);
    }
    case 'paused': {
      const r = { ...base, phase: 'paused', players: four({ p2: { chips: 640_000, canRefill: true } }) };
      r.waiting = { reason: 'paused', message: '방장이 게임을 일시정지했습니다' };
      return withMe(r);
    }
    default:
      return buildRoom('bet1', now);
  }
}

export class MockNet {
  constructor({ onMessage, onStatus, stage }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.stage = STAGES.includes(stage) ? stage : 'bet1';
    this.room = null;
    this.status = 'idle';
    this.timers = [];
    window.__mockGoto = (name) => this.goto(name);
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'n') this.goto(STAGES[(STAGES.indexOf(this.stage) + 1) % STAGES.length]);
      if (e.key === 'p') this.goto(STAGES[(STAGES.indexOf(this.stage) - 1 + STAGES.length) % STAGES.length]);
    });
  }

  connect() {
    this._status('connecting');
    this._later(() => this._status('open'), 30);
  }

  _status(s) {
    this.status = s;
    this.onStatus(s);
  }

  _later(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }

  _emit(msg) {
    this._later(() => this.onMessage(msg), 20);
  }

  _push() {
    this._emit({ t: 'state', room: this.room });
  }

  goto(name) {
    if (!STAGES.includes(name)) return;
    this.stage = name;
    if (name === 'reconnect') {
      this.room = buildRoom('bet2');
      this._push();
      this._later(() => this._status('reconnecting'), 100);
      return;
    }
    if (this.status !== 'open') this._status('open');
    this.room = buildRoom(name);
    this._push();
    // 콜아웃 데모: bet2 진입 시 지영 '삥' 이벤트
    if (name === 'bet2') this._later(() => this.onMessage({ t: 'event', ev: 'bet', playerId: 'p1', kind: 'bbing', pay: 10_000 }), 400);
    const u = new URL(location.href);
    u.searchParams.set('stage', name);
    history.replaceState(null, '', u);
  }

  send(msg) {
    if (!msg) return true;
    switch (msg.t) {
      case 'hello':
        this._emit({ t: 'hello_ok', token: 'deadbeefdeadbeefdeadbeefdeadbeef', playerId: this.stage === 'spectator' ? 'p4' : ME });
        this._later(() => this.goto(this.stage), 40);
        break;
      case 'create_room':
      case 'join_room':
        this._later(() => {
          this.goto('roomlobby');
          this.room.me.nickname = msg.nickname;
          this.room.players.find((p) => p.id === ME).nickname = msg.nickname;
          if (msg.t === 'create_room') this.room.settings = { ...this.room.settings, ...msg.settings, rules: { ...msg.settings.rules } };
          this._push();
        }, 200);
        break;
      case 'leave_room':
        this.room = null;
        this.stage = 'lobby';
        break;
      case 'action':
        if (this.stage === 'bet1') this._later(() => this.goto(msg.kind === 'die' ? 'foldwin' : 'bet2'), 300);
        else this._push();
        break;
      case 'open_choose':
        this._later(() => this.goto('bet1'), 300);
        break;
      case 'select':
        this._later(() => this.goto('showdown'), 300);
        break;
      case 'rejoin':
        if (this.room?.hand?.intermission) {
          const i = this.room.hand.intermission;
          i.rejoined = [...i.rejoined, this.room.me.id];
          this.room.me.chips -= i.rejoinFee;
          this.room.log = [...this.room.log, { ts: Date.now(), text: `${this.room.me.nickname}: 재경기 참가 (${i.rejoinFee.toLocaleString()} 지불)`, kind: 'action' }];
          this._push();
        }
        break;
      case 'refill':
        if (this.room) {
          const p = this.room.players.find((x) => x.id === this.room.me.id);
          p.chips = START;
          p.canRefill = false;
          p.ledger = { ...p.ledger, refills: p.ledger.refills + 1, buyIn: p.ledger.buyIn + START };
          this.room.me = p;
          this.room.log = [...this.room.log, { ts: Date.now(), text: `${p.nickname}: 리필`, kind: 'system' }];
          this._push();
          this._emit({ t: 'event', ev: 'refill', playerId: p.id });
        }
        break;
      case 'sit':
      case 'stand':
        if (this.room) {
          const p = this.room.players.find((x) => x.id === this.room.me.id);
          if (msg.t === 'sit') { p.seat = [0, 1, 2, 3, 4, 5].find((s) => !this.room.players.some((q) => q.seat === s)) ?? null; p.status = 'waiting'; }
          else { p.seat = null; p.status = 'spectating'; }
          this._push();
        }
        break;
      case 'chat':
        if (this.room) {
          this.room.chat = [...this.room.chat, { ts: Date.now(), from: this.room.me.nickname, fromId: this.room.me.id, text: msg.text }];
          this._push();
          // 상대 응답 흉내
          this._later(() => {
            if (!this.room) return;
            this.room.chat = [...this.room.chat, { ts: Date.now(), from: '태호', fromId: 'p3', text: '그러게요' }];
            this._push();
          }, 1500);
        }
        break;
      case 'host':
        if (!this.room) break;
        if (msg.cmd === 'start') this._later(() => this.goto('bet1'), 300);
        else if (msg.cmd === 'pause') this._later(() => this.goto('paused'), 200);
        else if (msg.cmd === 'resume') this._later(() => this.goto('bet2'), 200);
        else if (msg.cmd === 'kick') { this.room.players = this.room.players.filter((p) => p.id !== msg.playerId); this._push(); }
        else if (msg.cmd === 'transfer') { this.room.hostId = msg.playerId; for (const p of this.room.players) p.isHost = p.id === msg.playerId; this.room.me = this.room.players.find((p) => p.id === this.room.me.id); this._push(); }
        else if (msg.cmd === 'settings') { this.room.settings = { ...this.room.settings, ...msg.settings, rules: { ...msg.settings.rules } }; this._push(); }
        break;
      case 'ping':
        break;
      default:
        this._emit({ t: 'error', code: 'bad_request', message: `목: 알 수 없는 메시지 ${msg.t}` });
    }
    return true;
  }

  close() {
    for (const t of this.timers) clearTimeout(t);
    this._status('closed');
  }
}
