// 좌석 렌더링: 내 좌석은 항상 하단 중앙, 나머지는 좌석 번호 차이만큼 시계방향으로 배치.
// 좌석 수별로 미리 조정한 슬롯 표(LAYOUTS)를 쓴다: 어떤 좌석의 카드도 다른 좌석의 카드/플레이트나 내 카드와 겹치지 않도록
// 아래쪽 양옆 좌석은 플레이트 위에 카드를 쌓고(bottom), 좌우 좌석은 플레이트 안쪽으로 카드를 내민다(left/right).
import { h } from './dom.js';
import { icon } from './icons.js';
import { cardEl } from './cards.js';
import { chipStack } from './chips.js';
import { formatChips, formatCompact, formatSigned } from '../shared/format.js';
import { STATUS_LABELS, SPECIAL_LABELS } from './texts.js';

// 애니메이션 판단용: 직전 렌더에서 보였던 카드 시그니처 (handNo:playerId → 'h,1g,h')
let seenHand = null;
const seenCards = new Map();

function cardSig(cards) {
  return (cards || []).map((c) => (c.id ? c.id : 'h')).join(',');
}

/**
 * 좌석 수별 슬롯 배치. 슬롯 0 = 나(하단 중앙), 이후 시계방향.
 * x/y 는 테이블 영역(.table-wrap) 기준 퍼센트.
 *  - bottom: 플레이트가 x 에서 아래쪽(bottom: y%)에 붙고 카드는 그 위로 쌓인다 (나, 5~6인 테이블의 아래쪽 양옆 좌석)
 *  - top:    플레이트가 위쪽에 붙고 카드는 그 아래로 (카드 옆에 베팅 칩)
 *  - left/right: 플레이트 중심이 (x, y). 카드는 테이블 안쪽(가로)으로 뻗는다. 좁은 화면에서는 CSS 가 top 과 같은 세로 배치로 바꾼다
 */
const S = (side, x, y = 0) => ({ side, x, y });
const LAYOUTS = {
  2: [S('bottom', 50), S('top', 50)],
  3: [S('bottom', 50), S('left', 11, 40), S('right', 89, 40)],
  4: [S('bottom', 50), S('left', 11, 42), S('top', 50), S('right', 89, 42)],
  5: [S('bottom', 50), S('bottom', 16, 10), S('top', 27), S('top', 73), S('bottom', 84, 10)],
  6: [S('bottom', 50), S('bottom', 16, 10), S('top', 24), S('top', 50), S('top', 76), S('bottom', 84, 10)],
};

/** 슬롯 k (0 = 나) 의 배치. 좌석 수가 표에 없으면 6인 표를 비례해서 쓴다. */
export function slotLayout(k, n) {
  const table = LAYOUTS[n] || LAYOUTS[6];
  return table[Math.min(k, table.length - 1)];
}

/**
 * 좌석 전체 시그니처 — 바뀐 경우에만 좌석 레이어를 다시 그린다.
 */
export function seatsSignature(ctx) {
  const { room, hand, ui } = ctx;
  return {
    code: room.code,
    n: room.settings.maxPlayers,
    mySeat: room.me.seat,
    host: room.hostId,
    players: room.players.map((p) => [p.id, p.nickname, p.seat, p.chips, p.connected, p.status, p.isHost]),
    hand: hand
      ? {
          no: hand.no, stage: hand.stage, turn: hand.turnId, dealer: hand.dealerId, deadline: hand.deadline, total: hand.deadlineTotal,
          ps: hand.players.map((p) => [p.id, cardSig(p.cards), p.openIdx, p.folded, p.allIn, p.roundBet, p.handBet, p.hasSelected, p.hasChosenOpen, p.selected, p.reveal && p.reveal.hand.name]),
          result: hand.result ? [hand.result.type, hand.result.winners, hand.result.payouts, hand.result.specials] : null,
        }
      : null,
    sel: ui.selectIdx,
    menu: ui.seatMenu,
    pending: ui.pending,
    conn: ctx.conn,
  };
}

/** 좌석 레이어의 자식 요소들 생성 */
export function buildSeats(ctx) {
  const { room, hand, me } = ctx;
  const n = Math.max(2, Math.min(6, room.settings.maxPlayers || 6));
  const mySeat = me.seat ?? 0;
  if (hand && seenHand !== hand.no) {
    seenHand = hand.no;
    seenCards.clear();
  }
  const out = [];
  for (let s = 0; s < n; s++) {
    const k = (s - mySeat + n) % n;
    const layout = slotLayout(k, n);
    const player = room.players.find((p) => p.seat === s) || null;
    const hp = player && hand ? hand.players.find((p) => p.id === player.id) || null : null;
    out.push(player ? seatEl(ctx, player, hp, { layout, slot: k, seatNo: s }) : emptySeatEl(ctx, { layout, slot: k, seatNo: s }));
  }
  return out;
}

