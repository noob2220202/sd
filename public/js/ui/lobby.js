// 로비: 제목 / 방 만들기(닉네임 + 설정) / 참여하기(코드 + 닉네임) / 크레딧
import { h, section } from './dom.js';
import { icon } from './icons.js';
import { buildSettingsForm } from './settingsForm.js';
import { connPill } from './topbar.js';
import { DEFAULT_SETTINGS } from './texts.js';

const LS_NICK = 'seotda.nickname';

export function renderLobby(root, ctx) {
  const { actions } = ctx;
  const built = section(root, 'lobby', () => build(ctx));
  // 상태 변화는 뼈대를 다시 만들지 않고 속성만 갱신
  const ready = ctx.conn === 'open' && ctx.helloDone;
  for (const b of root.querySelectorAll('button[type=submit]')) b.disabled = !ready;
  const pill = root.querySelector('.lobby-conn');
  if (pill) pill.replaceChildren(connPill(ctx.conn));
  const codeInput = root.querySelector('input[name=code]');
  if (codeInput && ctx.prefillCode && codeInput.dataset.prefilled !== ctx.prefillCode) {
    codeInput.value = ctx.prefillCode;
    codeInput.dataset.prefilled = ctx.prefillCode;
    root.querySelector('.lobby-join')?.classList.add('highlight');
    if (built) requestAnimationFrame(() => root.querySelector('.lobby-join input[name=nickname]')?.focus({ preventScroll: true }));
  }
  const err = root.querySelector('.lobby-error');
  if (err) {
    err.textContent = ctx.lobbyError || '';
    err.hidden = !ctx.lobbyError;
  }
}

function build(ctx) {
  const { actions } = ctx;
  const savedNick = safeGet(LS_NICK) || '';
  const settingsForm = buildSettingsForm(DEFAULT_SETTINGS);

  const createNick = nickInput(savedNick);
  const createForm = h(
    'form',
    {
      class: 'lobby-form',
      onSubmit: (e) => {
        e.preventDefault();
        const nickname = createNick.value.trim();
        if (!nickname) return createNick.focus();
        try {
          const settings = settingsForm.read();
          actions.createRoom(nickname, settings);
        } catch (err) {
          settingsForm.showError(err.message);
        }
      },
    },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, '닉네임'), createNick),
    h('details', { class: 'settings-details', open: true }, h('summary', {}, icon('sliders', 'icon-sm'), '방 설정'), settingsForm.el),
    h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' }, icon('plus', 'icon-sm'), '방 만들기'),
  );

  const joinNick = nickInput(savedNick);
  const codeInput = h('input', { class: 'input code-input', name: 'code', type: 'text', maxlength: '6', placeholder: '6자리 코드', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', required: true, 'aria-label': '방 코드' });
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  const joinForm = h(
    'form',
    {
      class: 'lobby-form',
      onSubmit: (e) => {
        e.preventDefault();
        const code = codeInput.value.trim().toUpperCase();
        const nickname = joinNick.value.trim();
        if (code.length < 4) return codeInput.focus();
        if (!nickname) return joinNick.focus();
        actions.joinRoom(code, nickname);
      },
    },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, '방 코드'), codeInput),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, '닉네임'), joinNick),
    h('button', { type: 'submit', class: 'btn btn-gold btn-lg btn-block' }, icon('chevronRight', 'icon-sm'), '참여하기'),
  );

  return h(
    'div',
    { class: 'lobby' },
    h(
      'header',
      { class: 'lobby-hero' },
      h('div', { class: 'hero-cards', 'aria-hidden': 'true' }, heroCard('1g'), heroCard('8g'), heroCard('10t')),
      h('h1', { class: 'lobby-title' }, '섯다'),
      h('p', { class: 'lobby-sub' }, '친구들과 즐기는 3장 섯다 · 무기명 · 가상 칩'),
      h('div', { class: 'lobby-conn' }),
    ),
    h('p', { class: 'lobby-error', role: 'alert', hidden: true }),
    h(
      'div',
      { class: 'lobby-cards' },
      h('section', { class: 'lobby-card lobby-create' }, h('h2', { class: 'card-title' }, '방 만들기'), createForm),
      h('section', { class: 'lobby-card lobby-join' }, h('h2', { class: 'card-title' }, '참여하기'), h('p', { class: 'muted small' }, '방장이 공유한 코드 또는 초대 링크로 들어옵니다.'), joinForm),
    ),
    h(
      'footer',
      { class: 'lobby-footer' },
      h('button', { type: 'button', class: 'link-btn', onClick: () => actions.openModal('rules') }, '규칙'),
      h('span', { class: 'dot-sep' }),
      h('button', { type: 'button', class: 'link-btn', onClick: () => actions.openModal('credits') }, '크레딧'),
      h('span', { class: 'dot-sep' }),
      h('span', {}, '화투 이미지: Spenĉjo (Wikimedia Commons, CC BY-SA 4.0)'),
      h('span', { class: 'dot-sep' }),
      h('span', {}, '사행성 없음 · 가상 칩 전용'),
    ),
  );
}

function heroCard(id) {
  const img = h('img', { src: `/assets/cards/${id}.svg`, alt: '' });
  img.addEventListener('error', () => img.remove(), { once: true });
  return h('div', { class: 'hero-card' }, img);
}

function nickInput(value) {
  return h('input', { class: 'input', name: 'nickname', type: 'text', maxlength: '12', placeholder: '1~12자', value, autocomplete: 'nickname', required: true, 'aria-label': '닉네임' });
}

function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
