// 한국어 UI 문구/상수 모음. 서버의 DEFAULT_SETTINGS 와 동일한 기본값을 유지한다.

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

/** 액션 버튼 표시 순서 및 라벨 */
export const ACTION_ORDER = ['die', 'check', 'bbing', 'call', 'ddadang', 'quarter', 'half', 'max', 'allin'];
export const ACTION_LABELS = Object.freeze({
  die: '다이', check: '체크', bbing: '삥', call: '콜', ddadang: '따당',
  quarter: '쿼터', half: '하프', max: '맥스', allin: '올인',
});

export const STAGE_LABELS = Object.freeze({
  open: '공개 카드 선택', bet1: '1구 베팅', bet2: '2구 베팅', select: '최종 패 선택', done: '승부',
});

export const STATUS_LABELS = Object.freeze({
  spectating: '관전', waiting: '대기', active: '', folded: '다이', allin: '올인', sitout: '대기',
});

export const SPECIAL_LABELS = Object.freeze({
  ddaengjabi: '땡잡이', amhaeng: '암행어사', gusa: '구사', mungGusa: '멍텅구리구사', mung_gusa: '멍텅구리구사',
});

/** 특수족보 효과가 없을 때의 결과 족보 */
export const SPECIAL_FALLBACK = Object.freeze({ ddaengjabi: '망통', amhaeng: '한끗', gusa: '세끗', mungGusa: '세끗' });

export const REGAME_REASON = Object.freeze({ tie: '동점', gusa: '구사', mung_gusa: '멍텅구리구사' });

export const CONN_LABELS = Object.freeze({
  idle: '연결 중', connecting: '연결 중', reconnecting: '재접속 중', open: '연결됨', closed: '연결 끊김',
});

export const SETTINGS_OPTIONS = Object.freeze({
  turnSeconds: [[0, '없음'], [15, '15초'], [30, '30초'], [60, '60초']],
  refill: [['off', '끄기'], ['manual', '수동'], ['auto', '자동']],
  openCard: [['second', '2번째 카드 자동 공개'], ['choose', '직접 선택(한게임식)']],
  allInFrom: [['bet1', '1구부터'], ['bet2', '2구부터'], ['off', '끄기']],
  dealerRule: [['winner', '직전 판 승자'], ['rotate', '매판 시계방향 이동']],
});

export const SETTINGS_LABELS = Object.freeze({
  startChips: '시작 칩', base: '삥(기본 베팅액)', maxPlayers: '최대 인원', turnSeconds: '턴 제한시간',
  refill: '리필', maxRaises: '레이즈 횟수 상한', openCard: '공개 카드', allInFrom: '올인 허용',
  dealerRule: '선(보스) 규칙', regameRejoin: '구사 재경기 참가 허용',
});

export const ATTRIBUTION = Object.freeze({
  title: '에셋 출처 및 라이선스',
  sections: [
    {
      heading: '화투 카드 이미지',
      lines: [
        '출처: Wikimedia Commons, Category "SVG Hwatu" — 작가 Spenĉjo (자작, Own work)',
        '라이선스: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)',
        '표기: "Hwatu card images by Spenĉjo, Wikimedia Commons, CC BY-SA 4.0". 파일은 수정 없이 사용(파일명만 변경).',
        '원본: Hwatu January Hikari/Tanzaku, February Tane/Tanzaku, March Hikari/Tanzaku, April Tane/Tanzaku, May Tane/Tanzaku, June Tane/Tanzaku, July Tane/Tanzaku, August Hikari/Tane, September Tane/Tanzaku, October Tane/Tanzaku (모두 File: 네임스페이스, .svg)',
      ],
      links: [
        ['작가 페이지', 'https://commons.wikimedia.org/wiki/User:Spen%C4%89jo'],
        ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
      ],
    },
    { heading: '카드 뒷면', lines: ['back.svg — 이 프로젝트에서 직접 제작 (MIT, 프로젝트 라이선스와 동일)'] },
    {
      heading: '글꼴 (모두 SIL Open Font License 1.1, Google Fonts 배포본을 자체 호스팅)',
      lines: [
        'Song Myung (송명) — 제목·족보 표시용',
        'Gowun Dodum (고운돋움) — 본문·UI용',
        'Black Han Sans (검은고딕) — 베팅 콜아웃용',
        '각 글꼴 폴더의 OFL.txt 참조.',
      ],
    },
    { heading: '아이콘', lines: ['모든 아이콘은 인라인 SVG 로 직접 제작(이모지 미사용).'] },
  ],
});

