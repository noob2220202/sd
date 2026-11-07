// 결과 오버레이: 승자/족보/특수족보 결과/기권승/재경기 배너 + 승자에게 날아가는 칩 애니메이션
import { h } from './dom.js';
import { icon } from './icons.js';
import { flyingChip } from './chips.js';
import { formatChips, formatSigned } from '../shared/format.js';
import { SPECIAL_LABELS, SPECIAL_FALLBACK, REGAME_REASON } from './texts.js';

export function resultSignature(ctx) {
  const { hand } = ctx;
  if (!hand || hand.stage !== 'done' || !hand.result) return null;
  return { no: hand.no, inter: hand.intermission ? [hand.intermission.until, hand.intermission.rejoined, hand.intermission.rejoinable] : null, winners: hand.result.winners, pending: ctx.ui.pending, hidden: ctx.ui.resultHidden };
}

const nick = (room, id) => (room.players.find((p) => p.id === id) || {}).nickname || '?';

export function buildResult(ctx) {
  const { hand, room, me, actions, ui } = ctx;
  if (!hand || hand.stage !== 'done' || !hand.result) return null;
  if (ui.resultHidden === hand.no) return h('button', { type: 'button', class: 'btn btn-xs btn-ghost result-show', onClick: () => actions.showResult() }, icon('eye', 'icon-sm'), '결과 보기');
  const r = hand.result;
  const inter = hand.intermission;
  const closeBtn = h('button', { type: 'button', class: 'result-close', 'aria-label': '결과 닫기', onClick: () => actions.hideResult(hand.no) }, icon('close', 'icon-sm'));
  const countdown = inter ? h('div', { class: 'result-countdown' }, r.regameNext || inter.regameNext ? '재경기 시작까지 ' : '다음 판까지 ', h('span', { dataset: { until: String(inter.until) } }, '')) : null;

  // ---- 재경기 ----
  if (r.type === 'regame') {
    const rg = r.regameNext || inter?.regameNext;
    const reason = REGAME_REASON[r.reason] || '재경기';
    const participants = (rg?.participants || []).map((id) => nick(room, id));
    const rejoined = (inter?.rejoined || []).map((id) => nick(room, id));
    const canRejoin = inter && inter.rejoinable?.includes(me.id) && !inter.rejoined?.includes(me.id);
    return h(
      'div',
      { class: 'result-card result-regame' },
      closeBtn,
      h('div', { class: 'result-kicker' }, reason),
      h('h3', { class: 'result-title' }, `재경기 — 판돈 ${formatChips(r.carriedNext)} 이월`),
      reveals(ctx, r),
      specialsList(ctx, r),
      h('div', { class: 'result-line' }, h('span', { class: 'k' }, '참가'), h('span', {}, participants.join(', ') || '없음')),
      rejoined.length ? h('div', { class: 'result-line' }, h('span', { class: 'k' }, '추가 참가'), h('span', {}, rejoined.join(', '))) : null,
      canRejoin
        ? h('button', { type: 'button', class: 'btn btn-gold btn-lg', disabled: ui.pending || null, onClick: () => actions.rejoin() }, icon('plus', 'icon-sm'), `재경기 참가 (${formatChips(inter.rejoinFee)} 지불)`)
        : null,
      countdown,
    );
  }

  // ---- 기권승 ----
  if (r.type === 'fold') {
    const w = r.winners[0];
    return h(
      'div',
      { class: 'result-card result-fold' },
      closeBtn,
      h('div', { class: 'result-kicker' }, '기권승'),
      h('h3', { class: 'result-title' }, h('span', { class: 'winner-name' }, nick(room, w)), ' 승리'),
      h('div', { class: 'result-payout' }, formatSigned(r.payouts[w] || r.pot)),
      h('p', { class: 'result-note' }, '모두 다이하여 카드를 공개하지 않습니다'),
      countdown,
    );
  }

  // ---- 쇼다운 ----
  const winnerLines = r.winners.map((id) => {
    const rv = r.reveals[id];
    return h(
      'div',
      { class: 'winner-line' },
      h('span', { class: 'winner-name' }, nick(room, id)),
      rv ? h('span', { class: 'winner-hand' }, rv.hand.name) : null,
      h('span', { class: 'winner-amt' }, formatSigned(r.payouts[id] || 0)),
    );
  });
  const tiePots = r.pots.filter((p) => p.tie);
  return h(
    'div',
    { class: 'result-card result-showdown' },
    closeBtn,
    h('div', { class: 'result-kicker' }, icon('trophy', 'icon-sm'), '승부'),
    h('div', { class: 'winner-block' }, winnerLines),
    specialsList(ctx, r),
    reveals(ctx, r, r.winners),
    tiePots.length ? h('div', { class: 'result-line' }, h('span', { class: 'k' }, '동점 이월'), h('span', {}, `${formatChips(r.carriedNext)} (${tiePots.flatMap((p) => p.tied).map((id) => nick(room, id)).join(', ')})`)) : null,
    r.pots.length > 1 ? h('div', { class: 'result-line small' }, h('span', { class: 'k' }, '팟'), h('span', {}, r.pots.map((p, i) => `${i === 0 ? '메인' : '사이드' + i} ${formatChips(p.amount)} → ${p.tie ? '이월' : nick(room, p.winner)}`).join(' · '))) : null,
    countdown,
  );
}

