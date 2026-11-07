// 클라이언트 → 서버 메시지 검증. 잘못된 메시지는 {ok:false, error} 로 거절.
import { isCardId } from '../../public/js/shared/cards.js';

export const ACTION_KINDS = ['check', 'bbing', 'call', 'ddadang', 'quarter', 'half', 'max', 'allin', 'die'];
export const HOST_CMDS = ['start', 'pause', 'resume', 'kick', 'settings', 'transfer'];

export const LIMITS = {
  nickname: 12,
  chat: 200,
  code: 6,
};

const SETTINGS_SCHEMA = {
  startChips: { type: 'int', min: 1_000, max: 1_000_000_000_000 },
  base: { type: 'int', min: 1, max: 1_000_000_000_000 },
  maxPlayers: { type: 'int', min: 2, max: 6 },
  turnSeconds: { type: 'enum', values: [0, 15, 30, 60] },
  refill: { type: 'enum', values: ['off', 'manual', 'auto'] },
  maxRaises: { type: 'int', min: 0, max: 20 },
  openCard: { type: 'enum', values: ['second', 'choose'] },
  allInFrom: { type: 'enum', values: ['bet1', 'bet2', 'off'] },
  dealerRule: { type: 'enum', values: ['winner', 'rotate'] },
  regameRejoin: { type: 'bool' },
  rules: { type: 'rules' },
};
const RULE_KEYS = ['ddaengjabi', 'amhaeng', 'gusa', 'mungGusa'];

export const DEFAULT_SETTINGS = Object.freeze({
  startChips: 1_000_000,
  base: 10_000,
  maxPlayers: 6,
  turnSeconds: 30,
  refill: 'manual',
  maxRaises: 0,
  openCard: 'second',
  allInFrom: 'bet2',
  dealerRule: 'winner',
  regameRejoin: true,
  rules: Object.freeze({ ddaengjabi: true, amhaeng: true, gusa: true, mungGusa: true }),
});

/** 부분 설정을 검증·정규화해 완전한 설정 객체로 만든다. 잘못된 값은 에러. */
export function normalizeSettings(input, basis = DEFAULT_SETTINGS) {
  const out = { ...basis, rules: { ...basis.rules } };
  if (input == null) return out;
  if (typeof input !== 'object') throw bad('settings 형식이 잘못되었습니다');
  for (const [key, spec] of Object.entries(SETTINGS_SCHEMA)) {
    if (!(key in input)) continue;
    const v = input[key];
    if (spec.type === 'int') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < spec.min || n > spec.max) throw bad(`${key} 값이 범위를 벗어났습니다`);
      out[key] = n;
    } else if (spec.type === 'enum') {
      if (!spec.values.includes(v)) throw bad(`${key} 값이 잘못되었습니다`);
      out[key] = v;
    } else if (spec.type === 'bool') {
      out[key] = Boolean(v);
    } else if (spec.type === 'rules') {
      if (typeof v !== 'object' || v === null) throw bad('rules 형식이 잘못되었습니다');
      for (const rk of RULE_KEYS) if (rk in v) out.rules[rk] = Boolean(v[rk]);
    }
  }
  if (out.base > out.startChips) throw bad('삥(기본 베팅액)은 시작 칩보다 작아야 합니다');
  return out;
}

export function sanitizeNickname(raw) {
  if (typeof raw !== 'string') return null;
  // 제어문자 제거, 공백 정리
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length < 1 || s.length > LIMITS.nickname) return null;
  return s;
}

export function sanitizeChat(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (s.length < 1) return null;
  return s.slice(0, LIMITS.chat);
}

/** 수신 메시지 1차 검증. 통과하면 {ok:true, msg}, 아니면 {ok:false, error} */
export function validateMessage(raw) {
  if (typeof raw !== 'object' || raw === null || typeof raw.t !== 'string') return reject('bad_request', '메시지 형식 오류');
  const m = raw;
  switch (m.t) {
    case 'hello':
      if (m.token != null && !/^[0-9a-f]{32}$/.test(String(m.token))) return reject('bad_request', '토큰 형식 오류');
      return accept(m);
    case 'ping':
    case 'leave_room':
    case 'sit':
    case 'stand':
    case 'refill':
      return accept(m);
    case 'create_room': {
      const nickname = sanitizeNickname(m.nickname);
      if (!nickname) return reject('bad_request', '닉네임은 1~12자');
      try {
        return accept({ t: 'create_room', nickname, settings: normalizeSettings(m.settings) });
      } catch (e) {
        return reject('bad_request', e.message);
      }
    }
    case 'join_room': {
      const nickname = sanitizeNickname(m.nickname);
      if (!nickname) return reject('bad_request', '닉네임은 1~12자');
      if (typeof m.code !== 'string') return reject('bad_request', '방 코드 형식 오류');
      return accept({ t: 'join_room', nickname, code: m.code });
    }
    case 'action':
      if (!ACTION_KINDS.includes(m.kind)) return reject('bad_request', '알 수 없는 액션');
      if (!Number.isInteger(m.handNo)) return reject('bad_request', 'handNo 누락');
      return accept({ t: 'action', kind: m.kind, handNo: m.handNo });
    case 'open_choose':
      if (!Number.isInteger(m.handNo)) return reject('bad_request', 'handNo 누락');
      if (m.idx !== 0 && m.idx !== 1) return reject('bad_request', '공개 카드 선택 형식 오류');
      return accept({ t: 'open_choose', handNo: m.handNo, idx: m.idx });
    case 'rejoin':
      return accept({ t: 'rejoin' });
    case 'select': {
      if (!Number.isInteger(m.handNo)) return reject('bad_request', 'handNo 누락');
      const idx = Array.isArray(m.idx) ? m.idx.map(Number) : null;
      if (!idx || idx.length !== 2 || idx.some((i) => ![0, 1, 2].includes(i)) || idx[0] === idx[1])
        return reject('bad_request', '카드 선택 형식 오류');
      return accept({ t: 'select', handNo: m.handNo, idx: [idx[0], idx[1]] });
    }
    case 'chat': {
      const text = sanitizeChat(m.text);
      if (!text) return reject('bad_request', '빈 메시지');
      return accept({ t: 'chat', text });
    }
    case 'host': {
      if (!HOST_CMDS.includes(m.cmd)) return reject('bad_request', '알 수 없는 방장 명령');
      const out = { t: 'host', cmd: m.cmd };
      if (m.cmd === 'kick' || m.cmd === 'transfer') {
        if (typeof m.playerId !== 'string' || m.playerId.length > 64) return reject('bad_request', 'playerId 오류');
        out.playerId = m.playerId;
      }
      if (m.cmd === 'settings') out.settings = m.settings ?? {};
      return accept(out);
    }
    default:
      return reject('bad_request', `알 수 없는 메시지: ${m.t}`);
  }
}

function accept(msg) {
  return { ok: true, msg };
}
function reject(code, message) {
  return { ok: false, error: { code, message } };
}
function bad(message) {
  const e = new Error(message);
  e.code = 'bad_request';
  return e;
}

export { isCardId };
