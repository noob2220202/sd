// 섯다용 화투 20장 정의 (1~10월, 월별 2장). 서버/클라이언트 공용. 의존성 없음.
// kind: 'g' = 광, 'y' = 열끗, 't' = 띠

export const MONTH_NAMES = {
  1: '송학', 2: '매조', 3: '벚꽃', 4: '흑싸리', 5: '난초',
  6: '모란', 7: '홍싸리', 8: '공산', 9: '국진', 10: '단풍',
};

export const KIND_NAMES = { g: '광', y: '열끗', t: '띠' };

/** @type {{id:string, month:number, kind:'g'|'y'|'t', name:string, label:string}[]} */
export const DECK = [
  { id: '1g', month: 1, kind: 'g', name: '송학 광', label: '학' },
  { id: '1t', month: 1, kind: 't', name: '송학 띠', label: '홍단' },
  { id: '2y', month: 2, kind: 'y', name: '매조 열끗', label: '새' },
  { id: '2t', month: 2, kind: 't', name: '매조 띠', label: '홍단' },
  { id: '3g', month: 3, kind: 'g', name: '벚꽃 광', label: '휘장' },
  { id: '3t', month: 3, kind: 't', name: '벚꽃 띠', label: '홍단' },
  { id: '4y', month: 4, kind: 'y', name: '흑싸리 열끗', label: '두견새' },
  { id: '4t', month: 4, kind: 't', name: '흑싸리 띠', label: '초단' },
  { id: '5y', month: 5, kind: 'y', name: '난초 열끗', label: '다리' },
  { id: '5t', month: 5, kind: 't', name: '난초 띠', label: '초단' },
  { id: '6y', month: 6, kind: 'y', name: '모란 열끗', label: '나비' },
  { id: '6t', month: 6, kind: 't', name: '모란 띠', label: '청단' },
  { id: '7y', month: 7, kind: 'y', name: '홍싸리 열끗', label: '멧돼지' },
  { id: '7t', month: 7, kind: 't', name: '홍싸리 띠', label: '초단' },
  { id: '8g', month: 8, kind: 'g', name: '공산 광', label: '달' },
  { id: '8y', month: 8, kind: 'y', name: '공산 열끗', label: '기러기' },
  { id: '9y', month: 9, kind: 'y', name: '국진 열끗', label: '술잔' },
  { id: '9t', month: 9, kind: 't', name: '국진 띠', label: '청단' },
  { id: '10y', month: 10, kind: 'y', name: '단풍 열끗', label: '사슴' },
  { id: '10t', month: 10, kind: 't', name: '단풍 띠', label: '청단' },
];

const BY_ID = new Map(DECK.map((c) => [c.id, c]));

/** 카드 ID → 카드 객체. 모르는 ID면 undefined. */
export function cardById(id) {
  return BY_ID.get(id);
}

/** 카드 ID 유효성 */
export function isCardId(id) {
  return typeof id === 'string' && BY_ID.has(id);
}

/** 월 숫자 → 한글 월 표기 (예: 10 → '십월'은 쓰지 않고 '10월') */
export function monthLabel(month) {
  return `${month}월`;
}
