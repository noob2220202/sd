// 토스트 알림(에러/안내)
import { h } from './dom.js';

let root = null;
export function toast(message, kind = 'info', ms = 3500) {
  root = root || document.getElementById('toast-root');
  if (!root) return;
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  root.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600);
  }, ms);
}
