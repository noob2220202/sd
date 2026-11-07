// 테이블 상단 알림 띠: 대기 메시지, 방장 컨트롤(시작/일시정지/재개), 내 컨트롤(리필/앉기/자리 비우기), 관전자 목록
import { h } from './dom.js';
import { icon } from './icons.js';
import { formatChips } from '../shared/format.js';

export function noticeSignature(ctx) {
  const { room, me, hand } = ctx;
  return {
    waiting: room.waiting, phase: room.phase, host: me.isHost, seat: me.seat, canRefill: me.canRefill, chips: me.chips,
    spectators: room.players.filter((p) => p.seat == null).map((p) => p.nickname),
    seated: room.players.filter((p) => p.seat != null).length, // 게임 시작 버튼 활성 조건(2명 이상)
    max: room.settings.maxPlayers,
    inHand: Boolean(hand && hand.stage !== 'done' && hand.players.some((p) => p.id === me.id && !p.folded)),
    pending: ctx.ui.pending, conn: ctx.conn,
  };
}

export function buildNotice(ctx) {
  const { room, me, hand, actions, ui } = ctx;
  const disabled = ui.pending || ctx.conn !== 'open';
  const seated = room.players.filter((p) => p.seat != null);
  const spectators = room.players.filter((p) => p.seat == null);
  const hostBtns = [];
  if (me.isHost) {
    if (room.phase === 'lobby') hostBtns.push(h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'start-game', disabled: disabled || seated.length < 2 || null, onClick: () => actions.host('start') }, icon('play', 'icon-sm'), '게임 시작'));
    else if (room.phase === 'playing') hostBtns.push(h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'pause-game', disabled: disabled || null, onClick: () => actions.host('pause') }, icon('pause', 'icon-sm'), '일시정지'));
    else if (room.phase === 'paused') hostBtns.push(h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'resume-game', disabled: disabled || null, onClick: () => actions.host('resume') }, icon('play', 'icon-sm'), '재개'));
  }
  const meBtns = [];
  if (me.canRefill) meBtns.push(h('button', { type: 'button', class: 'btn btn-gold btn-sm', disabled: disabled || null, onClick: () => actions.refill(), title: `시작 칩(${formatChips(room.settings.startChips)})까지 충전` }, icon('refresh', 'icon-sm'), '리필'));
  if (me.seat == null) {
    if (seated.length < room.settings.maxPlayers) meBtns.push(h('button', { type: 'button', class: 'btn btn-sm', disabled: disabled || null, onClick: () => actions.sit() }, icon('seat', 'icon-sm'), '앉기'));
    else meBtns.push(h('span', { class: 'notice-note' }, '자리가 꽉 찼습니다 — 관전 중'));
  } else {
    const inHand = hand && hand.stage !== 'done' && hand.players.some((p) => p.id === me.id && !p.folded);
    meBtns.push(h('button', { type: 'button', class: 'btn btn-sm btn-ghost', disabled: disabled || null, onClick: () => actions.stand(), title: inHand ? '진행 중인 판은 다이 처리됩니다' : '관전으로 전환' }, icon('eye', 'icon-sm'), '자리 비우기'));
  }
  const msg = room.waiting ? room.waiting.message : null;
  return h(
    'div',
    { class: `notice-inner${msg ? ' has-msg' : ''}` },
    msg ? h('div', { class: `notice-msg reason-${room.waiting.reason}`, 'data-testid': 'waiting-msg' }, icon(room.waiting.reason === 'paused' ? 'pause' : 'info', 'icon-sm'), h('span', {}, msg)) : null,
    h('div', { class: 'notice-actions' }, hostBtns, meBtns),
    spectators.length ? h('div', { class: 'spectators', title: '관전자' }, icon('eye', 'icon-sm'), h('span', {}, `관전 ${spectators.length}: ${spectators.map((p) => p.nickname).join(', ')}`)) : null,
  );
}
