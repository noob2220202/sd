// 사이드 패널: 로그 / 채팅 탭. 리스트는 새 항목만 추가(채팅 입력 포커스·스크롤 유지).
import { h, section } from './dom.js';
import { icon } from './icons.js';

const LIST_STATE = new WeakMap(); // listEl → {code, count, firstTs}

function timeStr(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 패널 뼈대를 한 번 만들고 이후에는 탭/리스트만 갱신 */
export function renderPanel(root, ctx) {
  const { room, ui, actions } = ctx;
  if (!root.firstElementChild) {
    const input = h('input', { class: 'input chat-input', type: 'text', maxlength: '200', placeholder: '메시지 입력 후 Enter', autocomplete: 'off', 'aria-label': '채팅 메시지', 'data-testid': 'chat-input' });
    const form = h(
      'form',
      {
        class: 'chat-form',
        onSubmit: (e) => {
          e.preventDefault();
          const text = input.value.trim();
          if (!text) return;
          actions.chat(text);
          input.value = '';
          input.focus();
        },
      },
      input,
      h('button', { type: 'submit', class: 'btn btn-primary btn-sm', 'aria-label': '전송', 'data-testid': 'chat-send' }, icon('chevronRight', 'icon-sm')),
    );
    root.append(
      h(
        'div',
        { class: 'panel-head' },
        h('div', { class: 'tabs', role: 'tablist' }, tabBtn('log', '로그', actions), tabBtn('chat', '채팅', actions)),
        h('button', { type: 'button', class: 'icon-btn panel-close', 'aria-label': '패널 닫기', onClick: () => actions.togglePanel(false) }, icon('close')),
      ),
      h('div', { class: 'panel-body' }, h('ul', { class: 'list log-list', dataset: { tab: 'log' }, 'data-testid': 'log-list' }), h('ul', { class: 'list chat-list', dataset: { tab: 'chat' }, 'data-testid': 'chat-list' })),
      h('div', { class: 'panel-foot' }, form),
    );
  }
  // 탭 상태
  for (const b of root.querySelectorAll('.tab')) {
    const active = b.dataset.tab === ui.tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
    const badge = b.querySelector('.tab-badge');
    if (b.dataset.tab === 'chat') {
      const n = ui.unreadChat;
      badge.textContent = n > 0 ? String(n > 99 ? '99+' : n) : '';
      badge.hidden = !(n > 0);
    }
  }
  for (const l of root.querySelectorAll('.list')) l.hidden = l.dataset.tab !== ui.tab;
  root.querySelector('.panel-foot').hidden = ui.tab !== 'chat';
  root.querySelector('.chat-input').disabled = ctx.conn !== 'open';

  updateList(root.querySelector('.log-list'), room.code, room.log || [], (e) =>
    h('li', { class: `log-item kind-${e.kind || 'info'}` }, h('time', { class: 'ts' }, timeStr(e.ts)), h('span', { class: 'log-text' }, e.text)),
  );
  updateList(root.querySelector('.chat-list'), room.code, room.chat || [], (c) =>
    h(
      'li',
      { class: `chat-item${c.fromId === room.me.id ? ' mine' : ''}` },
      h('div', { class: 'chat-meta' }, h('span', { class: 'chat-from' }, c.from), h('time', { class: 'ts' }, timeStr(c.ts))),
      h('div', { class: 'chat-text' }, c.text),
    ),
  );
}

function tabBtn(id, label, actions) {
  return h(
    'button',
    { type: 'button', class: 'tab', role: 'tab', dataset: { tab: id }, 'data-testid': `tab-${id}`, onClick: () => actions.setTab(id) },
    icon(id === 'log' ? 'list' : 'chat', 'icon-sm'),
    label,
    h('span', { class: 'tab-badge', hidden: true }),
  );
}

/** 리스트 증분 갱신: 방이 바뀌었거나 줄어들었으면 전부 다시, 아니면 새 항목만 추가 */
function updateList(listEl, code, items, build) {
  const st = LIST_STATE.get(listEl) || { code: null, count: 0, firstTs: null };
  const firstTs = items.length ? items[0].ts : null;
  const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 40;
  // 서버는 최근 100개만 유지하므로 첫 항목이 바뀌면(밀려났으면) 전체 재구성
  if (st.code !== code || items.length < st.count || st.firstTs !== firstTs) {
    listEl.replaceChildren(...items.map(build));
    LIST_STATE.set(listEl, { code, count: items.length, firstTs });
    listEl.scrollTop = listEl.scrollHeight;
    return;
  }
  if (items.length === st.count) return;
  for (let i = st.count; i < items.length; i++) listEl.append(build(items[i]));
  LIST_STATE.set(listEl, { code, count: items.length, firstTs });
  if (nearBottom) listEl.scrollTop = listEl.scrollHeight;
}