function seatAttrs(classes, layout, slot, extra = {}) {
  return {
    class: classes.join(' '),
    dataset: { side: layout.side, slot: String(slot), ...extra },
    style: { '--sx': `${layout.x}%`, '--sy': `${layout.y}%` },
  };
}

function emptySeatEl(ctx, { layout, slot, seatNo }) {
  const canSit = ctx.me.seat == null && ctx.conn === 'open';
  return h(
    'div',
    seatAttrs(['seat', 'seat-empty'], layout, slot),
    h(
      'div',
      { class: 'seat-plate empty-plate' },
      h('span', { class: 'empty-label' }, `빈 자리 ${seatNo + 1}`),
      canSit ? h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onClick: () => ctx.actions.sit() }, icon('seat', 'icon-sm'), '앉기') : null,
    ),
  );
}

function seatEl(ctx, player, hp, { layout, slot }) {
  const { room, hand, me, ui, actions } = ctx;
  const isMe = player.id === me.id;
  const isTurn = Boolean(hand && hand.turnId === player.id && hand.stage !== 'done');
  const isDealer = Boolean(hand && hand.dealerId === player.id);
  const result = hand && hand.stage === 'done' ? hand.result : null;
  const isWinner = Boolean(result && result.winners.includes(player.id));
  const payout = result && result.payouts ? result.payouts[player.id] || 0 : 0;
  const folded = Boolean(hp && hp.folded);
  const inHand = Boolean(hp);
  const waitingInHand = Boolean(hand && !hp && player.seat != null);
  const disconnected = !player.connected;
  const classes = ['seat'];
  if (isMe) classes.push('seat-me');
  if (isTurn) classes.push('seat-turn');
  if (folded) classes.push('seat-folded');
  if (isWinner) classes.push('seat-winner');
  if (disconnected) classes.push('seat-dc');
  if (!inHand && hand) classes.push('seat-out');
  if (hp && hp.allIn && !folded) classes.push('seat-allin');

  // 상태 태그
  let statusText = '';
  if (folded) statusText = '다이';
  else if (hp && hp.allIn) statusText = '올인';
  else if (player.status === 'spectating') statusText = '관전';
  else if (waitingInHand || player.status === 'waiting' || player.status === 'sitout') statusText = STATUS_LABELS[player.status] || '대기';
  if (hand && hand.stage === 'open' && hp) statusText = hp.hasChosenOpen ? '공개 선택 완료' : '공개 카드 선택 중';
  if (hand && hand.stage === 'select' && hp && !folded) statusText = hp.hasSelected ? '선택 완료' : '패 선택 중';

  // 카드
  const cards = hp ? hp.cards : [];
  const sigKey = `${hand ? hand.no : 0}:${player.id}`;
  const prevSig = seenCards.get(sigKey) || '';
  const prevArr = prevSig ? prevSig.split(',') : [];
  const curSig = cardSig(cards);
  seenCards.set(sigKey, curSig);

  const myStage = hand ? hand.stage : null;
  const mySelected = isMe && hp ? (hp.hasSelected && hp.selected ? hp.selected : ui.selectIdx) : null;
  const canChooseOpen = isMe && hp && myStage === 'open' && !hp.hasChosenOpen && !ui.pending;
  const canSelect = isMe && hp && myStage === 'select' && !folded && !hp.hasSelected && !ui.pending;

  const cardEls = cards.map((c, i) => {
    const prev = prevArr[i];
    const nowVisible = Boolean(c.id);
    let anim = null;
    if (prev === undefined) anim = isMe && i === 2 ? 'squeeze' : 'deal';
    else if (prev === 'h' && nowVisible) anim = 'flip';
    const selectedHere = Array.isArray(mySelected) && mySelected.includes(i);
    const dimUnselected = isMe && hp && hp.hasSelected && hp.selected && !hp.selected.includes(i) && (myStage === 'done' || myStage === 'select');
    const tag = isMe && c.open ? '공개' : null;
    const selectable = canChooseOpen || canSelect;
    return cardEl(c, {
      size: isMe ? 'lg' : 'sm',
      dim: folded || dimUnselected,
      tag,
      anim,
      idx: i,
      selected: selectedHere && (myStage === 'select' || myStage === 'done'),
      selectable,
      onClick: selectable
        ? () => {
            if (canChooseOpen) actions.chooseOpen(i);
            else if (canSelect) actions.toggleSelect(i);
          }
        : null,
    });
  });

  // 족보 콜아웃 (쇼다운 공개 후) — 카드 위에 겹쳐 띄워 세로 공간을 차지하지 않는다
  let callout = null;
  if (hp && hp.reveal && myStage === 'done') {
    const specials = (result?.specials || []).filter((s) => s.id === player.id);
    callout = h(
      'div',
      { class: `hand-callout${isWinner ? ' is-winner' : ''}` },
      h('span', { class: 'hand-name' }, hp.reveal.hand.name),
      specials.map((s) =>
        h('span', { class: `special-tag ${s.success ? 'ok' : 'fail'}` }, `${SPECIAL_LABELS[s.kind] || s.kind} ${s.success ? '성공' : '실패'}`),
      ),
    );
  } else if (result && result.type === 'fold' && isWinner) {
    callout = h('div', { class: 'hand-callout is-winner' }, h('span', { class: 'hand-name' }, '기권승'));
  }

  const cardsWrap = h('div', { class: 'seat-cards' }, cardEls.length ? h('div', { class: 'card-row' }, cardEls) : null, callout);

  // 아바타 + 타이머 링
  const total = hand && hand.deadlineTotal ? hand.deadlineTotal : (room.settings.turnSeconds || 30) * 1000;
  const ring =
    isTurn && hand.deadline
      ? `<svg class="ring" viewBox="0 0 48 48" aria-hidden="true"><circle class="ring-bg" cx="24" cy="24" r="21"/><circle class="ring-fg" cx="24" cy="24" r="21" data-deadline="${hand.deadline}" data-total="${total}"/></svg>`
      : '';
  const avatar = h('div', { class: 'avatar', html: ring });
  avatar.append(h('span', { class: 'initial' }, (player.nickname || '?').slice(0, 1)));
  avatar.append(h('span', { class: `conn-dot ${player.connected ? 'on' : 'off'}`, title: player.connected ? '접속 중' : '접속 끊김' }));

  // 플레이트 — 배지(선 토큰/상태/남은 시간/메뉴)는 모두 플레이트 가장자리의 여백 위에만 놓여 닉네임·금액을 가리지 않는다
  const hasMenu = me.isHost && !isMe;
  const plate = h(
    'div',
    { class: `seat-plate${hasMenu ? ' has-menu' : ''}` },
    avatar,
    h(
      'div',
      { class: 'seat-text' },
      h('div', { class: 'seat-name' }, player.isHost ? h('span', { class: 'host-badge', title: '방장' }, icon('crown', 'icon-xs')) : null, h('span', { class: 'nick' }, player.nickname), isMe ? h('span', { class: 'me-tag' }, '나') : null),
      h('div', { class: 'seat-chips', title: formatChips(player.chips) }, h('span', { class: 'chips-full' }, formatChips(player.chips)), h('span', { class: 'chips-compact' }, formatCompact(player.chips))),
      disconnected ? h('div', { class: 'seat-sub' }, '접속 끊김') : null,
    ),
    isDealer ? h('span', { class: 'dealer-token', title: '선(보스)' }, '선') : null,
    statusText ? h('span', { class: `status-tag st-${folded ? 'folded' : hp && hp.allIn ? 'allin' : 'info'}` }, statusText) : null,
    isTurn && hand.deadline ? h('span', { class: 'turn-time', dataset: { until: String(hand.deadline) } }, '') : null,
    payout > 0 ? h('span', { class: 'seat-payout' }, formatSigned(payout)) : null,
  );

  // 방장 전용 좌석 메뉴 (다른 플레이어)
  if (hasMenu) {
    const open = ui.seatMenu === player.id;
    plate.append(
      h(
        'button',
        { type: 'button', class: 'kebab', 'aria-label': `${player.nickname} 좌석 메뉴`, 'aria-expanded': String(open), onClick: (e) => { e.stopPropagation(); actions.toggleSeatMenu(player.id); } },
        icon('more', 'icon-sm'),
      ),
    );
    if (open) {
      plate.append(
        h(
          'div',
          { class: 'seat-menu', role: 'menu' },
          h('button', { type: 'button', class: 'menu-item', role: 'menuitem', onClick: () => actions.host('kick', { playerId: player.id }) }, icon('kick', 'icon-sm'), '강퇴'),
          h('button', { type: 'button', class: 'menu-item', role: 'menuitem', onClick: () => actions.host('transfer', { playerId: player.id }) }, icon('crown', 'icon-sm'), '방장 양도'),
        ),
      );
    }
  }

  // 이번 라운드 베팅 (좌석 앞 칩)
  const roundBet = hp && hand.stage !== 'done' && (hand.stage === 'bet1' || hand.stage === 'bet2') ? hp.roundBet : 0;
  const bet = roundBet > 0 ? h('div', { class: 'seat-bet' }, chipStack(roundBet, room.settings.base), h('span', { class: 'bet-amount' }, formatChips(roundBet))) : h('div', { class: 'seat-bet seat-bet-empty' });

  return h(
    'div',
    seatAttrs(classes, layout, slot, { id: player.id }),
    plate,
    h('div', { class: 'seat-inner' }, cardsWrap, bet),
  );
}
