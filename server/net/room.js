// Room: 방 하나의 전체 상태(좌석/플레이어/설정/방장/채팅/로그)와 핸드 진행(타이머·선·재경기·리필·장부)을 담당한다.
// 게임 규칙 자체는 server/game/engine.js(Hand) 가, 네트워크 소켓은 connection.js 가 담당한다.
import { Hand } from '../game/engine.js';
import { normalizeSettings } from './protocol.js';
import { formatChips } from '../../public/js/shared/format.js';

export const INTERMISSION_MS = 7000; // 쇼다운 결과 표시 시간
export const FOLD_INTERMISSION_MS = 4000; // 기권승(카드 비공개) 표시 시간
export const REGAME_INTERMISSION_MS = 9000; // 재경기 안내(참가 버튼 포함) 시간
export const DISCONNECTED_TURN_MS = 60_000; // 제한시간 없음 설정에서 끊긴 플레이어의 턴 자동 처리 시간
const MAX_LOG = 100;
const MAX_CHAT = 100;

const ACTION_LABEL = {
  check: '체크',
  bbing: '삥',
  call: '콜',
  ddadang: '따당',
  quarter: '쿼터',
  half: '하프',
  max: '맥스',
  allin: '올인',
  die: '다이',
};
const REGAME_LABEL = { tie: '동점', gusa: '구사', mung_gusa: '멍텅구리구사' };
const SPECIAL_LABEL = { ddaengjabi: '땡잡이', amhaeng: '암행어사', gusa: '구사', mungGusa: '멍텅구리구사' };

export class Room {
  /**
   * @param {string} code
   * @param {object} settings  normalizeSettings 를 통과한 설정
   * @param {{id:string, nickname:string}} host
   * @param {object} config    server/config.js
   * @param {() => void} onEmpty  방이 비어 정리되어야 할 때 호출(RoomManager 가 remove)
   * @param {{now?:()=>number, setTimeout?:Function, clearTimeout?:Function}} [clock]  테스트용 가짜 시계
   */
  constructor(code, settings, host, config, onEmpty = () => {}, clock = {}) {
    this.code = code;
    this.settings = normalizeSettings(settings);
    this.pendingSettings = null;
    this.config = config;
    this.onEmpty = onEmpty;
    this.now = clock.now || (() => Date.now());
    this._setTimeout = clock.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    this._clearTimeout = clock.clearTimeout || ((h) => clearTimeout(h));
    this.deckProvider = clock.deckProvider || null; // 테스트용: (handNo) => 카드 ID 배열

    /** @type {Map<string, Player>} */
    this.players = new Map();
    /** @type {(string|null)[]} */
    this.seats = new Array(this.settings.maxPlayers).fill(null);
    this.hostId = null;
    this.phase = 'lobby'; // lobby | playing | paused
    this.hand = null;
    this.handNo = 0;
    this.carried = 0;
    this.pendingRegame = null; // {reason, participants:string[]}
    this.dealerId = null;
    this.intermission = null; // {until, regameNext, rejoinFee, rejoinable:Set, rejoined:Set}
    this.timer = null;
    this.timerKind = null;
    this.deadline = null;
    this.log = [];
    this.chat = [];
    this.lastActivity = this.now();
    this.destroyed = false;
    this.sweepTimer = this._setTimeout(() => this._sweepDisconnected(), 30_000);
    if (this.sweepTimer?.unref) this.sweepTimer.unref();

    this.join(host.id, host.nickname, null);
    this.hostId = host.id;
    this._log(`${this.player(host.id).nickname} 님이 방을 만들었습니다`, 'system');
  }

  // =====================================================================================
  // 플레이어 / 좌석
  // =====================================================================================
  player(id) {
    return this.players.get(id) || null;
  }

  connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  seatedPlayers() {
    return this.seats.map((id) => (id ? this.players.get(id) : null)).filter(Boolean);
  }

  _uniqueNickname(raw) {
    const taken = new Set([...this.players.values()].map((p) => p.nickname));
    if (!taken.has(raw)) return raw;
    for (let i = 2; i < 100; i++) {
      const cand = `${raw}(${i})`;
      if (!taken.has(cand)) return cand;
    }
    return `${raw}(${this.players.size + 1})`;
  }