/** 규칙 모달용 요약 표 (docs/RULES.md 기준) */
export const RULES_SUMMARY = Object.freeze({
  hands: [
    ['38광땡', '3월 광 + 8월 광 (최강)'], ['18광땡', '1월 광 + 8월 광'], ['13광땡', '1월 광 + 3월 광'],
    ['장땡', '10월 두 장'], ['9땡 ~ 2땡', '같은 월 두 장(월이 높을수록 강함)'], ['삥땡', '1월 두 장'],
    ['알리', '1월 + 2월'], ['독사', '1월 + 4월'], ['구삥', '1월 + 9월'], ['장삥', '1월 + 10월'],
    ['장사', '4월 + 10월'], ['세륙', '4월 + 6월'], ['갑오(9끗)', '두 월의 합 끝자리 9'],
    ['여덟끗 ~ 한끗', '끝자리 8 ~ 1'], ['망통', '끝자리 0'],
  ],
  specials: [
    ['땡잡이', '3월 광 + 7월 열끗', '상대에게 삥땡~9땡이 있으면 잡고 승리', '망통'],
    ['암행어사', '4월 열끗 + 7월 열끗', '상대에게 13·18광땡이 있으면 잡고 승리', '한끗'],
    ['구사', '4월 + 9월', '상대 최고 족보가 알리 이하면 재경기', '세끗'],
    ['멍텅구리구사', '4월 열끗 + 9월 열끗', '상대 최고 족보가 9땡 이하면 재경기', '세끗'],
  ],
  betting: [
    ['체크', '이 라운드 첫 액션자(선)만, 베팅 없을 때', '0'],
    ['삥', '아직 베팅이 없을 때', '기본 베팅액'],
    ['콜', '베팅이 있을 때', '콜 금액'],
    ['따당', '베팅이 있을 때', '현재 베팅액의 2배'],
    ['쿼터', '항상', '콜 + 판돈의 1/4'],
    ['하프', '항상', '콜 + 판돈의 1/2'],
    ['맥스', '항상', '콜 + 판돈 전부'],
    ['올인', '2구부터(설정)', '보유 칩 전부'],
    ['다이', '항상', '0 (포기)'],
  ],
  flow: [
    '참가 확정 & 삥(앤티): 앉아 있고 칩이 삥 이상인 사람이 참가. 이월 판돈은 합산.',
    '2장 분배: 1장 비공개 + 1장 공개(기본은 2번째 카드).',
    '1구 베팅: 선부터 시계방향.',
    '3번째 카드: 다이하지 않은 사람에게 비공개로 1장.',
    '2구 베팅: 다시 선부터. 이 라운드부터 올인 가능(설정).',
    '최종 패 선택: 3장 중 2장. 제한시간 안에 고르지 않으면 최고 족보 자동 선택.',
    '승부: 고른 2장만 공개. 족보 비교 후 판돈 분배 또는 재경기.',
  ],
  regame: [
    '동점: 동점자끼리만 재경기, 동점 난 팟 전액 이월.',
    '구사/멍텅구리구사: 다이하지 않은 전원이 재경기, 판돈 전액 이월.',
    '재경기 판은 삥 없이 이월 판돈으로 시작. 다시 동점/구사가 나오면 판돈이 계속 쌓인다.',
    '구사 재경기에는 다이했던 사람도 이월 판돈의 절반을 내고 참가할 수 있다(설정).',
  ],
  notes: [
    '체크·콜을 한 사람은 그 라운드에서 다시 레이즈할 수 없다.',
    '칩이 콜 금액보다 적으면 전부로 콜(올인). 올인한 사람은 자기가 낸 금액까지만 가져간다(사이드팟).',
    '베팅 중 1명만 남으면 즉시 기권승, 카드는 공개하지 않는다.',
    '가상 칩만 사용하며 사행성 요소는 없다.',
  ],
});
