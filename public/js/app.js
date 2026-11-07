// 부트스트랩: 네트워크(또는 목) 연결, 상태 보관, 메시지 처리, 단일 render() 진입점
import { Net, defaultWsUrl } from './net.js';
import { resetSection } from './ui/dom.js';
import { renderLobby } from './ui/lobby.js';
import { renderTable } from './ui/table.js';
import { renderModals } from './ui/modals.js';
import { toast } from './ui/toast.js';
import { startTicker } from './ui/timers.js';
import { showCallout } from './ui/callout.js';

const LS_TOKEN = 'seotda.token';
const LS_NICK = 'seotda.nickname';

const params = new URLSearchParams(location.search);
const MOCK = params.get('mock') === '1';

const state = {
  conn: 'idle',
  helloDone: false,
  playerId: null,
  token: lsGet(LS_TOKEN),
  room: null,
  offset: 0, // serverTime - Date.now()
  prefillCode: codeFromPath(),
  lobbyError: null,
  mock: MOCK,
  ui: {
    panelOpen: false,
    tab: 'log',
    modal: null,
    pending: false,
    selectIdx: [],
    unreadChat: 0,
    seenChat: 0,
    seatMenu: null,
    handKey: null,
    resultHidden: null,
  },
};

let net = null;
let pendingTimer = null;
const root = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');

