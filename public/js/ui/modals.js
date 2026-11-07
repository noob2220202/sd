// 모달: 크레딧(에셋 출처) / 장부 / 설정 / 규칙 / 나가기 확인
import { h, section } from './dom.js';
import { icon } from './icons.js';
import { buildSettingsForm, settingsSummary } from './settingsForm.js';
import { ATTRIBUTION, RULES_SUMMARY } from './texts.js';
import { formatChips, formatSigned } from '../shared/format.js';

/**
 * 모달 루트 렌더. ui.modal = {kind, data} | null
 * 설정 폼은 입력 중 재렌더로 값이 날아가지 않도록 kind 가 바뀔 때만 다시 만든다.
 */
export function renderModals(root, ctx) {
  const { ui } = ctx;
  const m = ui.modal;
  let sig;
  if (!m) sig = 'none';
  else if (m.kind === 'ledger') sig = ['ledger', ctx.room?.players.map((p) => [p.id, p.nickname, p.chips, p.ledger])];
  else if (m.kind === 'settings') sig = ['settings', ctx.room?.code, ctx.me?.isHost, ctx.room?.phase === 'lobby' || ctx.hand == null || ctx.hand.stage === 'done'];
  else sig = [m.kind];
  section(root, sig, () => (m ? shell(ctx, m) : null));
  document.body.classList.toggle('modal-open', Boolean(m));
}

