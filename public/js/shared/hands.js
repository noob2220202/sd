// 섯다 족보 평가 — 서버/클라이언트 공용 순수 모듈.
// 특수족보(땡잡이/암행어사/구사/멍텅구리구사)의 "효과"는 resolveShowdown 에서 처리하고,
// evaluate 는 기본 족보(rank)와 특수족보 후보 플래그만 계산한다.
import { cardById } from './cards.js';

// ---- 기본 족보 랭크 ----------------------------------------------------------
// 끗 0..9 → 0..9 / 세륙 10, 장사 11, 장삥 12, 구삥 13, 독사 14, 알리 15 / 땡 n → 20+n / 13광땡 31, 18광땡 32, 38광땡 33
export const RANK = Object.freeze({
  MANGTONG: 0,
  GABO: 9,
  SERYUK: 10,
  JANGSA: 11,
  JANGBBING: 12,
  GUBBING: 13,
  DOKSA: 14,
  ALLI: 15,
  DDAENG_BASE: 20, // n땡 = 20 + n (1..10)
  GWANG_13: 31,
  GWANG_18: 32,
  GWANG_38: 33,
});

const KKEUT_NAMES = ['망통', '한끗', '두끗', '세끗', '네끗', '다섯끗', '여섯끗', '일곱끗', '여덟끗', '갑오'];
const SPECIAL_PAIRS = new Map([
  ['1-2', { rank: RANK.ALLI, name: '알리' }],
  ['1-4', { rank: RANK.DOKSA, name: '독사' }],
  ['1-9', { rank: RANK.GUBBING, name: '구삥' }],
  ['1-10', { rank: RANK.JANGBBING, name: '장삥' }],
  ['4-10', { rank: RANK.JANGSA, name: '장사' }],
  ['4-6', { rank: RANK.SERYUK, name: '세륙' }],
]);

/**
 * 특수족보를 이루는 "정확한 카드" 정의.
 *  - 배열이면 그 카드 ID 조합만 인정, 'any' 면 해당 월의 어느 카드든 인정.
 *  docs/RULES.md 의 확정값과 일치해야 한다.
 */
export const SPECIAL_DEFS = Object.freeze({
  ddaengjabi: { months: [3, 7], cards: [['3g', '7y']] }, // 땡잡이: 3월 광 + 7월 열끗(멧돼지). 다른 3·7 조합은 그냥 망통
  amhaeng: { months: [4, 7], cards: [['4y', '7y']] },    // 암행어사: 4월 열끗(두견새) + 7월 열끗(멧돼지)
  gusa: { months: [4, 9], cards: 'any' },                // 구사: 4월 + 9월 (멍텅구리구사 조합 제외)
  mungGusa: { months: [4, 9], cards: [['4y', '9y']] },   // 멍텅구리구사: 4월 열끗 + 9월 열끗
});

function toCard(c) {
  if (typeof c === 'string') {
    const card = cardById(c);
    if (!card) throw new Error(`알 수 없는 카드: ${c}`);
    return card;
  }
  if (!c || typeof c.month !== 'number') throw new Error('카드 형식 오류');
  return c;
}

function matchesDef(def, a, b) {
  const [m1, m2] = def.months;
  const monthsOk = (a.month === m1 && b.month === m2) || (a.month === m2 && b.month === m1);
  if (!monthsOk) return false;
  if (def.cards === 'any') return true;
  return def.cards.some(([x, y]) => (a.id === x && b.id === y) || (a.id === y && b.id === x));
}

/**
 * 2장 평가.
 * @returns {{rank:number, category:'gwangddaeng'|'ddaeng'|'special'|'kkeut', name:string, kkeut:number,
 *            months:[number,number], cards:[string,string], flags:{ddaengjabi?:true, amhaeng?:true, gusa?:true, mungGusa?:true}}}
 */
