// 테이블 중앙: 판돈/이월/칩 더미/단계 라벨/현재 베팅
import { h } from './dom.js';
import { chipPile } from './chips.js';
import { formatChips } from '../shared/format.js';
import { STAGE_LABELS, REGAME_REASON } from './texts.js';

export function centerSignature(ctx) {
  const { hand, room } = ctx;
  const mine = hand ? hand.players.find((p) => p.id === room.me.id) : null;
  return {
    hand: hand ? [hand.no, hand.stage, hand.pot, hand.carried, hand.cur, hand.regame, mine ? mine.roundBet : null, hand.turnId === room.me.id] : null,
    phase: room.phase,
    waiting: room.waiting ? room.waiting.reason : null,
    start: room.settings.startChips,
  };
}

export function buildCenter(ctx) {
  const { hand, room } = ctx;
  if (!hand) {
    return h(
      'div',
      { class: 'center-idle' },
      h('div', { class: 'center-logo' }, '섯다'),
      h('div', { class: 'center-sub' }, room.phase === 'lobby' ? '게임 시작 대기' : room.phase === 'paused' ? '일시정지' : '다음 판 준비 중'),
    );
  }
  const mine = hand.players.find((p) => p.id === room.me.id);
  const toCall = mine && hand.cur > 0 ? Math.max(0, hand.cur - mine.roundBet) : 0;
  const betting = hand.stage === 'bet1' || hand.stage === 'bet2';
  return h(
    'div',
    { class: 'center-box' },
    h(
      'div',
      { class: 'stage-row' },
      h('span', { class: 'hand-no' }, `${hand.no}번째 판`),
      h('span', { class: `stage-pill stage-${hand.stage}` }, STAGE_LABELS[hand.stage] || hand.stage),
      hand.regame ? h('span', { class: 'regame-pill' }, `재경기 (${REGAME_REASON[hand.regame.reason] || hand.regame.reason})`) : null,
    ),
    h('div', { class: 'pot-label' }, '판돈'),
    h('div', { class: 'pot-amount' }, formatChips(hand.pot)),
    hand.carried > 0 ? h('div', { class: 'pot-carried' }, `이월 +${formatChips(hand.carried)}`) : null,
    h('div', { class: 'pile-wrap' }, chipPile(hand.pot, room.settings.startChips)),
    betting
      ? h(
          'div',
          { class: 'cur-row' },
          h('span', { class: 'cur-item' }, h('span', { class: 'cur-k' }, '현재 베팅'), h('span', { class: 'cur-v' }, formatChips(hand.cur))),
          mine && !mine.folded ? h('span', { class: `cur-item ${hand.turnId === room.me.id ? 'cur-mine' : ''}` }, h('span', { class: 'cur-k' }, '콜'), h('span', { class: 'cur-v' }, formatChips(toCall))) : null,
        )
      : null,
  );
}
