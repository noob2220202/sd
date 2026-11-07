// 방 설정 폼 (방 만들기 / 방장 설정 변경 공용) 및 읽기 전용 요약
import { h } from './dom.js';
import { icon } from './icons.js';
import { DEFAULT_SETTINGS, SETTINGS_OPTIONS, SETTINGS_LABELS, SPECIAL_LABELS } from './texts.js';
import { formatChips } from '../shared/format.js';

const RULE_KEYS = ['ddaengjabi', 'amhaeng', 'gusa', 'mungGusa'];
const RULE_DESC = {
  ddaengjabi: '3광+7열끗: 상대 땡을 잡음',
  amhaeng: '4열끗+7열끗: 13·18광땡을 잡음',
  gusa: '4월+9월: 알리 이하면 재경기',
  mungGusa: '4열끗+9열끗: 9땡 이하면 재경기',
};

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

function select(name, options, value, disabled) {
  return h(
    'select',
    { name, class: 'input', disabled: disabled || null },
    options.map(([v, label]) => h('option', { value: String(v), selected: String(v) === String(value) || null }, label)),
  );
}

function numberInput(name, value, { min, max, step, disabled }) {
  return h('input', { class: 'input', type: 'number', name, value: String(value), min, max, step, inputmode: 'numeric', disabled: disabled || null });
}

/** 토글 스위치 (체크박스 기반) */
export function toggle(name, checked, label, desc, disabled) {
  return h(
    'label',
    { class: 'toggle' },
    h('input', { type: 'checkbox', name, checked: checked || null, disabled: disabled || null }),
    h('span', { class: 'toggle-track' }, h('span', { class: 'toggle-knob' })),
    h('span', { class: 'toggle-text' }, h('span', { class: 'toggle-label' }, label), desc ? h('span', { class: 'toggle-desc' }, desc) : null),
  );
}

/**
 * 설정 폼 생성. read() 로 정규화된 설정 객체를 얻는다(검증 실패 시 Error).
 * @param {object} settings 초기값
 * @param {{readOnly?:boolean}} opts
 */
