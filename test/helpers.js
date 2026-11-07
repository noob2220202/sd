// 테스트 보조: 가짜 시계 / 가짜 소켓 / Room 생성
import { Room } from '../server/net/room.js';
import { DEFAULT_SETTINGS } from '../server/net/protocol.js';

export class FakeClock {
  constructor(start = 1_700_000_000_000) {
    this.t = start;
    this.timers = [];
    this.seq = 0;
  }
  now = () => this.t;
  setTimeout = (fn, ms) => {
    const h = { id: ++this.seq, at: this.t + ms, fn, unref() {} };
    this.timers.push(h);
    return h;
  };
  clearTimeout = (h) => {
    this.timers = this.timers.filter((x) => x !== h);
  };
  /** 시간을 ms 만큼 진행하며 만기 타이머를 순서대로 실행 */
  advance(ms) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((h) => h.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.t = due.at;
      this.timers = this.timers.filter((x) => x !== due);
      due.fn();
    }
    this.t = end;
  }
}

export class FakeSocket {
  constructor() {
    this.readyState = 1;
    this.sent = [];
    this.closed = false;
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  /** 마지막 state 스냅샷 */
  lastState() {
    for (let i = this.sent.length - 1; i >= 0; i--) if (this.sent[i].t === 'state') return this.sent[i].room;
    return null;
  }
  events(ev) {
    return this.sent.filter((m) => m.t === 'event' && (!ev || m.ev === ev));
  }
}

export const TEST_CONFIG = { disconnectGraceMs: 10 * 60 * 1000, roomIdleMs: 2 * 60 * 60 * 1000 };

/** Room + 플레이어 N명(소켓 포함) 생성. decks: handNo → 덱 */
export function makeRoom({ settings = {}, players = ['A', 'B', 'C'], decks = {}, clock = new FakeClock(), onEmpty = () => {} } = {}) {
  const sockets = {};
  const s = { ...DEFAULT_SETTINGS, startChips: 10_000, base: 100, turnSeconds: 30, ...settings };
  const room = new Room('TEST01', s, { id: players[0], nickname: players[0] }, TEST_CONFIG, onEmpty, {
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    deckProvider: (no) => decks[no] || null,
  });
  sockets[players[0]] = new FakeSocket();
  room.attach(players[0], sockets[players[0]]);
  for (const id of players.slice(1)) {
    sockets[id] = new FakeSocket();
    room.join(id, id, sockets[id]);
  }
  return { room, sockets, clock };
}

/** 덱 생성: firsts/seconds/thirds 는 참가자 좌석 순 */
export const deckFor = (firsts, seconds, thirds) => [...firsts, ...seconds, ...thirds];