// ---- 액션 (UI → 서버) ---------------------------------------------------------------
const actions = {
  send(msg) {
    if (net) net.send(msg);
  },
  createRoom(nickname, settings) {
    lsSet(LS_NICK, nickname);
    state.lobbyError = null;
    actions.send({ t: 'create_room', nickname, settings });
  },
  joinRoom(code, nickname) {
    lsSet(LS_NICK, nickname);
    state.lobbyError = null;
    actions.send({ t: 'join_room', code, nickname });
  },
  leave() {
    actions.send({ t: 'leave_room' });
    state.room = null;
    state.ui.modal = null;
    state.ui.panelOpen = false;
    state.prefillCode = null;
    if (!MOCK) history.replaceState(null, '', '/');
    render();
  },
  act(kind) {
    if (!state.room?.hand || state.ui.pending) return;
    markPending();
    actions.send({ t: 'action', handNo: state.room.hand.no, kind });
    render();
  },
  chooseOpen(idx) {
    if (!state.room?.hand || state.ui.pending) return;
    markPending();
    actions.send({ t: 'open_choose', handNo: state.room.hand.no, idx });
    render();
  },
  toggleSelect(i) {
    const sel = state.ui.selectIdx;
    const at = sel.indexOf(i);
    if (at >= 0) sel.splice(at, 1);
    else {
      if (sel.length >= 2) sel.shift();
      sel.push(i);
    }
    render();
  },
  setSelect(idx) {
    state.ui.selectIdx = [...idx];
    render();
  },
  select() {
    const sel = state.ui.selectIdx;
    if (!state.room?.hand || sel.length !== 2 || state.ui.pending) return;
    markPending();
    actions.send({ t: 'select', handNo: state.room.hand.no, idx: [Math.min(...sel), Math.max(...sel)] });
    render();
  },
  rejoin() {
    if (state.ui.pending) return;
    markPending();
    actions.send({ t: 'rejoin' });
    render();
  },
  refill() {
    actions.send({ t: 'refill' });
  },
  sit() {
    actions.send({ t: 'sit' });
  },
  stand() {
    actions.send({ t: 'stand' });
  },
  chat(text) {
    actions.send({ t: 'chat', text });
  },
  host(cmd, extra = {}) {
    state.ui.seatMenu = null;
    actions.send({ t: 'host', cmd, ...extra });
    render();
  },
  async copyInvite() {
    const url = `${location.origin}/r/${state.room?.code || ''}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(url);
      else legacyCopy(url);
      toast('초대 링크를 복사했습니다', 'ok');
    } catch {
      legacyCopy(url);
      toast(`초대 링크: ${url}`, 'info', 6000);
    }
  },
  openModal(kind, data = null) {
    state.ui.modal = { kind, data };
    state.ui.seatMenu = null;
    render();
  },
  closeModal() {
    state.ui.modal = null;
    render();
  },
  togglePanel(open) {
    state.ui.panelOpen = typeof open === 'boolean' ? open : !state.ui.panelOpen;
    if (state.ui.panelOpen && state.ui.tab === 'chat') clearUnread();
    render();
  },
  setTab(tab) {
    state.ui.tab = tab;
    if (tab === 'chat') clearUnread();
    render();
  },
  toggleSeatMenu(id) {
    state.ui.seatMenu = state.ui.seatMenu === id ? null : id;
    render();
  },
  hideResult(no) {
    state.ui.resultHidden = no;
    render();
  },
  showResult() {
    state.ui.resultHidden = null;
    render();
  },
};

function markPending() {
  state.ui.pending = true;
  clearTimeout(pendingTimer);
  // 서버 응답이 없더라도 영원히 잠기지 않게 안전장치
  pendingTimer = setTimeout(() => {
    state.ui.pending = false;
    render();
  }, 4000);
}

function clearUnread() {
  state.ui.unreadChat = 0;
  state.ui.seenChat = state.room?.chat?.length || 0;
}

// ---- 메시지 처리 ---------------------------------------------------------------------
function onMessage(msg) {
  if (!msg || typeof msg.t !== 'string') return;
  switch (msg.t) {
    case 'hello_ok':
      state.token = msg.token;
      state.playerId = msg.playerId;
      state.helloDone = true;
      lsSet(LS_TOKEN, msg.token);
      render();
      break;
    case 'state':
      applyState(msg.room);
      break;
    case 'event':
      handleEvent(msg);
      break;
    case 'error':
      state.ui.pending = false;
      clearTimeout(pendingTimer);
      if (!state.room) state.lobbyError = msg.message || '오류가 발생했습니다';
      toast(msg.message || `오류: ${msg.code}`, 'error');
      render();
      break;
    default:
      break;
  }
}

function applyState(room) {
  state.ui.pending = false;
  clearTimeout(pendingTimer);
  const prev = state.room;
  state.room = room || null;
  if (!room) {
    render();
    return;
  }
  if (typeof room.serverTime === 'number') state.offset = room.serverTime - Date.now();
  state.lobbyError = null;
  // 판/단계가 바뀌면 로컬 선택 초기화
  const key = room.hand ? `${room.hand.no}:${room.hand.stage}` : null;
  if (key !== state.ui.handKey) {
    state.ui.handKey = key;
    state.ui.selectIdx = [];
    if (!room.hand || room.hand.stage !== 'done') state.ui.resultHidden = null;
  }
  // 채팅 읽지 않음 카운트
  const chatLen = room.chat?.length || 0;
  if (!prev || prev.code !== room.code) state.ui.seenChat = chatLen;
  const viewingChat = state.ui.tab === 'chat' && (state.ui.panelOpen || matchMedia('(min-width: 1024px)').matches);
  if (viewingChat) state.ui.seenChat = chatLen;
  state.ui.unreadChat = Math.max(0, chatLen - state.ui.seenChat);
  // 좌석 메뉴 대상이 사라졌으면 닫기
  if (state.ui.seatMenu && !room.players.some((p) => p.id === state.ui.seatMenu)) state.ui.seatMenu = null;
  // URL 을 초대 링크 형태로
  if (!MOCK && location.pathname !== `/r/${room.code}`) history.replaceState(null, '', `/r/${room.code}`);
  render();
}

function handleEvent(ev) {
  if (!state.room) return;
  const layer = root.querySelector('.fly-layer');
  if (ev.ev === 'bet' || ev.ev === 'action' || ev.ev === 'die' || ev.ev === 'timeout' || ev.ev === 'refill') {
    const seat = root.querySelector(`.seat[data-id="${ev.playerId}"]`);
    showCallout(layer, seat, ev);
  } else if (ev.ev === 'kick' && ev.playerId === state.playerId) {
    toast('방장에 의해 강퇴되었습니다', 'error', 5000);
  } else if (ev.ev === 'join' && ev.nickname) {
    toast(`${ev.nickname} 님이 입장했습니다`, 'info', 2000);
  } else if (ev.ev === 'leave' && ev.nickname) {
    toast(`${ev.nickname} 님이 나갔습니다`, 'info', 2000);
  }
}

function onStatus(s) {
  state.conn = s;
  if (s === 'open') {
    // 재접속 포함: 토큰으로 인사 → 서버가 좌석/칩 복구 후 state 재전송
    net.send({ t: 'hello', token: state.token || undefined }, false);
  } else if (s === 'reconnecting' || s === 'closed') {
    state.ui.pending = false;
  }
  render();
}

// ---- 렌더 ----------------------------------------------------------------------------
function ctx() {
  const room = state.room;
  return {
    room,
    me: room ? room.me : null,
    hand: room ? room.hand : null,
    conn: state.conn,
    helloDone: state.helloDone,
    prefillCode: state.prefillCode,
    lobbyError: state.lobbyError,
    ui: state.ui,
    actions,
    mock: MOCK,
    now: () => Date.now() + state.offset,
  };
}

let rafId = 0;
function render() {
  // 같은 틱에 여러 번 호출되면 한 번만 그린다
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    const c = ctx();
    if (c.room) renderTable(root, c);
    else {
      if (root.dataset.view !== 'lobby') {
        root.dataset.view = 'lobby';
        root.replaceChildren();
        resetSection(root); // 테이블에서 돌아오면 로비 뼈대를 다시 만든다
      }
      renderLobby(root, c);
    }
    renderModals(modalRoot, c);
  });
}

// ---- 키보드 ----------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (e.key === 'Escape') {
    if (state.ui.modal) return actions.closeModal();
    if (state.ui.seatMenu) return actions.toggleSeatMenu(state.ui.seatMenu);
    if (state.ui.panelOpen && !matchMedia('(min-width: 1024px)').matches) return actions.togglePanel(false);
  }
  if (typing || state.ui.modal) return;
  // 1~9: 액션 버튼 단축키
  if (/^[1-9]$/.test(e.key)) {
    const btn = root.querySelector(`.action-bar .act[data-key="${e.key}"]`);
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  }
});
document.addEventListener('click', (e) => {
  if (state.ui.seatMenu && !e.target.closest('.seat-menu, .kebab')) actions.toggleSeatMenu(state.ui.seatMenu);
});

// ---- 유틸 -----------------------------------------------------------------------------
function codeFromPath() {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})/);
  return m ? m[1].toUpperCase() : null;
}
function lsGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* 사생활 보호 모드 등 */ }
}
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
}

// ---- 시작 -----------------------------------------------------------------------------
async function boot() {
  startTicker(() => state.offset);
  render();
  if (MOCK) {
    const { MockNet } = await import('./dev/mock.js');
    net = new MockNet({ onMessage, onStatus, stage: params.get('stage') });
  } else {
    net = new Net({ url: defaultWsUrl(), onMessage, onStatus });
  }
  net.connect();
}
boot();