export function evaluate(cardA, cardB) {
  const a = toCard(cardA);
  const b = toCard(cardB);
  if (a.id === b.id) throw new Error('같은 카드 두 장은 평가할 수 없습니다');
  const lo = Math.min(a.month, b.month);
  const hi = Math.max(a.month, b.month);
  const kkeut = (a.month + b.month) % 10;
  const flags = {};
  const base = { kkeut, months: [lo, hi], cards: [a.id, b.id], flags };

  if (a.month === b.month) {
    if (a.kind === 'g' && b.kind === 'g') {
      // 같은 월에 광이 두 장인 경우는 없음(1,3,8월은 광 1장) — 방어적 처리
    }
    const n = a.month;
    if (n === 10) return { ...base, rank: RANK.DDAENG_BASE + 10, category: 'ddaeng', name: '장땡' };
    if (n === 1) return { ...base, rank: RANK.DDAENG_BASE + 1, category: 'ddaeng', name: '삥땡' };
    return { ...base, rank: RANK.DDAENG_BASE + n, category: 'ddaeng', name: `${n}땡` };
  }

  // 광땡
  if (a.kind === 'g' && b.kind === 'g') {
    const key = `${lo}${hi}`;
    if (key === '38') return { ...base, rank: RANK.GWANG_38, category: 'gwangddaeng', name: '38광땡' };
    if (key === '18') return { ...base, rank: RANK.GWANG_18, category: 'gwangddaeng', name: '18광땡' };
    if (key === '13') return { ...base, rank: RANK.GWANG_13, category: 'gwangddaeng', name: '13광땡' };
  }

  // 특수족보 후보 플래그
  if (matchesDef(SPECIAL_DEFS.mungGusa, a, b)) flags.mungGusa = true;
  else if (matchesDef(SPECIAL_DEFS.gusa, a, b)) flags.gusa = true;
  if (matchesDef(SPECIAL_DEFS.amhaeng, a, b)) flags.amhaeng = true;
  if (matchesDef(SPECIAL_DEFS.ddaengjabi, a, b)) flags.ddaengjabi = true;

  const sp = SPECIAL_PAIRS.get(`${lo}-${hi}`);
  if (sp) return { ...base, rank: sp.rank, category: 'special', name: sp.name };

  return { ...base, rank: kkeut, category: 'kkeut', name: KKEUT_NAMES[kkeut] };
}

/** 기본 랭크 비교: a>b → 1, a<b → -1, 같으면 0 */
export function compare(a, b) {
  return a.rank > b.rank ? 1 : a.rank < b.rank ? -1 : 0;
}

export function isDdaeng(h) {
  return h.category === 'ddaeng';
}
export function isGwangDdaeng(h) {
  return h.category === 'gwangddaeng';
}

/** 3장 중 기본 랭크가 가장 높은 2장 조합의 인덱스 [i, j] (i<j). 동률이면 앞쪽 조합. */
export function bestPair(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) throw new Error('3장이 필요합니다');
  let best = null;
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
    const h = evaluate(cards[i], cards[j]);
    if (!best || h.rank > best.h.rank) best = { idx: [i, j], h };
  }
  return best.idx;
}

/** 3장의 세 조합 전부 평가 (클라이언트 미리보기용) */
export function allPairs(cards) {
  return [[0, 1], [0, 2], [1, 2]].map(([i, j]) => ({ idx: [i, j], hand: evaluate(cards[i], cards[j]) }));
}

// ---- 쇼다운 해결 ----------------------------------------------------------------
export const DEFAULT_RULES = Object.freeze({ ddaengjabi: true, amhaeng: true, gusa: true, mungGusa: true });

// 특수족보가 "발동"했을 때의 유효 랭크 (한게임 규칙)
//  - 땡잡이: 상대 중 1~9땡이 있으면 9땡과 장땡 사이 → 29.5. 없으면 망통(0)
//  - 암행어사: 상대 중 13·18광땡이 있으면 38광땡 바로 아래 → 32.5. 없으면 한끗(1)
export const EFFECTIVE_RANK = Object.freeze({ DDAENGJABI: RANK.DDAENG_BASE + 9.5, AMHAENG: RANK.GWANG_38 - 0.5 });

/** 랭크가 1~9땡 범위인지 */
function isLowDdaeng(rank) {
  return rank >= RANK.DDAENG_BASE + 1 && rank <= RANK.DDAENG_BASE + 9;
}

