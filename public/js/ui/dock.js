// 하단 도크: 액션바(내 턴) / 공개 카드 선택 안내 / 최종 패 선택(조합 미리보기 + 확정) / 대기 상태
import { h } from './dom.js';
import { icon } from './icons.js';
import { formatChips } from '../shared/format.js';
import { allPairs } from '../shared/hands.js';
import { cardById } from '../shared/cards.js';
import { ACTION_ORDER, ACTION_LABELS, SPECIAL_LABELS, REGAME_REASON } from './texts.js';

export function dockSignature(ctx) {
  const { hand, room, ui } = ctx;
  const mine = hand ? hand.players.find((p) => p.id === room.me.id) : null;
  return {
    hand: hand ? [hand.no, hand.stage, hand.turnId, hand.legal, hand.deadline, hand.players.map((p) => [p.id, p.hasSelected, p.hasChosenOpen, p.folded])] : null,
    mine: mine ? [mine.cards.map((c) => c.id), mine.folded, mine.hasSelected, mine.selected, mine.hasChosenOpen] : null,
    inter: hand && hand.intermission ? [hand.intermission.until, hand.intermission.rejoinable, hand.intermission.rejoined] : null,
    sel: ui.selectIdx,
    pending: ui.pending,
    conn: ctx.conn,
    phase: room.phase,
  };
}

const nick = (room, id) => (room.players.find((p) => p.id === id) || {}).nickname || '?';

export function buildDock(ctx) {
  const el = buildDockInner(ctx);
  if (el && ctx.hand) {
    // 테스트/디버그용 상태 표식: 어느 판·단계인지, 내 차례인지
    el.dataset.testid = 'dock';
    el.dataset.handNo = String(ctx.hand.no);
    el.dataset.stage = ctx.hand.stage;
    if (ctx.hand.turnId === ctx.me.id) el.dataset.mine = '1';
  }
  return el;
}

