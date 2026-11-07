// 방 생성/조회/정리
import { randomInt } from 'node:crypto';
import { Room } from './room.js';

// 혼동되는 문자(0,O,1,I,L) 제외
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export function normalizeCode(code) {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 6 ? c : null;
}

export class RoomManager {
  constructor(config) {
    this.config = config;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** 토큰 → {playerId, roomCode} (재접속 복구용) */
    this.sessions = new Map();
    this.sweep = setInterval(() => this.sweepIdle(), 60_000);
    this.sweep.unref?.();
  }

  size() {
    return this.rooms.size;
  }

  create(settings, hostPlayer) {
    if (this.rooms.size >= this.config.maxRooms) {
      const err = new Error('방이 너무 많습니다. 잠시 후 다시 시도하세요.');
      err.code = 'too_many_rooms';
      throw err;
    }
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();
    const room = new Room(code, settings, hostPlayer, this.config, () => this.remove(code));
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    const c = normalizeCode(code);
    return c ? this.rooms.get(c) ?? null : null;
  }

  remove(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    room.destroy();
    for (const [token, s] of this.sessions) if (s.roomCode === code) this.sessions.delete(token);
  }

  setSession(token, playerId, roomCode) {
    this.sessions.set(token, { playerId, roomCode });
  }

  clearSession(token) {
    this.sessions.delete(token);
  }

  /** 토큰으로 (아직 존재하는) 방을 찾는다 */
  sessionRoom(token) {
    const s = this.sessions.get(token);
    if (!s) return null;
    const room = this.rooms.get(s.roomCode);
    if (!room || !room.player(s.playerId)) {
      this.sessions.delete(token);
      return null;
    }
    return room;
  }

  sweepIdle() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.connectedCount() === 0 && now - room.lastActivity > this.config.roomIdleMs) {
        this.remove(code);
      }
    }
  }

  destroyAll() {
    clearInterval(this.sweep);
    for (const code of [...this.rooms.keys()]) this.remove(code);
  }
}
