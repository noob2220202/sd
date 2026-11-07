// 실제 HTTP/WebSocket 서버를 임시 포트에 띄워 프로토콜 전체를 검증
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { config as baseConfig } from '../server/config.js';

let app;
let port;

before(async () => {
  app = createApp({ ...baseConfig, heartbeatMs: 60_000 });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  port = app.server.address().port;
});
after(async () => {
  await app.close();
});

class Client {
  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.msgs = [];
    this.waiters = [];
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      this.msgs.push(m);
      for (const w of [...this.waiters]) if (w.pred(m)) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve(m);
      }
    });
    this.opened = new Promise((r) => this.ws.on('open', r));
  }
  send(m) {
    this.ws.send(JSON.stringify(m));
  }
  /** pred 를 만족하는 다음 메시지(이미 받은 것 포함) */
  next(pred, timeout = 3000) {
    const found = this.msgs.find(pred);
    if (found) {
      this.msgs.splice(this.msgs.indexOf(found), 1);
      return Promise.resolve(found);
    }
    return new Promise((resolve, reject) => {
      const w = { pred: (m) => { const ok = pred(m); if (ok) this.msgs.splice(this.msgs.indexOf(m), 1); return ok; }, resolve };
      this.waiters.push(w);
      setTimeout(() => reject(new Error('timeout waiting for message')), timeout).unref();
    });
  }
  /** pred 를 만족하는 다음 state 스냅샷의 room */
  state(pred = () => true) {
    return this.next((m) => m.t === 'state' && pred(m.room)).then((m) => m.room);
  }
  close() {
    this.ws.close();
  }
}

async function hello(c, token) {
  await c.opened;
  c.send({ t: 'hello', ...(token ? { token } : {}) });
  return c.next((m) => m.t === 'hello_ok');
}

test('healthz', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test('/r/CODE 는 index.html 을 돌려준다 (SPA 라우팅)', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/r/ABCDEF`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('hello 전에 다른 메시지를 보내면 hello_first 에러', async () => {
  const c = new Client();
  await c.opened;
  c.send({ t: 'ping' });
  const e = await c.next((m) => m.t === 'error');
  assert.equal(e.code, 'hello_first');
  c.close();
});

test('방 생성 → 입장 → 시작 → 액션 → 재접속 복구 → 나가기', async () => {
  const a = new Client();
  const b = new Client();
  const ha = await hello(a);
  const hb = await hello(b);
  assert.match(ha.token, /^[0-9a-f]{32}$/);
  assert.equal(ha.room, null);

  a.send({ t: 'create_room', nickname: '철수', settings: { startChips: 100_000, base: 1_000, turnSeconds: 0 } });
  const sa = await a.state((r) => r && r.me && r.me.seat === 0);
  const code = sa.code;
  assert.match(code, /^[A-Z0-9]{6}$/);
  assert.equal(sa.hostId, ha.playerId);
  assert.equal(sa.settings.base, 1_000);

  b.send({ t: 'join_room', code: 'ZZZZZZ', nickname: '영희' });
  const e = await b.next((m) => m.t === 'error');
  assert.equal(e.code, 'room_not_found');

  b.send({ t: 'join_room', code: code.toLowerCase(), nickname: '영희' });
  const sb = await b.state((r) => r && r.me && r.me.seat === 1);
  assert.equal(sb.players.length, 2);

  // 방장이 아닌 사람이 start → forbidden
  b.send({ t: 'host', cmd: 'start' });
  assert.equal((await b.next((m) => m.t === 'error')).code, 'forbidden');

  a.send({ t: 'host', cmd: 'start' });
  const s1 = await b.state((r) => r && r.hand && r.hand.stage === 'bet1');
  assert.equal(s1.hand.turnId, ha.playerId);
  const mineB = s1.hand.players.find((p) => p.id === hb.playerId);
  assert.equal(typeof mineB.cards[0].id, 'string');
  const otherA = s1.hand.players.find((p) => p.id === ha.playerId);
  assert.equal(otherA.cards[0].hidden, true);
  assert.equal(otherA.cards[1].open, true);

  // 턴 아닌 사람의 액션 거절
  b.send({ t: 'action', handNo: 1, kind: 'check' });
  assert.equal((await b.next((m) => m.t === 'error')).code, 'not_your_turn');

  a.send({ t: 'action', handNo: 1, kind: 'bbing' });
  const s2 = await b.state((r) => r && r.hand && r.hand.turnId === hb.playerId);
  assert.equal(s2.hand.cur, 1_000);
  assert.ok(s2.hand.legal.some((l) => l.kind === 'call'));

  // B 재접속: 같은 토큰으로 새 소켓
  b.close();
  const b2 = new Client();
  const hb2 = await hello(b2, hb.token);
  assert.equal(hb2.playerId, hb.playerId);
  assert.equal(hb2.room, code);
  const s3 = await b2.state((r) => r && r.me && r.me.id === hb.playerId);
  assert.equal(s3.me.seat, 1);
  assert.equal(s3.hand.turnId, hb.playerId);
  assert.deepEqual(s3.hand.players.find((p) => p.id === hb.playerId).cards.map((c) => c.id), mineB.cards.map((c) => c.id));

  b2.send({ t: 'chat', text: '  안녕  ' });
  const ev = await a.next((m) => m.t === 'event' && m.ev === 'chat');
  assert.equal(ev.text, '안녕');

  b2.send({ t: 'leave_room' });
  const left = await b2.next((m) => m.t === 'state' && m.room === null);
  assert.equal(left.room, null);
  // 나간 뒤 방 메시지는 not_in_room
  b2.send({ t: 'refill' });
  assert.equal((await b2.next((m) => m.t === 'error')).code, 'not_in_room');
  const s4 = await a.state((r) => r && r.players.length === 1);
  assert.equal(s4.players[0].id, ha.playerId);
  a.close();
  b2.close();
});

test('잘못된 JSON / 알 수 없는 메시지 / 과속 요청 처리', async () => {
  const c = new Client();
  await hello(c);
  c.ws.send('not json');
  assert.equal((await c.next((m) => m.t === 'error')).code, 'bad_request');
  c.send({ t: 'nope' });
  assert.equal((await c.next((m) => m.t === 'error')).code, 'bad_request');
  for (let i = 0; i < 40; i++) c.send({ t: 'ping' });
  const lim = await c.next((m) => m.t === 'error' && m.code === 'rate_limited');
  assert.equal(lim.code, 'rate_limited');
  c.close();
});