function buildDockInner(ctx) {
  const { hand, room, me, ui, actions } = ctx;
  if (!hand) return null;
  const mine = hand.players.find((p) => p.id === me.id) || null;
  const disabled = ui.pending || ctx.conn !== 'open';

  // ---- 베팅 ----
  if (hand.stage === 'bet1' || hand.stage === 'bet2') {
    if (hand.turnId === me.id && hand.legal && hand.legal.length) {
      const legal = ACTION_ORDER.map((k) => hand.legal.find((a) => a.kind === k)).filter(Boolean);
      return h(
        'div',
        { class: 'action-bar', role: 'group', 'aria-label': '베팅 액션' },
        h('div', { class: 'action-hint' }, h('strong', {}, '내 차례'), hand.deadline ? h('span', { class: 'action-timer', dataset: { until: String(hand.deadline) } }, '') : null),
        h(
          'div',
          { class: 'action-buttons' },
          legal.map((a, i) =>
            h(
              'button',
              {
                type: 'button',
                class: `act act-${a.kind}${a.allIn ? ' act-allin-flag' : ''}`,
                'data-testid': `action-${a.kind}`,
                disabled: disabled || null,
                dataset: { kind: a.kind, key: String(i + 1) },
                onClick: () => actions.act(a.kind),
              },
              h('span', { class: 'act-label' }, ACTION_LABELS[a.kind]),
              a.kind === 'die' || a.kind === 'check' ? null : h('span', { class: 'act-amount' }, formatChips(a.pay)),
              a.allIn && a.kind !== 'allin' ? h('span', { class: 'act-badge' }, '올인') : null,
              i < 9 ? h('span', { class: 'act-key', 'aria-hidden': 'true' }, String(i + 1)) : null,
            ),
          ),
        ),
      );
    }
    const turnName = hand.turnId ? nick(room, hand.turnId) : null;
    return h(
      'div',
      { class: 'dock-status' },
      turnName ? h('span', {}, h('strong', {}, turnName), ' 님의 차례') : h('span', {}, '베팅 진행 중'),
      hand.deadline && turnName ? h('span', { class: 'dock-timer', dataset: { until: String(hand.deadline) } }, '') : null,
      mine && mine.folded ? h('span', { class: 'dock-note' }, '이번 판은 다이했습니다') : null,
      mine && mine.allIn && !mine.folded ? h('span', { class: 'dock-note' }, '올인 — 결과를 기다립니다') : null,
    );
  }

  // ---- 공개 카드 선택 ----
  if (hand.stage === 'open') {
    const pending = hand.players.filter((p) => !p.hasChosenOpen);
    if (mine && !mine.hasChosenOpen) {
      return h(
        'div',
        { class: 'dock-status dock-prompt' },
        h('span', {}, h('strong', {}, '공개할 카드'), '를 선택하세요 — 두 장 중 한 장을 탭'),
        hand.deadline ? h('span', { class: 'dock-timer', dataset: { until: String(hand.deadline) } }, '') : null,
      );
    }
    return h(
      'div',
      { class: 'dock-status' },
      h('span', {}, `다른 플레이어 선택 대기 중 (${hand.players.length - pending.length}/${hand.players.length})`),
      pending.length ? h('span', { class: 'dock-note' }, pending.map((p) => nick(room, p.id)).join(', ')) : null,
    );
  }

  // ---- 최종 패 선택 ----
  if (hand.stage === 'select') {
    const alive = hand.players.filter((p) => !p.folded);
    const done = alive.filter((p) => p.hasSelected);
    if (mine && !mine.folded && !mine.hasSelected && mine.cards.length === 3 && mine.cards.every((c) => c.id)) {
      const ids = mine.cards.map((c) => c.id);
      const pairs = allPairs(ids);
      const sel = ui.selectIdx;
      const ready = sel.length === 2;
      return h(
        'div',
        { class: 'select-bar' },
        h(
          'div',
          { class: 'select-head' },
          h('span', {}, h('strong', {}, '최종 패'), ' — 3장 중 2장을 고르세요'),
          hand.deadline ? h('span', { class: 'dock-timer', dataset: { until: String(hand.deadline) } }, '') : null,
        ),
        h(
          'div',
          { class: 'pair-list' },
          pairs.map(({ idx, hand: hh }) => {
            const active = ready && idx[0] === Math.min(...sel) && idx[1] === Math.max(...sel);
            const flags = Object.keys(hh.flags || {}).filter((k) => room.settings.rules?.[k]);
            return h(
              'button',
              {
                type: 'button',
                class: `pair-opt${active ? ' active' : ''}`,
                'data-testid': `pair-${idx[0]}${idx[1]}`,
                disabled: disabled || null,
                onClick: () => actions.setSelect(idx),
              },
              h('span', { class: 'pair-cards' }, `${cardName(ids[idx[0]])} + ${cardName(ids[idx[1]])}`),
              h('span', { class: 'pair-name' }, hh.name),
              flags.length ? h('span', { class: 'pair-flags' }, flags.map((f) => h('span', { class: 'special-tag cand' }, SPECIAL_LABELS[f]))) : null,
            );
          }),
        ),
        h(
          'button',
          { type: 'button', class: 'btn btn-primary btn-confirm', 'data-testid': 'select-confirm', disabled: !ready || disabled || null, onClick: () => actions.select() },
          icon('check', 'icon-sm'),
          ready ? `확정 — ${pairs.find((p) => p.idx[0] === Math.min(...sel) && p.idx[1] === Math.max(...sel))?.hand.name}` : '두 장을 선택하세요',
        ),
        h('div', { class: 'dock-note' }, `선택 완료 ${done.length}/${alive.length}`),
      );
    }
    return h(
      'div',
      { class: 'dock-status' },
      mine && !mine.folded ? h('span', {}, h('strong', {}, '선택 완료'), ' — 다른 플레이어를 기다립니다') : h('span', {}, '다른 플레이어가 최종 패를 선택 중입니다'),
      h('span', { class: 'dock-note' }, `${done.length}/${alive.length} 완료${alive.length - done.length ? ' · 대기: ' + alive.filter((p) => !p.hasSelected).map((p) => nick(room, p.id)).join(', ') : ''}`),
      hand.deadline ? h('span', { class: 'dock-timer', dataset: { until: String(hand.deadline) } }, '') : null,
    );
  }

  // ---- 결과 표시 중 ----
  if (hand.stage === 'done') {
    const inter = hand.intermission;
    const regame = inter?.regameNext || hand.result?.regameNext;
    const parts = [];
    if (inter) {
      parts.push(
        h('span', {}, regame ? `${REGAME_REASON[regame.reason] || '재경기'} 재경기 시작까지 ` : '다음 판까지 ', h('span', { class: 'dock-timer', dataset: { until: String(inter.until) } }, '')),
      );
      if (inter.rejoinable?.includes(me.id) && !inter.rejoined?.includes(me.id)) {
        parts.push(
          h('button', { type: 'button', class: 'btn btn-gold', 'data-testid': 'rejoin', disabled: disabled || null, onClick: () => actions.rejoin() }, icon('plus', 'icon-sm'), `재경기 참가 (${formatChips(inter.rejoinFee)} 지불)`),
        );
      } else if (inter.rejoined?.includes(me.id)) parts.push(h('span', { class: 'dock-note' }, '재경기 참가 완료'));
    } else if (room.phase === 'paused') parts.push(h('span', {}, '일시정지 — 방장이 재개하면 다음 판이 시작됩니다'));
    return h('div', { class: 'dock-status' }, parts);
  }
  return null;
}

function cardName(id) {
  const c = cardById(id);
  return c ? `${c.month}월 ${c.kind === 'g' ? '광' : c.kind === 'y' ? '열끗' : '띠'}` : id;
}