function shell(ctx, m) {
  const { actions } = ctx;
  const body = BUILDERS[m.kind] ? BUILDERS[m.kind](ctx, m) : h('p', {}, '알 수 없는 창');
  const dlg = h(
    'div',
    { class: `modal modal-${m.kind}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
    h('div', { class: 'modal-head' }, h('h2', { id: 'modal-title', class: 'modal-title' }, body.title), h('button', { type: 'button', class: 'icon-btn modal-close', 'aria-label': '닫기', onClick: () => actions.closeModal() }, icon('close'))),
    h('div', { class: 'modal-body' }, body.el),
    body.foot ? h('div', { class: 'modal-foot' }, body.foot) : null,
  );
  const backdrop = h('div', { class: 'modal-backdrop', onClick: (e) => { if (e.target === backdrop) actions.closeModal(); } }, dlg);
  requestAnimationFrame(() => {
    const f = dlg.querySelector('input:not([type=checkbox]), select, button.btn-primary, .modal-close');
    if (f) f.focus({ preventScroll: true });
  });
  return backdrop;
}

const BUILDERS = {
  credits() {
    return {
      title: ATTRIBUTION.title,
      el: h(
        'div',
        { class: 'credits' },
        h('p', { class: 'credits-lead' }, '이 게임의 화투 카드 이미지는 CC BY-SA 4.0 으로 배포된 작품을 사용합니다. 아래 표기는 라이선스 조건에 따라 반드시 유지됩니다.'),
        ATTRIBUTION.sections.map((s) =>
          h(
            'section',
            { class: 'credits-sec' },
            h('h3', {}, s.heading),
            h('ul', {}, s.lines.map((l) => h('li', {}, l))),
            s.links ? h('p', { class: 'credits-links' }, s.links.map(([t, u]) => h('a', { href: u, target: '_blank', rel: 'noopener noreferrer license' }, t))) : null,
          ),
        ),
        h('p', { class: 'credits-foot' }, 'Hwatu card images by Spenĉjo, Wikimedia Commons, CC BY-SA 4.0'),
      ),
    };
  },
  rules() {
    const table = (head, rows, cls = '') => h('table', { class: `rules-table ${cls}` }, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: i === 0 ? 'first' : '' }, c))))));
    return {
      title: '섯다 규칙 요약',
      el: h(
        'div',
        { class: 'rules' },
        h('p', { class: 'rules-lead' }, '한게임 3장 섯다 기준. 2장 받고 1구 베팅 → 1장 더 받고 2구 베팅 → 3장 중 2장을 골라 승부. 가상 칩만 사용합니다.'),
        h('h3', {}, '족보 (높은 순)'),
        table(['족보', '구성'], RULES_SUMMARY.hands),
        h('h3', {}, '특수족보 (방 설정에서 개별 ON/OFF)'),
        table(['특수족보', '정확한 카드', '효과', '효과 없을 때'], RULES_SUMMARY.specials, 'wide'),
        h('h3', {}, '진행'),
        h('ol', { class: 'rules-list' }, RULES_SUMMARY.flow.map((t) => h('li', {}, t))),
        h('h3', {}, '베팅 (한게임식)'),
        table(['버튼', '가능한 때', '내는 금액'], RULES_SUMMARY.betting),
        h('h3', {}, '재경기 (판돈이 쌓이는 규칙)'),
        h('ul', { class: 'rules-list' }, RULES_SUMMARY.regame.map((t) => h('li', {}, t))),
        h('h3', {}, '그 외'),
        h('ul', { class: 'rules-list' }, RULES_SUMMARY.notes.map((t) => h('li', {}, t))),
      ),
    };
  },
  ledger(ctx) {
    const players = [...ctx.room.players].sort((a, b) => (b.ledger?.net ?? 0) - (a.ledger?.net ?? 0));
    return {
      title: '장부',
      el: h(
        'div',
        { class: 'ledger' },
        h('p', { class: 'ledger-lead' }, '가상 칩 기준. 총 투입 = 시작 칩 + 리필 누계, 순손익 = 현재 칩 − 총 투입.'),
        h(
          'table',
          { class: 'ledger-table' },
          h('thead', {}, h('tr', {}, ['닉네임', '총 투입', '현재 칩', '순손익', '승', '리필'].map((t) => h('th', {}, t)))),
          h(
            'tbody',
            {},
            players.map((p) => {
              const l = p.ledger || { buyIn: 0, refills: 0, wins: 0, net: 0 };
              return h(
                'tr',
                { class: p.id === ctx.me.id ? 'me' : '' },
                h('td', { class: 'first' }, p.isHost ? icon('crown', 'icon-xs') : null, p.nickname, p.seat == null ? h('span', { class: 'muted'}, ' (관전)') : null),
                h('td', { class: 'num' }, formatChips(l.buyIn)),
                h('td', { class: 'num' }, formatChips(p.chips)),
                h('td', { class: `num ${l.net > 0 ? 'pos' : l.net < 0 ? 'neg' : ''}` }, formatSigned(l.net)),
                h('td', { class: 'num' }, String(l.wins)),
                h('td', { class: 'num' }, String(l.refills)),
              );
            }),
          ),
        ),
      ),
    };
  },
  settings(ctx) {
    const { room, me, hand, actions } = ctx;
    if (!me.isHost) return { title: '방 설정', el: h('div', {}, h('p', { class: 'muted small' }, '방장만 변경할 수 있습니다.'), settingsSummary(room.settings)) };
    const betweenHands = !hand || hand.stage === 'done';
    const form = buildSettingsForm(room.settings);
    const save = h(
      'button',
      { type: 'button', class: 'btn btn-primary', onClick: () => { try { const s = form.read(); actions.host('settings', { settings: s }); actions.closeModal(); } catch (e) { form.showError(e.message); } } },
      icon('check', 'icon-sm'),
      '저장',
    );
    return {
      title: '방 설정',
      el: h('div', {}, betweenHands ? null : h('p', { class: 'form-note' }, icon('info', 'icon-sm'), '진행 중인 판이 끝난 뒤(다음 판부터) 적용됩니다.'), form.el),
      foot: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => actions.closeModal() }, '취소'), save],
    };
  },
  leave(ctx) {
    const { hand, me, actions } = ctx;
    const inHand = hand && hand.stage !== 'done' && hand.players.some((p) => p.id === me.id && !p.folded);
    return {
      title: '방 나가기',
      el: h('p', {}, inHand ? '진행 중인 판에 참여 중입니다. 나가면 이번 판은 다이 처리됩니다. 정말 나갈까요?' : '방을 나갈까요? 같은 브라우저로 다시 들어오면 칩은 복구되지 않습니다.'),
      foot: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => actions.closeModal() }, '취소'), h('button', { type: 'button', class: 'btn btn-danger', onClick: () => actions.leave() }, icon('exit', 'icon-sm'), '나가기')],
    };
  },
};
