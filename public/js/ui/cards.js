// 화투 카드 요소. 이미지 로드 실패 시(아직 없는 파일 등) 월/이름 라벨이 있는 프레임으로 대체한다.
import { h } from './dom.js';
import { cardById, monthLabel, KIND_NAMES } from '../shared/cards.js';

const CARD_DIR = '/assets/cards/';

/**
 * @param {{id?:string, hidden?:boolean, open?:boolean}} card
 * @param {{size?:'xs'|'sm'|'md'|'lg', faceDown?:boolean, dim?:boolean, tag?:string|null, anim?:'deal'|'squeeze'|null,
 *          selected?:boolean, selectable?:boolean, onClick?:Function, idx?:number, title?:string}} opts
 */
export function cardEl(card, opts = {}) {
  const faceDown = opts.faceDown || !card || card.hidden || !card.id;
  const info = !faceDown ? cardById(card.id) : null;
  const classes = ['card', `card-${opts.size || 'md'}`];
  if (faceDown) classes.push('card-back');
  if (opts.dim) classes.push('card-dim');
  if (opts.selected) classes.push('card-selected');
  if (opts.selectable) classes.push('card-selectable');
  if (opts.anim) classes.push(`card-anim-${opts.anim}`);
  if (card && card.open) classes.push('card-open');

  const el = h(
    opts.selectable ? 'button' : 'div',
    {
      class: classes.join(' '),
      type: opts.selectable ? 'button' : null,
      'aria-label': faceDown ? '뒷면 카드' : `${info ? info.name : card.id}${card.open ? ' (공개)' : ''}`,
      title: opts.title || (info ? `${monthLabel(info.month)} ${info.name}` : null),
      dataset: opts.idx != null ? { idx: String(opts.idx) } : null,
      onClick: opts.onClick || null,
    },
  );
  const inner = h('div', { class: 'card-inner' });
  // 앞면
  const front = h('div', { class: 'card-face card-front' });
  if (!faceDown) {
    const img = h('img', { src: `${CARD_DIR}${card.id}.svg`, alt: '', draggable: 'false', loading: 'eager' });
    img.addEventListener('error', () => {
      img.remove();
      front.append(fallbackFace(info, card.id));
    }, { once: true });
    front.append(img);
  }
  // 뒷면
  const back = h('div', { class: 'card-face card-back-face' }, h('img', { src: `${CARD_DIR}back.svg`, alt: '', draggable: 'false' }));
  inner.append(back, front);
  // 애니메이션이 끝나면 클래스를 떼어 fill-mode 가 남지 않게 한다(남아 있으면 3D 뒤집기가 평면화되어 뒷면이 흰색으로 보임)
  if (opts.anim) inner.addEventListener('animationend', () => el.classList.remove(`card-anim-${opts.anim}`), { once: true });
  el.append(inner);
  if (opts.tag) el.append(h('span', { class: 'card-tag' }, opts.tag));
  if (opts.selected) el.append(h('span', { class: 'card-check', 'aria-hidden': 'true' }));
  return el;
}

/** 이미지가 없을 때의 대체 앞면: 월 + 종류 + 그림 이름 */
function fallbackFace(info, id) {
  if (!info) return h('div', { class: 'card-fallback' }, h('span', { class: 'cf-month' }, id));
  return h(
    'div',
    { class: `card-fallback cf-${info.kind}` },
    h('span', { class: 'cf-month' }, monthLabel(info.month)),
    h('span', { class: 'cf-kind' }, KIND_NAMES[info.kind]),
    h('span', { class: 'cf-label' }, info.label),
  );
}

/** 카드 요소 묶음(한 플레이어의 손패) */
export function cardRow(cards, mapOpts) {
  return h('div', { class: 'card-row' }, cards.map((c, i) => cardEl(c, mapOpts(c, i))));
}
