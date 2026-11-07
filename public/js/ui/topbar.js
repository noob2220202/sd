// 상단 바: 방 코드/초대 링크 복사/연결 상태/장부/설정/규칙/나가기/패널 토글
import { h } from './dom.js';
import { icon } from './icons.js';
import { CONN_LABELS } from './texts.js';

export function topbarSignature(ctx) {
  return { code: ctx.room.code, conn: ctx.conn, host: ctx.me.isHost, unread: ctx.ui.unreadChat, panel: ctx.ui.panelOpen, phase: ctx.room.phase };
}

export function buildTopbar(ctx) {
  const { room, me, ui, actions } = ctx;
  const unread = ui.unreadChat;
  return [
    h(
      'div',
      { class: 'tb-left' },
      h('span', { class: 'tb-logo' }, '섯다'),
      h('span', { class: 'room-code', title: '방 코드' }, h('span', { class: 'rc-k' }, '방'), h('span', { class: 'rc-v' }, room.code)),
      h('button', { type: 'button', class: 'btn btn-xs btn-ghost tb-copy', onClick: () => actions.copyInvite() }, icon('link', 'icon-sm'), h('span', { class: 'tb-label' }, '초대 링크 복사')),
    ),
    h('div', { class: 'tb-center' }, connPill(ctx.conn)),
    h(
      'div',
      { class: 'tb-right' },
      tbBtn('book', '장부', () => actions.openModal('ledger')),
      tbBtn('sliders', me.isHost ? '설정' : '설정 보기', () => actions.openModal('settings')),
      tbBtn('rules', '규칙', () => actions.openModal('rules')),
      tbBtn('exit', '나가기', () => actions.openModal('leave'), 'tb-leave'),
      h(
        'button',
        { type: 'button', class: 'icon-btn tb-panel', 'aria-label': '로그/채팅 패널', 'aria-expanded': String(ui.panelOpen), onClick: () => actions.togglePanel() },
        icon('chat'),
        unread > 0 ? h('span', { class: 'badge' }, unread > 99 ? '99+' : String(unread)) : null,
      ),
    ),
  ];
}

function tbBtn(ic, label, onClick, extra = '') {
  return h('button', { type: 'button', class: `btn btn-xs btn-ghost tb-btn ${extra}`, onClick, 'aria-label': label, title: label }, icon(ic, 'icon-sm'), h('span', { class: 'tb-label' }, label));
}

export function connPill(conn) {
  return h('span', { class: `conn-pill conn-${conn}`, role: 'status' }, h('span', { class: 'conn-ind' }), h('span', { class: 'conn-label' }, CONN_LABELS[conn] || conn));
}