/**
 * 쇼다운 참가자들의 최종 2장으로 승자를 결정한다.
 *
 * 알고리즘(docs/RULES.md):
 *  1) 각자 기본 족보(rank) 계산.
 *  2) 유효 랭크: 땡잡이는 "다른 참가자 중 1~9땡이 있으면" 29.5, 암행어사는 "다른 참가자 중 13·18광땡이 있으면" 32.5.
 *     그 외 특수족보는 자기 끗(땡잡이 망통, 암행어사 한끗, 구사 세끗).
 *  3) 구사: 다른 참가자들의 최고 유효 랭크가 알리 이하(땡 미만)이면 재경기.
 *     멍텅구리구사: 다른 참가자들의 최고 유효 랭크가 9땡 이하(장땡·광땡 없음)이면 재경기.
 *  4) 유효 랭크 최고가 1명이면 승자, 2명 이상이면 동점 재경기(동점자 = tied).
 *
 * @param {{id:string, cards:[any,any]}[]} entries
 * @param {{ddaengjabi?:boolean, amhaeng?:boolean, gusa?:boolean, mungGusa?:boolean}} rules
 * @returns {{regame:boolean, reason:null|'gusa'|'mung_gusa'|'tie', winners:string[], tied:string[],
 *            hands:Record<string, object>, effective:Record<string, number>,
 *            specials:{id:string, kind:string, success:boolean}[]}}
 */
export function resolveShowdown(entries, rules = DEFAULT_RULES) {
  const r = { ...DEFAULT_RULES, ...(rules || {}) };
  const hands = {};
  for (const e of entries) hands[e.id] = evaluate(e.cards[0], e.cards[1]);
  const ids = entries.map((e) => e.id);
  const specials = [];
  const effective = {};
  for (const id of ids) effective[id] = hands[id].rank;

  if (ids.length === 0) return { regame: false, reason: null, winners: [], tied: [], hands, effective, specials };
  if (ids.length === 1) return { regame: false, reason: null, winners: [ids[0]], tied: [], hands, effective, specials };

  const othersBase = (id) => ids.filter((x) => x !== id).map((x) => hands[x].rank);

  // 2) 땡잡이 / 암행어사 유효 랭크
  for (const id of ids) {
    const h = hands[id];
    if (r.ddaengjabi && h.flags.ddaengjabi) {
      const ok = othersBase(id).some(isLowDdaeng);
      specials.push({ id, kind: 'ddaengjabi', success: ok });
      if (ok) effective[id] = EFFECTIVE_RANK.DDAENGJABI;
    }
    if (r.amhaeng && h.flags.amhaeng) {
      const ok = othersBase(id).some((rk) => rk === RANK.GWANG_13 || rk === RANK.GWANG_18);
      specials.push({ id, kind: 'amhaeng', success: ok });
      if (ok) effective[id] = EFFECTIVE_RANK.AMHAENG;
    }
  }

  const bestOfOthers = (id) => Math.max(...ids.filter((x) => x !== id).map((x) => effective[x]));

  // 3) 구사 / 멍텅구리구사 → 재경기
  for (const id of ids) {
    const h = hands[id];
    if (r.mungGusa && h.flags.mungGusa) {
      const ok = bestOfOthers(id) <= RANK.DDAENG_BASE + 9; // 9땡 이하
      specials.push({ id, kind: 'mungGusa', success: ok });
      if (ok) return { regame: true, reason: 'mung_gusa', winners: [], tied: ids.slice(), hands, effective, specials };
    } else if (r.gusa && (h.flags.gusa || (h.flags.mungGusa && !r.mungGusa))) {
      const ok = bestOfOthers(id) <= RANK.ALLI; // 알리 이하(땡 미만)
      specials.push({ id, kind: 'gusa', success: ok });
      if (ok) return { regame: true, reason: 'gusa', winners: [], tied: ids.slice(), hands, effective, specials };
    }
  }

  // 4) 유효 랭크 비교
  const top = Math.max(...ids.map((id) => effective[id]));
  const winners = ids.filter((id) => effective[id] === top);
  if (winners.length > 1) return { regame: true, reason: 'tie', winners: [], tied: winners, hands, effective, specials };
  return { regame: false, reason: null, winners, tied: [], hands, effective, specials };
}
