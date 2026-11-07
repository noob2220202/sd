// 테이블 뷰 오케스트레이터: 뼈대를 한 번 만들고, 섹션별 시그니처가 바뀐 부분만 다시 그린다.
import { h, section } from './dom.js';
import { topbarSignature, buildTopbar } from './topbar.js';
import { noticeSignature, buildNotice } from './notice.js';
import { seatsSignature, buildSeats } from './seats.js';
import { centerSignature, buildCenter } from './center.js';
import { dockSignature, buildDock } from './dock.js';
import { resultSignature, buildResult, flyChips } from './result.js';
import { renderPanel } from './panel.js';

let flownHand = null;

export function renderTable(root, ctx) {
  if (!root.firstElementChild || root.dataset.view !== 'table') {
    root.dataset.view = 'table';
    root.replaceChildren(skeleton(ctx));
    flownHand = null;
  }
  const view = root.firstElementChild;
  const { room, hand, ui } = ctx;
  view.classList.toggle('panel-open', ui.panelOpen);
  view.classList.toggle('offline', ctx.conn !== 'open');
  view.dataset.players = String(room.settings.maxPlayers);
  view.dataset.stage = hand ? hand.stage : 'idle';
  view.classList.toggle('has-dock', Boolean(hand));

  section(view.querySelector('[data-sec=topbar]'), topbarSignature(ctx), () => buildTopbar(ctx));
  section(view.querySelector('[data-sec=notice]'), noticeSignature(ctx), () => buildNotice(ctx));
  const resultBar = view.querySelector('[data-sec=result]');
  section(resultBar, resultSignature(ctx), () => buildResult(ctx));
  resultBar.classList.toggle('has-result', Boolean(resultBar.firstElementChild));
  const seatLayer = view.querySelector('[data-sec=seats]');
  section(seatLayer, seatsSignature(ctx), () => buildSeats(ctx));
  const center = view.querySelector('[data-sec=center]');
  section(center, centerSignature(ctx), () => buildCenter(ctx));
  section(view.querySelector('[data-sec=dock]'), dockSignature(ctx), () => buildDock(ctx));
  renderPanel(view.querySelector('[data-sec=panel]'), ctx);

  // 승자에게 칩 날리기 (판마다 1회)
  if (hand && hand.stage === 'done' && hand.result && hand.result.winners.length && flownHand !== hand.no) {
    flownHand = hand.no;
    const targets = hand.result.winners.map((id) => seatLayer.querySelector(`.seat[data-id="${id}"]`)).filter(Boolean);
    requestAnimationFrame(() => flyChips(view.querySelector('.fly-layer'), center, targets));
  }
}

function skeleton(ctx) {
  return h(
    'div',
    { class: 'table-view' },
    h('header', { class: 'topbar', dataset: { sec: 'topbar' } }),
    h(
      'div',
      { class: 'table-body' },
      h(
        'section',
        { class: 'table-area' },
        h('div', { class: 'notice-bar', dataset: { sec: 'notice' } }),
        // 결과 배너: 테이블 위쪽에 띠로 붙는다(카드를 가리지 않음). e2e 가 .result-layer .result-card 를 찾는다.
        h('div', { class: 'result-layer', dataset: { sec: 'result' } }),
        h(
          'div',
          { class: 'table-wrap' },
          h('div', { class: 'felt', 'aria-hidden': 'true' }, h('div', { class: 'felt-inner' })),
          h('div', { class: 'table-center', dataset: { sec: 'center' } }),
          h('div', { class: 'seat-layer', dataset: { sec: 'seats' } }),
          h('div', { class: 'fly-layer', 'aria-hidden': 'true' }),
        ),
        h('footer', { class: 'dock', dataset: { sec: 'dock' } }),
      ),
      h('div', { class: 'panel-scrim', onClick: () => ctx.actions.togglePanel(false) }),
      h('aside', { class: 'side-panel', dataset: { sec: 'panel' }, 'aria-label': '로그와 채팅' }),
    ),
  );
}