  /**
   * 입장. 빈 좌석이 있으면 착석, 없으면 관전. 이미 있는 플레이어면 재접속 처리.
   * @returns {Player}
   */
  join(id, nickname, socket) {
    this.touch();
    let p = this.players.get(id);
    if (p) {
      this.attach(id, socket);
      return p;
    }
    p = {
      id,
      nickname: this._uniqueNickname(nickname),
      seat: null,
      chips: 0,
      connected: Boolean(socket),
      socket: socket || null,
      joinedAt: this.now(),
      lastSeen: this.now(),
      ledger: { buyIn: 0, refills: 0, wins: 0 },
      lastHandNo: 0, // 마지막으로 참가한 핸드 번호
    };
    this.players.set(id, p);
    const seat = this.seats.indexOf(null);
    if (seat !== -1) this._seat(p, seat);
    this._log(`${p.nickname} 님이 입장했습니다${p.seat === null ? ' (관전)' : ''}`, 'system');
    this._event({ ev: 'join', playerId: id, nickname: p.nickname });
    this.maybeStart();
    this.broadcast();
    return p;
  }

  _seat(p, seat) {
    this.seats[seat] = p.id;
    p.seat = seat;
    if (p.ledger.buyIn === 0) {
      p.chips = this.settings.startChips;
      p.ledger.buyIn = this.settings.startChips;
    }
  }

  /** 소켓 연결(재접속). 기존 소켓이 있으면 교체 */
  attach(id, socket) {
    const p = this.players.get(id);
    if (!p) return false;
    if (p.socket && p.socket !== socket) {
      try { p.socket.close(4001, 'replaced'); } catch { /* ignore */ }
    }
    p.socket = socket || null;
    p.connected = Boolean(socket);
    p.lastSeen = this.now();
    this.touch();
    if (socket) {
      this._event({ ev: 'reconnect', playerId: id });
      this._rescheduleIfWaitingOn(id);
      this.broadcast();
    }
    return true;
  }

  /** 소켓 끊김. 자리는 유지(재접속 가능). */
  detach(id, socket) {
    const p = this.players.get(id);
    if (!p) return;
    if (socket && p.socket !== socket) return; // 이미 다른 소켓으로 교체됨
    p.socket = null;
    p.connected = false;
    p.lastSeen = this.now();
    this._event({ ev: 'disconnect', playerId: id });
    this._rescheduleIfWaitingOn(id);
    this.broadcast();
    if (this.connectedCount() === 0) this.touch();
  }

  /** 방 나가기(자발적/강퇴). 진행 중 핸드에 참가 중이면 다이 처리. */
  leave(id, reason = 'leave') {
    const p = this.players.get(id);
    if (!p) return;
    if (this.hand && !this.hand.isDone && this.hand.player(id)) this.hand.forceLeave(id);
    if (p.seat !== null) this.seats[p.seat] = null;
    this.players.delete(id);
    this._log(reason === 'kick' ? `${p.nickname} 님이 강퇴되었습니다` : `${p.nickname} 님이 나갔습니다`, 'system');
    this._event({ ev: reason === 'kick' ? 'kick' : 'leave', playerId: id, nickname: p.nickname });
    if (this.intermission) {
      this.intermission.rejoinable.delete(id);
      this.intermission.rejoined.delete(id);
    }
    if (this.hostId === id) this._transferHost(null);
    this._afterChange();
    if (this.players.size === 0) {
      this.destroy();
      this.onEmpty();
      return;
    }
    this.broadcast();
  }

  /** 관전 → 착석 */
  sit(id) {
    const p = this.player(id);
    if (!p || p.seat !== null) return err('bad_request', '이미 앉아 있습니다');
    const seat = this.seats.indexOf(null);
    if (seat === -1) return err('room_full', '빈 자리가 없습니다');
    this._seat(p, seat);
    this._log(`${p.nickname} 님이 자리에 앉았습니다`, 'system');
    this.maybeStart();
    this.broadcast();
    return ok();
  }

  /** 착석 → 관전(자리 비우기). 진행 중 핸드 참가자면 다이 처리 */
  stand(id) {
    const p = this.player(id);
    if (!p || p.seat === null) return err('bad_request', '앉아 있지 않습니다');
    if (this.hand && !this.hand.isDone && this.hand.player(id)) this.hand.forceLeave(id);
    this.seats[p.seat] = null;
    p.seat = null;
    this._log(`${p.nickname} 님이 자리를 비웠습니다 (관전)`, 'system');
    this._afterChange();
    this.broadcast();
    return ok();
  }