export function buildSettingsForm(settings = DEFAULT_SETTINGS, opts = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings, rules: { ...DEFAULT_SETTINGS.rules, ...(settings?.rules || {}) } };
  const ro = Boolean(opts.readOnly);
  const quick = (vals, target) =>
    h(
      'div',
      { class: 'quick-row' },
      vals.map((v) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip-btn',
            onClick: () => {
              target.value = String(v);
              target.dispatchEvent(new Event('input', { bubbles: true }));
            },
          },
          formatChips(v),
        ),
      ),
    );

  const startChips = numberInput('startChips', s.startChips, { min: 1000, max: 1_000_000_000_000, step: 1000, disabled: ro });
  const base = numberInput('base', s.base, { min: 1, max: 1_000_000_000_000, step: 1000, disabled: ro });
  const maxPlayers = select('maxPlayers', [2, 3, 4, 5, 6].map((n) => [n, `${n}명`]), s.maxPlayers, ro);
  const turnSeconds = select('turnSeconds', SETTINGS_OPTIONS.turnSeconds, s.turnSeconds, ro);
  const refill = select('refill', SETTINGS_OPTIONS.refill, s.refill, ro);
  const maxRaises = numberInput('maxRaises', s.maxRaises, { min: 0, max: 20, step: 1, disabled: ro });
  const openCard = select('openCard', SETTINGS_OPTIONS.openCard, s.openCard, ro);
  const allInFrom = select('allInFrom', SETTINGS_OPTIONS.allInFrom, s.allInFrom, ro);
  const dealerRule = select('dealerRule', SETTINGS_OPTIONS.dealerRule, s.dealerRule, ro);
  const regameRejoin = toggle('regameRejoin', s.regameRejoin, SETTINGS_LABELS.regameRejoin, '다이한 사람도 이월 판돈의 절반을 내고 구사 재경기에 참가', ro);
  const ruleToggles = RULE_KEYS.map((k) => toggle(`rule_${k}`, s.rules[k], SPECIAL_LABELS[k], RULE_DESC[k], ro));
  const errorBox = h('p', { class: 'form-error', role: 'alert', hidden: true });

  const el = h(
    'div',
    { class: 'settings-form' },
    h(
      'div',
      { class: 'form-grid' },
      field(SETTINGS_LABELS.startChips, h('div', {}, startChips, ro ? null : quick([100_000, 1_000_000, 10_000_000], startChips))),
      field(SETTINGS_LABELS.base, h('div', {}, base, ro ? null : quick([1_000, 10_000, 100_000], base))),
      field(SETTINGS_LABELS.maxPlayers, maxPlayers),
      field(SETTINGS_LABELS.turnSeconds, turnSeconds),
      field(SETTINGS_LABELS.refill, refill, '수동: 판 사이에 리필 버튼 / 자동: 삥을 못 내면 자동 충전'),
      field(SETTINGS_LABELS.maxRaises, maxRaises, '0 = 무제한'),
      field(SETTINGS_LABELS.openCard, openCard),
      field(SETTINGS_LABELS.allInFrom, allInFrom),
      field(SETTINGS_LABELS.dealerRule, dealerRule),
    ),
    h('div', { class: 'form-section' }, h('h4', { class: 'form-heading' }, '재경기'), regameRejoin),
    h('div', { class: 'form-section' }, h('h4', { class: 'form-heading' }, '특수족보'), h('div', { class: 'toggle-grid' }, ruleToggles)),
    errorBox,
  );

  function read() {
    const out = {
      startChips: Number(startChips.value),
      base: Number(base.value),
      maxPlayers: Number(maxPlayers.value),
      turnSeconds: Number(turnSeconds.value),
      refill: refill.value,
      maxRaises: Number(maxRaises.value),
      openCard: openCard.value,
      allInFrom: allInFrom.value,
      dealerRule: dealerRule.value,
      regameRejoin: regameRejoin.querySelector('input').checked,
      rules: Object.fromEntries(RULE_KEYS.map((k, i) => [k, ruleToggles[i].querySelector('input').checked])),
    };
    if (!Number.isInteger(out.startChips) || out.startChips < 1000) throw new Error('시작 칩은 1,000 이상의 정수여야 합니다');
    if (!Number.isInteger(out.base) || out.base < 1) throw new Error('삥은 1 이상의 정수여야 합니다');
    if (out.base > out.startChips) throw new Error('삥(기본 베팅액)은 시작 칩보다 작아야 합니다');
    if (!Number.isInteger(out.maxRaises) || out.maxRaises < 0 || out.maxRaises > 20) throw new Error('레이즈 횟수 상한은 0~20');
    return out;
  }

  function showError(msg) {
    errorBox.textContent = msg || '';
    errorBox.hidden = !msg;
  }

  return { el, read, showError };
}

/** 읽기 전용 요약 목록 (비방장용) */
export function settingsSummary(settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings, rules: { ...DEFAULT_SETTINGS.rules, ...(settings?.rules || {}) } };
  const opt = (key) => (SETTINGS_OPTIONS[key].find(([v]) => String(v) === String(s[key])) || [])[1] || String(s[key]);
  const rows = [
    [SETTINGS_LABELS.startChips, formatChips(s.startChips)],
    [SETTINGS_LABELS.base, formatChips(s.base)],
    [SETTINGS_LABELS.maxPlayers, `${s.maxPlayers}명`],
    [SETTINGS_LABELS.turnSeconds, opt('turnSeconds')],
    [SETTINGS_LABELS.refill, opt('refill')],
    [SETTINGS_LABELS.maxRaises, s.maxRaises === 0 ? '무제한' : `${s.maxRaises}회`],
    [SETTINGS_LABELS.openCard, opt('openCard')],
    [SETTINGS_LABELS.allInFrom, opt('allInFrom')],
    [SETTINGS_LABELS.dealerRule, opt('dealerRule')],
    [SETTINGS_LABELS.regameRejoin, s.regameRejoin ? '허용' : '끄기'],
    ['특수족보', RULE_KEYS.filter((k) => s.rules[k]).map((k) => SPECIAL_LABELS[k]).join(', ') || '없음'],
  ];
  return h(
    'dl',
    { class: 'summary-list' },
    rows.map(([k, v]) => h('div', { class: 'summary-row' }, h('dt', {}, k), h('dd', {}, v))),
  );
}

/** 특수족보 켜짐 여부를 짧게 (테이블 상단용) */
export function rulesBadge(rules) {
  const on = RULE_KEYS.filter((k) => rules?.[k]);
  return h('span', { class: 'rules-badge', title: '적용 중인 특수족보' }, icon('cards', 'icon-sm'), on.length ? on.map((k) => SPECIAL_LABELS[k]).join(' · ') : '특수족보 없음');
}