/** 공개된 패 목록 (승자 제외 또는 전체) */
function reveals(ctx, r, exclude = []) {
  const ids = Object.keys(r.reveals || {}).filter((id) => !exclude.includes(id));
  if (!ids.length) return null;
  return h(
    'div',
    { class: 'reveal-list' },
    ids.map((id) => h('div', { class: 'reveal-line' }, h('span', { class: 'rv-name' }, (ctx.room.players.find((p) => p.id === id) || {}).nickname || '?'), h('span', { class: 'rv-hand' }, r.reveals[id].hand.name))),
  );
}

/** 특수족보 결과 문구: "땡잡이 성공!" / "암행어사 실패 → 한끗" */
function specialsList(ctx, r) {
  if (!r.specials || !r.specials.length) return null;
  return h(
    'div',
    { class: 'specials-list' },
    r.specials.map((s) => {
      const name = (ctx.room.players.find((p) => p.id === s.id) || {}).nickname || '?';
      const label = SPECIAL_LABELS[s.kind] || s.kind;
      const isRegame = s.kind === 'gusa' || s.kind === 'mungGusa';
      const text = s.success ? `${label} ${isRegame ? '발동 — 재경기' : '성공!'}` : `${label} 실패 → ${SPECIAL_FALLBACK[s.kind] || ''}`;
      return h('div', { class: `special-line ${s.success ? 'ok' : 'fail'}` }, h('span', { class: 'sp-name' }, name), h('span', { class: 'sp-text' }, text));
    }),
  );
}

/**
 * 승자 좌석으로 칩이 날아가는 애니메이션. 한 판에 1회만.
 * @param {HTMLElement} layer .fly-layer
 * @param {HTMLElement} from 중앙 요소
 * @param {HTMLElement[]} targets 승자 좌석 요소들
 */
export function flyChips(layer, from, targets) {
  if (!layer || !from || !targets.length) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const lr = layer.getBoundingClientRect();
  const fr = from.getBoundingClientRect();
  const fx = fr.left + fr.width / 2 - lr.left;
  const fy = fr.top + fr.height / 2 - lr.top;
  for (const t of targets) {
    const tr = t.getBoundingClientRect();
    const tx = tr.left + tr.width / 2 - lr.left;
    const ty = tr.top + tr.height / 2 - lr.top;
    for (let i = 0; i < 10; i++) {
      const c = flyingChip();
      const jx = (Math.random() - 0.5) * 40;
      const jy = (Math.random() - 0.5) * 30;
      c.style.setProperty('--sx', `${fx + jx}px`);
      c.style.setProperty('--sy', `${fy + jy}px`);
      c.style.setProperty('--tx', `${tx + jx / 2}px`);
      c.style.setProperty('--ty', `${ty + jy / 2}px`);
      c.style.animationDelay = `${i * 45}ms`;
      c.addEventListener('animationend', () => c.remove(), { once: true });
      layer.append(c);
    }
  }
}