  _transferHost(preferredId) {
    let next = preferredId ? this.player(preferredId) : null;
    if (!next) {
      const sorted = [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
      next = sorted.find((p) => p.connected) || sorted[0] || null;
    }
    this.hostId = next ? next.id : null;
    if (next) {
      this._log(`${next.nickname} 님이 방장이 되었습니다`, 'system');
      this._event({ ev: 'host', playerId: next.id });
    }
  }

  /** 끊긴 채 오래 방치된(핸드 미참가) 플레이어 정리 */
  _sweepDisconnected() {
    if (this.destroyed) return;
    const now = this.now();
    for (const p of [...this.players.values()]) {
      if (p.connected) continue;
      if (now - p.lastSeen < this.config.disconnectGraceMs) continue;
      if (this.hand && !this.hand.isDone && this.hand.player(p.id) && !this.hand.player(p.id).folded) continue;
      this.leave(p.id, 'timeout');
      if (this.destroyed) return;
    }
    this.sweepTimer = this._setTimeout(() => this._sweepDisconnected(), 30_000);
    if (this.sweepTimer?.unref) this.sweepTimer.unref();
  }

  touch() {
    this.lastActivity = this.now();
  }

  destroy() {
    this.destroyed = true;
    this._clearTimer();
    this._clearTimeout(this.sweepTimer);
    for (const p of this.players.values()) {
      if (p.socket) {
        try { p.socket.close(4002, 'room closed'); } catch { /* ignore */ }
      }
    }
  }

  // =====================================================================================
  // 방장 명령
  // =====================================================================================
  hostCommand(id, msg) {
    if (id !== this.hostId) return err('forbidden', '방장만 할 수 있습니다');
    this.touch();
    switch (msg.cmd) {
      case 'start':
        if (this.phase === 'playing') return err('bad_request', '이미 진행 중입니다');
        this.phase = 'playing';
        this._log('게임이 시작되었습니다', 'system');
        this.maybeStart();
        this.broadcast();
        return ok();
      case 'pause':
        if (this.phase !== 'playing') return err('bad_request', '진행 중이 아닙니다');
        this.phase = 'paused';
        this._log('방장이 일시정지했습니다 (이번 판이 끝난 뒤 멈춥니다)', 'system');
        this._event({ ev: 'pause' });
        this.broadcast();
        return ok();
      case 'resume':
        if (this.phase !== 'paused') return err('bad_request', '일시정지 상태가 아닙니다');
        this.phase = 'playing';
        this._log('게임을 재개합니다', 'system');
        this._event({ ev: 'resume' });
        this.maybeStart();
        this.broadcast();
        return ok();
      case 'kick': {
        const target = this.player(msg.playerId);
        if (!target) return err('bad_request', '대상이 없습니다');
        if (target.id === id) return err('bad_request', '자신은 강퇴할 수 없습니다');
        const sock = target.socket;
        this.leave(target.id, 'kick');
        if (sock) {
          try { sock.send(JSON.stringify({ t: 'kicked', code: this.code })); } catch { /* ignore */ }
        }
        return ok({ kickedSocket: sock });
      }
      case 'transfer': {
        const target = this.player(msg.playerId);
        if (!target) return err('bad_request', '대상이 없습니다');
        this._transferHost(target.id);
        this.broadcast();
        return ok();
      }
      case 'settings': {
        let next;
        try {
          next = normalizeSettings(msg.settings, this.settings);
        } catch (e) {
          return err('bad_request', e.message);
        }
        const seatedCount = this.seatedPlayers().length;
        if (next.maxPlayers < seatedCount) return err('bad_request', `앉아 있는 사람(${seatedCount}명)보다 적게 줄일 수 없습니다`);
        if (this.hand && !this.hand.isDone) {
          this.pendingSettings = next;
          this._log('설정 변경은 이번 판이 끝난 뒤 적용됩니다', 'system');
        } else {
          this._applySettings(next);
        }
        this.broadcast();
        return ok();
      }
      default:
        return err('bad_request', '알 수 없는 명령');
    }
  }

  _applySettings(next, { start = true } = {}) {
    const prevMax = this.seats.length;
    this.settings = next;
    if (next.maxPlayers !== prevMax) {
      const seated = this.seatedPlayers();
      this.seats = new Array(next.maxPlayers).fill(null);
      seated.forEach((p, i) => {
        p.seat = i;
        this.seats[i] = p.id;
      });
    }
    this._log('방 설정이 변경되었습니다', 'system');
    this._event({ ev: 'settings' });
    if (start) this.maybeStart();
  }

  // =====================================================================================
  // 리필 / 장부
  // =====================================================================================
  canRefill(p) {
    if (this.settings.refill !== 'manual') return false;
    if (!p || p.seat === null) return false;
    if (p.chips >= this.settings.startChips) return false;
    if (this.hand && !this.hand.isDone && this.hand.player(p.id)) return false;
    return true;
  }

  refill(id) {
    const p = this.player(id);
    if (!this.canRefill(p)) return err('bad_request', '지금은 리필할 수 없습니다');
    this._doRefill(p);
    this.maybeStart();
    this.broadcast();
    return ok();
  }

  _doRefill(p) {
    const diff = this.settings.startChips - p.chips;
    if (diff <= 0) return;
    p.chips += diff;
    p.ledger.buyIn += diff;
    p.ledger.refills += 1;
    this._log(`${p.nickname} 님이 ${formatChips(diff)} 리필했습니다`, 'system');
    this._event({ ev: 'refill', playerId: p.id, amount: diff });
  }

  // =====================================================================================
  // 핸드 진행
  // =====================================================================================
  /** 시작 조건이 되면 다음 판 시작 (여러 곳에서 호출되어도 안전) */
  maybeStart() {
    if (this.destroyed) return;
    if (this.phase !== 'playing') return;
    if (this.hand && !this.hand.isDone) return;
    if (this.intermission) return; // 결과 표시 중 → 타이머가 끝나면 _startNextHand
    this._startNextHand();
  }

  _participantsForNormalHand() {
    if (this.settings.refill === 'auto') {
      for (const p of this.seatedPlayers()) if (p.chips < this.settings.base) this._doRefill(p);
    }
    return this.seatedPlayers().filter((p) => p.chips >= this.settings.base);
  }

  _startNextHand() {
    if (this._starting) return; // 재진입 방지
    this._starting = true;
    try {
      this._startNextHandInner();
    } finally {
      this._starting = false;
    }
  }

  _startNextHandInner() {
    if (this.pendingSettings) {
      const ps = this.pendingSettings;
      this.pendingSettings = null;
      this._applySettings(ps, { start: false });
    }
    let participants;
    let ante = true;
    let regame = null;

    if (this.pendingRegame) {
      const ids = new Set(this.pendingRegame.participants);
      participants = this.seatedPlayers().filter((p) => ids.has(p.id));
      if (participants.length >= 2) {
        ante = false;
        regame = { reason: this.pendingRegame.reason };
      } else {
        if (participants.length === 1 && this.carried > 0) {
          const w = participants[0];
          w.chips += this.carried;
          w.ledger.wins += 1;
          this._log(`재경기 상대가 없어 ${w.nickname} 님이 이월 판돈 ${formatChips(this.carried)} 을(를) 가져갑니다`, 'result');
          this._event({ ev: 'carried_award', playerId: w.id, amount: this.carried });
          this.carried = 0;
        } else if (this.carried > 0) {
          this._log(`재경기 참가자가 없어 이월 판돈 ${formatChips(this.carried)} 은(는) 다음 판에 합산됩니다`, 'system');
        }
        this.pendingRegame = null;
        participants = this._participantsForNormalHand();
      }
    } else {
      participants = this._participantsForNormalHand();
    }

    if (participants.length < 2) {
      this.hand = this.hand && this.hand.isDone ? this.hand : null;
      this.broadcast();
      return;
    }

    // 좌석 순(시계방향) 정렬 후 선 결정
    participants.sort((a, b) => a.seat - b.seat);
    const dealerIdx = this._pickDealerIdx(participants);
    this.dealerId = participants[dealerIdx].id;
    this.handNo += 1;
    for (const p of participants) p.lastHandNo = this.handNo;
    this.hand = new Hand({
      no: this.handNo,
      players: participants.map((p) => ({ id: p.id, chips: p.chips })),
      dealerIdx,
      settings: {
        base: this.settings.base,
        maxRaises: this.settings.maxRaises,
        openCard: this.settings.openCard,
        allInFrom: this.settings.allInFrom,
        rules: this.settings.rules,
      },
      carried: this.carried,
      ante,
      regame,
      deck: this.deckProvider ? this.deckProvider(this.handNo) : null,
    });
    this.hand.start();
    this.pendingRegame = null;
    this.carried = 0;
    this._syncChips();
    const dealerName = this.player(this.dealerId)?.nickname ?? '';
    this._log(
      regame
        ? `${this.handNo}번째 판 — 재경기(${REGAME_LABEL[regame.reason]}), 이월 판돈 ${formatChips(this.hand.carried)} / 선: ${dealerName}`
        : `${this.handNo}번째 판 시작 (참가 ${participants.length}명, 삥 ${formatChips(this.settings.base)}) / 선: ${dealerName}`,
      'hand',
    );
    this._afterChange();
    this.broadcast();
  }

  _pickDealerIdx(participants) {
    const n = participants.length;
    const idxOf = (id) => participants.findIndex((p) => p.id === id);
    // 이전 선 좌석 기준 다음 참가자
    const nextAfterSeat = (seat) => {
      if (seat === null || seat === undefined) return 0;
      for (let k = 0; k < n; k++) if (participants[k].seat > seat) return k;
      return 0;
    };
    const prevSeat = this.dealerId ? (this.player(this.dealerId)?.seat ?? null) : null;

    if (!this.dealerId) {
      const h = idxOf(this.hostId);
      return h >= 0 ? h : 0;
    }
    if (this.settings.dealerRule === 'rotate') {
      if (this._lastWasRegame) {
        const keep = idxOf(this.dealerId);
        if (keep >= 0) return keep;
      }
      return nextAfterSeat(prevSeat);
    }
    // winner 규칙: 직전 승자(_nextDealerId)가 참가자면 그 사람, 아니면 현재 선 유지, 아니면 다음 참가자
    if (this._nextDealerId) {
      const w = idxOf(this._nextDealerId);
      if (w >= 0) return w;
    }
    const keep = idxOf(this.dealerId);
    if (keep >= 0) return keep;
    return nextAfterSeat(prevSeat);
  }

  /** 엔진의 칩 상태를 Room 플레이어에 반영 */
  _syncChips() {
    if (!this.hand) return;
    for (const hp of this.hand.players) {
      const p = this.player(hp.id);
      if (p) p.chips = hp.chips;
    }
  }

  // ---- 플레이어 액션 ----------------------------------------------------------------
  action(id, handNo, kind) {
    const h = this.hand;
    if (!h || h.isDone || h.no !== handNo) return err('bad_request', '지금 할 수 있는 액션이 아닙니다');
    if (h.turnPlayerId !== id) return err('not_your_turn', '내 차례가 아닙니다');
    const res = h.act(id, kind);
    if (!res.ok) return err(res.error === 'illegal_action' ? 'illegal_action' : 'bad_request', '할 수 없는 액션입니다');
    this.touch();
    this._afterChange();
    this.broadcast();
    return ok();
  }

  chooseOpen(id, handNo, idx) {
    const h = this.hand;
    if (!h || h.isDone || h.no !== handNo || h.stage !== 'open') return err('bad_request', '공개 카드를 선택할 때가 아닙니다');
    const res = h.chooseOpen(id, idx);
    if (!res.ok) return err('bad_request', '선택할 수 없습니다');
    this.touch();
    this._afterChange();
    this.broadcast();
    return ok();
  }

  select(id, handNo, idx) {
    const h = this.hand;
    if (!h || h.isDone || h.no !== handNo || h.stage !== 'select') return err('bad_request', '최종 패를 선택할 때가 아닙니다');
    const res = h.select(id, idx);
    if (!res.ok) return err('bad_request', '선택할 수 없습니다');
    this.touch();
    this._afterChange();
    this.broadcast();
    return ok();
  }

  /** 구사 재경기 참가(다이했던 사람) — 결과 표시 중에만 */
  rejoin(id) {
    const im = this.intermission;
    const p = this.player(id);
    if (!im || !im.regameNext || !p) return err('bad_request', '지금은 재경기에 참가할 수 없습니다');
    if (!im.rejoinable.has(id)) return err('bad_request', '참가 대상이 아닙니다');
    if (im.rejoined.has(id)) return err('bad_request', '이미 참가했습니다');
    if (p.seat === null) return err('bad_request', '자리에 앉아 있어야 합니다');
    if (p.chips < im.rejoinFee) return err('bad_request', '참가금이 부족합니다');
    p.chips -= im.rejoinFee;
    this.carried += im.rejoinFee;
    im.rejoined.add(id);
    this.pendingRegame.participants.push(id);
    this._log(`${p.nickname} 님이 ${formatChips(im.rejoinFee)} 을(를) 내고 재경기에 참가합니다 (판돈 ${formatChips(this.carried)})`, 'hand');
    this._event({ ev: 'rejoin', playerId: id, amount: im.rejoinFee });
    this.broadcast();
    return ok();
  }

  chatMessage(id, text) {
    const p = this.player(id);
    if (!p) return err('bad_request', '방에 없습니다');
    const entry = { ts: this.now(), from: p.nickname, fromId: id, text };
    this.chat.push(entry);
    if (this.chat.length > MAX_CHAT) this.chat.shift();
    this.touch();
    this._event({ ev: 'chat', ...entry });
    this.broadcast();
    return ok();
  }

  // ---- 핸드 변화 이후 공통 처리 ------------------------------------------------------
  _afterChange() {
    const h = this.hand;
    if (!h) {
      this._clearTimer();
      return;
    }
    this._syncChips();
    // 엔진 이벤트 → 로그/이벤트
    for (const ev of h.flushEvents()) this._handleEngineEvent(ev);
    if (h.isDone) {
      if (!this.intermission) this._beginIntermission();
      return;
    }
    // 턴이 방을 떠난 플레이어에게 왔으면 즉시 다이
    if (h.isBetting && h.turnPlayerId && !this.players.has(h.turnPlayerId)) {
      h.forceLeave(h.turnPlayerId);
      return this._afterChange();
    }
    this._scheduleStageTimer();
  }

  _handleEngineEvent(ev) {
    const name = (id) => this.player(id)?.nickname ?? '(나감)';
    switch (ev.type) {
      case 'deal':
        if (ev.stage === 'deal3') this._log('세 번째 카드를 받았습니다', 'hand');
        break;
      case 'stage':
        if (ev.stage === 'bet1') this._log('1구 베팅', 'hand');
        else if (ev.stage === 'bet2') this._log('2구 베팅', 'hand');
        else if (ev.stage === 'select') this._log('최종 패 선택 (3장 중 2장)', 'hand');
        else if (ev.stage === 'open') this._log('공개할 카드를 선택하세요', 'hand');
        break;
      case 'action': {
        const label = ACTION_LABEL[ev.kind] || ev.kind;
        const amt = ev.pay > 0 ? ` ${formatChips(ev.pay)}` : '';
        this._log(`${name(ev.playerId)}: ${label}${amt}${ev.allIn && ev.kind !== 'allin' ? ' (올인)' : ''}`, 'action');
        break;
      }
      case 'timeout':
        this._log(`${name(ev.playerId)} 시간 초과 → 자동 ${ev.auto === 'select' ? '선택' : ev.auto === 'open' ? '공개' : ACTION_LABEL[ev.auto]}`, 'system');
        break;
      case 'leave_fold':
        this._log(`${name(ev.playerId)} 님이 나가서 다이 처리`, 'system');
        break;
      case 'result':
        this._logResult(ev.result);
        break;
      default:
        break;
    }
    this._event({ ev: ev.type, ...ev });
  }

  _logResult(r) {
    const name = (id) => this.player(id)?.nickname ?? '(나감)';
    if (r.type === 'fold') {
      this._log(`${name(r.winners[0])} 기권승 +${formatChips(r.pot)}`, 'result');
      return;
    }
    const hands = Object.entries(r.reveals).map(([id, v]) => `${name(id)} ${v.hand.name}`).join(', ');
    if (hands) this._log(`공개: ${hands}`, 'result');
    for (const s of r.specials || []) {
      this._log(`${name(s.id)} ${SPECIAL_LABEL[s.kind]} ${s.success ? '성공' : '실패'}`, 'result');
    }
    if (r.type === 'regame') {
      this._log(`재경기(${REGAME_LABEL[r.reason]}) — 판돈 ${formatChips(r.carriedNext)} 이월`, 'result');
      return;
    }
    for (const [id, amt] of Object.entries(r.payouts)) this._log(`${name(id)} 승리 +${formatChips(amt)}`, 'result');
    if (r.carriedNext > 0) this._log(`동점 팟 ${formatChips(r.carriedNext)} 은(는) 동점자 재경기로 이월`, 'result');
  }

  _beginIntermission() {
    const r = this.hand.result;
    // 장부
    for (const id of r.winners) {
      const p = this.player(id);
      if (p) p.ledger.wins += 1;
    }
    // 이월/재경기 예약
    this.carried = r.carriedNext;
    this._nextDealerId = r.dealerNext || null;
    this._lastWasRegame = Boolean(r.regameNext);
    this.pendingRegame = r.regameNext ? { reason: r.regameNext.reason, participants: [...r.regameNext.participants] } : null;
    const isRegame = Boolean(this.pendingRegame);
    const rejoinable = new Set();
    let rejoinFee = 0;
    if (isRegame && this.pendingRegame.reason !== 'tie' && this.settings.regameRejoin) {
      rejoinFee = Math.floor(this.carried / 2);
      for (const hp of this.hand.players) if (hp.folded && this.players.has(hp.id)) rejoinable.add(hp.id);
    }
    const ms = isRegame ? REGAME_INTERMISSION_MS : r.type === 'fold' ? FOLD_INTERMISSION_MS : INTERMISSION_MS;
    this.intermission = { until: this.now() + ms, regameNext: this.pendingRegame, rejoinFee, rejoinable, rejoined: new Set() };
    this._setTimer('intermission', ms, () => {
      this.intermission = null;
      if (this.destroyed) return;
      if (this.phase === 'playing') this._startNextHand();
      else {
        this._log('일시정지 중입니다. 방장이 재개하면 다음 판이 시작됩니다', 'system');
        this.broadcast();
      }
    });
  }

  // ---- 타이머 ------------------------------------------------------------------------
  _clearTimer() {
    if (this.timer) this._clearTimeout(this.timer);
    this.timer = null;
    this.timerKind = null;
    this.deadline = null;
  }

  _setTimer(kind, ms, fn) {
    this._clearTimer();
    this.timerKind = kind;
    this.deadline = this.now() + ms;
    this.deadlineTotal = ms;
    this.timer = this._setTimeout(() => {
      this.timer = null;
      this.timerKind = null;
      this.deadline = null;
      fn();
    }, ms);
  }

  _stageLimitMs(waitingIds) {
    const s = this.settings.turnSeconds;
    if (s > 0) return s * 1000;
    // 제한시간 없음: 기다리는 사람이 전부 끊겨 있으면 안전장치 타이머
    const allGone = waitingIds.length > 0 && waitingIds.every((id) => !this.player(id)?.connected);
    return allGone ? DISCONNECTED_TURN_MS : 0;
  }

  _scheduleStageTimer() {
    const h = this.hand;
    if (!h || h.isDone) return;
    if (h.stage === 'open') {
      const ids = h.pendingOpeners().map((p) => p.id);
      const ms = this._stageLimitMs(ids);
      if (this.timerKind === 'open' && this.timer && ms > 0) return; // 이미 동작 중(단계 전체 공통 타이머)
      if (ms > 0) this._setTimer('open', ms, () => this._fire(() => h.timeoutOpen()));
      else this._clearTimer();
    } else if (h.stage === 'select') {
      const ids = h.pendingSelectors().map((p) => p.id);
      const ms = this._stageLimitMs(ids);
      if (this.timerKind === 'select' && this.timer && ms > 0) return;
      if (ms > 0) this._setTimer('select', ms, () => this._fire(() => h.timeoutSelect()));
      else this._clearTimer();
    } else if (h.isBetting) {
      const turn = h.turnPlayerId;
      const key = `turn:${h.stage}:${turn}:${h.round.actions.length}`;
      if (this.timerKind === key && this.timer) return;
      const ms = this._stageLimitMs(turn ? [turn] : []);
      if (ms > 0) this._setTimer(key, ms, () => this._fire(() => h.timeoutTurn()));
      else this._clearTimer();
    }
  }

  /** 접속/끊김 변화 시, 제한시간 없음 설정의 안전장치 타이머를 다시 계산 */
  _rescheduleIfWaitingOn(_id) {
    if (this.settings.turnSeconds > 0) return;
    const h = this.hand;
    if (!h || h.isDone) return;
    this._clearTimer();
    this._scheduleStageTimer();
  }

  _fire(fn) {
    if (this.destroyed || !this.hand || this.hand.isDone) return;
    fn();
    this._afterChange();
    this.broadcast();
  }

  // =====================================================================================
  // 로그 / 이벤트 / 뷰 / 브로드캐스트
  // =====================================================================================
  _log(text, kind = 'system') {
    this.log.push({ ts: this.now(), text, kind });
    if (this.log.length > MAX_LOG) this.log.shift();
  }

  /** 접속 중인 전원에게 이벤트 전송(상태 스냅샷 앞에 도착) */
  _event(ev) {
    const data = JSON.stringify({ t: 'event', ...ev });
    for (const p of this.players.values()) if (p.socket) this._send(p.socket, data);
  }

  _send(socket, data) {
    try {
      if (socket.readyState === undefined || socket.readyState === 1) socket.send(data);
    } catch { /* ignore */ }
  }

  _status(p) {
    if (p.seat === null) return 'spectating';
    const hp = this.hand && !this.hand.isDone ? this.hand.player(p.id) : null;
    if (hp) {
      if (hp.folded) return 'folded';
      if (hp.allIn) return 'allin';
      return 'active';
    }
    if (this.hand && this.hand.isDone && this.hand.player(p.id)) {
      const d = this.hand.player(p.id);
      return d.folded ? 'folded' : 'active';
    }
    if (p.chips < this.settings.base) return 'sitout';
    return 'waiting';
  }

  _playerView(p) {
    return {
      id: p.id,
      nickname: p.nickname,
      seat: p.seat,
      chips: p.chips,
      connected: p.connected,
      isHost: p.id === this.hostId,
      status: this._status(p),
      ledger: { ...p.ledger, net: p.chips - p.ledger.buyIn },
      canRefill: this.canRefill(p),
    };
  }

  _waiting() {
    if (this.phase === 'lobby') return { reason: 'lobby', message: '방장이 게임을 시작하면 첫 판이 시작됩니다' };
    if (this.hand && !this.hand.isDone) return null;
    if (this.intermission) return null;
    if (this.phase === 'paused') return { reason: 'paused', message: '일시정지 중입니다' };
    const eligible = this.seatedPlayers().filter((p) => p.chips >= this.settings.base).length;
    if (eligible < 2) {
      const short = this.seatedPlayers().some((p) => p.chips < this.settings.base);
      return short
        ? { reason: 'need_chips', message: '삥을 낼 수 있는 참가자가 2명 이상 필요합니다 (리필 필요)' }
        : { reason: 'need_players', message: '참가자가 2명 이상 모이면 자동으로 시작됩니다' };
    }
    return null;
  }

  view(viewerId) {
    const me = this.player(viewerId);
    const players = [...this.players.values()].sort((a, b) => {
      if (a.seat === null && b.seat === null) return a.joinedAt - b.joinedAt;
      if (a.seat === null) return 1;
      if (b.seat === null) return -1;
      return a.seat - b.seat;
    });
    let hand = null;
    if (this.hand) {
      hand = this.hand.view(viewerId);
      hand.deadline = this.deadline && this.timerKind !== 'intermission' ? this.deadline : null;
      hand.deadlineTotal = hand.deadline ? this.deadlineTotal : null; // 현재 단계 제한시간 전체 길이(ms) — 타이머 링 비율 계산용
      hand.intermission = this.intermission
        ? {
            until: this.intermission.until,
            regameNext: this.intermission.regameNext,
            rejoinFee: this.intermission.rejoinFee,
            rejoinable: [...this.intermission.rejoinable],
            rejoined: [...this.intermission.rejoined],
          }
        : null;
    }
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      pendingSettings: this.pendingSettings,
      me: me ? this._playerView(me) : null,
      players: players.map((p) => this._playerView(p)),
      hand,
      carried: this.carried,
      waiting: this._waiting(),
      log: this.log,
      chat: this.chat,
      serverTime: this.now(),
    };
  }

  broadcast() {
    if (this.destroyed) return;
    for (const p of this.players.values()) {
      if (!p.socket) continue;
      this._send(p.socket, JSON.stringify({ t: 'state', room: this.view(p.id) }));
    }
  }

  /** 특정 플레이어에게만 현재 상태 전송(재접속 직후 등) */
  sendState(id) {
    const p = this.player(id);
    if (p?.socket) this._send(p.socket, JSON.stringify({ t: 'state', room: this.view(p.id) }));
  }
}

function ok(extra = {}) {
  return { ok: true, ...extra };
}
function err(code, message) {
  return { ok: false, error: { code, message } };
}
