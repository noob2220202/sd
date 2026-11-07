// WebSocket 연결 1개의 생애주기: hello/토큰 → 방 생성/입장 → 방 메시지 라우팅 → 끊김 처리
import { randomBytes, createHash } from 'node:crypto';
import { validateMessage } from './protocol.js';

const HELLO_TIMEOUT_MS = 10_000;

export function playerIdFromToken(token) {
  return 'p_' + createHash('sha256').update(token).digest('hex').slice(0, 16);
}

export function attachConnection(ws, req, rooms, config) {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const state = { token: null, playerId: null, room: null };
  const bucket = { tokens: config.msgRateLimit, last: Date.now() };

  const send = (obj) => {
    try {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    } catch { /* ignore */ }
  };
  const sendError = (code, message) => send({ t: 'error', code, message });

  const helloTimer = setTimeout(() => {
    if (!state.token) {
      try { ws.close(4000, 'hello timeout'); } catch { /* ignore */ }
    }
  }, HELLO_TIMEOUT_MS);

  const currentRoom = () => {
    const r = state.room;
    if (!r) return null;
    if (r.destroyed || !r.player(state.playerId)) {
      // 강퇴/방 소멸 등으로 더는 그 방에 없음
      state.room = null;
      rooms.clearSession(state.token);
      return null;
    }
    return r;
  };

  const leaveCurrent = () => {
    const r = currentRoom();
    if (r) r.leave(state.playerId);
    state.room = null;
    rooms.clearSession(state.token);
  };

  ws.on('message', (raw) => {
    // 간단한 토큰 버킷 (초당 config.msgRateLimit)
    const now = Date.now();
    bucket.tokens = Math.min(config.msgRateLimit, bucket.tokens + ((now - bucket.last) / 1000) * config.msgRateLimit);
    bucket.last = now;
    if (bucket.tokens < 1) return sendError('rate_limited', '요청이 너무 많습니다');
    bucket.tokens -= 1;

    let obj;
    try {
      obj = JSON.parse(raw.toString('utf8'));
    } catch {
      return sendError('bad_request', 'JSON 형식 오류');
    }
    const v = validateMessage(obj);
    if (!v.ok) return sendError(v.error.code, v.error.message);
    const msg = v.msg;

    if (msg.t === 'hello') {
      clearTimeout(helloTimer);
      state.token = msg.token || randomBytes(16).toString('hex');
      state.playerId = playerIdFromToken(state.token);
      const existing = rooms.sessionRoom(state.token);
      send({ t: 'hello_ok', token: state.token, playerId: state.playerId, room: existing ? existing.code : null });
      if (existing) {
        state.room = existing;
        existing.attach(state.playerId, ws); // 재접속 → 방이 상태를 브로드캐스트
      }
      return;
    }
    if (!state.token) return sendError('hello_first', '먼저 hello 를 보내야 합니다');

    switch (msg.t) {
      case 'ping':
        return send({ t: 'pong' });
      case 'create_room': {
        leaveCurrent();
        let room;
        try {
          room = rooms.create(msg.settings, { id: state.playerId, nickname: msg.nickname });
        } catch (e) {
          return sendError(e.code || 'bad_request', e.message);
        }
        state.room = room;
        rooms.setSession(state.token, state.playerId, room.code);
        room.attach(state.playerId, ws);
        return;
      }
      case 'join_room': {
        const room = rooms.get(msg.code);
        if (!room) return sendError('room_not_found', '방을 찾을 수 없습니다');
        if (currentRoom() && state.room !== room) leaveCurrent();
        state.room = room;
        rooms.setSession(state.token, state.playerId, room.code);
        room.join(state.playerId, msg.nickname, ws);
        return;
      }
      case 'leave_room': {
        leaveCurrent();
        return send({ t: 'state', room: null });
      }
      default:
        break;
    }

    const room = currentRoom();
    if (!room) return sendError('not_in_room', '방에 들어가 있지 않습니다');
    let res;
    switch (msg.t) {
      case 'sit':
        res = room.sit(state.playerId);
        break;
      case 'stand':
        res = room.stand(state.playerId);
        break;
      case 'action':
        res = room.action(state.playerId, msg.handNo, msg.kind);
        break;
      case 'open_choose':
        res = room.chooseOpen(state.playerId, msg.handNo, msg.idx);
        break;
      case 'select':
        res = room.select(state.playerId, msg.handNo, msg.idx);
        break;
      case 'rejoin':
        res = room.rejoin(state.playerId);
        break;
      case 'refill':
        res = room.refill(state.playerId);
        break;
      case 'chat':
        res = room.chatMessage(state.playerId, msg.text);
        break;
      case 'host':
        res = room.hostCommand(state.playerId, msg);
        break;
      default:
        res = { ok: false, error: { code: 'bad_request', message: '알 수 없는 메시지' } };
    }
    if (res && !res.ok) sendError(res.error.code, res.error.message);
  });

  ws.on('close', () => {
    clearTimeout(helloTimer);
    const r = state.room;
    if (r && !r.destroyed) r.detach(state.playerId, ws);
  });

  ws.on('error', () => {
    /* close 가 이어서 호출됨 */
  });
}
