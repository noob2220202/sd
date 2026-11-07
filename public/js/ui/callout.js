// 이벤트(베팅/다이/타임아웃) 콜아웃: 좌석 위에 잠깐 떠오르는 큼직한 글자 (Black Han Sans)
import { h } from './dom.js';
import { ACTION_LABELS } from './texts.js';
import { formatChips } from '../shared/format.js';

export function showCallout(layer, seatEl, ev) {
  if (!layer || !seatEl) return;
  let text = '';
  let cls = '';
  if (ev.ev === 'bet' || ev.ev === 'action') {
    if (ev.kind === 'die') { text = '다이'; cls = 'co-die'; }
    else if (ev.kind === 'check') { text = '체크'; cls = 'co-check'; }
    else { text = ACTION_LABELS[ev.kind] || ev.kind; cls = ev.allIn || ev.kind === 'allin' ? 'co-allin' : 'co-bet'; }
  } else if (ev.ev === 'die') { text = '다이'; cls = 'co-die'; }
  else if (ev.ev === 'timeout') { text = '시간 초과'; cls = 'co-die'; }
  else if (ev.ev === 'refill') { text = '리필'; cls = 'co-check'; }
  else return;
  const lr = layer.getBoundingClientRect();
  const sr = seatEl.getBoundingClientRect();
  const el = h('div', { class: `callout ${cls}`, style: { left: `${sr.left + sr.width / 2 - lr.left}px`, top: `${sr.top + sr.height / 2 - lr.top}px` } },
    h('span', { class: 'co-text' }, text),
    ev.pay > 0 ? h('span', { class: 'co-amt' }, formatChips(ev.pay)) : null,
  );
  el.addEventListener('animationend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 2500);
  layer.append(el);
}
